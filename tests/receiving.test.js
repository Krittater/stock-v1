const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js'); require('../js/domain/returns.js'); require('../js/domain/receiving.js');
const S = SM.store;
const fill = (s, lines) => Object.assign(s.cart, { lines, whId: 'wh-main', jobId: 'J-25-010', note: '' });
const rc = (s, lines, extra = {}) => S.receive(s, { whId: 'wh-main', lines, ...extra }, 'u-store');
const qty = (s, pid, shelf) => (s.stock.find(x => x.productId === pid && x.whId === 'wh-main' && x.shelf === shelf) || { qty: 0 }).qty;
// P-0007 ขาด 31 → PR เปิด
const withPR = () => { const s = SM.seed(); fill(s, [{ productId: 'P-0007', qty: 85 }]); const { req, prs } = S.issueNow(s, 'u-eng'); return { s, req, pr: prs[0] }; };

test('RC-AC1 รับครบตาม PR → done + ใบรับ RC-690001', () => {
  const { s, pr } = withPR();
  const { receipt } = rc(s, [{ productId: 'P-0007', prId: pr.id, qty: 31 }], { invoiceNo: 'INV-1', vendor: 'ร้าน ก' });
  assert.deepEqual([receipt.id, pr.status, pr.received, S.outstanding(s, pr.id)], ['RC-690001', 'done', 31, 0]);
  assert.equal(s.receipts.length, 1);
  assert.equal(s.seq.rc, 690002);
  assert.equal(s.audit.at(-1).action, 'receive');
});
test('RC-AC2 รับบางส่วน → PR ยังเปิด', () => {
  const { s, pr } = withPR();
  rc(s, [{ productId: 'P-0007', prId: pr.id, qty: 10 }]);
  assert.deepEqual([pr.status, pr.received, S.outstanding(s, pr.id)], ['open', 10, 21]);
});
test('RC-AC3 ม้วน: แถว 0 ข้าม ได้ rollIds + batch', () => {
  const s = SM.seed(); const before = s.rolls.length;
  const { receipt, rolls } = rc(s, [{ productId: 'P-0017', rollLengths: [30, 0, 20], batch: 'LOT9' }]);
  assert.equal(s.rolls.length, before + 2);
  assert.deepEqual([receipt.lines[0].qty, receipt.lines[0].rollIds.length, rolls.every(r => r.batch === 'LOT9')], [50, 2, true]);
  assert.throws(() => rc(s, [{ productId: 'P-0017', rollLengths: [0, 0] }]), /มากกว่า 0/);
});
test('RC-AC4 หน่วยซื้อคูณ buyFactor ก่อนตรวจจำนวนเต็ม', () => {
  const s = SM.seed(); const p = s.products.find(x => x.id === 'P-0004'); p.buyUnit = 'กล่อง'; p.buyFactor = 12;
  const { receipt } = rc(s, [{ productId: 'P-0004', qty: 2, unit: 'buy' }]);
  assert.equal(receipt.lines[0].qty, 24); assert.equal(qty(s, 'P-0004', 'ทั่วไป'), 24);
  p.buyFactor = 2.5;
  assert.throws(() => rc(s, [{ productId: 'P-0004', qty: 1, unit: 'buy' }]), /จำนวนเต็ม|ใบ|ตัว/);
});
test('RC-AC5 รับของที่ใบเบิกรออยู่ → กันของไว้ให้', () => {
  const { s, req, pr } = withPR();
  const { readied } = rc(s, [{ productId: 'P-0007', prId: pr.id, qty: 31 }]);
  assert.deepEqual([readied.map(r => r.id), req.status], [[req.id], 'ready']);
  assert.ok(s.notifs.some(n => n.toUserId === 'u-eng' && /กันของไว้ให้/.test(n.text)));
});
test('RC-AC6 ทุกบรรทัดเป็น 0 → throw', () => {
  const s = SM.seed();
  assert.throws(() => rc(s, [{ productId: 'P-0004', qty: 0 }, { productId: 'P-0007', qty: '' }]), /ยังไม่ได้กรอกจำนวนที่รับ/);
});
test('RC-AC7 ชั้นรับเข้าที่ปิดใช้ / คลังล็อก → throw ไม่ลงยอด', () => {
  const s = SM.seed();
  assert.throws(() => S.receive(s, { whId: 'wh-c', lines: [{ productId: 'P-0004', qty: 1 }] }, 'u-store'), /กำลังนับสต็อก/);
  s.warehouses[0].shelves.find(x => x.code === 'B-01').active = false;
  assert.throws(() => rc(s, [{ productId: 'P-0004', qty: 1, shelf: 'B-01' }]), /ปิดใช้งาน/);
  assert.equal(s.receipts.length, 0);
});
test('RC-AC8 รับเกินต้องมีเหตุผล · รวมทุกบรรทัดของ PR เดียวกัน', () => {
  const { s, pr } = withPR();
  const two = [{ productId: 'P-0007', prId: pr.id, qty: 20 }, { productId: 'P-0007', prId: pr.id, qty: 15 }];
  assert.throws(() => rc(s, two), /รับเกินที่สั่ง 4 ใบ ใส่เหตุผล/);
  assert.equal(pr.received, 0);
  rc(s, two, { overReason: 'ผู้ขายแถม' });
  assert.deepEqual([pr.status, pr.received, s.receipts[0].overReason], ['done', 35, 'ผู้ขายแถม']);
});
test('RC-AC9 ไม่ใช่เมตรต้องเป็นจำนวนเต็ม', () => {
  const s = SM.seed();
  assert.throws(() => rc(s, [{ productId: 'P-0004', qty: 1.5 }]), /จำนวนเต็ม|ตัว/);
});
test('RC-G2 ไม่มี PR → สร้าง PR noPr done', () => {
  const s = SM.seed(); const n = s.prs.length;
  const { receipt } = rc(s, [{ productId: 'P-0004', qty: 5 }]);
  const pr = s.prs.at(-1);
  assert.equal(s.prs.length, n + 1);
  assert.deepEqual([pr.noPr, pr.reqId, pr.status, pr.received, receipt.lines[0].prId], [true, null, 'done', 5, pr.id]);
});
test('RC-G8 reject ไม่ลงยอด/ไม่นับ PR · damaged ลงชั้น QC และนับ PR', () => {
  const { s, pr } = withPR(); const qc = S.qcShelf(s, 'wh-main');
  const { receipt } = rc(s, [{ productId: 'P-0007', prId: pr.id, qty: 5, condition: 'reject' }, { productId: 'P-0007', prId: pr.id, qty: 6, condition: 'damaged' }]);
  assert.equal(pr.received, 6); assert.equal(qty(s, 'P-0007', qc), 6);
  assert.deepEqual(receipt.lines.map(l => [l.condition, l.shelf]), [['reject', null], ['damaged', qc]]);
  assert.equal(S.available(s, 'P-0007', 'wh-main'), 0);
});
test('RC-G5 ชั้นรายบรรทัดทับชั้นทั้งใบ', () => {
  const s = SM.seed();
  rc(s, [{ productId: 'P-0004', qty: 3, shelf: 'B-02' }, { productId: 'P-0007', qty: 2 }], { shelf: 'B-01' });
  assert.deepEqual([qty(s, 'P-0004', 'B-02'), qty(s, 'P-0007', 'B-01')], [33, 56]);
});
test('บรรทัดเดียวผิด = ไม่ลงยอดอะไรเลย', () => {
  const s = SM.seed(); const snap = JSON.stringify([s.stock, s.rolls, s.prs, s.receipts, s.seq]);
  assert.throws(() => rc(s, [{ productId: 'P-0004', qty: 5 }, { productId: 'P-0017', rollLengths: [10] }, { productId: 'P-0007', qty: 1.5 }]), /จำนวนเต็ม|ใบ/);
  assert.equal(JSON.stringify([s.stock, s.rolls, s.prs, s.receipts, s.seq]), snap);
});
test('สินค้าเลิกใช้ + PR คนละคลัง', () => {
  const { s, pr } = withPR();
  assert.throws(() => S.receive(s, { whId: 'wh-a', lines: [{ productId: 'P-0007', prId: pr.id, qty: 1 }] }, 'u-store'), /ต้องรับเข้าคลังหลัก/);
  s.products.find(x => x.id === 'P-0004').active = false;
  assert.throws(() => rc(s, [{ productId: 'P-0004', qty: 1 }]), /เลิกใช้แล้ว รับของเข้าไม่ได้/);
});

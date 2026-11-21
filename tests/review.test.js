// กรณีที่ผู้ตรวจอิสระพบ (final review): แต่ละข้อคือบั๊กที่เคยเกิดจริง
const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js'); require('../js/domain/products.js');
const S = SM.store;
const fill = (s, lines, whId = 'wh-main') => Object.assign(s.cart, { lines, whId, jobId: 'J-25-010', note: '' });
const rollSum = (s, pid, wh) => s.rolls.filter(r => r.productId === pid && r.whId === wh).reduce((a, r) => a + r.length, 0);

test('C1: เส้นเดียวที่ไม่มีม้วนยาวพอ ตอนหยิบ → ไม่จ่าย ของที่กันไว้ยังอยู่ สต็อกไม่เพี้ยน', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0017', qty: 80, single: true }]);
  const { req, prs } = S.issueNow(s, 'u-eng');                           // ไม่มีของ → รอ
  S.receiveStock(s, { productId: 'P-0017', whId: 'wh-main', rollLengths: [50, 50], prId: prs[0].id });
  assert.throws(() => S.pickReq(s, req.id, 'u-store'), /ไม่มีม้วนไหนยาว 80 m/);
  assert.deepEqual([req.lines[0].issued, req.lines[0].reserved, rollSum(s, 'P-0017', 'wh-main')], [0, 80, 100]);
});

test('C1: อนุมัติหลังคลังถูกล็อก → ปฏิเสธ ใบเบิกยังรออนุมัติ ของไม่ออก', () => {
  const s = SM.seed(); s.settings.reqApproval = true;
  fill(s, [{ productId: 'P-0007', qty: 10 }, { productId: 'P-0012', qty: 30 }]);
  const { req } = S.issueNow(s, 'u-eng');
  s.warehouses[0].locked = true;
  assert.throws(() => S.approveReq(s, req.id, 'u-head', true), /กำลังตรวจนับ/);
  assert.deepEqual([req.status, S.available(s, 'P-0007', 'wh-main'), rollSum(s, 'P-0012', 'wh-main')], ['pending_approval', 54, 100]);
});

test('C1: อนุมัติสายเส้นเดียวที่ไม่พอแล้ว → ไม่บันทึกว่าจ่ายโดยที่ของไม่ออก', () => {
  const s = SM.seed(); s.settings.reqApproval = true;
  fill(s, [{ productId: 'P-0012', qty: 80, single: true }]);
  const { req } = S.issueNow(s, 'u-eng');
  s.rolls.find(r => r.productId === 'P-0012').length = 50;               // คนอื่นตัดไปก่อน
  S.approveReq(s, req.id, 'u-head', true);
  assert.deepEqual([req.lines[0].issued, req.lines[0].cuts.length, rollSum(s, 'P-0012', 'wh-main')], [0, 0, 50]);
  assert.deepEqual(s.prs.map(p => p.qty), [80]);
});

test('C2: เส้นเดียวต้องไม่ตัดของที่กันไว้ให้ใบอื่น (ยอดเบิกได้ห้ามติดลบ)', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0012', qty: 160 }]);
  const a = S.issueNow(s, 'u-eng');                                      // จ่าย 100 ขาด 60
  S.receiveStock(s, { productId: 'P-0012', whId: 'wh-main', rollLengths: [100], prId: a.prs[0].id }); // กัน 60 เหลือเบิกได้ 40
  fill(s, [{ productId: 'P-0012', qty: 80, single: true }]);
  const plan = S.planLine(s, s.cart.lines[0], 'wh-main');
  assert.deepEqual([plan.have, plan.cuts.length, plan.short], [40, 0, 80]);
  const b = S.issueNow(s, 'u-eng');
  assert.equal(b.req.lines[0].issued, 0);
  assert.equal(S.available(s, 'P-0012', 'wh-main'), 40);
  S.pickReq(s, a.req.id, 'u-eng');
  assert.deepEqual([a.req.status, a.req.lines[0].issued], ['issued', 160]);
});

test('I2: รับของตามรายการต้องซื้อ ต้องเข้าคลังของรายการนั้น', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0007', qty: 85 }]);
  const { prs } = S.issueNow(s, 'u-eng');
  assert.throws(() => S.receiveStock(s, { productId: 'P-0007', whId: 'wh-a', qty: 31, prId: prs[0].id }), /ต้องรับเข้าคลังหลัก/);
  assert.deepEqual([prs[0].status, prs[0].received], ['open', 0]);
});

test('I3: ใบที่จ่ายไม่สำเร็จและยังขาดของ ได้ของที่เข้ามาทีหลัง', () => {
  const s = SM.seed(); s.settings.demoPickFail = true; fill(s, [{ productId: 'P-0007', qty: 85 }]);
  const { req, prs } = S.issueNow(s, 'u-eng');                           // กัน 54 ขาด 31
  S.receiveStock(s, { productId: 'P-0007', whId: 'wh-main', qty: 31, prId: prs[0].id });
  assert.equal(req.lines[0].reserved, 85);
  S.pickReq(s, req.id, 'u-eng');
  assert.deepEqual([req.status, req.lines[0].issued], ['issued', 85]);
});

test('I4: state ที่ขาดคีย์สำคัญ หรือผู้ใช้ปัจจุบันไม่มีอยู่จริง → ใช้ seed', () => {
  assert.equal(SM.loadState('{"v":1,"products":[]}').users.length, 3);
  const s = SM.seed(); s.currentUserId = 'u-ghost';
  assert.equal(SM.loadState(JSON.stringify(s)).currentUserId, 'u-eng');
  const t = SM.seed(); delete t.cart.lines;
  assert.ok(Array.isArray(SM.loadState(JSON.stringify(t)).cart.lines));
});

test('I5: คลังถูกล็อกแล้วล้าง → ไม่เลือกคลังอื่นให้เองเงียบ ๆ จนกว่าผู้ใช้เลือก', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0007', qty: 10 }]);      // คลัง A ก็มีพอ
  s.warehouses[0].locked = true;
  assert.match(S.syncCartWarehouse(s), /กรุณาเลือกคลังอื่น/);
  assert.equal(S.syncCartWarehouse(s), null);                            // watcher เรียกซ้ำ
  assert.equal(s.cart.whId, null);
});

test('I6: สองใบรอยอดตั้งต้นก้อนเดียว → ใบที่ไม่ได้ของต้องมีรายการต้องซื้อ', () => {
  const s = SM.seed();
  const { product, cc } = S.createProduct(s, { name: 'ข้อต่อ EMT 1 นิ้ว', category: 'อื่น ๆ', unit: 'ตัว', opening: { whId: 'wh-main', qty: 10 } }, 'u-eng');
  fill(s, [{ productId: product.id, qty: 10 }]); const a = S.issueNow(s, 'u-eng');
  fill(s, [{ productId: product.id, qty: 10 }]); const b = S.issueNow(s, 'u-eng');
  S.confirmCC(s, cc.id, 'u-store', true);
  assert.deepEqual([a.req.status, b.req.status], ['ready', 'waiting']);
  assert.deepEqual(s.prs.map(p => [p.reqId, p.qty]), [[b.req.id, 10]]);
});

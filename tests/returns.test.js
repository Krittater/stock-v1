const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js'); require('../js/domain/returns.js');
const S = SM.store;

// ใบเบิกของ u-eng: P-0007 เบิก 5 คืนแล้ว 2 (เหลือ 3) + ม้วน P-0011 เบิก 20 ตัดจาก R-000120
function setup() {
  const s = SM.seed();
  s.reqs.push({ id: 'REQ-690010', userId: 'u-eng', whId: 'wh-main', jobId: 'J-25-010', note: '', status: 'issued', at: '2026-11-10T09:00:00',
    lines: [{ productId: 'P-0007', qty: 5, issued: 5, reserved: 0, returned: 2, single: false, cuts: [] },
      { productId: 'P-0011', qty: 20, issued: 20, reserved: 0, returned: 0, single: false, cuts: [{ rollId: 'R-000120', cut: 20, left: 0 }] }] });
  return s;
}
const base = { reqId: 'REQ-690010', whId: 'wh-main', shelf: 'ทั่วไป' };
const ret = (s, lines, uid = 'u-eng', extra = {}) => S.returnItems(s, { ...base, ...extra, lines }, uid);
const qtyOf = (s, pid, shelf) => (s.stock.find(x => x.productId === pid && x.whId === 'wh-main' && x.shelf === shelf) || { qty: 0 }).qty;

test('RT-AC1 วิศวกรเห็นเฉพาะใบตัวเอง Store เห็นทุกใบ', () => {
  const s = setup();
  s.reqs.push({ id: 'REQ-690011', userId: 'u-head', whId: 'wh-main', jobId: 'J-25-010', note: '', status: 'issued', at: '2026-11-11T09:00:00',
    lines: [{ productId: 'P-0004', qty: 1, issued: 1, reserved: 0, returned: 0, single: false, cuts: [] }] });
  assert.deepEqual(S.returnable(s, 'u-eng').map(x => x.req.id), ['REQ-690010', 'REQ-690006']);
  assert.deepEqual(S.returnable(s, 'u-store').map(x => x.req.id), ['REQ-690011', 'REQ-690010', 'REQ-690006']);
  assert.deepEqual(S.returnable(s, 'u-store', 'REQ-690011').map(x => x.by.id), ['u-head']);
  assert.deepEqual(S.returnable(s, 'u-store', 'ซ่อมบำรุง'), []);
  assert.equal(S.returnable(s, 'u-eng', 'ไซต์งาน A')[0].lines[0].left, 3);
});

test('RT-AC2/3/4 คืนได้อีก 3 · พิมพ์ 4 = "คืนได้ไม่เกิน 3 ใบ" · 1.5 = "ใบต้องเป็นจำนวนเต็ม"', () => {
  const s = setup();
  assert.equal(S.returnable(s, 'u-eng')[0].lines.find(l => l.productId === 'P-0007').left, 3);
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: 4, condition: 'ok' }]), /คืนได้ไม่เกิน 3 ใบ \(ยอดที่เบิกไปหักที่คืนแล้ว\)/);
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: 1.5, condition: 'ok' }]), /ใบต้องเป็นจำนวนเต็ม/);
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: '', condition: 'ok' }]), /ยังไม่ได้กรอกจำนวนที่คืน/);
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: 2, condition: 'ok' }, { productId: 'P-0007', qty: 2, condition: 'scrap' }]), /คืนได้ไม่เกิน 3 ใบ/);
});

test('RT-AC5 คืนทั้งหมดเข้าชั้นที่เลือก และใบหายจากรายการ + override ชั้นรายบรรทัด (RT-G6)', () => {
  const s = setup();
  const before = qtyOf(s, 'P-0007', 'B-01');
  const rec = ret(s, [{ productId: 'P-0007', qty: 3, condition: 'ok', shelf: 'B-01' }, { productId: 'P-0011', qty: 20, condition: 'ok' }], 'u-eng', { note: ' ครบ ' });
  assert.equal(rec.id, 'RT-0001'); assert.equal(rec.note, 'ครบ'); assert.equal(s.returns.length, 1);
  assert.equal(qtyOf(s, 'P-0007', 'B-01'), before + 3);
  assert.deepEqual(S.returnable(s, 'u-eng').map(x => x.req.id), ['REQ-690006']);
  assert.ok(S.auditFor(s, 'RT-0001').some(e => e.action === 'return'));
  assert.throws(() => ret(s, [{ productId: 'P-0004', qty: 1, condition: 'ok' }], 'u-store', { reqId: 'REQ-690006', shelf: 'QC' }), /ชั้นรอตรวจ/);
});

test('RT-AC6 สายม้วน 12.5 m ได้ม้วนใหม่อ้างม้วนเดิม', () => {
  const s = setup();
  const rec = ret(s, [{ productId: 'P-0011', qty: 12.5, condition: 'ok' }]);
  const newRoll = s.rolls.find(r => r.id === rec.lines[0].newRollId);
  assert.deepEqual([newRoll.length, newRoll.fromRollId, newRoll.shelf], [12.5, 'R-000120', 'ทั่วไป']);
  assert.throws(() => ret(s, [{ productId: 'P-0011', qty: 1, condition: 'ok', rollId: 'R-000160' }]), /เลือกได้เฉพาะม้วนที่ใบเบิกนี้ตัดไป/);
});

test('RT-AC7 เสียหายไปชั้น QC ของเสียไม่เพิ่มยอด ทั้งคู่นับว่าคืนแล้ว', () => {
  const s = setup();
  const avail = S.available(s, 'P-0007', 'wh-main');
  const rec = ret(s, [{ productId: 'P-0007', qty: 1, condition: 'damaged', photo: 'x.jpg' }, { productId: 'P-0007', qty: 1, condition: 'scrap', photo: 'y.jpg' }]);
  assert.deepEqual(rec.lines.map(l => [l.condition, l.shelf, l.photo]), [['damaged', 'QC', 'x.jpg'], ['scrap', null, null]]);
  assert.equal(qtyOf(s, 'P-0007', 'QC'), 1);
  assert.equal(S.available(s, 'P-0007', 'wh-main'), avail);
  const l = s.reqs.find(r => r.id === 'REQ-690010').lines[0];
  assert.deepEqual([l.returned, l.scrapped], [4, 1]);
});

test('RT-AC8 คลังปิดใช้ = ปฏิเสธ · คลังล็อกนับ = ปฏิเสธ', () => {
  const s = setup();
  s.warehouses.find(w => w.id === 'wh-main').active = false;
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: 1, condition: 'ok' }]), /คลังหลัก ปิดใช้งานอยู่ — คืนของไม่ได้ \(เปิดใช้อีกครั้งก่อน\)/);
  s.warehouses.find(w => w.id === 'wh-main').active = true; s.warehouses.find(w => w.id === 'wh-main').locked = true;
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: 1, condition: 'ok' }]), /กำลังนับสต็อก/);
});

test('RT-AC10 ของเข้าแล้วกันให้ใบที่รอ + แจ้งเตือนผู้เบิก', () => {
  const s = setup();
  s.stock = s.stock.filter(x => x.productId !== 'P-0007');
  s.reqs.push({ id: 'REQ-690012', userId: 'u-head', whId: 'wh-main', jobId: 'J-25-010', note: '', status: 'waiting', at: '2026-11-12T09:00:00',
    lines: [{ productId: 'P-0007', qty: 2, issued: 0, reserved: 0, returned: 0, single: false, cuts: [] }] });
  ret(s, [{ productId: 'P-0007', qty: 3, condition: 'ok' }]);
  const w = s.reqs.find(r => r.id === 'REQ-690012');
  assert.deepEqual([w.status, w.lines[0].reserved], ['ready', 2]);
  const n = s.notifs.filter(x => x.toUserId === 'u-head').pop();
  assert.match(n.text, /ของที่รอสำหรับ REQ-690012 เข้าแล้ว ระบบกันของไว้ให้แล้ว/);
  assert.ok(!/จอง/.test(n.text));
});

test('หลายบรรทัด 1 บรรทัดผิด = ไม่ลงยอดเลย', () => {
  const s = setup();
  const snap = () => JSON.stringify([s.stock, s.rolls, s.returns, s.reqs, s.seq]);
  const before = snap();
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: 1, condition: 'ok' }, { productId: 'P-0011', qty: 0, condition: 'ok' }], 'u-store'));
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: 1, condition: 'ok' }, { productId: 'P-0011', qty: 1, condition: 'ok', shelf: 'C-01' }].map(l => l.productId === 'P-0011' ? { ...l, rollId: 'R-000001' } : l), 'u-store'));
  assert.equal(snap(), before);
});

test('RT-G1 วิศวกรคืนใบของคนอื่นไม่ได้ · Store คืนแทนได้', () => {
  const s = setup();
  s.reqs.find(r => r.id === 'REQ-690010').userId = 'u-head';
  assert.throws(() => ret(s, [{ productId: 'P-0007', qty: 1, condition: 'ok' }], 'u-eng'), /ให้หัวหน้าทำแทน/);
  assert.equal(ret(s, [{ productId: 'P-0007', qty: 1, condition: 'ok' }], 'u-store').byUserId, 'u-store');
});

test('Q8 jobUsage นับของเสียเป็นยอดใช้', () => {
  const s = setup();
  s.reqs.find(r => r.id === 'REQ-690010').lines[0] = { productId: 'P-0007', qty: 10, issued: 10, reserved: 0, returned: 0, single: false, cuts: [] };
  ret(s, [{ productId: 'P-0007', qty: 2, condition: 'ok' }, { productId: 'P-0007', qty: 1, condition: 'scrap' }]);
  assert.deepEqual(S.jobUsage(s, 'J-25-010').find(u => u.productId === 'P-0007'), { productId: 'P-0007', issued: 10, returned: 3, scrapped: 1, used: 8 });
});

test('Q9 returnHint เตือนเศษสั้นกว่า scrapMin', () => {
  const s = setup();
  assert.deepEqual(S.returnHint(s, 'P-0011', 0.5), { short: true, scrapMin: 3 });
  assert.deepEqual(S.returnHint(s, 'P-0011', 5), { short: false, scrapMin: 3 });
  assert.equal(S.returnHint(s, 'P-0007', 1).short, false);
});

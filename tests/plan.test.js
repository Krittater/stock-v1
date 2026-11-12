const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
const S = SM.store;
const SCENE = [{ productId: 'P-0011', qty: 80 }, { productId: 'P-0007', qty: 85 }]; // ฉากหลัก M7

test('ฉากหลัก: สายพอ กล่องขาด 31 และยังเบิกได้', () => {
  const s = SM.seed(); const plan = S.planIssue(s, SCENE, 'wh-main');
  const [wire, box] = plan.lines;
  assert.deepEqual([wire.result, wire.have, wire.short], ['ok', 100, 0]);
  assert.deepEqual(wire.cuts, [{ rollId: 'R-000160', shelf: 'A-01', had: 100, cut: 80, left: 20 }]);
  assert.deepEqual([box.result, box.want, box.have, box.short], ['short', 85, 54, 31]);
  assert.equal(plan.blocked, false);                       // คลังที่ขาดไม่ใช่ error
});

test('ไม่มีของในคลัง = none, ไม่บล็อก', () => {
  const s = SM.seed();
  const p = S.planLine(s, { productId: 'P-0017', qty: 10 }, 'wh-main');
  assert.deepEqual([p.result, p.have, p.short, p.error, p.everStocked], ['none', 0, 10, null, false]);
});

test('เส้นเดียว: ไม่มีม้วนยาวพอ → error บล็อก (N38)', () => {
  const s = SM.seed();
  s.rolls = s.rolls.filter(r => r.productId !== 'P-0011');
  s.rolls.push({ id: 'R-1', productId: 'P-0011', whId: 'wh-main', shelf: 'A-01', length: 50, opened: false },
               { id: 'R-2', productId: 'P-0011', whId: 'wh-main', shelf: 'A-01', length: 40, opened: true });
  const multi = S.planLine(s, { productId: 'P-0011', qty: 80 }, 'wh-main');
  assert.deepEqual(multi.cuts.map(c => [c.rollId, c.cut, c.left]), [['R-2', 40, 0], ['R-1', 40, 10]]); // ม้วนเปิดแล้วก่อน
  const single = S.planIssue(s, [{ productId: 'P-0011', qty: 80, single: true }], 'wh-main');
  assert.equal(single.blocked, true);
  assert.match(single.firstError, /ไม่มีม้วนไหนยาว 80 m ในคลังนี้ \(ยาวสุด 50 m\)/);
  const ok = S.planLine(s, { productId: 'P-0011', qty: 45, single: true }, 'wh-main');
  assert.deepEqual(ok.cuts.map(c => c.rollId), ['R-1']);    // ม้วนที่ยาวพอและเหลือน้อยสุด
});

test('เตือนเศษม้วน (N45) ไม่บล็อก', () => {
  const s = SM.seed();
  const p = S.planLine(s, { productId: 'P-0011', qty: 98.5 }, 'wh-main');
  assert.equal(p.error, null);
  assert.match(p.warnings[0], /R-000160 จะเหลือ 1\.5 m \(สั้นกว่าเกณฑ์เศษ 3 m\)/);
});

test('ตัวเลือกคลัง: ลำดับ ป้าย แนะนำ ล็อก', () => {
  const s = SM.seed();
  const opts = S.warehouseOptions(s, [{ productId: 'P-0004', qty: 5 }]);
  assert.equal(opts[0].wh.id, 'wh-main');
  assert.deepEqual([opts[0].status, opts[0].recommended, opts[0].label], ['full', true, 'ครบ ✓']);
  assert.equal(opts.filter(o => o.recommended).length, 1);
  const c = opts.at(-1);
  assert.deepEqual([c.wh.id, c.status, c.label], ['wh-c', 'locked', 'กำลังนับสต็อก ใช้ไม่ได้ชั่วคราว']);
  const scene = S.warehouseOptions(s, SCENE).find(o => o.wh.id === 'wh-main');
  assert.deepEqual([scene.status, scene.label], ['short', 'ขาด 1/2 รายการ']);
  assert.equal(S.warehouseOptions(s, [{ productId: 'P-0004', qty: 5 }]).find(o => o.wh.id === 'wh-a').status, 'none');
  assert.equal(S.autoWarehouse(s, [{ productId: 'P-0004', qty: 5 }]), 'wh-main'); // คลังเดียวที่ครบ
  assert.equal(S.autoWarehouse(s, [{ productId: 'P-0006', qty: 1 }]), null);      // ครบหลายคลัง → ให้ผู้ใช้เลือก
});

test('จำนวน: ว่าง/0/ทศนิยมกับของนับชิ้น', () => {
  const s = SM.seed(); const p = (id) => s.products.find(x => x.id === id);
  assert.equal(S.qtyError(p('P-0004'), null), 'ใส่จำนวนที่มากกว่า 0');
  assert.equal(S.qtyError(p('P-0004'), 0), 'ใส่จำนวนที่มากกว่า 0');
  assert.equal(S.qtyError(p('P-0004'), ''), 'ใส่จำนวนที่มากกว่า 0');
  assert.equal(S.qtyError(p('P-0004'), 2.5), 'ตัวต้องเป็นจำนวนเต็ม');
  assert.equal(S.qtyError(p('P-0011'), 12.5), null);
  assert.equal(S.linesReady(s, [{ productId: 'P-0004', qty: 2.5 }]), false);
  assert.equal(S.linesReady(s, []), false);
  assert.equal(S.linesReady(s, [{ productId: 'P-0004', qty: 2 }]), true);
});

test('คลังที่เลือกถูกล็อกระหว่างกรอก → ล้างคลัง แจ้ง N36 งานไม่หาย', () => {
  const s = SM.seed();
  Object.assign(s.cart, { lines: [{ productId: 'P-0004', qty: 5 }], whId: 'wh-main', jobId: 'J-25-010' });
  s.warehouses[0].locked = true;
  assert.equal(S.syncCartWarehouse(s), 'คลังหลัก เริ่มนับสต็อก ใช้ไม่ได้ชั่วคราว กรุณาเลือกคลังอื่น');
  assert.equal(s.cart.whId, null);
  assert.equal(s.cart.jobId, 'J-25-010');
});

test('เลือกคลังอัตโนมัติ ไม่ทับคลังที่ผู้ใช้เลือกเอง', () => {
  const s = SM.seed();
  s.cart.lines = [{ productId: 'P-0004', qty: 5 }];
  assert.equal(S.syncCartWarehouse(s), null);
  assert.deepEqual([s.cart.whId, s.cart.whAuto], ['wh-main', true]);
  Object.assign(s.cart, { whId: 'wh-a', whAuto: false });
  S.syncCartWarehouse(s);
  assert.equal(s.cart.whId, 'wh-a');
});

test('ปุ่มสลับคลัง (N43)', () => {
  const s = SM.seed();
  s.stock.push({ productId: 'P-0007', whId: 'wh-b', qty: 300, shelf: 'ทั่วไป' });
  const sug = S.switchSuggestions(s, SCENE, 'wh-main');
  assert.deepEqual(sug.map(x => [x.wh.id, x.productId, x.have]), [['wh-b', 'P-0007', 300]]);
});

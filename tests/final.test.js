const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
['products', 'opening', 'receiving', 'returns'].forEach(m => require('../js/domain/' + m + '.js'));
const S = SM.store;
const fill = (s, lines, whId = 'wh-main') => Object.assign(s.cart, { lines, whId, jobId: 'J-25-010', note: '' });
const last = (s, action) => s.audit.filter(e => e.action === action).pop();
const off = (s, id) => { s.products.find(p => p.id === id).active = false; };

test('F1 สร้างสินค้าพร้อมยอดตั้งต้น ลงชั้นที่เลือก', () => {
  const s = SM.seed();
  const r = S.createProduct(s, { name: 'น็อตทดสอบ', category: 'x', unit: 'ตัว', opening: { whId: 'wh-main', qty: 5, shelf: 'A-02' } }, 'u-head');
  assert.ok(s.stock.some(x => x.productId === r.product.id && x.shelf === 'A-02' && x.qty === 5));
});

test('F2 สินค้าเลิกใช้: เบิกไม่ได้ ไม่โผล่ใน recent', () => {
  const s = SM.seed();
  fill(s, [{ productId: 'P-0007', qty: 1 }]); S.issueNow(s, 'u-eng');
  assert.ok(S.recentProducts(s, 'u-eng').some(p => p.id === 'P-0007'));
  off(s, 'P-0007');
  assert.ok(!S.recentProducts(s, 'u-eng').some(p => p.id === 'P-0007'));
  fill(s, [{ productId: 'P-0007', qty: 1 }]);
  assert.equal(S.linesReady(s, s.cart.lines), false);
  assert.throws(() => S.issueNow(s, 'u-eng'), /กล่องพักสาย 4x4 นิ้ว เลิกใช้แล้ว เบิกไม่ได้/);
  assert.equal(S.lineBlock(s, s.cart.lines[0]), 'กล่องพักสาย 4x4 นิ้ว เลิกใช้แล้ว เบิกไม่ได้');
});

test('F2b เลิกใช้ไม่ได้ขณะมี PR ค้าง / ใบเบิกรอของ / ของเบิกยังไม่คืน', () => {
  let s = SM.seed();
  s.stock = s.stock.filter(x => x.productId !== 'P-0004'); s.reqs = []; s.prs = [];
  fill(s, [{ productId: 'P-0004', qty: 2 }]); S.issueNow(s, 'u-eng');
  assert.ok(s.prs.some(p => p.productId === 'P-0004' && p.status === 'open'));
  assert.throws(() => S.setProductActive(s, 'P-0004', false, 'u-head'), /เลิกใช้ไม่ได้ ยังมีรายการต้องซื้อค้าง/);
  s.prs.forEach(p => { p.status = 'cancelled'; });
  assert.throws(() => S.setProductActive(s, 'P-0004', false, 'u-head'), /เลิกใช้ไม่ได้ ยังมีใบเบิกที่ค้างของนี้อยู่/);
  s = SM.seed(); s.stock = s.stock.filter(x => x.productId !== 'P-0004'); s.prs = [];
  s.reqs = [{ id: 'REQ-1', userId: 'u-eng', whId: 'wh-main', jobId: 'J-25-010', status: 'issued', lines: [{ productId: 'P-0004', qty: 5, issued: 5, reserved: 0, returned: 1 }] }];
  assert.throws(() => S.setProductActive(s, 'P-0004', false, 'u-head'), /ยังมีใบเบิกที่ค้างของนี้อยู่/);
  s.jobs.find(j => j.id === 'J-25-010').open = false;
  assert.equal(S.setProductActive(s, 'P-0004', false, 'u-head').active, false);
});

test('F4 issue/approve/pick อยู่ในประวัติ', () => {
  const s = SM.seed();
  fill(s, [{ productId: 'P-0007', qty: 1 }]); const a = S.issueNow(s, 'u-eng');
  assert.equal(last(s, 'issue').ref, a.req.id);
  const line = { productId: 'P-0007', qty: 1, issued: 0, reserved: 0, returned: 0, single: false, cuts: [] };
  s.reqs.push({ id: 'REQ-X', userId: 'u-eng', whId: 'wh-main', jobId: 'J-25-010', status: 'pending_approval', at: '2026-11-10T09:00:00', lines: [{ ...line }] });
  S.approveReq(s, 'REQ-X', 'u-head', true);
  assert.equal(last(s, 'req-approve').ref, 'REQ-X');
  s.reqs.push({ id: 'REQ-Y', userId: 'u-eng', whId: 'wh-main', jobId: 'J-25-010', status: 'ready', at: '2026-11-10T09:00:00', lines: [{ ...line, reserved: 1 }] });
  S.pickReq(s, 'REQ-Y', 'u-store');
  assert.equal(last(s, 'pick').ref, 'REQ-Y');
});

test('F5 เฉพาะหัวหน้าอนุมัติใบเบิก', () => {
  const s = SM.seed();
  s.reqs.push({ id: 'REQ-X', userId: 'u-eng', whId: 'wh-main', jobId: 'J-25-010', status: 'pending_approval', lines: [{ productId: 'P-0007', qty: 1, issued: 0, reserved: 0, returned: 0, cuts: [] }] });
  assert.throws(() => S.approveReq(s, 'REQ-X', 'u-eng', true), /ให้หัวหน้าทำแทน/);
  assert.throws(() => S.approveReq(s, 'REQ-X', 'u-store', true), /ให้หัวหน้าทำแทน/);
});

test('F6 เหตุผลรับเกินเก็บเมื่อเกินจริงเท่านั้น', () => {
  const s = SM.seed();
  const r = S.receive(s, { whId: 'wh-main', overReason: 'ไม่ได้เกิน', lines: [{ productId: 'P-0007', qty: 3 }] }, 'u-store');
  assert.equal(r.receipt.overReason, '');
  const p2 = S._.createPR(s, null, 'P-0007', 5, { whId: 'wh-main' });
  const r2 = S.receive(s, { whId: 'wh-main', overReason: 'ผู้ขายแถม', lines: [{ productId: 'P-0007', qty: 8, prId: p2.id }] }, 'u-store');
  assert.equal(r2.receipt.overReason, 'ผู้ขายแถม');
  assert.match(last(s, 'receive').text, /เหตุผลรับเกิน: ผู้ขายแถม/);
});

test('F7 openingRoute รับ flag ต้องอนุมัติเมื่อยังไม่มีสินค้า', () => {
  const s = SM.seed();
  assert.equal(S.openingRoute(s, null, 'u-store'), 'direct');
  assert.equal(S.openingRoute(s, null, 'u-store', true), 'head');
});

test('F8 หัวหน้าย้ายหมวดเข้า approvalCats = needsApproval', () => {
  const s = SM.seed(); s.approvalCats.push('หมวดอนุมัติ');
  S.updateProduct(s, 'P-0004', { category: 'หมวดอนุมัติ' }, 'u-head');
  const p = s.products.find(x => x.id === 'P-0004');
  assert.equal(p.needsApproval, true);
  assert.ok(s.audit.some(e => e.ref === 'P-0004' && /needsApproval/.test(e.text)));
});

test('F9 Store ยืนยันยอดบันทึก opening-confirm', () => {
  const s = SM.seed();
  const { product } = S.createProduct(s, { name: 'ของต้องอนุมัติ', category: 'x', unit: 'ตัว' }, 'u-head');
  const r = S.submitOpening(s, { productId: product.id, whId: 'wh-main', qty: 4 }, 'u-eng');
  S.confirmCC(s, r.cc.id, 'u-store', true);
  assert.equal(last(s, 'opening-confirm').ref, r.cc.id);
});

test('F10 ม้วนชั้น QC ไม่นับเป็นม้วนที่เบิกได้', () => {
  const s = SM.seed();
  const roll = s.rolls.find(r => r.whId === 'wh-main' && r.shelf !== 'QC');
  const before = S.rollCount(s, roll.productId, 'wh-main');
  s.rolls.push({ id: 'R-999999', productId: roll.productId, whId: 'wh-main', shelf: 'QC', length: 10, opened: false });
  assert.equal(S.rollCount(s, roll.productId, 'wh-main'), before);
});

test('F11 คืนของหลวมของสินค้าเลิกใช้ไม่ได้', () => {
  const s = SM.seed(); off(s, 'P-0007');
  assert.throws(() => S.returnLoose(s, { productId: 'P-0007', whId: 'wh-main', shelf: 'ทั่วไป', qty: 1, condition: 'ok', reason: 'x' }, 'u-store'), /กล่องพักสาย 4x4 นิ้ว เลิกใช้แล้ว/);
});

test('F2c ใบเบิกที่ยกเลิก/ปิดแล้ว (มีเศษไม่ได้จ่าย) ไม่ขวางการเลิกใช้', () => {
  for (const status of ['cancelled', 'closed']) {
    const s = SM.seed(); s.stock = s.stock.filter(x => x.productId !== 'P-0004'); s.prs = [];
    s.reqs = [{ id: 'REQ-1', userId: 'u-eng', whId: 'wh-main', jobId: 'J-25-010', status, lines: [{ productId: 'P-0004', qty: 5, issued: 2, reserved: 0, returned: 2 }] }];
    assert.equal(S.setProductActive(s, 'P-0004', false, 'u-head').active, false, status);
  }
});

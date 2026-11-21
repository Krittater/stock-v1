const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); const SM = require('../js/text.js'); require('../js/store.js');

test('seed ตรงกับสเปก 0.5', () => {
  const s = SM.seed();
  assert.equal(s.products.length, 12);
  assert.deepEqual(s.warehouses.map(w => w.name),
    ['คลังหลัก', 'คลังไซต์งาน A', 'คลังไซต์งาน B', 'คลังไซต์งาน C']);
  assert.equal(s.warehouses[3].locked, true);
  assert.equal(s.jobs.length, 5);
  assert.deepEqual(s.users.map(u => u.role), ['engineer', 'store', 'head']);
  const sum = (pid) => s.rolls.filter(r => r.productId === pid).reduce((a, r) => a + r.length, 0);
  assert.equal(sum('P-0011'), 160);                       // 2 ม้วน
  assert.equal(s.rolls.filter(r => r.productId === 'P-0011').length, 2);
  assert.equal(sum('P-0017'), 0);                         // ไม่มีของ
  const qty = (pid, wh) => s.stock.find(x => x.productId === pid && x.whId === wh)?.qty ?? 0;
  assert.equal(qty('P-0007', 'wh-main'), 54);             // ฉากหลัก M7: ขอ 85 ขาด 31
  assert.equal(s.stock.filter(x => x.productId === 'P-0007').reduce((a, x) => a + x.qty, 0), 74);
  const r160 = s.rolls.find(r => r.id === 'R-000160');
  assert.deepEqual([r160.productId, r160.whId, r160.shelf, r160.length], ['P-0011', 'wh-main', 'A-01', 100]);
});

test('seed: ยอดรวมทุกคลังตรงสเปก 0.5 ทุกสินค้า', () => {
  const s = SM.seed();
  const total = (pid) => s.stock.filter(x => x.productId === pid).reduce((a, x) => a + x.qty, 0)
    + s.rolls.filter(r => r.productId === pid).reduce((a, r) => a + r.length, 0);
  const rolls = (pid) => s.rolls.filter(r => r.productId === pid).length;
  const want = { 'P-0011': [160, 2], 'P-0012': [100, 1], 'P-0015': [135, 2], 'P-0016': [100, 1], 'P-0017': [0, 0],
    'P-0018': [50, 1], 'P-0008': [1220, 4], 'P-0004': [30, 0], 'P-0005': [130, 0], 'P-0007': [74, 0],
    'P-0009': [25, 0], 'P-0006': [36, 0] };
  for (const [pid, [q, r]] of Object.entries(want)) assert.deepEqual([pid, total(pid), rolls(pid)], [pid, q, r]);
});

test('fmtQty', () => {
  assert.equal(SM.fmtQty(1250, 'm'), '1,250 m');
  assert.equal(SM.fmtQty(12.5, 'm'), '12.5 m');
  assert.equal(SM.fmtQty(80.00, 'm'), '80 m');
  assert.equal(SM.fmtQty(1.256, 'm'), '1.26 m');
});

test('loadState กลับไป seed เมื่อข้อมูลเสีย', () => {
  for (const raw of [null, '{bad json', '{"v":0}', '[]'])
    assert.equal(SM.loadState(raw).products.length, 12);
  const s = SM.seed(); s.settings.reqApproval = true;
  assert.equal(SM.loadState(JSON.stringify(s)).settings.reqApproval, true);
});

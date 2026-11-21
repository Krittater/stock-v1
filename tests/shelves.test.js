const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
require('../js/domain/audit.js');
const S = SM.store;

test('ของชั้นรอตรวจไม่นับเป็นยอดเบิกได้', () => {
  const s = SM.seed();
  s.stock.push({ productId: 'P-0004', whId: 'wh-main', qty: 7, shelf: 'QC' });
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 30);
  assert.equal(S.totalStock(s, 'P-0004').qty, 30);
  assert.deepEqual(S.qcStock(s, 'wh-main').map(x => x.qty), [7]);
});
test('stockIn แยกแถวตามชั้น และปฏิเสธชั้นที่ปิดใช้', () => {
  const s = SM.seed(), p = s.products.find(x => x.id === 'P-0004');
  S._.stockIn(s, p, 'wh-main', { qty: 3, shelf: 'A-01' }).apply();
  assert.equal(s.stock.filter(x => x.productId === 'P-0004' && x.whId === 'wh-main').length, 2);
  assert.throws(() => S._.stockIn(s, p, 'wh-b', { qty: 1, shelf: 'C-01' }), /C-01 ปิดใช้งานอยู่/);
});
test('loadState ทิ้งข้อมูลเวอร์ชันเก่า', () => {
  assert.equal(SM.loadState(JSON.stringify({ v: 1, stock: [] })).v, 2);
  assert.equal(SM.loadState('{bad').v, 2);
});
test('S.log ลงประวัติ', () => {
  const s = SM.seed(); S.log(s, 'u-store', 'return', 'RT-0001', 'คืน 3 ตัว');
  assert.equal(S.auditFor(s, 'RT-0001')[0].userId, 'u-store');
});
test('seed v2: ชั้นวาง + ค่าใหม่', () => {
  const s = SM.seed();
  assert.deepEqual(S.shelves(s, 'wh-main'), ['ทั่วไป', 'A-01', 'A-02', 'A-03', 'B-01', 'B-02', 'B-03', 'C-01']);
  assert.ok(!S.shelves(s, 'wh-b').includes('C-01'));
  assert.equal(S.qcShelf(s, 'wh-a'), 'QC');
  assert.ok(S.shelves(s, 'wh-a', { qc: true }).includes('QC'));
  assert.equal(s.products.find(p => p.id === 'P-0008').needsApproval, true);
  assert.equal(SM.T.FORBIDDEN, 'คุณทำรายการนี้ไม่ได้ ให้หัวหน้าทำแทน หรือขอให้หัวหน้าเปิดสิทธิ์');
});

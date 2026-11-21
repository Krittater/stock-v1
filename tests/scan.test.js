const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js'); require('../js/domain/scan.js');
const S = SM.store;

function setup() {
  const s = SM.seed();
  s.products.find(p => p.id === 'P-0007').vendorCode = 'VC-777';
  s.products.find(p => p.id === 'P-0004').vendorCode = 'VC-OLD';
  s.products.find(p => p.id === 'P-0004').active = false;
  return s;
}

test('parseScan คืนค่าถูกทั้ง 5 แบบ', () => {
  const s = setup();
  const req = s.reqs[0].id, roll = s.rolls[0].id, job = s.jobs[0].id;
  assert.deepStrictEqual(S.parseScan(s, req), { kind: 'req', id: req });
  assert.deepStrictEqual(S.parseScan(s, roll), { kind: 'roll', id: roll });
  assert.deepStrictEqual(S.parseScan(s, 'P-0007'), { kind: 'product', id: 'P-0007' });
  assert.deepStrictEqual(S.parseScan(s, job), { kind: 'job', id: job });
  assert.deepStrictEqual(S.parseScan(s, 'vc-777'), { kind: 'product', id: 'P-0007' });
});

test('ไม่สนตัวพิมพ์และช่องว่าง', () => {
  const s = setup(); const id = s.reqs[0].id;
  assert.deepStrictEqual(S.parseScan(s, ' ' + id.toLowerCase() + ' '), { kind: 'req', id });
});

test('สินค้าที่เลิกใช้ / ไม่รู้จัก / ว่าง = null', () => {
  const s = setup();
  assert.strictEqual(S.parseScan(s, 'P-0004'), null);
  assert.strictEqual(S.parseScan(s, 'VC-OLD'), null);
  assert.strictEqual(S.parseScan(s, 'XYZ'), null);
  assert.strictEqual(S.parseScan(s, '  '), null);
  assert.strictEqual(S.parseScan(s, 'REQ-000000'), null);
});

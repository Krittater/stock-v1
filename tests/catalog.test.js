const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
const S = SM.store; const ids = (a) => a.map(p => p.id);

test('cableFacets อ่านจากชื่อ/รุ่น', () => {
  const s = SM.seed(); const p = (id) => s.products.find(x => x.id === id);
  assert.deepEqual(S.cableFacets(p('P-0011')), { type: 'THW', size: '1.5', cores: '1', color: 'ดำ' });
  assert.deepEqual(S.cableFacets(p('P-0015')), { type: 'THW', size: '2.5', cores: '1', color: 'เขียว-เหลือง' });
  assert.deepEqual(S.cableFacets(p('P-0018')), { type: 'VCT', size: '2.5', cores: '4' });
  assert.equal(S.cableFacets(p('P-0008')).type, 'CAT6');
  assert.deepEqual(S.cableFacets(p('P-0004')), {});
  assert.deepEqual(S.cableFacets({ name: 'สายไฟ THW 1x4 sq.mm สีแดง', model: '' }),
    { type: 'THW', size: '4', cores: '1', color: 'แดง' });
});

test('ค้นหา: ชื่อ ยี่ห้อ รุ่น รหัส และลำดับผล', () => {
  const s = SM.seed();
  assert.deepEqual(ids(S.searchProducts(s, { q: 'schneider' })), ['P-0004']);
  assert.deepEqual(ids(S.searchProducts(s, { q: 'p-0009' })), ['P-0009']);
  const wires = ids(S.searchProducts(s, { category: 'สายไฟ' }));
  assert.equal(wires.length, 6);
  assert.equal(wires.at(-1), 'P-0017');                    // ไม่มีของ อยู่ท้าย
  // ขึ้นต้นตรงคำค้นก่อน "มีคำค้น"
  assert.equal(ids(S.searchProducts(s, { q: 'เทป' }))[0], 'P-0006');
  assert.deepEqual(ids(S.searchProducts(s, { q: 'สายไฟ' })).slice(-2), ['P-0017', 'P-0006']); // ขึ้นต้น(ไม่มีของท้ายกลุ่ม) → มีคำค้น
});

test('ชิปสเปก: กรองหลายแถว + ตัวเลขจำนวนสินค้า + ซ่อนแถวค่าเดียว', () => {
  const s = SM.seed();
  const thw = { category: 'สายไฟ', facets: { type: 'THW' } };
  assert.deepEqual(ids(S.searchProducts(s, thw)).sort(), ['P-0011', 'P-0012', 'P-0015', 'P-0016']);
  const rows = S.facetRows(s, thw);
  const row = (k) => rows.find(r => r.key === k);
  assert.deepEqual(row('size').options.map(o => [o.value, o.count]), [['1.5', 2], ['2.5', 1], ['4', 1]]);
  assert.equal(row('type').options.find(o => o.value === 'THW').selected, true); // แถวที่เลือกยังอยู่
  assert.equal(row('cores'), undefined);                   // THW มีแกนเดียว → ซ่อน
  assert.deepEqual(ids(S.searchProducts(s, { category: 'สายไฟ', facets: { type: 'THW', size: '1.5', color: 'ดำ' } })), ['P-0011']);
  assert.deepEqual(S.facetRows(s, {}), []);                // IP-AC7: ยังไม่กรองอะไร ไม่มีชิป
  assert.deepEqual(S.facetRows(s, { category: 'อุปกรณ์ไฟฟ้า' }), []); // ไม่มีสายในผลลัพธ์
});

test('ยอดรวมทุกคลัง / ใช้บ่อย / หมวด', () => {
  const s = SM.seed();
  assert.deepEqual(S.totalStock(s, 'P-0011'), { qty: 160, rolls: 2 });
  assert.deepEqual(S.totalStock(s, 'P-0017'), { qty: 0, rolls: 0 });
  assert.deepEqual(S.totalStock(s, 'P-0007'), { qty: 74, rolls: 0 });
  assert.deepEqual(ids(S.recentProducts(s, 'u-eng')).sort(), ['P-0004', 'P-0009']);
  assert.deepEqual(S.recentProducts(s, 'u-store'), []);
  assert.deepEqual(S.recentJobs(s, 'u-eng').map(j => j.id), ['J-25-010']);
  assert.deepEqual(S.categories(s), ['สายไฟ', 'สายสื่อสาร', 'อุปกรณ์ไฟฟ้า', 'ท่อและราง', 'วัสดุสิ้นเปลือง']);
});

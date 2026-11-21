const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js'); require('../js/domain/products.js');
const S = SM.store, T = SM.T;
const mk = (s, extra = {}, uid = 'u-eng') => S.createProduct(s, { name: 'น็อตสแตนเลส M8', category: 'น็อตและสกรู', unit: 'ตัว', ...extra }, uid);
const P = (s, id) => s.products.find(p => p.id === id);

test('PD-AC1 สร้างแล้วใช้ได้ทันที', () => {
  const s = SM.seed();
  const { product } = mk(s);
  assert.deepEqual([product.id, product.active, product.needsApproval, product.photos], ['P-0020', true, false, []]);
  assert.ok(S.searchProducts(s, { q: 'น็อต' }).some(p => p.id === 'P-0020'));
  assert.equal(s.audit.length, 1);
});

test('PD-AC2 ไม่มีหมวด = throw', () => {
  const s = SM.seed();
  assert.throws(() => mk(s, { category: ' ' }), /กรุณาเลือกหมวดหมู่/);
});

test('PD-AC3 ชื่อซ้ำตัวพิมพ์ต่าง = throw / PD-AC4 คล้าย = ได้รายการ', () => {
  const s = SM.seed();
  assert.throws(() => mk(s, { name: 'เทปพันสายไฟ 3M' }), /^Error: มีสินค้าชื่อนี้แล้ว: P-0006$/);
  const sim = S.similarProducts(s, 'สายไฟ THW 2.5');
  assert.ok(sim.length > 0 && sim.length <= 5 && sim.every(x => x.exact || x.pct >= 35));
  assert.doesNotThrow(() => mk(s, { name: 'สายไฟ THW 2.5 พิเศษ' }));
});

test('PD-AC6 หมวดซ้ำตัวพิมพ์/ช่องว่างต่าง = ใช้หมวดเดิม', () => {
  const s = SM.seed();
  assert.equal(mk(s, { category: ' สายไฟ ' }).product.category, 'สายไฟ');
  const a = mk(s, { name: 'A1', category: 'Fasteners' }).product, b = mk(s, { name: 'B1', category: 'fasteners ' }).product;
  assert.deepEqual([a.category, b.category], ['Fasteners', 'Fasteners']);
  assert.deepEqual(S.categoryNames(s).filter(c => /fasteners/i.test(c)), ['Fasteners']);
});

test('PD-AC7 รูป: วิศวกร 1 / Store 3', () => {
  const s = SM.seed();
  assert.throws(() => mk(s, { photos: ['d1', 'd2'] }), /เพิ่มรูปที่ 2-3 ได้เฉพาะคลังสินค้าและหัวหน้า/);
  assert.equal(mk(s, { name: 'X1', photos: ['d1'] }).product.photos.length, 1);
  assert.equal(mk(s, { name: 'X2', photos: ['d1', 'd2', 'd3'] }, 'u-store').product.photos.length, 3);
  assert.throws(() => mk(s, { name: 'X3', photos: ['1', '2', '3', '4'] }, 'u-store'), /ใส่รูปได้ไม่เกิน 3 รูปต่อสินค้า/);
});

test('PD-AC8 / Q4 ต้องอนุมัติตามหมวด และเฉพาะหัวหน้าตั้งได้', () => {
  const s = SM.seed();
  S.updateProduct(s, 'P-0007', { needsApproval: true }, 'u-head');
  assert.equal(P(s, 'P-0007').needsApproval, true);
  assert.throws(() => S.updateProduct(s, 'P-0007', { needsApproval: false }, 'u-store'), new RegExp(T.FORBIDDEN));
  assert.equal(mk(s, { needsApproval: true }).product.needsApproval, false);          // วิศวกรติ๊กเองไม่ได้
  assert.equal(mk(s, { name: 'H1', needsApproval: true }, 'u-head').product.needsApproval, true);
  assert.throws(() => S.setCategoryApproval(s, 'สายไฟ', true, 'u-store'), new RegExp(T.FORBIDDEN));
  S.setCategoryApproval(s, 'ท่อและราง', true, 'u-head');
  assert.ok(s.products.filter(p => p.category === 'ท่อและราง').every(p => p.needsApproval));
  assert.equal(mk(s, { name: 'ท่อ EMT ใหม่', category: 'ท่อและราง' }).product.needsApproval, true);
  S.setCategoryApproval(s, 'หมวดว่าง', true, 'u-head');
  assert.ok(S.categoryNames(s).includes('หมวดว่าง'));
  S.setCategoryApproval(s, 'ท่อและราง', false, 'u-head');
  assert.ok(!s.approvalCats.includes('ท่อและราง') && s.products.filter(p => p.category === 'ท่อและราง').every(p => !p.needsApproval));
});

test('PD-AC9 วิศวกรแก้ไม่ได้ แต่เพิ่มรูปแรกได้', () => {
  const s = SM.seed();
  assert.throws(() => S.updateProduct(s, 'P-0004', { note: 'x' }, 'u-eng'), new RegExp(T.FORBIDDEN));
  S.addPhoto(s, 'P-0004', 'd1', 'u-eng');
  assert.deepEqual(P(s, 'P-0004').photos, ['d1']);
  assert.throws(() => S.addPhoto(s, 'P-0004', 'd2', 'u-eng'), /เพิ่มรูปที่ 2-3 ได้เฉพาะคลังสินค้าและหัวหน้า/);
  assert.throws(() => S.removePhoto(s, 'P-0004', 0, 'u-eng'), /ลบรูปได้เฉพาะคลังสินค้าและหัวหน้า/);
  S.addPhoto(s, 'P-0004', 'd2', 'u-store'); S.addPhoto(s, 'P-0004', 'd3', 'u-head');
  assert.throws(() => S.addPhoto(s, 'P-0004', 'd4', 'u-head'), /ใส่รูปได้ไม่เกิน 3 รูปต่อสินค้า/);
  S.removePhoto(s, 'P-0004', 0, 'u-store');
  assert.deepEqual(P(s, 'P-0004').photos, ['d2', 'd3']);
});

test('PD-AC10 มีของ = เปลี่ยนหน่วย/สายม้วนไม่ได้ · ไม่มีของ/ประวัติ = ได้', () => {
  const s = SM.seed();
  assert.equal(S.hasHistory(s, 'P-0004'), true);
  assert.throws(() => S.updateProduct(s, 'P-0004', { unit: 'กล่อง' }, 'u-head'), /เปลี่ยนหน่วยไม่ได้ เพราะมีของหรือมีประวัติแล้ว/);
  assert.throws(() => S.updateProduct(s, 'P-0004', { isRoll: true }, 'u-head'), /เปลี่ยนหน่วยไม่ได้/);
  assert.equal(S.updateProduct(s, 'P-0004', { unit: 'ตัว' }, 'u-head').unit, 'ตัว');   // ไม่เปลี่ยนจริง ไม่ throw
  const p = mk(s).product;
  assert.equal(S.hasHistory(s, p.id), false);
  assert.equal(S.updateProduct(s, p.id, { unit: 'ชิ้น' }, 'u-head').unit, 'ชิ้น');
});

test('Q6 เลิกใช้ได้เมื่อยอดเป็น 0 และหายจากการค้น/หมวด', () => {
  const s = SM.seed();
  assert.throws(() => S.setProductActive(s, 'P-0004', false, 'u-head'), /เลิกใช้ไม่ได้ ยังมีของ 30 ตัว/);
  assert.throws(() => S.setProductActive(s, 'P-0004', false, 'u-store'), new RegExp(T.FORBIDDEN));
  const p = mk(s, { category: 'หมวดใหม่' }).product;
  assert.ok(S.categoryNames(s).includes('หมวดใหม่'));
  S.setProductActive(s, p.id, false, 'u-head');
  assert.equal(S.searchProducts(s, { q: 'น็อต' }).length, 0);
  assert.ok(!S.categories(s).includes('หมวดใหม่') && !S.categoryNames(s).includes('หมวดใหม่'));
  S.setProductActive(s, p.id, true, 'u-head');
  assert.equal(S.searchProducts(s, { q: 'น็อต' }).length, 1);
  const q = mk(s, { name: 'Q1' }).product;                               // ของที่ชั้น QC ก็นับ
  s.stock.push({ productId: q.id, whId: 'wh-main', qty: 2, shelf: 'QC' });
  assert.throws(() => S.setProductActive(s, q.id, false, 'u-head'), /เลิกใช้ไม่ได้ ยังมีของ 2 ตัว/);
});

test('Q7 Store แก้ชื่อได้ แต่แก้หมวดไม่ได้ · ชื่อว่าง/ซ้ำ · log ต่อ field', () => {
  const s = SM.seed();
  const n0 = s.audit.length;
  assert.equal(S.updateProduct(s, 'P-0004', { name: 'เบรกเกอร์ 1P 16A' }, 'u-store').name, 'เบรกเกอร์ 1P 16A');
  assert.deepEqual([s.audit.length - n0, s.audit[n0].text], [1, 'แก้ name: เบรกเกอร์ลูกย่อย 1P 16A → เบรกเกอร์ 1P 16A']);
  assert.throws(() => S.updateProduct(s, 'P-0004', { category: 'อื่น ๆ' }, 'u-store'), new RegExp(T.FORBIDDEN));
  assert.throws(() => S.updateProduct(s, 'P-0004', { name: ' ' }, 'u-store'), /กรุณาระบุชื่อสินค้า/);
  assert.throws(() => S.updateProduct(s, 'P-0004', { name: 'เทปพันสายไฟ 3m' }, 'u-store'), /ชื่อซ้ำกับ P-0006/);
  S.updateProduct(s, 'P-0004', { brand: 'X', note: 'y', category: 'สายไฟ' }, 'u-head');
  assert.equal(s.audit.length - n0, 4);
  assert.equal(S.categories(s).includes('สายไฟ'), true);
});

test('PD-G4 บาร์โค้ดซ้ำ = throw (เฉพาะสินค้า active)', () => {
  const s = SM.seed();
  mk(s, { vendorCode: '8851234567890' });
  assert.throws(() => mk(s, { name: 'Y1', vendorCode: '8851234567890' }), /บาร์โค้ดนี้เป็นของ P-0020 น็อตสแตนเลส M8/);
  const b = mk(s, { name: 'Y2' }).product;
  assert.throws(() => S.updateProduct(s, b.id, { vendorCode: ' 8851234567890' }, 'u-store'), /บาร์โค้ดนี้เป็นของ P-0020/);
  S.updateProduct(s, b.id, { vendorCode: '111' }, 'u-store');
  S.setProductActive(s, 'P-0020', false, 'u-head');
  assert.doesNotThrow(() => S.updateProduct(s, b.id, { vendorCode: '8851234567890' }, 'u-store'));
});

const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js'); require('../js/domain/returns.js'); require('../js/domain/products.js');
const S = SM.store;
const fill = (s, lines) => Object.assign(s.cart, { lines, whId: 'wh-main', jobId: 'J-25-010', note: '' });
const texts = (s, uid) => s.notifs.filter(n => n.toUserId === uid).map(n => n.text);

test('ลูปเต็ม: ขาด → ต้องซื้อ → รับของเข้า → กันของ → หยิบ → ครบ', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0007', qty: 85 }]);
  const { req, prs } = S.issueNow(s, 'u-eng');                           // จ่าย 54 ขาด 31
  const { readied } = S.receiveStock(s, { productId: 'P-0007', whId: 'wh-main', qty: 40, prId: prs[0].id, userId: 'u-store' });
  assert.deepEqual(readied.map(r => r.id), [req.id]);
  assert.deepEqual([req.status, req.lines[0].reserved], ['ready', 31]);
  assert.equal(S.available(s, 'P-0007', 'wh-main'), 9);                  // 40 - 31 ที่กันไว้ (รับเกิน PR ได้)
  assert.deepEqual([prs[0].status, prs[0].received], ['done', 40]);
  assert.ok(texts(s, 'u-eng').some(t => /ของที่รอสำหรับ REQ-690007 เข้าแล้ว/.test(t)));
  S.pickReq(s, req.id, 'u-store');
  assert.deepEqual([req.status, req.lines[0].issued, req.lines[0].reserved], ['issued', 85, 0]);
  assert.equal(S.available(s, 'P-0007', 'wh-main'), 9);
  assert.ok(texts(s, 'u-eng').some(t => /REQ-690007 จ่ายของครบแล้ว/.test(t))); // N69: คนอื่นจ่ายให้
});

test('รับของเข้าไม่พอ: PR ยังเปิด ใบเบิกยังรอ', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0017', qty: 50 }]);
  const { req, prs } = S.issueNow(s, 'u-eng');
  S.receiveStock(s, { productId: 'P-0017', whId: 'wh-main', rollLengths: [30], prId: prs[0].id, userId: 'u-store' });
  assert.deepEqual([prs[0].status, prs[0].received, req.status, req.lines[0].reserved], ['open', 30, 'waiting', 30]);
  assert.throws(() => S.receiveStock(s, { productId: 'P-0017', whId: 'wh-main', rollLengths: [0], userId: 'u-store' }), /มากกว่า 0/);
  assert.throws(() => S.receiveStock(s, { productId: 'P-0004', whId: 'wh-c', qty: 5, userId: 'u-store' }), /กำลังนับสต็อก/);
});

test('เติมสต็อกเอง (ไม่มี PR) + ใกล้หมด', () => {
  const s = SM.seed();
  assert.deepEqual(S.lowStock(s).map(x => x.product.id), ['P-0004']);    // 30 < 40
  S.receiveStock(s, { productId: 'P-0004', whId: 'wh-main', qty: 20, userId: 'u-store' });
  assert.deepEqual(S.lowStock(s), []);
});

test('จ่ายไม่สำเร็จ (เดโม) → ไปหน้าหยิบแล้วจ่ายใหม่ได้', () => {
  const s = SM.seed(); s.settings.demoPickFail = true; fill(s, [{ productId: 'P-0004', qty: 5 }]);
  const { req } = S.issueNow(s, 'u-eng');
  S.pickReq(s, req.id, 'u-eng');
  assert.deepEqual([req.status, req.lines[0].issued, S.available(s, 'P-0004', 'wh-main')], ['issued', 5, 25]);
  assert.ok(!texts(s, 'u-eng').some(t => /จ่ายของครบแล้ว/.test(t)));    // จ่ายเอง ไม่ต้องแจ้งตัวเอง
  assert.throws(() => S.pickReq(s, req.id, 'u-eng'), /ไม่มีของที่กันไว้/);
});

test('คืนของ: กลับเข้าคลัง ห้ามคืนเกินที่จ่าย', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0004', qty: 5 }, { productId: 'P-0011', qty: 80 }]);
  const { req } = S.issueNow(s, 'u-eng');
  const ret = (lines) => S.returnItems(s, { reqId: req.id, whId: 'wh-main', shelf: 'ทั่วไป', lines: lines.map(l => ({ ...l, condition: 'ok' })) }, 'u-eng');
  ret([{ productId: 'P-0004', qty: 2 }, { productId: 'P-0011', qty: 10 }]);
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 27);
  assert.equal(S.available(s, 'P-0011', 'wh-main'), 30);                 // 20 + ม้วนคืน 10
  assert.equal(s.rolls.filter(r => r.productId === 'P-0011' && r.whId === 'wh-main').length, 2);
  assert.deepEqual(req.lines.map(l => l.returned), [2, 10]);
  assert.throws(() => ret([{ productId: 'P-0004', qty: 4 }]),
    /คืนได้ไม่เกิน 3 ตัว/);
  assert.throws(() => ret([{ productId: 'P-0011', qty: 5 }, { productId: 'P-0004', qty: 9 }]));
  assert.equal(req.lines[1].returned, 10);                               // ผิดรายการเดียว = ไม่คืนอะไรเลย
});

test('สร้างสินค้า: ชื่อซ้ำ/คล้าย, ยอดตั้งต้นตามบทบาท', () => {
  const s = SM.seed();
  assert.equal(S.similarProducts(s, 'เทปพันสายไฟ 3m')[0].exact, true);
  assert.throws(() => S.createProduct(s, { name: 'เทปพันสายไฟ 3M', category: 'อื่น ๆ', unit: 'ม้วน' }, 'u-eng'), /มีสินค้าชื่อนี้แล้ว: P-0006/);
  assert.ok(S.similarProducts(s, 'สายไฟ THW 1.5 sq.mm สีขาว').some(x => !x.exact));
  assert.deepEqual(S.similarProducts(s, 'น็อตสแตนเลส M8'), []);
  const a = S.createProduct(s, { name: 'น็อตสแตนเลส M8', category: 'อื่น ๆ', unit: 'ตัว', opening: { whId: 'wh-main', qty: 200 } }, 'u-store');
  assert.deepEqual([a.product.id, a.cc, S.available(s, 'P-0020', 'wh-main')], ['P-0020', null, 200]);
  assert.equal(a.toast, 'สร้าง P-0020 แล้ว · ลงยอด 200 ตัว เข้าคลังแล้ว');
  const b = S.createProduct(s, { name: 'สายไฟ THW 1x4 sq.mm สีแดง', category: 'สายไฟ', unit: 'ตัว', isRoll: true,
    opening: { whId: 'wh-main', rollLengths: [100, 100, 100] } }, 'u-eng');
  assert.deepEqual([b.product.unit, b.cc.id, b.cc.status, S.available(s, b.product.id, 'wh-main')], ['m', 'CC-0007', 'pending', 0]);
  assert.equal(S.cableFacets(b.product).color, 'แดง');
  assert.equal(b.product.category, 'สายไฟ');
  assert.ok(texts(s, 'u-store').some(t => /CC-0007/.test(t)));
  const c = S.createProduct(s, { name: 'ปลั๊กพ่วง 3 เมตร', category: 'อื่น ๆ', unit: 'ตัว' }, 'u-eng');
  assert.deepEqual([c.cc, c.product.category], [null, 'อื่น ๆ']);
  assert.throws(() => S.createProduct(s, { name: 'ของไม่มีหน่วย', category: 'อื่น ๆ', unit: ' ' }, 'u-eng'), /กรุณาเลือกหน่วย/);
});

test('ใบเบิกรอยอดที่ Store ยังไม่ยืนยัน → ยืนยันแล้วได้ของ', () => {
  const s = SM.seed();
  const { product, cc } = S.createProduct(s, { name: 'ข้อต่อ EMT 1/2 นิ้ว', category: 'อื่น ๆ', unit: 'ตัว', opening: { whId: 'wh-main', qty: 50 } }, 'u-eng');
  fill(s, [{ productId: product.id, qty: 10 }]);
  const { outcome, req, prs } = S.issueNow(s, 'u-eng');
  assert.deepEqual([outcome, prs.length], ['waiting', 0]);               // ไม่สร้าง PR (IP-AC39)
  S.confirmCC(s, cc.id, 'u-store', true);
  assert.deepEqual([cc.status, req.status, req.lines[0].reserved, S.available(s, product.id, 'wh-main')], ['ok', 'ready', 10, 40]);
  assert.throws(() => S.confirmCC(s, cc.id, 'u-store', true), /ไม่ได้รอยืนยัน/);
});

test('Store ตอบไม่มีของ → สร้าง PR ให้ใบที่รอ', () => {
  const s = SM.seed();
  const { product, cc } = S.createProduct(s, { name: 'ข้อต่อ EMT 3/4 นิ้ว', category: 'อื่น ๆ', unit: 'ตัว', opening: { whId: 'wh-main', qty: 50 } }, 'u-eng');
  fill(s, [{ productId: product.id, qty: 10 }]); S.issueNow(s, 'u-eng');
  S.confirmCC(s, cc.id, 'u-store', false, 'หาไม่เจอที่ชั้น');
  assert.deepEqual(s.prs.map(p => [p.productId, p.qty]), [[product.id, 10]]);
  assert.ok(texts(s, 'u-eng').some(t => /Store ไม่พบของ ข้อต่อ EMT 3\/4 นิ้ว ตามที่แจ้ง: หาไม่เจอที่ชั้น/.test(t)));
});

test('งานใหม่', () => {
  const s = SM.seed();
  assert.deepEqual(S.similarJobs(s, 'เดินสาย LAN โรงงาน').map(j => j.id), ['J-24-045']);
  assert.deepEqual(S.similarJobs(s, 'ติดตั้งแอร์ ห้องประชุม'), []);
  assert.throws(() => S.createJob(s, { name: '  ' }), /กรุณาระบุชื่องาน/);
  const j = S.createJob(s, { name: 'ติดตั้งแอร์ ห้องประชุม', customer: '' });
  assert.deepEqual([j.id, j.open], ['J-26-011', true]);
});

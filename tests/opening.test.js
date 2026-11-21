const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
require('../js/domain/returns.js'); require('../js/domain/receiving.js'); require('../js/domain/products.js'); require('../js/domain/opening.js');
const S = SM.store;
const texts = (s, uid) => s.notifs.filter(n => n.toUserId === uid).map(n => n.text);
const mk = (s, who, opening = { whId: 'wh-main', qty: 24 }) =>
  S.createProduct(s, { name: 'เทปพันสายไฟ 3M' + s.products.length, category: 'อื่น ๆ', unit: 'ชิ้น', opening }, who);
const qty = (s, id, wh = 'wh-main') => s.stock.filter(x => x.productId === id && x.whId === wh).reduce((a, x) => a + x.qty, 0);

test('OS-AC1 Store ส่ง ไม่ต้องอนุมัติ → เข้าทันที ที่ ทั่วไป', () => {
  const s = SM.seed(); const r = mk(s, 'u-store');
  assert.equal(r.cc, null);
  assert.match(r.toast, /ลงยอด 24 ชิ้น เข้าคลังแล้ว/);
  assert.deepEqual(s.stock.find(x => x.productId === r.product.id), { productId: r.product.id, whId: 'wh-main', qty: 24, shelf: 'ทั่วไป' });
});

test('OS-AC2 วิศวกร → stage store · แจ้ง Store · ยอดรอนับใน pendingOpening', () => {
  const s = SM.seed(); const r = mk(s, 'u-eng');
  assert.equal(r.cc.stage, 'store');
  assert.match(r.toast, /ส่งให้ Store ยืนยันยอด \(CC-\d+\)/);
  assert.equal(qty(s, r.product.id), 0);
  assert.ok(texts(s, 'u-store').some(t => t.includes(r.cc.id)));
  assert.equal(S.pendingOpening(s, r.product.id, 'wh-main'), 24);
  assert.equal(S.pendingOpening(s, r.product.id, 'wh-a'), 0);
});

test('OS-AC3 Store ยืนยัน → เข้าทันที แจ้งผู้ส่ง กันของให้ใบที่รอ', () => {
  const s = SM.seed(); const r = mk(s, 'u-eng');
  Object.assign(s.cart, { lines: [{ productId: r.product.id, qty: 10 }], whId: 'wh-main', jobId: 'J-25-010', note: '' });
  const { req, prs } = S.issueNow(s, 'u-eng');
  assert.equal(prs.length, 0);
  S.confirmCC(s, r.cc.id, 'u-store', true);
  assert.deepEqual([r.cc.stage, qty(s, r.product.id), req.status, req.lines[0].reserved], ['done', 24, 'ready', 10]);
  assert.ok(texts(s, 'u-eng').some(t => /ยืนยันยอด/.test(t)));
  assert.throws(() => S.confirmCC(s, r.cc.id, 'u-store', true), /ไม่ได้รอยืนยัน/);
});

test('OS-AC4 ไม่มีของต้องมีเหตุผล · ยอดไม่เข้า · แจ้งผู้ส่ง · ใบที่รอได้ PR', () => {
  const s = SM.seed(); const r = mk(s, 'u-eng');
  Object.assign(s.cart, { lines: [{ productId: r.product.id, qty: 10 }], whId: 'wh-main', jobId: 'J-25-010', note: '' });
  S.issueNow(s, 'u-eng');
  assert.throws(() => S.confirmCC(s, r.cc.id, 'u-store', false, '  '), /กรุณาระบุเหตุผล/);
  assert.equal(r.cc.stage, 'store');
  S.confirmCC(s, r.cc.id, 'u-store', false, 'หาไม่เจอที่ชั้น');
  assert.deepEqual([r.cc.stage, r.cc.reason, qty(s, r.product.id), s.prs.length], ['rejected', 'หาไม่เจอที่ชั้น', 0, 1]);
  assert.ok(texts(s, 'u-eng').some(t => /หาไม่เจอที่ชั้น/.test(t)));
  assert.ok(s.products.some(p => p.id === r.product.id));
});

test('OS-AC5 ต้องอนุมัติ: Store ส่ง → head · วิศวกร → store → head → done · หัวหน้าส่ง → เข้าทันที', () => {
  const s = SM.seed();
  const a = mk(s, 'u-store'); a.product.needsApproval = true;
  const st = S.submitOpening(s, { productId: a.product.id, whId: 'wh-main', qty: 5 }, 'u-store');
  assert.equal(st.cc.stage, 'head'); assert.match(st.toast, /รอหัวหน้าอนุมัติยอด \(CC-\d+\)/);
  assert.ok(texts(s, 'u-head').some(t => t.includes(st.cc.id)));
  assert.throws(() => S.confirmCC(s, st.cc.id, 'u-store', true), new RegExp(SM.T.FORBIDDEN));
  const en = S.submitOpening(s, { productId: a.product.id, whId: 'wh-main', qty: 3 }, 'u-eng');
  assert.equal(en.cc.stage, 'store');
  S.confirmCC(s, en.cc.id, 'u-store', true);
  assert.equal(en.cc.stage, 'head'); assert.equal(qty(s, a.product.id), 24);
  assert.ok(texts(s, 'u-head').some(t => t.includes(en.cc.id)));
  assert.throws(() => S.confirmCC(s, en.cc.id, 'u-head', false, ''), /กรุณาระบุเหตุผล/);
  S.confirmCC(s, en.cc.id, 'u-head', true);
  S.confirmCC(s, st.cc.id, 'u-head', false, 'นับผิด');
  assert.deepEqual([en.cc.stage, st.cc.stage, qty(s, a.product.id)], ['done', 'rejected', 27]);
  const hd = S.submitOpening(s, { productId: a.product.id, whId: 'wh-main', qty: 1 }, 'u-head');
  assert.equal(hd.cc, null); assert.equal(qty(s, a.product.id), 28);
});

test('OS-AC6 สายม้วน 2 ม้วน → 2 เลขม้วนที่ ทั่วไป · รวมในข้อความ', () => {
  const s = SM.seed();
  const r = S.createProduct(s, { name: 'สาย THW 1x6 sq.mm สีดำ', category: 'สายไฟ', isRoll: true, opening: { whId: 'wh-main', rollLengths: [85, 40] } }, 'u-store');
  const rolls = s.rolls.filter(x => x.productId === r.product.id);
  assert.deepEqual(rolls.map(x => [x.length, x.shelf]), [[85, 'ทั่วไป'], [40, 'ทั่วไป']]);
  assert.match(r.toast, /2 ม้วน 125 m/);
});

test('OS-AC7 หน่วยตัว 2.5 ผิด · ส่งยอดพังหลังสร้างสินค้า → สินค้าอยู่ + toast', () => {
  const s = SM.seed();
  assert.throws(() => S.submitOpening(s, { productId: 'P-0004', whId: 'wh-main', qty: 2.5 }, 'u-store'), /ต้องเป็นจำนวนเต็ม/);
  const n = s.products.length, real = S.submitOpening;
  S.submitOpening = () => { throw new Error('boom'); };
  try {
    const r = mk(s, 'u-store', { whId: 'wh-main', qty: 3 });
    assert.equal(r.toast, 'สร้างสินค้าแล้ว แต่ส่งยอดตั้งต้นไม่สำเร็จ: boom');
    assert.deepEqual([s.products.length, r.cc], [n + 1, null]);
  } finally { S.submitOpening = real; }
});

test('OS-AC9 approvalItems: Store เห็นเฉพาะ CC stage store · วิศวกรว่าง · หัวหน้าเห็นทุกอย่าง', () => {
  const s = SM.seed(); const r = mk(s, 'u-eng');
  s.reqs.push({ id: 'REQ-Z', userId: 'u-eng', whId: 'wh-main', jobId: 'J-25-010', status: 'pending_approval', lines: [] });
  const p = mk(s, 'u-store').product; p.needsApproval = true;
  const h = S.submitOpening(s, { productId: p.id, whId: 'wh-main', qty: 1 }, 'u-store');
  assert.deepEqual(S.approvalItems(s, 'u-store'), { reqs: [], ccs: [r.cc] });
  assert.deepEqual(S.approvalItems(s, 'u-eng'), { reqs: [], ccs: [] });
  const all = S.approvalItems(s, 'u-head');
  assert.deepEqual([all.reqs.map(x => x.id), all.ccs.map(x => x.id)], [['REQ-Z'], [r.cc.id, h.cc.id]]);
});

test('OS-G2/G3 found: Store เข้าทันที · เลือกชั้น A-02 ได้ · ชั้น QC ไม่ได้', () => {
  const s = SM.seed(); const before = qty(s, 'P-0004');
  const f = S.submitOpening(s, { productId: 'P-0004', whId: 'wh-main', shelf: 'A-02', qty: 4, kind: 'found' }, 'u-store');
  assert.equal(f.cc, null);
  assert.deepEqual([qty(s, 'P-0004'), s.stock.find(x => x.productId === 'P-0004' && x.shelf === 'A-02').qty], [before + 4, 4]);
  assert.throws(() => S.submitOpening(s, { productId: 'P-0004', whId: 'wh-main', shelf: 'QC', qty: 1 }, 'u-store'), /ชั้นรอตรวจ ลงยอดตั้งต้นไม่ได้/);
  const e = S.submitOpening(s, { productId: 'P-0004', whId: 'wh-main', qty: 2, kind: 'found' }, 'u-eng');
  assert.deepEqual([e.cc.kind, e.cc.stage, e.cc.shelf], ['found', 'store', 'ทั่วไป']);
});

const HEAD = 'code,warehouse,location,qty,roll_no,roll_initial,batch';
test('parseOpeningCsv: BOM CRLF quote คอลัมน์สลับ บรรทัดว่างท้าย', () => {
  const s = SM.seed();
  const t = '﻿qty,"warehouse",location,code,roll_no\r\n"3",คลังหลัก,A-01,P-0004,\r\n\r\n2,wh-a,"ทั่วไป",P-0005,\r\n\r\n';
  const { rows } = S.parseOpeningCsv(s, t);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].code, rows[0].whId, rows[0].shelf, rows[0].qty, rows[0].errors], ['P-0004', 'wh-main', 'A-01', 3, []]);
  assert.deepEqual([rows[1].whId, rows[1].errors], ['wh-a', []]);
});

test('parseOpeningCsv: ข้อความผิดตามสเปก 5B.3 + OS-G4', () => {
  const s = SM.seed();
  s.stock = s.stock.filter(x => x.productId !== 'P-0009'); s.reqs = []; s.prs = []; S.setProductActive(s, 'P-0009', false, 'u-head');
  s.rolls.push({ id: 'R-000777', productId: 'P-0008', whId: 'wh-main', shelf: 'ทั่วไป', length: 5 });
  const csv = [HEAD,
    ',wh-main,ทั่วไป,1,,,', 'P-9999,wh-main,ทั่วไป,1,,,', 'P-0009,wh-main,ทั่วไป,1,,,',
    'P-0004,wh-zz,ทั่วไป,1,,,', 'P-0004,wh-main,Z-99,1,,,', 'P-0004,wh-main,ทั่วไป,0,,,',
    'P-0004,wh-main,ทั่วไป,2.5,,,', 'P-0004,wh-c,ทั่วไป,1,,,',
    'P-0008,wh-main,ทั่วไป,50,,,', 'P-0008,wh-main,ทั่วไป,50,R-000777,,',
    'P-0008,wh-main,ทั่วไป,50,N-1,,', 'P-0008,wh-main,ทั่วไป,60,N-1,,',
    'P-0005,wh-a,ทั่วไป,1,,,', 'P-0005,คลังไซต์งาน A,ทั่วไป,1,,,'].join('\n');
  const e = S.parseOpeningCsv(s, csv).rows.map(r => r.errors.join('|'));
  assert.deepEqual(e, ['ไม่มีรหัสสินค้า', 'ไม่พบรหัสสินค้าในระบบ (สร้างรหัสก่อน)', 'ไม่พบรหัสสินค้าในระบบ (สร้างรหัสก่อน)',
    'ไม่พบคลัง', 'ไม่พบตำแหน่ง', 'จำนวนไม่ถูกต้อง', 'ตัวต้องเป็นจำนวนเต็ม', 'คลังไซต์งาน C ปิดใช้งานอยู่',
    'สินค้าติดตามรายม้วนต้องมีเลขม้วน', 'เลขม้วนซ้ำกับในระบบ', '', 'ข้อมูลซ้ำในไฟล์', '', 'ข้อมูลซ้ำในไฟล์']);
});

test('importOpening: head เท่านั้น · แถวผิดไม่ได้ · ล็อกไม่ได้ · atomic · เลขม้วนตาม CSV · log 1 ครั้ง', () => {
  const s = SM.seed();
  const ok = S.parseOpeningCsv(s, [HEAD, 'P-0004,wh-main,A-01,3,,,', 'P-0008,wh-main,A-02,100,N-1,120,L7'].join('\n')).rows;
  assert.throws(() => S.importOpening(s, ok, 'u-store'), new RegExp(SM.T.FORBIDDEN));
  const bad = S.parseOpeningCsv(s, [HEAD, 'P-0004,wh-main,A-01,3,,,', 'P-9999,wh-main,A-01,3,,,'].join('\n')).rows;
  const q = qty(s, 'P-0004');
  assert.throws(() => S.importOpening(s, bad, 'u-head'), /ตัดแถวที่ผิดก่อน/);
  assert.equal(S.validOpeningRows(bad).length, 1);
  S.setOpeningLock(s, true, 'u-head');
  assert.throws(() => S.setOpeningLock(s, false, 'u-store'), new RegExp(SM.T.FORBIDDEN));
  assert.throws(() => S.importOpening(s, ok, 'u-head'), /ยอดยกมาถูกล็อกแล้ว — ตรวจสอบไฟล์ได้ แต่นำเข้าได้หลังปลดล็อก/);
  S.setOpeningLock(s, false, 'u-head');
  // atomic: ชั้นของแถวหลังถูกปิดหลัง parse → แถวแรกต้องไม่เข้า
  const sh = s.warehouses.find(w => w.id === 'wh-main').shelves.find(x => x.code === 'A-02');
  sh.active = false; const n = s.audit.length;
  assert.throws(() => S.importOpening(s, ok, 'u-head'), /A-02/);
  assert.deepEqual([qty(s, 'P-0004'), s.audit.length], [q, n]);
  sh.active = true;
  S.importOpening(s, ok, 'u-head');
  assert.equal(qty(s, 'P-0004'), q + 3);
  const roll = s.rolls.find(x => x.id === 'N-1');
  assert.deepEqual([roll.productId, roll.shelf, roll.length, roll.batch, roll.initial], ['P-0008', 'A-02', 100, 'L7', 120]);
  assert.equal(s.audit.length, n + 1);
  assert.match(s.audit.at(-1).text, /2 แถว/);
});

test('นำเข้าเลขม้วน R-000050 → เลขที่ระบบออกต่อไม่ชน', () => {
  const s = SM.seed(); s.seq.roll = 40;
  const rows = S.parseOpeningCsv(s, [HEAD, 'P-0008,wh-main,A-02,100,R-000050,,'].join('\n')).rows;
  S.importOpening(s, rows, 'u-head');
  assert.equal(s.seq.roll, 51);
  S.receive(s, { whId: 'wh-main', lines: [{ productId: 'P-0008', rollLengths: [30], overReason: 'x' }] }, 'u-store');
  const ids = s.rolls.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('R-000051'));
});

test('ยืนยันหลังเลิกใช้สินค้า → ลงยอดไม่ได้ แต่ปฏิเสธได้', () => {
  const s = SM.seed(); const r = mk(s, 'u-eng');
  s.products.find(p => p.id === r.product.id).active = false;
  assert.throws(() => S.confirmCC(s, r.cc.id, 'u-store', true), /ไม่พบสินค้า/);
  assert.deepEqual([r.cc.stage, qty(s, r.product.id)], ['store', 0]);
  S.confirmCC(s, r.cc.id, 'u-store', false, 'เลิกใช้แล้ว');
  assert.equal(r.cc.stage, 'rejected');
});

test('openingRoute: ตรงกับที่ submitOpening ทำจริง', () => {
  const s = SM.seed();
  const nA = s.products.find(p => p.needsApproval), nN = s.products.find(p => !p.needsApproval && !p.isRoll);
  const exp = { 'u-head': ['direct', 'direct'], 'u-store': ['direct', 'head'], 'u-eng': ['store', 'store'] };
  for (const [u, [n, a]] of Object.entries(exp)) {
    assert.equal(S.openingRoute(s, nN.id, u), n); assert.equal(S.openingRoute(s, nA.id, u), a);
    const r = S.submitOpening(s, { productId: nN.id, whId: 'wh-main', qty: 1 }, u);
    assert.equal(r.cc ? r.cc.stage : 'direct', n);
  }
  assert.equal(S.openingRoute(s, null, 'u-store'), 'direct');
});

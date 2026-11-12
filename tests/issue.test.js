const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
const S = SM.store;
const fill = (s, lines, whId = 'wh-main', jobId = 'J-25-010') => Object.assign(s.cart, { lines, whId, jobId, note: 'เอาไปไซต์เช้านี้' });
const texts = (s, uid) => s.notifs.filter(n => n.toUserId === uid).map(n => n.text);

test('ฉากหลัก: จ่ายบางส่วน + รายการต้องซื้อ + ตัดม้วน', () => {
  const s = SM.seed();
  fill(s, [{ productId: 'P-0011', qty: 80 }, { productId: 'P-0007', qty: 85 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.equal(r.outcome, 'partial');
  assert.equal(r.req.id, 'REQ-690007');
  assert.equal(r.req.note, 'เอาไปไซต์เช้านี้');
  assert.deepEqual(r.req.lines.map(l => l.issued), [80, 54]);
  assert.deepEqual(r.req.lines[0].cuts, [{ rollId: 'R-000160', shelf: 'A-01', had: 100, cut: 80, left: 20 }]);
  assert.equal(s.rolls.find(x => x.id === 'R-000160').length, 20);
  assert.equal(s.rolls.find(x => x.id === 'R-000160').opened, true);
  assert.equal(S.available(s, 'P-0007', 'wh-main'), 0);
  assert.deepEqual(r.prs.map(p => [p.id, p.productId, p.qty, p.status]), [['PR-690002', 'P-0007', 31, 'open']]);
  assert.ok(texts(s, 'u-store').some(t => /PR-690002/.test(t)));        // N68 ถึง Store/หัวหน้า
  assert.ok(!texts(s, 'u-eng').some(t => /PR-690002/.test(t)));         // ไม่ส่งให้วิศวกร (ข้อเสนอ N68)
  assert.deepEqual([s.cart.lines.length, s.cart.note, s.cart.whId, s.cart.jobId], [0, '', 'wh-main', 'J-25-010']);
});

test('ของพอ = issued ไม่มี PR', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0004', qty: 5 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.deepEqual([r.outcome, r.prs.length, r.req.status], ['issued', 0, 'issued']);
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 25);
});

test('ตัดหมดม้วน: ม้วนหายจากคลัง', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0011', qty: 100 }]);
  S.issueNow(s, 'u-eng');
  assert.equal(s.rolls.some(r => r.id === 'R-000160'), false);
});

test('ไม่มีของเลย = waiting + PR เต็มจำนวน', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0017', qty: 50 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.deepEqual([r.outcome, r.prs[0].qty, r.req.lines[0].issued], ['waiting', 50, 0]);
});

test('ต้องอนุมัติ: ไม่ตัดสต็อก ไม่สร้าง PR จนหัวหน้าอนุมัติ', () => {
  const s = SM.seed(); s.settings.reqApproval = true;
  fill(s, [{ productId: 'P-0007', qty: 85 }]);
  assert.equal(S.needsApproval(s, 'u-eng'), true);
  assert.equal(S.needsApproval(s, 'u-store'), true);
  assert.equal(S.needsApproval(s, 'u-head'), false);
  const r = S.issueNow(s, 'u-eng');
  assert.equal(r.outcome, 'pending_approval');
  assert.equal(S.available(s, 'P-0007', 'wh-main'), 54);
  assert.equal(s.prs.length, 0);
  assert.ok(texts(s, 'u-head').some(t => /REQ-690007 รออนุมัติ: สมชาย ใจดี ขอเบิก 1 รายการ/.test(t)));
  assert.equal(S.unread(s, 'u-head').length, 1);
  const req = S.approveReq(s, r.req.id, 'u-head', true);
  assert.equal(req.status, 'partial');
  assert.equal(s.prs.length, 1);
  assert.ok(texts(s, 'u-eng').some(t => /REQ-690007 อนุมัติแล้ว/.test(t)));
  assert.throws(() => S.approveReq(s, r.req.id, 'u-head', true), /ไม่ได้รออนุมัติ/); // อนุมัติซ้ำไม่ได้
});

test('ไม่อนุมัติ', () => {
  const s = SM.seed(); s.settings.reqApproval = true; fill(s, [{ productId: 'P-0004', qty: 5 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.equal(S.approveReq(s, r.req.id, 'u-head', false, 'เบิกเกินงบ').status, 'rejected');
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 30);
  assert.ok(texts(s, 'u-eng').some(t => /ไม่ได้รับอนุมัติ: เบิกเกินงบ/.test(t)));
});

test('ระบบปฏิเสธ: state ไม่เปลี่ยน ฟอร์มยังอยู่', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0004', qty: 5 }]);
  s.jobs.find(j => j.id === 'J-25-010').open = false;
  assert.throws(() => S.issueNow(s, 'u-eng'), /งาน J-25-010 ปิดไปแล้ว เลือกงานอื่น/);
  assert.equal(s.cart.lines.length, 1);
  assert.equal(s.reqs.length, 1);                                       // มีแค่ใบ seed
  s.jobs.find(j => j.id === 'J-25-010').open = true; s.warehouses[0].locked = true;
  assert.throws(() => S.issueNow(s, 'u-eng'), /เบิกไม่ได้: คลังนี้กำลังตรวจนับ/);
  assert.equal(s.seq.req, 690007);
});

test('กดซ้ำไม่เกิดใบเบิกซ้ำ', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0004', qty: 5 }]);
  S.issueNow(s, 'u-eng');
  assert.throws(() => S.issueNow(s, 'u-eng'), /กรอกสินค้าและจำนวนให้ครบ/); // ตะกร้าถูกล้างแล้ว
  assert.equal(s.reqs.length, 2);
});

test('เดโม: จำลองจ่ายไม่สำเร็จ = pick_failed กันของไว้ให้', () => {
  const s = SM.seed(); s.settings.demoPickFail = true; fill(s, [{ productId: 'P-0004', qty: 5 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.deepEqual([r.outcome, r.req.lines[0].issued, r.req.lines[0].reserved], ['pick_failed', 0, 5]);
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 25);
  assert.equal(s.settings.demoPickFail, false);                         // ใช้ครั้งเดียว
});

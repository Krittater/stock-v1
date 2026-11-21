const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js'); require('../js/domain/returns.js'); require('../js/domain/jobs.js');
const S = SM.store;
const YY = new Date().toISOString().slice(2, 4);
const line = (o) => ({ productId: 'P-0007', qty: 5, issued: 0, reserved: 0, returned: 0, single: false, cuts: [], ...o });
const addReq = (s, id, status, lines, jobId = 'J-25-010', whId = 'wh-main') =>
  s.reqs.push({ id, userId: 'u-eng', whId, jobId, note: '', status, at: '2026-11-10T09:00:00', lines });

test('JB-AC1 สร้างงาน: รหัส J-YY-NNN เจ้าของ = ผู้สร้าง เปิดอยู่ ลงประวัติ', () => {
  const s = SM.seed();
  const j = S.createJob(s, { name: 'ติดตั้งแอร์ ห้องประชุม' }, 'u-eng');
  assert.equal(j.id, `J-${YY}-001`);
  assert.deepEqual([j.ownerId, j.open, j.closedAt, j.start], ['u-eng', true, null, new Date().toISOString().slice(0, 10)]);
  assert.equal(S.createJob(s, { name: 'งานสอง' }, 'u-eng').id, `J-${YY}-002`);
  assert.ok(s.audit.some(a => a.ref === j.id && a.userId === 'u-eng'));
});

test('JB-AC1 รันเลขต่อปี ไม่ชนกับ seed (J-25-010 ไม่กระทบปี 26)', () => {
  const s = SM.seed();
  s.jobs.push({ id: `J-${YY}-007`, name: 'x1', open: true });
  assert.equal(S.createJob(s, { name: 'งานใหม่' }, 'u-eng').id, `J-${YY}-008`);
});

test('JB-AC2 ชื่อคล้ายเตือน ≥45% รวมงานปิดแล้ว ไม่บล็อกการบันทึก', () => {
  const s = SM.seed();
  const r = S.similarJobs(s, 'ซ่อมบำรุงประจำปี 2');
  assert.equal(r[0].job.id, 'J-25-002'); assert.ok(r[0].pct >= 45);
  s.jobs.find(j => j.id === 'J-25-002').open = false;
  assert.equal(S.similarJobs(s, 'ซ่อมบำรุงประจำปี 2')[0].job.id, 'J-25-002');
  assert.deepEqual(S.similarJobs(s, 'ab'), []);
  assert.ok(S.createJob(s, { name: 'ซ่อมบำรุงประจำปี 2' }, 'u-eng').id);
});

test('JB-AC3 ชื่อว่างสร้างไม่ได้', () => {
  assert.throws(() => S.createJob(SM.seed(), { name: '   ' }, 'u-eng'), /กรุณาระบุชื่องาน/);
});

test('JB-G5 ชื่อซ้ำตรงตัว (ไม่สนตัวพิมพ์/ช่องว่าง) และวันที่ผิด', () => {
  const s = SM.seed();
  assert.throws(() => S.createJob(s, { name: '  ซ่อมบำรุง  ประจำปี ' }, 'u-eng'), /^Error: มีงานชื่อนี้แล้ว: J-25-002$/);
  assert.throws(() => S.createJob(s, { name: 'ใหม่', start: '2026-11-10', due: '2026-11-09' }, 'u-eng'), /กำหนดเสร็จต้องไม่ก่อนวันเริ่ม/);
  const j = S.createJob(s, { name: 'ใหม่', start: '2026-11-10', due: '2026-11-10' }, 'u-eng');
  assert.throws(() => S.updateJob(s, j.id, { due: '2026-11-01' }, 'u-eng'), /กำหนดเสร็จต้องไม่ก่อนวันเริ่ม/);
  assert.throws(() => S.updateJob(s, j.id, { name: 'ไซต์งาน A เฟส 2' }, 'u-eng'), /มีงานชื่อนี้แล้ว: J-25-010/);
  assert.equal(S.updateJob(s, j.id, { name: 'ใหม่', site: 'ระยอง' }, 'u-eng').site, 'ระยอง');   // ชื่อตัวเองไม่ถือว่าซ้ำ
});

test('JB-AC4 มีใบเบิกจ่ายบางส่วน → ปิดงานไม่ได้ ข้อความมีเลขใบ งานยังเปิด', () => {
  const s = SM.seed();
  addReq(s, 'REQ-690020', 'partial', [line({ issued: 2 })]);
  assert.deepEqual(S.openReqsOf(s, 'J-25-010').map(r => r.id), ['REQ-690020']);
  assert.throws(() => S.closeJob(s, 'J-25-010', 'u-store'), /^Error: ยังมีใบเบิกที่ไม่ปิด REQ-690020 — ปิดหรือยกเลิกก่อนปิดงาน$/);
  assert.equal(s.jobs.find(j => j.id === 'J-25-010').open, true);
});

test('JB-AC5 ปิดใบค้างแล้วปิดงานได้ มีวันปิด/กำหนดเสร็จ หายจากชิปงานล่าสุด ลงประวัติคนปิด', () => {
  const s = SM.seed();
  addReq(s, 'REQ-690020', 'partial', [line({ issued: 2 })]);
  S.closeReq(s, 'REQ-690020', 'u-store');
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(S.recentJobs(s, 'u-eng').some(j => j.id === 'J-25-010'));
  const j = S.closeJob(s, 'J-25-010', 'u-store');
  assert.deepEqual([j.open, j.closedAt, j.due], [false, today, today]);
  assert.ok(!S.recentJobs(s, 'u-eng').some(x => x.id === 'J-25-010'));
  assert.ok(s.audit.some(a => a.action === 'job-close' && a.ref === 'J-25-010' && a.userId === 'u-store'));
  s.jobs.find(x => x.id === 'J-25-002').due = '2026-12-31';
  assert.equal(S.closeJob(s, 'J-25-002', 'u-store').due, '2026-12-31');
});

test('JB-AC6 เบิกเข้างานที่ปิดแล้วถูกปฏิเสธ แต่คืนของใบเดิมยังได้', () => {
  const s = SM.seed();
  addReq(s, 'REQ-690020', 'issued', [line({ issued: 5 })]);
  S.closeJob(s, 'J-25-010', 'u-store');
  Object.assign(s.cart, { lines: [{ productId: 'P-0007', qty: 1 }], whId: 'wh-main', jobId: 'J-25-010', note: '' });
  assert.throws(() => S.issueNow(s, 'u-eng'), /^Error: งาน J-25-010 ปิดไปแล้ว เบิกเพิ่มไม่ได้ \(เปิดงานอีกครั้งที่หน้างาน\)$/);
  S.returnItems(s, { reqId: 'REQ-690020', whId: 'wh-main', shelf: 'ทั่วไป', lines: [{ productId: 'P-0007', qty: 2, condition: 'ok' }] }, 'u-eng');
  assert.equal(s.reqs.find(r => r.id === 'REQ-690020').lines[0].returned, 2);
});

test('JB-AC7 เปิดงานอีกครั้ง ลงประวัติ และเบิกได้อีก', () => {
  const s = SM.seed();
  S.closeJob(s, 'J-25-010', 'u-store');
  const j = S.reopenJob(s, 'J-25-010', 'u-store');
  assert.deepEqual([j.open, j.closedAt], [true, null]);
  assert.ok(s.audit.some(a => a.action === 'job-reopen' && a.ref === 'J-25-010'));
  assert.ok(S.recentJobs(s, 'u-eng').some(x => x.id === 'J-25-010'));
});

test('JB-AC8 ยอดใช้ของงาน เบิก 10 คืน 3 ใช้จริง 7', () => {
  const s = SM.seed();
  addReq(s, 'REQ-690020', 'issued', [line({ qty: 10, issued: 10, returned: 3 })]);
  const u = S.jobUsage(s, 'J-25-010').find(x => x.productId === 'P-0007');
  assert.deepEqual([u.issued, u.returned, u.used], [10, 3, 7]);
});

test('JB-AC9 closeJobCheck: ของยังไม่คืน + PR ค้าง; cancelPRs ปิด PR / false คง PR', () => {
  const mk = () => {
    const s = SM.seed();
    addReq(s, 'REQ-690020', 'issued', [line({ qty: 10, issued: 10, returned: 3 })]);
    addReq(s, 'REQ-690021', 'waiting', [line({ productId: 'P-0004' })]);
    s.prs.push({ id: 'PR-1', reqId: 'REQ-690021', productId: 'P-0004', whId: 'wh-main', qty: 5, received: 0, status: 'open', at: 'x' },
      { id: 'PR-2', reqId: 'REQ-690021', productId: 'P-0004', whId: 'wh-main', qty: 5, received: 2, status: 'open', at: 'x' },
      { id: 'PR-3', reqId: 'REQ-690021', productId: 'P-0004', whId: 'wh-main', qty: 5, received: 5, status: 'done', at: 'x' });
    return s;
  };
  const s = mk();
  assert.deepEqual(S.closeJobCheck(s, 'J-25-010'), { openReqs: ['REQ-690021'], openPRs: ['PR-1'],
    unreturned: [{ productId: 'P-0004', qty: 5 }, { productId: 'P-0009', qty: 2 }, { productId: 'P-0007', qty: 7 }] });
  S.cancelReq(s, 'REQ-690021', 'u-store');
  assert.deepEqual(s.prs.map(p => p.status), ['cancelled', 'open', 'done']);
  const s2 = mk();
  S.cancelReq(s2, 'REQ-690021', 'u-store', { cancelPRs: false });
  assert.equal(S.closeJobCheck(s2, 'J-25-010').openPRs[0], 'PR-1');
  S.closeJob(s2, 'J-25-010', 'u-store', { cancelPRs: false });
  assert.equal(s2.prs[0].status, 'open');
  const s3 = mk(); s3.reqs.find(r => r.id === 'REQ-690021').status = 'issued';
  S.closeJob(s3, 'J-25-010', 'u-store');
  assert.deepEqual(s3.prs.map(p => p.status), ['cancelled', 'open', 'done']);
});

test('closeReq ปล่อยของที่กันไว้ ยอดพร้อมเบิกเพิ่ม และส่งต่อให้ใบที่รออยู่', () => {
  const s = SM.seed();
  addReq(s, 'REQ-690020', 'partial', [line({ qty: 10, issued: 2, reserved: 8 })]);
  const before = S.available(s, 'P-0007', 'wh-main');
  addReq(s, 'REQ-690021', 'waiting', [line({ qty: 3 })], 'J-25-002');
  S.closeReq(s, 'REQ-690020', 'u-store');
  const r = s.reqs.find(x => x.id === 'REQ-690020');
  assert.deepEqual([r.status, r.lines[0].reserved], ['closed', 0]);
  assert.equal(s.reqs.find(x => x.id === 'REQ-690021').status, 'ready');   // ได้ของที่ปล่อย
  assert.equal(S.available(s, 'P-0007', 'wh-main'), before + 5);
  assert.throws(() => S.closeReq(s, 'REQ-690020', 'u-store'), /^Error: ใบนี้ปิดไม่ได้$/);
});

test('cancelReq: ใบที่จ่ายแล้วยกเลิกไม่ได้ ใบรอยกเลิกได้', () => {
  const s = SM.seed();
  addReq(s, 'REQ-690020', 'partial', [line({ qty: 2, issued: 2 })]);
  addReq(s, 'REQ-690021', 'ready', [line({ reserved: 5 })]);
  assert.throws(() => S.cancelReq(s, 'REQ-690020', 'u-store'), /^Error: ใบนี้ยกเลิกไม่ได้$/);
  const before = S.available(s, 'P-0007', 'wh-main');
  S.cancelReq(s, 'REQ-690021', 'u-store');
  assert.equal(s.reqs.find(r => r.id === 'REQ-690021').status, 'cancelled');
  assert.equal(S.available(s, 'P-0007', 'wh-main'), before + 5);
  assert.throws(() => S.cancelReq(s, 'REQ-690006', 'u-store'), /ใบนี้ยกเลิกไม่ได้/);
});

test('cloneJob คัดลอก ลูกค้า ไซต์ ผู้รับผิดชอบ + " (ใหม่)"', () => {
  const s = SM.seed();
  S.updateJob(s, 'J-25-010', { site: 'ระยอง' }, 'u-eng');
  const c = S.cloneJob(s, 'J-25-010', 'u-store');
  assert.deepEqual([c.name, c.customer, c.site, c.ownerId, c.open], ['ไซต์งาน A เฟส 2 (ใหม่)', 'บจก. มาบตาพุด เคมิคอล', 'ระยอง', 'u-eng', true]);
});

test('closeReq รับใบ ready ที่จ่ายแล้วบางส่วน: ยกเลิก PR ตามค่าเริ่ม / cancelPRs:false คง PR', () => {
  const mk = () => {
    const s = SM.seed();
    addReq(s, 'REQ-690020', 'ready', [line({ qty: 10, issued: 4, reserved: 6 })]);
    s.prs.push({ id: 'PR-1', reqId: 'REQ-690020', productId: 'P-0007', whId: 'wh-main', qty: 5, received: 0, status: 'open', at: 'x' });
    return s;
  };
  const s = mk();
  S.closeReq(s, 'REQ-690020', 'u-store');
  assert.deepEqual([s.reqs.find(r => r.id === 'REQ-690020').status, s.prs[0].status], ['closed', 'cancelled']);
  const s2 = mk();
  S.closeReq(s2, 'REQ-690020', 'u-store', { cancelPRs: false });
  assert.equal(s2.prs[0].status, 'open');
  const s3 = mk(); s3.reqs[s3.reqs.length - 1].lines[0].issued = 0;
  assert.throws(() => S.closeReq(s3, 'REQ-690020', 'u-store'), /^Error: ใบนี้ปิดไม่ได้$/);
});

test('nextJobId ตรงกับรหัสที่ createJob ออกให้จริง', () => {
  const s = SM.seed();
  assert.equal(S.nextJobId(s), `J-${YY}-001`);
  const j = S.createJob(s, { name: 'งานแรก' }, 'u-eng');
  assert.equal(j.id, `J-${YY}-001`); assert.equal(S.nextJobId(s), `J-${YY}-002`);
});

test('jobUsageCsv: BOM นำหน้า หัวคอลัมน์ครบ ภาษาไทยไม่เพี้ยน และครอบ "" ให้ช่องที่มี , หรือ "', () => {
  const s = SM.seed();
  const csv = S.jobUsageCsv(s, 'J-25-010');
  assert.ok(csv.startsWith('\ufeffสินค้า,รหัส,เบิก,คืน,ของเสีย,ใช้จริง,หน่วย\r\n'));
  assert.deepEqual(Buffer.from(csv).subarray(0, 3), Buffer.from([0xEF, 0xBB, 0xBF]));
  const u = S.jobUsage(s, 'J-25-010')[0], p = s.products.find(x => x.id === u.productId);
  assert.ok(csv.includes(`${p.id},${u.issued},${u.returned},${u.scrapped},${u.used},${p.unit}`));
  p.name = 'สาย "A", 2 แกน';
  assert.ok(S.jobUsageCsv(s, 'J-25-010').includes('"สาย ""A"", 2 แกน",'));
});

test('canCloseReq/canCancelReq ตรงกับที่ closeReq/cancelReq ยอมให้ทำ', () => {
  const s = SM.seed();
  addReq(s, 'REQ-690030', 'ready', [line({ issued: 2 })]); addReq(s, 'REQ-690031', 'waiting', [line()]);
  const r = (id) => s.reqs.find(x => x.id === id);
  assert.deepEqual([S.canCloseReq(r('REQ-690030')), S.canCancelReq(r('REQ-690030'))], [true, false]);
  assert.deepEqual([S.canCloseReq(r('REQ-690031')), S.canCancelReq(r('REQ-690031'))], [false, true]);
  assert.deepEqual([S.canCloseReq(r('REQ-690006')), S.canCancelReq(r('REQ-690006'))], [false, false]);
});

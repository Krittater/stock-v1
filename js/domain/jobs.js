var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// งาน: สร้าง/แก้ · ปิด (ตรวจใบเบิกค้าง ของยังไม่คืน รายการต้องซื้อค้าง) · เปิดใหม่ · เปิดงานใหม่จากงานเดิม · ปิด/ยกเลิกใบเบิก
(function () {
  const S = SM.store;
  const { reserveForWaiting, now, norm, similarity, round2 } = S._;
  const byId = (list, id) => list.find(x => x.id === id);
  const today = () => now().slice(0, 10);
  // ponytail: seed ใช้ pending_approval ส่วน brief เรียก pending จึงรับทั้งคู่
  const OPEN = ['pending', 'pending_approval', 'waiting', 'partial', 'ready', 'pick_failed'];

  S.similarJobs = function (state, name) {
    const n = norm(name);
    if (n.replace(/ /g, '').length < 3) return [];
    return state.jobs.map(job => ({ job, pct: Math.round(similarity(job.name, n) * 100) })).filter(x => x.pct >= 45).sort((a, b) => b.pct - a.pct);
  };

  const nextId = (state, yy) => {
    const max = Math.max(0, ...state.jobs.filter(j => j.id.startsWith(`J-${yy}-`)).map(j => Number(j.id.split('-')[2]) || 0));
    return `J-${yy}-${String(max + 1).padStart(3, '0')}`;
  };

  const same = (a, b) => norm(a).replace(/ /g, '') === norm(b).replace(/ /g, '');
  // ตรวจชื่อ/วันที่ (ใช้ทั้งสร้างและแก้) ; selfId = งานที่กำลังแก้ ไม่นับเป็นชื่อซ้ำ
  function check(state, f, selfId) {
    if (!f.name) throw new Error('กรุณาระบุชื่องาน');
    const dup = state.jobs.find(j => j.id !== selfId && same(j.name, f.name));
    if (dup) throw new Error(`มีงานชื่อนี้แล้ว: ${dup.id}`);
    if (f.due && f.start && f.due < f.start) throw new Error('กำหนดเสร็จต้องไม่ก่อนวันเริ่ม');
  }
  const clean = (o) => { const r = {}; for (const k of ['name', 'customer', 'site', 'note']) if (k in o) r[k] = String(o[k] ?? '').trim(); return r; };

  S.createJob = function (state, input, userId) {
    const f = { ...clean(input), ownerId: input.ownerId || userId, start: input.start || today(), due: input.due || null };
    check(state, f);
    const job = { id: nextId(state, now().slice(2, 4)), name: f.name, customer: f.customer || '', open: true, ownerId: f.ownerId,
      site: f.site || '', start: f.start, due: f.due, closedAt: null, note: f.note || '' };
    state.jobs.push(job);
    S.log(state, userId, 'job-create', job.id, `เปิดงาน ${job.id} ${job.name}`);
    return job;
  };

  S.updateJob = function (state, id, patch, userId) {
    const job = byId(state.jobs, id);
    if (!job) throw new Error('ไม่พบงาน');
    const f = { ...job, ...clean(patch) };
    for (const k of ['ownerId', 'start', 'due']) if (k in patch) f[k] = patch[k] || (k === 'ownerId' ? job.ownerId : null);
    check(state, f, id);
    Object.assign(job, { name: f.name, customer: f.customer, site: f.site, note: f.note, ownerId: f.ownerId, start: f.start, due: f.due });
    S.log(state, userId, 'job-update', id, `แก้ไขงาน ${id} ${job.name}`);
    return job;
  };

  S.openReqsOf = (state, jobId) => state.reqs.filter(r => r.jobId === jobId && OPEN.includes(r.status));

  const openPRsOf = (state, reqIds) => state.prs.filter(p => reqIds.includes(p.reqId) && p.status === 'open' && p.received === 0);
  const reqIdsOf = (state, jobId) => state.reqs.filter(r => r.jobId === jobId).map(r => r.id);

  S.closeJobCheck = function (state, jobId) {
    return {
      openReqs: S.openReqsOf(state, jobId).map(r => r.id),
      unreturned: S.jobUsage(state, jobId).map(u => ({ productId: u.productId, qty: round2(u.issued - u.returned) })).filter(u => u.qty > 0),
      openPRs: openPRsOf(state, reqIdsOf(state, jobId)).map(p => p.id),
    };
  };

  const cancelPRsOf = (state, reqIds, userId, why) => {
    for (const p of openPRsOf(state, reqIds)) { p.status = 'cancelled'; S.log(state, userId, 'pr-cancel', p.id, `ยกเลิกรายการต้องซื้อ ${p.id} (${why})`); }
  };

  S.closeJob = function (state, jobId, userId, { cancelPRs = true } = {}) {
    const job = byId(state.jobs, jobId);
    if (!job) throw new Error('ไม่พบงาน');
    const open = S.openReqsOf(state, jobId).map(r => r.id);
    if (open.length) throw new Error(`ยังมีใบเบิกที่ไม่ปิด ${open.join(', ')} — ปิดหรือยกเลิกก่อนปิดงาน`);
    if (cancelPRs) cancelPRsOf(state, reqIdsOf(state, jobId), userId, `ปิดงาน ${jobId}`);
    job.open = false; job.closedAt = today(); if (!job.due) job.due = job.closedAt;
    S.log(state, userId, 'job-close', jobId, `ปิดงาน ${jobId} ${job.name}`);
    return job;
  };

  S.reopenJob = function (state, jobId, userId) {
    const job = byId(state.jobs, jobId);
    if (!job) throw new Error('ไม่พบงาน');
    job.open = true; job.closedAt = null;
    S.log(state, userId, 'job-reopen', jobId, `เปิดงานอีกครั้ง ${jobId} ${job.name}`);
    return job;
  };

  S.cloneJob = function (state, jobId, userId) {
    const j = byId(state.jobs, jobId);
    if (!j) throw new Error('ไม่พบงาน');
    return S.createJob(state, { name: j.name + ' (ใหม่)', customer: j.customer, site: j.site, ownerId: j.ownerId }, userId);
  };

  // ปล่อยของที่กันไว้ แล้วให้ใบเบิกอื่นที่รออยู่ได้ของต่อ
  function finish(state, req, status, userId, cancelPRs, verb) {
    const touched = [...new Set(req.lines.filter(l => l.reserved > 0).map(l => l.productId))];
    for (const l of req.lines) l.reserved = 0;
    req.status = status;
    if (cancelPRs) cancelPRsOf(state, [req.id], userId, `${verb} ${req.id}`);
    for (const pid of touched) reserveForWaiting(state, pid, req.whId);
    S.log(state, userId, 'req-' + status, req.id, `${verb} ${req.id}`);
    return req;
  }

  S.closeReq = function (state, reqId, userId, { cancelPRs = true } = {}) {
    const req = byId(state.reqs, reqId);
    if (!req || !OPEN.includes(req.status) || !req.lines.some(l => l.issued > 0)) throw new Error('ใบนี้ปิดไม่ได้');
    return finish(state, req, 'closed', userId, cancelPRs, 'ปิดใบเบิก');
  };

  S.cancelReq = function (state, reqId, userId, { cancelPRs = true } = {}) {
    const req = byId(state.reqs, reqId);
    if (!req || !OPEN.includes(req.status) || req.lines.some(l => l.issued > 0)) throw new Error('ใบนี้ยกเลิกไม่ได้');
    return finish(state, req, 'cancelled', userId, cancelPRs, 'ยกเลิกใบเบิก');
  };
})();

var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// ยอดตั้งต้น / ของที่เจอเพิ่ม: ขั้นอนุมัติ (store → head → done) · รายการรอ · นำเข้า CSV (spec 5B)
(function () {
  const S = SM.store, T = SM.T;
  const { stockIn, openWh, reserveForWaiting, ensurePRs, docId, usersWith, round2 } = S._;
  const byId = (list, id) => list.find(x => x.id === id);
  const role = (state, userId) => byId(state.users, userId).role;
  const pending = (c) => c.stage === 'store' || c.stage === 'head';
  const ccQty = (cc) => cc.rollLengths ? round2(cc.rollLengths.reduce((a, n) => a + Number(n), 0)) : cc.qty;
  const whName = (state, id) => byId(state.warehouses, id).name;

  S.pendingOpening = (state, productId, whId) =>
    round2(state.ccs.filter(c => pending(c) && c.productId === productId && c.whId === whId).reduce((a, c) => a + ccQty(c), 0));

  // ตรวจครบแล้วคืนตัวลงยอด (ยังไม่ลง) · ชั้นรอตรวจลงยอดตั้งต้นไม่ได้ (OS-G3: ชั้นอื่นที่เปิดใช้เลือกได้)
  function plan(state, p, whId, shelf, data) {
    const wh = openWh(state, whId);
    const sh = wh.shelves.find(x => x.code === shelf);
    if (sh && sh.qc) throw new Error(`ชั้น ${shelf} เป็นชั้นรอตรวจ ลงยอดตั้งต้นไม่ได้`);
    return stockIn(state, p, whId, { ...data, shelf });
  }

  S.submitOpening = function (state, { productId, whId, shelf = 'ทั่วไป', qty, rollLengths, kind = 'opening' }, userId) {
    const p = byId(state.products, productId);
    if (!p || p.active === false) throw new Error('ไม่พบสินค้า');
    const data = { qty: p.isRoll ? null : qty, rollLengths: p.isRoll ? (rollLengths || []).map(Number) : null };
    const incoming = plan(state, p, whId, shelf, data);
    const me = role(state, userId);
    const label = kind === 'found' ? 'ของที่เจอเพิ่ม' : 'ยอดตั้งต้น';
    // Store/หัวหน้าลงยอดเองได้ · เว้นสินค้าต้องอนุมัติที่ Store ส่ง ต้องรอหัวหน้า (หัวหน้าส่ง = อนุมัติเอง)
    if (me === 'head' || (me === 'store' && !p.needsApproval)) {
      incoming.apply();
      reserveForWaiting(state, p.id, whId);
      S.log(state, userId, 'opening-in', p.id, `${label} ${p.name} ${incoming.text} ที่${whName(state, whId)} ${shelf}`);
      return { cc: null, toast: T.N21b(incoming.text) };
    }
    const stage = me === 'store' ? 'head' : 'store';
    const cc = { id: docId('CC-', state.seq.cc++, 4), productId, whId, shelf, ...data, byUserId: userId, stage, reason: '', kind, text: incoming.text };
    state.ccs.push(cc);
    S.log(state, userId, 'opening-submit', cc.id, `ส่ง${label} ${p.name} ${incoming.text} ที่${whName(state, whId)} ${shelf} (${cc.id})`);
    S.notify(state, usersWith(state, stage === 'head' ? 'head' : 'store'), 'info',
      T.N71(cc.id, p.name, incoming.text, whName(state, whId), kind, stage), '#/approvals');
    return { cc, toast: stage === 'head' ? T.N22h(cc.id) : T.N22(cc.id) };
  };

  S.confirmCC = function (state, ccId, userId, ok, reason = '') {
    const cc = byId(state.ccs, ccId);
    if (!cc || !pending(cc)) throw new Error('รายการนี้ไม่ได้รอยืนยันยอด');
    const me = role(state, userId);
    if (cc.stage === 'head' ? me !== 'head' : me === 'engineer') throw new Error(T.FORBIDDEN);
    const p = byId(state.products, cc.productId);
    const stage = cc.stage;
    if (!ok) {
      if (!String(reason).trim()) throw new Error('กรุณาระบุเหตุผล');
      cc.stage = 'rejected'; cc.reason = reason.trim();
      // ponytail: ทำตามคำแนะนำ BA — ใบเบิกที่รอยอดนี้อยู่ได้รายการต้องซื้อ
      const waiting = ensurePRs(state, p.id, cc.whId);
      S.log(state, userId, 'opening-reject', cc.id, `ไม่รับยอด ${p.name} (${cc.id}): ${cc.reason}`);
      S.notify(state, [cc.byUserId], 'warn', T.N73(p.name, cc.reason, waiting, stage === 'head'));
      return cc;
    }
    if (stage === 'store' && p.needsApproval && me !== 'head') {   // Store ผ่านแล้ว รอหัวหน้าต่อ
      plan(state, p, cc.whId, cc.shelf, cc);                      // ตรวจก่อนส่งต่อ
      cc.stage = 'head';
      S.log(state, userId, 'opening-confirm', cc.id, `Store ยืนยันยอด ${cc.id} ส่งให้หัวหน้าอนุมัติ`);
      S.notify(state, usersWith(state, 'head'), 'info', T.N71(cc.id, p.name, cc.text, whName(state, cc.whId), cc.kind, 'head'), '#/approvals');
      return cc;
    }
    plan(state, p, cc.whId, cc.shelf, cc).apply();
    cc.stage = 'done';
    reserveForWaiting(state, p.id, cc.whId);
    ensurePRs(state, p.id, cc.whId);       // ใบที่ยอดนี้ไม่พอให้ ต้องไปอยู่ในรายการต้องซื้อ
    S.log(state, userId, 'opening-approve', cc.id, `${stage === 'head' ? 'หัวหน้าอนุมัติ' : 'Store ยืนยัน'}ยอด ${p.name} ${cc.text} (${cc.id}) เข้าคลัง`);
    S.notify(state, [cc.byUserId], 'ok', T.N72(p.name, cc.text, stage === 'head'));
    return cc;
  };

  // Q7b: Store เห็นแค่ยอดรอ Store ยืนยัน · หัวหน้าเห็นทุกเรื่อง · วิศวกรไม่มี
  S.approvalItems = function (state, userId) {
    const me = role(state, userId);
    if (me === 'head') return { reqs: state.reqs.filter(r => r.status === 'pending_approval'), ccs: state.ccs.filter(pending) };
    if (me === 'store') return { reqs: [], ccs: state.ccs.filter(c => c.stage === 'store') };
    return { reqs: [], ccs: [] };
  };

  S.setOpeningLock = function (state, on, userId) {
    if (role(state, userId) !== 'head') throw new Error(T.FORBIDDEN);
    state.settings.openingLocked = !!on;
    S.log(state, userId, 'opening-lock', 'settings', on ? 'ล็อกยอดยกมา' : 'ปลดล็อกยอดยกมา');
  };

  /* ---------- นำเข้า CSV ---------- */

  // อ่าน CSV: BOM, CRLF, ช่องในเครื่องหมายคำพูด (มี , หรือ "" ได้), ข้ามบรรทัดว่าง
  function csvRecords(text) {
    const recs = []; let rec = [], f = '', q = false;
    const t = text.replace(/^﻿/, '');
    const end = () => { rec.push(f); f = ''; if (rec.some(x => x.trim() !== '')) recs.push(rec); rec = []; };
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { rec.push(f); f = ''; }
      else if (c === '\n') end();
      else if (c !== '\r') f += c;
    }
    end();
    return recs;
  }

  const REQUIRED = ['code', 'warehouse', 'location', 'qty'];
  S.parseOpeningCsv = function (state, text) {
    const [head = [], ...body] = csvRecords(String(text));
    const col = {}; head.forEach((h, i) => { const k = h.trim().toLowerCase(); if (!(k in col)) col[k] = i; });
    const missing = REQUIRED.filter(k => !(k in col));
    if (missing.length) return { rows: [], error: `ไฟล์ต้องมีคอลัมน์ ${missing.join(', ')}` };
    const seenRoll = new Set(), seenKey = new Set();
    const rows = body.map((r, i) => {
      const get = (k) => (k in col ? (r[col[k]] || '').trim() : '');
      const row = { line: i + 2, code: get('code'), whId: null, shelf: get('location'), qty: null, rollNo: get('roll_no'), rollInitial: null, batch: get('batch'), errors: [] };
      const err = (m) => row.errors.push(m);
      const p = byId(state.products, row.code);
      if (!row.code) err('ไม่มีรหัสสินค้า'); else if (!p || p.active === false) err('ไม่พบรหัสสินค้าในระบบ (สร้างรหัสก่อน)');
      const wn = get('warehouse').toLowerCase();
      const wh = state.warehouses.find(w => w.id.toLowerCase() === wn || w.name.trim().toLowerCase() === wn);
      if (!wh) err('ไม่พบคลัง');
      else {
        row.whId = wh.id;
        if (wh.locked || wh.active === false) err(`${wh.name} ปิดใช้งานอยู่`);
        else if (!S.shelves(state, wh.id).includes(row.shelf)) err('ไม่พบตำแหน่ง');
      }
      const rawQty = get('qty'); row.qty = rawQty === '' ? null : Number(rawQty);
      if (p && p.isRoll) {
        if (!(row.qty > 0)) err('จำนวนไม่ถูกต้อง');
        if (!row.rollNo) err('สินค้าติดตามรายม้วนต้องมีเลขม้วน');
        else if (state.rolls.some(x => x.id === row.rollNo)) err('เลขม้วนซ้ำกับในระบบ');
        else if (seenRoll.has(row.rollNo)) err('ข้อมูลซ้ำในไฟล์');
        seenRoll.add(row.rollNo);
        const ri = get('roll_initial');
        if (ri !== '') { row.rollInitial = Number(ri); if (!(row.rollInitial > 0)) err('ความยาวเดิมของม้วนไม่ถูกต้อง'); }
      } else if (p) {
        const e = S.qtyError(p, row.qty);
        if (e) err(e === T.N06() ? 'จำนวนไม่ถูกต้อง' : e);
        const key = [row.code, row.whId, row.shelf].join('|');
        if (!e) { if (seenKey.has(key)) err('ข้อมูลซ้ำในไฟล์'); seenKey.add(key); }
      }
      return row;
    });
    return { rows };
  };

  S.validOpeningRows = (rows) => rows.filter(r => !r.errors.length);

  S.importOpening = function (state, rows, userId) {
    if (role(state, userId) !== 'head') throw new Error(T.FORBIDDEN);
    if (state.settings.openingLocked) throw new Error('ยอดยกมาถูกล็อกแล้ว — ตรวจสอบไฟล์ได้ แต่นำเข้าได้หลังปลดล็อก');
    if (!rows.length) throw new Error('ไม่มีแถวให้นำเข้า');
    if (rows.some(r => r.errors.length)) throw new Error('ตัดแถวที่ผิดก่อน');
    const taken = new Set(state.rolls.map(r => r.id));
    const jobs = rows.map(r => {      // ตรวจทุกแถวก่อน ถ้าแถวไหนพังยังไม่ลงอะไรเลย
      const p = byId(state.products, r.code);
      if (!p || p.active === false) throw new Error('ไม่พบสินค้า');
      if (!p.isRoll) return { p, whId: r.whId, inc: plan(state, p, r.whId, r.shelf, { qty: r.qty }) };
      if (taken.has(r.rollNo)) throw new Error('เลขม้วนซ้ำกับในระบบ');
      taken.add(r.rollNo);
      return { p, whId: r.whId, inc: plan(state, p, r.whId, r.shelf, { rollLengths: [r.qty], rollIds: [r.rollNo], initials: [r.rollInitial], batch: r.batch || undefined }) };
    });
    jobs.forEach(j => j.inc.apply());
    for (const k of new Set(jobs.map(j => j.p.id + '|' + j.whId))) reserveForWaiting(state, ...k.split('|'));
    S.log(state, userId, 'opening-import', 'import', `นำเข้ายอดยกมา ${rows.length} แถว`);
    return { count: rows.length };
  };
})();

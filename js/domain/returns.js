var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// คืนของ: เลือกสภาพ (ok/damaged/scrap) ชั้น ม้วนเดิม · ตรวจครบทุกบรรทัดก่อนแล้วค่อยลงยอด
(function () {
  const S = SM.store, T = SM.T, fmt = SM.fmtQty;
  const { stockIn, openWh, reserveForWaiting, docId, round2 } = S._;
  const byId = (list, id) => list.find(x => x.id === id);
  const left = (l) => round2(l.issued - l.returned);
  const blank = (q) => q === null || q === undefined || q === '';

  // ใบเบิกที่ยังคืนได้ (left > 0) เรียงใหม่สุดก่อน · วิศวกรเห็นเฉพาะใบของตัวเอง
  S.returnable = function (state, userId, q = '') {
    const me = byId(state.users, userId);
    const needle = q.trim().toLowerCase();
    return state.reqs
      .filter(r => me.role !== 'engineer' || r.userId === userId)
      .map(req => ({
        req, by: byId(state.users, req.userId),
        lines: req.lines.filter(l => left(l) > 0)
          .map(l => ({ productId: l.productId, issued: l.issued, returned: l.returned, left: left(l), cuts: l.cuts })),
      }))
      .filter(x => x.lines.length)
      .filter(x => {
        if (!needle) return true;
        const job = byId(state.jobs, x.req.jobId);
        const hay = [x.req.id, job && job.name, ...x.lines.map(l => { const p = byId(state.products, l.productId); return [p.name, p.brand, p.model].join(' '); })];
        return hay.some(h => (h || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => b.req.at.localeCompare(a.req.at) || b.req.id.localeCompare(a.req.id));
  };

  S.returnItems = function (state, { reqId, whId, shelf, note = '', lines }, userId) {
    const req = byId(state.reqs, reqId);
    if (!req) throw new Error('ไม่พบใบเบิก');
    const me = byId(state.users, userId);
    if (me.role === 'engineer' && req.userId !== userId) throw new Error(T.FORBIDDEN);
    const wh = byId(state.warehouses, whId || req.whId);
    if (!wh) throw new Error(T.N14.wh);
    if (wh.active === false) throw new Error(`${wh.name} ปิดใช้งานอยู่ — คืนของไม่ได้ (เปิดใช้อีกครั้งก่อน)`);
    openWh(state, wh.id);

    const todo = (lines || []).filter(l => !blank(l.qty));
    if (!todo.length) throw new Error('ยังไม่ได้กรอกจำนวนที่คืน');
    const sums = {};
    const items = todo.map(l => {
      const rl = req.lines.find(x => x.productId === l.productId);
      if (!rl) throw new Error('ไม่พบสินค้านี้ในใบเบิก');
      const p = byId(state.products, l.productId);
      const err = S.qtyError(p, l.qty);
      if (err) throw new Error(err);
      if (!['ok', 'damaged', 'scrap'].includes(l.condition)) throw new Error('เลือกสภาพของที่คืน');
      const qty = Number(l.qty);
      sums[p.id] = round2((sums[p.id] || 0) + qty);
      if (sums[p.id] > left(rl)) throw new Error(`${p.name} คืนได้ไม่เกิน ${fmt(left(rl), p.unit)} (ยอดที่เบิกไปหักที่คืนแล้ว)`);
      if (l.rollId && !rl.cuts.some(c => c.rollId === l.rollId)) throw new Error('เลือกได้เฉพาะม้วนที่ใบเบิกนี้ตัดไป');
      let at = null, incoming = null, fromRollId = null;
      if (l.condition === 'ok') {
        at = l.shelf || shelf;
        if (!at) throw new Error('ต้องระบุตำแหน่งจัดเก็บ');
        if (at === S.qcShelf(state, wh.id)) throw new Error('ของที่ใช้ได้เก็บที่ชั้นรอตรวจไม่ได้');
      } else if (l.condition === 'damaged') at = S.qcShelf(state, wh.id);
      if (at) {
        if (p.isRoll) fromRollId = l.rollId ?? (rl.cuts[0] && rl.cuts[0].rollId) ?? null;
        incoming = stockIn(state, p, wh.id, { qty, rollLengths: [qty], shelf: at, fromRollId }, true);
      }
      return { l, rl, p, qty, at, fromRollId, incoming };
    });

    const rec = { id: docId('RT-', state.seq.ret++, 4), reqId: req.id, whId: wh.id, byUserId: userId, at: S._.now(), note: String(note || '').trim(), lines: [] };
    for (const { l, rl, p, qty, at, fromRollId, incoming } of items) {
      const newRollId = incoming && p.isRoll ? docId('R-', state.seq.roll, 6) : null;
      if (incoming) incoming.apply();
      rl.returned = round2(rl.returned + qty);
      if (l.condition === 'scrap') rl.scrapped = round2((rl.scrapped || 0) + qty);
      rec.lines.push({ productId: p.id, qty, condition: l.condition, shelf: at, newRollId, fromRollId: newRollId ? fromRollId : null,
        photo: l.condition === 'damaged' && l.photo ? l.photo : null });
    }
    state.returns.push(rec);
    for (const id of new Set(items.map(i => i.p.id))) reserveForWaiting(state, id, wh.id);
    S.log(state, userId, 'return', rec.id, `คืนของ ${req.id} ${rec.lines.length} รายการ เข้า${wh.name}`);
    return rec;
  };

  // ยอดใช้จริงของงาน: เบิก − (คืน − ของเสีย) (Q8)
  S.jobUsage = function (state, jobId) {
    const out = {};
    for (const req of state.reqs.filter(r => r.jobId === jobId))
      for (const l of req.lines) {
        const u = out[l.productId] ||= { productId: l.productId, issued: 0, returned: 0, scrapped: 0 };
        u.issued = round2(u.issued + l.issued); u.returned = round2(u.returned + l.returned); u.scrapped = round2(u.scrapped + (l.scrapped || 0));
      }
    return Object.values(out).map(u => ({ ...u, used: round2(u.issued - (u.returned - u.scrapped)) }));
  };

  // เศษสายสั้นกว่าขั้นต่ำที่เก็บ (Q9) ใช้กับสายม้วนเท่านั้น
  S.returnHint = function (state, productId, qty) {
    const p = byId(state.products, productId);
    if (!p.isRoll) return { short: false, scrapMin: 0 };
    return { short: Number(qty) < p.scrapMin, scrapMin: p.scrapMin };
  };
})();

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
        lines: [...new Set(req.lines.map(l => l.productId))].map(pid => {
          const ls = req.lines.filter(l => l.productId === pid);
          return { productId: pid, issued: round2(ls.reduce((a, l) => a + l.issued, 0)), returned: round2(ls.reduce((a, l) => a + l.returned, 0)),
            left: round2(ls.reduce((a, l) => a + left(l), 0)), cuts: ls.flatMap(l => l.cuts) };
        }).filter(l => l.left > 0),
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
      const rls = req.lines.filter(x => x.productId === l.productId);
      if (!rls.length) throw new Error('ไม่พบสินค้านี้ในใบเบิก');
      const p = byId(state.products, l.productId);
      const err = S.qtyError(p, l.qty);
      if (err) throw new Error(err);
      if (!['ok', 'damaged', 'scrap'].includes(l.condition)) throw new Error('เลือกสภาพของที่คืน');
      const qty = Number(l.qty);
      sums[p.id] = round2((sums[p.id] || 0) + qty);
      const max = round2(rls.reduce((a, x) => a + left(x), 0)), cuts = rls.flatMap(x => x.cuts);
      if (sums[p.id] > max) throw new Error(`${p.name} คืนได้ไม่เกิน ${fmt(max, p.unit)} (ยอดที่เบิกไปหักที่คืนแล้ว)`);
      if (l.rollId && !cuts.some(c => c.rollId === l.rollId)) throw new Error('เลือกได้เฉพาะม้วนที่ใบเบิกนี้ตัดไป');
      let at = null, incoming = null, fromRollId = null;
      if (l.condition === 'ok') {
        at = l.shelf || shelf;
        if (!at) throw new Error('ต้องระบุตำแหน่งจัดเก็บ');
        if (at === S.qcShelf(state, wh.id)) throw new Error('ของที่ใช้ได้เก็บที่ชั้นรอตรวจไม่ได้');
      } else if (l.condition === 'damaged') at = S.qcShelf(state, wh.id);
      if (at) {
        if (p.isRoll) fromRollId = l.rollId ?? (cuts[0] && cuts[0].rollId) ?? null;
        incoming = stockIn(state, p, wh.id, { qty, rollLengths: [qty], shelf: at, fromRollId }, true);
      }
      return { l, rls, p, qty, at, fromRollId, incoming };
    });

    const rec = { id: docId('RT-', state.seq.ret++, 4), reqId: req.id, whId: wh.id, byUserId: userId, at: S._.now(), note: String(note || '').trim(), lines: [] };
    for (const { l, rls, p, qty, at, fromRollId, incoming } of items) {
      const newRollId = incoming && p.isRoll ? docId('R-', state.seq.roll, 6) : null;
      if (incoming) incoming.apply();
      for (let rest = qty, i = 0; rest > 0 && i < rls.length; i++) {   // เติมทีละบรรทัดไม่เกินยอดคงเหลือของบรรทัดนั้น
        const take = Math.min(rest, left(rls[i]));
        rls[i].returned = round2(rls[i].returned + take);
        if (l.condition === 'scrap') rls[i].scrapped = round2((rls[i].scrapped || 0) + take);
        rest = round2(rest - take);
      }
      rec.lines.push({ productId: p.id, qty, condition: l.condition, shelf: at, newRollId, fromRollId: newRollId ? fromRollId : null,
        photo: l.condition === 'damaged' && l.photo ? l.photo : null });
    }
    state.returns.push(rec);
    for (const id of new Set(items.map(i => i.p.id))) reserveForWaiting(state, id, wh.id);
    S.log(state, userId, 'return', rec.id, `คืนของ ${req.id} ${rec.lines.length} รายการ เข้า${wh.name}`);
    return rec;
  };

  const storeOnly = (state, userId) => { if (byId(state.users, userId).role === 'engineer') throw new Error(T.FORBIDDEN); };
  const USED = 'ของจากการคืนนี้ถูกใช้ไปแล้ว กลับรายการไม่ได้';

  // คืนของที่ไม่มีใบเบิก (Store/หัวหน้า) · สายม้วน qty = ความยาว → ได้ม้วนใหม่ · jobId บันทึกในใบคืนเท่านั้น
  S.returnLoose = function (state, { productId, whId, shelf, qty, condition, reason, jobId = null }, userId) {
    storeOnly(state, userId);
    const why = String(reason || '').trim();
    if (!why) throw new Error('กรุณาระบุว่าของมาจากไหน');
    const p = byId(state.products, productId);
    if (!p) throw new Error('ไม่พบสินค้า');
    if (p.active === false) throw new Error(`${p.name} เลิกใช้แล้ว`);
    const wh = byId(state.warehouses, whId);
    if (!wh) throw new Error(T.N14.wh);
    if (wh.active === false) throw new Error(`${wh.name} ปิดใช้งานอยู่ — คืนของไม่ได้ (เปิดใช้อีกครั้งก่อน)`);
    openWh(state, wh.id);
    const err = S.qtyError(p, qty);
    if (err) throw new Error(err);
    if (!['ok', 'damaged', 'scrap'].includes(condition)) throw new Error('เลือกสภาพของที่คืน');
    const n = Number(qty);
    let at = null;
    if (condition === 'ok') {
      at = shelf;
      if (!at) throw new Error('ต้องระบุตำแหน่งจัดเก็บ');
      if (at === S.qcShelf(state, wh.id)) throw new Error('ของที่ใช้ได้เก็บที่ชั้นรอตรวจไม่ได้');
    } else if (condition === 'damaged') at = S.qcShelf(state, wh.id);
    const incoming = at ? stockIn(state, p, wh.id, { qty: n, rollLengths: [n], shelf: at }, true) : null;
    const newRollId = incoming && p.isRoll ? docId('R-', state.seq.roll, 6) : null;
    if (incoming) incoming.apply();
    const rec = { id: docId('RT-', state.seq.ret++, 4), reqId: null, whId: wh.id, byUserId: userId, at: S._.now(), note: '', reason: why, jobId: jobId || null,
      lines: [{ productId: p.id, qty: n, condition, shelf: at, newRollId, fromRollId: null, photo: null }] };
    state.returns.push(rec);
    if (condition === 'ok') reserveForWaiting(state, p.id, wh.id);
    S.log(state, userId, 'return', rec.id, `คืนของไม่มีใบเบิก ${p.name} ${fmt(n, p.unit)} (${why}) เข้า${wh.name}`);
    return rec;
  };

  // กลับรายการคืน (หัวหน้า) · ตรวจทุกอย่างก่อน แล้วค่อยถอน
  S.reverseReturn = function (state, returnId, userId) {
    if (byId(state.users, userId).role !== 'head') throw new Error(T.FORBIDDEN);
    const rec = byId(state.returns, returnId);
    if (!rec) throw new Error('ไม่พบรายการคืน');
    if (rec.reversedAt) throw new Error('รายการคืนนี้ถูกกลับรายการไปแล้ว');
    openWh(state, rec.whId);
    const qc = S.qcShelf(state, rec.whId);
    const rollIds = new Set(), rowCut = {}, okCut = {};
    const addOk = (pid, q) => { okCut[pid] = round2((okCut[pid] || 0) + q); };
    for (const l of rec.lines) {
      if (l.newRollId) {   // ม้วนใหม่ต้องยังอยู่ ยาวเท่าเดิม (ถ้าถูกตัดความยาวจะเปลี่ยน)
        const r = byId(state.rolls, l.newRollId);
        if (!r || r.length !== l.qty) throw new Error(USED);
        rollIds.add(r.id);
        if (r.shelf !== qc) addOk(l.productId, r.length);
      } else if (l.shelf) {
        const k = l.productId + '|' + l.shelf;
        rowCut[k] = round2((rowCut[k] || 0) + l.qty);
        if (l.shelf !== qc) addOk(l.productId, l.qty);
      }
    }
    for (const k in rowCut) {
      const [pid, shelf] = k.split('|');
      const row = state.stock.find(x => x.productId === pid && x.whId === rec.whId && x.shelf === shelf);
      if (!row || row.qty < rowCut[k]) throw new Error(USED);
    }
    for (const pid in okCut) if (round2(S.available(state, pid, rec.whId) - okCut[pid]) < 0) throw new Error(USED);
    // ลดยอดในใบเบิก: จำลองก่อน (ไล่บรรทัดตามลำดับเดิม) แล้วค่อยลงจริง
    const req = rec.reqId ? byId(state.reqs, rec.reqId) : null;
    const dec = [];
    if (req) {
      const ret = new Map(req.lines.map(x => [x, x.returned])), scr = new Map(req.lines.map(x => [x, x.scrapped || 0]));
      for (const l of rec.lines) {
        const scrap = l.condition === 'scrap';
        let rest = l.qty;
        for (const x of req.lines.filter(x => x.productId === l.productId)) {
          const take = Math.min(rest, scrap ? Math.min(ret.get(x), scr.get(x)) : ret.get(x));
          if (take <= 0) continue;
          ret.set(x, round2(ret.get(x) - take)); if (scrap) scr.set(x, round2(scr.get(x) - take));
          dec.push([x, take, scrap]); rest = round2(rest - take);
        }
        if (rest > 0) throw new Error(USED);
      }
    }
    state.rolls = state.rolls.filter(r => !rollIds.has(r.id));
    for (const k in rowCut) {
      const [pid, shelf] = k.split('|');
      const row = state.stock.find(x => x.productId === pid && x.whId === rec.whId && x.shelf === shelf);
      row.qty = round2(row.qty - rowCut[k]);
      if (row.qty <= 0) state.stock.splice(state.stock.indexOf(row), 1);
    }
    for (const [x, take, scrap] of dec) { x.returned = round2(x.returned - take); if (scrap) x.scrapped = round2((x.scrapped || 0) - take); }
    rec.reversedAt = S._.now(); rec.reversedBy = userId;
    S.log(state, userId, 'return-reverse', rec.id, `กลับรายการคืน ${rec.id}${rec.reqId ? ' ของ ' + rec.reqId : ''}`);
    return rec;
  };

  // ตัดสินของที่ชั้นรอตรวจ: เก็บเข้าชั้นปกติ (สายม้วน = ย้ายทั้งม้วน) หรือตัดทิ้ง
  S.qcDecide = function (state, { whId, productId, rollId, qty, decision, shelf, reason }, userId) {
    storeOnly(state, userId);
    const p = byId(state.products, productId);
    if (!p) throw new Error('ไม่พบสินค้า');
    const wh = openWh(state, whId);
    if (!['restock', 'scrap'].includes(decision)) throw new Error('เลือกว่าจะเก็บเข้าชั้นหรือตัดทิ้ง');
    const err = S.qtyError(p, qty);
    if (err) throw new Error(err);
    const n = Number(qty), qc = S.qcShelf(state, wh.id), why = String(reason || '').trim();
    const roll = rollId ? state.rolls.find(r => r.id === rollId && r.productId === p.id && r.whId === wh.id && r.shelf === qc) : null;
    if (rollId && !roll) throw new Error('ไม่พบม้วนนี้ที่ชั้นรอตรวจ');
    const row = rollId ? null : state.stock.find(x => x.productId === p.id && x.whId === wh.id && x.shelf === qc);
    const have = roll ? roll.length : row ? row.qty : 0;
    if (n > have) throw new Error(`ที่ชั้นรอตรวจมี ${p.name} แค่ ${fmt(have, p.unit)}`);
    let incoming = null;
    if (decision === 'restock') {
      if (!shelf) throw new Error('ต้องระบุตำแหน่งจัดเก็บ');
      if (shelf === qc) throw new Error('ของที่ใช้ได้เก็บที่ชั้นรอตรวจไม่ได้');
      if (!S.shelves(state, wh.id).includes(shelf)) throw new Error(`ที่วาง ${shelf} ปิดใช้งานอยู่ (เปิดใช้อีกครั้งก่อน)`);
      if (!roll) incoming = stockIn(state, p, wh.id, { qty: n, shelf }, true);
    } else if (!why) throw new Error('กรุณาระบุเหตุผลที่ตัดทิ้ง');
    const moved = roll && decision === 'restock' ? roll.length : n;
    if (decision === 'restock' && roll) roll.shelf = shelf;
    else if (roll) roll.length = round2(roll.length - n);
    else row.qty = round2(row.qty - n);
    if (incoming) incoming.apply();
    state.rolls = state.rolls.filter(r => r.length > 0);
    state.stock = state.stock.filter(x => x.qty > 0 || x.shelf !== qc);
    if (decision === 'restock') reserveForWaiting(state, p.id, wh.id);
    S.log(state, userId, 'qc-' + decision, rollId || p.id,
      decision === 'restock' ? `ชั้นรอตรวจ → ${shelf}: ${p.name} ${fmt(moved, p.unit)}` : `ตัดทิ้งจากชั้นรอตรวจ: ${p.name} ${fmt(n, p.unit)} (${why})`);
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

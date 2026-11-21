var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// ตรรกะทั้งหมดของ mockup: ฟังก์ชันรับ state แล้วอ่าน/แก้ state ตรง ๆ ไม่แตะ DOM (ทดสอบด้วย node --test)
(function () {
  const S = SM.store = {};
  const T = SM.T;
  const QC = (x) => x.shelf === 'QC';   // ของชั้นรอตรวจ ยังไม่นับเป็นยอดเบิกได้
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const round2 = (n) => Math.round(n * 100) / 100;
  const byId = (list, id) => list.find(x => x.id === id);
  const product = (state, id) => byId(state.products, id);
  const byId2 = byId;

  /* ---------- สินค้า: ค้นหา + ชิปสเปก ---------- */

  const TYPES = ['THW', 'VAF', 'VCT', 'NYY', 'IEC01', 'IEC53', 'CAT5E', 'CAT6', 'CV'];
  const COLORS = ['เขียว-เหลือง', 'ดำ', 'แดง', 'น้ำเงิน', 'ฟ้า', 'เหลือง', 'เขียว', 'ขาว', 'เทา', 'น้ำตาล'];
  const FACETS = [['type', 'ชนิด'], ['size', 'ขนาด (sq.mm)'], ['cores', 'แกน'], ['color', 'สี']];

  // อ่านสเปกจากชื่อ + รุ่น/ขนาด ผู้ใช้ไม่ต้องกรอกอะไรเพิ่ม
  S.cableFacets = function (p) {
    const text = p.name + ' ' + (p.model || '');
    const f = {};
    const type = TYPES.find(t => new RegExp('(^|[^A-Za-z0-9])' + t + '($|[^A-Za-z0-9])', 'i').test(text));
    if (type) f.type = type;
    const nxs = text.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*sq\.?\s*mm/i);
    const s = text.match(/(\d+(?:\.\d+)?)\s*sq\.?\s*mm/i);
    if (nxs) { f.cores = nxs[1]; f.size = nxs[2]; } else if (s) f.size = s[1];
    const color = COLORS.find(c => text.includes('สี' + c));
    if (color) f.color = color;
    return f;
  };

  S.isCableLike = (p) => !!p.isRoll && p.unit === 'm';

  S.totalStock = (state, productId) => ({
    qty: round2(sum(state.stock.filter(x => x.productId === productId && !QC(x)), x => x.qty)
      + sum(state.rolls.filter(r => r.productId === productId && !QC(r)), r => r.length)),
    rolls: state.rolls.filter(r => r.productId === productId && !QC(r)).length,
  });

  S.categories = (state) => [...new Set(state.products.map(p => p.category))];

  function matchBase(state, { q, category }) {
    const needle = (q || '').trim().toLowerCase();
    return state.products.filter(p =>
      (!category || p.category === category) &&
      (!needle || [p.name, p.brand, p.model, p.id].some(v => (v || '').toLowerCase().includes(needle))));
  }
  const matchFacets = (p, facets, except) => {
    const f = S.cableFacets(p);
    return Object.entries(facets || {}).every(([k, v]) => !v || k === except || f[k] === v);
  };

  S.searchProducts = function (state, filter = {}) {
    const needle = (filter.q || '').trim().toLowerCase();
    const rank = (p) => {
      const name = p.name.toLowerCase();
      return !needle ? 0 : name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : 2;
    };
    const has = (p) => (S.totalStock(state, p.id).qty > 0 ? 0 : 1);
    return matchBase(state, filter).filter(p => matchFacets(p, filter.facets))
      .sort((a, b) => rank(a) - rank(b) || has(a) - has(b) || a.name.localeCompare(b.name, 'th'));
  };

  S.facetRows = function (state, filter = {}) {
    const selected = filter.facets || {};
    const active = (filter.q || '').trim() || filter.category || Object.values(selected).some(Boolean);
    if (!active || !S.searchProducts(state, filter).some(S.isCableLike)) return [];
    const base = matchBase(state, filter);
    const order = { type: TYPES, color: COLORS };
    return FACETS.map(([key, label]) => {
      const counts = new Map();
      for (const p of base) {
        if (!matchFacets(p, selected, key)) continue;
        const v = S.cableFacets(p)[key];
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      const options = [...counts].map(([value, count]) => ({ value, count, selected: selected[key] === value }))
        .sort((a, b) => order[key] ? order[key].indexOf(a.value) - order[key].indexOf(b.value) : a.value - b.value);
      return { key, label, options };
    }).filter(r => r.options.length > 1 || selected[r.key]);
  };

  const myReqs = (state, userId) => state.reqs.filter(r => r.userId === userId).slice().reverse();
  S.recentProducts = (state, userId) =>
    [...new Set(myReqs(state, userId).flatMap(r => r.lines.map(l => l.productId)))].slice(0, 4)
      .map(id => product(state, id)).filter(Boolean);
  S.recentJobs = (state, userId) =>
    [...new Set(myReqs(state, userId).map(r => r.jobId))].map(id => byId(state.jobs, id))
      .filter(j => j && j.open).slice(0, 3);

  /* ---------- วางแผนเบิก: จำนวน คลัง ม้วน ---------- */

  const fmt = SM.fmtQty;
  const ccQty = (cc) => cc.rollLengths ? sum(cc.rollLengths, Number) : cc.qty;

  // ยอดที่เบิกได้จริง = ของในคลัง − ที่กันไว้ให้ใบเบิกอื่น
  S.available = function (state, productId, whId) {
    const inWh = sum(state.stock.filter(x => x.productId === productId && x.whId === whId && !QC(x)), x => x.qty)
      + sum(state.rolls.filter(r => r.productId === productId && r.whId === whId && !QC(r)), r => r.length);
    const reserved = sum(state.reqs.filter(r => r.whId === whId),
      r => sum(r.lines.filter(l => l.productId === productId), l => l.reserved || 0));
    return round2(inWh - reserved);
  };

  S.qtyError = function (p, qty) {
    const n = Number(qty);
    if (qty === null || qty === '' || !(n > 0)) return T.N06();
    if (p.unit !== 'm' && !Number.isInteger(n)) return T.N07(p.unit);
    return null;
  };

  S.linesReady = (state, lines) =>
    lines.length > 0 && lines.every(l => S.qtyError(product(state, l.productId), l.qty) === null);

  const pendingCC = (state, productId, whId) =>
    state.ccs.find(c => c.status === 'pending' && c.productId === productId && c.whId === whId) || null;

  S.planLine = function (state, line, whId) {
    const p = product(state, line.productId);
    const wh = byId(state.warehouses, whId);
    const want = Number(line.qty) || 0;
    const have = Math.max(0, S.available(state, p.id, whId));
    const plan = {
      productId: p.id, product: p, want, have, give: Math.min(want, have), short: 0, result: 'ok',
      cuts: [], warnings: [], error: null, errorShort: null, pendingCC: pendingCC(state, p.id, whId),
      everStocked: state.stock.some(x => x.productId === p.id) || state.rolls.some(r => r.productId === p.id)
        || state.reqs.some(r => r.lines.some(l => l.productId === p.id && l.issued > 0)),
    };
    const fail = (full, short) => { plan.error = full; plan.errorShort = short; plan.give = 0; plan.short = want; return plan; };
    if (wh.locked) return fail(T.N37(p.name), `${p.name} · คลังนี้กำลังตรวจนับ`);

    if (p.isRoll) {
      const rolls = state.rolls.filter(r => r.productId === p.id && r.whId === whId && r.length > 0 && !QC(r));
      const cut = (r, len) => ({ rollId: r.id, shelf: r.shelf, had: r.length, cut: round2(len), left: round2(r.length - len) });
      if (line.single && rolls.length) {
        // เส้นเดียว = ม้วนที่ยาวพอและเหลือน้อยสุด
        const fit = rolls.filter(r => r.length >= want).sort((a, b) => a.length - b.length)[0];
        if (!fit) {
          const longest = Math.max(...rolls.map(r => r.length));
          return fail(T.N38(p.name, fmt(want, p.unit), fmt(longest, p.unit)),
            `${p.name} · ไม่มีม้วนไหนยาว ${fmt(want, p.unit)} ในคลังนี้`);
        }
        // ม้วนยาวพอแต่ยอดเบิกได้ไม่ถึง (ส่วนหนึ่งกันไว้ให้ใบอื่น) → ไม่ตัด รอของทั้งจำนวน
        if (want <= have) plan.cuts = [cut(fit, want)]; else plan.give = 0;
      } else {
        // ม้วนที่เปิดแล้วก่อน แล้วม้วนเก่าสุด
        let need = plan.give;
        for (const r of rolls.slice().sort((a, b) => (b.opened ? 1 : 0) - (a.opened ? 1 : 0) || a.id.localeCompare(b.id))) {
          if (need <= 0) break;
          const len = Math.min(need, r.length);
          plan.cuts.push(cut(r, len)); need = round2(need - len);
        }
      }
      plan.warnings = plan.cuts.filter(c => c.left > 0 && c.left < p.scrapMin)
        .map(c => T.N45(c.rollId, fmt(c.left, p.unit), fmt(p.scrapMin, p.unit)));
    }
    plan.short = round2(want - plan.give);
    plan.result = plan.short <= 0 ? 'ok' : have > 0 ? 'short' : 'none';
    return plan;
  };

  S.planIssue = function (state, lines, whId) {
    const plans = lines.map(l => S.planLine(state, l, whId));
    const bad = plans.find(p => p.error);
    return { lines: plans, blocked: !!bad, firstError: bad ? bad.error : null, firstErrorShort: bad ? bad.errorShort : null };
  };

  S.warehouseOptions = function (state, lines) {
    const opts = state.warehouses.map(wh => {
      if (wh.locked) return { wh, status: 'locked', shortCount: lines.length, total: lines.length, label: T.N30(), cover: 0, withCC: false };
      const plans = lines.map(l => S.planLine(state, l, wh.id));
      const shortCount = plans.filter(p => p.result !== 'ok').length;
      const status = shortCount === 0 ? 'full' : plans.every(p => p.have === 0) ? 'none' : 'short';
      return {
        wh, status, shortCount, total: lines.length,
        label: status === 'full' ? T.N27() : status === 'none' ? T.N29() : T.N28(shortCount, lines.length),
        cover: lines.length ? (lines.length - shortCount) / lines.length : 0,
        withCC: plans.every(p => p.short <= 0 || (p.pendingCC && ccQty(p.pendingCC) >= p.short)),
      };
    });
    const rank = (o) => (o.status === 'locked' ? 3 : o.status === 'full' ? 0 : o.withCC ? 1 : 2);
    opts.sort((a, b) => rank(a) - rank(b) || b.cover - a.cover || a.wh.name.localeCompare(b.wh.name, 'th'));
    const rec = opts.find(o => o.status === 'full') || opts.find(o => o.status !== 'locked' && o.withCC);
    opts.forEach(o => { o.recommended = o === rec; });
    return opts;
  };

  S.autoWarehouse = function (state, lines) {
    const usable = S.warehouseOptions(state, lines).filter(o => o.status !== 'locked');
    const full = usable.filter(o => o.status === 'full');
    const withCC = usable.filter(o => o.withCC);
    const pick = usable.length === 1 ? usable[0] : full.length === 1 ? full[0]
      : !full.length && withCC.length === 1 ? withCC[0] : null;
    return pick ? pick.wh.id : null;
  };

  S.switchSuggestions = function (state, lines, whId) {
    const out = [];
    for (const l of lines) {
      if (S.planLine(state, l, whId).result === 'ok') continue;
      for (const wh of state.warehouses) {
        const have = S.available(state, l.productId, wh.id);
        if (wh.id !== whId && !wh.locked && have >= Number(l.qty)) out.push({ wh, productId: l.productId, have });
      }
    }
    return out;
  };

  // คืนข้อความ N36 เมื่อคลังที่เลือกถูกล็อกนับสต็อกระหว่างกรอก (งานที่เลือกไว้ไม่หาย)
  S.syncCartWarehouse = function (state) {
    const cart = state.cart;
    const wh = cart.whId && byId(state.warehouses, cart.whId);
    if (wh && wh.locked) { cart.whId = null; cart.whAuto = false; cart.whCleared = true; return T.N36(wh.name); }
    if (!cart.whId && !cart.whCleared && S.linesReady(state, cart.lines)) {
      const auto = S.autoWarehouse(state, cart.lines);
      if (auto) { cart.whId = auto; cart.whAuto = true; }
    }
    return null;
  };

  /* ---------- กดเบิก · อนุมัติ · รายการต้องซื้อ · แจ้งเตือน ---------- */

  const now = () => new Date().toISOString();
  const usersWith = (state, ...roles) => state.users.filter(u => roles.includes(u.role)).map(u => u.id);
  const docId = (prefix, n, pad) => prefix + String(n).padStart(pad, '0');

  S.notify = function (state, toUserIds, level, text, link = null) {
    for (const toUserId of toUserIds)
      state.notifs.push({ id: state.notifs.length + 1, toUserId, level, text, link, read: false, at: now() });
  };
  S.unread = (state, userId) => state.notifs.filter(n => n.toUserId === userId && !n.read);

  S.needsApproval = (state, userId) => state.settings.reqApproval && byId(state.users, userId).role !== 'head';

  // หยิบของออกจากคลังจริงตามแผน แล้วบันทึกลงรายการของใบเบิก
  function dispense(state, req, line, plan) {
    if (plan.error || plan.give <= 0) return;
    let out = plan.give;
    if (plan.product.isRoll) {
      for (const c of plan.cuts) {
        const roll = byId(state.rolls, c.rollId);
        roll.length = c.left; roll.opened = true;
        if (roll.length <= 0) state.rolls.splice(state.rolls.indexOf(roll), 1);
        line.cuts.push(c);
      }
      out = sum(plan.cuts, c => c.cut);      // จ่ายแล้ว = ที่ตัดออกจากม้วนจริงเท่านั้น
    } else {
      let need = plan.give;
      for (const row of state.stock.filter(x => x.productId === line.productId && x.whId === req.whId)) {
        const take = Math.min(need, row.qty);
        row.qty = round2(row.qty - take); need = round2(need - take);
        if (take > 0) line.shelf = row.shelf;
      }
    }
    line.issued = round2(line.issued + out);
  }

  const settle = (req) => {
    req.status = req.lines.every(l => l.issued >= l.qty) ? 'issued' : req.lines.some(l => l.issued > 0) ? 'partial' : 'waiting';
  };

  function createPR(state, req, productId, qty) {
    const pr = { id: docId('PR-', state.seq.pr++, 6), reqId: req.id, productId, whId: req.whId, qty, received: 0, status: 'open', at: now() };
    state.prs.push(pr);
    S.notify(state, usersWith(state, 'store', 'head'), 'info', T.N68(pr.id, req.id), '#/restock');
    return pr;
  }

  // จ่ายของเท่าที่มี ส่วนที่ขาดกลายเป็นรายการต้องซื้อ (หรือรอยอดที่ Store ยังไม่ยืนยัน)
  function fulfil(state, req) {
    const prs = [];
    if (state.settings.demoPickFail) {
      state.settings.demoPickFail = false;
      for (const line of req.lines) {
        line.reserved = Math.min(line.qty, Math.max(0, S.available(state, line.productId, req.whId)));
        if (line.reserved < line.qty) prs.push(createPR(state, req, line.productId, round2(line.qty - line.reserved)));
      }
      req.status = 'pick_failed';
      return prs;
    }
    for (const line of req.lines) {
      const plan = S.planLine(state, { ...line, qty: round2(line.qty - line.issued) }, req.whId);
      dispense(state, req, line, plan);
      const short = round2(line.qty - line.issued);
      const cc = plan.pendingCC;
      if (short > 0 && !(cc && ccQty(cc) >= short)) prs.push(createPR(state, req, line.productId, short));
    }
    settle(req);
    return prs;
  }

  S.issueNow = function (state, userId) {
    const cart = state.cart;
    if (!S.linesReady(state, cart.lines)) throw new Error(T.N56.incomplete);
    const wh = byId(state.warehouses, cart.whId), job = byId(state.jobs, cart.jobId);
    if (!wh) throw new Error(T.N56.noWh);
    if (!job) throw new Error(T.N56.noJob);
    if (wh.locked) throw new Error(T.N56.locked);
    if (!job.open) throw new Error(T.N56.jobClosed(job.id));
    const plan = S.planIssue(state, cart.lines, wh.id);
    if (plan.blocked) throw new Error(T.N55(plan.firstErrorShort));

    const req = {
      id: docId('REQ-', state.seq.req++, 6), userId, whId: wh.id, jobId: job.id, note: cart.note || '', status: 'waiting', at: now(),
      lines: cart.lines.map(l => ({ productId: l.productId, qty: Number(l.qty), issued: 0, reserved: 0, returned: 0, single: !!l.single, cuts: [] })),
    };
    state.reqs.push(req);
    let prs = [];
    if (S.needsApproval(state, userId)) {
      req.status = 'pending_approval';
      S.notify(state, usersWith(state, 'head'), 'info',
        T.N65(req.id, byId(state.users, userId).name, req.lines.length, job.name), '#/approvals');
    } else prs = fulfil(state, req);
    cart.lines = []; cart.note = '';        // เก็บคลังและงานไว้ให้ "เบิกต่อ"
    return { outcome: req.status, req, prs };
  };

  S.approveReq = function (state, reqId, approverId, ok, reason = '') {
    const req = byId(state.reqs, reqId);
    if (!req || req.status !== 'pending_approval') throw new Error('ใบเบิกนี้ไม่ได้รออนุมัติ');
    if (ok) {
      if (byId(state.warehouses, req.whId).locked) throw new Error(T.N56.locked);
      fulfil(state, req);
      S.notify(state, [req.userId], 'ok', T.N66(req.id), '#/orders/' + req.id);
    } else {
      if (!reason.trim()) throw new Error('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
      req.status = 'rejected'; req.reason = reason.trim();
      S.notify(state, [req.userId], 'bad', T.N67(req.id, req.reason), '#/orders/' + req.id);
    }
    return req;
  };

  /* ---------- รับของเข้า · หยิบ · คืนของ ---------- */

  const LOCKED = 'คลังนี้กำลังนับสต็อก ทำรายการไม่ได้ชั่วคราว';
  const openWh = (state, whId) => {
    const wh = byId(state.warehouses, whId);
    if (!wh) throw new Error(T.N14.wh);
    if (wh.locked) throw new Error(LOCKED);
    return wh;
  };

  // ตรวจจำนวนที่จะเข้าคลัง แล้วคืนฟังก์ชันที่ลงยอดจริง (แยกตรวจกับทำ เพื่อไม่ให้ลงยอดครึ่งเดียว)
  function stockIn(state, p, whId, { qty, rollLengths, shelf = 'ทั่วไป', batch, fromRollId }, opened = false) {
    const sh = (byId2(state.warehouses, whId)?.shelves || []).find(x => x.code === shelf);
    if (!sh || !sh.active) throw new Error(`ที่วาง ${shelf} ปิดใช้งานอยู่ (เปิดใช้อีกครั้งก่อน)`);
    if (p.isRoll) {
      const lengths = (rollLengths || []).map(Number);
      if (!lengths.length || lengths.some(n => !(n > 0))) throw new Error(T.N14.rolls);
      return { amount: round2(sum(lengths, n => n)), text: `${lengths.length} ม้วน ${fmt(sum(lengths, n => n), 'm')}`, apply() {
        for (const length of lengths)
          state.rolls.push({ id: docId('R-', state.seq.roll++, 6), productId: p.id, whId, shelf, length, opened, batch, fromRollId });
      } };
    }
    const err = S.qtyError(p, qty);
    if (err) throw new Error(err === T.N06() ? T.N14.qty : err);
    const n = Number(qty);
    return { amount: n, text: fmt(n, p.unit), apply() {
      const row = state.stock.find(x => x.productId === p.id && x.whId === whId && x.shelf === shelf);
      if (row) row.qty = round2(row.qty + n); else state.stock.push({ productId: p.id, whId, qty: n, shelf });
    } };
  }

  // ของเข้าแล้ว: กันให้ใบเบิกที่รออยู่ (เก่าสุดก่อน) ครบทั้งใบเมื่อไรเป็น "ready" และแจ้งผู้เบิก
  function reserveForWaiting(state, productId, whId) {
    const readied = [];
    for (const req of state.reqs) {
      if (req.whId !== whId || !['waiting', 'partial', 'pick_failed'].includes(req.status)) continue;
      let got = false;
      for (const line of req.lines.filter(l => l.productId === productId)) {
        const give = Math.min(round2(line.qty - line.issued - line.reserved), Math.max(0, S.available(state, productId, whId)));
        if (give > 0) { line.reserved = round2(line.reserved + give); got = true; }
      }
      if (got && req.lines.every(l => l.issued + l.reserved >= l.qty)) {
        req.status = 'ready'; readied.push(req);
        S.notify(state, [req.userId], 'ok', T.N70(req.id), '#/orders/' + req.id);
      }
    }
    return readied;
  }

  S.receiveStock = function (state, { productId, whId, qty, rollLengths, prId }) {
    const p = product(state, productId);
    const wh = openWh(state, whId);
    const forPr = prId ? byId(state.prs, prId) : null;
    if (forPr && forPr.whId !== wh.id) throw new Error(`รายการต้องซื้อ ${forPr.id} ต้องรับเข้า${byId(state.warehouses, forPr.whId).name}`);
    const incoming = stockIn(state, p, whId, { qty, rollLengths });
    incoming.apply();
    // PR ที่ระบุรับยอดทั้งหมด (รับเกินได้) ถ้าไม่ระบุ ไล่ตัดรายการต้องซื้อที่ค้างของสินค้า+คลังนี้
    let left = incoming.amount;
    const open = state.prs.filter(x => x.status === 'open' && x.productId === productId && x.whId === whId);
    for (const pr of prId ? [byId(state.prs, prId)] : open) {
      if (!pr || left <= 0) continue;
      const take = prId ? left : Math.min(left, round2(pr.qty - pr.received));
      pr.received = round2(pr.received + take); left = round2(left - take);
      if (pr.received >= pr.qty) pr.status = 'done';
    }
    return { readied: reserveForWaiting(state, productId, whId), text: incoming.text };
  };

  S.pickReq = function (state, reqId, userId) {
    const req = byId(state.reqs, reqId);
    if (!req || !req.lines.some(l => l.reserved > 0)) throw new Error('ใบเบิกนี้ไม่มีของที่กันไว้ให้จ่าย');
    openWh(state, req.whId);
    for (const line of req.lines.filter(l => l.reserved > 0)) {
      const give = line.reserved, was = line.issued;
      line.reserved = 0;                       // ปล่อยที่กันไว้ก่อน ไม่งั้นยอดเบิกได้จะไม่นับของก้อนนี้
      const plan = S.planLine(state, { ...line, qty: give }, req.whId);
      if (plan.error) { line.reserved = give; throw new Error(plan.error); }
      dispense(state, req, line, plan);
      line.reserved = round2(give - (line.issued - was));   // ส่วนที่ยังจ่ายไม่ได้ กันไว้ต่อ
    }
    settle(req);
    if (userId !== req.userId) S.notify(state, [req.userId], 'info', T.N69(req.id, req.status === 'issued'), '#/orders/' + req.id);
    return req;
  };

  S.returnItems = function (state, { reqId, lines }) {
    const req = byId(state.reqs, reqId);
    if (!req) throw new Error('ไม่พบใบเบิก');
    openWh(state, req.whId);
    const todo = lines.filter(l => l.qty !== null && l.qty !== '' && l.qty !== undefined).map(l => {
      const line = req.lines.find(x => x.productId === l.productId);
      const p = product(state, l.productId);
      const max = round2(line.issued - line.returned);
      const err = S.qtyError(p, l.qty);
      const e = err ? new Error(err) : Number(l.qty) > max ? new Error(`คืนได้ไม่เกิน ${fmt(max, p.unit)}`) : null;
      if (e) { e.productId = p.id; throw e; }
      return { line, p, incoming: stockIn(state, p, req.whId, { qty: l.qty, rollLengths: [l.qty] }, true) };
    });
    if (!todo.length) throw new Error('ใส่จำนวนที่จะคืนอย่างน้อย 1 รายการ');
    for (const { line, p, incoming } of todo) {
      incoming.apply();
      line.returned = round2(line.returned + incoming.amount);
      reserveForWaiting(state, p.id, req.whId);
    }
    return req;
  };

  S.lowStock = (state) => state.products
    .map(p => ({ product: p, total: S.totalStock(state, p.id).qty, reorderPoint: p.reorderPoint }))
    .filter(x => x.reorderPoint > 0 && x.total < x.reorderPoint);

  /* ---------- สร้างสินค้า/งานใหม่ · ยืนยันยอดตั้งต้น ---------- */

  const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  // ponytail: ความคล้ายแบบ Dice บน bigram พอสำหรับเตือนชื่อคล้าย ถ้าต้องแม่นกว่านี้ค่อยเปลี่ยนเป็น trigram/ตัดคำไทย
  function similarity(a, b) {
    const grams = (s) => { const t = norm(s).replace(/ /g, ''); const g = []; for (let i = 0; i < t.length - 1; i++) g.push(t.slice(i, i + 2)); return g; };
    const A = grams(a), B = grams(b);
    if (!A.length || !B.length) return 0;
    const pool = B.slice(); let hit = 0;
    for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
    return (2 * hit) / (A.length + B.length);
  }

  S.similarProducts = function (state, name) {
    if (!norm(name)) return [];
    return state.products
      .map(p => ({ product: p, exact: norm(p.name) === norm(name), pct: Math.round(similarity(p.name, name) * 100) }))
      .filter(x => x.exact || x.pct >= 60)
      .sort((a, b) => b.exact - a.exact || b.pct - a.pct);
  };

  S.createProduct = function (state, input, userId) {
    const name = (input.name || '').trim();
    if (!name) throw new Error('กรุณาระบุชื่อสินค้า');
    const dup = S.similarProducts(state, name).find(x => x.exact);
    if (dup) throw new Error(T.N11(dup.product));
    const unit = input.isRoll ? 'm' : (input.unit || '').trim();
    if (!unit) throw new Error(T.N19());
    const draft = { name, brand: (input.brand || '').trim(), model: (input.model || '').trim(), unit, isRoll: !!input.isRoll };
    const type = S.cableFacets(draft).type;
    const p = {
      id: '', ...draft, category: (input.category || '').trim() || (type ? (type.startsWith('CAT') ? 'สายสื่อสาร' : 'สายไฟ') : 'อื่น ๆ'),
      img: 'img/products/placeholder.svg', reorderPoint: 0, scrapMin: draft.isRoll ? 3 : 0,
    };
    let incoming = null;
    if (input.opening) { openWh(state, input.opening.whId); incoming = stockIn(state, p, input.opening.whId, input.opening); }

    p.id = docId('P-', state.seq.product++, 4);
    state.products.push(p);
    if (!incoming) return { product: p, cc: null, toast: T.N20(p) };
    if (byId(state.users, userId).role !== 'engineer') {     // Store/หัวหน้า คุมตัวเลขสต็อกได้ ลงยอดทันที
      incoming.apply();
      return { product: p, cc: null, toast: T.N21(p, incoming.text) };
    }
    const cc = {
      id: docId('CC-', state.seq.cc++, 4), productId: p.id, whId: input.opening.whId, byUserId: userId, status: 'pending', reason: '',
      qty: p.isRoll ? null : Number(input.opening.qty), rollLengths: p.isRoll ? input.opening.rollLengths.map(Number) : null, text: incoming.text,
    };
    state.ccs.push(cc);
    S.notify(state, usersWith(state, 'store', 'head'), 'info',
      T.N71(cc.id, p.name, incoming.text, byId(state.warehouses, cc.whId).name), '#/approvals');
    return { product: p, cc, toast: T.N22(p, incoming.text, cc.id) };
  };

  // ใบเบิกที่ยังขาดของและไม่มีรายการต้องซื้อค้างอยู่ → สร้างให้ คืนเลขใบเบิกที่ได้รายการใหม่
  function ensurePRs(state, productId, whId) {
    const made = [];
    for (const req of state.reqs.filter(r => r.whId === whId && ['waiting', 'partial'].includes(r.status))) {
      for (const line of req.lines.filter(l => l.productId === productId)) {
        const short = round2(line.qty - line.issued - line.reserved);
        if (short > 0 && !state.prs.some(x => x.reqId === req.id && x.productId === productId && x.status === 'open')) {
          createPR(state, req, productId, short); made.push(req.id);
        }
      }
    }
    return made;
  }

  S.confirmCC = function (state, ccId, userId, ok, reason = '') {
    const cc = byId(state.ccs, ccId);
    if (!cc || cc.status !== 'pending') throw new Error('รายการนี้ไม่ได้รอยืนยันยอด');
    const p = product(state, cc.productId);
    if (ok) {
      openWh(state, cc.whId);
      const incoming = stockIn(state, p, cc.whId, cc);
      incoming.apply(); cc.status = 'ok';
      S.notify(state, [cc.byUserId], 'ok', T.N72(p.name, incoming.text));
      reserveForWaiting(state, p.id, cc.whId);
      ensurePRs(state, p.id, cc.whId);       // ใบที่ยอดนี้ไม่พอให้ ต้องไปอยู่ในรายการต้องซื้อ
      return cc;
    }
    if (!reason.trim()) throw new Error('กรุณาระบุเหตุผล');
    cc.status = 'rejected'; cc.reason = reason.trim();
    // ponytail: คำถามเปิดข้อ 2 ยังไม่ตัดสิน — ทำตามคำแนะนำ BA: สร้างรายการต้องซื้อให้ใบเบิกที่รอยอดนี้อยู่
    const waiting = ensurePRs(state, p.id, cc.whId);
    S.notify(state, [cc.byUserId], 'warn', T.N73(p.name, cc.reason, waiting));
    return cc;
  };

  S.similarJobs = function (state, name) {
    const n = norm(name);
    if (!n) return [];
    return state.jobs.filter(j => j.open && (similarity(j.name, n) >= 0.6 || (n.length >= 4 && norm(j.name).includes(n))));
  };

  S.createJob = function (state, { name, customer }) {
    const n = (name || '').trim();
    if (!n) throw new Error('กรุณาระบุชื่องาน');
    const job = { id: 'J-26-' + String(state.seq.job++).padStart(3, '0'), name: n, customer: (customer || '').trim(), open: true };
    state.jobs.push(job);
    return job;
  };
  /* ---------- ชั้นวาง · ชั้นรอตรวจ · ประวัติ ---------- */

  S.shelves = (state, whId, { qc = false } = {}) =>
    (byId(state.warehouses, whId)?.shelves || []).filter(s => s.active && (qc || !s.qc)).map(s => s.code);
  S.qcShelf = (state, whId) => (byId(state.warehouses, whId)?.shelves || []).find(s => s.qc).code;
  S.qcStock = (state, whId) => [
    ...state.stock.filter(x => QC(x) && (!whId || x.whId === whId)).map(x => ({ productId: x.productId, whId: x.whId, qty: x.qty })),
    ...state.rolls.filter(r => QC(r) && (!whId || r.whId === whId)).map(r => ({ productId: r.productId, whId: r.whId, qty: r.length, rollId: r.id })),
  ];
  S.log = (state, userId, action, ref, text) => { state.audit.push({ at: now(), userId, action, ref, text }); };
  S.auditFor = (state, ref) => state.audit.filter(e => e.ref === ref);

  S._ = { stockIn, openWh, reserveForWaiting, createPR, ensurePRs, now, docId, usersWith, round2, similarity, norm };
})();

// state ใน localStorage เสีย/เวอร์ชันเก่า → กลับไปใช้ seed (ไม่ให้จอขาว)
SM.loadState = function (raw) {
  try {
    const s = JSON.parse(raw);
    const lists = ['users', 'products', 'warehouses', 'stock', 'rolls', 'jobs', 'reqs', 'prs', 'ccs', 'notifs', 'audit', 'returns', 'receipts'];
    if (s && s.v === 2 && lists.every(k => Array.isArray(s[k])) && s.cart && Array.isArray(s.cart.lines)
      && s.seq && s.settings && s.users.some(u => u.id === s.currentUserId)) return s;
  } catch (e) { /* ข้อมูลเสีย ใช้ seed */ }
  return SM.seed();
};

if (typeof module !== 'undefined') module.exports = SM;

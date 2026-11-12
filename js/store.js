var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// ตรรกะทั้งหมดของ mockup: ฟังก์ชันรับ state แล้วอ่าน/แก้ state ตรง ๆ ไม่แตะ DOM (ทดสอบด้วย node --test)
(function () {
  const S = SM.store = {};
  const T = SM.T;
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const round2 = (n) => Math.round(n * 100) / 100;
  const byId = (list, id) => list.find(x => x.id === id);
  const product = (state, id) => byId(state.products, id);

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
    qty: round2(sum(state.stock.filter(x => x.productId === productId), x => x.qty)
      + sum(state.rolls.filter(r => r.productId === productId), r => r.length)),
    rolls: state.rolls.filter(r => r.productId === productId).length,
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
    const inWh = sum(state.stock.filter(x => x.productId === productId && x.whId === whId), x => x.qty)
      + sum(state.rolls.filter(r => r.productId === productId && r.whId === whId), r => r.length);
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
    const fail = (full, short) => { plan.error = full; plan.errorShort = short; return plan; };
    if (wh.locked) return fail(T.N37(p.name), `${p.name} · คลังนี้กำลังตรวจนับ`);

    if (p.isRoll) {
      const rolls = state.rolls.filter(r => r.productId === p.id && r.whId === whId && r.length > 0);
      const cut = (r, len) => ({ rollId: r.id, shelf: r.shelf, had: r.length, cut: round2(len), left: round2(r.length - len) });
      if (line.single && rolls.length) {
        // เส้นเดียว = ม้วนที่ยาวพอและเหลือน้อยสุด
        const fit = rolls.filter(r => r.length >= want).sort((a, b) => a.length - b.length)[0];
        if (!fit) {
          const longest = Math.max(...rolls.map(r => r.length));
          return fail(T.N38(p.name, fmt(want, p.unit), fmt(longest, p.unit)),
            `${p.name} · ไม่มีม้วนไหนยาว ${fmt(want, p.unit)} ในคลังนี้`);
        }
        plan.cuts = [cut(fit, want)];
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
    if (wh && wh.locked) { cart.whId = null; cart.whAuto = false; return T.N36(wh.name); }
    if (!cart.whId && S.linesReady(state, cart.lines)) {
      const auto = S.autoWarehouse(state, cart.lines);
      if (auto) { cart.whId = auto; cart.whAuto = true; }
    }
    return null;
  };

  S._ = { sum, round2, byId, product, T, fmt, ccQty };
})();

if (typeof module !== 'undefined') module.exports = SM;

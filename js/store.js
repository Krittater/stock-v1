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

  S._ = { sum, round2, byId, product, T };
})();

if (typeof module !== 'undefined') module.exports = SM;

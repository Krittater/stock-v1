var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store;

  // รหัสที่สแกน/พิมพ์ → { kind, id } หรือ null (ไม่รู้จัก / สินค้าเลิกใช้)
  S.parseScan = (state, code) => {
    const c = String(code == null ? '' : code).trim().toUpperCase();
    if (!c) return null;
    const hit = (kind, list) => { const x = list.find(r => r.id.toUpperCase() === c); return x ? { kind, id: x.id } : null; };
    if (c.startsWith('REQ-')) return hit('req', state.reqs);
    if (c.startsWith('R-')) return hit('roll', state.rolls);
    if (c.startsWith('J-')) return hit('job', state.jobs);
    const act = state.products.filter(p => p.active);
    if (c.startsWith('P-')) { const h = hit('product', act); if (h) return h; }
    const v = act.find(p => p.vendorCode && p.vendorCode.trim().toUpperCase() === c);
    return v ? { kind: 'product', id: v.id } : null;
  };
})();

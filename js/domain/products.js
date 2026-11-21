var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// สินค้า: สร้าง · แก้ตามบทบาท · เลิกใช้ · ต้องอนุมัติตามหมวด · รูป · บาร์โค้ดซ้ำ
(function () {
  const S = SM.store, T = SM.T, fmt = SM.fmtQty;
  const { stockIn, openWh, docId, round2, similarity, norm } = S._;
  const byId = (list, id) => list.find(x => x.id === id);
  const role = (state, userId) => byId(state.users, userId).role;
  const NO_PHOTO23 = 'เพิ่มรูปที่ 2-3 ได้เฉพาะคลังสินค้าและหัวหน้า', MAX_PHOTO = 'ใส่รูปได้ไม่เกิน 3 รูปต่อสินค้า';
  const STORE_FIELDS = ['name', 'brand', 'model', 'vendorCode', 'note'];
  const HEAD_FIELDS = [...STORE_FIELDS, 'category', 'unit', 'isRoll', 'buyUnit', 'buyFactor', 'reorderPoint', 'scrapMin', 'needsApproval'];

  S.similarProducts = function (state, name) {
    if (!norm(name)) return [];
    return state.products
      .map(p => ({ product: p, exact: norm(p.name) === norm(name), pct: Math.round(similarity(p.name, name) * 100) }))
      .filter(x => x.exact || x.pct >= 35)
      .sort((a, b) => b.exact - a.exact || b.pct - a.pct)
      .slice(0, 5);
  };

  S.categoryNames = (state) =>
    [...new Set([...state.products.filter(p => p.active !== false).map(p => p.category), ...state.approvalCats])];
  // หมวดที่พิมพ์มาซ้ำกับหมวดเดิม (ไม่สนตัวพิมพ์/ช่องว่าง) = ใช้ชื่อเดิม
  const canonCat = (state, c) => S.categoryNames(state).find(x => norm(x) === norm(c)) || (c || '').trim().replace(/\s+/g, ' ');

  const barcodeOwner = (state, code, exceptId) => {
    const c = (code || '').trim();
    return c ? state.products.find(p => p.active !== false && p.id !== exceptId && (p.vendorCode || '').trim() === c) : null;
  };
  const checkBarcode = (state, code, exceptId) => {
    const o = barcodeOwner(state, code, exceptId);
    if (o) throw new Error(`บาร์โค้ดนี้เป็นของ ${o.id} ${o.name}`);
  };
  const checkPhotos = (photos, max) => {
    if (photos.length > max) throw new Error(max === 1 ? NO_PHOTO23 : MAX_PHOTO);
  };

  const heldQty = (state, id) => round2(
    state.stock.filter(x => x.productId === id).reduce((a, x) => a + x.qty, 0) +
    state.rolls.filter(r => r.productId === id).reduce((a, r) => a + r.length, 0));   // รวมชั้น QC และม้วน

  S.hasHistory = (state, id) =>
    heldQty(state, id) > 0 || state.rolls.some(r => r.productId === id) ||
    state.reqs.some(r => r.lines.some(l => l.productId === id)) ||
    [...state.returns, ...state.receipts].some(r => (r.lines || []).some(l => l.productId === id)) ||
    state.ccs.some(c => c.productId === id) || state.prs.some(p => p.productId === id);

  S.createProduct = function (state, input, userId) {
    const me = role(state, userId);
    const name = (input.name || '').trim();
    if (!name) throw new Error('กรุณาระบุชื่อสินค้า');
    const dup = S.similarProducts(state, name).find(x => x.exact);
    if (dup) throw new Error(`มีสินค้าชื่อนี้แล้ว: ${dup.product.id}`);
    const category = canonCat(state, input.category);
    if (!category) throw new Error('กรุณาเลือกหมวดหมู่');
    const unit = input.isRoll ? 'm' : (input.unit || '').trim();
    if (!unit) throw new Error(T.N19());
    checkBarcode(state, input.vendorCode);
    const photos = (input.photos || []).slice();
    checkPhotos(photos, me === 'engineer' ? 1 : 3);
    const num = (v, def, min) => { const n = v === undefined || v === null || v === '' ? def : Number(v); if (!(n >= min)) throw new Error('ตัวเลขไม่ถูกต้อง'); return n; };
    const isRoll = !!input.isRoll;
    const p = {
      id: '', name, brand: (input.brand || '').trim(), model: (input.model || '').trim(), category, unit, isRoll,
      img: 'img/products/placeholder.svg', active: true, vendorCode: (input.vendorCode || '').trim(), note: (input.note || '').trim(),
      buyUnit: (input.buyUnit || '').trim() || unit, buyFactor: num(input.buyFactor, 1, 1),
      reorderPoint: num(input.reorderPoint, 0, 0), scrapMin: num(input.scrapMin, isRoll ? 3 : 0, 0), photos,
      needsApproval: state.approvalCats.includes(category) || (me === 'head' && !!input.needsApproval),   // Q4: คนอื่นติ๊กเองไม่ได้
    };
    const op = input.opening;
    if (op) { openWh(state, op.whId); stockIn(state, p, op.whId, op); }   // ตรวจก่อนสร้าง ยอดผิดจะไม่สร้างสินค้า

    p.id = docId('P-', state.seq.product++, 4);
    state.products.push(p);
    S.log(state, userId, 'product-create', p.id, `สร้างสินค้า ${p.name} หมวด ${p.category}`);
    if (!op) return { product: p, cc: null, toast: T.N20(p) };
    try {   // สร้างสินค้าแล้วค่อยส่งยอด ถ้าส่งพัง สินค้ายังอยู่ (5B.5)
      const r = S.submitOpening(state, { productId: p.id, whId: op.whId, qty: op.qty, rollLengths: op.rollLengths, kind: 'opening' }, userId);
      return { product: p, cc: r.cc, toast: `สร้าง ${p.id} แล้ว · ${r.toast}` };
    } catch (e) { return { product: p, cc: null, toast: T.N22x(e.message) }; }
  };

  S.updateProduct = function (state, id, patch, userId) {
    const me = role(state, userId);
    const p = byId(state.products, id);
    if (!p) throw new Error('ไม่พบสินค้า');
    const keys = Object.keys(patch);
    if (me === 'engineer' || keys.some(k => !(me === 'head' ? HEAD_FIELDS : STORE_FIELDS).includes(k))) throw new Error(T.FORBIDDEN);

    const next = {};
    const str = (k) => (patch[k] ?? '').toString().trim();
    for (const k of keys) {
      if (['name', 'brand', 'model', 'vendorCode', 'note', 'buyUnit'].includes(k)) next[k] = str(k);
      else if (k === 'category') next[k] = canonCat(state, patch[k]);
      else if (k === 'unit') next[k] = str(k);
      else if (k === 'isRoll' || k === 'needsApproval') next[k] = !!patch[k];
      else next[k] = Number(patch[k]);
    }
    if (next.isRoll === true && !('unit' in next)) next.unit = 'm';
    if ('name' in next) {
      if (!next.name) throw new Error('กรุณาระบุชื่อสินค้า');
      const o = state.products.find(x => x.id !== id && norm(x.name) === norm(next.name));
      if (o) throw new Error(`ชื่อซ้ำกับ ${o.id}`);
    }
    if ('category' in next && !next.category) throw new Error('กรุณาเลือกหมวดหมู่');
    if ('unit' in next && !next.unit) throw new Error(T.N19());
    if ('buyUnit' in next && !next.buyUnit) next.buyUnit = next.unit || p.unit;
    if ('buyFactor' in next && !(next.buyFactor >= 1)) throw new Error('ตัวเลขไม่ถูกต้อง');
    for (const k of ['reorderPoint', 'scrapMin']) if (k in next && !(next[k] >= 0)) throw new Error('ตัวเลขไม่ถูกต้อง');
    if ('vendorCode' in next) checkBarcode(state, next.vendorCode, id);

    const changed = Object.keys(next).filter(k => next[k] !== p[k]);
    if (changed.some(k => k === 'unit' || k === 'isRoll') && S.hasHistory(state, id))
      throw new Error('เปลี่ยนหน่วยไม่ได้ เพราะมีของหรือมีประวัติแล้ว');   // Q5
    for (const k of changed) {
      S.log(state, userId, 'product-edit', id, `แก้ ${k}: ${p[k]} → ${next[k]}`);
      p[k] = next[k];
    }
    return p;
  };

  S.setProductActive = function (state, id, active, userId) {
    if (role(state, userId) !== 'head') throw new Error(T.FORBIDDEN);
    const p = byId(state.products, id);
    if (!p) throw new Error('ไม่พบสินค้า');
    const left = heldQty(state, id);
    if (!active && left > 0) throw new Error(`เลิกใช้ไม่ได้ ยังมีของ ${fmt(left, p.unit)}`);   // Q6
    if ((p.active !== false) === !!active) return p;
    if (active) checkBarcode(state, p.vendorCode, id);   // ระหว่างเลิกใช้ อาจมีตัวอื่นใช้บาร์โค้ดนี้ไปแล้ว
    p.active = !!active;
    S.log(state, userId, 'product-active', id, active ? `เปิดใช้สินค้า ${p.name}` : `เลิกใช้สินค้า ${p.name}`);
    return p;
  };

  S.setCategoryApproval = function (state, category, on, userId) {
    if (role(state, userId) !== 'head') throw new Error(T.FORBIDDEN);
    const c = canonCat(state, category);
    if (!c) throw new Error('กรุณาเลือกหมวดหมู่');
    const i = state.approvalCats.indexOf(c);
    if (on && i < 0) state.approvalCats.push(c);
    if (!on && i >= 0) state.approvalCats.splice(i, 1);
    for (const p of state.products) if (p.category === c) p.needsApproval = !!on;
    S.log(state, userId, 'product-approval', c, `${on ? 'ตั้ง' : 'เลิก'}ต้องอนุมัติทั้งหมวด ${c}`);
  };

  S.addPhoto = function (state, id, dataUrl, userId) {
    const p = byId(state.products, id);
    if (!p) throw new Error('ไม่พบสินค้า');
    if (p.photos.length > 0 && role(state, userId) === 'engineer') throw new Error(NO_PHOTO23);
    if (p.photos.length >= 3) throw new Error(MAX_PHOTO);
    p.photos.push(dataUrl);
    S.log(state, userId, 'product-photo', id, `เพิ่มรูปสินค้า ${p.name} (${p.photos.length}/3)`);
    return p;
  };

  S.replacePhoto = function (state, id, index, dataUrl, userId) {
    const p = byId(state.products, id);
    if (!p) throw new Error('ไม่พบสินค้า');
    if (role(state, userId) === 'engineer') throw new Error('เปลี่ยนรูปได้เฉพาะคลังสินค้าและหัวหน้า');
    if (!(index >= 0 && index < p.photos.length)) throw new Error('ไม่พบรูปที่จะเปลี่ยน');
    p.photos[index] = dataUrl;
    S.log(state, userId, 'product-photo', id, `เปลี่ยนรูปสินค้า ${p.name} (รูปที่ ${index + 1})`);
    return p;
  };

  S.removePhoto = function (state, id, index, userId) {
    const p = byId(state.products, id);
    if (!p) throw new Error('ไม่พบสินค้า');
    if (role(state, userId) === 'engineer') throw new Error('ลบรูปได้เฉพาะคลังสินค้าและหัวหน้า');
    if (!(index >= 0 && index < p.photos.length)) throw new Error('ไม่พบรูปที่จะลบ');
    p.photos.splice(index, 1);
    S.log(state, userId, 'product-photo', id, `ลบรูปสินค้า ${p.name}`);
    return p;
  };
})();

var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// รับของเข้า: ตรวจครบทุกบรรทัดก่อน แล้วค่อยลงยอด (ผิดบรรทัดเดียว = ไม่ลงอะไรเลย)
(function () {
  const S = SM.store, T = SM.T, fmt = SM.fmtQty;
  const { stockIn, openWh, reserveForWaiting, createPR, docId, round2 } = S._;
  const byId = (list, id) => list.find(x => x.id === id);
  const blank = (q) => q === null || q === undefined || q === '';

  S.outstanding = (state, prId) => { const pr = byId(state.prs, prId); return pr ? Math.max(0, round2(pr.qty - pr.received)) : 0; };

  S.receive = function (state, { whId, shelf = 'ทั่วไป', invoiceNo = '', vendor = '', receivedAt, note = '', overReason = '', lines }, userId) {
    const wh = openWh(state, whId);
    if (wh.active === false) throw new Error(`${wh.name} ปิดใช้งานอยู่ — รับของเข้าไม่ได้ (เปิดใช้อีกครั้งก่อน)`);
    const isEmpty = (l) => byId(state.products, l.productId)?.isRoll ? !(l.rollLengths || []).some(n => !blank(n)) : blank(l.qty) || Number(l.qty) === 0;
    const todo = (lines || []).filter(l => !isEmpty(l));
    if (!todo.length) throw new Error('ยังไม่ได้กรอกจำนวนที่รับ');

    let rollNo = state.seq.roll;
    const items = todo.map(l => {
      const p = byId(state.products, l.productId);
      if (!p) throw new Error('ไม่พบสินค้า');
      if (p.active === false) throw new Error(`${p.name} เลิกใช้แล้ว รับของเข้าไม่ได้`);
      const condition = l.condition || 'ok';
      if (!['ok', 'damaged', 'reject'].includes(condition)) throw new Error('เลือกสภาพของที่รับ');
      const pr = l.prId ? byId(state.prs, l.prId) : null;
      if (l.prId && !pr) throw new Error('ไม่พบรายการต้องซื้อ');
      if (pr && pr.status === 'cancelled') throw new Error(`รายการต้องซื้อ ${pr.id} ถูกยกเลิกแล้ว รับเป็นของที่ไม่มีรายการต้องซื้อแทน`);
      if (pr && pr.status === 'done') throw new Error(`รายการต้องซื้อ ${pr.id} รับครบแล้ว รับเป็นของที่ไม่มีรายการต้องซื้อแทน`);
      if (pr && pr.whId !== wh.id) throw new Error(`รายการต้องซื้อ ${pr.id} ต้องรับเข้า${byId(state.warehouses, pr.whId).name}`);
      if (pr && pr.productId !== p.id) throw new Error(`รายการต้องซื้อ ${pr.id} ไม่ใช่สินค้า ${p.name}`);

      let qty, lengths = null;
      if (p.isRoll) {
        lengths = (l.rollLengths || []).filter(n => !blank(n)).map(Number).filter(n => n !== 0);
        if (!lengths.length || lengths.some(n => !(n > 0))) throw new Error(T.N14.rolls);
        qty = round2(lengths.reduce((a, n) => a + n, 0));
      } else {
        qty = round2(Number(l.qty) * (l.unit === 'buy' ? (p.buyFactor || 1) : 1));   // คูณก่อนตรวจจำนวนเต็ม
        const err = S.qtyError(p, qty);
        if (err) throw new Error(err);
      }
      let at = null, incoming = null, rollIds = [];
      if (condition !== 'reject') {
        at = condition === 'damaged' ? S.qcShelf(state, wh.id) : (l.shelf || shelf);
        if (condition === 'ok' && at === S.qcShelf(state, wh.id)) throw new Error('ของที่ใช้ได้เก็บที่ชั้นรอตรวจไม่ได้');
        incoming = stockIn(state, p, wh.id, { qty, rollLengths: lengths, shelf: at, batch: l.batch || undefined });
        if (p.isRoll) rollIds = lengths.map(() => docId('R-', rollNo++, 6));
      }
      return { p, pr, qty, condition, at, incoming, rollIds };
    });

    // รับเกินที่สั่ง: รวมทุกบรรทัดที่อ้าง PR เดียวกัน (reject ไม่นับเป็นยอดรับ)
    const per = {};
    for (const it of items) if (it.pr && it.condition !== 'reject') per[it.pr.id] = round2((per[it.pr.id] || 0) + it.qty);
    const given = String(overReason || '').trim();
    let isOver = false;
    for (const [id, got] of Object.entries(per)) {
      const excess = round2(got - S.outstanding(state, id));
      if (excess > 0) isOver = true;
      if (excess > 0 && !given) throw new Error(`รับเกินที่สั่ง ${fmt(excess, byId(state.products, byId(state.prs, id).productId).unit)} ใส่เหตุผล`);
    }

    const reason = isOver ? given : '';
    // ---- ลงยอด ----
    const receipt = { id: docId('RC-', state.seq.rc++, 6), whId: wh.id, byUserId: userId, at: S._.now(), invoiceNo: String(invoiceNo || '').trim(),
      vendor: String(vendor || '').trim(), receivedAt: receivedAt || S._.now().slice(0, 10), note: String(note || '').trim(), overReason: reason, lines: [] };
    const rolls = [];
    for (const it of items) {
      if (it.incoming) it.incoming.apply();
      let prId = it.pr ? it.pr.id : null;
      if (it.condition !== 'reject') {
        let pr = it.pr;
        if (!pr) { pr = createPR(state, null, it.p.id, it.qty, { whId: wh.id }); prId = pr.id; }
        pr.received = round2(pr.received + it.qty);
        if (pr.status === 'open' && pr.received >= pr.qty) pr.status = 'done';
      }
      for (const id of it.rollIds) rolls.push(byId(state.rolls, id));
      receipt.lines.push({ productId: it.p.id, prId, qty: it.qty, shelf: it.at, condition: it.condition, rollIds: it.rollIds });
    }
    state.receipts.push(receipt);
    const readied = [];
    for (const id of new Set(items.filter(i => i.condition === 'ok').map(i => i.p.id))) readied.push(...reserveForWaiting(state, id, wh.id));
    const text = items.map(i => i.incoming ? i.incoming.text : fmt(i.qty, i.p.unit)).join(', ');
    S.log(state, userId, 'receive', receipt.id, `รับของเข้า${wh.name} ${receipt.lines.length} รายการ${reason ? ` · เหตุผลรับเกิน: ${reason}` : ''}`);
    return { receipt, readied, rolls, text };
  };
})();

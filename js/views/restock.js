var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// รับของเข้า (#/restock) ทีละขั้น: ของที่มาส่ง → จำนวน → เก็บที่ไหน → ยืนยัน · ?pr=ID เลือกรายการต้องซื้อให้ครั้งเดียว
(function () {
  const S = SM.store, T = SM.T, RC = T.RC;
  const r2 = (n) => Math.round(n * 100) / 100;
  const blank = (v) => v === '' || v === null || v === undefined;
  const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const today = () => new Date().toLocaleDateString('sv');
  const defShelf = (whId) => { const l = S.shelves(SM.state, whId); return l.includes('ทั่วไป') ? 'ทั่วไป' : l[0] || ''; };
  // ม้วนละ p.rollSize (ไม่มีให้ถือ 100 m) แถวสุดท้ายคือเศษ รวมแล้วเท่าที่ค้างรับ
  const splitRolls = (out, size) => {
    if (!(out > 0)) return [''];
    const n = Math.ceil(out / size - 1e-9);
    return Array.from({ length: n }, (_, i) => (i < n - 1 ? size : r2(out - size * (n - 1))));
  };

  SM.views.restock = {
    props: { route: Object },
    data: () => ({
      s: SM.state, RC, when, tab: 'recv', q: '', lines: [], whId: '', shelf: '', split: false, note: '', invoiceNo: '', vendor: '', receivedAt: today(),
      overReason: '', err: '', result: null, find: false, findQ: '', creating: false, scanErr: '', consumed: false, printRolls: null,
    }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      canReceive() { return this.user.role !== 'engineer'; },
      prs() { return this.s.prs.filter(p => p.status === 'open'); },
      todo() { return this.prs.filter(p => S.outstanding(this.s, p.id) > 0); },
      low() { return S.lowStock(this.s); },
      stock() {
        const q = this.q.trim().toLowerCase();
        return this.s.products.filter(p => p.active !== false && (!q || [p.name, p.brand, p.model, p.id].some(v => (v || '').toLowerCase().includes(q))))
          .map(p => ({
            p,
            whs: this.s.warehouses.map(w => ({ w, qty: S.available(this.s, p.id, w.id), rolls: this.s.rolls.filter(r => r.productId === p.id && r.whId === w.id).length })).filter(x => x.qty > 0),
          }));
      },
      tabs() {
        const t = [['buy', 'ต้องซื้อ', this.prs.length], ['low', 'ใกล้หมด', this.low.length], ['stock', 'ยอดคงเหลือ', 0]];
        return this.canReceive ? [['recv', 'รับของ', 0], ...t] : t;
      },
      // เลือกการ์ดรายการต้องซื้อแล้ว ต้องรับเข้าคลังของการ์ดแรก
      forcedWh() { const l = this.lines.find(x => x.prId); return l ? this.s.prs.find(p => p.id === l.prId).whId : ''; },
      whs() { return this.s.warehouses.filter(w => w.active !== false); },
      shelves() { return this.whId ? S.shelves(this.s, this.whId) : []; },
      filledLines() { return this.lines.filter(l => this.filled(l)); },
      step3() { return this.filledLines.length > 0 && this.filledLines.every(l => !this.lineErr(l)); },
      hasOk() { return this.filledLines.some(l => l.cond === 'ok'); },
      hasDamaged() { return this.filledLines.some(l => l.cond === 'damaged'); },
      over() {   // รับเกินที่สั่ง (ไม่นับของส่งคืนผู้ขาย)
        return this.filledLines.filter(l => l.prId && l.cond !== 'reject' && !this.lineErr(l) && this.base(l) > S.outstanding(this.s, l.prId))
          .map(l => ({ l, text: `${this.$product(l.productId).name}: รับเกินที่สั่ง ${this.$fmt(r2(this.base(l) - S.outstanding(this.s, l.prId)), this.$product(l.productId).unit)} ใส่เหตุผล` }));
      },
      whBad() {
        const w = this.s.warehouses.find(x => x.id === this.whId);
        if (!w) return '';
        if (w.locked) return RC.locked;
        return w.active === false ? `${w.name} ปิดใช้งานอยู่ — รับของเข้าไม่ได้ (เปิดใช้อีกครั้งก่อน)` : '';
      },
      ready() {
        return this.step3 && !!this.whId && !this.whBad && (!this.hasOk || (!!this.shelf && this.shelves.includes(this.shelf)))
          && (!this.over.length || !!this.overReason.trim());
      },
      finds() {
        const q = this.findQ.trim().toLowerCase();
        if (!q) return [];
        return this.s.products.filter(p => p.active !== false && [p.name, p.brand, p.model, p.id, p.vendorCode].some(v => (v || '').toLowerCase().includes(q))).slice(0, 8);
      },
      recent() { return this.s.receipts.slice(-8).reverse(); },
      leftOpen() { return this.result ? this.result.receipt.lines.filter(l => l.prId).map(l => this.s.prs.find(p => p.id === l.prId)).filter(p => p && p.status === 'open') : []; },
      qrNames() { return this.result ? [...new Set(this.result.rolls.map(r => this.$product(r.productId).name))] : []; },
    },
    watch: {
      'route.query.pr'() { this.consumed = false; this.tryPre(); },
      'user.id'() {
        this.result = null; this.err = '';
        if (!this.canReceive) { this.tab = 'buy'; this.clearForm(); } else if (this.tab === 'buy' && !this.route.query.pr) this.tab = 'recv';
        this.tryPre();
      },
    },
    created() { if (!this.canReceive) this.tab = 'buy'; this.tryPre(); },
    methods: {
      tryPre() {
        const id = this.route.query.pr;
        if (!id || this.consumed || !this.canReceive) return;
        this.consumed = true;
        const pr = this.todo.find(p => p.id === id);
        if (pr) this.startPr(pr.id);
      },
      // ---- เลือกของ ----
      mkLine(p, pr) {
        const out = pr ? S.outstanding(this.s, pr.id) : 0;
        return { productId: p.id, prId: pr ? pr.id : null, qty: p.isRoll ? '' : (pr ? out : ''), unit: 'base',
          rolls: p.isRoll ? (pr ? splitRolls(out, p.rollSize || 100) : ['']) : [], batch: '', cond: 'ok', shelf: '' };
      },
      isSel(pr) { return this.lines.some(l => l.prId === pr.id); },
      other(pr) { return !!this.forcedWh && pr.whId !== this.forcedWh && !this.isSel(pr); },
      startPr(id) {
        this.tab = 'recv'; this.result = null; this.err = '';
        if (!this.lines.some(l => l.prId === id)) this.togglePr(this.todo.find(p => p.id === id));
        this.$nextTick(() => window.scrollTo(0, 0));
      },
      togglePr(pr) {
        if (!pr) return;
        this.err = '';
        if (this.isSel(pr)) this.lines = this.lines.filter(l => l.prId !== pr.id);
        else if (!this.other(pr)) this.lines.push(this.mkLine(this.$product(pr.productId), pr));
        this.syncWh();
      },
      addLoose(p) {
        this.tab = 'recv'; this.result = null; this.err = '';
        if (!this.lines.some(l => l.productId === p.id && !l.prId)) this.lines.push(this.mkLine(p, null));
        this.find = false; this.findQ = ''; this.creating = false; this.syncWh();
      },
      removeLine(l) { this.lines = this.lines.filter(x => x !== l); this.syncWh(); },
      onScan(r) {
        this.scanErr = '';
        const p = this.s.products.find(x => x.id === r.id);
        if (!p) { this.scanErr = RC.scanNone(r.id); return; }
        const pr = this.todo.find(x => x.productId === p.id && !this.other(x));
        if (pr) { if (!this.isSel(pr)) this.togglePr(pr); } else this.addLoose(p);
      },
      syncWh() {
        if (this.forcedWh) { if (this.whId !== this.forcedWh) this.setWh(this.forcedWh); }
        else if (!this.whId) { const w = this.whs.find(x => !x.locked) || this.whs[0]; if (w) this.setWh(w.id); }
        if (!this.lines.length) this.whId = '';
      },
      setWh(id) { this.whId = id; this.shelf = id ? defShelf(id) : ''; this.lines.forEach(l => { l.shelf = ''; }); },
      clearForm() {
        this.lines = []; this.whId = ''; this.shelf = ''; this.split = false; this.note = ''; this.invoiceNo = ''; this.vendor = '';
        this.receivedAt = today(); this.overReason = ''; this.err = ''; this.find = false; this.findQ = '';
      },
      // ---- จำนวน ----
      base(l) {
        const p = this.$product(l.productId);
        if (p.isRoll) return r2(l.rolls.filter(n => !blank(n)).reduce((a, n) => a + Number(n), 0));
        return r2(Number(l.qty) * (l.unit === 'buy' ? (p.buyFactor || 1) : 1));
      },
      filled(l) { return this.$product(l.productId).isRoll ? l.rolls.some(n => !blank(n)) : !blank(l.qty) && Number(l.qty) !== 0; },
      lineErr(l) {
        if (!this.filled(l)) return '';
        const p = this.$product(l.productId);
        if (p.isRoll) return l.rolls.some(n => !blank(n) && !(Number(n) >= 0)) ? T.N14.rolls : '';
        return S.qtyError(p, this.base(l)) || '';
      },
      short(l) { return !!l.prId && this.filled(l) && !this.lineErr(l) && (l.cond === 'reject' || this.base(l) < S.outstanding(this.s, l.prId)); },
      setUnit(l, u) {
        const b = this.base(l), p = this.$product(l.productId);
        l.unit = u; if (!blank(l.qty)) l.qty = r2(u === 'buy' ? b / (p.buyFactor || 1) : b);
      },
      buyUnitOn(p) { return !p.isRoll && p.buyFactor > 1 && p.buyUnit && p.buyUnit !== p.unit; },
      // ---- บันทึก ----
      save() {
        if (!this.ready) return;
        const lines = this.filledLines.map(l => {
          const o = { productId: l.productId, condition: l.cond };
          if (l.prId) o.prId = l.prId;
          if (this.$product(l.productId).isRoll) { o.rollLengths = l.rolls.map(n => (blank(n) ? '' : Number(n))); if (l.batch.trim()) o.batch = l.batch.trim(); }
          else { o.qty = Number(l.qty); o.unit = l.unit; }
          if (l.cond === 'ok' && this.split && l.shelf) o.shelf = l.shelf;
          return o;
        });
        try {
          const r = S.receive(this.s, { whId: this.whId, shelf: this.shelf, invoiceNo: this.invoiceNo, vendor: this.vendor, receivedAt: this.receivedAt,
            note: this.note, overReason: this.overReason, lines }, this.user.id);
          this.result = r; this.clearForm(); SM.toast('ok', RC.saved);
          this.$nextTick(() => window.scrollTo(0, 0));
        } catch (e) { this.err = e.message; }
      },
      print() {
        this.printRolls = this.result.rolls.map(r => ({ id: r.id, name: this.$product(r.productId).name, len: r.length }));
        this.$nextTick(() => window.print());
      },
      // ยอดรวม = ผลรวมของแถวคลังที่แสดง (ยอดเบิกได้ หักที่กันไว้แล้ว) ตัวเลขจึงบวกกันลงตัว
      sumQty(whs) { return Math.round(whs.reduce((a, x) => a + x.qty, 0) * 100) / 100; },
      out(id) { return S.outstanding(this.s, id); },
      prOf(id) { return this.s.prs.find(p => p.id === id); },
      topup(id) { this.addLoose(this.$product(id)); },
    },
    template: `
<div class="narrow stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">รับของ / ต้องซื้อ</h1></div>
  <p v-if="!canReceive" class="msg info"><ic n="info"/><span>บัญชีนี้ดูรายการได้ การรับของเข้าคลังทำโดย Store หรือหัวหน้า</span></p>
  <div class="tabs" role="tablist">
    <button v-for="[k, label, n] in tabs" :key="k" role="tab" :aria-selected="tab === k" @click="tab = k">{{ label }}<span v-if="n"> ({{ n }})</span></button>
  </div>

  <template v-if="tab === 'recv' && canReceive">
    <!-- ผลลัพธ์ -->
    <section v-if="result" class="card result ok stack" aria-live="polite" aria-labelledby="rc-rs">
      <div class="row"><span class="res-ic ok"><ic n="check" lg/></span>
        <div class="grow"><h2 id="rc-rs">{{ RC.saved }}</h2>
          <p class="small">{{ RC.receipt(result.receipt.id, result.readied.length) }}</p></div>
        <button class="btn ghost icon" @click="result = null" aria-label="ปิดผลลัพธ์"><ic n="x"/></button></div>
      <div class="rows">
        <p v-for="(l, i) in result.receipt.lines" :key="i" class="small"><b>{{ $product(l.productId).name }}</b> · รับ {{ $fmt(l.qty, $product(l.productId).unit) }} · {{ RC.COND[l.condition] }}<template v-if="l.shelf"> · เก็บที่ {{ l.shelf === 'QC' ? 'ชั้นรอตรวจ' : l.shelf }}</template></p>
      </div>
      <template v-if="result.rolls.length">
        <div class="stack" style="gap:6px"><b>ม้วนที่สร้าง</b>
          <p v-for="r in result.rolls" :key="r.id" class="small"><span class="mono">{{ r.id }}</span> · {{ $product(r.productId).name }} · {{ $fmt(r.length, 'm') }}</p></div>
        <p class="msg warn"><ic n="warn"/><span>{{ RC.qr(qrNames) }}</span></p>
        <button class="btn block" @click="print"><ic n="print"/>พิมพ์ป้ายเลขม้วน / ฉลาก QR</button>
      </template>
      <div v-for="p in leftOpen" :key="p.id" class="msg info mwrap"><ic n="info"/>
        <span class="grow">{{ $product(p.productId).name }} ยังค้างรับ {{ $fmt(out(p.id), $product(p.productId).unit) }} เปิดค้างไว้ให้รับต่อ</span>
        <button class="btn" @click="startPr(p.id)">รับต่อ</button></div>
    </section>

    <!-- ขั้น 1 -->
    <section class="card stack" aria-labelledby="rc1">
      <div class="step-head"><span class="step-no">1</span><h2 id="rc1" class="grow req">ของที่มาส่ง</h2></div>
      <div class="row" style="align-items:flex-end">
        <p class="muted small grow">แตะรายการที่ของมาถึงแล้ว เลือกได้หลายรายการ (ต้องรับเข้าคลังเดียวกัน)</p>
        <div class="row"><scan-button :kinds="['product']" @found="onScan"/></div></div>
      <p v-if="scanErr" class="msg bad" role="alert"><ic n="x"/><span>{{ scanErr }}</span></p>
      <p v-if="!todo.length" class="muted">{{ RC.empty }}</p>
      <div class="whlist" role="group" aria-label="รายการต้องซื้อที่ค้างรับ">
        <label v-for="pr in todo" :key="pr.id" class="whopt" :class="{ sel: isSel(pr), dis: other(pr) }">
          <input type="checkbox" :checked="isSel(pr)" :disabled="other(pr)" @change="togglePr(pr)">
          <img class="thumb" :src="$product(pr.productId).img" alt="" @error="$noImg">
          <span class="grow"><b>{{ $product(pr.productId).name }}</b><br>
            <span class="muted small">สั่ง {{ $fmt(pr.qty, $product(pr.productId).unit) }} · รับแล้ว {{ $fmt(pr.received, $product(pr.productId).unit) }}</span><br>
            <span class="small"><b>ค้างรับ {{ $fmt(out(pr.id), $product(pr.productId).unit) }}</b> · {{ $wh(pr.whId).name }}</span></span>
          <span v-if="other(pr)" class="tag warn"><ic n="warn"/>{{ RC.otherWh }}</span>
        </label>
      </div>
      <div v-if="!find" class="row wrap">
        <button class="link" style="justify-self:start" @click="find = true">ของมาส่งโดยไม่มีใบขอซื้อ</button></div>
      <div v-else class="stack">
        <div class="row" style="align-items:flex-end">
          <div class="field grow"><label for="rc-f">ค้นหาสินค้าที่มาส่ง</label>
            <input id="rc-f" class="input" type="search" v-model="findQ" placeholder="ชื่อ ยี่ห้อ รหัส" autocomplete="off"></div>
          <button class="btn" @click="find = false; findQ = ''">ปิด</button></div>
        <button v-for="p in finds" :key="p.id" class="card ocard reqcard" @click="addLoose(p)">
          <span class="row"><img class="thumb sm" :src="p.img" alt="" @error="$noImg"><b class="grow">{{ p.name }}</b><ic n="plus" class="muted"/></span></button>
        <p v-if="findQ.trim() && !finds.length" class="muted">{{ RC.noMatch(findQ.trim()) }}</p>
        <button class="btn block" @click="creating = true"><ic n="plus"/>สินค้าไม่มีรหัส</button>
      </div>
    </section>

    <!-- ขั้น 2 -->
    <div v-if="!lines.length" class="lockbar"><ic n="lock"/><span>{{ RC.step2Lock }}</span></div>
    <section v-else class="card stack open-anim" aria-labelledby="rc2">
      <div class="step-head"><span class="step-no">2</span><h2 id="rc2" class="grow req">จำนวนที่รับ</h2></div>
      <div class="clines">
        <div v-for="l in lines" :key="l.prId || l.productId" class="rline">
          <div class="row" style="align-items:flex-start">
            <img class="thumb" :src="$product(l.productId).img" alt="" @error="$noImg">
            <div class="grow"><p><b>{{ $product(l.productId).name }}</b></p>
              <template v-if="l.prId"><p class="muted small">สั่ง {{ $fmt(prOf(l.prId).qty, $product(l.productId).unit) }} · รับแล้ว {{ $fmt(prOf(l.prId).received, $product(l.productId).unit) }}</p>
                <p class="small"><b>ค้างรับ {{ $fmt(out(l.prId), $product(l.productId).unit) }}</b></p></template>
              <p v-else class="muted small">ไม่มีใบขอซื้อ</p></div>
            <button class="btn ghost icon" @click="removeLine(l)" :aria-label="'เอา ' + $product(l.productId).name + ' ออก'"><ic n="x"/></button></div>

          <div v-if="!$product(l.productId).isRoll" class="field"><label :for="'rq-' + (l.prId || l.productId)">จำนวนที่รับจริง</label>
            <div class="unitbox" :class="{ bad: lineErr(l) }"><input :id="'rq-' + (l.prId || l.productId)" type="number" inputmode="decimal" step="any" min="0" v-model.number="l.qty"><span>{{ l.unit === 'buy' ? $product(l.productId).buyUnit : $product(l.productId).unit }}</span></div>
            <p v-if="lineErr(l)" class="err" role="alert">{{ lineErr(l) }}</p></div>
          <div v-else class="stack" style="gap:8px">
            <span class="label">ม้วนที่รับ (ม้วนละกี่เมตร)</span>
            <div v-for="(n, i) in l.rolls" :key="i" class="row">
              <label :for="'rr-' + l.productId + i" style="white-space:nowrap">ม้วนที่ {{ i + 1 }}</label>
              <div class="unitbox grow"><input :id="'rr-' + l.productId + i" type="number" inputmode="decimal" step="any" min="0" v-model.number="l.rolls[i]"><span>m</span></div>
              <button class="btn ghost icon" :disabled="l.rolls.length === 1" @click="l.rolls.splice(i, 1)" :aria-label="'ลบม้วนที่ ' + (i + 1)"><ic n="x"/></button></div>
            <button class="btn" @click="l.rolls.push('')"><ic n="plus"/>เพิ่มม้วน</button>
            <p><b>รวม {{ l.rolls.filter(n => n !== '' && n !== null && Number(n) > 0).length }} ม้วน {{ $fmt(base(l), 'm') }}</b> <span class="muted small">· ระบบจะออกเลขม้วนให้อัตโนมัติ</span></p>
            <p v-if="lineErr(l)" class="err" role="alert">{{ lineErr(l) }}</p>
            <div class="field"><label :for="'rb-' + l.productId">ล็อตผู้ผลิต (ไม่บังคับ)</label>
              <input :id="'rb-' + l.productId" class="input" v-model="l.batch" placeholder="เช่น TH-2408" autocomplete="off"></div>
          </div>

          <div class="chips" role="group" :aria-label="'สภาพ ' + $product(l.productId).name">
            <button v-for="(t, c) in RC.COND" :key="c" type="button" class="chip" :aria-pressed="l.cond === c" @click="l.cond = c">{{ t }}</button></div>
          <p v-if="l.cond === 'damaged'" class="msg warn"><ic n="warn"/><span>{{ RC.damaged }}</span></p>
          <p v-if="l.cond === 'reject'" class="msg info"><ic n="info"/><span>{{ RC.reject }}</span></p>
          <p v-if="short(l)" class="msg warn"><ic n="warn"/><span>{{ RC.short }}</span></p>

          <details v-if="buyUnitOn($product(l.productId))"><summary>ข้อมูลเพิ่มเติม</summary>
            <div class="stack" style="margin-top:8px;gap:8px"><span class="label">หน่วยที่นับ</span>
              <div class="chips" role="group" aria-label="หน่วย">
                <button type="button" class="chip" :aria-pressed="l.unit === 'base'" @click="setUnit(l, 'base')">{{ $product(l.productId).unit }}</button>
                <button type="button" class="chip" :aria-pressed="l.unit === 'buy'" @click="setUnit(l, 'buy')">{{ $product(l.productId).buyUnit }}</button></div>
              <p v-if="l.unit === 'buy'" class="small"><b>= {{ $fmt(base(l), $product(l.productId).unit) }}</b></p></div></details>
        </div>
      </div>
      <div v-if="over.length" class="stack" style="gap:8px">
        <p v-for="o in over" :key="o.l.prId" class="msg warn" role="alert"><ic n="warn"/><span>{{ o.text }}</span></p>
        <div class="field"><label for="rc-ov" class="req">เหตุผลที่รับเกิน</label>
          <input id="rc-ov" class="input" v-model="overReason" placeholder="เช่น ผู้ขายแถมให้ ส่งเกินมา" autocomplete="off"></div></div>
    </section>

    <!-- ขั้น 3 -->
    <div v-if="!step3" class="lockbar"><ic n="lock"/><span>{{ RC.step3Lock }}</span></div>
    <section v-else class="card stack open-anim" aria-labelledby="rc3">
      <div class="step-head"><span class="step-no">3</span><h2 id="rc3" class="grow req">เก็บที่ไหน</h2></div>
      <div class="whlist" role="radiogroup" aria-label="รับเข้าคลัง">
        <label v-for="w in whs" :key="w.id" class="whopt" :class="{ sel: whId === w.id, dis: w.locked || (forcedWh && forcedWh !== w.id) }">
          <input type="radio" name="rc-wh" :value="w.id" :checked="whId === w.id" :disabled="w.locked || (forcedWh && forcedWh !== w.id)" @change="setWh(w.id)">
          <span class="grow"><b>{{ w.name }}</b><br><span class="muted small">{{ w.locked ? RC.locked : w.site }}</span></span>
          <span v-if="w.locked" class="tag warn"><ic n="lock"/>กำลังนับสต็อก</span>
          <span v-else-if="forcedWh && forcedWh !== w.id" class="tag warn">{{ RC.otherWh }}</span>
        </label>
      </div>
      <p v-if="whBad" class="msg bad" role="alert"><ic n="lock"/><span>{{ whBad }}</span></p>
      <template v-if="hasOk && whId && !whBad">
        <p v-if="!shelves.length" class="msg warn"><ic n="warn"/><span>{{ RC.noShelf }}</span></p>
        <div v-else class="stack" style="gap:6px"><span class="label">เก็บที่ชั้น (ของครบดี)</span>
          <div class="chips" role="group" aria-label="ชั้นวาง">
            <button v-for="c in shelves" :key="c" type="button" class="chip" :aria-pressed="shelf === c" @click="shelf = c">{{ c }}</button></div></div>
        <button v-if="shelves.length && filledLines.length > 1" class="link" style="justify-self:start" @click="split = !split">{{ split ? 'ใช้ชั้นเดียวกันทุกรายการ' : 'แยกชั้นรายการ' }}</button>
        <div v-if="split" class="stack" style="gap:8px">
          <div v-for="l in filledLines.filter(x => x.cond === 'ok')" :key="l.prId || l.productId" class="field">
            <label :for="'rs-' + (l.prId || l.productId)">{{ $product(l.productId).name }}</label>
            <select :id="'rs-' + (l.prId || l.productId)" class="input" v-model="l.shelf"><option value="">ชั้นเดียวกับข้างบน ({{ shelf }})</option>
              <option v-for="c in shelves" :key="c" :value="c">{{ c }}</option></select></div></div>
      </template>
      <p v-if="hasDamaged" class="msg warn"><ic n="warn"/><span class="grow">{{ RC.damaged }} <a href="#/qc">ไปที่ชั้นรอตรวจ</a></span></p>
      <details><summary>ข้อมูลใบส่งของ</summary>
        <div class="stack" style="margin-top:8px;gap:8px">
          <div class="field"><label for="rc-inv">เลขใบส่งของ / ใบกำกับ</label><input id="rc-inv" class="input" v-model="invoiceNo" autocomplete="off"></div>
          <div class="field"><label for="rc-vd">ผู้ขาย</label><input id="rc-vd" class="input" v-model="vendor" autocomplete="off"></div>
          <div class="field"><label for="rc-dt">วันที่รับ</label><input id="rc-dt" class="input" type="date" v-model="receivedAt"></div>
          <div class="field"><label for="rc-nt">หมายเหตุ</label><textarea id="rc-nt" class="input" rows="2" v-model="note" placeholder="เช่น ส่งโดยไฟฟ้าสยาม"></textarea></div></div></details>
    </section>

    <div v-if="step3 && !ready" class="lockbar"><ic n="lock"/><span>{{ over.length && !overReason.trim() ? 'ใส่เหตุผลที่รับเกินก่อน' : RC.lastLock }}</span></div>
    <div v-if="ready" class="submitbar">
      <p v-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>
      <p class="small"><b>จะรับ {{ filledLines.length }} รายการ</b><template v-if="whId"> เข้า{{ $wh(whId).name }}</template></p>
      <button class="btn primary big block" @click="save"><ic n="truck"/>ยืนยันรับของเข้า</button>
    </div>
    <p v-else-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>

    <!-- รับเข้าล่าสุด -->
    <section class="card stack" aria-labelledby="rc-lt">
      <h2 id="rc-lt">รับเข้าล่าสุด</h2>
      <p v-if="!recent.length" class="muted">{{ RC.recentEmpty }}</p>
      <div class="rows">
        <div v-for="r in recent" :key="r.id" class="stack" style="gap:6px">
          <b class="mono">{{ r.id }}</b>
          <p class="muted small">{{ when(r.at) }} · {{ $userOf(r.byUserId).name }} · {{ $wh(r.whId).name }}</p>
          <p v-for="(l, i) in r.lines" :key="i" class="small">{{ $product(l.productId).name }} · รับ {{ $fmt(l.qty, $product(l.productId).unit) }} · {{ RC.COND[l.condition] }}</p>
        </div>
      </div>
    </section>
  </template>

  <section v-else-if="tab === 'buy'" class="stack" aria-label="รายการต้องซื้อ">
    <div v-if="!prs.length" class="empty"><ic n="check"/><p>ไม่มีรายการต้องซื้อค้างอยู่</p></div>
    <article v-for="pr in prs" :key="pr.id" class="card stack">
      <div class="row" style="align-items:flex-start"><img class="thumb" :src="$product(pr.productId).img" alt="" @error="$noImg">
        <div class="grow"><p><b>{{ $product(pr.productId).name }}</b></p>
          <p class="muted small"><template v-if="pr.reqId">ขาดจากใบเบิก <a :href="'#/orders/' + pr.reqId" class="mono">{{ pr.reqId }}</a> · </template>ส่งเข้า{{ $wh(pr.whId).name }}</p></div></div>
      <dl class="nums"><div class="kv"><dt>ต้องซื้อ</dt><dd>{{ $fmt(pr.qty, $product(pr.productId).unit) }}</dd></div>
        <div class="kv"><dt>รับแล้ว</dt><dd>{{ $fmt(pr.received, $product(pr.productId).unit) }}</dd></div></dl>
      <button v-if="canReceive" class="btn primary block" @click="startPr(pr.id)"><ic n="truck"/>รับของเข้า</button>
    </article>
  </section>

  <section v-else-if="tab === 'low'" class="stack" aria-label="ของใกล้หมด">
    <div v-if="!low.length" class="empty"><ic n="check"/><p>ไม่มีของที่ต่ำกว่าเกณฑ์เตือน</p></div>
    <article v-for="x in low" :key="x.product.id" class="card stack">
      <div class="row" style="align-items:flex-start"><img class="thumb" :src="x.product.img" alt="" @error="$noImg">
        <div class="grow"><p><b>{{ x.product.name }}</b></p><span class="tag warn"><ic n="warn"/>ใกล้หมด</span></div></div>
      <dl class="nums"><div class="kv"><dt>เหลือรวมทุกคลัง</dt><dd>{{ $fmt(x.total, x.product.unit) }}</dd></div>
        <div class="kv"><dt>เกณฑ์เตือน</dt><dd>{{ $fmt(x.reorderPoint, x.product.unit) }}</dd></div></dl>
      <button v-if="canReceive" class="btn primary block" @click="topup(x.product.id)"><ic n="plus"/>เติมสต็อก</button>
    </article>
  </section>

  <section v-else class="stack" aria-label="ยอดคงเหลือ">
    <div class="field"><label for="st-q">ค้นหาสินค้า</label><input id="st-q" class="input" type="search" v-model="q" placeholder="ชื่อ ยี่ห้อ รหัส"></div>
    <article v-for="x in stock" :key="x.p.id" class="card stack">
      <div class="row" style="align-items:flex-start"><img class="thumb" :src="x.p.img" alt="" @error="$noImg">
        <div class="grow"><p><b>{{ x.p.name }}</b></p>
          <p class="small" :class="x.whs.length ? 't-brand' : 't-bad'"><b>เบิกได้รวมทุกคลัง {{ $fmt(sumQty(x.whs), x.p.unit) }}</b></p></div>
        <button v-if="canReceive" class="btn" @click="topup(x.p.id)" :aria-label="'เติมสต็อก ' + x.p.name"><ic n="plus"/>เติม</button></div>
      <dl v-if="x.whs.length" class="whnums">
        <div v-for="y in x.whs" :key="y.w.id" class="kv"><dt>{{ y.w.name }}</dt><dd>{{ $fmt(y.qty, x.p.unit) }}<span v-if="y.rolls" class="muted"> ({{ y.rolls }} ม้วน)</span></dd></div></dl>
    </article>
  </section>

  <product-dialog v-if="creating" :initial-name="findQ" from-search @created="addLoose" @use-existing="addLoose" @close="creating = false"/>
  <div v-for="r in (printRolls || [])" :key="r.id" class="print-label" aria-hidden="true" style="break-after:page">
    <p class="pl-id">{{ r.id }}</p><p class="pl-name">{{ r.name }}</p><p class="pl-len">ยาว {{ $fmt(r.len, 'm') }}</p>
  </div>
</div>`,
  };
})();

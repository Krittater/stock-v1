var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// คืนของ (#/returns) ทีละขั้น: ของ → จำนวนและสภาพ → คืนเข้าคลังไหน → บันทึก · ?req=ID เลือกใบให้ครั้งเดียว (เฉพาะใบที่ผู้ใช้คนนี้เห็น)
(function () {
  const S = SM.store, T = SM.T, RT = T.RT;
  const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const blank = (v) => v === '' || v === null || v === undefined;
  const rollsOf = (l) => [...new Set(l.cuts.map(c => c.rollId))];   // ม้วนซ้ำในรายการตัด แสดงครั้งเดียว
  const newLine = (l) => ({ qty: '', cond: 'ok', rollId: rollsOf(l)[0] || '', photo: null, busy: false, tok: 0, shelf: '' });

  // ย่อรูปเหลือด้านยาวไม่เกิน 320px เก็บเป็น dataURL
  const shrink = SM.shrinkImage = (file) => new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 320 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('อ่านรูปไม่ได้ ลองถ่ายใหม่')); };
    img.src = url;
  });

  const defShelf = (whId) => { const l = S.shelves(SM.state, whId); return l.includes('ทั่วไป') ? 'ทั่วไป' : l[0] || ''; };

  // เลือกคลัง + ชั้น (ใช้ทั้งฟอร์มคืนตามใบเบิกและคืนไม่มีใบเบิก)
  const Place = {
    props: { whId: String, shelf: String, needShelf: Boolean, name: String },
    emits: ['wh', 'shelf'],
    data: () => ({ s: SM.state, RT }),
    computed: {
      whs() { return this.s.warehouses.filter(w => w.active !== false); },
      shelves() { return this.whId ? S.shelves(this.s, this.whId) : []; },
    },
    template: `
<div class="stack">
  <div class="whlist" role="radiogroup" aria-label="คืนเข้าคลัง">
    <label v-for="w in whs" :key="w.id" class="whopt" :class="{ sel: whId === w.id }">
      <input type="radio" :name="name" :value="w.id" :checked="whId === w.id" @change="$emit('wh', w.id)">
      <span class="grow"><b>{{ w.name }}</b><br><span class="muted small">{{ w.site }}</span></span>
      <span v-if="w.locked" class="tag warn"><ic n="lock"/>กำลังนับสต็อก</span>
    </label>
  </div>
  <template v-if="needShelf && whId">
    <p v-if="!shelves.length" class="msg warn"><ic n="warn"/><span>{{ RT.noShelf }}</span></p>
    <div v-else class="stack" style="gap:6px"><span class="label">เก็บที่ชั้น (ของที่ใช้ได้)</span>
      <div class="chips" role="group" aria-label="ชั้นวาง">
        <button v-for="c in shelves" :key="c" type="button" class="chip" :aria-pressed="shelf === c" @click="$emit('shelf', c)">{{ c }}</button></div></div>
  </template>
</div>`,
  };

  SM.views.returns = {
    props: { route: Object },
    components: { 'ret-place': Place },
    data: () => ({
      s: SM.state, T, RT, when, q: '', shown: 8, reqId: null, f: {}, whId: '', shelf: '', split: false, note: '', err: '', result: null,
      scanErr: '', consumed: false, loose: false, lf: {}, lfErr: '', confirmRev: null, revErr: '', printRoll: null,
    }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      staff() { return this.user.role !== 'engineer'; },
      all() { return S.returnable(this.s, this.user.id); },
      list() { return this.q.trim() ? S.returnable(this.s, this.user.id, this.q) : this.all; },
      sel() { return this.all.find(x => x.req.id === this.reqId) || null; },
      filled() { return this.sel ? this.sel.lines.filter(l => this.f[l.productId] && !blank(this.f[l.productId].qty)) : []; },
      step3() { return this.filled.length > 0 && this.filled.every(l => !this.lineErr(l)); },
      hasOk() { return this.filled.some(l => this.f[l.productId].cond === 'ok'); },
      hasDamaged() { return this.filled.some(l => this.f[l.productId].cond === 'damaged'); },
      shelves() { return this.whId ? S.shelves(this.s, this.whId) : []; },
      busy() { return Object.values(this.f).some(v => v.busy); },
      ready() { return this.step3 && !!this.whId && (!this.hasOk || (!!this.shelf && this.shelves.includes(this.shelf))); },
      recent() { return this.s.returns.slice(-5).reverse(); },
      products() { return this.s.products.filter(p => p.active !== false); },
      lp() { return this.s.products.find(p => p.id === this.lf.productId) || null; },
      lq() { return this.lp && !blank(this.lf.qty) ? S.qtyError(this.lp, this.lf.qty) : null; },
      lqOk() { return !!this.lp && !blank(this.lf.qty) && !this.lq; },
      lready() { return this.lqOk && !!this.lf.whId && (this.lf.cond !== 'ok' || (!!this.lf.shelf && S.shelves(this.s, this.lf.whId).includes(this.lf.shelf))); },
    },
    watch: {
      'route.query.req'() { this.consumed = false; this.tryPre(); },
      'user.id'() {   // สลับผู้ใช้: ทิ้งใบที่เลือกไว้ถ้าคนใหม่มองไม่เห็น แล้วเลือกจาก ?req= ใหม่ถ้าเห็น
        this.result = null; this.loose = false; this.confirmRev = null; this.revErr = ''; this.scanErr = ''; this.shown = 8;
        if (this.reqId && !this.sel) this.reset();
        this.tryPre();
      },
      sel(v) { if (!v && this.reqId) this.reset(); },
    },
    created() { this.tryPre(); },
    methods: {
      tryPre() {
        const id = this.route.query.req;
        if (id && !this.consumed && !this.reqId && this.all.some(x => x.req.id === id)) this.select(id);
      },
      select(id) {
        const x = this.all.find(y => y.req.id === id); if (!x) return;
        this.reqId = id; this.err = ''; this.scanErr = ''; this.split = false; this.note = '';
        this.f = Object.fromEntries(x.lines.map(l => [l.productId, newLine(l)]));
        const wh = this.s.warehouses.find(w => w.id === x.req.whId);
        this.setWh(wh && wh.active !== false ? wh.id : '');
      },
      setWh(id) { this.whId = id; this.shelf = id ? defShelf(id) : ''; Object.values(this.f).forEach(v => { v.shelf = ''; }); },
      reset() { this.reqId = null; this.f = {}; this.whId = ''; this.shelf = ''; this.split = false; this.note = ''; this.err = ''; this.consumed = true; },
      edit() { this.reset(); },   // รูปที่ถ่ายไว้อยู่ใน f จึงถูกทิ้งไปด้วย (RT-AC9)
      onScan(r) {
        this.scanErr = '';
        const hit = r.kind === 'req' ? this.all.find(x => x.req.id === r.id) : this.all.find(x => x.lines.some(l => l.cuts.some(c => c.rollId === r.id)));
        if (!hit) { this.scanErr = RT.scanMiss; return; }
        this.q = ''; this.select(hit.req.id);
      },
      lineErr(l) {
        const v = this.f[l.productId]; if (!v || blank(v.qty)) return '';
        const p = this.$product(l.productId), e = S.qtyError(p, v.qty);
        if (e) return e;
        return Number(v.qty) > l.left ? RT.over(l.left, p.unit) : '';
      },
      shortHint(l) {
        const v = this.f[l.productId], p = this.$product(l.productId);
        if (!p.isRoll || v.cond === 'scrap' || blank(v.qty) || this.lineErr(l)) return '';
        const h = S.returnHint(this.s, p.id, v.qty);
        return h.short ? RT.short(Number(v.qty), h.scrapMin) : '';
      },
      fillAll() { this.sel.lines.forEach(l => { this.f[l.productId].qty = l.left; }); },
      setCond(v, c) { if (c !== 'damaged') { v.tok++; v.photo = null; v.busy = false; } v.cond = c; },   // เลิกเสียหาย = ทิ้งรูป
      async onPhoto(v, e) {
        const file = e.target.files && e.target.files[0]; e.target.value = '';
        if (!file) return;
        const tok = ++v.tok; v.busy = true; this.err = '';
        try { const d = await shrink(file); if (tok === v.tok && v.cond === 'damaged') v.photo = d; }
        catch (x) { if (tok === v.tok) this.err = x.message; }
        finally { if (tok === v.tok) v.busy = false; }
      },
      save() {
        if (!this.ready || this.busy) return;
        const lines = this.filled.map(l => {
          const v = this.f[l.productId], o = { productId: l.productId, qty: Number(v.qty), condition: v.cond };
          if (this.$product(l.productId).isRoll && v.rollId) o.rollId = v.rollId;
          if (v.cond === 'ok' && this.split && v.shelf) o.shelf = v.shelf;
          if (v.cond === 'damaged' && v.photo) o.photo = v.photo;
          return o;
        });
        try {
          const rec = S.returnItems(this.s, { reqId: this.reqId, whId: this.whId, shelf: this.shelf, note: this.note, lines }, this.user.id);
          this.done(rec); this.reset();
        } catch (e) { this.err = e.message; }
      },
      done(rec) { this.result = rec; this.revErr = ''; SM.toast('ok', RT.saved); this.$nextTick(() => window.scrollTo(0, 0)); },
      // คืนไม่มีใบเบิก
      openLoose() {
        const wh = this.s.warehouses.find(w => w.active !== false);
        this.lf = { productId: '', qty: '', cond: 'ok', whId: wh ? wh.id : '', shelf: wh ? defShelf(wh.id) : '', reason: '', jobId: '' };
        this.lfErr = ''; this.loose = true;
      },
      lfWh(id) { this.lf.whId = id; this.lf.shelf = defShelf(id); },
      saveLoose() {
        if (!this.lready) return;
        try {
          const rec = S.returnLoose(this.s, { productId: this.lf.productId, whId: this.lf.whId, shelf: this.lf.shelf, qty: Number(this.lf.qty),
            condition: this.lf.cond, reason: this.lf.reason, jobId: this.lf.jobId || null }, this.user.id);
          this.loose = false; this.done(rec);
        } catch (e) { this.lfErr = e.message; }
      },
      reverse(id) {
        try { S.reverseReturn(this.s, id, this.user.id); SM.toast('ok', 'กลับรายการคืนแล้ว'); this.confirmRev = null; this.revErr = ''; }
        catch (e) { this.revErr = e.message; this.confirmRev = null; }
      },
      print(l) {
        const p = this.$product(l.productId);
        this.printRoll = { id: l.newRollId, name: p.name, len: l.qty };
        this.$nextTick(() => window.print());
      },
    },
    template: `
<div class="narrow stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">คืนของ</h1>
    <a v-if="staff" class="btn" href="#/qc"><ic n="box"/>ชั้นรอตรวจ</a></div>

  <!-- ผลลัพธ์ -->
  <section v-if="result" class="card result ok stack" aria-live="polite" aria-labelledby="rs-t">
    <div class="row"><span class="res-ic ok"><ic n="check" lg/></span>
      <div class="grow"><h2 id="rs-t">{{ RT.saved }}</h2>
        <p class="muted small"><span class="mono">{{ result.id }}</span> · {{ result.reqId ? 'ใบเบิก ' + result.reqId : 'ไม่มีใบเบิก' }} · {{ $wh(result.whId).name }}</p></div>
      <button class="btn ghost icon" @click="result = null" aria-label="ปิดผลลัพธ์"><ic n="x"/></button></div>
    <div class="rows">
      <div v-for="(l, i) in result.lines" :key="i" class="stack" style="gap:6px">
        <p><b>{{ $product(l.productId).name }}</b></p>
        <p class="small">คืน {{ $fmt(l.qty, $product(l.productId).unit) }} · {{ RT.COND[l.condition] }}<template v-if="l.shelf"> · เก็บที่ {{ l.shelf === 'QC' ? 'ชั้นรอตรวจ' : l.shelf }}</template></p>
        <p v-if="l.newRollId" class="small">ม้วนใหม่: <span class="mono">{{ l.newRollId }}</span><span v-if="l.fromRollId" class="muted"> (ตัดมาจาก <span class="mono">{{ l.fromRollId }}</span>)</span></p>
        <button v-if="l.newRollId" class="btn" @click="print(l)"><ic n="print"/>พิมพ์ป้ายเลขม้วน</button>
      </div>
    </div>
  </section>

  <!-- ขั้น 1 -->
  <section v-if="!loose" class="card stack" aria-labelledby="r1">
    <div class="step-head"><span class="step-no">1</span><h2 id="r1" class="grow req">เลือกใบเบิกที่จะคืน</h2></div>
    <div v-if="sel" class="jobsel">
      <ic n="check" class="t-brand"/>
      <span class="grow"><b>ใบเบิก <span class="mono">{{ sel.req.id }}</span> · {{ when(sel.req.at) }}</b><br>
        <span class="muted small">{{ $job(sel.req.jobId).name }}<template v-if="staff"> · เบิกโดย {{ sel.by.name }}</template></span></span>
      <button class="btn" @click="edit">แก้ไข</button>
    </div>
    <template v-else>
      <div class="row" style="align-items:flex-end">
        <div class="field grow"><label for="r-q">ค้นหาใบเบิก</label>
          <input id="r-q" class="input" type="search" v-model="q" @input="shown = 8; scanErr = ''" placeholder="ชื่องาน รหัสใบเบิก ชื่อของ" autocomplete="off"></div>
        <div class="row"><scan-button :kinds="['req','roll']" @found="onScan"/></div>
      </div>
      <p v-if="scanErr" class="msg bad" role="alert"><ic n="x"/><span>{{ scanErr }}</span></p>
      <div v-if="!list.length" class="empty">
        <ic n="undo"/>
        <p v-if="q.trim()">{{ RT.noMatch(q.trim()) }}</p>
        <template v-else><p>{{ RT.empty }}</p><p v-if="!staff" class="small">{{ RT.emptyEng }}</p></template>
      </div>
      <button v-for="x in list.slice(0, shown)" :key="x.req.id" class="card ocard reqcard" @click="select(x.req.id)">
        <span class="row wrap"><b class="mono grow">{{ x.req.id }}</b><span class="muted small">{{ when(x.req.at) }}</span></span>
        <span><b>{{ $job(x.req.jobId).name }}</b></span>
        <span class="row"><img v-for="l in x.lines.slice(0, 3)" :key="l.productId" class="thumb sm" :src="$img($product(l.productId))" alt="" @error="$noImg">
          <span class="muted small grow">{{ x.lines.length }} รายการ · {{ $wh(x.req.whId).name }}<template v-if="staff"> · เบิกโดย {{ x.by.name }}</template></span><ic n="chevron" class="muted"/></span>
      </button>
      <button v-if="list.length > shown" class="btn block" @click="shown += 8">{{ RT.more(list.length - shown) }}</button>
      <button v-if="staff" class="link" style="justify-self:start" @click="openLoose">คืนของที่ไม่มีใบเบิก</button>
    </template>
  </section>

  <!-- คืนไม่มีใบเบิก -->
  <section v-if="loose" class="card stack" aria-labelledby="lo-t">
    <div class="row"><h2 id="lo-t" class="grow">คืนของที่ไม่มีใบเบิก</h2><button class="btn" @click="loose = false">กลับ</button></div>
    <div class="field"><label for="lo-p" class="req">สินค้า</label>
      <select id="lo-p" class="input" v-model="lf.productId"><option value="">เลือกสินค้า</option>
        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
    <div v-if="!lp" class="lockbar"><ic n="lock"/><span>เลือกสินค้าก่อน</span></div>
    <template v-else>
      <div class="field"><label for="lo-q" class="req">{{ lp.isRoll ? 'ความยาวที่คืน' : 'จำนวนที่คืน' }}</label>
        <div class="unitbox" :class="{ bad: lq }"><input id="lo-q" type="number" inputmode="decimal" step="any" min="0" v-model.number="lf.qty"><span>{{ lp.unit }}</span></div>
        <p v-if="lq" class="err" role="alert">{{ lq }}</p></div>
      <div class="chips" role="group" aria-label="สภาพ">
        <button v-for="(t, c) in RT.COND" :key="c" type="button" class="chip" :aria-pressed="lf.cond === c" @click="lf.cond = c">{{ t }}</button></div>
      <div v-if="!lqOk" class="lockbar"><ic n="lock"/><span>ใส่จำนวนที่คืนก่อน</span></div>
      <template v-else>
        <ret-place name="lo-wh" :wh-id="lf.whId" :shelf="lf.shelf" :need-shelf="lf.cond === 'ok'" @wh="lfWh" @shelf="lf.shelf = $event"/>
        <p v-if="lf.cond === 'damaged'" class="msg warn"><ic n="warn"/><span>{{ RT.damaged }}</span></p>
        <div class="field"><label for="lo-r" class="req">ของมาจากไหน</label>
          <input id="lo-r" class="input" v-model="lf.reason" placeholder="เช่น เหลือจากงานเก่า หาใบเบิกไม่เจอ" autocomplete="off"></div>
        <div class="field"><label for="lo-j">งาน (ถ้ามี)</label>
          <select id="lo-j" class="input" v-model="lf.jobId"><option value="">ไม่ระบุงาน</option>
            <option v-for="j in s.jobs" :key="j.id" :value="j.id">{{ j.name }}</option></select></div>
        <p v-if="lfErr" class="msg bad" role="alert"><ic n="x"/><span>{{ lfErr }}</span></p>
        <button class="btn primary big block" :disabled="!lready" @click="saveLoose"><ic n="undo"/>บันทึกคืนของ</button>
      </template>
    </template>
  </section>

  <!-- ขั้น 2 -->
  <template v-if="!loose">
    <div v-if="!sel" class="lockbar"><ic n="lock"/><span>{{ RT.step2Lock }}</span></div>
    <section v-else class="card stack open-anim" aria-labelledby="r2">
      <div class="step-head"><span class="step-no">2</span><h2 id="r2" class="grow req">จำนวนและสภาพ</h2></div>
      <button class="btn soft block" @click="fillAll"><ic n="check"/>คืนทั้งหมด</button>
      <div class="clines">
        <template v-for="l in sel.lines" :key="l.productId">
          <div v-if="f[l.productId]" class="rline">
            <div class="row" style="align-items:flex-start">
              <img class="thumb" :src="$img($product(l.productId))" alt="" @error="$noImg">
              <div class="grow"><p><b>{{ $product(l.productId).name }}</b></p>
                <p class="muted small">จ่ายไป {{ $fmt(l.issued, $product(l.productId).unit) }} · คืนแล้ว {{ $fmt(l.returned, $product(l.productId).unit) }}</p>
                <p class="small"><b>คืนได้อีก {{ $fmt(l.left, $product(l.productId).unit) }}</b></p></div></div>
            <div class="field"><label :for="'rq-' + l.productId">{{ $product(l.productId).isRoll ? 'ความยาวจริงที่คืน' : 'จำนวนที่คืน' }}</label>
              <div class="unitbox" :class="{ bad: lineErr(l) }">
                <input :id="'rq-' + l.productId" type="number" inputmode="decimal" step="any" min="0" v-model.number="f[l.productId].qty" :aria-describedby="'rqe-' + l.productId"><span>{{ $product(l.productId).unit }}</span></div>
              <p v-if="lineErr(l)" :id="'rqe-' + l.productId" class="err" role="alert">{{ lineErr(l) }}</p></div>
            <div class="chips" role="group" :aria-label="'สภาพ ' + $product(l.productId).name">
              <button v-for="(t, c) in RT.COND" :key="c" type="button" class="chip" :aria-pressed="f[l.productId].cond === c" @click="setCond(f[l.productId], c)">{{ t }}</button></div>
            <div v-if="$product(l.productId).isRoll && rollsOf(l).length" class="field"><label :for="'rr-' + l.productId">ตัดมาจากม้วน</label>
              <select :id="'rr-' + l.productId" class="input mono" v-model="f[l.productId].rollId"><option v-for="r in rollsOf(l)" :key="r" :value="r">{{ r }}</option></select></div>
            <p v-if="$product(l.productId).isRoll && f[l.productId].cond !== 'scrap' && f[l.productId].qty !== '' && !lineErr(l)" class="msg info"><ic n="info"/>
              <span>{{ RT.newRoll(Number(f[l.productId].qty), f[l.productId].rollId) }}</span></p>
            <div v-if="shortHint(l)" class="msg warn mwrap"><ic n="warn"/><span class="grow">{{ shortHint(l) }}</span>
              <button class="btn" @click="setCond(f[l.productId], 'scrap')">เปลี่ยนเป็นของเสีย</button></div>
            <div v-if="f[l.productId].cond === 'damaged'" class="stack" style="gap:8px">
              <div class="row wrap">
                <label class="btn filebtn"><ic n="plus"/>{{ f[l.productId].photo ? 'ถ่ายรูปใหม่' : 'ถ่ายรูปของที่เสียหาย' }}
                  <input type="file" accept="image/*" capture="environment" class="sr" @change="onPhoto(f[l.productId], $event)"></label>
                <span v-if="f[l.productId].busy" class="row small muted" role="status"><span class="spin"></span>กำลังบันทึกรูป</span>
                <template v-if="f[l.productId].photo"><img class="thumb" :src="f[l.productId].photo" alt="รูปของที่เสียหาย">
                  <button class="btn ghost" @click="f[l.productId].photo = null">เอารูปออก</button></template></div></div>
          </div>
        </template>
      </div>
    </section>

    <!-- ขั้น 3 -->
    <div v-if="!step3" class="lockbar"><ic n="lock"/><span>{{ RT.step3Lock }}</span></div>
    <section v-else class="card stack open-anim" aria-labelledby="r3">
      <div class="step-head"><span class="step-no">3</span><h2 id="r3" class="grow req">คืนเข้าคลังไหน</h2></div>
      <ret-place name="rt-wh" :wh-id="whId" :shelf="shelf" :need-shelf="hasOk" @wh="setWh" @shelf="shelf = $event"/>
      <template v-if="hasOk && whId && shelves.length">
        <button v-if="filled.length > 1" class="link" style="justify-self:start" @click="split = !split">{{ split ? 'ใช้ชั้นเดียวกันทุกรายการ' : 'แยกชั้นรายการ' }}</button>
        <div v-if="split" class="stack" style="gap:8px">
          <div v-for="l in filled.filter(x => f[x.productId].cond === 'ok')" :key="l.productId" class="field">
            <label :for="'rs-' + l.productId">{{ $product(l.productId).name }}</label>
            <select :id="'rs-' + l.productId" class="input" v-model="f[l.productId].shelf"><option value="">ชั้นเดียวกับข้างบน ({{ shelf }})</option>
              <option v-for="c in shelves" :key="c" :value="c">{{ c }}</option></select></div></div>
      </template>
      <p v-if="hasDamaged" class="msg warn"><ic n="warn"/><span class="grow">{{ RT.damaged }}<template v-if="staff"> <a href="#/qc">ไปที่ชั้นรอตรวจ</a></template></span></p>
      <details><summary>หมายเหตุ (ไม่บังคับ)</summary>
        <label class="sr" for="r-note">หมายเหตุ</label>
        <textarea id="r-note" class="input" rows="2" v-model="note" placeholder="เช่น เหลือจากงานเดินสาย" style="margin-top:8px"></textarea></details>
    </section>

    <div v-if="step3 && !ready" class="lockbar"><ic n="lock"/><span>{{ RT.lastLock }}</span></div>
    <div v-if="ready" class="submitbar">
      <p v-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>
      <p class="small"><b>จะคืน {{ filled.length }} รายการ</b><template v-if="whId"> เข้า{{ $wh(whId).name }}</template></p>
      <button class="btn primary big block" :disabled="busy" @click="save"><span v-if="busy" class="spin" role="status" aria-label="กำลังบันทึกรูป"></span><ic v-else n="undo"/>บันทึกคืนของ</button>
    </div>
    <p v-else-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>
  </template>

  <!-- คืนล่าสุด -->
  <section class="card stack" aria-labelledby="rc-t">
    <h2 id="rc-t">คืนล่าสุด</h2>
    <p v-if="!recent.length" class="muted">{{ RT.recentEmpty }}</p>
    <div class="rows">
      <div v-for="r in recent" :key="r.id" class="stack" style="gap:6px">
        <div class="row wrap"><b class="mono grow">{{ r.id }}</b><span v-if="r.reversedAt" class="tag warn">กลับรายการแล้ว</span></div>
        <p class="muted small">{{ r.reqId || 'ไม่มีใบเบิก' }} · {{ when(r.at) }} · {{ $userOf(r.byUserId).name }} · {{ $wh(r.whId).name }}</p>
        <p v-for="(l, i) in r.lines" :key="i" class="small">{{ $product(l.productId).name }} · คืน {{ $fmt(l.qty, $product(l.productId).unit) }} · {{ RT.COND[l.condition] }}</p>
        <div v-if="user.role === 'head' && !r.reversedAt" class="row">
          <template v-if="confirmRev === r.id"><button class="btn danger" @click="reverse(r.id)">ยืนยันกลับรายการ</button><button class="btn" @click="confirmRev = null">ยกเลิก</button></template>
          <button v-else class="btn" @click="confirmRev = r.id; revErr = ''">กลับรายการ</button></div>
      </div>
    </div>
    <p v-if="revErr" class="msg bad" role="alert"><ic n="x"/><span>{{ revErr }}</span></p>
  </section>

  <div v-if="printRoll" class="print-label" aria-hidden="true">
    <p class="pl-id">{{ printRoll.id }}</p><p class="pl-name">{{ printRoll.name }}</p><p class="pl-len">ยาว {{ $fmt(printRoll.len, 'm') }}</p>
  </div>
</div>`,
  };
  SM.views.returns.methods.rollsOf = rollsOf;
})();

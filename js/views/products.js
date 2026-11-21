var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// สินค้า: กล่องสร้าง (<product-dialog>) · หน้า #/products · แผ่นแก้ · รายละเอียดรูป
(function () {
  const S = SM.store, T = SM.T, PD = T.PD;
  const norm = (v) => S._.norm(v);
  const UNITS = ['เมตร', 'ตัว', 'ชิ้น', 'ใบ', 'กล่อง', 'ถุง', 'อื่น ๆ'];
  const me = () => SM.state.users.find(u => u.id === SM.state.currentUserId);
  const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const cover = (p) => (p.photos && p.photos[0]) || p.img;

  // เลือกหมวดเป็นชิป + "+ สร้างหมวดใหม่" (ชื่อซ้ำ = ใช้หมวดเดิม · หมวดใหม่ยังไม่ถูกบันทึกจนกว่าจะสร้าง/บันทึกสินค้า)
  const CatPick = {
    props: { modelValue: String, id: String },
    emits: ['update:modelValue'],
    data: () => ({ s: SM.state, extra: [], adding: false, nn: '', err: '' }),
    computed: {
      cats() { return [...new Set([...S.categoryNames(this.s), ...this.extra])]; },
    },
    methods: {
      add() {
        const n = this.nn.trim().replace(/\s+/g, ' ');
        if (!n) { this.err = PD.noCat; return; }
        let c = this.cats.find(x => norm(x) === norm(n));
        if (!c) { c = n; this.extra.push(n); }
        this.$emit('update:modelValue', c);
        this.adding = false; this.nn = ''; this.err = '';
      },
    },
    template: `
<div class="stack">
  <div class="chips" role="group" :aria-labelledby="id">
    <button v-for="c in cats" :key="c" type="button" class="chip" :aria-pressed="modelValue === c" @click="$emit('update:modelValue', c)">{{ c }}</button>
    <button type="button" class="chip" @click="adding = !adding" :aria-expanded="adding"><ic n="plus"/>สร้างหมวดใหม่</button>
  </div>
  <div v-if="adding" class="stack open-anim">
    <div class="row">
      <input class="input grow" v-model="nn" placeholder="ชื่อหมวดใหม่ เช่น น็อตและสกรู" aria-label="ชื่อหมวดใหม่" @keydown.enter.prevent="add" @input="err = ''">
      <button type="button" class="btn" @click="add">เพิ่มหมวด</button></div>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
  </div>
</div>`,
  };

  // เลือกหน่วยเป็นชิป · สายม้วนเปิด = ล็อกเป็นเมตร แต่จำหน่วยที่เลือกไว้ (ปิดสวิตช์แล้วกลับมา)
  // modelValue = หน่วยที่เลือกไว้ ('m' = เมตร, '' = ยังไม่เลือก)
  const UnitPick = {
    props: { modelValue: String, isRoll: Boolean, id: String },
    emits: ['update:modelValue'],
    data() {
      const u = this.modelValue, label = u === 'm' ? 'เมตร' : u;
      return { choice: !u ? '' : UNITS.includes(label) && label !== 'อื่น ๆ' ? label : 'อื่น ๆ', custom: u && !UNITS.includes(label) ? u : '', UNITS, T };
    },
    methods: {
      pick(c) { this.choice = c; this.send(); },
      send() { this.$emit('update:modelValue', this.choice === 'เมตร' ? 'm' : this.choice === 'อื่น ๆ' ? this.custom.trim() : this.choice); },
    },
    template: `
<div class="stack">
  <div class="chips" role="group" :aria-labelledby="id">
    <button v-for="u in UNITS" :key="u" type="button" class="chip" :disabled="isRoll"
      :aria-pressed="isRoll ? u === 'เมตร' : choice === u" @click="pick(u)">{{ u }}</button>
  </div>
  <input v-if="choice === 'อื่น ๆ' && !isRoll" class="input" v-model="custom" @input="send" placeholder="เช่น ชุด ลัง" aria-label="พิมพ์หน่วยเอง">
  <p v-if="isRoll" class="help">{{ T.N15() }}</p>
</div>`,
  };

  // ช่องบาร์โค้ด + ปุ่มสแกน (scan-button มี 2 root จึงห่อไว้ · kinds=[] ส่งรหัสดิบ)
  const CodeField = {
    props: { modelValue: String, id: String },
    emits: ['update:modelValue'],
    template: `
<div class="field"><label :for="id">รหัสจากผู้ขาย / บาร์โค้ด</label>
  <div class="row"><input :id="id" class="input grow mono" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" inputmode="numeric" placeholder="เช่น 8851234567890">
    <div><scan-button :kinds="[]" @found="e => $emit('update:modelValue', e.id)"/></div></div></div>`,
  };


  // ---------- ช่องลงยอด (ใช้ทั้งกล่องสร้าง "มีของนี้อยู่ในคลังแล้ว" และแผ่นแก้ "ลงยอดที่เจอเพิ่ม") ----------
  // o = { whId, shelf, qty, rolls:[{len}] } · เรียง จำนวน → คลัง → ชั้น · ข้อความบอกล่วงหน้าตาม S.openingRoute
  const newOpen = (whId = null) => ({ whId, shelf: 'ทั่วไป', qty: null, rolls: [{ len: null }] });
  const openMissing = (o, isRoll, unit) => {
    const m = [];
    if (!o.whId) m.push(T.N14.wh);
    if (isRoll && o.rolls.some(r => !(Number(r.len) > 0))) m.push(T.N14.rolls);
    const bad = !isRoll && S.qtyError({ unit }, o.qty);
    if (bad) m.push(bad === T.N06() ? T.N14.qty : bad);
    return m;
  };
  const OpenFields = {
    props: { o: Object, isRoll: Boolean, unit: String, whs: Array, route: String, needsApproval: Boolean, touched: Boolean, idp: String },
    data: () => ({ T }),
    computed: {
      total() { return this.o.rolls.reduce((a, r) => a + (Number(r.len) || 0), 0); },
      badQty() { return !this.isRoll && S.qtyError({ unit: this.unit }, this.o.qty); },
      shelves() { return this.o.whId ? S.shelves(SM.state, this.o.whId) : []; },
    },
    watch: { 'o.whId'() { if (!this.shelves.includes(this.o.shelf)) this.o.shelf = this.shelves.includes('ทั่วไป') ? 'ทั่วไป' : (this.shelves[0] || ''); } },
    template: `
<div class="stack">
  <div v-if="!isRoll" class="field"><label :for="idp + '-qty'" class="req">มีอยู่เท่าไร</label>
    <div class="unitbox" :class="{ bad: touched && badQty }"><input :id="idp + '-qty'" type="number" inputmode="decimal" step="any" min="0" v-model.number="o.qty"><span>{{ unit || 'หน่วย' }}</span></div></div>
  <div v-else class="stack">
    <span class="label req">ม้วนละกี่เมตร</span>
    <div v-for="(r, i) in o.rolls" :key="i" class="row">
      <label :for="idp + '-roll' + i" style="white-space:nowrap">ม้วนที่ {{ i + 1 }} ยาว</label>
      <div class="unitbox grow" :class="{ bad: touched && !(Number(r.len) > 0) }"><input :id="idp + '-roll' + i" type="number" inputmode="decimal" step="any" min="0" v-model.number="r.len"><span>m</span></div>
      <button type="button" class="btn ghost icon" :disabled="o.rolls.length === 1" @click="o.rolls.splice(i, 1)" :aria-label="'ลบม้วนที่ ' + (i + 1)"><ic n="x"/></button>
    </div>
    <button type="button" class="btn" @click="o.rolls.push({ len: null })"><ic n="plus"/>เพิ่มม้วน</button>
    <p><b>รวม {{ o.rolls.length }} ม้วน {{ $fmt(total, 'm') }}</b></p>
  </div>
  <div class="field"><label :for="idp + '-wh'" class="req">คลังที่มีของ</label>
    <select :id="idp + '-wh'" class="input" :class="{ bad: touched && !o.whId }" v-model="o.whId">
      <option v-for="w in whs" :key="w.id" :value="w.id">{{ w.name }}</option></select></div>
  <div class="field"><label :for="idp + '-sh'">ชั้นที่วาง</label>
    <select :id="idp + '-sh'" class="input" v-model="o.shelf"><option v-for="s in shelves" :key="s" :value="s">{{ s }}</option></select>
    <p class="help">ย้ายชั้นทีหลังได้</p></div>
  <p class="msg info"><ic n="info"/><span>{{ T.N17r(route, needsApproval) }}</span></p>
</div>`,
  };

  // ---------- กล่องสร้างสินค้า ----------
  // <product-dialog :initial-name :initial-code :from-search @created(product, result) @use-existing(product) @close/>
  const ProductDialog = {
    components: { CatPick, UnitPick, CodeField, OpenFields },
    props: { initialName: String, initialCode: String, fromSearch: Boolean },
    emits: ['close', 'created', 'use-existing'],
    data() {
      return {
        s: SM.state, T, PD,
        name: this.initialName || '', brand: '', model: '', category: '', picked: '', isRoll: false, photos: [], busy: 0, photoErr: '',
        code: this.initialCode || '', note: '', buyUnit: '', buyFactor: '', reorderPoint: '', scrapMin: '', needsApproval: false,
        hasStock: false, o: newOpen(), error: '', touched: false,
      };
    },
    computed: {
      user() { return me(); },
      direct() { return this.user.role !== 'engineer'; },
      isHead() { return this.user.role === 'head'; },
      maxPhotos() { return this.user.role === 'engineer' ? 1 : 3; },
      whs() { return this.s.warehouses.filter(w => !w.locked); },
      similar() { return S.similarProducts(this.s, this.name); },
      exact() { const x = this.similar.find(v => v.exact); return x ? x.product : null; },
      alike() { return this.exact ? [] : this.similar.slice(0, 3); },
      unit() { return this.isRoll ? 'm' : this.picked; },
      catApproval() { return this.s.approvalCats.includes(this.category); },
      route() { return S.openingRoute(this.s, null, this.user.id); },
      missing() {
        const m = [];
        if (!this.name.trim()) m.push('ชื่อสินค้า');
        if (!this.category) m.push('หมวดหมู่');
        if (!this.unit) m.push('หน่วย');
        return this.hasStock ? [...m, ...openMissing(this.o, this.isRoll, this.unit)] : m;
      },
      canCreate() { return !this.exact && !this.missing.length && !this.busy; },
    },
    watch: {
      hasStock(v) { if (v && !this.o.whId) this.o.whId = (this.whs.find(w => w.id === this.s.cart.whId) || this.whs[0] || {}).id || null; },
    },
    mounted() { this.$refs.dlg.showModal(); },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },   // ปิดกล่อง = ทิ้งรูปที่ยังไม่บันทึก
      use(p) { this.$emit('use-existing', p); this.close(); },
      async pickPhoto(e) {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        this.photoErr = ''; this.busy++;
        try { this.photos.push(await SM.shrinkImage(f)); } catch (x) { this.photoErr = x.message; }
        this.busy--;
      },
      create() {
        this.touched = true; this.error = '';
        if (!this.canCreate) return;
        try {
          const opening = this.hasStock ? { whId: this.o.whId, shelf: this.o.shelf, qty: this.o.qty, rollLengths: this.o.rolls.map(r => r.len) } : null;
          const r = S.createProduct(this.s, {
            name: this.name, brand: this.brand, model: this.model, category: this.category, unit: this.unit, isRoll: this.isRoll,
            vendorCode: this.code, note: this.note, buyUnit: this.buyUnit, buyFactor: this.buyFactor, reorderPoint: this.reorderPoint,
            scrapMin: this.isRoll ? this.scrapMin : '', needsApproval: this.isHead && this.needsApproval, photos: this.photos, opening,
          }, this.user.id);
          SM.toast('ok', opening ? r.toast : this.fromSearch ? PD.createdSearch(r.product) : PD.created(r.product), 5000);
          this.$emit('created', r.product, r);
          this.close();
        } catch (e) { this.error = e.message; }
      },
    },
    template: `
<dialog ref="dlg" class="dlg" aria-labelledby="pd-title" @cancel.prevent="close">
  <form class="dlg-in" @submit.self.prevent="create" novalidate>
    <div class="dlg-head"><h2 id="pd-title" class="grow">สร้างสินค้าใหม่</h2>
      <button type="button" class="btn ghost icon" @click="close" aria-label="ปิด"><ic n="x"/></button></div>
    <div class="dlg-body">
      <div class="field">
        <label for="pd-name" class="req">ชื่อสินค้า</label>
        <input id="pd-name" class="input" :class="{ bad: exact || (touched && !name.trim()) }" v-model="name" placeholder="เช่น น็อตสแตนเลส M8" autocomplete="off">
        <div v-if="exact" class="msg bad" role="alert"><ic n="x"/>
          <div class="grow stack"><span>{{ T.N11(exact) }}</span><button v-if="fromSearch" type="button" class="btn" @click="use(exact)">ใช้รายการนี้</button></div></div>
        <div v-else-if="alike.length" class="msg warn"><ic n="warn"/>
          <div class="grow stack"><span>{{ T.N12() }}</span>
            <div v-for="a in alike" :key="a.product.id" class="row wrap">
              <img class="thumb sm" :src="a.product.photos[0] || a.product.img" alt="" @error="$noImg">
              <span class="grow">{{ a.product.name }}<br><span class="mono small">{{ a.product.id }} · คล้าย {{ a.pct }}%</span></span>
              <button v-if="fromSearch" type="button" class="btn" @click="use(a.product)">ใช้รายการนี้</button></div></div></div>
      </div>
      <div class="field"><span class="label">รูปของ <span class="help">(ไม่บังคับ · ใส่ได้ {{ maxPhotos }} รูป)</span></span>
        <div class="row wrap">
          <div v-for="(ph, i) in photos" :key="i" class="phtile"><img :src="ph" :alt="'รูปที่ ' + (i + 1)">
            <button type="button" class="btn ghost icon" @click="photos.splice(i, 1)" :aria-label="'ลบรูปที่ ' + (i + 1)"><ic n="x"/></button></div>
          <label v-if="photos.length < maxPhotos" class="btn"><ic n="plus"/>{{ photos.length ? 'เพิ่มรูป' : 'ถ่ายรูป / เลือกรูป' }}
            <input type="file" accept="image/*" class="sr" @change="pickPhoto"></label>
          <span v-if="busy" class="row small muted" role="status"><span class="spin"></span>กำลังบันทึกรูป</span>
        </div>
        <p v-if="photos.length >= maxPhotos && maxPhotos === 1" class="help">{{ PD.noAdd23 }}</p>
        <p v-if="photoErr" class="err" role="alert">{{ photoErr }}</p></div>
      <div class="field"><label for="pd-brand">ยี่ห้อ</label><input id="pd-brand" class="input" v-model="brand" placeholder="เช่น Yazaki, 3M"></div>
      <div class="field"><label for="pd-model">รุ่น / ขนาด</label><input id="pd-model" class="input" v-model="model" placeholder="เช่น THW 1x2.5 sq.mm">
        <p class="help">สายไฟควรกรอกช่องนี้ ระบบจะใช้ทำตัวกรอง ชนิด ขนาด แกน สี ให้เอง</p></div>
      <div class="field"><span class="label req" id="pd-cat">หมวดหมู่</span><cat-pick id="pd-cat" v-model="category"/></div>
      <div class="field"><span class="label req" id="pd-unit">หน่วย</span><unit-pick id="pd-unit" v-model="picked" :is-roll="isRoll"/></div>
      <label class="switch"><input type="checkbox" v-model="isRoll">
        <span><b>เป็นสายม้วน ตัดขายเป็นเมตร</b><br><span class="help">ระบบจะนับเป็นความยาว (เมตร) และตัดจากม้วนให้</span></span></label>
      <label v-if="isHead" class="switch"><input type="checkbox" :checked="needsApproval || catApproval" :disabled="catApproval" @change="needsApproval = $event.target.checked">
        <span><b>ต้องให้หัวหน้าอนุมัติเมื่อยอดเปลี่ยน</b><br><span class="help">{{ catApproval ? 'หมวดนี้ตั้งให้ต้องอนุมัติอยู่แล้ว' : 'ใช้กับการลงยอดตั้งต้นและการปรับยอดจากการนับ' }}</span></span></label>
      <label class="switch"><input type="checkbox" v-model="hasStock"><span><b>มีของนี้อยู่ในคลังแล้ว</b></span></label>
      <div v-if="hasStock" class="card stack open-anim">
        <open-fields idp="pd" :o="o" :is-roll="isRoll" :unit="unit" :whs="whs" :route="route" :needs-approval="false" :touched="touched"/>
      </div>
      <details :open="!!initialCode"><summary class="link" style="display:inline-flex;align-items:center">ข้อมูลเพิ่มเติม (ไม่บังคับ)</summary>
        <div class="stack" style="margin-top:8px">
          <p class="help">หัวหน้าเติมทีหลังที่ หน้าสินค้า ก็ได้</p>
          <code-field id="pd-code" v-model="code"/>
          <div class="field"><label for="pd-note">หมายเหตุ</label><input id="pd-note" class="input" v-model="note"></div>
          <div class="field"><label for="pd-bu">หน่วยตอนสั่งซื้อ</label><input id="pd-bu" class="input" v-model="buyUnit" :placeholder="unit ? 'เหมือนหน่วยหลัก (' + unit + ')' : 'เหมือนหน่วยหลัก'"></div>
          <div class="field"><label for="pd-bf">1 หน่วยสั่งซื้อ เท่ากับกี่ {{ unit || 'หน่วย' }}</label><input id="pd-bf" class="input" type="number" inputmode="decimal" min="1" step="any" v-model="buyFactor" placeholder="1"></div>
          <div class="field"><label for="pd-rp">เตือนให้สั่งซื้อเมื่อเหลือน้อยกว่า ({{ unit || 'หน่วย' }})</label><input id="pd-rp" class="input" type="number" inputmode="decimal" min="0" step="any" v-model="reorderPoint" placeholder="0"></div>
          <div v-if="isRoll" class="field"><label for="pd-sm">เศษม้วนที่สั้นกว่านี้ถือเป็นของเสีย (เมตร)</label><input id="pd-sm" class="input" type="number" inputmode="decimal" min="0" step="any" v-model="scrapMin" placeholder="3"></div>
        </div></details>
    </div>
    <div class="dlg-foot">
      <p v-if="error" class="msg bad" role="alert"><ic n="x"/><span>{{ error }}</span></p>
      <p v-if="missing.length" class="help">{{ PD.missing(missing) }}</p>
      <p class="help">{{ T.N18(hasStock && !direct) }}</p>
      <div class="row"><button type="button" class="btn" @click="close">ยกเลิก</button>
        <button type="submit" class="btn primary" :aria-disabled="!canCreate">สร้าง</button></div>
    </div>
  </form>
</dialog>`,
  };
  SM.ProductDialog = ProductDialog;

  // ---------- รายละเอียดรูป (3 ช่อง) ----------
  const PhotoView = {
    props: { productId: String },
    emits: ['close'],
    data: () => ({ s: SM.state, sel: 0, busy: false, err: '', PD, mode: 'add' }),
    computed: {
      p() { return this.s.products.find(x => x.id === this.productId); },
      user() { return me(); },
      staff() { return this.user.role !== 'engineer'; },
      photos() { return this.p.photos; },
      canAdd() { return this.sel >= this.photos.length && this.photos.length < 3 && (this.staff || this.photos.length === 0); },
    },
    mounted() { this.$refs.dlg.showModal(); },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },
      ask(mode) { this.mode = mode; this.err = ''; this.$refs.file.click(); },
      async chosen(e) {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        this.busy = true; this.err = '';
        try {
          const d = await SM.shrinkImage(f), uid = this.user.id;
          if (this.mode === 'replace') S.replacePhoto(this.s, this.p.id, this.sel, d, uid);
          else { S.addPhoto(this.s, this.p.id, d, uid); this.sel = this.photos.length - 1; }
        } catch (x) { this.err = x.message; }
        this.busy = false;
      },
      remove() {
        this.err = '';
        try { S.removePhoto(this.s, this.p.id, this.sel, this.user.id); this.sel = Math.max(0, Math.min(this.sel, this.photos.length - 1)); } catch (x) { this.err = x.message; }
      },
    },
    template: `
<dialog ref="dlg" class="dlg" aria-labelledby="ph-title" @cancel.prevent="close">
  <div class="dlg-in">
    <div class="dlg-head"><h2 id="ph-title" class="grow">รูปสินค้า</h2>
      <button type="button" class="btn ghost icon" @click="close" aria-label="ปิด"><ic n="x"/></button></div>
    <div class="dlg-body">
      <p><b>{{ p.name }}</b><br><span class="mono small muted">{{ p.id }}</span></p>
      <div class="photobig">
        <img v-if="photos[sel]" :src="photos[sel]" :alt="'รูปที่ ' + (sel + 1) + ' ของ ' + p.name">
        <div v-else class="empty"><ic n="box"/><p>ยังไม่มีรูปในช่องที่ {{ sel + 1 }}</p></div>
      </div>
      <div class="photoslots" role="group" aria-label="ช่องรูป">
        <button v-for="i in 3" :key="i" type="button" class="slot" :aria-pressed="sel === i - 1" :aria-label="'ช่องรูปที่ ' + i + (photos[i - 1] ? '' : ' ว่าง')" @click="sel = i - 1">
          <img v-if="photos[i - 1]" :src="photos[i - 1]" alt=""><ic v-else n="plus"/></button>
      </div>
      <div class="row wrap">
        <button v-if="canAdd" type="button" class="btn primary" :disabled="busy" @click="ask('add')"><ic n="plus"/>เพิ่มรูป</button>
        <button v-if="photos[sel] && staff" type="button" class="btn" :disabled="busy" @click="ask('replace')">เปลี่ยนรูป</button>
        <button v-if="photos[sel] && staff" type="button" class="btn danger" :disabled="busy" @click="remove">ลบรูป</button>
        <span v-if="busy" class="row small muted" role="status"><span class="spin"></span>กำลังบันทึกรูป</span>
      </div>
      <p v-if="!staff && photos[sel]" class="help">{{ PD.noReplace }} · {{ PD.noRemove }}</p>
      <p v-if="!staff && sel >= photos.length && photos.length > 0" class="help">{{ PD.noAdd23 }}</p>
      <p v-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>
      <input ref="file" type="file" accept="image/*" class="sr" tabindex="-1" @change="chosen">
    </div>
    <div class="dlg-foot"><button type="button" class="btn block" @click="close">ปิด</button></div>
  </div>
</dialog>`,
  };

  // ---------- แผ่นแก้สินค้า (bottom sheet บนมือถือ) ----------
  const ProductSheet = {
    components: { CatPick, UnitPick, CodeField, OpenFields },
    props: { productId: String },
    emits: ['close'],
    data() {
      const p = SM.state.products.find(x => x.id === this.productId);
      return {
        s: SM.state, T, PD, error: '', confirmOff: false, offErr: '', foundOpen: false, fo: newOpen(), foTouched: false, foErr: '',
        f: { name: p.name, brand: p.brand, model: p.model, vendorCode: p.vendorCode, note: p.note, category: p.category, unit: p.unit,
          isRoll: p.isRoll, needsApproval: p.needsApproval, buyUnit: p.buyUnit, buyFactor: p.buyFactor, reorderPoint: p.reorderPoint, scrapMin: p.scrapMin },
      };
    },
    computed: {
      p() { return this.s.products.find(x => x.id === this.productId); },
      user() { return me(); },
      isHead() { return this.user.role === 'head'; },
      locked() { return S.hasHistory(this.s, this.p.id); },
      unitNow() { return this.f.isRoll ? 'm' : this.f.unit; },
      history() { return S.auditFor(this.s, this.p.id).slice().reverse().slice(0, 20); },
      active() { return this.p.active !== false; },
      whs() { return this.s.warehouses.filter(w => !w.locked); },
      foRoute() { return S.openingRoute(this.s, this.p.id, this.user.id); },
      foMissing() { return openMissing(this.fo, this.p.isRoll, this.p.unit); },
      who() { return (id) => (this.s.users.find(u => u.id === id) || {}).name || id; },
    },
    mounted() { this.$refs.dlg.showModal(); },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },
      save() {
        this.error = '';
        const f = this.f, p = this.p, patch = {};
        const keys = this.isHead ? ['name', 'brand', 'model', 'vendorCode', 'note', 'category', 'buyUnit', 'buyFactor', 'reorderPoint', 'scrapMin', 'needsApproval']
          : ['name', 'brand', 'model', 'vendorCode', 'note'];
        for (const k of keys) if (String(f[k] ?? '').trim() !== String(p[k] ?? '').trim() && f[k] !== p[k]) patch[k] = f[k];
        if (this.isHead && !this.locked) {
          if (f.isRoll !== p.isRoll) patch.isRoll = f.isRoll;
          if (this.unitNow !== p.unit) patch.unit = this.unitNow;
        }
        if (!Object.keys(patch).length) { this.close(); return; }
        try { S.updateProduct(this.s, p.id, patch, this.user.id); SM.toast('ok', PD.saved); this.close(); } catch (e) { this.error = e.message; }
      },
      showFound() { this.foErr = ''; this.foTouched = false; this.fo = newOpen((this.whs.find(w => w.id === this.s.cart.whId) || this.whs[0] || {}).id || null); this.foundOpen = true; },
      submitFound() {
        this.foTouched = true; this.foErr = '';
        if (this.foMissing.length) { this.foErr = PD.missing(this.foMissing); return; }
        try {
          const r = S.submitOpening(this.s, { productId: this.p.id, whId: this.fo.whId, shelf: this.fo.shelf, qty: this.fo.qty, rollLengths: this.fo.rolls.map(x => x.len), kind: 'found' }, this.user.id);
          SM.toast('ok', r.toast, 5000); this.foundOpen = false;
        } catch (e) { this.foErr = e.message; }
      },
      deactivate() {
        this.offErr = '';
        try { S.setProductActive(this.s, this.p.id, false, this.user.id); SM.toast('ok', `เลิกใช้ ${this.p.name} แล้ว ประวัติยังอยู่`); this.$refs.cf.close(); this.close(); } catch (e) { this.offErr = e.message; }
      },
      reactivate() {
        this.error = '';
        try { S.setProductActive(this.s, this.p.id, true, this.user.id); SM.toast('ok', `เปิดใช้ ${this.p.name} อีกครั้งแล้ว`); this.close(); } catch (e) { this.error = e.message; }
      },
      askOff() { this.offErr = ''; this.confirmOff = true; this.$nextTick(() => this.$refs.cf.showModal()); },
      stopOff() { this.$refs.cf.close(); this.confirmOff = false; },
      when,
    },
    template: `
<div>
<dialog ref="dlg" class="dlg sheet" aria-labelledby="ed-title" @cancel.prevent="close">
  <form class="dlg-in" @submit.self.prevent="save" novalidate>
    <div class="dlg-head"><h2 id="ed-title" class="grow">แก้สินค้า <span class="mono small muted">{{ p.id }}</span></h2>
      <button type="button" class="btn ghost icon" @click="close" aria-label="ปิด"><ic n="x"/></button></div>
    <div class="dlg-body">
      <p v-if="!active" class="msg warn"><ic n="warn"/><span>สินค้านี้เลิกใช้แล้ว ถูกซ่อนจากตัวเลือก ประวัติยังอยู่</span></p>
      <div class="field"><label for="ed-name" class="req">ชื่อสินค้า</label><input id="ed-name" class="input" v-model="f.name" autocomplete="off"></div>
      <div class="field"><label for="ed-brand">ยี่ห้อ</label><input id="ed-brand" class="input" v-model="f.brand"></div>
      <div class="field"><label for="ed-model">รุ่น / ขนาด</label><input id="ed-model" class="input" v-model="f.model"></div>
      <code-field id="ed-code" v-model="f.vendorCode"/>
      <div class="field"><label for="ed-note">หมายเหตุ</label><input id="ed-note" class="input" v-model="f.note"></div>

      <div v-if="isHead" class="field"><span class="label req" id="ed-cat">หมวดหมู่</span><cat-pick id="ed-cat" v-model="f.category"/></div>
      <div v-else class="ro"><span class="label">หมวดหมู่</span><b>{{ p.category }}</b><span class="help">{{ PD.headOnly }}</span></div>

      <template v-if="isHead && !locked">
        <div class="field"><span class="label req" id="ed-unit">หน่วย</span><unit-pick id="ed-unit" v-model="f.unit" :is-roll="f.isRoll"/></div>
        <label class="switch"><input type="checkbox" v-model="f.isRoll">
          <span><b>เป็นสายม้วน ตัดขายเป็นเมตร</b><br><span class="help">ระบบจะนับเป็นความยาว (เมตร) และตัดจากม้วนให้</span></span></label>
      </template>
      <template v-else>
        <div class="ro"><span class="label">หน่วย</span><b>{{ p.unit === 'm' ? 'เมตร' : p.unit }}{{ p.isRoll ? ' · สายม้วน' : '' }}</b>
          <span class="help">{{ isHead ? PD.unitLocked : PD.headOnly }}</span></div>
      </template>

      <label v-if="isHead" class="switch"><input type="checkbox" v-model="f.needsApproval">
        <span><b>ต้องให้หัวหน้าอนุมัติเมื่อยอดเปลี่ยน</b><br><span class="help">ใช้กับการลงยอดตั้งต้นและการปรับยอดจากการนับ</span></span></label>
      <div v-else class="ro"><span class="label">ต้องอนุมัติเมื่อยอดเปลี่ยน</span><b>{{ p.needsApproval ? 'ใช่' : 'ไม่' }}</b><span class="help">{{ PD.headOnly }}</span></div>

      <details open><summary class="link" style="display:inline-flex;align-items:center">ข้อมูลเพิ่มเติม</summary>
        <div class="stack" style="margin-top:8px">
          <template v-if="isHead">
            <div class="field"><label for="ed-bu">หน่วยตอนสั่งซื้อ</label><input id="ed-bu" class="input" v-model="f.buyUnit"></div>
            <div class="field"><label for="ed-bf">1 หน่วยสั่งซื้อ เท่ากับกี่ {{ unitNow }}</label><input id="ed-bf" class="input" type="number" inputmode="decimal" min="1" step="any" v-model.number="f.buyFactor"></div>
            <div class="field"><label for="ed-rp">เตือนให้สั่งซื้อเมื่อเหลือน้อยกว่า ({{ unitNow }})</label><input id="ed-rp" class="input" type="number" inputmode="decimal" min="0" step="any" v-model.number="f.reorderPoint"></div>
            <div v-if="f.isRoll" class="field"><label for="ed-sm">เศษม้วนที่สั้นกว่านี้ถือเป็นของเสีย (เมตร)</label><input id="ed-sm" class="input" type="number" inputmode="decimal" min="0" step="any" v-model.number="f.scrapMin"></div>
          </template>
          <template v-else>
            <div class="ro"><span class="label">หน่วยตอนสั่งซื้อ</span><b>{{ p.buyUnit }} (1 = {{ p.buyFactor }} {{ p.unit }})</b><span class="help">{{ PD.headOnly }}</span></div>
            <div class="ro"><span class="label">เตือนให้สั่งซื้อเมื่อเหลือน้อยกว่า</span><b>{{ $fmt(p.reorderPoint, p.unit) }}</b><span class="help">{{ PD.headOnly }}</span></div>
            <div v-if="p.isRoll" class="ro"><span class="label">เศษม้วนที่สั้นกว่านี้ถือเป็นของเสีย</span><b>{{ $fmt(p.scrapMin, 'm') }}</b><span class="help">{{ PD.headOnly }}</span></div>
          </template>
        </div></details>

      <div v-if="active" class="stack">
        <button v-if="!foundOpen" type="button" class="btn block" @click="showFound"><ic n="plus"/>ลงยอดที่เจอเพิ่ม</button>
        <div v-else class="card stack open-anim">
          <h3>ลงยอดที่เจอเพิ่ม</h3>
          <open-fields idp="fo" :o="fo" :is-roll="p.isRoll" :unit="p.unit" :whs="whs" :route="foRoute" :needs-approval="p.needsApproval" :touched="foTouched"/>
          <p v-if="foErr" class="msg bad" role="alert"><ic n="x"/><span>{{ foErr }}</span></p>
          <div class="row"><button type="button" class="btn" @click="foundOpen = false">ยกเลิก</button>
            <button type="button" class="btn primary" @click="submitFound">ลงยอด</button></div>
        </div>
      </div>

      <details><summary class="link" style="display:inline-flex;align-items:center">ประวัติ ({{ history.length }})</summary>
        <ul class="hist"><li v-if="!history.length" class="muted">ยังไม่มีประวัติการแก้</li>
          <li v-for="(e, i) in history" :key="i"><span class="small muted">{{ when(e.at) }} · {{ who(e.userId) }}</span><br>{{ e.text }}</li></ul></details>

      <div v-if="isHead" class="stack">
        <button v-if="active" type="button" class="btn danger block" @click="askOff">เลิกใช้สินค้า</button>
        <button v-else type="button" class="btn block" @click="reactivate">เปิดใช้สินค้าอีกครั้ง</button>
      </div>
    </div>
    <div class="dlg-foot">
      <p v-if="error" class="msg bad" role="alert"><ic n="x"/><span>{{ error }}</span></p>
      <div class="row"><button type="button" class="btn" @click="close">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button></div>
    </div>
  </form>
</dialog>
<dialog v-if="confirmOff" ref="cf" class="dlg confirm" aria-labelledby="cf-title" @cancel.prevent="stopOff">
  <div class="dlg-in">
    <div class="dlg-head"><h2 id="cf-title" class="grow">เลิกใช้สินค้า</h2></div>
    <div class="dlg-body"><p>{{ PD.off(p) }}</p>
      <p v-if="offErr" class="msg bad" role="alert"><ic n="x"/><span>{{ offErr }}</span></p></div>
    <div class="dlg-foot"><div class="row"><button type="button" class="btn" @click="stopOff">ยกเลิก</button>
      <button type="button" class="btn primary" @click="deactivate">เลิกใช้สินค้า</button></div></div>
  </div>
</dialog>
</div>`,
  };

  // ---------- หน้า #/products ----------
  SM.views.products = {
    components: { ProductSheet, PhotoView },
    data: () => ({
      s: SM.state, T, PD, q: '', category: null, noPhoto: false, onlyApproval: false, showOff: false,
      creating: false, initialCode: '', editing: null, photoFor: null, miss: '', err: '',
    }),
    computed: {
      user() { return me(); },
      isHead() { return this.user.role === 'head'; },
      canEdit() { return this.user.role !== 'engineer'; },
      cats() { return S.categoryNames(this.s); },
      base() {
        const q = this.q.trim().toLowerCase();
        if (this.showOff) return this.s.products.filter(p => p.active === false && (!q || [p.name, p.id, p.brand, p.model, p.vendorCode].some(v => (v || '').toLowerCase().includes(q))));
        const hits = S.searchProducts(this.s, { q: this.q, category: this.category });
        const byCode = q ? this.s.products.filter(p => p.active !== false && (!this.category || p.category === this.category) && (p.vendorCode || '').toLowerCase().includes(q) && !hits.includes(p)) : [];
        return [...hits, ...byCode];
      },
      noPhotoN() { return this.s.products.filter(p => p.active !== false && !p.photos.length).length; },
      list() { return this.base.filter(p => (!this.noPhoto || !p.photos.length) && (!this.onlyApproval || p.needsApproval)); },
    },
    watch: { isHead(v) { if (!v) this.showOff = false; } },
    methods: {
      total(p) { return S.totalStock(this.s, p.id); },
      cover,
      openNew(code = '') { this.initialCode = code; this.creating = true; this.miss = ''; },
      scanned(e) {
        this.err = ''; this.miss = '';
        const r = S.parseScan(this.s, e.id);
        if (r && r.kind === 'product') { this.canEdit ? (this.editing = r.id) : (this.photoFor = r.id); return; }
        this.miss = e.id;
      },
      approval(c, on) {
        this.err = '';
        try { S.setCategoryApproval(this.s, c, on, this.user.id); } catch (e) { this.err = e.message; }
      },
    },
    template: `
<div class="stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">สินค้า</h1>
    <button class="btn primary" @click="openNew()"><ic n="plus"/>เพิ่มสินค้า</button></div>

  <section class="stack" aria-label="ค้นหาและกรอง">
    <div class="row">
      <div class="search grow"><ic n="search"/><input class="input" type="search" v-model="q" placeholder="ค้นหา ชื่อ ยี่ห้อ รหัส บาร์โค้ด" aria-label="ค้นหาสินค้า"></div>
      <div><scan-button :kinds="[]" @found="scanned"/></div>
    </div>
    <div v-if="miss" class="msg warn" role="status"><ic n="warn"/>
      <div class="grow stack"><span>{{ PD.scanMiss(miss) }}</span>
        <div class="row"><button class="btn primary" @click="openNew(miss)">สร้างสินค้าใหม่</button><button class="btn" @click="miss = ''">ไม่ต้อง</button></div></div></div>
    <div class="chips" role="group" aria-label="หมวด">
      <button class="chip" :aria-pressed="!category" @click="category = null">ทั้งหมด</button>
      <button v-for="c in cats" :key="c" class="chip" :aria-pressed="category === c" @click="category = category === c ? null : c">{{ c }}</button>
    </div>
    <div class="chips" role="group" aria-label="ตัวกรองอื่น">
      <button class="chip" :aria-pressed="noPhoto" @click="noPhoto = !noPhoto">ยังไม่มีรูป ({{ noPhotoN }})</button>
      <button class="chip" :aria-pressed="onlyApproval" @click="onlyApproval = !onlyApproval">ต้องอนุมัติ</button>
      <button v-if="isHead" class="chip" :aria-pressed="showOff" @click="showOff = !showOff">เลิกใช้แล้ว</button>
    </div>
  </section>

  <details v-if="isHead" class="card">
    <summary>ตั้งหมวดที่ต้องให้หัวหน้าอนุมัติ</summary>
    <div class="stack" style="margin-top:8px">
      <p class="help">เปิดแล้ว สินค้าทุกชิ้นในหมวดนี้ (รวมที่สร้างใหม่) ต้องให้หัวหน้าอนุมัติเมื่อยอดเปลี่ยน</p>
      <label v-for="c in cats" :key="c" class="switch"><input type="checkbox" :checked="s.approvalCats.includes(c)" @change="approval(c, $event.target.checked)"><span><b>{{ c }}</b><span class="help"> · ต้องอนุมัติ</span></span></label>
      <p v-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>
    </div>
  </details>

  <section class="stack" aria-label="รายการสินค้า">
    <p class="muted small" aria-live="polite">{{ list.length }} รายการ</p>
    <div v-if="!list.length" class="empty"><ic n="search"/><p>{{ PD.empty }}</p></div>
    <article v-for="p in list" :key="p.id" class="prow">
      <button class="thumbbtn" @click="photoFor = p.id" :aria-label="'ดูรูป ' + p.name"><img class="thumb lg" :src="cover(p)" alt="" loading="lazy" @error="$noImg"></button>
      <div class="grow stack" style="gap:4px">
        <h3>{{ p.name }}</h3>
        <p class="small muted"><span class="mono">{{ p.id }}</span><span v-if="p.brand || p.model"> · {{ [p.brand, p.model].filter(Boolean).join(' ') }}</span></p>
        <p v-if="total(p).qty > 0" class="small t-brand">{{ T.N02(total(p), p.unit) }}</p>
        <p v-else class="small t-bad">{{ PD.noStock }}</p>
        <div class="row wrap">
          <span v-if="p.active === false" class="tag bad"><ic n="x"/>เลิกใช้แล้ว</span>
          <span v-if="p.needsApproval" class="tag warn"><ic n="shield"/>ต้องอนุมัติ</span>
          <span v-if="!p.photos.length" class="tag info"><ic n="info"/>ยังไม่มีรูป</span>
        </div>
      </div>
      <button v-if="canEdit" class="btn" @click="editing = p.id" :aria-label="'แก้ ' + p.name">แก้</button>
    </article>
  </section>

  <product-dialog v-if="creating" :initial-code="initialCode" @close="creating = false"/>
  <product-sheet v-if="editing" :key="editing" :product-id="editing" @close="editing = null"/>
  <photo-view v-if="photoFor" :product-id="photoFor" @close="photoFor = null"/>
</div>`,
  };
})();

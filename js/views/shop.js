var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store, T = SM.T;
  const SWATCH = {
    'ดำ': '#1c1917', 'แดง': '#d92d20', 'น้ำเงิน': '#1d4ed8', 'ฟ้า': '#38bdf8', 'เหลือง': '#facc15', 'เขียว': '#16a34a',
    'เขียว-เหลือง': 'linear-gradient(135deg, #16a34a 50%, #facc15 50%)', 'ขาว': '#ffffff', 'เทา': '#9ca3af', 'น้ำตาล': '#92400e',
  };
  const UNITS = ['เมตร', 'ตัว', 'กล่อง', 'ถุง', 'อื่น ๆ'];

  // กล่องสร้างสินค้าใหม่ (สเปกหัวข้อ 3 "สร้างสินค้าใหม่", N11–N24)
  const ProductDialog = {
    props: { initialName: String },
    emits: ['close'],
    data() {
      return {
        s: SM.state, UNITS, T,
        name: this.initialName || '', brand: '', model: '', unitChoice: '', unitCustom: '',
        isRoll: false, hasStock: false, whId: null, qty: null, rolls: [{ len: null }], error: '', touched: false,
      };
    },
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      direct() { return this.user.role !== 'engineer'; },
      whs() { return this.s.warehouses.filter(w => !w.locked); },
      similar() { return S.similarProducts(this.s, this.name); },
      exact() { const x = this.similar.find(v => v.exact); return x ? x.product : null; },
      alike() { return this.exact ? [] : this.similar.slice(0, 3); },
      unit() {
        if (this.isRoll || this.unitChoice === 'เมตร') return 'm';
        return this.unitChoice === 'อื่น ๆ' ? this.unitCustom.trim() : this.unitChoice;
      },
      rollTotal() { return this.rolls.reduce((a, r) => a + (Number(r.len) || 0), 0); },
      badRolls() { return this.rolls.some(r => !(Number(r.len) > 0)); },
      badQty() { return !this.isRoll && S.qtyError({ unit: this.unit }, this.qty); },
      missing() {
        if (!this.name.trim() || !this.unit) return [T.N13()];
        if (!this.hasStock) return [];
        const m = [];
        if (!this.whId) m.push(T.N14.wh);
        if (this.isRoll && this.badRolls) m.push(T.N14.rolls);
        if (this.badQty) m.push(this.badQty === T.N06() ? T.N14.qty : this.badQty);
        return m;
      },
      canCreate() { return !this.exact && !this.missing.length; },
    },
    watch: {
      hasStock(v) { if (v && !this.whId) this.whId = (this.whs.find(w => w.id === this.s.cart.whId) || this.whs[0] || {}).id || null; },
    },
    mounted() { this.$refs.dlg.showModal(); },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },
      use(p) { const r = SM.addToCart(p.id); this.close(); SM.go('#/cart' + (r === 'exists' ? '?dup=' + p.id : '')); },
      create() {
        this.touched = true;
        if (!this.canCreate) return;
        try {
          const opening = this.hasStock
            ? { whId: this.whId, qty: this.qty, rollLengths: this.rolls.map(r => r.len) } : null;
          const r = S.createProduct(this.s, { name: this.name, brand: this.brand, model: this.model, unit: this.unit, isRoll: this.isRoll, category: S.categoryNames(this.s)[0], opening }, this.user.id);
          SM.toast('ok', r.toast, 5000);
          SM.addToCart(r.product.id);
          SM.ui.q = '';
          this.close(); SM.go('#/cart');
        } catch (e) { this.error = e.message; }
      },
    },
    template: `
<dialog ref="dlg" class="dlg" aria-labelledby="pd-title" @cancel.prevent="close">
  <form class="dlg-in" @submit.prevent="create" novalidate>
    <div class="dlg-head"><h2 id="pd-title" class="grow">สร้างสินค้าใหม่</h2>
      <button type="button" class="btn ghost icon" @click="close" aria-label="ปิด"><ic n="x"/></button></div>
    <div class="dlg-body">
      <div class="field">
        <label for="pd-name" class="req">ชื่อสินค้า</label>
        <input id="pd-name" class="input" :class="{ bad: exact || (touched && !name.trim()) }" v-model="name" placeholder="เช่น น็อตสแตนเลส M8" autocomplete="off">
        <div v-if="exact" class="msg bad" role="alert"><ic n="x"/>
          <div class="grow stack"><span>{{ T.N11(exact) }}</span><button type="button" class="btn" @click="use(exact)">ใช้รายการนี้</button></div></div>
        <div v-else-if="alike.length" class="msg warn"><ic n="warn"/>
          <div class="grow stack"><span>{{ T.N12() }}</span>
            <div v-for="a in alike" :key="a.product.id" class="row wrap">
              <span class="grow"><span class="mono">{{ a.product.id }}</span> {{ a.product.name }} · คล้าย {{ a.pct }}%</span>
              <button type="button" class="btn" @click="use(a.product)">ใช้รายการนี้</button></div></div></div>
      </div>
      <div class="field"><label for="pd-brand">ยี่ห้อ</label><input id="pd-brand" class="input" v-model="brand" placeholder="เช่น Yazaki, 3M"></div>
      <div class="field"><label for="pd-model">รุ่น / ขนาด</label><input id="pd-model" class="input" v-model="model" placeholder="เช่น THW 1x2.5 sq.mm">
        <p class="help">สายไฟควรกรอกช่องนี้ ระบบจะใช้ทำตัวกรอง ชนิด ขนาด แกน สี ให้เอง</p></div>
      <div class="field">
        <span class="label req" id="pd-unit">หน่วย</span>
        <div class="chips" role="group" aria-labelledby="pd-unit">
          <button v-for="u in UNITS" :key="u" type="button" class="chip" :disabled="isRoll"
            :aria-pressed="isRoll ? u === 'เมตร' : unitChoice === u" @click="unitChoice = u">{{ u }}</button>
        </div>
        <input v-if="unitChoice === 'อื่น ๆ' && !isRoll" class="input" v-model="unitCustom" placeholder="เช่น ชุด ลัง ใบ" aria-label="พิมพ์หน่วยเอง">
        <p v-if="isRoll" class="help">{{ T.N15() }}</p>
      </div>
      <label class="switch"><input type="checkbox" v-model="isRoll">
        <span><b>เป็นสายม้วน ตัดขายเป็นเมตร</b><br><span class="help">ระบบจะนับเป็นความยาว (เมตร) และตัดจากม้วนให้</span></span></label>
      <label class="switch"><input type="checkbox" v-model="hasStock"><span><b>มีของนี้อยู่ในคลังแล้ว</b></span></label>
      <div v-if="hasStock" class="card stack open-anim">
        <div class="field"><label for="pd-wh" class="req">คลังที่มีของ</label>
          <select id="pd-wh" class="input" :class="{ bad: touched && !whId }" v-model="whId">
            <option v-for="w in whs" :key="w.id" :value="w.id">{{ w.name }}</option></select>
          <p class="help">{{ T.N16() }}</p></div>
        <div v-if="!isRoll" class="field"><label for="pd-qty" class="req">มีอยู่เท่าไร</label>
          <div class="unitbox" :class="{ bad: touched && badQty }"><input id="pd-qty" type="number" inputmode="decimal" step="any" min="0" v-model.number="qty"><span>{{ unit || 'หน่วย' }}</span></div></div>
        <div v-else class="stack">
          <span class="label req">ม้วนละกี่เมตร</span>
          <div v-for="(r, i) in rolls" :key="i" class="row">
            <label :for="'pd-roll' + i" style="white-space:nowrap">ม้วนที่ {{ i + 1 }} ยาว</label>
            <div class="unitbox grow" :class="{ bad: touched && !(Number(r.len) > 0) }"><input :id="'pd-roll' + i" type="number" inputmode="decimal" step="any" min="0" v-model.number="r.len"><span>m</span></div>
            <button type="button" class="btn ghost icon" :disabled="rolls.length === 1" @click="rolls.splice(i, 1)" :aria-label="'ลบม้วนที่ ' + (i + 1)"><ic n="x"/></button>
          </div>
          <button type="button" class="btn" @click="rolls.push({ len: null })"><ic n="plus"/>เพิ่มม้วน</button>
          <p><b>รวม {{ rolls.length }} ม้วน {{ $fmt(rollTotal, 'm') }}</b></p>
        </div>
        <p class="msg info"><ic n="info"/><span>{{ T.N17(direct) }}</span></p>
      </div>
      <details><summary class="link" style="display:inline-flex;align-items:center">ข้อมูลเพิ่มเติม (ไม่บังคับ)</summary>
        <div class="stack" style="margin-top:8px">
          <p class="help">หัวหน้าเติมทีหลังที่ ตั้งค่า → สินค้า ก็ได้</p>
          <div class="field"><label for="pd-code">รหัสจากผู้ขาย / บาร์โค้ด</label><input id="pd-code" class="input"></div>
          <div class="field"><label for="pd-note">หมายเหตุ</label><input id="pd-note" class="input"></div>
        </div></details>
    </div>
    <div class="dlg-foot">
      <p v-if="error" class="msg bad" role="alert"><ic n="x"/><span>{{ error }}</span></p>
      <p v-if="missing.length" class="help">{{ missing.join(' · ') }}</p>
      <p class="help">{{ T.N18(hasStock && !direct) }}</p>
      <div class="row"><button type="button" class="btn" @click="close">ยกเลิก</button>
        <button type="submit" class="btn primary" :aria-disabled="!canCreate">สร้าง</button></div>
    </div>
  </form>
</dialog>`,
  };

  SM.views.shop = {
    components: { ProductDialog },
    data: () => ({ s: SM.state, ui: SM.ui, T, category: null, facets: {}, shown: 8, creating: false }),
    computed: {
      filter() { return { q: this.ui.q, category: this.category, facets: this.facets }; },
      results() { return S.searchProducts(this.s, this.filter); },
      rows() { return S.facetRows(this.s, this.filter); },
      cats() { return S.categories(this.s); },
      recent() { return S.recentProducts(this.s, this.s.currentUserId); },
      filtered() { return !!this.category || Object.values(this.facets).some(Boolean); },
      q() { return (this.ui.q || '').trim(); },
      canCreate() { return this.q && !this.s.products.some(p => p.name.trim().toLowerCase() === this.q.toLowerCase()); },
      inCart() { return new Set(this.s.cart.lines.map(l => l.productId)); },
    },
    watch: { filter() { this.shown = 8; } },
    methods: {
      total(p) { return S.totalStock(this.s, p.id); },
      color(p) { return S.cableFacets(p).color; },
      swatch(c) { return { background: SWATCH[c] }; },
      setCat(c) { this.category = this.category === c ? null : c; this.facets = {}; },
      setFacet(key, v) { this.facets = { ...this.facets, [key]: this.facets[key] === v ? null : v }; },
      clear() { this.category = null; this.facets = {}; },
      add(p) {
        if (SM.addToCart(p.id) === 'exists') return SM.go('#/cart?dup=' + p.id);
        SM.toast('ok', 'ใส่ตะกร้าแล้ว: ' + p.name, 3000, { label: 'ไปตะกร้า', go: '#/cart' });
      },
    },
    template: `
<div class="stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">เลือกของที่จะเบิก</h1></div>

  <section v-if="recent.length && !q && !filtered" aria-labelledby="recent-h" class="stack">
    <h2 id="recent-h">ใช้บ่อย</h2>
    <div class="quick">
      <button v-for="p in recent" :key="p.id" class="quick-item" @click="add(p)">
        <img class="thumb sm" :src="p.img" alt="" @error="$noImg">
        <span class="grow">{{ p.name }}</span><ic :n="inCart.has(p.id) ? 'check' : 'plus'" class="t-brand"/>
      </button>
    </div>
  </section>

  <section class="stack" aria-label="ตัวกรอง">
    <div v-if="cats.length > 1" class="chips" role="group" aria-label="หมวด">
      <button class="chip" :aria-pressed="!category" @click="category = null; facets = {}">ทั้งหมด</button>
      <button v-for="c in cats" :key="c" class="chip" :aria-pressed="category === c" @click="setCat(c)">{{ c }}</button>
    </div>
    <div v-for="r in rows" :key="r.key" class="facet open-anim">
      <span class="label" :id="'f-' + r.key">{{ r.label }}</span>
      <div class="chips" role="group" :aria-labelledby="'f-' + r.key">
        <button v-for="o in r.options" :key="o.value" class="chip" :aria-pressed="o.selected" @click="setFacet(r.key, o.value)">
          <i v-if="r.key === 'color'" class="dot" :style="swatch(o.value)"></i>{{ o.value }}<span class="n">· {{ o.count }} รายการ</span>
        </button>
      </div>
    </div>
    <div v-if="filtered"><button class="link" @click="clear">ล้างตัวกรอง</button></div>
  </section>

  <section aria-label="ผลลัพธ์" class="stack">
    <p v-if="q || filtered" class="muted small" aria-live="polite">พบ {{ results.length }} รายการ<span v-if="q"> สำหรับ "{{ q }}"</span></p>
    <div v-if="!results.length" class="empty"><ic n="search"/><p>{{ T.N01(q) }}</p></div>
    <div class="pgrid">
      <article v-for="p in results.slice(0, shown)" :key="p.id" class="pcard">
        <div class="pimg">
          <img :src="p.img" alt="" loading="lazy" @error="$noImg">
          <span v-if="color(p)" class="swatch"><i class="dot" :style="swatch(color(p))"></i>สี{{ color(p) }}</span>
        </div>
        <div class="pbody">
          <h3>{{ p.name }}</h3>
          <p v-if="p.brand || p.model" class="muted small">{{ [p.brand, p.model].filter(Boolean).join(' · ') }}</p>
          <p v-if="total(p).qty > 0" class="small t-brand pstock">{{ T.N02(total(p), p.unit) }}</p>
          <p v-else class="small t-bad pstock"><ic n="x"/>{{ T.N03() }}</p>
          <button v-if="!inCart.has(p.id)" class="btn primary block" @click="add(p)" :aria-label="'ใส่ตะกร้า ' + p.name"><ic n="plus"/>ใส่ตะกร้า</button>
          <button v-else class="btn soft block" @click="add(p)" :aria-label="p.name + ' ' + T.N04()"><ic n="check"/>{{ T.N04() }}</button>
        </div>
      </article>
    </div>
    <button v-if="results.length > shown" class="btn block" @click="shown += 8">แสดงเพิ่ม (อีก {{ results.length - shown }})</button>
    <button v-if="canCreate" class="newrow" @click="creating = true"><ic n="plus"/><span>สร้างสินค้าใหม่ "{{ q }}"</span></button>
  </section>

  <div v-if="s.cart.lines.length" class="cartbar">
    <span class="grow"><ic n="cart"/> ตะกร้า <b>{{ s.cart.lines.length }} รายการ</b></span>
    <a class="btn primary" href="#/cart">ไปเบิก<ic n="chevron"/></a>
  </div>
  <product-dialog v-if="creating" :initial-name="q" @close="creating = false"/>
</div>`,
  };
})();

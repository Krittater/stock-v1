var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store, T = SM.T;
  const SWATCH = {
    'ดำ': '#1c1917', 'แดง': '#d92d20', 'น้ำเงิน': '#1d4ed8', 'ฟ้า': '#38bdf8', 'เหลือง': '#facc15', 'เขียว': '#16a34a',
    'เขียว-เหลือง': 'linear-gradient(135deg, #16a34a 50%, #facc15 50%)', 'ขาว': '#ffffff', 'เทา': '#9ca3af', 'น้ำตาล': '#92400e',
  };

  SM.views.shop = {
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
      created(p) { SM.addToCart(p.id); SM.ui.q = ''; SM.go('#/cart'); },
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
  <product-dialog v-if="creating" :initial-name="q" from-search @created="created" @use-existing="add" @close="creating = false"/>
</div>`,
  };
})();

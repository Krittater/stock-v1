var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store;

  // กล่องรับของเข้า / เติมสต็อก
  const ReceiveDialog = {
    props: { productId: String, prId: String, defaultWh: String },
    emits: ['close'],
    data() { return { s: SM.state, whId: null, qty: null, rolls: [{ len: null }], error: '' }; },
    computed: {
      p() { return this.$product(this.productId); },
      pr() { return this.prId ? this.s.prs.find(x => x.id === this.prId) : null; },
      whs() { return this.s.warehouses.filter(w => !w.locked); },
      rollTotal() { return this.rolls.reduce((a, r) => a + (Number(r.len) || 0), 0); },
    },
    mounted() {
      this.whId = (this.whs.find(w => w.id === this.defaultWh) || this.whs[0] || {}).id || null;
      if (this.pr && !this.p.isRoll) this.qty = Math.max(0, this.pr.qty - this.pr.received) || null;
      this.$refs.dlg.showModal();
    },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },
      save() {
        try {
          const r = S.receiveStock(this.s, {
            productId: this.productId, whId: this.whId, qty: this.qty, rollLengths: this.rolls.map(x => x.len),
            prId: this.prId || null, userId: this.s.currentUserId,
          });
          SM.toast('ok', `รับ ${this.p.name} ${r.text} เข้า${this.$wh(this.whId).name}แล้ว`
            + (r.readied.length ? ` · กันของให้ใบเบิก ${r.readied.map(x => x.id).join(', ')} แล้ว` : ''), 5000);
          this.close();
        } catch (e) { this.error = e.message; }
      },
    },
    template: `
<dialog ref="dlg" class="dlg" aria-labelledby="rc-title" @cancel.prevent="close">
  <form class="dlg-in" @submit.prevent="save" novalidate>
    <div class="dlg-head"><h2 id="rc-title" class="grow">{{ pr ? 'รับของเข้า' : 'เติมสต็อก' }}</h2>
      <button type="button" class="btn ghost icon" @click="close" aria-label="ปิด"><ic n="x"/></button></div>
    <div class="dlg-body">
      <div class="row" style="align-items:flex-start"><img class="thumb" :src="p.img" alt="" @error="$noImg">
        <div class="grow"><p><b>{{ p.name }}</b></p><p class="muted small"><span class="mono">{{ p.id }}</span><span v-if="pr"> · ตามรายการต้องซื้อ <span class="mono">{{ pr.id }}</span> (ต้องซื้อ {{ $fmt(pr.qty, p.unit) }} · รับแล้ว {{ $fmt(pr.received, p.unit) }})</span></p></div></div>
      <div class="field"><label for="rc-wh" class="req">รับเข้าคลัง</label>
        <select id="rc-wh" class="input" v-model="whId"><option v-for="w in whs" :key="w.id" :value="w.id">{{ w.name }}</option></select></div>
      <div v-if="!p.isRoll" class="field"><label for="rc-qty" class="req">จำนวนที่รับเข้า</label>
        <div class="unitbox"><input id="rc-qty" type="number" inputmode="decimal" step="any" min="0" v-model.number="qty"><span>{{ p.unit }}</span></div></div>
      <div v-else class="stack">
        <span class="label req">ม้วนที่รับเข้า (ม้วนละกี่เมตร)</span>
        <div v-for="(r, i) in rolls" :key="i" class="row">
          <label :for="'rc-roll' + i" style="white-space:nowrap">ม้วนที่ {{ i + 1 }} ยาว</label>
          <div class="unitbox grow"><input :id="'rc-roll' + i" type="number" inputmode="decimal" step="any" min="0" v-model.number="r.len"><span>m</span></div>
          <button type="button" class="btn ghost icon" :disabled="rolls.length === 1" @click="rolls.splice(i, 1)" :aria-label="'ลบม้วนที่ ' + (i + 1)"><ic n="x"/></button>
        </div>
        <button type="button" class="btn" @click="rolls.push({ len: null })"><ic n="plus"/>เพิ่มม้วน</button>
        <p><b>รวม {{ rolls.length }} ม้วน {{ $fmt(rollTotal, 'm') }}</b></p>
      </div>
    </div>
    <div class="dlg-foot">
      <p v-if="error" class="msg bad" role="alert"><ic n="x"/><span>{{ error }}</span></p>
      <div class="row"><button type="button" class="btn" @click="close">ยกเลิก</button>
        <button type="submit" class="btn primary"><ic n="truck"/>รับเข้าคลัง</button></div>
    </div>
  </form>
</dialog>`,
  };

  SM.views.restock = {
    components: { ReceiveDialog },
    data: () => ({ s: SM.state, tab: 'buy', q: '', dlg: null }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      canReceive() { return this.user.role !== 'engineer'; },
      prs() { return this.s.prs.filter(p => p.status === 'open'); },
      low() { return S.lowStock(this.s); },
      stock() {
        const q = this.q.trim().toLowerCase();
        return this.s.products.filter(p => !q || [p.name, p.brand, p.model, p.id].some(v => (v || '').toLowerCase().includes(q)))
          .map(p => ({
            p, total: S.totalStock(this.s, p.id),
            whs: this.s.warehouses.map(w => ({ w, qty: S.available(this.s, p.id, w.id), rolls: this.s.rolls.filter(r => r.productId === p.id && r.whId === w.id).length })).filter(x => x.qty > 0),
          }));
      },
      tabs() { return [['buy', 'ต้องซื้อ', this.prs.length], ['low', 'ใกล้หมด', this.low.length], ['stock', 'ยอดคงเหลือ', 0]]; },
    },
    methods: {
      open(productId, prId = null, defaultWh = null) { this.dlg = { productId, prId, defaultWh }; },
    },
    template: `
<div class="narrow stack">
  <div class="page-head" style="margin:0"><h1 class="grow">เติมสต็อก</h1></div>
  <p v-if="!canReceive" class="msg info"><ic n="info"/><span>บัญชีนี้ดูรายการได้ การรับของเข้าคลังทำโดย Store หรือหัวหน้า</span></p>
  <div class="tabs" role="tablist">
    <button v-for="[k, label, n] in tabs" :key="k" role="tab" :aria-selected="tab === k" @click="tab = k">{{ label }}<span v-if="n"> ({{ n }})</span></button>
  </div>

  <section v-if="tab === 'buy'" class="stack" aria-label="รายการต้องซื้อ">
    <div v-if="!prs.length" class="empty"><ic n="check"/><p>ไม่มีรายการต้องซื้อค้างอยู่</p></div>
    <article v-for="pr in prs" :key="pr.id" class="card stack">
      <div class="row" style="align-items:flex-start"><img class="thumb" :src="$product(pr.productId).img" alt="" @error="$noImg">
        <div class="grow"><p><b>{{ $product(pr.productId).name }}</b></p>
          <p class="muted small"><span class="mono">{{ pr.id }}</span> · ขาดจากใบเบิก <a :href="'#/orders/' + pr.reqId" class="mono">{{ pr.reqId }}</a> · ส่งเข้า{{ $wh(pr.whId).name }}</p></div></div>
      <dl class="nums"><div class="kv"><dt>ต้องซื้อ</dt><dd>{{ $fmt(pr.qty, $product(pr.productId).unit) }}</dd></div>
        <div class="kv"><dt>รับแล้ว</dt><dd>{{ $fmt(pr.received, $product(pr.productId).unit) }}</dd></div></dl>
      <button v-if="canReceive" class="btn primary block" @click="open(pr.productId, pr.id, pr.whId)"><ic n="truck"/>รับของเข้า</button>
    </article>
  </section>

  <section v-else-if="tab === 'low'" class="stack" aria-label="ของใกล้หมด">
    <div v-if="!low.length" class="empty"><ic n="check"/><p>ไม่มีของที่ต่ำกว่าเกณฑ์เตือน</p></div>
    <article v-for="x in low" :key="x.product.id" class="card stack">
      <div class="row" style="align-items:flex-start"><img class="thumb" :src="x.product.img" alt="" @error="$noImg">
        <div class="grow"><p><b>{{ x.product.name }}</b></p><span class="tag warn"><ic n="warn"/>ใกล้หมด</span></div></div>
      <dl class="nums"><div class="kv"><dt>เหลือรวมทุกคลัง</dt><dd>{{ $fmt(x.total, x.product.unit) }}</dd></div>
        <div class="kv"><dt>เกณฑ์เตือน</dt><dd>{{ $fmt(x.reorderPoint, x.product.unit) }}</dd></div></dl>
      <button v-if="canReceive" class="btn primary block" @click="open(x.product.id)"><ic n="plus"/>เติมสต็อก</button>
    </article>
  </section>

  <section v-else class="stack" aria-label="ยอดคงเหลือ">
    <div class="field"><label for="st-q">ค้นหาสินค้า</label><input id="st-q" class="input" type="search" v-model="q" placeholder="ชื่อ ยี่ห้อ รหัส"></div>
    <article v-for="x in stock" :key="x.p.id" class="card stack">
      <div class="row" style="align-items:flex-start"><img class="thumb" :src="x.p.img" alt="" @error="$noImg">
        <div class="grow"><p><b>{{ x.p.name }}</b></p>
          <p class="small" :class="x.total.qty > 0 ? 't-brand' : 't-bad'"><b>รวมทุกคลัง {{ $fmt(x.total.qty, x.p.unit) }}</b><span v-if="x.total.rolls"> ({{ x.total.rolls }} ม้วน)</span></p></div>
        <button v-if="canReceive" class="btn" @click="open(x.p.id)" :aria-label="'เติมสต็อก ' + x.p.name"><ic n="plus"/>เติม</button></div>
      <dl v-if="x.whs.length" class="whnums">
        <div v-for="y in x.whs" :key="y.w.id" class="kv"><dt>{{ y.w.name }}</dt><dd>{{ $fmt(y.qty, x.p.unit) }}<span v-if="y.rolls" class="muted"> ({{ y.rolls }} ม้วน)</span></dd></div></dl>
    </article>
  </section>
  <receive-dialog v-if="dlg" v-bind="dlg" @close="dlg = null"/>
</div>`,
  };
})();

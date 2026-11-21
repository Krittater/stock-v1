var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// ชั้นรอตรวจ (#/qc) · Store/หัวหน้า: ของเสียหายที่คืนมา → คืนเข้าชั้นปกติ หรือตัดทิ้ง (สายม้วนย้ายทั้งม้วน)
(function () {
  const S = SM.store, T = SM.T;
  const key = (x) => [x.whId, x.productId, x.rollId || ''].join('|');

  SM.views.qc = {
    props: { route: Object },
    data: () => ({ s: SM.state, T, open: null, err: '' }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      allowed() { return this.user.role !== 'engineer'; },
      groups() {
        const items = S.qcStock(this.s);
        return this.s.warehouses.map(w => ({ wh: w, items: items.filter(x => x.whId === w.id) })).filter(g => g.items.length);
      },
    },
    watch: { 'user.id'() { this.open = null; this.err = ''; } },
    methods: {
      key,
      unit(x) { return this.$product(x.productId).unit; },
      start(x, mode) {
        this.err = '';
        this.open = { k: key(x), mode, shelf: '', reason: '', qty: x.qty };
      },
      shelves(x) { return S.shelves(this.s, x.whId); },
      go(x) {
        const o = this.open, p = this.$product(x.productId);
        try {
          S.qcDecide(this.s, { whId: x.whId, productId: x.productId, rollId: x.rollId, qty: x.rollId ? x.qty : o.qty, decision: o.mode,
            shelf: o.shelf, reason: o.reason }, this.user.id);
          SM.toast('ok', o.mode === 'restock' ? `คืน ${p.name} เข้าชั้น ${o.shelf} แล้ว` : `ตัดทิ้ง ${p.name} แล้ว`);
          this.open = null; this.err = '';
        } catch (e) { this.err = e.message; }
      },
    },
    template: `
<div class="narrow stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">ชั้นรอตรวจ</h1><a class="btn" href="#/returns"><ic n="undo"/>คืนของ</a></div>
  <div v-if="!allowed" class="msg warn"><ic n="lock"/><span>{{ T.FORBIDDEN }}</span></div>
  <template v-else>
    <p class="muted">ของเสียหายที่คืนมาจะอยู่ที่นี่ ยังเบิกไม่ได้ ตรวจแล้วเลือกว่าจะเก็บเข้าชั้นหรือตัดทิ้ง</p>
    <div v-if="!groups.length" class="empty"><ic n="box"/><p>{{ T.RT.qcEmpty }}</p></div>
    <section v-for="g in groups" :key="g.wh.id" class="card stack" :aria-label="g.wh.name">
      <h2>{{ g.wh.name }}</h2>
      <div class="rows">
        <div v-for="x in g.items" :key="key(x)" class="stack" style="gap:10px">
          <div class="row" style="align-items:flex-start">
            <img class="thumb" :src="$product(x.productId).img" alt="" @error="$noImg">
            <div class="grow"><p><b>{{ $product(x.productId).name }}</b></p>
              <p v-if="x.rollId" class="muted small">ม้วน <span class="mono">{{ x.rollId }}</span> · ยาว {{ $fmt(x.qty, unit(x)) }}</p>
              <p v-else class="muted small">รอตรวจ {{ $fmt(x.qty, unit(x)) }}</p></div></div>
          <div v-if="!open || open.k !== key(x)" class="row">
            <button class="btn grow" @click="start(x, 'restock')"><ic n="check"/>คืนเข้าชั้น</button>
            <button class="btn danger grow" @click="start(x, 'scrap')"><ic n="x"/>ตัดทิ้ง</button></div>
          <div v-else class="stack open-anim" style="gap:10px">
            <div v-if="!x.rollId" class="field"><label :for="'qq-' + key(x)">จำนวน</label>
              <div class="unitbox"><input :id="'qq-' + key(x)" type="number" inputmode="decimal" step="any" min="0" v-model.number="open.qty"><span>{{ unit(x) }}</span></div></div>
            <p v-else class="muted small">{{ open.mode === 'restock' ? 'ย้ายทั้งม้วน' : 'ตัดทิ้งทั้งม้วน' }}</p>
            <template v-if="open.mode === 'restock'">
              <span class="label">เก็บที่ชั้น</span>
              <div class="chips" role="group" aria-label="ชั้นวาง">
                <button v-for="c in shelves(x)" :key="c" class="chip" :aria-pressed="open.shelf === c" @click="open.shelf = c">{{ c }}</button></div></template>
            <div v-else class="field"><label :for="'qr-' + key(x)" class="req">เหตุผลที่ตัดทิ้ง</label>
              <input :id="'qr-' + key(x)" class="input" v-model="open.reason" placeholder="เช่น สายขาด ใช้งานไม่ได้" autocomplete="off"></div>
            <p v-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>
            <div class="row">
              <button class="btn" @click="open = null">ยกเลิก</button>
              <button class="btn primary grow" :disabled="open.mode === 'restock' ? !open.shelf : !open.reason.trim()" @click="go(x)">{{ open.mode === 'restock' ? 'ยืนยันคืนเข้าชั้น' : 'ยืนยันตัดทิ้ง' }}</button></div>
          </div>
        </div>
      </div>
    </section>
  </template>
</div>`,
  };
})();

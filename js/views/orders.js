var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store, T = SM.T;
  const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

  // ใบเบิกที่ผ่านมา (#/orders) · รายละเอียด+หยิบ (#/orders/:id)
  SM.views.orders = {
    props: { route: Object },
    data: () => ({ s: SM.state, T, when, scope: 'mine', act: null }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      staff() { return this.user.role !== 'engineer'; },
      mode() { return this.route.id ? 'detail' : 'list'; },
      visible() {
        const all = this.s.reqs.slice().reverse();
        return this.staff && this.scope === 'all' ? all : all.filter(r => r.userId === this.user.id);
      },
      req() { return this.s.reqs.find(r => r.id === this.route.id) || null; },
      canReturn() { return !!this.req && S.returnable(this.s, this.user.id).some(x => x.req.id === this.req.id); },
      prs() { return this.req ? this.s.prs.filter(p => p.reqId === this.req.id) : []; },
      steps() {
        const r = this.req, st = r.status;
        const approved = !['pending_approval', 'rejected'].includes(st);
        return [
          { label: 'ส่งใบเบิก', note: when(r.at), done: true },
          { label: st === 'rejected' ? 'ไม่อนุมัติ' : st === 'pending_approval' ? 'รอหัวหน้าอนุมัติ' : 'ผ่านการอนุมัติ', note: r.reason || '', done: approved, bad: st === 'rejected' },
          { label: 'จ่ายของ', note: st === 'ready' ? 'ของเข้าแล้ว กดจ่ายของได้' : st === 'waiting' ? 'รอของเข้า' : st === 'partial' ? 'จ่ายแล้วบางส่วน รอของส่วนที่ขาด' : '', done: r.lines.some(l => l.issued > 0) },
          { label: 'จ่ายครบ', note: '', done: st === 'issued' },
        ];
      },
      canClose() { return S.canCloseReq(this.req); },
      canCancel() { return S.canCancelReq(this.req); },
      canPick() { return this.req && this.req.lines.some(l => l.reserved > 0); },
    },
    methods: {
      pick() {
        try {
          const r = S.pickReq(this.s, this.req.id, this.user.id);
          SM.toast('ok', `จ่ายของตามใบเบิก ${r.id} แล้ว · ${T.status(r.status).label}`);
        } catch (e) { SM.toast('bad', e.message, 5000); }
      },
    },
    template: `
<div class="narrow stack lg">
  <!-- รายการใบเบิก -->
  <template v-if="mode === 'list'">
    <div class="page-head" style="margin:0"><h1 class="grow">ใบเบิกที่ผ่านมา</h1>
      <div v-if="staff" class="chips" role="group" aria-label="แสดงใบเบิกของ">
        <button class="chip" :aria-pressed="scope === 'mine'" @click="scope = 'mine'">ของฉัน</button>
        <button class="chip" :aria-pressed="scope === 'all'" @click="scope = 'all'">ทั้งหมด</button></div></div>
    <div v-if="!visible.length" class="empty"><ic n="list"/><p>ยังไม่มีใบเบิก</p><a class="btn primary" href="#/shop">ไปเบิกของ</a></div>
    <a v-for="r in visible" :key="r.id" class="card ocard" :href="'#/orders/' + r.id">
      <div class="row wrap"><b class="mono grow">{{ r.id }}</b>
        <span class="tag" :class="T.status(r.status).tone"><ic :n="T.status(r.status).icon"/>{{ T.status(r.status).label }}</span></div>
      <p>{{ $job(r.jobId).name }}</p>
      <p class="muted small">{{ when(r.at) }} · {{ $userOf(r.userId).name }} · {{ $wh(r.whId).name }}</p>
      <div class="row"><img v-for="l in r.lines.slice(0, 4)" :key="l.productId" class="thumb sm" :src="$product(l.productId).img" alt="" @error="$noImg">
        <span class="muted small grow">{{ r.lines.length }} รายการ</span><ic n="chevron" class="muted"/></div>
    </a>
  </template>

  <!-- รายละเอียด + หยิบ -->
  <template v-else-if="mode === 'detail'">
    <a class="link" href="#/orders" style="display:inline-flex;align-items:center">← ใบเบิกทั้งหมด</a>
    <div v-if="!req" class="empty"><ic n="list"/><p>ไม่พบใบเบิกนี้</p></div>
    <template v-else>
      <div class="page-head" style="margin:0"><h1 class="mono grow">{{ req.id }}</h1>
        <span class="tag" :class="T.status(req.status).tone"><ic :n="T.status(req.status).icon"/>{{ T.status(req.status).label }}</span></div>
      <section class="card stack">
        <dl class="info">
          <div class="kv"><dt>งาน</dt><dd><a :href="'#/jobs/' + req.jobId"><span class="mono">{{ req.jobId }}</span> {{ $job(req.jobId).name }}</a></dd></div>
          <div class="kv"><dt>เบิกจาก</dt><dd>{{ $wh(req.whId).name }}</dd></div>
          <div class="kv"><dt>ผู้เบิก</dt><dd>{{ $userOf(req.userId).name }}</dd></div>
          <div v-if="req.note" class="kv"><dt>หมายเหตุ</dt><dd>{{ req.note }}</dd></div>
        </dl>
        <ol class="timeline">
          <li v-for="st in steps" :key="st.label" :class="{ done: st.done, bad: st.bad }">
            <span class="tl-dot"><ic :n="st.bad ? 'x' : st.done ? 'check' : 'clock'"/></span>
            <span><b>{{ st.label }}</b><span v-if="!st.done && !st.bad" class="sr"> (ยังไม่ถึง)</span><br v-if="st.note"><span class="muted small">{{ st.note }}</span></span></li>
        </ol>
      </section>
      <section class="card stack" aria-labelledby="od-items">
        <h2 id="od-items">รายการ</h2>
        <div class="rows">
          <div v-for="l in req.lines" :key="l.productId" class="row" style="align-items:flex-start">
            <img class="thumb" :src="$product(l.productId).img" alt="" @error="$noImg">
            <div class="grow stack" style="gap:6px">
              <p><b>{{ $product(l.productId).name }}</b></p>
              <dl class="nums">
                <div class="kv"><dt>ขอเบิก</dt><dd>{{ $fmt(l.qty, $product(l.productId).unit) }}</dd></div>
                <div class="kv"><dt>จ่ายแล้ว</dt><dd>{{ $fmt(l.issued, $product(l.productId).unit) }}</dd></div>
                <div v-if="l.reserved > 0" class="kv"><dt>กันไว้ให้</dt><dd class="t-ok">{{ $fmt(l.reserved, $product(l.productId).unit) }}</dd></div>
                <div v-if="l.returned > 0" class="kv"><dt>คืนแล้ว</dt><dd>{{ $fmt(l.returned, $product(l.productId).unit) }}</dd></div>
              </dl>
              <p v-for="c in l.cuts" :key="c.rollId + c.cut" class="muted small">ตัดจากม้วน <span class="mono">{{ c.rollId }}</span> (ที่ {{ c.shelf }}) · ตัด {{ $fmt(c.cut, 'm') }} · เหลือ {{ $fmt(c.left, 'm') }}</p>
              <p v-if="l.shelf" class="muted small">หยิบจากชั้น {{ l.shelf }}</p>
            </div>
          </div>
        </div>
        <p v-for="p in prs" :key="p.id" class="msg" :class="p.status === 'open' ? 'warn' : 'ok'"><ic :n="p.status === 'open' ? 'clock' : 'check'"/>
          <span class="grow">รายการต้องซื้อ <span class="mono">{{ p.id }}</span> · {{ $product(p.productId).name }} {{ $fmt(p.qty, $product(p.productId).unit) }} ·
            {{ p.status === 'open' ? 'รอของเข้า' : 'ของเข้าแล้ว' }} <a href="#/restock">ดูรายการต้องซื้อ</a></span></p>
        <div class="row res-btns">
          <button v-if="canPick" class="btn primary big" @click="pick"><ic n="check"/>จ่ายของ</button>
          <a v-if="canReturn" class="btn big" :href="'#/returns?req=' + req.id"><ic n="undo"/>คืนของ</a>
          <button v-if="canClose" class="btn big" @click="act = 'close'">ปิดใบเบิก</button>
          <button v-if="canCancel" class="btn big" @click="act = 'cancel'">ยกเลิก</button>
        </div>
      </section>
    </template>
  </template>
  <req-action v-if="act" :req-id="req.id" :mode="act" @close="act = null"/>
</div>`,
  };
})();

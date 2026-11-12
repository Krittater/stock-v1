var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store;

  // อนุมัติใบเบิก (หัวหน้า) + ยืนยันยอดตั้งต้นของสินค้าใหม่ (Store/หัวหน้า)
  SM.views.approvals = {
    data: () => ({ s: SM.state, rejecting: null, reason: '', err: '' }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      allowed() { return this.user.role !== 'engineer'; },
      reqs() { return this.user.role === 'head' ? this.s.reqs.filter(r => r.status === 'pending_approval') : []; },
      ccs() { return this.s.ccs.filter(c => c.status === 'pending'); },
    },
    methods: {
      run(fn, okText) {
        try { fn(); SM.toast('ok', okText); this.rejecting = null; this.reason = ''; this.err = ''; }
        catch (e) { this.err = e.message; }
      },
      startReject(id) { this.rejecting = id; this.reason = ''; this.err = ''; this.$nextTick(() => { const el = document.getElementById('why-' + id); if (el) el.focus(); }); },
      approve(r) { this.run(() => S.approveReq(this.s, r.id, this.user.id, true), `อนุมัติใบเบิก ${r.id} แล้ว ระบบจ่ายของให้ผู้เบิกแล้ว`); },
      reject(r) { this.run(() => S.approveReq(this.s, r.id, this.user.id, false, this.reason), `ไม่อนุมัติใบเบิก ${r.id} แจ้งผู้เบิกแล้ว`); },
      confirm(c) { this.run(() => S.confirmCC(this.s, c.id, this.user.id, true), `ยืนยันยอด ${c.id} แล้ว ยอดเข้าคลังแล้ว`); },
      deny(c) { this.run(() => S.confirmCC(this.s, c.id, this.user.id, false, this.reason), `บันทึกว่าไม่มีของ ${c.id} แจ้งผู้แจ้งแล้ว`); },
    },
    template: `
<div class="narrow stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">อนุมัติ</h1></div>
  <p v-if="!allowed" class="msg info"><ic n="info"/><span>บัญชีนี้ไม่มีรายการให้อนุมัติ</span></p>
  <template v-else>
    <div v-if="!reqs.length && !ccs.length" class="empty"><ic n="check"/><p>ไม่มีรายการรอ</p></div>

    <section v-if="reqs.length" class="stack" aria-labelledby="ap-req">
      <h2 id="ap-req">ใบเบิกรออนุมัติ ({{ reqs.length }})</h2>
      <article v-for="r in reqs" :key="r.id" class="card stack">
        <div class="row wrap"><b class="mono grow">{{ r.id }}</b><span class="tag info"><ic n="send"/>รออนุมัติ</span></div>
        <p><b>{{ $userOf(r.userId).name }}</b> ขอเบิกใช้กับงาน <span class="mono">{{ r.jobId }}</span> {{ $job(r.jobId).name }} · จาก{{ $wh(r.whId).name }}</p>
        <p v-if="r.note" class="muted">หมายเหตุ: {{ r.note }}</p>
        <div class="rows">
          <div v-for="l in r.lines" :key="l.productId" class="row">
            <img class="thumb sm" :src="$product(l.productId).img" alt="" @error="$noImg">
            <span class="grow">{{ $product(l.productId).name }}</span><b>ขอเบิก {{ $fmt(l.qty, $product(l.productId).unit) }}</b></div>
        </div>
        <div v-if="rejecting === r.id" class="stack">
          <div class="field"><label :for="'why-' + r.id" class="req">เหตุผลที่ไม่อนุมัติ</label><input :id="'why-' + r.id" class="input" v-model="reason"></div>
          <p v-if="err" class="err" role="alert">{{ err }}</p>
          <div class="row res-btns"><button class="btn" @click="rejecting = null">ยกเลิก</button><button class="btn danger" @click="reject(r)">ยืนยันไม่อนุมัติ</button></div>
        </div>
        <div v-else class="row res-btns"><button class="btn danger" @click="startReject(r.id)"><ic n="x"/>ไม่อนุมัติ</button>
          <button class="btn primary" @click="approve(r)"><ic n="check"/>อนุมัติ</button></div>
      </article>
    </section>

    <section v-if="ccs.length" class="stack" aria-labelledby="ap-cc">
      <h2 id="ap-cc">ยอดตั้งต้นรอยืนยัน ({{ ccs.length }})</h2>
      <article v-for="c in ccs" :key="c.id" class="card stack">
        <div class="row wrap"><b class="mono grow">{{ c.id }}</b><span class="tag info"><ic n="clock"/>รอยืนยันยอด</span></div>
        <div class="row" style="align-items:flex-start"><img class="thumb" :src="$product(c.productId).img" alt="" @error="$noImg">
          <div class="grow"><p><b>{{ $product(c.productId).name }}</b></p>
            <p>{{ $userOf(c.byUserId).name }} แจ้งว่ามี <b>{{ c.text }}</b> ที่{{ $wh(c.whId).name }}</p></div></div>
        <div v-if="rejecting === c.id" class="stack">
          <div class="field"><label :for="'why-' + c.id" class="req">เหตุผล (เช่น หาไม่เจอที่ชั้น)</label><input :id="'why-' + c.id" class="input" v-model="reason"></div>
          <p v-if="err" class="err" role="alert">{{ err }}</p>
          <div class="row res-btns"><button class="btn" @click="rejecting = null">ยกเลิก</button><button class="btn danger" @click="deny(c)">ยืนยันว่าไม่มีของ</button></div>
        </div>
        <div v-else class="row res-btns"><button class="btn danger" @click="startReject(c.id)"><ic n="x"/>ไม่มีของ</button>
          <button class="btn primary" @click="confirm(c)"><ic n="check"/>ยืนยัน มีของจริง</button></div>
      </article>
    </section>
  </template>
</div>`,
  };
})();

var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store;

  // อนุมัติใบเบิก (หัวหน้า) + ยืนยันยอดตั้งต้นของสินค้าใหม่ (Store/หัวหน้า)
  SM.views.approvals = {
    data: () => ({ s: SM.state, rejecting: null, reason: '', err: '' }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      allowed() { return this.user.role !== 'engineer'; },
      items() { return S.approvalItems(this.s, this.user.id); },
      reqs() { return this.items.reqs; },
      ccs() { return this.items.ccs; },
    },
    methods: {
      run(fn, okText) {
        try { fn(); SM.toast('ok', okText); this.rejecting = null; this.reason = ''; this.err = ''; }
        catch (e) { this.err = e.message; if (!this.rejecting) SM.toast('bad', e.message, 5000); }
      },
      startReject(id) { this.rejecting = id; this.reason = ''; this.err = ''; this.$nextTick(() => { const el = document.getElementById('why-' + id); if (el) el.focus(); }); },
      approve(r) { this.run(() => S.approveReq(this.s, r.id, this.user.id, true), `อนุมัติใบเบิก ${r.id} แล้ว ระบบจ่ายของให้ผู้เบิกแล้ว`); },
      reject(r) { this.run(() => S.approveReq(this.s, r.id, this.user.id, false, this.reason), `ไม่อนุมัติใบเบิก ${r.id} แจ้งผู้เบิกแล้ว`); },
      confirm(c) {
        try { const r = S.confirmCC(this.s, c.id, this.user.id, true); SM.toast('ok', r.stage === 'done' ? 'ยอดเข้าคลังแล้ว' : 'ส่งต่อให้หัวหน้าอนุมัติแล้ว'); this.err = ''; }
        catch (e) { SM.toast('bad', e.message, 5000); }
      },
      deny(c) { this.run(() => S.confirmCC(this.s, c.id, this.user.id, false, this.reason), `บันทึกว่าไม่มีของ ${c.id} แจ้งผู้แจ้งแล้ว`); },
    },
    template: `
<div class="narrow stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">อนุมัติ</h1></div>
  <p v-if="!allowed" class="msg warn"><ic n="lock"/><span>{{ $T.FORBIDDEN }}</span></p>
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
      <h2 id="ap-cc">ยอดรอยืนยัน ({{ ccs.length }})</h2>
      <article v-for="c in ccs" :key="c.id" class="card stack">
        <div class="row wrap"><b class="mono grow">{{ c.id }}</b><span class="tag info"><ic n="clock"/>{{ c.stage === 'head' ? 'รอหัวหน้าอนุมัติยอด' : 'รอ Store ยืนยันยอด' }}</span></div>
        <div class="row" style="align-items:flex-start"><img class="thumb" :src="$product(c.productId).img" alt="" @error="$noImg">
          <div class="grow"><p><b>{{ $product(c.productId).name }}</b></p>
            <p><b>{{ c.text }}</b> · {{ $wh(c.whId).name }} · ชั้น {{ c.shelf }}</p>
            <p class="muted">ผู้ส่ง {{ $userOf(c.byUserId).name }}{{ c.kind === 'found' ? ' · ของที่เจอเพิ่ม' : '' }}</p></div></div>
        <p v-if="c.stage === 'store' && $product(c.productId).needsApproval" class="msg warn"><ic n="shield"/><span>สินค้านี้ต้องให้หัวหน้าอนุมัติต่อ</span></p>
        <p v-if="c.stage === 'store' && rejecting !== c.id" class="help">ตรวจว่ามีของจริงในคลัง แล้วกดยืนยัน</p>
        <div v-if="rejecting === c.id" class="stack">
          <div class="field"><label :for="'why-' + c.id" class="req">เหตุผล (จะแจ้งผู้ขอ)</label><input :id="'why-' + c.id" class="input" v-model="reason"></div>
          <p v-if="err" class="err" role="alert">{{ err }}</p>
          <div class="row res-btns"><button class="btn" @click="rejecting = null">ยกเลิก</button><button class="btn danger" :disabled="!reason.trim()" @click="deny(c)">ยืนยันว่าไม่มีของ</button></div>
        </div>
        <div v-else class="row res-btns"><button class="btn danger" @click="startReject(c.id)"><ic n="x"/>ไม่มีของ</button>
          <button class="btn primary" @click="confirm(c)"><ic n="check"/>ยืนยันยอด</button></div>
      </article>
    </section>
  </template>
</div>`,
  };
})();

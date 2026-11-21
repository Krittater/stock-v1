var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// งาน: รายการ (#/jobs) · รายละเอียด (#/jobs/:id) · กล่องเพิ่ม/แก้งาน · กล่องยืนยันปิดงาน · กล่องปิดใบเบิก/ยกเลิก (ใช้ร่วมกับ orders.js)
(function () {
  const S = SM.store, T = SM.T;
  const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const day = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '—');
  const todayStr = () => S._.now().slice(0, 10);

  // ปิดใบเบิก / ยกเลิกใบเบิก — ติ๊กยกเลิกรายการต้องซื้อไว้เป็นค่าเริ่ม (Q3)
  // <req-action :req-id :mode="'close'|'cancel'" @close @done/>
  const ReqAction = {
    props: { reqId: String, mode: String },
    emits: ['close', 'done'],
    data() { return { s: SM.state, cancelPRs: true, error: '' }; },
    computed: {
      isClose() { return this.mode === 'close'; },
      prs() { return S.openPRsOf(this.s, [this.reqId]); },
    },
    mounted() { this.$refs.dlg.showModal(); },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },
      go() {
        try {
          (this.isClose ? S.closeReq : S.cancelReq)(this.s, this.reqId, this.s.currentUserId, { cancelPRs: this.cancelPRs && this.prs.length > 0 });
          SM.toast('ok', `${this.isClose ? 'ปิดใบเบิก' : 'ยกเลิกใบเบิก'} ${this.reqId} แล้ว`);
          this.$emit('done'); this.close();
        } catch (e) { this.error = e.message; }
      },
    },
    template: `
<dialog ref="dlg" class="dlg confirm" aria-labelledby="ra-title" @cancel.prevent="close">
  <div class="dlg-in">
    <div class="dlg-head"><h2 id="ra-title" class="grow">{{ isClose ? 'ปิดใบเบิก' : 'ยกเลิกใบเบิก' }} <span class="mono">{{ reqId }}</span></h2></div>
    <div class="dlg-body">
      <p>{{ isClose ? 'ของที่จ่ายไปแล้วยังอยู่ตามเดิม ส่วนที่ยังไม่จ่ายจะไม่จ่ายอีก และของที่กันไว้ให้จะถูกปล่อยคืนคลัง' : 'ใบเบิกนี้ยังไม่ได้จ่ายของเลย ของที่กันไว้ให้จะถูกปล่อยคืนคลัง' }}</p>
      <label v-if="prs.length" class="check"><input type="checkbox" v-model="cancelPRs"><span>ยกเลิกรายการต้องซื้อที่ยังไม่ได้ของ ({{ prs.length }})</span></label>
      <p v-if="error" class="msg bad" role="alert"><ic n="x"/><span>{{ error }}</span></p>
    </div>
    <div class="dlg-foot"><div class="row"><button type="button" class="btn" @click="close">ไม่ทำ</button>
      <button type="button" class="btn primary" @click="go">{{ isClose ? 'ปิดใบเบิก' : 'ยกเลิกใบเบิก' }}</button></div></div>
  </div>
</dialog>`,
  };

  // เพิ่ม (ไม่ส่ง job-id) / แก้ (ส่ง job-id) งาน — กล่องเต็มตามตาราง 4.3
  const JobForm = {
    props: { jobId: String },
    emits: ['close', 'saved'],
    data() {
      const j = this.jobId ? SM.state.jobs.find(x => x.id === this.jobId) : null;
      return { s: SM.state, T, error: '', f: j ? { name: j.name, customer: j.customer, site: j.site, ownerId: j.ownerId, start: j.start, due: j.due || '', note: j.note }
        : { name: '', customer: '', site: '', ownerId: SM.state.currentUserId, start: todayStr(), due: '', note: '' } };
    },
    computed: {
      newId() { return S.nextJobId(this.s); },
      similar() { return S.similarJobs(this.s, this.f.name).filter(x => x.job.id !== this.jobId).slice(0, 3); },
    },
    mounted() { this.$refs.dlg.showModal(); },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },
      save() {
        this.error = '';
        try {
          if (this.jobId) { const j = S.updateJob(this.s, this.jobId, this.f, this.s.currentUserId); SM.toast('ok', `บันทึกงาน ${j.id} แล้ว`); this.$emit('saved', j); }
          else { const j = S.createJob(this.s, this.f, this.s.currentUserId); SM.toast('ok', T.N52(j) + ' — เลือกใช้ในใบเบิกได้ทันที'); this.$emit('saved', j); }
          this.close();
        } catch (e) { this.error = e.message; }
      },
    },
    template: `
<dialog ref="dlg" class="dlg sheet" aria-labelledby="jf-title" @cancel.prevent="close">
  <form class="dlg-in" @submit.prevent="save" novalidate>
    <div class="dlg-head"><h2 id="jf-title" class="grow">{{ jobId ? 'แก้งาน' : 'เพิ่มงาน' }}</h2>
      <button type="button" class="btn ghost icon" @click="close" aria-label="ปิด"><ic n="x"/></button></div>
    <div class="dlg-body">
      <p class="ro"><span class="small muted">รหัสงาน{{ jobId ? '' : ' (ระบบออกให้)' }}</span><b class="mono">{{ jobId || newId }}</b></p>
      <div class="field"><label for="jf-name" class="req">ชื่องาน</label>
        <input id="jf-name" class="input" v-model="f.name" placeholder="เช่น ติดตั้งแอร์ ห้องประชุม" autocomplete="off">
        <div v-if="similar.length" class="msg warn" role="status"><ic n="warn"/>
          <div class="grow stack"><b>มีงานชื่อคล้ายกัน ตรวจสอบก่อนเปิดซ้ำ</b>
            <span v-for="{ job: j } in similar" :key="j.id"><span class="mono">{{ j.id }}</span> {{ j.name }} · <span class="tag" :class="j.open ? 'ok' : 'info'">{{ j.open ? 'เปิดอยู่' : 'ปิดแล้ว' }}</span></span></div></div></div>
      <div class="field"><label for="jf-cust">ลูกค้า / หน่วยงาน</label><input id="jf-cust" class="input" v-model="f.customer" placeholder="เช่น ภายในบริษัท"></div>
      <div class="field"><label for="jf-site">สถานที่ / ไซต์</label><input id="jf-site" class="input" v-model="f.site" placeholder="เช่น มาบตาพุด ระยอง"></div>
      <div class="field"><label for="jf-owner">ผู้รับผิดชอบ</label>
        <select id="jf-owner" class="input" v-model="f.ownerId"><option v-for="u in s.users" :key="u.id" :value="u.id">{{ u.name }}</option></select></div>
      <div class="field"><label for="jf-start">วันเริ่ม</label><input id="jf-start" type="date" class="input" v-model="f.start"></div>
      <div class="field"><label for="jf-due">กำหนดเสร็จ</label><input id="jf-due" type="date" class="input" v-model="f.due"></div>
      <div class="field"><label for="jf-note">หมายเหตุ</label><textarea id="jf-note" class="input" rows="2" v-model="f.note"></textarea></div>
    </div>
    <div class="dlg-foot">
      <p v-if="error" class="msg bad" role="alert"><ic n="x"/><span>{{ error }}</span></p>
      <div class="row"><button type="button" class="btn" @click="close">ยกเลิก</button>
        <button type="submit" class="btn primary" :disabled="!f.name.trim()">บันทึก</button></div>
    </div>
  </form>
</dialog>`,
  };

  // ยืนยันปิดงาน (JB-G4/AC9)
  const CloseJob = {
    props: { jobId: String },
    emits: ['close', 'done'],
    data() { return { s: SM.state, cancelPRs: true, error: '' }; },
    computed: {
      job() { return this.s.jobs.find(j => j.id === this.jobId); },
      chk() { return S.closeJobCheck(this.s, this.jobId); },
      blocked() { return this.chk.openReqs.length > 0; },
    },
    mounted() { this.$refs.dlg.showModal(); },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },
      go() {
        try {
          S.closeJob(this.s, this.jobId, this.s.currentUserId, { cancelPRs: this.cancelPRs && this.chk.openPRs.length > 0 });
          SM.toast('ok', 'ปิดงานแล้ว · เบิกเพิ่มไม่ได้ แต่ยังคืนของอ้างอิงใบเบิกเดิมได้', 5000);
          this.$emit('done'); this.close();
        } catch (e) { this.error = e.message; }
      },
    },
    template: `
<dialog ref="dlg" class="dlg confirm" aria-labelledby="cj-title" @cancel.prevent="close">
  <div class="dlg-in">
    <div class="dlg-head"><h2 id="cj-title" class="grow">ปิดงาน <span class="mono">{{ jobId }}</span></h2></div>
    <div class="dlg-body">
      <p>{{ job.name }}</p>
      <p v-if="blocked" class="msg bad" role="alert"><ic n="x"/>
        <span>ยังมีใบเบิกที่ไม่ปิด <template v-for="(id, i) in chk.openReqs" :key="id"><template v-if="i">, </template><a :href="'#/orders/' + id" class="mono">{{ id }}</a></template> — ปิดหรือยกเลิกก่อนปิดงาน</span></p>
      <div v-if="chk.unreturned.length" class="msg warn"><ic n="warn"/>
        <div class="grow stack"><b>ยังมีของที่เบิกไปแต่ยังไม่คืน {{ chk.unreturned.length }} รายการ</b>
          <span v-for="u in chk.unreturned" :key="u.productId">{{ $product(u.productId).name }} · {{ $fmt(u.qty, $product(u.productId).unit) }}</span></div></div>
      <label v-if="chk.openPRs.length" class="check"><input type="checkbox" v-model="cancelPRs"><span>ยกเลิกรายการต้องซื้อที่ยังไม่ได้ของ ({{ chk.openPRs.length }})</span></label>
      <p v-if="!blocked && !chk.unreturned.length && !chk.openPRs.length" class="muted">ปิดงานนี้ได้เลย ถ้าต้องการกลับมาใช้ กด "เปิดงานอีกครั้ง" ได้ทุกเมื่อ</p>
      <p v-if="error" class="msg bad" role="alert"><ic n="x"/><span>{{ error }}</span></p>
    </div>
    <div class="dlg-foot"><div class="row"><button type="button" class="btn" @click="close">ยกเลิก</button>
      <button type="button" class="btn primary" :disabled="blocked" @click="go">ปิดงาน</button></div></div>
  </div>
</dialog>`,
  };

  SM.ReqAction = ReqAction;

  SM.views.jobs = {
    components: { JobForm, CloseJob, ReqAction },
    props: { route: Object },
    data: () => ({ s: SM.state, T, tab: 'open', q: '', form: null, closing: false, act: null, miss: '' }),
    computed: {
      mode() { return this.route.id ? 'detail' : 'list'; },
      job() { return this.s.jobs.find(j => j.id === this.route.id) || null; },
      list() {
        const q = this.q.trim().toLowerCase();
        return this.s.jobs.filter(j => j.open === (this.tab === 'open') && (!q || [j.id, j.name, j.customer, j.site].some(v => (v || '').toLowerCase().includes(q))))
          .slice().reverse();
      },
      usage() { return this.job ? S.jobUsage(this.s, this.job.id) : []; },
      reqs() { return this.job ? this.s.reqs.filter(r => r.jobId === this.job.id).slice().reverse() : []; },
      history() { return this.job ? S.auditFor(this.s, this.job.id).slice().reverse().slice(0, 20) : []; },
    },
    methods: {
      when, day,
      counts(j) { const all = this.s.reqs.filter(r => r.jobId === j.id).length; return { all, open: S.openReqsOf(this.s, j.id).length }; },
      owner(j) { const u = this.$userOf(j.ownerId); return u ? u.name : '—'; },
      who(id) { const u = this.$userOf(id); return u ? u.name : id; },
      scanned(e) { SM.go('#/jobs/' + e.id); },
      saved(j) { if (!this.route.id) SM.go('#/jobs/' + j.id); },
      reopen() { S.reopenJob(this.s, this.job.id, this.s.currentUserId); SM.toast('ok', 'เปิดงานอีกครั้งแล้ว'); },
      clone() {
        try { const j = S.cloneJob(this.s, this.job.id, this.s.currentUserId); SM.toast('ok', T.N52(j)); SM.go('#/jobs/' + j.id); }
        catch (e) { SM.toast('bad', e.message, 5000); }
      },
      download() {
        const url = URL.createObjectURL(new Blob([S.jobUsageCsv(this.s, this.job.id)], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `${this.job.id}-usage.csv`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      canClose: S.canCloseReq, canCancel: S.canCancelReq,
    },
    template: `
<div class="narrow stack lg">
  <!-- รายการงาน -->
  <template v-if="mode === 'list'">
    <div class="page-head" style="margin:0"><h1 class="grow">งาน</h1>
      <button class="btn primary" @click="form = ''"><ic n="plus"/>เพิ่มงาน</button></div>
    <div class="row">
      <div class="search grow"><ic n="search"/><input class="input" type="search" v-model="q" placeholder="ค้นหา รหัส ชื่องาน ลูกค้า" aria-label="ค้นหางาน"></div>
      <div><scan-button :kinds="['job']" @found="scanned"/></div>
    </div>
    <div class="tabs" role="tablist" aria-label="สถานะงาน" style="margin:0">
      <button role="tab" :aria-selected="tab === 'open'" @click="tab = 'open'">เปิดอยู่</button>
      <button role="tab" :aria-selected="tab === 'closed'" @click="tab = 'closed'">ปิดแล้ว</button>
    </div>
    <div v-if="!list.length" class="empty"><ic n="list"/><p>ไม่มีงาน</p></div>
    <a v-for="j in list" :key="j.id" class="card ocard" :href="'#/jobs/' + j.id">
      <div class="row wrap"><b class="mono grow">{{ j.id }}</b>
        <span v-if="counts(j).open" class="tag warn"><ic n="warn"/>ใบเบิก {{ counts(j).all }} ({{ counts(j).open }} ค้าง)</span>
        <span v-else-if="counts(j).all" class="muted small">ใบเบิก {{ counts(j).all }}</span></div>
      <p><b>{{ j.name }}</b></p>
      <p class="muted small">{{ [j.customer, j.site].filter(Boolean).join(' · ') || 'ไม่ระบุลูกค้า' }} · ผู้รับผิดชอบ {{ owner(j) }}</p>
    </a>
  </template>

  <!-- รายละเอียดงาน -->
  <template v-else>
    <a class="link" href="#/jobs" style="display:inline-flex;align-items:center">← งานทั้งหมด</a>
    <div v-if="!job" class="empty"><ic n="list"/><p>ไม่พบงานนี้</p></div>
    <template v-else>
      <div class="page-head" style="margin:0"><h1 class="grow">{{ job.name }}</h1>
        <span class="tag" :class="job.open ? 'ok' : 'info'"><ic :n="job.open ? 'check' : 'lock'"/>{{ job.open ? 'เปิดอยู่' : 'ปิดแล้ว' }}</span></div>
      <section class="card stack">
        <dl class="info">
          <div class="kv"><dt>รหัสงาน</dt><dd class="mono">{{ job.id }}</dd></div>
          <div class="kv"><dt>ลูกค้า / หน่วยงาน</dt><dd>{{ job.customer || '—' }}</dd></div>
          <div class="kv"><dt>สถานที่ / ไซต์</dt><dd>{{ job.site || '—' }}</dd></div>
          <div class="kv"><dt>ผู้รับผิดชอบ</dt><dd>{{ owner(job) }}</dd></div>
          <div class="kv"><dt>วันเริ่ม</dt><dd>{{ day(job.start) }}</dd></div>
          <div class="kv"><dt>กำหนดเสร็จ</dt><dd>{{ day(job.due) }}</dd></div>
          <div v-if="job.closedAt" class="kv"><dt>วันปิดงาน</dt><dd>{{ day(job.closedAt) }}</dd></div>
          <div v-if="job.note" class="kv"><dt>หมายเหตุ</dt><dd>{{ job.note }}</dd></div>
        </dl>
        <div class="row wrap">
          <button v-if="job.open" class="btn primary big" @click="closing = true"><ic n="lock"/>ปิดงาน</button>
          <button v-else class="btn primary big" @click="reopen"><ic n="undo"/>เปิดงานอีกครั้ง</button>
          <button class="btn big" @click="form = job.id">แก้งาน</button>
          <button class="btn big" @click="clone"><ic n="plus"/>เปิดงานใหม่จากงานนี้</button>
        </div>
      </section>

      <section class="card stack" aria-labelledby="jd-use">
        <div class="row"><h2 id="jd-use" class="grow">ยอดใช้ของงานนี้</h2>
          <button v-if="usage.length" class="btn" @click="download"><ic n="send"/>ส่งออก Excel</button></div>
        <p v-if="!usage.length" class="muted">ยังไม่มีการเบิกของ</p>
        <div class="rows">
          <div v-for="u in usage" :key="u.productId">
            <p><b>{{ $product(u.productId).name }}</b></p>
            <dl class="nums">
              <div class="kv"><dt>เบิก</dt><dd>{{ $fmt(u.issued, $product(u.productId).unit) }}</dd></div>
              <div class="kv"><dt>คืน</dt><dd>{{ $fmt(u.returned, $product(u.productId).unit) }}</dd></div>
              <div class="kv"><dt>ใช้จริง</dt><dd>{{ $fmt(u.used, $product(u.productId).unit) }}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section class="card stack" aria-labelledby="jd-reqs">
        <h2 id="jd-reqs">ใบเบิกของงานนี้</h2>
        <p v-if="!reqs.length" class="muted">ยังไม่มีใบเบิก</p>
        <div class="rows">
          <div v-for="r in reqs" :key="r.id" class="stack" style="gap:8px">
            <a :href="'#/orders/' + r.id" class="row wrap" style="text-decoration:none;color:inherit"><b class="mono grow">{{ r.id }}</b>
              <span class="tag" :class="T.status(r.status).tone"><ic :n="T.status(r.status).icon"/>{{ T.status(r.status).label }}</span></a>
            <p class="muted small">{{ when(r.at) }} · {{ who(r.userId) }} · {{ r.lines.length }} รายการ</p>
            <div v-if="canClose(r) || canCancel(r)" class="row">
              <button v-if="canClose(r)" class="btn" @click="act = { id: r.id, mode: 'close' }">ปิดใบเบิก</button>
              <button v-if="canCancel(r)" class="btn" @click="act = { id: r.id, mode: 'cancel' }">ยกเลิก</button></div>
          </div>
        </div>
      </section>

      <section class="card stack" aria-labelledby="jd-hist">
        <h2 id="jd-hist">ประวัติ</h2>
        <p v-if="!history.length" class="muted">ยังไม่มีประวัติ</p>
        <ul class="hist"><li v-for="h in history" :key="h.id || h.at + h.action"><span>{{ h.text }}</span><br><span class="muted small">{{ when(h.at) }} · {{ who(h.userId) }}</span></li></ul>
      </section>
    </template>
  </template>

  <job-form v-if="form !== null" :job-id="form || undefined" @close="form = null" @saved="saved"/>
  <close-job v-if="closing" :job-id="job.id" @close="closing = false"/>
  <req-action v-if="act" :req-id="act.id" :mode="act.mode" @close="act = null"/>
</div>`,
  };
})();

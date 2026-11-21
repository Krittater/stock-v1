var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store, T = SM.T;
  const OUTCOME = {
    issued: { icon: 'check', tone: 'ok', title: T.N57(), tag: 'จ่ายครบ' },
    partial: { icon: 'warn', tone: 'warn', title: T.N58(), tag: 'จ่ายบางส่วน' },
    waiting: { icon: 'clock', tone: 'info', title: T.N59(), tag: 'รอของเข้า' },
    pending_approval: { icon: 'send', tone: 'info', title: T.N61(), tag: 'รออนุมัติ' },
    pick_failed: { icon: 'warn', tone: 'warn', title: T.N62(), tag: 'จ่ายไม่สำเร็จ' },
  };
  const STATUS_TAG = {
    full: ['ok', 'check'], short: ['warn', 'warn'], none: ['bad', 'x'], locked: ['warn', 'lock'],
    ok: ['ok', 'check'],
  };

  // กล่องเพิ่มงานใหม่ (N51–N53)
  const JobDialog = {
    props: { initialName: String },
    emits: ['close', 'picked'],
    data() { return { s: SM.state, T, name: this.initialName || '', customer: '', error: '' }; },
    computed: { similar() { return S.similarJobs(this.s, this.name).slice(0, 3); } },
    mounted() { this.$refs.dlg.showModal(); },
    methods: {
      close() { this.$refs.dlg.close(); this.$emit('close'); },
      use(job) { this.$emit('picked', job); this.close(); },
      save() {
        this.error = '';
        try {
          const job = S.createJob(this.s, { name: this.name, customer: this.customer }, this.s.currentUserId);
          SM.toast('ok', T.N52(job)); this.use(job);
        } catch (e) { this.error = T.N53(e.message); }   // กล่องเปิดอยู่ toast จะอยู่หลังกล่อง จึงแสดงในกล่อง
      },
    },
    template: `
<dialog ref="dlg" class="dlg" aria-labelledby="jd-title" @cancel.prevent="close">
  <form class="dlg-in" @submit.prevent="save" novalidate>
    <div class="dlg-head"><h2 id="jd-title" class="grow">เพิ่มงานใหม่</h2>
      <button type="button" class="btn ghost icon" @click="close" aria-label="ปิด"><ic n="x"/></button></div>
    <div class="dlg-body">
      <div class="field"><label for="jd-name" class="req">ชื่องาน</label>
        <input id="jd-name" class="input" v-model="name" placeholder="เช่น ติดตั้งแอร์ ห้องประชุม" autocomplete="off">
        <div v-for="{ job: j } in similar" :key="j.id" class="msg warn"><ic n="warn"/>
          <div class="grow stack"><span>{{ T.N51(j) }}</span><button v-if="j.open" type="button" class="btn" @click="use(j)">ใช้งานนี้</button><span v-else class="small">ปิดแล้ว</span></div></div>
      </div>
      <div class="field"><label for="jd-cust">ลูกค้าหรือสถานที่</label><input id="jd-cust" class="input" v-model="customer"></div>
    </div>
    <div class="dlg-foot"><p v-if="error" class="msg bad" role="alert"><ic n="x"/><span>{{ error }}</span></p>
      <div class="row"><button type="button" class="btn" @click="close">ยกเลิก</button>
      <button type="submit" class="btn primary" :disabled="!name.trim()">บันทึก</button></div></div>
  </form>
</dialog>`,
  };

  SM.views.cart = {
    components: { JobDialog },
    props: { route: Object },
    data: () => ({
      s: SM.state, T, OUTCOME, STATUS_TAG, touched: {}, dupId: null, lockMsg: '', jobQ: '', jobDlg: false,
      sending: false, submitErr: '', result: null,
    }),
    computed: {
      cart() { return this.s.cart; },
      lines() { return this.cart.lines; },
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      ready() { return S.linesReady(this.s, this.lines); },
      missing() { return this.lines.filter(l => this.qtyErr(l)).map(l => this.$product(l.productId).name); },
      opts() { return this.ready ? S.warehouseOptions(this.s, this.lines) : []; },
      usable() { return this.opts.filter(o => o.status !== 'locked'); },
      nowhere() { return this.usable.length > 0 && this.usable.every(o => o.status === 'none' && !o.withCC); },
      plan() { return this.ready && this.cart.whId ? S.planIssue(this.s, this.lines, this.cart.whId) : null; },
      shorts() { return this.plan ? this.plan.lines.filter(p => !p.error && p.short > 0) : []; },
      rollPlans() { return this.plan ? this.plan.lines.filter(p => p.product.isRoll) : []; },
      switches() { return this.plan ? S.switchSuggestions(this.s, this.lines, this.cart.whId) : []; },
      job() { const j = this.$job(this.cart.jobId); return j && j.open ? j : null; },
      step3() { return this.ready && !!this.cart.whId; },
      foot() { return this.step3 && !!this.job; },
      approval() { return S.needsApproval(this.s, this.user.id); },
      btn() { return this.approval ? 'ส่งเบิก' : 'เบิกเลย'; },
      recentJobs() { return S.recentJobs(this.s, this.user.id); },
      jobs() {
        const q = this.jobQ.trim().toLowerCase();
        const recent = this.recentJobs.map(j => j.id);
        return this.s.jobs.filter(j => j.open && (!q || [j.id, j.name, j.customer].some(v => v.toLowerCase().includes(q))))
          .sort((a, b) => (recent.includes(b.id) ? 1 : 0) - (recent.includes(a.id) ? 1 : 0))
          .slice(0, q ? 20 : 8);
      },
      watchKey() { return JSON.stringify([this.lines, this.cart.whId, this.cart.jobId, this.s.warehouses.map(w => w.locked)]); },
      out() { return this.result ? OUTCOME[this.result.outcome] : null; },
    },
    watch: {
      watchKey() { this.submitErr = ''; this.sync(); },
      'route.query.dup'(id) { this.flagDup(id); },
    },
    mounted() {
      this.sync(); this.flagDup(this.route.query.dup);
      // เพิ่มของแล้วเคอร์เซอร์ไปอยู่ช่องจำนวนที่ยังว่าง (IP-AC8)
      const i = this.lines.findIndex(l => l.qty === null || l.qty === '');
      if (i >= 0 && !this.route.query.dup) this.$nextTick(() => { const el = document.getElementById('qty-' + this.lines[i].productId); if (el) el.focus({ preventScroll: true }); });
    },
    methods: {
      sync() { const msg = S.syncCartWarehouse(this.s); if (msg) this.lockMsg = msg; },
      qtyErr(l) { return S.qtyError(this.$product(l.productId), l.qty); },
      flagDup(id) {
        if (!id) return;
        this.dupId = id;
        this.$nextTick(() => { const el = document.getElementById('line-' + id); if (el) el.scrollIntoView({ block: 'center' }); });
        clearTimeout(this.dupTimer); this.dupTimer = setTimeout(() => { this.dupId = null; }, 6000);
      },
      remove(i) { this.lines.splice(i, 1); },
      pickWh(id) { this.cart.whId = id; this.cart.whAuto = false; this.cart.whCleared = false; this.lockMsg = ''; },
      rollsIn(p) { return this.s.rolls.filter(r => r.productId === p.id && r.whId === this.cart.whId).length; },
      shortText(p) {
        const u = p.product.unit, short = this.$fmt(p.short, u);
        return p.have > 0 ? T.N40(p.product.name, this.$fmt(p.have, u), short)
          : p.everStocked ? T.N42(p.product.name, short) : T.N41(p.product.name, short);
      },
      line(productId) { return this.lines.find(l => l.productId === productId); },
      pickJob(j) { this.cart.jobId = j.id; this.jobQ = ''; },
      toggleJob(j) { this.cart.jobId = this.cart.jobId === j.id ? null : j.id; this.jobQ = ''; },
      submit() {
        if (this.sending || (this.plan && this.plan.blocked)) return;
        this.sending = true;
        setTimeout(() => {
          try { this.result = S.issueNow(this.s, this.user.id); }
          catch (e) { this.submitErr = e.message; }
          this.sending = false;
          this.$nextTick(() => { const el = this.$refs.main; if (!el) return; window.scrollTo(0, 0); (el.querySelector('.res-btns .btn') || el).focus({ preventScroll: true }); });
        }, 400);
      },
      // รายละเอียดต่อรายการในการ์ดผล
      resLine(l) {
        const p = this.$product(l.productId), u = p.unit, notes = [];
        const pr = this.result.prs.find(x => x.productId === l.productId);
        const cc = this.s.ccs.find(c => c.status === 'pending' && c.productId === l.productId && c.whId === this.result.req.whId);
        for (const c of l.cuts) notes.push({ tone: '', text: `${T.N44(c.rollId, c.shelf)} · ตัด ${this.$fmt(c.cut, u)} · เหลือ ${this.$fmt(c.left, u)}${c.left <= 0 ? ' (หมดม้วน)' : ''}` });
        if (l.shelf && l.issued > 0) notes.push({ tone: '', text: `หยิบจากชั้น ${l.shelf}` });
        if (pr) notes.push({ tone: 'warn', text: l.issued > 0 ? T.N58b(this.$fmt(pr.qty, u), pr.id) : T.N59a(pr.id) });
        else if (cc && l.issued < l.qty) notes.push({ tone: 'info', text: T.N60(cc.id) });
        for (const c of l.cuts) if (c.left > 0 && c.left < p.scrapMin) notes.push({ tone: 'warn', text: T.N63(c.rollId, this.$fmt(c.left, u), this.$fmt(p.scrapMin, u)) });
        const qty = l.issued > 0 && l.issued < l.qty ? T.N58a(this.$fmt(l.issued, u), this.$fmt(l.qty, u)) : this.$fmt(l.qty, u);
        return { p, qty, notes };
      },
      again() { this.result = null; SM.go('#/shop'); },
    },
    template: `
<div class="narrow stack lg">
  <!-- ผลลัพธ์แทนที่ฟอร์ม -->
  <section v-if="result" ref="main" tabindex="-1" class="card result stack" :class="out.tone" aria-live="polite">
    <div class="row" style="align-items:flex-start">
      <span class="res-ic" :class="out.tone"><ic :n="out.icon" lg/></span>
      <div class="grow">
        <span class="tag" :class="out.tone">{{ out.tag }}</span>
        <h1 style="margin-top:4px">{{ out.title }}</h1>
        <p>ใบเบิก <span class="mono">{{ result.req.id }}</span></p>
        <p class="muted">งาน <span class="mono">{{ result.req.jobId }}</span> {{ $job(result.req.jobId).name }} · {{ $wh(result.req.whId).name }}</p>
      </div>
    </div>
    <p v-if="result.outcome === 'pending_approval'" class="msg info"><ic n="info"/><span>{{ T.N61a() }}</span></p>
    <p v-if="result.outcome === 'pick_failed'" class="msg warn"><ic n="warn"/><span>{{ T.N62a() }}</span></p>
    <div class="rows">
      <div v-for="l in result.req.lines" :key="l.productId" class="row" style="align-items:flex-start">
        <img class="thumb" :src="resLine(l).p.img" alt="" @error="$noImg">
        <div class="grow">
          <p><b>{{ resLine(l).p.name }}</b></p>
          <p>{{ resLine(l).qty }}</p>
          <p v-for="(n, i) in resLine(l).notes" :key="i" class="small" :class="n.tone ? 't-' + n.tone : 'muted'">{{ n.text }}</p>
        </div>
      </div>
    </div>
    <p v-if="result.outcome === 'partial' && result.prs.length" class="small muted">{{ T.N58c() }}</p>
    <a v-if="result.prs.length" class="link" href="#/restock" style="display:inline-flex;align-items:center">ดูรายการต้องซื้อ</a>
    <div class="row res-btns">
      <a v-if="result.outcome === 'pick_failed'" class="btn primary big" :href="'#/orders/' + result.req.id">ไปหน้าหยิบ</a>
      <button v-else class="btn primary big" @click="again"><ic n="plus"/>เบิกต่อ</button>
      <a class="btn big" :href="'#/orders/' + result.req.id">ดูใบเบิก</a>
    </div>
    <p v-if="result.outcome !== 'pick_failed'" class="help">{{ T.N64() }}</p>
  </section>

  <div v-else-if="!lines.length" class="empty">
    <ic n="cart"/><h1>ตะกร้ายังว่าง</h1><p>เลือกของที่จะเบิกจากหน้าร้านก่อน</p>
    <a class="btn primary" href="#/shop"><ic n="shop"/>ไปเลือกของ</a>
  </div>

  <template v-else>
    <!-- ขั้น 1 -->
    <section class="card stack" aria-labelledby="s1">
      <div class="step-head"><span class="step-no">1</span><h2 id="s1" class="grow req">รายการที่จะเบิก ({{ lines.length }} รายการ)</h2></div>
      <div class="clines">
        <div v-for="(l, i) in lines" :key="l.productId" :id="'line-' + l.productId" class="cline">
          <img class="thumb" :src="$product(l.productId).img" alt="" @error="$noImg">
          <div class="cname"><p><b>{{ $product(l.productId).name }}</b></p>
            <p v-if="$product(l.productId).brand || $product(l.productId).model" class="muted small">{{ [$product(l.productId).brand, $product(l.productId).model].filter(Boolean).join(' · ') }}</p></div>
          <div class="cqty">
            <label :for="'qty-' + l.productId" class="label">ขอเบิก</label>
            <div class="unitbox" :class="{ bad: touched[l.productId] && qtyErr(l) }">
              <input :id="'qty-' + l.productId" type="number" inputmode="decimal" step="any" min="0" v-model.number="l.qty"
                @blur="touched[l.productId] = true" @input="dupId = null" @keydown.enter="$event.target.blur()"
                :aria-describedby="'qe-' + l.productId"><span>{{ $product(l.productId).unit }}</span></div>
          </div>
          <button class="btn ghost icon cdel" @click="remove(i)" :aria-label="'เอา ' + $product(l.productId).name + ' ออก'"><ic n="x"/></button>
          <p :id="'qe-' + l.productId" class="err cmsg" v-if="touched[l.productId] && qtyErr(l)">{{ qtyErr(l) }}</p>
          <p v-if="dupId === l.productId" class="msg warn cmsg" role="status"><ic n="warn"/><span>{{ T.N05() }}</span></p>
        </div>
      </div>
      <a class="btn" href="#/shop"><ic n="plus"/>เลือกของเพิ่ม</a>
    </section>

    <!-- ขั้น 2 -->
    <p v-if="lockMsg" class="msg warn" role="alert"><ic n="warn"/><span>{{ lockMsg }}</span></p>
    <div v-if="!ready" class="lockbar"><ic n="lock"/><span>{{ T.N08(missing) }}</span></div>
    <section v-else class="card stack open-anim" aria-labelledby="s2">
      <div class="step-head"><span class="step-no">2</span><h2 id="s2" class="grow req">เลือกคลังที่จะเบิก</h2></div>
      <p v-if="nowhere" class="muted">{{ T.N25(approval) }}</p>
      <p v-if="usable.length === 1" class="row"><ic n="box" class="t-brand"/><b>{{ T.N31(usable[0].wh.name) }}</b>
        <span class="tag" :class="STATUS_TAG[usable[0].status][0]"><ic :n="STATUS_TAG[usable[0].status][1]"/>{{ usable[0].label.replace(' ✓', '') }}</span></p>
      <div v-else class="whlist" role="radiogroup" aria-labelledby="s2">
        <label v-for="o in opts" :key="o.wh.id" class="whopt" :class="{ sel: cart.whId === o.wh.id, dis: o.status === 'locked' }">
          <input type="radio" name="wh" :value="o.wh.id" :checked="cart.whId === o.wh.id" :disabled="o.status === 'locked'" @change="pickWh(o.wh.id)">
          <span class="grow"><b>{{ o.wh.name }}</b> <span v-if="o.recommended" class="tag brand">แนะนำ</span><br><span class="muted small">{{ o.wh.site }}</span></span>
          <span class="tag" :class="STATUS_TAG[o.status][0]"><ic :n="STATUS_TAG[o.status][1]"/>{{ o.label.replace(' ✓', '') }}</span>
        </label>
      </div>
      <p v-if="!cart.whId" class="help">{{ T.N26() }}</p>

      <template v-if="plan">
        <div class="ptable" role="table" :aria-label="'ของใน' + $wh(cart.whId).name">
          <div class="pt-head" role="row"><span role="columnheader">ของ</span><span role="columnheader">ขอเบิก</span><span role="columnheader">มีในคลังนี้</span><span role="columnheader">ผล</span></div>
          <template v-for="p in plan.lines" :key="p.productId">
            <div class="pt-row" role="row">
              <span role="cell" class="pt-name"><b>{{ p.product.name }}</b></span>
              <span role="cell"><span class="cell-label">ขอเบิก</span> <b>{{ $fmt(p.want, p.product.unit) }}</b></span>
              <span role="cell"><span class="cell-label">มีในคลังนี้</span> <b>{{ $fmt(p.have, p.product.unit) }}</b><span v-if="p.product.isRoll && rollsIn(p.product)"> ({{ rollsIn(p.product) }} ม้วน)</span></span>
              <span role="cell"><span class="cell-label">ผล</span>
                <span v-if="p.result === 'ok'" class="tag ok"><ic n="check"/>{{ T.N32() }}</span>
                <span v-else-if="p.result === 'short'" class="tag warn"><ic n="warn"/>{{ T.N33(p.short, p.product.unit) }}</span>
                <span v-else class="tag bad"><ic n="x"/>{{ T.N34() }}</span></span>
            </div>
            <p v-if="p.pendingCC" class="msg info pt-sub"><ic n="clock"/><span>{{ T.N35(p.product.name, p.pendingCC.text, p.pendingCC.id) }}</span></p>
          </template>
        </div>

        <p v-for="p in plan.lines.filter(x => x.error)" :key="'e' + p.productId" class="msg bad" role="alert"><ic n="x"/><span>{{ p.error }}</span></p>
        <template v-if="!approval">
          <p v-for="p in shorts" :key="'s' + p.productId" class="msg warn"><ic n="warn"/><span>{{ shortText(p) }}</span></p>
        </template>
        <button v-for="w in switches" :key="w.wh.id + w.productId" class="btn block switchbtn" @click="pickWh(w.wh.id)">
          <ic n="truck"/><span>{{ T.N43(w.wh.name, $fmt(w.have, $product(w.productId).unit)) }}</span></button>

        <details v-for="p in rollPlans" :key="'r' + p.productId" class="rollblock" :open="!!p.error">
          <summary>ม้วนที่จะตัด: {{ p.product.name }}<span v-if="p.warnings.length" class="t-warn"> (มีคำเตือน)</span></summary>
          <div class="stack" style="padding-top:8px">
            <p v-if="!rollsIn(p.product)" class="muted">{{ T.N46() }}</p>
            <div v-for="c in p.cuts" :key="c.rollId" class="cutrow">
              <p>ตัดจากม้วน <span class="mono">{{ c.rollId }}</span> (ที่ {{ c.shelf }})</p>
              <dl class="cutnums"><div class="kv"><dt>ม้วนมี</dt><dd>{{ $fmt(c.had, 'm') }}</dd></div><div class="kv"><dt>ตัด</dt><dd>{{ $fmt(c.cut, 'm') }}</dd></div>
                <div class="kv"><dt>เหลือ</dt><dd>{{ $fmt(c.left, 'm') }}<span v-if="c.left <= 0" class="muted"> (หมดม้วน)</span></dd></div></dl>
            </div>
            <p v-for="(w, i) in p.warnings" :key="i" class="msg warn"><ic n="warn"/><span>{{ w }}</span></p>
            <label class="check"><input type="checkbox" v-model="line(p.productId).single">
              <span><b>ต้องเป็นเส้นเดียว</b><br><span class="help">{{ T.N47() }}</span></span></label>
          </div>
        </details>
      </template>
    </section>

    <!-- ขั้น 3 -->
    <div v-if="!step3" class="lockbar"><ic n="lock"/><span>{{ T.N09() }}</span></div>
    <section v-else class="card stack open-anim" aria-labelledby="s3">
      <div class="step-head"><span class="step-no">3</span><h2 id="s3" class="grow req">เลือกงาน</h2></div>
      <div v-if="job" class="jobsel">
        <ic n="check" class="t-brand"/>
        <span class="grow"><b>{{ job.name }}</b><br><span class="muted small"><span class="mono">{{ job.id }}</span> · {{ job.customer || 'ไม่ระบุลูกค้า' }}</span></span>
        <button class="btn ghost icon" @click="cart.jobId = null" aria-label="ล้างงานที่เลือก"><ic n="x"/></button>
      </div>
      <template v-else>
        <div v-if="recentJobs.length" class="stack" style="gap:6px"><span class="label">งานล่าสุด</span>
          <div class="jobchips"><button v-for="j in recentJobs" :key="j.id" class="chip" @click="toggleJob(j)"><span>{{ j.name }} <span class="mono n">{{ j.id }}</span></span></button></div></div>
        <div class="row" style="align-items:flex-end">
          <div class="field grow"><label for="job-q">ค้นหางาน</label>
            <input id="job-q" class="input" v-model="jobQ" placeholder="รหัสงาน ชื่องาน ลูกค้า" autocomplete="off" aria-describedby="job-msg"></div>
          <button class="btn" @click="jobDlg = true"><ic n="plus"/>งานใหม่</button>
        </div>
        <p v-if="jobQ.trim()" id="job-msg" class="small t-warn"><b>{{ T.N48() }}</b></p>
        <div class="joblist">
          <p v-if="jobQ.trim() && !jobs.length" class="muted" style="padding:8px 12px">{{ T.N50(jobQ.trim()) }}</p>
          <button v-if="jobQ.trim()" class="jobrow t-brand" @click="jobDlg = true"><ic n="plus"/><span class="grow"><b>เพิ่มงานใหม่ "{{ jobQ.trim() }}"</b></span></button>
          <button v-for="j in jobs" :key="j.id" class="jobrow" @click="pickJob(j)">
            <span class="grow"><b>{{ j.name }}</b><br><span class="muted small"><span class="mono">{{ j.id }}</span> · {{ j.customer || 'ไม่ระบุลูกค้า' }}</span></span><ic n="chevron" class="muted"/></button>
        </div>
      </template>
    </section>

    <!-- ท้ายสุด -->
    <div v-if="!foot" class="lockbar"><ic n="lock"/><span>{{ T.N10(btn) }}</span></div>
    <template v-else>
      <details class="card open-anim"><summary>หมายเหตุ (ไม่บังคับ)<span v-if="cart.note.trim()"> (ตั้งไว้ 1)</span></summary>
        <label class="sr" for="note">หมายเหตุ</label>
        <textarea id="note" class="input" rows="2" v-model="cart.note" placeholder="เช่น เอาไปไซต์เช้านี้" style="margin-top:8px"></textarea></details>
      <div class="submitbar">
        <p v-if="submitErr" class="msg bad" role="alert"><ic n="x"/><span>{{ submitErr }}</span></p>
        <p v-if="plan && plan.blocked" class="err" role="alert">{{ T.N55(plan.firstErrorShort) }}</p>
        <p v-if="approval" class="small muted row" style="align-items:flex-start"><ic n="info"/><span>{{ T.N54() }}</span></p>
        <button class="btn primary big block" :disabled="sending || (plan && plan.blocked)" @click="submit">
          <span v-if="sending" class="spin" role="status" aria-label="กำลังส่ง"></span><ic v-else :n="approval ? 'send' : 'check'"/>{{ btn }}</button>
      </div>
    </template>
  </template>
  <job-dialog v-if="jobDlg" :initial-name="jobQ.trim()" @close="jobDlg = false" @picked="pickJob"/>
</div>`,
  };
})();

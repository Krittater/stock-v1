var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// นำเข้ายอดยกมาจาก CSV (หัวหน้าเท่านั้น) · สเปก 5B ทาง ข
(function () {
  const S = SM.store, T = SM.T;
  const SAMPLE = 'code,warehouse,location,qty,roll_no,roll_initial,batch\r\n'
    + 'P-0004,wh-main,ทั่วไป,12,,,\r\n'
    + 'P-0011,wh-main,ทั่วไป,85,R-900001,100,B-01\r\n'
    + 'P-9999,wh-main,ทั่วไป,5,,,\r\n';

  SM.views.opening = {
    data: () => ({ s: SM.state, T, rows: null, fileErr: '', done: '', err: '' }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      allowed() { return this.user.role === 'head'; },
      locked() { return !!this.s.settings.openingLocked; },
      bad() { return this.rows ? this.rows.filter(r => r.errors.length).length : 0; },
      canImport() { return !!this.rows && this.rows.length > 0 && !this.bad && !this.locked; },
    },
    methods: {
      name(code) { const p = this.s.products.find(x => x.id === code); return p ? p.name : ''; },
      async pick(e) {
        const f = e.target.files[0]; e.target.value = '';
        this.done = ''; this.err = ''; this.fileErr = ''; this.rows = null;
        if (!f) return;
        const r = S.parseOpeningCsv(this.s, await f.text());
        if (r.error) this.fileErr = r.error; else this.rows = r.rows;
      },
      sample() {
        const url = URL.createObjectURL(new Blob(['\ufeff' + SAMPLE], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = 'ยอดยกมา-ตัวอย่าง.csv'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      trim() { this.rows = S.validOpeningRows(this.rows); this.err = ''; },
      lock(on) { try { S.setOpeningLock(this.s, on, this.user.id); this.err = ''; } catch (e) { this.err = e.message; } },
      run() {
        this.err = '';
        try { S.importOpening(this.s, this.rows, this.user.id); this.done = 'นำเข้ายอดยกมาแล้ว'; SM.toast('ok', this.done); this.rows = null; }
        catch (e) { this.err = e.message; }
      },
    },
    template: `
<div class="narrow stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">ยอดยกมา</h1></div>
  <p v-if="!allowed" class="msg warn"><ic n="lock"/><span>{{ T.FORBIDDEN }}</span></p>
  <template v-else>
    <p class="help">นำเข้ายอดของที่มีอยู่แล้วบนชั้นตอนเริ่มใช้ระบบ ลงยอดทันที ไม่ต้องรอใครยืนยัน</p>
    <label class="switch"><input type="checkbox" :checked="locked" @change="lock($event.target.checked)"><span><b>ล็อกยอดยกมา</b><br><span class="help">ล็อกแล้วตรวจไฟล์ได้ แต่นำเข้าไม่ได้จนกว่าจะปลดล็อก</span></span></label>
    <p v-if="locked" class="msg warn"><ic n="lock"/><span>ยอดยกมาถูกล็อกแล้ว — ตรวจสอบไฟล์ได้ แต่นำเข้าได้หลังปลดล็อก</span></p>
    <div class="card stack">
      <div class="field"><label for="op-file">เลือกไฟล์ CSV</label><input id="op-file" class="input" type="file" accept=".csv" @change="pick"></div>
      <button type="button" class="link" style="align-self:flex-start" @click="sample">ดาวน์โหลดไฟล์ตัวอย่าง</button>
    </div>
    <p v-if="fileErr" class="msg bad" role="alert"><ic n="x"/><span>{{ fileErr }}</span></p>
    <p v-if="done" class="msg ok" role="status"><ic n="check"/><span>{{ done }}</span></p>
    <section v-if="rows" class="stack" aria-label="ผลตรวจไฟล์">
      <p><b>{{ rows.length }} แถว</b> · ผ่าน {{ rows.length - bad }} · ผิด {{ bad }}</p>
      <article v-for="r in rows" :key="r.line" class="card stack" :class="{ 'row-bad': r.errors.length }">
        <div class="row wrap"><b class="grow">แถว {{ r.line }} · <span class="mono">{{ r.code || '(ไม่มีรหัส)' }}</span></b>
          <span v-if="!r.errors.length" class="tag ok"><ic n="check"/>ผ่าน</span><span v-else class="tag bad"><ic n="x"/>ผิด</span></div>
        <p v-if="name(r.code)">{{ name(r.code) }}</p>
        <p class="muted small">{{ r.whId ? $wh(r.whId).name : '-' }} · ชั้น {{ r.shelf || '-' }} · จำนวน {{ r.qty ?? '-' }}<span v-if="r.rollNo"> · ม้วน {{ r.rollNo }}</span></p>
        <ul v-if="r.errors.length" class="err"><li v-for="e in r.errors" :key="e">{{ e }}</li></ul>
      </article>
      <p v-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>
      <div class="stack">
        <button v-if="bad" type="button" class="btn block" @click="trim">ตัดแถวที่ผิด ({{ bad }})</button>
        <button type="button" class="btn primary block" :disabled="!canImport" @click="run">นำเข้ายอดยกมา</button>
      </div>
    </section>
    <p v-else-if="err" class="msg bad" role="alert"><ic n="x"/><span>{{ err }}</span></p>
  </template>
</div>`,
  };
})();

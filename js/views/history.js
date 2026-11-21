var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// ประวัติการทำรายการ (#/history) · หัวหน้าเท่านั้น · ล่าสุดก่อน กรองตามผู้ใช้/การกระทำ
(function () {
  const T = SM.T;
  const ACTIONS = {
    issue: 'เบิกของ', 'req-approve': 'อนุมัติใบเบิก', pick: 'หยิบของ',
    return: 'คืนของ', 'return-reverse': 'ย้อนการคืนของ', receive: 'รับของเข้า',
    'qc-restock': 'ตรวจแล้วเก็บเข้าชั้น', 'qc-scrap': 'ตรวจแล้วตัดทิ้ง',
    'product-create': 'สร้างสินค้า', 'product-edit': 'แก้สินค้า', 'product-active': 'เปิด/เลิกใช้สินค้า',
    'product-approval': 'ตั้งค่าการอนุมัติ', 'product-photo': 'รูปสินค้า',
    'job-create': 'สร้างงาน', 'job-update': 'แก้งาน', 'job-close': 'ปิดงาน', 'job-reopen': 'เปิดงานอีกครั้ง',
    'req-closed': 'ปิดใบเบิก', 'req-cancelled': 'ยกเลิกใบเบิก', 'pr-cancel': 'ยกเลิกรายการต้องซื้อ',
    'opening-in': 'ลงยอดยกมา', 'opening-import': 'นำเข้ายอดยกมา', 'opening-submit': 'ส่งยอดให้ยืนยัน',
    'opening-confirm': 'Store ยืนยันยอด', 'opening-approve': 'หัวหน้าอนุมัติยอด', 'opening-reject': 'ไม่อนุมัติยอด',
    'opening-lock': 'ล็อก/ปลดล็อกยอดยกมา',
  };
  const PAGE = 50;

  SM.views.history = {
    data: () => ({ s: SM.state, T, ACTIONS, who: '', act: '', n: PAGE }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId); },
      allowed() { return this.user.role === 'head'; },
      all() { return this.s.audit.filter(e => (!this.who || e.userId === this.who) && (!this.act || e.action === this.act)).slice().reverse(); },
    },
    watch: { who() { this.n = PAGE; }, act() { this.n = PAGE; } },
    methods: {
      label(a) { return ACTIONS[a] || a; },
      userName(id) { const u = this.s.users.find(x => x.id === id); return u ? u.name : id; },
      when(t) { return new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); },
    },
    template: `
<div class="narrow stack lg">
  <div class="page-head" style="margin:0"><h1 class="grow">ประวัติการทำรายการ</h1></div>
  <p v-if="!allowed" class="msg warn"><ic n="lock"/><span>{{ T.FORBIDDEN }}</span></p>
  <template v-else>
    <div class="row wrap">
      <div class="field grow"><label for="h-who">ผู้ทำรายการ</label>
        <select id="h-who" class="input" v-model="who"><option value="">ทุกคน</option><option v-for="u in s.users" :key="u.id" :value="u.id">{{ u.name }}</option></select></div>
      <div class="field grow"><label for="h-act">การกระทำ</label>
        <select id="h-act" class="input" v-model="act"><option value="">ทุกอย่าง</option><option v-for="(l, a) in ACTIONS" :key="a" :value="a">{{ l }}</option></select></div>
    </div>
    <div v-if="!all.length" class="empty"><ic n="list"/><p>ยังไม่มีประวัติที่ตรงกับตัวกรอง</p></div>
    <div class="rows">
      <article v-for="(e, i) in all.slice(0, n)" :key="i" class="card stack" style="gap:4px">
        <div class="row wrap"><b class="grow">{{ label(e.action) }}</b><span class="muted small">{{ when(e.at) }}</span></div>
        <p>{{ e.text }}</p>
        <p class="muted small">{{ userName(e.userId) }}<span v-if="e.ref"> · <span class="mono">{{ e.ref }}</span></span></p>
      </article>
    </div>
    <button v-if="all.length > n" type="button" class="btn block" @click="n += PAGE">ดูเพิ่ม (อีก {{ all.length - n }} รายการ)</button>
  </template>
</div>`,
  };
})();

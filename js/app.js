var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const { createApp, reactive, watch } = Vue;
  const KEY = 'stock-shop-v2';

  const stored = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };   // storage ถูกบล็อก = เริ่มจาก seed
  SM.state = reactive(SM.loadState(stored()));
  SM.ui = reactive({ route: { name: 'shop', id: null, query: {} }, q: '', toasts: [], pop: null, dark: document.documentElement.classList.contains('app-dark') });
  SM.views = {};

  SM.save = () => { try { localStorage.setItem(KEY, JSON.stringify(SM.state)); } catch (e) { /* โหมดส่วนตัว/เต็ม: ใช้ต่อได้ แค่ไม่จำ */ } };
  watch(SM.state, SM.save, { deep: true });

  SM.go = (hash) => { if (location.hash === hash) parseRoute(); else location.hash = hash; };
  function parseRoute() {
    const [path, qs = ''] = (location.hash || '#/shop').slice(2).split('?');
    const [name = 'shop', id = null] = path.split('/').map(decodeURIComponent);
    SM.ui.route = { name: name || 'shop', id, query: Object.fromEntries(new URLSearchParams(qs)) };
    SM.ui.pop = null;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', parseRoute);

  let toastId = 0;
  // level: ok | warn | bad · action: { label, go }
  SM.toast = (level, text, ms = 3500, action = null) => {
    const t = { id: ++toastId, level, text, action };
    SM.ui.toasts.push(t);
    setTimeout(() => { SM.ui.toasts = SM.ui.toasts.filter(x => x.id !== t.id); }, ms);
  };

  SM.addToCart = (productId) => {
    const lines = SM.state.cart.lines;
    if (lines.some(l => l.productId === productId)) return 'exists';
    lines.push({ productId, qty: null, single: false });
    return 'added';
  };

  const ICONS = {
    cart: 'M6 6h15l-1.5 9h-12z M6 6 5 2H2 M9 20v.01 M18 20v.01',
    bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10 21a2 2 0 0 0 4 0',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3',
    check: 'M5 12l5 5L20 7', x: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', chevron: 'M9 6l6 6-6 6',
    warn: 'M12 3 2 20h20L12 3z M12 10v4 M12 17v.01',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8v.01',
    lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
    shop: 'M4 9l1-5h14l1 5 M5 10v10h14V10 M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9 M10 20v-5h4v5',
    list: 'M8 6h12M8 12h12M8 18h12M4 6v.01M4 12v.01M4 18v.01',
    undo: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
    box: 'M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8',
    shield: 'M9 12l2 2 4-4 M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    moon: 'M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2 M16 4v4M10 10v4M16 16v4',
    send: 'M21 3 10 14 M21 3l-7 18-4-7-7-4z',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
    truck: 'M2 6h11v10H2z M13 9h5l3 3v4h-8z M6 19v.01 M17 19v.01',
    scan: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M4 12h16',
    user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21a8 8 0 0 1 16 0',
  };
  const Ic = {
    props: { n: String, lg: Boolean },
    computed: { d() { return ICONS[this.n] || ''; } },
    template: `<svg class="ic" :class="{ lg }" viewBox="0 0 24 24" aria-hidden="true"><path :d="d"/></svg>`,
  };

  const ROLE = { engineer: 'วิศวกร', store: 'Store', head: 'หัวหน้า' };
  const TITLES = { shop: 'เบิกของ', cart: 'ตะกร้า', orders: 'ใบเบิกที่ผ่านมา', returns: 'คืนของ', restock: 'เติมสต็อก', approvals: 'อนุมัติ' };

  const Shell = {
    data: () => ({ s: SM.state, ui: SM.ui, ROLE }),
    computed: {
      user() { return this.s.users.find(u => u.id === this.s.currentUserId) || this.s.users[0]; },
      view() { const n = this.ui.route.name; return SM.views[n === 'returns' ? 'orders' : n] || null; },
      title() { return TITLES[this.ui.route.name] || 'ไม่พบหน้านี้'; },
      notifs() { return this.s.notifs.filter(n => n.toUserId === this.user.id).slice().reverse(); },
      unread() { return this.notifs.filter(n => !n.read).length; },
      pending() {
        const cc = this.s.ccs.filter(c => c.status === 'pending').length;
        if (this.user.role === 'head') return cc + this.s.reqs.filter(r => r.status === 'pending_approval').length;
        return this.user.role === 'store' ? cc : 0;
      },
      nav() {
        const items = [['shop', 'เบิกของ', 'shop'], ['orders', 'ใบเบิก', 'list'], ['returns', 'คืนของ', 'undo'], ['restock', 'เติมสต็อก', 'box']];
        if (this.user.role !== 'engineer') items.push(['approvals', 'อนุมัติ', 'shield']);
        return items.map(([name, label, icon]) => ({ name, label, icon }));
      },
    },
    methods: {
      go: SM.go,
      onSearch() { if (this.ui.route.name !== 'shop') SM.go('#/shop'); },
      toggle(p) { this.ui.pop = this.ui.pop === p ? null : p; },
      openNotif(n) { n.read = true; this.ui.pop = null; if (n.link) SM.go(n.link); },
      setDark(v) {
        this.ui.dark = v; document.documentElement.classList.toggle('app-dark', v);
        try { localStorage.setItem('stock-mock-dark', v ? '1' : '0'); } catch (e) { /* ไม่จำก็ได้ */ }
      },
      reset() { Object.assign(this.s, SM.seed()); this.ui.pop = null; SM.toast('ok', 'รีเซ็ตข้อมูลตัวอย่างแล้ว'); SM.go('#/shop'); },
      isCurrent(name) { const r = this.ui.route.name; return r === name || (name === 'shop' && r === 'cart'); },
    },
    template: `
<header class="head">
  <div class="head-in">
    <a class="brand" href="#/shop" aria-label="คลังช่าง หน้าแรก"><span class="brand-mark"><ic n="box"/></span><span class="name">คลังช่าง</span></a>
    <div class="search">
      <ic n="search"/>
      <input class="input" type="search" v-model="ui.q" @input="onSearch" placeholder="ค้นหาของ ชื่อ ยี่ห้อ รหัส" aria-label="ค้นหาของ ชื่อ ยี่ห้อ รหัส">
    </div>
    <button class="btn ghost icon hbtn" @click="toggle('bell')" :aria-label="'แจ้งเตือน ยังไม่อ่าน ' + unread + ' รายการ'" :aria-expanded="ui.pop === 'bell'">
      <ic n="bell"/><span v-if="unread" class="badge">{{ unread }}</span>
    </button>
    <a class="btn ghost icon hbtn" href="#/cart" :aria-label="'ตะกร้า ' + s.cart.lines.length + ' รายการ'">
      <ic n="cart"/><span v-if="s.cart.lines.length" class="badge">{{ s.cart.lines.length }}</span>
    </a>
    <div v-if="ui.pop === 'bell'" class="pop" role="dialog" aria-label="แจ้งเตือน">
      <h3>แจ้งเตือน</h3>
      <p v-if="!notifs.length" class="muted" style="padding:8px">ไม่มีการแจ้งเตือน</p>
      <button v-for="n in notifs" :key="n.id" class="pop-item" :class="{ unread: !n.read }" @click="openNotif(n)">
        <ic :n="n.level === 'ok' ? 'check' : n.level === 'bad' ? 'x' : n.level === 'warn' ? 'warn' : 'info'" :class="'t-' + n.level"/>
        <span class="grow">{{ n.text }}<span v-if="!n.read" class="sr"> (ยังไม่อ่าน)</span></span>
        <ic v-if="n.link" n="chevron" class="muted"/>
      </button>
    </div>
  </div>
</header>
<div class="userbar">
  <div class="userbar-in">
    <ic n="user" class="muted"/>
    <label class="sr" for="user-sel">ใช้งานในชื่อ</label>
    <select id="user-sel" v-model="s.currentUserId" class="grow">
      <option v-for="u in s.users" :key="u.id" :value="u.id">{{ u.name }} · {{ ROLE[u.role] }}</option>
    </select>
    <button class="btn ghost icon" @click="setDark(!ui.dark)" :aria-label="ui.dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'"><ic :n="ui.dark ? 'sun' : 'moon'"/></button>
    <div style="position:relative">
      <button class="btn ghost" @click="toggle('demo')" :aria-expanded="ui.pop === 'demo'"><ic n="sliders"/>เดโม</button>
      <div v-if="ui.pop === 'demo'" class="pop" style="right:0" role="dialog" aria-label="ตัวเลือกสำหรับเดโม">
        <div class="stack" style="padding:8px">
          <h3 style="padding:0">ตัวเลือกสำหรับเดโม</h3>
          <label class="switch"><input type="checkbox" v-model="s.settings.reqApproval"><span>ใบเบิกต้องให้หัวหน้าอนุมัติ</span></label>
          <label class="switch"><input type="checkbox" v-model="s.settings.demoPickFail"><span>จำลองจ่ายของไม่สำเร็จ (ครั้งถัดไป)</span></label>
          <p class="label">คลังที่กำลังนับสต็อก (ล็อก)</p>
          <label v-for="w in s.warehouses" :key="w.id" class="switch"><input type="checkbox" v-model="w.locked"><span>{{ w.name }}</span></label>
          <button class="btn danger block" @click="reset"><ic n="undo"/>รีเซ็ตข้อมูลตัวอย่าง</button>
        </div>
      </div>
    </div>
  </div>
</div>
<div v-if="ui.pop" class="backdrop" @click="ui.pop = null"></div>
<div class="layout">
  <nav class="nav" aria-label="เมนูหลัก">
    <a v-for="n in nav" :key="n.name" :href="'#/' + n.name" :aria-current="isCurrent(n.name) ? 'page' : null">
      <ic :n="n.icon"/>{{ n.label }}
      <span v-if="n.name === 'approvals' && pending" class="badge">{{ pending }}</span>
    </a>
  </nav>
  <main class="main">
    <component v-if="view" :is="view" :route="ui.route"/>
    <div v-else class="empty"><ic n="box"/><h1>{{ title }}</h1><p>หน้านี้ยังไม่เปิดใช้</p></div>
  </main>
</div>
<div class="toasts" aria-live="polite">
  <div v-for="t in ui.toasts" :key="t.id" class="msg toast" :class="t.level" :role="t.level === 'bad' ? 'alert' : 'status'">
    <ic :n="t.level === 'ok' ? 'check' : t.level === 'bad' ? 'x' : 'warn'"/>
    <span class="grow">{{ t.text }}</span>
    <button v-if="t.action" class="btn" @click="go(t.action.go)">{{ t.action.label }}</button>
  </div>
</div>`,
  };

  SM.boot = () => {
    const app = createApp(Shell);
    app.component('ic', Ic);
    app.component('scan-button', SM.ScanButton);
    Object.assign(app.config.globalProperties, {
      $fmt: SM.fmtQty, $T: SM.T, $S: SM.store,
      $product: (id) => SM.state.products.find(p => p.id === id),
      $wh: (id) => SM.state.warehouses.find(w => w.id === id),
      $job: (id) => SM.state.jobs.find(j => j.id === id),
      $userOf: (id) => SM.state.users.find(u => u.id === id),
      $noImg: (e) => { e.target.onerror = null; e.target.src = 'img/products/placeholder.svg'; },
    });
    parseRoute();
    app.mount('#app');
  };
})();

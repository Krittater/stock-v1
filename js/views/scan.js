var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

(function () {
  const S = SM.store;
  const KIND = { req: 'ใบเบิก', roll: 'ม้วน', product: 'สินค้า', job: 'งาน' };

  // <scan-button :kinds="['req','roll']" @found="fn({kind,id})"/> · kinds=[] → ส่ง {kind:'raw', id} ทุกรหัส
  SM.ScanButton = {
    props: { kinds: { type: Array, default: () => [] } },
    emits: ['found'],
    data() { return { open: false, code: '', err: '', cam: 'BarcodeDetector' in window, camErr: '' }; },
    computed: {
      miss() { return this.kinds.length ? `ไม่พบ${this.kinds.map(k => KIND[k] || k).join('/')}จากรหัสนี้` : 'กรอกรหัสก่อน'; },
    },
    beforeUnmount() { this.stop(); },
    methods: {
      show() {
        this.open = true; this.code = ''; this.err = ''; this.camErr = '';
        this.$nextTick(() => { this.$refs.dlg.showModal(); this.$refs.inp.focus(); if (this.cam) this.start(); });
      },
      close() { this.stop(); if (this.$refs.dlg && this.$refs.dlg.open) this.$refs.dlg.close(); this.open = false; },
      submit(raw = this.code) {
        const code = String(raw).trim();
        const r = !code ? null : this.kinds.length ? S.parseScan(SM.state, code) : { kind: 'raw', id: code };
        if (!r || (this.kinds.length && !this.kinds.includes(r.kind))) { this.err = this.miss; this.$refs.inp.focus(); return; }
        this.$emit('found', r); this.close();
      },
      async start() {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (!this.open) return this.stop();
          const v = this.$refs.vid; v.srcObject = this.stream; await v.play();
          const det = new BarcodeDetector();
          const tick = async () => {
            if (!this.stream) return;
            try { const [b] = await det.detect(v); if (b && b.rawValue) { this.code = b.rawValue; return this.submit(b.rawValue); } } catch (e) { /* เฟรมนี้อ่านไม่ได้ ลองใหม่ */ }
            this.timer = setTimeout(tick, 300);
          };
          tick();
        } catch (e) { this.camErr = 'เปิดกล้องไม่ได้ พิมพ์รหัสแทนได้'; }
      },
      stop() {
        clearTimeout(this.timer);
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
        if (this.$refs.vid) this.$refs.vid.srcObject = null;
      },
    },
    template: `
<button type="button" class="btn" @click="show"><ic n="scan"/>สแกน</button>
<dialog v-if="open" ref="dlg" class="dlg" aria-labelledby="sc-title" @cancel.prevent="close">
  <form class="dlg-in" @submit.prevent="submit()" novalidate>
    <div class="dlg-head"><h2 id="sc-title" class="grow">สแกนรหัส</h2>
      <button type="button" class="btn ghost icon" @click="close" aria-label="ปิด"><ic n="x"/></button></div>
    <div class="dlg-body">
      <video v-if="cam && !camErr" ref="vid" class="scan-vid" muted playsinline></video>
      <p v-if="camErr" class="msg warn"><ic n="warn"/><span>{{ camErr }}</span></p>
      <div class="field"><label for="sc-code">พิมพ์รหัส</label>
        <input id="sc-code" ref="inp" class="input mono" v-model="code" @input="err = ''" autocomplete="off" autocapitalize="characters" placeholder="เช่น REQ-690006"></div>
      <p v-if="err" class="err" role="alert">{{ err }}</p>
    </div>
    <div class="dlg-foot"><div class="row"><button type="button" class="btn" @click="close">ยกเลิก</button>
      <button type="submit" class="btn primary">ตกลง</button></div></div>
  </form>
</dialog>`,
  };
})();

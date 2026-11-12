# Stock Shop Mockup (เบิก/เติมสต็อก แนวช็อปปิ้งออนไลน์) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mockup HTML ที่กดใช้งานได้จริงครบลูป (เลือกของจากหน้าร้านมีรูป → ตะกร้า → เลือกคลัง → เลือกงาน → เบิก → ผลลัพธ์ → ของขาดเกิดรายการต้องซื้อ → รับของเข้า/เติมสต็อก → ใบเบิกที่รอได้ของ → หยิบ → คืนของ) สำหรับนำเสนอลูกค้า

**Architecture:** static site ไม่มี build ดับเบิลคลิก `index.html` เปิดได้ (ใช้ classic `<script>` ไม่ใช้ ES module เพราะ `file://` โหลด module ไม่ได้) ตรรกะทั้งหมดอยู่ใน `js/store.js` เป็นฟังก์ชันล้วนที่รับ `state` (ไม่แตะ DOM) จึงทดสอบด้วย `node --test` ได้ UI เป็น Vue 3 global build (ไฟล์เดียววางใน `vendor/`) state เก็บใน `localStorage`

**Tech Stack:** HTML + CSS เขียนเอง (token ตามสเปก 0.4) · Vue 3.5 global build (vendored, ไม่มี npm) · Node 25 `node --test` สำหรับทดสอบ store · ฟอนต์ Geist + IBM Plex Sans Thai จาก Google Fonts (มี fallback ฟอนต์ระบบ)

**Spec:** `docs/spec/issue-page-ui-requirements.txt` (ข้อความเต็ม 36 หน้า อ้างด้วยหัวข้อ/รหัส N/IP-AC) · ต้นฉบับ `docs/spec/issue-page-ui-requirements.pdf` · ภาพจอเดิม `docs/spec/screens/p07.png`–`p09.png`

**การตัดสินใจของเจ้าของงาน (12 พ.ย. 2569) ที่ทับสเปก:**
- มีรูปสินค้า (สเปกข้อ 8 บอกไม่ต้องมี) และจัดหน้าแบบร้านค้า + ตะกร้า แต่ **คงกฎเดิม**: ลำดับ ของ → คลัง → งาน → เบิก, กฎตัวเลข IF48, คลังที่ขาดเบิกได้, การ์ดผล 5 แบบ, ข้อความตามหัวข้อ 5
- ขอบเขตเพิ่มจากสเปก: ใบเบิกที่ผ่านมา, หน้าหยิบ, คืนของ, รายการต้องซื้อ, รับของเข้า/เติมสต็อก, อนุมัติ, สลับบทบาท, ระฆังแจ้งเตือน
- ไม่ใช้ PrimeVue (เป็น mockup HTML) แต่หน้าตาอิง token เดียวกัน
- รูปสินค้า: ภาพถ่ายลิขสิทธิ์ฟรีจากเว็บ ดาวน์โหลดเก็บใน `img/products/`

## Global Constraints

- กว้าง 390px ใช้ได้ทุกหน้า ไม่มี scroll แนวนอนของทั้งหน้า · ชื่อยาวตัดบรรทัด ห้ามตัดด้วย "…" (ยกเว้นแถวงานใน dropdown)
- จุดแตะ ≥ 44px · ปุ่มเบิก ≥ 48px · ตัวอักษร ≥ 14px (เนื้อหา 16px หัวขั้น 18px)
- สีหลัก: 50 `#effaf5` 100 `#d8f3e6` 200 `#b4e6d0` 300 `#82d2b3` 400 `#4fb892` 500 `#2c9c77` 600 `#1f7e60` 700 `#1b654f` 800 `#195141` 900 `#164337` 950 `#0b2620` · ปุ่ม/ลิงก์ใช้ 700 hover 800 กด 900
- โหมดสว่าง: พื้นหน้า stone-50 `#fafaf9` การ์ด `#ffffff` เส้น stone-200 `#e7e5e4` · โหมดมืด (class `.app-dark` บน `<html>`): พื้นหน้า `#0c100f` การ์ด `#1b2220` เส้น `#38413d` ตัวอักษร `#f2f4f3`
- มุมโค้ง: ช่องกรอก/ปุ่ม 8px · การ์ด 12px · ตัวเลข `font-variant-numeric: tabular-nums` · รหัสเอกสาร (REQ-, PR-, CC-, R-, P-, J-) ใช้ Geist Mono
- ตัวเลขสต็อกใช้คำกำกับ 4 ชุดเท่านั้น และโผล่ที่เดียว: "มีรวมทุกคลัง" (การ์ดสินค้าหน้าร้าน) · "ขอเบิก" (ตะกร้า + ตารางคลัง) · "มีในคลังนี้" / "ขาด" (ตารางคลังเท่านั้น) · "ม้วนมี · ตัด · เหลือ" (บล็อกม้วน + การ์ดผล) — **หน้าร้านและตะกร้าห้ามมีตัวเลขรายคลัง**
- ทุกตัวเลขมีหน่วย · ทศนิยมไม่เกิน 2 ตำแหน่ง ตัดศูนย์ท้าย · คั่นหลักพัน
- สถานะห้ามพึ่งสีอย่างเดียว ต้องมีไอคอน/คำ (✓ ครบ / ⚠ ขาด / ✕ ไม่มี)
- ภาษาไทยทั้งหมด ยกเว้นหน่วย `m` และคำว่า "Store"
- ข้อความ: ใช้คอลัมน์ "ข้อเสนอ" ในหัวข้อ 5 ถ้ามี ไม่งั้นใช้ "ข้อความปัจจุบัน" · ทุกข้อความอยู่ใน `js/text.js` คีย์ตามรหัส N (ห้ามพิมพ์ข้อความแจ้งเตือนตรง ๆ ใน view)
- อนิเมชันกางขั้น 200ms ปิดเมื่อ `prefers-reduced-motion: reduce`
- ข้อมูลตัวอย่างตามสเปก 0.5 ทุกตัว (สินค้า 12 รายการ คลัง 4 งาน 5 ผู้ใช้ 3)
- ไม่มี dependency อื่นนอกจาก Vue ไฟล์เดียว · ไม่มี build step

## Review Focus

1. **จำนวนทศนิยมกับของนับชิ้น** — พิมพ์ `2.5` ที่หน่วย "ตัว" ต้องเตือน "ตัวต้องเป็นจำนวนเต็ม" และขั้นคลังไม่เปิด (N07 ข้อเสนอ) → test ใน Task 3
2. **กดเบิกซ้ำ/ดับเบิลคลิก** — ต้องไม่เกิดใบเบิก 2 ใบ (IP-AC42) → test ใน Task 4 + ปุ่ม disabled ใน Task 7
3. **state ใน localStorage เสียหรือเป็นเวอร์ชันเก่า** — เปิดหน้าแล้วต้องไม่จอขาว ให้กลับไปใช้ seed → test ใน Task 1
4. **รับของเข้ามากกว่าที่รายการต้องซื้อขอ / คืนของมากกว่าที่จ่ายไป** — รับเกินได้ (ส่วนเกินเข้าสต็อก) คืนเกินต้องถูกปฏิเสธ → test ใน Task 5
5. **คลังที่อยู่ในตะกร้าถูกล็อกนับสต็อกระหว่างกรอก** — คลังถูกล้าง ผู้ใช้เห็นข้อความ N36 งานที่เลือกไว้ไม่หาย (IP-AC29) → test ใน Task 3 + UI ใน Task 7

---

## File Structure

```
index.html              shell: <head>, โหลด script ตามลำดับ, <div id="app">
css/app.css             token สี/ฟอนต์/มืด-สว่าง + component (ปุ่ม ชิป การ์ด กล่องข้อความ ตาราง แถบล็อก toast dialog)
vendor/vue.global.prod.js
js/seed.js              SM.seed() -> state ตั้งต้น
js/text.js              SM.T (ข้อความรหัส N เป็นฟังก์ชัน) + SM.fmtQty
js/store.js             SM.store: ตรรกะทั้งหมด ไม่แตะ DOM
js/app.js               โหลด/บันทึก state, router (hash), shell component (หัว ตะกร้า ระฆัง บทบาท เมนูเดโม toast)
js/views/shop.js        หน้าร้าน + กล่องสร้างสินค้าใหม่
js/views/cart.js        ตะกร้า + ขั้นคลัง/งาน/ปุ่มเบิก + การ์ดผล + กล่องเพิ่มงาน
js/views/orders.js      ใบเบิกที่ผ่านมา + รายละเอียด/หยิบ + คืนของ
js/views/restock.js     เติมสต็อก: รายการต้องซื้อ, รับของเข้า, ยอดคงเหลือ
js/views/approvals.js   อนุมัติใบเบิก + ยืนยันยอดตั้งต้น
img/products/*.jpg      รูปสินค้า (Task 10) + img/products/placeholder.svg
tests/*.test.js         node --test
README.md               วิธีเปิด + สคริปต์เดโม
```

ทุกไฟล์ใน `js/` ขึ้นต้น `var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};` และลงท้าย `if (typeof module !== 'undefined') module.exports = SM;` เพื่อให้ทั้ง browser (classic script) และ `require()` ใน test ใช้ไฟล์เดียวกัน

### State shape (ทุก task ใช้ชื่อฟิลด์ชุดนี้)

```js
{
  v: 1,                                   // เวอร์ชัน schema
  currentUserId: 'u-eng',
  settings: { reqApproval: false, demoPickFail: false },
  users:      [{ id, name, role }],       // role: 'engineer' | 'store' | 'head'
  products:   [{ id, name, brand, model, unit, isRoll, category, img, reorderPoint, scrapMin }],
  warehouses: [{ id, name, site, locked }],
  stock:      [{ productId, whId, qty, shelf }],               // ของไม่ใช่ม้วน
  rolls:      [{ id, productId, whId, shelf, length, opened }],// 1 แถว = 1 ม้วนจริง
  jobs:       [{ id, name, customer, open }],
  cart:       { lines: [{ productId, qty, single }], whId, whAuto, jobId, note },
  reqs:       [{ id, userId, whId, jobId, note, status, at,
                 lines: [{ productId, qty, issued, reserved, returned, single,
                           cuts: [{ rollId, shelf, had, cut, left }] }] }],
  prs:        [{ id, reqId, productId, whId, qty, received, status, at }], // status: 'open' | 'done'
  ccs:        [{ id, productId, whId, qty, rollLengths, byUserId, status, reason }], // 'pending'|'ok'|'rejected'
  notifs:     [{ id, toUserId, level, text, link, read, at }],
  seq:        { req: 690007, pr: 690002, cc: 7, roll: 161, product: 20, job: 11 }
}
```

`req.status`: `'issued' | 'partial' | 'waiting' | 'ready' | 'pending_approval' | 'rejected' | 'pick_failed'`
(`ready` = ของที่รอเข้าแล้วและถูกกันให้ รอกด "จ่ายของ" ที่หน้าหยิบ)

---

### Task 1: โครงโปรเจกต์ + seed + shell

**Files:**
- Create: `index.html`, `css/app.css`, `js/seed.js`, `js/text.js`, `js/app.js`, `vendor/vue.global.prod.js`, `img/products/placeholder.svg`, `.gitignore`
- Test: `tests/seed.test.js`

**Interfaces:**
- Produces: `SM.seed(): State` · `SM.fmtQty(n: number, unit: string): string` · `SM.loadState(raw: string|null): State` (คืน seed ถ้า `raw` เป็น null, parse ไม่ได้, หรือ `v !== 1`) · ใน browser: `SM.state` (Vue `reactive`), `SM.save()`, `SM.toast(level, text, ms)`, `SM.go(hash)`, `SM.views = {}` (view อื่นลงทะเบียน component ที่นี่: `shop`, `cart`, `orders`, `restock`, `approvals`)
- Routes: `#/shop` (ค่าเริ่ม) · `#/cart` · `#/orders` · `#/orders/:id` · `#/returns` · `#/restock` · `#/approvals`

- [ ] **Step 1: `git init` และขออนุญาตดาวน์โหลด Vue**

ถามเจ้าของงานก่อนดาวน์โหลด: ไฟล์ `vue.global.prod.js` จาก `https://unpkg.com/vue@3.5.13/dist/vue.global.prod.js` (~160 KB) → เก็บที่ `vendor/vue.global.prod.js`

- [ ] **Step 2: เขียน test ที่ fail**

```js
// tests/seed.test.js
const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); const SM = require('../js/text.js');

test('seed ตรงกับสเปก 0.5', () => {
  const s = SM.seed();
  assert.equal(s.products.length, 12);
  assert.deepEqual(s.warehouses.map(w => w.name),
    ['คลังหลัก', 'คลังไซต์งาน A', 'คลังไซต์งาน B', 'คลังไซต์งาน C']);
  assert.equal(s.warehouses[3].locked, true);
  assert.equal(s.jobs.length, 5);
  assert.deepEqual(s.users.map(u => u.role), ['engineer', 'store', 'head']);
  const sum = (pid) => s.rolls.filter(r => r.productId === pid).reduce((a, r) => a + r.length, 0);
  assert.equal(sum('P-0011'), 160);                       // 2 ม้วน
  assert.equal(s.rolls.filter(r => r.productId === 'P-0011').length, 2);
  assert.equal(sum('P-0017'), 0);                         // ไม่มีของ
  const qty = (pid, wh) => s.stock.find(x => x.productId === pid && x.whId === wh)?.qty ?? 0;
  assert.equal(qty('P-0007', 'wh-main'), 54);             // ฉากหลัก M7: ขอ 85 ขาด 31
  assert.equal(s.stock.filter(x => x.productId === 'P-0007').reduce((a, x) => a + x.qty, 0), 74);
  const r160 = s.rolls.find(r => r.id === 'R-000160');
  assert.deepEqual([r160.productId, r160.whId, r160.shelf, r160.length], ['P-0011', 'wh-main', 'A-01', 100]);
});

test('fmtQty', () => {
  assert.equal(SM.fmtQty(1250, 'm'), '1,250 m');
  assert.equal(SM.fmtQty(12.5, 'm'), '12.5 m');
  assert.equal(SM.fmtQty(80.00, 'm'), '80 m');
  assert.equal(SM.fmtQty(1.256, 'm'), '1.26 m');
});

test('loadState กลับไป seed เมื่อข้อมูลเสีย', () => {
  for (const raw of [null, '{bad json', '{"v":0}', '[]'])
    assert.equal(SM.loadState(raw).products.length, 12);
  const s = SM.seed(); s.settings.reqApproval = true;
  assert.equal(SM.loadState(JSON.stringify(s)).settings.reqApproval, true);
});
```

- [ ] **Step 3: รัน `node --test tests/` — ต้อง FAIL (`SM.seed is not a function`)**

- [ ] **Step 4: เขียน `js/seed.js`**

ค่าที่ต้องตรง (นอกเหนือจากสเปก 0.5 ซึ่งให้ยอดรวมทุกคลัง):
- id: ผู้ใช้ `u-eng` สมชาย ใจดี (engineer) · `u-store` ก้องภพ แสงทอง (store) · `u-head` อรุณ รัตนชัย (head) · คลัง `wh-main` `wh-a` `wh-b` `wh-c` (locked)
- หมวด: P-0011–P-0018 "สายไฟ" · P-0008 "สายสื่อสาร" · P-0005 "ท่อและราง" · P-0004, P-0007 "อุปกรณ์ไฟฟ้า" · P-0009, P-0006 "วัสดุสิ้นเปลือง"
- การกระจายคลัง: P-0011 = R-000160 100 m ที่ wh-main ชั้น A-01 + 1 ม้วน 60 m ที่ wh-a · P-0007 = wh-main 54 (ชั้น B-01) + wh-a 20 · P-0004 = wh-main 30 · ที่เหลือแบ่งเองให้ยอดรวมตรงสเปกและให้ wh-a มีของบางอย่างที่ wh-main ไม่มี (เพื่อโชว์ "ขาด k/n" และปุ่มสลับคลัง)
- `scrapMin` ของสายม้วน = 3 · `reorderPoint`: P-0004 = 40 (ต่ำกว่าเกณฑ์ตั้งแต่แรก เพื่อโชว์ "ใกล้หมด" ที่หน้าเติมสต็อก) ที่เหลือ 0
- ประวัติตั้งต้น: 1 ใบเบิก `REQ-690006` ของ `u-eng` สถานะ `issued` (P-0004 5 ตัว, P-0009 2 ถุง, งาน J-25-010, wh-main) เพื่อให้ "ใช้บ่อย" และ "งานล่าสุด" มีข้อมูล
- `img`: `img/products/<ชื่อไฟล์ตาม Task 10>.jpg`

- [ ] **Step 5: เขียน `js/text.js`** — `SM.fmtQty`, `SM.loadState`, และ `SM.T = {}` (ว่างไว้ task ถัดไปเติม)

- [ ] **Step 6: รัน `node --test tests/` — ต้อง PASS**

- [ ] **Step 7: เขียน `css/app.css`, `index.html`, `js/app.js`**

Shell มี: โลโก้/ชื่อระบบ · ช่องค้นหา (ผูกกับ `#/shop?q=`) · ไอคอนตะกร้า + ป้ายจำนวนรายการ · ระฆัง + จำนวนยังไม่อ่าน (แผงรายการ แตะแล้ว `SM.go(link)`) · ตัวสลับผู้ใช้ (ชื่อ + บทบาท) · ปุ่มสลับมืด/สว่าง · เมนู "เดโม": รีเซ็ตข้อมูล, สวิตช์ "ใบเบิกต้องให้หัวหน้าอนุมัติ" (`settings.reqApproval`), ล็อก/ปลดล็อกคลังนับสต็อกรายคลัง, สวิตช์ "จำลองจ่ายของไม่สำเร็จ" (`settings.demoPickFail`)
เมนูหลัก (แถบล่างบนมือถือ, แถบซ้ายที่ ≥1024px): ร้าน (เบิกของ) · ใบเบิก · คืนของ · เติมสต็อก · อนุมัติ (เห็นเฉพาะ store/head พร้อมป้ายจำนวนค้าง)
`SM.save()` เรียกผ่าน `Vue.watch(SM.state, …, { deep: true })` เขียน `localStorage['stock-mock-v1']`
view ที่ยังไม่มี component ให้ shell แสดงชื่อหน้าเปล่า ๆ

- [ ] **Step 8: ตรวจใน browser** — เปิด `index.html` ด้วย `file://` ที่ 390px และ 1280px: เห็น shell, สลับผู้ใช้/โหมดมืดได้, refresh แล้วค่ายังอยู่, "รีเซ็ตข้อมูล" คืน seed, console ไม่มี error

- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat: scaffold, seed data, app shell"`

---

### Task 2: store — ค้นหาสินค้า ชิปสเปก ยอดรวม

**Files:**
- Create: `js/store.js`
- Test: `tests/catalog.test.js`

**Interfaces:**
- Consumes: `SM.seed()`
- Produces (ทั้งหมดอยู่ใต้ `SM.store`):
  - `cableFacets(product): { type?, size?, cores?, color? }` — อ่านจาก `name + ' ' + model`
  - `isCableLike(product): boolean` — `isRoll && unit === 'm'`
  - `totalStock(state, productId): { qty: number, rolls: number }` — รวมทุกคลัง (รวมคลังที่ล็อก)
  - `searchProducts(state, { q, category, facets }): Product[]`
  - `facetRows(state, { q, category, facets }): [{ key: 'type'|'size'|'cores'|'color', label, options: [{ value, count, selected }] }]`
  - `categories(state): string[]`
  - `recentProducts(state, userId): Product[]` (สูงสุด 4) · `recentJobs(state, userId): Job[]` (สูงสุด 3)

- [ ] **Step 1: เขียน test ที่ fail**

```js
// tests/catalog.test.js
const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
const S = SM.store; const ids = (a) => a.map(p => p.id);

test('cableFacets อ่านจากชื่อ/รุ่น', () => {
  const s = SM.seed(); const p = (id) => s.products.find(x => x.id === id);
  assert.deepEqual(S.cableFacets(p('P-0011')), { type: 'THW', size: '1.5', cores: '1', color: 'ดำ' });
  assert.deepEqual(S.cableFacets(p('P-0015')), { type: 'THW', size: '2.5', cores: '1', color: 'เขียว-เหลือง' });
  assert.deepEqual(S.cableFacets(p('P-0018')), { type: 'VCT', size: '2.5', cores: '4' });
  assert.equal(S.cableFacets(p('P-0008')).type, 'CAT6');
  assert.deepEqual(S.cableFacets(p('P-0004')), {});
  assert.deepEqual(S.cableFacets({ name: 'สายไฟ THW 1x4 sq.mm สีแดง', model: '' }),
    { type: 'THW', size: '4', cores: '1', color: 'แดง' });
});

test('ค้นหา: ชื่อ ยี่ห้อ รุ่น รหัส และลำดับผล', () => {
  const s = SM.seed();
  assert.deepEqual(ids(S.searchProducts(s, { q: 'schneider' })), ['P-0004']);
  assert.deepEqual(ids(S.searchProducts(s, { q: 'p-0009' })), ['P-0009']);
  const wires = ids(S.searchProducts(s, { category: 'สายไฟ' }));
  assert.equal(wires.length, 6);
  assert.equal(wires.at(-1), 'P-0017');                    // ไม่มีของ อยู่ท้าย
  // ขึ้นต้นตรงคำค้นก่อน "มีคำค้น"
  assert.equal(ids(S.searchProducts(s, { q: 'เทป' }))[0], 'P-0006');
});

test('ชิปสเปก: กรองหลายแถว + ตัวเลขจำนวนสินค้า + ซ่อนแถวค่าเดียว', () => {
  const s = SM.seed();
  const thw = { category: 'สายไฟ', facets: { type: 'THW' } };
  assert.deepEqual(ids(S.searchProducts(s, thw)).sort(), ['P-0011', 'P-0012', 'P-0015', 'P-0016']);
  const rows = S.facetRows(s, thw);
  const row = (k) => rows.find(r => r.key === k);
  assert.deepEqual(row('size').options.map(o => [o.value, o.count]), [['1.5', 2], ['2.5', 1], ['4', 1]]);
  assert.equal(row('type').options.find(o => o.value === 'THW').selected, true); // แถวที่เลือกยังอยู่
  assert.equal(row('cores'), undefined);                   // THW มีแกนเดียว → ซ่อน
  assert.deepEqual(ids(S.searchProducts(s, { category: 'สายไฟ', facets: { type: 'THW', size: '1.5', color: 'ดำ' } })), ['P-0011']);
  assert.deepEqual(S.facetRows(s, {}), []);                // IP-AC7: ยังไม่กรองอะไร ไม่มีชิป
});

test('ยอดรวมทุกคลัง / ใช้บ่อย', () => {
  const s = SM.seed();
  assert.deepEqual(S.totalStock(s, 'P-0011'), { qty: 160, rolls: 2 });
  assert.deepEqual(S.totalStock(s, 'P-0017'), { qty: 0, rolls: 0 });
  assert.deepEqual(ids(S.recentProducts(s, 'u-eng')).sort(), ['P-0004', 'P-0009']);
  assert.deepEqual(S.recentProducts(s, 'u-store'), []);
});
```

- [ ] **Step 2: รัน `node --test tests/catalog.test.js` — FAIL**

- [ ] **Step 3: เขียนฟังก์ชันใน `js/store.js`**

กติกาที่ signature/test ไม่ได้บอก:
- ชนิดที่รู้จัก: `THW VAF VCT NYY IEC01 IEC53 CAT5E CAT6 CV` · สี: `ดำ แดง น้ำเงิน ฟ้า เหลือง เขียว เขียว-เหลือง ขาว เทา น้ำตาล` (จับ "เขียว-เหลือง" ก่อน "เขียว"/"เหลือง") · `NxS sq.mm` → cores=N size=S · `S sq.mm` ไม่มี x → ไม่มี cores จากชื่อ ให้ดูที่ model
- ค้นจาก name, brand, model, id (ไม่สนตัวพิมพ์) · เรียง: ชื่อขึ้นต้นด้วยคำค้น → ชื่อมีคำค้น → อื่น ๆ; ในกลุ่ม "มีของ" ก่อน "ไม่มีของ" แล้วตามชื่อ (`localeCompare('th')`)
- `facetRows` คืน `[]` ถ้าไม่มี q, category, facets เลย หรือผลลัพธ์ไม่มี `isCableLike` · option ของแต่ละแถวคิดจากผลที่กรองด้วยแถว*อื่น* · ซ่อนแถวที่มี option ≤ 1 เว้นแต่แถวนั้นถูกเลือกอยู่ · ป้ายแถว: "ชนิด" "ขนาด (sq.mm)" "แกน" "สี"

- [ ] **Step 4: รัน test — PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(store): product search, cable facets, totals"`

---

### Task 3: store — วางแผนเบิก ตัวเลือกคลัง แผนตัดม้วน

**Files:**
- Modify: `js/store.js`, `js/text.js` (เติม `SM.T` N06–N10, N25–N47, N55)
- Test: `tests/plan.test.js`

**Interfaces:**
- Produces:
  - `available(state, productId, whId): number` — ยอดในคลัง ลบผลรวม `reserved` ของทุกใบเบิกที่คลังนั้น (ไม่ว่าสถานะใด)
  - `qtyError(product, qty): string|null` — `null` = ใช้ได้ · ว่าง/≤0 → `T.N06()` · หน่วยไม่ใช่ `m` และไม่ใช่จำนวนเต็ม → `T.N07(unit)`
  - `linesReady(state, lines): boolean` — มี ≥1 รายการ และทุกรายการ `qtyError === null`
  - `planLine(state, line, whId): { want, have, short, result: 'ok'|'short'|'none', cuts: Cut[], warnings: string[], error: string|null, pendingCC: CC|null, everStocked: boolean }`
  - `planIssue(state, lines, whId): { lines: PlanLine[], blocked: boolean, firstError: string|null }`
  - `warehouseOptions(state, lines): [{ wh, status: 'full'|'short'|'none'|'locked', shortCount, total, recommended, label }]` — เรียงตามสเปกขั้นที่ 2 ข้อ 2
  - `autoWarehouse(state, lines): string|null`
  - `switchSuggestions(state, lines, whId): [{ wh, productId, have }]` — คลังอื่นที่มีของพอสำหรับรายการที่ขาด (N43)
  - `syncCartWarehouse(state): string|null` — ถ้า `cart.whId` ถูกล็อก: ล้าง `whId` แล้วคืนข้อความ N36; ถ้า `whId` ว่างและ `linesReady`: ตั้งจาก `autoWarehouse` พร้อม `whAuto = true`

- [ ] **Step 1: เขียน test ที่ fail**

```js
// tests/plan.test.js
const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
const S = SM.store;
const SCENE = [{ productId: 'P-0011', qty: 80 }, { productId: 'P-0007', qty: 85 }]; // ฉากหลัก M7

test('ฉากหลัก: สายพอ กล่องขาด 31 และยังเบิกได้', () => {
  const s = SM.seed(); const plan = S.planIssue(s, SCENE, 'wh-main');
  const [wire, box] = plan.lines;
  assert.deepEqual([wire.result, wire.have, wire.short], ['ok', 100, 0]);
  assert.deepEqual(wire.cuts, [{ rollId: 'R-000160', shelf: 'A-01', had: 100, cut: 80, left: 20 }]);
  assert.deepEqual([box.result, box.want, box.have, box.short], ['short', 85, 54, 31]);
  assert.equal(plan.blocked, false);                       // คลังที่ขาดไม่ใช่ error
});

test('ไม่มีของในคลัง = none, ไม่บล็อก', () => {
  const s = SM.seed();
  const p = S.planLine(s, { productId: 'P-0017', qty: 10 }, 'wh-main');
  assert.deepEqual([p.result, p.have, p.short, p.error, p.everStocked], ['none', 0, 10, null, false]);
});

test('เส้นเดียว: ไม่มีม้วนยาวพอ → error บล็อก (N38)', () => {
  const s = SM.seed();
  s.rolls = s.rolls.filter(r => r.productId !== 'P-0011');
  s.rolls.push({ id: 'R-1', productId: 'P-0011', whId: 'wh-main', shelf: 'A-01', length: 50, opened: false },
               { id: 'R-2', productId: 'P-0011', whId: 'wh-main', shelf: 'A-01', length: 40, opened: true });
  const multi = S.planLine(s, { productId: 'P-0011', qty: 80 }, 'wh-main');
  assert.deepEqual(multi.cuts.map(c => [c.rollId, c.cut, c.left]), [['R-2', 40, 0], ['R-1', 40, 10]]); // ม้วนเปิดแล้วก่อน
  const single = S.planIssue(s, [{ productId: 'P-0011', qty: 80, single: true }], 'wh-main');
  assert.equal(single.blocked, true);
  assert.match(single.firstError, /ไม่มีม้วนไหนยาว 80 m ในคลังนี้ \(ยาวสุด 50 m\)/);
  const ok = S.planLine(s, { productId: 'P-0011', qty: 45, single: true }, 'wh-main');
  assert.deepEqual(ok.cuts.map(c => c.rollId), ['R-1']);    // ม้วนที่ยาวพอและเหลือน้อยสุด
});

test('เตือนเศษม้วน (N45) ไม่บล็อก', () => {
  const s = SM.seed();
  const p = S.planLine(s, { productId: 'P-0011', qty: 98.5 }, 'wh-main');
  assert.equal(p.error, null);
  assert.match(p.warnings[0], /R-000160 จะเหลือ 1\.5 m \(สั้นกว่าเกณฑ์เศษ 3 m\)/);
});

test('ตัวเลือกคลัง: ลำดับ ป้าย แนะนำ ล็อก', () => {
  const s = SM.seed();
  const opts = S.warehouseOptions(s, [{ productId: 'P-0004', qty: 5 }]);
  assert.equal(opts[0].wh.id, 'wh-main');
  assert.deepEqual([opts[0].status, opts[0].recommended, opts[0].label], ['full', true, 'ครบ ✓']);
  assert.equal(opts.filter(o => o.recommended).length, 1);
  const c = opts.at(-1);
  assert.deepEqual([c.wh.id, c.status, c.label], ['wh-c', 'locked', 'กำลังนับสต็อก ใช้ไม่ได้ชั่วคราว']);
  const scene = S.warehouseOptions(s, SCENE).find(o => o.wh.id === 'wh-main');
  assert.deepEqual([scene.status, scene.label], ['short', 'ขาด 1/2 รายการ']);
  assert.equal(S.autoWarehouse(s, [{ productId: 'P-0004', qty: 5 }]), 'wh-main'); // คลังเดียวที่ครบ
});

test('จำนวน: ว่าง/0/ทศนิยมกับของนับชิ้น', () => {
  const s = SM.seed(); const p = (id) => s.products.find(x => x.id === id);
  assert.equal(S.qtyError(p('P-0004'), null), 'ใส่จำนวนที่มากกว่า 0');
  assert.equal(S.qtyError(p('P-0004'), 0), 'ใส่จำนวนที่มากกว่า 0');
  assert.equal(S.qtyError(p('P-0004'), 2.5), 'ตัวต้องเป็นจำนวนเต็ม');
  assert.equal(S.qtyError(p('P-0011'), 12.5), null);
  assert.equal(S.linesReady(s, [{ productId: 'P-0004', qty: 2.5 }]), false);
  assert.equal(S.linesReady(s, []), false);
});

test('คลังที่เลือกถูกล็อกระหว่างกรอก → ล้างคลัง แจ้ง N36 งานไม่หาย', () => {
  const s = SM.seed();
  Object.assign(s.cart, { lines: [{ productId: 'P-0004', qty: 5 }], whId: 'wh-main', jobId: 'J-25-010' });
  s.warehouses[0].locked = true;
  assert.equal(S.syncCartWarehouse(s), 'คลังหลัก เริ่มนับสต็อก ใช้ไม่ได้ชั่วคราว กรุณาเลือกคลังอื่น');
  assert.equal(s.cart.whId, null);
  assert.equal(s.cart.jobId, 'J-25-010');
});

test('ปุ่มสลับคลัง (N43)', () => {
  const s = SM.seed();
  s.stock.push({ productId: 'P-0007', whId: 'wh-b', qty: 300, shelf: 'ทั่วไป' });
  const sug = S.switchSuggestions(s, SCENE, 'wh-main');
  assert.deepEqual(sug.map(x => [x.wh.id, x.productId, x.have]), [['wh-b', 'P-0007', 300]]);
});
```

- [ ] **Step 2: รัน `node --test tests/plan.test.js` — FAIL**

- [ ] **Step 3: เขียนฟังก์ชัน + ข้อความ**

กติกาที่ test ไม่ได้บอก:
- เลือกม้วน (ไม่ใช่เส้นเดียว): ม้วน `opened` ก่อน แล้วเรียง `id` น้อยไปมาก ตัดจนครบ · เส้นเดียว: ม้วนที่ `length >= qty` และ `length` น้อยสุด
- สายม้วนที่ยอดรวมในคลังไม่พอ = `short` (ตัดเท่าที่มี ไม่ใช่ error) · `error` เกิดเฉพาะ: คลังล็อก (N37), เส้นเดียวไม่มีม้วนยาวพอ (N38)
- `everStocked` = มีแถว stock/rolls ของสินค้านั้นในคลังใดก็ได้ หรือเคยอยู่ในใบเบิกที่ `issued > 0` (ใช้เลือกข้อความ N41 กับ N42)
- `pendingCC` = `ccs` สถานะ `pending` ของสินค้า+คลังนั้น (แถวสีฟ้า N35)
- ลำดับคลัง: ไม่ล็อกก่อน → `full` → ครบเมื่อรวม `pendingCC` → สัดส่วนรายการที่พอมากกว่า → ชื่อ · `recommended` = ตัวแรกที่ `full` ถ้าไม่มีใช้ตัวแรกที่ครบเมื่อรวม `pendingCC`
- `autoWarehouse`: คืนค่าเมื่อ (ก) มีคลังไม่ล็อกคลังเดียว หรือ (ข) มีคลัง `full` คลังเดียว หรือ (ค) ไม่มี `full` แต่มีคลังเดียวที่ครบเมื่อรวม `pendingCC`; ไม่งั้น `null`
- `SM.T` รหัสที่เติมใน task นี้ คัดจากสเปกหัวข้อ 5 (ข้อเสนอก่อน): N06, N07, N08 (รับชื่อของที่ยังขาด), N09, N10 (รับชื่อปุ่ม), N25 (รับ `needsApproval`), N26–N35, N36, N37, N38, N39, N40–N43, N44–N47, N55

- [ ] **Step 4: รัน `node --test tests/` — PASS ทั้งหมด**
- [ ] **Step 5: Commit** — `git commit -am "feat(store): issue planning, warehouse options, roll cutting"`

---

### Task 4: store — กดเบิก อนุมัติ รายการต้องซื้อ แจ้งเตือน

**Files:**
- Modify: `js/store.js`, `js/text.js` (เติม N54, N56–N70)
- Test: `tests/issue.test.js`

**Interfaces:**
- Consumes: `planIssue`, `linesReady` (Task 3)
- Produces:
  - `needsApproval(state, userId): boolean` — `settings.reqApproval && role !== 'head'`
  - `issueNow(state, userId): { outcome: 'issued'|'partial'|'waiting'|'pending_approval'|'pick_failed', req, prs: PR[] }` — อ่านจาก `state.cart`; throw `Error(ข้อความ N56)` เมื่อปฏิเสธ (state ไม่เปลี่ยน); สำเร็จแล้วล้าง `cart.lines` และ `cart.note` แต่ **เก็บ `whId`, `jobId`**
  - `approveReq(state, reqId, approverId, ok: boolean, reason?: string): Req`
  - `notify(state, toUserIds: string[], level, text, link)` (ใช้ภายใน + task 5)
  - `unread(state, userId): Notif[]`

- [ ] **Step 1: เขียน test ที่ fail**

```js
// tests/issue.test.js
const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
const S = SM.store;
const fill = (s, lines, whId = 'wh-main', jobId = 'J-25-010') => Object.assign(s.cart, { lines, whId, jobId, note: 'เอาไปไซต์เช้านี้' });
const texts = (s, uid) => s.notifs.filter(n => n.toUserId === uid).map(n => n.text);

test('ฉากหลัก: จ่ายบางส่วน + รายการต้องซื้อ + ตัดม้วน', () => {
  const s = SM.seed();
  fill(s, [{ productId: 'P-0011', qty: 80 }, { productId: 'P-0007', qty: 85 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.equal(r.outcome, 'partial');
  assert.equal(r.req.id, 'REQ-690007');
  assert.deepEqual(r.req.lines.map(l => l.issued), [80, 54]);
  assert.equal(s.rolls.find(x => x.id === 'R-000160').length, 20);
  assert.equal(s.rolls.find(x => x.id === 'R-000160').opened, true);
  assert.equal(S.available(s, 'P-0007', 'wh-main'), 0);
  assert.deepEqual(r.prs.map(p => [p.id, p.productId, p.qty, p.status]), [['PR-690002', 'P-0007', 31, 'open']]);
  assert.ok(texts(s, 'u-store').some(t => /PR-690002/.test(t)));        // N68 ถึง Store/หัวหน้า
  assert.ok(!texts(s, 'u-eng').some(t => /PR-690002/.test(t)));         // ไม่ส่งให้วิศวกร (ข้อเสนอ N68)
  assert.deepEqual([s.cart.lines.length, s.cart.note, s.cart.whId, s.cart.jobId], [0, '', 'wh-main', 'J-25-010']);
});

test('ของพอ = issued ไม่มี PR', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0004', qty: 5 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.deepEqual([r.outcome, r.prs.length, r.req.status], ['issued', 0, 'issued']);
});

test('ไม่มีของเลย = waiting + PR เต็มจำนวน', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0017', qty: 50 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.deepEqual([r.outcome, r.prs[0].qty, r.req.lines[0].issued], ['waiting', 50, 0]);
});

test('ต้องอนุมัติ: ไม่ตัดสต็อก ไม่สร้าง PR จนหัวหน้าอนุมัติ', () => {
  const s = SM.seed(); s.settings.reqApproval = true;
  fill(s, [{ productId: 'P-0007', qty: 85 }]);
  assert.equal(S.needsApproval(s, 'u-eng'), true);
  assert.equal(S.needsApproval(s, 'u-head'), false);
  const r = S.issueNow(s, 'u-eng');
  assert.equal(r.outcome, 'pending_approval');
  assert.equal(S.available(s, 'P-0007', 'wh-main'), 54);
  assert.equal(s.prs.length, 0);
  assert.ok(texts(s, 'u-head').some(t => /REQ-690007 รออนุมัติ: สมชาย ใจดี ขอเบิก 1 รายการ/.test(t)));
  const req = S.approveReq(s, r.req.id, 'u-head', true);
  assert.equal(req.status, 'partial');
  assert.equal(s.prs.length, 1);
  assert.ok(texts(s, 'u-eng').some(t => /REQ-690007 อนุมัติแล้ว/.test(t)));
});

test('ไม่อนุมัติ', () => {
  const s = SM.seed(); s.settings.reqApproval = true; fill(s, [{ productId: 'P-0004', qty: 5 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.equal(S.approveReq(s, r.req.id, 'u-head', false, 'เบิกเกินงบ').status, 'rejected');
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 30);
  assert.ok(texts(s, 'u-eng').some(t => /ไม่ได้รับอนุมัติ: เบิกเกินงบ/.test(t)));
});

test('ระบบปฏิเสธ: state ไม่เปลี่ยน ฟอร์มยังอยู่', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0004', qty: 5 }]);
  s.jobs.find(j => j.id === 'J-25-010').open = false;
  assert.throws(() => S.issueNow(s, 'u-eng'), /งาน J-25-010 ปิดไปแล้ว เลือกงานอื่น/);
  assert.equal(s.cart.lines.length, 1);
  assert.equal(s.reqs.length, 1);                                       // มีแค่ใบ seed
  s.jobs.find(j => j.id === 'J-25-010').open = true; s.warehouses[0].locked = true;
  assert.throws(() => S.issueNow(s, 'u-eng'), /เบิกไม่ได้: คลังนี้กำลังตรวจนับ/);
});

test('กดซ้ำไม่เกิดใบเบิกซ้ำ', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0004', qty: 5 }]);
  S.issueNow(s, 'u-eng');
  assert.throws(() => S.issueNow(s, 'u-eng'), /กรอกสินค้าและจำนวนให้ครบ/); // ตะกร้าถูกล้างแล้ว
  assert.equal(s.reqs.length, 2);
});

test('เดโม: จำลองจ่ายไม่สำเร็จ = pick_failed กันของไว้ให้', () => {
  const s = SM.seed(); s.settings.demoPickFail = true; fill(s, [{ productId: 'P-0004', qty: 5 }]);
  const r = S.issueNow(s, 'u-eng');
  assert.deepEqual([r.outcome, r.req.lines[0].issued, r.req.lines[0].reserved], ['pick_failed', 0, 5]);
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 25);
  assert.equal(s.settings.demoPickFail, false);                         // ใช้ครั้งเดียว
});
```

- [ ] **Step 2: รัน `node --test tests/issue.test.js` — FAIL**

- [ ] **Step 3: เขียนฟังก์ชัน + ข้อความ**

กติกาที่ test ไม่ได้บอก:
- outcome: ทุกรายการจ่ายครบ → `issued` · จ่ายได้บางรายการ/บางส่วน → `partial` · ไม่ได้จ่ายเลย → `waiting`
- PR 1 ใบต่อ 1 รายการที่ขาด (`whId` = คลังที่เบิก) · ถ้ามี `pendingCC` ครอบคลุมส่วนที่ขาด ไม่สร้าง PR ส่วนนั้น (IP-AC39)
- ลำดับตรวจปฏิเสธใน `issueNow`: ตะกร้าไม่ครบ (`!linesReady`) → ไม่ได้เลือกคลัง/งาน → คลังล็อก → งานปิด → `planIssue.blocked` (ใช้ `firstError`)
- `approveReq(ok=true)` รันการจ่ายแบบเดียวกับ `issueNow` บนใบเดิม แล้วแจ้งผู้เบิก N66 พร้อม `link: '#/orders/<id>'` · N65 link `#/approvals` · N68 link `#/restock` ส่งถึง role `store` และ `head`
- ไม่แจ้ง N69 เมื่อผู้เบิกกดเบิกเอง (ข้อเสนอ)
- เลขเอกสาร: `REQ-` + `seq.req` แล้วค่อย `++` (ใบแรกที่สร้าง = REQ-690007, PR-690002)

- [ ] **Step 4: รัน `node --test tests/` — PASS ทั้งหมด**
- [ ] **Step 5: Commit** — `git commit -am "feat(store): issue, approval, purchase list, notifications"`

---

### Task 5: store — รับของเข้า หยิบ คืนของ สร้างสินค้า/งาน ยืนยันยอด

**Files:**
- Modify: `js/store.js`, `js/text.js` (เติม N11–N24, N51–N53, N70–N73)
- Test: `tests/loop.test.js`

**Interfaces:**
- Consumes: `issueNow`, `notify`, `available` (Task 3–4)
- Produces:
  - `receiveStock(state, { productId, whId, qty?, rollLengths?, prId?, userId }): { readied: Req[] }` — เพิ่มสต็อก (ม้วน: 1 แถวต่อ 1 ค่าใน `rollLengths`, ชั้น "ทั่วไป") · ปิด/อัปเดต PR · กันของให้ใบเบิกที่รอ (เก่าสุดก่อน) → สถานะ `ready` + แจ้ง N70
  - `pickReq(state, reqId, userId): Req` — จ่ายของที่ `reserved` ของใบ `ready`/`pick_failed`
  - `returnItems(state, { reqId, lines: [{ productId, qty }], userId }): Req`
  - `lowStock(state): [{ product, total, reorderPoint }]`
  - `similarProducts(state, name): [{ product, exact: boolean, pct: number }]` · `createProduct(state, input, userId): { product, cc: CC|null, toast: string }` — `input = { name, brand, model, unit, isRoll, category?, opening?: { whId, qty?, rollLengths? } }`
  - `confirmCC(state, ccId, userId, ok, reason?): CC`
  - `similarJobs(state, name): Job[]` · `createJob(state, { name, customer }): Job`

- [ ] **Step 1: เขียน test ที่ fail**

```js
// tests/loop.test.js
const test = require('node:test'); const assert = require('node:assert');
require('../js/seed.js'); require('../js/text.js'); const SM = require('../js/store.js');
const S = SM.store;
const fill = (s, lines) => Object.assign(s.cart, { lines, whId: 'wh-main', jobId: 'J-25-010', note: '' });
const texts = (s, uid) => s.notifs.filter(n => n.toUserId === uid).map(n => n.text);

test('ลูปเต็ม: ขาด → ต้องซื้อ → รับของเข้า → กันของ → หยิบ → ครบ', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0007', qty: 85 }]);
  const { req, prs } = S.issueNow(s, 'u-eng');                           // จ่าย 54 ขาด 31
  const { readied } = S.receiveStock(s, { productId: 'P-0007', whId: 'wh-main', qty: 40, prId: prs[0].id, userId: 'u-store' });
  assert.deepEqual(readied.map(r => r.id), [req.id]);
  assert.deepEqual([req.status, req.lines[0].reserved], ['ready', 31]);
  assert.equal(S.available(s, 'P-0007', 'wh-main'), 9);                  // 40 - 31 ที่กันไว้ (รับเกิน PR ได้)
  assert.deepEqual([prs[0].status, prs[0].received], ['done', 40]);
  assert.ok(texts(s, 'u-eng').some(t => /ของที่รอสำหรับ REQ-690007 เข้าแล้ว/.test(t)));
  S.pickReq(s, req.id, 'u-store');
  assert.deepEqual([req.status, req.lines[0].issued, req.lines[0].reserved], ['issued', 85, 0]);
  assert.ok(texts(s, 'u-eng').some(t => /REQ-690007 จ่ายของครบแล้ว/.test(t))); // N69: คนอื่นจ่ายให้
});

test('รับของเข้าไม่พอ: PR ยังเปิด ใบเบิกยังรอ', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0017', qty: 50 }]);
  const { req, prs } = S.issueNow(s, 'u-eng');
  S.receiveStock(s, { productId: 'P-0017', whId: 'wh-main', rollLengths: [30], prId: prs[0].id, userId: 'u-store' });
  assert.deepEqual([prs[0].status, prs[0].received, req.status, req.lines[0].reserved], ['open', 30, 'waiting', 30]);
  assert.throws(() => S.receiveStock(s, { productId: 'P-0017', whId: 'wh-main', rollLengths: [0], userId: 'u-store' }), /มากกว่า 0/);
});

test('เติมสต็อกเอง (ไม่มี PR) + ใกล้หมด', () => {
  const s = SM.seed();
  assert.deepEqual(S.lowStock(s).map(x => x.product.id), ['P-0004']);    // 30 < 40
  S.receiveStock(s, { productId: 'P-0004', whId: 'wh-main', qty: 20, userId: 'u-store' });
  assert.deepEqual(S.lowStock(s), []);
});

test('คืนของ: กลับเข้าคลัง ห้ามคืนเกินที่จ่าย', () => {
  const s = SM.seed(); fill(s, [{ productId: 'P-0004', qty: 5 }, { productId: 'P-0011', qty: 80 }]);
  const { req } = S.issueNow(s, 'u-eng');
  S.returnItems(s, { reqId: req.id, lines: [{ productId: 'P-0004', qty: 2 }, { productId: 'P-0011', qty: 10 }], userId: 'u-eng' });
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 27);
  assert.equal(S.available(s, 'P-0011', 'wh-main'), 30);                 // 20 + ม้วนคืน 10
  assert.equal(s.rolls.filter(r => r.productId === 'P-0011' && r.whId === 'wh-main').length, 2);
  assert.deepEqual(req.lines.map(l => l.returned), [2, 10]);
  assert.throws(() => S.returnItems(s, { reqId: req.id, lines: [{ productId: 'P-0004', qty: 4 }], userId: 'u-eng' }),
    /คืนได้ไม่เกิน 3 ตัว/);
});

test('สร้างสินค้า: ชื่อซ้ำ/คล้าย, ยอดตั้งต้นตามบทบาท', () => {
  const s = SM.seed();
  assert.equal(S.similarProducts(s, 'เทปพันสายไฟ 3m')[0].exact, true);
  assert.throws(() => S.createProduct(s, { name: 'เทปพันสายไฟ 3M', unit: 'ม้วน' }, 'u-eng'), /มีสินค้านี้แล้ว: P-0006/);
  assert.ok(S.similarProducts(s, 'สายไฟ THW 1.5 sq.mm สีขาว').some(x => !x.exact));
  const a = S.createProduct(s, { name: 'น็อตสแตนเลส M8', unit: 'ตัว', opening: { whId: 'wh-main', qty: 200 } }, 'u-store');
  assert.deepEqual([a.product.id, a.cc, S.available(s, 'P-0020', 'wh-main')], ['P-0020', null, 200]);
  assert.equal(a.toast, 'สร้าง P-0020 แล้ว · ลงยอด 200 ตัว เข้าคลังแล้ว');
  const b = S.createProduct(s, { name: 'สายไฟ THW 1x4 sq.mm สีแดง', unit: 'ตัว', isRoll: true,
    opening: { whId: 'wh-main', rollLengths: [100, 100, 100] } }, 'u-eng');
  assert.deepEqual([b.product.unit, b.cc.id, b.cc.status, S.available(s, b.product.id, 'wh-main')], ['m', 'CC-0007', 'pending', 0]);
  assert.equal(S.cableFacets(b.product).color, 'แดง');
  assert.ok(texts(s, 'u-store').some(t => /CC-0007/.test(t)));
});

test('ใบเบิกรอยอดที่ Store ยังไม่ยืนยัน → ยืนยันแล้วได้ของ', () => {
  const s = SM.seed();
  const { product, cc } = S.createProduct(s, { name: 'ข้อต่อ EMT 1/2 นิ้ว', unit: 'ตัว', opening: { whId: 'wh-main', qty: 50 } }, 'u-eng');
  fill(s, [{ productId: product.id, qty: 10 }]);
  const { outcome, req, prs } = S.issueNow(s, 'u-eng');
  assert.deepEqual([outcome, prs.length], ['waiting', 0]);               // ไม่สร้าง PR (IP-AC39)
  S.confirmCC(s, cc.id, 'u-store', true);
  assert.deepEqual([cc.status, req.status, req.lines[0].reserved, S.available(s, product.id, 'wh-main')], ['ok', 'ready', 10, 40]);
});

test('Store ตอบไม่มีของ → สร้าง PR ให้ใบที่รอ', () => {
  const s = SM.seed();
  const { product, cc } = S.createProduct(s, { name: 'ข้อต่อ EMT 3/4 นิ้ว', unit: 'ตัว', opening: { whId: 'wh-main', qty: 50 } }, 'u-eng');
  fill(s, [{ productId: product.id, qty: 10 }]); S.issueNow(s, 'u-eng');
  S.confirmCC(s, cc.id, 'u-store', false, 'หาไม่เจอที่ชั้น');
  assert.deepEqual(s.prs.map(p => [p.productId, p.qty]), [[product.id, 10]]);
  assert.ok(texts(s, 'u-eng').some(t => /Store ไม่พบของ ข้อต่อ EMT 3\/4 นิ้ว ตามที่แจ้ง: หาไม่เจอที่ชั้น/.test(t)));
});

test('งานใหม่', () => {
  const s = SM.seed();
  assert.deepEqual(S.similarJobs(s, 'เดินสาย LAN โรงงาน').map(j => j.id), ['J-24-045']);
  assert.throws(() => S.createJob(s, { name: '  ' }), /กรุณาระบุชื่องาน/);
  const j = S.createJob(s, { name: 'ติดตั้งแอร์ ห้องประชุม', customer: '' });
  assert.deepEqual([j.id, j.open], ['J-26-011', true]);
});
```

- [ ] **Step 2: รัน `node --test tests/loop.test.js` — FAIL**

- [ ] **Step 3: เขียนฟังก์ชัน + ข้อความ**

กติกาที่ test ไม่ได้บอก:
- ใบเบิกเป็น `ready` เมื่อส่วนที่ยังไม่จ่ายของ*ทุกรายการ*ถูกกันครบ (`issued + reserved >= qty`) ถ้ากันได้ไม่ครบ สถานะคงเดิมและ `reserved` สะสมไว้
- `lowStock` นับเฉพาะสินค้าที่ `reorderPoint > 0` และยอดรวมทุกคลัง < `reorderPoint`
- "Store ตอบไม่มีของ → สร้าง PR อัตโนมัติ" คือคำแนะนำของ BA ในคำถามเปิดข้อ 2 (ยังรอผู้บริหาร) — ทำตามคำแนะนำ และใส่ `// ponytail: คำถามเปิดข้อ 2 ยังไม่ตัดสิน` กำกับ
- ความคล้ายของชื่อ: สัดส่วน bigram ที่ซ้ำกัน (Dice) ≥ 0.6 = คล้าย · เทียบชื่อแบบ trim + ไม่สนตัวพิมพ์ = ซ้ำ
- `createProduct`: `isRoll` → `unit = 'm'` · `category` ค่าเริ่ม "อื่น ๆ" (ถ้า `cableFacets` อ่าน type ได้ → "สายไฟ") · role `store`/`head` ลงยอดทันที (toast N21) · `engineer` สร้าง CC `pending` (toast N22 ข้อเสนอ) + แจ้ง N71 ถึง store/head link `#/approvals` · ไม่มี opening → toast N20
- คืนของสายม้วน = สร้างม้วนใหม่ (`opened: true`, ชั้น "ทั่วไป") ความยาวเท่าที่คืน · คืนได้ไม่เกิน `issued - returned`
- `pickReq`: ถ้าหลังจ่ายยังมีรายการที่ `issued < qty` → `partial` ไม่งั้น `issued` · แจ้ง N69 เฉพาะเมื่อ `userId !== req.userId`
- รหัสงานใหม่: `J-26-` + `seq.job` เติมศูนย์ 3 หลัก

- [ ] **Step 4: รัน `node --test tests/` — PASS ทั้งหมด**
- [ ] **Step 5: Commit** — `git commit -am "feat(store): receive, pick, return, new product/job, stock confirmation"`

---

### Task 6: หน้าร้าน (เลือกของ) + กล่องสร้างสินค้าใหม่

**Files:**
- Create: `js/views/shop.js`
- Modify: `index.html` (เพิ่ม `<script>`), `css/app.css`

**Interfaces:**
- Consumes: `searchProducts`, `facetRows`, `categories`, `totalStock`, `recentProducts`, `similarProducts`, `createProduct`, `SM.T`, `SM.fmtQty`, `SM.toast`
- Produces: `SM.views.shop` · `SM.addToCart(productId): 'added'|'exists'` (ใน `app.js`; เพิ่ม `{ productId, qty: null, single: false }` หรือคืน `'exists'`)

อ้างสเปก: หัวข้อ 3 ขั้นที่ 1 + "สร้างสินค้าใหม่", N01–N05, N11–N24, IP-AC1–9, IP-AC17–22

- [ ] **Step 1: เขียนหน้าร้าน**

- แถวบน: "ใช้บ่อย" (ชิปรูปเล็ก + ชื่อ สูงสุด 4, ซ่อนถ้าไม่มีประวัติ) → ชิปหมวด "ทั้งหมด" + หมวด (เลือกทีละหมวด แตะซ้ำ = ยกเลิก, wrap ไม่เลื่อนแนวนอน) → แถวชิปสเปกจาก `facetRows` (ป้ายหัวแถว + ชิป "ดำ · 3 รายการ" ให้ต่างจากตัวเลขสต็อก) → ลิงก์ "ล้างตัวกรอง" (ไม่ล้างคำค้น)
- กริดสินค้า: 2 คอลัมน์ที่ 390px, `repeat(auto-fill, minmax(200px, 1fr))` ที่กว้างกว่า · การ์ด = รูป 1:1 (`<img loading="lazy">` + `onerror` → `placeholder.svg`) · สายไฟที่ `cableFacets.color` มีค่า ให้มีจุดสี + ชื่อสีมุมรูป · ชื่อ (หนา ตัดบรรทัด) · ยี่ห้อ · รุ่น (เทา) · `T.N02` "มีรวมทุกคลัง 160 m (2 ม้วน)" หรือ `T.N03` (แดง + ไอคอน ✕) · ปุ่มเต็มความกว้าง "ใส่ตะกร้า" (ไอคอน +) / "อยู่ในตะกร้าแล้ว ✓"
- ใส่ตะกร้า: `'added'` → toast เขียว "ใส่ตะกร้าแล้ว: {ชื่อ}" พร้อมปุ่ม "ไปตะกร้า" · `'exists'` → `SM.go('#/cart?dup=<id>')` (ตะกร้าเลื่อนไปแถวนั้นและแสดง N05)
- แสดง 8 ใบ + ปุ่ม "แสดงเพิ่ม (อีก N)" · ไม่พบ → `T.N01(q)` + แถวเส้นประ "สร้างสินค้าใหม่ "{q}"" (แถวสร้างแสดงเมื่อมี q และไม่มีชื่อตรงทุกตัวอักษร)
- แถบสรุปตะกร้าติดล่างจอ (เหนือเมนูล่าง) เมื่อมีของ: "ตะกร้า N รายการ" + ปุ่ม "ไปเบิก →"

- [ ] **Step 2: เขียนกล่องสร้างสินค้าใหม่** (`<dialog>` เต็มจอที่ <640px, กว้างสุด 34rem ที่กว้างกว่า)

ฟิลด์ 1–9 + ข้อความ 10 + ปุ่ม 12 ตามตารางในสเปกหัวข้อ 3 (ข้ามฟิลด์ 11 "ข้อมูลเพิ่มเติม" — แสดงเป็นปุ่มพับที่กดแล้วเห็นช่องจริงแต่ไม่บันทึกค่า) · N11 กล่องแดง + "ใช้รายการนี้" (ปิดกล่อง + ใส่ตะกร้าสินค้านั้น) · N12 กล่องเหลือง · ปุ่ม "สร้าง" disabled + ข้อความ N13/N14 และขอบแดงที่ช่องที่ขาด · สวิตช์สายม้วนล็อกหน่วยเป็นเมตร (N15) ปิดแล้วคืนหน่วยเดิม · แถวม้วน เพิ่ม/ลบ (ลบไม่ได้เมื่อเหลือแถวเดียว) + "รวม N ม้วน X m" · N17 ตามบทบาทผู้ใช้ปัจจุบัน · สำเร็จ → `SM.toast('success', result.toast)` + ปิดกล่อง + ใส่ตะกร้า + ไป `#/cart`

- [ ] **Step 3: ตรวจใน browser (390px และ 1280px)**

1. เปิดหน้า: ไม่เห็นแถวชิปสเปก (IP-AC7) · เลือกหมวด "สายไฟ" → เห็นแถว ชนิด/ขนาด/แกน/สี · แตะ THW → แถวขนาดเหลือ 1.5, 2.5, 4 แถวแกนหาย ผลลัพธ์ 4 ใบ · แตะ THW ซ้ำ → กลับ
2. P-0017 แสดง "ไม่มีของในทุกคลัง (เบิกได้ ระบบจะรอของเข้า)" และใส่ตะกร้าได้
3. ค้น "น็อต" → ไม่พบ + แถวสร้าง → สร้างเป็นวิศวกรพร้อมยอด 100 → toast N22, ระฆังของ Store (สลับผู้ใช้) มี CC-0007
4. ไม่มี scroll แนวนอนที่ 390px · โหมดมืดอ่านชัด

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(ui): shop catalog with photos, filters, new product dialog"`

---

### Task 7: ตะกร้า + เลือกคลัง + เลือกงาน + ปุ่มเบิก + การ์ดผล

**Files:**
- Create: `js/views/cart.js`
- Modify: `index.html`, `css/app.css`

**Interfaces:**
- Consumes: `qtyError`, `linesReady`, `planIssue`, `warehouseOptions`, `syncCartWarehouse`, `switchSuggestions`, `needsApproval`, `issueNow`, `recentJobs`, `similarJobs`, `createJob`, `SM.T`
- Produces: `SM.views.cart`

อ้างสเปก: หัวข้อ 2, 3 (ขั้น 1 "รายการที่จะเบิก", ขั้น 2, ขั้น 3, ส่วนท้าย), 4, 6, N05–N10, N25–N64, IP-AC8–16, IP-AC23–43 · หน้าเดียวเรียงลงมา 4 ช่วง ช่วงที่ยังไม่ถึงเป็นแถบล็อก (กุญแจ + N08/N09/N10)

- [ ] **Step 1: ช่วง 1 "ตะกร้า · รายการที่จะเบิก (N รายการ)"**

แถวต่อของ: รูปย่อ 56px · ชื่อ + ยี่ห้อ·รุ่น · ป้าย "ขอเบิก" + `<input type="number" inputmode="decimal" step="any">` พร้อมหน่วยท้ายช่อง · ปุ่ม ✕ (44px, แยกห่างจากช่องจำนวน ≥ 12px, ลบทันที) · **ไม่มีตัวเลขสต็อก** · ข้อความใต้ช่องเมื่อ blur แล้ว `qtyError` ≠ null · `?dup=<id>` → เลื่อนไปแถว + กล่องเหลือง N05 6 วินาที (หายเมื่อแก้จำนวน) · ลิงก์ "+ เลือกของเพิ่ม" → `#/shop` · ตะกร้าว่าง → ภาพ/ข้อความว่าง + ปุ่ม "ไปเลือกของ"
หลังทุกการแก้ไขเรียก `syncCartWarehouse` ถ้าคืนข้อความ → กล่องเหลือง N36 เหนือช่วง 2

- [ ] **Step 2: ช่วง 2 "เลือกคลัง"** (เปิดเมื่อ `linesReady` หรือเมื่อเลือกคลังไปแล้วและ `planIssue.blocked` — IP-AC15)

- ตัวเลือกคลังเป็นรายการ radio แบบการ์ด (ไม่ใช้ `<select>` เพราะต้องโชว์ป้ายผลต่อแถว): ชื่อ + ที่ตั้ง + ป้าย "แนะนำ" + ผลสั้น (ไอคอน + คำ) · คลังล็อก disabled · คลังเดียว → `T.N31` · ยังไม่เลือก → N26 · ไม่มีของที่ไหนเลย → N25 เหนือรายการ
- ตารางคลังที่เลือก: ของ | ขอเบิก | มีในคลังนี้ | ผล — ที่ <640px เรียงเป็นแถวซ้อน ทุกตัวเลขมีป้ายคำ · ผล: "✓ พอ" / "⚠ ขาด 31 ใบ" / "✕ ไม่มี" · แถวย่อยสีฟ้า N35 เมื่อ `pendingCC`
- พื้นที่ปัญหา: กล่องแดง (`role="alert"`) ต่อ `error` · กล่องเหลือง N40/N41/N42 ต่อรายการที่ขาด (ซ่อนทั้งหมดถ้า `needsApproval`) · ปุ่ม N43 ต่อ `switchSuggestions`
- สายม้วน: `<details>` "ม้วนที่จะตัด: {ชื่อ}" (เปิดเองเมื่อรายการนั้น error, ป้าย "(มีคำเตือน)" เมื่อมี warnings) ข้างใน: N44 ต่อ cut (ม้วนมี · ตัด · เหลือ มีป้ายทุกตัว) · N45 · N46 · checkbox "ต้องเป็นเส้นเดียว" + N47 (ผูก `line.single`) — ข้ามปุ่ม "เปลี่ยนม้วน" (ระบบเลือกให้)

- [ ] **Step 3: ช่วง 3 "เลือกงาน"** (เปิดเมื่อมี `cart.whId`)

ช่องค้นหางาน + รายการใต้ช่อง (งานเปิดอยู่ 8 งาน ล่าสุดของผู้ใช้ก่อน, ค้นจากรหัส/ชื่อ/ลูกค้า สูงสุด 20, แถว: ชื่อ + รหัส · ลูกค้า) · แถวแรก "+ เพิ่มงานใหม่ "{คำ}"" + N50 เมื่อไม่พบ · ปุ่ม "+ งานใหม่" · ชิป "งานล่าสุด" 3 งาน (2 คอลัมน์ที่มือถือ, แตะซ้ำ = ยกเลิก) · งานที่เลือกแสดงเป็นการ์ดเต็มชื่อ **ตัดบรรทัด ไม่ตัดด้วย "…"** + ปุ่ม ✕ · พิมพ์แล้วไม่ได้เลือก → N48
กล่องเพิ่มงานใหม่: ชื่องาน (บังคับ) · ลูกค้าหรือสถานที่ · N51 + "ใช้งานนี้" · "บันทึก" → `createJob` → เลือกให้ + toast N52 (ผิดพลาด → toast แดง N53)

- [ ] **Step 4: ส่วนท้าย + ปุ่มเบิก**

`<details>` "หมายเหตุ (ไม่บังคับ)" (+ "(ตั้งไว้ 1)" เมื่อมีข้อความ) · แถบปุ่ม `position: sticky; bottom` ที่มือถือ, แถวชิดขวาที่ ≥1024px · เรียงบนลงล่าง: กล่องแดง N56 (ข้อความจาก `catch`, หายเมื่อแก้ฟอร์ม) → บรรทัดแดง N55 → N54 → ปุ่ม "เบิกเลย" (✓) หรือ "ส่งเบิก" (ตาม `needsApproval`) สูง 48px
กด: ตั้ง `sending = true` (ปุ่ม disabled + หมุน) → `setTimeout(400)` → `issueNow` ใน `try/catch` → สำเร็จ: เก็บ `result` ใน component แล้วแสดงการ์ดผลแทนฟอร์ม

- [ ] **Step 5: การ์ดผล 5 แบบ**

ทุกแบบ: ไอคอนใหญ่ + ป้ายคำ (ไม่พึ่งสีขอบ) + เลขใบเบิก (mono) + งาน + รายการ (รูปย่อ ชื่อ จำนวน) ·
`issued` N57 (ชั้น/ม้วนที่ตัด + เหลือ) · `partial` N58 ("จ่ายแล้ว 54 จาก 85 ใบ" + ขาด + PR + ลิงก์ "ดูรายการต้องซื้อ" → `#/restock`) · `waiting` N59 หรือ N60 (มี `pendingCC`) · `pending_approval` N61 · `pick_failed` N62 (ปุ่มหลัก "ไปหน้าหยิบ" → `#/orders/<id>`) · N63 ท้ายการ์ดเมื่อมีม้วนเหลือต่ำกว่า `scrapMin`
ปุ่มคู่ 48px: "เบิกต่อ" (→ `#/shop`, ใต้ปุ่มมี N64 ข้อเสนอ) · "ดูใบเบิก" (→ `#/orders/<id>`) · แสดงผลแล้ว `scrollIntoView` + focus ปุ่มหลัก

- [ ] **Step 6: ตรวจใน browser (390px + 1280px, สว่าง + มืด)**

1. ฉากหลัก: ใส่ P-0011 80 + P-0007 85 → คลังหลักขึ้น "ขาด 1/2 รายการ" → ตาราง พอ/ขาด 31 ใบ + กล่องเหลือง → เลือกงาน J-25-010 → "เบิกเลย" → การ์ด "จ่ายบางส่วน" REQ-690007, ตัดจาก R-000160 เหลือ 20 m, PR-690002
2. ติ๊ก "ต้องเป็นเส้นเดียว" กับ P-0011 จำนวน 150 → บล็อกม้วนเปิดเอง กล่องแดง N38 ปุ่มเบิกจาง + N55 ยังสลับคลังได้
3. เมนูเดโม เปิดสวิตช์อนุมัติ → ปุ่มเป็น "ส่งเบิก" + N54 กล่องเหลืองขาดหาย → การ์ด "รออนุมัติ"
4. เลือกคลังหลักแล้วล็อกคลังหลักจากเมนูเดโม → คลังถูกล้าง เห็น N36 งานยังอยู่
5. กดปุ่มเบิกรัว ๆ → มีใบเบิกใบเดียวในหน้าใบเบิก
6. งาน J-24-031 (ชื่อยาวสุด) แสดงเต็มไม่มี "…" ที่ 390px
7. "เบิกต่อ" แล้วใส่ของใหม่ → คลังและงานเดิมยังเลือกอยู่ (IP-AC43)

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(ui): cart, warehouse/job steps, submit, result cards"`

---

### Task 8: ใบเบิกที่ผ่านมา + หน้าหยิบ + คืนของ

**Files:**
- Create: `js/views/orders.js`
- Modify: `index.html`, `css/app.css`, `js/text.js` (ป้ายสถานะ)

**Interfaces:**
- Consumes: `pickReq`, `returnItems`, `SM.T`, `SM.fmtQty`
- Produces: `SM.views.orders` (รับ route `#/orders`, `#/orders/:id`, `#/returns`) · `SM.T.status(status): { label, icon, tone }`

- [ ] **Step 1: รายการใบเบิก (`#/orders`)** — การ์ดต่อใบ (ใหม่สุดบน): เลขใบ · วันที่ · ผู้เบิก · งาน · คลัง · ป้ายสถานะ (ไอคอน + คำ: จ่ายครบ / จ่ายบางส่วน / รอของเข้า / ของเข้าแล้ว รอหยิบ / รออนุมัติ / ไม่อนุมัติ / จ่ายไม่สำเร็จ) · รูปย่อสินค้า 3 ชิ้นแรก · ตัวกรอง "ของฉัน / ทั้งหมด" (ทั้งหมดเห็นเฉพาะ store/head)

- [ ] **Step 2: รายละเอียด (`#/orders/:id`)** — เส้นเวลาสถานะแนวตั้ง (ส่งเบิก → อนุมัติ → จ่ายของ → ครบ) · ตารางรายการ: ของ | ขอเบิก | จ่ายแล้ว | กันไว้ให้ | คืนแล้ว (ป้ายคำทุกตัวเลข) · ม้วนที่ตัด · PR ที่เกี่ยวข้อง (ลิงก์ `#/restock`) · หมายเหตุ · ปุ่ม "จ่ายของ" (48px) เมื่อสถานะ `ready`/`pick_failed` → `pickReq` → toast เขียว · ปุ่ม "คืนของ" เมื่อมีรายการที่ `issued - returned > 0`

- [ ] **Step 3: คืนของ (`#/returns`)** — รายการใบเบิกของผู้ใช้ที่ยังคืนได้ → เลือกใบ → ต่อรายการ: รูป ชื่อ "จ่ายไป X · คืนแล้ว Y" + ช่อง "คืน" (ค่าเริ่มว่าง, ใช้ `qtyError` เดียวกัน) → ปุ่ม "คืนของเข้า{ชื่อคลัง}" → `returnItems` ใน `try/catch` (ข้อความ error ใต้ช่องที่ผิด) → toast เขียว "คืนของแล้ว N รายการ เข้า{คลัง}"

- [ ] **Step 4: ตรวจใน browser** — ต่อจากฉากหลัก Task 7: เปิด REQ-690007 เห็น จ่ายแล้ว 54 จาก 85 · คืนสายไฟ 10 m → หน้าร้านยอด P-0011 เพิ่มเป็น 90 m (3 ม้วน) · คืนเกิน → error ใต้ช่อง ไม่มีอะไรเปลี่ยน · 390px ไม่มี scroll แนวนอน

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): requisition history, pick, returns"`

---

### Task 9: เติมสต็อก + อนุมัติ + ระฆัง

**Files:**
- Create: `js/views/restock.js`, `js/views/approvals.js`
- Modify: `index.html`, `css/app.css`, `js/app.js` (ป้ายจำนวนค้างบนเมนู)

**Interfaces:**
- Consumes: `receiveStock`, `lowStock`, `totalStock`, `available`, `approveReq`, `confirmCC`, `unread`
- Produces: `SM.views.restock`, `SM.views.approvals`

- [ ] **Step 1: เติมสต็อก (`#/restock`)** — 3 ส่วนในหน้าเดียว (แท็บที่มือถือ):
  1. **รายการต้องซื้อ**: การ์ดต่อ PR ที่ `open` — รูป ชื่อ · "ต้องซื้อ 31 ใบ · รับแล้ว 0 ใบ" · มาจากใบเบิกไหน (ลิงก์) · คลังปลายทาง · ปุ่ม "รับของเข้า" (เห็นเฉพาะ store/head; วิศวกรเห็นรายการแต่ไม่มีปุ่ม)
  2. **ใกล้หมด**: จาก `lowStock` — "เหลือรวมทุกคลัง 30 ตัว · เกณฑ์เตือน 40 ตัว" + ปุ่ม "เติมสต็อก"
  3. **ยอดคงเหลือ**: ตารางสินค้า × คลัง (ที่มือถือ: การ์ดต่อสินค้า แถวต่อคลัง มีป้ายชื่อคลังทุกตัวเลข) + ช่องค้นหา + ปุ่ม "เติมสต็อก" ต่อสินค้า
  กล่อง "รับของเข้า/เติมสต็อก": สินค้า (ล็อกจากที่กดมา) · คลัง (ไม่รวมคลังล็อก) · จำนวน หรือ แถวม้วน "ม้วนที่ N ยาว [__] m" + เพิ่ม/ลบม้วน + "รวม N ม้วน X m" · ปุ่ม "รับเข้าคลัง" → `receiveStock` → toast เขียว "รับ {ชื่อ} {จำนวน} เข้า{คลัง}แล้ว" + ถ้า `readied.length` ต่อท้าย "· กันของให้ใบเบิก {เลขใบ} แล้ว"

- [ ] **Step 2: อนุมัติ (`#/approvals`, เฉพาะ store/head)** — ใบเบิกรออนุมัติ (เฉพาะ head): ผู้เบิก งาน รายการ + "อนุมัติ" / "ไม่อนุมัติ" (ต้องกรอกเหตุผล) → `approveReq` · ยอดตั้งต้นรอยืนยัน (store + head): สินค้า คลัง จำนวน/ม้วน ผู้แจ้ง + "ยืนยัน มีของจริง" / "ไม่มีของ" (ต้องกรอกเหตุผล) → `confirmCC` · ว่าง → "ไม่มีรายการรอ"

- [ ] **Step 3: ระฆัง** — แผงแจ้งเตือนใน shell: รายการของผู้ใช้ปัจจุบัน ใหม่สุดบน ไอคอนตามระดับ แตะ → `read = true` + `SM.go(link)` · ว่าง → "ไม่มีการแจ้งเตือน"

- [ ] **Step 4: ตรวจลูปเต็มใน browser** (รีเซ็ตข้อมูลก่อน)

1. วิศวกร: เบิก P-0007 85 ใบจากคลังหลัก งาน J-25-010 → "จ่ายบางส่วน"
2. สลับเป็น Store: ระฆังมี PR-690002 → แตะ → หน้าเติมสต็อก → "รับของเข้า" 40 ใบ → toast มี "กันของให้ใบเบิก REQ-690007 แล้ว"
3. สลับเป็นวิศวกร: ระฆัง "ของที่รอสำหรับ REQ-690007 เข้าแล้ว…" → แตะ → รายละเอียดใบเบิก → "จ่ายของ" → สถานะ "จ่ายครบ"
4. เปิดสวิตช์อนุมัติ → วิศวกรส่งเบิก → หัวหน้าเห็นป้ายจำนวนบนเมนูอนุมัติ → อนุมัติ → วิศวกรได้แจ้งเตือน
5. P-0004 อยู่ใน "ใกล้หมด" → เติม 20 → หายจากรายการ

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): restock, purchase list, approvals, notification bell"`

---

### Task 10: รูปสินค้า + เก็บงาน + สคริปต์เดโม

**Files:**
- Create: `img/products/*.jpg`, `img/products/CREDITS.md`, `README.md`
- Modify: `css/app.css`, `js/seed.js` (เฉพาะถ้าชื่อไฟล์รูปต่างจากที่กำหนด)

- [ ] **Step 1: หารูปและขออนุญาตดาวน์โหลด**

หาภาพถ่ายลิขสิทธิ์ใช้เชิงพาณิชย์ได้ไม่ต้องขออนุญาต (Unsplash / Pexels / Wikimedia Commons CC0 หรือ CC BY) 9 ไฟล์: `cable-roll.jpg` (ใช้ร่วม P-0011–P-0016 แยกสีด้วยจุดสีบนการ์ด) · `cable-flat.jpg` (P-0017) · `cable-multicore.jpg` (P-0018) · `lan-cable.jpg` (P-0008) · `breaker.jpg` (P-0004) · `conduit.jpg` (P-0005) · `junction-box.jpg` (P-0007) · `cable-ties.jpg` (P-0009) · `electrical-tape.jpg` (P-0006)
**ก่อนดาวน์โหลด** แสดงตารางให้เจ้าของงานอนุมัติ: ชื่อไฟล์ · URL ต้นทาง · ขนาด · สัญญาอนุญาต แล้วรอคำตอบ · ไฟล์ที่หาไม่ได้/ไม่อนุมัติ ปล่อยให้ `placeholder.svg` ทำงานแทน
หลังดาวน์โหลด: ย่อเป็น 600×600 crop กลาง ≤ 80 KB ต่อไฟล์ · บันทึกแหล่งที่มา/ผู้ถ่าย/สัญญาอนุญาตใน `CREDITS.md`

- [ ] **Step 2: ตรวจ constraint ทั้งแอป** — ไล่ทุก route ที่ 390×844 และ 1280 ทั้งสว่างและมืด แก้ทุกจุดที่: มี scroll แนวนอน · จุดแตะ < 44px · ตัวอักษร < 14px · ชื่อถูกตัดด้วย "…" · สถานะบอกด้วยสีอย่างเดียว · contrast ต่ำในโหมดมืด · ช่องกรอกไม่มี `<label>`/`aria-label` · กล่อง error ไม่มี `role="alert"` · เปิด `prefers-reduced-motion` แล้วยังมีอนิเมชัน

- [ ] **Step 3: เขียน `README.md`** — วิธีเปิด (ดับเบิลคลิก `index.html`) · วิธีรีเซ็ตข้อมูล · สคริปต์เดโม 5 ฉากสำหรับนำเสนอ (ฉากหลักจ่ายบางส่วน → เติมสต็อก → หยิบ; สายไฟเส้นเดียว; ส่งเบิกรออนุมัติ; สร้างสินค้าใหม่ + Store ยืนยันยอด; คืนของ) แต่ละฉากบอกผู้ใช้ที่ต้องสลับและปุ่มที่กด · ตาราง "ต่างจากสเปกตรงไหน" (มีรูป, radio การ์ดคลังแทน dropdown, หน้าเพิ่มนอกขอบเขตสเปก, ไม่มีปุ่มเปลี่ยนม้วน, ข้อมูลเพิ่มเติมของสินค้าไม่บันทึก)

- [ ] **Step 4: ตรวจรอบสุดท้าย** — `node --test tests/` PASS ทั้งหมด · รีเซ็ตข้อมูลแล้วเดินสคริปต์เดโมครบ 5 ฉากโดย console ไม่มี error · ถ่ายภาพหน้าจอ 390px ของ: หน้าร้าน, ตะกร้าฉากหลัก, การ์ดจ่ายบางส่วน, เติมสต็อก ส่งให้เจ้าของงาน

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: product photos, a11y/responsive pass, demo script"`

---

## ไม่ทำในรอบนี้ (เพิ่มเมื่อมีคนขอ)

- ออฟไลน์/คิวรอส่ง (N74), สแกน QR, เลือกชั้นวาง, ปุ่ม "เปลี่ยนม้วน", บทบาทบัญชี/ผู้ดูแลระบบแยก (ใช้ 3 บทบาทตามข้อมูลตัวอย่างสเปก 0.5)
- หลายคนใช้พร้อมกัน/เซิร์ฟเวอร์จริง — ข้อมูลอยู่ใน localStorage ของเครื่องที่เปิด
- แผ่นรวม component (K2) และไฟล์ Figma — mockup นี้แทน prototype K3

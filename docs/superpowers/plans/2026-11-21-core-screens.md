# คลังช่าง · 4 หน้าหลัก (คืนของ · สินค้า · งาน · รับของ + ยอดตั้งต้น) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำ 4 หน้าตาม requirement ให้ครบทุก AC และทุกช่องว่าง (G) ในสไตล์มือถือของคลังช่าง: การ์ด ฟอร์มทีละขั้น และปุ่มยืนยันติดล่าง

**Architecture:** ตรรกะธุรกิจอยู่ใน `js/store.js` (เดิม) และไฟล์ domain ใหม่แยกตามเรื่องใน `js/domain/*.js` ที่ต่อเข้า `SM.store` ส่วนหน้าจอเป็น Vue view ใน `js/views/*.js` ไม่มี build step และเปิด `index.html` ตรงได้ ทุกกติกามี node test

**Tech Stack:** Vue 3 global (`vendor/vue.global.prod.js`) · HTML/CSS เขียนเอง (`css/app.css`) · Node 22 `node:test`

**Spec:** `docs/spec/core-screens-requirements.md` (requirement 4 หน้า) · `docs/spec/personas.md` (ผู้ใช้หลัก = Store)

## Global Constraints

- ห้ามใช้ ES module ทุกไฟล์ต้องใช้รูปแบบ `var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {}` และท้ายไฟล์ `if (typeof module !== 'undefined') module.exports = SM;`
- ไฟล์ domain ใหม่: `js/domain/<เรื่อง>.js` โหลดใน `index.html` หลัง `js/store.js` และก่อน `js/app.js` ฝั่ง test ให้ `require('../js/domain/<เรื่อง>.js')` หลัง store.js
- ฟังก์ชันภายใน store.js ที่ไฟล์ domain ใหม่ต้องใช้ ให้ export ผ่าน `S._ = { stockIn, openWh, reserveForWaiting, createPR, ensurePRs, now, docId, usersWith, round2, similarity, norm }` (เพิ่มบรรทัดเดียวท้าย store.js)
- ทำเฉพาะโหมดเล็ก ไม่ทำโหมดเต็ม (5 บทบาท) · บทบาทใน seed: `engineer` · `store` · `head` (บัญชีใช้สิทธิ์เดียวกับวิศวกร ยังไม่เพิ่ม user)
- งานที่ทำบ่อยต้องไม่เกิน ~4 แตะ (การพิมพ์ไม่นับ) · กว้าง 390px ต้องไม่มี scroll แนวนอน · ปุ่ม/ช่องสูง ≥ 44px · ตัวหนังสือ ≥ 14px · รองรับโหมดมืด
- ห้ามใช้ศัพท์ในส่วนหลัก: ledger, จอง, SKU, QC, PR, roll tracked, หน่วยซื้อ, เกณฑ์เศษ, batch, Master (ใช้ได้เฉพาะใต้ "ข้อมูลเพิ่มเติม") · ใช้คำแทน: จอง→"กันของไว้ให้", QC→"ชั้นรอตรวจ", batch→"ล็อตผู้ผลิต", PR→"รายการต้องซื้อ"
- ฟอร์มที่ทำให้ของเคลื่อน เรียงขั้น **ของ → จำนวน → ที่ไหน → ยืนยัน** ขั้นที่ยังไม่ถึงเป็นแถบล็อกพร้อมบอกว่าต้องทำอะไรก่อน ตัวเลขทุกตัวมีคำกำกับ และปุ่มยืนยันติดล่างจอพร้อมบรรทัดสรุปเหนือปุ่ม
- ชั้นเริ่มต้นของ คืน / รับ / ยอดตั้งต้น = `ทั่วไป` ทุกหน้า (สมมติฐาน BA)
- หน่วยที่ไม่ใช่ `m` ต้องเป็นจำนวนเต็มทุกหน้า (เบิก คืน รับ ยอดตั้งต้น นำเข้า) ข้อความ `{หน่วย}ต้องเป็นจำนวนเต็ม`
- ข้อความไม่มีสิทธิ์กลาง (แทนข้อความเดิม): `คุณทำรายการนี้ไม่ได้ ให้หัวหน้าทำแทน หรือขอให้หัวหน้าเปิดสิทธิ์`
- ทุกการกระทำที่เปลี่ยนข้อมูลต้องเรียก `S.log(state, userId, action, ref, text)` (Task 1)
- สแกนเป็นทางเลือกเสมอ ทุกหน้าต้องทำงานได้โดยไม่สแกน
- `localStorage` key เปลี่ยนเป็น `stock-shop-v2` (seed ใหม่มี shelves/audit ข้อมูลเก่าใช้ไม่ได้)

## การตัดสินใจที่ใช้ (คำถามรอผู้บริหาร → ใช้ข้อที่ BA แนะนำ · ช่องว่างทำทุกข้อ)

| # | ค่าที่ใช้ |
|---|---|
| Q1 | รับเกินที่สั่ง: เตือน `รับเกินที่สั่ง {X} {หน่วย} ใส่เหตุผล` ต้องใส่ `overReason` ก่อนจึงบันทึกได้ |
| Q1b | ของมาส่งโดยไม่มีใบขอซื้อ: รับได้เลย ระบบสร้างรายการต้องซื้อ `noPr: true` สถานะ `done` ให้เบื้องหลัง |
| Q2 | ปิดงานตอนของยังไม่คืน: ปิดได้ กล่องยืนยันบอกจำนวนที่ยังไม่คืน |
| Q3 | ปิดงาน/ปิดใบเบิก: กล่องยืนยันถาม ค่าเริ่ม = ยกเลิกรายการต้องซื้อที่ยังไม่รับของ (`received === 0`) |
| Q4 | "ต้องอนุมัติ" ตั้งตามหมวด (`state.approvalCats`) สินค้าใหม่ในหมวดนั้นติ๊กเอง และหัวหน้าติ๊กเองตอนสร้างได้ |
| Q5 | เปลี่ยนหน่วย/สายม้วนของสินค้าที่มีของหรือมีประวัติ = ล็อก ข้อความ `เปลี่ยนหน่วยไม่ได้ เพราะมีของหรือมีประวัติแล้ว` |
| Q6 | หัวหน้า "เลิกใช้สินค้า" ได้เมื่อยอดทุกคลัง = 0 สินค้าที่เลิกใช้ถูกซ่อนจากตัวเลือก แต่ประวัติยังอยู่ |
| Q7 | Store แก้ ชื่อ ยี่ห้อ รุ่น บาร์โค้ด หมายเหตุ ได้ · หน่วย หมวด ต้องอนุมัติ หน่วยซื้อ เกณฑ์ แก้ได้เฉพาะหัวหน้า |
| Q7b | หน้า "อนุมัติ" เปิดให้ Store เห็นเฉพาะเรื่องยืนยันยอด + ขึ้นที่หน้าแรก |
| Q8 | ของที่คืนเป็น "ตัดเป็นของเสีย" นับเป็นยอดใช้ของงาน (`used = issued − (returned − scrapped)`) |
| Q9 | คืนสายม้วนที่สั้นกว่า `scrapMin`: เตือน `ยาวแค่ {X} m สั้นกว่าเกณฑ์เศษ {Y} m ตัดเป็นของเสียไหม` + ปุ่มเปลี่ยนเป็นของเสีย (ไม่บังคับ) |
| คืนแทนกัน (RT-G1) | วิศวกรคืนได้เฉพาะใบที่ตัวเองเบิก (ตรวจใน domain ด้วย) · Store/หัวหน้าคืนได้ทุกใบ |
| นำเข้ายอดยกมา | ใช้ไฟล์ `.csv` (Excel → Save as CSV) · ไม่เพิ่ม library อ่าน xlsx |
| เทียบชื่อคล้าย | สินค้า ≥ 35% · งาน ≥ 45% และชื่อยาว ≥ 3 ตัวอักษร (ใช้ `similarity()` เดิม) |

## Review Focus

1. ของบนชั้นรอตรวจ (QC) ต้องไม่ถูกนับเป็นยอดเบิกได้ใน `S.available`, `S.warehouseOptions` และ `S.totalStock` แต่หน้ารายละเอียดยังต้องเห็น → test อยู่ใน Task 1
2. คืน/รับหลายบรรทัดที่มี 1 บรรทัดผิด (รวมแถวม้วนยาว 0) ต้องไม่บันทึกอะไรเลย → test อยู่ใน Task 2 และ Task 10
3. กลับรายการคืนหลังจากม้วนใหม่ถูกตัดหรือของถูกเบิกไปแล้ว ต้องปฏิเสธ และยอดต้องไม่ติดลบ → test อยู่ใน Task 3
4. เปิดลิงก์ `#/returns?req=` ของคนอื่นแล้วสลับเป็นวิศวกรคนอื่น ต้องไม่เลือกใบนั้นให้ และบันทึกไม่ได้ → test อยู่ใน Task 2 (domain) และ Task 4 (หน้าจอ)
5. ข้อมูล localStorage จากเวอร์ชันเก่า (ไม่มี `shelves`) ต้องไม่ทำให้หน้าพัง → test อยู่ใน Task 1 (`SM.loadState` ปฏิเสธ `v !== 2` แล้วใช้ seed)

---

### Task 1: ชั้นวาง ชั้นรอตรวจ ประวัติ และ seed v2

**Files:**
- Modify: `js/seed.js` (เพิ่ม field) · `js/store.js:96-104` (`S.available`), `:344-361` (`stockIn`) · `js/app.js` (storage key + โหลด state)
- Create: `js/domain/audit.js`
- Test: `tests/seed.test.js` (แก้) · `tests/shelves.test.js` (ใหม่)

**Interfaces:**
- Produces:
  - `warehouse.shelves: { code: string, active: boolean, qc?: true }[]` seed ทุกคลังมี `ทั่วไป`, `A-01`..`A-03`, `B-01`..`B-03`, `C-01`, `QC` (`qc: true`) · `wh-b` มี `C-01` แบบ `active: false`
  - `S.shelves(state, whId, { qc = false } = {}) → string[]` คืนเฉพาะชั้นที่เปิดใช้ ไม่รวม QC ถ้าไม่ขอ · `S.qcShelf(state, whId) → string`
  - `stockIn(state, p, whId, { qty, rollLengths, shelf = 'ทั่วไป', batch, fromRollId }, opened)` ลงที่แถว `productId+whId+shelf` (ปัจจุบันหาแถวแค่จาก product+wh) ม้วนใหม่เก็บ `shelf`, `batch`, `fromRollId` · ตรวจว่าชั้นเปิดใช้ ไม่ผ่านให้ throw `ที่วาง {ชั้น} ปิดใช้งานอยู่ (เปิดใช้อีกครั้งก่อน)`
  - `S.available` และ `S.totalStock` ไม่นับแถว/ม้วนที่อยู่ชั้น QC · `S.qcStock(state, whId?) → { productId, whId, qty, rollId? }[]`
  - product field ใหม่: `active: true`, `needsApproval: false` (P-0008 = true), `vendorCode: ''`, `note: ''`, `buyUnit: unit`, `buyFactor: 1`, `photos: []` · `state.approvalCats: []` · `state.audit: []` · `state.returns: []` · `state.receipts: []` · `state.settings.openingLocked: false` · `state.seq` เพิ่ม `ret: 1`, `rc: 690001` · job field ใหม่: `ownerId`, `site: ''`, `start`, `due: null`, `closedAt: null`, `note: ''` · `state.v = 2`
  - `S.log(state, userId, action, ref, text)` push `{ at, userId, action, ref, text }` · `S.auditFor(state, ref) → entry[]`
  - `T.FORBIDDEN` = ข้อความไม่มีสิทธิ์ใน Global Constraints
  - `SM.loadState(raw) → state` คืน seed ถ้า parse ไม่ได้หรือ `v !== 2`

- [ ] **Step 1: เขียน test ที่ fail ก่อน** (`tests/shelves.test.js`)

```js
test('ของชั้นรอตรวจไม่นับเป็นยอดเบิกได้', () => {
  const s = SM.seed();
  s.stock.push({ productId: 'P-0004', whId: 'wh-main', qty: 7, shelf: 'QC' });
  assert.equal(S.available(s, 'P-0004', 'wh-main'), 30);
  assert.equal(S.totalStock(s, 'P-0004').qty, 30);
  assert.deepEqual(S.qcStock(s, 'wh-main').map(x => x.qty), [7]);
});
test('stockIn แยกแถวตามชั้น และปฏิเสธชั้นที่ปิดใช้', () => {
  const s = SM.seed(), p = s.products.find(x => x.id === 'P-0004');
  S._.stockIn(s, p, 'wh-main', { qty: 3, shelf: 'A-01' }).apply();
  assert.equal(s.stock.filter(x => x.productId === 'P-0004' && x.whId === 'wh-main').length, 2);
  assert.throws(() => S._.stockIn(s, p, 'wh-b', { qty: 1, shelf: 'C-01' }), /C-01 ปิดใช้งานอยู่/);
});
test('loadState ทิ้งข้อมูลเวอร์ชันเก่า', () => {
  assert.equal(SM.loadState(JSON.stringify({ v: 1, stock: [] })).v, 2);
  assert.equal(SM.loadState('{bad').v, 2);
});
test('S.log ลงประวัติ', () => {
  const s = SM.seed(); S.log(s, 'u-store', 'return', 'RT-0001', 'คืน 3 ตัว');
  assert.equal(S.auditFor(s, 'RT-0001')[0].userId, 'u-store');
});
```

- [ ] **Step 2: รัน test ให้ fail** — Run: `node --test "tests/*.test.js"` · Expected: FAIL ที่ `S.qcStock is not a function`
- [ ] **Step 3: ทำ seed + store ตาม Interfaces** — `SM.loadState` วางใน `js/store.js` เพราะ test เรียกได้โดยไม่ต้องมี DOM ส่วน `app.js` เรียกใช้ฟังก์ชันนี้แทน `JSON.parse` เดิม
- [ ] **Step 4: รัน test ทั้งชุดให้ผ่าน** — Run: `node --test "tests/*.test.js"` · Expected: PASS ทุกข้อ (`seed.test.js` ยอดรวมเดิมไม่เปลี่ยน)
- [ ] **Step 5: Commit** — `git add js tests index.html && git commit -m "feat(store): shelves, QC shelf, audit log, seed v2"`

---

### Task 2: คืนของ — domain

**Files:**
- Create: `js/domain/returns.js` (ย้าย `S.returnItems` ออกจาก store.js มาไว้ที่นี่แล้วเขียนใหม่)
- Test: `tests/returns.test.js` (ใหม่) · แก้ `tests/loop.test.js` ส่วนที่เรียก `returnItems` แบบเดิม

**Interfaces:**
- Consumes: `S._.stockIn`, `S._.openWh`, `S._.reserveForWaiting`, `S.shelves`, `S.qcShelf`, `S.log`
- Produces:
  - `S.returnable(state, userId, q = '') → { req, by: User, lines: { productId, issued, returned, left, cuts: { rollId }[] }[] }[]` เฉพาะใบที่มี `left > 0` เรียงใหม่สุดก่อน ถ้าเป็นวิศวกรเห็นเฉพาะใบของตัวเอง ค้นได้จากชื่องาน, REQ, ชื่อ/ยี่ห้อ/รุ่นของ
  - `S.returnItems(state, { reqId, whId, shelf, note, lines: { productId, qty, condition: 'ok'|'damaged'|'scrap', rollId?, shelf?, photo? }[] }, userId) → ReturnRec`
  - `ReturnRec = { id: 'RT-0001', reqId, whId, byUserId, at, note, lines: { productId, qty, condition, shelf|null, newRollId|null, fromRollId|null, photo|null }[] }` push เข้า `state.returns` · เลขรันจาก `state.seq.ret` (เริ่ม 1)
  - `req.lines[i].scrapped` (ค่าเริ่ม 0) เพิ่มเท่ายอดที่คืนเป็นของเสีย
  - `S.jobUsage(state, jobId) → { productId, issued, returned, scrapped, used }[]` โดย `used = issued − (returned − scrapped)` (Q8)
  - `S.returnHint(state, productId, qty) → { short: boolean, scrapMin: number }` ใช้กับสายม้วนเท่านั้น (Q9)
- กติกา (ตามสเปก 2.5): ตรวจครบทุกบรรทัดก่อน แล้วค่อยลงยอด · `ok` เข้าชั้นที่เลือก (`line.shelf` ทับค่าของทั้งใบได้ = RT-G6) · `damaged` เข้า `S.qcShelf` · `scrap` ไม่เพิ่มยอด · สายม้วนที่ `ok`/`damaged` ได้ม้วนใหม่ `fromRollId = rollId ?? cuts[0].rollId` · `rollId` ต้องเป็นม้วนที่ใบนี้เคยตัด ไม่งั้น throw `เลือกได้เฉพาะม้วนที่ใบเบิกนี้ตัดไป` · วิศวกรที่ไม่ใช่เจ้าของใบ throw `T.FORBIDDEN` · คลังปิดใช้/ล็อก throw ข้อความเดิม · `photo` เก็บเฉพาะ `damaged` · หลังลงยอดเรียก `reserveForWaiting` แล้ว `S.log(..., 'return', rec.id, ...)`

- [ ] **Step 1: เขียน test ที่ fail ก่อน** — 1 test ต่อ AC ตั้งชื่อตามรหัส:

```js
test('RT-AC1 วิศวกรเห็นเฉพาะใบตัวเอง Store เห็นทุกใบ', ...)          // seed เพิ่มใบของ u-head 1 ใบในเทสต์
test('RT-AC2/3/4 คืนได้อีก 3 · พิมพ์ 4 = "คืนได้ไม่เกิน 3 ตัว" · 1.5 = "ตัวต้องเป็นจำนวนเต็ม"', () => {
  // ใบ P-0007 issued 5 returned 2 → returnable left 3
  assert.throws(() => S.returnItems(s, { reqId, whId: 'wh-main', shelf: 'ทั่วไป', lines: [{ productId: 'P-0007', qty: 4, condition: 'ok' }] }, 'u-eng'), /คืนได้ไม่เกิน 3 ใบ/);
  assert.throws(() => S.returnItems(s, { ...base, lines: [{ productId: 'P-0007', qty: 1.5, condition: 'ok' }] }, 'u-eng'), /ใบต้องเป็นจำนวนเต็ม/);
});
test('RT-AC5 คืนทั้งหมดเข้าชั้นที่เลือก และใบหายจากรายการ', ...)
test('RT-AC6 สายม้วน 12.5 m ได้ม้วนใหม่อ้างม้วนเดิม', () => {
  assert.deepEqual([newRoll.length, newRoll.fromRollId, newRoll.shelf], [12.5, 'R-000120', 'ทั่วไป']);
});
test('RT-AC7 เสียหายไปชั้น QC ของเสียไม่เพิ่มยอด ทั้งคู่นับว่าคืนแล้ว', ...)
test('RT-AC8 คลังปิดใช้ = ปฏิเสธ', ...)
test('RT-AC10 ของเข้าแล้วกันให้ใบที่รอ + แจ้งเตือนผู้เบิก', ...)
test('หลายบรรทัด 1 บรรทัดผิด = ไม่ลงยอดเลย', () => {           // Review Focus 2
  const before = JSON.stringify(s.stock) + JSON.stringify(s.rolls);
  assert.throws(() => S.returnItems(s, { ...base, lines: [okLine, { productId: 'P-0011', qty: 0, condition: 'ok' }] }, 'u-store'));
  assert.equal(JSON.stringify(s.stock) + JSON.stringify(s.rolls), before);
});
test('RT-G1 วิศวกรคืนใบของคนอื่นไม่ได้', () => {               // Review Focus 4
  assert.throws(() => S.returnItems(s, { reqId: headReqId, ...rest }, 'u-eng'), /ให้หัวหน้าทำแทน/);
});
test('Q8 jobUsage นับของเสียเป็นยอดใช้', () => {
  // เบิก 10 คืนใช้ได้ 2 คืนของเสีย 1 → used 8
});
test('Q9 returnHint เตือนเศษสั้นกว่า scrapMin', () => {
  assert.deepEqual(S.returnHint(s, 'P-0011', 0.5), { short: true, scrapMin: 3 });
});
```

- [ ] **Step 2: รันให้ fail** — `node --test "tests/*.test.js"` · Expected: FAIL `S.returnable is not a function`
- [ ] **Step 3: ทำ `js/domain/returns.js` ตาม Interfaces** และลบ `S.returnItems` เดิมออกจาก store.js
- [ ] **Step 4: รันให้ผ่านทั้งชุด** · Expected: PASS
- [ ] **Step 5: Commit** — `feat(returns): condition, shelf, QC, roll lineage, owner check, job usage`

---

### Task 3: คืนของไม่มีใบเบิก · กลับรายการคืน · ชั้นรอตรวจ — domain

**Files:**
- Modify: `js/domain/returns.js`
- Test: `tests/returns.test.js`

**Interfaces:**
- Consumes: Task 2
- Produces:
  - `S.returnLoose(state, { productId, whId, shelf, qty, condition, reason, jobId? }, userId) → ReturnRec` (`reqId: null`, `reason`) ใช้ได้เฉพาะ Store/หัวหน้า · `reason` ต้องไม่ว่าง ไม่งั้น throw `กรุณาระบุว่าของมาจากไหน` · ถ้าเป็นสายม้วน `qty` คือความยาว → ได้ม้วนใหม่ (RT-G2)
  - `S.reverseReturn(state, returnId, userId) → ReturnRec` (`reversedAt`, `reversedBy`) เฉพาะหัวหน้า · ถอนยอดที่คืน (ม้วนใหม่ต้องยังอยู่ ยาวเท่าเดิม และยังไม่ถูกเปิด/ตัด · แถวต้องมียอดพอ) ไม่ผ่านให้ throw `ของจากการคืนนี้ถูกใช้ไปแล้ว กลับรายการไม่ได้` · ลดค่า `line.returned`/`scrapped` ในใบเบิกคืน (RT-G7)
  - `S.qcDecide(state, { whId, productId, rollId?, qty, decision: 'restock'|'scrap', shelf?, reason? }, userId)` เฉพาะ Store/หัวหน้า · `restock` ย้ายจาก QC ไปชั้นที่เลือก (ห้ามเลือก QC) · `scrap` ต้องมี `reason` แล้วตัดยอดออก · ลงประวัติ (RT-G4)

- [ ] **Step 1: เขียน test ที่ fail ก่อน**

```js
test('RT-G2 Store คืนของที่ไม่มีใบเบิกได้ วิศวกรทำไม่ได้ ต้องมีเหตุผล', ...)
test('RT-G7 หัวหน้ากลับรายการคืนได้ ยอดกลับเท่าเดิม', ...)
test('กลับรายการคืนหลังม้วนใหม่ถูกตัด = ปฏิเสธ ยอดไม่ติดลบ', () => {   // Review Focus 3
  // คืนสาย 20 m → เบิกตัดม้วนใหม่ 5 m → reverseReturn
  assert.throws(() => S.reverseReturn(s, rec.id, 'u-head'), /ถูกใช้ไปแล้ว/);
  assert.ok(s.rolls.every(r => r.length > 0) && s.stock.every(x => x.qty >= 0));
});
test('RT-G4 qcDecide restock ย้ายไปชั้นปกติ · scrap ต้องมีเหตุผล', ...)
```

- [ ] **Step 2: รันให้ fail** · Expected: FAIL `S.returnLoose is not a function`
- [ ] **Step 3: ทำตาม Interfaces**
- [ ] **Step 4: รันให้ผ่าน** · Expected: PASS
- [ ] **Step 5: Commit** — `feat(returns): loose return, reverse, QC decisions`

---

### Task 4: สแกน (ใช้ร่วมทุกหน้า)

**Files:**
- Create: `js/domain/scan.js` · `js/views/scan.js` (component `scan-button`)
- Modify: `index.html` (โหลดไฟล์) · `css/app.css`
- Test: `tests/scan.test.js`

**Interfaces:**
- Produces:
  - `S.parseScan(state, code) → { kind: 'req'|'roll'|'product'|'job', id } | null` รับ `REQ-…`, `R-…`, `P-…`, `J-…` (ไม่สนตัวพิมพ์และช่องว่าง) และ `vendorCode` ของสินค้าที่ `active`
  - component `<scan-button :kinds="['req','roll']" @found="fn({kind,id})" />` แสดงปุ่ม "สแกน" (ไอคอน + คำ สูง 44px) เมื่อกดเปิด dialog ที่มีช่องพิมพ์รหัสเสมอ ถ้า `'BarcodeDetector' in window` จะมีกล้องด้วย · ถ้าเจอรหัสแต่ไม่ใช่ `kinds` ที่ขอ หรือไม่เจอเลย แสดง `ไม่พบ{ใบเบิก/ม้วน/สินค้า/งาน}จากรหัสนี้` · ปิด dialog ต้องหยุดกล้อง

- [ ] **Step 1: test** — `parseScan` คืนค่าถูกทั้ง 5 แบบ · รหัสสินค้าที่เลิกใช้ = `null` · `' req-690006 '` → `{ kind: 'req', id: 'REQ-690006' }`
- [ ] **Step 2: รันให้ fail** · **Step 3: ทำ** · **Step 4: รันให้ผ่าน**
- [ ] **Step 5: เปิด `index.html` ใน preview** กดปุ่มสแกนแล้วพิมพ์ `REQ-690006` ต้องได้ event · พิมพ์ `XYZ` ต้องเห็นข้อความไม่พบ · ไม่มี error ใน console
- [ ] **Step 6: Commit** — `feat(scan): scan parser and scan dialog`

---

### Task 5: หน้าคืนของ (มือถือทีละขั้น)

**Files:**
- Create: `js/views/returns.js` (แยกออกจาก `orders.js` · route `#/returns` ใช้ view นี้แทนการชี้ไป `orders` ใน `app.js:74`) · `js/views/qc.js` (route `#/qc` เฉพาะ Store/หัวหน้า)
- Modify: `js/views/orders.js` (ลบส่วนคืนของ เหลือปุ่ม "คืนของ" ที่ไป `#/returns?req=ID`) · `js/app.js` (TITLES, nav) · `js/text.js` (ข้อความตาราง 2.6) · `css/app.css`

**Interfaces:**
- Consumes: Task 2-4
- หน้าจอ (ตามสเปก 2.3-2.6 ใช้ข้อความในตาราง 2.6 ตามตัว):
  - **ขั้น 1 ของ**: ช่องค้นหา + `scan-button kinds=['req','roll']` + การ์ดใบเบิก (รูป 3 รายการแรก ชื่องาน วันที่ REQ และ "เบิกโดย …" สำหรับ Store/หัวหน้า) แสดงทีละ 8 ใบ ปุ่ม "ดูเพิ่ม (อีก N ใบเบิก)" · `?req=` เลือกให้ครั้งเดียว **เฉพาะเมื่อใบนั้นอยู่ใน `S.returnable` ของผู้ใช้คนปัจจุบัน** · เลือกแล้วยุบเป็นแถวล็อกพร้อมปุ่ม "แก้ไข" · Store/หัวหน้าเห็นลิงก์ "คืนของที่ไม่มีใบเบิก" ซึ่งเปิดฟอร์ม `returnLoose` (เลือกสินค้า → จำนวน → ที่ไหน → เหตุผล)
  - **ขั้น 2 จำนวนและสภาพ**: แต่ละรายการแสดง "จ่ายไป X · คืนแล้ว Y" + "คืนได้อีก Z" · ช่องจำนวน · ชิปสภาพ 3 ตัว (ใช้ได้ · เสียหาย · ตัดเป็นของเสีย) · "เสียหาย" ถ่ายรูปได้ 1 รูป (`<input type=file accept=image/* capture>` ย่อเหลือ 320px) · สายม้วนมี "ตัดมาจากม้วน" + คำเตือน Q9 ที่มีปุ่ม "เปลี่ยนเป็นของเสีย" · ปุ่ม "คืนทั้งหมด"
  - **ขั้น 3 คืนเข้าคลังไหน**: การ์ดคลังที่เปิดใช้ (ค่าเริ่ม = คลังของใบ ถ้ายังเปิด) + ชิปชั้น (ค่าเริ่ม `ทั่วไป`) · ลิงก์ "แยกชั้นรายการ" เปิดตัวเลือกชั้นต่อบรรทัด (RT-G6) · ถ้ามีของเสียหายให้แสดงข้อความชั้น QC
  - **แถบล่าง**: "จะคืน N รายการ" + ปุ่ม "บันทึกคืนของ" (กดไม่ได้ระหว่างบันทึกรูป)
  - **ผลลัพธ์**: การ์ด "บันทึกคืนของแล้ว" (รายการ · คืน X · สภาพ · เก็บที่ ชั้น · ม้วนใหม่ R-… · ปุ่ม "พิมพ์ป้ายเลขม้วน" ที่เรียก `window.print()` กับป้ายที่จัดหน้าไว้) แล้วกลับไปขั้น 1 · หัวหน้าเห็นปุ่ม "กลับรายการ" ในส่วน "คืนล่าสุด" (5 รายการ)
  - **`#/qc`**: การ์ดของที่อยู่ชั้นรอตรวจแยกตามคลัง ปุ่ม "คืนเข้าชั้น" (เลือกชั้น) / "ตัดทิ้ง" (ต้องใส่เหตุผล) · ลิงก์จากเมนูของ Store/หัวหน้า และจากข้อความเตือนในขั้น 3

- [ ] **Step 1: ทำหน้าจอตามรายการข้างบน**
- [ ] **Step 2: ตรวจใน preview ที่ 390px ทั้งโหมดสว่างและมืด** — เส้นทาง RT-AC5 ต้องจบใน 3 แตะ (การ์ด → คืนทั้งหมด → บันทึก) · ตรวจทุกสถานะในตาราง 2.6 (ว่าง · ค้นไม่เจอ · ดูเพิ่ม · ขั้นล็อก · เกิน · ทศนิยม · สายม้วน · เสียหาย · คลังไม่มีชั้น · สำเร็จ · ระบบปฏิเสธ · คืนล่าสุด · สแกนไม่เจอ · เศษสั้น) · ไม่มี scroll แนวนอน · ไม่มี error ใน console
- [ ] **Step 3: ตรวจ Review Focus 4 บนหน้าจอ** — ในบทบาทหัวหน้าเปิด `#/returns?req=<ใบของหัวหน้า>` แล้วสลับเป็นสมชาย ต้องไม่มีใบถูกเลือก
- [ ] **Step 4: `node --test "tests/*.test.js"` ต้องผ่าน แล้ว commit** — `feat(ui): step-by-step returns page and QC shelf page`

---

### Task 6: สินค้า — domain (สร้าง · แก้ · เลิกใช้ · ต้องอนุมัติ · รูป)

**Files:**
- Create: `js/domain/products.js` (ย้าย `S.createProduct`, `S.similarProducts` มาไว้ที่นี่)
- Modify: `js/store.js` (`S.searchProducts`, `S.categories` ไม่แสดงสินค้าที่ `active === false`)
- Test: `tests/products.test.js` (ใหม่) · `tests/catalog.test.js` (แก้ threshold)

**Interfaces:**
- Produces:
  - `S.similarProducts(state, name)` เกณฑ์ ≥ 35% สูงสุด 5 รายการ (exact มาก่อน)
  - `S.createProduct(state, { name, brand, model, category, unit, isRoll, vendorCode, note, buyUnit, buyFactor, reorderPoint, scrapMin, needsApproval, photos, opening: { whId, shelf, qty|rollLengths } }, userId) → { product, cc, toast }`
    - `category` บังคับ ไม่งั้น throw `กรุณาเลือกหมวดหมู่` · หมวดใหม่ = ใช้สตริงที่พิมพ์ ถ้าซ้ำกับหมวดเดิม (ไม่สนตัวพิมพ์/ช่องว่าง) ให้ใช้ชื่อหมวดเดิม
    - `vendorCode` ซ้ำกับสินค้าอื่นที่ active = throw `บาร์โค้ดนี้เป็นของ {รหัส} {ชื่อ}` (PD-G4)
    - `needsApproval` = `true` ถ้าหมวดอยู่ใน `state.approvalCats` หรือหัวหน้าส่ง `needsApproval: true` (คนอื่นส่งมาให้ถูกเพิกเฉย) (Q4/PD-G5)
    - `photos` วิศวกรใส่ได้ 1 รูป · Store/หัวหน้าใส่ได้ 3 รูป
  - `S.categoryNames(state) → string[]` (จากสินค้าที่ active + หมวดที่ตั้งต้องอนุมัติ)
  - `S.hasHistory(state, productId) → boolean` มีของในคลังใดก็ได้ (รวม QC/ม้วน) หรืออยู่ในใบเบิก/รับ/คืน/CC
  - `S.updateProduct(state, id, patch, userId) → product`
    - Store: แก้ได้เฉพาะ `name, brand, model, vendorCode, note` ถ้าส่ง key อื่นมา throw `T.FORBIDDEN` · วิศวกร: throw `T.FORBIDDEN`
    - ชื่อว่าง throw `กรุณาระบุชื่อสินค้า` · ชื่อซ้ำ throw `ชื่อซ้ำกับ {รหัส}` · บาร์โค้ดซ้ำ throw เหมือนตอนสร้าง
    - เปลี่ยน `unit`/`isRoll` ตอนที่ `S.hasHistory` เป็นจริง throw ข้อความ Q5 (PD-AC10)
    - ลงประวัติเฉพาะ field ที่เปลี่ยน `แก้ {field}: {เดิม} → {ใหม่}`
  - `S.setProductActive(state, id, active, userId)` เฉพาะหัวหน้า · ปิดใช้ได้เมื่อยอดรวมทุกคลัง (รวม QC และม้วน) = 0 ไม่งั้น throw `เลิกใช้ไม่ได้ ยังมีของ {X} {หน่วย}` (Q6)
  - `S.setCategoryApproval(state, category, on, userId)` เฉพาะหัวหน้า ติ๊ก `needsApproval` ให้สินค้าทุกตัวในหมวดนั้นตามไปด้วย
  - `S.addPhoto(state, id, dataUrl, userId)` / `S.removePhoto(state, id, index, userId)` · รูปแรกใครก็เพิ่มได้ · รูปที่ 2-3 / เปลี่ยน / ลบ เฉพาะ Store/หัวหน้า (ใช้ข้อความในตาราง 3.6) · ไม่เกิน 3 รูป

- [ ] **Step 1: test 1 ข้อต่อ AC** — `PD-AC1` (สร้างแล้วใช้ได้ทันที) · `PD-AC2` (ไม่มีหมวด = throw) · `PD-AC3` (ชื่อเดียวกันตัวพิมพ์ต่าง = throw `มีสินค้าชื่อนี้แล้ว`) · `PD-AC4` (คล้าย ≥ 35% ได้รายการ ไม่ throw) · `PD-AC6` (หมวดซ้ำตัวพิมพ์ต่าง = ใช้หมวดเดิม) · `PD-AC7` (วิศวกรส่ง 2 รูป = throw) · `PD-AC8` (ติ๊กต้องอนุมัติแล้ว `needsApproval` เป็น true) · `PD-AC9` (วิศวกร updateProduct = throw แต่ addPhoto รูปแรกได้) · `PD-AC10` (P-0004 มีของ → เปลี่ยนหน่วย = throw Q5) · `Q6` (P-0004 เลิกใช้ไม่ได้ · สินค้าใหม่ยอด 0 เลิกใช้ได้และหายจาก `searchProducts`) · `Q7` (Store แก้ชื่อได้ แต่แก้หมวดไม่ได้) · `PD-G4` (บาร์โค้ดซ้ำ = throw) · `Q4` (หมวดที่ตั้งต้องอนุมัติ สินค้าใหม่ในหมวดนั้นติ๊กเอง)
- [ ] **Step 2: รันให้ fail** · **Step 3: ทำ** · **Step 4: รันทั้งชุดให้ผ่าน**
- [ ] **Step 5: Commit** — `feat(products): edit rules, deactivate, approval by category, photos, barcode`

---

### Task 7: หน้าสินค้า + กล่องสร้าง/แก้ (มือถือ)

**Files:**
- Modify: `js/views/shop.js` (กล่องสร้างสินค้า) · `js/app.js` (route `#/products` เมนู "สินค้า" เห็นได้ทุกบทบาท แต่ปุ่มแก้ขึ้นตามสิทธิ์) · `js/text.js`
- Create: `js/views/products.js` (รายการ + แผ่นแก้ + รายละเอียดรูป)

**Interfaces:**
- Consumes: Task 4, 6
- หน้าจอ:
  - **กล่องสร้าง** (เปิดจากช่องค้นหา "ไม่พบ … สร้างเลย" / "+ สร้างสินค้าใหม่" / หน้ารับของ "สินค้าไม่มีรหัส" / หน้าสินค้า "เพิ่มสินค้า"): ลำดับช่องตามตาราง 3.3 · หมวดเป็นชิปให้เลือก + "+ สร้างหมวดใหม่" · หน่วยเป็นชิป (เมตร ตัว ชิ้น ใบ กล่อง ถุง อื่น ๆ) · สวิตช์สายม้วนล็อกหน่วยเป็นเมตร · ช่องบาร์โค้ดมี `scan-button kinds=[]` ซึ่งใช้ค่าที่สแกนได้มาเติมช่อง · หัวหน้าเห็นสวิตช์ "ต้องให้หัวหน้าอนุมัติเมื่อยอดเปลี่ยน" · ท้ายกล่องมีบรรทัด "ยังขาด: …" ตามลำดับ ชื่อ · หมวด · หน่วย · กล่องแดง (ซ้ำ) และกล่องเหลือง (คล้าย พร้อมรูปและ %) มีปุ่ม "ใช้รายการนี้" เมื่อเปิดจากช่องค้นหา · ข้อความสำเร็จและสำเร็จบางส่วนตามตาราง 3.6 · ปิดกล่องแล้วทิ้งรูป
  - **ทางสร้างหลักต้องไม่เกิน 5 แตะ** ตาม 3.4 (สร้างเลย → หมวด → หน่วย → สร้าง)
  - **`#/products`**: ช่องค้นหา (ใช้ `S.searchProducts`) + `scan-button kinds=['product']` + ชิปหมวด + ชิป "ยังไม่มีรูป (N)" · "ต้องอนุมัติ" · "เลิกใช้แล้ว" (เฉพาะหัวหน้า) · การ์ดสินค้า (รูป ชื่อ รหัส ยอดรวม ป้าย) (PD-G6)
  - **แผ่นแก้** (bottom sheet บนมือถือ): ใช้ตัวเลือกแบบเดียวกับกล่องสร้าง · field ที่ผู้ใช้แก้ไม่ได้แสดงเป็นค่าอ่านอย่างเดียวพร้อมเหตุผลสั้น ๆ (`หัวหน้าเท่านั้น` / ข้อความ Q5) · มีสวิตช์สายม้วน (ล็อกตาม Q5) · ปุ่ม "เลิกใช้สินค้า" (หัวหน้า) ซึ่งเปิดกล่องยืนยันก่อน · ปุ่ม "ลงยอดที่เจอเพิ่ม" (ไป Task 12) · ส่วน "ประวัติ" จาก `S.auditFor`
  - **หมวด**: ในหน้าสินค้าหัวหน้ามีรายการหมวดพร้อมสวิตช์ "ต้องอนุมัติ" ต่อหมวด
  - **รายละเอียดรูป**: แตะรูปเล็กแล้วเปิดรูปใหญ่ 3 ช่อง ปุ่มเพิ่ม/เปลี่ยน/ลบตามสิทธิ์
- [ ] **Step 1: ทำหน้าจอ**
- [ ] **Step 2: ตรวจใน preview 390px สว่าง/มืด** — ทุกสถานะในตาราง 3.6 รวม 3 แถวที่ "ยังไม่มีใน mock" · PD-AC1 นับแตะ · PD-AC5 เปิด/ปิดสวิตช์สายม้วนแล้วหน่วยกลับเป็นค่าเดิม · สลับ 3 บทบาทแล้วปุ่มแก้ต้องตรงกับ Q7
- [ ] **Step 3: test ผ่าน แล้ว commit** — `feat(ui): product list, edit sheet, create dialog rules`

---

### Task 8: งาน — domain (สร้าง · ปิด · เปิดใหม่ · ปิด/ยกเลิกใบเบิก)

**Files:**
- Create: `js/domain/jobs.js` (ย้าย `S.similarJobs`, `S.createJob` มาไว้ที่นี่)
- Test: `tests/jobs.test.js`

**Interfaces:**
- Consumes: `S.jobUsage` (Task 2), `S.log`
- Produces:
  - `S.similarJobs(state, name) → { job, pct }[]` เกณฑ์ ≥ 45% และชื่อ ≥ 3 ตัวอักษร · รวมงานที่ปิดแล้ว (กล่องเต็มแสดงสถานะ) · ส่วนชิปในหน้าเบิกกรองเฉพาะ `job.open` เอง
  - `S.createJob(state, { name, customer, site, ownerId, start, due, note }, userId) → job` · รหัส `J-{YY}-{NNN}` โดย YY = ปี ค.ศ. 2 หลักของวันที่สร้าง และ NNN รันต่อปี · ชื่อซ้ำตรงตัว (ไม่สนตัวพิมพ์/ช่องว่าง) throw `มีงานชื่อนี้แล้ว: {รหัส}` (JB-G5) · `due < start` throw `กำหนดเสร็จต้องไม่ก่อนวันเริ่ม` · `ownerId` ค่าเริ่ม = userId · `start` ค่าเริ่ม = วันนี้
  - `S.updateJob(state, id, patch, userId)` ใช้กติกาเดียวกับตอนสร้าง
  - `S.openReqsOf(state, jobId) → req[]` ใบที่สถานะ `pending|waiting|partial|ready|pick_failed`
  - `S.closeJobCheck(state, jobId) → { openReqs: string[], unreturned: { productId, qty }[], openPRs: string[] }` โดย `openPRs` คือรายการต้องซื้อ `status === 'open' && received === 0` ของใบเบิกในงานนี้
  - `S.closeJob(state, jobId, userId, { cancelPRs = true } = {})` ถ้ามี `openReqs` throw `ยังมีใบเบิกที่ไม่ปิด {REQ-…, …} — ปิดหรือยกเลิกก่อนปิดงาน` · ตั้ง `open=false`, `closedAt=วันนี้`, ถ้าไม่มี `due` ให้ `due=วันนี้` · `cancelPRs` → PR เหล่านั้นเป็น `cancelled` · ลงประวัติว่าใครปิด (JB-G6)
  - `S.reopenJob(state, jobId, userId)` · `S.cloneJob(state, jobId, userId) → job` (ชื่อ + " (ใหม่)" และคัดลอก ลูกค้า ไซต์ ผู้รับผิดชอบ)
  - `S.closeReq(state, reqId, userId, { cancelPRs = true })` ใบที่จ่ายบางส่วนแล้ว → `closed` ปล่อยของที่กันไว้ (`reserved = 0`) · `S.cancelReq(state, reqId, userId, { cancelPRs = true })` ใบที่ยังไม่จ่าย → `cancelled` · ถ้าส่งสถานะผิดให้ throw `ใบนี้{ปิด/ยกเลิก}ไม่ได้`
  - หน้าเบิก (`S.issueNow`) ต้องปฏิเสธงานที่ปิดแล้วด้วยข้อความ `งาน {J-…} ปิดไปแล้ว เบิกเพิ่มไม่ได้ (เปิดงานอีกครั้งที่หน้างาน)`
- [ ] **Step 1: test 1 ข้อต่อ AC** — `JB-AC1..AC9` ตามสเปก 4.7 (AC9 ตรวจ `closeJobCheck` ว่าได้ `unreturned` และ `openPRs` ถูก และ `cancelPRs:false` ทำให้ PR ยังเปิด) · `JB-G5` ชื่อซ้ำ/วันที่ผิด · `closeReq` ปล่อยของที่กันไว้ทำให้ `S.available` เพิ่ม
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: Commit** — `feat(jobs): close checks, reopen, clone, close/cancel requisition`

---

### Task 9: หน้างาน (มือถือ)

**Files:**
- Create: `js/views/jobs.js` (route `#/jobs`, `#/jobs/:id`)
- Modify: `js/app.js` (เมนู "งาน" ให้ทุกบทบาท = JB-AC10) · `js/views/cart.js` (กล่อง "เพิ่มงานใหม่" แสดงคล้าย/ซ้ำตาม Task 8) · `js/views/orders.js` (ชื่องานในรายละเอียดใบเบิกเป็นลิงก์ไป `#/jobs/:id` + ปุ่ม "ปิดใบเบิก" / "ยกเลิก")

**Interfaces:**
- Consumes: Task 4, 8
- หน้าจอ:
  - **รายการ**: แท็บ "เปิดอยู่ / ปิดแล้ว" · ช่องค้นหา · `scan-button kinds=['job']` · การ์ดงาน (รหัส ชื่อ ลูกค้า/ไซต์ ผู้รับผิดชอบ และ "ใบเบิก N (M ค้าง)" ที่ใช้สีส้ม + คำ) · ปุ่ม "+ เพิ่มงาน" เปิดกล่องเต็มตามตาราง 4.3 พร้อมบอกรหัสที่จะได้ก่อนบันทึก
  - **รายละเอียด** (`#/jobs/:id`): ตารางยอดใช้ (สินค้า · เบิก · คืน · ใช้จริง พร้อมหน่วย) จาก `S.jobUsage` · รายการใบเบิกพร้อมปุ่ม ปิดใบเบิก/ยกเลิก · ปุ่ม "ส่งออก Excel" ที่ดาวน์โหลด CSV (มี BOM `﻿` เพื่อให้ Excel อ่านภาษาไทยได้) · ปุ่ม "ปิดงาน" (ปุ่มเต็ม ไม่ใช่ลิงก์แดง) · "เปิดงานอีกครั้ง" · "เปิดงานใหม่จากงานนี้" · ส่วนประวัติ
  - **กล่องยืนยันปิดงาน** (JB-G4/AC9): แสดง "ยังมีของที่เบิกไปแต่ยังไม่คืน N รายการ" (รายการพร้อมจำนวน) · checkbox "ยกเลิกรายการต้องซื้อที่ยังไม่ได้ของ (N)" ติ๊กไว้เป็นค่าเริ่ม · ถ้ามีใบเบิกค้าง ไม่ให้ยืนยัน และแสดงข้อความแดงพร้อมลิงก์ไปแต่ละใบ
  - ข้อความทุกสถานะในตาราง 4.6
- [ ] **Step 1: ทำ** · **Step 2: ตรวจใน preview 390px สว่าง/มืด** — JB-AC10: จากหน้าแรกถึงรายการงานไม่เกิน 2 แตะ · JB-AC4/5/7 ทำบนหน้าจอได้ · ไฟล์ CSV เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน
- [ ] **Step 3: test ผ่าน แล้ว commit** — `feat(ui): jobs list, detail, close confirmation`

---

### Task 10: รับของเข้า — domain

**Files:**
- Create: `js/domain/receiving.js` (ใช้แทน `S.receiveStock` · เก็บ `S.receiveStock` ไว้เป็น wrapper บรรทัดเดียวที่เรียก `S.receive` เพื่อให้ `restock.js`/test เดิมใช้ได้จนกว่า Task 11 จะเปลี่ยน)
- Test: `tests/receiving.test.js` · แก้ `tests/loop.test.js` ที่พึ่งกติการับเกินแบบเงียบ

**Interfaces:**
- Consumes: `S._.stockIn`, `S._.reserveForWaiting`, `S._.createPR`
- Produces:
  - `S.receive(state, { whId, shelf = 'ทั่วไป', invoiceNo, vendor, receivedAt, note, overReason, lines: { productId, prId?, qty?, unit?: 'base'|'buy', rollLengths?, batch?, shelf?, condition?: 'ok'|'damaged'|'reject' }[] }, userId) → { receipt, readied, rolls }`
  - `Receipt = { id: 'RC-690001', whId, byUserId, at, invoiceNo, vendor, receivedAt, note, overReason, lines: { productId, prId, qty(หน่วยหลัก), shelf, condition, rollIds }[] }` push เข้า `state.receipts` · เลขรันจาก `state.seq.rc` (เริ่ม 690001)
  - กติกา: ตรวจครบทุกบรรทัดก่อนลงยอด · `unit:'buy'` คูณ `buyFactor` ก่อนตรวจจำนวนเต็ม (RC-AC4) · ไม่ใช่เมตร = จำนวนเต็ม (RC-AC9) · แถวม้วนที่ยาว 0 ให้ข้าม แต่ถ้าทั้งบรรทัดไม่มีม้วนเลยให้ throw · ทุกบรรทัดเป็น 0 throw `ยังไม่ได้กรอกจำนวนที่รับ` (RC-AC6) · บรรทัดที่ `qty > ค้างรับของ PR` และไม่มี `overReason` throw `รับเกินที่สั่ง {X} {หน่วย} ใส่เหตุผล` (Q1/RC-AC8) · บรรทัดที่ไม่มี `prId` → สร้าง PR `noPr: true` (Q1b/RC-G2) · `prId` ต้องเป็นคลังเดียวกัน · สินค้าเลิกใช้ throw `{ชื่อ} เลิกใช้แล้ว รับของเข้าไม่ได้` · `damaged` → ชั้น QC · `reject` → ไม่ลงยอด แต่บันทึกในใบรับและไม่นับเป็นยอดรับของ PR (RC-G8) · `line.shelf` ทับค่าทั้งใบ (RC-G5) · `batch` ติดไปกับม้วน · "ต้องอนุมัติ" ไม่มีผลกับการรับของ · ลงประวัติ
  - `S.outstanding(state, prId) → number` (`qty − received`)
- [ ] **Step 1: test 1 ข้อต่อ AC** — `RC-AC1..AC9` (AC5 ใช้ notify เดิม) · `RC-G2` ไม่มี PR · `RC-G8` reject/damaged · `RC-G5` ชั้นต่อบรรทัด · หลายบรรทัดที่มี 1 บรรทัดผิด = ไม่ลงยอดเลย (Review Focus 2)
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: Commit** — `feat(receive): receipt doc, over-receive reason, no-PR, damaged/reject, per-line shelf`

---

### Task 11: หน้ารับของเข้า (มือถือทีละขั้น)

**Files:**
- Modify: `js/views/restock.js` (เขียนส่วนรับของใหม่ทั้งหมด · แท็บ "ต้องซื้อ" และ "ใกล้หมด" เก็บไว้) · `js/text.js` (ข้อความในตาราง 5A.6 ที่มีศัพท์ต้องเขียนใหม่: `ใบรับ RC-… บันทึกแล้ว ระบบกันของไว้ให้ใบเบิกที่รออยู่ และแจ้งผู้เบิกแล้ว`)

**Interfaces:**
- Consumes: Task 4, 10, กล่องสร้างสินค้า (Task 7)
- หน้าจอ:
  - **ขั้น 1 ของ**: การ์ดรายการต้องซื้อที่ยังไม่รับครบ (รูป ชื่อ "สั่ง X · รับแล้ว Y" "ค้างรับ Z") เลือกได้หลายใบ · `scan-button kinds=['product']` ที่ใช้เลือกการ์ดของสินค้านั้น ถ้าไม่มีการ์ดให้เพิ่มเป็นบรรทัดแบบไม่มีใบขอซื้อ · ปุ่ม "ของมาส่งโดยไม่มีใบขอซื้อ" (ค้นสินค้า / "สินค้าไม่มีรหัส" เปิดกล่องสร้าง) · ลบปุ่มเดโม "สร้างแบบเร็ว" · มาจากปุ่ม "รับของเข้า" ของแท็บต้องซื้อหรือ `?pr=` ให้เลือกไว้แล้วและเปิดขั้น 2 เลย
  - **ขั้น 2 จำนวน**: ค่าเริ่ม = ค้างรับ · สลับหน่วยหลัก/หน่วยตอนสั่งซื้อ พร้อม "= X {หน่วย}" (ใต้ "ข้อมูลเพิ่มเติม") · สายม้วนแสดงแถวม้วน (จำนวนม้วน = ค้างรับ ÷ ขนาดม้วน) แก้/ลบ/เพิ่มได้ และมีช่อง "ล็อตผู้ผลิต" · ชิปสภาพ "ครบดี / ชำรุด / ส่งคืนผู้ขาย" · คำเตือน "รับไม่ครบ — รายการต้องซื้อจะยังเปิดค้างไว้" · คำเตือนรับเกิน + ช่องเหตุผล
  - **ขั้น 3 ที่ไหน**: การ์ดคลัง (ไม่แสดงคลังที่ปิดใช้ · คลังที่ล็อกนับแสดงเป็นแถบล็อกพร้อมข้อความ) + ชิปชั้น ค่าเริ่ม `ทั่วไป` · "แยกชั้นรายการ" · ส่วน "ข้อมูลใบส่งของ" (พับไว้): เลขใบส่งของ/ใบกำกับ · ผู้ขาย · วันที่รับ (ค่าเริ่มวันนี้) · หมายเหตุ (RC-G3)
  - **แถบล่าง**: "จะรับ N รายการ" + ปุ่ม "ยืนยันรับของเข้า"
  - **ผลลัพธ์**: เลขใบรับ · ม้วนที่สร้าง · เตือนพิมพ์ฉลาก QR · ปุ่ม "พิมพ์ป้ายเลขม้วน / ฉลาก QR" · ใบขอซื้อที่ยังรับไม่ครบเปิดค้างไว้ให้รับต่อ · ส่วน "รับเข้าล่าสุด" 8 รายการ
  - เส้นทาง "ของมาครบตามใบ ชั้นเดิม" จากปุ่ม "รับของเข้า" = 2 แตะ
- [ ] **Step 1: ทำ** · **Step 2: ตรวจใน preview 390px สว่าง/มืด** — ทุกสถานะในตาราง 5A.6 · ฉาก 1 ใน README ยังเดินได้ครบ · ไม่มีคำต้องห้ามในหน้า (ใช้ `get_page_text` แล้ว grep หาคำ `ledger|จอง|batch|PR-` ในส่วนหลัก)
- [ ] **Step 3: test ผ่าน แล้ว commit** — `feat(ui): step-by-step receive page`

---

### Task 12: ยอดตั้งต้น — domain (ต้องอนุมัติ · สินค้าเดิม · นำเข้า CSV)

**Files:**
- Create: `js/domain/opening.js` (ย้าย `S.confirmCC` มาไว้ที่นี่ แล้วเขียน `createProduct.opening` ใหม่ให้เรียกที่นี่)
- Test: `tests/opening.test.js` · แก้ test เดิมของ CC

**Interfaces:**
- Consumes: `S._.stockIn`, `S._.reserveForWaiting`, `S._.ensurePRs`
- Produces:
  - `CC = { id: 'CC-0008', productId, whId, shelf, qty|rollLengths, byUserId, stage: 'store'|'head'|'done'|'rejected', reason, kind: 'opening'|'found' }`
  - `S.submitOpening(state, { productId, whId, shelf = 'ทั่วไป', qty|rollLengths, kind }, userId) → { cc|null, toast }` ตามตาราง 5B.5:
    - Store/หัวหน้า + สินค้าไม่ต้องอนุมัติ → ลงยอดทันที (`cc = null`) · Store + ต้องอนุมัติ → `stage:'head'` · หัวหน้า + ต้องอนุมัติ → ลงยอดทันที (หัวหน้าคืออนุมัติเอง)
    - วิศวกร → `stage:'store'`
    - toast 3 แบบตามตาราง 5B.6 (`… เข้าคลังแล้ว` / `… ส่งให้ Store ยืนยันยอด (CC-…)` / `… รอหัวหน้าอนุมัติยอด (CC-…)`)
  - `S.confirmCC(state, ccId, userId, ok, reason = '')` stage `store`: เฉพาะ Store/หัวหน้า · ok + ต้องอนุมัติ → `stage:'head'` และแจ้งหัวหน้า · ok + ไม่ต้องอนุมัติ → ลงยอด · stage `head`: เฉพาะหัวหน้า · ไม่ ok ต้องมีเหตุผล (กติกาเดิม: แจ้งผู้ส่งและสร้างรายการต้องซื้อให้ใบที่รอ)
  - `S.approvalItems(state, userId) → { reqs: req[], ccs: CC[] }` · หัวหน้าเห็นทุกอย่าง · Store เห็นเฉพาะ CC `stage:'store'` · วิศวกรเห็นว่างเปล่า (Q7b/OS-AC9)
  - `S.pendingOpening(state, productId, whId) → number` ยอดที่รอ ใช้ในการ์ดคลังของหน้าเบิก (แทน `pendingCC` เดิม)
  - `S.parseOpeningCsv(state, text) → { rows: { line, code, whId, shelf, qty, rollNo, rollInitial, batch, errors: string[] }[] }` หัวคอลัมน์ `code,warehouse,location,qty,roll_no,roll_initial,batch` · ข้อความผิดตามสเปก 5B.3 + `{หน่วย}ต้องเป็นจำนวนเต็ม` + `{คลัง} ปิดใช้งานอยู่` (OS-G4) · `warehouse` จับคู่ได้ทั้ง id และชื่อ
  - `S.importOpening(state, rows, userId)` เฉพาะหัวหน้า · ถ้ามีแถวผิดแม้แถวเดียว throw `ตัดแถวที่ผิดก่อน` · ถ้า `openingLocked` throw `ยอดยกมาถูกล็อกแล้ว — ตรวจสอบไฟล์ได้ แต่นำเข้าได้หลังปลดล็อก` · แถวของสินค้าที่ต้องอนุมัติก็ลงทันทีได้ เพราะคนนำเข้าคือหัวหน้า · `S.setOpeningLock(state, on, userId)`
- [ ] **Step 1: test 1 ข้อต่อ AC** — `OS-AC1..AC8` · `OS-AC9` (`approvalItems` ของ Store มีแต่ CC และไม่มีใบเบิกรออนุมัติ) · `OS-G2` (`kind:'found'` ของ P-0004 จาก Store เข้าทันที) · `OS-G3` (เลือกชั้น A-02 ได้) · CSV: แถวหน่วย "ตัว" ที่ใส่ 2.5 ผิด · แถวคลังที่ล็อกผิด · ไฟล์ที่มีแถวซ้ำได้ "ข้อมูลซ้ำในไฟล์"
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: Commit** — `feat(opening): approval stages, found stock, CSV opening import`

---

### Task 13: หน้ายอดตั้งต้น · อนุมัติของ Store · นำเข้า

**Files:**
- Modify: `js/views/shop.js` (ส่วน "มีของนี้อยู่ในคลังแล้ว" ในกล่องสร้าง เรียงลำดับ **จำนวน → คลัง → ชั้น** · ข้อความบอกล่วงหน้า 3 แบบรวมกรณีต้องอนุมัติ = OS-G5) · `js/views/approvals.js` (ใช้ `S.approvalItems` · Store เข้าได้) · `js/app.js` (เมนู "อนุมัติ" ให้ Store เห็นเมื่อมีรายการ + ป้ายตัวเลข · หน้าแรก/ร้านแสดงแถบ "มียอดรอคุณยืนยัน N รายการ" แตะแล้วไป `#/approvals` = 2 แตะ)
- Create: `js/views/opening.js` (route `#/opening` เฉพาะหัวหน้า) · ฟอร์ม "ลงยอดที่เจอเพิ่ม" ในแผ่นแก้สินค้า (Task 7) ใช้ `S.submitOpening kind:'found'`

**Interfaces:**
- Consumes: Task 7, 12
- หน้าจอ:
  - **อนุมัติ (Store)**: การ์ด CC (รูป ชื่อ จำนวน คลัง ชั้น ผู้ส่ง) ปุ่ม "ยืนยันยอด" / "ไม่มีของ" · "ไม่มีของ" ต้องใส่ "เหตุผล (จะแจ้งผู้ขอ)" ก่อนกดได้ · ถ้าสินค้าต้องอนุมัติ แสดง "สินค้านี้ต้องให้หัวหน้าอนุมัติต่อ"
  - **`#/opening`**: `<input type=file accept=".csv">` + ลิงก์ดาวน์โหลดไฟล์ตัวอย่าง · ผลตรวจเป็นการ์ดต่อแถว ("ผ่าน" / ข้อความผิด) ไม่ใช้ตารางกว้าง · ปุ่ม "ตัดแถวที่ผิด (N)" · "นำเข้ายอดยกมา" · สวิตช์ล็อก/ปลดล็อก · ข้อความสำเร็จ "นำเข้ายอดยกมาแล้ว"
- [ ] **Step 1: ทำ** · **Step 2: ตรวจใน preview 390px สว่าง/มืด** — ฉาก 4 ใน README (วิศวกรสร้างของ → Store ยืนยัน) ไม่เจอ "ไม่มีสิทธิ์" · แตะจากแจ้งเตือนถึงปุ่มยืนยันไม่เกิน 2 แตะ · นำเข้า CSV ตัวอย่างที่มี 1 แถวผิดตาม OS-AC8
- [ ] **Step 3: test ผ่าน แล้ว commit** — `feat(ui): store confirmations, opening balance order, CSV import page`

---

### Task 14: ประวัติ · ข้อความ · README · ตรวจรวม

**Files:**
- Create: `js/views/history.js` (route `#/history` เฉพาะหัวหน้า: รายการ `state.audit` ล่าสุดก่อน กรองตามผู้ใช้/การกระทำ)
- Modify: `js/text.js` (ทุกข้อความที่มี `T.FORBIDDEN` แบบเก่า) · `README.md` (สคริปต์เดโมเพิ่มฉาก 6-9: คืนของเสียหาย → ชั้นรอตรวจ · แก้สินค้า/เลิกใช้ · ปิดงานพร้อมกล่องยืนยัน · รับของเกิน + ไม่มีใบขอซื้อ · และตาราง "ต่างจาก requirement" ใส่การตัดสินใจ Q1-Q9 และการใช้ CSV แทน xlsx)
- [ ] **Step 1: ทำ**
- [ ] **Step 2: รัน `node --test "tests/*.test.js"`** · Expected: PASS ทั้งหมด
- [ ] **Step 3: ตรวจรวมใน preview** — เดินสคริปต์เดโมทุกฉากใน 3 บทบาท ที่ 390px และ 1280px ทั้งสว่างและมืด · ไม่มี error ใน console · ใช้ ux-ui-audit probe วัด tap target ≥ 44px และ contrast ของหน้าใหม่ 5 หน้า
- [ ] **Step 4: Commit** — `docs: demo scenes for core screens; feat(ui): audit history`

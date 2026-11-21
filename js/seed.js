var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// ข้อมูลตัวอย่างตามสเปกหัวข้อ 0.5 (ยอดรวมทุกคลังต้องตรงสเปก — tests/seed.test.js ตรวจ)
SM.seed = function () {
  const P = (id, name, brand, model, unit, isRoll, category, img, reorderPoint = 0) =>
    ({ id, name, brand, model, unit, isRoll, category, img: 'img/products/' + img, reorderPoint, scrapMin: isRoll ? 3 : 0,
      active: true, needsApproval: id === 'P-0008', vendorCode: '', note: '', buyUnit: unit, buyFactor: 1, photos: [] });
  const SH = (c01Off) => ['ทั่วไป', 'A-01', 'A-02', 'A-03', 'B-01', 'B-02', 'B-03', 'C-01', 'QC']
    .map(code => ({ code, active: !(c01Off && code === 'C-01'), ...(code === 'QC' ? { qc: true } : {}) }));
  const R = (n, productId, whId, length, shelf = 'A-01') =>
    ({ id: 'R-' + String(n).padStart(6, '0'), productId, whId, shelf, length, opened: false });
  const K = (productId, whId, qty, shelf = 'ทั่วไป') => ({ productId, whId, qty, shelf });

  return {
    v: 2,
    currentUserId: 'u-eng',
    settings: { reqApproval: false, demoPickFail: false, openingLocked: false },
    users: [
      { id: 'u-eng', name: 'สมชาย ใจดี', role: 'engineer' },
      { id: 'u-store', name: 'ก้องภพ แสงทอง', role: 'store' },
      { id: 'u-head', name: 'อรุณ รัตนชัย', role: 'head' },
    ],
    products: [
      P('P-0011', 'สายไฟ THW 1.5 sq.mm สีดำ', 'Thai Yazaki', 'THW 1x1.5 sq.mm', 'm', true, 'สายไฟ', 'cable-roll.svg'),
      P('P-0012', 'สายไฟ THW 1.5 sq.mm สีแดง', 'Thai Yazaki', 'THW 1x1.5 sq.mm', 'm', true, 'สายไฟ', 'cable-roll.svg'),
      P('P-0015', 'สายไฟ THW 2.5 sq.mm สีเขียว-เหลือง', 'Yazaki', 'THW 1x2.5 sq.mm', 'm', true, 'สายไฟ', 'cable-roll.svg'),
      P('P-0016', 'สายไฟ THW 4 sq.mm สีดำ', 'Phelps Dodge', 'THW 1x4 sq.mm', 'm', true, 'สายไฟ', 'cable-roll.svg'),
      P('P-0017', 'สายไฟ VAF 2x1.5 sq.mm', 'Bangkok Cable', 'VAF 2x1.5 sq.mm (แบนคู่)', 'm', true, 'สายไฟ', 'cable-flat.svg'),
      P('P-0018', 'สายไฟ VCT 4x2.5 sq.mm', 'Bangkok Cable', 'VCT 4x2.5 sq.mm', 'm', true, 'สายไฟ', 'cable-multicore.svg'),
      P('P-0008', 'สายแลน CAT6 UTP', 'Link', 'US-9106 CAT6 305 ม./กล่อง', 'm', true, 'สายสื่อสาร', 'lan-cable.svg'),
      P('P-0004', 'เบรกเกอร์ลูกย่อย 1P 16A', 'Schneider', 'EZ9 1P 16A 6kA', 'ตัว', false, 'อุปกรณ์ไฟฟ้า', 'breaker.svg', 40),
      P('P-0005', 'ท่อ EMT 1/2 นิ้ว', '', '', 'เส้น', false, 'ท่อและราง', 'conduit.svg'),
      P('P-0007', 'กล่องพักสาย 4x4 นิ้ว', '', '', 'ใบ', false, 'อุปกรณ์ไฟฟ้า', 'junction-box.svg'),
      P('P-0009', 'เคเบิ้ลไทร์ 8 นิ้ว (ถุง 100 เส้น)', '', '', 'ถุง', false, 'วัสดุสิ้นเปลือง', 'cable-ties.svg'),
      P('P-0006', 'เทปพันสายไฟ 3M', '3M', 'Temflex 1700 กว้าง 3/4 นิ้ว ยาว 10 ม.', 'ม้วน', false, 'วัสดุสิ้นเปลือง', 'electrical-tape.svg'),
    ],
    warehouses: [
      { id: 'wh-main', name: 'คลังหลัก', site: 'บางนา กรุงเทพฯ', locked: false, shelves: SH(0) },
      { id: 'wh-a', name: 'คลังไซต์งาน A', site: 'มาบตาพุด ระยอง', locked: false, shelves: SH(0) },
      { id: 'wh-b', name: 'คลังไซต์งาน B', site: 'อมตะซิตี้ ชลบุรี', locked: false, shelves: SH(1) },
      { id: 'wh-c', name: 'คลังไซต์งาน C', site: 'กำลังนับสต็อก', locked: true, shelves: SH(0) },
    ],
    stock: [
      K('P-0004', 'wh-main', 30, 'B-02'),
      K('P-0005', 'wh-main', 80, 'C-01'), K('P-0005', 'wh-a', 50),
      K('P-0007', 'wh-main', 54, 'B-01'), K('P-0007', 'wh-a', 20),
      K('P-0009', 'wh-main', 15, 'B-03'), K('P-0009', 'wh-b', 10),
      K('P-0006', 'wh-main', 20, 'B-03'), K('P-0006', 'wh-a', 10), K('P-0006', 'wh-b', 6),
    ],
    rolls: [
      R(144, 'P-0008', 'wh-main', 305, 'A-03'), R(145, 'P-0008', 'wh-main', 305, 'A-03'),
      R(146, 'P-0008', 'wh-b', 305, 'ทั่วไป'), R(147, 'P-0008', 'wh-b', 305, 'ทั่วไป'),
      R(152, 'P-0011', 'wh-a', 60, 'ทั่วไป'),
      R(153, 'P-0012', 'wh-main', 100),
      R(154, 'P-0015', 'wh-main', 90, 'A-02'), R(155, 'P-0015', 'wh-b', 45, 'ทั่วไป'),
      R(156, 'P-0016', 'wh-a', 100, 'ทั่วไป'),
      R(157, 'P-0018', 'wh-main', 50, 'A-02'),
      R(160, 'P-0011', 'wh-main', 100),
    ],
    jobs: [
      { id: 'J-25-010', name: 'ไซต์งาน A เฟส 2', customer: 'บจก. มาบตาพุด เคมิคอล', open: true, ownerId: 'u-eng', site: '', start: '2026-11-01', due: null, closedAt: null, note: '' },
      { id: 'J-25-002', name: 'ซ่อมบำรุงประจำปี', customer: 'ภายในบริษัท', open: true, ownerId: 'u-eng', site: '', start: '2026-11-01', due: null, closedAt: null, note: '' },
      { id: 'J-24-045', name: 'เดินสาย LAN โรงงาน B', customer: 'บจก. อมตะ พาร์ทส์', open: true, ownerId: 'u-eng', site: '', start: '2026-11-01', due: null, closedAt: null, note: '' },
      { id: 'J-24-012', name: 'ติดตั้งตู้ MDB อาคารสำนักงานใหญ่', customer: 'บจก. สยามพร็อพเพอร์ตี้', open: true, ownerId: 'u-eng', site: '', start: '2026-11-01', due: null, closedAt: null, note: '' },
      { id: 'J-24-031', name: 'ติดตั้งระบบไฟฟ้า อาคาร A โครงการริเวอร์ไซด์', customer: 'บจก. ริเวอร์ไซด์ ดีเวลลอปเมนท์', open: true, ownerId: 'u-eng', site: '', start: '2026-11-01', due: null, closedAt: null, note: '' },
    ],
    cart: { lines: [], whId: null, whAuto: false, whCleared: false, jobId: null, note: '' },
    reqs: [{
      id: 'REQ-690006', userId: 'u-eng', whId: 'wh-main', jobId: 'J-25-010', note: '', status: 'issued', at: '2026-11-08T09:15:00',
      lines: [
        { productId: 'P-0004', qty: 5, issued: 5, reserved: 0, returned: 0, single: false, cuts: [] },
        { productId: 'P-0009', qty: 2, issued: 2, reserved: 0, returned: 0, single: false, cuts: [] },
      ],
    }],
    approvalCats: [],
    audit: [],
    returns: [],
    receipts: [],
    prs: [],
    ccs: [],
    notifs: [],
    seq: { req: 690007, pr: 690002, cc: 7, roll: 161, product: 20, job: 11, ret: 1, rc: 690001 },
  };
};

if (typeof module !== 'undefined') module.exports = SM;

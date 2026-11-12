var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// ตัวเลขทุกตัวมีหน่วย · ทศนิยมไม่เกิน 2 ตำแหน่ง ตัดศูนย์ท้าย · คั่นหลักพัน (สเปกหัวข้อ 4)
SM.fmtQty = (n, unit) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + unit;

// state ใน localStorage เสีย/เวอร์ชันเก่า → กลับไปใช้ seed (ไม่ให้จอขาว)
SM.loadState = function (raw) {
  try {
    const s = JSON.parse(raw);
    if (s && s.v === 1 && Array.isArray(s.products)) return s;
  } catch (e) { /* ข้อมูลเสีย ใช้ seed */ }
  return SM.seed();
};

// ข้อความทั้งหมดตามรหัส N ในสเปกหัวข้อ 5 (ใช้คอลัมน์ "ข้อเสนอ" ก่อน ถ้าไม่มีใช้ข้อความปัจจุบัน)
SM.T = SM.T || {};

if (typeof module !== 'undefined') module.exports = SM;

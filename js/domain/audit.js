var SM = (typeof window !== 'undefined' ? window : globalThis).SM ||= {};

// ประวัติการทำรายการ: ใช้ SM.store.log / SM.store.auditFor (ฟังก์ชันอยู่ใน store.js)
SM.audit = { log: (...a) => SM.store.log(...a), for: (...a) => SM.store.auditFor(...a) };

if (typeof module !== 'undefined') module.exports = SM;

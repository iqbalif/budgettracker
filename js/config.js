// ============================================
// Budget Tracker — config.js
// Kolom spreadsheet (update):
//   Pemasukan:   A=ID, B=Tanggal, C=YearMon, D=Kategori, E=SubKat, F=Deskripsi, G=Nominal
//   Pengeluaran: A=ID, B=Tanggal, C=YearMon, D=Kategori, E=SubKat, F=Deskripsi, G=Nominal, H=Urgensi, I=Utilitas
// ============================================

// Variabel kategori sekarang kosong di awal, akan diisi otomatis oleh data dari Sheets
let CATS_IN = {};
let CATS_OUT = {};

// Config keys (localStorage)
const CFG = {
  SHEET_ID:   'bt_sheet_id',
  GOOGLE_KEY: 'bt_google_key',
  GEMINI_KEY: 'bt_gemini_key',
  SCRIPT_URL: 'bt_script_url',
  SHEET_IN:   'bt_sheet_in',
  SHEET_OUT:  'bt_sheet_out',
  PIN_HASH:   'bt_pin_hash',
  PIN_SALT:   'bt_pin_salt',
};

const DEF_SHEET_IN  = 'Pemasukan';
const DEF_SHEET_OUT = 'Pengeluaran';

function getCfg(k, fb = '') { return localStorage.getItem(k) || fb; }
function setCfg(k, v) { localStorage.setItem(k, v); }

// Helpers
function fmtRp(n) {
  if (n === undefined || n === null || isNaN(n)) return 'Rp –';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function monthKey(s) { return s ? s.slice(0, 7) : ''; }
function getMonthOpts(months) {
  // Tambahkan opsi "Semua Waktu" di baris pertama
  let opts = '<option value="all">Semua Waktu</option>';
  opts += months.map(m => {
    const [y, mo] = m.split('-');
    // Mengubah format YYYY-MM menjadi nama bulan (e.g., Mei 2026)
    const label = new Date(y, mo - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return `<option value="${m}">${label}</option>`;
  }).join('');
  return opts;
}
// Generate ID: format CF-XXXXXXXX (sesuai contoh di spreadsheet)
function genID() {
  return 'BT-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

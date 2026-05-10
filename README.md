# Budget Tracker — Web App

Aplikasi budget tracker pribadi berbasis web, terhubung ke Google Sheets milikmu sendiri.

---

## 🗂️ Struktur file

```
budget-tracker/
├── index.html
├── vercel.json
├── css/style.css
└── js/
    ├── config.js   ← kategori & helper
    ├── sheets.js   ← Google Sheets API (read) + Apps Script (write)
    ├── ai.js       ← Gemini AI parsing
    └── app.js      ← logika UI & routing
```

---

## 🚀 Deploy ke Vercel

1. **Upload ke GitHub**
   - Buat repo baru di github.com, upload semua file ini
2. **Import ke Vercel**
   - Login di vercel.com → Add New Project → Import dari GitHub → Deploy

---

## 🔑 API Keys — isi di halaman Pengaturan aplikasi

### 1. Spreadsheet ID
URL Google Sheets kamu:
`https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`

### 2. Google API Key (untuk READ data)
- [console.cloud.google.com](https://console.cloud.google.com) → Library → "Google Sheets API" → Enable
- Credentials → Create Credentials → API Key
- Restrict key: APIs → Google Sheets API saja

### 3. Gemini API Key (untuk AI parsing — GRATIS)
- [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → Get API Key
- Gratis: 15 request/menit, 1 juta token/hari

### 4. Apps Script URL (untuk WRITE — simpan, edit, hapus)
Lihat bagian bawah README ini.

---

## 📋 Format Google Sheets

### Sheet Pemasukan
| A: ID Transaksi | B: Tanggal | C: Year Mon | D: Kategori | E: Sub Kategori | F: Deskripsi | G: Nominal |
|---|---|---|---|---|---|---|

### Sheet Pengeluaran
| A: ID Transaksi | B: Tanggal | C: Year Mon | D: Kategori | E: Sub Kategori | F: Deskripsi | G: Nominal | H: Urgensi | I: Utilitas |
|---|---|---|---|---|---|---|---|---|

> Urgensi = Kebutuhan / Keinginan
> Utilitas = Consumptive / Productive

---

## ⚙️ Setup Google Apps Script (untuk write/edit/hapus)

Google Sheets API dengan API Key hanya bisa READ. Untuk WRITE, kamu butuh Apps Script.
Kamu sudah punya Apps Script dari bot Telegram — tinggal tambahkan fungsi `doPost` ini:

```javascript
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const sheet  = ss.getSheetByName(data.sheet);

    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: 'Sheet tidak ditemukan: ' + data.sheet })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'append') {
      sheet.appendRow(data.values);

    } else if (data.action === 'update') {
      const range = sheet.getRange(data.row, 1, 1, data.values.length);
      range.setValues([data.values]);

    } else if (data.action === 'delete') {
      // Clear the row (jangan deleteRow karena bisa geser row number)
      const lastCol = sheet.getLastColumn();
      sheet.getRange(data.row, 1, 1, lastCol).clearContent();
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

### Cara deploy Apps Script:
1. Buka Google Sheets → Extensions → Apps Script
2. Tambahkan fungsi `doPost` di atas ke file yang sudah ada (bersama `doGet` dan fungsi bot Telegram-mu)
3. Klik **Deploy** → **Manage Deployments** → **New Deployment**
4. Type: **Web App**
5. Execute as: **Me**
6. Who has access: **Anyone** ← penting agar web app bisa akses
7. Copy URL deployment-nya → paste ke Pengaturan aplikasi (field "Apps Script URL")

### Keamanan
URL Apps Script bersifat rahasia — jangan share ke orang lain. URL ini juga disimpan hanya di localStorage browser kamu.

---

## 📱 Install ke homescreen HP
Chrome/Safari → menu → "Add to Home Screen" → nama "Budget Tracker"
Hasilnya seperti app native, tanpa perlu download dari App Store.

---

## 💡 Tips
- Bot Telegram dan web app ini bisa jalan bersamaan — keduanya tulis ke Sheets yang sama
- Sesuaikan nama sheet di Pengaturan jika berbeda dengan "Pemasukan"/"Pengeluaran"
- Data kamu 100% ada di Google Sheets milikmu sendiri

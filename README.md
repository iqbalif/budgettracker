# Budget Tracker — PWA

Aplikasi budget tracker pribadi berbasis web (PWA) yang terhubung ke Google Sheets milikmu sendiri sebagai database. Tidak ada server, tidak ada backend berbayar — semua jalan di browser.

---

## Fitur

### Dashboard
- Total pemasukan & pengeluaran bulan ini, lengkap dengan indikator perubahan vs bulan lalu (↑/↓ %)
- Persentase pengeluaran dari pemasukan ("Pengeluaran X% dari pemasukan")
- Info H-X menuju akhir bulan & rata-rata pengeluaran harian
- Rekap pemasukan per kategori dengan toggle Kategori/Sub dan tampilan Ringkas/Rincian
- Rekap pengeluaran per kategori dengan fitur yang sama + shortcut langsung ke Riwayat
- Matrix 2×2 Utilitas × Urgensi (Consumptive/Productive × Kebutuhan/Keinginan)
- Stacked bar chart Kebutuhan vs Keinginan per utilitas
- Top 3 transaksi terbesar bulan ini
- Notifikasi otomatis jika pengeluaran kategori tertentu naik >50% vs bulan lalu
- Indikator overbudget langsung di Dashboard jika ada aturan anggaran yang terlampaui

### Input Transaksi
- Mode AI: ketik bebas dalam bahasa Indonesia → Gemini mengklasifikasikan otomatis → preview yang bisa diedit sebelum disimpan
- Mode Manual: form dropdown bertingkat sesuai kategori dari spreadsheet
- Fallback multi-model Gemini otomatis jika satu model tidak tersedia

### Riwayat
- Search bar + filter bulan, tipe (masuk/keluar), dan urgensi
- Ringkasan total masuk/keluar/saldo untuk filter aktif
- Tap transaksi → modal detail dengan opsi Edit, Duplikasi, Hapus
- Filter kategori langsung dari Dashboard (tap "Lihat di Riwayat" pada rekap)
- Export ke CSV

### Budgeting *(baru)*
- **Multi-Scope:** Aturan anggaran bisa diset untuk seluruh pengeluaran, per kategori, atau per sub-kategori
- **Nominal Tetap (Fixed):** Mematok batas angka pasti, misal maksimal Rp 1.500.000 untuk kategori Makan
- **Persentase Dinamis:** Batas berbasis persentase yang mengikuti total pemasukan, total pengeluaran, atau nominal kategori/sub-kategori lain
- **Indikator Waspada (80%):** Peringatan kuning ⚠️ saat pengeluaran mendekati batas
- **Indikator Overbudget (100%):** Peringatan merah 🚨 saat batas sudah terlampaui, disertai progress bar dan detail kalkulasi
- Aturan tersinkronisasi otomatis ke sheet `BudgetRules` di Google Sheets — lintas perangkat, tidak hilang saat cache dibersihkan

### Pengaturan
- Semua credentials disimpan di localStorage browser — tidak pernah dikirim ke server manapun selain Google & Gemini

### PWA
- Bisa di-install ke homescreen seperti app native
- Bekerja di mobile maupun desktop

---

## Struktur File

```
budget-tracker/
├── index.html
├── vercel.json
├── css/
│   └── style.css
└── js/
    ├── config.js   ← helper, formatter, kategori (diisi otomatis dari Sheets)
    ├── sheets.js   ← Google Sheets API (read) + Apps Script (write/edit/hapus)
    ├── ai.js       ← Gemini AI parsing natural language
    └── app.js      ← seluruh logika UI, routing, dan render dashboard
```

---

## Deploy ke Vercel

1. Upload semua file ke GitHub (buat repo baru, upload seluruh folder)
2. Login ke [vercel.com](https://vercel.com) → **Add New Project** → Import dari GitHub → **Deploy**
3. Tidak ada environment variable yang perlu diset — semua konfigurasi diisi langsung di halaman Pengaturan aplikasi

---

## Template Google Sheets

Gunakan template berikut sebagai titik awal:

👉 [Buka Template](https://docs.google.com/spreadsheets/d/1zzMD-OxKCT0OVzp-138lZ9ZT3uf8Ya1iYPx69wXYnGI/edit?usp=sharing)

Klik **File → Make a copy** untuk menyalin ke Google Drive kamu sendiri.

---

## Format Google Sheets

Spreadsheet membutuhkan lima sheet berikut:

### Sheet: `Pemasukan`
| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| ID Transaksi | Tanggal | Year Mon | Kategori | Sub Kategori | Deskripsi | Nominal |

### Sheet: `Pengeluaran`
| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| ID Transaksi | Tanggal | Year Mon | Kategori | Sub Kategori | Deskripsi | Nominal | Urgensi | Utilitas |

> **Urgensi:** `Kebutuhan` atau `Keinginan`  
> **Utilitas:** `Consumptive` atau `Productive`  
> **Format tanggal:** `9-Mei-2026` (ditulis otomatis oleh aplikasi)  
> **Format Year Mon:** `'2026 05` (dengan apostrof di depan agar tidak dibaca sebagai tanggal)

### Sheet: `Kategori In` & `Kategori Out`
Digunakan untuk dropdown kategori di form input. Format 2 kolom:

| A | B |
|---|---|
| Kategori | Sub Kategori |
| Gaji & Penghasilan Pokok | Gaji Pokok |
| Gaji & Penghasilan Pokok | Tunjangan Kinerja |
| Investasi | SBN / Sukuk |

Aplikasi membaca kategori ini secara otomatis saat startup — tidak perlu edit kode jika kamu menambah atau mengubah kategori.

### Sheet: `BudgetRules` *(baru)*
Digunakan untuk menyimpan aturan anggaran. Aplikasi mengelola sheet ini secara otomatis — kamu tidak perlu mengisinya manual.

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| ID | Scope | Target | Type | Base | BaseTarget | Limit |

> Jangan hapus baris header. Aplikasi membaca data mulai dari baris kedua.

---

## API Keys

Semua diisi di halaman **Pengaturan** dalam aplikasi.

### 1. Spreadsheet ID
Ambil dari URL Google Sheets:
```
https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
```

### 2. Google API Key — untuk READ data
- Buka [console.cloud.google.com](https://console.cloud.google.com)
- Library → cari **Google Sheets API** → Enable
- Credentials → Create Credentials → **API Key**
- Restrict key: Application restrictions → HTTP referrers (domain Vercel-mu), API restrictions → Google Sheets API

### 3. Gemini API Key — untuk AI parsing (gratis)
- Buka [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → **Get API Key**
- Gratis: 15 request/menit, 1 juta token/hari
- Aplikasi otomatis mencoba beberapa model Gemini jika satu gagal

### 4. Apps Script URL — untuk WRITE, EDIT, HAPUS
Lihat bagian setup di bawah.

---

## Setup Google Apps Script

Google Sheets API dengan API Key hanya bisa membaca. Untuk menulis, mengedit, menghapus transaksi, dan menyinkronkan aturan budgeting, kamu perlu Google Apps Script yang di-deploy sebagai Web App.

### Kode Apps Script

Buka Google Sheets → **Extensions → Apps Script**, lalu paste kode berikut:

```javascript
// ============================================
// BUDGET TRACKER - PWA BACKEND (WEB APP ONLY)
// ============================================

var spreadsheetId = "MASUKKAN_SPREADSHEET_ID_KAMU";

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Sistem sibuk, coba lagi" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var contents;
    try {
      contents = JSON.parse(e.postData.contents);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Format data tidak valid" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (contents.action) {
      return handleWebAppRequest(contents);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Aksi tidak dikenali" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function handleWebAppRequest(data) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(data.sheet);
    if (!sheet) throw new Error("Sheet tidak ditemukan: " + data.sheet);

    if (data.action === "append") {
      // Cari baris kosong pertama pada kolom B (Tanggal), tulis di sana
      var firstEmptyRow = findFirstEmptyRowByColumn(sheet, 2);
      sheet.getRange(firstEmptyRow, 1, 1, data.values.length).setValues([data.values]);

    } else if (data.action === "update") {
      sheet.getRange(data.row, 1, 1, data.values.length).setValues([data.values]);

    } else if (data.action === "delete") {
      // clearContent (bukan deleteRow) agar nomor baris data lain tidak bergeser
      sheet.getRange(data.row, 1, 1, sheet.getLastColumn()).clearContent();

    } else if (data.action === "overwrite_all") {
      // Digunakan oleh modul Budgeting untuk menyimpan seluruh aturan sekaligus
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
      }
      if (data.values && data.values.length > 0) {
        sheet.getRange(2, 1, data.values.length, data.values[0].length).setValues(data.values);
      }

    } else {
      throw new Error("Action tidak valid: " + data.action);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function findFirstEmptyRowByColumn(sheet, colIndex) {
  var range = sheet.getRange(1, colIndex, sheet.getLastRow() || 1, 1);
  var values = range.getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === "" || values[i][0] === null) return i + 1;
  }
  return values.length + 1;
}

function doGet(e) {
  // Endpoint untuk mengambil aturan budgeting dari aplikasi
  if (e.parameter.action === "get_rules") {
    try {
      var ss = SpreadsheetApp.openById(spreadsheetId);
      var sheet = ss.getSheetByName("BudgetRules");
      var data = sheet.getDataRange().getValues();
      return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput("Budget Tracker Backend is Active.")
    .setMimeType(ContentService.MimeType.TEXT);
}
```

### Cara Deploy

1. Di editor Apps Script, klik **Deploy → Manage Deployments → New Deployment**
2. Type: **Web App**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Klik **Deploy** → copy URL yang muncul
6. Paste URL tersebut ke field **Apps Script URL** di halaman Pengaturan aplikasi

> **Catatan:** Setiap kali kamu mengubah kode Apps Script, kamu harus membuat deployment baru dan mengupdate URL-nya di Pengaturan aplikasi.

### Kenapa `clearContent` bukan `deleteRow`?
Aplikasi menyimpan nomor baris (`_row`) saat membaca data. Kalau baris dihapus dengan `deleteRow`, nomor baris semua data di bawahnya bergeser dan operasi edit/hapus berikutnya bisa mengenai baris yang salah. `clearContent` mengosongkan baris tanpa menggeser apapun.

---

## Keamanan

- Semua credentials (API Key, Apps Script URL) disimpan **hanya di localStorage browser kamu** — tidak pernah disimpan di server manapun
- Google API Key hanya punya akses READ ke spreadsheet
- Apps Script URL berfungsi seperti password untuk operasi tulis — jangan dibagikan ke orang lain
- Tidak ada autentikasi login — aplikasi ini memang dirancang untuk penggunaan pribadi di perangkat sendiri

---

## Install ke Homescreen

Di Chrome (Android) atau Safari (iOS): buka URL aplikasi → menu browser → **"Add to Home Screen"** → beri nama "Budget Tracker". Aplikasi akan jalan seperti app native, tanpa address bar.

---

## Tips

- Tambah atau ubah kategori cukup dari sheet `Kategori In` / `Kategori Out` — aplikasi membacanya otomatis tanpa perlu edit kode
- Gunakan mode AI untuk input cepat: ketik saja "makan siang padang 35rb" dan biarkan Gemini yang mengklasifikasikan
- Filter bulan di Dashboard dan Riwayat bisa diset ke "Semua Waktu" untuk melihat akumulasi seluruh data
- Export CSV tersedia di halaman Riwayat untuk analisis lebih lanjut di Excel/Sheets
- Aturan budgeting tersimpan di Google Sheets (`BudgetRules`) sehingga tetap ada meski cache browser dibersihkan atau kamu ganti perangkat

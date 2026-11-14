// ============================================
// BUDGET TRACKER - PWA BACKEND (WEB APP ONLY)
// ============================================
// Salin seluruh isi file ini ke editor Apps Script (Extensions → Apps Script),
// isi spreadsheetId, lalu deploy ulang (lihat README → "Cara Deploy").

var spreadsheetId = "MASUKKAN_SPREADSHEET_ID_KAMU";

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Tunggu sampai 15 detik: dua simpan yang berdekatan mengantre, bukan langsung gagal
  if (!lock.tryLock(15000)) {
    return jsonOut({ ok: false, error: "Sistem sibuk, coba lagi" });
  }

  try {
    var contents;
    try {
      contents = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut({ ok: false, error: "Format data tidak valid" });
    }

    if (contents.action) {
      return handleWebAppRequest(contents);
    }
    return jsonOut({ ok: false, error: "Aksi tidak dikenali" });

  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
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
      return jsonOut({ ok: true, row: firstEmptyRow });

    } else if (data.action === "update") {
      var rowU = resolveRow(sheet, data);
      sheet.getRange(rowU, 1, 1, data.values.length).setValues([data.values]);
      return jsonOut({ ok: true, row: rowU });

    } else if (data.action === "delete") {
      // clearContent (bukan deleteRow) agar nomor baris data lain tidak bergeser
      var rowD = resolveRow(sheet, data);
      sheet.getRange(rowD, 1, 1, sheet.getLastColumn()).clearContent();
      return jsonOut({ ok: true, row: rowD });

    } else if (data.action === "overwrite_all") {
      // Digunakan oleh modul Budgeting & Pengingat untuk menyimpan seluruh data sekaligus
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
      }
      if (data.values && data.values.length > 0) {
        sheet.getRange(2, 1, data.values.length, data.values[0].length).setValues(data.values);
      }
      return jsonOut({ ok: true });

    } else {
      throw new Error("Action tidak valid: " + data.action);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Tentukan baris yang akan di-edit/hapus.
// - Jika aplikasi mengirim ID transaksi: cari barisnya di kolom A. Nomor baris dari
//   aplikasi hanya dipakai sebagai petunjuk, jadi cache yang usang di perangkat lain
//   tidak bisa lagi membuat edit/hapus mengenai transaksi yang salah.
// - Jika ID kosong (baris lama tanpa ID, atau aplikasi versi lama): pakai nomor baris.
function resolveRow(sheet, data) {
  var id = (data.id === undefined || data.id === null) ? "" : String(data.id).trim();
  var hintRow = parseInt(data.row, 10);

  if (!id) {
    if (!hintRow || hintRow < 2) throw new Error("Nomor baris tidak valid");
    return hintRow;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Transaksi tidak ditemukan (ID " + id + ")");

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var matches = [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) matches.push(i + 2);
  }

  if (matches.length === 0) {
    throw new Error("Transaksi tidak ditemukan, mungkin sudah dihapus dari perangkat lain. Muat ulang data.");
  }
  // Jika ID kebetulan ganda, pilih baris yang sama dengan petunjuk dari aplikasi
  if (matches.indexOf(hintRow) !== -1) return hintRow;
  if (matches.length > 1) {
    throw new Error("ID transaksi ganda di sheet (" + id + "). Muat ulang data lalu coba lagi.");
  }
  return matches[0];
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
  var action = e.parameter.action;
  var ss = SpreadsheetApp.openById(spreadsheetId);

  // Ambil aturan budgeting
  if (action === "get_rules") {
    try {
      var data = ss.getSheetByName("BudgetRules").getDataRange().getValues();
      return jsonOut({ ok: true, data: data });
    } catch (err) {
      return jsonOut({ ok: false, error: err.message });
    }
  }

  // Ambil konfigurasi pengingat tagihan
  if (action === "get_reminders") {
    try {
      var dataR = ss.getSheetByName("Reminders").getDataRange().getValues();
      return jsonOut({ ok: true, data: dataR });
    } catch (err) {
      return jsonOut({ ok: false, error: err.message });
    }
  }

  return ContentService.createTextOutput("Budget Tracker Backend is Active.")
    .setMimeType(ContentService.MimeType.TEXT);
}

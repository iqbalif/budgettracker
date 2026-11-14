// ============================================
// Budget Tracker — sheets.js
// Google Sheets API layer (UNFORMATTED_VALUE)
// ============================================

const Sheets = (() => {

  function baseUrl() {
    const id = getCfg(CFG.SHEET_ID);
    if (!id) throw new Error('Spreadsheet ID belum diisi.');
    return `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  }
  function apiKey() { return getCfg(CFG.GOOGLE_KEY); }
  function scriptUrl() { return getCfg(CFG.SCRIPT_URL); }

  async function gGet(range) {
    const url = `${baseUrl()}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&key=${apiKey()}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Gagal baca data Google Sheets.');
    return (await r.json()).values || [];
  }

  // Kirim perintah tulis ke Apps Script dan BACA jawabannya.
  // Content-Type text/plain = "simple request" (tanpa preflight CORS), sehingga
  // respons JSON { ok, error } dari Apps Script bisa dibaca dan kegagalan tidak lagi diam-diam.
  async function scriptPost(payload) {
    const url = scriptUrl();
    if (!url) throw new Error('Apps Script URL belum diisi di Pengaturan.');

    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      throw new Error('Tidak bisa menghubungi Apps Script. Cek koneksi internet.');
    }

    let data;
    try { data = JSON.parse(await r.text()); }
    catch (e) { throw new Error('Respons Apps Script tidak dikenali. Cek URL & deployment Apps Script.'); }

    if (!data || !data.ok) throw new Error((data && data.error) || 'Apps Script menolak permintaan.');
    return data;
  }

  // ---- TANGGAL KEBAL ERROR ----
  function serialToISO(val) {
    if (!val) return '';
    if (typeof val === 'number') {
      const ms = (val - 25569) * 86400 * 1000;
      return new Date(ms).toISOString().split('T')[0];
    }
    const s = String(val).trim();
    const bulanMap = { 'jan':1,'feb':2,'mar':3,'apr':4,'mei':5,'jun':6,'jul':7,'agu':8,'sep':9,'okt':10,'nov':11,'des':12 };
    if (s.includes('-') && isNaN(Number(s))) {
      const p = s.split('-');
      if (p.length === 3) {
        const bln = bulanMap[p[1].toLowerCase()];
        if (bln) {
          const yr = p[2].length === 2 ? '20' + p[2] : p[2];
          return yr + '-' + String(bln).padStart(2,'0') + '-' + p[0].padStart(2,'0');
        }
      }
    }
    if (s.includes('/')) {
      const p = s.split('/');
      if (p.length === 3) {
        const year = p[2].length === 2 ? '20' + p[2] : p[2];
        return year + '-' + p[1].padStart(2,'0') + '-' + p[0].padStart(2,'0');
      }
    }
    return s;
  }

  // ---- NOMINAL KEBAL ERROR ----
  function parseNominalRobust(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let s = String(val).replace(/[,.]00$/, '').replace(/[^0-9-]/g, '');
    return parseFloat(s) || 0;
  }

  // ---- FORMAT PREFIX (Apostrof) ----
  function formatTanggalIndonesia(isoDate) {
    const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const [y, m, d] = isoDate.split('-');
    return "'" + parseInt(d) + '-' + bulan[parseInt(m)-1] + '-' + y;
  }

  function makeYearMon(isoDate) {
    const [y, m] = isoDate.split('-');
    return "'" + y + ' ' + m;
  }

  function parsePemasukan(row, rowNum) {
    if (!row || row.length < 4) return null;
    const nominal = parseNominalRobust(row[6]);
    if (!nominal) return null;
    return {
      _row: rowNum, _sheet: 'in', id_transaksi: row[0] || '', type: 'in',
      tanggal: serialToISO(row[1]), yearmon: row[2] || '', kategori: row[3] || '', sub_kategori: row[4] || '', deskripsi: row[5] || '', nominal
    };
  }

  function parsePengeluaran(row, rowNum) {
    if (!row || row.length < 4) return null;
    const nominal = parseNominalRobust(row[6]);
    if (!nominal) return null;
    return {
      _row: rowNum, _sheet: 'out', id_transaksi: row[0] || '', type: 'out',
      tanggal: serialToISO(row[1]), yearmon: row[2] || '', kategori: row[3] || '', sub_kategori: row[4] || '', deskripsi: row[5] || '', nominal,
      urgensi: row[7] || '', utilitas: row[8] || ''
    };
  }

  async function fetchAll() {
    const [rowsIn, rowsOut] = await Promise.all([
      gGet(`${getCfg(CFG.SHEET_IN, DEF_SHEET_IN)}!A2:G`),
      gGet(`${getCfg(CFG.SHEET_OUT, DEF_SHEET_OUT)}!A2:I`),
    ]);
    const ins = rowsIn.map((r, i) => parsePemasukan(r, i + 2)).filter(Boolean);
    const outs = rowsOut.map((r, i) => parsePengeluaran(r, i + 2)).filter(Boolean);
    return [...ins, ...outs].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }

  async function addTransaction(trx) {
    // Memastikan id_transaksi didapat dari config.js (genID)
    const id = (typeof genID === 'function') ? genID() : "TRX-" + new Date().getTime().toString().slice(-6); 
    const tglFmt = formatTanggalIndonesia(trx.tanggal);
    const ym = makeYearMon(trx.tanggal);
    const isOut = trx.type === 'out';
    const sheet = isOut ? getCfg(CFG.SHEET_OUT, DEF_SHEET_OUT) : getCfg(CFG.SHEET_IN, DEF_SHEET_IN);
    const values = isOut
      ? [id, tglFmt, ym, trx.kategori, trx.sub_kategori, trx.deskripsi, trx.nominal, trx.urgensi || '', trx.utilitas || '']
      : [id, tglFmt, ym, trx.kategori, trx.sub_kategori, trx.deskripsi, trx.nominal];
    await scriptPost({ action: 'append', sheet, values }); return id;
  }

  async function updateTransaction(trx) {
    const tglFmt = formatTanggalIndonesia(trx.tanggal);
    const ym = makeYearMon(trx.tanggal);
    const isOut = trx.type === 'out';
    const sheet = isOut ? getCfg(CFG.SHEET_OUT, DEF_SHEET_OUT) : getCfg(CFG.SHEET_IN, DEF_SHEET_IN);
    const values = isOut
      ? [trx.id_transaksi, tglFmt, ym, trx.kategori, trx.sub_kategori, trx.deskripsi, trx.nominal, trx.urgensi || '', trx.utilitas || '']
      : [trx.id_transaksi, tglFmt, ym, trx.kategori, trx.sub_kategori, trx.deskripsi, trx.nominal];
    await scriptPost({ action: 'update', sheet, row: trx._row, id: trx.id_transaksi || '', values });
  }

  async function deleteTransaction(trx) {
    const sheet = trx.type === 'in' ? getCfg(CFG.SHEET_IN, DEF_SHEET_IN) : getCfg(CFG.SHEET_OUT, DEF_SHEET_OUT);
    await scriptPost({ action: 'delete', sheet, row: trx._row, id: trx.id_transaksi || '' });
  }

  // ---- FUNGSI TARIK KATEGORI OTOMATIS ----
  async function fetchCategories() {
    const [rowsIn, rowsOut] = await Promise.all([
      gGet('Kategori In!A2:B'),
      gGet('Kategori Out!A2:B')
    ]);

    function parseToMap(rows) {
      const map = {};
      rows.forEach(row => {
        const kat = (row[0] || '').toString().trim();
        const sub = (row[1] || '').toString().trim();
        if (!kat) return; // Abaikan baris kosong
        if (!map[kat]) map[kat] = [];
        if (sub && !map[kat].includes(sub)) map[kat].push(sub);
      });
      return map;
    }

    return {
      in: parseToMap(rowsIn),
      out: parseToMap(rowsOut)
    };
  }

  return { fetchAll, addTransaction, updateTransaction, deleteTransaction, fetchCategories, post: scriptPost };
})();
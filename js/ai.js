// ============================================
// Budget Tracker — ai.js
// Gemini API untuk parsing natural language
// ============================================

const AI = (() => {

  function systemPrompt() {
    return `Kamu adalah asisten budget tracker pribadi. User mendeskripsikan transaksi keuangan dalam bahasa Indonesia (informal/formal/campur).

Tugasmu: parse transaksi dan kembalikan JSON.

Kategori PEMASUKAN (type="in"):
${JSON.stringify(CATS_IN)}

Kategori PENGELUARAN (type="out"):
${JSON.stringify(CATS_OUT)}

Kembalikan HANYA JSON ini (tanpa markdown, tanpa teks lain, tanpa backtick):
{
  "type": "in" | "out",
  "deskripsi": "teks deskripsi (patuhi aturan khusus di bawah, jangan batasi jumlah kata)",
  "nominal": integer_rupiah,
  "tanggal": "YYYY-MM-DD",
  "kategori": "nama kategori dari daftar",
  "sub_kategori": "nama sub kategori dari daftar",
  "urgensi": "Kebutuhan" | "Keinginan" | "",
  "utilitas": "Consumptive" | "Productive" | ""
}

Aturan Dasar:
- Tanggal tidak disebutkan → hari ini: ${todayISO()}
- "tadi/barusan/tadi pagi" = hari ini; "kemarin" = kemarin
- nominal harus integer, tanpa desimal
- urgensi & utilitas hanya diisi jika type="out", isi "" jika type="in"
- Investasi, tabungan, asuransi, dana darurat = Productive
- Semua lainnya = Consumptive
- Makan pokok/harian = Kebutuhan; jajan/nongkrong/delivery = Keinginan (pertimbangkan konteks)
- Pilih kategori & sub_kategori PERSIS dari daftar di atas

Aturan Khusus Kolom "deskripsi":
1. STRICT MODE: Jika input diapit tanda kutip (contoh: "ABC Saus 270ml x2"), DILARANG mengubah, menambah, atau meringkas teks tersebut. Gunakan persis apa adanya.
2. SMART FORMATTING: Jika input pendek ("buah 5k"), rapikan ("Buah"). TAPI, JIKA INPUT MENGANDUNG MEREK, UKURAN, ATAU LEBIH DARI 3 KATA, biarkan persis apa adanya! JANGAN diringkas!
3. NO VERBS/NOUNS: JANGAN PERNAH menambahkan kata seperti "Beli", "Bayar", "Pembelian", "Pembayaran", atau "Pengeluaran untuk" jika tidak ada di teks asli user.
4. PEMISAHAN CLUE: Jika ada kata petunjuk yang dipisah koma, gunakan HANYA untuk analisis kategori. Jangan masukkan ke deskripsi.`;
  }

  async function parse(text) {
    const key = getCfg(CFG.GEMINI_KEY);
    if (!key) throw new Error('Gemini API Key belum diisi di Pengaturan.');

    // Fallback otomatis: coba model satu per satu sampai berhasil
    const models = [
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
    ];

    const body = {
      contents: [{ role: 'user', parts: [{ text: systemPrompt() + '\n\nTransaksi: ' + text }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 400 }
    };

    let lastError = '';

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const data = await r.json();

        // 400 key invalid → langsung lempar, jangan coba model lain
        if (r.status === 400) throw new Error('API Key Gemini tidak valid. Cek di Pengaturan → AI.');

        // 429 kuota habis / 503 overloaded → coba model berikutnya
        if (!r.ok) {
          lastError = `[${model}] ${data.error?.message?.split('.')[0] || r.status}`;
          continue;
        }

        const raw   = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const clean = raw.replace(/```json|```/g, '').trim();

        let parsed;
        try { parsed = JSON.parse(clean); }
        catch { lastError = `[${model}] Format respons tidak valid`; continue; }

        if (!parsed.type || !parsed.nominal || !parsed.kategori) {
          lastError = `[${model}] Field tidak lengkap`;
          continue;
        }

        return parsed; // berhasil

      } catch (e) {
        if (e.message.includes('tidak valid')) throw e; // key invalid, stop
        lastError = `[${model}] ${e.message}`;
        continue;
      }
    }

    // Semua model gagal
    throw new Error('Semua model AI sedang tidak tersedia. Coba lagi beberapa menit.\n' + lastError);
  }

  return { parse };
})();

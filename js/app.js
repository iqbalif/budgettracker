// ============================================
// Budget Tracker — app.js
// ============================================

let allTrx = [];
let pendingTrx = null;
let currentPage = 'dashboard';
let manualType  = 'out';
let catView     = 'cat'; // 'cat' = kategori besar, 'sub' = sub kategori
let showAllCat  = false;
let expandedCats = {};
let isAllExpanded = false;
let histCatFilter = '';
let inCatView = 'cat';
let inShowSubs = false;
let outCatView = 'cat';
let outShowSubs = false;
let showAllOut = false;
let billReminders = JSON.parse(localStorage.getItem('bill_reminders')) || [];
let editReminderId = null;
let isRemindersFetched = false;

// ---- INIT ----
window.addEventListener('DOMContentLoaded', () => {
  loadSettingsForm();
  setTimeout(() => {
    const sp = document.getElementById('splash');
    sp.classList.add('out');
    setTimeout(() => {
      sp.style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      startApp();
    }, 480);
  }, 900);
});

function startApp() {
  initApp();
}

function updateHistoryUI() {
  if (typeof loadHistory === 'function') loadHistory();
}

function initApp() {
  populateMonthFilters();
  const hasConfig = getCfg(CFG.SHEET_ID) && getCfg(CFG.GOOGLE_KEY);

  // Render instan dari memori lokal (Optimistic UI)
  const localTrx = JSON.parse(localStorage.getItem('trx')) || [];
  allTrx = localTrx;
  loadDashboard();
  updateHistoryUI();
  if (typeof renderBudgetRules === 'function') renderBudgetRules();
  if (typeof checkBudgetAlerts === 'function') checkBudgetAlerts();
  if (typeof renderBillReminders === 'function') renderBillReminders();
  attachNominalFormatter('reminder-nominal');

  const lastSync = localStorage.getItem('last_sync_time');
  if (lastSync) {
    const el = document.getElementById('sync-status-text');
    if (el) el.textContent = lastSync;
  }

  if (!hasConfig) {
    showToast('Isi Spreadsheet ID & API Key di Pengaturan dulu 👆');
    return;
  }

  // Sinkronisasi data dari awan secara diam-diam di background
  refreshDataBackground(); 
}

async function refreshDataBackground() {
  const btn = document.getElementById('btn-refresh-cloud');
  const svg = btn?.querySelector('svg');
  
  if (btn) btn.disabled = true;
  if (svg) svg.classList.add('spinning');

  try {
    // Ambil transaksi dan kategori secara paralel agar proses loading lebih cepat
    const [cats, trx] = await Promise.all([
      Sheets.fetchCategories(),
      Sheets.fetchAll()
    ]);

    // Timpa variabel kategori lokal dengan data terbaru dari spreadsheet
    CATS_IN = cats.in;
    CATS_OUT = cats.out;
    allTrx = trx;
    
    // Simpan ke local storage
    localStorage.setItem('trx', JSON.stringify(trx));
    
    fetchBudgetRulesFromCloud();
    fetchBillRemindersFromCloud();
 
    populateMonthFilters();
    
    // Jika user sedang membuka form input manual, refresh dropdown-nya
    if (currentPage === 'input' && !document.getElementById('input-manual-section').classList.contains('hidden')) {
      document.getElementById('manual-form-wrap').innerHTML = buildManualForm();
      initManualForm();
    }
    
    // Silent re-render
    loadDashboard();
    updateHistoryUI();

    const now = new Date();
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const timeStr = `✓ Tersinkronisasi dengan Google Sheets: ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
    
    const syncTextEl = document.getElementById('sync-status-text');
    if (syncTextEl) syncTextEl.textContent = timeStr;
    localStorage.setItem('last_sync_time', timeStr);

    return true;
  } catch(e) {
    showToast('Gagal load: ' + e.message);
    return false;
  } finally {
    if (btn) btn.disabled = false;
    if (svg) svg.classList.remove('spinning');
  }
}

const refreshData = refreshDataBackground;

async function triggerManualRefresh() {
  showToast('Menyinkronkan data dengan Google Sheets...');
  const success = await refreshDataBackground();
  if (success) {
    showToast('Data berhasil diperbarui ✓');
  }
}

// ---- ROUTING ----
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  document.querySelector(`.nav-btn[data-page="${name}"]`)?.classList.add('active');
  currentPage = name;
  if (name === 'dashboard') loadDashboard();
  if (name === 'history')   loadHistory();
  if (name === 'settings')  loadSettingsForm();
  if (name === 'input')     initManualForm();
  if (name === 'budgeting') {
    renderBudgetRules();
    toggleBudgetScope();
    toggleBudgetType();

    // Populate Kategori & Sub Kategori Pengingat Tagihan
    const katEl = document.getElementById('reminder-kat');
    if (katEl) {
      const cats = CATS_OUT || {};
      const catKeys = Object.keys(cats);
      const prevKat = katEl.value;
      katEl.innerHTML = catKeys.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if (prevKat && catKeys.includes(prevKat)) {
        katEl.value = prevKat;
      }
    }
    updateReminderSub();

    if (typeof renderBillReminders === 'function') renderBillReminders();
    if (typeof toggleReminderFreq === 'function') toggleReminderFreq();
    const dateInput = document.getElementById('reminder-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = todayISO();
    }
  }
}

// ---- MONTH FILTERS ----
function getMonths() {
  const set = new Set(allTrx.map(t => monthKey(t.tanggal)).filter(Boolean));
  set.add(todayISO().slice(0, 7));
  return [...set].sort().reverse();
}
function populateMonthFilters() {
  const opts = getMonthOpts(getMonths());
  const currentMonth = todayISO().slice(0, 7);
  
  ['dash-month-filter', 'hist-month-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const prevVal = el.value; // Simpan pilihan user jika ada
      el.innerHTML = opts;
      if (prevVal) {
        el.value = prevVal;
      } else {
        el.value = currentMonth;
      }
    }
  });
}
function selMonth(id) {
  return document.getElementById(id)?.value || todayISO().slice(0, 7);
}

function shiftMonthKey(mon, delta) {
  if (!mon || mon === 'all') return '';
  const [year, month] = mon.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthTransactions(mon) {
  if (!mon) return [];
  return allTrx.filter((t) => monthKey(t.tanggal) === mon);
}

function getMonthlyTotals(mon) {
  const trx = getMonthTransactions(mon);
  return {
    trx,
    ins: trx.filter((t) => t.type === 'in'),
    outs: trx.filter((t) => t.type === 'out')
  };
}

function calcPctChange(current, previous) {
  if (!previous) return 0;
  return Math.round((Math.abs(current - previous) / previous) * 100);
}

// ---- DASHBOARD ----
function loadDashboard() {
  const mon  = selMonth('dash-month-filter');
  const trx  = (mon === 'all') ? allTrx : allTrx.filter(t => monthKey(t.tanggal) === mon);
  
  const ins  = trx.filter(t => t.type === 'in');
  const outs = trx.filter(t => t.type === 'out');

  const totalIn  = ins.reduce((s, t)  => s + t.nominal, 0);
  const totalOut = outs.reduce((s, t) => s + t.nominal, 0);

  document.getElementById('dash-in').textContent  = fmtRp(totalIn);
  document.getElementById('dash-out').textContent = fmtRp(totalOut);
  const rateEl = document.getElementById('dash-spending-rate');
  if (rateEl) {
    if (mon === 'all' || totalIn === 0) {
      rateEl.textContent = '';
    } else {
      const rate = (totalOut / totalIn * 100).toFixed(1);
      rateEl.textContent = `Pengeluaran ${rate}% dari pemasukan`;
      rateEl.style.color = rate < 70 ? '#A7D8A7' : rate <= 90 ? '#F3C97B' : '#F4956A';
    }
  }
  updateHeroMoM(mon, totalIn, totalOut);
  updateHeroSub(mon, totalOut);
  
  checkBudgetAlerts(mon, totalIn, totalOut, outs);

  // 1. Rekap Pemasukan
  renderInRekap(ins);
  renderOutRekap(outs);
  renderTop3Transactions(outs);
  renderDashboardAnomaly(mon);

  // 2. Breakdown Pengeluaran
  const conNeed = outs.filter(t=>t.utilitas==='Consumptive'&&t.urgensi==='Kebutuhan').reduce((s,t)=>s+t.nominal,0);
  const conWant = outs.filter(t=>t.utilitas==='Consumptive'&&t.urgensi==='Keinginan').reduce((s,t)=>s+t.nominal,0);
  const proNeed = outs.filter(t=>t.utilitas==='Productive'&&t.urgensi==='Kebutuhan').reduce((s,t)=>s+t.nominal,0);
  const proWant = outs.filter(t=>t.utilitas==='Productive'&&t.urgensi==='Keinginan').reduce((s,t)=>s+t.nominal,0);

  renderMatrix(conNeed, conWant, proNeed, proWant);
  renderUtilChart(conNeed, conWant, proNeed, proWant);
  checkBudgetAlerts();
}

function updateHeroMoM(mon, totalIn, totalOut) {
  const inEl = document.getElementById('dash-in-mom');
  const outEl = document.getElementById('dash-out-mom');
  if (!inEl || !outEl) return;

  if (mon === 'all') {
    inEl.style.display = 'none';
    outEl.style.display = 'none';
    inEl.textContent = '';
    outEl.textContent = '';
    return;
  }

  const prevMon = shiftMonthKey(mon, -1);
  const prevTotals = getMonthlyTotals(prevMon);
  const prevIn = prevTotals.ins.reduce((sum, t) => sum + t.nominal, 0);
  const prevOut = prevTotals.outs.reduce((sum, t) => sum + t.nominal, 0);

  if (!prevIn) {
    inEl.style.display = 'none';
    inEl.textContent = '';
  } else {
    const pct = calcPctChange(totalIn, prevIn);
    inEl.style.display = 'block';
    inEl.style.color = totalIn >= prevIn ? '#7EC87E' : '#F4956A';
    inEl.textContent = `${totalIn < prevIn ? '↓' : (totalIn > prevIn ? '↑' : '•')} ${pct}% dari bulan lalu`;
  }

  if (!prevOut) {
    outEl.style.display = 'none';
    outEl.textContent = '';
  } else {
    const pct = calcPctChange(totalOut, prevOut);
    outEl.style.display = 'block';
    outEl.style.color = totalOut <= prevOut ? '#7EC87E' : '#F4956A';
    outEl.textContent = `${totalOut < prevOut ? '↓' : (totalOut > prevOut ? '↑' : '•')} ${pct}% dari bulan lalu`;
  }
}

function updateHeroSub(mon, totalOut) {
  const el = document.getElementById('dash-hero-sub'); // Elemen Bawah
  const topDaysEl = document.getElementById('dash-hero-days'); // Elemen Atas
  
  if (!el) return;

  // Jika filter "Semua Bulan" dipilih
  if (mon === 'all' || !mon) {
    el.style.display = 'none';
    el.innerHTML = '';
    if(topDaysEl) topDaysEl.innerHTML = '';
    return;
  }

  const today = new Date();
  const currentMon = todayISO().slice(0, 7); 
  const [year, month] = mon.split('-').map(Number);
  const totalDaysInMonth = new Date(year, month, 0).getDate(); 

  el.style.display = 'block';

  if (mon === currentMon) {
    // ---- BULAN BERJALAN ----
    const dayOfMonth = today.getDate();
    const dailyAvg = dayOfMonth ? totalOut / dayOfMonth : 0;
    
    // Teks Bawah: Hanya fokus ke uang
    el.innerHTML = `Rata-rata pengeluaran harian: ${fmtRp(dailyAvg)}`;
    
    // Teks Atas: Progress Hari (Format: • HARI 17/31)
    if(topDaysEl) {
      topDaysEl.innerHTML = ` &nbsp;•&nbsp; HARI ${dayOfMonth}/${totalDaysInMonth}`;
    }
  } else {
    // ---- BULAN LALU (SEJARAH) ----
    const dailyAvg = totalOut / totalDaysInMonth;
    el.innerHTML = `Rata-rata pengeluaran harian: ${fmtRp(dailyAvg)}`;
    
    // Kosongkan indikator atas karena bulannya sudah lewat
    if(topDaysEl) topDaysEl.innerHTML = '';
  }
}

function renderTop3Transactions(outs) {
  const el = document.getElementById('dash-top3');
  if (!el) return;

  const top3 = [...outs].sort((a, b) => b.nominal - a.nominal).slice(0, 3);
  if (!top3.length) {
    el.innerHTML = '<p class="empty-state" style="font-size:13px;padding:10px 0;">Belum ada transaksi besar bulan ini</p>';
    return;
  }

  el.innerHTML = top3.map((t) => `
    <div class="top3-item" onclick='openTrxModal(${JSON.stringify(JSON.stringify(t))})'>
      <div class="top3-left">${escapeHtml(t.deskripsi || '(tanpa deskripsi)')}${t.sub_kategori ? `<span class="top3-sub"> · ${escapeHtml(t.sub_kategori)}</span>` : ''}</div>
      <div class="top3-right">${fmtRp(t.nominal)}</div>
    </div>
  `).join('');
}

function renderDashboardAnomaly(mon) {
  const el = document.getElementById('dash-anomaly');
  if (!el) return;
  if (mon === 'all') {
    el.innerHTML = '';
    return;
  }

  const prevMon = shiftMonthKey(mon, -1);
  const currentOuts = getMonthlyTotals(mon).outs;
  const prevOuts = getMonthlyTotals(prevMon).outs;
  const currentCatMap = {};
  const prevCatMap = {};

  currentOuts.forEach((t) => { currentCatMap[t.kategori] = (currentCatMap[t.kategori] || 0) + t.nominal; });
  prevOuts.forEach((t) => { prevCatMap[t.kategori] = (prevCatMap[t.kategori] || 0) + t.nominal; });

  const warnings = Object.keys(currentCatMap).filter((kat) => {
    const curr = currentCatMap[kat] || 0;
    const prev = prevCatMap[kat] || 0;
    return prev > 0 && curr > prev * 1.5 && curr > 100000;
  }).map((kat) => {
    const curr = currentCatMap[kat];
    const prev = prevCatMap[kat];
    const pct = Math.round(((curr - prev) / prev) * 100);
    return `<div style="background:rgba(196,118,58,0.15);color:var(--out);border:1px solid rgba(196,118,58,0.3);border-radius:8px;padding:6px 10px;font-size:12px;display:block;margin-bottom:6px;">⚠ ${escapeHtml(kat)} naik ${pct}% vs bulan lalu</div>`;
  });

  el.innerHTML = warnings.join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseNominalInputValue(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function formatNominalInputValue(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('id-ID') : '';
}

function attachNominalFormatter(target) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el || el.dataset.nominalFormatter === '1') return;

  const syncValue = () => {
    const raw = el.value;
    const cursor = el.selectionStart ?? raw.length;
    const digitsBeforeCursor = raw.slice(0, cursor).replace(/\D/g, '').length;
    const formatted = formatNominalInputValue(raw);
    el.value = formatted;

    let nextCursor = formatted.length;
    if (digitsBeforeCursor > 0) {
      let digitCount = 0;
      for (let i = 0; i < formatted.length; i += 1) {
        if (/\d/.test(formatted[i])) digitCount += 1;
        if (digitCount >= digitsBeforeCursor) {
          nextCursor = i + 1;
          break;
        }
      }
    }

    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(nextCursor, nextCursor);
      } catch (_) {}
    });
  };

  el.addEventListener('input', syncValue);
  el.dataset.nominalFormatter = '1';
  el.value = formatNominalInputValue(el.value);
}

// ---- MATRIX & CHART DINAMIS ----
function renderMatrix(conNeed, conWant, proNeed, proWant) {
  const hasCon = (conNeed + conWant) > 0;
  const hasPro = (proNeed + proWant) > 0;
  const mxEl = document.getElementById('dash-breakdown-matrix');

  if (!hasCon && !hasPro) {
    mxEl.innerHTML = '';
    return;
  }

  let html = `<div class="matrix-grid">
    <div class="matrix-label-row">
      <div></div><div class="matrix-col-hdr">Kebutuhan</div><div class="matrix-col-hdr">Keinginan</div>
    </div>`;

  if (hasCon) {
    html += `<div class="matrix-row">
      <div class="matrix-row-hdr">Consumptive</div>
      <div class="matrix-cell mc-nk" onclick="jumpToMatrixHistory('Kebutuhan', 'Consumptive')" style="cursor:pointer;" title="Lihat Riwayat">${fmtRp(conNeed)}</div>
      <div class="matrix-cell mc-wk" onclick="jumpToMatrixHistory('Keinginan', 'Consumptive')" style="cursor:pointer;" title="Lihat Riwayat">${fmtRp(conWant)}</div>
    </div>`;
  }
  if (hasPro) {
    html += `<div class="matrix-row">
      <div class="matrix-row-hdr">Productive</div>
      <div class="matrix-cell mc-np" onclick="jumpToMatrixHistory('Kebutuhan', 'Productive')" style="cursor:pointer;" title="Lihat Riwayat">${fmtRp(proNeed)}</div>
      <div class="matrix-cell mc-wp" onclick="jumpToMatrixHistory('Keinginan', 'Productive')" style="cursor:pointer;" title="Lihat Riwayat">${fmtRp(proWant)}</div>
    </div>`;
  }
  html += `</div>`;
  mxEl.innerHTML = html;
}

function renderUtilChart(conNeed, conWant, proNeed, proWant) {
  const hasCon = (conNeed + conWant) > 0;
  const hasPro = (proNeed + proWant) > 0;
  const maxTotal = Math.max(conNeed+conWant, proNeed+proWant, 1);
  const chEl = document.getElementById('util-chart');

  if (!hasCon && !hasPro) {
    chEl.innerHTML = '<p class="empty-state" style="padding:10px 0;font-size:13px;">Belum ada pengeluaran bulan ini</p>';
    return;
  }

  const bar = (label, need, want) => {
    const total = need + want;
    if (total === 0) return '';
    const pNeed = (need/maxTotal*100).toFixed(1);
    const pWant = (want/maxTotal*100).toFixed(1);
    return `<div class="uc-row">
      <div class="uc-lbl">${label}</div>
      <div class="uc-bar-wrap">
        <div class="uc-bar">
          ${need>0?`<div class="uc-seg uc-need" style="width:${pNeed}%" title="Kebutuhan: ${fmtRp(need)}"></div>`:''}
          ${want>0?`<div class="uc-seg uc-want" style="width:${pWant}%" title="Keinginan: ${fmtRp(want)}"></div>`:''}
        </div>
        <span class="uc-total">${fmtRp(total)}</span>
      </div>
    </div>`;
  };

  const legend = `<div class="uc-legend">
    <span class="uc-dot uc-need"></span>Kebutuhan
    <span class="uc-dot uc-want" style="margin-left:12px"></span>Keinginan
  </div>`;

  chEl.innerHTML = legend + bar('Consumptive', conNeed, conWant) + bar('Productive', proNeed, proWant);
}

// ---- REKAP PEMASUKAN ----
function renderInRekap(ins) {
  const el = document.getElementById('dash-in-rekap');
  if (!el) return;

  const totalIn = ins.reduce((s,t)=>s+t.nominal,0);
  if (!ins.length) {
    el.innerHTML = '<p class="empty-state" style="font-size:13px;padding:10px 0;">Belum ada pemasukan bulan ini</p>';
    return;
  }

  if (inCatView === 'sub') {
    const subMap = {};
    ins.forEach((t) => {
      const key = t.sub_kategori || t.kategori;
      subMap[key] = (subMap[key] || 0) + t.nominal;
    });
    const sortedSub = Object.entries(subMap).sort((a,b)=>b[1]-a[1]);
    el.innerHTML = sortedSub.map(([label, val]) => {
      const pct = (val/totalIn*100).toFixed(2).replace('.', ',');
      return `<div class="ir-item" onclick='jumpToHistory(${JSON.stringify(label)})' style="cursor:pointer;">
        <div class="ir-head">
          <span class="ir-kat">${label}</span>
          <span class="ir-val in">${fmtRp(val)} <span class="ir-pct">${pct}%</span></span>
        </div>
        <div class="cb-track"><div class="cb-fill" style="width:${Math.round(val/totalIn*100)}%;background:var(--in)"></div></div>
      </div>`;
    }).join('');
    return;
  }

  const catMap = {};
  ins.forEach(t => {
    if (!catMap[t.kategori]) catMap[t.kategori] = { total: 0, subs: {} };
    catMap[t.kategori].total += t.nominal;
    if (t.sub_kategori) catMap[t.kategori].subs[t.sub_kategori] = (catMap[t.kategori].subs[t.sub_kategori]||0) + t.nominal;
  });
  const sorted = Object.entries(catMap).sort((a,b)=>b[1].total-a[1].total);
  const mx = sorted[0]?.[1].total || 1;

  el.innerHTML = sorted.map(([kat, data]) => {
    const pct = (data.total/totalIn*100).toFixed(2).replace('.', ',');
    const subRows = inShowSubs
      ? Object.entries(data.subs).sort((a,b)=>b[1]-a[1])
        .map(([sub,val])=>`<div class="ir-sub"><span>${sub}</span><span>${fmtRp(val)}</span></div>`).join('')
      : '';
    return `<div class="ir-item" onclick='jumpToHistory(${JSON.stringify(kat)})' style="cursor:pointer;">
      <div class="ir-head">
        <span class="ir-kat">${kat}</span>
        <span class="ir-val in">${fmtRp(data.total)} <span class="ir-pct">${pct}%</span></span>
      </div>
      <div class="cb-track"><div class="cb-fill" style="width:${Math.round(data.total/totalIn*100)}%;background:var(--in)"></div></div>
      ${inShowSubs ? `<div class="ir-subs">${subRows}</div>` : ''}
    </div>`;
  }).join('');
}

function renderOutRekap(outs) {
  const el = document.getElementById('dash-out-rekap');
  const btnShow = document.getElementById('btn-show-all-out');
  if (!el) return;
  const totalOut = outs.reduce((s,t)=>s+t.nominal,0);

  if (!outs.length) {
    el.innerHTML = '<p class="empty-state" style="font-size:13px;padding:10px 0;">Belum ada pengeluaran bulan ini</p>';
    if (btnShow) btnShow.style.display = 'none';
    return;
  }

  if (outCatView === 'sub') {
    const subMap = {};
    outs.forEach((t) => {
      const key = t.sub_kategori || t.kategori;
      subMap[key] = (subMap[key] || 0) + t.nominal;
    });
    let sortedSub = Object.entries(subMap).sort((a,b)=>b[1]-a[1]);
    const totalItems = sortedSub.length;
    if (!showAllOut) sortedSub = sortedSub.slice(0, 8);

    if (btnShow) {
      if (totalItems > 8) {
        btnShow.style.display = 'block';
        btnShow.textContent = showAllOut ? 'Sembunyikan' : `Lihat Semua (${totalItems})`;
      } else {
        btnShow.style.display = 'none';
      }
    }

    el.innerHTML = sortedSub.map(([label, val]) => {
      const pct = (val/totalOut*100).toFixed(2).replace('.', ',');
      return `<div class="ir-item" onclick='jumpToHistory(${JSON.stringify(label)})' style="cursor:pointer;">
        <div class="ir-head">
          <span class="ir-kat">${label}</span>
          <span class="ir-val out">${fmtRp(val)} <span class="ir-pct">${pct}%</span></span>
        </div>
        <div class="cb-track"><div class="cb-fill" style="width:${Math.round(val/totalOut*100)}%;background:var(--out)"></div></div>
      </div>`;
    }).join('');
    return;
  }

  const catMap = {};
  outs.forEach(t => {
    if (!catMap[t.kategori]) catMap[t.kategori] = { total: 0, subs: {} };
    catMap[t.kategori].total += t.nominal;
    if (t.sub_kategori) catMap[t.kategori].subs[t.sub_kategori] = (catMap[t.kategori].subs[t.sub_kategori]||0) + t.nominal;
  });
  let sorted = Object.entries(catMap).sort((a,b)=>b[1].total-a[1].total);
  const totalItems = sorted.length;
  if (!showAllOut) sorted = sorted.slice(0, 8);

  if (btnShow) {
    if (totalItems > 8) {
      btnShow.style.display = 'block';
      btnShow.textContent = showAllOut ? 'Sembunyikan' : `Lihat Semua (${totalItems})`;
    } else {
      btnShow.style.display = 'none';
    }
  }

  el.innerHTML = sorted.map(([kat, data]) => {
    const pct = (data.total/totalOut*100).toFixed(2).replace('.', ',');
    const subRows = outShowSubs
      ? Object.entries(data.subs).sort((a,b)=>b[1]-a[1])
        .map(([sub,val])=>`<div class="ir-sub"><span>${sub}</span><span>${fmtRp(val)}</span></div>`).join('')
      : '';
    return `<div class="ir-item" onclick='jumpToHistory(${JSON.stringify(kat)})' style="cursor:pointer;">
      <div class="ir-head">
        <span class="ir-kat">${kat}</span>
        <span class="ir-val out">${fmtRp(data.total)} <span class="ir-pct">${pct}%</span></span>
      </div>
      <div class="cb-track"><div class="cb-fill" style="width:${Math.round(data.total/totalOut*100)}%;background:var(--out)"></div></div>
      ${outShowSubs ? `<div class="ir-subs">${subRows}</div>` : ''}
    </div>`;
  }).join('');
}

function switchInView(view) {
  inCatView = view;
  document.getElementById('in-csw-cat').classList.toggle('active', view === 'cat');
  document.getElementById('in-csw-sub').classList.toggle('active', view === 'sub');
  
  const toggleRincian = document.getElementById('in-toggle-rincian');
  if (toggleRincian) toggleRincian.style.display = (view === 'sub') ? 'none' : 'inline-flex';

  const mon = selMonth('dash-month-filter');
  const ins = (mon === 'all') ? allTrx.filter(t=>t.type==='in') : allTrx.filter(t=>monthKey(t.tanggal)===mon&&t.type==='in');
  renderInRekap(ins);
}

function toggleInSubs() {
  inShowSubs = !inShowSubs;
  document.getElementById('in-csw-hide').classList.toggle('active', !inShowSubs);
  document.getElementById('in-csw-show').classList.toggle('active', inShowSubs);
  const mon = selMonth('dash-month-filter');
  const ins = (mon === 'all') ? allTrx.filter(t=>t.type==='in') : allTrx.filter(t=>monthKey(t.tanggal)===mon&&t.type==='in');
  renderInRekap(ins);
}

function switchOutView(view) {
  outCatView = view;
  document.getElementById('out-csw-cat').classList.toggle('active', view === 'cat');
  document.getElementById('out-csw-sub').classList.toggle('active', view === 'sub');

  const toggleRincian = document.getElementById('out-toggle-rincian');
  if (toggleRincian) toggleRincian.style.display = (view === 'sub') ? 'none' : 'inline-flex';

  const mon = selMonth('dash-month-filter');
  const outs = (mon === 'all') ? allTrx.filter(t=>t.type==='out') : allTrx.filter(t=>monthKey(t.tanggal)===mon&&t.type==='out');
  renderOutRekap(outs);
}

function toggleOutSubs() {
  outShowSubs = !outShowSubs;
  document.getElementById('out-csw-hide').classList.toggle('active', !outShowSubs);
  document.getElementById('out-csw-show').classList.toggle('active', outShowSubs);
  const mon = selMonth('dash-month-filter');
  const outs = (mon === 'all') ? allTrx.filter(t=>t.type==='out') : allTrx.filter(t=>monthKey(t.tanggal)===mon&&t.type==='out');
  renderOutRekap(outs);
}

function toggleShowAllOut() {
  showAllOut = !showAllOut;
  const mon = selMonth('dash-month-filter');
  const outs = (mon === 'all') ? allTrx.filter(t=>t.type==='out') : allTrx.filter(t=>monthKey(t.tanggal)===mon&&t.type==='out');
  renderOutRekap(outs);
}

// ---- RINCIAN PENGELUARAN (Switch & Expand All) ----
function switchCatView(view) {
  catView = view;
  document.getElementById('csw-cat').classList.toggle('active', view === 'cat');
  document.getElementById('csw-sub').classList.toggle('active', view === 'sub');
  
  const mon  = selMonth('dash-month-filter');
  const outs = (mon === 'all') ? allTrx.filter(t=>t.type==='out') : allTrx.filter(t => monthKey(t.tanggal) === mon && t.type === 'out');
  renderTopBars(outs);
}

function toggleExpandAll() {
  isAllExpanded = !isAllExpanded;
  const mon  = selMonth('dash-month-filter');
  const outs = (mon === 'all') ? allTrx.filter(t=>t.type==='out') : allTrx.filter(t => monthKey(t.tanggal) === mon && t.type === 'out');
  
  const map = {};
  outs.forEach(t => { if (t.sub_kategori) map[t.kategori] = true; });
  Object.keys(map).forEach(k => { expandedCats[k] = isAllExpanded; });
  
  renderTopBars(outs);
}

function toggleCat(kat) {
  expandedCats[kat] = !expandedCats[kat];
  const mon  = selMonth('dash-month-filter');
  const outs = (mon === 'all') ? allTrx.filter(t=>t.type==='out') : allTrx.filter(t => monthKey(t.tanggal) === mon && t.type === 'out');
  renderTopBars(outs);
}

function toggleShowAllCat() {
  showAllCat = !showAllCat;
  const mon  = selMonth('dash-month-filter');
  const outs = (mon === 'all') ? allTrx.filter(t=>t.type==='out') : allTrx.filter(t => monthKey(t.tanggal) === mon && t.type === 'out');
  renderTopBars(outs);
}

function jumpToHistory(kat) {
  // Samakan bulan
  const mon = selMonth('dash-month-filter');
  document.getElementById('hist-month-filter').value = mon;

  // -- SAPU BERSIH SEMUA FILTER LAIN --
  const typeFilter = document.getElementById('hist-type-filter');
  const urgFilter = document.getElementById('hist-urg-filter');
  const utilFilter = document.getElementById('hist-util-filter');
  const searchEl = document.getElementById('hist-search');
  
  if (typeFilter) typeFilter.value = '';
  if (urgFilter) urgFilter.value = '';
  if (utilFilter) utilFilter.value = '';
  if (searchEl) searchEl.value = '';

  // Set filter kategori sesuai yang diklik
  histCatFilter = kat;
  showPage('history');
}

function renderTopBars(outs) {
  const map = {};
  
  if (catView === 'cat') {
    outs.forEach(t => {
      if (!map[t.kategori]) map[t.kategori] = { total: 0, subs: {} };
      map[t.kategori].total += t.nominal;
      if (t.sub_kategori) map[t.kategori].subs[t.sub_kategori] = (map[t.kategori].subs[t.sub_kategori] || 0) + t.nominal;
    });
  } else {
    outs.forEach(t => {
      const key = t.sub_kategori ? t.kategori + ' › ' + t.sub_kategori : t.kategori;
      if (!map[key]) map[key] = { total: 0, subs: {} };
      map[key].total += t.nominal;
    });
  }

  let sorted = Object.entries(map).sort((a,b) => b[1].total - a[1].total);
  const totalItems = sorted.length;
  
  if (!showAllCat) sorted = sorted.slice(0, 8);

  const mx = sorted[0]?.[1].total || 1;
  const barsEl = document.getElementById('dash-cat-bars');
  const btnShow = document.getElementById('btn-show-all-cat');
  const btnExpandAll = document.getElementById('btn-expand-all');

  if (!sorted.length) {
    barsEl.innerHTML = '<p class="empty-state" style="padding:12px 0;font-size:13px;">Belum ada pengeluaran bulan ini</p>';
    if(btnShow) btnShow.style.display = 'none';
    if(btnExpandAll) btnExpandAll.style.display = 'none';
    return;
  }

  let hasAnySubs = false;

  barsEl.innerHTML = sorted.map(([kat, data]) => {
    if (catView === 'sub') {
      return `
        <div class="cb-group">
          <div class="cb-row">
            <div class="cb-label"><span>${kat}</span><span>${fmtRp(data.total)}</span></div>
            <div class="cb-track"><div class="cb-fill" style="width:${(data.total/mx*100).toFixed(1)}%"></div></div>
          </div>
        </div>`;
    } else {
      const isExp = expandedCats[kat];
      const hasSubs = Object.keys(data.subs).length > 0;
      if(hasSubs) hasAnySubs = true;
      let subHtml = '';

      if (isExp && hasSubs) {
        const subSorted = Object.entries(data.subs).sort((a,b) => b[1]-a[1]);
        subHtml = `<div class="cb-sub-list">` + subSorted.map(([sKat, sVal]) => `
          <div class="cb-sub-row">
            <div class="cb-label"><span>${sKat}</span><span>${fmtRp(sVal)}</span></div>
            <div class="cb-track" style="height:4px;"><div class="cb-fill" style="width:${(sVal/data.total*100).toFixed(1)}%;background:var(--text-3)"></div></div>
          </div>
        `).join('') + `</div>`;
      }

      return `
        <div class="cb-group">
          <div class="cb-row" ${hasSubs ? `onclick="toggleCat('${kat}')" style="cursor:pointer;"` : ''}>
            <div class="cb-label">
              <span class="cb-label-main">
                <span style="display:flex;align-items:center;gap:5px;">
                  ${kat}
                  ${hasSubs ? `<svg class="chevron ${isExp?'open':''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>` : ''}
                </span>
                <button class="cb-jump" type="button" onclick='event.stopPropagation();jumpToHistory(${JSON.stringify(kat)})'>→ Riwayat</button>
              </span>
              <span>${fmtRp(data.total)}</span>
            </div>
            <div class="cb-track"><div class="cb-fill" style="width:${(data.total/mx*100).toFixed(1)}%"></div></div>
          </div>
          ${subHtml}
        </div>`;
    }
  }).join('');

  if (btnShow) {
    if (totalItems > 8) {
      btnShow.style.display = 'block';
      btnShow.textContent = showAllCat ? 'Sembunyikan' : `Lihat Semua (${totalItems})`;
    } else {
      btnShow.style.display = 'none';
    }
  }

  if (btnExpandAll) {
    if (catView === 'cat' && hasAnySubs) {
      btnExpandAll.style.display = 'block';
      btnExpandAll.textContent = isAllExpanded ? 'Tutup Semua Rincian ↑' : 'Buka Semua Rincian ↓';
    } else {
      btnExpandAll.style.display = 'none';
    }
  }
}

function getFilteredHistoryTrx() {
  const mon    = selMonth('hist-month-filter');
  const type   = document.getElementById('hist-type-filter')?.value || '';
  const urg    = document.getElementById('hist-urg-filter')?.value  || '';
  const util   = document.getElementById('hist-util-filter')?.value || ''; // Tambahan baru
  const search = (document.getElementById('hist-search')?.value || '').toLowerCase().trim();

  let trx = (mon === 'all') ? allTrx : allTrx.filter(t => monthKey(t.tanggal) === mon);
  if (type)   trx = trx.filter(t => t.type === type);
  if (urg)    trx = trx.filter(t => t.urgensi === urg);
  if (util)   trx = trx.filter(t => t.utilitas === util); // Tambahan baru
  if (histCatFilter) trx = trx.filter(t => t.kategori === histCatFilter || t.sub_kategori === histCatFilter);
  if (search) trx = trx.filter(t =>
    (t.deskripsi + t.kategori + t.sub_kategori).toLowerCase().includes(search)
  );
  return trx;
}

function jumpToMatrixHistory(urgensi, utilitas) {
  // Samakan bulan
  const mon = selMonth('dash-month-filter');
  document.getElementById('hist-month-filter').value = mon;
  
  // -- SAPU BERSIH FILTER KATEGORI & PENCARIAN --
  histCatFilter = ''; 
  const searchEl = document.getElementById('hist-search');
  if (searchEl) searchEl.value = '';
  
  // Set filter dropdown spesifik untuk matrix
  document.getElementById('hist-type-filter').value = 'out'; // Pastikan Pengeluaran
  document.getElementById('hist-urg-filter').value = urgensi;
  document.getElementById('hist-util-filter').value = utilitas;
  
  // Pindah halaman
  showPage('history');
}

// ---- HISTORY ----
function loadHistory() {
  const trx = getFilteredHistoryTrx();

  // --- LOGIKA BARU: STATEFUL COLORING ---
  const currentMonth = todayISO().slice(0, 7);
  const filterIds = [
    { id: 'hist-month-filter', default: currentMonth },
    { id: 'hist-type-filter',  default: '' },
    { id: 'hist-urg-filter',   default: '' },
    { id: 'hist-util-filter',  default: '' }
  ];

  filterIds.forEach(f => {
    const el = document.getElementById(f.id);
    if (el) {
      // Jika nilai tidak sama dengan default, beri class 'active'
      if (el.value !== f.default && el.value !== 'all') {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });
  // ---------------------------------------

  const chipEl = document.getElementById('hist-cat-chip');
  if (chipEl) {
    chipEl.innerHTML = histCatFilter
      ? `<button type="button" class="hist-filter-chip" onclick="histCatFilter='';loadHistory()">Filter: ${escapeHtml(histCatFilter)} ✕</button>`
      : '';
  }

  const totalIn  = trx.filter(t=>t.type==='in').reduce((s,t)=>s+t.nominal,0);
  const totalOut = trx.filter(t=>t.type==='out').reduce((s,t)=>s+t.nominal,0);
  const saldo    = totalIn - totalOut;

  document.getElementById('hist-summary').innerHTML = `
    <div class="hs-item"><div class="hs-label">Masuk</div><div class="hs-val" style="color:var(--in)">${fmtRp(totalIn)}</div></div>
    <div class="hs-item"><div class="hs-label">Keluar</div><div class="hs-val" style="color:var(--out)">${fmtRp(totalOut)}</div></div>
    <div class="hs-item"><div class="hs-label">Saldo</div><div class="hs-val" style="color:${saldo>=0?'var(--in)':'var(--out)'}">${fmtRp(Math.abs(saldo))}</div></div>`;

  const listEl  = document.getElementById('history-list');
  const emptyEl = document.getElementById('hist-empty');
  if (!trx.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  const groups = {};
  trx.forEach(t => {
    const key = t.tanggal || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const sortedDates = Object.keys(groups).sort().reverse();
  listEl.innerHTML = sortedDates.map(date => `
    <div class="trx-date-group">${fmtDate(date)}</div>
    ${groups[date].map(trxCard).join('')}
  `).join('');
}

function exportCSV() {
  const trx = getFilteredHistoryTrx();
  if (!trx.length) {
    showToast('Tidak ada transaksi untuk diexport');
    return;
  }

  const rows = [
    ['ID', 'Tanggal', 'Tipe', 'Kategori', 'Sub Kategori', 'Deskripsi', 'Nominal', 'Urgensi', 'Utilitas'],
    ...trx.map((t) => [
      t.id_transaksi || '',
      t.tanggal || '',
      t.type === 'out' ? 'Pengeluaran' : 'Pemasukan',
      t.kategori || '',
      t.sub_kategori || '',
      t.deskripsi || '',
      t.nominal || 0,
      t.urgensi || '',
      t.utilitas || ''
    ])
  ];

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const mon = selMonth('hist-month-filter');
  a.href = url;
  a.download = `budget-${mon === 'all' ? 'all' : mon}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- TRX CARD ----
function trxCard(t) {
  const isOut = t.type === 'out';
  const badges = isOut ? `
    ${t.urgensi ? `<span class="tbadge ${t.urgensi==='Kebutuhan'?'b-need':'b-want'}">${t.urgensi}</span>` : ''}
    ${t.utilitas === 'Productive' ? `<span class="tbadge b-prod">Productive</span>` : ''}
  ` : '';
  return `
    <div class="trx-card" onclick='openTrxModal(${JSON.stringify(JSON.stringify(t))})'>
      <div class="trx-left">
        <div class="trx-desc">${t.deskripsi || '(tanpa deskripsi)'}</div>
        <div class="trx-meta">
          <span>${t.kategori}</span>${t.sub_kategori?`<span>· ${t.sub_kategori}</span>`:''}
          ${badges}
        </div>
      </div>
      <div class="trx-right">
        <div class="trx-amt ${isOut?'out':'in'}">${isOut?'−':'+'}${fmtRp(t.nominal)}</div>
        <div class="trx-date">${fmtDate(t.tanggal)}</div>
      </div>
    </div>`;
}

// ---- TRX DETAIL MODAL ----
function openTrxModal(json) {
  const t = JSON.parse(json);
  const isOut = t.type === 'out';
  const rows = [
    ['Tanggal',   fmtDate(t.tanggal)],
    ['Tipe',      isOut ? 'Pengeluaran' : 'Pemasukan'],
    ['Kategori',  t.kategori],
    ['Sub Kategori', t.sub_kategori],
    ...(isOut ? [
      ['Urgensi',   t.urgensi],
      ['Utilitas',  t.utilitas],
    ] : []),
    ['ID Transaksi', t.id_transaksi || '–'],
  ].filter(([,v]) => v);

  document.getElementById('modal-content').innerHTML = `
    <h2 class="modal-title">${escapeHtml(t.deskripsi || '(tanpa deskripsi)')}</h2>
    <div style="font-size:24px;font-weight:500;color:${isOut?'var(--out)':'var(--in)'};margin-bottom:18px;">${isOut?'−':'+'}${fmtRp(t.nominal)}</div>
    <div style="margin-bottom:16px;">${rows.map(([k,v])=>`<div class="mdetail-row"><span class="mdetail-key">${escapeHtml(k)}</span><span class="mdetail-val">${escapeHtml(v)}</span></div>`).join('')}</div>
    <div class="modal-icon-actions">
      <button class="micon-btn edit" type="button" title="Edit" aria-label="Edit transaksi" onclick='openEditModal(${JSON.stringify(JSON.stringify(t))})'>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="micon-btn dup" type="button" title="Duplikasi" aria-label="Duplikasi transaksi" onclick='openDuplicateModal(${JSON.stringify(JSON.stringify(t))})'>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="micon-btn del" type="button" title="Hapus" aria-label="Hapus transaksi" onclick='confirmDelete(${JSON.stringify(JSON.stringify(t))})'>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
      <button class="micon-btn close" type="button" title="Tutup" aria-label="Tutup modal" onclick="closeModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  openModal();
}

// ---- EDIT MODAL ----
function openEditModal(json) {
  const t = JSON.parse(json);
  const isOut = t.type === 'out';
  const cats = isOut ? CATS_OUT : CATS_IN;
  const catKeys = Object.keys(cats);
  const activeKat = catKeys.includes(t.kategori) ? t.kategori : (catKeys[0] || '');
  const subs = cats[activeKat] || [];
  const activeSub = subs.includes(t.sub_kategori) ? t.sub_kategori : (subs[0] || '');

  document.getElementById('modal-content').innerHTML = `
    <h2 class="modal-title">Edit Transaksi</h2>
    <div class="modal-field"><label>Deskripsi</label><input id="e-desc" value="${escapeHtml(t.deskripsi || '')}" /></div>
    <div class="modal-field"><label>Nominal (Rp)</label><input id="e-nominal" type="text" inputmode="numeric" value="${formatNominalInputValue(t.nominal)}" style="text-align:right" /></div>
    <div class="modal-field"><label>Tanggal</label><input id="e-tgl" type="date" value="${t.tanggal}" /></div>
    <div class="modal-field"><label>Kategori</label>
      <select id="e-kat" onchange="editUpdateSub(${isOut})">${catKeys.map(c=>`<option value="${escapeHtml(c)}" ${activeKat===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
    </div>
    <div class="modal-field"><label>Sub Kategori</label>
      <select id="e-sub">${subs.map(s=>`<option value="${escapeHtml(s)}" ${activeSub===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select>
    </div>
    ${isOut ? `
    <div class="modal-field"><label>Urgensi</label>
      <select id="e-urg"><option ${t.urgensi==='Kebutuhan'?'selected':''}>Kebutuhan</option><option ${t.urgensi==='Keinginan'?'selected':''}>Keinginan</option></select>
    </div>
    <div class="modal-field"><label>Utilitas</label>
      <select id="e-util"><option ${t.utilitas==='Consumptive'?'selected':''}>Consumptive</option><option ${t.utilitas==='Productive'?'selected':''}>Productive</option></select>
    </div>` : ''}
    <div class="modal-actions">
      <button class="mbtn sec" onclick='openTrxModal(${JSON.stringify(JSON.stringify(t))})'>Batal</button>
      <button class="mbtn pri" onclick='doEdit(${JSON.stringify(JSON.stringify(t))})'>Simpan</button>
    </div>`;
  attachNominalFormatter('e-nominal');
  openModal();
}

function openDuplicateModal(json) {
  const t = JSON.parse(json);
  const isOut = t.type === 'out';
  const cats = isOut ? CATS_OUT : CATS_IN;
  const catKeys = Object.keys(cats);
  const activeKat = catKeys.includes(t.kategori) ? t.kategori : (catKeys[0] || '');
  const subs = cats[activeKat] || [];
  const activeSub = subs.includes(t.sub_kategori) ? t.sub_kategori : (subs[0] || '');

  document.getElementById('modal-content').innerHTML = `
    <h2 class="modal-title">Duplikasi Transaksi</h2>
    <div class="modal-field"><label>Deskripsi</label><input id="e-desc" value="${escapeHtml(t.deskripsi || '')}" /></div>
    <div class="modal-field"><label>Nominal (Rp)</label><input id="e-nominal" type="text" inputmode="numeric" value="${formatNominalInputValue(t.nominal)}" style="text-align:right" /></div>
    <div class="modal-field"><label>Tanggal</label><input id="e-tgl" type="date" value="${todayISO()}" /></div>
    <div class="modal-field"><label>Kategori</label>
      <select id="e-kat" onchange="editUpdateSub(${isOut})">${catKeys.map(c=>`<option value="${escapeHtml(c)}" ${activeKat===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
    </div>
    <div class="modal-field"><label>Sub Kategori</label>
      <select id="e-sub">${subs.map(s=>`<option value="${escapeHtml(s)}" ${activeSub===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select>
    </div>
    ${isOut ? `
    <div class="modal-field"><label>Urgensi</label>
      <select id="e-urg"><option ${t.urgensi==='Kebutuhan'?'selected':''}>Kebutuhan</option><option ${t.urgensi==='Keinginan'?'selected':''}>Keinginan</option></select>
    </div>
    <div class="modal-field"><label>Utilitas</label>
      <select id="e-util"><option ${t.utilitas==='Consumptive'?'selected':''}>Consumptive</option><option ${t.utilitas==='Productive'?'selected':''}>Productive</option></select>
    </div>` : ''}
    <div class="modal-actions">
      <button class="mbtn sec" onclick='openTrxModal(${JSON.stringify(JSON.stringify(t))})'>Batal</button>
      <button class="mbtn pri" onclick='doDuplicate(${JSON.stringify(JSON.stringify(t))})'>Simpan Baru</button>
    </div>`;
  attachNominalFormatter('e-nominal');
  openModal();
}

function editUpdateSub(isOut) {
  const kat  = document.getElementById('e-kat').value;
  const cats = isOut ? CATS_OUT : CATS_IN;
  document.getElementById('e-sub').innerHTML = (cats[kat]||[]).map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

async function doEdit(json) {
  const orig  = JSON.parse(json);
  const isOut = orig.type === 'out';
  const updated = {
    ...orig,
    deskripsi:    document.getElementById('e-desc').value.trim() || '(tanpa deskripsi)',
    nominal:      parseNominalInputValue(document.getElementById('e-nominal').value),
    tanggal:      document.getElementById('e-tgl').value,
    kategori:     document.getElementById('e-kat').value,
    sub_kategori: document.getElementById('e-sub').value,
    ...(isOut ? { urgensi: document.getElementById('e-urg').value, utilitas: document.getElementById('e-util').value } : {})
  };
  if (!updated.nominal) { showToast('Isi nominal dulu'); return; }
  if (!updated.tanggal) { showToast('Isi tanggal dulu'); return; }

  // Indikator Loading Nyala
  const btn = document.querySelector('.modal-actions .mbtn.pri');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

  try {
    await Sheets.updateTransaction(updated);
    closeModal(); // Modal baru ditutup SETELAH berhasil simpan
    showToast('Transaksi diperbarui ✓');
    await refreshData();
  } catch(e) { 
    showToast('Gagal update: ' + e.message); 
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
  }
}

async function doDuplicate(json) {
  const orig = JSON.parse(json);
  const isOut = orig.type === 'out';
  const duplicated = {
    type:         orig.type,
    deskripsi:    document.getElementById('e-desc').value.trim() || '(tanpa deskripsi)',
    nominal:      parseNominalInputValue(document.getElementById('e-nominal').value),
    tanggal:      document.getElementById('e-tgl').value || todayISO(),
    kategori:     document.getElementById('e-kat').value,
    sub_kategori: document.getElementById('e-sub').value,
    ...(isOut ? {
      urgensi:  document.getElementById('e-urg').value,
      utilitas: document.getElementById('e-util').value,
    } : { urgensi: '', utilitas: '' })
  };
  if (!duplicated.nominal) { showToast('Isi nominal dulu'); return; }
  if (!duplicated.tanggal) { showToast('Isi tanggal dulu'); return; }

  // Indikator Loading Nyala
  const btn = document.querySelector('.modal-actions .mbtn.pri');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

  try {
    await Sheets.addTransaction(duplicated);
    closeModal(); // Modal baru ditutup SETELAH berhasil simpan
    showToast('Transaksi diduplikasi ✓');
    await refreshData();
  } catch (e) {
    showToast('Gagal duplikasi: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan Baru'; }
  }
}

// ---- DELETE ----
function confirmDelete(json) {
  const t = JSON.parse(json);
  document.getElementById('modal-content').innerHTML = `
    <h2 class="modal-title">Hapus Transaksi?</h2>
    <p style="font-size:14px;color:var(--text-2);margin-bottom:22px;">"${t.deskripsi}" — ${fmtRp(t.nominal)}<br>Aksi ini tidak bisa dibatalkan.</p>
    <div class="modal-actions">
      <button class="mbtn sec" onclick="closeModal()">Batal</button>
      <button class="mbtn del" onclick='doDelete(${JSON.stringify(JSON.stringify(t))})'>Hapus</button>
    </div>`;
}

async function doDelete(json) {
  const t = JSON.parse(json);
  closeModal();
  try {
    await Sheets.deleteTransaction(t);
    showToast('Transaksi dihapus');
    await refreshData();
  } catch(e) { showToast('Gagal hapus: ' + e.message); }
}

// ---- INPUT TABS ----
function switchInputTab(tab) {
  document.getElementById('itab-ai').classList.toggle('active', tab === 'ai');
  document.getElementById('itab-manual').classList.toggle('active', tab === 'manual');
  document.getElementById('input-ai-section').classList.toggle('hidden', tab !== 'ai');
  document.getElementById('input-manual-section').classList.toggle('hidden', tab !== 'manual');
  if (tab === 'manual') initManualForm();
}

// ---- AI INPUT ----
async function parseWithAI() {
  const txt = document.getElementById('ai-text').value.trim();
  if (!txt) { showToast('Tulis deskripsi transaksinya dulu'); return; }

  const btnEl   = document.getElementById('btn-parse');
  const loadEl  = document.getElementById('ai-loading');
  const errEl   = document.getElementById('ai-error');
  const resEl   = document.getElementById('ai-result');

  btnEl.disabled = true;
  loadEl.classList.remove('hidden');
  errEl.classList.add('hidden');
  resEl.classList.add('hidden');

  try {
    pendingTrx = await AI.parse(txt);
    showAIResult(pendingTrx, resEl);
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    loadEl.classList.add('hidden');
    btnEl.disabled = false;
  }
}

function showAIResult(t, el) {
  const isOut = t.type === 'out';
  const cats = isOut ? CATS_OUT : CATS_IN;
  const catKeys = Object.keys(cats);
  const activeKat = catKeys.includes(t.kategori) ? t.kategori : (catKeys[0] || '');
  const subs = cats[activeKat] || [];
  const activeSub = subs.includes(t.sub_kategori) ? t.sub_kategori : (subs[0] || '');
  const catOpts = catKeys.map(c=>`<option value="${escapeHtml(c)}" ${activeKat===c?'selected':''}>${escapeHtml(c)}</option>`).join('');
  const subOpts = subs.map(s=>`<option value="${escapeHtml(s)}" ${activeSub===s?'selected':''}>${escapeHtml(s)}</option>`).join('');

  el.innerHTML = `
    <div class="rp-head">
      <div style="flex:1">
        <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Deskripsi</div>
        <input class="rp-edit-input" id="pre-desc" value="${escapeHtml(t.deskripsi || '')}" />
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Nominal</div>
        <input class="rp-edit-input" id="pre-nominal" type="text" inputmode="numeric" value="${formatNominalInputValue(t.nominal)}" style="text-align:right;width:120px" />
      </div>
    </div>
    <div class="rp-fields">
      <div class="rp-row"><span class="rp-key">Tipe</span><span class="rp-val">${isOut?'↓ Pengeluaran':'↑ Pemasukan'}</span></div>
      <div class="rp-row"><span class="rp-key">Tanggal</span>
        <input class="rp-edit-input" id="pre-tgl" type="date" value="${t.tanggal}" style="width:auto;font-size:13px" />
      </div>
      <div class="rp-row"><span class="rp-key">Kategori</span>
        <select class="rp-edit-sel" id="pre-kat" onchange="previewUpdateSub(${isOut})">${catOpts}</select>
      </div>
      <div class="rp-row"><span class="rp-key">Sub Kategori</span>
        <select class="rp-edit-sel" id="pre-sub">${subOpts}</select>
      </div>
      ${isOut ? `
      <div class="rp-row"><span class="rp-key">Urgensi</span>
        <select class="rp-edit-sel" id="pre-urg">
          <option ${t.urgensi==='Kebutuhan'?'selected':''}>Kebutuhan</option>
          <option ${t.urgensi==='Keinginan'?'selected':''}>Keinginan</option>
        </select>
      </div>
      <div class="rp-row"><span class="rp-key">Utilitas</span>
        <select class="rp-edit-sel" id="pre-util">
          <option ${t.utilitas==='Consumptive'?'selected':''}>Consumptive</option>
          <option ${t.utilitas==='Productive'?'selected':''}>Productive</option>
        </select>
      </div>` : ''}
    </div>
    <div class="rp-actions">
      <button class="btn-save" onclick="saveAI()">Simpan</button>
      <button class="btn-cancel" onclick="cancelAI()">Batal</button>
    </div>`;
  attachNominalFormatter('pre-nominal');
  el.classList.remove('hidden');
}

function previewUpdateSub(isOut) {
  const cats = isOut ? CATS_OUT : CATS_IN;
  const kat  = document.getElementById('pre-kat').value;
  document.getElementById('pre-sub').innerHTML = (cats[kat]||[]).map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

async function saveAI() {
  if (!pendingTrx) return;
  const isOut = pendingTrx.type === 'out';
  const finalTrx = {
    ...pendingTrx,
    deskripsi:    document.getElementById('pre-desc')?.value    || pendingTrx.deskripsi,
    nominal:      parseNominalInputValue(document.getElementById('pre-nominal')?.value) || pendingTrx.nominal,
    tanggal:      document.getElementById('pre-tgl')?.value     || pendingTrx.tanggal,
    kategori:     document.getElementById('pre-kat')?.value     || pendingTrx.kategori,
    sub_kategori: document.getElementById('pre-sub')?.value     || pendingTrx.sub_kategori,
    ...(isOut ? {
      urgensi:  document.getElementById('pre-urg')?.value  || pendingTrx.urgensi,
      utilitas: document.getElementById('pre-util')?.value || pendingTrx.utilitas,
    } : {})
  };

  // Indikator Loading Nyala
  const btn = document.querySelector('#ai-result .btn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

  try {
    await Sheets.addTransaction(finalTrx);
    pendingTrx = null;
    document.getElementById('ai-text').value = '';
    document.getElementById('ai-result').classList.add('hidden');
    showToast('Transaksi tersimpan ✓');
    await refreshData();
  } catch(e) { 
    showToast('Gagal simpan: ' + e.message); 
    // Kembalikan tombol jika gagal
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
  }
}

function cancelAI() {
  pendingTrx = null;
  document.getElementById('ai-result').classList.add('hidden');
}

// ---- MANUAL FORM ----
function initManualForm() {
  const wrap = document.getElementById('manual-form-wrap');
  if (!wrap) return;
  if (!wrap.innerHTML) wrap.innerHTML = buildManualForm();
  attachNominalFormatter('m-nominal');
  setManualType(manualType);
}

function buildManualForm() {
  return `
    <div class="manual-form">
      <div class="mf-tipe-row">
        <button class="tipe-btn active-out" id="m-btn-out" onclick="setManualType('out')">↓ Pengeluaran</button>
        <button class="tipe-btn" id="m-btn-in" onclick="setManualType('in')">↑ Pemasukan</button>
      </div>
      <div class="mf-field"><label>Deskripsi</label><input id="m-desc" placeholder="Makan siang, bayar listrik, gaji, dll" /></div>
      <div class="mf-field"><label>Nominal (Rp)</label><input id="m-nominal" type="text" inputmode="numeric" placeholder="50.000" style="text-align:right" /></div>
      <div class="mf-field"><label>Tanggal</label><input id="m-tgl" type="date" value="${todayISO()}" /></div>
      <div class="mf-field"><label>Kategori</label><select id="m-kat" onchange="updateManualKat()"></select></div>
      <div class="mf-field"><label>Sub Kategori</label><select id="m-sub"></select></div>
      <div id="m-out-extras">
        <div class="mf-field"><label>Urgensi</label>
          <select id="m-urg"><option>Kebutuhan</option><option>Keinginan</option></select>
        </div>
        <div class="mf-field"><label>Utilitas</label>
          <select id="m-util"><option>Consumptive</option><option>Productive</option></select>
        </div>
      </div>
      <button class="btn-save" style="width:100%;margin-top:4px;" onclick="saveManual()">Simpan Transaksi</button>
    </div>`;
}

function setManualType(type) {
  manualType = type;
  const isOut = type === 'out';
  document.getElementById('m-btn-out').className = 'tipe-btn' + (isOut ? ' active-out' : '');
  document.getElementById('m-btn-in').className  = 'tipe-btn' + (!isOut ? ' active-in' : '');
  document.getElementById('m-out-extras').style.display = isOut ? '' : 'none';
  updateManualKat();
}

function updateManualKat() {
  const katEl = document.getElementById('m-kat');
  const subEl = document.getElementById('m-sub');
  if (!katEl || !subEl) return;

  const cats = manualType === 'out' ? CATS_OUT : CATS_IN;
  const catKeys = Object.keys(cats);
  const prevKat = katEl.value;

  if (!catKeys.length) {
    katEl.innerHTML = '';
    subEl.innerHTML = '';
    return;
  }

  katEl.innerHTML = catKeys.map(c => `<option value="${escapeHtml(c)}" ${prevKat === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  const activeKat = catKeys.includes(prevKat) ? prevKat : catKeys[0];
  katEl.value = activeKat;

  const prevSub = subEl.value;
  const subs = cats[activeKat] || [];
  subEl.innerHTML = subs.map(s => `<option value="${escapeHtml(s)}" ${prevSub === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
  if (subs.length) {
    subEl.value = subs.includes(prevSub) ? prevSub : subs[0];
  }
}

async function saveManual() {
  const isOut = manualType === 'out';
  const trx = {
    type:         manualType,
    deskripsi:    document.getElementById('m-desc').value.trim() || '(tanpa deskripsi)',
    nominal:      parseNominalInputValue(document.getElementById('m-nominal').value),
    tanggal:      document.getElementById('m-tgl').value,
    kategori:     document.getElementById('m-kat').value,
    sub_kategori: document.getElementById('m-sub').value,
    ...(isOut ? {
      urgensi:  document.getElementById('m-urg').value,
      utilitas: document.getElementById('m-util').value,
    } : { urgensi: '', utilitas: '' })
  };
  if (!trx.nominal) { showToast('Isi nominal dulu'); return; }
  if (!trx.tanggal) { showToast('Isi tanggal dulu'); return; }

  // Indikator Loading Nyala
  const btn = document.querySelector('.manual-form .btn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

  try {
    await Sheets.addTransaction(trx);
    showToast('Tersimpan ✓');
    document.getElementById('m-desc').value   = '';
    document.getElementById('m-nominal').value = '';
    document.getElementById('m-tgl').value    = todayISO();
    await refreshData();
  } catch(e) { 
    showToast('Gagal: ' + e.message); 
  } finally {
    // Indikator Loading Mati
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan Transaksi'; }
  }
}

// ---- SETTINGS ----
function loadSettingsForm() {
  document.getElementById('cfg-sheet-id').value  = getCfg(CFG.SHEET_ID);
  document.getElementById('cfg-google-key').value = getCfg(CFG.GOOGLE_KEY);
  document.getElementById('cfg-gemini-key').value = getCfg(CFG.GEMINI_KEY);
  document.getElementById('cfg-script-url').value = getCfg(CFG.SCRIPT_URL);
  document.getElementById('cfg-sheet-in').value   = getCfg(CFG.SHEET_IN, DEF_SHEET_IN);
  document.getElementById('cfg-sheet-out').value  = getCfg(CFG.SHEET_OUT, DEF_SHEET_OUT);
}

async function saveSettings() {
  const isConfirmed = confirm("Apakah anda yakin ingin menyimpan pengaturan?");
  if (!isConfirmed) {
    showToast('Simpan dibatalkan');
    return;
  }

  setCfg(CFG.SHEET_ID,   document.getElementById('cfg-sheet-id').value.trim());
  setCfg(CFG.GOOGLE_KEY, document.getElementById('cfg-google-key').value.trim());
  setCfg(CFG.GEMINI_KEY, document.getElementById('cfg-gemini-key').value.trim());
  setCfg(CFG.SCRIPT_URL, document.getElementById('cfg-script-url').value.trim());
  setCfg(CFG.SHEET_IN,   document.getElementById('cfg-sheet-in').value.trim()  || DEF_SHEET_IN);
  setCfg(CFG.SHEET_OUT,  document.getElementById('cfg-sheet-out').value.trim() || DEF_SHEET_OUT);

  const msg = document.getElementById('settings-msg');
  msg.textContent = 'Pengaturan tersimpan!';
  msg.className   = 'settings-msg ok';
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2500);

  refreshData().then(() => {
    populateMonthFilters();
    loadDashboard();
  });
}

// ---- MODAL ----
function openModal()  { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// ---- TOAST ----
let _tt;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.add('hidden'), 2800);
}

// ============================================
// LOGIKA HALAMAN BUDGETING
// ============================================

let budgetRules = JSON.parse(localStorage.getItem('budget_rules')) || [];
let editBudgetId = null;

async function syncBudgetRulesToCloud() {
  const url = getCfg(CFG.SCRIPT_URL);
  if (!url) return;
  const array2D = budgetRules.map(r => [
    r.id || '',
    r.scope || '',
    r.target || '',
    r.type || '',
    r.base || '',
    r.baseTarget || '',
    r.limit || 0
  ]);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: "overwrite_all", sheet: "BudgetRules", values: array2D }),
      mode: 'no-cors'
    });
  } catch(e) {
    console.error('Failed to sync budget rules', e);
  }
}

async function fetchBudgetRulesFromCloud() {
  const url = getCfg(CFG.SCRIPT_URL);
  if (!url) return;
  try {
    const res = await fetch(`${url}?action=get_rules`);
    if (!res.ok) return;
    const json = await res.json();
    
    // Perbaikan: Baca json.data, bukan json.values
    if (json && json.ok && Array.isArray(json.data)) {
      let parsedData = [];
      
      // Jika length > 1, berarti ada aturan (baris 0 adalah Header)
      if (json.data.length > 1) {
        const rows = json.data.slice(1);
        parsedData = rows.map(r => ({
          id: r[0],
          scope: r[1],
          target: r[2],
          type: r[3],
          base: r[4] === '' ? null : r[4],
          baseTarget: r[5] === '' ? null : r[5],
          limit: parseInt(r[6], 10) || 0
        }));
      }
      
      budgetRules = parsedData;
      localStorage.setItem('budget_rules', JSON.stringify(parsedData));
      
      if (typeof renderBudgetRules === 'function') renderBudgetRules();
      if (typeof checkBudgetAlerts === 'function') checkBudgetAlerts();
    }
  } catch(e) {
    console.error('Failed to fetch budget rules', e);
  }
}

async function syncBillRemindersToCloud() {
  if (!isRemindersFetched && billReminders.length === 1) {
    console.warn("Sinkronisasi keluar dibatalkan demi keamanan data: Data awan belum berhasil dimuat pada sesi ini.");
    return;
  }
  const url = getCfg(CFG.SCRIPT_URL);
  if (!url) return;
  const array2D = billReminders.map(r => [
    r.id || '',
    r.name || '',
    r.nominal || 0,
    r.freq || '',
    r.interval || 1,
    r.timing || '',
    r.date || '',
    r.kategori || '',
    r.sub_kategori || '',
    r.urgensi || '',
    r.utilitas || '',
    r.settled_history || ''
  ]);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: "overwrite_all", sheet: "Reminders", values: array2D }),
      mode: 'no-cors'
    });
  } catch(e) {
    console.error('Failed to sync bill reminders', e);
  }
}

async function fetchBillRemindersFromCloud() {
  const url = getCfg(CFG.SCRIPT_URL);
  if (!url) return;
  try {
    const res = await fetch(`${url}?action=get_reminders`);
    if (!res.ok) return;
    const json = await res.json();
    
    if (json && json.ok && Array.isArray(json.data)) {
      let parsedData = [];
      
      if (json.data.length > 1) {
        const rows = json.data.slice(1);
        parsedData = rows.map(r => ({
          id: r[0],
          name: r[1],
          nominal: parseFloat(r[2]) || 0,
          freq: r[3],
          interval: parseInt(r[4], 10) || 1,
          timing: r[5],
          date: (() => {
            const d = new Date(r[6]);
            if (!isNaN(d.getTime())) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${m}-${day}`;
            }
            return String(r[6] || '').slice(0, 10);
          })(),
          kategori: r[7] || '',
          sub_kategori: r[8] || '',
          urgensi: r[9] || '',
          utilitas: r[10] || '',
          settled_history: (() => {
            const raw = String(r[11] || '').trim();
            // Jika kosong atau mengandung koma (multi-bulan), biarkan teks aslinya
            if (!raw || raw.includes(',')) return raw;
            
            // Jika tunggal dan tidak sengaja ter-parse jadi ISO Timestamp lengkap oleh Google Sheets
            const d = new Date(raw);
            if (!isNaN(d.getTime()) && (raw.includes('T') || raw.length > 10)) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${m}-${day}`;
            }
            return raw;
          })()
        }));
      }
      
      billReminders = parsedData;
      localStorage.setItem('bill_reminders', JSON.stringify(parsedData));
      isRemindersFetched = true;
      
      if (typeof renderBillReminders === 'function') renderBillReminders();
      if (typeof checkBudgetAlerts === 'function') checkBudgetAlerts();
    }
  } catch(e) {
    console.error('Failed to fetch bill reminders', e);
  }
}

function loadBudgeting() {
  renderBudgetRules();
  toggleBudgetScope();
  toggleBudgetType();
}

// 1. Tampilkan Target Berdasarkan Cakupan
function toggleBudgetScope() {
  const scope = document.getElementById('budget-scope').value;
  const targetRow = document.getElementById('budget-target-row');
  const targetSel = document.getElementById('budget-target');
  const targetLabel = document.getElementById('budget-target-label');
  
  targetSel.innerHTML = '';
  if (scope === 'all') {
    targetRow.classList.add('hidden');
  } else if (scope === 'kategori') {
    targetRow.classList.remove('hidden');
    targetLabel.textContent = 'Pilih Kategori';
    Object.keys(CATS_OUT || {}).forEach(c => targetSel.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
  } else if (scope === 'sub') {
    targetRow.classList.remove('hidden');
    targetLabel.textContent = 'Pilih Sub-Kategori';
    Object.keys(CATS_OUT || {}).forEach(c => {
      const subs = CATS_OUT[c] || [];
      subs.forEach(s => targetSel.innerHTML += `<option value="${escapeHtml(s)}">${escapeHtml(s)} (${escapeHtml(c)})</option>`);
    });
  } else if (scope === 'urgensi') {
    targetRow.classList.remove('hidden');
    targetLabel.textContent = 'Pilih Urgensi';
    ['Kebutuhan', 'Keinginan'].forEach(u => targetSel.innerHTML += `<option value="${u}">${u}</option>`);
  } else if (scope === 'utilitas') {
    targetRow.classList.remove('hidden');
    targetLabel.textContent = 'Pilih Utilitas';
    ['Consumptive', 'Productive'].forEach(ut => targetSel.innerHTML += `<option value="${ut}">${ut}</option>`);
  }
}

// 2. Tampilkan Pembanding & Label Berdasarkan Tipe
function toggleBudgetType() {
  const type = document.getElementById('budget-type').value;
  const baseRow = document.getElementById('budget-base-row');
  const limitLabel = document.getElementById('budget-limit-label');
  const limitInput = document.getElementById('budget-limit');

  limitInput.value = ''; // Selalu kosongkan saat ganti tipe

  if (type === 'percent') {
    baseRow.classList.remove('hidden');
    limitLabel.textContent = 'Batas Persentase (%)';
    limitInput.placeholder = 'Contoh: 15';
  } else {
    baseRow.classList.add('hidden');
    limitLabel.textContent = 'Batas Nominal (Rp)';
    limitInput.placeholder = '0';
    const baseTargetRow = document.getElementById('budget-base-target-row');
    if (baseTargetRow) baseTargetRow.classList.add('hidden');
  }
  toggleBudgetBase();
}

function toggleBudgetBase() {
  const base = document.getElementById('budget-base').value;
  const row = document.getElementById('budget-base-target-row');
  const sel = document.getElementById('budget-base-target');
  const label = document.getElementById('budget-base-target-label');
  if (!row || !sel) return;
  
  sel.innerHTML = '';
  if (base === 'in' || base === 'out' || document.getElementById('budget-type').value !== 'percent') {
    row.classList.add('hidden');
  } else if (base === 'kategori') {
    row.classList.remove('hidden');
    label.textContent = 'Pilih Kategori Pembanding';
    const allCats = [...Object.keys(CATS_IN || {}), ...Object.keys(CATS_OUT || {})];
    const uniqueCats = [...new Set(allCats)];
    uniqueCats.forEach(c => sel.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
  } else if (base === 'sub') {
    row.classList.remove('hidden');
    label.textContent = 'Pilih Sub-Kategori Pembanding';
    
    const combinedCats = {};
    for (let c in (CATS_IN || {})) combinedCats[c] = [...(CATS_IN[c] || [])];
    for (let c in (CATS_OUT || {})) {
      if (!combinedCats[c]) combinedCats[c] = [];
      combinedCats[c] = [...new Set([...combinedCats[c], ...(CATS_OUT[c] || [])])];
    }
    
    Object.keys(combinedCats).forEach(c => {
      combinedCats[c].forEach(s => sel.innerHTML += `<option value="${escapeHtml(s)}">${escapeHtml(s)} (${escapeHtml(c)})</option>`);
    });
  }
}

// 3. Format Otomatis: Ribuan (Rp) vs Puluhan (%)
function formatBudgetLimit(el) {
  const type = document.getElementById('budget-type').value;
  let val = el.value.replace(/[^0-9]/g, ''); // Hapus semua selain angka
  
  if (!val) {
    el.value = '';
    return;
  }

  if (type === 'nominal') {
    el.value = parseInt(val, 10).toLocaleString('id-ID');
  } else {
    let num = parseInt(val, 10);
    if (num > 100) num = 100; // Persen mentok di 100
    el.value = num;
  }
}

// 4. Tombol Tambah Aturan (Selesai Diperbaiki)
function addBudgetRule() {
  const scope = document.getElementById('budget-scope').value;
  const target = document.getElementById('budget-target').value;
  const type = document.getElementById('budget-type').value;
  const base = document.getElementById('budget-base').value;
  const baseTarget = document.getElementById('budget-base-target')?.value || null;
  const limitRaw = document.getElementById('budget-limit').value.replace(/[^0-9]/g, '');
  const limit = parseInt(limitRaw, 10);

  if (!limitRaw || isNaN(limit) || limit <= 0) {
    alert('Masukkan batas nominal atau persentase dengan benar!');
    return;
  }

  if (editBudgetId) {
    const idx = budgetRules.findIndex(x => x.id === editBudgetId);
    if (idx !== -1) {
      budgetRules[idx].scope = scope;
      budgetRules[idx].target = scope === 'all' ? 'Semua Pengeluaran' : target;
      budgetRules[idx].type = type;
      budgetRules[idx].base = type === 'percent' ? base : null;
      budgetRules[idx].baseTarget = (type === 'percent' && (base === 'kategori' || base === 'sub')) ? baseTarget : null;
      budgetRules[idx].limit = limit;
    }
  } else {
    const newRule = {
      id: 'br_' + Date.now(),
      scope: scope,
      target: scope === 'all' ? 'Semua Pengeluaran' : target,
      type: type,
      base: type === 'percent' ? base : null,
      baseTarget: (type === 'percent' && (base === 'kategori' || base === 'sub')) ? baseTarget : null,
      limit: limit
    };
    budgetRules.push(newRule);
  }

  localStorage.setItem('budget_rules', JSON.stringify(budgetRules));
  
  cancelBudgetEdit();
  renderBudgetRules();
  loadDashboard(); // Update peringatan di dashboard
  syncBudgetRulesToCloud();
}

function cancelBudgetEdit() {
  editBudgetId = null;

  document.getElementById('budget-scope').value = 'all';
  toggleBudgetScope();

  document.getElementById('budget-type').value = 'nominal';
  toggleBudgetType();

  document.getElementById('budget-limit').value = '';

  const badge = document.getElementById('budget-edit-badge');
  if (badge) badge.classList.add('hidden');

  const cancelBtn = document.getElementById('btn-cancel-budget');
  if (cancelBtn) cancelBtn.classList.add('hidden');

  const formCard = document.getElementById('budget-form-card');
  if (formCard) formCard.classList.remove('is-editing');

  const btn = document.getElementById('btn-save-budget');
  if (btn) btn.textContent = 'Tambah Aturan';
}

// 5. Render Daftar Aturan
function renderBudgetRules() {
  const list = document.getElementById('budget-rules-list');
  if (!list) return;

  if (budgetRules.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-light);font-size:13px;padding:20px;">Belum ada aturan budget.</div>';
    return;
  }

  list.innerHTML = budgetRules.map(r => {
    let title = r.scope === 'all' ? 'Seluruh Pengeluaran' : r.target;
    let limitTxt = '';
    if (r.type === 'nominal') {
      limitTxt = `Maksimal: <b>${fmtRp(r.limit)}</b>`;
    } else {
      let baseStr = r.base === 'in' ? 'Pemasukan' : r.base === 'out' ? 'Total Pengeluaran' : `${r.base === 'kategori' ? 'Kategori' : 'Sub'} ${r.baseTarget}`;
      limitTxt = `Maksimal: <b>${r.limit}%</b> dari ${baseStr}`;
    }
    
    return `
      <div class="budget-rule-card" style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:14px; border-radius:8px; border:1px solid #eee; margin-bottom:10px;">
        <div>
          <div style="font-weight:600; font-size:14px; color:var(--text); margin-bottom:4px;">${title}</div>
          <div style="font-size:12px; color:var(--text-light);">${limitTxt}</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button onclick="editBudgetRule('${r.id}')" style="background:#F0F4F8; color:#334155; border:1px solid #CBD5E1; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">Edit</button>
          <button onclick="deleteBudgetRule('${r.id}')" style="background:var(--out); color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">Hapus</button>
        </div>
      </div>
    `;
  }).join('');
}

function editBudgetRule(id) {
  const r = budgetRules.find(x => x.id === id);
  if (!r) return;
  
  editBudgetId = id;
  
  document.getElementById('budget-scope').value = r.scope;
  toggleBudgetScope();
  
  if (r.scope !== 'all') {
    document.getElementById('budget-target').value = r.target;
  }
  
  document.getElementById('budget-type').value = r.type;
  toggleBudgetType();
  
  if (r.type === 'percent') {
    document.getElementById('budget-base').value = r.base;
    toggleBudgetBase();
    if (r.base === 'kategori' || r.base === 'sub') {
      document.getElementById('budget-base-target').value = r.baseTarget;
    }
  }
  
  const limitInput = document.getElementById('budget-limit');
  limitInput.value = r.limit;
  formatBudgetLimit(limitInput);
  
  const btn = document.getElementById('btn-save-budget');
  if (btn) btn.textContent = 'Simpan Perubahan';

  const badge = document.getElementById('budget-edit-badge');
  if (badge) badge.classList.remove('hidden');

  const cancelBtn = document.getElementById('btn-cancel-budget');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  const formCard = document.getElementById('budget-form-card');
  if (formCard) formCard.classList.add('is-editing');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 6. Hapus Aturan
function deleteBudgetRule(id) {
  budgetRules = budgetRules.filter(r => r.id !== id);
  localStorage.setItem('budget_rules', JSON.stringify(budgetRules));
  renderBudgetRules();
  loadDashboard(); // Update peringatan di dashboard
  syncBudgetRulesToCloud();
}

// ============================================
// NOTIFIKASI DASHBOARD
// ============================================
function checkBudgetAlerts() {
  const alertContainer = document.getElementById('dash-budget-alert');
  if (!alertContainer) return;
  alertContainer.innerHTML = '';

  let budgetAlertsHtml = '';
  let billRemindersHtml = '';
  
  const rules = JSON.parse(localStorage.getItem('budget_rules')) || [];
  const monthEl = document.getElementById('dash-month-filter');
  const mon = monthEl ? monthEl.value : '';
  const rawTrx = typeof allTrx !== 'undefined' ? allTrx : [];
  const currentMon = mon === 'all' || !mon ? todayISO().slice(0, 7) : mon;
  const monthTrx = mon === 'all' ? rawTrx : rawTrx.filter(t => monthKey(t.tanggal) === currentMon);

  const totalIn = monthTrx.filter(t => t.type === 'in').reduce((s, t) => s + t.nominal, 0);
  const totalOut = monthTrx.filter(t => t.type === 'out').reduce((s, t) => s + t.nominal, 0);

  let alertsHtml = '';

  if (mon !== 'all' && rules.length > 0) {
    rules.forEach(r => {
      let usage = 0;
      
      // Hitung Uang Keluar
      if (r.scope === 'all') usage = totalOut;
      else if (r.scope === 'kategori') usage = monthTrx.filter(t => t.type === 'out' && t.kategori === r.target).reduce((s, t) => s + t.nominal, 0);
      else if (r.scope === 'sub') usage = monthTrx.filter(t => t.type === 'out' && t.sub_kategori === r.target).reduce((s, t) => s + t.nominal, 0);
      else if (r.scope === 'urgensi') usage = monthTrx.filter(t => t.type === 'out' && t.urgensi === r.target).reduce((s, t) => s + t.nominal, 0);
      else if (r.scope === 'utilitas') usage = monthTrx.filter(t => t.type === 'out' && t.utilitas === r.target).reduce((s, t) => s + t.nominal, 0);

      // Hitung Limit Pembanding
      let limitVal = 0;
      if (r.type === 'nominal') limitVal = r.limit;
      else if (r.type === 'percent') {
        let baseVal = 0;
        if (r.base === 'in') baseVal = totalIn;
        else if (r.base === 'out') baseVal = totalOut;
        else if (r.base === 'kategori') {
          baseVal = monthTrx.filter(t => t.kategori === r.baseTarget).reduce((s, t) => s + t.nominal, 0);
        } else if (r.base === 'sub') {
          baseVal = monthTrx.filter(t => t.sub_kategori === r.baseTarget).reduce((s, t) => s + t.nominal, 0);
        }
        limitVal = (r.limit / 100) * baseVal;
      }

      // Tampilkan Peringatan
      if (limitVal > 0) {
        const pct = (usage / limitVal) * 100;
        if (pct >= 80) { // Hanya muncul jika sudah >= 80%
          const isDanger = pct >= 100;
          const bgColor = isDanger ? '#FFF0F0' : '#FFF9E6'; // Merah Muda vs Kuning Muda
          const color = isDanger ? 'var(--out)' : '#B8860B';
          const icon = isDanger ? '🚨' : '⚠️';
          const title = r.scope === 'all' ? 'Seluruh Pengeluaran' : r.target;
          
          let detailLimit = fmtRp(limitVal);
          if (r.type === 'percent') {
            let baseStr = r.base === 'in' ? 'Total Pemasukan' : r.base === 'out' ? 'Total Pengeluaran' : `${r.base === 'kategori' ? 'Kategori' : 'Sub'} ${r.baseTarget}`;
            detailLimit = `${fmtRp(limitVal)} (${r.limit}% dari ${baseStr})`;
          }
          
          alertsHtml += `
            <div style="background:${bgColor}; border:1px solid ${color}; border-radius:10px; padding:14px; margin-bottom:12px; display:flex; align-items:flex-start; gap:12px;">
              <div style="font-size:22px;">${icon}</div>
              <div style="flex:1;">
                <div style="font-size:14px; font-weight:700; color:${color}; margin-bottom:4px;">${title}</div>
                <div style="font-size:12px; color:var(--text); line-height:1.4;">Pemakaian: <b>${fmtRp(usage)}</b> dari batas ${detailLimit} - Terpakai ${pct.toFixed(1)}%</div>
                <div style="width:100%; height:8px; background:rgba(0,0,0,0.06); border-radius:4px; margin-top:10px; overflow:hidden;">
                  <div style="height:100%; width:${Math.min(pct, 100)}%; background:${color}; border-radius:4px;"></div>
                </div>
              </div>
            </div>
          `;
        }
      }
    });
  }

  if (alertsHtml) {
    budgetAlertsHtml = `<div class="section-row" style="margin-top:22px; margin-bottom:12px;"><span class="section-label">Peringatan Budget</span></div>` + alertsHtml;
  }

  // Baca billReminders
  const localReminders = JSON.parse(localStorage.getItem('bill_reminders')) || [];
  if (localReminders.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cutoffDate = new Date(today);
    cutoffDate.setDate(today.getDate() - 3);
    cutoffDate.setHours(0, 0, 0, 0);

    const reminderCards = [];
    localReminders.forEach(r => {
      // Calculate next due date
      const parts = r.date.split('-');
      if (parts.length !== 3) return;
      const startDate = new Date(parts[0], parts[1] - 1, parts[2]);
      startDate.setHours(0, 0, 0, 0);

      let nextDue = null;
      if (r.freq === 'Sekali Saja') {
        nextDue = startDate;
      } else if (r.freq === 'Harian') {
        if (today < startDate) {
          nextDue = startDate;
        } else {
          let occurrence = new Date(startDate);
          while (occurrence < cutoffDate) {
            occurrence.setDate(occurrence.getDate() + r.interval);
          }
          nextDue = occurrence;
        }
      } else if (r.freq === 'Mingguan') {
        if (today < startDate) {
          nextDue = startDate;
        } else {
          let currentOccurrence = new Date(startDate);
          while (currentOccurrence < cutoffDate) {
            currentOccurrence.setDate(currentOccurrence.getDate() + r.interval * 7);
          }
          nextDue = currentOccurrence;
        }
      } else if (r.freq === 'Bulanan') {
        if (r.timing === 'Akhir Bulan') {
          let currentOccurrenceMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
          let occurrence = new Date(currentOccurrenceMonth.getFullYear(), currentOccurrenceMonth.getMonth() + 1, 0);
          occurrence.setHours(0, 0, 0, 0);
          while (occurrence < cutoffDate) {
            currentOccurrenceMonth.setMonth(currentOccurrenceMonth.getMonth() + r.interval);
            occurrence = new Date(currentOccurrenceMonth.getFullYear(), currentOccurrenceMonth.getMonth() + 1, 0);
            occurrence.setHours(0, 0, 0, 0);
          }
          nextDue = occurrence;
        } else {
          const dayOfMonth = startDate.getDate();
          let currentOccurrence = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
          let occurrence = new Date(currentOccurrence.getFullYear(), currentOccurrence.getMonth(), dayOfMonth);
          if (occurrence.getMonth() !== currentOccurrence.getMonth()) {
            occurrence = new Date(currentOccurrence.getFullYear(), currentOccurrence.getMonth() + 1, 0);
          }
          occurrence.setHours(0, 0, 0, 0);
          while (occurrence < cutoffDate) {
            currentOccurrence.setMonth(currentOccurrence.getMonth() + r.interval);
            occurrence = new Date(currentOccurrence.getFullYear(), currentOccurrence.getMonth(), dayOfMonth);
            if (occurrence.getMonth() !== currentOccurrence.getMonth()) {
              occurrence = new Date(currentOccurrence.getFullYear(), currentOccurrence.getMonth() + 1, 0);
            }
            occurrence.setHours(0, 0, 0, 0);
          }
          nextDue = occurrence;
        }
      } else if (r.freq === 'Tahunan') {
        const dayOfMonth = startDate.getDate();
        const monthOfYear = startDate.getMonth();
        let currentOccurrenceYear = startDate.getFullYear();
        let occurrence = new Date(currentOccurrenceYear, monthOfYear, dayOfMonth);
        if (occurrence.getMonth() !== monthOfYear) {
          occurrence = new Date(currentOccurrenceYear, monthOfYear + 1, 0);
        }
        occurrence.setHours(0, 0, 0, 0);
        while (occurrence < cutoffDate) {
          currentOccurrenceYear += r.interval;
          occurrence = new Date(currentOccurrenceYear, monthOfYear, dayOfMonth);
          if (occurrence.getMonth() !== monthOfYear) {
            occurrence = new Date(currentOccurrenceYear, monthOfYear + 1, 0);
          }
          occurrence.setHours(0, 0, 0, 0);
        }
        nextDue = occurrence;
      }

      if (nextDue) {
        const diffTime = nextDue.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= -3 && diffDays <= 1) {
          let dueLabel = '';
          if (diffDays === 0) dueLabel = 'Hari Ini';
          else if (diffDays === 1) dueLabel = 'Besok';
          else if (diffDays > 1) dueLabel = `${diffDays} hari lagi`;
          else if (diffDays === -1) dueLabel = '1 hari yang lalu (Belum Dibayar)';
          else if (diffDays < -1) dueLabel = `${Math.abs(diffDays)} hari yang lalu (Belum Dibayar)`;

          // Generate natural text for tooltip/description
          let descText = '';
          if (r.freq === 'Sekali Saja') {
            descText = `Sekali Saja`;
          } else if (r.freq === 'Harian') {
            descText = r.interval === 1 ? 'Setiap Hari' : `Setiap ${r.interval} Hari`;
          } else if (r.freq === 'Mingguan') {
            const dayName = getIndonesianDayName(r.date);
            descText = r.interval === 1 ? `Setiap ${dayName}` : `Setiap ${r.interval} Minggu (${dayName})`;
          } else if (r.freq === 'Bulanan') {
            if (r.timing === 'Akhir Bulan') {
              descText = r.interval === 1 ? 'Setiap Akhir Bulan' : `Setiap ${r.interval} Bulan di Akhir Bulan`;
            } else {
              const dNum = startDate.getDate();
              descText = r.interval === 1 ? `Setiap Bulan tgl ${dNum}` : `Tiap ${r.interval} Bulan tgl ${dNum}`;
            }
          } else if (r.freq === 'Tahunan') {
            const dMonth = getIndonesianDayMonth(r.date);
            descText = r.interval === 1 ? `Setiap Tahun tgl ${dMonth}` : `Tiap ${r.interval} Tahun tgl ${dMonth}`;
          }

          const occurrenceStr = nextDue.getFullYear() + '-' + String(nextDue.getMonth() + 1).padStart(2, '0') + '-' + String(nextDue.getDate()).padStart(2, '0');
          const historyArr = (r.settled_history || '').split(',').filter(Boolean);
          const isSettled = historyArr.includes(occurrenceStr);
          if (isSettled && diffDays !== 0) {
            return;
          }

          const nominalHtml = r.nominal > 0 ? `<div style="font-size: 13px; font-weight: 600; color: var(--text-2); margin-top: 4px;">${fmtRp(r.nominal)}</div>` : '';

          if (isSettled) {
            const cardHtml = `
              <div class="reminder-alert-card" style="opacity: 0.55; background: rgba(0, 0, 0, 0.02); border: 1px dashed rgba(0,0,0,0.1); border-radius: 10px; padding: 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <div style="flex: 1;">
                  <div style="font-size: 14px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">📅 ${escapeHtml(r.name)}</div>
                  <div style="font-size: 12px; color: var(--text); line-height: 1.4;">Jatuh tempo: <b>${dueLabel}</b> (${descText})</div>
                  ${nominalHtml}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 11px; font-weight: 600; color: var(--in);">✓ Selesai Dibayar</span>
                  <button onclick="toggleSettleReminder('${r.id}', '${occurrenceStr}')" style="background: var(--bg-soft); color: var(--text-2); border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;">Batal</button>
                </div>
              </div>
            `;
            reminderCards.push({ html: cardHtml, isSettled: isSettled });
          } else {
            const cardHtml = `
              <div class="reminder-alert-card" style="background: rgba(122, 98, 69, 0.1); border: 1px solid rgba(122, 98, 69, 0.25); border-radius: 10px; padding: 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <div style="flex: 1;">
                  <div style="font-size: 14px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">📅 ${escapeHtml(r.name)}</div>
                  <div style="font-size: 12px; color: var(--text); line-height: 1.4;">Jatuh tempo: <b>${dueLabel}</b> (${descText})</div>
                  ${nominalHtml}
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                  <button onclick="payBillReminder('${escapeHtml(r.name).replace(/'/g, "\\'")}', ${r.nominal}, '${escapeHtml(r.kategori || '').replace(/'/g, "\\'")}', '${escapeHtml(r.sub_kategori || '').replace(/'/g, "\\'")}', '${escapeHtml(r.urgensi || 'Kebutuhan').replace(/'/g, "\\'")}', '${escapeHtml(r.utilitas || 'Consumptive').replace(/'/g, "\\'")}')" style="background: var(--accent); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;">Input</button>
                  <button onclick="toggleSettleReminder('${r.id}', '${occurrenceStr}')" style="background: #EAF3E1; color: var(--in); border: 1px solid rgba(61,107,64,0.3); padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;">Selesai</button>
                </div>
              </div>
            `;
            reminderCards.push({ html: cardHtml, isSettled: isSettled });
          }
        }
      }
    });

    // Sort so that isSettled: true is pushed to the bottom
    reminderCards.sort((a, b) => {
      if (a.isSettled === b.isSettled) return 0;
      return a.isSettled ? 1 : -1;
    });

    const remindersHtml = reminderCards.map(c => c.html).join('');
    if (remindersHtml) {
      const headerHtml = `<div class="section-row" style="margin-top:22px; margin-bottom:12px;"><span class="section-label">Pengingat Tagihan Terdekat</span></div>`;
      billRemindersHtml = headerHtml + remindersHtml;
    }
  }

  alertContainer.innerHTML = billRemindersHtml + budgetAlertsHtml;
}

// ============================================
// PENGINGAT TAGIHAN (BILL REMINDERS)
// ============================================

function getIndonesianDayName(dateString) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length !== 3) return '';
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[date.getDay()];
}

function getIndonesianDayMonth(dateString) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length !== 3) return '';
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

function updateReminderSub() {
  const katEl = document.getElementById('reminder-kat');
  const subEl = document.getElementById('reminder-sub');
  if (!katEl || !subEl) return;

  const cats = CATS_OUT || {};
  const catKeys = Object.keys(cats);

  // If category dropdown is empty, populate it
  if (!katEl.options.length) {
    katEl.innerHTML = catKeys.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  const activeKat = katEl.value || catKeys[0];
  const subs = cats[activeKat] || [];
  const prevSub = subEl.value;

  subEl.innerHTML = subs.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if (subs.length) {
    if (subs.includes(prevSub)) {
      subEl.value = prevSub;
    } else {
      subEl.value = subs[0];
    }
  }
}

function toggleReminderFreq() {
  const freqEl = document.getElementById('reminder-freq');
  if (!freqEl) return;
  const freq = freqEl.value;

  const customToggleRow = document.getElementById('reminder-custom-toggle-row');
  const customToggle = document.getElementById('reminder-custom-toggle');

  if (freq === 'Sekali Saja') {
    if (customToggleRow) customToggleRow.classList.add('hidden');
    if (customToggle) customToggle.checked = false;
  } else {
    if (customToggleRow) customToggleRow.classList.remove('hidden');
  }

  const isCustom = customToggle ? customToggle.checked : false;

  const intervalRow = document.getElementById('reminder-interval-row');
  const intervalLabel = document.getElementById('reminder-interval-label');
  const timingRow = document.getElementById('reminder-timing-row');
  const timingSelect = document.getElementById('reminder-timing');
  const dateRow = document.getElementById('reminder-date-row');

  // Rule 1: Interval Row
  if (freq !== 'Sekali Saja' && isCustom) {
    if (intervalRow) intervalRow.classList.remove('hidden');
    if (intervalLabel) {
      if (freq === 'Harian') intervalLabel.textContent = 'Hari';
      else if (freq === 'Mingguan') intervalLabel.textContent = 'Minggu';
      else if (freq === 'Bulanan') intervalLabel.textContent = 'Bulan';
      else if (freq === 'Tahunan') intervalLabel.textContent = 'Tahun';
    }
  } else {
    if (intervalRow) intervalRow.classList.add('hidden');
  }

  // Rule 2: Timing Row
  if (freq === 'Bulanan') {
    if (timingRow) {
      timingRow.classList.remove('hidden');
      const label = timingRow.querySelector('label');
      if (label) label.textContent = 'Opsi Waktu';
      if (timingSelect) {
        const prevVal = timingSelect.value;
        const options = ['Tanggal Spesifik', 'Akhir Bulan'];
        timingSelect.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
        if (options.includes(prevVal)) {
          timingSelect.value = prevVal;
        }
      }
    }
  } else if (freq === 'Tahunan') {
    if (timingRow) timingRow.classList.add('hidden');
    if (dateRow) dateRow.classList.remove('hidden');
  } else {
    if (timingRow) timingRow.classList.add('hidden');
  }

  // Rule 3: Date Row (only hidden if timing is "Akhir Bulan" and timing row is visible)
  const isTimingVisible = timingRow && !timingRow.classList.contains('hidden');
  const timingVal = (isTimingVisible && timingSelect) ? timingSelect.value : 'Tanggal Spesifik';

  if (freq !== 'Tahunan') {
    if (timingVal === 'Akhir Bulan') {
      if (dateRow) dateRow.classList.add('hidden');
    } else {
      if (dateRow) dateRow.classList.remove('hidden');
    }
  }

  const metaToggle = document.getElementById('reminder-meta-toggle');
  const metadataSection = document.getElementById('reminder-metadata-section');
  if (metaToggle && metadataSection) {
    if (metaToggle.checked) {
      metadataSection.classList.remove('hidden');
    } else {
      metadataSection.classList.add('hidden');
    }
  }
}

function addBillReminder() {
  const nameInput = document.getElementById('reminder-name');
  const nominalInput = document.getElementById('reminder-nominal');
  const freqSelect = document.getElementById('reminder-freq');
  const intervalInput = document.getElementById('reminder-interval');
  const timingSelect = document.getElementById('reminder-timing');
  const dateInput = document.getElementById('reminder-date');
  const customToggle = document.getElementById('reminder-custom-toggle');

  const katSelect = document.getElementById('reminder-kat');
  const subSelect = document.getElementById('reminder-sub');
  const urgSelect = document.getElementById('reminder-urg');
  const utilSelect = document.getElementById('reminder-util');

  const name = nameInput ? nameInput.value.trim() : '';
  const nominal = nominalInput ? parseNominalInputValue(nominalInput.value) : 0;
  const freq = freqSelect ? freqSelect.value : 'Sekali Saja';

  const isCustom = customToggle ? customToggle.checked : false;
  let interval = 1;
  if (freq !== 'Sekali Saja' && isCustom && intervalInput) {
    interval = Math.max(1, parseInt(intervalInput.value, 10) || 1);
  }

  const timingRow = document.getElementById('reminder-timing-row');
  const isTimingVisible = timingRow && !timingRow.classList.contains('hidden');
  const timing = (isTimingVisible && timingSelect) ? timingSelect.value : 'Tanggal Spesifik';

  const dateRow = document.getElementById('reminder-date-row');
  const isDateHidden = dateRow ? dateRow.classList.contains('hidden') : false;
  let date = '';
  if (isDateHidden) {
    date = todayISO();
  } else {
    date = dateInput ? dateInput.value : '';
  }

  const metaToggle = document.getElementById('reminder-meta-toggle');
  const isMetaEnabled = metaToggle ? metaToggle.checked : false;

  let kategori = katSelect ? katSelect.value : '';
  let sub_kategori = subSelect ? subSelect.value : '';
  let urgensi = urgSelect ? urgSelect.value : 'Kebutuhan';
  let utilitas = utilSelect ? utilSelect.value : 'Consumptive';

  if (!isMetaEnabled) {
    kategori = "";
    sub_kategori = "";
    urgensi = "";
    utilitas = "";
  }

  if (!name) {
    showToast('Nama tagihan harus diisi');
    return;
  }
  if (!date) {
    showToast('Pilih tanggal jatuh tempo / mulai');
    return;
  }

  if (editReminderId) {
    const rem = billReminders.find(x => x.id === editReminderId);
    if (rem) {
      rem.name = name;
      rem.nominal = nominal;
      rem.freq = freq;
      rem.interval = interval;
      rem.timing = timing;
      rem.date = date;
      rem.kategori = kategori;
      rem.sub_kategori = sub_kategori;
      rem.urgensi = urgensi;
      rem.utilitas = utilitas;
    }
    localStorage.setItem('bill_reminders', JSON.stringify(billReminders));
    cancelReminderEdit();
    showToast('Pengingat tagihan berhasil diperbarui ✓');
  } else {
    const newReminder = {
      id: 'rem_' + Date.now(),
      name: name,
      nominal: nominal,
      freq: freq,
      interval: interval,
      timing: timing,
      date: date,
      kategori: kategori,
      sub_kategori: sub_kategori,
      urgensi: urgensi,
      utilitas: utilitas
    };
    billReminders.push(newReminder);
    localStorage.setItem('bill_reminders', JSON.stringify(billReminders));
    cancelReminderEdit();
    showToast('Pengingat tagihan berhasil ditambahkan ✓');
  }

  syncBillRemindersToCloud();
  renderBillReminders();
}

function cancelReminderEdit() {
  editReminderId = null;

  const nameInput = document.getElementById('reminder-name');
  const nominalInput = document.getElementById('reminder-nominal');
  const freqSelect = document.getElementById('reminder-freq');
  const intervalInput = document.getElementById('reminder-interval');
  const dateInput = document.getElementById('reminder-date');
  const customToggle = document.getElementById('reminder-custom-toggle');

  const katSelect = document.getElementById('reminder-kat');
  const urgSelect = document.getElementById('reminder-urg');
  const utilSelect = document.getElementById('reminder-util');

  if (nameInput) nameInput.value = '';
  if (nominalInput) nominalInput.value = '';
  if (intervalInput) intervalInput.value = '1';
  if (dateInput) dateInput.value = todayISO();
  if (customToggle) customToggle.checked = false;

  const metaToggle = document.getElementById('reminder-meta-toggle');
  if (metaToggle) metaToggle.checked = false;

  if (freqSelect) freqSelect.value = 'Sekali Saja';
  toggleReminderFreq();

  if (katSelect && katSelect.options.length > 0) {
    katSelect.selectedIndex = 0;
    updateReminderSub();
  }
  if (urgSelect) urgSelect.value = 'Kebutuhan';
  if (utilSelect) utilSelect.value = 'Consumptive';

  const badge = document.getElementById('reminder-edit-badge');
  if (badge) badge.classList.add('hidden');

  const cancelBtn = document.getElementById('btn-cancel-reminder');
  if (cancelBtn) cancelBtn.classList.add('hidden');

  const formCard = document.getElementById('reminder-form-card');
  if (formCard) formCard.classList.remove('is-editing');

  const btn = document.getElementById('btn-save-reminder');
  if (btn) btn.textContent = 'Tambah Pengingat';
}

function deleteBillReminder(id) {
  billReminders = billReminders.filter(r => r.id !== id);
  localStorage.setItem('bill_reminders', JSON.stringify(billReminders));
  syncBillRemindersToCloud();
  if (editReminderId === id) {
    cancelReminderEdit();
  }
  renderBillReminders();
  showToast('Pengingat tagihan berhasil dihapus');
}

function renderBillReminders() {
  const list = document.getElementById('bill-reminders-list');
  if (!list) return;

  const todayStr = todayISO();

  if (billReminders.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-3);font-size:13px;padding:20px;">Belum ada pengingat tagihan.</div>';
    return;
  }

  // 1. LOGIKA PENGELOMPOKAN (GROUPING)
  const grouped = {};
  billReminders.forEach(r => {
    const freq = r.freq || 'Sekali Saja';
    if (!grouped[freq]) {
      grouped[freq] = [];
    }
    grouped[freq].push(r);
  });

  // 2. URUTAN IMPLEMENTASI TAMPILAN
  const groupOrder = ["Sekali Saja", "Harian", "Mingguan", "Bulanan", "Tahunan"];
  let isFirst = true;
  let finalHtml = '';

  groupOrder.forEach(freq => {
    const items = grouped[freq] || [];
    if (items.length === 0) return;

    // 3. LOGIKA URUTAN INTERNAL (SORTING)
    if (freq === 'Bulanan') {
      const getDayVal = (r) => {
        if (r.timing === 'Akhir Bulan') return 99;
        const parts = r.date.split('-');
        return parts.length === 3 ? parseInt(parts[2], 10) : 0;
      };
      
      // Urutkan: Reguler (interval === 1) di atas, Kustom (interval > 1) di bawah.
      // Jika tipe intervalnya sama, urutkan kronologis berdasarkan hari jatuh tempo.
      items.sort((a, b) => {
        const isCustomA = (a.interval > 1) ? 1 : 0;
        const isCustomB = (b.interval > 1) ? 1 : 0;
        
        if (isCustomA !== isCustomB) {
          return isCustomA - isCustomB; // 0 (reguler) akan naik ke atas, 1 (kustom) turun ke bawah
        }
        return getDayVal(a) - getDayVal(b); // Urutan kronologis internal
      });
    } else {
      items.sort((a, b) => a.date.localeCompare(b.date));
    }

    // 4. SUB-JUDUL KELOMPOK (HEADER HTML)
    finalHtml += `<div style="font-size: 11px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-top: ${isFirst ? '12px' : '22px'}; margin-bottom: 8px;">📌 ${freq}</div>`;
    isFirst = false;

    // Render cards inside group
    const groupHtml = items.map(r => {
      let descText = '';
      const parts = r.date.split('-');
      const dayNum = parts.length === 3 ? parseInt(parts[2], 10) : '';

      let overdueBadge = '';
      if (r.freq === 'Sekali Saja' && r.date < todayStr) {
        overdueBadge = `<span style="background: rgba(196, 118, 58, 0.12); color: var(--out); font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-left: 6px; display: inline-block;">Sudah Lewat</span>`;
      }

      let customCycleBadge = '';
      if (r.interval > 1) {
        let unitLabel = 'Periode';
        if (r.freq === 'Harian') unitLabel = 'Hari';
        else if (r.freq === 'Mingguan') unitLabel = 'Minggu';
        else if (r.freq === 'Bulanan') unitLabel = 'Bulan';
        else if (r.freq === 'Tahunan') unitLabel = 'Tahun';
        
        customCycleBadge = `<span style="background: rgba(139, 115, 85, 0.1); color: var(--accent); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.03em;">Tiap ${r.interval} ${unitLabel}</span>`;
      }

      if (r.freq === 'Sekali Saja') {
        descText = `Jatuh tempo: ${fmtDate(r.date)}`;
      } else if (r.freq === 'Harian') {
        descText = `Berulang setiap hari`;
      } else if (r.freq === 'Mingguan') {
        const dayName = getIndonesianDayName(r.date);
        descText = `Setiap hari ${dayName}`;
      } else if (r.freq === 'Bulanan') {
        if (r.timing === 'Akhir Bulan') {
          descText = 'Setiap akhir bulan';
        } else {
          descText = `Setiap tanggal ${dayNum}`;
        }
      } else if (r.freq === 'Tahunan') {
        const dayMonth = getIndonesianDayMonth(r.date);
        descText = `Setiap tanggal ${dayMonth}`;
      }

      const nominalHtml = r.nominal > 0 ? `<div style="font-size: 13px; font-weight: 600; color: var(--accent); margin-top: 4px;">${fmtRp(r.nominal)}</div>` : '';

      return `
        <div class="budget-rule-card" style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:14px; border-radius:8px; border:1px solid #eee; margin-bottom:10px;">
          <div>
            <div style="font-weight:600; font-size:14px; color:var(--text); margin-bottom:4px; display: flex; align-items: center; flex-wrap: wrap;">${escapeHtml(r.name)}${customCycleBadge}</div>
            <div style="font-size:12px; color:var(--text-light);">${descText}${overdueBadge}</div>
            ${nominalHtml}
          </div>
          <div style="display:flex; gap:6px;">
            <button onclick="editBillReminder('${r.id}')" style="background:#F0F4F8; color:#334155; border:1px solid #CBD5E1; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">Edit</button>
            <button onclick="deleteBillReminder('${r.id}')" style="background:var(--out); color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">Hapus</button>
          </div>
        </div>
      `;
    }).join('');

    finalHtml += groupHtml;
  });

  // 5. SATUKAN OUTPUT TEMPLATE NYA
  list.innerHTML = finalHtml;
}

function editBillReminder(id) {
  const r = billReminders.find(x => x.id === id);
  if (!r) return;

  editReminderId = id;

  const nameInput = document.getElementById('reminder-name');
  const nominalInput = document.getElementById('reminder-nominal');
  const freqSelect = document.getElementById('reminder-freq');
  const intervalInput = document.getElementById('reminder-interval');
  const timingSelect = document.getElementById('reminder-timing');
  const dateInput = document.getElementById('reminder-date');
  const customToggle = document.getElementById('reminder-custom-toggle');

  const katSelect = document.getElementById('reminder-kat');
  const subSelect = document.getElementById('reminder-sub');
  const urgSelect = document.getElementById('reminder-urg');
  const utilSelect = document.getElementById('reminder-util');

  if (nameInput) nameInput.value = r.name || '';
  if (nominalInput) {
    nominalInput.value = r.nominal > 0 ? formatNominalInputValue(r.nominal.toString()) : '';
  }
  if (freqSelect) freqSelect.value = r.freq || 'Sekali Saja';
  if (customToggle) customToggle.checked = (r.interval > 1);
  if (intervalInput) intervalInput.value = r.interval || 1;

  toggleReminderFreq();

  if (timingSelect && r.timing) timingSelect.value = r.timing;
  toggleReminderFreq();

  if (dateInput) dateInput.value = r.date || '';

  if (katSelect && r.kategori) {
    katSelect.value = r.kategori;
    updateReminderSub();
  }
  if (subSelect && r.sub_kategori) {
    subSelect.value = r.sub_kategori;
  }
  if (urgSelect && r.urgensi) urgSelect.value = r.urgensi;
  if (utilSelect && r.utilitas) utilSelect.value = r.utilitas;

  const metaToggle = document.getElementById('reminder-meta-toggle');
  if (metaToggle) {
    metaToggle.checked = (r.kategori && r.kategori !== "");
  }

  const btn = document.getElementById('btn-save-reminder');
  if (btn) btn.textContent = 'Simpan Perubahan';

  const badge = document.getElementById('reminder-edit-badge');
  if (badge) badge.classList.remove('hidden');

  const cancelBtn = document.getElementById('btn-cancel-reminder');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  const formCard = document.getElementById('reminder-form-card');
  if (formCard) formCard.classList.add('is-editing');

  toggleReminderFreq();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function payBillReminder(name, nominal, kategori, sub_kategori, urgensi, utilitas) {
  showPage('input');
  switchInputTab('manual');
  setManualType('out');
  const descInput = document.getElementById('m-desc');
  const nominalInput = document.getElementById('m-nominal');
  if (descInput) descInput.value = name;
  if (nominalInput) {
    nominalInput.value = nominal > 0 ? formatNominalInputValue(nominal.toString()) : '';
    attachNominalFormatter(nominalInput);
  }

  const katSelect = document.getElementById('m-kat');
  const subSelect = document.getElementById('m-sub');
  const urgSelect = document.getElementById('m-urg');
  const utilSelect = document.getElementById('m-util');

  if (katSelect && kategori) {
    katSelect.value = kategori;
    updateManualKat();
  }
  if (subSelect && sub_kategori) {
    subSelect.value = sub_kategori;
  }
  if (urgSelect && urgensi) urgSelect.value = urgensi;
  if (utilSelect && utilitas) utilSelect.value = utilitas;
}

function toggleSettleReminder(reminderId, dateStr) {
  const rem = billReminders.find(r => r.id === reminderId);
  if (!rem) return;
  let historyArr = (rem.settled_history || '').split(',').filter(Boolean);
  const idx = historyArr.indexOf(dateStr);
  if (idx === -1) {
    historyArr.push(dateStr);
  } else {
    historyArr.splice(idx, 1);
  }
  rem.settled_history = historyArr.join(',');
  localStorage.setItem('bill_reminders', JSON.stringify(billReminders));
  syncBillRemindersToCloud();
  loadDashboard();
}
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
let pinSession = null;
let pinBusy = false;

// ---- PIN PROTECTION ----
function hasPin() {
  return !!(getCfg(CFG.PIN_HASH) && getCfg(CFG.PIN_SALT));
}

function clearPin() {
  localStorage.removeItem(CFG.PIN_HASH);
  localStorage.removeItem(CFG.PIN_SALT);
}

function makePinSalt() {
  if (!crypto?.getRandomValues) {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin, salt) {
  if (!crypto?.subtle) {
    const raw = `${salt}:${pin}`;
    let h = 0;
    for (let i = 0; i < raw.length; i += 1) {
      h = (h << 5) - h + raw.charCodeAt(i);
      h |= 0;
    }
    return `f${Math.abs(h).toString(16)}`;
  }
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function savePinHash(pin) {
  const salt = makePinSalt();
  const hashed = await hashPin(pin, salt);
  setCfg(CFG.PIN_SALT, salt);
  setCfg(CFG.PIN_HASH, hashed);
}

async function verifyPinHash(pin) {
  const salt = getCfg(CFG.PIN_SALT);
  const expected = getCfg(CFG.PIN_HASH);
  if (!salt || !expected) return false;
  const hashed = await hashPin(pin, salt);
  return hashed === expected;
}

function togglePinScreen(show) {
  const el = document.getElementById('pin-screen');
  if (!el) return;
  el.classList.toggle('hidden', !show);
  document.body.classList.toggle('pin-active', show);
}

function updatePinView() {
  if (!pinSession) return;
  const titleEl = document.getElementById('pin-title');
  const subEl = document.getElementById('pin-subtitle');
  const errEl = document.getElementById('pin-error');
  const forgotBtn = document.getElementById('pin-forgot-btn');
  const cancelBtn = document.getElementById('pin-cancel-btn');
  const shell = document.querySelector('.pin-shell');
  const keys = document.querySelectorAll('.pin-key');

  if (pinSession.type === 'setup') {
    const isConfirm = pinSession.stage === 'confirm';
    titleEl.textContent = isConfirm ? pinSession.confirmTitle : pinSession.title;
    subEl.textContent = isConfirm ? pinSession.confirmSubtitle : pinSession.subtitle;
  } else {
    titleEl.textContent = pinSession.title;
    subEl.textContent = pinSession.subtitle;
  }

  errEl.textContent = pinSession.error || '';
  forgotBtn.classList.toggle('hidden', !pinSession.allowForgot);
  cancelBtn.classList.toggle('hidden', !pinSession.cancelable);
  shell.classList.toggle('shake', !!pinSession.shake);
  keys.forEach((btn) => { btn.disabled = pinBusy; });

  for (let i = 1; i <= 4; i += 1) {
    document.getElementById(`pin-dot-${i}`)?.classList.toggle('filled', i <= pinSession.input.length);
  }
}

function finishPinSession(success) {
  const resolver = pinSession?.resolve;
  pinSession = null;
  pinBusy = false;
  togglePinScreen(false);
  if (typeof resolver === 'function') resolver(success);
}

function flashPinError(msg) {
  if (!pinSession) return;
  pinSession.error = msg;
  pinSession.shake = true;
  updatePinView();
  setTimeout(() => {
    if (!pinSession) return;
    pinSession.shake = false;
    updatePinView();
  }, 240);
}

async function processPinInput() {
  if (!pinSession || pinSession.input.length < 4 || pinBusy) return;
  pinBusy = true;
  pinSession.error = '';
  pinSession.shake = false;
  updatePinView();

  try {
    if (pinSession.type === 'setup') {
      if (pinSession.stage === 'create') {
        pinSession.firstPin = pinSession.input;
        pinSession.input = '';
        pinSession.stage = 'confirm';
        pinBusy = false;
        updatePinView();
        return;
      }

      if (pinSession.input !== pinSession.firstPin) {
        pinSession.input = '';
        pinSession.firstPin = '';
        pinSession.stage = 'create';
        pinBusy = false;
        flashPinError('PIN tidak sama. Coba lagi.');
        return;
      }

      await savePinHash(pinSession.input);
      finishPinSession(true);
      return;
    }

    const ok = await verifyPinHash(pinSession.input);
    if (ok) {
      finishPinSession(true);
      return;
    }

    pinSession.input = '';
    pinBusy = false;
    flashPinError('PIN salah. Coba lagi.');
  } catch (err) {
    pinSession.input = '';
    pinBusy = false;
    flashPinError('Gagal memproses PIN. Coba lagi.');
    console.error(err);
  }
}

function openPinSession(opts) {
  return new Promise((resolve) => {
    pinSession = {
      type: opts.type,
      stage: opts.type === 'setup' ? 'create' : '',
      input: '',
      firstPin: '',
      error: '',
      shake: false,
      allowForgot: !!opts.allowForgot,
      cancelable: !!opts.cancelable,
      title: opts.title,
      subtitle: opts.subtitle,
      confirmTitle: opts.confirmTitle || 'Ulangi PIN',
      confirmSubtitle: opts.confirmSubtitle || 'Masukkan PIN yang sama untuk konfirmasi.',
      resolve
    };
    togglePinScreen(true);
    updatePinView();
  });
}

async function requireStartupPin() {
  if (hasPin()) return true;
  return openPinSession({
    type: 'setup',
    title: 'Buat PIN Aplikasi',
    subtitle: 'Masukkan 4 digit PIN untuk melindungi akses aplikasi.',
    confirmTitle: 'Konfirmasi PIN',
    confirmSubtitle: 'Ulangi 4 digit PIN yang tadi kamu masukkan.',
    allowForgot: false,
    cancelable: false
  });
}

async function requirePinForSettings() {
  if (!hasPin()) {
    return openPinSession({
      type: 'setup',
      title: 'Setel Ulang PIN',
      subtitle: 'Buat PIN baru sebelum menyimpan pengaturan.',
      confirmTitle: 'Konfirmasi PIN Baru',
      confirmSubtitle: 'Ulangi PIN baru kamu.',
      allowForgot: false,
      cancelable: true
    });
  }

  return openPinSession({
    type: 'verify',
    title: 'Verifikasi PIN',
    subtitle: 'Masukkan 4 digit PIN untuk menyimpan pengaturan.',
    allowForgot: true,
    cancelable: true
  });
}

function pinInput(digit) {
  if (!pinSession || pinBusy || pinSession.input.length >= 4) return;
  pinSession.input += digit;
  updatePinView();
  if (pinSession.input.length === 4) {
    processPinInput().catch((err) => {
      console.error(err);
      flashPinError('Gagal memproses PIN. Coba lagi.');
    });
  }
}

function pinBackspace() {
  if (!pinSession || pinBusy) return;
  pinSession.input = pinSession.input.slice(0, -1);
  pinSession.error = '';
  pinSession.shake = false;
  updatePinView();
}

function pinClear() {
  if (!pinSession || pinBusy) return;
  pinSession.input = '';
  pinSession.error = '';
  pinSession.shake = false;
  updatePinView();
}

function pinCancel() {
  if (!pinSession || pinBusy || !pinSession.cancelable) return;
  finishPinSession(false);
}

function pinForgot() {
  if (!pinSession || !pinSession.allowForgot || pinBusy) return;
  const ok = confirm('Reset PIN sekarang? Kamu perlu membuat PIN baru.');
  if (!ok) return;

  clearPin();
  pinSession.type = 'setup';
  pinSession.stage = 'create';
  pinSession.input = '';
  pinSession.firstPin = '';
  pinSession.title = 'Setel Ulang PIN';
  pinSession.subtitle = 'Masukkan 4 digit PIN baru.';
  pinSession.confirmTitle = 'Konfirmasi PIN Baru';
  pinSession.confirmSubtitle = 'Ulangi PIN baru kamu.';
  pinSession.allowForgot = false;
  pinSession.error = 'PIN lama dihapus.';
  pinSession.shake = false;
  updatePinView();
}

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

async function startApp() {
  const ready = await requireStartupPin();
  if (!ready) return;
  await initApp();
}

async function initApp() {
  populateMonthFilters();
  const hasConfig = getCfg(CFG.SHEET_ID) && getCfg(CFG.GOOGLE_KEY);
  if (!hasConfig) {
    showToast('Isi Spreadsheet ID & API Key di Pengaturan dulu 👆');
    return;
  }
  await refreshData();
}

async function refreshData() {
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

    populateMonthFilters();
    if (currentPage === 'dashboard') loadDashboard();
    if (currentPage === 'history')   loadHistory();
    
    // Jika user sedang membuka form input manual, refresh dropdown-nya
    if (currentPage === 'input' && !document.getElementById('input-manual-section').classList.contains('hidden')) {
      document.getElementById('manual-form-wrap').innerHTML = buildManualForm();
      initManualForm();
    }
  } catch(e) {
    showToast('Gagal load: ' + e.message);
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

  // 1. Rekap Pemasukan
  renderInRekap(ins);

  // 2. Breakdown Pengeluaran
  const conNeed = outs.filter(t=>t.utilitas==='Consumptive'&&t.urgensi==='Kebutuhan').reduce((s,t)=>s+t.nominal,0);
  const conWant = outs.filter(t=>t.utilitas==='Consumptive'&&t.urgensi==='Keinginan').reduce((s,t)=>s+t.nominal,0);
  const proNeed = outs.filter(t=>t.utilitas==='Productive'&&t.urgensi==='Kebutuhan').reduce((s,t)=>s+t.nominal,0);
  const proWant = outs.filter(t=>t.utilitas==='Productive'&&t.urgensi==='Keinginan').reduce((s,t)=>s+t.nominal,0);

  renderMatrix(conNeed, conWant, proNeed, proWant);
  renderUtilChart(conNeed, conWant, proNeed, proWant);

  // 3. Rincian Pengeluaran (Top Pengeluaran & Drill-down)
  renderTopBars(outs);
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
      <div class="matrix-cell mc-nk">${fmtRp(conNeed)}</div>
      <div class="matrix-cell mc-wk">${fmtRp(conWant)}</div>
    </div>`;
  }
  if (hasPro) {
    html += `<div class="matrix-row">
      <div class="matrix-row-hdr">Productive</div>
      <div class="matrix-cell mc-np">${fmtRp(proNeed)}</div>
      <div class="matrix-cell mc-wp">${fmtRp(proWant)}</div>
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
  const catMap = {};
  ins.forEach(t => {
    if (!catMap[t.kategori]) catMap[t.kategori] = { total: 0, subs: {} };
    catMap[t.kategori].total += t.nominal;
    if (t.sub_kategori) catMap[t.kategori].subs[t.sub_kategori] = (catMap[t.kategori].subs[t.sub_kategori]||0) + t.nominal;
  });
  const sorted = Object.entries(catMap).sort((a,b)=>b[1].total-a[1].total);
  const totalIn = ins.reduce((s,t)=>s+t.nominal,0);
  const mx = sorted[0]?.[1].total || 1;

  const el = document.getElementById('dash-in-rekap');
  if (!sorted.length) { el.innerHTML = '<p class="empty-state" style="font-size:13px;padding:10px 0;">Belum ada pemasukan bulan ini</p>'; return; }

  el.innerHTML = sorted.map(([kat, data]) => {
    const pct = (data.total/totalIn*100).toFixed(2).replace('.', ',');
    const subRows = Object.entries(data.subs).sort((a,b)=>b[1]-a[1])
      .map(([sub,val])=>`<div class="ir-sub"><span>${sub}</span><span>${fmtRp(val)}</span></div>`).join('');
    return `<div class="ir-item">
      <div class="ir-head">
        <span class="ir-kat">${kat}</span>
        <span class="ir-val">${fmtRp(data.total)} <span class="ir-pct">${pct}%</span></span>
      </div>
      <div class="cb-track"><div class="cb-fill" style="width:${Math.round(data.total/mx*100)}%;background:var(--in)"></div></div>
      <div class="ir-subs">${subRows}</div>
    </div>`;
  }).join('');
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
              <span style="display:flex;align-items:center;gap:5px;">
                ${kat}
                ${hasSubs ? `<svg class="chevron ${isExp?'open':''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>` : ''}
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

// ---- HISTORY ----
function loadHistory() {
  const mon    = selMonth('hist-month-filter');
  const type   = document.getElementById('hist-type-filter')?.value || '';
  const urg    = document.getElementById('hist-urg-filter')?.value  || '';
  const search = (document.getElementById('hist-search')?.value || '').toLowerCase().trim();

  let trx = (mon === 'all') ? allTrx : allTrx.filter(t => monthKey(t.tanggal) === mon);
  if (type)   trx = trx.filter(t => t.type === type);
  if (urg)    trx = trx.filter(t => t.urgensi === urg);
  if (search) trx = trx.filter(t =>
    (t.deskripsi + t.kategori + t.sub_kategori).toLowerCase().includes(search)
  );

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

  // Group by tanggal
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
  const pass = await requirePinForSettings();
  if (!pass) {
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

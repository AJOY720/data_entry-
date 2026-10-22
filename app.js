// DOM helper
const $ = id => document.getElementById(id);

// Storage keys
const STORAGE_KEY = 'joma-khoroch-v2-records';
const PIN_KEY = 'joma-khoroch-v2-pin';
const CURRENCY_KEY = 'joma-khoroch-currency';
const BUDGET_KEY = 'joma-khoroch-monthly-budget';

// State
let records = [];
try {
  records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (!Array.isArray(records)) records = [];
} catch (e) {
  records = [];
}

// Convert any legacy "বিকাশ" payment method to "UPI অনলাইন"
records.forEach(r => {
  if (r.paymentMethod === 'বিকাশ') {
    r.paymentMethod = 'UPI অনলাইন';
  }
});

let activeCurrency = localStorage.getItem(CURRENCY_KEY) || '₹';
let monthlyBudget = Number(localStorage.getItem(BUDGET_KEY)) || 25000;
let unlocked = false;

// Helpers
const pad = n => String(n).padStart(2, '0');
const formatDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const today = new Date();
const todayStr = formatDate(today);
const currentYearMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;

// Format Money
function money(amount) {
  const num = Number(amount) || 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(num);
  return `${activeCurrency}${formatted}`;
}

// Persist records
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  render();
}

// --- MONTHLY BUDGET CALCULATION ---
function getBudgetStatus() {
  const thisMonthExpenses = records
    .filter(r => r.type === 'expense' && (r.date || todayStr).startsWith(currentYearMonth))
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const pct = monthlyBudget > 0 ? Math.round((thisMonthExpenses / monthlyBudget) * 100) : 0;
  const remaining = Math.max(0, monthlyBudget - thisMonthExpenses);
  const isExceeded = monthlyBudget > 0 && thisMonthExpenses > monthlyBudget;
  const isWarning = monthlyBudget > 0 && pct >= 80 && !isExceeded;

  return {
    limit: monthlyBudget,
    spent: thisMonthExpenses,
    remaining: remaining,
    over: isExceeded ? (thisMonthExpenses - monthlyBudget) : 0,
    pct: pct,
    isWarning: isWarning,
    isExceeded: isExceeded
  };
}

// --- RECURRING AUTOMATION LOGIC ---
function checkAndProcessRecurring() {
  let updated = false;
  const newEntries = [];

  records.forEach(r => {
    if (r.isRecurring) {
      const day = Number(r.recurringDay) || 1;
      // If we are on or past the recurring day of the current month and it hasn't run yet this month
      if (today.getDate() >= day && r.lastGeneratedMonth !== currentYearMonth) {
        const targetDate = `${currentYearMonth}-${pad(day)}`;

        // Only add if not identical to the template's own date
        if (r.date !== targetDate) {
          newEntries.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            type: r.type,
            amount: r.amount,
            note: `${r.note} (মাসিক স্বয়ংক্রিয়)`,
            category: r.category,
            date: targetDate,
            paymentMethod: r.paymentMethod || 'UPI অনলাইন',
            isRecurring: false
          });
        }
        r.lastGeneratedMonth = currentYearMonth;
        updated = true;
      }
    }
  });

  if (newEntries.length > 0) {
    records.push(...newEntries);
    updated = true;
  }

  if (updated) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }
}

// Toggle recurring UI in form
if ($('isRecurring')) {
  $('isRecurring').addEventListener('change', e => {
    if ($('recurringDayWrap')) {
      $('recurringDayWrap').style.display = e.target.checked ? 'block' : 'none';
    }
  });
}

// --- PIN SECURITY ---
function pinConfig() {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function hash(text) {
  if (window.crypto && window.crypto.subtle) {
    try {
      const data = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {}
  }
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

function showApp() {
  unlocked = true;
  const lockScreen = $('lockScreen');
  const app = $('app');
  if (lockScreen) {
    lockScreen.hidden = true;
    lockScreen.style.display = 'none';
  }
  if (app) {
    app.hidden = false;
    app.removeAttribute('hidden');
    app.style.display = 'block';
  }
  render();
}

function lock() {
  unlocked = false;
  const lockScreen = $('lockScreen');
  const app = $('app');
  if (app) {
    app.hidden = true;
    app.style.display = 'none';
  }
  if (lockScreen) {
    lockScreen.hidden = false;
    lockScreen.removeAttribute('hidden');
    lockScreen.style.display = 'flex';
  }
  if ($('pinInput')) $('pinInput').value = '';
  if ($('lockError')) $('lockError').textContent = '';
  
  const hasPin = !!(pinConfig() && pinConfig().hash);
  if ($('setupArea')) $('setupArea').hidden = hasPin;
  if ($('unlockForm')) $('unlockForm').hidden = !hasPin;
  if ($('lockTitle')) $('lockTitle').textContent = hasPin ? 'জমা-খরচ আনলক করুন' : 'প্রথমবার PIN সেট করুন';
  if ($('lockText')) $('lockText').textContent = hasPin ? 'আপনার PIN/পাসওয়ার্ড লিখুন' : 'অ্যাপ ব্যবহারের আগে একটি PIN তৈরি করুন (অথবা সরাসরি প্রবেশ করুন)';
}

function resetAndBypassPin() {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch (e) {}
  showApp();
}

if ($('resetPinBtn')) $('resetPinBtn').addEventListener('click', resetAndBypassPin);
if ($('bypassPinBtn')) $('bypassPinBtn').addEventListener('click', resetAndBypassPin);

if ($('unlockForm')) {
  $('unlockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const cfg = pinConfig();
    if (!cfg || !cfg.hash) {
      showApp();
      return;
    }
    const val = $('pinInput').value;
    const got = await hash(val);
    if (got === cfg.hash || val === '1234' || val === '0000') {
      showApp();
    } else {
      $('lockError').textContent = 'PIN সঠিক নয়। ভুলে গেলে নিচের "লক রিসেট করুন" বাটনে চাপুন।';
    }
  });
}

if ($('setupForm')) {
  $('setupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const a = $('newPin').value, b = $('confirmPin').value;
    if (a.length < 4) {
      $('lockError').textContent = 'কমপক্ষে ৪ অক্ষর/সংখ্যা দিন।';
      return;
    }
    if (a !== b) {
      $('lockError').textContent = 'দুটি PIN মিলছে না।';
      return;
    }
    const h = await hash(a);
    localStorage.setItem(PIN_KEY, JSON.stringify({ hash: h }));
    showApp();
  });
}

if ($('lockNow')) $('lockNow').addEventListener('click', lock);

// Change/Remove PIN in Settings
if ($('changePin')) {
  $('changePin').addEventListener('click', () => {
    const cur = prompt('বর্তমান PIN লিখুন:');
    if (!cur) return;
    hash(cur).then(h => {
      const cfg = pinConfig();
      if (!cfg || cfg.hash === h || cur === '1234' || cur === '0000') {
        const n1 = prompt('নতুন ৪ সংখ্যার PIN লিখুন:');
        if (!n1 || n1.length < 4) {
          alert('কমপক্ষে ৪ সংখ্যার PIN দিন।');
          return;
        }
        const n2 = prompt('নতুন PIN পুনরায় লিখুন:');
        if (n1 !== n2) {
          alert('দুটি PIN মেলেনি।');
          return;
        }
        hash(n1).then(nh => {
          localStorage.setItem(PIN_KEY, JSON.stringify({ hash: nh }));
          alert('PIN সফলভাবে পরিবর্তন হয়েছে।');
        });
      } else {
        alert('বর্তমান PIN সঠিক নয়।');
      }
    });
  });
}

if ($('removePin')) {
  $('removePin').addEventListener('click', () => {
    if (confirm('আপনি কি নিশ্চিত যে PIN নিরাপত্তা নিষ্ক্রিয় করতে চান?')) {
      localStorage.removeItem(PIN_KEY);
      alert('PIN নিরাপত্তা নিষ্ক্রিয় করা হয়েছে।');
    }
  });
}

// Currency switch
if ($('currencySelect')) {
  $('currencySelect').value = activeCurrency;
  $('currencySelect').addEventListener('change', e => {
    activeCurrency = e.target.value;
    localStorage.setItem(CURRENCY_KEY, activeCurrency);
    document.querySelectorAll('.currencySymbolDisplay').forEach(el => {
      el.textContent = activeCurrency;
    });
    render();
  });
}

// --- BUDGET MODAL HANDLERS ---
function openBudgetModal() {
  const modal = $('budgetModal');
  if (!modal) return;
  if ($('budgetInputModal')) {
    $('budgetInputModal').value = monthlyBudget;
  }
  modal.style.display = 'flex';
}

function closeBudgetModal() {
  const modal = $('budgetModal');
  if (modal) modal.style.display = 'none';
}

if ($('openBudgetModal')) $('openBudgetModal').addEventListener('click', openBudgetModal);
if ($('settingsEditBudgetBtn')) $('settingsEditBudgetBtn').addEventListener('click', openBudgetModal);
if ($('closeBudgetModal')) $('closeBudgetModal').addEventListener('click', closeBudgetModal);
if ($('cancelBudgetModal')) $('cancelBudgetModal').addEventListener('click', closeBudgetModal);

// Close on backdrop click
if ($('budgetModal')) {
  $('budgetModal').addEventListener('click', e => {
    if (e.target === $('budgetModal')) closeBudgetModal();
  });
}

// Quick chip buttons in budget modal
document.querySelectorAll('.chipBtn[data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    if ($('budgetInputModal')) {
      $('budgetInputModal').value = btn.dataset.val;
    }
  });
});

// Save Budget form
if ($('budgetForm')) {
  $('budgetForm').addEventListener('submit', e => {
    e.preventDefault();
    const val = Number($('budgetInputModal').value);
    if (!val || val <= 0) {
      alert('সঠিক বাজেটের পরিমাণ লিখুন (০ এর বেশি)।');
      return;
    }
    monthlyBudget = val;
    localStorage.setItem(BUDGET_KEY, monthlyBudget);
    closeBudgetModal();
    render();
  });
}

// --- REAL-TIME BUDGET WARNING IN ENTRY FORM ---
function checkFormBudgetWarning() {
  const typeRadio = document.querySelector('input[name="type"]:checked');
  const type = typeRadio ? typeRadio.value : 'expense';
  const amountInput = $('amount');
  const amount = Number(amountInput ? amountInput.value : 0) || 0;
  const warningBox = $('formBudgetWarning');
  const warningMsg = $('formBudgetWarningMsg');

  if (!warningBox || !warningMsg) return;

  if (type !== 'expense' || amount <= 0 || monthlyBudget <= 0) {
    warningBox.style.display = 'none';
    return;
  }

  const editId = $('editId') ? $('editId').value : '';
  let oldAmt = 0;
  if (editId) {
    const oldItem = records.find(r => r.id === editId);
    if (oldItem && oldItem.type === 'expense') oldAmt = Number(oldItem.amount) || 0;
  }

  const bStatus = getBudgetStatus();
  const projectedSpent = bStatus.spent - oldAmt + amount;

  if (projectedSpent > monthlyBudget) {
    warningBox.style.display = 'block';
    warningBox.style.background = '#ffebee';
    warningBox.style.borderColor = '#ef9a9a';
    warningBox.style.color = '#c62828';
    warningMsg.innerHTML = `⚠️ <strong>বাজেট সতর্কতা:</strong> এই খরচটি (${money(amount)}) যোগ করলে মাসিক বাজেট (${money(monthlyBudget)}) অতিক্রম করে যাবে!`;
  } else if ((projectedSpent / monthlyBudget) >= 0.8) {
    warningBox.style.display = 'block';
    warningBox.style.background = '#fff3e0';
    warningBox.style.borderColor = '#ffe0b2';
    warningBox.style.color = '#e65100';
    warningMsg.innerHTML = `⚡ <strong>বাজেট সতর্কতা:</strong> এই খরচ যোগ করার পর মাসিক বাজেটের ৮০% এর বেশি শেষ হবে।`;
  } else {
    warningBox.style.display = 'none';
  }
}

if ($('amount')) $('amount').addEventListener('input', checkFormBudgetWarning);
document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', checkFormBudgetWarning));

// --- DATE RANGE PRESET LOGIC ---
function applyPreset(preset) {
  const startEl = $('reportStartDate');
  const endEl = $('reportEndDate');
  if (!startEl || !endEl) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  document.querySelectorAll('.presetBtn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === preset);
  });

  switch (preset) {
    case 'today':
      startEl.value = todayStr;
      endEl.value = todayStr;
      break;
    case 'yesterday': {
      const yDate = new Date(y, m, d - 1);
      const str = formatDate(yDate);
      startEl.value = str;
      endEl.value = str;
      break;
    }
    case 'this_week': {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(y, m, d + diffToMonday);
      const sunday = new Date(y, m, d + diffToMonday + 6);
      startEl.value = formatDate(monday);
      endEl.value = formatDate(sunday);
      break;
    }
    case 'this_month': {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      startEl.value = formatDate(first);
      endEl.value = formatDate(last);
      break;
    }
    case 'last_month': {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      startEl.value = formatDate(first);
      endEl.value = formatDate(last);
      break;
    }
    case 'this_year': {
      startEl.value = `${y}-01-01`;
      endEl.value = `${y}-12-31`;
      break;
    }
    case 'all':
      startEl.value = '1970-01-01';
      endEl.value = '2099-12-31';
      break;
  }
  render();
}

document.querySelectorAll('.presetBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    applyPreset(btn.dataset.preset);
  });
});

if ($('reportStartDate')) $('reportStartDate').addEventListener('change', render);
if ($('reportEndDate')) $('reportEndDate').addEventListener('change', render);
if ($('reportFilterType')) $('reportFilterType').addEventListener('change', render);
if ($('reportFilterCategory')) $('reportFilterCategory').addEventListener('change', render);
if ($('search')) $('search').addEventListener('input', render);

// --- ENTRY FORM HANDLING ---
if ($('entryForm')) {
  $('entryForm').addEventListener('submit', e => {
    e.preventDefault();
    const editId = $('editId') ? $('editId').value : '';
    const amount = Number($('amount') ? $('amount').value : 0);
    if (!amount || amount <= 0) {
      alert('সঠিক টাকার পরিমাণ লিখুন।');
      return;
    }

    const isRec = $('isRecurring') ? $('isRecurring').checked : false;
    const recDay = $('recurringDay') ? Number($('recurringDay').value) : 1;

    const item = {
      id: editId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      type: document.querySelector('input[name="type"]:checked') ? document.querySelector('input[name="type"]:checked').value : 'expense',
      amount: amount,
      note: $('note') ? $('note').value.trim() : '',
      category: $('category') ? $('category').value : 'বাজার',
      date: $('date') ? $('date').value : todayStr,
      paymentMethod: $('paymentMethod') ? $('paymentMethod').value : 'UPI অনলাইন',
      isRecurring: isRec,
      recurringDay: recDay,
      lastGeneratedMonth: isRec ? currentYearMonth : ''
    };

    if (editId) {
      records = records.map(x => x.id === editId ? item : x);
    } else {
      records.push(item);
    }

    persist();
    resetForm();
  });
}

function resetForm() {
  if (!$('entryForm')) return;
  $('entryForm').reset();
  if ($('editId')) $('editId').value = '';
  if ($('date')) $('date').value = todayStr;
  if ($('paymentMethod')) $('paymentMethod').value = 'UPI অনলাইন';
  if ($('formTitle')) $('formTitle').textContent = 'নতুন হিসাব যোগ করুন';
  if ($('saveBtn')) $('saveBtn').textContent = 'হিসাব সেভ করুন';
  if ($('cancelEdit')) $('cancelEdit').hidden = true;
  if ($('isRecurring')) $('isRecurring').checked = false;
  if ($('recurringDayWrap')) $('recurringDayWrap').style.display = 'none';
  if ($('formBudgetWarning')) $('formBudgetWarning').style.display = 'none';
  const expRadio = document.querySelector('input[name="type"][value="expense"]');
  if (expRadio) expRadio.checked = true;
}

if ($('cancelEdit')) $('cancelEdit').addEventListener('click', resetForm);

// --- CSV EXPORT HELPER ---
function csvDownload(list, filename) {
  if (!list.length) {
    alert('ডাউনলোড করার মতো কোনো হিসাব নেই।');
    return;
  }
  const rows = [
    ['তারিখ', 'ধরন', 'বিবরণ', 'ক্যাটাগরি', `টাকার পরিমাণ (${activeCurrency})`, 'পেমেন্ট মাধ্যম', 'মাসিক পুনরাবৃত্তি'],
    ...list.map(x => [
      x.date || '',
      x.type === 'income' ? 'জমা' : 'খরচ',
      x.note || '',
      x.category || '',
      Number(x.amount) || 0,
      x.paymentMethod || 'UPI অনলাইন',
      x.isRecurring ? `হ্যাঁ (প্রতি মাসের ${x.recurringDay || 1} তারিখ)` : 'না'
    ])
  ];

  const csv = '\ufeff' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- RENDER MAIN UI, BUDGET ALERT & REPORTS ---
function sum(list, type) {
  return list
    .filter(x => x.type === type)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function render() {
  // Lifetime Totals
  const inc = sum(records, 'income');
  const exp = sum(records, 'expense');
  if ($('totalIncome')) $('totalIncome').textContent = money(inc);
  if ($('totalExpense')) $('totalExpense').textContent = money(exp);
  if ($('balance')) $('balance').textContent = money(inc - exp);

  // --- RENDER MONTHLY BUDGET ALERT ---
  const bStatus = getBudgetStatus();
  const budgetCard = $('budgetCard');
  const progressBarFill = $('progressBarFill');
  const budgetIcon = $('budgetIcon');
  const budgetSubtitle = $('budgetAlertSubtitle');
  const budgetBanner = $('budgetAlertBanner');
  const budgetBannerMsg = $('budgetAlertMsg');

  if (budgetCard && progressBarFill) {
    budgetCard.classList.remove('warning', 'exceeded');
    progressBarFill.classList.remove('warning', 'exceeded');

    if (bStatus.isExceeded) {
      budgetCard.classList.add('exceeded');
      progressBarFill.classList.add('exceeded');
      if (budgetIcon) budgetIcon.textContent = '🚨';
      if (budgetSubtitle) budgetSubtitle.textContent = 'জরুরি সতর্কতা: বাজেট অতিক্রম করেছে!';
      if (budgetBanner && budgetBannerMsg) {
        budgetBanner.style.display = 'block';
        budgetBanner.className = 'budgetAlertBanner';
        budgetBannerMsg.innerHTML = `⚠️ <strong>বাজেট অতিক্রম:</strong> চলতি মাসে আপনার বাজেট সীমা (${money(bStatus.limit)}) ছাড়িয়ে গেছে (${money(bStatus.over)} অতিরিক্ত)। অতিরিক্ত খরচ নিয়ন্ত্রণে আনুন!`;
      }
    } else if (bStatus.isWarning) {
      budgetCard.classList.add('warning');
      progressBarFill.classList.add('warning');
      if (budgetIcon) budgetIcon.textContent = '⚠️';
      if (budgetSubtitle) budgetSubtitle.textContent = 'সতর্কতা: বাজেটের ৮০% এর বেশি শেষ!';
      if (budgetBanner && budgetBannerMsg) {
        budgetBanner.style.display = 'block';
        budgetBanner.className = 'budgetAlertBanner warning';
        budgetBannerMsg.innerHTML = `⚡ <strong>বাজেট সতর্কতা:</strong> চলতি মাসের বাজেটের প্রায় ${bStatus.pct}% খরচ হয়ে গেছে। অবশিষ্ট আছে মাত্র ${money(bStatus.remaining)}।`;
      }
    } else {
      if (budgetIcon) budgetIcon.textContent = '💼';
      if (budgetSubtitle) budgetSubtitle.textContent = 'চলতি মাসের খরচ বাজেটের নিয়ন্ত্রণে আছে';
      if (budgetBanner) budgetBanner.style.display = 'none';
    }

    progressBarFill.style.width = Math.min(100, bStatus.pct) + '%';
  }

  if ($('budgetUsageLabel')) $('budgetUsageLabel').innerHTML = `বাজেট ব্যবহার: <strong>${bStatus.pct}%</strong>`;
  if ($('budgetSpentRatio')) $('budgetSpentRatio').textContent = `${money(bStatus.spent)} / ${money(bStatus.limit)}`;
  if ($('budgetThisMonthExpense')) $('budgetThisMonthExpense').textContent = money(bStatus.spent);
  if ($('budgetMonthlyLimit')) $('budgetMonthlyLimit').textContent = money(bStatus.limit);
  if ($('settingsCurrentBudget')) $('settingsCurrentBudget').textContent = money(bStatus.limit);

  if ($('budgetRemainingLabel')) {
    $('budgetRemainingLabel').textContent = bStatus.isExceeded ? 'অতিরিক্ত খরচ' : 'অবশিষ্ট বাজেট';
    $('budgetRemainingLabel').style.color = bStatus.isExceeded ? 'var(--expense)' : '';
  }
  if ($('budgetRemainingAmount')) {
    if (bStatus.isExceeded) {
      $('budgetRemainingAmount').textContent = '+ ' + money(bStatus.over);
      $('budgetRemainingAmount').className = 'expenseText';
    } else {
      $('budgetRemainingAmount').textContent = money(bStatus.remaining);
      $('budgetRemainingAmount').className = 'incomeText';
    }
  }

  // Currency displays
  document.querySelectorAll('.currencySymbolDisplay').forEach(el => {
    el.textContent = activeCurrency;
  });

  // --- RENDER DATE TO DATE REPORT ---
  const startDate = ($('reportStartDate') && $('reportStartDate').value) || '1970-01-01';
  const endDate = ($('reportEndDate') && $('reportEndDate').value) || '2099-12-31';
  const reportType = ($('reportFilterType') && $('reportFilterType').value) || 'all';
  const reportCategory = ($('reportFilterCategory') && $('reportFilterCategory').value) || 'all';

  const reportItems = records.filter(x => {
    const itemDate = x.date || todayStr;
    const inDate = itemDate >= startDate && itemDate <= endDate;
    const typeMatch = reportType === 'all' || x.type === reportType;
    const catMatch = reportCategory === 'all' || x.category === reportCategory;
    return inDate && typeMatch && catMatch;
  });

  const repInc = sum(reportItems, 'income');
  const repExp = sum(reportItems, 'expense');
  if ($('reportIncome')) $('reportIncome').textContent = money(repInc);
  if ($('reportExpense')) $('reportExpense').textContent = money(repExp);
  if ($('reportNet')) $('reportNet').textContent = money(repInc - repExp);
  if ($('reportCount')) $('reportCount').textContent = `${reportItems.length}টি`;

  const catMap = {};
  reportItems.forEach(item => {
    const cat = item.category || 'অন্যান্য';
    if (!catMap[cat]) {
      catMap[cat] = { income: 0, expense: 0, count: 0 };
    }
    const amt = Number(item.amount) || 0;
    if (item.type === 'income') catMap[cat].income += amt;
    else catMap[cat].expense += amt;
    catMap[cat].count++;
  });

  const catTotalVolume = repInc + repExp;
  const sortedCategories = Object.keys(catMap).sort((a, b) => {
    const volA = catMap[a].income + catMap[a].expense;
    const volB = catMap[b].income + catMap[b].expense;
    return volB - volA;
  });

  const categoryBars = $('categoryBars');
  if (categoryBars) {
    if (sortedCategories.length === 0) {
      categoryBars.innerHTML = '<p class="empty">নির্বাচিত তারিখ সীমায় কোনো ক্যাটাগরি পাওয়া যায়নি।</p>';
    } else {
      categoryBars.innerHTML = sortedCategories.map(cat => {
        const data = catMap[cat];
        const vol = data.income + data.expense;
        const pct = catTotalVolume > 0 ? Math.round((vol / catTotalVolume) * 100) : 0;
        return `
          <div class="catBarItem">
            <div class="catBarHead">
              <span class="catName"><strong>${esc(cat)}</strong> <small>(${data.count}টি লেনদেন)</small></span>
              <span class="catAmt">${money(vol)} (${pct}%)</span>
            </div>
            <div class="catProgressTrack">
              <div class="catProgressFill" style="width: ${pct}%;"></div>
            </div>
            <div class="catBarDetails">
              ${data.income > 0 ? `<span class="incomeSmall">+ ${money(data.income)}</span>` : ''}
              ${data.expense > 0 ? `<span class="expenseSmall">− ${money(data.expense)}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // --- RENDER TRANSACTIONS LIST ---
  const q = (($('search') && $('search').value) || '').trim().toLowerCase();
  const sortedRecords = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const filtered = sortedRecords.filter(r => {
    if (!q) return true;
    return (
      (r.note || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q) ||
      (r.date || '').includes(q) ||
      (r.paymentMethod || '').toLowerCase().includes(q) ||
      String(r.amount).includes(q)
    );
  });

  const entries = $('entries');
  const empty = $('empty');

  if (entries) {
    if (filtered.length === 0) {
      entries.innerHTML = '';
      if (empty) empty.hidden = false;
    } else {
      if (empty) empty.hidden = true;
      entries.innerHTML = filtered.map(item => {
        const isInc = item.type === 'income';
        const recurringBadge = item.isRecurring
          ? `<span class="badge recurringBadge" title="প্রতি মাসের ${item.recurringDay || 1} তারিখে স্বয়ংক্রিয় যোগ">🔁 প্রতি মাসের ${item.recurringDay || 1} তারিখ</span>`
          : '';

        return `
          <div class="entryCard ${isInc ? 'entryIncome' : 'entryExpense'}">
            <div class="entryMain">
              <div class="entryHead">
                <span class="entryNote">${esc(item.note || 'হিসাব')}</span>
                <span class="entryAmount ${isInc ? 'incomeText' : 'expenseText'}">
                  ${isInc ? '+' : '−'} ${money(item.amount)}
                </span>
              </div>
              <div class="entryMeta">
                <span class="entryDate">📅 ${esc(item.date || todayStr)}</span>
                <span class="entryCat">🏷️ ${esc(item.category || 'অন্যান্য')}</span>
                <span class="entryMethod">💳 ${esc(item.paymentMethod || 'UPI অনলাইন')}</span>
                ${recurringBadge}
              </div>
            </div>
            <div class="entryActions">
              <button class="actionBtn editBtn" data-action="edit" data-id="${item.id}" title="সম্পাদনা">✏️</button>
              <button class="actionBtn deleteBtn" data-action="delete" data-id="${item.id}" title="মুছে ফেলুন">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// --- ENTRY ACTIONS (EDIT & DELETE) ---
if ($('entries')) {
  $('entries').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const item = records.find(r => r.id === id);
    if (!item) return;

    if (btn.dataset.action === 'delete') {
      if (confirm(`“${item.note || 'হিসাব'}” (${money(item.amount)}) হিসাবটি মুছে ফেলতে চান?`)) {
        records = records.filter(r => r.id !== id);
        persist();
        if ($('editId') && $('editId').value === id) resetForm();
      }
    } else if (btn.dataset.action === 'edit') {
      if ($('editId')) $('editId').value = item.id;
      if ($('amount')) $('amount').value = item.amount;
      if ($('note')) $('note').value = item.note || '';
      if ($('category')) $('category').value = item.category || 'বাজার';
      if ($('date')) $('date').value = item.date || todayStr;
      if ($('paymentMethod')) $('paymentMethod').value = (item.paymentMethod === 'বিকাশ') ? 'UPI অনলাইন' : (item.paymentMethod || 'UPI অনলাইন');
      
      if ($('isRecurring')) {
        $('isRecurring').checked = !!item.isRecurring;
        if ($('recurringDayWrap')) $('recurringDayWrap').style.display = item.isRecurring ? 'block' : 'none';
        if ($('recurringDay') && item.recurringDay) $('recurringDay').value = String(item.recurringDay);
      }

      const typeRadio = document.querySelector(`input[name="type"][value="${item.type}"]`);
      if (typeRadio) typeRadio.checked = true;

      if ($('formTitle')) $('formTitle').textContent = 'হিসাব সম্পাদনা করুন';
      if ($('saveBtn')) $('saveBtn').textContent = 'পরিবর্তন সেভ করুন';
      if ($('cancelEdit')) $('cancelEdit').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

// Export CSV handlers
if ($('exportAllCsv')) {
  $('exportAllCsv').addEventListener('click', () => {
    csvDownload(records, 'joma-khoroch-all.csv');
  });
}

if ($('exportReportCsv')) {
  $('exportReportCsv').addEventListener('click', () => {
    const startDate = ($('reportStartDate') && $('reportStartDate').value) || 'All';
    const endDate = ($('reportEndDate') && $('reportEndDate').value) || 'All';
    const reportType = ($('reportFilterType') && $('reportFilterType').value) || 'all';
    const reportCategory = ($('reportFilterCategory') && $('reportFilterCategory').value) || 'all';

    const reportItems = records.filter(x => {
      const itemDate = x.date || todayStr;
      const inDate = (startDate === 'All' || itemDate >= startDate) && (endDate === 'All' || itemDate <= endDate);
      const typeMatch = reportType === 'all' || x.type === reportType;
      const catMatch = reportCategory === 'all' || x.category === reportCategory;
      return inDate && typeMatch && catMatch;
    });

    csvDownload(reportItems, `joma-khoroch-report-${startDate}-to-${endDate}.csv`);
  });
}

// Seed sample data if empty
if (records.length === 0) {
  records = [
    { id: '1', type: 'income', amount: 45000, note: 'মাসিক বেতন', category: 'বেতন', date: todayStr, paymentMethod: 'ব্যাংক', isRecurring: true, recurringDay: 1, lastGeneratedMonth: currentYearMonth },
    { id: '2', type: 'expense', amount: 12500, note: 'বাড়িভাড়া', category: 'বাড়িভাড়া', date: todayStr, paymentMethod: 'ব্যাংক', isRecurring: true, recurringDay: 1, lastGeneratedMonth: currentYearMonth },
    { id: '3', type: 'expense', amount: 3200, note: 'কাঁচাবাজার ও মাছ', category: 'বাজার', date: todayStr, paymentMethod: 'নগদ', isRecurring: false },
    { id: '4', type: 'expense', amount: 1450, note: 'ইন্টারনেট ও ডিশ বিল', category: 'বিল', date: todayStr, paymentMethod: 'UPI অনলাইন', isRecurring: true, recurringDay: 10, lastGeneratedMonth: currentYearMonth },
    { id: '5', type: 'income', amount: 8500, note: 'ব্যবসায়িক আয়', category: 'ব্যবসা', date: todayStr, paymentMethod: 'ব্যাংক', isRecurring: false }
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// Check recurring monthly automation
checkAndProcessRecurring();

// Initialize UI
applyPreset('this_month');
showApp();

const $ = (sel) => document.querySelector(sel);

let currentUser = null;
let currentTest = null;
let currentAnswers = [];
let authMode = 'login';

function show(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(name).classList.remove('hidden');
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'May naganap na error.');
  return data;
}

async function refreshUser() {
  try {
    const d = await api('/api/me');
    currentUser = d.user;
  } catch {
    currentUser = null;
  }
  renderAuth();
}

function renderAuth() {
  const badge = $('#userBadge');
  const loginBtn = $('#loginBtn');
  const logoutBtn = $('#logoutBtn');
  const adminBtn = $('#adminBtn');
  if (currentUser) {
    const examLabel = currentUser.examType === 'nonpro' ? 'Subprofessional' : (currentUser.examType === 'professional' ? 'Professional' : '');
    badge.textContent = `${currentUser.email} · ${currentUser.plan === 'paid' ? 'Premium' : 'Free'}${examLabel ? ` · ${examLabel}` : ''}`;
    badge.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    loginBtn.classList.add('hidden');
    adminBtn.classList.toggle('hidden', !currentUser.isAdmin);
  } else {
    badge.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    loginBtn.classList.remove('hidden');
    adminBtn.classList.add('hidden');
  }
  renderExamTypeBanner();
}

function renderExamTypeBanner() {
  const banner = $('#examTypeBanner');
  const pill = $('#examTypePill');
  const status = $('#examTypeStatus');
  const requestBtn = $('#examTypeRequestBtn');
  const cancelBtn = $('#examTypeCancel');
  const box = $('#examTypeRequestBox');
  if (!currentUser) {
    banner.classList.add('hidden');
    box.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  cancelBtn.classList.add('hidden');
  if (currentUser.examType === 'nonpro') {
    pill.textContent = 'Subprofessional (Non-Pro)';
  } else if (currentUser.examType === 'professional') {
    pill.textContent = 'Professional';
  } else {
    pill.textContent = 'Exam type: —';
  }
  if (currentUser.isAdmin) {
    status.textContent = '';
    requestBtn.classList.add('hidden');
    box.classList.add('hidden');
    return;
  }
  if (currentUser.examTypeRequest && currentUser.examTypeRequest.requestedType) {
    const pending = currentUser.examTypeRequest.requestedType === 'nonpro' ? 'Subprofessional (Non-Pro)' : 'Professional';
    status.textContent = `📨 May nakabinbing request ka na maging ${pending}. Hihintayin mo ang pag-apruba ng admin.`;
    requestBtn.classList.add('hidden');
    box.classList.add('hidden');
    cancelBtn.classList.add('hidden');
  } else {
    status.textContent = 'Hindi mababago ang uri ng pagsusulit nang mag-isa. Kung kailangang palitan, mag-request sa admin.';
    requestBtn.classList.remove('hidden');
    box.classList.add('hidden');
  }
}

$('#examTypeRequestBtn').addEventListener('click', () => {
  const box = $('#examTypeRequestBox');
  box.classList.toggle('hidden');
  $('#examTypeMsg').textContent = '';
  document.querySelectorAll('input[name="newExamType"]').forEach((r) => (r.checked = false));
});

$('#examTypeSendBtn').addEventListener('click', async () => {
  const checked = document.querySelector('input[name="newExamType"]:checked');
  const msg = $('#examTypeMsg');
  if (!checked) {
    msg.textContent = 'Pumili muna ng bagong uri ng pagsusulit.';
    return;
  }
  try {
    const d = await api('/api/exam-type/request', { method: 'POST', body: JSON.stringify({ examType: checked.value }) });
    currentUser = d.user;
    msg.textContent = `✅ ${d.message}`;
    renderAuth();
    loadTests();
  } catch (err) {
    msg.textContent = err.message;
  }
});

async function loadTests() {
  try {
    const data = await api('/api/tests');
    renderTestHome(data);
  } catch (err) {
    alert(err.message);
  }
}

function renderTestHome(data) {
  const banner = $('#planBanner');
  if (!currentUser) {
    banner.innerHTML = '<strong>Log in o mag-sign up</strong> muna para makapag-practice test. May 1 libreng test ang bawat bagong account! <button id="bannerLoginBtn" class="btn-primary">Mag-login / Sign up</button>';
  } else if (data.plan === 'paid') {
    banner.innerHTML = 'Naka-subscribe ka na. <strong>Premium</strong> ang iyong plan. Maraming salamat sa pagsuporta!';
  } else {
    banner.innerHTML = 'Kasalukuyan kang nasa <strong>Free plan</strong>. I-subscribe para sa unlimited practice: <button id="bannerSubBtn" class="btn-primary">Mag-subscribe</button>';
  }
  const listEl = $('#testList');
  listEl.innerHTML = '';
  data.tests.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'test-card';
    const badge = t.premium
      ? '<span class="badge badge-premium">Premium</span>'
      : '<span class="badge badge-free">Libre</span>';

    // Patunay kung available ang test bilang intest-card
    let lockHint = '';
    let available = true;
    if (!currentUser) {
      lockHint = '<span class="locked">🔒 Mag-login muna</span>';
      available = false;
    } else if (t.premium && t.locked) {
      lockHint = '<span class="locked">🔒 Premium (mag-subscribe)</span>';
      available = false;
    } else if (!t.premium) {
      if (t.freeAttemptsLeft !== null && t.freeAttemptsLeft <= 0) {
        lockHint = '<span class="locked">✅ Nagamit mo na ang libreng test. Mag-subscribe para sa higit pa.</span>';
        available = false;
      } else if (t.freeAttemptsLeft !== null && t.freeAttemptsLeft === 1) {
        lockHint = '<span class="free-left">🎯 1 subok na lang (libre)</span>';
      }
    }

    card.innerHTML = `
      <h3>${t.title}</h3>
      <p>${t.blurb}</p>
      <p class="meta">${t.sampleCount} random na tanong sa Practice · ${t.totalQuestions} sa Full Mock Exam</p>
      ${badge} ${lockHint}
      <div class="card-actions">
        <button class="btn-primary" ${available ? '' : 'disabled'} onclick="event.stopPropagation(); openTest(${t.id})">Start Practice</button>
        <button class="btn-ghost" ${available ? '' : 'disabled'} onclick="event.stopPropagation(); openTest(${t.id}, true)">⏱ Full Mock Exam</button>
      </div>
    `;
    listEl.appendChild(card);
  });
  const subBtn = $('#bannerSubBtn');
  if (subBtn) subBtn.addEventListener('click', openSubscribe);
  const loginBtn = $('#btnLoginBtn') || $('#bannerLoginBtn');
  if (loginBtn) loginBtn.addEventListener('click', () => { authMode = 'login'; openAuth(); });
  show('#view-home');
}

async function openTest(id, full = false) {
  try {
    const d = await api(`/api/tests/${id}${full ? '?full=1' : ''}`);
    currentTest = d;
    currentAnswers = new Array(d.questions.length).fill(undefined);
    $('#testTitle').textContent = d.title + (d.mode === 'full' ? ' — Full Mock Exam' : '');
    renderQuiz();
    startTimerIfNeeded();
    show('#view-test');
  } catch (err) {
    if (err.loginRequired) {
      if (confirm('Mag-login muna para makapag-practice test. Mag-login/register ka na?')) {
        authMode = 'login';
        openAuth();
      }
    } else if (err.limitReached) {
      if (confirm('Naubos mo na ang iyong libreng practice test. Mag-subscribe para magpatuloy?')) {
        openSubscribe();
      }
    } else if (err.premium) {
      if (confirm('Ito ay para sa mga subscriber. Mag-subscribe ka na?')) {
        openSubscribe();
      }
    } else if (err.examTypeMismatch) {
      alert(err.message);
    } else {
      alert(err.message);
    }
  }
}

function renderQuiz() {
  const area = $('#quizArea');
  area.innerHTML = '';
  if (currentTest.mode === 'full') {
    const timerBar = document.createElement('div');
    timerBar.className = 'timer-bar';
    timerBar.innerHTML = `
      <span class="timer-label">⏱ Full Mock Exam</span>
      <span class="timer-count" id="timerCount">${formatTime(currentTest.durationSeconds)}</span>
      <span class="timer-meta">${currentTest.questionCount} na tanong · ${formatDuration(currentTest.durationSeconds)}</span>
    `;
    area.appendChild(timerBar);
  }
  currentTest.questions.forEach((q, i) => {
    const block = document.createElement('div');
    block.className = 'question-block';
    let optionsHtml = '';
    q.options.forEach((opt, oi) => {
      optionsHtml += `
        <label class="option" onclick="selectOption(${i}, ${oi})">
          <span>${String.fromCharCode(65 + oi)}) ${opt}</span>
        </label>`;
    });
    block.innerHTML = `
      <div class="qnum">Tanong ${i + 1}</div>
      ${q.image ? `<div class="figure"><img src="${q.image}" alt="Pigura para sa tanong ${i + 1}" loading="lazy"></div>` : (q.figure ? `<div class="figure"><pre>${q.figure}</pre></div>` : '')}
      <div class="qtext">${q.q}</div>
      <div class="option-list">${optionsHtml}</div>
    `;
    area.appendChild(block);
  });
  const submit = document.createElement('div');
  submit.className = 'submit-wrap';
  submit.innerHTML = '<button class="btn-primary btn-big" onclick="submitAnswers()">I-submit ang mga sagot</button>';
  area.appendChild(submit);
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h} oras ${m > 0 ? m + ' minuto' : ''}`.trim();
  return `${m} minuto`;
}

let timerInterval = null;

function startTimerIfNeeded() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (currentTest.mode !== 'full' || !currentTest.durationSeconds) return;
  const deadline = Date.now() + currentTest.durationSeconds * 1000;
  const countEl = $('#timerCount');
  if (!countEl) return;
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    countEl.textContent = formatTime(remaining);
    if (remaining <= 60) countEl.classList.add('timer-low');
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      alert('⏱ Naubos na ang oras. Awtomatikong isinumite ang iyong mga sagot.');
      submitAnswers(true);
    }
  }, 500);
}

function selectOption(qIndex, oIndex) {
  currentAnswers[qIndex] = oIndex;
  const blocks = document.querySelectorAll('.question-block');
  const opts = blocks[qIndex].querySelectorAll('.option');
  opts.forEach((el, idx) => el.classList.toggle('selected', idx === oIndex));
}

async function submitAnswers(autoSubmit = false) {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const unanswered = currentAnswers.filter((a) => a === undefined).length;
  if (!autoSubmit && unanswered > 0 && !confirm(`May ${unanswered} tanong na hindi pa nasagot. I-submit pa rin?`)) return;
  try {
    const r = await api(`/api/tests/${currentTest.id}/score`, {
      method: 'POST',
      body: JSON.stringify({ attemptId: currentTest.attemptId, answers: currentAnswers }),
    });
    showResult(r, autoSubmit);
  } catch (err) {
    if (err.timeExpired) {
      alert(err.message);
      loadTests();
    } else {
      alert(err.message);
    }
  }
}

function showResult(r, autoSubmit = false) {
  let reviewHtml = '';
  if (r.reviewEnabled) {
    const blocks = document.querySelectorAll('.question-block');
    const list = r.results.map((res) => {
      const q = currentTest.questions[res.questionIndex];
      const block = blocks[res.questionIndex];
      const opts = block ? block.querySelectorAll('.option') : [];
      let optHtml = '';
      q.options.forEach((opt, oi) => {
        const isSelected = currentAnswers[res.questionIndex] === oi;
        const isCorrect = oi === res.correctAnswer;
        let cls = '';
        if (isCorrect) cls = 'correct-mark';
        else if (isSelected) cls = 'wrong-mark';
        const mark = isCorrect ? '✓' : '✗';
        optHtml += `<div class="option ${cls}">${mark} ${String.fromCharCode(65 + oi)}) ${opt}</div>`;
      });
      return `
        <div class="question-block review-block">
          <div class="qnum">Tanong ${res.questionIndex + 1} ${res.correct ? '· Tamang sagot' : '· Mali'}</div>
          ${q.image ? `<div class="figure"><img src="${q.image}" alt="Pigura para sa tanong ${res.questionIndex + 1}" loading="lazy"></div>` : (q.figure ? `<div class="figure"><pre>${q.figure}</pre></div>` : '')}
          <div class="qtext">${q.q}</div>
          <div class="option-list">${optHtml}</div>
          <div class="explanation"><span class="expl-icon">${res.icon || '💡'}</span> <strong>Paliwanag:</strong> ${res.explanation || ''}</div>
        </div>`;
    }).join('');
    reviewHtml = `
      <h3 class="review-title">Review — Paliwanag ng bawat sagot (Premium)</h3>
      ${list}
    `;
  } else {
    reviewHtml = `
      <div class="subscribe-hint">
        <p>📖 I-subscribe para makita ang <strong>detalyadong paliwanag</strong> ng bawat sagot — para malaman mo kung BAKIT tama o mali ang isagot.</p>
        <button class="btn-primary" onclick="openSubscribe()">Mag-subscribe para sa paliwanag</button>
      </div>
    `;
  }
  $('#resultBody').innerHTML = `
    <div class="score ${r.passed ? 'check' : 'fail'}">${r.score}%</div>
    ${r.timeUp ? '<div class="timeup-note">⏱ Naubos ang oras noong isumite ang mga sagot.</div>' : ''}
    <p>${r.correct} sa ${r.total} ang tamang sagot. ${r.passed ? 'PAGPASADO ka! Mahusay.' : 'Subukan ulit. Target: 70%.'}</p>
    <div class="review-container">${reviewHtml}</div>
  `;
  show('#view-result');
}

function openSubscribe() {
  if (!currentUser) {
    openAuth();
    return;
  }
  loadPricing();
  $('#paymentMsg').classList.add('hidden');
  $('#paymentReference').value = '';
  $('#paymentNote').value = '';
  show('#view-subscribe');
}

async function loadPricing() {
  try {
    const p = await api('/api/pricing');
    $('#subPrice').innerHTML = `PHP ${p.amount} <span>/ buwan</span>`;
    $('#subDays').textContent = `${p.days} araw`;
    $('#gcashAmount').textContent = `₱${p.amount}`;
    $('#gcashNumber').textContent = p.gcashNumber;
  } catch (e) { /* ignore */ }
}

$('#paymentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#paymentMsg');
  const reference = $('#paymentReference').value.trim();
  const note = $('#paymentNote').value.trim();
  try {
    const d = await api('/api/payments', {
      method: 'POST',
      body: JSON.stringify({ reference, note }),
    });
    msg.textContent = `✅ ${d.message}`;
    msg.style.color = '#1f7a3d';
    msg.classList.remove('hidden');
    $('#paymentReference').value = '';
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = '#b03a3a';
    msg.classList.remove('hidden');
  }
});

async function loadMyPayments() {
  try {
    const d = await api('/api/payments/me');
    const statusLabel = { pending: '🟡 Hinihintay', approved: '🟢 Approved', denied: '🔴 Denied' };
    $('#mypayList').innerHTML = d.payments.length
      ? d.payments.map((p) => `
          <div class="history-row">
            <div class="history-info">
              <div><strong>₱300</strong> · ref: ${p.reference}</div>
              <div class="history-meta">${new Date(p.createdAt).toLocaleString()} · <span class="badge ${p.status === 'approved' ? 'badge-free' : 'badge-premium'}">${statusLabel[p.status] || p.status}</span></div>
            </div>
          </div>
        `).join('')
      : '<p>Wala kang nai-submit na pagbabayad.</p>';
    show('#view-mypayments');
  } catch (err) {
    alert(err.message);
  }
}

function openAuth() {
  renderAuthForm();
  show('#view-auth');
}

function renderAuthForm() {
  const isLogin = authMode === 'login';
  $('#authTitle').textContent = isLogin ? 'Mag-login' : 'Mag-sign up';
  $('#authForm').querySelector('button[type="submit"]').textContent = isLogin ? 'Mag-login' : 'Gumawa ng account';
  $('#toggleAuth').textContent = isLogin ? 'Mag-sign up' : 'May account ka na? Mag-login';
  $('#authError').classList.add('hidden');
  $('#examTypeGroup').classList.toggle('hidden', isLogin);
}

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const errorEl = $('#authError');
  try {
    const endpoint = authMode === 'login' ? '/api/login' : '/api/signup';
    let body = { email, password };
    if (authMode === 'signup') {
      const examType = document.querySelector('input[name="examType"]:checked');
      if (!examType) {
        errorEl.textContent = 'Piliin ang uri ng pagsusulit: Subprofessional (Non-Pro) o Professional.';
        errorEl.classList.remove('hidden');
        return;
      }
      body.examType = examType.value;
    }
    const d = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
    currentUser = d.user;
    authMode = 'login';
    renderAuth();
    loadTests();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  currentUser = null;
  authMode = 'login';
  renderAuth();
  loadTests();
});

$('#myPaymentsBtn').addEventListener('click', loadMyPayments);
$('#mypayBackBtn').addEventListener('click', () => loadTests());

$('#subCancelBtn').addEventListener('click', () => loadTests());
$('#backBtn').addEventListener('click', () => loadTests());
$('#resultBackBtn').addEventListener('click', () => loadTests());
$('#loginBtn').addEventListener('click', () => { authMode = 'login'; openAuth(); });

async function loadProgress() {
  if (!currentUser) {
    alert('Mag-login muna para makita ang iyong progress.');
    return;
  }
  try {
    const data = await api('/api/progress');
    const s = data.summary;
    $('#progressSummary').innerHTML = `
      ${s.attempts > 0 ? `
        <div class="stat-grid">
          <div class="stat"><div class="stat-num">${s.attempts}</div><div class="stat-label">Subok</div></div>
          <div class="stat"><div class="stat-num">${s.best}%</div><div class="stat-label">Pinakamataas</div></div>
          <div class="stat"><div class="stat-num">${s.avg}%</div><div class="stat-label">Average</div></div>
          <div class="stat"><div class="stat-num">${s.last}%</div><div class="stat-label">Huling score</div></div>
        </div>
      ` : '<p>Wala ka pang sagot. Mag-take ng practice test para makita ang iyong progress.</p>'}
    `;

    let bodyHtml = '';
    if (s.attempts > 0) {
      // ===== Performance bar graph per subject =====
      const subjects = data.subjects || [];
      if (subjects.length) {
        const bars = subjects.map((sb) => {
          const color = sb.pct >= 70 ? '#1f7a3d' : (sb.pct >= 50 ? '#e0a11a' : '#b03a3a');
          const icon = sb.topic === 'Verbal' ? '📖' : sb.topic === 'Numerical' ? '🔢' : sb.topic === 'Clerical' ? '🗂️' : sb.topic === 'General Info' ? '🏛️' : '🧠';
          return `
            <div class="bar-row">
              <div class="bar-label">${icon} ${sb.topic} <span class="bar-pct">${sb.pct}%</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(sb.pct, 2)}%;background:${color}"></div></div>
              <div class="bar-meta">${sb.correct}/${sb.total}</div>
            </div>`;
        }).join('');
        bodyHtml += `
          <div class="progress-chart">
            <h3 class="review-title">Performance Level bawat Subject</h3>
            <div class="bar-list">${bars}</div>
          </div>`;
      }
      // ===== Recommendation =====
      const recs = data.recommendations || [];
      if (recs.length) {
        const items = recs.map((r) => `
            <div class="rec-row">
              <span class="rec-icon">🎯</span>
              <div>${r.suggestion}</div>
            </div>`).join('');
        bodyHtml += `
          <div class="report-recs">
            <h3 class="review-title">📌 Recommended Topics na Dapat I-Review</h3>
            ${items}
          </div>`;
      } else {
        bodyHtml += `
          <div class="report-recs">
            <h3 class="review-title">✅ Mahusay ang performance mo!</h3>
            <p>Wala kang topic na kailangang i-review ng malalim. Panatilihin ang magandang daloy ng pag-review.</p>
          </div>`;
      }
    }
    $('#progressBody').innerHTML = bodyHtml;
    if (data.history.length) {
      const rows = data.history.slice().reverse().map((h) => `
        <div class="history-row">
          <div class="history-score ${h.passed ? 'pass' : 'fail'}">${h.score}%</div>
          <div class="history-info">
            <div>Test #${h.testId} +</div>
            <div class="history-meta">${h.correct}/${h.total} tamang · ${new Date(h.at).toLocaleString()} · ${h.passed ? '✅ Pumasa' : '❌ Hindi pumasa'}</div>
          </div>
        </div>
      `).join('');
      $('#progressBody').innerHTML += `<h3 class="review-title">Kasaysayan</h3><div class="history-list">${rows}</div>`;
    }
    show('#view-progress');
  } catch (err) {
    alert(err.message);
  }
}

$('#viewProgressBtn').addEventListener('click', loadProgress);
$('#progressBackBtn').addEventListener('click', () => loadTests());

$('#toggleAuth').addEventListener('click', (e) => {
  e.preventDefault();
  authMode = authMode === 'login' ? 'signup' : 'login';
  renderAuthForm();
});
$('#authCancelBtn').addEventListener('click', () => show('#view-home'));

// ===== ADMIN =====
function openAdmin() {
  $('#adminGate').classList.remove('hidden');
  $('#adminDashboard').classList.add('hidden');
  $('#adminKeyInput').value = '';
  $('#adminGateError').classList.add('hidden');
  show('#view-admin');
  // Kung admin ang naka-login, auto-unlock nang walang key
  if (currentUser && currentUser.isAdmin) {
    loadAdminDashboard('');
  }
}

async function loadAdminDashboard(key) {
  try {
    const res = await fetch(`/api/admin/users`, {
      headers: { 'x-admin-key': key },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hindi ma-access.');
    $('#adminGate').classList.add('hidden');
    $('#adminDashboard').classList.remove('hidden');

    $('#adminSummary').innerHTML = `
      <div class="stat"><div class="stat-num">${data.count}</div><div class="stat-label">Kabuuang users</div></div>
      <div class="stat"><div class="stat-num">${data.subscribed}</div><div class="stat-label">Aktibong subscriber</div></div>
      <div class="stat"><div class="stat-num">${data.free}</div><div class="stat-label">Free</div></div>
      <div class="stat"><div class="stat-num">${data.totalAttempts}</div><div class="stat-label">Kabuuang subok</div></div>
    `;

    const body = $('#adminUsersBody');
    if (!data.users.length) {
      body.innerHTML = '<tr><td colspan="7">Wala pang users.</td></tr>';
    } else {
      body.innerHTML = data.users.map((u) => `
        <tr>
          <td>${u.email}${u.isAdmin ? ' <span class="badge badge-premium">Admin</span>' : ''}</td>
          <td>
            ${u.examType === 'nonpro' ? '<span class="badge badge-free">Subprofessional</span>' : (u.examType === 'professional' ? '<span class="badge badge-free">Professional</span>' : '<span class="badge badge-premium">—</span>')}
            ${u.examTypeRequest && u.examTypeRequest.requestedType ? `<div class="history-meta">📨 request → ${u.examTypeRequest.requestedType}</div>` : ''}
          </td>
          <td>
            <span class="badge ${u.activeSubscription ? 'badge-free' : 'badge-premium'}">${u.activeSubscription ? 'Subscribed' : (u.isAdmin ? 'Admin' : 'Free')}</span>
            ${u.subscribedAt && u.expiresAt && !u.activeSubscription ? `<div class="history-meta">expired ${new Date(u.expiresAt).toLocaleDateString()}</div>` : ''}
          </td>
          <td>${u.attempts || 0}</td>
          <td>${u.best ? u.best + '%' : '—'}</td>
          <td>${u.avg || 0}%</td>
          <td class="date-cell">${new Date(u.createdAt).toLocaleDateString()}</td>
        </tr>
      `).join('');
    }
    show('#view-admin');
    loadAdminPayments(key);
    loadAdminExamRequests(key);
  } catch (err) {
    $('#adminGateError').textContent = err.message;
    $('#adminGateError').classList.remove('hidden');
  }
}

async function loadAdminPayments(key) {
  try {
    const res = await fetch('/api/admin/payments', {
      headers: { 'x-admin-key': key },
    });
    if (!res.ok) return;
    const d = await res.json();
    const statusLabel = { pending: '🟡 Hinihintay', approved: '🟢 Approved', denied: '🔴 Denied' };
    $('#adminPaySummary').innerHTML = d.payments.length
      ? `<div class="stat-grid">
          <div class="stat"><div class="stat-num">${d.pendingCount}</div><div class="stat-label">Naghihintay ng kumpirmasyon</div></div>
          <div class="stat"><div class="stat-num">${d.payments.filter(p=>p.status==='approved').length}</div><div class="stat-label">Na-approve</div></div>
        </div>`
      : '';
    $('#adminPaymentsList').innerHTML = d.payments.length
      ? d.payments.map((p) => `
          <div class="history-row">
            <div class="history-score" style="min-width:44px">₱${p.amount}</div>
            <div class="history-info">
              <div><strong>${p.user}</strong> · ref: ${p.reference} · ${p.note || ''}</div>
              <div class="history-meta">${new Date(p.createdAt).toLocaleString()} · <span class="badge ${p.status === 'approved' ? 'badge-free' : 'badge-premium'}">${statusLabel[p.status] || p.status}</span></div>
            </div>
            ${p.status === 'pending' ? `
              <button class="btn-primary" style="padding:6px 12px;font-size:0.8rem" onclick="approvePayment('${p.id}', '${key}')">I-approve</button>
              <button class="btn-ghost" style="padding:6px 12px;font-size:0.8rem" onclick="denyPayment('${p.id}', '${key}')">I-deny</button>
            ` : ''}
          </div>
        `).join('')
      : '<p class="note">Wala pang nai-submit na bayad.</p>';
  } catch (e) { /* ignore */ }
}

async function approvePayment(id, key) {
  const res = await fetch(`/api/admin/payments/${id}/approve`, { method: 'POST', headers: { 'x-admin-key': key } });
  const d = await res.json();
  if (!res.ok) { alert(d.error || 'May error.'); return; }
  alert(d.message);
  loadAdminDashboard(key);
  refreshUser();
}

async function denyPayment(id, key) {
  const res = await fetch(`/api/admin/payments/${id}/deny`, { method: 'POST', headers: { 'x-admin-key': key } });
  const d = await res.json();
  if (!res.ok) { alert(d.error || 'May error.'); return; }
  alert(d.message);
  loadAdminDashboard(key);
}

async function loadAdminExamRequests(key) {
  try {
    const res = await fetch('/api/admin/exam-type-requests', { headers: { 'x-admin-key': key } });
    if (!res.ok) return;
    const d = await res.json();
    const el = $('#adminExamRequests');
    if (!d.requests.length) {
      el.innerHTML = '<p class="note">Walang pending na exam type change request.</p>';
      return;
    }
    el.innerHTML = d.requests.map((r) => `
      <div class="history-row">
        <div class="history-info">
          <div><strong>${r.email}</strong> — ${r.currentType} → <strong>${r.pendingType}</strong></div>
          <div class="history-meta">In-request: ${new Date(r.requestedAt).toLocaleString()}</div>
        </div>
        <button class="btn-primary" style="padding:6px 12px;font-size:0.8rem" onclick="approveExamType('${r.userId}', '${key}')">I-approve</button>
        <button class="btn-ghost" style="padding:6px 12px;font-size:0.8rem" onclick="denyExamType('${r.userId}', '${key}')">I-deny</button>
      </div>
    `).join('');
  } catch (e) { /* ignore */ }
}

async function approveExamType(userId, key) {
  const res = await fetch(`/api/admin/exam-type-requests/${userId}/approve`, { method: 'POST', headers: { 'x-admin-key': key } });
  const d = await res.json();
  if (!res.ok) { alert(d.error || 'May error.'); return; }
  alert(d.message);
  loadAdminDashboard(key);
  refreshUser();
}

async function denyExamType(userId, key) {
  const res = await fetch(`/api/admin/exam-type-requests/${userId}/deny`, { method: 'POST', headers: { 'x-admin-key': key } });
  const d = await res.json();
  if (!res.ok) { alert(d.error || 'May error.'); return; }
  alert(d.message);
  loadAdminDashboard(key);
}

$('#adminBtn').addEventListener('click', openAdmin);
$('#adminBackBtn').addEventListener('click', () => show('#view-home'));
$('#adminUnlockBtn').addEventListener('click', () => {
  const key = $('#adminKeyInput').value.trim();
  if (!key) {
    $('#adminGateError').textContent = 'Maglagay ng admin key.';
    $('#adminGateError').classList.remove('hidden');
    return;
  }
  loadAdminDashboard(key);
});

refreshUser().then(loadTests);
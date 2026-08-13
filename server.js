import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  initDb,
  findUserByEmail,
  findUserById,
  createUser,
  getUserIdByToken,
  createSession,
  destroySession,
  setPlan,
  isSubscribed,
  grantSubscription,
  revokeSubscription,
  setExamType,
  setExamTypeRequest,
  clearExamTypeRequest,
  isExamType,
  recordScore,
  getHistory,
  getAllUsers,
  createPayment,
  getAllPayments,
  setPaymentStatus,
  getPendingPaymentsCount,
  getStoreMode,
} from './store.js';
import { tests } from './tests-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'masterypass2026';
const SUBSCRIPTION_DAYS = 30;
const PRICE_PHP = 300;
const GCASH_NUMBER = process.env.GCASH_NUMBER || '09158907953'; // PALITAN mo ito ng sarili mong GCash number!
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@mastery.ph';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass123';
const SEED_DEMOS = process.env.SEED_DEMOS !== 'false'; // i-off ang demo users sa production kung ayaw mo

app.use(express.json());
app.use(compression());
// I-cache ang mga static assets (HTML/CSS/JS/SVG) para hindi i-download muli sa bawat navigation
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.svg')) res.setHeader('Cache-Control', 'public, max-age=86400');
    else if (filePath.endsWith('.css') || filePath.endsWith('.js')) res.setHeader('Cache-Control', 'public, max-age=3600');
  },
}));

function getSessionToken(req) {
  return req.headers.cookie
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('session='))
    ?.split('=')[1] || null;
}

async function currentUser(req) {
  const token = getSessionToken(req);
  const userId = token ? await getUserIdByToken(token) : null;
  return userId ? findUserById(userId) : null;
}

function hashPassword(password, salt) {
  return createHash('sha256').update(salt + password).digest('hex');
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
}

function requireAuth(user, res) {
  if (!user) {
    res.status(401).json({ error: 'Not logged in' });
    return false;
  }
  return true;
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    plan: u.plan,
    isAdmin: u.isAdmin || false,
    examType: u.examType || null,
    examTypeRequest: u.examTypeRequest || null,
    subscribedAt: u.subscribedAt,
    expiresAt: u.expiresAt,
    activeSubscription: isSubscribed(u),
    createdAt: u.createdAt,
  };
}

app.post('/api/signup', async (req, res) => {
  const { email, password, examType } = req.body || {};
  if (!email || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Kailangan ng valid email at password (hindi bababa sa 6 na karakter).' });
  }
  if (!examType || !['nonpro', 'professional'].includes(examType)) {
    return res.status(400).json({ error: 'Piliin ang iyong uri ng pagsusulit: Subprofessional (Non-Pro) o Professional.' });
  }
  if (await findUserByEmail(email)) {
    return res.status(409).json({ error: 'May account na sa email na ito. Mag-login na lang.' });
  }
  const user = await createUser(email, password, { examType });
  const token = await createSession(user.id);
  setCookie(res, token);
  res.json({ user: publicUser(user) });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Mali ang email o password.' });
  if (!user.passwordHash || user.passwordHash !== hashPassword(password, user.salt)) {
    return res.status(401).json({ error: 'Mali ang email o password.' });
  }
  const token = await createSession(user.id);
  setCookie(res, token);
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', async (req, res) => {
  const token = getSessionToken(req);
  if (token) await destroySession(token);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: publicUser(user) });
});

// Mabilis na in-memory cache ng /api/tests para sa bawat (userId, isPaid) combination.
// I-invalidate sa loob ng 30 segundo; hindi nito sinisira ang live data dahil maliit lang ang TTL.
const testsCache = new Map();
const TESTS_CACHE_TTL = 30 * 1000;

function cacheKeyFor(userId, isPaid) {
  return `${userId || 'anon'}|${isPaid ? 'paid' : 'free'}`;
}

app.get('/api/tests', async (req, res) => {
  const user = await currentUser(req);
  const isPaid = isSubscribed(user);
  const key = cacheKeyFor(user?.id, isPaid);
  const cached = testsCache.get(key);
  if (cached && Date.now() - cached.at < TESTS_CACHE_TTL) {
    return res.json(cached.body);
  }
  const freeLimit = 1; // ilang beses maaaring kunin ang libreng test
  const list = tests
    // Kung naka-login ang user, ipakita LANG ang test na akma sa kanyang uri ng pagsusulit
    .filter((t) => {
      if (!user) return true;
      if (user.isAdmin) return true;
      return isExamType(t.examType, user);
    })
    .map(async (t) => {
      let attemptLeft = null;
      let locked = false;
      if (t.premium) {
        locked = !isPaid;
      } else if (user && !isPaid) {
        const history = await getHistory(user.id);
        const done = history.filter((h) => h.testId === t.id).length;
        attemptLeft = Math.max(0, freeLimit - done);
        locked = attemptLeft === 0;
      } else if (!user) {
        locked = false;
      }
      return {
        id: t.id,
        title: t.title,
        blurb: t.blurb,
        premium: t.premium,
        examType: t.examType,
        locked,
        freeAttemptsLeft: attemptLeft, // subok pa sa libre
        totalQuestions: t.bank.length,
        sampleCount: t.sampleCount,
      };
    });
  const body = { tests: await Promise.all(list), plan: isPaid ? 'paid' : 'free' };
  testsCache.set(key, { at: Date.now(), body });
  res.json(body);
});

// Shuffle para sa random sampling
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Durasyon ng full mock exam base sa aktwal na CSC format:
// Professional = 170 tanong sa 3h10m (190 min) -> ~67.1 segundo bawat tanong
// Subprofessional = 165 tanong sa 2h40m (160 min) -> ~58.2 segundo bawat tanong
function examDurationSeconds(t, count) {
  const secPerQuestion = t.examType === 'nonpro' ? 58.2 : 67.1;
  return Math.round(count * secPerQuestion);
}

const attempts = new Map(); // attemptId -> { testId, questions, userId, at }

app.get('/api/tests/:id', async (req, res) => {
  const user = await currentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Mag-login muna bago mag-practice test.', loginRequired: true });
  }
  const isPaid = isSubscribed(user);
  const t = tests.find((x) => x.id === Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Hindi mahanap ang test.' });
  if (!isExamType(t.examType, user)) {
    return res.status(403).json({ error: 'Ang test na ito ay hindi para sa iyong uri ng pagsusulit. Para baguhin ito, kailangan mong humingi ng permiso sa admin.', examTypeMismatch: true });
  }
  if (t.premium && !isPaid) {
    return res.status(403).json({ error: 'Ito ay para sa mga subscriber. Mag-subscribe muna.', premium: true });
  }
  if (!t.premium && !isPaid) {
    const history = await getHistory(user.id);
    const done = history.filter((h) => h.testId === t.id).length;
    if (done >= 1) {
      return res.status(403).json({
        error: 'Naubos mo na ang iyong libreng practice test. Mag-subscribe para magpatuloy.',
        limitReached: true,
      });
    }
  }
  // Full mock exam (?full=1): kunin ang LAHAT ng tanong mula sa bank, may timer
  const isFull = req.query.full === '1' || req.query.full === 'true';
  const pool = isFull ? t.bank : shuffle(t.bank).slice(0, t.sampleCount);
  const durationSeconds = isFull ? examDurationSeconds(t, pool.length) : 0;
  // Mag-imbak ng attempt para ma-score nang tama ang mga ito
  const token = `${t.id}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  attempts.set(token, {
    testId: t.id,
    userId: user?.id || null,
    questions: pool,
    mode: isFull ? 'full' : 'practice',
    durationSeconds,
    startedAt: Date.now(),
    at: Date.now(),
  });
  const questions = pool.map((q) => ({ q: q.q, options: q.options, figure: q.figure || null, image: q.image || null }));
  res.json({
    id: t.id,
    title: t.title,
    premium: t.premium,
    attemptId: token,
    mode: isFull ? 'full' : 'practice',
    durationSeconds,
    questionCount: pool.length,
    questions,
  });
});

// Tanong ng Araw (Question of the Day) — pareho para sa lahat kada araw.
// Deterministic: batay sa kasalukuyang petsa, kaya hindi nagbabago sa bawat request.
app.get('/api/question-of-the-day', async (req, res) => {
  const all = [];
  for (const t of tests) {
    for (const q of t.bank) all.push({ ...q, testTitle: t.title });
  }
  if (!all.length) return res.json({ question: null });
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  let hash = 0;
  for (const ch of dayKey) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  const q = all[hash % all.length];
  res.json({
    date: dayKey,
    question: {
      q: q.q,
      options: q.options,
      answer: q.answer,
      topic: q.topic || null,
      explanation: q.explanation || null,
      figure: q.figure || null,
      image: q.image || null,
      testTitle: q.testTitle,
    },
  });
});

app.post('/api/tests/:id/score', async (req, res) => {
  const user = await currentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Mag-login ka muna para mag-submit ng sagot.', loginRequired: true });
  }
  const isPaid = isSubscribed(user);
  const t = tests.find((x) => x.id === Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Hindi mahanap ang test.' });
  if (!isExamType(t.examType, user)) {
    return res.status(403).json({ error: 'Ang test na ito ay hindi para sa iyong uri ng pagsusulit.', examTypeMismatch: true });
  }
  if (t.premium && !isPaid) {
    return res.status(403).json({ error: 'Ito ay para sa mga subscriber.' });
  }
  if (!t.premium && !isPaid) {
    const history = await getHistory(user.id);
    const done = history.filter((h) => h.testId === t.id).length;
    if (done >= 1) {
      return res.status(403).json({
        error: 'Naubos mo na ang iyong libreng test. Mag-subscribe para magpatuloy.',
        limitReached: true,
      });
    }
  }
  const attemptId = req.body?.attemptId;
  const attempt = attempts.get(attemptId);
  if (!attempt || attempt.testId !== t.id) {
    return res.status(400).json({ error: 'Hindi valid ang attempt. Balikan ang test at subukan ulit.' });
  }
  if (attempt.userId && user.id !== attempt.userId) {
    return res.status(403).json({ error: 'Hindi ito iyong attempt.' });
  }
  // Enforce ang timer para sa full mock exam (server-side, 60-sec grace para sa network lag)
  let timeUp = false;
  if (attempt.mode === 'full' && attempt.durationSeconds > 0) {
    const elapsed = Date.now() - attempt.startedAt;
    timeUp = elapsed > attempt.durationSeconds * 1000;
    if (elapsed > (attempt.durationSeconds + 60) * 1000) {
      return res.status(400).json({ error: 'Naubos na ang oras ng exam. Simulan ang full mock exam ulit para makapag-submit.', timeExpired: true });
    }
  }
  const answers = req.body?.answers || [];
  let correct = 0;
  const topicStats = {};
  const results = attempt.questions.map((q, i) => {
    const ok = answers[i] === q.answer;
    if (ok) correct++;
    const topic = q.topic || 'Pangkalahatan';
    topicStats[topic] = topicStats[topic] || { correct: 0, total: 0 };
    topicStats[topic].total++;
    if (ok) topicStats[topic].correct++;
    return {
      questionIndex: i,
      correct: ok,
      correctAnswer: q.answer,
      // Explanation ay para LANG sa subscriber (premium)
      explanation: isPaid ? q.explanation : null,
      icon: isPaid ? q.icon : null,
    };
  });
  const total = attempt.questions.length;
  const score = Math.round((correct / total) * 100);
  await recordScore(user.id, t.id, correct, total, score, topicStats);
  attempts.delete(attemptId);
  res.json({
    testId: t.id,
    mode: attempt.mode,
    timeUp,
    correct,
    total,
    score,
    passed: score >= 70,
    reviewEnabled: isPaid,
    results,
  });
});

app.get('/api/progress', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Mag-login muna.' });
  const history = await getHistory(user.id);

  // I-aggregate ang per-subject na performance mula sa mga nakalap na attempt
  const topicAgg = {};
  for (const h of history) {
    if (!h.topics || typeof h.topics !== 'object') continue;
    for (const [topic, v] of Object.entries(h.topics)) {
      topicAgg[topic] = topicAgg[topic] || { correct: 0, total: 0 };
      topicAgg[topic].correct += v.correct;
      topicAgg[topic].total += v.total;
    }
  }
  const subjects = Object.entries(topicAgg)
    .map(([topic, v]) => ({
      topic,
      correct: v.correct,
      total: v.total,
      pct: Math.round((v.correct / v.total) * 100),
    }))
    .sort((a, b) => a.pct - b.pct);

  // Recommended topic: kung saan mababa ang performance (< 70% pumasa)
  const recommendations = subjects
    .filter((s) => s.pct < 70)
    .map((s) => ({
      topic: s.topic,
      pct: s.pct,
      suggestion: `Mababa ang iyong iskor sa ${s.topic.toLowerCase()} (${s.pct}%). Mag-extra practice sa mga tanong tungkol sa ${s.topic.toLowerCase()} at pag-aral ang mga paliwanag.`,
    }));

  const summary = history.length
    ? {
        attempts: history.length,
        best: Math.max(...history.map((h) => h.score)),
        last: history[history.length - 1].score,
        avg: Math.round(history.reduce((s, h) => s + h.score, 0) / history.length),
      }
    : { attempts: 0, best: 0, last: 0, avg: 0 };

  res.json({ history, summary, subjects, recommendations });
});

// ADMIN AUTH: tanggap ang admin key (header o ?key=) O isang naka-login na user na isAdmin
async function isAdmin(req) {
  const u = await currentUser(req);
  if (u && u.isAdmin) return true;
  const key =
    req.get('x-admin-key') ||
    (typeof req.query.key === 'string' ? req.query.key : '');
  return key === ADMIN_KEY;
}

// ADMIN: listahan ng lahat ng users + summary
app.get('/api/admin/users', async (req, res) => {
  if (!await isAdmin(req)) {
    return res.status(401).json({ error: 'Hindi awtorisado. Maglagay ng admin key.' });
  }
  const users = await getAllUsers();
  const subscribed = users.filter((u) => u.activeSubscription).length;
  const totalAttempts = users.reduce((s, u) => s + (u.attempts || 0), 0);
  res.json({
    count: users.length,
    subscribed,
    free: users.length - subscribed,
    totalAttempts,
    users,
  });
});

// ADMIN: magdagdag ng bagong tanong sa question bank (para sa "updated" na content)
app.post('/api/admin/questions', (req, res) => {
  isAdmin(req).then((admin) => {
    if (!admin) {
      return res.status(401).json({ error: 'Admin key required.' });
    }
    const { testId, question, options, answer, explanation } = req.body || {};
    const t = tests.find((x) => x.id === Number(testId));
    if (!t) return res.status(404).json({ error: 'Hindi mahanap ang test.' });
    if (!question || !Array.isArray(options) || options.length < 2 || answer === undefined || !explanation) {
      return res.status(400).json({ error: 'Kailangan: testId, question, options (≥2), answer, explanation.' });
    }
    if (answer < 0 || answer >= options.length) {
      return res.status(400).json({ error: 'Ang answer ay dapat index ng options (0-based).' });
    }
    const icon = req.body.icon || '💡';
    t.bank.push({ q: question, options, answer, explanation, icon });
    res.json({
      ok: true,
      message: `Naidagdag ang tanong sa Test #${t.id}. Bago na ngayon: ${t.bank.length} tanong.`,
      total: t.bank.length,
    });
  });
});

// ADMIN: bilang ng tanong bawat bank
app.get('/api/admin/status', async (req, res) => {
  if (!await isAdmin(req)) {
    return res.status(401).json({ error: 'Admin key required.' });
  }
  res.json({
    tests: tests.map((t) => ({ id: t.id, title: t.title, bankSize: t.bank.length, sampleCount: t.sampleCount })),
    attemptsActive: attempts.size,
  });
});

// ===== SUBSCRIPTION (GCash manual) =====
// Paraan: mag-submit ng reference, ang admin ang magkokumpirma pagkatapos makita ang GCash transaction

app.post('/api/subscribe', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Mag-login muna bago mag-subscribe.' });
  const { reference } = req.body || {};
  if (!reference || String(reference).trim() === '') {
    return res.status(400).json({ error: 'Ilagay ang GCash reference number para ma-proseso.' });
  }
  res.json({ gcashNumber: GCASH_NUMBER, amount: PRICE_PHP });
});

// Gumawa ng payment record (pagkatapos magbayad sa GCash)
app.post('/api/payments', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Mag login muna.' });
  if (isSubscribed(user)) {
    return res.status(400).json({ error: 'Aktibo pa ang iyong subscription, hindi na kailangang magbayad muli.' });
  }
  const { reference, note } = req.body || {};
  if (!reference || String(reference).trim() === '') {
    return res.status(400).json({ error: 'Isulat ang GCash reference number.' });
  }
  const payment = await createPayment(user.id, String(reference).trim(), note || '');
  res.json({
    payment,
    message: `Natanggap ang iyong reference (₱${PRICE_PHP}). Hintayin ang kumpirmasyon ng admin (karaniwan <24 oras).`,
    gcashNumber: GCASH_NUMBER,
    amount: PRICE_PHP,
  });
});

// Tingnan ang sariling payment status ng user
app.get('/api/payments/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Mag login muna.' });
  const all = await getAllPayments();
  const mine = all.filter((p) => p.userId === user.id);
  res.json({ payments: mine });
});

// USER: humiling ng pagbabago ng exam type (hindi kayang baguhin nang direkta)
app.post('/api/exam-type/request', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Mag-login muna.' });
  const { examType } = req.body || {};
  if (!examType || !['nonpro', 'professional'].includes(examType)) {
    return res.status(400).json({ error: 'Piliin ang iyong uri ng pagsusulit: Subprofessional (Non-Pro) o Professional.' });
  }
  if (examType === user.examType) {
    return res.status(400).json({ error: 'Ito na ang iyong kasalukuyang uri ng pagsusulit.' });
  }
  if (user.examTypeRequest && user.examTypeRequest.requestedType === examType) {
    return res.status(400).json({ error: 'May nakabinbing request ka na para dito. Hintayin ang admin.' });
  }
  const updated = await setExamTypeRequest(user.id, examType);
  res.json({
    user: publicUser(updated),
    message: `Magandang araw! Naipadala na ang iyong request na maging ${examType === 'nonpro' ? 'Subprofessional (Non-Pro)' : 'Professional'}. Hihintayin mo ang pag-apruba ng admin.`,
  });
});

// ADMIN: listahan ng mga pending exam type change requests
app.get('/api/admin/exam-type-requests', async (req, res) => {
  if (!await isAdmin(req)) return res.status(401).json({ error: 'Admin lang.' });
  const users = await getAllUsers();
  const pending = users
    .filter((u) => u.examTypeRequest && u.examTypeRequest.requestedType)
    .map((u) => ({
      userId: u.id,
      email: u.email,
      currentType: u.examType,
      pendingType: u.examTypeRequest.requestedType,
      requestedAt: u.examTypeRequest.at,
    }));
  res.json({ requests: pending });
});

// ADMIN: i-approve ang exam type change
app.post('/api/admin/exam-type-requests/:id/approve', async (req, res) => {
  if (!await isAdmin(req)) return res.status(401).json({ error: 'Admin lang.' });
  const users = await getAllUsers();
  const target = users.find((u) => u.id === req.params.id);
  if (!target || !target.examTypeRequest) return res.status(404).json({ error: 'Walang nakabinbing request ang user na ito.' });
  const requested = target.examTypeRequest.requestedType;
  const updated = await setExamType(req.params.id, requested);
  res.json({
    ok: true,
    message: `Inaprubahan ang pagbabago ni ${target.email} sa uri ng pagsusulit (${requested === 'nonpro' ? 'Subprofessional' : 'Professional'}).`,
    user: publicUser(updated),
  });
});

// ADMIN: i-deny ang exam type change
app.post('/api/admin/exam-type-requests/:id/deny', async (req, res) => {
  if (!await isAdmin(req)) return res.status(401).json({ error: 'Admin lang.' });
  const users = await getAllUsers();
  const target = users.find((u) => u.id === req.params.id);
  if (!target || !target.examTypeRequest) return res.status(404).json({ error: 'Walang nakabinbing request ang user na ito.' });
  await clearExamTypeRequest(req.params.id);
  res.json({ ok: true, message: `Natanggi ang exam type change request ni ${target.email}.` });
});

// ADMIN: listahan ng mga payment para i-review
app.get('/api/admin/payments', async (req, res) => {
  if (!await isAdmin(req)) return res.status(401).json({ error: 'Admin lang.' });
  const payments = await getAllPayments();
  const users = await getAllUsers();
  const map = new Map(users.map((u) => [u.id, u.email]));
  res.json({
    payments: payments.map((p) => ({ ...p, email: map.get(p.userId) || '(deleted)' })),
    pendingCount: await getPendingPaymentsCount(),
  });
});

// ADMIN: i-approve o i-deny ang payment, at i-grant ang subscription
app.post('/api/admin/payments/:id/approve', async (req, res) => {
  if (!await isAdmin(req)) return res.status(401).json({ error: 'Mag login muna bilang admin.' });
  const p = await setPaymentStatus(req.params.id, 'approved');
  if (!p) return res.status(404).json({ error: 'Hindi mahanap ang payment.' });
  const u = await grantSubscription(p.userId, SUBSCRIPTION_DAYS);
  res.json({
    ok: true,
    message: `Na-approve ang bayad. 30 araw na subscription naibigay kay user.`,
    user: publicUser(u),
  });
});

app.post('/api/admin/payments/:id/deny', async (req, res) => {
  if (!await isAdmin(req)) return res.status(401).json({ error: 'Mag login bilang admin.' });
  const p = await setPaymentStatus(req.params.id, 'denied');
  if (!p) return res.status(404).json({ error: 'Hindi mahanap ang payment.' });
  res.json({ ok: true, message: 'Na-deny ang payment.' });
});

// Public: presyo at GCash number para sa UI
app.get('/api/pricing', (req, res) => {
  res.json({ amount: PRICE_PHP, gcashNumber: GCASH_NUMBER, days: SUBSCRIPTION_DAYS });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, store: getStoreMode() });
});

// SEED: gumawa ng admin account at sample users kung wala pa
async function seedAccounts() {
  if (!(await findUserByEmail(ADMIN_EMAIL))) {
    await createUser(ADMIN_EMAIL, ADMIN_PASSWORD, { isAdmin: true });
    console.log(`Seeded admin account: ${ADMIN_EMAIL}`);
  }
  if (SEED_DEMOS) {
    const samples = [
      { email: 'demo@mastery.ph', password: 'demo12345' },
      { email: 'juan@mastery.ph', password: 'juan12345' },
      { email: 'maria@mastery.ph', password: 'maria12345' },
    ];
    for (const s of samples) {
      if (!(await findUserByEmail(s.email))) {
        await createUser(s.email, s.password);
        console.log(`Seeded demo user: ${s.email} / ${s.password}`);
      }
    }
  }
}

await initDb();
await seedAccounts();

const mode = getStoreMode();
if (mode === 'file') {
  console.warn('WARNING: Nakakonekta ka sa data.json FILE storage. Sa Railway, bubura ang data sa bawat deploy. Itakda ang DATABASE_URL variable sa app service para gumamit ng Postgres.');
} else {
  console.log('Connected to Postgres database (DATABASE_URL). Data will persist across deployments.');
}

app.listen(PORT, () => {
  console.log(`Mastery Review PH running at http://localhost:${PORT}`);
});
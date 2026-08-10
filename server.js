import express from 'express';
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
app.use(express.static(path.join(__dirname, 'public')));

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
    subscribedAt: u.subscribedAt,
    expiresAt: u.expiresAt,
    activeSubscription: isSubscribed(u),
    createdAt: u.createdAt,
  };
}

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Kailangan ng valid email at password (hindi bababa sa 6 na karakter).' });
  }
  if (await findUserByEmail(email)) {
    return res.status(409).json({ error: 'May account na sa email na ito. Mag-login na lang.' });
  }
  const user = await createUser(email, password);
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

app.get('/api/tests', async (req, res) => {
  const user = await currentUser(req);
  const isPaid = isSubscribed(user);
  const freeLimit = 1; // ilang beses maaaring kunin ang libreng test
  const list = tests.map(async (t) => {
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
      locked,
      freeAttemptsLeft: attemptLeft, // subok pa sa libre
      totalQuestions: t.bank.length,
      sampleCount: t.sampleCount,
    };
  });
  res.json({ tests: await Promise.all(list), plan: isPaid ? 'paid' : 'free' });
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

const attempts = new Map(); // attemptId -> { testId, questions, userId, at }

app.get('/api/tests/:id', async (req, res) => {
  const user = await currentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Mag-login muna bago mag-practice test.', loginRequired: true });
  }
  const isPaid = isSubscribed(user);
  const t = tests.find((x) => x.id === Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Hindi mahanap ang test.' });
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
  // Random na pumili ng sampleCount na tanong mula sa bank
  const sampled = shuffle(t.bank).slice(0, t.sampleCount);
  // Mag-imbak ng attempt para ma-score nang tama ang mga ito
  const token = `${t.id}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  attempts.set(token, {
    testId: t.id,
    userId: user?.id || null,
    questions: sampled,
    at: Date.now(),
  });
  const questions = sampled.map((q) => ({ q: q.q, options: q.options }));
  res.json({ id: t.id, title: t.title, premium: t.premium, attemptId: token, questions });
});

app.post('/api/tests/:id/score', async (req, res) => {
  const user = await currentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Mag-login ka muna para mag-submit ng sagot.', loginRequired: true });
  }
  const isPaid = isSubscribed(user);
  const t = tests.find((x) => x.id === Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Hindi mahanap ang test.' });
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
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data.json');

function hashPassword(password, salt) {
  return createHash('sha256').update(salt + password).digest('hex');
}

function newId() {
  return randomBytes(6).toString('hex');
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    salt: user.salt,
    passwordHash: user.passwordHash,
    plan: user.plan,
    isAdmin: !!user.isAdmin,
    examType: user.examType || null,
    examTypeRequest: user.examTypeRequest || null,
    subscribedAt: user.subscribedAt,
    expiresAt: user.expiresAt,
    createdAt: user.createdAt,
  };
}

function parseExamRequest(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isExamType(testExamType, user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const type = user.examType || 'professional';
  return testExamType === type;
}

function normalizePayment(p) {
  if (!p) return null;
  return {
    id: p.id,
    userId: p.userId,
    reference: p.reference,
    note: p.note || '',
    status: p.status,
    amount: p.amount,
    createdAt: p.createdAt,
  };
}

function normalizeHistoryRow(h) {
  let topics = h.topics;
  if (typeof topics === 'string') {
    try { topics = JSON.parse(topics); } catch { topics = null; }
  }
  return {
    testId: h.testId,
    correct: h.correct,
    total: h.total,
    score: h.score,
    passed: h.score >= 70,
    at: h.at,
    topics,
  };
}

// I-check kung may lehitimong (hindi expired) na subscription ang user
export function isSubscribed(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (user.plan !== 'paid') return false;
  if (!user.expiresAt) return false;
  return new Date(user.expiresAt).getTime() > Date.now();
}

const USE_DB = !!process.env.DATABASE_URL;
let dbPool = null;
if (USE_DB) {
  dbPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

export function getStoreMode() {
  return USE_DB ? 'postgres' : 'file';
}

// ===================== Postgres backend (Supabase / Railway DB) =====================
const PG = {
  async initDb() {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        exam_type TEXT,
        exam_type_request TEXT,
        subscribed_at TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reference TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        amount INTEGER NOT NULL DEFAULT 300,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        test_id INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        total INTEGER NOT NULL,
        score INTEGER NOT NULL,
        topics TEXT,
        created_at TEXT NOT NULL
      );
    `);
    await dbPool.query(`
      ALTER TABLE history ADD COLUMN IF NOT EXISTS topics TEXT;
    `);
    await dbPool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS exam_type TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS exam_type_request TEXT;
    `);
  },
  async findUserByEmail(email) {
    const r = await dbPool.query(
      'SELECT * FROM users WHERE lower(email) = lower($1)',
      [String(email)]
    );
    return r.rows[0] ? normalizeUser({
      id: r.rows[0].id, email: r.rows[0].email, salt: r.rows[0].salt,
      passwordHash: r.rows[0].password_hash, plan: r.rows[0].plan,
      isAdmin: r.rows[0].is_admin, examType: r.rows[0].exam_type,
      examTypeRequest: parseExamRequest(r.rows[0].exam_type_request),
      subscribedAt: r.rows[0].subscribed_at,
      expiresAt: r.rows[0].expires_at, createdAt: r.rows[0].created_at,
    }) : null;
  },
  async findUserById(id) {
    const r = await dbPool.query('SELECT * FROM users WHERE id = $1', [id]);
    return r.rows[0] ? normalizeUser({
      id: r.rows[0].id, email: r.rows[0].email, salt: r.rows[0].salt,
      passwordHash: r.rows[0].password_hash, plan: r.rows[0].plan,
      isAdmin: r.rows[0].is_admin, examType: r.rows[0].exam_type,
      examTypeRequest: parseExamRequest(r.rows[0].exam_type_request),
      subscribedAt: r.rows[0].subscribed_at,
      expiresAt: r.rows[0].expires_at, createdAt: r.rows[0].created_at,
    }) : null;
  },
  async createUser(email, password, options = {}) {
    const salt = randomBytes(8).toString('hex');
    const id = newId();
    const createdAt = new Date().toISOString();
    await dbPool.query(
      `INSERT INTO users (id, email, salt, password_hash, plan, is_admin, exam_type, subscribed_at, expires_at, created_at)
       VALUES ($1,$2,$3,$4,'free',$5,$6,NULL,NULL,$7)`,
      [id, email, salt, hashPassword(password, salt), !!options.isAdmin, options.examType || null, createdAt]
    );
    return this.findUserById(id);
  },
  async getUserIdByToken(token) {
    const r = await dbPool.query('SELECT user_id FROM sessions WHERE token = $1', [token]);
    return r.rows[0] ? r.rows[0].user_id : null;
  },
  async createSession(userId) {
    const token = randomBytes(24).toString('hex');
    await dbPool.query('INSERT INTO sessions (token, user_id) VALUES ($1,$2)', [token, userId]);
    return token;
  },
  async destroySession(token) {
    await dbPool.query('DELETE FROM sessions WHERE token = $1', [token]);
  },
  async setPlan(userId, plan) {
    await dbPool.query(
      `UPDATE users SET plan=$1,
        subscribed_at = CASE WHEN $1='paid' THEN subscribed_at ELSE NULL END,
        expires_at = CASE WHEN $1='paid' THEN expires_at ELSE NULL END
       WHERE id=$2`,
      [plan, userId]
    );
    return this.findUserById(userId);
  },
  async grantSubscription(userId, days = 30) {
    const now = new Date();
    await dbPool.query(
      `UPDATE users SET plan='paid', subscribed_at=$2, expires_at=$3 WHERE id=$1`,
      [userId, now.toISOString(), new Date(now.getTime() + days * 86400000).toISOString()]
    );
    return this.findUserById(userId);
  },
  async revokeSubscription(userId) {
    await dbPool.query(
      `UPDATE users SET plan='free', subscribed_at=NULL, expires_at=NULL WHERE id=$1`,
      [userId]
    );
    return this.findUserById(userId);
  },
  async setExamType(userId, examType) {
    await dbPool.query(
      `UPDATE users SET exam_type=$2, exam_type_request=NULL WHERE id=$1`,
      [userId, examType]
    );
    return this.findUserById(userId);
  },
  async setExamTypeRequest(userId, requestedType) {
    const request = JSON.stringify({ requestedType, at: new Date().toISOString() });
    await dbPool.query(
      `UPDATE users SET exam_type_request=$2 WHERE id=$1`,
      [userId, request]
    );
    return this.findUserById(userId);
  },
  async clearExamTypeRequest(userId) {
    await dbPool.query(
      `UPDATE users SET exam_type_request=NULL WHERE id=$1`,
      [userId]
    );
    return this.findUserById(userId);
  },
  async getHistory(userId) {
    const r = await dbPool.query(
      `SELECT test_id, correct, total, score, topics, created_at FROM history WHERE user_id=$1 ORDER BY created_at ASC`,
      [userId]
    );
    return r.rows.map((h) => normalizeHistoryRow({
      testId: h.test_id, correct: h.correct, total: h.total,
      score: h.score, topics: h.topics, at: h.created_at,
    }));
  },
  async recordScore(userId, testId, correct, total, score, topics) {
    await dbPool.query(
      `INSERT INTO history (id, user_id, test_id, correct, total, score, topics, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [newId(), userId, testId, correct, total, score,
       topics ? JSON.stringify(topics) : null, new Date().toISOString()]
    );
    return this.getHistory(userId);
  },
  async getAllUsers() {
    const u = await dbPool.query('SELECT * FROM users ORDER BY created_at ASC');
    const h = await dbPool.query('SELECT * FROM history ORDER BY created_at ASC');
    const byUser = {};
    for (const row of h.rows) {
      byUser[row.user_id] = byUser[row.user_id] || [];
      byUser[row.user_id].push(normalizeHistoryRow({
        testId: row.test_id, correct: row.correct, total: row.total,
        score: row.score, topics: row.topics, at: row.created_at,
      }));
    }
    return u.rows.map((row) => {
      const user = {
        id: row.id, email: row.email, salt: row.salt,
        passwordHash: row.password_hash, plan: row.plan,
        isAdmin: row.is_admin, examType: row.exam_type,
        examTypeRequest: parseExamRequest(row.exam_type_request),
        subscribedAt: row.subscribed_at,
        expiresAt: row.expires_at, createdAt: row.created_at,
      };
      const history = byUser[user.id] || [];
      return {
        id: user.id,
        email: user.email,
        plan: user.plan,
        isAdmin: !!user.isAdmin,
        examType: user.examType,
        examTypeRequest: user.examTypeRequest,
        subscribedAt: user.subscribedAt,
        expiresAt: user.expiresAt,
        activeSubscription: isSubscribed(user),
        createdAt: user.createdAt,
        attempts: history.length,
        best: history.length ? Math.max(...history.map((hh) => hh.score)) : 0,
        avg: history.length ? Math.round(history.reduce((s, hh) => s + hh.score, 0) / history.length) : 0,
        lastScore: history.length ? history[history.length - 1].score : null,
      };
    });
  },
  async createPayment(userId, reference, note) {
    const id = newId();
    const createdAt = new Date().toISOString();
    await dbPool.query(
      `INSERT INTO payments (id, user_id, reference, note, status, amount, created_at)
       VALUES ($1,$2,$3,$4,'pending',300,$5)`,
      [id, userId, reference, note || '', createdAt]
    );
    return normalizePayment({ id, userId, reference, note: note || '', status: 'pending', amount: 300, createdAt });
  },
  async getAllPayments() {
    const r = await dbPool.query('SELECT * FROM payments ORDER BY created_at ASC');
    return r.rows.map((p) => normalizePayment({
      id: p.id, userId: p.user_id, reference: p.reference, note: p.note,
      status: p.status, amount: p.amount, createdAt: p.created_at,
    })).reverse();
  },
  async setPaymentStatus(paymentId, status) {
    const r = await dbPool.query(
      'UPDATE payments SET status=$2 WHERE id=$1 RETURNING *',
      [paymentId, status]
    );
    if (!r.rows[0]) return null;
    return normalizePayment({
      id: r.rows[0].id, userId: r.rows[0].user_id, reference: r.rows[0].reference,
      note: r.rows[0].note, status: r.rows[0].status,
      amount: r.rows[0].amount, createdAt: r.rows[0].created_at,
    });
  },
  async getPendingPaymentsCount() {
    const r = await dbPool.query(`SELECT COUNT(*)::int AS c FROM payments WHERE status='pending'`);
    return r.rows[0].c;
  },
};

// ===================== File backend (local dev only) =====================
function loadFileStore() {
  if (!existsSync(DATA_FILE)) return { users: [], sessions: {}, payments: [], settings: {} };
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { users: [], sessions: {}, payments: [], settings: {} };
  }
}

let fileStore = null;
function getFileStore() {
  if (!fileStore) fileStore = loadFileStore();
  return fileStore;
}
function saveFileStore() {
  writeFileSync(DATA_FILE, JSON.stringify(getFileStore(), null, 2));
}

const FILE = {
  async initDb() {},
  async findUserByEmail(email) {
    const u = getFileStore().users.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
    return normalizeUser(u);
  },
  async findUserById(id) {
    return normalizeUser(getFileStore().users.find((x) => x.id === id));
  },
  async createUser(email, password, options = {}) {
    const salt = randomBytes(8).toString('hex');
    const user = {
      id: newId(),
      email,
      salt,
      passwordHash: hashPassword(password, salt),
      plan: 'free',
      isAdmin: options.isAdmin || false,
      examType: options.examType || null,
      examTypeRequest: null,
      subscribedAt: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      history: [],
    };
    getFileStore().users.push(user);
    saveFileStore();
    return normalizeUser(user);
  },
  async getUserIdByToken(token) {
    return getFileStore().sessions[token] || null;
  },
  async createSession(userId) {
    const token = randomBytes(24).toString('hex');
    getFileStore().sessions[token] = userId;
    saveFileStore();
    return token;
  },
  async destroySession(token) {
    delete getFileStore().sessions[token];
    saveFileStore();
  },
  async setPlan(userId, plan) {
    const user = getFileStore().users.find((x) => x.id === userId);
    if (!user) return null;
    user.plan = plan;
    if (plan !== 'paid') {
      user.subscribedAt = null;
      user.expiresAt = null;
    }
    saveFileStore();
    return normalizeUser(user);
  },
  async grantSubscription(userId, days = 30) {
    const user = getFileStore().users.find((x) => x.id === userId);
    if (!user) return null;
    const now = new Date();
    user.plan = 'paid';
    user.subscribedAt = now.toISOString();
    user.expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
    saveFileStore();
    return normalizeUser(user);
  },
  async revokeSubscription(userId) {
    const user = getFileStore().users.find((x) => x.id === userId);
    if (!user) return null;
    user.plan = 'free';
    user.subscribedAt = null;
    user.expiresAt = null;
    saveFileStore();
    return normalizeUser(user);
  },
  async setExamType(userId, examType) {
    const user = getFileStore().users.find((x) => x.id === userId);
    if (!user) return null;
    user.examType = examType;
    user.examTypeRequest = null;
    saveFileStore();
    return normalizeUser(user);
  },
  async setExamTypeRequest(userId, requestedType) {
    const user = getFileStore().users.find((x) => x.id === userId);
    if (!user) return null;
    user.examTypeRequest = { requestedType, at: new Date().toISOString() };
    saveFileStore();
    return normalizeUser(user);
  },
  async clearExamTypeRequest(userId) {
    const user = getFileStore().users.find((x) => x.id === userId);
    if (!user) return null;
    user.examTypeRequest = null;
    saveFileStore();
    return normalizeUser(user);
  },
  async getHistory(userId) {
    const user = getFileStore().users.find((x) => x.id === userId);
    return (user && user.history || []).map(normalizeHistoryRow);
  },
  async recordScore(userId, testId, correct, total, score, topics) {
    const user = getFileStore().users.find((x) => x.id === userId);
    if (!user) return null;
    user.history = user.history || [];
    user.history.push({
      testId, correct, total, score,
      passed: score >= 70,
      topics: topics || null,
      at: new Date().toISOString(),
    });
    saveFileStore();
    return user.history.map(normalizeHistoryRow);
  },
  async getAllUsers() {
    return getFileStore().users.map((u) => ({ ...normalizeUser(u), history: u.history || [] })).map((u) => ({
      id: u.id,
      email: u.email,
      plan: u.plan,
      isAdmin: u.isAdmin,
      examType: u.examType,
      examTypeRequest: u.examTypeRequest,
      subscribedAt: u.subscribedAt,
      expiresAt: u.expiresAt,
      activeSubscription: isSubscribed(u),
      createdAt: u.createdAt,
      attempts: u.history.length,
      best: u.history.length ? Math.max(...u.history.map((h) => h.score)) : 0,
      avg: u.history.length ? Math.round(u.history.reduce((s, h) => s + h.score, 0) / u.history.length) : 0,
      lastScore: u.history.length ? u.history[u.history.length - 1].score : null,
    }));
  },
  async createPayment(userId, reference, note) {
    const payment = {
      id: newId(), userId, reference, note: note || '',
      status: 'pending', amount: 300, createdAt: new Date().toISOString(),
    };
    getFileStore().payments = getFileStore().payments || [];
    getFileStore().payments.push(payment);
    saveFileStore();
    return normalizePayment(payment);
  },
  async getAllPayments() {
    return (getFileStore().payments || []).slice().reverse().map(normalizePayment);
  },
  async setPaymentStatus(paymentId, status) {
    const p = (getFileStore().payments || []).find((x) => x.id === paymentId);
    if (!p) return null;
    p.status = status;
    saveFileStore();
    return normalizePayment(p);
  },
  async getPendingPaymentsCount() {
    return (getFileStore().payments || []).filter((p) => p.status === 'pending').length;
  },
};

const impl = USE_DB ? PG : FILE;

// ===================== Public async facade =====================
export async function initDb() {
  return impl.initDb();
}
export async function findUserByEmail(email) {
  return impl.findUserByEmail(email);
}
export async function findUserById(id) {
  return impl.findUserById(id);
}
export async function createUser(email, password, options = {}) {
  return impl.createUser(email, password, options);
}
export async function getUserIdByToken(token) {
  return impl.getUserIdByToken(token);
}
export async function createSession(userId) {
  return impl.createSession(userId);
}
export async function destroySession(token) {
  return impl.destroySession(token);
}
export async function setPlan(userId, plan) {
  return impl.setPlan(userId, plan);
}
export async function grantSubscription(userId, days = 30) {
  return impl.grantSubscription(userId, days);
}
export async function revokeSubscription(userId) {
  return impl.revokeSubscription(userId);
}
export async function getHistory(userId) {
  return impl.getHistory(userId);
}
export async function recordScore(userId, testId, correct, total, score, topics) {
  return impl.recordHistory ? impl.recordHistory(userId, testId, correct, total, score, topics) : impl.recordScore(userId, testId, correct, total, score, topics);
}
export async function getAllUsers() {
  return impl.getAllUsers();
}
export async function createPayment(userId, reference, note) {
  return impl.createPayment(userId, reference, note);
}
export async function getAllPayments() {
  return impl.getAllPayments();
}
export async function setPaymentStatus(paymentId, status) {
  return impl.setPaymentStatus(paymentId, status);
}
export async function getPendingPaymentsCount() {
  return impl.getPendingPaymentsCount();
}
export async function setExamType(userId, examType) {
  return impl.setExamType(userId, examType);
}
export async function setExamTypeRequest(userId, requestedType) {
  return impl.setExamTypeRequest(userId, requestedType);
}
export async function clearExamTypeRequest(userId) {
  return impl.clearExamTypeRequest(userId);
}
// Username-only accounts + session cookies. No email, no password.
// - Sign-up: claims a username, starts UNVERIFIED, browser gets an approved session.
// - Verification is by payment: the session is shown a small unique amount; when the
//   bot reports that exact amount paid by the account's in-game name, the account is
//   verified and every OTHER session on it is logged out (so a squatter loses access).
// - Logging in to an account that was ever verified creates a PENDING session that only
//   becomes usable after the player pays that session's unique amount to the bot.
const crypto = require('crypto');
const config = require('../config');
const store = require('./store');
const { AppError, ingameName } = require('./ledger');

const COOKIE = 'dc_session';
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
const DAY = 86400000;

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ } }
  }
  return out;
}

function setCookie(res, value, maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

function createSession(res, userId, approved) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const ttl = approved ? config.sessionDays * DAY : config.pendingLoginMinutes * 60000;
  const key = hash(token);
  const s = { userId, approved, createdAt: now, lastSeen: now, expiresAt: now + ttl };
  store.db.sessions[key] = s;
  store.save();
  setCookie(res, token, Math.floor((config.sessionDays * DAY) / 1000));
  return { key, s };
}

function middleware(req, res, next) {
  req.session = null; req.user = null; req.sessionKey = null;
  const token = parseCookies(req)[COOKIE];
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const k = hash(token);
    const s = store.db.sessions[k];
    const now = Date.now();
    if (s && s.expiresAt > now && store.db.users[s.userId]) {
      req.session = s; req.sessionKey = k;
      if (s.approved) {
        req.user = store.db.users[s.userId];
        if (now - s.lastSeen > 3600000) { s.lastSeen = now; s.expiresAt = now + config.sessionDays * DAY; store.save(); }
      }
    } else if (s) { delete store.db.sessions[k]; store.save(); }
  }
  next();
}

function findUser(username) {
  const l = String(username).toLowerCase();
  return Object.values(store.db.users).find((u) => u.username.toLowerCase() === l) || null;
}

function validUsername(username) {
  const name = String(username || '').trim();
  if (!USER_RE.test(name)) throw new AppError('Enter your exact Minecraft username: 3-16 letters, numbers or _', 'bad_username');
  return name;
}

function dropSession(req) {
  if (req.sessionKey) { delete store.db.sessions[req.sessionKey]; store.save(); }
}

function newUser(username) {
  const db = store.db;
  const user = {
    id: ++db.seq.user, username, bedrock: false, verified: false, everVerified: false,
    balance: 0, createdAt: Date.now(), excludedUntil: null,
    stats: { wagered: 0, won: 0, deposited: 0, withdrawn: 0 },
  };
  db.users[user.id] = user;
  return user;
}

// hooks.check(username, req) may throw to reject; hooks.after(user, req) attaches extra data.
function signup(req, res, hooks = {}) {
  const username = validUsername(req.body && req.body.username);
  if (findUser(username)) throw new AppError('That username already has an account. Log in instead.', 'username_taken', 409);
  if (hooks.check) hooks.check(username, req);
  dropSession(req);
  const user = newUser(username);
  if (hooks.after) hooks.after(user, req);
  createSession(res, user.id, true);
  return { ok: true, username };
}

function login(req, res, payments) {
  const username = validUsername(req.body && req.body.username);
  const user = findUser(username);
  if (!user) throw new AppError('No account with that username. Sign up first.', 'not_found', 404);
  dropSession(req);
  if (!user.everVerified) {
    createSession(res, user.id, true);
    return { ok: true, pending: false };
  }
  const { key } = createSession(res, user.id, false);
  const p = payments.loginFor(user, key);
  return { ok: true, pending: true, amount: p.amount, bot: p.bot, ingameName: ingameName(user) };
}

function logout(req, res) {
  dropSession(req);
  setCookie(res, '', 0);
  return { ok: true };
}

// Hooks called by the payment matcher.
function onVerify(user, sessionKey, payments) {
  const now = Date.now();
  user.verified = true; user.everVerified = true; user.verifiedAt = now; user.verifiedName = ingameName(user);
  for (const [k, s] of Object.entries(store.db.sessions)) if (s.userId === user.id && k !== sessionKey) delete store.db.sessions[k];
  for (const p of payments.userPendings(user.id)) if (p.kind !== 'deposit' && p.sessionKey !== sessionKey) { p.status = 'cancelled'; p.closedAt = now; }
  store.save();
}
function onLogin(user, sessionKey) {
  const s = store.db.sessions[sessionKey];
  if (s) { s.approved = true; s.expiresAt = Date.now() + config.sessionDays * DAY; store.save(); }
}

function setBedrock(user, enabled) {
  const on = !!enabled;
  if (!!user.bedrock === on) return false;
  user.bedrock = on;
  // A different in-game name is a different player: it must be verified again.
  if (user.verified) { user.verified = false; user.verifiedName = null; }
  store.save();
  return true;
}

module.exports = { middleware, signup, login, logout, onVerify, onLogin, setBedrock, findUser, ingameName, USER_RE };

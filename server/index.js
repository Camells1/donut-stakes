const path = require('path');
const fs = require('fs');
require('./env').load();
const express = require('express');
const config = require('../config');
const store = require('./store');
const auth = require('./auth');
const games = require('./games');
const { publicBet, isExcluded, parseBet } = require('./games/core');
const { applyTx, AppError, ingameName } = require('./ledger');
const payments = require('./payments');
const rewards = require('./rewards');
const admin = require('./admin');
const botstatus = require('./botstatus');

store.load();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Reject cross-site state-changing requests (bot calls are server-to-server and skip this).
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !req.path.startsWith('/bot/') && req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ ok: false, error: 'Cross-site request blocked' }); } catch { return res.status(403).end(); }
  }
  next();
});

// Tiny in-memory rate limiter.
const hits = new Map();
function limit(name, max, windowMs) {
  if (process.env.RELAX_RATE_LIMITS === '1') max *= 100;   // test runs only
  return (req, res, next) => {
    const k = `${name}:${req.ip}`;
    const now = Date.now();
    const h = hits.get(k) || { n: 0, reset: now + windowMs };
    if (now > h.reset) { h.n = 0; h.reset = now + windowMs; }
    h.n++; hits.set(k, h);
    if (h.n > max) return res.status(429).json({ ok: false, error: 'Slow down a little', code: 'rate_limited' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now > h.reset) hits.delete(k); }, 60000).unref();

app.use('/api/bot', require('./bot').router);
app.use(auth.middleware);
app.use((req, res, next) => { if (req.user) rewards.noteIp(req.user, req.ip); next(); });

const needUser = (req) => { if (!req.user) throw new AppError('Log in first', 'auth_required', 401); return req.user; };

function userOut(u, sessionKey) {
  const v = u.verified ? null : payments.verifyFor(u, sessionKey);
  return {
    id: u.id, username: u.username, ingameName: ingameName(u), bedrock: !!u.bedrock,
    verified: !!u.verified, everVerified: !!u.everVerified, balance: u.balance,
    verify: v ? { amount: v.amount, bot: v.bot, expiresAt: v.expiresAt } : null,
    excludedUntil: u.excludedUntil, selfExcluded: isExcluded(u),
    stats: u.stats, createdAt: u.createdAt,
  };
}

app.get('/api/config', (req, res) => res.json({
  siteName: config.siteName, tagline: config.tagline, currency: config.currency, botName: botstatus.name(), botEnabled: botstatus.enabled(),
  minBet: config.minBet, maxBet: config.maxBet, maxPayout: config.maxPayout, deposit: config.deposit,
  minWithdraw: config.minWithdraw, houseEdge: config.houseEdge, legal: config.legal,
}));

app.get('/api/me', (req, res) => {
  const s = req.session;
  let pending = null;
  if (s && !s.approved) {
    const u = store.db.users[s.userId];
    const p = payments.loginFor(u, req.sessionKey);
    pending = { username: u.username, ingameName: ingameName(u), amount: p.amount, bot: p.bot, expiresAt: p.expiresAt };
  }
  res.json({ ok: true, user: req.user ? userOut(req.user, req.sessionKey) : null, pending });
});

app.post('/api/auth/signup', limit('auth', 20, 60000), (req, res) => res.json(auth.signup(req, res, rewards.signupHooks)));
app.post('/api/auth/login', limit('auth', 20, 60000), (req, res) => res.json(auth.login(req, res, payments)));
app.post('/api/auth/logout', (req, res) => res.json(auth.logout(req, res)));

// Deposits: the server picks the exact amount; the client only says roughly how much.
app.post('/api/deposits', limit('dep', 20, 60000), (req, res) => {
  const p = payments.createDeposit(needUser(req), req.body && req.body.amount);
  res.json({ ok: true, deposit: payments.publicPending(p) });
});
app.get('/api/deposits', (req, res) => {
  const u = needUser(req);
  payments.sweep();
  const list = Object.values(payments.db().pendings).filter((p) => p.userId === u.id && p.kind === 'deposit').sort((a, b) => b.id - a.id).slice(0, 20);
  res.json({ ok: true, bot: botstatus.name(), botEnabled: botstatus.enabled(), deposits: list.map(payments.publicPending), balance: u.balance });
});
// Rewards
app.get('/api/rewards', (req, res) => res.json({ ok: true, ...rewards.status(needUser(req)) }));
app.post('/api/rewards/daily', (req, res) => { const u = needUser(req); res.json({ ok: true, ...rewards.claimDaily(u), balance: u.balance }); });
app.post('/api/rewards/rakeback', (req, res) => { const u = needUser(req); res.json({ ok: true, ...rewards.claimRakeback(u), balance: u.balance }); });
// Affiliates
app.get('/api/affiliates', (req, res) => res.json({ ok: true, ...rewards.affiliateStatus(needUser(req)) }));
app.post('/api/affiliates/apply', (req, res) => res.json({ ok: true, ...rewards.applyCode(needUser(req), req.body && req.body.code, req.ip) }));
// Owner-only (ADMIN_SECRET)
// Bot status: public read, owner write.
app.get('/api/public/bot', (req, res) => res.json({ ok: true, ...botstatus.publicView() }));
admin.router.get('/bot', (req, res) => res.json({ ok: true, ...botstatus.publicView() }));
admin.router.post('/bot', (req, res) => res.json({ ok: true, ...botstatus.update(req.body) }));
app.use('/api/admin', admin.router);

app.post('/api/deposits/:id/cancel', (req, res) => {
  res.json({ ok: true, deposit: payments.publicPending(payments.cancelDeposit(needUser(req), Number(req.params.id))) });
});

app.post('/api/account/bedrock', (req, res) => {
  const u = needUser(req);
  const changed = auth.setBedrock(u, req.body && req.body.enabled);
  res.json({ ok: true, changed, user: userOut(u, req.sessionKey) });
});

const PERIODS = { '1d': 1, '7d': 7, '30d': 30, '180d': 180, '365d': 365 };
app.post('/api/account/self-exclude', (req, res) => {
  const u = needUser(req);
  const p = String(req.body && req.body.period);
  if (p !== 'permanent' && !PERIODS[p]) throw new AppError('Pick a valid period', 'bad_params');
  const until = p === 'permanent' ? 'permanent' : Date.now() + PERIODS[p] * 86400000;
  // Exclusion can only be extended, never shortened.
  if (u.excludedUntil === 'permanent' || (isExcluded(u) && until !== 'permanent' && until < u.excludedUntil)) {
    throw new AppError('You already have a longer self-exclusion in place', 'bad_params');
  }
  u.excludedUntil = until;
  store.save();
  res.json({ ok: true, user: userOut(u, req.sessionKey) });
});

app.post('/api/account/withdraw', limit('wd', 10, 60000), (req, res) => {
  const u = needUser(req);
  if (!u.verified) throw new AppError('Verify your account before withdrawing', 'unverified', 403);
  const amount = parseBet(req.body && req.body.amount);
  if (amount < config.minWithdraw) throw new AppError(`Minimum withdrawal is ${config.minWithdraw}`, 'bad_amount');
  const db = store.db;
  const id = ++db.seq.wd;
  const tx = applyTx(u.id, -amount, 'withdraw', { withdrawalId: id });
  const w = { id, userId: u.id, name: ingameName(u), amount, status: 'pending', createdAt: Date.now(), txId: tx.id };
  db.withdrawals[id] = w;
  store.save();
  res.json({ ok: true, withdrawal: w, balance: u.balance });
});

app.post('/api/account/withdrawals/:id/cancel', (req, res) => {
  const u = needUser(req);
  const w = store.db.withdrawals[req.params.id];
  if (!w || w.userId !== u.id) throw new AppError('Withdrawal not found', 'not_found', 404);
  if (w.status !== 'pending') throw new AppError('This withdrawal is already being processed', 'bad_state', 409);
  applyTx(u.id, w.amount, 'withdraw_refund', { withdrawalId: w.id, reason: 'cancelled by player' });
  w.status = 'cancelled'; w.cancelledAt = Date.now(); store.save();
  res.json({ ok: true, withdrawal: w, balance: u.balance });
});

app.get('/api/account/withdrawals', (req, res) => {
  const u = needUser(req);
  res.json({ ok: true, withdrawals: Object.values(store.db.withdrawals).filter((w) => w.userId === u.id).sort((a, b) => b.id - a.id).slice(0, 30) });
});

app.get('/api/account/transactions', (req, res) => {
  const u = needUser(req);
  const out = [];
  for (let i = store.db.tx.length - 1; i >= 0 && out.length < 50; i--) {
    const t = store.db.tx[i];
    if (t.userId === u.id) out.push({ id: t.id, ts: t.ts, type: t.type, delta: t.delta, balanceAfter: t.balanceAfter, game: t.meta && t.meta.game });
  }
  res.json({ ok: true, transactions: out });
});

app.get('/api/games', (req, res) => res.json({ ok: true, games: games.list() }));

app.post('/api/games/:id/:action', limit('play', 40, 5000), (req, res) => {
  const g = games.byId[req.params.id];
  const fn = g && Object.prototype.hasOwnProperty.call(g.actions, req.params.action) && g.actions[req.params.action];
  if (!fn) throw new AppError('Unknown game or action', 'not_found', 404);
  needUser(req);
  res.json({ ok: true, ...fn({ user: req.user, body: req.body || {} }) });
});

app.get('/api/history', (req, res) => {
  const game = req.query.game ? String(req.query.game) : null;
  const mine = req.query.scope !== 'all';
  if (mine && !req.user) return res.json({ ok: true, bets: [] });
  const n = Math.min(Number(req.query.limit) || 25, 100);
  const out = [];
  const bets = store.db.bets;
  for (let i = bets.length - 1; i >= 0 && out.length < n; i--) {
    const b = bets[i];
    if (game && b.game !== game) continue;
    if (mine && b.userId !== req.user.id) continue;
    out.push(publicBet(b));
  }
  res.json({ ok: true, bets: out });
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

// ---- Pages: HTML with {{PLACEHOLDERS}} filled from config.js ----
const PUB = path.join(__dirname, '..', 'public');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function page(file, extra = {}) {
  return (req, res) => {
    const vars = {
      SITE_NAME: config.siteName, TAGLINE: config.tagline, BOT_NAME: config.botName, YEAR: new Date().getFullYear(),
      OWNER_NAME: config.legal.ownerName, LEGAL_ENTITY: config.legal.legalEntity, CONTACT: config.legal.contact,
      JURISDICTION: config.legal.jurisdiction, SERVER_NAME: config.legal.serverName, EFFECTIVE_DATE: config.legal.effectiveDate,
      ...(typeof extra === 'function' ? extra(req) : extra),
    };
    const html = fs.readFileSync(path.join(PUB, file), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? esc(vars[k]) : m));
    res.type('html').send(html);
  };
}
app.get('/', page('index.html'));
app.get('/account', page('account.html'));
app.get('/admin', page('admin.html'));
app.get('/deposit', page('deposit.html'));
app.get('/rewards', page('rewards.html'));
app.get('/affiliates', page('affiliates.html'));
app.get('/terms', page('terms.html'));
app.get('/privacy', page('privacy.html'));
app.get('/responsible', page('responsible.html'));
app.get('/play/:id', (req, res, next) => {
  const g = games.byId[req.params.id];
  if (!g) return next();
  page('play.html', { GAME_ID: g.id, GAME_NAME: g.name, GAME_DESC: g.description })(req, res);
});
app.use(express.static(PUB, { index: false, extensions: [] }));
app.use((req, res) => res.status(404).type('html').send(`<!doctype html><meta charset="utf-8"><title>Not found</title><body style="background:#120c18;color:#f5e9ff;font-family:sans-serif;display:grid;place-items:center;height:100vh"><div><h1>No donuts here</h1><p><a style="color:#ff7ac6" href="/">Back to the lobby</a></p></div>`));

// Errors -> JSON
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof AppError) return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Bad JSON' });
  console.error(err);
  res.status(500).json({ ok: false, error: 'Server error' });
});

const port = Number(process.env.PORT) || config.port;
const server = app.listen(port, () => console.log(`${config.siteName} running at http://localhost:${port}`));
function shutdown() { store.flush(); server.close(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => store.flush());
module.exports = app;

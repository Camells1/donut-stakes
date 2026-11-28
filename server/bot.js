// Endpoints for the owner's in-game bot. All require the BOT_SECRET, sent as
// "X-Bot-Secret: <secret>" (or "Authorization: Bearer <secret>").
// Names are in-game names: "Steve" (Java) or ".Steve" (Bedrock / Floodgate).
const crypto = require('crypto');
const express = require('express');
const store = require('./store');
const auth = require('./auth');
const payments = require('./payments');
const { applyTx, AppError, ingameName } = require('./ledger');

function secretOk(req) {
  const want = Buffer.from(process.env.BOT_SECRET || '');
  const h = req.headers.authorization || '';
  const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : String(req.headers['x-bot-secret'] || ''));
  return want.length > 0 && got.length === want.length && crypto.timingSafeEqual(got, want);
}
function checkSecret(req, res, next) {
  if (!secretOk(req)) return res.status(401).json({ ok: false, error: 'Bad bot secret', code: 'bad_secret' });
  next();
}

function amountOf(v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError('amount must be a positive whole number', 'bad_amount');
  return n;
}

function userOut(u) {
  return { name: ingameName(u), username: u.username, bedrock: !!u.bedrock, verified: !!u.verified, balance: u.balance };
}

// Idempotency for manual credit/debit: a repeated `ref` returns the first result.
function once(ref, fn) {
  const db = store.db;
  if (ref) {
    const r = String(ref).slice(0, 128);
    if (db.botRefs[r]) return { ...db.botRefs[r], duplicate: true };
    const out = fn();
    db.botRefs[r] = out;
    store.save();
    return out;
  }
  return fn();
}

const r = express.Router();
r.use(checkSecret);

r.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// Polled by the bot mod. enabled: false means stop reporting payments and turn Bot Mode off.
r.get('/status', (req, res) => res.json({ ok: true, ...require('./botstatus').publicView() }));

r.get('/user/:name', (req, res) => {
  const u = payments.findUserByIngame(req.params.name);
  if (!u) throw new AppError('No account for that in-game name', 'unknown_player', 404);
  res.json({ ok: true, user: userOut(u) });
});

// The bot saw an in-game payment to it. Body: { payer_ign, amount, transaction_id }.
// 200 = applied (or a duplicate of an applied payment). 422 = did not match anything:
// refund the player in-game. 400 = malformed. A repeated transaction_id always returns
// the first answer with duplicate: true and never credits twice.
r.post('/payment', (req, res) => {
  const out = payments.handlePayment(req.body, {
    onVerify: (user, sessionKey) => auth.onVerify(user, sessionKey, payments),
    onLogin: (user, sessionKey) => auth.onLogin(user, sessionKey),
  });
  res.status(out.status).json(out.body);
});

// Recent payments that did not match (for the owner to refund).
r.get('/unmatched', (req, res) => res.json({ ok: true, unmatched: payments.db().unmatched.slice(-200).reverse() }));

// Manual adjustments by the owner/bot (outside the payment flow).
r.post('/credit', (req, res) => {
  const { name, amount, ref, note } = req.body || {};
  const out = once(ref && `credit:${ref}`, () => {
    const u = payments.findUserByIngame(name);
    if (!u) throw new AppError('No account for that in-game name', 'unknown_player', 404);
    if (!u.verified) throw new AppError('Account is not verified', 'unverified', 409);
    const tx = applyTx(u.id, amountOf(amount), 'deposit', { source: 'bot', manual: true, ref: ref || null, note: note || null });
    return { ok: true, txId: tx.id, user: userOut(u) };
  });
  res.json(out);
});

r.post('/debit', (req, res) => {
  const { name, amount, ref, note } = req.body || {};
  const out = once(ref && `debit:${ref}`, () => {
    const u = payments.findUserByIngame(name);
    if (!u) throw new AppError('No account for that in-game name', 'unknown_player', 404);
    const tx = applyTx(u.id, -amountOf(amount), 'bot_debit', { source: 'bot', ref: ref || null, note: note || null });
    return { ok: true, txId: tx.id, user: userOut(u) };
  });
  res.json(out);
});

// Withdrawal queue: the site already holds (debits) the amount when the player requests it.
r.get('/withdrawals', (req, res) => {
  const status = String(req.query.status || 'pending');
  const list = Object.values(store.db.withdrawals).filter((w) => status === 'all' || w.status === status).sort((a, b) => a.id - b.id);
  res.json({ ok: true, withdrawals: list });
});

function wd(id) {
  const w = store.db.withdrawals[id];
  if (!w) throw new AppError('Withdrawal not found', 'not_found', 404);
  return w;
}

r.post('/withdrawals/:id/claim', (req, res) => {
  const w = wd(req.params.id);
  if (w.status !== 'pending') throw new AppError(`Withdrawal is ${w.status}`, 'bad_state', 409);
  w.status = 'processing'; w.claimedAt = Date.now(); store.save();
  res.json({ ok: true, withdrawal: w });
});

// complete/fail also accept 'review', so the owner can resolve one by hand.
const OPEN = new Set(['pending', 'processing', 'review']);
const reasonOf = (req, dflt) => String((req.body && req.body.reason) || dflt).slice(0, 200);

r.post('/withdrawals/:id/complete', (req, res) => {
  const w = wd(req.params.id);
  if (!OPEN.has(w.status)) throw new AppError(`Withdrawal is ${w.status}`, 'bad_state', 409);
  w.status = 'completed'; w.completedAt = Date.now(); w.ref = (req.body && req.body.ref) || null; w.waitingForFunds = false; store.save();
  res.json({ ok: true, withdrawal: w });
});

// The bot does not have enough donuts yet. Nothing was paid: the request goes back to
// 'pending' (still held from the player's balance, still cancellable by the player), the
// player sees "waiting for bot funds", and the bot claims it again later.
r.post('/withdrawals/:id/hold', (req, res) => {
  const w = wd(req.params.id);
  if (w.status !== 'processing' && w.status !== 'pending') throw new AppError(`Withdrawal is ${w.status}`, 'bad_state', 409);
  w.status = 'pending'; w.waitingForFunds = true; w.waitingSince = w.waitingSince || Date.now(); w.holdCount = (w.holdCount || 0) + 1;
  w.reason = reasonOf(req, 'waiting for bot funds'); store.save();
  res.json({ ok: true, withdrawal: w });
});

// The payout outcome is unknown (for example the bot restarted mid-payout). Funds stay held,
// it is never paid or refunded automatically; the owner completes or fails it.
r.post('/withdrawals/:id/review', (req, res) => {
  const w = wd(req.params.id);
  if (w.status !== 'processing' && w.status !== 'pending') throw new AppError(`Withdrawal is ${w.status}`, 'bad_state', 409);
  w.status = 'review'; w.reviewAt = Date.now(); w.waitingForFunds = false; w.reason = reasonOf(req, 'needs owner review'); store.save();
  res.json({ ok: true, withdrawal: w });
});

r.post('/withdrawals/:id/fail', (req, res) => {
  const w = wd(req.params.id);
  if (!OPEN.has(w.status)) throw new AppError(`Withdrawal is ${w.status}`, 'bad_state', 409);
  w.waitingForFunds = false;
  applyTx(w.userId, w.amount, 'withdraw_refund', { withdrawalId: w.id, reason: (req.body && req.body.reason) || 'bot failed' });
  w.status = 'failed'; w.failedAt = Date.now(); w.reason = (req.body && req.body.reason) || null; store.save();
  res.json({ ok: true, withdrawal: w });
});

// Unknown bot routes: 405-style JSON (never a 404 the mod would retry forever on).
r.use((req, res) => res.status(400).json({ ok: false, code: 'unknown_route', error: `Unknown bot route ${req.method} ${req.path}` }));

module.exports = { router: r, secretOk };

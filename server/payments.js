// Payment-based verification, login approval and deposits.
// Every pending record has a server-generated whole-number amount. The bot reports
// in-game payments (payer name, amount, transaction id); a payment is applied only if
// the payer's in-game name and the exact amount match a live pending record.
// Each transaction id is processed once; anything that does not match is logged as
// unmatched and never credited.
const crypto = require('crypto');
const config = require('../config');
const store = require('./store');
const { applyTx, AppError, ingameName } = require('./ledger');
const botstatus = require('./botstatus');

const HOUR = 3600000;
const KEEP_UNMATCHED = 2000;

function db() {
  const d = store.db;
  if (!d.pendings) d.pendings = {};
  if (!d.payments) d.payments = {};
  if (!d.unmatched) d.unmatched = [];
  if (!d.seq.pending) d.seq.pending = 0;
  return d;
}

function live(p, now = Date.now()) { return p.status === 'pending' && p.expiresAt > now; }

// Expire old records (lazy + on a timer).
function sweep(now = Date.now()) {
  let n = 0;
  for (const p of Object.values(db().pendings)) {
    if (p.status === 'pending' && p.expiresAt <= now) { p.status = 'expired'; n++; }
    if (p.status !== 'pending' && now - (p.closedAt || p.expiresAt) > 7 * 24 * HOUR) delete db().pendings[p.id];
  }
  if (n) store.save();
  return n;
}

const userPendings = (userId) => Object.values(db().pendings).filter((p) => p.userId === userId && live(p));

function create(kind, user, amount, extra = {}, ttlMs) {
  const d = db();
  const id = ++d.seq.pending;
  const now = Date.now();
  const p = { id, kind, userId: user.id, amount, bot: botstatus.name(), createdAt: now, expiresAt: now + ttlMs, status: 'pending', ...extra };
  d.pendings[id] = p;
  store.save();
  return p;
}

// A small amount unique among all live verify/login records (so the number identifies the request
// even before the name is checked) and among this user's other live records.
function freshVerifyAmount(user) {
  const { minAmount, maxAmount } = config.verify;
  const used = new Set(Object.values(db().pendings).filter((p) => live(p) && (p.kind !== 'deposit' || p.userId === user.id)).map((p) => p.amount));
  const span = maxAmount - minAmount + 1;
  for (let i = 0; i < 50; i++) {
    const a = minAmount + crypto.randomInt(0, span);
    if (!used.has(a)) return a;
  }
  for (let a = minAmount; ; a++) if (!used.has(a)) return a;   // range full: walk upward
}

// Verification record for an unverified account, tied to the session that will be kept.
function verifyFor(user, sessionKey) {
  if (user.verified) return null;
  sweep();
  let p = userPendings(user.id).find((x) => x.kind === 'verify' && x.sessionKey === sessionKey);
  if (!p) p = create('verify', user, freshVerifyAmount(user), { sessionKey }, config.verify.expiryHours * HOUR);
  return p;
}

function loginFor(user, sessionKey) {
  sweep();
  let p = userPendings(user.id).find((x) => x.kind === 'login' && x.sessionKey === sessionKey);
  if (!p) p = create('login', user, freshVerifyAmount(user), { sessionKey }, config.pendingLoginMinutes * 60000);
  return p;
}

function createDeposit(user, requested) {
  if (!user.verified) throw new AppError('Verify your account before depositing', 'unverified', 403);
  if (!botstatus.enabled()) throw new AppError('The bot is offline right now. Try again later.', 'bot_offline', 409);
  const n = Number(requested);
  if (!Number.isSafeInteger(n) || n < config.deposit.minAmount || n > config.deposit.maxAmount) {
    throw new AppError(`Deposit must be a whole number from ${config.deposit.minAmount} to ${config.deposit.maxAmount}`, 'bad_amount');
  }
  sweep();
  const mine = userPendings(user.id);
  if (mine.filter((p) => p.kind === 'deposit').length >= config.deposit.maxPending) throw new AppError('Too many pending deposits. Pay or cancel one first.', 'too_many', 409);
  const used = new Set(mine.map((p) => p.amount));
  let amount = n;
  while (used.has(amount)) amount++;
  return create('deposit', user, amount, { requested: n }, config.deposit.expiryMinutes * 60000);
}

function cancelDeposit(user, id) {
  const p = db().pendings[id];
  if (!p || p.userId !== user.id || p.kind !== 'deposit') throw new AppError('Deposit not found', 'not_found', 404);
  if (!live(p)) throw new AppError(`This deposit is ${p.status}`, 'bad_state', 409);
  p.status = 'cancelled'; p.closedAt = Date.now();
  store.save();
  return p;
}

const publicPending = (p) => p && ({ id: p.id, kind: p.kind, amount: p.amount, bot: p.bot, status: p.status, createdAt: p.createdAt, expiresAt: p.expiresAt, txId: p.txId || null, requested: p.requested });

function findUserByIngame(name) {
  const n = String(name || '').trim();
  const bedrock = n.startsWith('.');
  const base = (bedrock ? n.slice(1) : n).toLowerCase();
  return Object.values(store.db.users).find((u) => u.username.toLowerCase() === base && !!u.bedrock === bedrock) || null;
}

function unmatched(entry) {
  const d = db();
  d.unmatched.push({ ...entry, at: Date.now() });
  if (d.unmatched.length > KEEP_UNMATCHED) d.unmatched.splice(0, d.unmatched.length - KEEP_UNMATCHED);
}

// Called by POST /api/bot/payment. Returns { status, body }.
function handlePayment(body, hooks = {}) {
  const d = db();
  const txid = String((body && body.transaction_id) ?? '').trim();
  const payer = String((body && body.payer_ign) ?? '').trim();
  const amount = Number(body && body.amount);
  if (!txid || txid.length > 128) return { status: 400, body: { ok: false, code: 'bad_request', error: 'transaction_id is required (max 128 chars)' } };
  if (d.payments[txid]) { const prev = d.payments[txid]; return { status: prev.status, body: { ...prev.body, duplicate: true } }; }
  if (!/^\.?[A-Za-z0-9_]{3,16}$/.test(payer) || !Number.isSafeInteger(amount) || amount <= 0) {
    return { status: 400, body: { ok: false, code: 'bad_request', error: 'payer_ign must be a Minecraft name and amount a positive whole number' } };
  }
  sweep();
  const remember = (status, out) => { d.payments[txid] = { status, body: out, at: Date.now() }; store.save(); return { status, body: out }; };
  const user = findUserByIngame(payer);
  if (!user) {
    unmatched({ txid, payer, amount, reason: 'unknown_player' });
    return remember(422, { ok: false, matched: false, code: 'unknown_player', refund: true, error: 'No account uses that in-game name' });
  }
  // Verification and login approvals first, then deposits.
  const cands = userPendings(user.id).filter((p) => p.amount === amount);
  const p = cands.find((x) => x.kind === 'verify') || cands.find((x) => x.kind === 'login') || cands.find((x) => x.kind === 'deposit');
  if (!p) {
    unmatched({ txid, payer, amount, userId: user.id, reason: 'no_pending_amount' });
    return remember(422, { ok: false, matched: false, code: 'no_pending_amount', refund: true, error: 'No pending verification or deposit for that amount' });
  }
  const actions = [];
  if (p.kind === 'verify' && !user.verified) { hooks.onVerify && hooks.onVerify(user, p.sessionKey); actions.push('verified'); }
  if (p.kind === 'login') { hooks.onLogin && hooks.onLogin(user, p.sessionKey); actions.push('login_approved'); }
  if (p.kind === 'deposit') actions.push('deposit');
  const tx = applyTx(user.id, amount, 'deposit', { source: 'bot', kind: p.kind, pendingId: p.id, txid });
  p.status = 'paid'; p.closedAt = Date.now(); p.txId = tx.id; p.transactionId = txid;
  return remember(200, { ok: true, matched: true, kind: p.kind, actions, credited: amount, user: { name: ingameName(user), verified: !!user.verified, balance: user.balance } });
}

setInterval(() => { if (store.db) sweep(); }, 60000).unref();

module.exports = { verifyFor, loginFor, createDeposit, cancelDeposit, publicPending, handlePayment, findUserByIngame, userPendings, sweep, db };

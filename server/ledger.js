// THE single function that changes balances. Every bet, payout, deposit, withdrawal
// and bot adjustment goes through applyTx(), which refuses to go below zero and
// appends a log entry before the balance changes.
const store = require('./store');

class AppError extends Error {
  constructor(message, code = 'bad_request', status = 400) {
    super(message); this.code = code; this.status = status;
  }
}

function ingameName(u) { return (u.bedrock ? '.' : '') + u.username; }

const TYPES = new Set(['deposit', 'bet', 'payout', 'refund', 'withdraw', 'withdraw_refund', 'bot_debit', 'adjust', 'bonus', 'rakeback', 'commission']);
const listeners = [];
// Other modules (affiliates) can react to committed transactions. Listener errors never undo a tx.
function onTx(fn) { listeners.push(fn); }

function applyTx(userId, delta, type, meta = {}) {
  const db = store.db;
  const u = db.users[userId];
  if (!u) throw new AppError('Account not found', 'not_found', 404);
  if (!TYPES.has(type)) throw new AppError('Unknown transaction type', 'bad_type', 500);
  if (!Number.isSafeInteger(delta) || delta === 0) throw new AppError('Amount must be a non-zero whole number of donuts', 'bad_amount');
  const after = u.balance + delta;
  if (!Number.isSafeInteger(after)) throw new AppError('Amount too large', 'bad_amount');
  if (after < 0) throw new AppError('Not enough donuts', 'insufficient_funds', 409);

  const tx = {
    id: db.seq.tx + 1, ts: Date.now(), userId, name: ingameName(u), type,
    delta, balanceBefore: u.balance, balanceAfter: after, meta,
  };
  store.appendLedger(tx);        // durable log first; throws => nothing changes
  db.seq.tx = tx.id;
  u.balance = after;
  if (type === 'bet') u.stats.wagered += -delta;
  if (type === 'payout') u.stats.won += delta;
  if (type === 'deposit') u.stats.deposited += delta;
  if (type === 'withdraw') u.stats.withdrawn += -delta;
  if (type === 'withdraw_refund') u.stats.withdrawn -= delta;
  db.tx.push(tx);
  store.save();
  for (const fn of listeners) { try { fn(tx, u); } catch (e) { console.error('[ledger] listener failed', e); } }
  return tx;
}

module.exports = { applyTx, AppError, ingameName, onTx };

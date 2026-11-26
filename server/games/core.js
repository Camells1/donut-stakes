// Shared bet plumbing for all games. A game only decides the outcome; this file
// validates the bet, debits it, pays out and writes the history record.
const config = require('../../config');
const store = require('../store');
const rng = require('../rng');
const { applyTx, AppError, ingameName } = require('../ledger');

const EDGE = config.houseEdge;
const RTP = 1 - EDGE;

function isExcluded(u) {
  return !!u.excludedUntil && (u.excludedUntil === 'permanent' || u.excludedUntil > Date.now());
}

function assertCanBet(user) {
  if (!user) throw new AppError('Log in to play', 'auth_required', 401);
  if (!user.verified) throw new AppError('Verify your account in-game before placing bets', 'unverified', 403);
  if (isExcluded(user)) throw new AppError('You are self-excluded and cannot place bets right now', 'self_excluded', 403);
}

function parseBet(v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new AppError('Bet must be a whole number of donuts', 'bad_bet');
  if (n < config.minBet) throw new AppError(`Minimum bet is ${config.minBet}`, 'bad_bet');
  if (n > config.maxBet) throw new AppError(`Maximum bet is ${config.maxBet}`, 'bad_bet');
  return n;
}

const round4 = (x) => Math.floor(x * 10000 + 1e-7) / 10000;
function payoutFor(bet, multiplier) {
  const p = Math.floor(Math.round(bet * multiplier * 10000) / 10000);
  return Math.max(0, Math.min(p, config.maxPayout));
}

// Debit the stake. Returns the ledger entry.
function takeBet(user, gameId, bet, meta = {}) {
  assertCanBet(user);
  return applyTx(user.id, -bet, 'bet', { game: gameId, ...meta });
}

// Pay out (if any) and record the finished bet in history.
// payoutOverride: exact payout for games with several stakes (roulette chips, blackjack doubles).
function finishBet(user, gameId, bet, multiplier, summary, result, betTxId, payoutOverride) {
  const payout = payoutOverride !== undefined ? Math.max(0, Math.min(Math.floor(payoutOverride), config.maxPayout)) : payoutFor(bet, multiplier);
  if (payoutOverride !== undefined) multiplier = bet ? payout / bet : 0;
  if (payout > 0) applyTx(user.id, payout, 'payout', { game: gameId, betTxId });
  const db = store.db;
  const rec = {
    id: ++db.seq.bet, ts: Date.now(), userId: user.id, name: ingameName(user), game: gameId,
    bet, multiplier: round4(multiplier), payout, profit: payout - bet, summary, result,
  };
  db.bets.push(rec);
  store.save();
  return rec;
}

// Wrap a one-shot game: { validate(body) -> params, play(params, rng) -> { multiplier, summary, result } }
function instantGame(def) {
  return {
    ...def,
    actions: {
      play(ctx) {
        const params = def.validate(ctx.body || {});
        const bet = parseBet(ctx.body.bet);
        const betTx = takeBet(ctx.user, def.id, bet);
        let out;
        try { out = def.play(params, rng); } catch (e) {
          applyTx(ctx.user.id, bet, 'refund', { game: def.id, betTxId: betTx.id, reason: 'game error' });
          throw e;
        }
        const rec = finishBet(ctx.user, def.id, bet, out.multiplier, out.summary, out.result, betTx.id);
        return { result: out.result, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: ctx.user.balance };
      },
    },
  };
}

function publicBet(b) {
  return { id: b.id, ts: b.ts, name: b.name, game: b.game, bet: b.bet, multiplier: b.multiplier, payout: b.payout, profit: b.profit, summary: b.summary };
}

// Stateful rounds (one active round per user per game), persisted in db.active so they survive restarts.
const rounds = {
  get(gameId, user) {
    if (!user) throw new AppError('Log in to play', 'auth_required', 401);
    return store.db.active[`${gameId}:${user.id}`] || null;
  },
  set(gameId, user, st) { store.db.active[`${gameId}:${user.id}`] = st; store.save(); },
  clear(gameId, user) { delete store.db.active[`${gameId}:${user.id}`]; store.save(); },
};

// Weighted RTP-matching table builder shared by generated paytables (plinko-style rounding).
function nice(v) {
  if (v < 2) return Math.floor(v * 100) / 100;
  if (v < 10) return Math.floor(v * 10) / 10;
  if (v < 100) return Math.floor(v);
  return Math.floor(v / 5) * 5;
}
// raw: base pay values; probs: probability of each entry. Returns { m, rtp } with rtp <= RTP and as close as possible.
function fitTable(raw, probs, floor = 0, cap = Infinity) {
  const rtpOf = (m) => m.reduce((a, v, k) => a + v * probs[k], 0);
  const shape = (f) => raw.map((r) => (r > 0 ? Math.min(cap, Math.max(floor, nice(r * f))) : 0));
  let f = RTP / rtpOf(raw);
  let best = null;
  for (let i = 0; i < 600; i++) {
    const m = shape(f);
    const rtp = rtpOf(m);
    if (rtp <= RTP && (!best || rtp > best.rtp)) best = { m, rtp };
    f *= rtp > RTP ? 0.9995 : 1.0008;
  }
  // Greedy top-up: nudge paying entries up one rounding step at a time while staying <= RTP.
  const step = (v) => (v < 10 ? 0.01 : v < 100 ? 0.1 : v < 1000 ? 1 : 5);
  const order = best.m.map((_, k) => k).filter((k) => best.m[k] > 0).sort((a, b) => probs[b] - probs[a]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const k of order) {
      const v = best.m[k], nv = Math.round((v + step(v)) * 100) / 100;
      if (nv <= cap && best.rtp + (nv - v) * probs[k] <= RTP) { best.m[k] = nv; best.rtp += (nv - v) * probs[k]; grew = true; }
    }
  }
  best.rtp = rtpOf(best.m);
  return best;
}

module.exports = { EDGE, RTP, AppError, assertCanBet, parseBet, takeBet, finishBet, instantGame, publicBet, round4, payoutFor, isExcluded, rng, rounds, fitTable, nice };

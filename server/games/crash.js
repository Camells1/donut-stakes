// Crash: the multiplier grows from 1.00x over time; cash out before it crashes.
// Per-player rounds. The crash point is drawn at start (P(crash >= m) = RTP / m, same as Limbo)
// and stays secret until the round ends. Cashing out at m pays m if m <= crash point.
const { RTP, AppError, parseBet, takeBet, finishBet, publicBet, rounds, rng } = require('./core');

const ID = 'crash';
const K = 0.00006;           // growth rate: 1.82x at 10 s, 6.05x at 30 s
const MAX = 1_000_000;
const multAt = (ms) => Math.floor(Math.exp(K * Math.max(0, ms)) * 100 + 1e-9) / 100;
const timeFor = (m) => Math.log(m) / K;            // ms until the multiplier reaches m
const crashTime = (c) => Math.log(c + 0.01) / K;    // first moment the shown multiplier exceeds c

function drawCrash() {
  const u = rng.float();
  return Math.min(MAX, Math.max(1, Math.floor((100 * RTP) / (1 - u)) / 100));
}

function end(user, st, win, at) {
  rounds.clear(ID, user);
  const rec = finishBet(user, ID, st.bet, win ? at : 0,
    win ? `cashed ${at.toFixed(2)}x (crash ${st.crash.toFixed(2)}x)` : `crashed ${st.crash.toFixed(2)}x`,
    { crash: st.crash, cashedAt: win ? at : null, auto: st.auto }, st.betTxId);
  return { done: true, win, crash: st.crash, cashedAt: win ? at : null, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: user.balance };
}

// Settle the round if time has already decided it. Returns a result or null while still flying.
function resolve(user, st, now = Date.now()) {
  const el = now - st.startedAt;
  if (st.auto && st.auto <= st.crash && el >= timeFor(st.auto)) return end(user, st, true, st.auto);
  if (el >= crashTime(st.crash)) return end(user, st, false, 0);
  return null;
}

const view = (st, now = Date.now()) => ({ running: true, bet: st.bet, auto: st.auto, elapsed: now - st.startedAt, multiplier: multAt(now - st.startedAt), k: K });

module.exports = {
  id: ID,
  name: 'Crash',
  description: 'The donut climbs. Cash out before it crashes.',
  order: 6,
  info: { k: K, max: MAX, rtp: RTP },
  actions: {
    state(ctx) {
      const st = rounds.get(ID, ctx.user);
      if (!st) return { game: null, balance: ctx.user.balance };
      const r = resolve(ctx.user, st);
      return r ? { result: r, game: null, balance: ctx.user.balance } : { game: view(st), balance: ctx.user.balance };
    },
    start(ctx) {
      const b = ctx.body || {};
      const old = rounds.get(ID, ctx.user);
      if (old && !resolve(ctx.user, old)) throw new AppError('Your current Crash round is still flying', 'round_active', 409);
      const bet = parseBet(b.bet);
      let auto = null;
      if (b.autoCashout !== undefined && b.autoCashout !== null && b.autoCashout !== '') {
        auto = Math.floor(Number(b.autoCashout) * 100 + 1e-7) / 100;
        if (!Number.isFinite(auto) || auto < 1.01 || auto > MAX) throw new AppError(`Auto cash-out must be 1.01x-${MAX}x`, 'bad_params');
      }
      const betTx = takeBet(ctx.user, ID, bet, { auto });
      const st = { bet, auto, crash: drawCrash(), betTxId: betTx.id, startedAt: Date.now() };
      rounds.set(ID, ctx.user, st);
      return { game: view(st), balance: ctx.user.balance };
    },
    cashout(ctx) {
      const st = rounds.get(ID, ctx.user);
      if (!st) throw new AppError('No active Crash round', 'no_round', 409);
      const now = Date.now();
      const r = resolve(ctx.user, st, now);
      if (r) return { result: r, balance: ctx.user.balance };
      return { result: end(ctx.user, st, true, multAt(now - st.startedAt)), balance: ctx.user.balance };
    },
  },
  _test: { multAt, timeFor, crashTime, drawCrash },
};

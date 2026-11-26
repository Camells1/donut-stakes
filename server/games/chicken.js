// Chicken: cross lane by lane. Each step has a fixed chance of getting hit
// (drawn fresh with crypto RNG when you step). Multiplier after k lanes =
// RTP / (1 - hit)^k. Cash out any time; the last lane cashes out automatically.
const { RTP, AppError, parseBet, takeBet, finishBet, publicBet, payoutFor, round4, rounds, rng } = require('./core');

const ID = 'chicken';
const MODES = {
  easy: { hit: 1 / 25, lanes: 24 },
  medium: { hit: 3 / 25, lanes: 22 },
  hard: { hit: 5 / 25, lanes: 20 },
  daredevil: { hit: 10 / 25, lanes: 15 },
};
const multAt = (md, k) => (k ? round4(RTP / Math.pow(1 - md.hit, k)) : 0);

function view(st) {
  const md = MODES[st.mode];
  return {
    active: true, bet: st.bet, mode: st.mode, lane: st.lane, lanes: md.lanes,
    multiplier: multAt(md, st.lane), nextMultiplier: st.lane < md.lanes ? multAt(md, st.lane + 1) : null,
    cashout: st.lane ? payoutFor(st.bet, multAt(md, st.lane)) : 0,
  };
}
function end(user, st, win, extra = {}) {
  rounds.clear(ID, user);
  const m = win ? multAt(MODES[st.mode], st.lane) : 0;
  const rec = finishBet(user, ID, st.bet, m, `${st.mode}: ${win ? 'safe at lane ' + st.lane : 'hit at lane ' + (st.lane + 1)}`, { mode: st.mode, lane: st.lane }, st.betTxId);
  return { ...view(st), active: false, ...extra, done: true, win, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: user.balance };
}
function need(user) { const st = rounds.get(ID, user); if (!st) throw new AppError('No active Chicken round', 'no_round', 409); return st; }

module.exports = {
  id: ID,
  name: 'Chicken',
  description: 'Cross the sprinkle highway one lane at a time.',
  order: 13,
  info: { modes: MODES, rtp: RTP },
  actions: {
    state(ctx) { const st = rounds.get(ID, ctx.user); return { game: st ? view(st) : null, balance: ctx.user.balance }; },
    start(ctx) {
      if (rounds.get(ID, ctx.user)) throw new AppError('Finish your current crossing first', 'round_active', 409);
      const mode = String(ctx.body && ctx.body.mode);
      if (!MODES[mode]) throw new AppError('Pick a difficulty', 'bad_params');
      const bet = parseBet(ctx.body.bet);
      const betTx = takeBet(ctx.user, ID, bet, { mode });
      const st = { bet, mode, lane: 0, betTxId: betTx.id };
      rounds.set(ID, ctx.user, st);
      return { game: view(st), balance: ctx.user.balance };
    },
    step(ctx) {
      const st = need(ctx.user);
      const md = MODES[st.mode];
      if (rng.float() < md.hit) return end(ctx.user, st, false, { hit: true });
      st.lane++;
      if (st.lane >= md.lanes) return end(ctx.user, st, true, { crossed: true });
      rounds.set(ID, ctx.user, st);
      return { game: view(st), balance: ctx.user.balance };
    },
    cashout(ctx) {
      const st = need(ctx.user);
      if (!st.lane) throw new AppError('Cross at least one lane first', 'bad_params');
      return end(ctx.user, st, true);
    },
  },
};

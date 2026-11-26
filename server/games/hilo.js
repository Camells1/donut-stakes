// Hi-Lo: a chain of cards. Guess whether the next card is higher or lower; each
// correct guess multiplies your stake by 1/chance (the 1% edge is applied once, so
// cashing out after any number of steps returns 99% on average). Cards come from an
// infinite deck (each draw is independent, A low, K high).
//   A: "higher" (strictly, 12/13) or "same" (1/13)
//   K: "lower" (strictly, 12/13) or "same" (1/13)
//   2-Q: "higher or same" ((14-r)/13) or "lower or same" (r/13)
// "skip" swaps the card for free (it changes nothing about the odds).
const { RTP, AppError, parseBet, takeBet, finishBet, publicBet, payoutFor, round4, rounds, rng } = require('./core');

const ID = 'hilo';
const MAX_SKIPS = 30;
const draw = (r = rng) => ({ r: r.int(1, 14), s: r.int(0, 4) });

function options(rank) {
  if (rank === 1) return { higher: { p: 12 / 13, test: (n) => n > 1 }, same: { p: 1 / 13, test: (n) => n === 1 } };
  if (rank === 13) return { lower: { p: 12 / 13, test: (n) => n < 13 }, same: { p: 1 / 13, test: (n) => n === 13 } };
  return { higher: { p: (14 - rank) / 13, test: (n) => n >= rank }, lower: { p: rank / 13, test: (n) => n <= rank } };
}
const multOf = (st) => (st.steps ? round4(RTP * st.prod) : 0);

function view(st) {
  const opts = options(st.card.r);
  return {
    active: true, bet: st.bet, card: st.card, chain: st.chain, steps: st.steps, skips: st.skips, maxSkips: MAX_SKIPS,
    multiplier: multOf(st), cashout: st.steps ? payoutFor(st.bet, multOf(st)) : 0,
    options: Object.fromEntries(Object.entries(opts).map(([k, o]) => [k, { chance: o.p, multiplier: round4(RTP * st.prod / o.p) }])),
  };
}
function end(user, st, win, extra) {
  rounds.clear(ID, user);
  const m = win ? multOf(st) : 0;
  const rec = finishBet(user, ID, st.bet, m, win ? `cashed after ${st.steps} (${m.toFixed(2)}x)` : `wrong after ${st.steps}`,
    { chain: st.chain, steps: st.steps }, st.betTxId);
  return { done: true, win, chain: st.chain, card: st.card, ...extra, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: user.balance };
}
function need(user) {
  const st = rounds.get(ID, user);
  if (!st) throw new AppError('No active Hi-Lo round', 'no_round', 409);
  return st;
}

module.exports = {
  id: ID,
  name: 'Hi-Lo',
  description: 'Higher or lower? Build a chain and cash out.',
  order: 10,
  info: { maxSkips: MAX_SKIPS, rtp: RTP },
  actions: {
    state(ctx) {
      const st = rounds.get(ID, ctx.user);
      return { game: st ? view(st) : null, balance: ctx.user.balance };
    },
    start(ctx) {
      if (rounds.get(ID, ctx.user)) throw new AppError('Finish your current Hi-Lo round first', 'round_active', 409);
      const bet = parseBet(ctx.body && ctx.body.bet);
      const betTx = takeBet(ctx.user, ID, bet);
      const card = draw();
      const st = { bet, betTxId: betTx.id, card, chain: [{ card, guess: 'start' }], steps: 0, prod: 1, skips: 0 };
      rounds.set(ID, ctx.user, st);
      return { game: view(st), balance: ctx.user.balance };
    },
    guess(ctx) {
      const st = need(ctx.user);
      const choice = String(ctx.body && ctx.body.choice);
      if (choice === 'skip') {
        if (st.skips >= MAX_SKIPS) throw new AppError('No skips left', 'bad_params');
        st.skips++;
        st.card = draw();
        st.chain.push({ card: st.card, guess: 'skip' });
        rounds.set(ID, ctx.user, st);
        return { game: view(st), balance: ctx.user.balance };
      }
      const opt = options(st.card.r)[choice];
      if (!opt) throw new AppError('That guess is not available for this card', 'bad_params');
      const next = draw();
      const ok = opt.test(next.r);
      st.chain.push({ card: next, guess: choice, ok });
      st.card = next;
      if (!ok) return end(ctx.user, st, false, { lastGuess: choice });
      st.steps++;
      st.prod /= opt.p;
      rounds.set(ID, ctx.user, st);
      return { game: view(st), correct: true, balance: ctx.user.balance };
    },
    cashout(ctx) {
      const st = need(ctx.user);
      if (!st.steps) throw new AppError('Make at least one correct guess first', 'bad_params');
      return end(ctx.user, st, true);
    },
  },
  _test: { options, draw },
};

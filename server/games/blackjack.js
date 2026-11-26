// Blackjack vs the dealer. Infinite deck (each card is a fresh crypto draw), dealer peeks
// for blackjack, blackjack pays 3:2, double on any first two cards, no split/insurance.
// DEALER_HITS_SOFT_17 is set so perfect basic strategy has about a 1% house edge
// (simulated in scripts/smoke-test.js).
const { AppError, parseBet, takeBet, finishBet, publicBet, rounds, rng } = require('./core');

const ID = 'blackjack';
const DEALER_HITS_SOFT_17 = false;

const draw = (r = rng) => ({ r: r.int(1, 14), s: r.int(0, 4) });  // r: 1=A, 11-13 = J Q K
function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += c.r === 1 ? 11 : Math.min(10, c.r); if (c.r === 1) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
const isBJ = (cards) => cards.length === 2 && total(cards).t === 21;
function dealerPlay(cards, r = rng) {
  for (;;) {
    const { t, soft } = total(cards);
    if (t < 17 || (t === 17 && soft && DEALER_HITS_SOFT_17)) cards.push(draw(r)); else return cards;
  }
}
// Multiplier on the TOTAL stake (bet, or 2x bet when doubled).
function settle(player, dealer) {
  const p = total(player).t, d = total(dealer).t;
  if (p > 21) return { mult: 0, outcome: 'bust' };
  if (d > 21) return { mult: 2, outcome: 'dealer_bust' };
  if (p > d) return { mult: 2, outcome: 'win' };
  if (p === d) return { mult: 1, outcome: 'push' };
  return { mult: 0, outcome: 'lose' };
}

function view(st, reveal) {
  return {
    active: !reveal, bet: st.bet, stake: st.stake, doubled: st.doubled,
    player: st.player, playerTotal: total(st.player),
    dealer: reveal ? st.dealer : [st.dealer[0]], dealerTotal: reveal ? total(st.dealer) : total([st.dealer[0]]),
    canDouble: !reveal && st.player.length === 2 && !st.doubled,
  };
}

function finish(user, st, mult, outcome) {
  rounds.clear(ID, user);
  const payout = Math.floor(st.stake * mult);
  const pt = total(st.player).t, dt = total(st.dealer).t;
  const rec = finishBet(user, ID, st.stake, 0, `${outcome.replace('_', ' ')} ${pt} vs ${dt}${st.doubled ? ' (double)' : ''}`,
    { player: st.player, dealer: st.dealer, outcome, doubled: st.doubled }, st.betTxId, payout);
  return { game: view(st, true), done: true, outcome, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: user.balance };
}
function standOut(user, st) {
  dealerPlay(st.dealer);
  const s = settle(st.player, st.dealer);
  return finish(user, st, s.mult, s.outcome);
}
function need(user) {
  const st = rounds.get(ID, user);
  if (!st) throw new AppError('No active hand', 'no_round', 409);
  return st;
}

module.exports = {
  id: ID,
  name: 'Blackjack',
  description: 'Beat the dealer to 21. Hit, stand or double.',
  order: 8,
  info: { blackjackPays: 2.5, dealerHitsSoft17: DEALER_HITS_SOFT_17, rules: 'Infinite deck, dealer peeks, blackjack pays 3:2, double on any first two cards, no split.' },
  actions: {
    state(ctx) {
      const st = rounds.get(ID, ctx.user);
      return { game: st ? view(st) : null, balance: ctx.user.balance };
    },
    start(ctx) {
      if (rounds.get(ID, ctx.user)) throw new AppError('Finish your current hand first', 'round_active', 409);
      const bet = parseBet(ctx.body && ctx.body.bet);
      const betTx = takeBet(ctx.user, ID, bet);
      const st = { bet, stake: bet, doubled: false, betTxId: betTx.id, player: [draw(), draw()], dealer: [draw(), draw()] };
      rounds.set(ID, ctx.user, st);
      const pBJ = isBJ(st.player), dBJ = isBJ(st.dealer);
      if (pBJ || dBJ) return finish(ctx.user, st, pBJ && dBJ ? 1 : pBJ ? 2.5 : 0, pBJ && dBJ ? 'push' : pBJ ? 'blackjack' : 'dealer_blackjack');
      return { game: view(st), balance: ctx.user.balance };
    },
    hit(ctx) {
      const st = need(ctx.user);
      st.player.push(draw());
      const t = total(st.player).t;
      if (t > 21) return finish(ctx.user, st, 0, 'bust');
      if (t === 21) return standOut(ctx.user, st);
      rounds.set(ID, ctx.user, st);
      return { game: view(st), balance: ctx.user.balance };
    },
    stand(ctx) { return standOut(ctx.user, need(ctx.user)); },
    double(ctx) {
      const st = need(ctx.user);
      if (st.player.length !== 2 || st.doubled) throw new AppError('You can only double on your first two cards', 'bad_params');
      takeBet(ctx.user, ID, st.bet, { double: true, betTxId: st.betTxId });
      st.stake = st.bet * 2; st.doubled = true;
      st.player.push(draw());
      if (total(st.player).t > 21) return finish(ctx.user, st, 0, 'bust');
      return standOut(ctx.user, st);
    },
  },
  _test: { total, isBJ, dealerPlay, settle, draw },
};

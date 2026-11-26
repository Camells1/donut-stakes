// Case Battles (simplified): you vs 1-3 house bots. Everyone opens the same case for
// 1-5 rounds; the highest total takes the whole pot (ties broken by a fair random draw).
// You pay price x rounds. Bots are the house, not other players. By symmetry every seat's
// expected share of the pot equals one seat's openings, so your RTP is the case RTP (99%).
const { AppError, parseBet, takeBet, finishBet, publicBet, rng } = require('./core');
const config = require('../../config');
const { CASES, openCase } = require('./cases-data');

const BOT_NAMES = ['Baker Bot', 'Glaze-o-tron', 'Sprinkles 3000'];

module.exports = {
  id: 'casebattle',
  name: 'Case Battles',
  description: 'Open cases against house bots. Highest total takes the pot.',
  order: 20,
  info: { cases: Object.fromEntries(Object.values(CASES).map((c) => [c.id, { name: c.name, color: c.color }])), maxRounds: 5, maxBots: 3, bots: BOT_NAMES,
    simplified: 'You battle house bots, not other players. Drops are donut amounts. Fair by symmetry, so the case RTP (99%) is your RTP.' },
  actions: {
    play(ctx) {
      const b = ctx.body || {};
      const c = CASES[String(b.caseId)];
      if (!c) throw new AppError('Pick a case', 'bad_params');
      const rounds = Number(b.rounds || 1), bots = Number(b.bots || 1);
      if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5) throw new AppError('Rounds must be 1-5', 'bad_params');
      if (!Number.isInteger(bots) || bots < 1 || bots > 3) throw new AppError('Bots must be 1-3', 'bad_params');
      const price = parseBet(b.bet);
      const stake = price * rounds;
      if (stake > config.maxBet) throw new AppError(`Total stake is above the max bet of ${config.maxBet}`, 'bad_bet');
      const betTx = takeBet(ctx.user, 'casebattle', stake, { caseId: c.id, rounds, bots });
      const seats = [{ name: ctx.user.username, you: true }, ...BOT_NAMES.slice(0, bots).map((n) => ({ name: n }))].map((s) => ({ ...s, drops: [], total: 0 }));
      for (let r = 0; r < rounds; r++) for (const s of seats) {
        const i = openCase(c, rng);
        s.drops.push({ index: i, name: c.drops[i].name, multiplier: c.drops[i].multiplier });
        s.total = Math.round((s.total + c.drops[i].multiplier) * 10000) / 10000;
      }
      const top = Math.max(...seats.map((s) => s.total));
      const tied = seats.map((s, i) => (s.total === top ? i : -1)).filter((i) => i >= 0);
      const winner = tied[rng.int(0, tied.length)];
      const potMult = seats.reduce((a, s) => a + s.total, 0);
      const payout = winner === 0 ? Math.floor(price * potMult) : 0;
      const rec = finishBet(ctx.user, 'casebattle', stake, 0, `${c.name} ${rounds}r vs ${bots}: ${winner === 0 ? 'won' : seats[winner].name + ' won'}`,
        { caseId: c.id, seats: seats.map(({ name, you, drops, total }) => ({ name, you: !!you, drops, total })), winner }, betTx.id, payout);
      return { result: { caseId: c.id, seats, winner, potValue: Math.floor(price * potMult), tiebreak: tied.length > 1 }, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: ctx.user.balance };
    },
  },
};

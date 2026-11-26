// Cases (simplified, donuts only): pay the case price, get a weighted random drop
// worth price x multiplier. Open 1-5 cases at once.
const config = require('../../config');
const { AppError, parseBet, takeBet, finishBet, publicBet, payoutFor, rng } = require('./core');
const { CASES, openCase } = require('./cases-data');

module.exports = {
  id: 'cases',
  name: 'Cases',
  description: 'Crack open donut boxes for weighted drops.',
  order: 19,
  info: { cases: CASES, maxOpen: 5, simplified: 'Drops are donut amounts (price x multiplier), not items.' },
  actions: {
    play(ctx) {
      const b = ctx.body || {};
      const c = CASES[String(b.caseId)];
      if (!c) throw new AppError('Pick a case', 'bad_params');
      const count = Number(b.count || 1);
      if (!Number.isInteger(count) || count < 1 || count > 5) throw new AppError('Open 1-5 cases', 'bad_params');
      const price = parseBet(b.bet);
      if (price * count > config.maxBet) throw new AppError(`Total stake is above the max bet of ${config.maxBet}`, 'bad_bet');
      const total = price * count;
      const betTx = takeBet(ctx.user, 'cases', total, { caseId: c.id, count });
      const drops = Array.from({ length: count }, () => {
        const i = openCase(c, rng);
        return { index: i, name: c.drops[i].name, multiplier: c.drops[i].multiplier, value: payoutFor(price, c.drops[i].multiplier) };
      });
      const payout = drops.reduce((a, d) => a + d.value, 0);
      const best = drops.reduce((a, d) => (d.multiplier > a.multiplier ? d : a), drops[0]);
      const rec = finishBet(ctx.user, 'cases', total, 0, `${c.name} x${count}: best ${best.name}`, { caseId: c.id, drops }, betTx.id, payout);
      return { result: { caseId: c.id, drops }, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: ctx.user.balance };
    },
  },
};

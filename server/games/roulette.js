// European-layout roulette (0-36). Several chips per spin. Each bet pays
// RTP * 37 / (numbers covered), so every bet type keeps the 1% edge
// (red/black 2.035x, single number 36.63x).
const config = require('../../config');
const { RTP, AppError, parseBet, takeBet, finishBet, publicBet, payoutFor, round4, rng } = require('./core');

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function covers(type, value) {
  switch (type) {
    case 'number': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 36) throw new AppError('Number must be 0-36', 'bad_params');
      return [n];
    }
    case 'green': return [0];
    case 'red': return range(1, 36).filter((n) => RED.has(n));
    case 'black': return range(1, 36).filter((n) => !RED.has(n));
    case 'odd': return range(1, 36).filter((n) => n % 2 === 1);
    case 'even': return range(1, 36).filter((n) => n % 2 === 0);
    case 'low': return range(1, 18);
    case 'high': return range(19, 36);
    case 'dozen': case 'column': {
      const v = Number(value);
      if (![1, 2, 3].includes(v)) throw new AppError(`${type} must be 1, 2 or 3`, 'bad_params');
      return type === 'dozen' ? range(v * 12 - 11, v * 12) : range(1, 36).filter((n) => (n - 1) % 3 === v - 1);
    }
    default: throw new AppError('Unknown bet type', 'bad_params');
  }
}
const multFor = (count) => round4((RTP * 37) / count);

module.exports = {
  id: 'roulette',
  name: 'Roulette',
  description: 'Red, black, green or your lucky number.',
  order: 7,
  info: {
    wheel: WHEEL, red: [...RED], rtp: RTP,
    payouts: { number: multFor(1), green: multFor(1), red: multFor(18), black: multFor(18), odd: multFor(18), even: multFor(18), low: multFor(18), high: multFor(18), dozen: multFor(12), column: multFor(12) },
  },
  actions: {
    play(ctx) {
      const list = ctx.body && ctx.body.bets;
      if (!Array.isArray(list) || !list.length || list.length > 40) throw new AppError('Place 1-40 chips', 'bad_params');
      const bets = list.map((b) => {
        const nums = covers(String(b.type), b.value);
        return { type: String(b.type), value: b.value ?? null, amount: parseBet(b.amount), nums, mult: multFor(nums.length) };
      });
      const total = bets.reduce((a, b) => a + b.amount, 0);
      if (total > config.maxBet) throw new AppError(`Total stake is above the max bet of ${config.maxBet}`, 'bad_bet');
      const betTx = takeBet(ctx.user, 'roulette', total, { chips: bets.length });
      const n = rng.int(0, 37);
      let payout = 0;
      const lines = bets.map((b) => {
        const win = b.nums.includes(n);
        const p = win ? payoutFor(b.amount, b.mult) : 0;
        payout += p;
        return { type: b.type, value: b.value, amount: b.amount, multiplier: b.mult, win, payout: p };
      });
      const rec = finishBet(ctx.user, 'roulette', total, 0, `${n} ${colorOf(n)} (${bets.length} chip${bets.length > 1 ? 's' : ''})`,
        { number: n, color: colorOf(n), lines }, betTx.id, payout);
      return { result: { number: n, color: colorOf(n), lines }, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: ctx.user.balance };
    },
  },
  _test: { covers, multFor, colorOf },
};

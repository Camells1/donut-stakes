// Dice Duels: you and the house each roll 1-3 dice; higher total wins.
// Ties push (stake back). The win multiplier is set from the exact odds so RTP = 99%.
const { instantGame, RTP, AppError } = require('./core');

function sumDist(n) {
  let d = { 0: 1 };
  for (let i = 0; i < n; i++) {
    const nd = {};
    for (const [s, p] of Object.entries(d)) for (let f = 1; f <= 6; f++) nd[+s + f] = (nd[+s + f] || 0) + p / 6;
    d = nd;
  }
  return d;
}
const ODDS = {};
for (const n of [1, 2, 3]) {
  const d = sumDist(n);
  let tie = 0;
  for (const p of Object.values(d)) tie += p * p;
  const win = (1 - tie) / 2;
  ODDS[n] = { win, tie, multiplier: Math.floor(((RTP - tie) / win) * 10000) / 10000 };
}

module.exports = instantGame({
  id: 'diceduel',
  name: 'Dice Duels',
  description: 'Roll against the house. Highest total takes it.',
  order: 14,
  info: { odds: ODDS, rtp: RTP },
  validate(body) {
    const dice = Number(body.dice || 2);
    if (![1, 2, 3].includes(dice)) throw new AppError('Roll 1, 2 or 3 dice', 'bad_params');
    return { dice };
  },
  play({ dice }, rng) {
    const you = Array.from({ length: dice }, () => rng.int(1, 7));
    const house = Array.from({ length: dice }, () => rng.int(1, 7));
    const a = you.reduce((x, y) => x + y, 0), b = house.reduce((x, y) => x + y, 0);
    const outcome = a > b ? 'win' : a === b ? 'tie' : 'lose';
    return {
      multiplier: outcome === 'win' ? ODDS[dice].multiplier : outcome === 'tie' ? 1 : 0,
      summary: `${a} vs ${b} (${outcome})`,
      result: { you, house, youTotal: a, houseTotal: b, outcome },
    };
  },
});

// 3-reel slots. Each reel stop is an independent crypto draw from a weighted strip.
// The paytable is scaled at start-up so the exact RTP (computed over every combination)
// sits just under 99%.
const { instantGame, AppError, fitTable } = require('./core');

const SYMBOLS = [
  { id: 'gold', name: 'Golden Donut', weight: 2 },
  { id: 'pink', name: 'Strawberry', weight: 5 },
  { id: 'choco', name: 'Chocolate', weight: 7 },
  { id: 'mint', name: 'Mint', weight: 9 },
  { id: 'blue', name: 'Blueberry', weight: 11 },
  { id: 'blank', name: 'Crumbs', weight: 30 },
];
const TOTAL = SYMBOLS.reduce((a, s) => a + s.weight, 0);

// Rules are checked in order; the first that matches pays.
const RULES = [
  { id: '3gold', label: '3 Golden Donuts', base: 1000, test: (r) => r.every((s) => s === 'gold') },
  { id: '3pink', label: '3 Strawberry', base: 150, test: (r) => r.every((s) => s === 'pink') },
  { id: '3choco', label: '3 Chocolate', base: 60, test: (r) => r.every((s) => s === 'choco') },
  { id: '3mint', label: '3 Mint', base: 30, test: (r) => r.every((s) => s === 'mint') },
  { id: '3blue', label: '3 Blueberry', base: 15, test: (r) => r.every((s) => s === 'blue') },
  { id: '2gold', label: 'Any 2 Golden', base: 10, test: (r) => r.filter((s) => s === 'gold').length === 2 },
  { id: 'any3', label: 'Any 3 donuts', base: 3, test: (r) => r.every((s) => s !== 'blank') },
  { id: '1gold', label: 'Any 1 Golden', base: 1.5, test: (r) => r.filter((s) => s === 'gold').length === 1 },
];

function ruleFor(reels) { return RULES.findIndex((ru) => ru.test(reels)); }

// Exact probability of each rule over all 6^3 combinations.
const probs = RULES.map(() => 0);
for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
  const i = ruleFor([a.id, b.id, c.id]);
  if (i >= 0) probs[i] += (a.weight * b.weight * c.weight) / TOTAL ** 3;
}
const FIT = fitTable(RULES.map((r) => r.base), probs);
const PAYS = FIT.m;

function spinReel(rng) {
  let x = rng.int(0, TOTAL);
  for (const s of SYMBOLS) { if (x < s.weight) return s.id; x -= s.weight; }
  return 'blank';
}

module.exports = instantGame({
  id: 'slots',
  name: 'Slots',
  description: 'Three reels of donuts. Line up the golden ones.',
  order: 9,
  info: {
    symbols: SYMBOLS.map(({ id, name, weight }) => ({ id, name, weight })),
    paytable: RULES.map((r, i) => ({ id: r.id, label: r.label, multiplier: PAYS[i], chance: probs[i] })),
    rtp: Math.round(FIT.rtp * 10000) / 10000,
  },
  validate(body) {
    if (body.lines !== undefined && Number(body.lines) !== 1) throw new AppError('Only 1 line is supported', 'bad_params');
    return {};
  },
  play(_p, rng) {
    const reels = [spinReel(rng), spinReel(rng), spinReel(rng)];
    const i = ruleFor(reels);
    const multiplier = i >= 0 ? PAYS[i] : 0;
    return { multiplier, summary: `${reels.join(' ')}${i >= 0 ? ' - ' + RULES[i].label : ''}`, result: { reels, rule: i >= 0 ? RULES[i].id : null, multiplier } };
  },
});

// Keno: pick 1-10 numbers from 1-40; the server draws 10. Pays by hits.
// Paytables are generated from the exact (hypergeometric) odds and scaled to just under 99% RTP.
const { instantGame, AppError, fitTable } = require('./core');

const POOL = 40, DRAW = 10, MAX_PICKS = 10;
function C(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
const pHits = (picks, h) => (C(picks, h) * C(POOL - picks, DRAW - h)) / C(POOL, DRAW);

const TABLES = {}, RTPS = {};
for (let p = 1; p <= MAX_PICKS; p++) {
  const probs = Array.from({ length: p + 1 }, (_, h) => pHits(p, h));
  const minHit = p <= 3 ? Math.max(1, p - 1) : Math.ceil(p / 2);
  const raw = probs.map((pr, h) => (h >= minHit ? Math.pow(1 / pr, 0.8) : 0));
  const fit = fitTable(raw, probs, 0, 10000);
  TABLES[p] = fit.m;
  RTPS[p] = Math.round(fit.rtp * 10000) / 10000;
}

module.exports = instantGame({
  id: 'keno',
  name: 'Keno',
  description: 'Pick up to 10 numbers. We draw 10.',
  order: 11,
  info: { pool: POOL, draw: DRAW, maxPicks: MAX_PICKS, tables: TABLES, rtp: RTPS },
  validate(body) {
    const picks = Array.isArray(body.picks) ? body.picks.map(Number) : [];
    if (picks.length < 1 || picks.length > MAX_PICKS) throw new AppError(`Pick 1-${MAX_PICKS} numbers`, 'bad_params');
    if (picks.some((n) => !Number.isInteger(n) || n < 1 || n > POOL) || new Set(picks).size !== picks.length) throw new AppError(`Picks must be different numbers from 1-${POOL}`, 'bad_params');
    return { picks: picks.sort((a, b) => a - b) };
  },
  play({ picks }, rng) {
    const drawn = rng.sample(POOL, DRAW).map((n) => n + 1).sort((a, b) => a - b);
    const hits = picks.filter((n) => drawn.includes(n));
    const multiplier = TABLES[picks.length][hits.length];
    return { multiplier, summary: `${hits.length}/${picks.length} hits`, result: { picks, drawn, hits, multiplier } };
  },
});

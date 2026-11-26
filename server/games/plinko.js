// Plinko: the ball makes `rows` left/right bounces (each a crypto coin flip);
// the slot is the number of rights. Multiplier tables are generated so each
// row/risk combination pays back just under the configured RTP.
const { instantGame, RTP, AppError } = require('./core');

const ROWS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const SHAPES = { low: { s: 2.0, p: 2.2, floor: 0.5 }, medium: { s: 4.2, p: 1.7, floor: 0.3 }, high: { s: 7.2, p: 1.45, floor: 0.2 } };

function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
function nice(v) {
  if (v < 2) return Math.floor(v * 100) / 100;
  if (v < 10) return Math.floor(v * 10) / 10;
  if (v < 100) return Math.floor(v);
  return Math.floor(v / 5) * 5;
}

function buildTable(n, { s, p, floor }) {
  const probs = Array.from({ length: n + 1 }, (_, k) => binom(n, k) / 2 ** n);
  const raw = probs.map((_, k) => Math.exp(s * Math.pow(Math.abs(k - n / 2) / (n / 2), p)));
  const rtpOf = (m) => m.reduce((a, v, k) => a + v * probs[k], 0);
  let f = RTP / rtpOf(raw);
  let best = null;
  for (let i = 0; i < 400; i++) {
    const m = raw.map((r) => Math.max(floor, nice(r * f)));
    const rtp = rtpOf(m);
    if (rtp <= RTP && (!best || rtp > best.rtp)) best = { m, rtp };
    f *= rtp > RTP ? 0.9993 : 1.0011;
  }
  return best;
}

const TABLES = {};
for (const risk of Object.keys(SHAPES)) {
  TABLES[risk] = {};
  for (const n of ROWS) TABLES[risk][n] = buildTable(n, SHAPES[risk]);
}

module.exports = instantGame({
  id: 'plinko',
  name: 'Plinko',
  description: 'Drop a donut through the pegs. Pick your risk and rows.',
  order: 1,
  info: {
    rows: ROWS,
    risks: Object.keys(SHAPES),
    tables: Object.fromEntries(Object.entries(TABLES).map(([r, t]) => [r, Object.fromEntries(Object.entries(t).map(([n, v]) => [n, v.m]))])),
    rtp: Object.fromEntries(Object.entries(TABLES).map(([r, t]) => [r, Object.fromEntries(Object.entries(t).map(([n, v]) => [n, Math.round(v.rtp * 10000) / 10000]))])),
  },
  validate(body) {
    const rows = Number(body.rows);
    const risk = String(body.risk || '').toLowerCase();
    if (!ROWS.includes(rows)) throw new AppError(`Rows must be ${ROWS[0]}-${ROWS[ROWS.length - 1]}`, 'bad_params');
    if (!SHAPES[risk]) throw new AppError('Risk must be low, medium or high', 'bad_params');
    return { rows, risk };
  },
  play({ rows, risk }, rng) {
    const path = Array.from({ length: rows }, () => rng.bit());
    const slot = path.reduce((a, b) => a + b, 0);
    const multiplier = TABLES[risk][rows].m[slot];
    return {
      multiplier,
      summary: `${risk} ${rows} rows -> slot ${slot}`,
      result: { path, slot, rows, risk, multiplier },
    };
  },
});

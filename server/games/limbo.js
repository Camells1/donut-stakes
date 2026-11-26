// Limbo: pick a target multiplier; the server draws a crash point.
// P(result >= target) = RTP / target, so every target has the same 99% RTP.
const { instantGame, RTP, AppError } = require('./core');

const MAX = 1_000_000;

module.exports = instantGame({
  id: 'limbo',
  name: 'Limbo',
  description: 'Name a multiplier. Will the donut fly that high?',
  order: 5,
  info: { min: 1.01, max: MAX, rtp: RTP },
  validate(body) {
    const target = Math.floor(Number(body.target) * 100 + 1e-7) / 100;
    if (!Number.isFinite(target) || target < 1.01 || target > MAX) throw new AppError(`Target must be between 1.01x and ${MAX}x`, 'bad_params');
    return { target };
  },
  play({ target }, rng) {
    const u = rng.float();
    let result = Math.floor((100 * RTP) / (1 - u)) / 100;
    result = Math.min(Math.max(result, 1), MAX);
    const win = result >= target;
    return {
      multiplier: win ? target : 0,
      summary: `${result.toFixed(2)}x (target ${target.toFixed(2)}x)`,
      result: { result, target, win, chance: RTP / target },
    };
  },
});

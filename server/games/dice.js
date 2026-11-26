// Roll 0.00-99.99. "under T" wins if roll < T, "over T" wins if roll > T.
const { instantGame, RTP, AppError, round4 } = require('./core');

function chanceOf(target, dir) {
  const t = Math.round(target * 100);
  return dir === 'under' ? t / 10000 : (9999 - t) / 10000;
}

module.exports = instantGame({
  id: 'dice',
  name: 'Dice',
  description: 'Set your odds, roll over or under.',
  order: 4,
  info: { rtp: RTP, minChance: 0.01, maxChance: 0.98 },
  validate(body) {
    const dir = body.direction === 'over' ? 'over' : body.direction === 'under' ? 'under' : null;
    const target = Math.round(Number(body.target) * 100) / 100;
    if (!dir) throw new AppError('Direction must be over or under', 'bad_params');
    if (!Number.isFinite(target) || target < 0.01 || target > 99.98) throw new AppError('Target must be between 0.01 and 99.98', 'bad_params');
    const chance = chanceOf(target, dir);
    if (chance < 0.01 || chance > 0.98) throw new AppError('Win chance must be between 1% and 98%', 'bad_params');
    return { dir, target, chance };
  },
  play({ dir, target, chance }, rng) {
    const roll = rng.int(0, 10000) / 100;
    const win = dir === 'under' ? roll < target : roll > target;
    const mult = round4(RTP / chance);
    return {
      multiplier: win ? mult : 0,
      summary: `${roll.toFixed(2)} (${dir} ${target.toFixed(2)})`,
      result: { roll, target, direction: dir, chance, win, payoutMultiplier: mult },
    };
  },
});

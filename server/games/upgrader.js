// Upgrader (simplified, donuts only): risk a stake of donuts to "upgrade" it into a
// bigger box worth stake x target. The dial lands at a random point; the green arc is
// RTP / target of the circle. There are no item skins: boxes are just donut amounts.
const { instantGame, RTP, AppError } = require('./core');

const BOXES = [
  { name: 'Snack Box', multiplier: 1.5 }, { name: 'Half Dozen', multiplier: 2 }, { name: 'Dozen Box', multiplier: 5 },
  { name: 'Bakery Crate', multiplier: 10 }, { name: 'Golden Tin', multiplier: 25 }, { name: 'Donut Vault', multiplier: 100 },
];

module.exports = instantGame({
  id: 'upgrader',
  name: 'Upgrader',
  description: 'Risk your donuts for a bigger box.',
  order: 18,
  info: { boxes: BOXES, min: 1.1, max: 100, rtp: RTP, simplified: 'Donut amounts only, no items.' },
  validate(body) {
    const target = Math.floor(Number(body.target) * 100 + 1e-7) / 100;
    if (!Number.isFinite(target) || target < 1.1 || target > 100) throw new AppError('Upgrade target must be 1.1x-100x', 'bad_params');
    return { target, chance: RTP / target };
  },
  play({ target, chance }, rng) {
    const roll = rng.float();
    const win = roll < chance;
    return { multiplier: win ? target : 0, summary: `${target.toFixed(2)}x upgrade ${win ? 'hit' : 'missed'}`, result: { roll, chance, target, win } };
  },
});

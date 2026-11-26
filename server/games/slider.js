// Slider: choose a target zone on a 0-100 track. When you hit Stop, the server
// draws where the slider stops (0.00-99.99). Win if it stops inside the zone.
// Multiplier = RTP / zone width.
const { instantGame, RTP, AppError, round4 } = require('./core');

module.exports = instantGame({
  id: 'slider',
  name: 'Slider',
  description: 'Set a target zone, then stop the slider inside it.',
  order: 15,
  info: { minWidth: 1, maxWidth: 95, rtp: RTP },
  validate(body) {
    const from = Math.round(Number(body.from) * 100) / 100;
    const to = Math.round(Number(body.to) * 100) / 100;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > 100 || to <= from) throw new AppError('Zone must be inside 0-100', 'bad_params');
    const width = Math.round((to - from) * 100) / 100;
    if (width < 1 || width > 95) throw new AppError('Zone width must be 1-95', 'bad_params');
    return { from, to, width };
  },
  play({ from, to, width }, rng) {
    const stop = rng.int(0, 10000) / 100;
    const win = stop >= from && stop < to;
    const mult = round4(RTP / (width / 100));
    return { multiplier: win ? mult : 0, summary: `${stop.toFixed(2)} in ${from}-${to}`, result: { stop, from, to, win, payoutMultiplier: mult } };
  },
});

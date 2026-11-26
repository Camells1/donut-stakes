const { instantGame, RTP, AppError, round4 } = require('./core');

const SIDES = { heads: 'Frosted', tails: 'Chocolate' };
const MULT = round4(2 * RTP);

module.exports = instantGame({
  id: 'coinflip',
  name: 'Coin Flip',
  description: 'Frosted or Chocolate. Call it and double up.',
  order: 3,
  info: { multiplier: MULT, sides: SIDES },
  validate(body) {
    const side = String(body.side || '').toLowerCase();
    if (!SIDES[side]) throw new AppError('Pick heads (Frosted) or tails (Chocolate)', 'bad_params');
    return { side };
  },
  play({ side }, rng) {
    const outcome = rng.bit() ? 'heads' : 'tails';
    const win = outcome === side;
    return {
      multiplier: win ? MULT : 0,
      summary: `${SIDES[side]} -> ${SIDES[outcome]}`,
      result: { side, outcome, win },
    };
  },
});

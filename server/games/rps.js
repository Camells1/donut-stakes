// Rock Paper Scissors vs the house. Win pays 1.97x, a draw returns the stake.
// EV = 1/3 * 1.97 + 1/3 * 1 = 0.99.
const { instantGame, RTP, AppError, round4 } = require('./core');

const HANDS = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const MULT = round4(3 * RTP - 1);

module.exports = instantGame({
  id: 'rps',
  name: 'Rock Paper Scissors',
  description: 'Rock, paper, scissors against the house.',
  order: 16,
  info: { multiplier: MULT, hands: HANDS },
  validate(body) {
    const hand = String(body.hand || '').toLowerCase();
    if (!HANDS.includes(hand)) throw new AppError('Pick rock, paper or scissors', 'bad_params');
    return { hand };
  },
  play({ hand }, rng) {
    const house = HANDS[rng.int(0, 3)];
    const outcome = hand === house ? 'draw' : BEATS[hand] === house ? 'win' : 'lose';
    return { multiplier: outcome === 'win' ? MULT : outcome === 'draw' ? 1 : 0, summary: `${hand} vs ${house}`, result: { hand, house, outcome } };
  },
});

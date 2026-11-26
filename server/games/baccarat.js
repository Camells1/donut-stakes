// Baccarat (Punto Banco rules, infinite deck). Bet on Player, Banker and/or Tie.
// Exact outcome odds are computed at start-up and every bet is priced to 99% RTP
// (Player/Banker push on a tie). Standard tables pay 1:1 / 0.95:1 / 8:1 instead.
const config = require('../../config');
const { RTP, AppError, parseBet, takeBet, finishBet, publicBet, payoutFor, rng } = require('./core');

const VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const PV = VALS.map((v) => (v === 0 ? 4 / 13 : 1 / 13));
const val = (c) => (c.r >= 10 ? 0 : c.r);
const tot = (cards) => cards.reduce((a, c) => a + val(c), 0) % 10;

function bankerDraws(b, p3) {
  if (p3 === null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}

// Exact probabilities by enumerating card values.
const P = { player: 0, banker: 0, tie: 0 };
function add(p, b, pr) { if (p > b) P.player += pr; else if (b > p) P.banker += pr; else P.tie += pr; }
for (let a = 0; a < 10; a++) for (let c = 0; c < 10; c++) for (let d = 0; d < 10; d++) for (let e = 0; e < 10; e++) {
  const pr = PV[a] * PV[c] * PV[d] * PV[e];
  const p = (a + c) % 10, b = (d + e) % 10;
  if (p >= 8 || b >= 8) { add(p, b, pr); continue; }
  if (p <= 5) {
    for (let f = 0; f < 10; f++) {
      const p2 = (p + f) % 10;
      if (bankerDraws(b, f)) for (let g = 0; g < 10; g++) add(p2, (b + g) % 10, pr * PV[f] * PV[g]);
      else add(p2, b, pr * PV[f]);
    }
  } else if (bankerDraws(b, null)) for (let g = 0; g < 10; g++) add(p, (b + g) % 10, pr * PV[g]);
  else add(p, b, pr);
}
const f4 = (x) => Math.floor(x * 10000) / 10000;
const MULT = { player: f4((RTP - P.tie) / P.player), banker: f4((RTP - P.tie) / P.banker), tie: f4(RTP / P.tie) };

const draw = () => ({ r: rng.int(1, 14), s: rng.int(0, 4) });

module.exports = {
  id: 'baccarat',
  name: 'Baccarat',
  description: 'Player, Banker or Tie. Closest to 9 wins.',
  order: 17,
  info: { odds: P, multipliers: MULT, rtp: RTP },
  actions: {
    play(ctx) {
      const b = (ctx.body && ctx.body.bets) || {};
      const bets = {};
      for (const k of ['player', 'banker', 'tie']) if (b[k] !== undefined && b[k] !== null && Number(b[k]) > 0) bets[k] = parseBet(b[k]);
      if (!Object.keys(bets).length) throw new AppError('Bet on Player, Banker or Tie', 'bad_params');
      const total = Object.values(bets).reduce((x, y) => x + y, 0);
      if (total > config.maxBet) throw new AppError(`Total stake is above the max bet of ${config.maxBet}`, 'bad_bet');
      const betTx = takeBet(ctx.user, 'baccarat', total, { bets });
      const player = [draw(), draw()], banker = [draw(), draw()];
      let p = tot(player), bk = tot(banker), p3 = null;
      if (p < 8 && bk < 8) {
        if (p <= 5) { const c = draw(); player.push(c); p3 = val(c); p = tot(player); }
        if (bankerDraws(bk, p3)) { banker.push(draw()); bk = tot(banker); }
      }
      const winner = p > bk ? 'player' : bk > p ? 'banker' : 'tie';
      let payout = 0;
      for (const [k, amt] of Object.entries(bets)) {
        if (k === winner) payout += payoutFor(amt, MULT[k]);
        else if (winner === 'tie' && k !== 'tie') payout += amt;   // push
      }
      const rec = finishBet(ctx.user, 'baccarat', total, 0, `${winner} wins ${p}-${bk}`, { player, banker, playerTotal: p, bankerTotal: bk, winner, bets }, betTx.id, payout);
      return { result: { player, banker, playerTotal: p, bankerTotal: bk, winner }, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: ctx.user.balance };
    },
  },
};

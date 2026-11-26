// Towers: climb rows; each row has some burnt tiles. Pick a safe one to go up,
// cash out any time. Multiplier after k rows = RTP * (tiles/safe)^k.
const { RTP, AppError, parseBet, takeBet, finishBet, publicBet, payoutFor, round4, rounds, rng } = require('./core');

const ID = 'towers';
const ROWS = 8;
const LEVELS = {
  easy: { tiles: 4, bad: 1 },
  medium: { tiles: 3, bad: 1 },
  hard: { tiles: 2, bad: 1 },
  expert: { tiles: 3, bad: 2 },
  master: { tiles: 4, bad: 3 },
};
const multAt = (lv, k) => (k ? round4(RTP * Math.pow(lv.tiles / (lv.tiles - lv.bad), k)) : 0);

function view(st, reveal) {
  const lv = LEVELS[st.level];
  return {
    active: !reveal, bet: st.bet, level: st.level, tiles: lv.tiles, rows: ROWS, picks: st.picks, row: st.picks.length,
    multiplier: multAt(lv, st.picks.length), nextMultiplier: st.picks.length < ROWS ? multAt(lv, st.picks.length + 1) : null,
    cashout: st.picks.length ? payoutFor(st.bet, multAt(lv, st.picks.length)) : 0,
    board: reveal ? st.board : undefined,
  };
}
function end(user, st, win, extra = {}) {
  rounds.clear(ID, user);
  const m = win ? multAt(LEVELS[st.level], st.picks.length) : 0;
  const rec = finishBet(user, ID, st.bet, m, `${st.level}: ${win ? 'cashed at row ' + st.picks.length : 'fell at row ' + (st.picks.length + 1)}`,
    { level: st.level, picks: st.picks, board: st.board }, st.betTxId);
  return { ...view(st, true), ...extra, done: true, win, multiplier: rec.multiplier, payout: rec.payout, profit: rec.profit, bet: publicBet(rec), balance: user.balance };
}
function need(user) { const st = rounds.get(ID, user); if (!st) throw new AppError('No active Towers round', 'no_round', 409); return st; }

module.exports = {
  id: ID,
  name: 'Towers',
  description: 'Climb the donut tower. One wrong tile and you drop.',
  order: 12,
  info: { rows: ROWS, levels: LEVELS, rtp: RTP },
  actions: {
    state(ctx) { const st = rounds.get(ID, ctx.user); return { game: st ? view(st) : null, balance: ctx.user.balance }; },
    start(ctx) {
      if (rounds.get(ID, ctx.user)) throw new AppError('Finish your current tower first', 'round_active', 409);
      const level = String(ctx.body && ctx.body.level);
      const lv = LEVELS[level];
      if (!lv) throw new AppError('Pick a difficulty', 'bad_params');
      const bet = parseBet(ctx.body.bet);
      const betTx = takeBet(ctx.user, ID, bet, { level });
      // board[row] = list of bad tile indexes
      const board = Array.from({ length: ROWS }, () => rng.sample(lv.tiles, lv.bad).sort());
      const st = { bet, level, board, picks: [], betTxId: betTx.id };
      rounds.set(ID, ctx.user, st);
      return { game: view(st), balance: ctx.user.balance };
    },
    pick(ctx) {
      const st = need(ctx.user);
      const lv = LEVELS[st.level];
      const tile = Number(ctx.body && ctx.body.tile);
      if (!Number.isInteger(tile) || tile < 0 || tile >= lv.tiles) throw new AppError('Bad tile', 'bad_params');
      const row = st.picks.length;
      st.picks.push(tile);
      if (st.board[row].includes(tile)) { st.picks.pop(); return end(ctx.user, st, false, { hit: { row, tile } }); }
      if (st.picks.length === ROWS) return end(ctx.user, st, true, { top: true });
      rounds.set(ID, ctx.user, st);
      return { game: view(st), balance: ctx.user.balance };
    },
    cashout(ctx) {
      const st = need(ctx.user);
      if (!st.picks.length) throw new AppError('Climb at least one row first', 'bad_params');
      return end(ctx.user, st, true);
    },
  },
};

// Mines: stateful. start (stake taken) -> reveal tiles -> cashout, or hit a mine and lose.
// Mine positions live only on the server until the round ends.
const store = require('../store');
const { RTP, AppError, parseBet, takeBet, finishBet, assertCanBet, publicBet, round4, payoutFor, rng } = require('./core');

const SIZES = [3, 4, 5, 6, 7, 8];

function multiplierFor(tiles, mines, safeRevealed) {
  let m = RTP;
  for (let i = 0; i < safeRevealed; i++) m *= (tiles - i) / (tiles - mines - i);
  return round4(m);
}

const key = (userId) => `mines:${userId}`;

function view(st, withMines = false) {
  const tiles = st.size * st.size;
  const next = st.revealed.length < tiles - st.mineCount ? multiplierFor(tiles, st.mineCount, st.revealed.length + 1) : null;
  const mult = multiplierFor(tiles, st.mineCount, st.revealed.length);
  return {
    active: !withMines, size: st.size, mineCount: st.mineCount, bet: st.bet, revealed: st.revealed,
    multiplier: st.revealed.length ? mult : 0, nextMultiplier: next,
    cashout: st.revealed.length ? payoutFor(st.bet, mult) : 0,
    mines: withMines ? st.mines : undefined,
  };
}

function getActive(user) {
  if (!user) throw new AppError('Log in to play', 'auth_required', 401);
  return store.db.active[key(user.id)] || null;
}

function end(user, st, multiplier, summary, extra) {
  delete store.db.active[key(user.id)];
  const rec = finishBet(user, 'mines', st.bet, multiplier, summary,
    { size: st.size, mineCount: st.mineCount, revealed: st.revealed, mines: st.mines, ...extra }, st.betTxId);
  return { ...view(st, true), ...extra, payout: rec.payout, profit: rec.profit, multiplier: rec.multiplier, bet: publicBet(rec), balance: user.balance, done: true };
}

module.exports = {
  id: 'mines',
  name: 'Mines',
  description: 'Find the donuts, dodge the burnt ones. Cash out any time.',
  order: 2,
  info: { sizes: SIZES, defaultSize: 5, rtp: RTP },
  actions: {
    state(ctx) {
      const st = getActive(ctx.user);
      return { game: st ? view(st) : null, balance: ctx.user.balance };
    },
    start(ctx) {
      const b = ctx.body || {};
      if (getActive(ctx.user)) throw new AppError('Finish your current Mines round first', 'round_active', 409);
      const size = Number(b.size);
      if (!SIZES.includes(size)) throw new AppError(`Grid size must be one of ${SIZES.join(', ')}`, 'bad_params');
      const tiles = size * size;
      const mineCount = Number(b.mines);
      if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > tiles - 1) throw new AppError(`Mines must be 1-${tiles - 1}`, 'bad_params');
      const bet = parseBet(b.bet);
      assertCanBet(ctx.user);
      const betTx = takeBet(ctx.user, 'mines', bet, { size, mineCount });
      const st = { size, mineCount, bet, betTxId: betTx.id, mines: rng.sample(tiles, mineCount).sort((x, y) => x - y), revealed: [], startedAt: Date.now() };
      store.db.active[key(ctx.user.id)] = st;
      store.save();
      return { game: view(st), balance: ctx.user.balance };
    },
    reveal(ctx) {
      const st = getActive(ctx.user);
      if (!st) throw new AppError('No active Mines round', 'no_round', 409);
      const tiles = st.size * st.size;
      const tile = Number(ctx.body && ctx.body.tile);
      if (!Number.isInteger(tile) || tile < 0 || tile >= tiles) throw new AppError('Bad tile', 'bad_params');
      if (st.revealed.includes(tile)) throw new AppError('Tile already revealed', 'bad_params');
      if (st.mines.includes(tile)) {
        return end(ctx.user, st, 0, `${st.size}x${st.size}, ${st.mineCount} mines: boom after ${st.revealed.length}`, { hit: tile, win: false });
      }
      st.revealed.push(tile);
      store.save();
      if (st.revealed.length === tiles - st.mineCount) {
        const m = multiplierFor(tiles, st.mineCount, st.revealed.length);
        return end(ctx.user, st, m, `${st.size}x${st.size}, ${st.mineCount} mines: cleared board`, { win: true, auto: true });
      }
      return { game: view(st), safe: tile, balance: ctx.user.balance };
    },
    cashout(ctx) {
      const st = getActive(ctx.user);
      if (!st) throw new AppError('No active Mines round', 'no_round', 409);
      if (!st.revealed.length) throw new AppError('Reveal at least one tile before cashing out', 'bad_params');
      const m = multiplierFor(st.size * st.size, st.mineCount, st.revealed.length);
      return end(ctx.user, st, m, `${st.size}x${st.size}, ${st.mineCount} mines: cashed ${st.revealed.length}`, { win: true });
    },
  },
};

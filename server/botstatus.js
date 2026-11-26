// The in-game bot's public name and on/off switch, stored in the data file.
// - Anyone can read the name and status (GET /api/public/bot).
// - The owner changes them on /admin (POST /api/admin/bot, ADMIN_SECRET).
// - The bot mod polls GET /api/bot/status (BOT_SECRET). When enabled is false the mod
//   stops reporting payments and turns Bot Mode off. Payments it already reported are
//   still processed, so a player who paid is never lost.
const config = require('../config');
const store = require('./store');
const { AppError } = require('./ledger');

const NAME_RE = /^\.?[A-Za-z0-9_]{3,16}$/;

function state() {
  const d = store.db;
  if (!d.botStatus) d.botStatus = { username: config.activeBot(), enabled: true, updatedAt: Date.now() };
  return d.botStatus;
}
// The name players should pay right now.
const name = () => state().username || config.activeBot();
const enabled = () => state().enabled !== false;

function update(body) {
  const s = state();
  const b = body || {};
  if (b.username !== undefined) {
    const u = String(b.username).trim();
    if (!NAME_RE.test(u)) throw new AppError('Bot username must be a Minecraft name (3-16 letters, digits or _, optional leading dot)', 'bad_username');
    s.username = u;
  }
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') throw new AppError('enabled must be true or false', 'bad_params');
    s.enabled = b.enabled;
  }
  s.updatedAt = Date.now();
  store.save();
  return publicView();
}

const publicView = () => ({ username: name(), enabled: enabled(), updatedAt: state().updatedAt });

module.exports = { name, enabled, update, publicView, state };

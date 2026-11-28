// Anonymous overall leaderboard. Ranks players by total donuts wagered.
// Nothing identifying is returned: no usernames, no user ids. Each player gets a stable
// random-looking tag derived from an HMAC of their id, so the same player keeps the same
// tag, but the tag cannot be reversed to a name or id.
const crypto = require('crypto');
const store = require('./store');

const SALT = process.env.LEADERBOARD_SALT || crypto.randomBytes(16).toString('hex');
const SIZE_DEFAULT = 25;
const SIZE_MAX = 100;

function tagFor(userId) {
  const hex = crypto.createHmac('sha256', SALT).update(String(userId)).digest('hex');
  return `Anon ${hex.slice(0, 6).toUpperCase()}`;
}

function top(limit = SIZE_DEFAULT) {
  const n = Math.min(SIZE_MAX, Math.max(1, Number(limit) || SIZE_DEFAULT));
  const rows = Object.values(store.db.users)
    .filter((u) => u && u.stats && u.stats.wagered > 0)
    .map((u) => ({ id: u.id, wagered: u.stats.wagered, won: u.stats.won }))
    .sort((a, b) => b.wagered - a.wagered)
    .slice(0, n);
  return rows.map((r, i) => ({
    rank: i + 1,
    tag: tagFor(r.id),
    wagered: Math.round(r.wagered * 100) / 100,
    profit: Math.round((r.won - r.wagered) * 100) / 100,
  }));
}

module.exports = { top, tagFor };

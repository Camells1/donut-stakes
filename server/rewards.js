// Rewards (daily bonus, VIP tiers, rakeback) and affiliates (referral codes + commission).
// Every credit goes through the ledger with a reason. Defaults live in config.js.
//
// Commission: when a referred player places a bet, the referrer accrues
//   bet x houseEdge x commissionRate
// (rewards are not bets, so a referred player's own bonuses never earn commission).
// Accrued commission is NOT credited automatically: the owner creates a review batch and
// approves (or rejects) each payout via /api/admin with ADMIN_SECRET. Approval credits once.
const crypto = require('crypto');
const config = require('../config');
const store = require('./store');
const { applyTx, AppError, onTx, ingameName } = require('./ledger');
const { isExcluded } = require('./games/core');

const HOUR = 3600000, DAY = 24 * HOUR;
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function db() {
  const d = store.db;
  if (!d.affiliates) d.affiliates = {};     // referrerId -> { accrued, lifetime }
  if (!d.commissionPayouts) d.commissionPayouts = {};
  if (!d.seq.cpay) d.seq.cpay = 0;
  return d;
}
function rw(u) {
  if (!u.rewards) u.rewards = { lastDaily: 0, rakebackBase: u.stats.wagered - u.stats.won, rakebackClaimed: 0, bonusClaimed: 0 };
  return u.rewards;
}

// ---------- VIP / daily / rakeback ----------
function tierIndex(u) {
  const t = config.rewards.vipTiers;
  let i = 0;
  for (let k = 0; k < t.length; k++) if (u.stats.wagered >= t[k].minWagered) i = k;
  return i;
}
function rakebackAvailable(u) {
  const r = rw(u);
  const netLoss = u.stats.wagered - u.stats.won;
  const tier = config.rewards.vipTiers[tierIndex(u)];
  return { amount: Math.max(0, Math.floor((netLoss - r.rakebackBase) * tier.rakeback)), lossSince: Math.max(0, netLoss - r.rakebackBase), rate: tier.rakeback };
}
function canClaim(u) {
  if (!u.verified) throw new AppError('Verify your account to claim rewards', 'unverified', 403);
  if (isExcluded(u)) throw new AppError('Rewards are paused while you are self-excluded', 'self_excluded', 403);
}
function status(u) {
  const r = rw(u);
  const tiers = config.rewards.vipTiers;
  const i = tierIndex(u);
  const next = tiers[i + 1] || null;
  const nextDaily = r.lastDaily + config.rewards.dailyCooldownHours * HOUR;
  return {
    tier: { index: i, ...tiers[i] }, next: next && { ...next, remaining: next.minWagered - u.stats.wagered },
    wagered: u.stats.wagered, tiers,
    daily: { amount: tiers[i].dailyBonus, available: Date.now() >= nextDaily, nextAt: Math.max(Date.now(), nextDaily) },
    rakeback: rakebackAvailable(u),
    claimed: { bonus: r.bonusClaimed, rakeback: r.rakebackClaimed },
  };
}
function claimDaily(u) {
  canClaim(u);
  const r = rw(u);
  const now = Date.now();
  if (now < r.lastDaily + config.rewards.dailyCooldownHours * HOUR) throw new AppError('Daily bonus already claimed. Come back later.', 'cooldown', 409);
  const tier = config.rewards.vipTiers[tierIndex(u)];
  r.lastDaily = now;
  const tx = applyTx(u.id, tier.dailyBonus, 'bonus', { reason: 'daily', tier: tier.name });
  r.bonusClaimed += tier.dailyBonus;
  return { credited: tier.dailyBonus, txId: tx.id };
}
function claimRakeback(u) {
  canClaim(u);
  const av = rakebackAvailable(u);
  if (av.amount < 1) throw new AppError('No rakeback to claim yet', 'nothing', 409);
  const r = rw(u);
  const tier = config.rewards.vipTiers[tierIndex(u)];
  const tx = applyTx(u.id, av.amount, 'rakeback', { reason: 'rakeback', tier: tier.name, rate: tier.rakeback, lossSince: av.lossSince });
  r.rakebackBase = u.stats.wagered - u.stats.won;
  r.rakebackClaimed += av.amount;
  return { credited: av.amount, rate: tier.rakeback, tier: tier.name, txId: tx.id };
}

// ---------- affiliates ----------
const ipHash = (ip) => crypto.createHash('sha256').update('dc-ip:' + String(ip)).digest('hex').slice(0, 24);
const loopback = (ip) => !ip || ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
function noteIp(u, ip) {
  if (loopback(ip)) return;
  const h = ipHash(ip);
  u.ips = u.ips || [];
  if (!u.ips.includes(h)) { u.ips.push(h); if (u.ips.length > 10) u.ips.shift(); store.save(); }
}
function refCodeOf(u) {
  if (!u.verified && !u.refCode) return null;
  if (!u.refCode) {
    const used = new Set(Object.values(store.db.users).map((x) => x.refCode).filter(Boolean));
    let c;
    do { c = Array.from({ length: 7 }, () => CODE_ALPHA[crypto.randomInt(0, CODE_ALPHA.length)]).join(''); } while (used.has(c));
    u.refCode = c; store.save();
  }
  return u.refCode;
}
function referrerByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const ref = Object.values(store.db.users).find((u) => u.refCode === c);
  if (!ref || !ref.verified) throw new AppError('That referral code does not exist', 'bad_referral', 400);
  return ref;
}
function assertNotSelf(ref, username, ip, user) {
  if (user && ref.id === user.id) throw new AppError('You cannot use your own referral code', 'self_referral', 400);
  if (ref.username.toLowerCase() === String(username).toLowerCase()) throw new AppError('You cannot use your own referral code', 'self_referral', 400);
  if (!loopback(ip) && (ref.ips || []).includes(ipHash(ip))) throw new AppError('Referral blocked: this looks like the same player as the referrer', 'self_referral', 400);
  if (user && ref.referredBy === user.id) throw new AppError('Referral loops are not allowed', 'self_referral', 400);
}

const signupHooks = {
  check(username, req) {
    const ref = referrerByCode(req.body && req.body.referralCode);
    if (ref) assertNotSelf(ref, username, req.ip, null);
  },
  after(user, req) {
    const ref = referrerByCode(req.body && req.body.referralCode);
    if (ref) { user.referredBy = ref.id; user.referredAt = Date.now(); }
    rw(user);
    noteIp(user, req.ip);
  },
};

function applyCode(u, code, ip) {
  if (u.referredBy) throw new AppError('You already have a referrer', 'already_referred', 409);
  if (Date.now() - u.createdAt > config.affiliates.applyWindowDays * DAY) throw new AppError(`Referral codes can only be added in your first ${config.affiliates.applyWindowDays} days`, 'too_late', 409);
  const ref = referrerByCode(code);
  if (!ref) throw new AppError('Enter a referral code', 'bad_referral', 400);
  assertNotSelf(ref, u.username, ip, u);
  u.referredBy = ref.id; u.referredAt = Date.now(); store.save();
  return { referrer: ingameName(ref) };
}

// Accrue commission on bets only.
onTx((tx, u) => {
  if (tx.type !== 'bet' || !u.referredBy) return;
  const d = db();
  const a = d.affiliates[u.referredBy] || (d.affiliates[u.referredBy] = { accrued: 0, lifetimeAccrued: 0, approved: 0, rejected: 0 });
  const c = -tx.delta * config.houseEdge * config.affiliates.commissionRate;
  a.accrued += c; a.lifetimeAccrued += c;
});

function affiliateStatus(u) {
  const d = db();
  const a = d.affiliates[u.id] || { accrued: 0, lifetimeAccrued: 0, approved: 0, rejected: 0 };
  const referred = Object.values(store.db.users).filter((x) => x.referredBy === u.id);
  const inReview = Object.values(d.commissionPayouts).filter((p) => p.referrerId === u.id && p.status === 'review').reduce((s, p) => s + p.amount, 0);
  return {
    code: refCodeOf(u), rate: config.affiliates.commissionRate, referredCount: referred.length,
    referredWagered: referred.reduce((s, x) => s + x.stats.wagered, 0),
    earnings: { accrued: Math.floor(a.accrued * 100) / 100, inReview, approved: a.approved },
    referredBy: u.referredBy ? ingameName(store.db.users[u.referredBy]) : null,
    canApply: !u.referredBy && Date.now() - u.createdAt <= config.affiliates.applyWindowDays * DAY,
  };
}

// ---------- owner admin API (ADMIN_SECRET) ----------
const admin = require('./admin').router;
admin.get('/commissions', (req, res) => {
  const d = db();
  res.json({ ok: true, rate: config.affiliates.commissionRate,
    referrers: Object.entries(d.affiliates).map(([id, a]) => ({ referrerId: Number(id), name: store.db.users[id] ? ingameName(store.db.users[id]) : '?', ...a, referredCount: Object.values(store.db.users).filter((x) => x.referredBy === Number(id)).length })),
    payouts: Object.values(d.commissionPayouts).sort((a, b) => b.id - a.id).slice(0, 200) });
});
// Move whole donuts of accrued commission into payout records awaiting review.
admin.post('/commissions/review', (req, res) => {
  const d = db();
  const created = [];
  for (const [id, a] of Object.entries(d.affiliates)) {
    const whole = Math.floor(a.accrued);
    if (whole < 1 || !store.db.users[id]) continue;
    a.accrued -= whole;
    const p = { id: ++d.seq.cpay, referrerId: Number(id), name: ingameName(store.db.users[id]), amount: whole, status: 'review', createdAt: Date.now() };
    d.commissionPayouts[p.id] = p;
    created.push(p);
  }
  store.save();
  res.json({ ok: true, created });
});
function payout(id) {
  const p = db().commissionPayouts[id];
  if (!p) throw new AppError('Payout not found', 'not_found', 404);
  if (p.status !== 'review') throw new AppError(`Payout already ${p.status}`, 'bad_state', 409);
  return p;
}
admin.post('/commissions/:id/approve', (req, res) => {
  const p = payout(req.params.id);
  const tx = applyTx(p.referrerId, p.amount, 'commission', { reason: 'affiliate commission', payoutId: p.id });
  p.status = 'approved'; p.approvedAt = Date.now(); p.txId = tx.id;
  db().affiliates[p.referrerId].approved += p.amount;
  store.save();
  res.json({ ok: true, payout: p });
});
admin.post('/commissions/:id/reject', (req, res) => {
  const p = payout(req.params.id);
  p.status = 'rejected'; p.rejectedAt = Date.now(); p.reason = (req.body && req.body.reason) || null;
  db().affiliates[p.referrerId].rejected += p.amount;
  store.save();
  res.json({ ok: true, payout: p });
});

module.exports = { status, claimDaily, claimRakeback, tierIndex, signupHooks, applyCode, affiliateStatus, noteIp, admin };

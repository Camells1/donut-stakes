// End-to-end smoke test. Starts its own server on a spare port with a throwaway data
// folder, then exercises accounts, payment verification, deposits, every game, tampered
// requests, rewards, affiliates and the ledger. Prints only failures and a summary.
// Usage: npm test
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PORT = 5399;
const BASE = `http://localhost:${PORT}`;
const DATA = path.join(ROOT, 'data-test');
const SECRET = crypto.randomBytes(16).toString('hex');
const ADMIN = crypto.randomBytes(16).toString('hex');
const SITE = require('../config').siteName;
let pass = 0, fail = 0, txn = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } };

class Client {
  constructor() { this.cookie = ''; this.cookies = []; }
  async req(p, body, headers = {}, method) {
    const res = await fetch(BASE + p, {
      method: method || (body !== undefined ? 'POST' : 'GET'),
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) { this.cookies.push(sc); const m = sc.match(/dc_session=([^;]*)/); if (m) this.cookie = m[1] ? `dc_session=${m[1]}` : ''; }
    const type = res.headers.get('content-type') || '';
    return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
  }
  me() { return this.req('/api/me').then((r) => r.data); }
}
const anon = new Client();
const pay = (payer_ign, amount, transaction_id = `t${++txn}`, secret = SECRET) =>
  anon.req('/api/bot/payment', { payer_ign, amount, transaction_id }, { 'X-Bot-Secret': secret });
const bot = (p, body) => anon.req('/api/bot' + p, body, { 'X-Bot-Secret': SECRET });
const admin = (p, body, secret = ADMIN) => anon.req('/api/admin' + p, body, { 'X-Admin-Secret': secret });

// Sign up + verify by payment. Returns the client.
async function player(name, extra = {}) {
  const c = new Client();
  const r = await c.req('/api/auth/signup', { username: name, ...extra });
  if (r.status !== 200) throw new Error(`signup ${name}: ${JSON.stringify(r.data)}`);
  const me = await c.me();
  const v = await pay(me.user.ingameName, me.user.verify.amount);
  if (v.status !== 200) throw new Error(`verify ${name}: ${JSON.stringify(v.data)}`);
  return c;
}
async function fund(c, amount) {
  const d = await c.req('/api/deposits', { amount });
  const me = await c.me();
  await pay(me.user.ingameName, d.data.deposit.amount);
  return d.data.deposit.amount;
}
const bal = async (c) => (await c.me()).user.balance;

async function waitUp() {
  for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/api/config'); return; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  throw new Error('server did not start');
}

// ---------- in-process checks (RTP + deposit expiry) ----------
function unitChecks() {
  const rng = require('../server/rng');
  const games = require('../server/games').byId;
  const N = 150000;
  const rtp = (g, p) => { let r = 0; for (let i = 0; i < N; i++) r += g.play(p, rng).multiplier; return r / N; };
  const near = (x, want, tol, name) => ok(Math.abs(x - want) < tol, `${name} RTP ${x.toFixed(4)} not near ${want}`);
  near(rtp(games.coinflip, { side: 'heads' }), 0.99, 0.02, 'coinflip');
  near(rtp(games.dice, games.dice.validate({ target: 50, direction: 'under' })), 0.99, 0.02, 'dice');
  near(rtp(games.limbo, { target: 2 }), 0.99, 0.02, 'limbo');
  near(rtp(games.plinko, { risk: 'low', rows: 12 }), games.plinko.info.rtp.low[12], 0.03, 'plinko');
  near(rtp(games.slots, {}), games.slots.info.rtp, 0.06, 'slots');
  near(rtp(games.keno, { picks: [1, 2, 3] }), 0.99, 0.05, 'keno');
  near(rtp(games.diceduel, { dice: 2 }), 0.99, 0.02, 'dice duels');
  near(rtp(games.rps, { hand: 'rock' }), 0.99, 0.02, 'rps');
  near(rtp(games.slider, games.slider.validate({ from: 10, to: 60 })), 0.99, 0.02, 'slider');
  near(rtp(games.upgrader, games.upgrader.validate({ target: 3 })), 0.99, 0.03, 'upgrader');
  const b = games.baccarat.info;
  ok(Math.abs(b.odds.player - 0.4462) < 0.001 && Math.abs(b.odds.banker - 0.4586) < 0.001 && Math.abs(b.odds.tie - 0.0954) < 0.001, 'baccarat odds match Punto Banco');
  ok(Math.abs(b.multipliers.player * b.odds.player + b.odds.tie - 0.99) < 0.001, 'baccarat player bet priced at 99%');
  const { CASES } = require('../server/games/cases-data');
  ok(Object.values(CASES).every((c) => c.rtp > 0.985 && c.rtp <= 0.99), 'cases RTP 98.5-99%');
  const ro = games.roulette.info.payouts;
  ok(ro.red === 2.035 && ro.number === 36.63, 'roulette payouts priced at 99%');
}

function expiryCheck() {
  // Separate in-process store: a pending deposit past its expiry must never be credited.
  process.env.DATA_DIR = path.join(ROOT, 'data-test-unit');
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  const store = require('../server/store');
  store.load();
  const payments = require('../server/payments');
  const u = { id: 1, username: 'Expiry_Test', bedrock: false, verified: true, balance: 0, stats: { wagered: 0, won: 0, deposited: 0, withdrawn: 0 } };
  store.db.users[1] = u; store.db.seq.user = 1;
  const p = payments.createDeposit(u, 777);
  p.expiresAt = Date.now() - 1;
  payments.sweep();
  ok(p.status === 'expired', 'old pending deposit expires');
  const r = payments.handlePayment({ payer_ign: 'Expiry_Test', amount: 777, transaction_id: 'exp-1' });
  ok(r.status === 422 && u.balance === 0, 'expired deposit amount is not credited');
  store.flush();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  const srv = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, env: { ...process.env, PORT, DATA_DIR: DATA, BOT_SECRET: SECRET, ADMIN_SECRET: ADMIN, RELAX_RATE_LIMITS: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serr = '';
  srv.stderr.on('data', (d) => (serr += d));
  try {
    await waitUp();
    const gameIds = (await anon.req('/api/games')).data.games.map((g) => g.id);
    ok(gameIds.length === 20, `20 games registered (${gameIds.length})`);

    // ---- static pages ----
    for (const p of ['/', '/account', '/deposit', '/rewards', '/affiliates', '/terms', '/privacy', '/responsible', ...gameIds.map((g) => `/play/${g}`)]) {
      const r = await anon.req(p);
      ok(r.status === 200 && r.data.includes(SITE) && !r.data.includes('{{'), `page ${p} (${r.status})`);
    }
    for (const p of ['/css/main.css', '/css/games.css', '/js/common.js', '/js/lobby.js', '/js/account.js', '/js/deposit.js', '/js/rewards.js', '/js/affiliates.js', '/img/donut.svg', ...gameIds.map((g) => `/js/games/${g}.js`)]) {
      ok((await anon.req(p)).status === 200, `asset ${p}`);
    }
    ok((await anon.req('/play/nope')).status === 404, 'unknown game 404');
    const terms = (await anon.req('/terms')).data;
    ok(/no real-money value/.test(terms) && /cannot be cashed out/.test(terms) && /TEMPLATE/.test(terms) && /Bets are final/.test(terms), 'terms content');

    // ---- sign-up ----
    const a = new Client();
    ok((await a.req('/api/auth/signup', { username: 'ab' })).status === 400, 'short username rejected');
    ok((await a.req('/api/auth/signup', { username: 'bad name!' })).status === 400, 'bad chars rejected');
    ok((await a.req('/api/auth/signup', { username: 'Test_Player1' })).status === 200 && a.cookie, 'signup');
    ok((await new Client().req('/api/auth/signup', { username: 'test_player1' })).status === 409, 'duplicate username (case-insensitive)');
    let me = (await a.me()).user;
    ok(me && !me.verified && Number.isInteger(me.verify.amount) && me.verify.amount >= 1 && me.verify.amount <= 999 && me.balance === 0, 'new account unverified with a small verification number');
    ok(me.verify.bot === require('../config').activeBot(), 'verification shows the active bot');
    ok((await a.req('/api/games/coinflip/play', { bet: 1, side: 'heads' })).data.code === 'unverified', 'unverified bet blocked');
    ok((await a.req('/api/account/withdraw', { amount: 1 })).status === 403, 'unverified account cannot withdraw');
    ok((await a.req('/api/deposits', { amount: 10 })).status === 403, 'unverified account cannot create deposits');

    // ---- payment endpoint ----
    ok((await pay('Test_Player1', me.verify.amount, 'x1', 'wrong')).status === 401, 'payment with bad secret rejected');
    ok((await anon.req('/api/bot/payment', { payer_ign: 'Test_Player1', amount: me.verify.amount, transaction_id: 'x2' })).status === 401, 'payment without secret rejected');
    ok((await pay('Test_Player1', -5)).status === 400, 'negative payment amount rejected');
    ok((await pay('Test_Player1', 1.5)).status === 400, 'fractional payment amount rejected');
    ok((await anon.req('/api/bot/payment', { payer_ign: 'Test_Player1', amount: 5 }, { 'X-Bot-Secret': SECRET })).status === 400, 'payment without transaction_id rejected');
    const wrongAmt = me.verify.amount === 999 ? 998 : me.verify.amount + 1;
    let r = await pay('Test_Player1', wrongAmt, 'wrong-amt');
    ok(r.status === 422 && r.data.code === 'no_pending_amount' && r.data.refund, 'wrong amount does not verify (422, refund)');
    ok((await bal(a)) === 0 && !(await a.me()).user.verified, 'wrong amount credited nothing');
    r = await pay('Nobody_Here', 5, 'unknown-1');
    ok(r.status === 422 && r.data.code === 'unknown_player', 'unknown payer is unmatched');
    ok((await bot('/unmatched')).data.unmatched.some((u) => u.txid === 'unknown-1'), 'unmatched payments are logged');
    r = await pay('Test_Player1', me.verify.amount, 'verify-1');
    ok(r.status === 200 && r.data.actions.includes('verified') && r.data.credited === me.verify.amount, 'exact amount verifies and credits');
    r = await pay('Test_Player1', me.verify.amount, 'verify-1');
    ok(r.status === 200 && r.data.duplicate === true, 'duplicate transaction_id returns 200 duplicate');
    me = (await a.me()).user;
    ok(me.verified && me.balance === r.data.credited && !me.verify, 'duplicate payment credited only once');
    r = await pay('Test_Player1', wrongAmt, 'wrong-amt');
    ok(r.status === 422 && r.data.duplicate, 'duplicate of a rejected payment repeats the rejection');
    ok((await anon.req('/api/bot/nonexistent', {}, { 'X-Bot-Secret': SECRET })).status === 400, 'unknown bot route is not a 404');

    // ---- deposits ----
    const start = await bal(a);
    const d1 = (await a.req('/api/deposits', { amount: 5000 })).data.deposit;
    const d2 = (await a.req('/api/deposits', { amount: 5000 })).data.deposit;
    ok(d1.amount === 5000 && d2.amount === 5001 && d1.bot && d1.status === 'pending', 'deposit amounts are unique per pending record');
    ok((await pay('Test_Player1', 4999, 'dep-wrong')).status === 422 && (await bal(a)) === start, 'deposit with wrong amount not credited');
    ok((await pay('Test_Player1', 5000, 'dep-1')).status === 200 && (await bal(a)) === start + 5000, 'exact deposit amount credited');
    ok((await pay('Test_Player1', 5000, 'dep-1')).data.duplicate && (await bal(a)) === start + 5000, 'duplicate deposit transaction ignored');
    ok((await pay('Test_Player1', 5000, 'dep-again')).status === 422, 'paid deposit cannot be matched twice');
    ok((await a.req(`/api/deposits/${d2.id}/cancel`, {})).data.deposit.status === 'cancelled', 'cancel pending deposit');
    ok((await pay('Test_Player1', 5001, 'dep-cancelled')).status === 422 && (await bal(a)) === start + 5000, 'cancelled deposit amount not credited');
    await fund(a, 100000);
    let b = await bal(a);

    // ---- tampered requests (server is the only source of truth) ----
    ok((await a.req('/api/deposits', { amount: -100 })).status === 400, 'tamper: negative deposit rejected');
    ok((await a.req('/api/deposits', { amount: 'lots' })).status === 400, 'tamper: non-numeric deposit rejected');
    r = await a.req('/api/deposits', { amount: 10, credited: 999999, balance: 999999, status: 'paid' });
    ok(r.data.deposit.status === 'pending' && (await bal(a)) === b, 'tamper: forged deposit fields ignored, nothing credited');
    ok((await a.req('/api/bot/payment', { payer_ign: 'Test_Player1', amount: 10, transaction_id: 'self' }, { Origin: BASE })).status === 401, 'tamper: browser cannot call the bot payment route');
    r = await a.req('/api/games/dice/play', { bet: 10, target: 50, direction: 'under', balance: 1e12, multiplier: 1000, payout: 1e9, win: true });
    ok(r.data.ok && r.data.payout === (r.data.result.win ? Math.floor(10 * r.data.result.payoutMultiplier) : 0) && r.data.payout <= 20, 'tamper: client multiplier/payout/balance ignored');
    ok((await bal(a)) === r.data.balance, 'tamper: balance comes from the server ledger');
    ok((await a.req('/api/games/dice/play', { bet: -10, target: 50, direction: 'under' })).status === 400, 'tamper: negative bet rejected');
    ok((await a.req('/api/games/dice/play', { bet: 0, target: 50, direction: 'under' })).status === 400, 'tamper: zero bet rejected');
    ok((await a.req('/api/games/dice/play', { bet: 2.5, target: 50, direction: 'under' })).status === 400, 'tamper: fractional bet rejected');
    ok((await a.req('/api/games/dice/play', { bet: '1e3', target: 50, direction: 'under' })).status === 200, 'numeric string bet is parsed server-side');
    b = await bal(a);
    ok((await a.req('/api/games/dice/play', { bet: b + 1, target: 50, direction: 'under' })).data.code === 'insufficient_funds', 'tamper: bet above balance rejected');
    ok((await a.req('/api/games/dice/play', { bet: 2e9, target: 50, direction: 'under' })).status === 400, 'tamper: bet above max bet rejected');
    ok((await a.req('/api/games/dice/play', { bet: 10, target: 99.99, direction: 'under' })).status === 400, 'tamper: out-of-range odds rejected');
    ok((await a.req('/api/games/limbo/play', { bet: 10, target: 0.5 })).status === 400, 'tamper: limbo target below 1.01 rejected');
    ok((await a.req('/api/games/roulette/play', { bets: [{ type: 'number', value: 7, amount: -50 }] })).status === 400, 'tamper: negative roulette chip rejected');
    ok((await a.req('/api/games/roulette/play', { bets: [{ type: 'number', value: 37, amount: 5 }] })).status === 400, 'tamper: roulette number 37 rejected');
    ok((await a.req('/api/games/mines/reveal', { tile: 3 })).status === 409, 'tamper: reveal without a round rejected');
    ok((await bal(a)) === b, 'balance unchanged by rejected requests');
    ok(a.cookies.every((c) => !/balance|bal=/i.test(c)), 'balance is never stored in cookies');

    // ---- every game: one round with a consistent balance ----
    const play = async (id, action, body) => (await a.req(`/api/games/${id}/${action}`, body)).data;
    const instant = {
      plinko: { risk: 'high', rows: 16 }, coinflip: { side: 'heads' }, dice: { target: 50, direction: 'under' }, limbo: { target: 1.5 },
      slots: {}, keno: { picks: [1, 5, 9, 13, 17] }, diceduel: { dice: 2 }, slider: { from: 20, to: 70 }, rps: { hand: 'paper' },
      upgrader: { target: 2 }, cases: { caseId: 'glazed', count: 2 }, casebattle: { caseId: 'sprinkle', rounds: 2, bots: 2 },
    };
    for (const [id, params] of Object.entries(instant)) {
      b = await bal(a);
      r = await play(id, 'play', { bet: 100, ...params });
      const stake = id === 'cases' || id === 'casebattle' ? 200 : 100;
      ok(r.ok && r.balance === b - stake + r.payout && r.payout >= 0 && r.bet.game === id, `${id} bet/payout consistent`);
    }
    b = await bal(a);
    r = await play('roulette', 'play', { bets: [{ type: 'red', amount: 50 }, { type: 'number', value: 17, amount: 10 }, { type: 'dozen', value: 2, amount: 20 }] });
    ok(r.ok && r.result.number >= 0 && r.result.number <= 36 && r.balance === b - 80 + r.payout, 'roulette multi-chip spin');
    b = await bal(a);
    r = await play('baccarat', 'play', { bets: { player: 50, tie: 10 } });
    ok(r.ok && ['player', 'banker', 'tie'].includes(r.result.winner) && r.balance === b - 60 + r.payout, 'baccarat hand');
    b = await bal(a);
    r = await play('mines', 'start', { bet: 100, size: 5, mines: 3 });
    ok(r.game && r.game.mines === undefined && r.balance === b - 100, 'mines start hides mines');
    let done = null;
    for (let t = 0; t < 25 && !done; t++) { r = await play('mines', 'reveal', { tile: t }); if (r.done) done = r; else if (r.game.revealed.length === 2) done = await play('mines', 'cashout', {}); }
    ok(done && done.done && done.balance === b - 100 + done.payout, 'mines round settles');
    b = await bal(a);
    r = await play('crash', 'start', { bet: 100 });
    ok(r.game && r.game.running && r.game.crash === undefined, 'crash start hides crash point');
    r = await play('crash', 'cashout', {});
    ok(r.result && r.result.done && (r.result.win ? r.result.cashedAt <= r.result.crash : true) && r.result.balance === b - 100 + r.result.payout, 'crash cash-out settles');
    r = await play('crash', 'start', { bet: 100, autoCashout: 1.01 });
    await new Promise((res) => setTimeout(res, 400));
    r = await play('crash', 'state', {});
    ok(r.result && r.result.done && (r.result.crash >= 1.01 ? r.result.win && r.result.payout === 101 : !r.result.win), 'crash auto cash-out');
    b = await bal(a);
    r = await play('blackjack', 'start', { bet: 100 });
    if (!r.done) {
      ok(r.game.dealer.length === 1, 'blackjack hides dealer hole card');
      r = r.game.canDouble ? await play('blackjack', 'double', {}) : await play('blackjack', 'stand', {});
    }
    ok(r.done && r.balance === b - r.bet.bet + r.payout && [100, 200].includes(r.bet.bet), 'blackjack hand settles');
    b = await bal(a);
    r = await play('hilo', 'start', { bet: 100 });
    const choice = Object.entries(r.game.options).sort((x, y) => y[1].chance - x[1].chance)[0][0];
    r = await play('hilo', 'guess', { choice });
    if (!r.done) r = await play('hilo', 'cashout', {});
    ok(r.done && r.balance === b - 100 + r.payout, 'hi-lo round settles');
    b = await bal(a);
    await play('towers', 'start', { bet: 100, level: 'easy' });
    r = await play('towers', 'pick', { tile: 0 });
    if (!r.done) r = await play('towers', 'cashout', {});
    ok(r.done && r.board && r.balance === b - 100 + r.payout, 'towers round settles');
    b = await bal(a);
    await play('chicken', 'start', { bet: 100, mode: 'easy' });
    r = await play('chicken', 'step', {});
    if (!r.done) r = await play('chicken', 'cashout', {});
    ok(r.done && r.balance === b - 100 + r.payout, 'chicken round settles');

    r = await a.req('/api/history?game=dice&scope=me');
    ok(r.data.bets.length >= 2 && r.data.bets.every((x) => x.game === 'dice'), 'per-game history');

    // ---- withdrawals ----
    b = await bal(a);
    r = await a.req('/api/account/withdraw', { amount: 200 });
    ok(r.data.ok && r.data.balance === b - 200, 'withdraw request holds funds');
    const wid = r.data.withdrawal.id;
    ok((await bot('/withdrawals')).data.withdrawals.some((w) => w.id === wid && w.name === 'Test_Player1'), 'bot sees withdrawal');
    ok((await bot(`/withdrawals/${wid}/claim`, {})).data.withdrawal.status === 'processing', 'bot claims');
    ok((await a.req(`/api/account/withdrawals/${wid}/cancel`, {})).status === 409, 'cannot cancel claimed withdrawal');
    ok((await bot(`/withdrawals/${wid}/complete`, {})).data.withdrawal.status === 'completed', 'bot completes');
    r = await a.req('/api/account/withdraw', { amount: 50 });
    await bot(`/withdrawals/${r.data.withdrawal.id}/fail`, { reason: 'offline' });
    ok((await bal(a)) === b - 200, 'failed withdrawal refunded');
    ok((await a.req('/api/account/withdraw', { amount: -5 })).status === 400, 'tamper: negative withdrawal rejected');
    ok((await a.req('/api/games/coinflip/play', { bet: 1, side: 'heads' }, { Origin: 'https://evil.example' })).status === 403, 'cross-origin POST blocked');

    // ---- Bedrock mode ----
    r = await a.req('/api/account/bedrock', { enabled: true });
    ok(r.data.user.ingameName === '.Test_Player1' && !r.data.user.verified && r.data.user.verify, 'bedrock on -> .name, needs re-verify');
    const bv = r.data.user.verify.amount;
    ok((await pay('Test_Player1', bv, 'br-java')).status === 422, 'Java name no longer matches a Bedrock account');
    r = await pay('.Test_Player1', bv, 'br-ok');
    ok(r.status === 200 && r.data.user.name === '.Test_Player1' && r.data.user.verified, 'Bedrock name (dot prefix) matches and verifies');
    ok((await bot('/user/.Test_Player1')).data.user.verified, 'bot lookup by Bedrock name');
    const br = new Client();
    await br.req('/api/auth/signup', { username: 'Floody_One' });
    r = await br.req('/api/account/bedrock', { enabled: true });
    ok((await pay('Floody_One', r.data.user.verify.amount, 'br2-java')).status === 422, 'Bedrock account ignores the undotted name');
    ok((await pay('.Floody_One', r.data.user.verify.amount, 'br2')).status === 200 && (await br.me()).user.verified, 'Bedrock account verifies with .name');

    // ---- login from a new browser needs a payment ----
    const nb = new Client();
    r = await nb.req('/api/auth/login', { username: 'Test_Player1' });
    ok(r.data.pending && Number.isInteger(r.data.amount) && r.data.ingameName === '.Test_Player1', 'login to verified account is pending with an amount');
    ok((await nb.me()).user === null && (await nb.req('/api/games/coinflip/play', { bet: 1, side: 'heads' })).status === 401, 'pending session has no access');
    b = await bal(a);
    r = await pay('.Test_Player1', r.data.amount, 'login-1');
    ok(r.data.actions.includes('login_approved') && (await nb.me()).user && (await bal(a)) === b + r.data.credited, 'login payment approves and is credited');

    // ---- squatter loses access when the real player verifies ----
    const sq = new Client(), real = new Client();
    await sq.req('/api/auth/signup', { username: 'Fresh_One' });
    ok(!(await real.req('/api/auth/login', { username: 'Fresh_One' })).data.pending, 'login to never-verified account');
    const rv = (await real.me()).user.verify.amount, sv = (await sq.me()).user.verify.amount;
    ok(rv !== sv, 'each session gets its own verification number');
    await pay('Fresh_One', rv, 'fresh-1');
    ok((await real.me()).user.verified && (await sq.me()).user === null, 'verifying logs out other sessions');

    // ---- self-exclusion ----
    ok((await a.req('/api/account/self-exclude', { period: '1d' })).data.user.selfExcluded, 'self-exclude');
    ok((await a.req('/api/games/dice/play', { bet: 1, target: 50, direction: 'under' })).data.code === 'self_excluded', 'self-excluded cannot bet');
    ok((await a.req('/api/rewards/daily', {})).data.code === 'self_excluded', 'self-excluded cannot claim rewards');
    ok((await a.req('/api/account/withdraw', { amount: 1 })).data.ok, 'self-excluded can still withdraw');

    // ---- rewards ----
    const rw = await player('Reward_Guy');
    ok((await rw.req('/api/rewards')).data.tier.name === 'Sprinkle', 'new player starts in the first VIP tier');
    b = await bal(rw);
    r = await rw.req('/api/rewards/daily', {});
    ok(r.data.ok && r.data.credited === 25 && (await bal(rw)) === b + 25, 'daily bonus credited through the ledger');
    r = await rw.req('/api/rewards/daily', {});
    ok(r.status === 409 && r.data.code === 'cooldown' && (await bal(rw)) === b + 25, 'daily bonus cannot be claimed twice in 24h');
    await fund(rw, 200000);
    // Lose 100k at a near-impossible Limbo target => 100k wagered (Glazed tier, 2% rakeback).
    r = await rw.req('/api/games/limbo/play', { bet: 100000, target: 1000000 });
    const st = (await rw.req('/api/rewards')).data;
    ok(st.tier.name === 'Glazed' && st.rakeback.rate === 0.02, 'wagering 100k moves the player to the Glazed tier');
    if (!r.data.result.win) {
      ok(st.rakeback.amount === 2000, `rakeback uses the Glazed rate (2% of 100k loss, got ${st.rakeback.amount})`);
      b = await bal(rw);
      r = await rw.req('/api/rewards/rakeback', {});
      ok(r.data.credited === 2000 && r.data.tier === 'Glazed' && (await bal(rw)) === b + 2000, 'rakeback credited at the right tier');
      ok((await rw.req('/api/rewards/rakeback', {})).status === 409, 'rakeback cannot be claimed twice for the same losses');
    }

    // ---- affiliates ----
    const ref = await player('Ref_Owner');
    const code = (await ref.req('/api/affiliates')).data.code;
    ok(/^[A-Z0-9]{7}$/.test(code), 'verified player gets a referral code');
    ok((await ref.req('/api/affiliates/apply', { code })).data.code === 'self_referral', 'self-referral is rejected');
    ok((await new Client().req('/api/auth/signup', { username: 'Bad_Ref', referralCode: 'NOPE123' })).data.code === 'bad_referral', 'unknown referral code rejected');
    const kid = await player('Ref_Kid', { referralCode: code });
    ok((await ref.req('/api/affiliates')).data.referredCount === 1, 'referral linked at sign-up');
    ok((await kid.req('/api/affiliates/apply', { code })).data.code === 'already_referred', 'cannot be referred twice');
    await fund(kid, 50000);
    await kid.req('/api/rewards/daily', {});
    ok((await ref.req('/api/affiliates')).data.earnings.accrued === 0, "no commission on the referred player's own rewards");
    for (let i = 0; i < 4; i++) await kid.req('/api/games/coinflip/play', { bet: 10000, side: 'heads' });
    // 40,000 wagered x 1% edge x 5% = 20 donuts
    ok((await ref.req('/api/affiliates')).data.earnings.accrued === 20, 'commission accrues as 5% of the house edge');
    ok((await admin('/commissions')).status === 200 && (await admin('/commissions', undefined, 'bad')).status === 401, 'admin endpoints need ADMIN_SECRET');
    b = await bal(ref);
    r = await admin('/commissions/review', {});
    const po = r.data.created.find((x) => x.name === 'Ref_Owner');
    ok(po && po.amount === 20 && po.status === 'review' && (await bal(ref)) === b, 'review batch created, nothing credited before approval');
    r = await admin(`/commissions/${po.id}/approve`, {});
    ok(r.data.ok && (await bal(ref)) === b + 20, 'approved commission credited through the ledger');
    r = await admin(`/commissions/${po.id}/approve`, {});
    ok(r.status === 409 && (await bal(ref)) === b + 20, 'commission is credited only once');
    ok((await admin('/commissions/review', {})).data.created.length === 0, 'nothing left to review');

    // ---- bot status ----
    r = await new Client().req('/api/public/bot');
    ok(r.status === 200 && r.data.username === require('../config').activeBot() && r.data.enabled === true, 'bot status is public (name + online)');
    ok(!('secret' in r.data) && Object.keys(r.data).every((k) => ['ok', 'username', 'enabled', 'updatedAt'].includes(k)), 'public bot status shows only name and status');
    ok((await anon.req('/api/admin/bot', { enabled: false })).status === 401, 'bot toggle without admin secret rejected');
    ok((await admin('/bot', { enabled: false }, 'wrong-secret')).status === 401, 'bot toggle with wrong admin secret rejected');
    ok((await anon.req('/api/admin/bot', { enabled: false }, { 'X-Bot-Secret': SECRET })).status === 401, 'bot secret cannot toggle the bot');
    ok((await new Client().req('/api/public/bot')).data.enabled === true, 'rejected toggles changed nothing');
    ok((await admin('/bot', { username: 'bad name!' })).status === 400, 'invalid bot username rejected');
    ok((await admin('/bot', { enabled: 'no' })).status === 400, 'non-boolean enabled rejected');
    const pendingDep = (await a.req('/api/deposits', { amount: 300 })).data.deposit;
    r = await admin('/bot', { username: 'Donut_Bot', enabled: false });
    ok(r.status === 200 && r.data.username === 'Donut_Bot' && r.data.enabled === false, 'owner sets bot name and turns it off');
    r = await anon.req('/api/bot/status', undefined, { 'X-Bot-Secret': SECRET });
    ok(r.status === 200 && r.data.username === 'Donut_Bot' && r.data.enabled === false, 'mod status endpoint returns the current state');
    ok((await anon.req('/api/bot/status')).status === 401, 'mod status endpoint needs the bot secret');
    r = await new Client().req('/api/public/bot');
    ok(r.data.enabled === false && r.data.username === 'Donut_Bot', 'public status shows the bot offline');
    ok((await a.req('/api/deposits', { amount: 50 })).data.code === 'bot_offline', 'new deposits pause while the bot is off');
    b = await bal(a);
    ok((await pay('.Test_Player1', pendingDep.amount, 'paid-while-off')).status === 200 && (await bal(a)) === b + pendingDep.amount, 'a payment already made is still credited while off');
    r = await admin('/bot', { enabled: true });
    ok(r.data.enabled && (await anon.req('/api/bot/status', undefined, { 'X-Bot-Secret': SECRET })).data.enabled === true, 'turning the bot back on is visible to the mod');
    ok((await a.req('/api/deposits', { amount: 50 })).data.deposit.bot === 'Donut_Bot', 'new deposits use the bot name set by the owner');
    ok((await anon.req('/admin')).status === 200, 'admin page loads');

    // ---- ledger integrity ----
    await new Promise((res) => setTimeout(res, 400));
    const lines = fs.readFileSync(path.join(DATA, 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const sums = {};
    let chainOk = true;
    for (const t of lines) {
      const prev = sums[t.userId] || 0;
      if (t.balanceBefore !== prev || t.balanceAfter !== prev + t.delta || t.balanceAfter < 0 || !Number.isSafeInteger(t.delta)) chainOk = false;
      sums[t.userId] = t.balanceAfter;
    }
    ok(chainOk, 'ledger chain consistent, never negative');
    const db = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
    ok(Object.values(db.users).every((u) => u.balance === (sums[u.id] || 0)), 'db balances match ledger');
    ok(lines.filter((t) => ['bonus', 'rakeback', 'commission'].includes(t.type)).every((t) => t.meta && t.meta.reason), 'every reward is logged with a reason');

    await a.req('/api/auth/logout', {});
    ok((await a.me()).user === null, 'logout');

    unitChecks();
    srv.kill();
    expiryCheck();
  } catch (e) {
    fail++; console.log('ERROR:', e.stack || e.message);
  } finally {
    srv.kill();
    if (serr.trim()) console.log('server stderr:', serr.trim().split('\n').slice(0, 8).join('\n'));
    setTimeout(() => fs.rmSync(DATA, { recursive: true, force: true }), 400);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  }
})();

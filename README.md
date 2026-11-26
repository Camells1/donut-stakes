# Donut Stakes

A gambling-style web casino for a Minecraft server (Donut SMP style) played with **in-game donuts**.
Donuts are in-game currency only: they have no real-money value and cannot be bought or cashed out for real money.

Stack: Node 24 + Express 4, vanilla JS/CSS, JSON file store. No build step. (The folder is still `DonutCasino`.)

## Run

```
cd D:\Projects\DonutCasino
npm start
```

Open http://localhost:5320. On first start the server writes `.env` with random `BOT_SECRET` and `ADMIN_SECRET`.
`npm test` runs the end-to-end test (own server on port 5399, throwaway `data-test/` folder; about 210 checks).
Set `DATA_DIR` to keep the data somewhere else (default `./data`).

npm is pointed at `D:/npm-cache` via `.npmrc` (drive C: is full).

## Configuration (`config.js`, the single source)

| Setting | Default | Meaning |
|---|---|---|
| `siteName` | Donut Stakes | Shown everywhere (pages get it injected) |
| `houseEdge` | 0.01 | 1% edge, 99% RTP on every game |
| `minBet` / `maxBet` / `maxPayout` | 1 / 1e9 / 1e10 | Bet limits and single-bet payout cap |
| `bots` | `[{ ign: '[BOT_IGN]', active: true }]` | In-game bot accounts; the site shows the active one |
| `verify` | 1-999, 24 h | Range and lifetime of verification amounts |
| `deposit` | min 1, 30 min expiry, max 5 pending | Deposit request rules |
| `rewards.dailyCooldownHours` | 24 | Daily bonus cooldown |
| `rewards.vipTiers` | see below | VIP tiers by total wagered |
| `affiliates.commissionRate` | 0.05 | Referrer share of the house edge |
| `affiliates.applyWindowDays` | 7 | How long a new player can still add a referral code |
| `legal.*` | `[PLACEHOLDERS]` | Owner name, entity, contact, jurisdiction, server, date |

Default VIP tiers:

| Tier | Total wagered | Daily bonus | Rakeback on net losses |
|---|---|---|---|
| Sprinkle | 0 | 25 | 1% |
| Glazed | 100,000 | 100 | 2% |
| Frosted | 1,000,000 | 250 | 4% |
| Golden | 10,000,000 | 1,000 | 6% |

`.env`: `BOT_SECRET`, `ADMIN_SECRET` (keep private), optional `PORT`, `DATA_DIR`, `COOKIE_SECURE=1` (HTTPS), `TRUST_PROXY=1`.
Data lives in `data/db.json` (state) and `data/ledger.jsonl` (append-only transaction log).

## Accounts and verification (by payment)

- Sign-up asks only for the exact Minecraft username. No email, no password. HttpOnly session cookie (only its hash is stored).
- New accounts are **unverified**: they can browse but cannot bet, deposit or withdraw.
- The account page shows a **verification number** (a small unique whole number, e.g. `427`) and the active bot's name,
  with "Copy amount" and "Copy command" buttons. The player runs `/pay <BOT> 427` in-game. When the bot reports that payment,
  the account is verified and the 427 donuts are added to the balance.
- The number is tied to the browser session that showed it. When verification succeeds, every other session on that account
  is logged out, so someone who claimed your name first loses access.
- Logging in to an account that was ever verified from a new browser shows a fresh amount; the session works once the bot
  reports that payment (also credited).
- **Bedrock mode** (Account page, any time): the in-game name becomes `.` + username (Floodgate). Payments must come from that
  name. Switching it on a verified account sets it back to unverified until the new name pays its verification number.
  `Steve` and `.Steve` share one site username slot.

## Deposits

The Deposit page asks how many donuts the player wants to deposit and returns the exact amount to pay the active bot
(the requested amount, or +1, +2... if the player already has a pending record with that amount). Pending deposits expire
after 30 minutes. When the bot reports a payment with the matching name and amount, the server credits it through the ledger.
Any payment that does not match a live pending record is logged as unmatched and never credited.

## Bot API (the bot is a separate project: D:\Projects\DonutBotMod)

Header `X-Bot-Secret: <BOT_SECRET>` (or `Authorization: Bearer <BOT_SECRET>`). Names are in-game names (`Steve`, `.Steve`).

### POST /api/bot/payment

Request: `{ "payer_ign": "Steve", "amount": 427, "transaction_id": "unique-id-from-the-bot" }`

| Status | Body | Bot should |
|---|---|---|
| 200 | `{ ok: true, matched: true, kind: "verify"/"login"/"deposit", actions, credited, user }` | Done |
| 200 | same plus `duplicate: true` | Already processed; do nothing |
| 422 | `{ ok: false, matched: false, code: "unknown_player" / "no_pending_amount", refund: true }` | Refund the player in-game |
| 400 | `{ ok: false, code: "bad_request" }` | Fix the request (missing id, bad name, non-integer amount) |
| 401 | `{ code: "bad_secret" }` | Check the secret |

Each `transaction_id` is processed once; a repeat returns the first answer (a repeated rejection repeats the 422).
Unknown `/api/bot/*` routes answer 400, never 404.

### Other bot routes

| Method | Path | Use |
|---|---|---|
| GET | `/api/bot/health` | Check secret/connectivity |
| GET | `/api/bot/user/:name` | Balance + verified flag |
| GET | `/api/bot/unmatched` | Recent unmatched payments (to refund) |
| POST | `/api/bot/credit` `{name, amount, ref}` | Manual credit (owner use; idempotent on `ref`) |
| POST | `/api/bot/debit` `{name, amount, ref}` | Manual debit; 409 if it would go negative |
| GET | `/api/bot/withdrawals?status=pending` | Withdrawal queue |
| POST | `/api/bot/withdrawals/:id/claim` / `complete` / `fail` | Process a withdrawal (`fail` refunds) |

Withdrawals: the player requests on the Account page (amount is held immediately). The bot polls, claims, pays in-game,
then completes (or fails to refund).

### Bot status (name + on/off)

- The owner sets the bot username and turns the bot on or off at **/admin** (unlock with `ADMIN_SECRET`; the secret is
  kept in memory only). Stored in the data file. API: `GET/POST /api/admin/bot` `{ username?, enabled? }`.
- Everyone sees the name and Online/Offline on the lobby and Deposit page (`GET /api/public/bot`, no secret, returns only
  `username`, `enabled`, `updatedAt`).
- The mod polls `GET /api/bot/status` (`X-Bot-Secret`) and gets `{ ok, username, enabled, updatedAt }`. When
  `enabled` is `false` the mod must stop reporting payments and turn Bot Mode off.
- While off, new deposit requests are refused (`409 bot_offline`). A payment the mod already reported is still processed,
  so a player who paid is never lost.

## Games (20)

All outcomes are computed on the server with `node:crypto`. Each is priced for about 99% RTP (1% house edge).

| Game | Notes |
|---|---|
| Plinko | 8-16 rows, low/medium/high risk; generated tables 98.3-99.0% |
| Mines | 3x3 to 8x8, any mine count, cash out any time |
| Coin Flip | Frosted/Chocolate, 1.98x |
| Dice | Over/under, 1-98% chance |
| Limbo | Target 1.01x-1,000,000x |
| Crash | Per-player rounds; cash out or set auto cash-out; crash point hidden until the end |
| Roulette (Roll) | 0-36 wheel, multiple chips: number 36.63x, red/black/odd/even/low/high 2.035x, dozens/columns 3.0525x |
| Blackjack | Infinite deck, dealer peeks, BJ 3:2, double on first two, no split, dealer stands on soft 17 (about 98.96% RTP with basic strategy) |
| Slots | 3 reels, weighted strip, paytable scaled to 98.99% |
| Hi-Lo | Higher/lower card chain, skips, cash out any time |
| Keno | Pick 1-10 of 40, 10 drawn; tables 98.9-99.0%, top prize capped at 10,000x |
| Towers | 8 rows, 5 difficulties, cash out any time |
| Chicken | Cross lanes; 4 difficulties with fixed hit chance per lane |
| Dice Duels | 1-3 dice each vs the house, ties push |
| Slider | Pick a zone (1-95 wide); the server decides where the slider stops |
| Rock Paper Scissors | Win 1.97x, draw returns the stake |
| Baccarat | Punto Banco drawing rules; Player 2.0051x, Banker 1.9513x, Tie 10.3745x (re-priced from 1:1 / 0.95:1 / 8:1 to hit 99%) |
| Upgrader | **Simplified:** donut amounts only, no items. Pick a target box (1.1x-100x); chance = 0.99 / target |
| Cases | **Simplified:** 3 cases whose drops are donut amounts (case price x multiplier), not tradeable items |
| Case Battles | **Simplified:** you vs 1-3 house bots (not other players); highest total takes the pot. Fair by symmetry, so RTP equals the case RTP |

### Adding a game

1. `server/games/<id>.js`: for a one-shot game, export `instantGame({ id, name, description, info, validate(body), play(params, rng) })`
   where `play` returns `{ multiplier, summary, result }`. For a stateful game, export `{ id, name, actions: { ... } }` and use
   `takeBet`, `finishBet` and `rounds` from `core.js` (see `mines.js`, `towers.js`). `fitTable()` scales paytables to the RTP.
2. Add it to the list in `server/games/index.js`.
3. Add `public/js/games/<id>.js` (UI) and card art in `public/js/lobby.js`. The page `/play/<id>` and the routes
   `POST /api/games/<id>/<action>` work automatically; the header Games menu and the lobby list it.

## Rewards and affiliates

- **Daily bonus** (Rewards page): once every 24 h, amount by VIP tier.
- **Rakeback**: tier rate x net losses since the last claim. Claimable any time it is at least 1 donut.
- Rewards need a verified account and pause during self-exclusion. Every reward is a ledger entry with a reason.
- **Affiliates** (Affiliates page): verified players get a 7-character referral code and a `/?ref=CODE` link. New players
  can enter a code at sign-up (or within 7 days on the Affiliates page). Self-referral is blocked: own code, referral loops,
  and accounts seen on the referrer's IP address (loopback addresses are not compared).
- Commission = bet x house edge x 5%, only on bets, so a referred player's bonuses and rakeback never earn commission.
  It accrues but is **not credited automatically**. The owner reviews it:

| Method | Path (header `X-Admin-Secret: <ADMIN_SECRET>`) | Use |
|---|---|---|
| GET | `/api/admin/commissions` | Referrers, accrued amounts, payout records |
| POST | `/api/admin/commissions/review` | Move whole accrued donuts into payout records with status `review` |
| POST | `/api/admin/commissions/:id/approve` | Credit through the ledger (once; repeats return 409) |
| POST | `/api/admin/commissions/:id/reject` | Discard (abuse) |

## Security: the server is the only source of truth

- Balances, odds, multipliers, payouts and results are computed on the server. Client-sent `balance`, `multiplier`,
  `payout` or `win` fields are ignored.
- Every bet is validated: whole number, at least 1, at most the balance and the max bet. Game parameters are range-checked.
- Verification and deposit amounts are generated by the server and tied to a pending record. Only the bot (with the secret)
  can report payments.
- The balance is never stored in cookies, localStorage or hidden fields; pages read it from `/api/me`.
- Cross-site POSTs are rejected (Origin check), the session cookie is HttpOnly and SameSite=Lax.
- The test suite sends tampered requests (fake balance, negative/zero/fractional/oversized bets, edited multipliers,
  forged deposit fields, browser calls to the bot route) and checks each is rejected or ignored.

## Balance integrity

Every balance change goes through `applyTx()` in `server/ledger.js`. It rejects non-integers and anything that would make a
balance negative, writes the entry to `data/ledger.jsonl` **before** changing the balance, and records `balanceBefore` and
`balanceAfter`. On start-up, ledger entries newer than `db.json` are replayed, so a crash cannot lose a change.

## Responsible gambling and legal

- 18+ age gate on first visit (not on the legal pages, so anyone can read them).
- Self-exclusion on the Account page: 24h, 7d, 30d, 6m, 1y or permanent; can only be extended. Blocks betting and rewards,
  still allows withdrawals.
- `/terms`, `/privacy`, `/responsible` are **templates that must be reviewed by a lawyer**. Fill the placeholders in
  `config.js` and the `[...]` items left in the HTML (retention period, local helplines).

## Deploying (Render)

GitHub Pages only serves static files, and this site needs its Node server, so it targets a Node host. `render.yaml` is a
Render Blueprint for a free web service.

1. In Render: **New > Blueprint**, connect the GitHub repo `donut-stakes`, and pick the `main` branch.
2. Render reads `render.yaml` and asks for the secret values. Enter `BOT_SECRET` (the same value the bot mod uses) and
   `ADMIN_SECRET` (any long random string). Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. Click **Apply**. Render runs `npm ci --omit=dev`, then `npm start`, and gives you an `https://donut-stakes-xxxx.onrender.com` URL.
4. Point the bot mod at that URL. Open `/admin` to set the bot name.

Environment variables: `BOT_SECRET`, `ADMIN_SECRET` (secrets, entered in the dashboard, never in the repo),
`COOKIE_SECURE=1`, `TRUST_PROXY=1`, `DATA_DIR` (data folder, default `./data`), `NODE_VERSION`. Render sets `PORT`.

**Important limits of the free plan:**
- **It sleeps when idle.** After about 15 minutes without traffic the service spins down, and the next request takes
  around a minute to wake it. While it sleeps the bot mod cannot report payments, so it should retry.
- **The data is lost on redeploy.** `db.json` and `ledger.jsonl` live on the service's local disk, which is wiped on every
  deploy and restart. All accounts and balances would disappear. Before real use, either add a persistent disk (paid plan:
  mount it at e.g. `/var/data` and set `DATA_DIR=/var/data`) or move the store to a database.
- Back up `data/` regularly whatever host you use.

## Not done / owner to-do

- The in-game bot is a separate project (D:\Projects\DonutBotMod).
- Persistent storage for hosting (see Deploying).
- Fill in the legal placeholders and have the legal pages reviewed.

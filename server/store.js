// JSON file store. db.json holds current state; ledger.jsonl is the append-only
// transaction log (written synchronously BEFORE a balance changes). On start-up any
// ledger entries newer than db.json are replayed, so a crash cannot lose a balance change.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.jsonl');
const KEEP_TX = 50000;   // recent tx kept in db.json for the UI (full log stays in ledger.jsonl)
const KEEP_BETS = 50000;

let db = null;
let timer = null;

function emptyDb() {
  return {
    version: 1,
    seq: { user: 0, tx: 0, bet: 0, wd: 0 },
    users: {},        // id -> user
    sessions: {},     // sha256(token) -> session
    bets: [],         // recent bet records
    tx: [],           // recent ledger entries
    withdrawals: {},  // id -> withdrawal
    active: {},       // stateful game rounds: `${game}:${userId}` -> state
    botRefs: {},      // bot payment ref -> tx id (idempotency)
  };
}

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : emptyDb();
  const blank = emptyDb();
  for (const k of Object.keys(blank)) if (db[k] === undefined) db[k] = blank[k];
  reconcile();
  return db;
}

function reconcile() {
  if (!fs.existsSync(LEDGER_FILE)) return;
  let replayed = 0;
  for (const line of fs.readFileSync(LEDGER_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let tx;
    try { tx = JSON.parse(line); } catch { continue; }
    if (tx.id <= db.seq.tx) continue;
    const u = db.users[tx.userId];
    if (u) u.balance = tx.balanceAfter;
    db.seq.tx = tx.id;
    db.tx.push(tx);
    replayed++;
  }
  if (replayed) { console.warn(`[store] Replayed ${replayed} ledger entries newer than db.json`); flush(); }
}

function trim() {
  if (db.tx.length > KEEP_TX * 1.1) db.tx.splice(0, db.tx.length - KEEP_TX);
  if (db.bets.length > KEEP_BETS * 1.1) db.bets.splice(0, db.bets.length - KEEP_BETS);
}

function save() {
  if (timer) return;
  timer = setTimeout(flush, 200);
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!db) return;
  trim();
  const data = JSON.stringify(db);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, data);
  try { fs.renameSync(tmp, DB_FILE); } catch { fs.writeFileSync(DB_FILE, data); }
}

function appendLedger(tx) {
  fs.appendFileSync(LEDGER_FILE, JSON.stringify(tx) + '\n');
}

module.exports = { load, save, flush, appendLedger, get db() { return db; }, DATA_DIR };

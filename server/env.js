// Loads .env (KEY=VALUE lines). Generates BOT_SECRET into .env if it is missing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_FILE = path.join(__dirname, '..', '.env');

function parse(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function load() {
  let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const vars = parse(text);
  const want = {
    BOT_SECRET: 'Shared secret for the in-game bot (send as header "X-Bot-Secret: <secret>")',
    ADMIN_SECRET: 'Owner-only secret for /api/admin (affiliate payout approval), header "X-Admin-Secret: <secret>"',
  };
  let changed = false;
  for (const [name, comment] of Object.entries(want)) {
    if (vars[name] || process.env[name]) continue;
    const secret = crypto.randomBytes(32).toString('hex');
    if (!text) text = '# Donut Stakes config. Keep this file private.\n';
    if (!text.endsWith('\n')) text += '\n';
    text += `# ${comment}\n${name}=${secret}\n`;
    vars[name] = secret;
    changed = true;
    console.log(`[env] Generated ${name} and saved it to ${ENV_FILE}`);
    if (process.env.RENDER) console.warn(`[env] WARNING: ${name} is not set in the Render environment. A random one was generated but it is lost on every deploy. Set ${name} in the Render dashboard.`);
  }
  if (changed) fs.writeFileSync(ENV_FILE, text);
  for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined) process.env[k] = v;
}

module.exports = { load, ENV_FILE };

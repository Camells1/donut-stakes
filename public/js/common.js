// Shared site chrome + helpers. Exposes window.DC.
(function () {
  const DC = (window.DC = { me: null, config: null, games: [], _balanceCbs: [], _meCbs: [] });
  const $ = (sel, el = document) => el.querySelector(sel);
  DC.$ = $;
  DC.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };
  DC.store = store;

  // ---------- donut art ----------
  // Flat donut: dough ring + frosting ring, no gradients or highlights.
  const FROSTING = { pink: '#e8608f', choco: '#6b4330', glaze: '#d9ad5b', mint: '#56b88f', blue: '#5a9cd0', violet: '#9583cf', burnt: '#2b2522' };
  DC.donut = function (opts = {}) {
    const f = FROSTING[opts.flavor || 'pink'] || FROSTING.pink;
    const label = opts.label ? `<text x="50" y="62" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="600" font-size="36" fill="#fff">${DC.esc(opts.label)}</text>` : '';
    if (opts.label) return `<svg viewBox="0 0 100 100" class="${opts.cls || ''}" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="${f}"/>${label}</svg>`;
    return `<svg viewBox="0 0 100 100" class="${opts.cls || ''}" aria-hidden="true">
      <circle cx="50" cy="50" r="32" fill="none" stroke="${opts.flavor === 'burnt' ? '#3a302b' : '#c4925e'}" stroke-width="26"/>
      <circle cx="50" cy="50" r="31" fill="none" stroke="${f}" stroke-width="18"/></svg>`;
  };
  DC.icon = () => DC.donut({ flavor: 'pink' });

  // Playing card: c = { r: 1-13, s: 0-3 } or null for a face-down card.
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['♠', '♥', '♦', '♣'];
  DC.rankName = (r) => RANKS[r];
  DC.card = (c, cls = '') => (c
    ? `<div class="card ${c.s === 1 || c.s === 2 ? 'red' : ''} ${cls}"><span class="cr">${RANKS[c.r]}<i>${SUITS[c.s]}</i></span><span class="cs">${SUITS[c.s]}</span></div>`
    : `<div class="card back ${cls}">${DC.donut({ sprinkles: false })}</div>`);

  // ---------- formatting ----------
  DC.fmt = (n) => Number(n || 0).toLocaleString('en-US');
  DC.short = (n) => {
    n = Number(n || 0);
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace(/\.0+$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return DC.fmt(n);
  };
  DC.mult = (m) => (m >= 1000 ? DC.fmt(Math.round(m)) : Number(m).toFixed(2)) + 'x';
  DC.ago = (ts) => {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return new Date(ts).toLocaleDateString();
  };
  DC.avatar = (name) => {
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const flavors = ['pink', 'choco', 'glaze', 'mint', 'blue', 'violet'];
    return DC.donut({ flavor: flavors[h % flavors.length], label: String(name).replace(/^\./, '').slice(0, 1).toUpperCase(), sprinkles: false });
  };

  // ---------- api ----------
  DC.api = async function (path, body, method) {
    const opt = { method: method || (body !== undefined ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let res, data;
    try { res = await fetch(path, opt); data = await res.json(); } catch { throw Object.assign(new Error('Network error. Is the server running?'), { code: 'network' }); }
    if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || 'Request failed'), { code: data.code, status: res.status });
    return data;
  };

  // ---------- toasts ----------
  DC.toast = function (msg, type = '') {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3800);
  };
  DC.handleError = function (e) {
    if (e.code === 'auth_required') return DC.openAuth('signup');
    DC.toast(e.message, 'err');
  };

  // ---------- balance ----------
  let shown = 0;
  DC.setBalance = function (n, animate = true) {
    if (DC.me) DC.me.balance = n;
    const el = $('#balance-amount');
    const pill = $('.balance-pill');
    if (!el) return;
    const from = shown, to = n;
    shown = n;
    if (!animate || from === to) { el.textContent = DC.short(to); return; }
    pill.classList.remove('bump', 'up'); void pill.offsetWidth; pill.classList.add('bump');
    if (to > from) pill.classList.add('up');
    setTimeout(() => pill.classList.remove('up'), 700);
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 450);
      el.textContent = DC.short(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    DC._balanceCbs.forEach((cb) => cb(n));
  };
  DC.onBalance = (cb) => DC._balanceCbs.push(cb);
  DC.onMe = (cb) => { DC._meCbs.push(cb); if (DC._ready) cb(DC.me); };

  // ---------- chrome ----------
  function header() {
    const path = location.pathname;
    const el = document.createElement('header');
    el.className = 'site-header';
    el.innerHTML = `<div class="bar">
      <button class="btn small ghost menu-btn" aria-label="Menu">&#9776;</button>
      <a class="brand" href="/">${DC.icon()}<span>${DC.esc(DC.siteName)}</span></a>
      <nav class="nav">
        <a href="/" class="${path === '/' ? 'active' : ''}">Lobby</a>
        <div class="games-menu"><button class="${path.startsWith('/play/') ? 'active' : ''}" aria-haspopup="true">Games &#9662;</button>
          <div class="games-drop">${DC.games.map((g) => `<a href="/play/${g.id}" class="${path === '/play/' + g.id ? 'active' : ''}">${DC.esc(g.name)}</a>`).join('')}</div></div>
        <a href="/deposit" class="${path === '/deposit' ? 'active' : ''}">Deposit</a>
        <a href="/rewards" class="${path === '/rewards' ? 'active' : ''}">Rewards</a>
        <a href="/affiliates" class="${path === '/affiliates' ? 'active' : ''}">Affiliates</a>
      </nav>
      <div class="head-right" id="head-right"></div></div>`;
    $('.menu-btn', el).onclick = () => $('.nav', el).classList.toggle('open');
    const gm = $('.games-menu', el);
    $('button', gm).onclick = (e) => { e.stopPropagation(); gm.classList.toggle('open'); };
    document.addEventListener('click', (e) => { if (!gm.contains(e.target)) gm.classList.remove('open'); });
    document.body.prepend(el);
  }
  function renderHeadRight() {
    const box = $('#head-right');
    if (!box) return;
    const u = DC.me;
    if (u) {
      box.innerHTML = `<a class="balance-pill" href="/account" title="Your donut balance">${DC.icon()}<span id="balance-amount">${DC.short(u.balance)}</span></a>
        <a class="user-chip" href="/account" title="Account">${DC.avatar(u.ingameName).replace('<svg', '<svg width="28" height="28"')}<span class="uname">${DC.esc(u.ingameName)}</span>${u.verified ? '' : '<span class="badge warn">!</span>'}</a>`;
      shown = u.balance;
    } else {
      box.innerHTML = `<button class="btn small ghost" data-auth="login">Log in</button><button class="btn small primary" data-auth="signup">Sign up</button>`;
      box.querySelectorAll('[data-auth]').forEach((b) => (b.onclick = () => DC.openAuth(b.dataset.auth)));
    }
  }
  function footer() {
    const el = document.createElement('footer');
    el.className = 'site-footer';
    el.innerHTML = `<div class="inner">
      <span class="age-badge" title="18+ only">18+</span>
      <div class="links"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/responsible">Responsible gambling</a></div>
      <span style="margin-left:auto">&copy; ${new Date().getFullYear()} ${DC.esc(DC.siteName)}</span>
      <p class="disclaimer">Donuts are in-game currency with no real-money value and cannot be bought or cashed out for real money. Bets are final. Not affiliated with Mojang or Microsoft.</p></div>`;
    document.body.appendChild(el);
  }
  function verifyBanner() {
    const u = DC.me;
    const slot = $('#verify-banner');
    if (!slot) return;
    if (!u || u.verified || !u.verify) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="notice"><div class="grow">To play, verify by paying exactly <b>${DC.fmt(u.verify.amount)}</b> donuts to <b>${DC.esc(u.verify.bot)}</b> from ${DC.esc(u.ingameName)}.</div>
      ${DC.payCmd(u.verify.bot, u.verify.amount)}</div>`;
  }

  // Public bot card: name + online/offline (read-only; the owner changes it on /admin).
  DC.botCard = async function (el) {
    if (!el) return null;
    try {
      const b = await DC.api('/api/public/bot');
      el.innerHTML = `<div class="bot-card"><span class="dot ${b.enabled ? 'on' : ''}"></span><span class="muted">Bot</span>
        <b>${DC.esc(b.username)}</b><span class="${b.enabled ? 'win' : 'dim'}" style="margin-left:auto">${b.enabled ? 'Online' : 'Offline'}</span></div>`;
      return b;
    } catch { el.innerHTML = ''; return null; }
  };

  // "/pay BOT AMOUNT" chip with copy buttons. Amounts always come from the server.
  DC.payCmd = (bot, amount) => `<span class="pay-cmd"><span class="cmd">/pay ${DC.esc(bot)} ${DC.esc(amount)}</span>
    <button class="btn small" data-copy-text="${DC.esc(amount)}" title="Copy amount">Copy amount</button><button class="btn small ghost" data-copy-text="/pay ${DC.esc(bot)} ${DC.esc(amount)}" title="Copy command">Copy command</button></span>`;

  // ---------- age gate ----------
  function ageGate() {
    if (store.get('dc_age_ok') === '1' || document.cookie.includes('dc_age=1')) return;
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="ag-title">${DC.donut({ cls: 'donut-top' })}
      <h2 id="ag-title">Are you 18 or older?</h2>
      <p class="sub">This site is for adults only. Donuts are in-game currency with no real-money value.</p>
      <div style="display:grid;gap:8px"><button class="btn primary big" id="ag-yes">I am 18 or older</button><button class="btn big" id="ag-no">I am under 18</button></div>
      <p class="fine">By entering you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p></div>`;
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    $('#ag-yes', back).onclick = () => {
      store.set('dc_age_ok', '1');
      document.cookie = 'dc_age=1; Path=/; Max-Age=31536000; SameSite=Lax';
      back.remove(); document.body.style.overflow = '';
    };
    $('#ag-no', back).onclick = () => {
      $('.modal', back).innerHTML = `${DC.donut({ cls: 'donut-top', flavor: 'choco' })}<h2>Sorry, adults only</h2><p class="sub">You must be 18 or older to use this site. Come back when you are old enough.</p>`;
    };
  }
  const legalPage = () => ['/terms', '/privacy', '/responsible'].includes(location.pathname);

  // ---------- auth modal ----------
  let pollTimer = null;
  DC.openAuth = function (mode = 'signup') {
    closeAuth();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.id = 'auth-modal';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="x" aria-label="Close">&times;</button>${DC.donut({ cls: 'donut-top' })}
      <div id="auth-body"></div></div>`;
    document.body.appendChild(back);
    $('.x', back).onclick = closeAuth;
    back.addEventListener('mousedown', (e) => { if (e.target === back) closeAuth(); });
    renderAuthForm(mode);
  };
  function closeAuth() { clearInterval(pollTimer); const m = $('#auth-modal'); if (m) m.remove(); }
  function renderAuthForm(mode) {
    const body = $('#auth-body');
    body.innerHTML = `<h2>${mode === 'signup' ? 'Sign up' : 'Log in'}</h2>
      <p class="sub">Your exact Minecraft username. No email or password.</p>
      <div class="seg"><button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">Sign up</button><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Log in</button></div>
      <form id="auth-form" autocomplete="off">
        <label class="field"><span>Minecraft username</span><input type="text" name="username" maxlength="16" placeholder="e.g. Steve_123" spellcheck="false" required pattern="[A-Za-z0-9_]{3,16}"></label>
        ${mode === 'signup' ? `<label class="field"><span>Referral code <em class="dim" style="font-style:normal">optional</em></span><input type="text" name="ref" maxlength="12" spellcheck="false" value="${DC.esc(store.get('dc_ref') || '')}"></label>` : ''}
        <div class="err" id="auth-err"></div>
        <button class="btn primary big" type="submit">${mode === 'signup' ? 'Create account' : 'Log in'}</button>
      </form>
      <p class="fine">${mode === 'signup' ? 'Bedrock players: use your name without the dot, then turn on Bedrock mode.' : 'New logins to verified accounts are confirmed with a small in-game payment.'}</p>`;
    body.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => renderAuthForm(b.dataset.m)));
    const input = $('input', body);
    input.focus();
    $('#auth-form').onsubmit = async (e) => {
      e.preventDefault();
      const username = input.value.trim().replace(/^\./, '');
      const err = $('#auth-err');
      err.textContent = '';
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) { err.textContent = '3-16 letters, numbers or underscores.'; return; }
      const refIn = body.querySelector('input[name="ref"]');
      const payload = { username };
      if (refIn && refIn.value.trim()) payload.referralCode = refIn.value.trim();
      try {
        const r = await DC.api('/api/auth/' + mode, payload);
        if (r.pending) return renderPending(r);
        location.reload();
      } catch (ex) { err.textContent = ex.message; }
    };
  }
  function renderPending(p) {
    const body = $('#auth-body');
    body.innerHTML = `<h2>Confirm it's you</h2>
      <p class="sub">This account is verified, so new logins are confirmed in-game.</p>
      <ol class="steps"><li>Join the server as <b>${DC.esc(p.ingameName)}</b>.</li>
      <li>Pay the bot exactly this amount (it is added to your balance):</li></ol>
      <p style="text-align:center;margin:14px 0"><span class="code-chip" style="font-size:28px">${DC.fmt(p.amount)}</span></p>
      <p style="text-align:center">${DC.payCmd(p.bot, p.amount)}</p>
      <p class="fine">Waiting for the bot... this window updates by itself. The amount expires in 30 minutes.</p>
      <div style="display:grid;margin-top:12px"><button class="btn ghost" id="pend-cancel">Cancel</button></div>`;
    $('#pend-cancel').onclick = async () => { try { await DC.api('/api/auth/logout', {}); } catch { /* ignore */ } closeAuth(); };
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try { const me = await DC.api('/api/me'); if (me.user) location.reload(); if (!me.user && !me.pending) { clearInterval(pollTimer); renderAuthForm('login'); } } catch { /* keep polling */ }
    }, 3000);
  }
  DC.logout = async () => { await DC.api('/api/auth/logout', {}); location.href = '/'; };

  // ---------- history widget ----------
  DC.history = {
    mount(el, gameId) {
      this.el = el; this.game = gameId; this.scope = DC.me ? 'me' : 'all';
      el.innerHTML = `<div class="panel history"><div class="section-title" style="margin:0 0 12px"><h2 style="margin:0">History</h2>
        <div class="seg" style="width:220px"><button data-s="me">My bets</button><button data-s="all">All bets</button></div></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Time</th><th>Player</th><th>Result</th><th class="r">Bet</th><th class="r">Multi</th><th class="r">Payout</th></tr></thead><tbody></tbody></table></div></div>`;
      el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { this.scope = b.dataset.s; this.load(); }));
      this.load();
      setInterval(() => { if (this.scope === 'all' && !document.hidden) this.load(); }, 8000);
    },
    async load() {
      this.el.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === this.scope));
      try {
        const r = await DC.api(`/api/history?game=${encodeURIComponent(this.game || '')}&scope=${this.scope}&limit=20`);
        this.render(r.bets);
      } catch { /* ignore */ }
    },
    render(bets) {
      const tb = this.el.querySelector('tbody');
      if (!bets.length) { tb.innerHTML = `<tr><td colspan="6" class="empty">${this.scope === 'me' && !DC.me ? 'Log in to see your bets.' : 'No bets yet. Be the first!'}</td></tr>`; return; }
      tb.innerHTML = bets.map((b) => this.row(b)).join('');
    },
    row(b, isNew) {
      const cls = b.payout > b.bet ? 'win' : b.payout < b.bet ? 'loss' : '';
      return `<tr class="${isNew ? 'new' : ''}"><td class="dim">${DC.ago(b.ts)}</td><td>${DC.esc(b.name)}</td><td class="muted">${DC.esc(b.summary)}</td>
        <td class="r">${DC.short(b.bet)}</td><td class="r ${cls}">${DC.mult(b.multiplier)}</td><td class="r ${cls}">${b.payout ? DC.short(b.payout) : '0'}</td></tr>`;
    },
    add(b) {
      if (!this.el) return;
      const tb = this.el.querySelector('tbody');
      const empty = tb.querySelector('.empty');
      if (empty) tb.innerHTML = '';
      tb.insertAdjacentHTML('afterbegin', this.row(b, true));
      while (tb.children.length > 20) tb.lastElementChild.remove();
    },
  };

  // ---------- bet amount control ----------
  DC.betInput = function (container, key) {
    const saved = Number(store.get('dc_bet_' + key)) || 10;
    container.insertAdjacentHTML('beforeend', `<label class="field"><span>Bet amount <em class="dim" style="font-style:normal" data-bal></em></span>
      <div class="input-group"><div class="input-with-icon">${DC.icon()}<input type="number" min="1" step="1" inputmode="numeric" value="${saved}"></div>
      <div class="bet-quick"><button type="button" class="btn small" data-q="half">&frac12;</button><button type="button" class="btn small" data-q="double">2&times;</button><button type="button" class="btn small" data-q="max">Max</button></div></div></label>`);
    const label = container.lastElementChild;
    const input = $('input', label);
    const bal = $('[data-bal]', label);
    const showBal = () => { bal.textContent = DC.me ? 'Bal ' + DC.short(DC.me.balance) : ''; };
    showBal(); DC.onBalance(showBal); DC.onMe(showBal);
    const clamp = (v) => Math.max(1, Math.min(Math.floor(v) || 1, DC.config.maxBet));
    label.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
      const v = Number(input.value) || 1;
      input.value = clamp(b.dataset.q === 'half' ? v / 2 : b.dataset.q === 'double' ? v * 2 : (DC.me ? DC.me.balance : 1));
      input.dispatchEvent(new Event('input'));
    }));
    input.addEventListener('change', () => { input.value = clamp(Number(input.value)); store.set('dc_bet_' + key, input.value); });
    return {
      input,
      get() { const v = clamp(Number(input.value)); input.value = v; store.set('dc_bet_' + key, v); return v; },
      disable(on) { input.disabled = on; label.querySelectorAll('button').forEach((b) => (b.disabled = on)); },
    };
  };

  DC.canPlay = function () {
    if (!DC.me) { DC.openAuth('signup'); return false; }
    if (!DC.me.verified) { DC.toast('Verify your account in-game before betting. See your Account page.', 'err'); return false; }
    if (DC.me.selfExcluded) { DC.toast('You are self-excluded right now.', 'err'); return false; }
    return true;
  };

  DC.pop = function (stage, win, big, small) {
    stage.querySelectorAll('.result-pop').forEach((p) => p.remove());
    const p = document.createElement('div');
    p.className = 'result-pop' + (win ? '' : ' lose');
    p.innerHTML = `<b>${DC.esc(big)}</b><span>${DC.esc(small)}</span>`;
    stage.appendChild(p);
    setTimeout(() => { p.style.transition = 'opacity .4s'; p.style.opacity = '0'; setTimeout(() => p.remove(), 400); }, 1600);
  };

  // ---------- boot ----------
  DC.siteName = document.documentElement.dataset.site || 'Donut Stakes';
  // Referral links: /?ref=CODE is remembered and pre-filled at sign-up.
  try { const ref = new URLSearchParams(location.search).get('ref'); if (ref && /^[A-Za-z0-9]{4,12}$/.test(ref)) store.set('dc_ref', ref.toUpperCase()); } catch { /* ignore */ }
  const copyText = (t, label) => { if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => DC.toast(`${label} copied`, 'ok'), () => DC.toast('Copy failed, select it by hand', 'err')); };
  DC.ready = (async () => {
    try {
      const [cfg, me, g] = await Promise.all([DC.api('/api/config'), DC.api('/api/me'), DC.api('/api/games')]);
      DC.config = cfg; DC.me = me.user; DC.pending = me.pending; DC.games = g.games;
    } catch (e) { DC.config = DC.config || { botName: 'the bot', maxBet: 1e9 }; DC.toast(e.message, 'err'); }
    header(); footer(); renderHeadRight(); verifyBanner();
    if (!legalPage()) ageGate();
    if (DC.pending) { DC.openAuth('login'); renderPending(DC.pending); }
    DC._ready = true;
    DC._meCbs.forEach((cb) => cb(DC.me));
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-copy-text]');
      if (b) return copyText(b.dataset.copyText, /^\d+$/.test(b.dataset.copyText) ? 'Amount' : 'Text');
      const c = e.target.closest('.code-chip');
      if (c) copyText(c.textContent.trim().replace(/,/g, ''), 'Amount');
    });
    return DC;
  })();
  DC.refreshMe = async () => { const me = await DC.api('/api/me'); DC.me = me.user; renderHeadRight(); verifyBanner(); DC._meCbs.forEach((cb) => cb(DC.me)); return DC.me; };
})();

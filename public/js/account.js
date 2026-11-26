(async function () {
  const DC = await window.DC.ready;
  const root = document.getElementById('account');
  const bot = DC.esc(DC.config.botName);
  const server = DC.esc(DC.config.legal.serverName);
  let poll = null;

  function loggedOut() {
    root.innerHTML = `<div class="panel" style="max-width:560px;margin:30px auto;text-align:center">${DC.donut({ cls: 'donut-top' }).replace('<svg', '<svg width="90" height="90"')}
      <h1>Your account</h1><p class="muted">Sign up with just your Minecraft username, then verify in-game with the bot <span class="cmd">${bot}</span>.</p>
      <div style="display:flex;gap:10px;justify-content:center"><button class="btn primary" data-a="signup">Sign up</button><button class="btn" data-a="login">Log in</button></div></div>`;
    root.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => DC.openAuth(b.dataset.a)));
  }

  function render() {
    const u = DC.me;
    if (!u) return loggedOut();
    const excl = u.selfExcluded ? (u.excludedUntil === 'permanent' ? 'permanently' : 'until ' + new Date(u.excludedUntil).toLocaleString()) : null;
    const net = u.stats.won - u.stats.wagered;
    root.innerHTML = `
    <div class="account-grid">
      <section class="panel">
        <div class="profile">${DC.avatar(u.ingameName).replace('<svg', '<svg width="72" height="72"')}
          <div><h2>${DC.esc(u.ingameName)}</h2>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${u.verified ? '<span class="badge ok">Verified</span>' : '<span class="badge warn">Not verified</span>'}
          ${u.bedrock ? '<span class="badge">Bedrock</span>' : '<span class="badge">Java</span>'}${u.selfExcluded ? '<span class="badge bad">Self-excluded</span>' : ''}</div></div>
          <button class="btn small ghost" id="logout" style="margin-left:auto">Log out</button></div>
        <div style="margin-top:16px">
          <div class="row"><div class="txt"><b>Bedrock mode</b><small>For Bedrock players joining through Geyser/Floodgate. Your in-game name becomes <span class="cmd">.${DC.esc(u.username)}</span>. Switching changes who you are in-game, so you will need to verify again.</small></div>
            <label class="switch"><input type="checkbox" id="bedrock" ${u.bedrock ? 'checked' : ''} aria-label="Bedrock mode"><span></span></label></div>
          <div class="row"><div class="txt"><b>Site username</b><small>${DC.esc(u.username)} &middot; joined ${new Date(u.createdAt).toLocaleDateString()}</small></div></div>
        </div>
      </section>

      <section class="panel" id="verify-panel">
        ${u.verified ? `<h2>Verified</h2><p class="muted">The bot confirmed you are <b>${DC.esc(u.ingameName)}</b>. Betting and withdrawals are unlocked.</p>
          <h3>Deposit donuts</h3><p class="muted">Deposits use an exact amount so the bot can match your payment.</p><a class="btn primary" href="/deposit">Make a deposit</a>`
        : u.verify ? `<h2>Verify your account</h2><p class="muted">This proves you really are <b>${DC.esc(u.ingameName)}</b>. Until then you can look around but cannot bet or withdraw.</p>
          <p style="margin:6px 0 2px" class="dim">Your verification number</p>
          <div class="big-amount">${DC.fmt(u.verify.amount)}</div>
          <ol class="steps" style="margin-top:10px"><li>Join ${server} as <b>${DC.esc(u.ingameName)}</b>${u.bedrock ? ' (Bedrock)' : ''}.</li>
          <li>Pay exactly <b>${DC.fmt(u.verify.amount)}</b> donuts to <span class="cmd">${DC.esc(u.verify.bot)}</span>. It is added to your balance.</li>
          <li>This page updates by itself once the bot sees the payment.</li></ol>
          <p style="margin-top:12px">${DC.payCmd(u.verify.bot, u.verify.amount)}</p>
          <p class="dim" style="font-size:13px">The number is unique to you and this browser. Paying a different amount will not verify you.</p>`
        : '<h2>Verify your account</h2><p class="muted">Loading your verification number...</p>'}
      </section>

      <section class="panel">
        <h2>Balance</h2>
        <div class="big-balance">${DC.icon()}<span>${DC.fmt(u.balance)}</span></div>
        <p class="dim" style="margin-top:6px">Donuts are in-game currency with no real-money value. They cannot be bought or cashed out for real money.</p>
        <div class="stat-row" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><small>Wagered</small><b>${DC.short(u.stats.wagered)}</b></div>
          <div class="stat"><small>Won</small><b>${DC.short(u.stats.won)}</b></div>
          <div class="stat"><small>Net</small><b class="${net >= 0 ? 'win' : 'loss'}">${net >= 0 ? '+' : ''}${DC.short(net)}</b></div></div>
        <h3>Withdraw to in-game</h3>
        <form id="wd-form" class="input-group"><div class="input-with-icon">${DC.icon()}<input type="number" min="${DC.config.minWithdraw}" step="1" placeholder="Amount" id="wd-amount" ${u.verified ? '' : 'disabled'}></div>
          <button class="btn primary" ${u.verified ? '' : 'disabled'}>Withdraw</button></form>
        <p class="dim" style="font-size:13px;margin-top:8px">${u.verified ? `The bot pays <b>${DC.esc(u.ingameName)}</b> in-game. Pending requests can be cancelled until the bot picks them up.` : 'Verify your account to withdraw.'}</p>
        <div id="wd-list"></div>
      </section>

      <section class="panel">
        <h2>Responsible gambling</h2>
        ${excl ? `<div class="notice pink"><div class="grow"><b>You are self-excluded ${DC.esc(excl)}.</b> You cannot place bets. You can still withdraw your balance.</div></div>` : '<p class="muted">Need a break? Self-exclusion blocks all betting on this account. It cannot be undone or shortened once set.</p>'}
        <div class="input-group"><select id="ex-period">
          <option value="1d">24 hours</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="180d">6 months</option><option value="365d">1 year</option><option value="permanent">Permanent</option></select>
          <button class="btn danger" id="ex-go">Self-exclude</button></div>
        <p class="dim" style="font-size:13px;margin-top:10px">More help on the <a href="/responsible">Responsible Gambling</a> page.</p>
      </section>

      <section class="panel full"><h2>Transactions</h2><div class="table-wrap"><table class="data"><thead><tr><th>Time</th><th>Type</th><th>Game</th><th class="r">Amount</th><th class="r">Balance</th></tr></thead><tbody id="tx"></tbody></table></div></section>
    </div>`;

    document.getElementById('logout').onclick = DC.logout;
    document.getElementById('bedrock').onchange = async (e) => {
      const on = e.target.checked;
      if (u.verified && !confirm(`Switch your in-game name to ${on ? '.' + u.username : u.username}? You will need to verify again with the bot.`)) { e.target.checked = !on; return; }
      try { await DC.api('/api/account/bedrock', { enabled: on }); await DC.refreshMe(); render(); DC.toast(on ? 'Bedrock mode on' : 'Bedrock mode off', 'ok'); } catch (ex) { DC.handleError(ex); e.target.checked = !on; }
    };
    document.getElementById('wd-form').onsubmit = async (e) => {
      e.preventDefault();
      const amount = Math.floor(Number(document.getElementById('wd-amount').value));
      if (!amount) return;
      if (!confirm(`Withdraw ${DC.fmt(amount)} donuts to ${u.ingameName}?`)) return;
      try { const r = await DC.api('/api/account/withdraw', { amount }); DC.setBalance(r.balance); DC.toast('Withdrawal requested', 'ok'); await DC.refreshMe(); render(); } catch (ex) { DC.handleError(ex); }
    };
    document.getElementById('ex-go').onclick = async () => {
      const sel = document.getElementById('ex-period');
      const label = sel.options[sel.selectedIndex].text;
      if (!confirm(`Self-exclude for ${label}? You will not be able to bet until it ends, and this cannot be undone.`)) return;
      try { await DC.api('/api/account/self-exclude', { period: sel.value }); await DC.refreshMe(); render(); DC.toast('Self-exclusion set', 'ok'); } catch (ex) { DC.handleError(ex); }
    };
    loadLists();
    clearInterval(poll);
    if (!u.verified) poll = setInterval(async () => { const me = await DC.refreshMe().catch(() => null); if (me && me.verified) { clearInterval(poll); render(); DC.toast('Verified! Welcome in.', 'ok'); } }, 4000);
  }

  const TX = { deposit: 'Deposit', bet: 'Bet', payout: 'Payout', refund: 'Refund', withdraw: 'Withdrawal', withdraw_refund: 'Withdrawal refund', bot_debit: 'Bot debit', adjust: 'Adjustment' };
  async function loadLists() {
    try {
      const [t, w] = await Promise.all([DC.api('/api/account/transactions'), DC.api('/api/account/withdrawals')]);
      document.getElementById('tx').innerHTML = t.transactions.length ? t.transactions.map((x) => `<tr><td class="dim">${DC.ago(x.ts)}</td><td>${TX[x.type] || x.type}</td><td class="muted">${DC.esc(x.game || '')}</td>
        <td class="r ${x.delta > 0 ? 'win' : 'loss'}">${x.delta > 0 ? '+' : ''}${DC.fmt(x.delta)}</td><td class="r">${DC.fmt(x.balanceAfter)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No transactions yet.</td></tr>';
      const list = document.getElementById('wd-list');
      list.innerHTML = w.withdrawals.length ? `<table class="data" style="margin-top:12px"><tbody>${w.withdrawals.slice(0, 6).map((x) => `<tr><td>#${x.id}</td><td class="r">${DC.fmt(x.amount)}</td>
        <td><span class="badge ${x.status === 'completed' ? 'ok' : x.status === 'pending' || x.status === 'processing' ? 'warn' : ''}">${x.status}</span></td>
        <td class="r">${x.status === 'pending' ? `<button class="btn small ghost" data-cancel="${x.id}">Cancel</button>` : DC.ago(x.createdAt)}</td></tr>`).join('')}</tbody></table>` : '';
      list.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
        try { const r = await DC.api(`/api/account/withdrawals/${b.dataset.cancel}/cancel`, {}); DC.setBalance(r.balance); await DC.refreshMe(); render(); } catch (ex) { DC.handleError(ex); }
      }));
    } catch { /* ignore */ }
  }

  render();
})();

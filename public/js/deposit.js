(async function () {
  const DC = await window.DC.ready;
  const root = document.getElementById('page');
  let poll = null;

  function gate() {
    if (!DC.me) {
      root.innerHTML = `<div class="panel" style="max-width:560px;margin:30px auto;text-align:center"><h1>Deposit</h1><p class="muted">Log in to deposit donuts.</p><button class="btn primary" id="dp-in">Log in or sign up</button></div>`;
      document.getElementById('dp-in').onclick = () => DC.openAuth('signup');
      return false;
    }
    if (!DC.me.verified) {
      root.innerHTML = `<div class="panel" style="max-width:620px;margin:30px auto"><h1>Deposit</h1><p class="muted">Verify your account first. Your verification payment is added to your balance.</p><a class="btn primary" href="/account">Verify now</a></div>`;
      return false;
    }
    return true;
  }

  function render(data) {
    const live = data.deposits.filter((d) => d.status === 'pending');
    const cur = live[0];
    root.innerHTML = `<div class="page-grid">
      <section class="panel"><h1>Deposit</h1>
        <div class="bot-card" style="margin-bottom:14px"><span class="dot ${data.botEnabled ? 'on' : ''}"></span><span class="muted">Bot</span><b>${DC.esc(data.bot)}</b><span class="${data.botEnabled ? 'win' : 'dim'}" style="margin-left:auto">${data.botEnabled ? 'Online' : 'Offline'}</span></div>
        <p class="muted">Pay the bot from <b>${DC.esc(DC.me.ingameName)}</b>. You get an exact amount so the payment can be matched.</p>
        <form id="dp-form" class="input-group"><div class="input-with-icon">${DC.icon()}<input type="number" id="dp-amt" min="${DC.config.deposit.minAmount}" step="1" placeholder="How many donuts?" ${data.botEnabled ? '' : 'disabled'}></div><button class="btn primary" ${data.botEnabled ? '' : 'disabled'}>Get amount</button></form>
        <p class="dim" style="font-size:13px;margin-top:8px">${data.botEnabled ? `Amounts are unique and expire after ${DC.config.deposit.expiryMinutes} minutes.` : 'The bot is offline. Deposits are paused until it is back.'}</p>
      </section>
      <section class="panel">${cur ? `<h2>Pay exactly</h2><div class="big-amount">${DC.fmt(cur.amount)}</div>
          <p class="muted">to <span class="cmd">${DC.esc(cur.bot)}</span> before <b>${new Date(cur.expiresAt).toLocaleTimeString()}</b></p>
          <p>${DC.payCmd(cur.bot, cur.amount)}</p>
          <p class="dim" style="font-size:13px">Paying any other amount will not be credited automatically. This page updates when the bot sees your payment.</p>`
        : '<h2>No pending deposit</h2><p class="muted">Enter an amount to get your exact payment number.</p>'}</section>
      <section class="panel full"><h2>Recent deposits</h2><div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Created</th><th class="r">Pay exactly</th><th>Bot</th><th>Status</th><th></th></tr></thead><tbody>
        ${data.deposits.length ? data.deposits.map((d) => `<tr><td>${d.id}</td><td class="dim">${DC.ago(d.createdAt)}</td><td class="r">${DC.fmt(d.amount)}</td><td>${DC.esc(d.bot)}</td>
          <td><span class="badge ${d.status === 'paid' ? 'ok' : d.status === 'pending' ? 'warn' : ''}">${d.status}</span></td>
          <td class="r">${d.status === 'pending' ? `<button class="btn small ghost" data-cancel="${d.id}">Cancel</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">No deposits yet.</td></tr>'}
      </tbody></table></div></section></div>`;
    document.getElementById('dp-form').onsubmit = async (e) => {
      e.preventDefault();
      const amount = Math.floor(Number(document.getElementById('dp-amt').value));
      if (!amount) return;
      try { await DC.api('/api/deposits', { amount }); load(); } catch (ex) { DC.handleError(ex); }
    };
    root.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => { try { await DC.api(`/api/deposits/${b.dataset.cancel}/cancel`, {}); load(); } catch (ex) { DC.handleError(ex); } }));
  }

  let lastPaid = null;
  async function load() {
    if (!gate()) return;
    try {
      const data = await DC.api('/api/deposits');
      const paid = data.deposits.filter((d) => d.status === 'paid').map((d) => d.id).join(',');
      if (lastPaid !== null && paid !== lastPaid) DC.toast('Deposit received!', 'ok');
      lastPaid = paid;
      DC.setBalance(data.balance);
      render(data);
    } catch (e) { DC.handleError(e); }
  }
  await load();
  clearInterval(poll);
  poll = setInterval(() => { if (!document.hidden && DC.me && DC.me.verified) load(); }, 5000);
})();

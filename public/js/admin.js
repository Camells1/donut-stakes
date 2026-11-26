// Owner page. The ADMIN_SECRET is typed in and kept in memory only (never stored).
(async function () {
  const DC = await window.DC.ready;
  const root = document.getElementById('page');
  let secret = '';

  async function call(path, body) {
    const res = await fetch('/api/admin' + path, {
      method: body !== undefined ? 'POST' : 'GET',
      headers: { 'X-Admin-Secret': secret, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  }

  function lock(msg) {
    root.innerHTML = `<div class="panel" style="max-width:420px;margin:30px auto"><h1>Admin</h1>
      <form id="ad-unlock"><label class="field"><span>Admin secret</span><input type="password" id="ad-secret" autocomplete="off"></label>
      <div class="err" style="color:var(--red);font-size:13px;min-height:18px">${DC.esc(msg || '')}</div>
      <button class="btn primary big">Unlock</button></form>
      <p class="dim" style="font-size:12px;margin-top:10px">ADMIN_SECRET from the server's .env (or Render environment). It is not saved in the browser.</p></div>`;
    document.getElementById('ad-unlock').onsubmit = async (e) => {
      e.preventDefault();
      secret = document.getElementById('ad-secret').value.trim();
      try { await call('/bot'); render(); } catch (ex) { secret = ''; lock(ex.status === 401 ? 'Wrong secret' : ex.message); }
    };
  }

  async function render() {
    const [bot, com] = await Promise.all([call('/bot'), call('/commissions')]);
    const review = com.payouts.filter((p) => p.status === 'review');
    root.innerHTML = `<div class="page-grid">
      <section class="panel"><h2>Bot</h2>
        <form id="ad-bot"><label class="field"><span>Bot username (shown to players)</span><input type="text" id="ad-name" maxlength="17" value="${DC.esc(bot.username)}"></label>
        <button class="btn">Save name</button></form>
        <div class="row" style="margin-top:12px"><div class="txt"><b>Bot online</b><small>Off: the site shows Offline, new deposits pause, and the bot mod stops reporting payments and turns Bot Mode off.</small></div>
          <label class="switch"><input type="checkbox" id="ad-on" ${bot.enabled ? 'checked' : ''} aria-label="Bot online"><span></span></label></div>
        <p class="dim" style="font-size:12px;margin:8px 0 0">Last change ${new Date(bot.updatedAt).toLocaleString()}</p></section>
      <section class="panel"><h2>Affiliate commission</h2>
        <p class="muted">${com.referrers.length} referrers. ${review.length} payout${review.length === 1 ? '' : 's'} waiting for review.</p>
        <button class="btn" id="ad-batch">Create review batch</button>
        <div class="table-wrap" style="margin-top:12px"><table class="data"><tbody>
        ${review.length ? review.map((p) => `<tr><td>#${p.id}</td><td>${DC.esc(p.name)}</td><td class="r">${DC.fmt(p.amount)}</td>
          <td class="r"><button class="btn small" data-ap="${p.id}">Approve</button> <button class="btn small ghost" data-rj="${p.id}">Reject</button></td></tr>`).join('') : '<tr><td class="empty">Nothing to review.</td></tr>'}
        </tbody></table></div></section></div>`;
    const act = (fn) => async (...a) => { try { await fn(...a); render(); } catch (ex) { DC.toast(ex.message, 'err'); } };
    document.getElementById('ad-bot').onsubmit = act(async (e) => { e.preventDefault(); await call('/bot', { username: document.getElementById('ad-name').value }); DC.toast('Bot name saved', 'ok'); });
    document.getElementById('ad-on').onchange = act(async (e) => { await call('/bot', { enabled: e.target.checked }); DC.toast(e.target.checked ? 'Bot online' : 'Bot offline', 'ok'); });
    document.getElementById('ad-batch').onclick = act(async () => { const r = await call('/commissions/review', {}); DC.toast(`${r.created.length} payout(s) created`, 'ok'); });
    root.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = act(() => call(`/commissions/${b.dataset.ap}/approve`, {}))));
    root.querySelectorAll('[data-rj]').forEach((b) => (b.onclick = act(() => call(`/commissions/${b.dataset.rj}/reject`, { reason: 'rejected by owner' }))));
  }

  lock();
})();

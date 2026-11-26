(async function () {
  const DC = await window.DC.ready;
  const root = document.getElementById('page');
  if (!DC.me) {
    root.innerHTML = `<div class="panel" style="max-width:560px;margin:30px auto;text-align:center"><h1>Affiliates</h1><p class="muted">Log in to get your referral code.</p><button class="btn primary" id="af-in">Log in or sign up</button></div>`;
    document.getElementById('af-in').onclick = () => DC.openAuth('signup');
    return;
  }
  async function load() {
    let a;
    try { a = await DC.api('/api/affiliates'); } catch (e) { return DC.handleError(e); }
    const link = a.code ? `${location.origin}/?ref=${a.code}` : '';
    root.innerHTML = `<div class="page-grid">
      <section class="panel"><h1 style="font-size:30px">Your referral code</h1>
        ${a.code ? `<div class="big-amount">${DC.esc(a.code)}</div>
          <p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><span class="cmd">${DC.esc(link)}</span><button class="btn small" data-copy-text="${DC.esc(link)}">Copy link</button><button class="btn small ghost" data-copy-text="${DC.esc(a.code)}">Copy code</button></p>`
        : '<p class="muted">Verify your account to get a referral code.</p><a class="btn primary" href="/account">Verify now</a>'}
        <p class="muted" style="margin-top:12px">You earn ${(a.rate * 100).toFixed(0)}% of the house edge on bets placed by players you refer. Their bonuses and rakeback never count. Commission is reviewed by the owner before it is paid to your balance.</p></section>
      <section class="panel"><h2>Stats</h2>
        <div class="stat-row" style="grid-template-columns:1fr 1fr">
          <div class="stat"><small>Referred players</small><b>${DC.fmt(a.referredCount)}</b></div>
          <div class="stat"><small>They wagered</small><b>${DC.short(a.referredWagered)}</b></div>
          <div class="stat"><small>Accruing</small><b>${DC.fmt(Math.floor(a.earnings.accrued))}</b></div>
          <div class="stat"><small>In review</small><b>${DC.fmt(a.earnings.inReview)}</b></div>
          <div class="stat"><small>Paid to you</small><b class="win">${DC.fmt(a.earnings.approved)}</b></div>
        </div>
        ${a.referredBy ? `<p class="dim">You were referred by ${DC.esc(a.referredBy)}.</p>` : a.canApply ? `<h3>Have a code?</h3><form id="af-apply" class="input-group"><input type="text" id="af-code" maxlength="12" placeholder="Referral code"><button class="btn">Apply</button></form>` : ''}
      </section></div>`;
    const f = document.getElementById('af-apply');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await DC.api('/api/affiliates/apply', { code: document.getElementById('af-code').value }); DC.toast(`Referred by ${r.referrer}`, 'ok'); load(); } catch (ex) { DC.handleError(ex); }
    };
  }
  load();
})();

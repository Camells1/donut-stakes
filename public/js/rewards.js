(async function () {
  const DC = await window.DC.ready;
  const root = document.getElementById('page');
  const FLAV = ['pink', 'glaze', 'blue', 'violet'];
  if (!DC.me) {
    root.innerHTML = `<div class="panel" style="max-width:560px;margin:30px auto;text-align:center"><h1>Rewards</h1><p class="muted">Log in to claim daily bonuses and rakeback.</p><button class="btn primary" id="rw-in">Log in or sign up</button></div>`;
    document.getElementById('rw-in').onclick = () => DC.openAuth('signup');
    return;
  }
  async function load() {
    let r;
    try { r = await DC.api('/api/rewards'); } catch (e) { return DC.handleError(e); }
    const pct = r.next ? Math.min(100, ((r.wagered - r.tier.minWagered) / (r.next.minWagered - r.tier.minWagered)) * 100) : 100;
    root.innerHTML = `<div class="page-grid">
      <section class="panel full"><h1 style="font-size:30px">VIP: ${DC.esc(r.tier.name)}</h1>
        <p class="muted">Tiers go up with total donuts wagered. Higher tiers get a bigger daily bonus and more rakeback.</p>
        <div class="tier-row">${r.tiers.map((t, i) => `<div class="tier ${i === r.tier.index ? 'on' : ''}">${DC.donut({ flavor: FLAV[i % 4] })}<b>${DC.esc(t.name)}</b>
          <small>${DC.short(t.minWagered)}+ wagered</small><small>Daily ${DC.short(t.dailyBonus)}</small><small>${(t.rakeback * 100).toFixed(1)}% rakeback</small></div>`).join('')}</div>
        <div style="margin-top:16px"><div class="progress"><i style="width:${pct}%"></i></div>
        <p class="dim" style="margin-top:6px">${r.next ? `${DC.fmt(r.next.remaining)} more wagered to reach ${DC.esc(r.next.name)}` : 'Top tier reached'}</p></div></section>
      <section class="panel"><h2>Daily bonus</h2><div class="big-amount">${DC.fmt(r.daily.amount)}</div>
        <p class="muted">${r.daily.available ? 'Ready to claim.' : `Next claim ${new Date(r.daily.nextAt).toLocaleString()}`}</p>
        <button class="btn primary" id="rw-daily" ${r.daily.available ? '' : 'disabled'}>Claim daily bonus</button></section>
      <section class="panel"><h2>Rakeback</h2><div class="big-amount">${DC.fmt(r.rakeback.amount)}</div>
        <p class="muted">${(r.rakeback.rate * 100).toFixed(1)}% of your net losses since your last claim (${DC.fmt(r.rakeback.lossSince)}).</p>
        <button class="btn primary" id="rw-rake" ${r.rakeback.amount >= 1 ? '' : 'disabled'}>Claim rakeback</button></section>
      <section class="panel full"><p class="dim" style="margin:0">Claimed so far: ${DC.fmt(r.claimed.bonus)} in daily bonuses, ${DC.fmt(r.claimed.rakeback)} in rakeback. Rewards need a verified account and pause during self-exclusion. Bonuses are in-game donuts with no real-money value.</p></section></div>`;
    const claim = (path) => async () => {
      try { const x = await DC.api(path, {}); DC.setBalance(x.balance); DC.toast(`+${DC.fmt(x.credited)} donuts`, 'ok'); load(); } catch (e) { DC.handleError(e); }
    };
    document.getElementById('rw-daily').onclick = claim('/api/rewards/daily');
    document.getElementById('rw-rake').onclick = claim('/api/rewards/rakeback');
  }
  load();
})();

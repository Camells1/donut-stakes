(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'cases').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  const ids = Object.keys(info.cases);
  let caseId = DC.store.get('dc_case') || ids[0];
  if (!info.cases[caseId]) caseId = ids[0];
  let count = 1, busy = false;
  const FLAVORS = ['choco', 'glaze', 'pink', 'mint', 'blue', 'violet', 'glaze'];
  window.DC.dropHtml = (c, i, value) => {
    const d = c.drops[i];
    const col = ['#74638f', '#a996c4', '#6ad7ff', '#4fe3a6', '#a47cff', '#ff6fb5', '#f6b75c'][Math.min(6, i)];
    return `<div class="drop" style="--c:${col}">${DC.donut({ flavor: FLAVORS[Math.min(6, i)], sprinkles: i > 1 })}<b>${DC.esc(d.name)}</b><span>${value !== undefined ? DC.short(value) : DC.mult(d.multiplier)}</span></div>`;
  };

  const bet = DC.betInput(controls, 'cases');
  controls.querySelector('label.field span').firstChild.textContent = 'Case price ';
  controls.insertAdjacentHTML('beforeend', `
    <div class="field-label">Case</div>
    <div class="case-pick" id="cs-pick">${ids.map((id) => `<button class="btn" data-c="${id}">${DC.donut({ flavor: id === 'golden' ? 'glaze' : id === 'sprinkle' ? 'pink' : 'choco' })}${DC.esc(info.cases[id].name)}</button>`).join('')}</div>
    <div class="field"><div class="field-label">Open</div><div class="seg" id="cs-n">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">${n}</button>`).join('')}</div></div>
    <div class="stat-row" style="margin-top:14px"><div class="stat"><small>Total cost</small><b id="cs-cost"></b></div><div class="stat"><small>RTP</small><b id="cs-rtp"></b></div></div>
    <button class="btn primary big" id="cs-go">Open</button>
    <p class="ctrl-note">${DC.esc(info.simplified)}</p>`);
  stage.innerHTML = `<div class="stage-inner cases-stage"><div id="cs-spinners" style="width:100%;display:grid;gap:8px"></div><div class="case-odds" id="cs-odds"></div></div>`;
  const $ = (id) => document.getElementById(id);

  function sync() {
    const c = info.cases[caseId];
    controls.querySelectorAll('#cs-pick button').forEach((b) => b.classList.toggle('on', b.dataset.c === caseId));
    controls.querySelectorAll('#cs-n button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === count));
    $('cs-cost').textContent = DC.short(bet.get() * count);
    $('cs-rtp').textContent = (c.rtp * 100).toFixed(2) + '%';
    $('cs-odds').innerHTML = c.drops.map((d) => `<span>${DC.esc(d.name)} ${DC.mult(d.multiplier)} &middot; ${(d.chance * 100).toFixed(2)}%</span>`).join('');
    $('cs-spinners').innerHTML = Array.from({ length: count }, (_, i) => `<div class="spinner"><div class="belt" id="belt${i}">${Array.from({ length: 9 }, (_, k) => window.DC.dropHtml(c, rollIdx(c))).join('')}</div></div>`).join('');
    DC.store.set('dc_case', caseId);
  }
  function rollIdx(c) { let x = Math.random() * c.drops.reduce((a, d) => a + d.weight, 0); for (let i = 0; i < c.drops.length; i++) { if (x < c.drops[i].weight) return i; x -= c.drops[i].weight; } return 0; }
  controls.querySelectorAll('#cs-pick button').forEach((b) => (b.onclick = () => { if (!busy) { caseId = b.dataset.c; sync(); } }));
  controls.querySelectorAll('#cs-n button').forEach((b) => (b.onclick = () => { if (!busy) { count = Number(b.dataset.n); sync(); } }));
  bet.input.addEventListener('input', () => { $('cs-cost').textContent = DC.short(bet.get() * count); });

  function spin(i, c, drop, ms) {
    const belt = $('belt' + i);
    const N = 40, W = 100;
    const items = Array.from({ length: N }, () => window.DC.dropHtml(c, rollIdx(c)));
    items[N - 5] = window.DC.dropHtml(c, drop.index, drop.value).replace('class="drop"', 'class="drop won-target"');
    belt.style.transition = 'none'; belt.style.transform = 'translateX(0)';
    belt.innerHTML = items.join('');
    void belt.offsetWidth;
    const view = belt.parentElement.clientWidth;
    const x = (N - 5) * W + 46 - view / 2 + (Math.random() * 50 - 25);
    belt.style.transition = `transform ${ms}ms cubic-bezier(.12,.75,.2,1)`;
    belt.style.transform = `translateX(${-x}px)`;
    return new Promise((res) => setTimeout(() => { belt.querySelector('.won-target').classList.add('won'); res(); }, ms + 50));
  }

  $('cs-go').onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; $('cs-go').disabled = true;
    try {
      const r = await DC.api('/api/games/cases/play', { bet: bet.get(), caseId, count });
      DC.setBalance(r.balance - r.payout);
      const c = info.cases[caseId];
      await Promise.all(r.result.drops.map((d, i) => spin(i, c, d, 3200 + i * 250)));
      DC.setBalance(r.balance); DC.history.add(r.bet);
      if (r.payout > r.bet.bet) DC.pop(stage, true, `+${DC.short(r.payout - r.bet.bet)}`, `${DC.short(r.payout)} in drops`);
      else DC.toast(`Drops worth ${DC.fmt(r.payout)} donuts`);
    } catch (e) { DC.handleError(e); }
    busy = false; $('cs-go').disabled = false;
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'cases');
})();

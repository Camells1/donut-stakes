(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'casebattle').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  const ids = Object.keys(info.cases);
  let caseId = DC.store.get('dc_cb_case') || ids[0];
  if (!info.cases[caseId]) caseId = ids[0];
  let rounds = 3, bots = 1, busy = false;
  const FLAVORS = ['choco', 'glaze', 'pink', 'mint', 'blue', 'violet', 'glaze'];
  const dropHtml = (d, price) => `<div class="drop" style="--c:${['#74638f', '#a996c4', '#6ad7ff', '#4fe3a6', '#a47cff', '#ff6fb5', '#f6b75c'][Math.min(6, d.index)]}">${DC.donut({ flavor: FLAVORS[Math.min(6, d.index)], sprinkles: d.index > 1 })}<b>${DC.esc(d.name)}</b><span>${DC.short(Math.floor(price * d.multiplier))}</span></div>`;

  const bet = DC.betInput(controls, 'casebattle');
  controls.querySelector('label.field span').firstChild.textContent = 'Case price ';
  controls.insertAdjacentHTML('beforeend', `
    <div class="field-label">Case</div>
    <div class="case-pick" id="cb-pick">${ids.map((id) => `<button class="btn" data-c="${id}">${DC.donut({ flavor: id === 'golden' ? 'glaze' : id === 'sprinkle' ? 'pink' : 'choco' })}${DC.esc(info.cases[id].name)}</button>`).join('')}</div>
    <div class="field"><div class="field-label">Rounds</div><div class="seg" id="cb-r">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">${n}</button>`).join('')}</div></div>
    <div class="field" style="margin-top:12px"><div class="field-label">House bots</div><div class="seg" id="cb-b">${[1, 2, 3].map((n) => `<button data-n="${n}">${n}</button>`).join('')}</div></div>
    <div class="stat-row" style="margin-top:14px"><div class="stat"><small>Your cost</small><b id="cb-cost"></b></div><div class="stat"><small>Seats</small><b id="cb-seats"></b></div></div>
    <button class="btn primary big" id="cb-go">Start battle</button>
    <p class="ctrl-note">${DC.esc(info.simplified)}</p>`);
  stage.innerHTML = `<div class="stage-inner cases-stage"><div class="battle" id="cb-battle"></div><div class="bj-msg" id="cb-msg">Highest total takes the whole pot</div></div>`;
  const $ = (id) => document.getElementById(id);

  function seats(list) {
    $('cb-battle').style.setProperty('--seats', list.length);
    $('cb-battle').innerHTML = list.map((s, i) => `<div class="seat ${s.you ? 'you' : ''}" id="seat${i}"><h4>${DC.esc(s.name)}</h4><div class="tot" id="tot${i}">0</div><div class="drops" id="drops${i}" style="display:grid;gap:6px;width:100%"></div></div>`).join('');
  }
  function sync() {
    controls.querySelectorAll('#cb-pick button').forEach((b) => b.classList.toggle('on', b.dataset.c === caseId));
    controls.querySelectorAll('#cb-r button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === rounds));
    controls.querySelectorAll('#cb-b button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === bots));
    $('cb-cost').textContent = DC.short(bet.get() * rounds);
    $('cb-seats').textContent = bots + 1;
    seats([{ name: DC.me ? DC.me.username : 'You', you: true }, ...info.bots.slice(0, bots).map((n) => ({ name: n }))]);
    DC.store.set('dc_cb_case', caseId);
  }
  controls.querySelectorAll('#cb-pick button').forEach((b) => (b.onclick = () => { if (!busy) { caseId = b.dataset.c; sync(); } }));
  controls.querySelectorAll('#cb-r button').forEach((b) => (b.onclick = () => { if (!busy) { rounds = Number(b.dataset.n); sync(); } }));
  controls.querySelectorAll('#cb-b button').forEach((b) => (b.onclick = () => { if (!busy) { bots = Number(b.dataset.n); sync(); } }));
  bet.input.addEventListener('input', () => { $('cb-cost').textContent = DC.short(bet.get() * rounds); });

  $('cb-go').onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; $('cb-go').disabled = true;
    const price = bet.get();
    try {
      const r = await DC.api('/api/games/casebattle/play', { bet: price, caseId, rounds, bots });
      DC.setBalance(r.balance - r.payout);
      const res = r.result;
      seats(res.seats);
      $('cb-msg').textContent = 'Opening...';
      const totals = res.seats.map(() => 0);
      for (let rd = 0; rd < rounds; rd++) {
        await new Promise((ok) => setTimeout(ok, 700));
        res.seats.forEach((s, i) => {
          const d = s.drops[rd];
          totals[i] += d.multiplier;
          $('drops' + i).insertAdjacentHTML('beforeend', dropHtml(d, price));
          $('tot' + i).textContent = DC.short(Math.floor(price * totals[i]));
        });
      }
      await new Promise((ok) => setTimeout(ok, 500));
      $('seat' + res.winner).classList.add('win');
      const winName = res.seats[res.winner].name;
      $('cb-msg').innerHTML = res.winner === 0 ? `<span class="win">You win the pot: ${DC.fmt(r.payout)}</span>` : `<span class="loss">${DC.esc(winName)} wins${res.tiebreak ? ' the tiebreak' : ''}</span>`;
      DC.setBalance(r.balance); DC.history.add(r.bet);
      if (res.winner === 0) DC.pop(stage, true, `+${DC.short(r.payout - r.bet.bet)}`, 'Battle won');
    } catch (e) { DC.handleError(e); }
    busy = false; $('cb-go').disabled = false;
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'casebattle');
})();

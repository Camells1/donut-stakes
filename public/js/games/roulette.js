(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'roulette').info;
  const RED = new Set(info.red);
  const color = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let chips = {};   // key -> { type, value, amount }
  let busy = false;
  let rot = 0;

  const bet = DC.betInput(controls, 'roulette');
  controls.querySelector('label.field span').firstChild.textContent = 'Chip value ';
  controls.insertAdjacentHTML('beforeend', `
    <div class="stat-row"><div class="stat"><small>Total stake</small><b id="ro-total">0</b></div><div class="stat"><small>Chips</small><b id="ro-count">0</b></div></div>
    <button class="btn primary big" id="ro-spin">Spin</button>
    <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:8px"><button class="btn" id="ro-undo">Undo</button><button class="btn" id="ro-clear">Clear</button></div>
    <p class="ctrl-note">Click the board to place chips. Number pays ${DC.mult(info.payouts.number)}, red/black ${DC.mult(info.payouts.red)}, dozens ${DC.mult(info.payouts.dozen)}.</p>`);

  const cells = [];
  cells.push(`<button class="cell green" data-k="number:0" style="grid-row:1 / span 3">0</button>`);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 12; col++) {
      const n = col * 3 + (3 - row);
      cells.push(`<button class="cell ${color(n)}" data-k="number:${n}" style="grid-row:${row + 1};grid-column:${col + 2}">${n}</button>`);
    }
    cells.push(`<button class="cell out" data-k="column:${3 - row}" style="grid-row:${row + 1};grid-column:14">2:1</button>`);
  }
  [1, 2, 3].forEach((d) => cells.push(`<button class="cell out" data-k="dozen:${d}" style="grid-row:4;grid-column:${2 + (d - 1) * 4} / span 4">${['1st', '2nd', '3rd'][d - 1]} 12</button>`));
  [['low', '1-18'], ['even', 'Even'], ['red', ''], ['black', ''], ['odd', 'Odd'], ['high', '19-36']].forEach(([t, l], i) =>
    cells.push(`<button class="cell ${t === 'red' || t === 'black' ? t : 'out'}" data-k="${t}:" style="grid-row:5;grid-column:${2 + i * 2} / span 2">${l || (t === 'red' ? 'Red' : 'Black')}</button>`));

  stage.innerHTML = `<div class="stage-inner roul-stage">
    <div class="roul-top"><div class="roul-wheel"><canvas id="ro-wheel" width="440" height="440"></canvas></div>
      <div class="roul-result"><b id="ro-num">?</b><span class="muted" id="ro-msg">Place your chips</span></div></div>
    <div class="roul-board" id="ro-board">${cells.join('')}</div></div>`;

  // Draw the wheel once; spinning rotates the canvas.
  const wc = document.getElementById('ro-wheel').getContext('2d');
  const N = info.wheel.length, R = 220;
  info.wheel.forEach((n, i) => {
    const a0 = -Math.PI / 2 + ((i - 0.5) * 2 * Math.PI) / N, a1 = a0 + (2 * Math.PI) / N;
    wc.beginPath(); wc.moveTo(R, R); wc.arc(R, R, R - 6, a0, a1); wc.closePath();
    wc.fillStyle = n === 0 ? '#23845a' : RED.has(n) ? '#b8323d' : '#1f1f24'; wc.fill();
    wc.strokeStyle = '#0d0d0f'; wc.lineWidth = 2; wc.stroke();
    wc.save(); wc.translate(R, R); wc.rotate((a0 + a1) / 2 + Math.PI / 2);
    wc.fillStyle = '#fff'; wc.font = '600 19px system-ui, sans-serif'; wc.textAlign = 'center'; wc.fillText(String(n), 0, -R + 34); wc.restore();
  });
  wc.beginPath(); wc.arc(R, R, R - 60, 0, Math.PI * 2); wc.fillStyle = '#151518'; wc.fill();
  const hub = new Image();
  hub.onload = () => wc.drawImage(hub, R - 110, R - 110, 220, 220);
  hub.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(DC.donut({ flavor: 'pink' }).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
  const wheelEl = document.getElementById('ro-wheel');

  const history = [];
  function renderChips() {
    document.querySelectorAll('#ro-board .chip').forEach((c) => c.remove());
    let total = 0;
    for (const [k, c] of Object.entries(chips)) {
      total += c.amount;
      const el = document.querySelector(`#ro-board [data-k="${k}"]`);
      if (el) el.insertAdjacentHTML('beforeend', `<span class="chip">${DC.short(c.amount)}</span>`);
    }
    document.getElementById('ro-total').textContent = DC.short(total);
    document.getElementById('ro-count').textContent = Object.keys(chips).length;
  }
  document.getElementById('ro-board').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || busy) return;
    const k = cell.dataset.k;
    const [type, value] = k.split(':');
    const amount = bet.get();
    chips[k] = chips[k] || { type, value: value === '' ? null : Number(value), amount: 0 };
    chips[k].amount += amount;
    history.push([k, amount]);
    document.querySelectorAll('#ro-board .hit').forEach((c) => c.classList.remove('hit'));
    renderChips();
  });
  document.getElementById('ro-undo').onclick = () => {
    const last = history.pop();
    if (!last) return;
    chips[last[0]].amount -= last[1];
    if (chips[last[0]].amount <= 0) delete chips[last[0]];
    renderChips();
  };
  document.getElementById('ro-clear').onclick = () => { chips = {}; history.length = 0; renderChips(); };

  const spinBtn = document.getElementById('ro-spin');
  spinBtn.onclick = async () => {
    if (busy) return;
    const list = Object.values(chips);
    if (!list.length) return DC.toast('Place a chip on the board first', 'err');
    if (!DC.canPlay()) return;
    busy = true; spinBtn.disabled = true;
    try {
      const r = await DC.api('/api/games/roulette/play', { bets: list });
      DC.setBalance(r.balance - r.payout);
      const idx = info.wheel.indexOf(r.result.number);
      const target = -(idx * 360) / N;
      rot = rot - (((rot % 360) + 360) % 360) + 360 * 5 + (((target % 360) + 360) % 360);
      wheelEl.style.transform = `rotate(${rot}deg)`;
      document.getElementById('ro-num').className = '';
      document.getElementById('ro-num').textContent = '?';
      setTimeout(() => {
        const n = r.result.number;
        const numEl = document.getElementById('ro-num');
        numEl.textContent = n; numEl.className = r.result.color;
        document.getElementById('ro-msg').innerHTML = r.payout ? `<span class="win">Won ${DC.fmt(r.payout)}</span>` : `<span class="loss">No win</span>`;
        document.querySelector(`#ro-board [data-k="number:${n}"]`).classList.add('hit');
        r.result.lines.filter((l) => l.win).forEach((l) => { const el = document.querySelector(`#ro-board [data-k="${l.type}:${l.value ?? ''}"]`); if (el) el.classList.add('hit'); });
        DC.setBalance(r.balance);
        DC.history.add(r.bet);
        if (r.payout) DC.pop(stage, true, `+${DC.short(r.payout)}`, `${n} ${r.result.color}`);
        busy = false; spinBtn.disabled = false;
      }, 3300);
    } catch (e) { DC.handleError(e); busy = false; spinBtn.disabled = false; }
  };
  renderChips();
  DC.history.mount(document.getElementById('history'), 'roulette');
})();

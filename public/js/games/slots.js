(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'slots').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let busy = false;

  const FLAVOR = { gold: 'glaze', pink: 'pink', choco: 'choco', mint: 'mint', blue: 'blue' };
  const sym = (id) => (id === 'blank' ? '<div class="sym blank"><span>CRUMBS</span></div>' : `<div class="sym">${DC.donut({ flavor: FLAVOR[id] })}</div>`);
  const ids = info.symbols.map((s) => s.id);
  const rand = () => ids[Math.floor(Math.random() * ids.length)];

  const bet = DC.betInput(controls, 'slots');
  controls.insertAdjacentHTML('beforeend', `
    <button class="btn primary big" id="sl-spin">Spin</button>
    <h3 style="margin:18px 0 6px">Paytable</h3>
    <table class="paytable" id="sl-pay">${info.paytable.map((p) => `<tr data-r="${p.id}"><td>${DC.esc(p.label)}</td><td>${DC.mult(p.multiplier)}</td></tr>`).join('')}</table>
    <p class="ctrl-note">RTP ${(info.rtp * 100).toFixed(2)}%. Only the best matching line pays.</p>`);
  stage.innerHTML = `<div class="stage-inner slots-stage"><div class="slot-machine">${[0, 1, 2].map((i) => `<div class="reel" id="reel${i}"><div class="strip">${sym(rand())}</div></div>`).join('')}</div>
    <div class="bj-msg" id="sl-msg">Good luck!</div></div>`;

  const spinBtn = document.getElementById('sl-spin');
  function spinTo(i, final, ms) {
    const reel = document.getElementById('reel' + i);
    reel.classList.remove('win');
    const strip = reel.querySelector('.strip');
    const n = 18 + i * 6;
    const syms = [strip.firstElementChild.outerHTML];
    for (let k = 1; k < n; k++) syms.push(sym(rand()));
    syms.push(sym(final));
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    strip.innerHTML = syms.join('');
    void strip.offsetHeight;
    const h = reel.getBoundingClientRect().height;
    strip.style.transition = `transform ${ms}ms cubic-bezier(.15,.75,.25,1.04)`;
    strip.style.transform = `translateY(${-n * h}px)`;
    return new Promise((res) => setTimeout(() => { strip.style.transition = 'none'; strip.innerHTML = sym(final); strip.style.transform = 'translateY(0)'; res(); }, ms + 30));
  }

  spinBtn.onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; spinBtn.disabled = true;
    document.querySelectorAll('#sl-pay tr').forEach((t) => t.classList.remove('hit'));
    try {
      const r = await DC.api('/api/games/slots/play', { bet: bet.get() });
      DC.setBalance(r.balance - r.payout);
      document.getElementById('sl-msg').textContent = '';
      await Promise.all(r.result.reels.map((s, i) => spinTo(i, s, 900 + i * 350)));
      const msg = document.getElementById('sl-msg');
      if (r.payout) {
        msg.innerHTML = `<span class="win">${DC.mult(r.multiplier)} - won ${DC.fmt(r.payout)}</span>`;
        document.querySelectorAll('.reel').forEach((e) => e.classList.add('win'));
        const row = document.querySelector(`#sl-pay tr[data-r="${r.result.rule}"]`);
        if (row) row.classList.add('hit');
        DC.pop(stage, true, DC.mult(r.multiplier), `+${DC.fmt(r.payout)} donuts`);
      } else msg.innerHTML = '<span class="muted">No win this time</span>';
      DC.setBalance(r.balance);
      DC.history.add(r.bet);
    } catch (e) { DC.handleError(e); }
    busy = false; spinBtn.disabled = false;
  };
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); spinBtn.click(); } });
  DC.history.mount(document.getElementById('history'), 'slots');
})();

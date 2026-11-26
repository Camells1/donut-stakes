(async function () {
  const DC = await window.DC.ready;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let from = Number(DC.store.get('dc_sl_from')) || 40;
  let width = Number(DC.store.get('dc_sl_width')) || 20;
  let busy = false, pos = 0, dir = 1, raf = null;

  const bet = DC.betInput(controls, 'slider');
  controls.insertAdjacentHTML('beforeend', `
    <label class="field"><span>Zone start <b id="sd-from-v"></b></span><input type="range" id="sd-from" min="0" max="99" step="0.5"></label>
    <label class="field"><span>Zone width <b id="sd-w-v"></b></span><input type="range" id="sd-w" min="1" max="95" step="0.5"></label>
    <div class="stat-row"><div class="stat"><small>Win chance</small><b id="sd-ch"></b></div><div class="stat"><small>Pays</small><b id="sd-m"></b></div></div>
    <button class="btn primary big" id="sd-go">Stop!</button>
    <p class="ctrl-note">The slider runs across the track. Press Stop: the server picks where it stops.</p>`);
  stage.innerHTML = `<div class="stage-inner slider-stage"><div class="dice-result" id="sd-res">--.--</div>
    <div class="sl-track"><div class="sl-zone" id="sd-zone"></div><div class="sl-knob" id="sd-knob"></div></div>
    <div class="dice-scale" style="width:min(100%,640px)"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
    <div class="dice-recent" id="sd-recent"></div></div>`;
  const $ = (id) => document.getElementById(id);

  function sync() {
    width = Math.min(95, Math.max(1, width));
    from = Math.min(100 - width, Math.max(0, from));
    $('sd-from').value = from; $('sd-w').value = width;
    $('sd-from-v').textContent = `${from.toFixed(1)} - ${(from + width).toFixed(1)}`;
    $('sd-w-v').textContent = width.toFixed(1);
    $('sd-zone').style.left = from + '%'; $('sd-zone').style.width = width + '%';
    $('sd-ch').textContent = width.toFixed(1) + '%';
    $('sd-m').textContent = DC.mult(Math.floor((0.99 / (width / 100)) * 10000) / 10000);
    DC.store.set('dc_sl_from', from); DC.store.set('dc_sl_width', width);
  }
  $('sd-from').oninput = () => { from = Number($('sd-from').value); sync(); };
  $('sd-w').oninput = () => { width = Number($('sd-w').value); sync(); };

  const knob = $('sd-knob');
  function run() {
    pos += dir * 1.6;
    if (pos >= 100) { pos = 100; dir = -1; } if (pos <= 0) { pos = 0; dir = 1; }
    knob.style.left = pos + '%';
    raf = requestAnimationFrame(run);
  }
  run();

  $('sd-go').onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; $('sd-go').disabled = true;
    try {
      const r = await DC.api('/api/games/slider/play', { bet: bet.get(), from, to: Math.round((from + width) * 100) / 100 });
      DC.setBalance(r.balance - r.payout);
      cancelAnimationFrame(raf);
      knob.style.transition = 'left .5s cubic-bezier(.2,.9,.3,1)';
      knob.style.left = r.result.stop + '%';
      knob.className = 'sl-knob';
      setTimeout(() => {
        knob.className = 'sl-knob ' + (r.result.win ? 'win' : 'loss');
        $('sd-res').textContent = r.result.stop.toFixed(2);
        $('sd-res').className = 'dice-result ' + (r.result.win ? 'win' : 'loss');
        DC.setBalance(r.balance); DC.history.add(r.bet);
        $('sd-recent').insertAdjacentHTML('afterbegin', `<span class="${r.result.win ? 'win' : 'loss'}">${r.result.stop.toFixed(2)}</span>`);
        while ($('sd-recent').children.length > 8) $('sd-recent').lastElementChild.remove();
        if (r.result.win) DC.pop(stage, true, DC.mult(r.multiplier), `+${DC.fmt(r.payout)} donuts`);
        setTimeout(() => { knob.style.transition = ''; pos = r.result.stop; run(); busy = false; $('sd-go').disabled = false; }, 900);
      }, 520);
    } catch (e) { DC.handleError(e); busy = false; $('sd-go').disabled = false; }
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'slider');
})();

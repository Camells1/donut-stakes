// Optional "Neon slots" theme + sound effects. Cosmetic only: it never changes bets,
// odds, results or flow. Rules kept on purpose:
// - no near-miss effects (a loss always looks and sounds the same, however close)
// - a win sound only when the payout is MORE than the stake (no "loss dressed as a win")
// - no countdowns, urgency, auto-play or messages that push more betting
// - the 18+ gate and responsible-gambling pages are not touched
(async function () {
  const DC = await window.DC.ready;
  const store = DC.store;
  const root = document.documentElement;
  // The loud theme is the default now. Players who picked Minimal keep it (stored choice).
  const theme = () => (store.get('dc_theme') === 'minimal' ? 'minimal' : 'flashy');
  for (const href of ['/css/flashy.css', '/css/slop.css']) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }
  root.dataset.theme = theme();

  // ---------- sounds (WebAudio, synthesized; nothing downloaded) ----------
  let actx = null;
  const muted = () => store.get('dc_sound') === 'off';
  function tone(freq, start, dur, type = 'triangle', vol = 0.08, freqEnd) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, actx.currentTime + start);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, actx.currentTime + start + dur);
    g.gain.setValueAtTime(0.0001, actx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, actx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + start + dur);
    o.connect(g).connect(actx.destination);
    o.start(actx.currentTime + start);
    o.stop(actx.currentTime + start + dur + 0.02);
  }
  function play(kind) {
    if (theme() !== 'flashy' || muted()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      if (kind === 'click') tone(1400, 0, 0.04, 'square', 0.025);
      if (kind === 'spin') tone(220, 0, 0.16, 'sawtooth', 0.03, 660);
      if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.16, 'triangle', 0.07));
      if (kind === 'done') tone(330, 0, 0.09, 'sine', 0.04);   // neutral end-of-round tick for any non-win
    } catch { /* audio not available */ }
  }

  // ---------- cosmetic hooks (wrap display helpers only) ----------
  const api = DC.api;
  DC.api = function (path, body, method) {
    if (body !== undefined && /^\/api\/games\/[^/]+\/(play|start|reveal|pick|step|guess|hit|stand|double)$/.test(path) && theme() === 'flashy') {
      play('spin');
      const stage = document.getElementById('stage');
      if (stage) { stage.classList.remove('dc-spinning'); void stage.offsetWidth; stage.classList.add('dc-spinning'); }
    }
    return api.call(this, path, body, method);
  };
  const add = DC.history.add.bind(DC.history);
  DC.history.add = function (b) {
    play(b && b.payout > b.bet ? 'win' : 'done');
    return add(b);
  };
  document.addEventListener('click', (e) => { if (e.target.closest('.btn, .seg button')) play('click'); });

  // ---------- switch in the footer ----------
  function render() {
    const foot = document.querySelector('.site-footer .inner');
    if (!foot) return;
    let box = foot.querySelector('.theme-switch');
    if (!box) { box = document.createElement('span'); box.className = 'theme-switch'; foot.insertBefore(box, foot.querySelector('.disclaimer')); }
    const t = theme();
    box.innerHTML = `<span class="dim">Theme</span><span class="seg"><button data-t="minimal" class="${t === 'minimal' ? 'on' : ''}">Minimal</button><button data-t="flashy" class="${t === 'flashy' ? 'on' : ''}">Neon slots</button></span>
      ${t === 'flashy' ? `<button class="btn small ghost" id="dc-sound" aria-pressed="${!muted()}">Sound: ${muted() ? 'off' : 'on'}</button>` : ''}`;
    box.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => setTheme(b.dataset.t)));
    const s = box.querySelector('#dc-sound');
    if (s) s.onclick = () => { store.set('dc_sound', muted() ? 'on' : 'off'); render(); };
  }
  function setTheme(t) {
    if (t === 'flashy') root.dataset.theme = 'flashy'; else delete root.dataset.theme;
    store.set('dc_theme', t);
    const main = document.querySelector('main');
    if (main && t === 'flashy') { main.classList.remove('dc-reel-in'); void main.offsetWidth; main.classList.add('dc-reel-in'); }
    render();
  }
  render();
  if (theme() === 'flashy') { const main = document.querySelector('main'); if (main) main.classList.add('dc-reel-in'); }
})();

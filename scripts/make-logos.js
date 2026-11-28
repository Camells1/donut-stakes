// Generates the Donut Stakes logo set into public/img/logos/. Run: node scripts/make-logos.js
// Every game gets its own symbol (drawn with SVG shapes, no letters), on a glossy gradient tile
// with a donut ring. All art is original.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'img', 'logos');
fs.mkdirSync(OUT, { recursive: true });

const INK = '#120a1f';
const W = '#ffffff';

// Each motif draws inside a 120x120 box, centred on (60,60). Returns SVG markup.
const MOTIFS = {
  // plinko: pegs in a triangle with a donut ball dropping through
  plinko: () => [0, 1, 2, 3].map((r) => [0, 1, 2, 3].slice(0, 4 - r).map((_, c) => {
    const x = 60 + (c - (3 - r) / 2) * 16, y = 36 + r * 13;
    return `<circle cx="${x}" cy="${y}" r="3.6" fill="${W}"/>`;
  }).join('')).join('') + `<circle cx="60" cy="22" r="7" fill="none" stroke="${W}" stroke-width="3"/><circle cx="60" cy="22" r="2.5" fill="${W}"/>`,
  // mines: a gem over a grid of tiles
  mines: () => `<g fill="${W}" opacity=".35">${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${32 + c * 22}" y="${32 + r * 22}" width="18" height="18" rx="4"/>`).join('')).join('')}</g>
    <path d="M60 30 L82 48 L74 80 L46 80 L38 48 Z" fill="${W}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M38 48 L82 48 M60 30 L52 48 L60 80 L68 48 L60 30" fill="none" stroke="${INK}" stroke-opacity=".45" stroke-width="2.5"/>`,
  // coinflip: a coin on its edge with a star
  coinflip: () => `<ellipse cx="60" cy="60" rx="22" ry="30" fill="${W}" stroke="${INK}" stroke-width="3"/><ellipse cx="60" cy="60" rx="14" ry="22" fill="none" stroke="${INK}" stroke-opacity=".4" stroke-width="2.5"/><path d="M60 46 L63.5 56 L74 56 L65.5 62 L68.5 72 L60 66 L51.5 72 L54.5 62 L46 56 L56.5 56 Z" fill="${INK}" opacity=".7"/>`,
  // dice: a rounded die with pips
  dice: () => `<rect x="34" y="34" width="52" height="52" rx="12" fill="${W}" stroke="${INK}" stroke-width="3"/>${[[44, 44], [60, 60], [76, 76], [76, 44], [44, 76]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${INK}"/>`).join('')}`,
  // limbo: a rising multiplier arrow over bars
  limbo: () => `<g fill="${W}" opacity=".4"><rect x="32" y="66" width="8" height="18" rx="2"/><rect x="46" y="58" width="8" height="26" rx="2"/><rect x="60" y="50" width="8" height="34" rx="2"/></g><path d="M34 52 L62 34 L76 40 L88 26" fill="none" stroke="${W}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M80 24 L90 24 L90 34" fill="none" stroke="${W}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // crash: a climbing line graph
  crash: () => `<path d="M30 84 L30 36" stroke="${W}" stroke-width="3" stroke-linecap="round" opacity=".5"/><path d="M30 84 L90 84" stroke="${W}" stroke-width="3" stroke-linecap="round" opacity=".5"/><path d="M34 76 C48 74 54 66 62 58 S78 40 88 30" fill="none" stroke="${W}" stroke-width="6" stroke-linecap="round"/><circle cx="88" cy="30" r="6" fill="${INK}" stroke="${W}" stroke-width="3"/>`,
  // roulette: a wheel with spokes and a ball
  roulette: () => `<circle cx="60" cy="60" r="28" fill="${W}" stroke="${INK}" stroke-width="3"/><circle cx="60" cy="60" r="16" fill="none" stroke="${INK}" stroke-opacity=".5" stroke-width="3"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const r = (a * Math.PI) / 180; return `<line x1="${60 + Math.cos(r) * 16}" y1="${60 + Math.sin(r) * 16}" x2="${60 + Math.cos(r) * 28}" y2="${60 + Math.sin(r) * 28}" stroke="${INK}" stroke-width="2.5"/>`; }).join('')}<circle cx="78" cy="42" r="5" fill="${INK}"/>`,
  // blackjack: two fanned playing cards
  blackjack: () => `<rect x="36" y="32" width="34" height="48" rx="6" fill="${W}" transform="rotate(-14 53 56)" stroke="${INK}" stroke-width="2.5"/><rect x="50" y="34" width="34" height="48" rx="6" fill="${W}" transform="rotate(10 67 58)" stroke="${INK}" stroke-width="2.5"/><path d="M68 50 L74 60 L68 70 L62 60 Z" fill="#ff3d6e" transform="rotate(10 67 58)"/>`,
  // slots: three reels with a golden jackpot line
  slots: () => `<rect x="28" y="36" width="64" height="48" rx="8" fill="${INK}" opacity=".35"/>${[40, 60, 80].map((x) => `<rect x="${x - 9}" y="42" width="18" height="36" rx="4" fill="${W}"/><circle cx="${x}" cy="60" r="6" fill="${INK}" opacity=".75"/>`).join('')}<path d="M30 60 L90 60" stroke="#ffd166" stroke-width="2" stroke-dasharray="3 4"/>`,
  // hilo: up and down arrows
  hilo: () => `<path d="M46 62 L60 46 L74 62" fill="none" stroke="${W}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 78 L60 62 L74 78" fill="none" stroke="${W}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`,
  // keno: a 4x4 grid with a few numbers marked
  keno: () => `${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => { const hit = (r + c) % 3 === 0; return `<circle cx="${40 + c * 13}" cy="${40 + r * 13}" r="5.2" fill="${hit ? '#ffd166' : W}" opacity="${hit ? 1 : 0.45}"/>`; }).join('')).join('')}`,
  // towers: stacked blocks climbing up
  towers: () => `<rect x="44" y="72" width="32" height="12" rx="3" fill="${W}"/><rect x="48" y="58" width="24" height="12" rx="3" fill="${W}" opacity=".85"/><rect x="52" y="44" width="16" height="12" rx="3" fill="${W}" opacity=".7"/><path d="M60 26 L66 36 L54 36 Z" fill="#ffd166"/>`,
  // chicken: a road with a dashed centre line and an arrow across it
  chicken: () => `<rect x="26" y="50" width="68" height="20" rx="4" fill="${INK}" opacity=".4"/><path d="M34 60 L80 60" stroke="${W}" stroke-width="3" stroke-dasharray="6 6"/><path d="M70 50 L86 60 L70 70" fill="none" stroke="#ffd166" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // diceduel: two dice facing off
  diceduel: () => `<rect x="24" y="44" width="34" height="34" rx="8" fill="${W}" stroke="${INK}" stroke-width="2.5"/>${[[35, 55], [47, 67], [47, 55]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${INK}"/>`).join('')}<rect x="62" y="36" width="34" height="34" rx="8" fill="${W}" stroke="${INK}" stroke-width="2.5"/>${[[72, 46], [86, 60], [86, 46], [72, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${INK}"/>`).join('')}`,
  // slider: a bar with a target zone and a marker
  slider: () => `<rect x="28" y="56" width="64" height="8" rx="4" fill="${W}" opacity=".45"/><rect x="58" y="52" width="16" height="16" rx="4" fill="#ffd166"/><path d="M66 36 L66 48" stroke="${W}" stroke-width="4" stroke-linecap="round"/><circle cx="66" cy="34" r="5" fill="${W}"/>`,
  // rps: a rock, a sheet and scissors blades, drawn as shapes
  rps: () => `<circle cx="40" cy="60" r="11" fill="${W}"/><path d="M60 50 L80 60 L60 70 Z" fill="${W}" opacity=".9"/><path d="M76 46 L92 36 M76 74 L92 84" stroke="${W}" stroke-width="5" stroke-linecap="round"/><circle cx="92" cy="60" r="7" fill="none" stroke="${W}" stroke-width="4"/>`,
  // baccarat: a suit diamond with a banker line
  baccarat: () => `<path d="M60 26 L84 60 L60 94 L36 60 Z" fill="${W}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M40 60 L80 60" stroke="${INK}" stroke-opacity=".4" stroke-width="2.5"/><circle cx="60" cy="60" r="6" fill="#ff3d6e"/>`,
  // upgrader: a box lifting an arrow
  upgrader: () => `<rect x="38" y="62" width="44" height="28" rx="6" fill="${W}" stroke="${INK}" stroke-width="2.5"/><path d="M60 52 L60 26 M48 38 L60 26 L72 38" fill="none" stroke="${W}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // cases: a treasure chest with a latch
  cases: () => `<path d="M32 58 Q32 40 60 40 Q88 40 88 58 Z" fill="${W}"/><rect x="32" y="58" width="56" height="28" rx="4" fill="${W}" stroke="${INK}" stroke-width="2.5" stroke-opacity=".5"/><rect x="54" y="56" width="12" height="12" rx="2" fill="${INK}" opacity=".7"/>`,
  // casebattle: two crossed swords
  casebattle: () => `<path d="M36 36 L84 84 M84 36 L36 84" stroke="${W}" stroke-width="6" stroke-linecap="round"/><circle cx="36" cy="36" r="5" fill="${W}"/><circle cx="84" cy="36" r="5" fill="${W}"/><circle cx="60" cy="60" r="8" fill="${INK}" opacity=".5"/>`,
  // site: the donut itself, with a sparkle
  'donut-stakes': () => `<circle cx="60" cy="60" r="30" fill="none" stroke="${INK}" stroke-opacity=".35" stroke-width="18"/><circle cx="60" cy="60" r="30" fill="none" stroke="${W}" stroke-width="18" stroke-dasharray="2 0"/>${[[40, 46], [62, 36], [74, 66], [48, 74], [84, 48]].map(([x, y], i) => `<rect x="${x - 2.5}" y="${y - 2.5}" width="5" height="5" rx="1" fill="${['#ffd166', '#3ef0ff', '#ffd166', '#ff3fa4', '#3ef0ff'][i]}" transform="rotate(${i * 30} ${x} ${y})"/>`).join('')}<path d="M94 22 L96 28 L102 30 L96 32 L94 38 L92 32 L86 30 L92 28 Z" fill="#ffd166"/>`,
};

// Gradient pairs per game
const COLORS = {
  plinko: ['#ff3fa4', '#b56cff'], mines: ['#3ef0ff', '#2a6bff'], coinflip: ['#ffd166', '#ff8a00'],
  dice: ['#7cff6b', '#00b38a'], limbo: ['#ff7a3d', '#ff3fa4'], crash: ['#ff3d3d', '#ffd166'],
  roulette: ['#ff3d6e', '#5a0b24'], blackjack: ['#2ee6a6', '#0f6b52'], slots: ['#ffd166', '#ff3fa4'],
  hilo: ['#5ef2ff', '#7b5cff'], keno: ['#ffb84d', '#ff5e3a'], towers: ['#b56cff', '#3ef0ff'],
  chicken: ['#ffe066', '#ff9f1c'], diceduel: ['#ff6ad5', '#6a5cff'], slider: ['#3ef0ff', '#ffd166'],
  rps: ['#9be15d', '#00c2a8'], baccarat: ['#f7d46a', '#7a1f3d'], upgrader: ['#ff8fd8', '#ffd166'],
  cases: ['#ffd166', '#b56cff'], casebattle: ['#ff3fa4', '#3ef0ff'],
  'donut-stakes': ['#ff3fa4', '#ffd166'],
};

// Picture only: no tile, no ring. The symbol itself is filled with the game's gradient.
// White parts become the gradient; dark ink stays dark so the shapes still read on any background.
function logo(id) {
  const [a, b] = COLORS[id];
  const g = `g-${id}`;
  const art = MOTIFS[id]().split(W).join(`url(#${g})`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="20" y1="20" x2="100" y2="100"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
  </defs>
  ${art}
</svg>
`;
}

const ids = [...Object.keys(COLORS)];
for (const id of ids) fs.writeFileSync(path.join(OUT, `${id}.svg`), logo(id));
fs.writeFileSync(path.join(OUT, 'donut-stakes.svg'), logo('donut-stakes'));
console.log(`wrote ${ids.length} logos to ${OUT}`);

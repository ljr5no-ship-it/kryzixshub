/**
 * Assembles dist/index.html.
 *
 * Two sources, neither of them rewritten by hand:
 *   - the Duel file  -> Crash, Mines, Limbo, Keno, Beef, Blackjack
 *   - .backup-index  -> Snake, Tetris, Breakout, 2048, Minesweeper, Pong, TTT
 *
 * On top of those this writes a new monochrome shell: sidebar, topbar, admin
 * panel, iframe apps, and the Chrome "No internet" bait screen the whole thing
 * hides behind.
 *
 * Run: node build.js
 */
const fs = require('fs');
const path = require('path');

const DUEL = process.argv[2] || 'C:/Users/kryzi/Downloads/updated fixed duel html.html';
const ARCADE_SRC = path.join(__dirname, '.backup-index.html');
const OUT = path.join(__dirname, 'dist', 'index.html');

const src = fs.readFileSync(DUEL, 'utf8');

/* ---------- split the Duel source ---------- */
const styleStart = src.indexOf('<style>') + '<style>'.length;
const styleEnd = src.indexOf('</style>');
let styles = src.slice(styleStart, styleEnd);

// The LAST <script>, not the first — the source has a small inline closeWheel
// helper part-way down the markup. Splitting on that one left the SVG sprite
// sheet inside the script block, which only survived because the HTML parser
// ends a script at the first literal </script> it sees.
const scriptStart = src.lastIndexOf('<script>');
let duelBody = src.slice(styleEnd + '</style>'.length, scriptStart);
let duelScript = src.slice(scriptStart + '<script>'.length, src.lastIndexOf('</script>'));

// The <defs> must live outside the deck so <use href="#cow"> still resolves.
const defsStart = duelBody.indexOf('<svg width="0" height="0"');
let svgDefs = defsStart === -1 ? '' : duelBody.slice(defsStart);

// Strip the MWP branding the cow sprite was carrying.
svgDefs = svgDefs
  .replace(/<text[^>]*>MWP<\/text>\s*/g, '')
  .replace(/,\s*MWP branded/g, '');

// Keep only the wheel modal from the old markup; the rest of the shell is new.
const wheelStart = duelBody.indexOf('<div class="modal-back" id="wheelModal">');
const wheelEnd = duelBody.indexOf('</script>', wheelStart) + '</script>'.length;
const wheelModal = duelBody.slice(wheelStart, wheelEnd);

duelScript = duelScript.replace(/Duel/g, 'KryzixsDEX');

/* ---------- lift the arcade games ---------- */
const arcadeSrc = fs.readFileSync(ARCADE_SRC, 'utf8');
const aLines = arcadeSrc.split('\n');
const aStart = aLines.findIndex(l => l.includes('/* ---- SNAKE ---- */'));
const aEnd = aLines.findIndex(l => l.includes('/* ---- registry ---- */'));
let arcade = aLines.slice(aStart, aEnd).join('\n');
// Namespace the DOM classes so they cannot collide with Duel's own .mines/.ttt.
arcade = arcade.replace(/className='ttt'/g, "className='ar-ttt'")
               .replace(/className='g2048'/g, "className='ar-2048'")
               .replace(/className='mines'/g, "className='ar-mines'");

// Snake gated its whole frame — drawing included — behind the movement tick,
// so the board stayed empty until frame 7 and never appeared at all when
// frames were scarce. Move on the tick; paint every frame.
arcade = arcade.replace(
  "    if(++tick % Math.max(2,Math.round(60/speed)) !== 0) return;\n    if(!dead){",
  "    const stepNow = (++tick % Math.max(2,Math.round(60/speed))) === 0;\n    if(stepNow && !dead){"
);
if (!arcade.includes('stepNow')) throw new Error('snake loop patch did not apply');

/* ---------- monochrome palette ---------- */
styles = styles
  .replace(/--bg:#0E1230; --bg-2:#151A3D; --panel:#1B2150; --panel-2:#232A63;/,
           '--bg:#0A0A0A; --bg-2:#101010; --panel:#151515; --panel-2:#1F1F1F;')
  .replace(/--text:#E8ECFF; --muted:#8B93C7; --muted-2:#5C64A0;/,
           '--text:#FAFAFA; --muted:#A1A1A1; --muted-2:#6B6B6B;')
  .replace(/--accent:#6C5CE7; --accent-2:#8E7BFF;/,
           '--accent:#FFFFFF; --accent-2:#E5E5E5;')
  .replace(/--green:#3DDC97; --red:#FF5A6B; --gold:#F5C24B; --pink:#FF6BB5; --cyan:#4CC9E8;/,
           '--green:#FFFFFF; --red:#787878; --gold:#FFFFFF; --pink:#D4D4D4; --cyan:#D4D4D4;')
  .replace(/--asphalt:#2a2f4a;/, '--asphalt:#1B1B1B;')
  .replace(/#2a3170/g, '#2A2A2A')
  .replace(/rgba\(108,92,231,[.\d]+\)/g, 'rgba(255,255,255,.14)')
  .replace(/rgba\(255,107,181,[.\d]+\)/g, 'rgba(255,255,255,.08)')
  .replace(/rgba\(61,220,151,[.\d]+\)/g, 'rgba(255,255,255,.06)')
  // tile caption scrim and badge text still carried a blue cast
  .replace(/rgba\(6,8,25,([.\d]+)\)/g, 'rgba(0,0,0,$1)')
  .replace(/#D6DCFF/g, '#E5E5E5');

const shell = `
/* ================= KryzixsDEX shell ================= */
:root{
  --sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --serif:'Newsreader',Georgia,serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --r:10px;

  /* The arcade games paint through these names. Without them getPropertyValue
     returns an empty string, ctx.fillStyle keeps its previous value, and every
     game renders black on black — running perfectly and completely invisible. */
  --surface:#151515; --surface-2:#101010; --surface-3:#2A2A2A;
  --ink:#FAFAFA; --ink-2:#A1A1A1; --ink-3:#6B6B6B;
  --line-2:rgba(255,255,255,.18);
  --accent-ink:#0A0A0A; --warn:#C9C9C9; --dead:#7A7A7A;
}
body.deck-on{background:var(--bg);color:var(--text);font-family:var(--sans)}

/* Everything the source draws in colour is flattened — the whole app is black
   and white, games included. */
#deck .art, #deck .tile svg, #deck .hero .art, #deck svg.skyline{filter:grayscale(1) contrast(1.06)}

/* ================= monochrome casino theme =================
   The games keep the source's LAYOUT but none of its colour. The palette is
   re-declared to greys, hard-coded colours are overridden, and each game stage
   is greyscaled so felt, cards, chips, the crash line and the cow all render
   B&W without editing the drawing code. */
body.casino-on #app{
  --bg:#0A0A0A; --bg-2:#0E0E0E; --panel:#151515; --panel-2:#1F1F1F;
  --line:rgba(255,255,255,.10); --text:#FAFAFA; --muted:#9A9A9A; --muted-2:#6B6B6B;
  --accent:#FFFFFF; --accent-2:#E2E2E2;
  --green:#FAFAFA; --red:#8A8A8A; --gold:#FAFAFA; --pink:#C9C9C9; --cyan:#C9C9C9;
  background:var(--bg);
}
body.casino-on #app .game-wrap{height:calc(100vh - 58px)}
@media (max-width:900px){ body.casino-on #app .game-wrap{height:auto} }

/* flatten any colour still baked into the play area */
body.casino-on #app .stage,
body.casino-on #app #bjStage,
body.casino-on #app #beefStage,
body.casino-on #app .stage canvas{filter:grayscale(1) contrast(1.04)}

/* --- restyle: a cleaner, flatter, more premium mono look --- */
body.casino-on #app .panel{background:var(--panel);border:1px solid var(--line);border-radius:16px}
body.casino-on #app .stage{background:linear-gradient(180deg,#121212,#0C0C0C);border:1px solid var(--line);border-radius:16px}
/* segmented control as underline tabs */
body.casino-on #app .modeswitch{background:transparent;border-bottom:1px solid var(--line);border-radius:0;padding:0;gap:0;margin-bottom:18px}
body.casino-on #app .modeswitch button{border-radius:0;padding:10px 0;border-bottom:2px solid transparent;color:var(--muted)}
body.casino-on #app .modeswitch button.on{background:transparent;color:var(--text);border-bottom-color:var(--text)}
/* primary action: solid white, dark text, presses down */
body.casino-on #app .btn-primary{background:var(--text);color:#0A0A0A;border-radius:12px;font-weight:800;
  letter-spacing:.01em;transition:filter .15s,transform .1s}
body.casino-on #app .btn-primary:hover:not(:disabled){background:#fff;filter:brightness(.92)}
body.casino-on #app .btn-primary:active{transform:translateY(1px)}
body.casino-on #app .btn-primary.btn-ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
/* inputs */
body.casino-on #app input{background:#0C0C0C;border:1px solid var(--line);border-radius:10px;color:var(--text)}
body.casino-on #app input:focus{border-color:rgba(255,255,255,.34);outline:none}
/* keno board: crisp mono squares */
body.casino-on #app .keno-cell{background:#161616;border:1px solid var(--line);border-radius:10px;
  font-weight:700;color:var(--muted)}
body.casino-on #app .keno-cell:hover:not(.locked){background:#1F1F1F;color:var(--text)}
body.casino-on #app .keno-cell.picked{background:var(--text);color:#0A0A0A;border-color:var(--text)}
body.casino-on #app .keno-cell.hit{background:var(--text);color:#0A0A0A;border-color:var(--text)}
body.casino-on #app .keno-cell.miss{background:#161616;color:var(--muted-2);opacity:.5}
/* big centre numbers */
body.casino-on #app .crash-mult,
body.casino-on #app #limboStage{color:var(--text)}
body.casino-on #app .crash-mult.busted,
body.casino-on #app #limboStage.lose{color:var(--muted)}
body.casino-on #app .crash-mult.cashed,
body.casino-on #app #limboStage.win{color:var(--text)}

/* ---- premium sidebar ---- */
.side{background:linear-gradient(180deg,#121212,#0B0B0B);gap:1px}
.brand b{background:linear-gradient(90deg,#fff,#B9B9B9);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.side .grp{display:flex;align-items:center;gap:8px}
.side .grp::after{content:"";flex:1;height:1px;background:var(--line)}
.side a.item{position:relative;font-size:13.5px;padding:9px 11px}
.side a.item .g{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;
  background:var(--panel);color:var(--muted);font-size:12px;opacity:1;
  transition:background .16s,color .16s,transform .16s}
.side a.item:hover .g{background:var(--panel-2);color:var(--text)}
.side a.item.on{background:linear-gradient(90deg,rgba(255,255,255,.06),transparent);color:#fff}
.side a.item.on .g{background:#fff;color:#0A0A0A}
.side a.item.on::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;
  background:#fff;border-radius:0 3px 3px 0}
.sidebal{margin:10px 6px 4px;padding:12px 13px;border:1px solid var(--line);border-radius:12px;
  background:var(--panel);display:flex;align-items:center;justify-content:space-between}
.sidebal .lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-2)}
.sidebal .amt{font-family:var(--mono);font-weight:700;font-size:15px}

/* ---- topbar refinement ---- */
.top{background:color-mix(in srgb,var(--bg) 82%,transparent)}
.bal2{background:linear-gradient(180deg,#181818,#111);box-shadow:0 1px 0 rgba(255,255,255,.04) inset}

/* ---- bookmark chip remove ---- */
.marks .chip{display:inline-flex;align-items:center;gap:6px;padding-right:6px}
.marks .chip .x{color:var(--muted-2);font-size:14px;line-height:1;padding:0 2px;border-radius:4px}
.marks .chip .x:hover{color:var(--text);background:var(--bg)}

/* ---- balance win/loss flash ---- */
@keyframes flashWin{0%{color:var(--text)}30%{color:#7CF0B0}100%{color:var(--text)}}
@keyframes flashLoss{0%{color:var(--text)}30%{color:#FF8A97}100%{color:var(--text)}}
.bal2.win #balDisplay{animation:flashWin .7s ease}
.bal2.loss #balDisplay{animation:flashLoss .7s ease}

/* the source ships a script-face section heading and a centred hero; neither
   fits a monochrome terminal, so both get restated here */
#deck .section-title{font-family:var(--serif);font-size:15px;font-weight:600;letter-spacing:.16em;
  text-transform:uppercase;transform:none;color:var(--muted);text-shadow:none}
#deck .section-head{justify-content:flex-start;margin:4px 0 18px}
#deck .hero{padding:44px 26px 34px;place-items:start;text-align:left;min-height:0}
#deck .hero h1{font-family:var(--serif);font-weight:600;font-size:clamp(28px,3.6vw,42px)}
#deck .hero p{margin-left:0}
#deck .section{padding:8px 26px 40px}
#deck .badge{background:rgba(0,0,0,.55);color:#E5E5E5}

@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes slideIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
@keyframes pulseBal{0%{transform:scale(1)}35%{transform:scale(1.07)}100%{transform:scale(1)}}
@keyframes shimmer{0%{background-position:-360px 0}100%{background-position:360px 0}}

.layout{display:grid;grid-template-columns:246px minmax(0,1fr);min-height:100vh}
@media (max-width:900px){.layout{grid-template-columns:1fr}.side{display:none}.side.open{display:flex}}

/* ---- sidebar ---- */
.side{position:sticky;top:0;height:100vh;overflow-y:auto;display:flex;flex-direction:column;
  gap:2px;padding:20px 12px;border-right:1px solid var(--line);background:var(--bg-2)}
.brand{display:flex;align-items:center;gap:9px;padding:4px 10px 20px;cursor:pointer}
.brand .dot{width:11px;height:11px;background:var(--text);transform:rotate(45deg);flex:none}
.brand b{font-family:var(--serif);font-size:21px;font-weight:600;letter-spacing:-.01em}
.side .grp{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted-2);
  padding:18px 10px 7px;font-weight:600}
.side a.item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r);
  color:var(--muted);font-size:14px;font-weight:500;cursor:pointer;transition:background .16s,color .16s,transform .16s;
  animation:slideIn .3s ease both}
.side a.item:hover{background:var(--panel);color:var(--text);transform:translateX(2px)}
.side a.item.on{background:var(--panel-2);color:var(--text)}
.side a.item .g{width:18px;text-align:center;font-size:13px;opacity:.85;flex:none}
.side a.item .x{margin-left:auto;color:var(--muted-2);font-size:15px;padding:0 3px;border-radius:4px}
.side a.item .x:hover{color:var(--text);background:var(--bg)}
.side .foot{margin-top:auto;padding:16px 10px 4px;font-size:11px;color:var(--muted-2);line-height:1.6}

/* ---- topbar ---- */
.top{position:sticky;top:0;z-index:15;display:flex;align-items:center;gap:12px;
  padding:14px 26px;border-bottom:1px solid var(--line);
  background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(10px)}
.top h2{margin:0;font-family:var(--serif);font-size:20px;font-weight:600;letter-spacing:-.01em}
.top .sp{flex:1}
.burger{display:none;background:none;border:1px solid var(--line);border-radius:8px;padding:6px 9px;color:var(--text)}
@media (max-width:900px){.burger{display:block}}
.bal2{display:inline-flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--line);
  padding:8px 14px;border-radius:var(--r);font-family:var(--mono);font-weight:700;font-size:14px}
.bal2 .c{width:14px;height:14px;border-radius:50%;background:var(--text);flex:none}
.bal2.bump{animation:pulseBal .45s ease}
.tbtn{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:8px 13px;
  font-size:13px;font-weight:600;color:var(--text);cursor:pointer;transition:background .16s,border-color .16s}
.tbtn:hover{background:var(--panel-2);border-color:rgba(255,255,255,.2)}
.tbtn.solid{background:var(--text);color:var(--bg);border-color:var(--text)}
.tbtn.solid:hover{filter:brightness(.9)}
main.main{min-width:0;display:flex;flex-direction:column}
#app{padding:0 0 60px;animation:fadeUp .3s ease}

/* ---- generic pages ---- */
.pg{padding:26px}
.pg h3{font-family:var(--serif);font-size:24px;font-weight:600;margin:0 0 6px;letter-spacing:-.015em}
.pg .lead{color:var(--muted);margin:0 0 22px;font-size:14px;max-width:62ch;line-height:1.65}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px}
.card h4{margin:0 0 4px;font-size:14px;font-weight:600}
.card p.sub{margin:0 0 14px;color:var(--muted);font-size:12.5px;line-height:1.6}
.row{display:flex;gap:9px;flex-wrap:wrap}
.row input,.row select{flex:1;min-width:150px;background:var(--bg);border:1px solid var(--line);
  border-radius:9px;padding:10px 12px;color:var(--text);font-family:var(--mono);font-size:13px}
.row input:focus{outline:none;border-color:rgba(255,255,255,.32)}
.note2{border-left:2px solid var(--text);padding:11px 14px;background:var(--panel);
  border-radius:0 9px 9px 0;font-size:13px;color:var(--muted);line-height:1.65;margin-top:14px}
.note2 b{color:var(--text)}
.empty2{text-align:center;padding:48px 20px;color:var(--muted-2);font-size:13.5px}

/* ---- arcade ---- */
.ar-wrap{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:18px;padding:26px}
@media (max-width:820px){.ar-wrap{grid-template-columns:1fr}}
.ar-screen{background:var(--panel);border:1px solid var(--line);border-radius:14px;
  padding:20px;display:grid;place-items:center;min-height:400px;overflow:auto}
.ar-screen canvas{display:block;image-rendering:pixelated;max-width:100%;height:auto}
.ar-hud{display:flex;flex-direction:column;gap:10px}
.ar-stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px 15px}
.ar-stat span{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-2);font-weight:600}
.ar-stat b{display:block;font-family:var(--mono);font-size:22px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums}
.ar-legend{color:var(--muted);font-size:12px;line-height:1.75;font-family:var(--mono)}
.ar-legend .k{border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:1px 5px;color:var(--text)}
.ar-ttt{display:grid;grid-template-columns:repeat(3,74px);gap:2px;background:var(--line);padding:2px;border-radius:8px;overflow:hidden}
.ar-ttt button{width:74px;height:74px;border:0;background:var(--panel-2);color:var(--text);
  font-family:var(--mono);font-size:24px;font-weight:700;cursor:pointer;transition:background .14s}
.ar-ttt button:hover:not(:disabled){background:#2A2A2A}
.ar-2048{display:grid;grid-template-columns:repeat(4,74px);gap:7px;background:var(--panel-2);padding:7px;border-radius:10px}
.ar-2048 div{width:74px;height:74px;display:grid;place-items:center;background:#1A1A1A;border-radius:7px;
  font-family:var(--mono);font-weight:700;font-size:19px;transition:background .14s,color .14s}
.ar-2048 div[data-v="0"]{color:transparent}
.ar-mines{display:grid;gap:2px;background:var(--line);padding:2px;border-radius:8px;user-select:none}
.ar-mines button{width:26px;height:26px;border:0;background:var(--panel-2);cursor:pointer;padding:0;
  font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text);border-radius:3px;transition:background .12s}
.ar-mines button:hover:not([data-open="1"]){background:#2E2E2E}
.ar-mines button[data-open="1"]{background:#131313;cursor:default}
.ar-mines button[data-boom="1"]{background:var(--text);color:var(--bg)}

/* ---- iframe apps ---- */
.fr{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel);
  height:calc(100vh - 190px);min-height:420px;position:relative}
.fr iframe{width:100%;height:100%;border:0;display:block;background:var(--panel)}
.fr .veil2{position:absolute;inset:0;display:grid;place-content:center;text-align:center;gap:8px;
  padding:26px;color:var(--muted-2);font-size:13px;pointer-events:none}

/* ---- polish pass over the game pages ----
   The source's panels were built for a flat purple theme; on a monochrome
   ground they need real edges, deeper surfaces and consistent radii. */
#deck .panel,#deck .stage,#deck .card,#deck .ar-screen,#deck .ar-stat,#deck .fr{
  box-shadow:0 1px 0 rgba(255,255,255,.03) inset, 0 12px 32px -22px #000}
#deck .panel{background:var(--panel);border:1px solid var(--line);border-radius:14px}
#deck .stage{background:linear-gradient(180deg,#131313,#0D0D0D);border:1px solid var(--line);border-radius:14px}
#deck .ar-screen{background:linear-gradient(180deg,#141414,#0F0F0F)}
#deck .btn-primary{border-radius:10px;font-weight:700;letter-spacing:.01em;
  transition:transform .12s ease,filter .16s ease}
#deck .btn-primary:hover{filter:brightness(.92)}
#deck .btn-primary:active{transform:translateY(1px)}
#deck .tile{transition:transform .18s cubic-bezier(.2,.7,.3,1),box-shadow .18s ease,border-color .18s ease}
#deck .tile:hover{transform:translateY(-4px);border-color:rgba(255,255,255,.22);
  box-shadow:0 18px 40px -20px #000}
#deck .toast{border-radius:12px;font-weight:600;letter-spacing:.01em}
#deck input,#deck select{transition:border-color .16s ease,background .16s ease}
#deck .grid{gap:18px}
#deck .footer{padding:26px;text-align:center;font-size:11.5px;letter-spacing:.02em}
#deck .modal{border-radius:18px;animation:popIn .32s cubic-bezier(.2,.9,.3,1.2)}

/* ---- richer motion ---- */
@keyframes popIn{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}
@keyframes dealIn{from{opacity:0;transform:translateY(-14px) rotate(-4deg)}to{opacity:1;transform:none}}
@keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}50%{box-shadow:0 0 20px -3px rgba(255,255,255,.42)}}
/* casino table fades up as a unit when you open a game */
body.casino-on #app .game-wrap{animation:fadeUp .34s ease}
/* the primary Bet / Deal / Start button breathes so the eye lands on it */
body.casino-on #app .btn-primary:not(:disabled){animation:glow 2.8s ease-in-out infinite}
body.casino-on #app .btn-primary:hover{animation:none}
/* blackjack cards deal in rather than snapping */
#deck .card, #deck [class*="card-face"], #deck .bj-card{animation:dealIn .3s cubic-bezier(.2,.8,.3,1) both}
/* sidebar item icon nudges on hover */
.side a.item:hover .g{transform:translateX(1px) scale(1.12);transition:transform .16s}
/* topbar buttons get a gentle lift */
.tbtn:active{transform:translateY(1px)}
.top .tbtn,.top .bal2{transition:transform .14s ease, background .16s ease, border-color .16s ease}

/* ============ motion system — replays on every screen ============ */
@keyframes riseIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes zoomIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sheen{0%{background-position:-260px 0}100%{background-position:260px 0}}

#app.pgin{animation:riseIn .34s cubic-bezier(.2,.7,.3,1)}
/* children stagger in behind the container */
#app.pgin .tile{animation:riseIn .45s cubic-bezier(.2,.7,.3,1) both}
#app.pgin .tile:nth-child(1){animation-delay:.02s}
#app.pgin .tile:nth-child(2){animation-delay:.06s}
#app.pgin .tile:nth-child(3){animation-delay:.10s}
#app.pgin .tile:nth-child(4){animation-delay:.14s}
#app.pgin .tile:nth-child(5){animation-delay:.18s}
#app.pgin .tile:nth-child(6){animation-delay:.22s}
#app.pgin .panel{animation:riseIn .4s cubic-bezier(.2,.7,.3,1) both;animation-delay:.04s}
#app.pgin .stage,#app.pgin #bjStage,#app.pgin #beefStage,#app.pgin .fr,#app.pgin .card{
  animation:zoomIn .4s cubic-bezier(.2,.7,.3,1) both;animation-delay:.08s}
#app.pgin .keno-cell{animation:zoomIn .01s both}   /* keeps board snappy, no 40-cell cascade */

/* tiles + buttons feel alive */
#deck .tile{transition:transform .18s cubic-bezier(.2,.8,.3,1),box-shadow .2s,border-color .2s,filter .2s}
#deck .tile:hover{transform:translateY(-6px) scale(1.015)}
#deck .tile:active{transform:translateY(-2px) scale(.995)}
#deck .btn-primary,.tbtn,.chip,.side a.item{will-change:transform}
#deck .keno-cell{transition:transform .12s,background .18s,color .18s,border-color .18s}
#deck .keno-cell:hover{transform:translateY(-2px)}
#deck .keno-cell:active{transform:translateY(0) scale(.94)}

/* Tesy loading spinner */
.veil2 .spin{width:26px;height:26px;border:2px solid var(--line);border-top-color:var(--text);
  border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 4px}
/* skeleton shimmer on the frame while loading */
.fr.loading{background:linear-gradient(100deg,#131313 30%,#1c1c1c 50%,#131313 70%);
  background-size:520px 100%;animation:sheen 1.1s linear infinite}

@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* ===== bait: Chrome's offline page ===== */
#bait{position:fixed;inset:0;overflow:auto;background:#fff;z-index:9999;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#202124}
@media (prefers-color-scheme:dark){
  #bait{background:#202124;color:#e8eaed}
  #bait .err{color:#9aa0a6}
  #bait #reload-btn{background:#8ab4f8;color:#202124}
}
#bait-inner{max-width:600px;margin:0 auto;padding:15vh 40px 40px}
#bait canvas{display:block;margin:0 0 24px;max-width:100%;height:auto;image-rendering:pixelated}
#bait h1{font-size:1.6em;font-weight:400;line-height:1.25;margin:0 0 16px}
#bait p{margin:0 0 8px;font-size:15px;line-height:1.6}
#bait ul{margin:0;padding-left:20px;font-size:15px;line-height:1.85}
#bait .err{font-size:.8em;color:#646464;margin-top:22px;letter-spacing:.02em}
#bait-nav{display:flex;justify-content:flex-end;gap:8px;margin-top:26px}
#bait #reload-btn{background:#1a73e8;color:#fff;border:0;border-radius:4px;padding:9px 18px;
  font-size:14px;font-weight:500;cursor:pointer;font-family:inherit}
#bait #reload-btn:hover{filter:brightness(1.08)}
#bait #reload-btn:disabled{opacity:.6;cursor:default}
/* Chrome's own error pages carry a Details button next to Reload, so this
   reads as part of the page rather than an obvious way in. */
#bait #details-btn{background:transparent;color:#1a73e8;border:0;border-radius:4px;padding:9px 14px;
  font-size:14px;font-weight:500;cursor:pointer;font-family:inherit}
#bait #details-btn:hover{background:rgba(26,115,232,.08)}
@media (prefers-color-scheme:dark){ #bait #details-btn{color:#8ab4f8}
  #bait #details-btn:hover{background:rgba(138,180,248,.12)} }
body.deck-on #bait{display:none}
#deck{display:none}
body.deck-on #deck{display:block}
`;

/* ---------- markup ---------- */
const bait = `
<div id="bait">
  <div id="bait-inner">
    <canvas id="dino" width="600" height="150" aria-label="Dinosaur game"></canvas>
    <h1>No internet</h1>
    <p>Try:</p>
    <ul>
      <li>Checking the network cables, modem, and router</li>
      <li>Reconnecting to Wi-Fi</li>
      <li>Running Windows Network Diagnostics</li>
    </ul>
    <div class="err">ERR_INTERNET_DISCONNECTED</div>
    <div id="bait-nav">
      <button id="details-btn">Details</button>
      <button id="reload-btn">Reload</button>
    </div>
  </div>
</div>`;

const deck = `
<div id="deck">
  <div class="layout">
    <aside class="side" id="side">
      <div class="brand" onclick="route('home')"><span class="dot"></span><b>KryzixsDEX</b></div>
      <div id="sideNav"></div>
      <div class="sidebal"><span class="lbl">Balance</span><span class="amt" id="sideBal">0.00</span></div>
      <div class="foot">Play credits only.<br>No deposits, no withdrawals,<br>no real money.</div>
    </aside>
    <main class="main">
      <header class="top">
        <button class="burger" onclick="document.getElementById('side').classList.toggle('open')">&#9776;</button>
        <h2 id="pageTitle">Originals</h2>
        <div class="sp"></div>
        <div class="bal2" id="balWrap"><span class="c"></span><span id="balDisplay">30.00</span></div>
        <button class="tbtn" onclick="showWheel()">Spin</button>
        <button class="tbtn solid" onclick="hideDeck()" title="Back to the offline page (Esc)">Esc</button>
      </header>
      <div id="app"></div>
    </main>
  </div>
  <span id="tabOrig" hidden></span><span id="tabStats" hidden></span>
  ${wheelModal}
</div>`;

/* ---------- storage shim ---------- */
const shim = `
(function(){
  var ok=true;
  try{ window.localStorage.setItem("__probe","1"); window.localStorage.removeItem("__probe"); }
  catch(e){ ok=false; }
  if(!ok){
    var mem={};
    var fake={
      getItem:function(k){ return Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null; },
      setItem:function(k,v){ mem[k]=String(v); },
      removeItem:function(k){ delete mem[k]; },
      clear:function(){ mem={}; },
      key:function(i){ var ks=Object.keys(mem); return i<ks.length?ks[i]:null; }
    };
    Object.defineProperty(fake,"length",{get:function(){ return Object.keys(mem).length; }});
    try{ Object.defineProperty(window,"localStorage",{value:fake,configurable:true,writable:true}); }catch(e){}
  }
})();
`;

/* ---------- the new shell's own script ---------- */
const shellJs = String.raw`
/* ================= shell ================= */
const $$ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const store = {
  get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
};

/* ---- arcade plumbing the lifted game code expects ---- */
let screenEl = null, arcLive = null;
function canvasIn(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; c.style.maxWidth='100%'; screenEl.appendChild(c); return c; }
function centerText(ctx,cv,a,b){
  ctx.fillStyle=css('--text'); ctx.textAlign='center';
  ctx.font='700 15px "JetBrains Mono",monospace'; ctx.fillText(a,cv.width/2,cv.height/2);
  if(b){ ctx.font='500 10px "JetBrains Mono",monospace'; ctx.fillText(b,cv.width/2,cv.height/2+22); }
  ctx.textAlign='left';
}
function api(id){
  const key='best.'+id;
  return {
    score(n){ const e=$$('#arScore'); if(e) e.textContent=n; },
    info(v){ const e=$$('#arInfo'); if(e) e.textContent=v; },
    best(){ return store.get(key,0); },
    submit(n){ if(n>store.get(key,0)){ store.set(key,n); const e=$$('#arBest'); if(e) e.textContent=n; } }
  };
}
const K = s => '<span class="k">'+s+'</span>';
const ARCADE = {
  snake:{name:'Snake', info:'speed', make:makeSnake, legend:K('&uarr;&darr;&larr;&rarr;')+' or '+K('WASD')+' steer &middot; '+K('Space')+' restart &middot; walls kill'},
  tetris:{name:'Tetris', info:'level', make:makeTetris, legend:K('&larr;&rarr;')+' move &middot; '+K('&uarr;')+' rotate &middot; '+K('&darr;')+' soft drop &middot; '+K('Space')+' hard drop'},
  breakout:{name:'Breakout', info:'lives', make:makeBreakout, legend:K('&larr;&rarr;')+' or the mouse &middot; '+K('Space')+' restart &middot; top rows score more'},
  g2048:{name:'2048', info:'largest', make:make2048, legend:K('&uarr;&darr;&larr;&rarr;')+' slide &middot; equal tiles merge &middot; '+K('Space')+' new game'},
  minesweeper:{name:'Minesweeper', info:'flags', make:makeMines, legend:'click reveals &middot; right-click flags &middot; '+K('Space')+' new board'},
  pong:{name:'Pong', info:'cpu', make:makePong, legend:K('&uarr;&darr;')+' or '+K('W')+K('S')+' &middot; first to 7 &middot; ball speeds up on every hit'},
  ttt:{name:'Tic Tac Toe', info:'moves', make:makeTTT, legend:'you are X &middot; the CPU searches every position, so a draw is the ceiling'}
};
function stopArcade(){ if(arcLive&&arcLive.stop) arcLive.stop(); arcLive=null; screenEl=null; }
function renderArcade(id){
  stopArcade();
  const g=ARCADE[id];
  app.innerHTML='<div class="ar-wrap"><div class="ar-screen" id="arScreen"></div>'+
    '<div class="ar-hud">'+
      '<div class="ar-stat"><span>score</span><b id="arScore">0</b></div>'+
      '<div class="ar-stat"><span>best</span><b id="arBest">'+store.get('best.'+id,0)+'</b></div>'+
      '<div class="ar-stat"><span>'+g.info+'</span><b id="arInfo">-</b></div>'+
      '<div class="ar-legend">'+g.legend+'</div>'+
    '</div></div>';
  screenEl=$$('#arScreen');
  arcLive=g.make(api(id));
}
addEventListener('keydown',e=>{
  if(!document.body.classList.contains('deck-on')||!arcLive||!arcLive.key) return;
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName||'')) return;
  arcLive.key(e);
});
addEventListener('keyup',e=>{ if(arcLive&&arcLive.wantsKeyup&&arcLive.key) arcLive.key(e); });

/* ---- iframe apps (admin-managed) ---- */
const APPS_KEY='dex_apps';
const getApps = () => store.get(APPS_KEY,[]);
function normalizeUrl(v){
  v=(v||'').trim(); if(!v) return '';
  if(/^https?:\/\//i.test(v)) return v;
  if(/^[\w-]+(\.[\w-]+)+(\/|$|:)/.test(v)) return 'https://'+v;
  return 'https://duckduckgo.com/?q='+encodeURIComponent(v);
}
function renderApp(id){
  stopArcade();
  const a=getApps().find(x=>x.id===id);
  if(!a){ app.innerHTML='<div class="pg"><div class="empty2">That app was removed.</div></div>'; return; }
  app.innerHTML='<div class="pg"><div class="row" style="margin-bottom:12px">'+
    '<input id="appUrl" value="'+a.url.replace(/"/g,'&quot;')+'">'+
    '<button class="tbtn" onclick="frameGo()">Go</button>'+
    '<button class="tbtn" onclick="window.open(document.getElementById(\'appUrl\').value,\'_blank\',\'noopener\')">Open tab</button>'+
    '</div><div class="fr"><div class="veil2" id="veil2">Loading '+a.name+'...</div>'+
    '<iframe id="appFrame" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>'+
    '<div class="note2"><b>If this stays blank</b>, the site refused to be embedded. Most big sites send '+
    '<div class="note2"><b>If this stays blank</b>, the site refused to be embedded. Most big sites send '+
  frameGo();
}
function frameGo(){
  const u=normalizeUrl($$('#appUrl').value); if(!u) return;
  const f=$$('#appFrame'), v=$$('#veil2');
  $$('#appUrl').value=u; v.style.display='grid';
  try{ v.textContent='Loading '+new URL(u).hostname+'...'; }catch(e){}
  f.src=u;
  const t=setTimeout(()=>{ v.textContent='This site refused to be embedded. Use Open tab.'; },3800);
  f.onload=()=>{ clearTimeout(t); v.style.display='none'; };
}
function renderBrowser(){
  stopArcade();
  app.innerHTML='<div class="pg"><div class="row" style="margin-bottom:12px">'+
    '<input id="appUrl" placeholder="Type a URL or a search" value="https://en.wikipedia.org/wiki/Dinosaur">'+
    '<button class="tbtn" onclick="frameGo()">Go</button>'+
    '<button class="tbtn" onclick="window.open(document.getElementById(\'appUrl\').value,\'_blank\',\'noopener\')">Open tab</button>'+
    '</div><div class="fr"><div class="veil2" id="veil2">Loading...</div>'+
    '<iframe id="appFrame" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div></div>';
  $$('#appUrl').addEventListener('keydown',e=>{ if(e.key==='Enter') frameGo(); });
  frameGo();
}

/* ---- Tesy Browser ----
   Not a security bypass. A plain iframe fails on most sites because the browser
   itself enforces X-Frame-Options / frame-ancestors and nothing client-side can
   override that. What DOES work: fetch the page through a public read-through
   proxy on the server side, then render the returned HTML in a srcdoc sandbox —
   framing headers never apply to srcdoc, so pages that refuse embedding still
   show. It reads pages. It will not do logins, and heavy JS apps (Google,
   YouTube) come back broken because their scripts are blocked here. Public
   proxies are also flaky, so it tries several in turn. */
// A proxy is {name, url(targetUrl)->requestUrl, mode:'html'|'text'}. Your own
// server (set in Admin) is tried FIRST — it is the only one that can be made
// reliable. The public ones are fallbacks and are flaky by nature.
// Our own Cloudflare Worker. It fetches server-side and strips X-Frame-Options /
// CSP, so pages that refuse embedding load unblocked. Reliable (no public-proxy
// rate limits) and free. Deployed from proxy/worker.js.
const TESY_WORKER = 'https://kryzixshomework.fnjudo8.workers.dev/?url={url}';
function tesyProxies(){
  const list = [];
  const own = store.get('tesy_proxy','').trim();
  if(own){
    list.push({ name:'Your proxy', mode:'html',
      url:u => own.includes('{url}') ? own.replace('{url}', encodeURIComponent(u)) : own.replace(/\/+$/,'')+'/'+u });
  }
  list.push(
    { name:'KryzixsDEX proxy', mode:'html', url:u => TESY_WORKER.replace('{url}', encodeURIComponent(u)) },
    { name:'AllOrigins', url:u => 'https://api.allorigins.win/raw?url='+encodeURIComponent(u), mode:'html' },
    { name:'CodeTabs',   url:u => 'https://api.codetabs.com/v1/proxy/?quest='+encodeURIComponent(u), mode:'html' },
    { name:'Jina Reader',url:u => 'https://r.jina.ai/'+u, mode:'text' }
  );
  return list;
}
const TESY_DEFAULT_MARKS = [
  {name:'Wikipedia', url:'https://en.wikipedia.org/wiki/Special:Random'},
  {name:'Hacker News', url:'https://news.ycombinator.com'},
  {name:'MDN', url:'https://developer.mozilla.org'},
  {name:'example.com', url:'https://example.com'}
];
const tesyMarks = () => store.get('tesy_marks', TESY_DEFAULT_MARKS);

function renderTesy(){
  stopArcade();
  const last = store.get('tesy_last','https://en.wikipedia.org/wiki/Cat');
  const own = store.get('tesy_proxy','').trim();
  app.innerHTML =
    '<div class="pg tesy">'+
    '<div class="row" style="margin-bottom:10px">'+
      '<input id="tsUrl" placeholder="Enter any URL — tesy fetches it through a proxy" value="'+esc(last)+'">'+
      '<button class="tbtn solid" onclick="tesyGo()">Go</button>'+
      '<button class="tbtn" id="tsSave" onclick="tesyBookmark()">Bookmark</button>'+
      '<button class="tbtn" onclick="window.open(document.getElementById(\'tsUrl\').value,\'_blank\',\'noopener\')">Open tab</button>'+
    '</div>'+
    '<div class="marks" id="tsMarks"></div>'+
    '<div class="fr"><div class="veil2" id="tsVeil">Enter a URL and press Go.</div>'+
      '<iframe id="tsFrame" sandbox="allow-same-origin" referrerpolicy="no-referrer"></iframe></div>'+
    '<div class="note2">'+
      (own ? '<b>Using your proxy</b> <code>'+esc(own)+'</code> first, then the KryzixsDEX proxy. '
           : '<b>Powered by the KryzixsDEX proxy</b> — your own Cloudflare Worker that fetches pages server-side and strips the headers that block embedding, so sites load unblocked. ')+
      'It is not magic: it will not beat a network firewall that blocks the proxy domain, and logins / heavy JS apps still come back limited.'+
    '</div></div>';
  $$('#tsUrl').addEventListener('keydown',e=>{ if(e.key==='Enter') tesyGo(); });
  drawTesyMarks();
}
function drawTesyMarks(){
  const wrap=$$('#tsMarks'); if(!wrap) return;
  const marks=tesyMarks();
  wrap.innerHTML = marks.map((m,i)=>
    '<button class="chip" onclick="tesyOpen('+i+')" title="'+esc(m.url)+'">'+esc(m.name)+
    '<span class="x" onclick="event.stopPropagation();tesyUnmark('+i+')">×</span></button>').join('')
    || '<span style="color:var(--muted-2);font-size:12px">No bookmarks yet.</span>';
}
function tesyOpen(i){ const m=tesyMarks()[i]; if(m){ $$('#tsUrl').value=m.url; tesyGo(); } }
function tesyBookmark(){
  const u=normalizeUrl($$('#tsUrl').value); if(!u) return;
  let host=u; try{ host=new URL(u).hostname.replace(/^www\./,''); }catch(e){}
  const marks=tesyMarks();
  if(marks.some(m=>m.url===u)){ toast('Already bookmarked'); return; }
  marks.push({name:host, url:u}); store.set('tesy_marks',marks); drawTesyMarks(); toast('Bookmarked','win');
}
function tesyUnmark(i){ const marks=tesyMarks(); marks.splice(i,1); store.set('tesy_marks',marks); drawTesyMarks(); }

async function tesyGo(){
  const raw = $$('#tsUrl').value.trim(); if(!raw) return;
  const u = normalizeUrl(raw);
  $$('#tsUrl').value = u; store.set('tesy_last', u);
  const veil = $$('#tsVeil'), frame = $$('#tsFrame'), fr = frame.parentElement;
  const show = msg => { veil.innerHTML = '<div class="spin"></div><div>'+esc(msg)+'</div>'; veil.style.display='grid'; };
  fr.classList.add('loading');
  let host=''; try{ host=new URL(u).hostname; }catch(e){}
  const proxies = tesyProxies();
  for(let i=0;i<proxies.length;i++){
    const p = proxies[i];
    show('Loading '+host+' — '+p.name);
    try{
      const res = await fetch(p.url(u), {redirect:'follow'});
      if(!res.ok) throw new Error(res.status);
      let doc = await res.text();
      if(!doc || doc.length<40) throw new Error('empty');
      if(p.mode==='text'){
        doc = '<pre style="white-space:pre-wrap;font:15px/1.6 system-ui,sans-serif;'+
              'color:#e8eaed;background:#111;margin:0;padding:26px;max-width:820px">'+
              esc(doc)+'</pre>';
      } else {
        const base = '<base href="'+u+'">';
        doc = doc.replace(/<head([^>]*)>/i, '<head$1>'+base);
        if(!/<base/i.test(doc)) doc = base+doc;
      }
      frame.srcdoc = doc;
      fr.classList.remove('loading');
      veil.style.display='none';
      return;
    }catch(err){ /* try the next proxy */ }
  }
  fr.classList.remove('loading');
  veil.innerHTML = '<div style="font-weight:600;color:var(--text);margin-bottom:4px">Couldn’t load '+esc(host)+'</div>'+
    '<div>Every proxy failed or the site is too heavy for a reader. Heavy apps (Google, YouTube) can’t work here — use <b>Open tab</b>, '+
    'or set your own proxy in Admin.</div>';
  veil.style.display='grid';
}

/* ---- admin ----
   This gate is a convenience, not security. Everything runs in the browser, so
   anyone who opens devtools can read the PIN and set their own balance. It stops
   a friend on your laptop, nothing more. Do not treat it as protection. */
const ADMIN_PIN='kryzixs';
const isAdmin = () => store.get('dex_admin',false);
function renderAdmin(){
  stopArcade();
  if(!isAdmin()){
    app.innerHTML='<div class="pg"><h3>Admin</h3><p class="lead">Sign in to manage credits and apps.</p>'+
      '<div class="card" style="max-width:380px"><h4>PIN</h4><p class="sub">Set in the source as <code>ADMIN_PIN</code>.</p>'+
      '<div class="row"><input id="pin" type="password" placeholder="PIN" autocomplete="off">'+
      '<button class="tbtn solid" onclick="adminLogin()">Unlock</button></div>'+
      '<div id="pinMsg" style="color:var(--muted);font-size:12.5px;margin-top:10px"></div></div></div>';
    $$('#pin').addEventListener('keydown',e=>{ if(e.key==='Enter') adminLogin(); });
    return;
  }
  const apps=getApps();
  app.innerHTML='<div class="pg"><h3>Admin</h3><p class="lead">Signed in as Kryzixs.</p>'+
    '<div class="card"><h4>Credits</h4><p class="sub">Balance is stored in this browser only.</p>'+
    '<div class="row"><input id="amt" type="number" value="100" min="0" step="10">'+
    '<button class="tbtn solid" onclick="adminAdd()">Add</button>'+
    '<button class="tbtn" onclick="adminSet()">Set exact</button>'+
    '<button class="tbtn" onclick="adminAdd(-999999)">Zero out</button></div></div>'+
    '<div class="card"><h4>Apps</h4><p class="sub">Anything with a URL &mdash; your VPS Android screen, a game site, a doc. It gets its own sidebar entry and opens in a frame.</p>'+
    '<div class="row"><input id="an" placeholder="Name (e.g. Cloud Android)"><input id="au" placeholder="https://your-host/android/">'+
    '<button class="tbtn solid" onclick="adminAddApp()">Add app</button></div>'+
    (apps.length?'<div style="margin-top:14px;display:flex;flex-direction:column;gap:7px">'+apps.map(a=>
      '<div class="row" style="align-items:center"><span style="flex:1;font-size:13px">'+
      '<b>'+esc(a.name)+'</b> <span style="color:var(--muted-2);font-family:var(--mono);font-size:11.5px">'+esc(a.url)+'</span></span>'+
      '<button class="tbtn" onclick="adminDelApp(\''+a.id+'\')">Remove</button></div>').join('')+'</div>'
      :'<div class="empty2" style="padding:22px">No apps yet.</div>')+
    '</div>'+
    '<div class="card"><h4>Tesy proxy</h4><p class="sub">Your own read-through proxy, tried before the public ones. Use <code>{url}</code> where the target goes — e.g. <code>https://your-host/proxy?url={url}</code>. Leave blank to use only the public proxies.</p>'+
    '<div class="row"><input id="tproxy" placeholder="https://your-host/proxy?url={url}" value="'+esc(store.get('tesy_proxy',''))+'">'+
    '<button class="tbtn solid" onclick="adminSaveProxy()">Save</button></div></div>'+
    '<div class="card"><h4>Data</h4><p class="sub">Clears bet history and arcade high scores in this browser.</p>'+
    '<div class="row"><button class="tbtn" onclick="adminWipe()">Reset history</button>'+
    '<button class="tbtn" onclick="adminLogout()">Sign out</button></div></div>'+
    '<div class="note2"><b>This gate is not security.</b> The PIN and the balance live in your browser, so anyone with devtools can change both. It keeps a friend out of your account on a shared laptop &mdash; that is all it is for.</div></div>';
}
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function adminLogin(){
  if($$('#pin').value===ADMIN_PIN){ store.set('dex_admin',true); buildNav(); route('admin'); }
  else $$('#pinMsg').textContent='Wrong PIN.';
}
function adminLogout(){ store.set('dex_admin',false); buildNav(); route('admin'); }
function adminAdd(v){
  const n = typeof v==='number' ? v : parseFloat($$('#amt').value||'0');
  setBal(state.bal + n); toast((n>=0?'+':'')+n.toFixed(2)+' credits','win');
}
function adminSet(){ setBal(parseFloat($$('#amt').value||'0')); toast('Balance set','win'); }
function adminAddApp(){
  const name=$$('#an').value.trim(), url=normalizeUrl($$('#au').value);
  if(!name||!url) return;
  const apps=getApps();
  apps.push({id:'a'+Date.now(), name, url});
  store.set(APPS_KEY,apps); buildNav(); route('admin');
}
function adminDelApp(id){ store.set(APPS_KEY,getApps().filter(a=>a.id!==id)); buildNav(); route('admin'); }
function adminSaveProxy(){ store.set('tesy_proxy', $$('#tproxy').value.trim()); toast('Tesy proxy saved','win'); }
function adminWipe(){
  history=[]; localStorage.removeItem(LS.hx);
  Object.keys(ARCADE).forEach(k=>localStorage.removeItem('best.'+k));
  toast('History cleared','win'); route('admin');
}

/* ---- router ---- */
const CASINO = {crash:'Crash', mines:'Mines', limbo:'Limbo', keno:'Keno', beef:'Beef', blackjack:'Blackjack'};
const origRoute = route;
route = function(name){
  stopArcade();
  // Only the game tables get the coloured skin; the home menu stays monochrome
  // with the rest of the shell, so opening a game is a deliberate reveal.
  document.body.classList.toggle('casino-on', !!CASINO[name]);
  let title = 'Originals';
  if(name==='home'){ origRoute('home'); }
  else if(name==='stats'){ origRoute('stats'); title='My Stats'; }
  else if(CASINO[name]){ origRoute(name); title=CASINO[name]; }
  else if(ARCADE[name]){ renderArcade(name); title=ARCADE[name].name; scrollTo(0,0); }
  else if(name==='browser'){ renderBrowser(); title='Browser'; scrollTo(0,0); }
  else if(name==='tesy'){ renderTesy(); title='Tesy Browser'; scrollTo(0,0); }
  else if(name==='admin'){ renderAdmin(); title='Admin'; scrollTo(0,0); }
  else if(name.indexOf('app:')===0){
    const a=getApps().find(x=>x.id===name.slice(4));
    renderApp(name.slice(4)); title=a?a.name:'App'; scrollTo(0,0);
  }
  else { origRoute('home'); }
  $$('#pageTitle').textContent=title;
  document.querySelectorAll('#sideNav .item').forEach(el=>el.classList.toggle('on', el.dataset.r===name));
  document.getElementById('side').classList.remove('open');
  // Re-trigger the entrance animation on EVERY route. innerHTML swaps keep the
  // same #app node, so a CSS animation declared on it never replays on its own —
  // remove the class, force reflow, add it back.
  const a=$$('#app');
  if(a){ a.classList.remove('pgin'); void a.offsetWidth; a.classList.add('pgin'); }
};

/* ---- sidebar ---- */
function buildNav(){
  const g = (label, items) => '<div class="grp">'+label+'</div>'+items.map((it,i)=>
    '<a class="item" data-r="'+it[0]+'" style="animation-delay:'+(i*18)+'ms" onclick="route(\''+it[0]+'\')">'+
    '<span class="g">'+it[2]+'</span>'+it[1]+'</a>').join('');
  const apps=getApps();
  let html = g('Casino', [['home','All games','\u25A6'],['crash','Crash','\u2197'],['mines','Mines','\u273B'],
      ['limbo','Limbo','\u25B3'],['keno','Keno','\u25C9'],['beef','Beef','\u2B16'],['blackjack','Blackjack','\u2660']]);
  html += g('Arcade', [['snake','Snake','\u2307'],['tetris','Tetris','\u25A4'],['breakout','Breakout','\u25AC'],
      ['g2048','2048','\u25A7'],['minesweeper','Minesweeper','\u2691'],['pong','Pong','\u25D1'],['ttt','Tic Tac Toe','\u229E']]);
  html += g('Apps', [['tesy','Tesy Browser','\u2726'],['browser','Browser','\u25CD']].concat(apps.map(a=>['app:'+a.id, esc(a.name), '\u25AD'])));
  html += g('Account', [['stats','My Stats','\u25D4'],['admin', isAdmin()?'Admin \u2022':'Admin', '\u2699']]);
  $$('#sideNav').innerHTML = html;
}

/* ---- balance pulse ---- */
const origSetBal = setBal;
setBal = function(v){
  const prev = state.bal;
  origSetBal(v);
  const dir = state.bal > prev ? 'win' : state.bal < prev ? 'loss' : '';
  const w=$$('#balWrap');
  if(w){
    w.classList.remove('bump','win','loss'); void w.offsetWidth;
    w.classList.add('bump'); if(dir) w.classList.add(dir);
  }
  const sb=$$('#sideBal'); if(sb) sb.textContent = state.bal.toFixed(2);
};

buildNav();
{ const sb=$$('#sideBal'); if(sb) sb.textContent = state.bal.toFixed(2); }
route('home');

/* ===== the dino, on Chrome's 600x150 runner canvas ===== */
(function(){
  const cv=document.getElementById('dino'), ctx=cv.getContext('2d');
  const W=cv.width, H=cv.height, GY=H-22;
  const dark=()=>matchMedia('(prefers-color-scheme:dark)').matches;
  let hi=+(localStorage.getItem('dino_hi')||0), S={};
  function reset(){
    S={x:40,y:GY,vy:0,duck:false,obs:[],sp:5.2,score:0,dead:false,t:0,gap:70,started:false,
       hills:Array.from({length:6},(_,i)=>({x:i*120+Math.random()*60,y:GY-6-Math.random()*16,w:50+Math.random()*60}))};
  }
  reset();
  function spawn(){
    if(S.score>320 && Math.random()<.25){
      S.obs.push({t:'b',x:W+20,y:[GY-42,GY-26,GY-10][Math.floor(Math.random()*3)],w:30,h:18,f:0});
    } else {
      const n=1+Math.floor(Math.random()*3), big=Math.random()<.3;
      S.obs.push({t:'c',x:W+20,y:GY,w:(big?12:8)*n,h:big?32:23,n,big});
    }
    S.gap=Math.max(42,84-S.sp*4)+Math.random()*46;
  }
  function jump(){ if(S.dead){reset();S.started=true;return;} S.started=true; if(S.y>=GY) S.vy=-10.2; }
  const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y>b.y-b.h&&a.y-a.h<b.y;
  function step(){
    if(S.started&&!S.dead){
      S.t++; S.sp=5.2+Math.min(5.5,S.score/150); S.score+=.16*(S.sp/5.2);
      S.vy+=.52; S.y+=S.vy; if(S.y>GY){S.y=GY;S.vy=0;}
      if(--S.gap<=0) spawn();
      const d={x:S.x,y:S.y,w:S.duck&&S.y>=GY?32:20,h:S.duck&&S.y>=GY?15:33};
      for(const o of S.obs){
        o.x-=S.sp; if(o.t==='b'){o.x-=1;o.f=(o.f+1)%22;}
        if(hit(d,o)){ S.dead=true; if(S.score>hi){hi=Math.floor(S.score);try{localStorage.setItem('dino_hi',hi)}catch(e){}} }
      }
      S.obs=S.obs.filter(o=>o.x>-50);
      for(const h of S.hills){ h.x-=S.sp*.25; if(h.x<-140){h.x=W+Math.random()*80;h.y=GY-6-Math.random()*16;} }
    }
    draw(); requestAnimationFrame(step);
  }
  function draw(){
    const ink=dark()?'#8f9296':'#535353';
    ctx.clearRect(0,0,W,H); ctx.fillStyle=ink;
    ctx.fillRect(0,GY+2,W,1);
    ctx.globalAlpha=.4; for(const h of S.hills) ctx.fillRect(h.x,h.y,h.w,1.5); ctx.globalAlpha=1;
    const bx=S.x, by=S.y;
    if(S.duck&&S.y>=GY){
      ctx.fillRect(bx,by-15,26,12); ctx.fillRect(bx+23,by-18,11,9);
      ctx.fillRect(bx+2,by-4,6,4); ctx.fillRect(bx+14,by-4,6,4);
    } else {
      ctx.fillRect(bx,by-24,14,17); ctx.fillRect(bx+9,by-34,12,11); ctx.fillRect(bx+20,by-29,4,3);
      ctx.fillRect(bx-5,by-23,7,3); ctx.fillRect(bx+3,by-17,5,6);
      const r=Math.floor(S.t/5)%2;
      if(S.y<GY||!S.started){ ctx.fillRect(bx+2,by-9,5,9); ctx.fillRect(bx+8,by-9,5,9); }
      else if(r){ ctx.fillRect(bx+2,by-9,5,9); ctx.fillRect(bx+8,by-6,5,6); }
      else { ctx.fillRect(bx+2,by-6,5,6); ctx.fillRect(bx+8,by-9,5,9); }
      ctx.clearRect(bx+16,by-31,2,2);
    }
    for(const o of S.obs){
      if(o.t==='c'){
        const u=o.big?12:8;
        for(let i=0;i<o.n;i++){
          const x=o.x+i*u;
          ctx.fillRect(x+u*.3,o.y-o.h,u*.4,o.h);
          ctx.fillRect(x,o.y-o.h*.7,u*.32,u*.26); ctx.fillRect(x,o.y-o.h*.7,u*.18,o.h*.32);
          ctx.fillRect(x+u*.68,o.y-o.h*.58,u*.32,u*.22); ctx.fillRect(x+u*.82,o.y-o.h*.58,u*.18,o.h*.28);
        }
      } else {
        ctx.fillRect(o.x+9,o.y-10,17,5); ctx.fillRect(o.x,o.y-8,10,3);
        if(o.f<11) ctx.fillRect(o.x+11,o.y-19,14,9); else ctx.fillRect(o.x+11,o.y-3,14,9);
      }
    }
    ctx.font='500 11px "Courier New",monospace'; ctx.textAlign='right'; ctx.globalAlpha=.75;
    ctx.fillText((hi?'HI '+String(hi).padStart(5,'0')+'  ':'')+String(Math.floor(S.score)).padStart(5,'0'), W-2, 14);
    ctx.globalAlpha=1; ctx.textAlign='left';
    if(S.dead){ ctx.font='500 13px "Courier New",monospace'; ctx.textAlign='center';
      ctx.fillText('G A M E   O V E R', W/2, H/2-6); ctx.textAlign='left'; }
  }
  addEventListener('keydown',e=>{
    if(document.body.classList.contains('deck-on')) return;
    if(e.code==='Space'||e.code==='ArrowUp'){ e.preventDefault(); jump(); }
    if(e.code==='ArrowDown') S.duck=true;
  });
  addEventListener('keyup',e=>{ if(e.code==='ArrowDown') S.duck=false; });
  cv.addEventListener('pointerdown',jump);
  step();
})();

/* ===== bait <-> deck ===== */
function showDeck(){ document.body.classList.add('deck-on'); document.title='KryzixsDEX'; scrollTo(0,0); }
function hideDeck(){ document.body.classList.remove('deck-on'); document.title='No internet'; scrollTo(0,0); }
(function(){
  const toggle = () => document.body.classList.contains('deck-on') ? hideDeck() : showDeck();

  // Three taps of P. The window is per-tap and deliberately generous — at
  // 900ms this was faster than most people tap on purpose, and it just felt
  // like the key did nothing.
  let taps=0, timer=null;
  addEventListener('keydown', e=>{
    if(e.key==='Escape' && document.body.classList.contains('deck-on')){ hideDeck(); return; }
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName||'')) return;
    if(e.key==='p'||e.key==='P'){
      taps++; clearTimeout(timer); timer=setTimeout(()=>taps=0,2500);
      if(taps>=3){ taps=0; toggle(); }
    }
    // Straightforward fallback for when a page has just loaded and you would
    // rather not drum on the keyboard.
    if(e.shiftKey && (e.key==='Backspace')){ e.preventDefault(); toggle(); }
  });

  // Mouse route in: double-click the error code. Nothing on the real Chrome
  // page reacts to that, so it costs the disguise nothing.
  const err=document.querySelector('#bait .err');
  if(err){ err.style.cursor='default'; err.ondblclick=showDeck; }

  const db=document.getElementById('details-btn');
  if(db) db.onclick=showDeck;

  const rb=document.getElementById('reload-btn');
  rb.onclick=()=>{ rb.disabled=true; rb.textContent='Reloading...';
    setTimeout(()=>{ rb.disabled=false; rb.textContent='Reload'; },1400); };
})();
`;

/* ---------- emit ---------- */
const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>No internet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,400;6..72,600&family=JetBrains+Mono:wght@500;700&display=swap">
<style>
${styles}
${shell}
</style>
</head>
<body>
${bait}
${deck}
${svgDefs}
<script>
${shim}
${duelScript}
${arcade}
${shellJs}
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');
console.log('wrote ' + OUT + '  (' + (out.length / 1024).toFixed(1) + ' KB)');

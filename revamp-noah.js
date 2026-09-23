/**
 * Revamps "Noah's Tutoring Hub" into the KryzixsDEX look and adds a proxy
 * browser tab wired to the kryzixshomework Worker.
 *
 * It does NOT rewrite the 7,900-line source. The whole theme runs off three CSS
 * variables and a set of well-named classes, so a single override <style> flips
 * orange→monochrome, and one appended <script> injects a BROWSER tab plus a
 * full-screen proxy frame.
 */
const fs = require('fs');
// `node revamp-noah.js --local` builds the version served by the local
// Interstellar server (proxy = the same-origin UV browser at /web); the plain
// build targets Cloudflare Pages (proxy = the rewriting worker).
const LOCAL = process.argv.includes('--local');
const CHITTER = process.argv.includes('--chitter'); // "Chitter": games + chat, own indigo GUI
const NOPROXY = process.argv.includes('--noproxy') || CHITTER; // clean site, no proxy tab/logic
const NOANN = process.argv.includes('--noann'); // don't show broadcast/announcement banners
const SRC = 'C:/Users/kryzi/Downloads/(old) index (1).html';
const OUT = CHITTER
  ? 'C:/Users/kryzi/Downloads/Game/chitter-public/index.html'
  : NOANN
  ? 'C:/Users/kryzi/Downloads/Game/kryzixs-full-noann.html'
  : NOPROXY
  ? 'C:/Users/kryzi/Downloads/Game/noproxy-public/index.html'
  : LOCAL
  ? 'C:/Users/kryzi/Downloads/Game/interstellar/static/index.html'
  : 'C:/Users/kryzi/Downloads/Game/kryzixs-hub.html';
// Non-local build points the PROXY tab at the public tunnel to the home UV
// server (full Ultraviolet). This trycloudflare URL is EPHEMERAL — it changes
// every time the tunnel restarts; update it here (or in Settings on the site)
// when that happens. Falls back conceptually to the worker if the tunnel is down.
// PROXY tab. Local build = same-origin UV at /web (this GUI + full UV).
// Public build = the self-contained Cloudflare Worker (same GUI, always on).
const WORKER_FALLBACK = 'https://kryzixshomework.fnjudo8.workers.dev/';
const PROXY_DEFAULT = LOCAL ? '/web' : WORKER_FALLBACK;
const WORKER = 'https://kryzixshomework.fnjudo8.workers.dev/?url=';

let html = fs.readFileSync(SRC, 'utf8');

/* ---------- 1. strip every ad / tracker ----------
 * joyfullybarn injects the cybernovlog popunders that steal the first click on
 * anything — removing them is what makes the page clickable again. AdSense and
 * the GTM loader go too. We keep the inline gtag()/adsbygoogle stubs so the many
 * gtag('event',…) calls sprinkled through the code don't throw. */
// A single <script>…</script> whose body mentions `needle`, matched WITHOUT
// crossing any other </script> (tempered pattern) so it can only ever remove the
// one offending block, never the code around it.
const dropScript = (h, needle) =>
  h.replace(new RegExp('<script\\b[^>]*>(?:(?!<\\/script>)[\\s\\S])*?' + needle + '(?:(?!<\\/script>)[\\s\\S])*?<\\/script>', 'gi'), '')
   // also catch self-closing loader tags like <script async src="…needle…"></script>
   .replace(new RegExp('<script\\b[^>]*' + needle + '[^>]*>\\s*<\\/script>', 'gi'), '');

['googlesyndication', 'googletagmanager', 'joyfullybarn', 'atOptions'].forEach(n => { html = dropScript(html, n); });

/* ---------- fix: games stuck on "Loading" ----------
 * Games load into a srcdoc iframe whose URL is about:srcdoc. Many games call
 * history.pushState / replaceState, which throws a SecurityError there and
 * halts the game's loader. Prepend a shim to every game's injected HTML that
 * wraps those calls so they can't throw. (`<\/script>` keeps this closing tag
 * from ending the hub's own inline script; it becomes a real </script> at run
 * time inside the game document.) */
const HISTORY_SHIM = '"<script>(function(){try{var h=window.history;[\'pushState\',\'replaceState\'].forEach(function(m){var o=h[m];h[m]=function(){try{return o.apply(h,arguments);}catch(e){return;}};});}catch(e){}})();<\\/script>"';
/* volume control injected into each self-contained game: routes Web Audio through
   a master gain and sets volume on <audio>/<video>, driven by localStorage +
   postMessage from the hub's volume slider. */
const VOLUME_SHIM_JS = "(function(){var gv=function(){var x=parseFloat(localStorage.getItem('kx_volume'));return isNaN(x)?1:x;};window.__kxVol=gv();"
  + "var applyMedia=function(){try{var l=document.querySelectorAll('audio,video');for(var i=0;i<l.length;i++){try{l[i].volume=window.__kxVol;}catch(e){}}}catch(e){}};"
  + "var AC=window.AudioContext||window.webkitAudioContext;if(AC&&!AC.__kxPatched){AC.__kxPatched=true;var d=Object.getOwnPropertyDescriptor(AC.prototype,'destination');if(d&&d.get){Object.defineProperty(AC.prototype,'destination',{configurable:true,get:function(){if(!this.__kxGain){try{var real=d.get.call(this);var gn=this.createGain();gn.connect(real);this.__kxGain=gn;}catch(e){return d.get.call(this);}}try{this.__kxGain.gain.value=window.__kxVol;}catch(e){}return this.__kxGain;}});}}"
  + "window.addEventListener('message',function(e){if(e&&e.data&&e.data.type==='KX_VOLUME'){window.__kxVol=e.data.value;applyMedia();}});"
  + "try{new MutationObserver(applyMedia).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}setInterval(applyMedia,1500);applyMedia();})();";
const VOLUME_SHIM = JSON.stringify('<script>' + VOLUME_SHIM_JS + '</script>').replace(/<\/script>/g, '<\\/script>');
html = html.replace('const harness = getGameFreezeHarnessScript();',
  'const harness = ' + HISTORY_SHIM + ' + ' + VOLUME_SHIM + ' + getGameFreezeHarnessScript();');
if (!html.includes(HISTORY_SHIM)) throw new Error('history-shim anchor not found');
if (!html.includes('__kxVol')) throw new Error('volume-shim anchor not found');

// A guard, injected first thing, that neuters any ad code we missed and blocks
// popunder-style window.open hijacks (opens with no user gesture / to off-site
// ad domains are dropped; our own proxy uses same-tab iframes, never window.open
// on a trusted click path except the explicit ↗ button which we allow-list).
const guard = `<script>
try{ localStorage.setItem('adsDisabled','true'); }catch(e){}
// Chromebook perf: neuter the heavy WebGL fog background before it can init.
window.VANTA = { FOG:function(){return {destroy:function(){}};}, current:null };
window.adsbygoogle = window.adsbygoogle || [];
window.dataLayer = window.dataLayer || [];
if(typeof window.gtag!=='function') window.gtag=function(){ window.dataLayer.push(arguments); };
(function(){
  var realOpen = window.open.bind(window);
  window.open = function(u, name, feat){
    // Allow only explicit opens we tag; drop silent popunders.
    if(window.__kxAllowOpen){ window.__kxAllowOpen=false; return realOpen(u,name,feat); }
    return null;
  };
})();
</script>`;
html = html.replace(/<head([^>]*)>/i, '<head$1>\n' + guard);

/* ---------- Chromebook perf: kill heavy animated backgrounds ---------- */
// remove the three.js + Vanta CDN scripts entirely (WebGL fog is brutal on Chromebooks)
html = html.replace(/<script[^>]*three\.min\.js[^>]*>\s*<\/script>/gi, '');
html = html.replace(/<script[^>]*vanta[^>]*\.js[^>]*>\s*<\/script>/gi, '');
// stop the matrix/starfield canvas loops right after load and keep them off
const bgKillJs = `<script>
(function(){
  function stop(){
    try{ if(typeof stopBackgroundLoop==='function') stopBackgroundLoop(); }catch(e){}
    try{ if(typeof cleanupStarfieldBackground==='function') cleanupStarfieldBackground(); }catch(e){}
    try{ var c=document.getElementById('matrix-bg'); if(c){ c.style.display='none'; var g=c.getContext&&c.getContext('2d'); if(g) g.clearRect(0,0,c.width,c.height); } }catch(e){}
    try{ document.querySelectorAll('canvas.vanta-canvas,[id*="vanta"]').forEach(function(e){ e.remove(); }); }catch(e){}
    try{ if(window.VANTA&&VANTA.current&&VANTA.current.destroy) VANTA.current.destroy(); }catch(e){}
  }
  if(document.readyState!=='loading') stop(); else document.addEventListener('DOMContentLoaded', stop);
  var n=0, iv=setInterval(function(){ stop(); if(++n>6) clearInterval(iv); }, 700);
})();
</script>`;

/* ---------- volume slider in the game toolbar ---------- */
const volSliderHtml = '<div class="kxvol" style="display:flex;align-items:center;gap:8px;padding:0 14px 0 6px;color:#fff">'
  + '<i class="fas fa-volume-high" id="kxVolIcon" style="font-size:14px;width:16px;text-align:center;cursor:pointer"></i>'
  + '<input id="kxVol" type="range" min="0" max="100" value="100" title="Volume" '
  + 'style="width:90px;height:4px;accent-color:#fff;cursor:pointer"></div>';
html = html.replace('<div class="game-toolbar">', '<div class="game-toolbar">\n' + volSliderHtml);
if (!html.includes('id="kxVol"')) throw new Error('volume-slider anchor not found');

/* ---------- extra games: append to the external games.js array ----------
   github.io / static hosts that allow framing load through the hub's simple
   iframe path; the one Noah .html goes through the fetch+harness path. Each
   gets a clean monochrome SVG thumbnail unless it has a real image. */
const NOAH = 'https://raw.githubusercontent.com/NoahsAmazingTutoringHelp/Noahs-Calculus-Tutor/refs/heads/master';
function svgThumb(title){
  var t = String(title).replace(/[<>&]/g,'');
  var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='480' height='300'>"+
    "<rect width='100%' height='100%' fill='#141416'/>"+
    "<rect x='1' y='1' width='478' height='298' fill='none' stroke='rgba(255,255,255,.10)'/>"+
    "<text x='50%' y='50%' fill='#ffffff' font-family='Arial,Helvetica,sans-serif' font-size='"+(t.length>16?26:34)+"' font-weight='700' text-anchor='middle' dominant-baseline='middle'>"+t+"</text>"+
    "</svg>";
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
const EXTRA_GAMES = [
  { title:'Moto X3M', url:'https://kryzixsdex.pages.dev/g/motox3m/', desc:'Race your dirt bike through explosive stunt-filled time-trial levels. (ad-free)' },
  { title:'Madalin Stunt Cars 2', url:'https://kryzixsdex.pages.dev/g/madalin2/', desc:'Drive supercars around a huge open map full of ramps and stunts. (ad-free)' },
  { title:'Madalin Stunt Cars 3', url:'https://kryzixsdex.pages.dev/g/madalin3/', desc:'The sequel — even more supercars, ramps and stunt arenas. (ad-free)' },
  { title:'Smash Karts', url:'https://3kh0.github.io/projects/smashkarts/', desc:'Battle other karts with weapons in fast multiplayer arenas.' },
  { title:'Slope', url:'https://3kh0.github.io/projects/slope/', desc:'Race a ball down an endless neon slope at breakneck speed.' },
  { title:'Tetris', url:'https://chvin.github.io/react-tetris/', desc:'Stack and clear falling blocks in the timeless puzzle game.' },
  { title:'Chrome Dino', url:'https://wayou.github.io/t-rex-runner/', desc:'The offline dinosaur runner — jump the cacti, beat your score.' },
  { title:'10 Minutes Till Dawn', url: NOAH+'/games/15.html', image: NOAH+'/images/15.jpg', desc:'Survive endless waves of monsters for ten frantic minutes.' }
].map(function(g){ if(!g.image) g.image = svgThumb(g.title); return g; });
// unshift so the newly-added games appear at the START of the games grid
const extraGamesScript = '<script>try{if(typeof games!=="undefined"&&games&&games.unshift){games.unshift.apply(games,'
  + JSON.stringify(EXTRA_GAMES) + ');}}catch(e){}</'+'script>';
html = html.replace(
  '<script src="https://fastly.jsdelivr.net/gh/NoahsAmazingTutoringHelp/Noahs-Calculus-Tutor@master/games.js"></script>',
  '<script src="https://fastly.jsdelivr.net/gh/NoahsAmazingTutoringHelp/Noahs-Calculus-Tutor@master/games.js"></script>\n  ' + extraGamesScript);
if (!html.includes('games.unshift.apply(games,')) throw new Error('extra-games inject anchor not found');

/* ---------- kill ad-redirects: sandbox the URL-loaded game iframe so a game
     page can still run + save progress, but can't navigate the whole tab away
     (e.g. Moto X3M's 3kh0 embed redirecting to enjoy4fun.com) or throw popups.
     Only affects iframe-URL games; the self-contained Noah games are untouched. */
html = html.replace(
  '<iframe id="noah-inner-game-frame" src="${url}" frameborder="0" allowfullscreen>',
  '<iframe id="noah-inner-game-frame" src="${url}" frameborder="0" allowfullscreen ' +
    'sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock" ' +
    'allow="fullscreen; autoplay; gamepad; pointer-lock; clipboard-write; cross-origin-isolated">');
if (!html.includes('sandbox="allow-scripts allow-same-origin allow-pointer-lock')) throw new Error('game-iframe sandbox anchor not found');

/* improve the iframing: let the outer game frame delegate fullscreen, controller,
   pointer-lock and autoplay down to the game (Unity/WebGL games need these). */
html = html.replace(
  "frame.setAttribute('name', tabId);",
  "frame.setAttribute('name', tabId);\n      frame.setAttribute('allow','fullscreen; autoplay; gamepad; pointer-lock; clipboard-write; accelerometer; gyroscope');\n      frame.setAttribute('allowfullscreen','');");
if (!html.includes("frame.setAttribute('allow','fullscreen; autoplay; gamepad")) throw new Error('game-frame allow anchor not found');

/* ---------- 2. rebrand Noah -> KryzixsDEX ---------- */
// swap the two logo images for a text wordmark
html = html.replace(/<img[^>]*class="logo"[^>]*>/i, '<span class="logo kx-word">KryzixsDEX</span>');
html = html.replace(/<img[^>]*class="home-logo"[^>]*>/i, '<span class="home-logo kx-word">KryzixsDEX</span>');
// clean, static subtitle — drop the scrambling typewriter (no #typing-quote id, so its JS no-ops)
html = html.replace(/<p class="home-subtitle">[\s\S]*?<\/p>/i,
  '<p class="home-subtitle">Your games, unblocked. Sign in and play.</p>');
// visible brand phrases (not touching hrefs — social links stay pointed at the real accounts)
html = html
  .replace(/Noah's Tutoring Hub/g, 'KryzixsDEX')
  .replace(/Noahs Tutoring Hub/g, 'KryzixsDEX')
  .replace(/Noah's Tutoring/g, 'KryzixsDEX')
  .replace(/Noah's Calculus Tutor/g, 'KryzixsDEX')
  .replace(/Noahs Tutoring/g, 'KryzixsDEX')            // the document.title template rebuilt on tab switch
  .replace(/Noah\\'s Tutoring Hub/g, 'KryzixsDEX')     // escaped apostrophe in a JS string (console banner)
  .replace(/Noah Hub Site Chat/g, 'KryzixsDEX Chat');

/* ---------- chat: the old Padlet board was deleted; drop in a clean
     placeholder until a working board id is provided ---------- */
// Chat now lives in its own "Live Chat" tab — hide the old footer chat block.
html = html.replace('<div style="margin: 30px 0 20px; width: 100%; position: relative;">',
  '<div style="display:none;margin: 30px 0 20px; width: 100%; position: relative;">');

/* ---------- 3. rename LESSONS -> GAMES, drop PARTNERS ---------- */
html = html
  .replace(/(<div[^>]*id="lessonsTab"[^>]*>)\s*LESSONS\s*(<\/div>)/i, '$1GAMES$2')
  .replace(/>\s*ALL LESSONS\s*</i, '>ALL GAMES<')
  .replace(/placeholder="Search lessons\.\.\."/i, 'placeholder="Search games..."');

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,400;6..72,600&family=JetBrains+Mono:wght@500;700&display=swap">`;

const skin = `<style id="kryzixs-skin">
/* ===== KryzixsDEX monochrome skin — overrides the orange theme ===== */
:root{
  --primary-orange:#FAFAFA; --primary-orange-rgb:255,255,255; --accent-orange:#FFFFFF;
  --k-bg:#0A0A0A; --k-panel:#141414; --k-line:rgba(255,255,255,.09); --k-muted:#9A9A9A;
}
html,body{background:var(--k-bg)!important;color:#EDEDED!important}
*{font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif}
code,pre,.mono,[class*="count"]{font-family:'JetBrains Mono',ui-monospace,monospace}
h1,h2,h3,.home-subtitle,.home-title{font-family:'Newsreader',Georgia,serif!important;letter-spacing:-.015em!important;font-weight:600!important}

/* kill the ad clutter and orange glow — this is what read as "porn-hub" */
.ad-container,.banner-ad,ins.adsbygoogle{display:none!important}
body::before,body::after,.home-hero::before,.home-hero::after,#main-container::before{
  background:radial-gradient(circle at 50% 20%, rgba(255,255,255,.045), transparent 60%)!important;
  box-shadow:none!important}

/* header / nav */
header,.top-bar{background:#0B0B0B!important;border-bottom:1px solid var(--k-line)!important;box-shadow:none!important}
.nav-tab{color:var(--k-muted)!important;letter-spacing:.1em!important;font-weight:600!important;
  border-radius:9px!important;transition:color .16s,background .16s!important;text-shadow:none!important}
.nav-tab:hover{color:#fff!important;background:rgba(255,255,255,.05)!important}
.nav-tab.active{color:#0A0A0A!important;background:#fff!important;box-shadow:none!important}
.social-icons a{color:var(--k-muted)!important;text-shadow:none!important}
.social-icons a:hover{color:#fff!important}
.logo,.home-logo{filter:grayscale(1) brightness(1.15)!important}

/* hero */
.home-hero{background:transparent!important}
.home-subtitle{color:var(--k-muted)!important}

/* search */
.search-box{background:var(--k-panel)!important;border:1px solid rgba(255,255,255,.14)!important;
  color:#fff!important;border-radius:12px!important;box-shadow:none!important;font-family:'JetBrains Mono',monospace!important}
.search-box:focus{border-color:rgba(255,255,255,.34)!important}
.search-icon{color:var(--k-muted)!important}

/* cards / grid */
.lessons-grid,.home-carousel{gap:16px!important}
.lesson-card,.partner-card{background:var(--k-panel)!important;border:1px solid var(--k-line)!important;
  border-radius:14px!important;box-shadow:none!important;text-shadow:none!important;
  transition:transform .18s cubic-bezier(.2,.8,.3,1),border-color .18s,box-shadow .18s!important}
.lesson-card:hover,.partner-card:hover{transform:translateY(-5px)!important;border-color:rgba(255,255,255,.24)!important;
  box-shadow:0 16px 34px -20px #000!important}

/* buttons */
.btn,button.file-btn,.file-btn{background:#fff!important;color:#0A0A0A!important;border:0!important;
  border-radius:10px!important;font-weight:700!important;text-shadow:none!important;box-shadow:none!important;
  transition:filter .15s,transform .1s!important}
.btn:hover,.file-btn:hover{filter:brightness(.9)!important;background:#fff!important}
.btn:active{transform:translateY(1px)!important}

/* modals */
.modal,.modal-content,[class*="modal"]{background:#111!important;border:1px solid var(--k-line)!important;
  border-radius:16px!important}

/* game frame chrome */
.game-frame{background:#0A0A0A!important;border:1px solid var(--k-line)!important;border-radius:14px!important}

/* text wordmark replacing the Noah logo images */
.kx-word{font-family:'Newsreader',Georgia,serif!important;font-weight:600!important;color:#fff!important;
  letter-spacing:-.02em!important;text-decoration:none!important;display:inline-flex;align-items:center;cursor:pointer}
.logo.kx-word{font-size:22px!important}
.home-logo.kx-word{font-size:clamp(38px,7vw,72px)!important;justify-content:center;width:100%;filter:none!important}

/* Partners tab + section removed */
#partnersTab{display:none!important}
#partners-section{display:none!important}

/* Recently played strip */
#kxRecentWrap{margin:0 0 26px}
#kxRecentWrap h2{font-family:'Newsreader',Georgia,serif!important;font-weight:600!important;
  letter-spacing:-.01em;margin:0 0 14px}
#kxRecent{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
#kxRecentEmpty{color:var(--k-muted);font-size:13.5px;padding:10px 2px}
#kxRecent .lesson-card .kx-when{display:block;margin-top:6px;color:var(--k-muted);
  font-family:'JetBrains Mono',monospace;font-size:11px}

/* social icons removed */
.social-icons{display:none!important}

/* ===== new GUI pass — layout, not just colour ===== */
body{background:
  radial-gradient(1100px 500px at 100% -10%, rgba(255,255,255,.05), transparent 60%),
  radial-gradient(900px 500px at -10% 110%, rgba(255,255,255,.04), transparent 60%),
  #090909!important}
/* sticky glass header, centred nav */
header{position:sticky!important;top:0!important;z-index:900!important;
  background:rgba(10,10,10,.72)!important;backdrop-filter:blur(14px) saturate(1.2)!important;
  border-bottom:1px solid rgba(255,255,255,.08)!important;padding:12px 22px!important}
.top-bar{max-width:1200px!important;margin:0 auto!important;gap:18px!important}
.nav-tabs{gap:6px!important;background:rgba(255,255,255,.04)!important;padding:5px!important;
  border-radius:14px!important;border:1px solid rgba(255,255,255,.07)!important}
.nav-tab{padding:8px 18px!important;border-radius:10px!important;font-size:13px!important}
/* hero: tighter, cleaner, animated wordmark */
#home-section{max-width:1200px;margin:0 auto;padding:0 22px}
.home-hero{padding:64px 0 30px!important}
.home-logo.kx-word{animation:kxRise .7s cubic-bezier(.2,.8,.3,1) both}
.home-subtitle{font-size:15px!important}
@keyframes kxRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
/* section headings as eyebrow + rule */
#all-lessons h2,.home-popular-wrap h2{font-size:13px!important;font-family:'Inter',sans-serif!important;
  font-weight:700!important;letter-spacing:.18em!important;text-transform:uppercase!important;
  color:var(--k-muted)!important;display:flex;align-items:center;gap:14px;margin:0 0 18px!important}
#all-lessons h2::after,.home-popular-wrap h2::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.09)}
#all-lessons,.home-popular-wrap{max-width:1200px!important;margin:0 auto!important;padding:26px 22px!important}
/* card system — cleaner, image-forward, springy */
.lessons-grid{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))!important;gap:18px!important}
.lesson-card{padding:0!important;overflow:hidden!important;border-radius:16px!important;background:#131313!important;
  animation:cardIn .5s cubic-bezier(.2,.8,.3,1) both!important}
/* stagger the first two rows so the grid cascades in on load */
@keyframes cardIn{from{opacity:0;transform:translateY(22px) scale(.97)}to{opacity:1;transform:none}}
.lessons-grid .lesson-card:nth-child(1){animation-delay:.02s}
.lessons-grid .lesson-card:nth-child(2){animation-delay:.06s}
.lessons-grid .lesson-card:nth-child(3){animation-delay:.10s}
.lessons-grid .lesson-card:nth-child(4){animation-delay:.14s}
.lessons-grid .lesson-card:nth-child(5){animation-delay:.18s}
.lessons-grid .lesson-card:nth-child(6){animation-delay:.22s}
.lessons-grid .lesson-card:nth-child(7){animation-delay:.26s}
.lessons-grid .lesson-card:nth-child(8){animation-delay:.30s}
.lessons-grid .lesson-card:nth-child(9){animation-delay:.34s}
.lessons-grid .lesson-card:nth-child(10){animation-delay:.38s}
.lessons-grid .lesson-card:nth-child(n+11){animation-delay:.42s}
/* never let a card get stuck invisible if the animation doesn't run */
@media (prefers-reduced-motion:reduce){.lesson-card{animation:none!important;opacity:1!important;transform:none!important}}
.lesson-card{opacity:1}

/* ===== games hub — premium polish pass ===== */
@keyframes kxHero{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
/* hero: bigger, cleaner wordmark, subtle float on the logo */
.home-hero{padding:60px 22px 30px!important;max-width:1180px;margin:0 auto!important}
.home-logo-wrap,.home-logo{animation:kxHero .7s cubic-bezier(.2,.8,.3,1) both!important}
.home-title,.home-hero h1{font-family:var(--serif,'Newsreader',serif)!important;font-weight:600!important;
  font-size:clamp(34px,5vw,60px)!important;letter-spacing:-.03em!important}
.home-subtitle{font-size:15px!important;color:#9a9a9a!important}
/* popular carousel cards match the grid */
.home-carousel .lesson-card,.home-carousel-track .lesson-card{border-radius:16px!important}
/* image-forward cards: full-bleed thumb, tidy caption, springy hover */
.lesson-card{padding:0!important;overflow:hidden!important;border-radius:16px!important;background:#131313!important;
  border:1px solid rgba(255,255,255,.08)!important;box-shadow:none!important;
  transition:transform .2s cubic-bezier(.2,.8,.3,1),border-color .2s,box-shadow .2s!important}
.lesson-card:hover{transform:translateY(-6px)!important;border-color:rgba(255,255,255,.26)!important;
  box-shadow:0 20px 44px -24px #000!important}
.lesson-image{width:100%!important;aspect-ratio:16/10!important;object-fit:cover!important;margin:0!important;
  border-radius:0!important;display:block!important;transition:transform .35s cubic-bezier(.2,.8,.3,1)!important}
.lesson-card:hover .lesson-image{transform:scale(1.07)!important}
.lesson-title{font-size:14px!important;font-weight:600!important;margin:12px 14px 2px!important;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lesson-desc{font-size:11.5px!important;color:#8a8a8a!important;margin:0 14px 13px!important;line-height:1.5!important;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lessons-grid{grid-template-columns:repeat(auto-fill,minmax(184px,1fr))!important;gap:18px!important;
  max-width:1180px;margin:0 auto!important}
/* nav: pill tabs, clear active state */
.nav-tab{border-radius:10px!important;letter-spacing:.06em!important;font-weight:600!important;
  transition:color .16s,background .16s!important}
.nav-tab:hover{background:rgba(255,255,255,.06)!important}
.nav-tab.active{background:#fff!important;color:#0a0a0a!important;box-shadow:none!important}
/* search: centered, roomy, focus ring */
.search-container{max-width:560px!important;margin:0 auto 8px!important}
.search-box{border-radius:14px!important;padding:13px 46px 13px 16px!important;font-size:14px!important;
  transition:border-color .16s,box-shadow .16s!important}
.search-box:focus{box-shadow:0 0 0 4px rgba(255,255,255,.08)!important}

/* ===== settings page polish ===== */
#settings-section{max-width:1100px;margin:0 auto;padding:26px 22px}
#settings-section .setting-item{background:#141414!important;border:1px solid rgba(255,255,255,.08)!important;
  border-radius:16px!important;padding:18px!important;box-shadow:none!important;animation:kxIn2 .35s ease both}
@keyframes kxIn2{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
#settings-section .setting-item:hover{border-color:rgba(255,255,255,.18)!important}
#settings-section .setting-label{font-weight:600!important;font-size:14px!important;color:#fff!important}
#settings-section .setting-description{color:#8a8a8a!important;font-size:12.5px!important;line-height:1.55!important}
#settings-section input[type="text"],#settings-section input[type="url"],#settings-section select,#settings-section .color-input{
  background:#0c0c0c!important;border:1px solid rgba(255,255,255,.16)!important;border-radius:10px!important;color:#fff!important;padding:10px 12px!important}
#settings-section .apply-btn,#settings-section .file-btn,#settings-section .btn{
  background:#fff!important;color:#000!important;border:0!important;border-radius:10px!important;font-weight:700!important;
  padding:10px 16px!important;cursor:pointer!important;transition:filter .15s,transform .1s!important}
#settings-section .apply-btn:hover,#settings-section .file-btn:hover{filter:brightness(.9)!important}
#settings-section .apply-btn:active{transform:translateY(1px)!important}
#settings-section .apply-btn.btn-danger{background:#2a2a2a!important;color:#ff6b6b!important}
#settings-section .background-option,#settings-section .theme-preset,#settings-section .color-preview{border-radius:12px!important}

/* ===== locked monochrome: hide the theme-color picker ===== */
#settings-section .setting-theme,#settings-section .setting-item.setting-theme{display:none!important}

/* ===== settings — new, cleaner design ===== */
#settings-section h2,#settings-section .settings-title{font-family:'Newsreader',Georgia,serif!important;
  font-weight:600!important;font-size:26px!important;letter-spacing:-.015em!important;color:#fff!important;
  text-transform:none!important;border:0!important;background:none!important;padding:0!important;margin:0 0 4px!important}
#settings-section .setting-item{background:linear-gradient(180deg,#141416,#0f0f11)!important;
  border:1px solid rgba(255,255,255,.08)!important;border-radius:18px!important;padding:20px!important;
  box-shadow:0 1px 0 rgba(255,255,255,.03) inset!important;transition:border-color .18s,transform .18s!important}
#settings-section .setting-item:hover{transform:translateY(-2px)!important;border-color:rgba(255,255,255,.16)!important}
#settings-section .setting-label{display:flex;align-items:center;gap:8px;font-size:14.5px!important;margin-bottom:2px!important}
#settings-section .setting-label i{color:#fff!important;opacity:.9;text-shadow:none!important}
#settings-section .background-option,#settings-section .bg-option{border:1px solid rgba(255,255,255,.12)!important;
  background:#0e0e10!important;color:#cfcfcf!important;border-radius:12px!important;transition:.15s!important}
#settings-section .background-option:hover,#settings-section .bg-option:hover{border-color:rgba(255,255,255,.3)!important;color:#fff!important}
#settings-section .background-option.active,#settings-section .bg-option.active,#settings-section .background-option.selected{
  background:#fff!important;color:#000!important;border-color:#fff!important}
#settings-section select{appearance:none}

/* ===== cloak menu tab ===== */

/* ===== chat: make it clean + visible ===== */
footer #commentsBlur[data-off]{display:none!important}

/* =========================================================
   COMPLETE REVAMP — clean, modern, professional
   ========================================================= */
:root{ --kx-bg:#0A0A0B; --kx-surface:#131315; --kx-surface2:#1a1a1d;
  --kx-line:rgba(255,255,255,.08); --kx-line2:rgba(255,255,255,.14);
  --kx-text:#F5F5F6; --kx-muted:#9b9ba3; --kx-muted2:#66666e; }

html,body{ background:var(--kx-bg)!important; color:var(--kx-text)!important;
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif!important;
  -webkit-font-smoothing:antialiased; }
body{ background-image:
  radial-gradient(1200px 560px at 100% -12%, rgba(255,255,255,.045), transparent 62%),
  radial-gradient(1000px 560px at -12% 112%, rgba(255,255,255,.03), transparent 62%)!important; }

/* ---- top bar / nav ---- */
header,.top-bar{ background:rgba(10,10,11,.7)!important; backdrop-filter:blur(16px) saturate(1.3)!important;
  border-bottom:1px solid var(--kx-line)!important; box-shadow:none!important; }
.top-bar{ max-width:1200px; margin:0 auto; padding:14px 24px!important; gap:20px!important; align-items:center; }
.logo,.logo.kx-word{ font-family:'Newsreader',Georgia,serif!important; font-weight:600!important;
  font-size:22px!important; letter-spacing:-.015em!important; color:#fff!important;
  background:linear-gradient(92deg,#fff,#c7c7cc)!important; -webkit-background-clip:text!important;
  background-clip:text!important; -webkit-text-fill-color:transparent!important; }
.nav-tabs{ background:rgba(255,255,255,.04)!important; padding:5px!important; border-radius:13px!important;
  border:1px solid var(--kx-line)!important; gap:2px!important; }
.nav-tab{ padding:8px 16px!important; border-radius:9px!important; color:var(--kx-muted)!important;
  font-weight:600!important; font-size:13px!important; letter-spacing:.04em!important; text-shadow:none!important;
  transition:color .16s, background .16s!important; }
.nav-tab:hover{ color:#fff!important; background:rgba(255,255,255,.05)!important; }
.nav-tab.active{ color:#0a0a0b!important; background:#fff!important; box-shadow:0 2px 10px -4px rgba(255,255,255,.5)!important; }

/* ---- hero ---- */
#home-section{ max-width:1200px; margin:0 auto; }
.home-hero{ padding:64px 24px 34px!important; }
.home-logo.kx-word{ font-size:clamp(44px,7vw,78px)!important; letter-spacing:-.035em!important;
  background:none!important; color:#fff!important; -webkit-text-fill-color:#fff!important;
  font-family:'Newsreader',Georgia,serif!important; font-weight:600!important; line-height:1.05!important; }
.home-subtitle{ color:var(--kx-muted)!important; font-size:15.5px!important; max-width:60ch; margin:14px auto 0!important; }
.home-hero .skyline,.home-hero svg.skyline{ opacity:.25!important; }
/* the logo is now a text wordmark — kill the leftover image "shine" box */
#homeLogoShine,.home-logo-shine{ display:none!important; }
.home-logo-wrap{ background:transparent!important; box-shadow:none!important; display:flex; justify-content:center; }
.home-logo-wrap::after,.home-logo-wrap::before{ display:none!important; }

/* ---- section headers ---- */
#all-lessons,.home-popular-wrap{ max-width:1200px!important; margin:0 auto!important; padding:30px 24px 44px!important; }
#all-lessons h2,.home-popular-wrap h2,.section-title{ font-size:12px!important; letter-spacing:.2em!important;
  text-transform:uppercase!important; color:var(--kx-muted)!important; font-weight:700!important; font-family:'Inter',sans-serif!important;
  display:flex; align-items:center; gap:16px; margin:0 0 20px!important; transform:none!important; text-shadow:none!important; }
#all-lessons h2::after,.home-popular-wrap h2::after,.section-title::after{ content:""; flex:1; height:1px; background:var(--kx-line); }
.section-head{ justify-content:flex-start!important; }

/* ---- search ---- */
.search-container{ max-width:600px!important; margin:0 auto 8px!important; }
.search-box{ background:var(--kx-surface)!important; border:1px solid var(--kx-line2)!important;
  border-radius:14px!important; padding:14px 46px 14px 18px!important; font-size:14.5px!important; color:#fff!important;
  box-shadow:0 12px 40px -24px #000!important; transition:border-color .16s, box-shadow .16s!important; }
.search-box:focus{ border-color:#fff!important; box-shadow:0 0 0 4px rgba(255,255,255,.08)!important; }
.search-box::placeholder{ color:var(--kx-muted2)!important; }

/* ---- game cards ---- */
.lessons-grid{ grid-template-columns:repeat(auto-fill,minmax(186px,1fr))!important; gap:18px!important; max-width:1200px; margin:0 auto!important; }
.lesson-card{ background:var(--kx-surface)!important; border:1px solid var(--kx-line)!important; border-radius:16px!important;
  overflow:hidden!important; padding:0!important; box-shadow:none!important;
  transition:transform .2s cubic-bezier(.2,.8,.3,1), border-color .2s, box-shadow .2s!important; }
.lesson-card:hover{ transform:translateY(-6px)!important; border-color:var(--kx-line2)!important;
  box-shadow:0 22px 48px -26px #000!important; }
.lesson-image{ width:100%!important; aspect-ratio:16/10!important; object-fit:cover!important; margin:0!important;
  border-radius:0!important; display:block!important; transition:transform .38s cubic-bezier(.2,.8,.3,1)!important; }
.lesson-card:hover .lesson-image{ transform:scale(1.07)!important; }
.lesson-title{ font-size:13.5px!important; font-weight:600!important; margin:12px 14px 2px!important; color:#fff!important;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.lesson-desc{ font-size:11.5px!important; color:var(--kx-muted)!important; margin:0 14px 14px!important; line-height:1.5!important;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.badge{ background:rgba(0,0,0,.55)!important; border:1px solid var(--kx-line)!important; color:#e8e8ea!important;
  border-radius:8px!important; font-size:10px!important; letter-spacing:.04em; }

/* ---- footer / chat ---- */
footer{ max-width:1200px; margin:0 auto; padding:0 24px 40px; color:var(--kx-muted2)!important; }
footer iframe[src*="padlet"]{ border-radius:16px!important; border:1px solid var(--kx-line)!important; }

/* ---- global niceties ---- */
::selection{ background:#fff; color:#000; }
::-webkit-scrollbar{ width:10px; height:10px; }
::-webkit-scrollbar-thumb{ background:#2a2a2e; border-radius:6px; border:2px solid var(--kx-bg); }
::-webkit-scrollbar-thumb:hover{ background:#3a3a40; }
footer iframe[src*="padlet"]{border-radius:16px!important;border:1px solid rgba(255,255,255,.1)!important}
footer{color:#8a8a8a}

/* ============ v2 redesign — cleaner, more premium ============ */
#main-container{background:transparent!important}
/* KILL every box/outline/glow around text (the source drew borders on them) */
.home-logo,.home-logo.kx-word,.logo,.logo.kx-word,.home-logo-wrap,
#settings-section h2,#settings-section .settings-title,.section-title,.setting-label,
.home-subtitle,.home-hero h1,.home-popular-wrap h2,#all-lessons h2,.section-head,.section-head h2{
  border:0!important;outline:none!important;box-shadow:none!important;background:none!important;
  -webkit-text-stroke:0!important;text-shadow:none!important}
.home-logo-wrap::before,.home-logo-wrap::after,.home-logo-shine{display:none!important;content:none!important}
.section-title::before,.home-popular-wrap h2::before,#all-lessons h2::before{content:none!important;display:none!important}
.home-logo-wrap{width:auto!important;perspective:none!important;transform:none!important}
/* flatten the settings panel — remove the outer box so only the leaf cards show */
#settings-section .modal-content{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
#settings-section .modal-header{border:0!important;background:none!important;box-shadow:none!important;padding:4px 0 14px!important}
#settings-section .modal-title{border:0!important;background:none!important;box-shadow:none!important;padding:0!important;
  font-family:'Newsreader',Georgia,serif!important;font-size:28px!important;font-weight:600!important;color:#fff!important;display:flex;align-items:center;gap:10px}
#settings-section .modal-title i{color:#fff!important}
#settings-section .modal-body{background:none!important;border:0!important;box-shadow:none!important;padding:0!important}
/* top bar: tighter, brand + tabs + account aligned on one line */
.top-bar{max-width:1240px!important;margin:0 auto!important;padding:15px 26px!important;
  display:flex!important;align-items:center!important;gap:22px!important}
.top-nav-actions{display:flex!important;align-items:center!important;gap:12px!important;margin-left:auto!important}
.logo.kx-word,.logo{font-size:23px!important}
/* hero: clean, no texture, tighter wordmark */
.home-hero{position:relative;padding:72px 24px 30px!important;max-width:1240px;margin:0 auto}
.home-logo.kx-word{font-size:clamp(48px,8vw,88px)!important;letter-spacing:-.04em!important;line-height:.95!important;transform:none!important}
.home-subtitle{font-size:16px!important;color:#a2a2aa!important;margin-top:16px!important}
/* section headers as eyebrows with a subtle count-style rule */
#all-lessons,.home-popular-wrap{max-width:1240px!important;margin:0 auto!important;padding:34px 26px 48px!important}
/* search — big, centred, the focal point */
.search-container{max-width:640px!important;margin:0 auto 4px!important;position:relative}
.search-box{background:#141416!important;border:1px solid rgba(255,255,255,.16)!important;border-radius:16px!important;
  padding:16px 48px 16px 20px!important;font-size:15px!important;box-shadow:0 20px 60px -30px #000!important}
.search-box:focus{border-color:#fff!important;box-shadow:0 0 0 4px rgba(255,255,255,.08),0 20px 60px -30px #000!important}
/* cards: gradient hairline, image-forward, springy */
.lessons-grid{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))!important;gap:20px!important;max-width:1240px;margin:0 auto!important}
.lesson-card{position:relative;background:#141416!important;border:1px solid rgba(255,255,255,.08)!important;
  border-radius:18px!important;overflow:hidden!important;padding:0!important;
  transition:transform .22s cubic-bezier(.2,.8,.3,1),border-color .22s,box-shadow .22s!important}
.lesson-card:hover{transform:translateY(-7px)!important;border-color:rgba(255,255,255,.28)!important;
  box-shadow:0 26px 56px -28px #000!important}
.lesson-card::after{content:"";position:absolute;inset:0;border-radius:18px;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.06),transparent 30%);opacity:0;transition:opacity .22s}
.lesson-card:hover::after{opacity:1}
.lesson-title{font-size:14px!important;font-weight:600!important;margin:13px 15px 2px!important}
.lesson-desc{font-size:11.5px!important;margin:0 15px 15px!important}
footer{color:#66666e!important}
.lesson-image{width:100%!important;aspect-ratio:16/10!important;object-fit:cover!important;
  border-radius:0!important;margin:0!important;display:block!important;
  transition:transform .3s cubic-bezier(.2,.8,.3,1)!important}
.lesson-card:hover .lesson-image{transform:scale(1.06)!important}
.lesson-title{font-size:14px!important;font-weight:600!important;margin:12px 14px 0!important}
.lesson-desc{font-size:12px!important;color:var(--k-muted)!important;margin:5px 14px 14px!important;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#kxRecent .lesson-card .kx-when{margin:0 14px 12px!important}
/* search — centred, big, focused ring */
.search-container{max-width:560px!important;margin:0 auto 6px!important}
.search-box{padding:13px 46px 13px 16px!important;font-size:14px!important;border-radius:14px!important}

::selection{background:#fff;color:#000}
::-webkit-scrollbar{width:9px;height:9px}
::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:5px}

/* ================= v3: unify the whole site to the login-card look =================
   glowing dark gradient panels, soft hairline borders, rounded 20-24px, serif eyebrows */
.home-popular-wrap,#all-lessons{position:relative!important;background:linear-gradient(180deg,#151517,#0f0f11)!important;
  border:1px solid rgba(255,255,255,.08)!important;border-radius:24px!important;
  margin:22px auto 30px!important;padding:28px 26px 36px!important;overflow:hidden!important;
  box-shadow:0 40px 100px -50px #000!important}
.home-popular-wrap::before,#all-lessons::before{content:""!important;position:absolute;top:-34%;left:50%;
  transform:translateX(-50%);width:130%;height:70%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(255,255,255,.07),transparent)!important}
.home-popular-wrap>*,#all-lessons>*{position:relative;z-index:1}
/* game cards → same gradient + glow accent as the login card */
.lesson-card{background:linear-gradient(180deg,#181819,#111113)!important;border:1px solid rgba(255,255,255,.10)!important;
  border-radius:20px!important;box-shadow:0 18px 46px -34px #000!important}
.lesson-card:hover{border-color:rgba(255,255,255,.26)!important;box-shadow:0 30px 66px -30px #000!important;transform:translateY(-7px)!important}
.lesson-card::after{content:""!important;position:absolute;inset:0;border-radius:20px;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 34%);opacity:0;transition:opacity .22s}
.lesson-card:hover::after{opacity:1}
/* search bar → login input styling */
.search-box{background:#0c0c0d!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:14px!important;
  box-shadow:0 20px 60px -34px #000!important}
.search-box:focus{border-color:rgba(255,255,255,.45)!important;box-shadow:0 0 0 4px rgba(255,255,255,.08),0 20px 60px -34px #000!important}
/* shared popup panels (chat / admin / proxy / dialogs) → matching gradient + glow */
#kxLC .win,#kxAdmin .win,#kxProxy .win,#kxInter .kx-win,#kxDlg .card,#kxRoomModal .rm-card{
  background:linear-gradient(180deg,#161618,#111113)!important;border:1px solid rgba(255,255,255,.12)!important;
  box-shadow:0 40px 100px -30px #000!important}
/* section eyebrow headers → serif accent to match the login wordmark */
.home-popular-wrap h2,#all-lessons h2,.section-title{font-family:'Newsreader',Georgia,serif!important;
  text-transform:none!important;letter-spacing:-.01em!important;font-size:20px!important;font-weight:600!important;color:#fff!important}
.home-popular-wrap h2::after,#all-lessons h2::after,.section-title::after{background:rgba(255,255,255,.10)!important}
/* ---- Live Chat refresh ---- */
#kxLC .side{background:linear-gradient(180deg,#141416,#0d0d0f)!important;border-right:1px solid rgba(255,255,255,.07)!important}
#kxLC .side h3{font-family:'Newsreader',serif!important}
#kxLC .room{border-radius:12px!important;transition:background .15s,transform .15s,box-shadow .15s!important}
#kxLC .room:hover{transform:translateX(2px)!important}
#kxLC .room.on{background:rgba(255,255,255,.10)!important;box-shadow:inset 3px 0 0 #fff!important;color:#fff!important}
#kxLC .newroom{border-radius:12px!important;transition:filter .15s,transform .1s!important}
#kxLC .newroom:hover{filter:brightness(.92)!important}
#kxLC .top{background:#0d0d0f!important}
#kxLC .b{box-shadow:0 8px 22px -14px #000!important}
#kxLC .b.them{background:#232327!important}
#kxLC .b.me{background:linear-gradient(180deg,#ffffff,#ededf0)!important}
#kxLC .bar{background:#0d0d0f!important}
#kxLC .bar input{background:#161618!important;transition:border-color .15s,box-shadow .15s!important}
#kxLC .bar input:focus{box-shadow:0 0 0 4px rgba(255,255,255,.07)!important}
#kxLC .bar button{transition:filter .12s,transform .1s!important}
#kxLC .bar button:hover{filter:brightness(.9)!important}
</style>`;

// Inject fonts + skin right before </head>
html = html.replace(/<\/head>/i, fonts + '\n' + skin + '\n</head>');

// ---- proxy browser: injected tab + overlay ----
const proxyJs = `<script>
(function(){
  var WORKER='${WORKER}';
  function norm(v){ v=(v||'').trim(); if(!v) return '';
    if(/^https?:\\/\\//i.test(v)) return v;
    if(/^[\\w-]+(\\.[\\w-]+)+(\\/|$|:)/.test(v)) return 'https://'+v;
    return 'https://duckduckgo.com/?q='+encodeURIComponent(v); }

  // BROWSER tab removed — the PROXY tab covers this.
  function addTab(){
    // also remove it if an older cached build added one
    var old=document.getElementById('browserTab'); if(old) old.remove();
  }

  // 2) full-screen proxy overlay
  function build(){
    if(document.getElementById('kxProxy')) return;
    var o=document.createElement('div'); o.id='kxProxy';
    o.innerHTML=
      '<div class="kx-bar">'+
        '<button class="kx-btn" id="kxBack" title="Back">‹</button>'+
        '<input id="kxUrl" placeholder="Search or enter a URL — loads unblocked through your proxy" autocomplete="off" spellcheck="false">'+
        '<button class="kx-btn kx-go" id="kxGo">Go</button>'+
        '<button class="kx-btn" id="kxOpen" title="Open in a new tab">↗</button>'+
        '<button class="kx-btn kx-close" id="kxClose" title="Close">✕</button>'+
      '</div>'+
      '<div class="kx-marks" id="kxMarks"></div>'+
      '<div class="kx-frame"><div class="kx-veil" id="kxVeil">Enter a URL and press Go.</div>'+
        '<iframe id="kxFrame" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>';
    document.body.appendChild(o);
    var css=document.createElement('style'); css.textContent=
      '#kxProxy{position:fixed;inset:0;z-index:99999;background:#0A0A0A;display:none;flex-direction:column;font-family:Inter,sans-serif}'+
      '#kxProxy.on{display:flex}'+
      '.kx-bar{display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.09);background:#0B0B0B}'+
      '#kxUrl{flex:1;background:#141414;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 13px;color:#fff;font:13px JetBrains Mono,ui-monospace,monospace}'+
      '#kxUrl:focus{outline:none;border-color:rgba(255,255,255,.34)}'+
      '.kx-btn{background:#181818;border:1px solid rgba(255,255,255,.12);color:#EDEDED;border-radius:10px;padding:9px 13px;cursor:pointer;font-size:14px;font-weight:600}'+
      '.kx-btn:hover{background:#222}'+
      '.kx-go{background:#fff;color:#000;border-color:#fff}'+
      '.kx-close{background:transparent}'+
      '.kx-marks{display:flex;gap:7px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06)}'+
      '.kx-chip{background:#141414;border:1px solid rgba(255,255,255,.12);color:#cfcfcf;border-radius:999px;padding:5px 12px;font-size:12.5px;cursor:pointer}'+
      '.kx-chip:hover{color:#fff;border-color:rgba(255,255,255,.28)}'+
      '.kx-frame{flex:1;position:relative;background:#0A0A0A}'+
      '.kx-frame iframe{width:100%;height:100%;border:0;display:block;background:#0A0A0A}'+
      '.kx-veil{position:absolute;inset:0;display:grid;place-content:center;gap:10px;text-align:center;color:#7a7a7a;font-size:13px;padding:24px}'+
      '.kx-spin{width:26px;height:26px;border:2px solid rgba(255,255,255,.15);border-top-color:#fff;border-radius:50%;margin:0 auto;animation:kxspin .8s linear infinite}'+
      '@keyframes kxspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(css);

    var marks=[['Google','https://www.google.com'],['YouTube','https://www.youtube.com'],
      ['Wikipedia','https://en.wikipedia.org/wiki/Special:Random'],['Discord','https://discord.com/app'],
      ['GitHub','https://github.com']];
    document.getElementById('kxMarks').innerHTML=marks.map(function(m,i){
      return '<span class="kx-chip" data-i="'+i+'">'+m[0]+'</span>'; }).join('');
    document.querySelectorAll('#kxMarks .kx-chip').forEach(function(c){
      c.onclick=function(){ document.getElementById('kxUrl').value=marks[+c.dataset.i][1]; go(); }; });

    document.getElementById('kxGo').onclick=go;
    document.getElementById('kxClose').onclick=function(){ o.classList.remove('on'); document.getElementById('kxFrame').src='about:blank'; };
    document.getElementById('kxOpen').onclick=function(){ var u=norm(document.getElementById('kxUrl').value); if(u){ window.__kxAllowOpen=true; window.open(u,'_blank','noopener'); } };
    document.getElementById('kxBack').onclick=function(){ try{ document.getElementById('kxFrame').contentWindow.history.back(); }catch(e){} };
    document.getElementById('kxUrl').addEventListener('keydown',function(e){ if(e.key==='Enter') go(); });
  }
  function go(){
    var u=norm(document.getElementById('kxUrl').value); if(!u) return;
    var f=document.getElementById('kxFrame'), v=document.getElementById('kxVeil');
    var host=u; try{ host=new URL(u).hostname; }catch(e){}
    v.innerHTML='<div class="kx-spin"></div><div>Loading '+host+' through your proxy…</div>'; v.style.display='grid';
    f.src=WORKER+encodeURIComponent(u);
    var t=setTimeout(function(){ v.innerHTML='<div>If this stays blank, the site is too heavy for the proxy. Try ↗ Open in a new tab.</div>'; },7000);
    f.onload=function(){ clearTimeout(t); v.style.display='none'; };
  }
  window.openProxy=function(){ build(); document.getElementById('kxProxy').classList.add('on');
    setTimeout(function(){ var i=document.getElementById('kxUrl'); if(i) i.focus(); },50); };

  if(document.readyState!=='loading') addTab();
  else document.addEventListener('DOMContentLoaded', addTab);
  // the site re-renders the nav on tab switches; keep our tab present
  setInterval(addTab, 1500);
})();
</script>`;

/* ---------- recently played (saves to localStorage) ---------- */
const recentJs = `<script>
(function(){
  var KEY='kx_recent', MAX=12;
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
  function save(a){ try{ localStorage.setItem(KEY, JSON.stringify(a)); }catch(e){} }
  function ago(ts){ var s=(Date.now()-ts)/1000;
    if(s<60) return 'just now'; if(s<3600) return Math.floor(s/60)+'m ago';
    if(s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; }

  // Pull the thumbnail for a title straight from a card already on the page.
  function imageFor(title){
    var cards=document.querySelectorAll('#allLessonsGrid .lesson-card');
    for(var i=0;i<cards.length;i++){
      var h=cards[i].querySelector('.lesson-title'), img=cards[i].querySelector('img');
      if(h && img && h.textContent.trim()===String(title).trim()) return img.src;
    }
    return '';
  }
  function record(title, url){
    if(!title) return;
    var a=load().filter(function(g){ return g.url!==url && g.title!==title; });
    a.unshift({ title:title, url:url, image:imageFor(title), ts:Date.now() });
    save(a.slice(0,MAX));
    render();
  }

  function ensureWrap(){
    var host=document.getElementById('all-lessons'); if(!host) return null;
    var wrap=document.getElementById('kxRecentWrap');
    if(!wrap){
      wrap=document.createElement('div'); wrap.id='kxRecentWrap';
      wrap.innerHTML='<h2>RECENTLY PLAYED</h2><div id="kxRecent"></div>';
      host.insertBefore(wrap, host.firstChild);
    }
    return wrap;
  }
  function render(){
    var wrap=ensureWrap(); if(!wrap) return;
    var grid=document.getElementById('kxRecent'), a=load();
    if(!a.length){ grid.innerHTML='<div id="kxRecentEmpty">Games you open show up here — and stay saved on this device.</div>'; return; }
    grid.innerHTML='';
    a.forEach(function(g){
      var card=document.createElement('div'); card.className='lesson-card';
      card.innerHTML='<img src="'+(g.image||'')+'" alt="'+(g.title||'').replace(/"/g,'&quot;')+'" class="lesson-image">'+
        '<h3 class="lesson-title">'+(g.title||'')+'</h3>'+
        '<span class="kx-when">'+ago(g.ts)+'</span>';
      card.onclick=function(){ if(typeof openLesson==='function') openLesson(g.title, g.url); };
      grid.appendChild(card);
    });
  }

  function hook(){
    if(typeof window.openLesson!=='function'){ return setTimeout(hook, 400); }
    if(window.__kxHooked) return; window.__kxHooked=true;
    var orig=window.openLesson;
    window.openLesson=function(t,u){ try{ record(t,u); }catch(e){} return orig.apply(this, arguments); };
    render();
  }
  if(document.readyState!=='loading') hook();
  else document.addEventListener('DOMContentLoaded', hook);
})();
</script>`;

/* ---------- Interstellar (Ultraviolet) proxy tab ----------
 * UV runs on its own origin (needs its bare server), so we embed the whole
 * Interstellar site in a frame. Its service worker controls that framed origin,
 * so proxying works inside the frame. The URL is saved so you set it once. */
const interstellarJs = `<script>
(function(){
  var KEY='kx_interstellar';
  // Defaults to the KryzixsDEX rewriting proxy (works out of the box). Paste a
  // self-hosted Interstellar/UV URL to use that instead.
  var DEFAULT=${JSON.stringify(PROXY_DEFAULT)};
  // No URL box any more — the proxy is always the built-in default.
  function get(){ return DEFAULT; }
  function set(v){ try{ localStorage.setItem(KEY,v); }catch(e){} }
  // Auto-detect: the launcher publishes the current tunnel URL here on each
  // boot, so the site always finds the live proxy without a rebuild.
  var REGISTRY='https://kryzixs-tunnel.pages.dev/tunnel.json';
  var TUNNEL=''; // live UV tunnel base (https://xxx.trycloudflare.com) or '' when the PC proxy is off
  // confirm a base is actually our UV proxy by loading a UV-only asset (onload=up)
  function probe(base){ return new Promise(function(res){
    var s=document.createElement('script'); var done=false;
    var fin=function(ok){ if(done) return; done=true; clearTimeout(to); s.onload=s.onerror=null; if(s.parentNode) s.parentNode.removeChild(s); res(ok); };
    var to=setTimeout(function(){ fin(false); }, 5000);
    s.onload=function(){ fin(true); }; s.onerror=function(){ fin(false); };
    s.src=base+'/uv/uv.config.js?t='+Date.now(); document.head.appendChild(s);
  }); }
  var AUTH='https://kryzixs-chat.fnjudo8.workers.dev';
  // pick a live UV proxy: 1) admin-set always-on one (e.g. Railway), 2) the local PC tunnel
  async function detectTunnel(){
    try{
      var pr=await fetch(AUTH+'/auth/getproxy?t='+Date.now(),{cache:'no-store'});
      var pj=await pr.json();
      if(pj&&pj.url){ var b=pj.url.replace(/\\/+$/,''); if(await probe(b)){ TUNNEL=b; paintMode(); return; } }
    }catch(e){}
    try{
      var r=await fetch(REGISTRY+'?t='+Date.now(),{cache:'no-store'});
      var j=await r.json();
      var fresh = j&&j.url&&j.ts && (Date.now()/1000 - j.ts) < 43200;
      if(fresh){ var base=j.url.replace(/\\/+$/,''); if(await probe(base)){ TUNNEL=base; paintMode(); return; } }
    }catch(e){}
    TUNNEL=''; paintMode();
  }
  function paintMode(){
    paintTab();
    var b=document.getElementById('kxIntMode'); if(!b) return;
    if(TUNNEL){ b.className='kx-mode on'; b.innerHTML='&#9889; Turbo mode — full proxy via your PC'; }
    else{ b.className='kx-mode'; b.innerHTML='Basic proxy — search engines may block; direct sites work'; }
  }

  function addTab(){
    var tabs=document.querySelector('.nav-tabs'); if(!tabs||document.getElementById('proxyTab')) return;
    var t=document.createElement('div'); t.className='nav-tab'; t.id='proxyTab'; t.textContent='PROXY';
    t.onclick=openInter; tabs.appendChild(t);
  }
  var WORKER=${JSON.stringify(WORKER)};
  var SUG='https://kryzixs-chat.fnjudo8.workers.dev/suggest?q=';
  var CHIPS=[['Google','https://www.google.com'],['YouTube','https://www.youtube.com'],['Wikipedia','https://en.wikipedia.org'],['Discord','https://discord.com/app'],['Reddit','https://www.reddit.com'],['Spotify','https://open.spotify.com']];
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
  var sugItems=[], sugIdx=-1, tmr=0, current='';
  function build(){
    if(document.getElementById('kxInter')) return;
    var o=document.createElement('div'); o.id='kxInter';
    var eye='<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>';
    o.innerHTML=
      '<button class="kx-close" id="kxIntClose" title="Close">✕</button>'+
      '<div class="kx-home" id="kxIntHome">'+
        '<div class="kx-wm">KryzixsDEX</div>'+
        '<div class="kx-swrap">'+
          '<form class="kx-sb" id="kxIntForm">'+eye+
            '<input id="kxIntQ" placeholder="Search the web or type a URL" autocomplete="off" spellcheck="false">'+
            '<button type="button" class="kx-clr" id="kxIntClr" title="Clear">✕</button>'+
          '</form>'+
          '<div class="kx-sug" id="kxIntSug"></div>'+
        '</div>'+
        '<div class="kx-chips" id="kxIntChips"></div>'+
        '<div class="kx-mode" id="kxIntMode">Checking proxy…</div>'+
      '</div>'+
      '<div class="kx-browse" id="kxIntBrowse">'+
        '<div class="kx-bar">'+
          '<button class="kx-bbtn" id="kxIntHomeBtn" title="New search">&#8962;</button>'+
          '<button class="kx-bbtn" id="kxIntReload" title="Reload">&#8635;</button>'+
          '<div class="kx-addr" id="kxIntAddr"></div>'+
          '<button class="kx-bbtn" id="kxIntOpen" title="Open in new tab">&#8599;</button>'+
          '<button class="kx-bbtn" id="kxIntX2" title="Close">✕</button>'+
        '</div>'+
        '<div class="kx-frame"><div class="kx-veil" id="kxIntVeil"></div><iframe id="kxIntFrame" allow="fullscreen; autoplay; clipboard-write"></iframe></div>'+
      '</div>';
    document.body.appendChild(o);
    addStyles();
    // chips
    document.getElementById('kxIntChips').innerHTML=CHIPS.map(function(c){ return '<button class="kx-chip" data-u="'+c[1]+'">'+c[0]+'</button>'; }).join('');
    document.getElementById('kxIntChips').querySelectorAll('.kx-chip').forEach(function(b){ b.onclick=function(){ go(b.dataset.u); }; });
    var q=document.getElementById('kxIntQ');
    document.getElementById('kxIntForm').addEventListener('submit',function(ev){ ev.preventDefault(); go(sugIdx>=0&&sugItems[sugIdx]?sugItems[sugIdx]:q.value); });
    q.addEventListener('input',function(){ document.getElementById('kxIntClr').style.display=q.value?'grid':'none'; suggest(q.value); });
    q.addEventListener('keydown',function(ev){
      if(ev.key==='ArrowDown'){ ev.preventDefault(); move(1); }
      else if(ev.key==='ArrowUp'){ ev.preventDefault(); move(-1); }
      else if(ev.key==='Escape'){ hideSug(); }
    });
    document.getElementById('kxIntClr').onclick=function(){ q.value=''; q.focus(); hideSug(); this.style.display='none'; };
    document.getElementById('kxIntClose').onclick=function(){ o.classList.remove('on'); };
    document.getElementById('kxIntX2').onclick=function(){ o.classList.remove('on'); };
    document.getElementById('kxIntHomeBtn').onclick=showHome;
    document.getElementById('kxIntReload').onclick=reloadCur;
    document.getElementById('kxIntOpen').onclick=function(){ var f=document.getElementById('kxIntFrame'); if(f&&f.src){ window.__kxAllowOpen=true; window.open(f.src,'_blank'); } };
    document.addEventListener('click',function(ev){ if(!ev.target.closest('.kx-swrap')) hideSug(); });
    detectTunnel();
    if(!window.__kxTunTimer) window.__kxTunTimer=setInterval(detectTunnel, 30000);
  }
  function addStyles(){
    if(document.getElementById('kxIntCss')) return;
    var s=document.createElement('style'); s.id='kxIntCss'; s.textContent=
      '#kxInter{position:fixed;inset:0;z-index:99999;background:radial-gradient(1100px 600px at 50% -8%,rgba(255,255,255,.05),transparent 60%),#0A0A0B;display:none;flex-direction:column;font-family:Inter,sans-serif}'+
      '#kxInter.on{display:flex}'+
      '#kxInter .kx-close{position:absolute;top:14px;right:16px;z-index:6;width:36px;height:36px;border-radius:50%;background:rgba(22,22,24,.85);border:1px solid rgba(255,255,255,.14);color:#fff;font-size:15px;cursor:pointer;display:grid;place-items:center}'+
      '#kxInter .kx-close:hover{background:#242428}'+
      '#kxInter .kx-home{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:24px}'+
      '#kxInter .kx-wm{font-family:Newsreader,Georgia,serif;font-weight:600;font-size:clamp(40px,7vw,72px);letter-spacing:-.03em;margin-bottom:2px}'+
      '#kxInter .kx-swrap{width:min(640px,92vw);position:relative}'+
      '#kxInter .kx-sb{display:flex;align-items:center;gap:12px;background:#161618;border:1.5px solid rgba(255,255,255,.16);border-radius:28px;padding:15px 18px;box-shadow:0 24px 70px -32px #000;transition:border-color .18s,box-shadow .18s;color:#8a8a8a}'+
      '#kxInter .kx-sb:focus-within{border-color:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.08),0 24px 70px -32px #000;color:#cfcfcf}'+
      '#kxInter .kx-sb input{flex:1;background:none;border:0;outline:none;color:#fff;font-size:16px}'+
      '#kxInter .kx-sb input::placeholder{color:#8a8a8a}'+
      '#kxInter .kx-clr{display:none;background:none;border:0;color:#8a8a8a;cursor:pointer;font-size:14px;width:22px;height:22px;border-radius:50%;place-items:center}'+
      '#kxInter .kx-clr:hover{color:#fff;background:rgba(255,255,255,.08)}'+
      '#kxInter .kx-sug{position:absolute;top:calc(100% + 8px);left:0;right:0;background:#161618;border:1px solid rgba(255,255,255,.14);border-radius:18px;overflow:hidden;box-shadow:0 30px 80px -30px #000;display:none;z-index:3}'+
      '#kxInter .kx-sug.on{display:block;animation:kxsug .16s ease}'+
      '@keyframes kxsug{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}'+
      '#kxInter .kx-sgi{display:flex;align-items:center;gap:13px;padding:11px 18px;color:#e8e8ea;font-size:15px;cursor:pointer}'+
      '#kxInter .kx-sgi svg{color:#8a8a8a;flex:none}'+
      '#kxInter .kx-sgi:hover,#kxInter .kx-sgi.sel{background:rgba(255,255,255,.07)}'+
      '#kxInter .kx-chips{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;max-width:640px}'+
      '#kxInter .kx-chip{background:#161618;border:1px solid rgba(255,255,255,.14);color:#cfcfcf;border-radius:999px;padding:9px 17px;font-size:13px;cursor:pointer;transition:.15s}'+
      '#kxInter .kx-chip:hover{color:#fff;border-color:rgba(255,255,255,.4);transform:translateY(-2px)}'+
      '#kxInter .kx-mode{font-size:12px;color:#8a8a8a;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);border-radius:999px;padding:7px 15px}'+
      '#kxInter .kx-mode.on{color:#30d158;border-color:rgba(48,209,88,.4);background:rgba(48,209,88,.08)}'+
      '#kxInter .kx-browse{flex:1;display:none;flex-direction:column}'+
      '#kxInter .kx-browse.on{display:flex}'+
      '#kxInter .kx-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);background:#0c0c0d}'+
      '#kxInter .kx-bbtn{width:36px;height:36px;flex:none;border-radius:10px;background:#161618;border:1px solid rgba(255,255,255,.12);color:#fff;font-size:16px;cursor:pointer;display:grid;place-items:center}'+
      '#kxInter .kx-bbtn:hover{background:#242428}'+
      '#kxInter .kx-addr{flex:1;background:#0c0c0d;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 14px;color:#9b9ba3;font-size:12.5px;font-family:"JetBrains Mono",monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#kxInter .kx-frame{flex:1;position:relative}#kxInter iframe{width:100%;height:100%;border:0;background:#0A0A0A}'+
      '#kxInter .kx-veil{position:absolute;inset:0;display:grid;place-content:center;gap:12px;text-align:center;color:#9a9a9a;font-size:13px}'+
      '.kx-spin{width:26px;height:26px;border:2px solid rgba(255,255,255,.15);border-top-color:#fff;border-radius:50%;margin:0 auto;animation:kxspin .8s linear infinite}@keyframes kxspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
  function move(d){ var box=document.getElementById('kxIntSug'); if(!sugItems.length) return; sugIdx=(sugIdx+d+sugItems.length)%sugItems.length;
    box.querySelectorAll('.kx-sgi').forEach(function(el,i){ el.classList.toggle('sel',i===sugIdx); }); }
  function suggest(q){ clearTimeout(tmr); if(!q.trim()){ hideSug(); return; }
    tmr=setTimeout(function(){ fetch(SUG+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(j){
      sugItems=(j&&j.suggestions)||[]; sugIdx=-1; renderSug();
    }).catch(function(){ hideSug(); }); }, 120); }
  function renderSug(){ var box=document.getElementById('kxIntSug'); if(!sugItems.length){ hideSug(); return; }
    var eye='<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>';
    box.innerHTML=sugItems.map(function(s){ return '<div class="kx-sgi">'+eye+'<span>'+esc(s)+'</span></div>'; }).join('');
    box.classList.add('on');
    box.querySelectorAll('.kx-sgi').forEach(function(el,i){ el.onclick=function(){ go(sugItems[i]); }; }); }
  function hideSug(){ var b=document.getElementById('kxIntSug'); if(b){ b.classList.remove('on'); b.innerHTML=''; } sugIdx=-1; }
  function showHome(){ document.getElementById('kxIntBrowse').classList.remove('on'); document.getElementById('kxIntHome').style.display='flex';
    var f=document.getElementById('kxIntFrame'); if(f) f.src='about:blank'; setTimeout(function(){ var q=document.getElementById('kxIntQ'); if(q){ q.focus(); q.select(); } },60); }
  function go(q){ q=(q||'').trim(); if(!q) return;
    hideSug();
    var src, label;
    if(TUNNEL){
      // Turbo: hand the raw query to the UV proxy (runs from your PC's IP, so
      // Google/search works). UV decides URL-vs-search itself.
      src=TUNNEL+'/web?q='+encodeURIComponent(q);
      label=(q.slice(0,4).toLowerCase()==='http'||(q.indexOf(' ')<0&&q.indexOf('.')>0))?q:('Search: '+q);
    } else {
      var t;
      if(q.slice(0,4).toLowerCase()==='http') t=q;
      else if(q.indexOf(' ')<0 && q.indexOf('.')>0) t='https://'+q;
      else t='https://lite.duckduckgo.com/lite/?q='+encodeURIComponent(q); // Google CAPTCHAs datacenter IPs
      src=WORKER+encodeURIComponent(t); label=t;
    }
    current=q;
    document.getElementById('kxIntHome').style.display='none';
    document.getElementById('kxIntBrowse').classList.add('on');
    document.getElementById('kxIntAddr').textContent=label;
    var f=document.getElementById('kxIntFrame'), v=document.getElementById('kxIntVeil');
    v.style.display='grid'; v.innerHTML='<div class="kx-spin"></div><div>Loading…</div>';
    f.onload=function(){ v.style.display='none'; };
    f.src=src;
  }
  function reloadCur(){ if(!current) return; go(current); }
  // little green "Turbo" pip on the PROXY nav tab when the PC proxy is live
  function paintTab(){
    var t=document.getElementById('proxyTab'); if(!t) return;
    var dot=t.querySelector('.kx-tdot');
    if(TUNNEL){ if(!dot){ dot=document.createElement('span'); dot.className='kx-tdot'; dot.title='Turbo proxy is live';
        dot.style.cssText='display:inline-block;width:8px;height:8px;border-radius:50%;background:#30d158;margin-left:7px;vertical-align:middle;box-shadow:0 0 8px #30d158;animation:kxpulse 1.6s ease-in-out infinite';
        t.appendChild(dot); if(!document.getElementById('kxTdotCss')){ var st=document.createElement('style'); st.id='kxTdotCss'; st.textContent='@keyframes kxpulse{0%,100%{opacity:1}50%{opacity:.35}}'; document.head.appendChild(st); } } }
    else if(dot){ dot.remove(); }
  }
  window.openInter=function(){ build(); document.getElementById('kxInter').classList.add('on'); showHome(); detectTunnel(); };
  if(document.readyState!=='loading') addTab(); else document.addEventListener('DOMContentLoaded', addTab);
  setInterval(addTab, 1500);
  // detect the PC proxy on load (and keep checking) so the tab pip is live even before opening the tab
  setTimeout(detectTunnel, 1200);
  setInterval(detectTunnel, 30000);
})();
</script>`;

/* ---------- login / signup (local accounts) ---------- */
const loginJs = `<script>
(function(){
  // Server-backed accounts (Cloudflare). Because auth lives on the SERVER, login
  // works even where localStorage is blocked (e.g. the Google Sites sandbox).
  // We keep the session token in localStorage when we can, and always in memory
  // as a fallback so a blocked-storage embed still stays logged in for the tab.
  var API='https://kryzixs-chat.fnjudo8.workers.dev', SKEY='kx_session', TKEY='kx_token';
  var mem={ user:'', token:'', admin:false };
  function ls(k){ try{ return localStorage.getItem(k)||''; }catch(e){ return ''; } }
  function lsSet(k,v){ try{ v?localStorage.setItem(k,v):localStorage.removeItem(k); }catch(e){} }
  function session(){ return mem.user || ls(SKEY); }
  function token(){ return mem.token || ls(TKEY); }
  function setSession(u,t){ mem.user=u||''; mem.token=t||''; lsSet(SKEY,u); lsSet(TKEY,t);
    if(u){ fetch(API+'/auth/isadmin?user='+encodeURIComponent(u)).then(function(r){return r.json();}).then(function(j){ mem.admin=!!(j&&j.admin); paintAccount(); }).catch(function(){}); }
    else mem.admin=false;
    paintAccount(); if(u) ungate(); else gate(); }
  function post(path,body){ return fetch(API+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}); }
  function isAdmin(){ return !!mem.admin; }
  function gate(){ document.body.classList.add('kx-locked'); if(el){ el.classList.add('gate'); } if(document.getElementById('kxlBack')) document.getElementById('kxlBack').style.display='none'; setMode('login'); open(); }
  function ungate(){ document.body.classList.remove('kx-locked'); if(el){ el.classList.remove('gate'); } if(document.getElementById('kxlBack')) document.getElementById('kxlBack').style.display='block'; el.classList.remove('on'); }
  window.kxSession=session; window.kxToken=token; window.kxIsAdmin=isAdmin;

  var css=document.createElement('style'); css.textContent=
    '#kxLogin{position:fixed;inset:0;z-index:100000;display:none;place-content:center;padding:24px;'+
      'background:rgba(6,6,7,.72);backdrop-filter:blur(8px);font-family:Inter,system-ui,sans-serif}'+
    '#kxLogin.on{display:grid}'+
    '#kxLogin.gate{background:#0A0A0B}'+
    'body.kx-locked{overflow:hidden}'+
    'body.kx-locked #main-container,body.kx-locked #kxLC,body.kx-locked #kxProxy,body.kx-locked #kxInter{filter:blur(8px);pointer-events:none;user-select:none}'+
    '#kxLogin .card{position:relative;width:min(400px,92vw);background:linear-gradient(180deg,#161618,#111113);'+
      'border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:30px 28px;overflow:hidden;'+
      'box-shadow:0 40px 100px -30px #000,0 0 0 1px rgba(255,255,255,.02) inset;animation:kxlpop .3s cubic-bezier(.2,.9,.3,1.1)}'+
    '#kxLogin .card::before{content:"";position:absolute;top:-40%;left:50%;transform:translateX(-50%);'+
      'width:140%;height:80%;background:radial-gradient(closest-side,rgba(255,255,255,.10),transparent);pointer-events:none}'+
    '@keyframes kxlpop{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:none}}'+
    '#kxLogin .brand{position:relative;font-family:Newsreader,Georgia,serif;font-weight:600;font-size:26px;margin-bottom:4px;letter-spacing:-.02em}'+
    '#kxLogin .stats{display:flex;gap:8px;margin:16px 0 20px}'+
    '#kxLogin .stats .st{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);'+
      'border-radius:13px;padding:11px 8px;text-align:center}'+
    '#kxLogin .stats .st b{display:block;font-family:Newsreader,serif;font-size:21px;font-weight:600;line-height:1;'+
      'font-variant-numeric:tabular-nums}'+
    '#kxLogin .stats .st span{display:block;font-size:10px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.09em;margin-top:5px}'+
    '#kxLogin h2{font-size:22px!important;margin:0 0 4px!important;font-weight:700!important;color:#fff!important;'+
      'font-family:Inter,sans-serif!important;text-transform:none!important;letter-spacing:normal!important;'+
      'border:0!important;background:none!important;padding:0!important;box-shadow:none!important;text-align:left!important;transform:none!important;display:block!important}'+
    '#kxLogin h2::before,#kxLogin h2::after{content:none!important;display:none!important}'+
    '#kxLogin p.s{color:#9b9ba3;font-size:13px;margin:0 0 18px}'+
    '#kxLogin input{width:100%;background:#0c0c0d;border:1px solid rgba(255,255,255,.14);border-radius:11px;'+
      'padding:12px 14px;color:#fff;font-size:14px;margin-bottom:10px}'+
    '#kxLogin input:focus{outline:none;border-color:rgba(255,255,255,.4)}'+
    '#kxLogin .primary{width:100%;background:#fff;color:#000;border:0;border-radius:11px;padding:13px;'+
      'font-weight:700;font-size:14px;cursor:pointer;margin-top:6px;transition:filter .15s,transform .1s}'+
    '#kxLogin .primary:hover{filter:brightness(.9)}#kxLogin .primary:active{transform:translateY(1px)}'+
    '#kxLogin .toggle{display:block;width:100%;background:none;border:0;color:#fff;font-weight:600;'+
      'font-size:13px;cursor:pointer;margin-top:14px}'+
    '#kxLogin .back{display:block;width:100%;background:none;border:0;color:#8a8a8a;font-size:12.5px;'+
      'cursor:pointer;margin-top:10px}'+
    '#kxLogin .err{color:#ff6b6b;font-size:12.5px;min-height:16px;margin-top:2px}'+
    '#kxLogin .card.ok{border-color:#30d158!important;box-shadow:0 0 0 3px rgba(48,209,88,.28),0 40px 100px -30px #000!important;transition:border-color .2s,box-shadow .2s}'+
    '#kxLogin .card.bad{animation:kxshake .42s}'+
    '@keyframes kxshake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-9px)}40%,60%{transform:translateX(9px)}}'+
    '#kxlLock{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;'+
      'background:rgba(14,14,16,.92);backdrop-filter:blur(5px);border-radius:22px;z-index:6}'+
    '#kxlLock.show{display:flex;animation:kxlfade .2s ease}'+
    '@keyframes kxlfade{from{opacity:0}to{opacity:1}}'+
    '#kxlLock .lk{width:78px;height:90px;color:#30d158;animation:kxlpopin .45s cubic-bezier(.2,.9,.3,1.5)}'+
    '@keyframes kxlpopin{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:scale(1)}}'+
    '#kxlLock .sh{transform-box:fill-box;transform-origin:88% 78%;animation:kxlopen .5s .22s cubic-bezier(.3,.9,.3,1.6) both}'+
    '@keyframes kxlopen{to{transform:rotate(32deg) translateY(-2px)}}'+
    '#kxlLock .lbl{margin-top:15px;color:#30d158;font-weight:700;font-size:14.5px;letter-spacing:.02em;animation:kxlfade .3s .25s both}'+
    '.kx-acct{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.04);'+
      'border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:7px 12px;color:#e8e8ea;font-size:13px;'+
      'font-weight:600;cursor:pointer;margin-left:8px}'+
    '.kx-acct:hover{background:rgba(255,255,255,.08)}';
  document.head.appendChild(css);

  var el=document.createElement('div'); el.id='kxLogin';
  el.innerHTML='<div class="card">'+
    '<div class="brand">KryzixsDEX</div>'+
    '<h2 id="kxlTitle">Welcome back</h2>'+
    '<p class="s" id="kxlSub">Log in to save your rank and use chat.</p>'+
    '<div class="stats" id="kxlStats">'+
      '<div class="st"><b id="kxlStUsers">—</b><span>Members</span></div>'+
      '<div class="st"><b id="kxlStVisits">—</b><span>Visits</span></div>'+
      '<div class="st"><b id="kxlStGames">—</b><span>Games</span></div>'+
    '</div>'+
    '<input id="kxlUser" placeholder="Username" autocomplete="off">'+
    '<input id="kxlPass" type="password" placeholder="Password">'+
    '<input id="kxlNew" type="password" placeholder="New password" style="display:none">'+
    '<input id="kxlCode" placeholder="Invite code" autocomplete="off" style="display:none;text-transform:uppercase;letter-spacing:.14em">'+
    '<div id="kxlTut" style="display:none;background:rgba(10,132,255,.12);border:1px solid rgba(10,132,255,.35);color:#8fbaff;border-radius:11px;padding:11px 13px;font-size:12.5px;line-height:1.55;margin-bottom:10px">👋 New here? Pick a username & password, then <b>paste your invite code</b> above and hit Sign up. No code? Ask an admin for one.</div>'+
    '<div class="err" id="kxlErr"></div>'+
    '<button class="primary" id="kxlGo">Log in</button>'+
    '<button class="toggle" id="kxlToggle">Need an account? Sign up</button>'+
    '<button class="back" id="kxlBack">&larr; Back to games</button>'+
    '<div id="kxlLock">'+
      '<svg class="lk" viewBox="0 0 80 92" fill="none">'+
        '<path class="sh" d="M28 40 V26 a12 12 0 0 1 24 0 V40" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>'+
        '<rect x="16" y="40" width="48" height="44" rx="9" fill="currentColor"/>'+
        '<circle cx="40" cy="58" r="5" fill="#0f0f11"/>'+
        '<rect x="37.5" y="61" width="5" height="12" rx="2.5" fill="#0f0f11"/>'+
      '</svg>'+
      '<div class="lbl">Unlocked</div>'+
    '</div>'+
  '</div>';
  document.body.appendChild(el);

  var mode='login';
  var $=function(id){ return document.getElementById(id); };
  // live counters on the login screen (Members / Visits / Games)
  function fmt(n){ n=+n||0; return n>=1000?(n/1000).toFixed(n>=10000?0:1).replace(/\\.0$/,'')+'k':(''+n); }
  var bumped=false;
  function loadStats(){
    var g=$('kxlStGames'); if(g){ try{ if(typeof games!=='undefined'&&games&&games.length) g.textContent=fmt(games.length); }catch(e){} }
    var bump=''; try{ if(!bumped && !sessionStorage.getItem('kx_visited')){ bump='?bump=visit'; sessionStorage.setItem('kx_visited','1'); bumped=true; } }catch(e){ if(!bumped){ bump='?bump=visit'; bumped=true; } }
    fetch(API+'/auth/stats'+bump).then(function(r){return r.json();}).then(function(j){
      if(!j) return; var u=$('kxlStUsers'), v=$('kxlStVisits');
      if(u) u.textContent=fmt(j.users); if(v) v.textContent=fmt(j.visits);
    }).catch(function(){});
  }
  loadStats(); setInterval(loadStats, 20000);
  function open(){ el.classList.add('on'); $('kxlErr').textContent=''; setTimeout(function(){ $('kxlUser').focus(); },50); }
  function close(){ if(document.body.classList.contains('kx-locked')) return; el.classList.remove('on'); }
  function setMode(m){ mode=m; $('kxlErr').textContent='';
    var titles={login:'Welcome back',signup:'Create account',changepass:'Change password'};
    var subs={login:'Log in to save your rank and use chat.',signup:'Sign up to save your rank and use chat.',changepass:'Enter your current and new password.'};
    var go={login:'Log in',signup:'Sign up',changepass:'Update password'};
    $('kxlTitle').textContent=titles[m]; $('kxlSub').textContent=subs[m]; $('kxlGo').textContent=go[m];
    $('kxlNew').style.display = m==='changepass'?'block':'none';
    $('kxlCode').style.display = m==='signup'?'block':'none';
    $('kxlTut').style.display = m==='signup'?'block':'none';
    $('kxlPass').placeholder = m==='changepass'?'Current password':'Password';
    $('kxlToggle').style.display = m==='changepass'?'none':'block';
    $('kxlToggle').textContent = m==='login'?'Need an account? Sign up':'Have an account? Log in';
    $('kxlBack').textContent = m==='changepass'?'← Cancel':'← Back to games';
    if(m==='changepass'){ $('kxlUser').value=session(); $('kxlUser').readOnly=true; } else { $('kxlUser').readOnly=false; }
  }
  $('kxlToggle').onclick=function(){ setMode(mode==='login'?'signup':'login'); };
  $('kxlBack').onclick=close;
  function shakeBad(){ var c=el.querySelector('.card'); if(!c) return; c.classList.remove('bad'); void c.offsetWidth; c.classList.add('bad'); }
  function unlockThen(cb){ // Apple-style green unlock, then continue
    var c=el.querySelector('.card'), lock=$('kxlLock');
    if(!c||!lock){ cb(); return; }
    c.classList.add('ok'); lock.classList.remove('show'); void lock.offsetWidth; lock.classList.add('show');
    setTimeout(function(){ cb(); c.classList.remove('ok'); lock.classList.remove('show'); }, 1000);
  }
  $('kxlGo').onclick=function(){
    var u=$('kxlUser').value.trim(), p=$('kxlPass').value, np=$('kxlNew').value, code=$('kxlCode').value.trim(), e=$('kxlErr');
    if(!u||!p){ e.textContent='Enter a username and password.'; shakeBad(); return; }
    if(mode==='signup'&&!code){ e.textContent='Paste your invite code to sign up.'; shakeBad(); return; }
    var btn=$('kxlGo'); btn.disabled=true; var was=btn.textContent; btn.textContent='…';
    var done=function(){ btn.disabled=false; btn.textContent=was; };
    var path = mode==='signup'?'/auth/register':(mode==='changepass'?'/auth/changepass':'/auth/login');
    post(path,{user:u,pass:p,newpass:np,code:code}).then(function(j){
      done();
      if(j&&j.error){ e.textContent=j.error; shakeBad(); return; }
      if(j&&j.ok){
        if(mode==='changepass'){ setSession(j.user||u, j.token||''); close(); }
        else { unlockThen(function(){ setSession(j.user||u, j.token||''); close(); }); }
      }
      else { e.textContent='Something went wrong. Try again.'; shakeBad(); }
    }).catch(function(){ done(); e.textContent='Network error — check your connection.'; shakeBad(); });
  };
  el.addEventListener('keydown',function(ev){ if(ev.key==='Enter') $('kxlGo').click(); });

  // account chip in the top bar
  function paintAccount(){
    var bar=document.querySelector('.top-nav-actions')||document.querySelector('.top-bar');
    var chip=$('kxAcct');
    if(!chip){ chip=document.createElement('button'); chip.id='kxAcct'; chip.className='kx-acct'; if(bar) bar.appendChild(chip); }
    var s=session();
    chip.innerHTML = s ? ('&#9679; '+String(s).replace(/</g,'')+' &nbsp;<span style="color:#8a8a8a;font-weight:400">account</span>') : 'Log in';
    chip.onclick = s ? function(){
      var items=[{label:'Change password',onClick:function(){ setMode('changepass'); open(); }}];
      if(window.kxOpenAdmin && isAdmin()) items.push({label:'Admin panel',onClick:function(){ kxOpenAdmin(); }});
      items.push({label:'Log out',danger:true,onClick:function(){ setSession('',''); }});
      if(window.kxMenu) kxMenu(chip,items); else { setMode('changepass'); open(); }
    } : function(){ setMode('login'); open(); };
  }
  // restore session from a saved token; the site is gated until you're in.
  (function(){
    var t=token();
    if(!t){ gate(); return; }
    fetch(API+'/auth/verify?token='+encodeURIComponent(t)).then(function(r){return r.json();})
      .then(function(j){ if(j&&j.ok){ setSession(j.user,t); } else gate(); })
      .catch(function(){ /* offline: trust the stored token so you're not locked out */ if(session()) ungate(); else gate(); });
  })();
  window.kxOpenLogin=open;
  window.kxChangePass=function(){ setMode('changepass'); open(); };
  window.kxLogout=function(){ setSession('',''); };
  if(document.readyState!=='loading') paintAccount(); else document.addEventListener('DOMContentLoaded', paintAccount);
  setInterval(paintAccount, 2000);
})();
</script>`;

/* ---------- Live Chat: rooms + iMessage-style bubbles, own tab ---------- */
const chatJs = `<script>
(function(){
  var API='https://kryzixs-chat.fnjudo8.workers.dev';
  function me(){ try{ if(window.kxSession) return kxSession()||''; }catch(e){} try{ return localStorage.getItem('kx_session')||''; }catch(e){ return ''; } }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function rooms(){ try{ return JSON.parse(localStorage.getItem('kx_rooms')||'null')||[{id:'global',name:'Global'}]; }catch(e){ return [{id:'global',name:'Global'}]; } }
  function saveRooms(r){ try{ localStorage.setItem('kx_rooms',JSON.stringify(r)); }catch(e){} }
  function curRoom(){ try{ return localStorage.getItem('kx_room')||'global'; }catch(e){ return 'global'; } }
  function setRoom(id){ try{ localStorage.setItem('kx_room',id); }catch(e){} }
  function slug(s){ return s.toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40); }

  var css=document.createElement('style'); css.textContent=
    '#kxLC{position:fixed;inset:0;z-index:99998;background:#0a0a0b;'+
      'display:none;font-family:Inter,sans-serif}'+
    '#kxLC.on{display:block}'+
    '#kxLC .win{width:100vw;height:100vh;height:100dvh;display:grid;grid-template-columns:280px 1fr;'+
      'background:#0a0a0b;overflow:hidden;animation:kxwin .26s ease}'+
    '@keyframes kxwin{from{opacity:0}to{opacity:1}}'+
    '@media(max-width:720px){#kxLC .win{grid-template-columns:1fr}'+
      '#kxLC .side{display:none}#kxLC .side.show{display:flex;position:absolute;inset:0 auto 0 0;width:250px;z-index:3;box-shadow:0 0 60px rgba(0,0,0,.6)}}'+
    '#kxLC .side{background:#0e0e10;border-right:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;padding:22px 14px;gap:4px;overflow-y:auto}'+
    '#kxLC .side h3{font-family:Newsreader,serif;font-size:22px;margin:4px 8px 16px;font-weight:600}'+
    '#kxLC .room{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:10px;color:#9b9ba3;cursor:pointer;font-size:14px;font-weight:500}'+
    '#kxLC .room:hover{background:rgba(255,255,255,.05);color:#fff}'+
    '#kxLC .room.on{background:rgba(255,255,255,.08);color:#fff}'+
    '#kxLC .room .lk{margin-left:auto;color:#66666e;font-size:11px}'+
    '#kxLC .room .rm{margin-left:auto;color:#66666e;padding:0 4px}'+
    '#kxLC .room .rm:hover{color:#ff6b6b}'+
    '#kxLC .newroom{margin-top:8px;background:#fff;color:#000;border:0;border-radius:10px;padding:10px;font-weight:700;font-size:13px;cursor:pointer}'+
    '#kxLC .main{display:flex;flex-direction:column;min-width:0}'+
    '#kxLC .top{display:flex;align-items:center;gap:12px;padding:18px 26px;border-bottom:1px solid rgba(255,255,255,.07);background:#0c0c0d}'+
    '#kxLC .top b{font-size:17px;font-family:Newsreader,serif;font-weight:600}#kxLC .top .who{color:#8a8a8a;font-size:12px}'+
    '#kxLC .top .x{margin-left:auto;background:#161618;border:1px solid rgba(255,255,255,.12);color:#fff;width:34px;height:34px;border-radius:9px;cursor:pointer}'+
    '#kxLC .top .menu{display:none;background:#161618;border:1px solid rgba(255,255,255,.12);color:#fff;width:34px;height:34px;border-radius:9px;cursor:pointer}'+
    '@media(max-width:720px){#kxLC .top .menu{display:block}}'+
    '#kxLC .feed{flex:1;overflow-y:auto;padding:22px clamp(18px,8vw,120px);display:flex;flex-direction:column;gap:3px}'+
    '#kxLC .grp{color:#66666e;font-size:11px;text-align:center;margin:12px 0 4px}'+
    '#kxLC .b{max-width:min(560px,72%);padding:10px 15px;border-radius:19px;font-size:14.5px;line-height:1.4;word-wrap:break-word;animation:kxcm .22s ease;position:relative}'+
    '@keyframes kxcm{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}'+
    '#kxLC .b.them{align-self:flex-start;background:#26262b;color:#f2f2f4;border-bottom-left-radius:5px}'+
    '#kxLC .b.me{align-self:flex-end;background:#fff;color:#000;border-bottom-right-radius:5px}'+
    '#kxLC .nm{font-size:11px;color:#8a8a8a;margin:8px 0 2px 4px;font-weight:600}'+
    '#kxLC .nm.banable{cursor:pointer}#kxLC .nm.banable:hover{color:#ff8080;text-decoration:underline}'+
    '#kxLC .b .del{position:absolute;top:-7px;right:-7px;width:19px;height:19px;border-radius:50%;background:#ff5d5d;'+
      'color:#fff;font-size:12px;line-height:19px;text-align:center;cursor:pointer;display:none;font-weight:700}'+
    '#kxLC .b.adminable:hover .del{display:block}'+
    '#kxLC .b.me .del{left:-7px;right:auto}'+
    '#kxLC .feed .empty{margin:auto;color:#66666e;font-size:13px}'+
    '#kxLC .bar{display:flex;gap:10px;padding:16px clamp(18px,8vw,120px);border-top:1px solid rgba(255,255,255,.07);background:#0c0c0d}'+
    '#kxLC .bar input{flex:1;background:#161618;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:14px 20px;color:#fff;font-size:15px}'+
    '#kxLC .bar input:focus{outline:none;border-color:rgba(255,255,255,.45)}'+
    '#kxLC .bar button{background:#fff;color:#000;border:0;border-radius:24px;padding:0 26px;font-weight:700;font-size:14px;cursor:pointer}'+
    '#kxLC .bar button:active{transform:translateY(1px)}'+
    '#kxRoomModal{position:absolute;inset:0;display:none;place-content:center;background:rgba(5,5,6,.7);backdrop-filter:blur(6px);z-index:10}'+
    '#kxRoomModal.on{display:grid}'+
    '#kxRoomModal .rm-card{width:min(360px,88vw);background:#151517;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:22px;animation:kxwin .25s ease}'+
    '#kxRoomModal h3{font-family:Newsreader,serif;font-size:20px;margin:0 0 6px;font-weight:600}'+
    '#kxRoomModal p{color:#9b9ba3;font-size:12.5px;margin:0 0 14px;line-height:1.55}'+
    '#kxRoomModal input{width:100%;background:#0c0c0d;border:1px solid rgba(255,255,255,.14);border-radius:11px;padding:12px 14px;color:#fff;font-size:14px;margin-bottom:12px}'+
    '#kxRoomModal input:focus{outline:none;border-color:rgba(255,255,255,.4)}'+
    '#kxRoomModal .rm-row{display:flex;gap:8px}'+
    '#kxRoomModal .rm-go{flex:1;background:#fff;color:#000;border:0;border-radius:11px;padding:12px;font-weight:700;cursor:pointer}'+
    '#kxRoomModal .rm-cancel{background:#1f1f22;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:11px;padding:12px 16px;cursor:pointer}';
  // ---- iMessage-style skin (DARK / black) + typing indicator ----
  css.textContent +=
    '#kxLC .win{background:#000!important}'+
    '#kxLC .side{background:#1c1c1e!important;border-right:1px solid rgba(255,255,255,.08)!important}'+
    '#kxLC .side h3{color:#fff!important}'+
    '#kxLC .room{color:#ebebf5!important;border-radius:10px!important}'+
    '#kxLC .room:hover{background:rgba(255,255,255,.06)!important;color:#fff!important;transform:none!important}'+
    '#kxLC .room.on{background:rgba(10,132,255,.22)!important;color:#0a84ff!important;box-shadow:none!important}'+
    '#kxLC .room .rm{color:#8e8e93!important}'+
    '#kxLC .newroom{background:#0a84ff!important;color:#fff!important}'+
    '#kxLC .top{background:#1c1c1e!important;border-bottom:1px solid rgba(255,255,255,.1)!important;justify-content:center!important;position:relative!important}'+
    '#kxLC .top b{color:#fff!important;font-family:Inter,sans-serif!important;font-size:16px!important;font-weight:600!important}'+
    '#kxLC .top .who{display:none!important}'+
    '#kxLC #kxLCmenu{position:absolute!important;left:12px!important;background:transparent!important;border:0!important;color:#0a84ff!important}'+
    '#kxLC #kxLCx{position:absolute!important;right:12px!important;background:transparent!important;border:0!important;color:#0a84ff!important;font-size:16px!important}'+
    '#kxLC #kxLCclear{position:absolute!important;right:52px!important;margin:0!important;background:transparent!important;border:0!important;color:#ff453a!important;font-size:12px!important;width:auto!important;padding:0 6px!important}'+
    '#kxLC .feed{background:#000!important;padding:16px clamp(12px,5vw,70px)!important;gap:2px!important}'+
    '#kxLC .grp{color:#8e8e93!important;background:transparent!important;align-self:center;font-size:11px;font-weight:600;box-shadow:none!important;margin:14px 0 6px!important}'+
    '#kxLC .nm{color:#8e8e93!important;font-weight:600!important;margin:9px 0 2px 12px!important}'+
    '#kxLC .b{max-width:min(72%,500px)!important;font-size:15.5px!important;line-height:1.32!important;padding:8px 14px!important;border-radius:18px!important;box-shadow:none!important;position:relative;margin:1px 0!important}'+
    '#kxLC .b.them{background:#262628!important;color:#fff!important;border-radius:18px!important}'+
    '#kxLC .b.me{background:#0a84ff!important;color:#fff!important;border-radius:18px!important}'+
    '#kxLC .b.me:before{content:"";position:absolute;bottom:0;right:-7px;height:19px;width:20px;background:#0a84ff;border-bottom-left-radius:16px}'+
    '#kxLC .b.me:after{content:"";position:absolute;bottom:0;right:-19px;height:19px;width:18px;background:#000;border-bottom-left-radius:12px}'+
    '#kxLC .b.them:before{content:"";position:absolute;bottom:0;left:-7px;height:19px;width:20px;background:#262628;border-bottom-right-radius:16px}'+
    '#kxLC .b.them:after{content:"";position:absolute;bottom:0;left:-19px;height:19px;width:18px;background:#000;border-bottom-right-radius:12px}'+
    '#kxLC .b.typing:before,#kxLC .b.typing:after{display:none!important}'+
    '#kxLC .kx-deliv{align-self:flex-end;color:#8e8e93;font-size:11px;margin:3px 6px 6px 0;font-weight:500}'+
    '#kxLC .bar{background:#000!important;border-top:1px solid rgba(255,255,255,.1)!important;align-items:center!important;gap:9px!important}'+
    '#kxLC .bar input{background:#1c1c1e!important;border:1px solid rgba(255,255,255,.2)!important;border-radius:20px!important;color:#fff!important}'+
    '#kxLC .bar input::placeholder{color:#8e8e93!important}'+
    '#kxLC .bar button{background:#0a84ff!important;color:#fff!important;border-radius:50%!important;width:34px;height:34px;padding:0!important;font-size:0!important;flex:none;display:grid;place-items:center}'+
    '#kxLC .bar button::after{content:"↑";font-size:19px;font-weight:800;line-height:1}'+
    '#kxLCtyping{align-self:flex-start;max-width:80%}'+
    '#kxLCtyping .nm{color:#8e8e93!important;margin:6px 0 2px 12px!important}'+
    '#kxLC .b.typing{background:#262628!important;display:inline-flex;align-items:center;gap:5px;padding:14px 16px!important;animation:none!important}'+
    '#kxLC .tdots{display:inline-flex;gap:5px}'+
    '#kxLC .tdots i{width:8px;height:8px;border-radius:50%;background:#8e8e93;display:inline-block;animation:kxtd 1.2s infinite ease-in-out}'+
    '#kxLC .tdots i:nth-child(2){animation-delay:.18s}#kxLC .tdots i:nth-child(3){animation-delay:.36s}'+
    '@keyframes kxtd{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}';
  document.head.appendChild(css);

  var el=document.createElement('div'); el.id='kxLC';
  el.innerHTML=
    '<div class="win">'+
      '<div class="side" id="kxLCside"><h3>Live Chat</h3><div id="kxLCrooms"></div>'+
        '<button class="newroom" id="kxLCnew">+ New / Join room</button></div>'+
      '<div class="main">'+
        '<div class="top"><button class="menu" id="kxLCmenu">&#9776;</button>'+
          '<b id="kxLCname">Global</b><span class="who" id="kxLCwho"></span>'+
          '<button class="x" id="kxLCclear" style="display:none;width:auto;padding:0 12px;margin-left:auto;font-size:13px;color:#ff8080">Clear chat</button>'+
          '<button class="x" id="kxLCx" style="margin-left:8px">&#10005;</button></div>'+
        '<div class="feed" id="kxLCfeed"></div>'+
        '<div class="bar"><input id="kxLCinput" placeholder="iMessage" maxlength="500" autocomplete="off">'+
          '<button id="kxLCsend">Send</button></div>'+
      '</div>'+
      '<div id="kxRoomModal"><div class="rm-card">'+
        '<h3>New / Join room</h3>'+
        '<p>Enter a room name or a secret code. Anyone with the same code lands in the same private room.</p>'+
        '<input id="kxRoomName" placeholder="e.g. squad-chat or a secret code" maxlength="40" autocomplete="off">'+
        '<div class="rm-row"><button class="rm-go" id="kxRoomCreate">Create / Join</button>'+
        '<button class="rm-cancel" id="kxRoomCancel">Cancel</button></div>'+
      '</div></div>'+
    '</div>';
  document.body.appendChild(el);
  // click outside the window closes it
  el.addEventListener('mousedown',function(ev){ if(ev.target===el) close(); });

  var feed, input, lastId=0, seen={}, timer=null, lastUser=null, lastTs=0;
  function paintRooms(){
    var box=document.getElementById('kxLCrooms'), rs=rooms(), c=curRoom();
    box.innerHTML=rs.map(function(r){
      return '<div class="room'+(r.id===c?' on':'')+'" data-id="'+r.id+'">'+
        (r.id==='global'?'&#127758;':'&#128274;')+' <span>'+esc(r.name)+'</span>'+
        (r.id!=='global'?'<span class="rm" data-rm="'+r.id+'">&#10005;</span>':'')+'</div>';
    }).join('');
    box.querySelectorAll('.room').forEach(function(d){
      d.onclick=function(ev){ if(ev.target.dataset.rm){ ev.stopPropagation(); var rs2=rooms().filter(function(x){return x.id!==ev.target.dataset.rm;}); saveRooms(rs2); if(curRoom()===ev.target.dataset.rm) switchRoom('global'); else paintRooms(); return; } switchRoom(d.dataset.id); document.getElementById('kxLCside').classList.remove('show'); };
    });
    var cr=rooms().filter(function(r){return r.id===c;})[0]||{name:'Global',id:'global'};
    document.getElementById('kxLCname').textContent=cr.name;
    var who=document.getElementById('kxLCwho');
    if(c==='global'){ who.textContent='everyone'; who.style.cursor=''; who.title=''; who.onclick=null; }
    else { who.innerHTML='code: <b style="color:#0a84ff;font-family:\\'JetBrains Mono\\',monospace">'+esc(c)+'</b> · tap to copy'; who.style.cursor='pointer'; who.title='Copy room code to share';
      who.onclick=function(){ try{ navigator.clipboard.writeText(c); var o=who.innerHTML; who.textContent='copied ✓'; setTimeout(function(){ who.innerHTML=o; },1200); }catch(e){ if(window.kxPrompt) kxPrompt('Share this room code:',{value:c,okText:'Done'}); } }; }
  }
  function fmtGroup(ts){ var d=new Date(ts); return d.toLocaleDateString([], {month:'short',day:'numeric'})+' · '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
  function add(m){
    if(seen[m.id]) return; seen[m.id]=1; if(m.id>lastId) lastId=m.id;
    var e=feed.querySelector('.empty'); if(e) e.remove();
    var mine=(m.user===me());
    // time separator every 10 min
    if(m.ts-lastTs>600000){ var g=document.createElement('div'); g.className='grp'; g.textContent=fmtGroup(m.ts); feed.appendChild(g); lastUser=null; }
    lastTs=m.ts;
    var admin=(window.kxIsAdmin&&kxIsAdmin());
    if(!mine && m.user!==lastUser){ var nm=document.createElement('div'); nm.className='nm'+(admin?' banable':''); nm.textContent=m.user;
      if(admin){ nm.title='Click to ban '+m.user; nm.onclick=function(){ adminBan(m.user); }; } feed.appendChild(nm); }
    lastUser=m.user;
    var b=document.createElement('div'); b.className='b '+(mine?'me':'them'); b.textContent=m.text; b.dataset.id=m.id;
    if(admin){ b.classList.add('adminable'); var del=document.createElement('span'); del.className='del'; del.textContent='\\u00d7'; del.title='Delete message';
      del.onclick=function(ev){ ev.stopPropagation(); adminDelete(m.id,b); }; b.appendChild(del); }
    var near=(feed.scrollHeight-feed.scrollTop-feed.clientHeight)<120;
    feed.appendChild(b); if(near||mine) feed.scrollTop=feed.scrollHeight;
  }
  function poll(){
    fetch(API+'/messages?room='+curRoom()+'&since='+lastId).then(function(r){return r.json();})
      .then(function(j){ (j.messages||[]).forEach(add); updateDelivered(); renderTyping(j.typing||[]); }).catch(function(){});
  }
  function updateDelivered(){
    if(!feed) return;
    var old=feed.querySelector('.kx-deliv'); if(old) old.remove();
    var all=feed.querySelectorAll('.b:not(.typing)'); if(!all.length) return;
    var last=all[all.length-1];
    if(!last.classList.contains('me')) return; // only under YOUR last message when it's the newest
    var d=document.createElement('div'); d.className='kx-deliv'; d.textContent='Delivered';
    last.insertAdjacentElement('afterend', d);
  }
  function renderTyping(list){
    if(!feed) return;
    var mineName=me();
    var others=list.filter(function(u){ return u && u!==mineName; });
    var w=document.getElementById('kxLCtyping');
    if(!others.length){ if(w) w.remove(); return; }
    var label = others.length===1 ? (others[0]+' is typing…')
      : others.length===2 ? (others[0]+' and '+others[1]+' are typing…')
      : (others.length+' people are typing…');
    if(!w){ w=document.createElement('div'); w.id='kxLCtyping';
      w.innerHTML='<div class="nm"></div><div class="b them typing"><span class="tdots"><i></i><i></i><i></i></span></div>'; }
    w.querySelector('.nm').textContent=label;
    feed.appendChild(w); // keep it pinned to the bottom
    var near=(feed.scrollHeight-feed.scrollTop-feed.clientHeight)<160; if(near) feed.scrollTop=feed.scrollHeight;
  }
  var lastType=0;
  function pingType(){
    var u=me(); if(!u) return; var now=Date.now(); if(now-lastType<2500) return; lastType=now;
    fetch(API+'/type?room='+curRoom(),{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({user:u})}).catch(function(){});
  }
  function switchRoom(id){
    setRoom(id); lastId=0; seen={}; lastUser=null; lastTs=0;
    feed.innerHTML='<div class="empty">Loading…</div>';
    paintRooms(); poll();
    setTimeout(function(){ if(!feed.querySelector('.b')) feed.innerHTML='<div class="empty">No messages yet — say something.</div>'; }, 1400);
  }
  function adminDelete(id,bubble){
    fetch(API+'/admin/delete?room='+curRoom(),{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({token:(window.kxToken?kxToken():''),id:id})}).then(function(){ if(bubble) bubble.remove(); }).catch(function(){});
  }
  function adminBan(user){
    var go=function(ok){ if(!ok) return;
      fetch(API+'/auth/ban',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({token:(window.kxToken?kxToken():''),user:user})}).then(function(){ if(window.kxAlert) kxAlert(user+' is banned. Their messages will be blocked.','Banned'); }).catch(function(){});
    };
    if(window.kxConfirm) kxConfirm('Ban "'+user+'" from all chat?',{okText:'Ban',danger:true}).then(go); else go(true);
  }
  function send(){
    var t=input.value.trim(); if(!t) return;
    var user=me(); if(!user){ if(window.kxOpenLogin){ kxOpenLogin(); return; } }
    input.value='';
    fetch(API+'/message?room='+curRoom(),{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({user:user||'guest',text:t})}).then(poll).catch(function(){ input.value=t; });
  }
  function open(){
    el.classList.add('on');
    feed=document.getElementById('kxLCfeed'); input=document.getElementById('kxLCinput');
    document.getElementById('kxLCclear').style.display=(window.kxIsAdmin&&kxIsAdmin())?'block':'none';
    paintRooms(); lastId=0; seen={}; lastUser=null; lastTs=0; feed.innerHTML='<div class="empty">Loading…</div>';
    poll(); if(timer) clearInterval(timer); timer=setInterval(poll,2500);
    setTimeout(function(){ input.focus(); },60);
    setTimeout(function(){ if(feed&&!feed.querySelector('.b')) feed.innerHTML='<div class="empty">No messages yet — say something.</div>'; }, 1400);
  }
  function close(){ el.classList.remove('on'); if(timer){ clearInterval(timer); timer=null; } }
  document.getElementById('kxLCx').onclick=close;
  document.getElementById('kxLCsend').onclick=send;
  document.getElementById('kxLCmenu').onclick=function(){ document.getElementById('kxLCside').classList.toggle('show'); };
  var rmModal=document.getElementById('kxRoomModal');
  document.getElementById('kxLCnew').onclick=function(){ document.getElementById('kxRoomName').value=''; rmModal.classList.add('on'); setTimeout(function(){ document.getElementById('kxRoomName').focus(); },50); };
  document.getElementById('kxRoomCancel').onclick=function(){ rmModal.classList.remove('on'); };
  document.getElementById('kxRoomCreate').onclick=function(){
    var name=document.getElementById('kxRoomName').value.trim(); if(!name) return;
    var id=slug(name); if(!id) return;
    var rs=rooms(); if(!rs.some(function(r){return r.id===id;})) rs.push({id:id,name:name.slice(0,24)}); saveRooms(rs);
    rmModal.classList.remove('on'); switchRoom(id);
  };
  document.getElementById('kxRoomName').addEventListener('keydown',function(e){ if(e.key==='Enter') document.getElementById('kxRoomCreate').click(); });
  document.getElementById('kxLCclear').onclick=function(){
    if(!(window.kxIsAdmin&&kxIsAdmin())) return;
    var go=function(ok){ if(!ok) return;
      fetch(API+'/admin/clear?room='+curRoom(),{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({token:(window.kxToken?kxToken():'')})}).then(function(){ lastId=0; seen={}; document.getElementById('kxLCfeed').innerHTML='<div class="empty">Cleared.</div>'; poll(); }).catch(function(){});
    };
    if(window.kxConfirm) kxConfirm('Clear ALL messages in "'+curRoom()+'"?',{okText:'Clear',danger:true}).then(go); else go(true);
  };
  document.getElementById('kxLCinput').addEventListener('keydown',function(e){ if(e.key==='Enter') send(); });
  document.getElementById('kxLCinput').addEventListener('input',pingType);
  window.kxOpenChat=open;

  // add the "Live Chat" nav tab
  function addTab(){
    var tabs=document.querySelector('.nav-tabs'); if(!tabs||document.getElementById('liveChatTab')) return;
    var t=document.createElement('div'); t.className='nav-tab'; t.id='liveChatTab'; t.textContent='LIVE CHAT'; t.onclick=open; tabs.appendChild(t);
  }
  if(document.readyState!=='loading') addTab(); else document.addEventListener('DOMContentLoaded', addTab);
  setInterval(addTab, 1500);
})();
</script>`;

/* ---------- Admin panel (admins only): users, ban, promote ---------- */
const adminJs = `<script>
(function(){
  var API='https://kryzixs-chat.fnjudo8.workers.dev';
  function tok(){ return window.kxToken?kxToken():''; }
  function meUser(){ return window.kxSession?kxSession():''; }
  function admin(){ return window.kxIsAdmin&&kxIsAdmin(); }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var css=document.createElement('style'); css.textContent=
    '#kxAdmin{position:fixed;inset:0;z-index:99998;background:rgba(5,5,6,.72);backdrop-filter:blur(8px);display:none;place-items:center;padding:24px;font-family:Inter,sans-serif}'+
    '#kxAdmin.on{display:grid}'+
    '#kxAdmin .win{width:min(820px,96vw);height:min(760px,92vh);background:#0e0e10;border:1px solid rgba(255,255,255,.1);border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 110px -40px #000;animation:kxwin .28s cubic-bezier(.2,.9,.3,1.1)}'+
    '#kxAdmin .top{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08)}'+
    '#kxAdmin .top h3{font-family:Newsreader,serif;font-size:20px;margin:0;font-weight:600}'+
    '#kxAdmin .top .sub{color:#8a8a8a;font-size:12px}'+
    '#kxAdmin .top .x{margin-left:auto;background:#161618;border:1px solid rgba(255,255,255,.12);color:#fff;width:34px;height:34px;border-radius:9px;cursor:pointer}'+
    '#kxAdmin .tabs{display:flex;gap:4px;padding:10px 16px 0;border-bottom:1px solid rgba(255,255,255,.08)}'+
    '#kxAdmin .tabs button{background:none;border:0;color:#8a8a8a;font-size:13px;font-weight:600;padding:9px 15px;border-radius:9px 9px 0 0;cursor:pointer;border-bottom:2px solid transparent}'+
    '#kxAdmin .tabs button:hover{color:#fff}'+
    '#kxAdmin .tabs button.on{color:#fff;border-bottom-color:#fff}'+
    '#kxAdmin .stat{display:flex;gap:8px;padding:12px 16px 0}'+
    '#kxAdmin .stat .s{flex:1;background:#151517;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px 14px}'+
    '#kxAdmin .stat .s b{display:block;font-size:22px;font-family:Newsreader,serif}'+
    '#kxAdmin .stat .s span{font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.08em}'+
    '#kxAdmin .search{margin:12px 16px 4px}'+
    '#kxAdmin .search input{width:100%;background:#0c0c0d;border:1px solid rgba(255,255,255,.14);border-radius:11px;padding:11px 14px;color:#fff;font-size:13px}'+
    '#kxAdmin .search input:focus{outline:none;border-color:rgba(255,255,255,.4)}'+
    '#kxAdmin .body{flex:1;overflow-y:auto;padding:12px 16px 18px}'+
    '#kxAdmin .row{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid rgba(255,255,255,.07);border-radius:12px;margin-bottom:8px;background:#151517}'+
    '#kxAdmin .row .nm{font-weight:600;font-size:14px}'+
    '#kxAdmin .row .badge{font-size:10px;font-weight:700;letter-spacing:.05em;padding:2px 7px;border-radius:6px;text-transform:uppercase}'+
    '#kxAdmin .row .badge.a{background:#fff;color:#000}#kxAdmin .row .badge.b{background:#3a1414;color:#ff8080;border:1px solid #5a2020}'+
    '#kxAdmin .row .sp{flex:1}'+
    '#kxAdmin .row button{background:#1f1f22;border:1px solid rgba(255,255,255,.14);color:#fff;border-radius:9px;padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer}'+
    '#kxAdmin .row button:hover{background:#2a2a2e}'+
    '#kxAdmin .row button.danger{color:#ff8080}#kxAdmin .row button.gold{background:#fff;color:#000;border-color:#fff}'+
    '#kxAdmin .empty{color:#66666e;text-align:center;padding:30px;font-size:13px}'+
    '#kxAdmin .tools{border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;margin-bottom:14px;background:#111113;display:flex;flex-direction:column;gap:8px}'+
    '#kxAdmin .tools .tr{display:flex;gap:8px}'+
    '#kxAdmin .tools input{flex:1;background:#0c0c0d;border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:9px 12px;color:#fff;font-size:13px}'+
    '#kxAdmin .tools input:focus{outline:none;border-color:rgba(255,255,255,.4)}'+
    '#kxAdmin .tools button{background:#1f1f22;border:1px solid rgba(255,255,255,.14);color:#fff;border-radius:9px;padding:9px 14px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}'+
    '#kxAdmin .tools button.gold{background:#fff;color:#000;border-color:#fff}#kxAdmin .tools button.danger{color:#ff8080}'+
    '#kxAdmin .inv{display:inline-flex;align-items:center;gap:7px;background:#0c0c0d;border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:6px 8px 6px 11px;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12.5px;letter-spacing:.1em}'+
    '#kxAdmin .inv.used{opacity:.5;text-decoration:line-through}'+
    '#kxAdmin .inv .u{font-family:Inter,sans-serif;letter-spacing:0;color:#8a8a8a;font-size:11px}'+
    '#kxAdmin .inv button{background:none;border:0;color:#ff8080;cursor:pointer;font-size:14px;padding:0 2px;line-height:1}'+
    '#kxAdmin .inv button.cp{color:#9b9ba3;font-size:12px}#kxAdmin .inv button.cp:hover{color:#fff}'+
    '#kxAdmin textarea{width:100%;background:#0c0c0d;border:1px solid rgba(255,255,255,.14);border-radius:11px;padding:12px 14px;color:#fff;font-size:14px;font-family:inherit;resize:vertical;min-height:70px}'+
    '#kxAdmin textarea:focus{outline:none;border-color:rgba(255,255,255,.4)}'+
    '#kxAdmin .lbl{font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.08em;margin:16px 0 7px}';
  document.head.appendChild(css);

  var el=document.createElement('div'); el.id='kxAdmin';
  el.innerHTML='<div class="win">'+
    '<div class="top"><h3>Admin</h3><span class="sub" id="kxAdSub"></span><button class="x" id="kxAdX">&#10005;</button></div>'+
    '<div class="tabs"><button data-t="users" class="on">Users</button><button data-t="invites">Invites</button><button data-t="broadcast">Broadcast</button></div>'+
    '<div class="body" id="kxAdBody"></div></div>';
  document.body.appendChild(el);
  el.addEventListener('mousedown',function(ev){ if(ev.target===el) el.classList.remove('on'); });
  document.getElementById('kxAdX').onclick=function(){ el.classList.remove('on'); };

  var TAB='users', USERS=[], FILTER='';
  el.querySelectorAll('.tabs button').forEach(function(b){ b.onclick=function(){
    TAB=b.dataset.t; el.querySelectorAll('.tabs button').forEach(function(x){ x.classList.toggle('on',x===b); }); render();
  }; });

  function act(path,user,cb){
    fetch(API+'/auth/'+path,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({token:tok(),user:user})}).then(function(r){return r.json();}).then(function(j){ if(cb) cb(j); loadUsers(); }).catch(function(){});
  }
  function loadUsers(){
    fetch(API+'/auth/users?token='+encodeURIComponent(tok())).then(function(r){return r.json();}).then(function(j){
      if(!j||j.error){ USERS=[]; document.getElementById('kxAdBody').innerHTML='<div class="empty">'+(j&&j.error?esc(j.error):'Could not load users')+'</div>'; return; }
      USERS=j.users||[];
      var nBan=USERS.filter(function(u){return u.banned;}).length, nAdm=USERS.filter(function(u){return u.admin;}).length;
      document.getElementById('kxAdSub').textContent=USERS.length+' users · '+nAdm+' admins · '+nBan+' banned';
      if(TAB==='users') render();
    }).catch(function(){ document.getElementById('kxAdBody').innerHTML='<div class="empty">Network error.</div>'; });
  }
  function render(){
    var body=document.getElementById('kxAdBody'); var owner=(meUser()==='kryzixsadmin');
    if(TAB==='users') renderUsers(body,owner);
    else if(TAB==='invites') renderInvites(body);
    else renderBroadcast(body);
  }
  function renderUsers(body,owner){
    var nBan=USERS.filter(function(u){return u.banned;}).length, nAdm=USERS.filter(function(u){return u.admin;}).length;
    var list=USERS.filter(function(u){ return !FILTER || u.user.indexOf(FILTER)>=0; });
    body.innerHTML=
      '<div class="stat"><div class="s"><b>'+USERS.length+'</b><span>Users</span></div>'+
        '<div class="s"><b>'+nAdm+'</b><span>Admins</span></div>'+
        '<div class="s"><b>'+nBan+'</b><span>Banned</span></div></div>'+
      '<div class="search"><input id="kxAdSearch" placeholder="Search users…" autocomplete="off" value="'+esc(FILTER)+'"></div>'+
      (list.length?list.map(function(u){
        var badges=(u.admin?'<span class="badge a">admin</span>':'')+(u.banned?'<span class="badge b">banned</span>':'');
        var btns='';
        if(u.user!=='kryzixsadmin'){
          btns+='<button class="danger" data-act="'+(u.banned?'unban':'ban')+'" data-u="'+esc(u.user)+'">'+(u.banned?'Unban':'Ban')+'</button>';
          if(owner){
            btns+='<button class="'+(u.admin?'':'gold')+'" data-act="'+(u.admin?'demote':'promote')+'" data-u="'+esc(u.user)+'">'+(u.admin?'Remove admin':'Make admin')+'</button>';
            btns+='<button data-reset="'+esc(u.user)+'">Reset pw</button>';
            btns+='<button class="danger" data-del="'+esc(u.user)+'">Delete</button>';
          }
        }
        return '<div class="row"><span class="nm">'+esc(u.user)+'</span> '+badges+'<span class="sp"></span>'+btns+'</div>';
      }).join(''):'<div class="empty">No matching users.</div>');
    var sb=document.getElementById('kxAdSearch');
    if(sb) sb.oninput=function(){ FILTER=sb.value.trim().toLowerCase(); var p=sb.selectionStart; renderUsers(body,owner); var n=document.getElementById('kxAdSearch'); if(n){ n.focus(); try{ n.setSelectionRange(p,p); }catch(e){} } };
    body.querySelectorAll('button[data-act]').forEach(function(b){ b.onclick=function(){ act(b.dataset.act,b.dataset.u); }; });
    body.querySelectorAll('button[data-del]').forEach(function(b){ b.onclick=function(){
      kxConfirm('Permanently delete "'+b.dataset.del+'"? This removes their account.',{okText:'Delete',danger:true}).then(function(ok){ if(ok) act('deluser',b.dataset.del); }); }; });
    body.querySelectorAll('button[data-reset]').forEach(function(b){ b.onclick=function(){
      kxPrompt('Set a new password for "'+b.dataset.reset+'":',{okText:'Reset',ph:'new password'}).then(function(np){
        if(!np) return;
        fetch(API+'/auth/adminreset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:tok(),user:b.dataset.reset,newpass:np})})
          .then(function(r){return r.json();}).then(function(j){ if(j&&j.ok) kxAlert('Password for "'+b.dataset.reset+'" was reset.','Done'); else kxAlert((j&&j.error)||'Could not reset.','Error'); }); }); }; });
  }
  function renderInvites(body){
    body.innerHTML=
      '<div class="tools">'+
        '<div class="tr"><input id="kxAdInvName" placeholder="Custom code (optional) — blank = random" autocomplete="off" style="text-transform:uppercase;letter-spacing:.12em"><button id="kxAdInvBtn" class="gold">Generate</button></div>'+
        '<div class="tr"><input id="kxAdInvBulk" type="number" min="1" max="50" placeholder="Generate several at once (e.g. 10)" autocomplete="off"><button id="kxAdInvBulkBtn">Bulk generate</button></div>'+
      '</div>'+
      '<div class="lbl">Invite codes</div>'+
      '<div id="kxAdInvites" style="display:flex;flex-wrap:wrap;gap:7px"></div>';
    var ib=document.getElementById('kxAdInvBtn');
    ib.onclick=function(){ var ni=document.getElementById('kxAdInvName'); var v=ni.value.trim(); ib.disabled=true; ib.textContent='…';
      fetch(API+'/auth/newinvite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:tok(),code:v})})
        .then(function(r){return r.json();}).then(function(j){ ib.disabled=false; ib.textContent='Generate';
          if(j&&j.ok){ ni.value=''; kxAlert('New invite code:\\n\\n'+j.code+'\\n\\nShare it — it works once.','Invite created'); loadInvites(); }
          else kxAlert((j&&j.error)||'Could not create invite.','Error'); })
        .catch(function(){ ib.disabled=false; ib.textContent='Generate'; kxAlert('Network error — try again.','Error'); }); };
    var bbk=document.getElementById('kxAdInvBulkBtn');
    bbk.onclick=function(){ var n=Math.max(1,Math.min(50,parseInt(document.getElementById('kxAdInvBulk').value,10)||0)); if(!n) return;
      bbk.disabled=true; bbk.textContent='…'; var made=[];
      (function loop(i){ if(i>=n){ bbk.disabled=false; bbk.textContent='Bulk generate'; document.getElementById('kxAdInvBulk').value=''; kxAlert('Generated '+made.length+' codes:\\n\\n'+made.join('\\n'),'Invites created'); loadInvites(); return; }
        fetch(API+'/auth/newinvite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:tok()})})
          .then(function(r){return r.json();}).then(function(j){ if(j&&j.code) made.push(j.code); loop(i+1); }).catch(function(){ loop(i+1); }); })(0); };
    loadInvites();
  }
  function loadInvites(){
    var box=document.getElementById('kxAdInvites'); if(!box) return;
    fetch(API+'/auth/invites?token='+encodeURIComponent(tok())).then(function(r){return r.json();}).then(function(j){
      if(!j||!j.invites){ box.innerHTML=''; return; }
      if(!j.invites.length){ box.innerHTML='<span style="color:#66666e;font-size:12px">No invite codes yet — generate one above.</span>'; return; }
      box.innerHTML=j.invites.map(function(v){
        return '<span class="inv'+(v.usedBy?' used':'')+'">'+esc(v.code)+
          (v.usedBy?'<span class="u">→ '+esc(v.usedBy)+'</span>':'<button class="cp" data-cp="'+esc(v.code)+'" title="Copy">&#128203;</button>')+
          '<button data-del="'+esc(v.code)+'" title="Delete">&#10005;</button></span>';
      }).join('');
      box.querySelectorAll('button[data-cp]').forEach(function(b){ b.onclick=function(){ try{ navigator.clipboard.writeText(b.dataset.cp); b.textContent='✓'; setTimeout(function(){ b.innerHTML='&#128203;'; },900); }catch(e){} }; });
      box.querySelectorAll('button[data-del]').forEach(function(b){ b.onclick=function(){
        fetch(API+'/auth/delinvite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:tok(),code:b.dataset.del})})
          .then(function(){ loadInvites(); }).catch(function(){}); }; });
    }).catch(function(){});
  }
  function renderBroadcast(body){
    body.innerHTML=
      '<div class="lbl">Send a broadcast</div>'+
      '<textarea id="kxAdBroad" maxlength="200" placeholder="Type the announcement — it shows as a big banner to everyone online right now."></textarea>'+
      '<div class="tr" style="display:flex;gap:8px;margin-top:10px"><button id="kxAdBroadBtn" class="gold" style="flex:1;padding:11px;border-radius:10px;border:0;font-weight:700;cursor:pointer">Broadcast to everyone</button></div>'+
      ${NOPROXY?'':`('<div class="lbl">Proxy backend</div>'+
      '<div class="tools"><div class="tr">'+
        '<input id="kxAdProxy" placeholder="https://your-proxy.up.railway.app  (blank = off)" autocomplete="off" spellcheck="false">'+
        '<button id="kxAdProxyBtn" class="gold">Save</button></div>'+
        '<div style="font-size:11.5px;color:#8a8a8a;line-height:1.5">Point the PROXY tab at an always-on Ultraviolet proxy (e.g. Railway). Turbo turns on for everyone when it\\'s reachable — no PC needed. Leave blank to use the built-in basic proxy + your local START-PUBLIC tunnel.</div>'+
      '</div>')+`}
      '<div class="lbl">Danger zone</div>'+
      '<button id="kxAdWipe" class="kxs-btn danger" style="width:100%;background:#1c1c1f;border:1px solid rgba(255,255,255,.14);color:#ff8080;border-radius:10px;padding:11px;font-weight:600;cursor:pointer">Wipe Global chat</button>';
    ${NOPROXY?'':`
    var pin=document.getElementById('kxAdProxy'), pbtn=document.getElementById('kxAdProxyBtn');
    fetch(API+'/auth/getproxy?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){ if(j&&j.url&&pin) pin.value=j.url; }).catch(function(){});
    if(pbtn) pbtn.onclick=function(){ var v=pin.value.trim(); pbtn.disabled=true; pbtn.textContent='…';
      fetch(API+'/auth/setproxy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:tok(),url:v})})
        .then(function(r){return r.json();}).then(function(j){ pbtn.disabled=false; pbtn.textContent='Save';
          if(j&&j.ok){ kxAlert(v?('Proxy set:\\n\\n'+j.url+'\\n\\nThe PROXY tab will switch to Turbo when it is reachable.'):'Proxy cleared — back to the basic proxy.','Saved'); }
          else kxAlert((j&&j.error)||'Could not save.','Error'); })
        .catch(function(){ pbtn.disabled=false; pbtn.textContent='Save'; kxAlert('Network error — try again.','Error'); }); };
    `}
    var bb=document.getElementById('kxAdBroadBtn');
    bb.onclick=function(){ var inp=document.getElementById('kxAdBroad'); var v=inp.value.trim(); if(!v) return;
      bb.disabled=true; bb.textContent='…'; var who=(meUser()||'kryzixsadmin');
      fetch(API+'/message?room=broadcast',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user:who,text:v})})
        .then(function(r){return r.json();}).then(function(j){ bb.disabled=false; bb.textContent='Broadcast to everyone';
          if(j&&j.ok){ inp.value=''; el.classList.remove('on'); if(window.kxBCpoll) setTimeout(window.kxBCpoll,120); }
          else kxAlert((j&&j.error)||'Could not send.','Error'); })
        .catch(function(){ bb.disabled=false; bb.textContent='Broadcast to everyone'; kxAlert('Network error — try again.','Error'); }); };
    var wb=document.getElementById('kxAdWipe');
    wb.onclick=function(){ kxConfirm('Wipe ALL messages in Global chat?',{okText:'Wipe',danger:true}).then(function(ok){ if(ok) fetch(API+'/admin/clear?room=global',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:tok()})}).then(function(){ kxAlert('Global chat wiped.','Done'); }).catch(function(){}); }); };
  }
  function open(){ if(!admin()){ return; } el.classList.add('on'); TAB='users'; el.querySelectorAll('.tabs button').forEach(function(x){ x.classList.toggle('on',x.dataset.t==='users'); }); document.getElementById('kxAdBody').innerHTML='<div class="empty">Loading…</div>'; loadUsers(); render(); }
  window.kxOpenAdmin=open;

  function addTab(){
    var tabs=document.querySelector('.nav-tabs'); if(!tabs) return;
    var t=document.getElementById('adminTab');
    if(admin()){ if(!t){ t=document.createElement('div'); t.className='nav-tab'; t.id='adminTab'; t.textContent='ADMIN'; t.onclick=open; tabs.appendChild(t); } }
    else if(t){ t.remove(); }
  }
  if(document.readyState!=='loading') addTab(); else document.addEventListener('DOMContentLoaded', addTab);
  setInterval(addTab, 1500);
})();
</script>`;

/* ---------- custom dialogs (no native prompt/confirm/alert) ---------- */
const dialogJs = `<script>
(function(){
  var css=document.createElement('style'); css.textContent=
    '#kxDlg{position:fixed;inset:0;z-index:100002;display:none;place-content:center;padding:24px;'+
      'background:rgba(5,5,6,.72);backdrop-filter:blur(8px);font-family:Inter,system-ui,sans-serif}'+
    '#kxDlg.on{display:grid}'+
    '#kxDlg .card{width:min(380px,92vw);background:#151517;border:1px solid rgba(255,255,255,.12);'+
      'border-radius:16px;padding:22px;box-shadow:0 30px 80px -30px #000;animation:kxdlg .24s cubic-bezier(.2,.9,.3,1.1)}'+
    '@keyframes kxdlg{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:none}}'+
    '#kxDlg .t{font-family:Newsreader,serif;font-size:19px;font-weight:600;margin-bottom:6px}'+
    '#kxDlg .m{color:#c8c8cc;font-size:13.5px;line-height:1.55;margin-bottom:16px;white-space:pre-wrap}'+
    '#kxDlg input{width:100%;background:#0c0c0d;border:1px solid rgba(255,255,255,.14);border-radius:11px;'+
      'padding:12px 14px;color:#fff;font-size:14px;margin-bottom:16px}'+
    '#kxDlg input:focus{outline:none;border-color:rgba(255,255,255,.4)}'+
    '#kxDlg .row{display:flex;gap:8px;justify-content:flex-end}'+
    '#kxDlg button{border-radius:10px;padding:10px 18px;font-weight:700;font-size:13.5px;cursor:pointer;border:0}'+
    '#kxDlg .ok{background:#fff;color:#000}#kxDlg .ok:hover{filter:brightness(.9)}'+
    '#kxDlg .ok.danger{background:#ff5d5d;color:#fff}'+
    '#kxDlg .cancel{background:#1f1f22;color:#fff;border:1px solid rgba(255,255,255,.14)}'+
    '#kxDlg .cancel:hover{background:#2a2a2e}'+
    '#kxMenu{position:fixed;z-index:100003;display:none;background:#161618;border:1px solid rgba(255,255,255,.14);'+
      'border-radius:12px;padding:6px;box-shadow:0 20px 50px -20px #000;min-width:170px}'+
    '#kxMenu.on{display:block}'+
    '#kxMenu button{display:block;width:100%;text-align:left;background:none;border:0;color:#e8e8ea;'+
      'padding:9px 12px;border-radius:8px;font-size:13.5px;cursor:pointer;font-weight:500}'+
    '#kxMenu button:hover{background:rgba(255,255,255,.08)}#kxMenu button.danger{color:#ff8080}';
  document.head.appendChild(css);

  var dlg=document.createElement('div'); dlg.id='kxDlg';
  dlg.innerHTML='<div class="card"><div class="t" id="kxDlgT"></div><div class="m" id="kxDlgM"></div>'+
    '<input id="kxDlgI" style="display:none"><div class="row" id="kxDlgR"></div></div>';
  document.body.appendChild(dlg);
  var T=document.getElementById('kxDlgT'),M=document.getElementById('kxDlgM'),I=document.getElementById('kxDlgI'),R=document.getElementById('kxDlgR');
  var cur=null;
  function shut(v){ dlg.classList.remove('on'); var c=cur; cur=null; if(c) c(v); }
  function show(o){
    T.textContent=o.title||'KryzixsDEX'; M.textContent=o.msg||'';
    if(o.input){ I.style.display='block'; I.type=o.password?'password':'text'; I.value=o.value||''; I.placeholder=o.ph||''; } else I.style.display='none';
    R.innerHTML=''; cur=o.done;
    if(o.cancel!==false){ var c=document.createElement('button'); c.className='cancel'; c.textContent=o.cancelText||'Cancel'; c.onclick=function(){ shut(o.input?null:false); }; R.appendChild(c); }
    var ok=document.createElement('button'); ok.className='ok'+(o.danger?' danger':''); ok.textContent=o.okText||'OK';
    ok.onclick=function(){ shut(o.input?I.value:true); }; R.appendChild(ok);
    dlg.classList.add('on'); setTimeout(function(){ (o.input?I:ok).focus(); },50);
  }
  dlg.addEventListener('mousedown',function(e){ if(e.target===dlg) shut(cur&&I.style.display==='block'?null:false); });
  I.addEventListener('keydown',function(e){ if(e.key==='Enter') shut(I.value); if(e.key==='Escape') shut(null); });

  window.kxAlert=function(msg,title){ return new Promise(function(res){ show({title:title,msg:msg,cancel:false,done:function(){res();}}); }); };
  window.kxConfirm=function(msg,opt){ opt=opt||{}; return new Promise(function(res){ show({title:opt.title,msg:msg,okText:opt.okText||'Confirm',danger:opt.danger,done:function(v){res(!!v);}}); }); };
  window.kxPrompt=function(msg,opt){ opt=opt||{}; return new Promise(function(res){ show({title:opt.title,msg:msg,input:true,password:opt.password,ph:opt.ph,value:opt.value,okText:opt.okText||'OK',done:function(v){res(v);}}); }); };

  // small popover menu, anchored under an element
  var menu=document.createElement('div'); menu.id='kxMenu'; document.body.appendChild(menu);
  window.kxMenu=function(anchor,items){
    menu.innerHTML=''; items.forEach(function(it){ var b=document.createElement('button'); if(it.danger) b.className='danger'; b.textContent=it.label; b.onclick=function(){ menu.classList.remove('on'); it.onClick&&it.onClick(); }; menu.appendChild(b); });
    var r=anchor.getBoundingClientRect(); menu.style.top=(r.bottom+6)+'px'; menu.style.left=Math.max(8,Math.min(r.left, window.innerWidth-190))+'px'; menu.classList.add('on');
  };
  document.addEventListener('mousedown',function(e){ if(!menu.contains(e.target) && menu.classList.contains('on')) menu.classList.remove('on'); },true);
})();
</script>`;

/* ---------- monochrome lock (theme picker removed) ---------- */
const extrasJs = `<script>
(function(){
  function lockMono(){
    var r=document.documentElement.style;
    r.setProperty('--primary-orange','#FFFFFF','important');
    r.setProperty('--primary-orange-rgb','255,255,255','important');
    r.setProperty('--accent-orange','#FFFFFF','important');
  }
  lockMono(); setInterval(lockMono, 1500);
  try{ ['customTheme','savedTheme','theme','siteTheme','themeColor'].forEach(function(k){ localStorage.removeItem(k); }); }catch(e){}

  /* volume slider wiring: pushes volume to every game iframe (self-contained
     games listen via their injected harness; external embeds ignore it) */
  function vol(){ var x=parseFloat(localStorage.getItem('kx_volume')); return isNaN(x)?1:x; }
  function pushVol(v){
    var frames=document.querySelectorAll('#gameViews iframe, iframe.game-frame, .game-view-stack iframe, iframe');
    frames.forEach(function(f){ try{ f.contentWindow && f.contentWindow.postMessage({type:'KX_VOLUME',value:v},'*'); }catch(e){} });
  }
  function paintIcon(v){ var ic=document.getElementById('kxVolIcon'); if(!ic) return;
    ic.className='fas '+(v<=0?'fa-volume-xmark':(v<0.5?'fa-volume-low':'fa-volume-high')); }
  function initVol(){ var s=document.getElementById('kxVol'); if(!s||s.dataset.kx) return; s.dataset.kx='1';
    var v=vol(); s.value=Math.round(v*100); paintIcon(v);
    s.addEventListener('input',function(){ var nv=parseInt(s.value,10)/100; try{localStorage.setItem('kx_volume',nv);}catch(e){} paintIcon(nv); pushVol(nv); });
    var ic=document.getElementById('kxVolIcon');
    if(ic) ic.addEventListener('click',function(){ var nv=(vol()>0)?0:1; s.value=Math.round(nv*100); try{localStorage.setItem('kx_volume',nv);}catch(e){} paintIcon(nv); pushVol(nv); });
  }
  if(document.readyState!=='loading') initVol(); else document.addEventListener('DOMContentLoaded', initVol);
  setInterval(initVol, 1500);
  // when any game iframe finishes loading, hand it the current volume
  document.addEventListener('load', function(e){ if(e.target&&e.target.tagName==='IFRAME'){ try{ e.target.contentWindow.postMessage({type:'KX_VOLUME',value:vol()},'*'); }catch(err){} } }, true);
})();
</script>`;

/* ---------- big MrBeast-style broadcast banner (top-center, everyone) ---------- */
const broadcastJs = `<script>
(function(){
  var API='https://kryzixs-chat.fnjudo8.workers.dev', ROOM='broadcast';
  var css=document.createElement('style'); css.textContent=
    '#kxBC{position:fixed;top:0;left:0;right:0;z-index:100050;display:flex;justify-content:center;pointer-events:none;padding:18px 16px 0;transition:padding-top .2s}'+
    '@media(max-width:640px){#kxBC{top:82px}}'+
    '#kxBC .card{position:relative;pointer-events:auto;max-width:min(1040px,94vw);text-align:center;overflow:hidden;'+
      'background:linear-gradient(180deg,#141416,#0b0b0d);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:22px;'+
      'padding:20px 44px;box-shadow:0 40px 120px -30px #000,0 0 0 1px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);'+
      'transform:translateY(-24px) scale(.92);opacity:0;transition:transform .5s cubic-bezier(.16,1.25,.35,1),opacity .35s}'+
    '#kxBC.on .card{transform:translateY(0) scale(1);opacity:1}'+
    '#kxBC .card::before{content:"";position:absolute;top:-40%;left:50%;width:120%;height:80%;transform:translateX(-50%);'+
      'background:radial-gradient(60% 100% at 50% 0,rgba(255,255,255,.14),transparent 70%);pointer-events:none}'+
    '#kxBC .card::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;'+
      'background:linear-gradient(90deg,transparent,#fff,transparent);opacity:.55;'+
      'animation:kxbcsweep 2.4s linear infinite}'+
    '@keyframes kxbcsweep{0%{transform:translateX(-60%)}100%{transform:translateX(60%)}}'+
    '#kxBC .lbl{position:relative;display:inline-flex;align-items:center;gap:6px;font-family:Inter,sans-serif;font-weight:800;'+
      'letter-spacing:.3em;font-size:11px;text-transform:uppercase;color:#ff5d5d;margin-bottom:8px}'+
    '#kxBC .txt{position:relative;font-family:"Arial Black",Inter,system-ui,sans-serif;font-weight:900;line-height:.96;'+
      'letter-spacing:-.02em;text-transform:uppercase;font-size:clamp(28px,5.6vw,64px);'+
      'text-shadow:0 2px 24px rgba(255,255,255,.18);word-break:break-word}'+
    '#kxBC .who{position:relative;font-family:Inter,sans-serif;font-weight:600;font-size:12.5px;color:#8a8a92;margin-top:11px;letter-spacing:.03em}';
  document.head.appendChild(css);
  var el=document.createElement('div'); el.id='kxBC';
  el.innerHTML='<div class="card"><div class="lbl">&#9889; Broadcast</div><div class="txt" id="kxBCt"></div><div class="who" id="kxBCw"></div></div>';
  var mounted=false, hideT=0, queue=[], showing=false;
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
  function drain(){
    if(showing||!queue.length) return;
    if(!mounted){ document.body.appendChild(el); mounted=true; }
    var m=queue.shift(); showing=true;
    // sit just below the nav bar so it never overlaps it
    var nav=document.querySelector('.nav-tabs')||document.querySelector('.top-nav')||document.querySelector('.top-bar');
    var top=nav?(nav.getBoundingClientRect().bottom+14):18;
    el.style.paddingTop=Math.max(14,top)+'px';
    document.getElementById('kxBCt').textContent=m.text;
    document.getElementById('kxBCw').textContent='— '+m.user;
    requestAnimationFrame(function(){ el.classList.add('on'); });
    var dur=Math.min(11000, 4200 + m.text.length*70);
    clearTimeout(hideT); hideT=setTimeout(function(){
      el.classList.remove('on');
      setTimeout(function(){ showing=false; drain(); }, 500);
    }, dur);
  }
  var last=0, primed=false;
  function poll(){
    fetch(API+'/messages?room='+ROOM+'&since='+last).then(function(r){return r.json();}).then(function(j){
      var arr=(j&&j.messages)||[]; if(!arr.length) return;
      arr.forEach(function(m){ if(m.id>last) last=m.id; });
      if(!primed){ primed=true; return; } // skip the backlog on first load
      try{ if(localStorage.getItem('kx_bc_off')==='1') return; }catch(e){} // viewer muted banners
      arr.forEach(function(m){ queue.push({user:m.user||'admin',text:String(m.text||'')}); });
      drain();
    }).catch(function(){});
  }
  poll(); setInterval(poll, 4000);
  // admin panel calls this right after posting so the sender sees it instantly (once)
  window.kxBCpoll=poll;
})();
</script>`;

/* ---------- Settings: a fresh panel that actually does things ---------- */
const settingsJs = `<script>
(function(){
  function get(k,d){ try{ var v=localStorage.getItem('kx_set_'+k); return v===null?d:v==='1'; }catch(e){ return d; } }
  function set(k,v){ try{ localStorage.setItem('kx_set_'+k, v?'1':'0'); }catch(e){} }
  function apply(){
    var b=document.body;
    b.classList.toggle('kx-noanim', get('noanim',false));
    b.classList.toggle('kx-compact', get('compact',false));
    b.classList.toggle('kx-nodesc', get('nodesc',false));
    try{ localStorage.setItem('kx_bc_off', get('banners',true)?'0':'1'); }catch(e){}
  }
  var css=document.createElement('style'); css.textContent=
    'body.kx-noanim *,body.kx-noanim *::before,body.kx-noanim *::after{animation:none!important;transition:none!important}'+
    'body.kx-nodesc .lesson-desc{display:none!important}'+
    'body.kx-compact .lesson-image{height:118px!important}'+
    'body.kx-compact .lessons-grid{gap:12px!important}'+
    '#settings-section .modal-body{display:block!important;padding:0!important}'+
    '.kxs-wrap{max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:14px}'+
    '.kxs-group{background:#111113;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden}'+
    '.kxs-group h4{margin:0;padding:14px 18px;font-family:Newsreader,serif;font-weight:600;font-size:15px;'+
      'letter-spacing:.02em;border-bottom:1px solid rgba(255,255,255,.06);color:#fff}'+
    '.kxs-row{display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid rgba(255,255,255,.05)}'+
    '.kxs-row:first-of-type{border-top:0}'+
    '.kxs-row .tx{flex:1;min-width:0}'+
    '.kxs-row .tt{font-size:14px;font-weight:600;color:#f2f2f4}'+
    '.kxs-row .ds{font-size:12px;color:#8a8a8a;margin-top:2px;line-height:1.4}'+
    '.kxs-sw{position:relative;width:46px;height:27px;flex:none;cursor:pointer}'+
    '.kxs-sw input{opacity:0;width:0;height:0;position:absolute}'+
    '.kxs-sw .tr{position:absolute;inset:0;background:#2a2a2e;border-radius:99px;transition:.2s}'+
    '.kxs-sw .tr:before{content:"";position:absolute;width:21px;height:21px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}'+
    '.kxs-sw input:checked+.tr{background:#fff}'+
    '.kxs-sw input:checked+.tr:before{transform:translateX(19px);background:#000}'+
    '.kxs-btn{background:#1c1c1f;border:1px solid rgba(255,255,255,.14);color:#fff;border-radius:10px;'+
      'padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}'+
    '.kxs-btn:hover{background:#26262b}.kxs-btn.danger{color:#ff8080}.kxs-btn.solid{background:#fff;color:#000;border-color:#fff}'+
    '.kxs-acct{font-family:"JetBrains Mono",monospace;font-size:13px;color:#c8c8cc}';
  document.head.appendChild(css);

  function sw(key,def){
    return '<label class="kxs-sw"><input type="checkbox" data-k="'+key+'"'+(get(key,def)?' checked':'')+'><span class="tr"></span></label>';
  }
  function build(){
    var body=document.querySelector('#settings-section .modal-body'); if(!body||body.dataset.kx) return;
    body.dataset.kx='1';
    var who=(window.kxSession&&kxSession())||'';
    body.innerHTML='<div class="kxs-wrap">'+
      '<div class="kxs-group"><h4>Account</h4>'+
        '<div class="kxs-row"><div class="tx"><div class="tt">Signed in as</div><div class="ds kxs-acct" id="kxsWho">'+(who?who:'not signed in')+'</div></div>'+
          '<button class="kxs-btn" id="kxsPass">Change password</button></div>'+
        '<div class="kxs-row"><div class="tx"><div class="tt">Session</div><div class="ds">Log out of this device.</div></div>'+
          '<button class="kxs-btn danger" id="kxsOut">Log out</button></div>'+
      '</div>'+
      '<div class="kxs-group"><h4>Appearance</h4>'+
        '<div class="kxs-row"><div class="tx"><div class="tt">Reduce animations</div><div class="ds">Turn off motion and transitions across the site.</div></div>'+sw('noanim',false)+'</div>'+
        '<div class="kxs-row"><div class="tx"><div class="tt">Compact game cards</div><div class="ds">Smaller thumbnails so more games fit on screen.</div></div>'+sw('compact',false)+'</div>'+
        '<div class="kxs-row"><div class="tx"><div class="tt">Hide game descriptions</div><div class="ds">Show just the title on each card.</div></div>'+sw('nodesc',false)+'</div>'+
      '</div>'+
      '<div class="kxs-group"><h4>Notifications</h4>'+
        '<div class="kxs-row"><div class="tx"><div class="tt">Broadcast banners</div><div class="ds">Show the big announcement banner when an admin broadcasts.</div></div>'+sw('banners',true)+'</div>'+
      '</div>'+
      '<div class="kxs-group"><h4>Data</h4>'+
        '<div class="kxs-row"><div class="tx"><div class="tt">Recently played</div><div class="ds">Clear your list of recently played games.</div></div>'+
          '<button class="kxs-btn" id="kxsRecent">Clear</button></div>'+
        '<div class="kxs-row"><div class="tx"><div class="tt">Joined chat rooms</div><div class="ds">Leave all rooms except Global.</div></div>'+
          '<button class="kxs-btn" id="kxsRooms">Reset</button></div>'+
      '</div>'+
    '</div>';
    body.querySelectorAll('.kxs-sw input').forEach(function(i){
      i.onchange=function(){ set(i.dataset.k, i.checked); apply(); };
    });
    var pass=document.getElementById('kxsPass'); if(pass) pass.onclick=function(){ if(window.kxChangePass) kxChangePass(); };
    var out=document.getElementById('kxsOut'); if(out) out.onclick=function(){
      if(window.kxConfirm) kxConfirm('Log out of KryzixsDEX?',{okText:'Log out',danger:true}).then(function(ok){ if(ok&&window.kxLogout) kxLogout(); });
      else if(window.kxLogout) kxLogout(); };
    var rc=document.getElementById('kxsRecent'); if(rc) rc.onclick=function(){
      var go=function(ok){ if(!ok) return; try{ localStorage.removeItem('kx_recent'); }catch(e){}
        document.querySelectorAll('.kx-recent-wrap,#kxRecent').forEach(function(n){ n.innerHTML=''; }); if(window.kxAlert) kxAlert('Recently played cleared.','Done'); };
      if(window.kxConfirm) kxConfirm('Clear your recently played list?',{okText:'Clear',danger:true}).then(go); else go(true); };
    var rr=document.getElementById('kxsRooms'); if(rr) rr.onclick=function(){
      var go=function(ok){ if(!ok) return; try{ localStorage.setItem('kx_rooms',JSON.stringify([{id:'global',name:'Global'}])); localStorage.setItem('kx_room','global'); }catch(e){} if(window.kxAlert) kxAlert('Left all rooms except Global.','Done'); };
      if(window.kxConfirm) kxConfirm('Leave all chat rooms except Global?',{okText:'Reset',danger:true}).then(go); else go(true); };
  }
  function refreshWho(){ var w=document.getElementById('kxsWho'); if(w){ var s=(window.kxSession&&kxSession())||''; w.textContent=s||'not signed in'; } }
  apply();
  if(document.readyState!=='loading') build(); else document.addEventListener('DOMContentLoaded', build);
  setInterval(function(){ apply(); build(); refreshWho(); }, 1500);
})();
</script>`;

// NOPROXY build: a clean games site — proxy browser, PROXY tab, and the admin
// proxy-backend section are all stripped at build time (see ${NOPROXY?...} above).
// Chromebook performance: lazy-load thumbnails + skip rendering offscreen cards.
html = html.replace('<img src="${game.image}"', '<img loading="lazy" decoding="async" src="${game.image}"');
const perfCss = `<style>
/* skip rendering offscreen game cards + lazy thumbnails (huge with 400+ cards) */
.lesson-card{content-visibility:auto;contain-intrinsic-size:0 260px}
.lesson-image{background:#141416}
/* kill the animated backgrounds visually (the JS also stops their loops) */
#matrix-bg,canvas.vanta-canvas,[id*="vanta"],.background-paths,.starfield-layer{display:none!important}
#main-container,body{background:#0A0A0B!important}
/* drop expensive blur — costly on low-power Chromebooks (overlays stay solid) */
*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
body.kx-locked #main-container{filter:none!important}
#kxAdmin,#kxDlg,#kxRoomModal{background:rgba(6,6,7,.9)!important}
</style>`;

// Admin panel + announcement banner refresh (modern, blue-accent, matches the chat)
const adminAnnCss = `<style>
/* ---- Admin panel ---- */
#kxAdmin .win{border-radius:22px!important;border:1px solid rgba(255,255,255,.12)!important;background:linear-gradient(180deg,#161618,#101012)!important;box-shadow:0 50px 120px -40px #000!important}
#kxAdmin .top{padding:18px 22px!important}
#kxAdmin .top h3{font-size:22px!important;font-family:Newsreader,serif!important}
#kxAdmin .tabs{padding:0 16px!important;gap:4px!important;border-bottom:1px solid rgba(255,255,255,.08)!important}
#kxAdmin .tabs button{font-size:13.5px!important;font-weight:600!important;padding:12px 16px!important}
#kxAdmin .tabs button.on{color:#0a84ff!important;border-bottom-color:#0a84ff!important}
#kxAdmin .stat{gap:10px!important}
#kxAdmin .stat .s{border-radius:16px!important;background:#1b1b1e!important;border:1px solid rgba(255,255,255,.06)!important;padding:14px!important}
#kxAdmin .stat .s b{font-size:26px!important;color:#fff!important}
#kxAdmin .search input{border-radius:12px!important;background:#1b1b1e!important;padding:12px 15px!important}
#kxAdmin .search input:focus{border-color:#0a84ff!important;box-shadow:0 0 0 3px rgba(10,132,255,.25)!important}
#kxAdmin .row{border-radius:14px!important;background:#1b1b1e!important;border:1px solid rgba(255,255,255,.06)!important;padding:13px 15px!important}
#kxAdmin .row button{border-radius:10px!important;padding:8px 13px!important}
#kxAdmin .gold{background:#0a84ff!important;color:#fff!important;border-color:#0a84ff!important}
#kxAdmin .badge.a{background:#0a84ff!important;color:#fff!important}
#kxAdmin .tools{border-radius:16px!important;background:#141416!important;border:1px solid rgba(255,255,255,.07)!important;padding:14px!important}
#kxAdmin .tools input,#kxAdmin textarea{border-radius:12px!important;background:#0e0e10!important}
#kxAdmin .tools input:focus,#kxAdmin textarea:focus{border-color:#0a84ff!important}
#kxAdmin .inv{border-radius:11px!important}
/* ---- Announcement banner (new GUI) ---- */
#kxBC{padding-top:20px!important}
#kxBC .card{position:relative!important;overflow:hidden!important;background:linear-gradient(135deg,#21242c,#141519)!important;color:#fff!important;
  border-radius:20px!important;border:1px solid rgba(255,255,255,.16)!important;
  box-shadow:0 26px 80px -18px #000,0 0 0 1px rgba(10,132,255,.22) inset!important;padding:18px 34px 18px 40px!important}
#kxBC .card::before{content:""!important;position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(180deg,#4aa3ff,#0a84ff)!important}
#kxBC .card::after{content:""!important;position:absolute;top:-40%;right:-10%;width:220px;height:220px;border-radius:50%;background:radial-gradient(closest-side,rgba(10,132,255,.22),transparent)!important;pointer-events:none}
#kxBC .lbl{color:#4aa3ff!important;letter-spacing:.28em!important;font-size:11px!important;font-weight:800!important}
#kxBC .txt{color:#fff!important;font-size:clamp(22px,4vw,42px)!important;text-shadow:0 2px 30px rgba(10,132,255,.4)!important}
#kxBC .who{color:#9a9aa2!important}
</style>`;

// Chitter theme: an indigo accent GUI over the mono base (buttons, tabs, chat, login)
const chitterCss = `<style id="kxChitter">
#kxLogin .card::before{background:radial-gradient(closest-side,rgba(124,108,255,.30),transparent)!important}
#kxLogin .card{border-color:rgba(124,108,255,.38)!important}
#kxLogin .primary{background:linear-gradient(180deg,#8b7bff,#6c5cff)!important;color:#fff!important}
#kxLogin .toggle{color:#a78bfa!important}
#kxLogin .card.ok{border-color:#7c6cff!important;box-shadow:0 0 0 3px rgba(124,108,255,.32),0 40px 100px -30px #000!important}
#kxlLock .lk{color:#7c6cff!important}#kxlLock .lbl{color:#a78bfa!important}
#kxLogin .stats .st b{color:#c9c0ff!important}
.nav-tab.active,.nav-tab.on,.nav-tab[aria-selected="true"]{background:linear-gradient(180deg,#8b7bff,#6c5cff)!important;color:#fff!important;border-color:transparent!important}
#kxLC .b.me{background:linear-gradient(180deg,#8b7bff,#6c5cff)!important;color:#fff!important}
#kxLC .bar button{background:linear-gradient(180deg,#8b7bff,#6c5cff)!important;color:#fff!important}
#kxLC .room.on{box-shadow:inset 3px 0 0 #7c6cff!important;color:#fff!important}
#kxLC .newroom{background:linear-gradient(180deg,#8b7bff,#6c5cff)!important;color:#fff!important}
.kxs-btn.solid{background:#7c6cff!important;border-color:#7c6cff!important;color:#fff!important}
.kxs-sw input:checked+.tr{background:#7c6cff!important}
.home-popular-wrap h2::after,#all-lessons h2::after,.section-title::after{background:rgba(124,108,255,.45)!important}
.lesson-card:hover{border-color:rgba(124,108,255,.5)!important}
#kxAdmin .tabs button.on{color:#fff!important;border-bottom-color:#7c6cff!important}
#kxBC .lbl{color:#6c5cff!important}
::selection{background:#7c6cff!important;color:#fff!important}
</style>`;

let injects = NOPROXY
  ? [dialogJs, recentJs, loginJs, chatJs, adminJs, broadcastJs, settingsJs, extrasJs]
  : [dialogJs, proxyJs, recentJs, interstellarJs, loginJs, chatJs, adminJs, broadcastJs, settingsJs, extrasJs];
// NOANN: drop the broadcast-banner poller so announcements never pop up in this copy
if (NOANN) injects = injects.filter(function (s) { return s !== broadcastJs; });
const gameWarnJs = `<script>
(function(){
  function add(){
    if(document.getElementById('kxGameWarn')) return true;
    var anchor=document.querySelector('.home-hero')||document.querySelector('.home-popular-wrap')||document.querySelector('#all-lessons');
    if(!anchor||!anchor.parentNode) return false;
    var w=document.createElement('div'); w.id='kxGameWarn';
    w.style.cssText='position:relative;z-index:2;margin:18px auto 6px;max-width:1240px;padding:16px 22px;border-radius:16px;'+
      'background:linear-gradient(180deg,#2a0f10,#170a0b);border:1px solid rgba(255,69,58,.5);'+
      'color:#ff5b52;font-weight:800;font-size:clamp(14px,2.4vw,20px);letter-spacing:.02em;text-align:center;'+
      'text-transform:uppercase;box-shadow:0 20px 60px -30px #000';
    w.textContent='⚠️ Not working bc Securly — some games work';
    anchor.parentNode.insertBefore(w, anchor);
    return true;
  }
  if(document.readyState!=='loading') add(); else document.addEventListener('DOMContentLoaded', add);
  var n=0, iv=setInterval(function(){ if(add()||++n>20) clearInterval(iv); }, 500);
})();
</script>`;
/* ---------- Watch: paste a YouTube link, plays on the site ---------- */
const watchJs = `<script>
(function(){
  function ytId(u){ u=(u||'').trim(); var m=u.match(/(?:youtu\\.be\\/|v=|\\/embed\\/|\\/shorts\\/)([A-Za-z0-9_-]{11})/); if(m)return m[1]; if(/^[A-Za-z0-9_-]{11}$/.test(u))return u; return null; }
  function recent(){ try{return JSON.parse(localStorage.getItem('kx_watch'))||[];}catch(e){return[];} }
  function save(id){ var r=recent().filter(function(x){return x!==id;}); r.unshift(id); r=r.slice(0,8); try{localStorage.setItem('kx_watch',JSON.stringify(r));}catch(e){} paintRec(); }
  var css=document.createElement('style'); css.textContent=
    '#kxWatch{position:fixed;inset:0;z-index:99999;background:#0A0A0B;display:none;flex-direction:column;font-family:Inter,sans-serif;overflow:auto}'+
    '#kxWatch.on{display:flex}'+
    '#kxWatch .top{display:flex;align-items:center;padding:16px 22px;border-bottom:1px solid rgba(255,255,255,.08)}'+
    '#kxWatch .top b{font-family:Newsreader,serif;font-size:22px;font-weight:600}'+
    '#kxWatch .top .x{margin-left:auto;background:#161618;border:1px solid rgba(255,255,255,.14);color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer}'+
    '#kxWatch .wrap{max-width:960px;margin:0 auto;width:100%;padding:26px 20px;display:flex;flex-direction:column;gap:16px}'+
    '#kxWatch form{display:flex;gap:10px}'+
    '#kxWatch input{flex:1;background:#161618;border:1.5px solid rgba(255,255,255,.16);border-radius:14px;padding:14px 18px;color:#fff;font-size:15px;font-family:inherit}'+
    '#kxWatch input:focus{outline:none;border-color:#0a84ff}'+
    '#kxWatch button.play{background:#0a84ff;color:#fff;border:0;border-radius:14px;padding:0 26px;font-weight:700;cursor:pointer;font-size:15px;font-family:inherit}'+
    '#kxWatch .player{width:100%;aspect-ratio:16/9;background:#000;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.1);display:none}'+
    '#kxWatch .player.on{display:block}#kxWatch .player iframe{width:100%;height:100%;border:0}'+
    '#kxWatch .note{color:#8a8a92;font-size:12.5px;text-align:center}'+
    '#kxWatch .rec{display:flex;flex-wrap:wrap;gap:10px}'+
    '#kxWatch .rc{width:160px;background:#141416;border:1px solid rgba(255,255,255,.1);border-radius:12px;overflow:hidden;cursor:pointer;transition:.15s}'+
    '#kxWatch .rc:hover{border-color:#0a84ff;transform:translateY(-3px)}#kxWatch .rc img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}#kxWatch .rc span{display:block;padding:8px 10px;font-size:12px;color:#8a8a92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
  document.head.appendChild(css);
  var el=document.createElement('div'); el.id='kxWatch';
  el.innerHTML='<div class="top"><b>Watch</b><button class="x" id="kxWX">✕</button></div>'+
    '<div class="wrap"><form id="kxWform"><input id="kxWurl" placeholder="Paste a YouTube link…" autocomplete="off" spellcheck="false"><button type="submit" class="play">Play</button></form>'+
    '<div class="player" id="kxWplayer"><iframe id="kxWframe" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div>'+
    '<div class="note">Plays through YouTube\\'s embedded player.</div><div class="rec" id="kxWrec"></div></div>';
  document.body.appendChild(el);
  document.getElementById('kxWX').onclick=function(){ el.classList.remove('on'); document.getElementById('kxWframe').src='about:blank'; };
  function play(id){ document.getElementById('kxWframe').src='https://www.youtube.com/embed/'+id+'?autoplay=1&rel=0&playsinline=1'; document.getElementById('kxWplayer').classList.add('on'); save(id); }
  document.getElementById('kxWform').addEventListener('submit',function(e){ e.preventDefault(); var id=ytId(document.getElementById('kxWurl').value); if(!id){ if(window.kxAlert)kxAlert('Could not read a YouTube video ID from that link.','Invalid link'); return; } play(id); });
  function paintRec(){ var b=document.getElementById('kxWrec'); if(!b)return; b.innerHTML=recent().map(function(id){ return '<div class="rc" data-id="'+id+'"><img loading="lazy" src="https://i.ytimg.com/vi/'+id+'/mqdefault.jpg"><span>'+id+'</span></div>'; }).join(''); b.querySelectorAll('.rc').forEach(function(c){ c.onclick=function(){ play(c.dataset.id); }; }); }
  paintRec();
  window.kxOpenWatch=function(){ el.classList.add('on'); };
  function addTab(){ var tabs=document.querySelector('.nav-tabs'); if(!tabs||document.getElementById('watchTab'))return; var t=document.createElement('div'); t.className='nav-tab'; t.id='watchTab'; t.textContent='WATCH'; t.onclick=function(){ kxOpenWatch(); }; tabs.appendChild(t); }
  if(document.readyState!=='loading') addTab(); else document.addEventListener('DOMContentLoaded', addTab);
  setInterval(addTab, 1500);
})();
</script>`;

/* ---------- SolAuth-inspired theme: dark + violet, dot-grid + glow, glassy ---------- */
const solThemeJs = `<script>
(function(){
  var f=document.createElement('link'); f.rel='stylesheet'; f.href='https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'; document.head.appendChild(f);
  var s=document.createElement('style'); s.textContent=
    "body,button,input,textarea,select,.nav-tab{font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif!important}"+
    "body,#main-container{background:#08080c!important}"+
    ".kx-dotgrid{position:fixed;inset:0;z-index:0;pointer-events:none;background-color:#08080c;background-image:radial-gradient(circle at center,rgba(255,255,255,.10) 1px,transparent 1.4px);background-size:26px 26px;background-position:-13px -13px;-webkit-mask-image:radial-gradient(ellipse 85% 65% at 50% 28%,#000 40%,transparent 100%);mask-image:radial-gradient(ellipse 85% 65% at 50% 28%,#000 40%,transparent 100%)}"+
    ".kx-glow{position:fixed;border-radius:50%;filter:blur(120px);z-index:0;pointer-events:none;opacity:.55}"+
    ".kx-glow.a{width:520px;height:520px;background:radial-gradient(circle,rgba(124,58,237,.35),transparent 70%);top:-160px;left:-120px}"+
    ".kx-glow.b{width:460px;height:460px;background:radial-gradient(circle,rgba(88,28,135,.30),transparent 70%);bottom:-160px;right:-100px}"+
    "#main-container,.top-bar,.nav-tabs{position:relative;z-index:1}"+
    ".home-logo.kx-word,.logo.kx-word{font-family:'Plus Jakarta Sans',sans-serif!important;font-weight:800!important;letter-spacing:-.03em!important;background:linear-gradient(180deg,#fff,#c9b8ff)!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important}"+
    ".nav-tab{background:rgba(255,255,255,.04)!important;border:1px solid rgba(255,255,255,.08)!important;color:#a6a6bb!important;border-radius:11px!important}"+
    ".nav-tab:hover{color:#f5f5fa!important}"+
    ".nav-tab.active{background:linear-gradient(180deg,rgba(76,21,149,.75),rgba(59,10,99,.6))!important;color:#fff!important;border-color:rgba(167,139,250,.45)!important}"+
    "#kxLogin .card{background:linear-gradient(180deg,rgba(20,20,30,.94),rgba(12,12,20,.94))!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:22px!important;box-shadow:0 30px 80px rgba(0,0,0,.55)!important}"+
    "#kxLogin .card::before{background:radial-gradient(closest-side,rgba(139,92,246,.30),transparent)!important}"+
    "#kxLogin .brand{background:linear-gradient(180deg,#fff,#c9b8ff)!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important}"+
    "#kxLogin .primary{background:linear-gradient(180deg,#4c1595,#3b0a63)!important;border:1px solid rgba(167,139,250,.35)!important;color:#fff!important}"+
    "#kxLogin .toggle{color:#a78bfa!important}#kxLogin .stats .st b{color:#c9b8ff!important}"+
    "#kxLogin .card.ok{border-color:#8b5cf6!important;box-shadow:0 0 0 3px rgba(139,92,246,.3),0 30px 80px rgba(0,0,0,.55)!important}"+
    "#kxlLock .lk{color:#8b5cf6!important}#kxlLock .lbl{color:#a78bfa!important}"+
    ".search-box:focus{border-color:#8b5cf6!important;box-shadow:0 0 0 4px rgba(139,92,246,.15)!important}"+
    ".home-popular-wrap,#all-lessons{background:linear-gradient(180deg,rgba(18,18,28,.6),rgba(11,11,18,.6))!important;border:1px solid rgba(255,255,255,.07)!important}"+
    ".lesson-card{background:linear-gradient(180deg,#12121c,#0d0d14)!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:16px!important}"+
    ".lesson-card:hover{border-color:rgba(167,139,250,.5)!important;box-shadow:0 26px 60px -30px rgba(124,58,237,.45)!important}"+
    ".home-popular-wrap h2::after,#all-lessons h2::after,.section-title::after{background:rgba(167,139,250,.4)!important}"+
    "#kxLC .win{background:#08080c!important}#kxLC .side{background:#0d0d14!important}#kxLC .top{background:#0d0d14!important}#kxLC .feed{background:#08080c!important}#kxLC .bar{background:#0d0d14!important}"+
    "#kxLC .b.me{background:linear-gradient(180deg,#7c3aed,#6d28d9)!important}#kxLC .b.me:before{background:#6d28d9!important}#kxLC .b.me:after{background:#08080c!important}"+
    "#kxLC .b.them{background:#171722!important}#kxLC .b.them:before{background:#171722!important}#kxLC .b.them:after{background:#08080c!important}"+
    "#kxLC .bar button{background:linear-gradient(180deg,#7c3aed,#6d28d9)!important}#kxLC .bar input{background:#12121c!important}#kxLC .bar input:focus{border-color:#8b5cf6!important}"+
    "#kxLC .room.on{background:rgba(124,58,237,.2)!important;color:#c9b8ff!important;box-shadow:inset 3px 0 0 #8b5cf6!important}#kxLC .newroom{background:linear-gradient(180deg,#7c3aed,#6d28d9)!important}"+
    "#kxAdmin .win{background:linear-gradient(180deg,rgba(20,20,30,.95),rgba(12,12,20,.95))!important}#kxAdmin .tabs button.on{color:#a78bfa!important;border-bottom-color:#8b5cf6!important}#kxAdmin .gold{background:#7c3aed!important;border-color:#7c3aed!important}#kxAdmin .badge.a{background:#7c3aed!important}"+
    "#kxBC .card::before{background:linear-gradient(180deg,#a78bfa,#7c3aed)!important}#kxBC .lbl{color:#a78bfa!important}#kxBC .txt{text-shadow:0 2px 30px rgba(124,58,237,.45)!important}"+
    "#kxWatch button.play{background:#7c3aed!important}#kxWatch input:focus{border-color:#8b5cf6!important}#kxWatch .rc:hover{border-color:#8b5cf6!important}"+
    "#kxInter .kx-sb:focus-within{border-color:#8b5cf6!important}#kxInter .kx-chip:hover{border-color:#8b5cf6!important}#kxInter .kx-sgi.sel,#kxInter .kx-sgi:hover{background:rgba(124,58,237,.15)!important}#kxInter .kx-mode.on{color:#a78bfa!important;border-color:rgba(167,139,250,.4)!important;background:rgba(124,58,237,.1)!important}"+
    "#kxDlg .ok,#settings-section .kxs-btn.solid,.kxs-sw input:checked+.tr{background:#7c3aed!important}"+
    "::selection{background:rgba(139,92,246,.35)!important;color:#fff!important}";
  document.head.appendChild(s);
  function bg(){ if(document.querySelector('.kx-dotgrid'))return; ['b','a','dotgrid'].forEach(function(k){ var d=document.createElement('div'); d.className=k==='dotgrid'?'kx-dotgrid':'kx-glow '+k; document.body.insertBefore(d, document.body.firstChild); }); }
  if(document.readyState!=='loading')bg();else document.addEventListener('DOMContentLoaded',bg);
})();
</script>`;

/* ---------- SolAuth-style layout: left sidebar app shell ---------- */
const sidebarJs = `<script>
(function(){
  function build(){
    if(document.getElementById('kxSidebar')) return;
    if(!document.querySelector('.nav-tabs')) return setTimeout(build,300);
    var sb=document.createElement('aside'); sb.id='kxSidebar';
    sb.innerHTML=
      '<div class="kxsb-brand"><div class="kxsb-logo">K</div><div class="kxsb-bt">Kryzixs<span>Hub</span></div></div>'+
      '<div class="kxsb-sec">Menu</div>'+
      '<button class="kxsb-item on" data-a="games"><span class="ic">🎮</span>Games</button>'+
      '<button class="kxsb-item" data-a="watch"><span class="ic">▶</span>Watch</button>'+
      '<button class="kxsb-item" data-a="proxy"><span class="ic">🌐</span>Proxy</button>'+
      '<button class="kxsb-item" data-a="chat"><span class="ic">💬</span>Live Chat</button>'+
      '<div class="kxsb-sec">Account</div>'+
      '<button class="kxsb-item" data-a="settings"><span class="ic">⚙</span>Settings</button>'+
      '<button class="kxsb-item" id="kxsbAdmin" data-a="admin" style="display:none"><span class="ic">🛠</span>Admin<span class="kxsb-badge">STAFF</span></button>'+
      '<button class="kxsb-item" data-a="logout"><span class="ic">⎋</span>Sign out</button>'+
      '<div class="kxsb-spacer"></div>'+
      '<div class="kxsb-bottom"><div class="kxsb-acct"><div class="kxsb-av" id="kxsbAv">?</div><div class="kxsb-who"><div class="kxsb-nm" id="kxsbNm">Guest</div><div class="kxsb-rl" id="kxsbRl">not signed in</div></div></div></div>';
    document.body.appendChild(sb);
    var burger=document.createElement('button'); burger.id='kxBurger'; burger.innerHTML='☰'; burger.onclick=function(){ sb.classList.toggle('open'); }; document.body.appendChild(burger);
    sb.querySelectorAll('.kxsb-item').forEach(function(b){ b.onclick=function(){
      var a=b.dataset.a; sb.classList.remove('open');
      if(a==='logout'){ if(window.kxLogout) kxLogout(); return; }
      if(a==='games'||a==='settings') sb.querySelectorAll('.kxsb-item').forEach(function(x){ x.classList.toggle('on', x===b); });
      if(a==='games'){ if(typeof switchTab==='function') switchTab('lessons'); }
      else if(a==='settings'){ if(typeof switchTab==='function') switchTab('settings'); }
      else if(a==='watch'){ if(window.kxOpenWatch) kxOpenWatch(); }
      else if(a==='proxy'){ if(window.openInter) openInter(); }
      else if(a==='chat'){ if(window.kxOpenChat) kxOpenChat(); }
      else if(a==='admin'){ if(window.kxOpenAdmin) kxOpenAdmin(); }
    }; });
    paint();
  }
  function paint(){
    var u=(window.kxSession&&kxSession())||''; var adm=(window.kxIsAdmin&&kxIsAdmin());
    var nm=document.getElementById('kxsbNm'), rl=document.getElementById('kxsbRl'), av=document.getElementById('kxsbAv'), ad=document.getElementById('kxsbAdmin');
    if(nm) nm.textContent=u||'Guest'; if(rl) rl.textContent=u?(adm?'Admin':'Member'):'not signed in'; if(av) av.textContent=(u||'?').slice(0,2).toUpperCase();
    if(ad) ad.style.display=adm?'flex':'none';
  }
  var css=document.createElement('style'); css.textContent=
    '#kxSidebar{position:fixed;top:0;left:0;bottom:0;width:250px;background:#0d0d14;border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;padding:20px 14px;z-index:100001;font-family:\\'Plus Jakarta Sans\\',sans-serif}'+
    '#kxSidebar .kxsb-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 18px;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,.06)}'+
    '#kxSidebar .kxsb-logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(160deg,#4c1595,#1a1030);border:1px solid rgba(255,255,255,.12);display:grid;place-items:center;font-weight:800;color:#c9b8ff}'+
    '#kxSidebar .kxsb-bt{font-size:18px;font-weight:800;letter-spacing:-.3px;color:#fff}#kxSidebar .kxsb-bt span{color:#a78bfa}'+
    '#kxSidebar .kxsb-sec{font-size:10.5px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6b6b80;padding:16px 10px 8px}'+
    '#kxSidebar .kxsb-item{display:flex;align-items:center;gap:11px;width:100%;padding:11px 12px;border-radius:11px;border:0;background:transparent;color:#a6a6bb;font-size:14px;font-weight:600;cursor:pointer;text-align:left;position:relative;font-family:inherit;transition:.15s}'+
    '#kxSidebar .kxsb-item .ic{width:20px;text-align:center;font-size:15px}'+
    '#kxSidebar .kxsb-item:hover{background:#171722;color:#fff}'+
    '#kxSidebar .kxsb-item.on{background:linear-gradient(180deg,rgba(76,21,149,.55),rgba(59,10,99,.45));color:#fff}'+
    '#kxSidebar .kxsb-item.on::before{content:"";position:absolute;left:-14px;top:50%;transform:translateY(-50%);width:3px;height:22px;border-radius:0 3px 3px 0;background:#a78bfa}'+
    '#kxSidebar .kxsb-badge{margin-left:auto;font-size:9px;font-weight:800;background:#7c3aed;color:#fff;padding:2px 6px;border-radius:20px}'+
    '#kxSidebar .kxsb-spacer{flex:1}'+
    '#kxSidebar .kxsb-bottom{border-top:1px solid rgba(255,255,255,.06);padding-top:12px;margin-top:8px}'+
    '#kxSidebar .kxsb-acct{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:11px;background:#12121c;border:1px solid rgba(255,255,255,.06)}'+
    '#kxSidebar .kxsb-av{width:32px;height:32px;border-radius:9px;background:linear-gradient(160deg,#4c1595,#3b0a63);display:grid;place-items:center;font-weight:800;color:#fff;font-size:12px}'+
    '#kxSidebar .kxsb-nm{font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}#kxSidebar .kxsb-rl{font-size:11px;color:#6b6b80}'+
    '#kxBurger{display:none;position:fixed;top:14px;left:14px;z-index:100002;width:42px;height:42px;border-radius:11px;background:#12121c;border:1px solid rgba(255,255,255,.14);color:#fff;font-size:18px;cursor:pointer}'+
    '.nav-tabs{display:none!important}.top-bar{display:none!important}'+
    'body #main-container{margin-left:250px!important;min-height:100vh}'+
    '@media(min-width:901px){#kxLC,#kxInter,#kxWatch{left:250px!important}}'+
    '@media(max-width:900px){#kxSidebar{transform:translateX(-100%);transition:transform .22s;box-shadow:0 0 60px rgba(0,0,0,.6)}#kxSidebar.open{transform:none}body #main-container{margin-left:0!important;padding-top:64px!important}#kxBurger{display:grid;place-items:center}}';
  document.head.appendChild(css);
  if(document.readyState!=='loading') build(); else document.addEventListener('DOMContentLoaded', build);
  setInterval(function(){ build(); paint(); }, 1500);
})();
</script>`;

injects.push(perfCss, bgKillJs, adminAnnCss, gameWarnJs, watchJs, solThemeJs, sidebarJs);
if (CHITTER) injects.push(chitterCss);
html = html.replace(/<\/body>/i, injects.join('\n') + '\n</body>');

// Retitle so it reads as the clean hub, not the ad-y original
html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + (CHITTER ? 'Chitter' : 'KryzixsHub 1.1') + '</title>');

// rebrand the visible wordmark everywhere
if (CHITTER) {
  html = html.replace(/Your games, unblocked\. Sign in and play\./g, 'Games + chat with your friends.');
  html = html.replace(/KryzixsDEX/g, 'Chitter');
} else {
  html = html.replace(/KryzixsDEX/g, 'KryzixsHub 1.1');
}

/* ---------- scrub every remaining "Noah" -> "Kryzixs" (but KEEP the game asset
   URLs, which literally point at the NoahsAmazingTutoringHelp GitHub repo) ---------- */
const KEEP = ['NoahsAmazingTutoringHelp', 'Noahs-Calculus-Tutor', 'noahs-tutoring-hub', 'noahs-calculus-tutor', '@noahstutoringhub', 'noahstutoringhub'];
KEEP.forEach(function (t, i) { html = html.split(t).join(' K' + i + ' '); });
html = html.replace(/Noahs/g, 'Kryzixs').replace(/noahs/g, 'kryzixs').replace(/NOAHS/g, 'KRYZIXS')
           .replace(/Noah/g, 'Kryzixs').replace(/noah/g, 'kryzixs').replace(/NOAH/g, 'KRYZIXS');
KEEP.forEach(function (t, i) { html = html.split(' K' + i + ' ').join(t); });

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + '  (' + (html.length/1024).toFixed(1) + ' KB)');

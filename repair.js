// One-off: a text pass double-encoded every multi-byte glyph in build.js.
// Rewrite the affected lines with \u escapes so no future pass can break them.
const fs = require('fs');
const p = 'build.js';
const L = fs.readFileSync(p, 'utf8').split('\n');

const set = (n, text) => { L[n - 1] = text; };

set(247, `        <button class="burger" onclick="document.getElementById('side').classList.toggle('open')">&#9776;</button>`);
set(358, `    '</div><div class="fr"><div class="veil2" id="veil2">Loading '+a.name+'...</div>'+`);
set(361, `    '<div class="note2"><b>If this stays blank</b>, the site refused to be embedded. Most big sites send '+`);
set(368, `  try{ v.textContent='Loading '+new URL(u).hostname+'...'; }catch(e){}`);
set(379, `    '</div><div class="fr"><div class="veil2" id="veil2">Loading...</div>'+`);
set(409, `    '<div class="card"><h4>Apps</h4><p class="sub">Anything with a URL &mdash; your VPS Android screen, a game site, a doc. It gets its own sidebar entry and opens in a frame.</p>'+`);
set(421, `    '<div class="note2"><b>This gate is not security.</b> The PIN and the balance live in your browser, so anyone with devtools can change both. It keeps a friend out of your account on a shared laptop &mdash; that is all it is for.</div></div>';`);

set(476, `  let html = g('Casino', [['home','All games','\\u25A6'],['crash','Crash','\\u2197'],['mines','Mines','\\u273B'],`);
set(477, `      ['limbo','Limbo','\\u25B3'],['keno','Keno','\\u25C9'],['beef','Beef','\\u2B16'],['blackjack','Blackjack','\\u2660']]);`);
set(478, `  html += g('Arcade', [['snake','Snake','\\u2307'],['tetris','Tetris','\\u25A4'],['breakout','Breakout','\\u25AC'],`);
set(479, `      ['g2048','2048','\\u25A7'],['minesweeper','Minesweeper','\\u2691'],['pong','Pong','\\u25D1'],['ttt','Tic Tac Toe','\\u229E']]);`);
set(480, `  html += g('Apps', [['browser','Browser','\\u25CD']].concat(apps.map(a=>['app:'+a.id, esc(a.name), '\\u25AD'])));`);
set(481, `  html += g('Account', [['stats','My Stats','\\u25D4'],['admin', isAdmin()?'Admin \\u2022':'Admin', '\\u2699']]);`);

set(594, `  rb.onclick=()=>{ rb.disabled=true; rb.textContent='Reloading...';`);

fs.writeFileSync(p, L.join('\n'), 'utf8');

// Verify nothing double-encoded survives.
const bad = fs.readFileSync(p, 'utf8').match(/Ã¢|â|Â[-¿]/g);
console.log(bad ? 'STILL BROKEN: ' + bad.length : 'clean');

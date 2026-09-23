"""Build KryzixsHub-NoProxy.html from KryzixsHub-New.html with every trace of the web proxy removed.
Run:  python build_noproxy.py   (re-run after editing KryzixsHub-New.html)"""
import re

s = open('KryzixsHub-New.html', encoding='utf-8').read()

def cut(start, end, incl_end=False):
    # removes from `start` up to the NEXT occurrence of `end` after it
    global s
    a = s.index(start); b = s.index(end, a + len(start))
    s = s[:a] + s[b + (len(end) if incl_end else 0):]

# CSS block, nav button, page markup, JS block
cut('  /* ===== proxy ===== */', '  /* ===== ')
s = re.sub(r'\s*<button class="nav-item" data-p="proxy">.*?</button>', '', s, count=1, flags=re.S)
cut('      <div class="page" id="pgProxy">', '      <div class="page" id=')
cut('  /* ---- PROXY ---- */', '  /* ---- ')
s = s.replace("proxy:'Proxy',", '')

# proxy worker constant and every fallback that used it
s = s.replace(", WORKER='https://kryzixshomework.fnjudo8.workers.dev/?url='", '')
# thumbnails: skip the proxied-image step
s = re.sub(r"\n    if\(!img\.dataset\.triedProxy.*?\n    }", '', s, count=1, flags=re.S)
# games opened directly: no proxied retry after timeout
s = re.sub(r"gvTimer=setTimeout\(function\(\)\{\n        if\(seq!==loadSeq\) return;\n        fetch\(WORKER.*?\}, 12000\);",
           "gvTimer=setTimeout(function(){ if(seq===loadSeq) markDead(g); }, 12000);", s, count=1, flags=re.S)
# fetched games: last step is marking dead instead of the proxy
s = s.replace("attemptLoad(WORKER + encodeURIComponent(u), function(){ markDead(g); });", "markDead(g);")
s = s.replace('<link rel="preconnect" href="https://kryzixshomework.fnjudo8.workers.dev">', '')

left = [w for w in ('WORKER', 'kryzixshomework', 'pgProxy', 'pframe', 'data-p="proxy"', 'kxProxyUrl') if w in s]
assert not left, 'proxy leftovers: %s' % left
for keep in ('pgSettings', '/* ---- SETTINGS', 'pgChat', 'pgWatch'):
    assert keep in s, 'build removed too much: ' + keep
open('KryzixsHub-NoProxy.html', 'w', encoding='utf-8').write(s)
print('wrote KryzixsHub-NoProxy.html', len(s))

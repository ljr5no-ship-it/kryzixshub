# KryzixsHub

A static two-file site: a **Solana decoy** landing page that gates the real **KryzixsHub** dashboard behind an access code.

## Files

| Path | What it is |
|---|---|
| `index.html` | Solana-branded decoy landing page (live SOL price from CoinGecko). Footer has an **Admin** link. |
| `kryzixshub.html` | The real hub (games, chat, tools). Talks to the Cloudflare Worker at `kryzixs-chat.fnjudo8.workers.dev`. |
| `src/KryzixsHub-New.html` | Editable hub **source** (has the dev proxy). Edit this, not the built file. |
| `src/build_noproxy.py` | Strips the proxy → regenerates the deployable hub. |

## How the gate works

1. Visitor sees a normal Solana marketing page. Nothing unusual on load.
2. Click **Admin** in the footer → modal asks for an access code.
3. Code is checked by SHA-256 (only the hash is in the source, never the plaintext):
   `244bef9a63ec090dadfca4fceabccbeef5b0a6b728371c4002c785358ec5f384`
4. Correct code (**`kryzixs`**) → opens the hub in a fresh `about:blank` tab (iframe cloaker, so the URL bar shows `about:blank`), and sends the original tab to `https://solana.com/`.
5. Inside that tab, a tiny **`src`** link (bottom-left) downloads the hub as a base64 `data:` file (`hub.html`) — works offline and bypasses URL-based filters. Save it and open locally.

Unlock state is never persisted — every visit needs the code.

## Editing the hub

```bash
# edit src/KryzixsHub-New.html, then:
cd src
python build_noproxy.py        # writes ../kryzixshub.html  (byte-for-byte deployable)
```

Commit and push — the site redeploys automatically (see below).

## Deploy

### GitHub Pages (automatic)
`.github/workflows/pages.yml` publishes the repo root on every push to `main`.
Enable once: **Settings → Pages → Source: GitHub Actions**. Live at
`https://<user>.github.io/kryzixshub/`.

### Cloudflare Pages (recommended — no bandwidth cap)
Connect the repo in the Cloudflare dashboard, or:
```bash
npm i -g wrangler
wrangler pages deploy . --project-name kryzixshub
```

Both serve the two HTML files as-is; no build step for the site itself.

## Notes
- Access code: **`kryzixs`** (change it by replacing the SHA-256 hash in `index.html`).
- The hub's chat/auth backend is the Worker `kryzixs-chat.fnjudo8.workers.dev` (external, already live).
- Guests are labelled **User_XXXX** (renamed from Guest).

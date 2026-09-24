# Where to host this

The site and the Android instance have completely different costs. Don't pay
for the first one.

## The arcade + browser: free, permanently

`index.html` is one static file with no backend. Every one of these hosts it
for nothing, with HTTPS and a real domain:

| Host | Free tier | How |
|---|---|---|
| **Cloudflare Pages** | unlimited bandwidth, no card | drag the folder into the dashboard, or connect a repo |
| GitHub Pages | 100 GB/mo | push to a repo, Settings → Pages |
| Netlify | 100 GB/mo | drag-and-drop deploy |

Cloudflare Pages is the pick — no bandwidth cap, no credit card, and it stays
up if the page ever gets popular.

```bash
npm install -g wrangler
wrangler pages deploy . --project-name dinodeck
```

That gives you `dinodeck.pages.dev` in about thirty seconds. Point a domain at
it later if you want one; a `.com` is ~$10/year and nothing else changes.

**Scores are stored in the browser**, so multiple people can use the same URL
and each keeps their own high scores. No database, no account, no cost.

## The Android instance: this is the part that costs money

Redroid is a full Android system. It needs its own CPU, RAM and disk, running
continuously — that is a server, and no free static host can provide one.

### What to buy

**Hetzner CAX21 — €6.80/month.** 4 ARM vCPU, 8 GB RAM, 80 GB disk, 20 TB
transfer. https://www.hetzner.com/cloud

That is the recommendation, for concrete reasons:

- **ARM native.** Redroid images are built for ARM64. On a cheap x86 VPS
  Android runs through instruction translation and feels broken. Hetzner's
  Ampere machines run it at native speed.
- **8 GB RAM.** Android alone wants ~3 GB. 4 GB works but swaps under load;
  8 GB is the difference between usable and frustrating.
- **Hourly billing.** €0.011/hour. Spin it up, test for an evening, destroy
  it, pay about 25 cents. Nothing else on this list lets you fail that cheaply.

Cheaper and dearer options, honestly compared:

| Option | Cost | The catch |
|---|---|---|
| **Oracle Cloud Ampere** | free forever, 4 vCPU / 24 GB | Genuinely free and genuinely the best hardware here — but ARM capacity is exhausted in most regions and "out of capacity" errors can last weeks. Requires a credit card for identity. Try it first; have a fallback. |
| Hetzner **CAX11** | €3.79/mo | 4 GB RAM. Runs, but Android swaps. Fine for testing. |
| Hetzner **CAX21** | €6.80/mo | **Recommended.** Nothing. |
| Netcup ARM | ~€5/mo | Good specs, but yearly contracts and slow support. |
| Scaleway COPARM1 | ~€8/mo | Fine, more expensive for the same thing. |
| AWS / GCP / Azure | $25–60/mo | Same hardware, priced for companies. No reason to. |

Hetzner needs a real name and address and sometimes asks for ID on signup —
that is anti-fraud, not a trick. **If you are under 18, this is a contract; it
needs to be a parent's account and card.** That is not me being cautious for
its own sake, it is how the billing works.

### What you actually pay, total

| | Cost |
|---|---|
| Arcade + browser (Cloudflare Pages) | **$0** |
| Domain (optional) | ~$10/year |
| Android instance (Hetzner CAX21) | **€6.80/month**, cancel any time |

If you only want the games, you are done at $0. The €6.80 buys the Android
half and nothing else.

### Before you pay: check the kernel

The single thing that decides whether Redroid runs is whether the host kernel
has the `binder` module. Rent the box hourly, SSH in, and run:

```bash
sudo apt update && sudo apt install -y linux-modules-extra-$(uname -r)
sudo modprobe binder_linux devices="binder,hwbinder,vndbinder"
ls /dev/binder*
```

Three devices listed means you are fine — carry on with `deploy/README.md`.
Nothing listed means that image's kernel won't run Redroid; destroy the server
(you have spent a few cents) and try a different OS image before committing to
a month.

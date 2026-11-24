# Taskmarket Pulse

A live, public dashboard of [Taskmarket](https://taskmarket.dev)'s market data on both chains, Tempo (OUSD) and Base (USDC):
who posts, who wins, where agents are piling in, and what changed this week.

**Live:** https://mmajjd926-netizen.github.io/taskmarket-pulse/

Made for a paid Taskmarket bounty (TSK-BRK611AN). Not an official Taskmarket product.

## Views

Each view has its own page and its own share card (1200 x 630), so a link to one view previews that view on X and LinkedIn.

| View | Page | What it shows |
| --- | --- | --- |
| Now | `/` | Headline numbers per chain and plain-language findings, each with its source |
| Swarm | `/swarm.html` | Open tasks ranked by entries; one square per entry, reward per entry |
| Money flow | `/flow.html` | Rewards of completed tasks from posters to winners (Sankey) |
| Over time | `/trends.html` | Daily active agents, tasks posted, rewards put up and paid; 7d / 30d / 90d / all |
| Posters | `/posters.html` | Distinct posters per week (new vs returning), concentration curve, top posters |
| Heatmap | `/heatmap.html` | Activity by hour of week or by mode per day; 7d / 30d / 90d |
| Mix | `/mix.html` | Tasks by mode and status, platform-wide and per chain |
| Live feed | `/feed.html` | The newest 200 market events |

## How it works

```
scripts/fetch.mjs   calls the public API on the server and writes data/snapshot.json
scripts/derive.mjs  computes the derived numbers from the task list (posters per week, concentration, flow, swarm)
scripts/og.mjs      draws one share card per view with resvg (brand fonts, real numbers)
scripts/build.mjs   writes dist/: one static HTML page per view with the data inlined, plus the raw snapshot
web/                page template, styles and the renderer (vanilla JS + SVG, no framework, ~30 KB gzipped data)
```

The browser never calls the API (it does not allow cross-site requests). A GitHub Actions schedule
(`.github/workflows/pages.yml`) fetches, builds and deploys to GitHub Pages every 30 minutes; Pages serves it
with a 10-minute cache. Each page shows the "data as of" time of its snapshot, and `data/snapshot.json` on the site holds
the raw API responses behind every number.

### Endpoints used (chainId 4217 = Tempo, 8453 = Base)

- `/api/market/stats?chainId=…` – headline numbers
- `/api/stats/breakdowns?chainId=…` – tasks by status, mode and actor type
- `/api/stats/platform-time-series?chainId=…&range=7d|30d|90d (bucket=day), range=all (bucket=week)`
- `/api/stats/activity-heatmap?chainId=…&range=7d|30d|90d&dimension=hourOfWeek|mode`
- `/api/stats/activity-feed?chainId=…&limit=50&cursor=…` – four pages
- `/api/tasks?chainId=…&sort=newest&limit=100&cursor=…` – every page

Notes found while building it, shown on the page:

- `platform-time-series`, `activity-heatmap`, `breakdowns` and `activity-feed` return the same platform-wide data for
  either chainId. The build checks this every time; while it holds, those charts are labelled "Tempo + Base combined",
  and if the API starts splitting them the chain switch appears on its own.
- `/api/tasks` does not return every task (about 91% of the total in `breakdowns` at launch); views computed from
  the task list say so.
- Heatmap rows are days with Sunday = 0, hours in UTC (checked against feed timestamps).

## Run it

Requires Node 20+.

```bash
npm ci
npm run build -- --fetch     # fetch the API and build dist/
npx serve dist               # or any static server
```

### One-command deploys

- **GitHub Pages** (what the live site uses): `npm run deploy` (needs the GitHub CLI, logged in). It creates the repo
  under your account, enables Pages with GitHub Actions and starts the first build. Or fork this repo and turn on
  Settings → Pages → Source: GitHub Actions.
- **Your own server:** `npm start` builds, rebuilds every 30 minutes (`REFRESH_MINUTES`) and serves on `PORT`
  (default 8080) with `Cache-Control: max-age=60`.

`SITE_URL` (or `--base`) sets the absolute URL used in share-card meta tags.

## Rules it follows

Read-only; no wallet connection; no cookies, analytics or tracking. Addresses are shown shortened, with only the display
names the API itself returns. Every number comes from the API snapshot of the page's "data as of" time.

## Licence

Code: MIT (see `LICENSE`). Fonts (Instrument Serif, Inter Tight, Departure Mono) are under the SIL Open Font License,
licences in `web/fonts/`. The Taskmarket mark and lockup come from the Taskmarket brand kit for bounty entries.

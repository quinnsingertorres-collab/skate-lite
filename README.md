# Skate Lite

![Skate Lite](screenshot.png)

An unofficial, Vercel-deployable take on the MBTA's [Skate](https://github.com/mbta/skate) route ladders. It is built only on MBTA public data. It doesn't need Elixir, Postgres, or credentials.

## Features

- Route picker covering local, frequent, commuter and coverage bus routes (rail-replacement shuttles are excluded)
- Route ladders with live buses placed between timepoints, just like Skate: direction 0 on the right rail heading up, direction 1 on the left heading down, with ⇅ Reverse
- Bus panel with status, next stop, crowding, trip, and a map showing the route shape
- Search by bus number
- Selected routes are remembered and saved in the URL (`?r=28,23`), so links can be shared

## Data sources

| Data | Source | When |
|---|---|---|
| Routes, timepoints, stop order, shapes | `https://cdn.mbta.com/MBTA_GTFS.zip` | At build time (`scripts/build-data.mjs` → `public/data/`) |
| Live bus positions | `https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json` | `/api/vehicles`, cached 10s at the edge, polled every 10s |
| Map tiles | OpenStreetMap | Browser |

| Early/late, headsign, run, block (optional) | Swiftly real-time vehicles API, if `SWIFTLY_API_KEY` is set | Same `/api/vehicles` call, merged by vehicle ID |

With a Swiftly key, buses are colored the way Skate colors them: red for early (more than 1 minute ahead), green for on time, and blue for late (more than 6 minutes behind). The panel then shows adherence, run and block. The key only ever lives on the server, and the 10-second edge cache means Swiftly is called at most about 6 times a minute however many people have the page open.

**Not included:** operator names, ghost buses, swings, and detours. That data is MBTA-internal.

## Deploy on Vercel

1. Import the GitHub repo in Vercel.
2. Deploy. The framework is detected as Next.js, and the defaults work. `npm run build` runs `prebuild` first, which downloads GTFS and writes `public/data/`.

The schedule data is refreshed on every deploy. MBTA updates GTFS a few times a month, so redeploy occasionally, or set up a Vercel Deploy Hook on a schedule.

Environment variables (see `.env.example`):

- `SWIFTLY_API_KEY` (optional) turns on early/late, run and block. Add it in Vercel under Settings → Environment Variables for Production and Preview, then redeploy.
- `SWIFTLY_AGENCY` (default `mbta`) or `SWIFTLY_VEHICLES_URL` sets which Swiftly feed to read.
- `GTFS_URL` and `VEHICLES_URL` point at other MBTA feeds.

If the header shows `Swiftly: error 401` or `error 404`, the key or agency is wrong.

## Run locally

```shell
npm install
npm run dev
```

The build step also runs automatically in `npm run build`. For `npm run dev`, run `npm run data` once first to create `public/data/`.

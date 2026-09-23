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

**Not included:** operator names, runs and blocks, schedule adherence (late/early), ghost buses, swings, and detours. That data is MBTA-internal.

## Deploy on Vercel

1. Import the GitHub repo in Vercel.
2. Deploy. The framework is detected as Next.js, and the defaults work. `npm run build` runs `prebuild` first, which downloads GTFS and writes `public/data/`.

The schedule data is refreshed on every deploy. MBTA updates GTFS a few times a month, so redeploy occasionally, or set up a Vercel Deploy Hook on a schedule.

Optional environment variables: `GTFS_URL` and `VEHICLES_URL` to point at other feeds.

## Run locally

```shell
npm install
npm run dev
```

The build step also runs automatically in `npm run build`. For `npm run dev`, run `npm run data` once first to create `public/data/`.

# Skate Lite

![Skate Lite](screenshot.png)

An unofficial, Vercel-deployable take on the MBTA's [Skate](https://github.com/mbta/skate) route ladders. It is built only on MBTA public data. It doesn't need Elixir, Postgres, or credentials.

## Features

Styled after Skate's own UI, with a bottom nav on phones.

- **Route Ladders:** live buses placed between timepoints and colored by schedule adherence (red late, green on time, blue early), with schedule lines showing where each bus should be. Each route has a ⋮ menu, Reverse, and Show riders (crowding %).
- **Tabs and presets:** a tab bar (＋ for new tabs, save icon to name and save a set of routes as a preset, double-click a tab to rename) and a Presets tab in the route picker (open, rename, delete). Stored in your browser.
- **Route variations:** like Skate, ladders merge the timepoints of every route pattern (e.g. school trips to Medford High on the 94/95/101/134), the pattern's variant shows inside each bus triangle, and the panel shows it as `101_2` with the pattern description ("School days only").
- **Late View:** buses more than 6 minutes late, for your routes or all routes.
- **Search Map:** every live bus on a map, searchable by bus number, block, run, or route.
- **Properties panel:** direction, headsign, adherence, run, block, trip, crowding, next stop, and a map. **Upcoming stops** lists the rest of the trip with live predicted times (MBTA TripUpdates feed), plus scheduled time and how far off it is at timepoints. The **Block** tab is Skate's minischedule: every trip in the bus's block today, the current trip expanded into timepoints with scheduled times, and past trips behind a toggle. Block IDs come from the MBTA schedule (GTFS `trips.txt`), with an MBTA V3 API lookup for trips added after the build.
- **Schedule adherence** is computed from MBTA's public GTFS schedule, so colors work without Swiftly. With `SWIFTLY_API_KEY` set, Swiftly's adherence, runs, and blocks are used instead.

This is original code written to resemble Skate. None of Skate's source, styles, or icons are copied; Skate itself is AGPL-3.0.

## Data sources

| Data | Source | When |
|---|---|---|
| Routes, timepoints, stop order, shapes | `https://cdn.mbta.com/MBTA_GTFS.zip` | At build time (`scripts/build-data.mjs` → `public/data/`) |
| Live bus positions | `https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json` | `/api/vehicles`, cached 10s at the edge, polled every 10s |
| Map tiles | OpenStreetMap (muted with a CSS filter to resemble Skate's basemap) | Browser |

| Early/late, headsign, run, block (optional) | Swiftly real-time vehicles API, if `SWIFTLY_API_KEY` is set | Same `/api/vehicles` call, merged by vehicle ID |

With a Swiftly key, buses are colored red for late (more than 6 minutes behind), green for on time, and blue for early (more than 1 minute ahead). The panel then shows adherence, run and block. The key only ever lives on the server, and the 10-second edge cache means Swiftly is called at most about 6 times a minute however many people have the page open.

**Not included:** operator names, ghost buses, swings, and detours. That data is MBTA-internal.

## Sign-in and accounts

Every page and data request requires signing in with an **ID number and password**.

- **You (admin)** sign in with `ADMIN_ID` / `ADMIN_PASSWORD` from the environment and get an **Admin** link in the top bar (`/admin`).
- In the admin panel you **create ID numbers** (random 6-digit, or pick your own) and give one to each person.
- The person opens the site, chooses **Set up your account**, enters their ID and picks a password. The account is then **waiting for approval**.
- You **approve** (or reject) it in the admin panel. After that they can sign in. You can also disable, re-enable, reset a password (the person sets a new one and needs approval again), rename, or delete.

Security: passwords are hashed with scrypt; sessions are signed, HTTP-only cookies (30 days); an ID locks for 15 minutes after 5 wrong attempts; disabling or resetting an account signs that person out within 15 minutes.

Setup on Vercel:
1. **Storage**: connect an Upstash Redis database to this project (a new free one, or an existing one: every key sk8 lite writes starts with `sk8lite:`, so it can share a database safely). That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Optional: `DB_KEY_PREFIX` changes the prefix.
2. **Settings → Environment Variables**: add `AUTH_SECRET` (32+ random characters, e.g. `openssl rand -base64 48`), `ADMIN_ID` (digits) and `ADMIN_PASSWORD` (8+ characters).
3. Redeploy.

## Deploy on Vercel

1. Import the GitHub repo in Vercel.
2. Deploy. The framework is detected as Next.js, and the defaults work. `npm run build` runs `prebuild` first, which downloads GTFS and writes `public/data/`.

The schedule data is refreshed on every deploy. MBTA updates GTFS a few times a month, so redeploy occasionally, or set up a Vercel Deploy Hook on a schedule.

Environment variables (see `.env.example`):

- `SWIFTLY_API_KEY` (optional) turns on early/late, run and block. Add it in Vercel under Settings → Environment Variables for Production and Preview, then redeploy.
- `SWIFTLY_AGENCY` (default `mbta`) or `SWIFTLY_VEHICLES_URL` sets which Swiftly feed to read.
- `GTFS_URL` and `VEHICLES_URL` point at other MBTA feeds.

If the header shows `Swiftly 401`, `403` or `404`, open `/api/swiftly-check` on your site. It tries several Swiftly requests with your key and lists each one's status code and Swiftly's message (the key itself is never shown). On a 403 the app automatically retries without Skate's `unassigned`/`verbose` options.

## Run locally

```shell
npm install
npm run dev
```

The build step also runs automatically in `npm run build`. For `npm run dev`, run `npm run data` once first to create `public/data/`.

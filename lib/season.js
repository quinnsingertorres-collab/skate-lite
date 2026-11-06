// Runs, the operator roster and operator schedules belong to one MBTA schedule season
// ("Fall 2026"). When a deploy brings in a new season's schedule, they're cleared.
import { dbConfigured, k, redis } from "@/lib/db";
import { load } from "@/lib/adherence";

export const SEASON_KEYS = () => [k("rundefs"), k("roster"), k("opsched")];
export const currentSeason = () => load()?.rating || "";

let checked = { at: 0, season: null };
/** Clears season data if the stored season differs from the schedule this build uses. */
export async function ensureSeason() {
  const season = currentSeason();
  if (!season || !dbConfigured()) return season;
  if (checked.season === season && Date.now() - checked.at < 60000) return season;
  const stored = await redis("GET", k("season")).catch(() => null);
  if (stored !== season) {
    // First time (nothing stored): keep what's there. A different season: start fresh.
    if (stored) await redis("DEL", ...SEASON_KEYS());
    await redis("SET", k("season"), season);
  }
  checked = { at: Date.now(), season };
  return season;
}

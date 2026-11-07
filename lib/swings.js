// Swings: where one run ends partway through a block and another run takes over the same bus
// (the operator "swings off" and a relief operator "swings on"). Worked out from the runs people
// build from the public schedule, so a swing only shows once both runs on the block exist.
import { load, serviceBase } from "@/lib/adherence";
import { blocksOnDate } from "@/lib/ghosts";
import { pieces, runFor } from "@/lib/runs";

function lastTimepointName(idx, t) {
  const [, , cps] = t;
  for (let i = cps.length - 1; i >= 0; i--) if (cps[i] >= 0) return idx.cpNames?.[cps[i]] || idx.cps[cps[i]];
  return null;
}
function routeOf(idx, t) {
  const pat = t[3] >= 0 ? idx.strs[t[3]] : "";
  return /^(.*)-(.)-(\d)$/.exec(pat)?.[1] || null;
}

const cache = new Map(); // date -> { defs, list }
/** Every swing on a service date, in time order. */
export function swingsOn(date, defs) {
  const hit = cache.get(date);
  if (hit && hit.defs === defs) return hit.list;
  const idx = load();
  const list = [];
  if (idx && defs.length) {
    const base = serviceBase(date);
    const wanted = new Set(defs.flatMap((d) => pieces(d).map((p) => p.block)));
    for (const [block, trips] of blocksOnDate(date)) {
      if (!wanted.has(block)) continue;
      let prev = null, prevRun = null;
      for (const x of trips) {
        const run = runFor(defs, block, x.t[1][0], x.id);
        if (prev && prevRun && run && prevRun.id !== run.id) {
          const offSecs = prev.t[1];
          list.push({
            id: `${date}-${block}-${x.id}`,
            date,
            block,
            route: routeOf(idx, prev.t),
            onRoute: routeOf(idx, x.t),
            offTrip: prev.id,
            onTrip: x.id,
            time: base + offSecs[offSecs.length - 1], // swing-off: end of the off-going run's last trip
            onTime: base + x.t[1][0],                 // relief's first trip leaves
            place: lastTimepointName(idx, prev.t),
            offRun: { id: prevRun.id, run: prevRun.run },
            onRun: { id: run.id, run: run.run },
          });
        }
        prev = x; prevRun = run;
      }
    }
    list.sort((a, b) => a.time - b.time);
  }
  if (cache.size > 4) cache.clear();
  cache.set(date, { defs, list });
  return list;
}

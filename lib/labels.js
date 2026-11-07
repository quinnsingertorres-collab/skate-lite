// Vehicle labels, the way Skate does them: the run number by default (e.g. "1411" for run
// 126-1411), or the vehicle number if you choose that in Settings. Special cases win:
// "Pull-B" on a bus's last trip before pulling back to the garage, "Sw-Off" on the last trip of
// a run when another operator takes the bus. Ghosts show their run (or N/A).
let mode = "run";
export const setLabelMode = (m) => { mode = m === "vehicle" ? "vehicle" : "run"; };
export const labelMode = () => mode;

/** "126-1411" -> "1411"; runs starting 999- drop a leading zero. */
export function runShort(run) {
  if (!run) return "";
  const parts = String(run).split("-");
  if (parts.length !== 2) return String(run);
  return parts[0] === "999" && parts[1].startsWith("0") ? parts[1].slice(1) : parts[1];
}

export function displayLabel(v) {
  if (!v) return "";
  if (v.ghost) return runShort(v.run) || "N/A";
  if (v.endOfTrip === "pull_back") return "Pull-B";
  if (v.endOfTrip === "swing_off") return "Sw-Off";
  if (mode === "run" && v.run) return runShort(v.run);
  return String(v.label ?? "");
}

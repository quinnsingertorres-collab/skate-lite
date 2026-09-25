// Dark theme between sunset and sunrise in Boston (standard sunrise equation; no network needed).
// THEME_SCRIPT runs inline in <head> so the right theme is applied before the page paints.
export function bostonSunTimes(date = new Date()) {
  const lat = 42.3601, lon = -71.0589, rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = Math.ceil(jd - 2451545.0 + 0.0008);
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec);
  const w = Math.acos(Math.max(-1, Math.min(1, cosW))) / rad;
  const toMs = (j) => (j - 2440587.5) * 86400000;
  return { sunrise: toMs(jTransit - w / 360), sunset: toMs(jTransit + w / 360) };
}

export function isDarkInBoston(now = new Date()) {
  const { sunrise, sunset } = bostonSunTimes(now);
  const t = now.getTime();
  return t >= sunset || t < sunrise;
}

export const THEME_COLORS = { light: "#fafafa", dark: "#16151b" };

// Same logic, as a string for the inline <head> script
export const THEME_SCRIPT = `(function(){try{
var f=${bostonSunTimes.toString()};
var q=new URLSearchParams(location.search).get("theme");
var s=f(new Date()),t=Date.now();
var d=q?q==="dark":(t>=s.sunset||t<s.sunrise);
document.documentElement.dataset.theme=d?"dark":"light";
}catch(e){}})();`;

// Generated covers (Dusk). A pod has no artwork of its own, so its cover is drawn: a
// gradient in the pod's own colour (its gel, so the stage it floods matches), a few
// soft lights, and one of four dot figures taken from the studio clock. The title seeds
// everything, so a pod always gets the same cover, and two pods in one vibe still differ.
// Each cover is painted once on a small canvas and kept as a blob URL.
import { gelFor } from "./theme.js";

const SIZE = 320;
const cache = new Map();

const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)) >>> 0, 7);

/** Hue (degrees) and saturation (percent) of a hex colour. */
function hueSat(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return [220, 0];
  const l = (max + min) / 2;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, (d / (1 - Math.abs(2 * l - 1))) * 100];
}

function paint(title, accent) {
  const R = rng(hash(title || "Untitled pod"));
  const [gh, gs] = hueSat(gelFor(accent));
  const sat = Math.max(26, Math.min(64, gs * 0.72));
  const cv = document.createElement("canvas");
  cv.width = cv.height = SIZE;
  const x = cv.getContext("2d");
  const S = SIZE;
  const h1 = gh - 10 + R() * 20, h2 = h1 + 18 + R() * 30, h3 = h1 - 44 + R() * 22;

  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, `hsl(${h1} ${sat}% 52%)`);
  g.addColorStop(1, `hsl(${h2} ${sat + 4}% 17%)`);
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  [h3, h1 + 24, h2].forEach((h, i) => {
    const cx = R() * S, cy = R() * S, rr = S * (0.35 + R() * 0.4);
    const b = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
    b.addColorStop(0, `hsla(${h} ${sat + 14}% ${66 - i * 14}% / .62)`);
    b.addColorStop(1, "transparent");
    x.fillStyle = b;
    x.fillRect(0, 0, S, S);
  });

  // one dot figure: rings, a halftone falloff, rays, or waves
  const kind = Math.floor(R() * 4), fx = S * (0.3 + R() * 0.45), fy = S * (0.18 + R() * 0.36), u = S / 360;
  x.fillStyle = "rgba(255,255,255,.36)";
  const dot = (px, py, r) => {
    if (r <= 0.25) return;
    x.beginPath();
    x.arc(px, py, r * u, 0, 7);
    x.fill();
  };
  if (kind === 0) {
    for (let ring = 1; ring < 13; ring++) {
      const n = ring * 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + ring * 0.2;
        dot(fx + Math.cos(a) * ring * 17 * u, fy + Math.sin(a) * ring * 17 * u, 3.4 - ring * 0.24);
      }
    }
  } else if (kind === 1) {
    for (let gx = 9 * u; gx < S; gx += 15 * u) {
      for (let gy = 9 * u; gy < S; gy += 15 * u) dot(gx, gy, 5.2 * Math.max(0, 1 - (Math.hypot(gx - fx, gy - fy) / S) * 1.9));
    }
  } else if (kind === 2) {
    for (let ray = 0; ray < 28; ray++) {
      const a = (ray / 28) * 6.283;
      for (let k = 3; k < 24; k++) dot(fx + Math.cos(a) * k * 13 * u, fy + Math.sin(a) * k * 13 * u, 0.7 + k * 0.13);
    }
  } else {
    for (let row = 0; row < 20; row++) {
      for (let gx = 6 * u; gx < S; gx += 12 * u) {
        dot(gx, (40 + row * 15 + Math.sin(gx / (34 * u) + row * 0.5) * 12) * u, 1 + 2.4 * Math.abs(Math.sin(gx / (60 * u) + row * 0.7)));
      }
    }
  }

  // grain, then a shade at the foot so a white title always reads
  const im = x.getImageData(0, 0, S, S), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const nz = (R() - 0.5) * 22;
    d[i] += nz; d[i + 1] += nz; d[i + 2] += nz;
  }
  x.putImageData(im, 0, 0);
  const sh = x.createLinearGradient(0, S * 0.42, 0, S);
  sh.addColorStop(0, "transparent");
  sh.addColorStop(1, "rgba(0,0,0,.56)");
  x.fillStyle = sh;
  x.fillRect(0, 0, S, S);

  const bin = atob(cv.toDataURL("image/jpeg", 0.86).split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}

/** The cover for a pod, as a URL for CSS ("" if this browser can't draw one: the sleeve's
 *  plain gradient shows instead). */
export function coverUrl(title, accent) {
  const key = `${title || ""}|${accent || ""}`;
  if (!cache.has(key)) {
    let url = "";
    try { url = paint(title, accent); } catch { /* no canvas: the gradient stands in */ }
    cache.set(key, url);
  }
  return cache.get(key);
}

/** As a style fragment: `--cover:url(...)`, or nothing. */
export function coverStyle(title, accent) {
  const url = coverUrl(title, accent);
  return url ? `--cover:url(${url})` : "";
}

// How far through a line's words the host is, from where the voice really is in its audio.
//
// The server says where the voice is inside each line (`line_spans`: stretches of speech,
// with the lead-in, the pauses and the tail left out). Words are lit by how much of the
// *voice* has gone by, so they wait through a pause instead of running ahead of it. Then
// the pauses are pinned to the punctuation they most likely belong to (a long pause two
// thirds of the way through the voice, a full stop two thirds of the way through the
// letters: that's the same moment), which takes out most of what's left when one half of a
// sentence is said faster than the other.

const TOLERANCE = 0.14;       // how far apart a pause and a piece of punctuation may be and still be matched
const CUE_WEIGHT = 6;         // a laugh or a sigh takes about as long as a short word
const PAUSE_WEIGHT = 1;

/** What a word weighs, in the same units the captions use to share out a line. */
export function wordWeight(word) {
  return Math.max(1, word.replace(/[^\p{L}\p{N}']/gu, "").length) + 1;
}

export function cueWeight(tag) {
  return /pause|breath/i.test(tag) ? PAUSE_WEIGHT : CUE_WEIGHT;
}

/** The line as weights, and the places a pause could fall (after punctuation, around a cue),
 *  each as a share of the line from 0 to 1. */
function boundaries(text) {
  const marks = [];
  let total = 0;
  for (const part of String(text || "").split(/(<[^>]+>|\s+)/)) {
    if (!part || /^\s+$/.test(part)) continue;
    if (part[0] === "<") {
      if (total) marks.push(total);
      total += cueWeight(part);
      marks.push(total);
      continue;
    }
    const word = part.replace(/\|/g, "");
    if (!word) continue;
    total += wordWeight(word);
    if (/[,.!?;:…—–]["')\]]*$/.test(word) || part.endsWith("|")) marks.push(total);
  }
  total = total || 1;
  return [...new Set(marks.map((m) => m / total))].filter((m) => m > 0.02 && m < 0.98);
}

/** A function from samples into the segment to the share of the line said by then (0 to 1).
 *  spans: [[start, end], ...] in samples from the segment's start, in order. */
export function paceOf(text, spans) {
  const voiced = spans.reduce((n, [a, b]) => n + Math.max(0, b - a), 0) || 1;
  // each pause: how much of the voice came before it, and how long it lasted
  const gaps = [];
  let before = 0;
  for (let i = 0; i < spans.length - 1; i++) {
    before += spans[i][1] - spans[i][0];
    gaps.push({ v: before / voiced, length: spans[i + 1][0] - spans[i][1] });
  }
  const marks = boundaries(text);
  const used = new Set();
  const anchors = [];
  for (const gap of [...gaps].sort((x, y) => y.length - x.length)) {      // the longest pauses choose first
    let best = -1;
    for (let k = 0; k < marks.length; k++) {
      if (used.has(k) || Math.abs(marks[k] - gap.v) > TOLERANCE) continue;
      if (anchors.some((a) => (a.v < gap.v) !== (a.t < marks[k]))) continue;   // keep them in order
      if (best < 0 || Math.abs(marks[k] - gap.v) < Math.abs(marks[best] - gap.v)) best = k;
    }
    if (best >= 0) {
      used.add(best);
      anchors.push({ v: gap.v, t: marks[best] });
    }
  }
  const pins = [{ v: 0, t: 0 }, ...anchors.sort((a, b) => a.v - b.v), { v: 1, t: 1 }];

  return (off) => {
    let done = 0;
    for (const [a, b] of spans) {
      if (off <= a) break;
      done += Math.min(off, b) - a;
    }
    const v = Math.max(0, Math.min(1, done / voiced));
    for (let i = 1; i < pins.length; i++) {
      if (v <= pins[i].v) {
        const from = pins[i - 1], to = pins[i];
        return to.v > from.v ? from.t + ((v - from.v) / (to.v - from.v)) * (to.t - from.t) : to.t;
      }
    }
    return 1;
  };
}

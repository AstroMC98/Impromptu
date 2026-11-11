"""Give pods saved before captions were paced by the voice their `line_spans`.

New pods get them as they are voiced (show.py). This reads a saved pod's episode audio,
finds where the voice is inside each line (audio.voiced_spans) and writes it into the
pod's segments. Local data only (DATA_DIR/shows/<id>/); safe to run again.

    python -m tools.backfill_line_spans <data dir>            # every pod that needs it
    python -m tools.backfill_line_spans <data dir> --redo     # recompute all
    python -m tools.backfill_line_spans <data dir> --dry      # report only
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import miniaudio

from app.audio import voiced_spans

RATE = 24_000


def backfill(show: Path, redo: bool, dry: bool) -> tuple[int, int, list[float]]:
    """(lines given spans, lines without, how long each line waits before its first word, in seconds)."""
    audio = show / "episode.mp3"
    segs = sorted((show / "segments").glob("*.json"))
    if not audio.is_file() or not segs:
        return 0, 0, []
    docs = [(p, json.loads(p.read_text(encoding="utf-8"))) for p in segs]
    if not redo and all(d.get("line_spans") or not d.get("line_starts") for _, d in docs):
        return 0, 0, []
    pcm = miniaudio.decode(audio.read_bytes(), output_format=miniaudio.SampleFormat.SIGNED16,
                           nchannels=1, sample_rate=RATE).samples.tobytes()
    done = missed = 0
    leads: list[float] = []
    for path, d in docs:
        starts = d.get("line_starts") or []
        if not starts or (d.get("line_spans") and not redo):
            continue
        seg_at = int(d.get("start") or 0)
        length = int(d.get("samples") or 0) or (len(pcm) // 2 - seg_at)
        marks = []
        for i, at in enumerate(starts):
            end = starts[i + 1] if i + 1 < len(starts) else length
            clip = pcm[(seg_at + at) * 2:(seg_at + end) * 2]
            spans = [[a + at, b + at] for a, b in voiced_spans(clip, RATE)]
            marks.append(spans)
            if spans:
                done += 1
                leads.append((spans[0][0] - at) / RATE)
            else:
                missed += 1
        d["line_spans"] = marks
        if not dry:
            path.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    return done, missed, leads


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    redo, dry = "--redo" in sys.argv, "--dry" in sys.argv
    total = missed_all = 0
    leads_all: list[float] = []
    for show in sorted((Path(args[0]) / "shows").iterdir()):
        try:
            done, missed, leads = backfill(show, redo, dry)
        except Exception as exc:
            print(f"{show.name}: skipped ({exc})")
            continue
        if done or missed:
            print(f"{show.name}: {done} lines paced, {missed} without a voice found")
        total += done
        missed_all += missed
        leads_all += leads
    if leads_all:
        leads_all.sort()
        print(f"{total} lines in all ({missed_all} missed). A line's first word comes "
              f"{leads_all[len(leads_all) // 2] * 1000:.0f} ms after the line starts (median; "
              f"90% within {leads_all[int(len(leads_all) * .9)] * 1000:.0f} ms).")
    else:
        print("Nothing to do.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

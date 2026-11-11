"""Audio kept by a live room: the MP3 being built, and a short window of raw PCM.

The MP3 is encoded as audio arrives, so a show is downloadable mid-show and
there is no long encode at the end. Raw PCM is only kept from shortly behind the
live edge onwards, for late joiners and reconnects; a 30-minute show would
otherwise hold 86 MB of samples in memory.
"""
from __future__ import annotations

from collections import deque

import lameenc


class Mp3Writer:
    def __init__(self, rate: int, kbps: int):
        self._enc = lameenc.Encoder()
        self._enc.set_bit_rate(kbps)
        self._enc.set_in_sample_rate(rate)
        self._enc.set_channels(1)
        self._enc.set_quality(5)
        self._parts: list[bytes] = []
        self._finished: bytes | None = None

    def feed(self, pcm: bytes) -> None:
        if self._finished is None and pcm:
            out = self._enc.encode(pcm)
            if out:
                self._parts.append(bytes(out))

    def snapshot(self) -> bytes:
        """Everything encoded so far. A valid MP3, minus the last few milliseconds."""
        return self._finished if self._finished is not None else b"".join(self._parts)

    def finish(self) -> bytes:
        if self._finished is None:
            tail = self._enc.flush()
            if tail:
                self._parts.append(bytes(tail))
            self._finished = b"".join(self._parts)
            self._parts = []
        return self._finished


class PcmWindow:
    """(start_sample, seq, pcm) chunks in timeline order, trimmed from the front."""

    def __init__(self) -> None:
        self._chunks: deque[tuple[int, int, bytes]] = deque()

    def add(self, start: int, seq: int, pcm: bytes) -> None:
        self._chunks.append((start, seq, pcm))

    @property
    def start(self) -> int | None:
        return self._chunks[0][0] if self._chunks else None

    def since(self, sample: int) -> list[tuple[int, int, bytes]]:
        """Chunks covering [sample, end), the first one cut to start exactly at sample."""
        out = []
        for start, seq, pcm in self._chunks:
            end = start + len(pcm) // 2
            if end <= sample:
                continue
            if start < sample:
                pcm = pcm[(sample - start) * 2:]
                start = sample
            out.append((start, seq, pcm))
        return out

    def truncate(self, at: int) -> None:
        """Forget everything from `at` on: audio that was voiced but never heard,
        because the listener interrupted the show there."""
        while self._chunks:
            start, seq, pcm = self._chunks[-1]
            if start >= at:
                self._chunks.pop()
                continue
            end = start + len(pcm) // 2
            if end > at:
                self._chunks[-1] = (start, seq, pcm[: (at - start) * 2])
            break

    def trim(self, before: int) -> None:
        while self._chunks:
            start, _, pcm = self._chunks[0]
            if start + len(pcm) // 2 > before:
                break
            self._chunks.popleft()


# ---- where the voice is ------------------------------------------------------------------

SPAN_FRAME_S = 0.02        # loudness is measured 20 ms at a time
SPAN_MIN_GAP_S = 0.16      # a quieter stretch shorter than this is part of the speech around it
SPAN_MIN_S = 0.06          # a blip shorter than this isn't speech


def voiced_spans(pcm: bytes, rate: int) -> list[list[int]]:
    """Where there is voice in a clip of 16-bit mono PCM: [[first sample, last sample], ...].

    A line voiced on its own starts and ends with a little silence and pauses at its commas
    and full stops. The captions light words by how much of the *voice* has gone by, not how
    much time, so they wait through a pause instead of running ahead (static/js/live/pace.js).
    """
    import numpy as np

    x = np.frombuffer(pcm[: len(pcm) - (len(pcm) % 2)], dtype="<i2").astype(np.float32)
    frame = max(1, int(SPAN_FRAME_S * rate))
    n = len(x) // frame
    if n == 0:
        return []
    rms = np.sqrt((x[: n * frame].reshape(n, frame) ** 2).mean(axis=1))
    peak = float(rms.max())
    if peak < 60:              # silence all the way through
        return []
    loud = rms > max(peak * 0.06, 90.0)
    spans: list[list[int]] = []
    start = None
    for i, on in enumerate(loud):
        if on and start is None:
            start = i
        elif not on and start is not None:
            spans.append([start, i])
            start = None
    if start is not None:
        spans.append([start, n])
    merged: list[list[int]] = []
    gap = SPAN_MIN_GAP_S / SPAN_FRAME_S
    for a, b in spans:
        if merged and a - merged[-1][1] < gap:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    keep = [[a * frame, b * frame] for a, b in merged if (b - a) * SPAN_FRAME_S >= SPAN_MIN_S]
    return keep

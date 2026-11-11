"""Record a short sample of every voice in the catalog, for the persona editor.

Each voice says the same line, so they can be compared, into static/voices/<Name>.mp3.
The files are committed: the app only serves them, so hearing a voice costs nothing.
Run again after the voice catalog or the TTS model changes.

    python -m tools.build_voice_samples            # only the ones that are missing
    python -m tools.build_voice_samples --all      # every voice again
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from app.audio import Mp3Writer
from app.catalog import VOICE_INFO
from app.config import settings
from app.llm import Gemini
from app.models import Host, Line

OUT = Path(__file__).resolve().parent.parent / "static" / "voices"
LINE = "Hi there. This is how I sound when I'm hosting a show. Shall we get started?"
KBPS = 64


async def one(gemini: Gemini, voice: str) -> int:
    host = Host(name="Host", persona="A friendly podcast host.", voice=voice)
    mp3 = Mp3Writer(settings.sample_rate, KBPS)
    async for chunk in gemini.stream_speech([Line(speaker="Host", text=LINE)], [host]):
        mp3.feed(chunk)
    data = mp3.finish()
    if len(data) < 4_000:
        raise RuntimeError(f"{voice}: only {len(data)} bytes came back")
    (OUT / f"{voice}.mp3").write_bytes(data)
    return len(data)


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [v for v in VOICE_INFO if "--all" in sys.argv or not (OUT / f"{v}.mp3").exists()]
    gemini = Gemini(settings)
    gate = asyncio.Semaphore(4)
    failed = []

    async def guarded(voice: str) -> None:
        async with gate:
            for attempt in (1, 2, 3):
                try:
                    print(f"{voice}: {await one(gemini, voice) // 1024} KB")
                    return
                except Exception as exc:
                    if attempt == 3:
                        failed.append(voice)
                        print(f"{voice}: FAILED ({exc})")
                    else:
                        await asyncio.sleep(2 * attempt)

    await asyncio.gather(*(guarded(v) for v in todo))
    print(f"{len(todo) - len(failed)} recorded, {len(failed)} failed, {len(VOICE_INFO) - len(todo)} already there")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

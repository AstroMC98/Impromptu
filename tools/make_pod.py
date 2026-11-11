"""Make a pod with nobody at the screen, and save it to the LOCAL library.

A live pod only moves while someone is listening. This runs the same show loop headless
(the way a scheduled briefing is made): the real planner, writers, voices and theme, as
fast as the models allow, saved as a finished pod its owner can replay in the app. It is
for hearing what a prompt, template or playbook change does without sitting through a
live show.

    python tools/make_pod.py talk-show --topic "Why do we procrastinate?"
    python tools/make_pod.py idea-breakdown --url https://example.com/article --minutes 5
    python tools/make_pod.py solo-pod --file notes.txt --owner you@example.com

The first argument is a starter template id (app/catalog.py TEMPLATES). The pod is private,
tagged "headless", costs its owner no credits (it does use the Gemini API), and is written
live-style: the same prompts a pod made on the Create screen gets, with no call-ins.

Local data only: it refuses to run against the cloud store.
"""
from __future__ import annotations

import argparse
import asyncio
import pathlib
import secrets
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

DEFAULT_OWNER = "demo@impromptu.test"


def _args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("template", help="a starter template id, such as talk-show")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--topic", help="a topic or pasted text to build the pod from")
    src.add_argument("--file", help="a text file to build the pod from")
    src.add_argument("--url", help="a page to build the pod from")
    p.add_argument("--minutes", type=int, default=5, help="target length, 2 to 15 (default 5)")
    p.add_argument("--owner", default=DEFAULT_OWNER, help=f"email of the local account that owns it (default {DEFAULT_OWNER})")
    p.add_argument("--language", default="English")
    p.add_argument("--script", help="also write the script to this Markdown file")
    return p.parse_args()


async def _source(args: argparse.Namespace) -> tuple[str, list[str]]:
    """The source text and the names it goes by."""
    if args.topic:
        return args.topic, []
    if args.file:
        path = pathlib.Path(args.file)
        return path.read_text(encoding="utf-8"), [path.name]
    from app.sources import url_to_text
    title, text = await url_to_text(args.url)
    return text, [title or args.url]


def _script(doc: dict, segments: dict[int, dict]) -> str:
    out = [f"# {doc.get('title', '')}", f"*{doc.get('tagline', '')}*", "", doc.get("about", ""), ""]
    for seq in sorted(segments):
        for line in segments[seq].get("lines", []):
            out += [f"**{line.get('speaker', '')}:** {line.get('text', '')}", ""]
    return "\n".join(out)


async def main() -> int:
    args = _args()
    # Imported here so --help works without the app's settings or a key.
    from app import main as app_main
    from app.catalog import TEMPLATES_BY_ID, accent_for, music_mood_for, style_label, template_request
    from app.models import ShowRequest
    from app.room import ShowRoom

    settings, store = app_main.settings, app_main.store
    if settings.storage_backend != "local":
        print("This tool only writes to the local store. STORAGE_BACKEND is "
              f"{settings.storage_backend!r}; it won't touch that.", file=sys.stderr)
        return 2
    fields = template_request(args.template)
    if fields is None:
        print(f"No template called {args.template!r}. There are: {', '.join(TEMPLATES_BY_ID)}", file=sys.stderr)
        return 2
    owner = await store.find_user_by_email(args.owner)
    if owner is None:
        known = ", ".join(u.get("email", "?") for u in await store.list_users(limit=20)) or "none yet"
        print(f"No local account for {args.owner}. Sign in to the local app once with it, or pass --owner. "
              f"Local accounts: {known}", file=sys.stderr)
        return 2

    source, names = await _source(args)
    source = source[: settings.max_source_chars]
    req = ShowRequest(source=source, minutes=args.minutes, language=args.language, source_names=names, **fields)
    show_id = secrets.token_urlsafe(9)
    now = time.time()
    title = app_main._working_title(req, source)
    # The same document the Create screen's pod gets (main.create_show), made headless.
    doc = {
        "id": show_id,
        "owner_uid": owner["uid"],
        "owner_name": owner.get("name", ""),
        "credits_per_minute": 0,
        "visibility": "private",
        "shared_with": [],
        "template": args.template,
        "album_ids": [],
        "tags": ["headless"],
        "status": "live",
        "ended_reason": None,
        "created_at": now,
        "started_at": now,
        "ended_at": None,
        "request": req.model_dump(exclude={"source"}),
        "source": {"chars": len(source), "names": names or [title]},
        "title": title,
        "tagline": "",
        "about": "",
        "accent": req.accent or accent_for(req.vibe, req.style),
        "vibe": req.vibe,
        "style": req.style,
        "style_label": req.style_label or style_label(req.vibe),
        "style_history": [],
        "hosts": [{"name": h.name, "persona": h.persona, "voice": h.voice, "gender": h.gender} for h in req.hosts],
        "beats": [],
        "minutes": req.minutes,
        "language": req.language,
        "credits_charged": 0,
        "samples": 0,
        "duration_s": 0,
        "audio": None,
        "counts": {},
        "intro": dict(app_main.AUTO_INTRO),
    }
    theme, doc["music"] = await app_main._live_theme(owner["uid"], doc["intro"], music_mood_for(req.vibe, args.template), show_id)
    await store.create_show(doc)
    await store.put_text(show_id, "source.txt", source)

    print(f"making {show_id}: {TEMPLATES_BY_ID[args.template]['label']}, about {req.minutes} min, "
          f"for {args.owner} ...", flush=True)
    started = time.monotonic()
    room = ShowRoom(doc=doc, request=req, source=source, gemini=app_main.gemini(), settings=settings, store=store,
                    on_closed=lambda _id: None, headless=True, intro=theme)
    try:
        while not room.finalized.is_set():
            try:
                await asyncio.wait_for(room.finalized.wait(), timeout=20)
            except asyncio.TimeoutError:
                print(f"  {room.state}: {room.clock.audio_end / room.rate:5.0f}s voiced, "
                      f"{len(room.segments)} segments", flush=True)
    finally:
        segments = dict(room.segments)
        room.close()

    done = room.doc
    print(f"{done.get('status')} ({done.get('ended_reason')}): \"{done.get('title')}\", "
          f"{done.get('duration_s', 0):.0f}s of audio, made in {time.monotonic() - started:.0f}s")
    print(f"  listen: /show/{show_id} in the local app, signed in as {args.owner}")
    if args.script:
        pathlib.Path(args.script).write_text(_script(done, segments), encoding="utf-8")
        print(f"  script: {args.script}")
    return 0 if done.get("status") == "finished" and done.get("audio") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

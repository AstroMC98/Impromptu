"""What a co-host remembers about you between calls.

A memory is one short fact about the person on the other mic ("Marc is training for a
half marathon in March"). After a call that had memory switched on, the model proposes
a few from what was said; nothing is remembered until you approve it (the Memory page,
a swipe each). Approved memories belong to one co-host, by name, or are shared with all
of them, and go into the co-host's instructions on the next call that has memory on.

Memories are saved items of kind "memories" (store.list_items / put_item), so they work
on every store with no new collection code:

    {id, text, status: "pending" | "kept", scope: "host" | "shared", host, host_key,
     show_id, show_title, created_at, updated_at}

Small on purpose: a list this size fits in the prompt whole, so there's no search yet.
"""
from __future__ import annotations

import logging
import secrets
import time

from .store import Store

log = logging.getLogger("podcasts.memory")

KIND = "memories"
MEMORY_CHARS = 240
MAX_KEPT = 200             # approved memories an account can hold
MAX_PENDING = 40           # proposals waiting for a swipe; the oldest drop off past this
PER_CALL = 6               # proposals one call can make
PROMPT_ITEMS = 40          # memories a co-host is handed for one call
SCOPES = ("host", "shared")


def host_key(name: str) -> str:
    """One co-host's memories are kept under their name, however it was typed."""
    return " ".join(str(name or "").split()).casefold()


def clean_text(text: str) -> str:
    return " ".join(str(text or "").split())[:MEMORY_CHARS]


def _same(a: str, b: str) -> bool:
    return clean_text(a).casefold().rstrip(".") == clean_text(b).casefold().rstrip(".")


async def all_items(store: Store, uid: str) -> list[dict]:
    return sorted(await store.list_items(uid, KIND), key=lambda m: m.get("created_at", 0), reverse=True)


def split(items: list[dict]) -> dict:
    """The Memory page's two lists."""
    return {"pending": [m for m in items if m.get("status") == "pending"],
            "kept": [m for m in items if m.get("status") == "kept"]}


async def recall(store: Store, uid: str, host_name: str) -> list[str]:
    """What this co-host may use on a call: their own memories first, then the shared ones."""
    key = host_key(host_name)
    kept = [m for m in await all_items(store, uid) if m.get("status") == "kept"]
    own = [m["text"] for m in kept if m.get("scope") == "host" and m.get("host_key") == key]
    shared = [m["text"] for m in kept if m.get("scope") == "shared"]
    return (own + shared)[:PROMPT_ITEMS]


def new_item(text: str, *, status: str, scope: str, host: str, show_id: str = "", show_title: str = "") -> dict:
    scope = scope if scope in SCOPES else "host"
    return {
        "id": secrets.token_urlsafe(8), "text": clean_text(text), "status": status, "scope": scope,
        "host": " ".join(str(host or "").split())[:40], "host_key": host_key(host),
        "show_id": show_id, "show_title": show_title[:80], "created_at": time.time(),
    }


async def propose(store: Store, uid: str, found: list[dict], *, host: str, show_id: str, show_title: str) -> int:
    """Save what the model proposed after a call as pending, skipping anything already
    known or already waiting. Returns how many were added."""
    items = await all_items(store, uid)
    known = [m["text"] for m in items]
    added = 0
    for f in found[:PER_CALL]:
        text = clean_text(f.get("text", ""))
        if len(text) < 8 or any(_same(text, k) for k in known):
            continue
        item = new_item(text, status="pending", scope=f.get("scope", "host"), host=host,
                        show_id=show_id, show_title=show_title)
        await store.put_item(uid, KIND, item)
        known.append(text)
        added += 1
    pending = [m for m in await all_items(store, uid) if m.get("status") == "pending"]
    for old in pending[MAX_PENDING:]:
        try:
            await store.delete_item(uid, KIND, old["id"])
        except ValueError:
            pass
    return added

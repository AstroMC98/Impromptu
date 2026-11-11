"""What a co-host remembers about you between calls.

A memory is one short fact about the person on the other mic ("Marc is training for a
half marathon in March"). After a call that had memory switched on, the model proposes
a few from what was said; nothing is remembered until you approve it (the Memory page,
a swipe each). Approved memories belong to one co-host, by name, or are shared with all
of them, and go into the co-host's instructions on the next call that has memory on.

Memories are saved items of kind "memories" (store.list_items / put_item), so they work
on every store with no new collection code:

    {id, text, status: "pending" | "kept", scope: "host" | "shared" | "self" | "caller" | "audience",
     host, host_key, show_id, show_title, created_at, updated_at}

Scope "self" is something a co-host said about themselves on a call (where they grew up,
an opinion they took, a running joke), kept so they stay consistent next time.
Scope "audience" is something several listeners said in notes they left (feedback.py),
for the hosts those notes were about (host_keys).

Caller memory is the same thing pointed the other way: with "Remember callers" on, a
signed-in listener who calls in to one of your live pods is proposed as a memory for
that pod's hosts (scope "caller", with caller_uid, caller_name and host_keys). Once you
approve it, those hosts are told so when the same person calls one of their shows again.

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
SELF_NOTES = 8             # things a host said about themselves that they're handed back
CALLERS_PER_SHOW = 8       # callers one show can propose
MAX_PENDING_CALLERS = 20   # caller proposals waiting at once; more are not added, so they can't crowd out your own
CALLER_NOTES = 3           # what a host is told about a returning caller, at most


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
    own += [f"You said: {m['text']}" for m in kept if m.get("scope") == "self" and m.get("host_key") == key][:SELF_NOTES]
    shared = [m["text"] for m in kept if m.get("scope") == "shared"]
    return (own + shared + [f"Listeners have said: {t}" for t in audience(kept, host_name)])[:PROMPT_ITEMS]


AUDIENCE_NOTES = 6         # sentiments one host is handed


def audience(items: list[dict], host_name: str) -> list[str]:
    """What listeners, several of them, have said about this host's shows (approved only)."""
    key = host_key(host_name)
    return [m["text"] for m in items if m.get("status") == "kept" and m.get("scope") == "audience"
            and key in m.get("host_keys", [])][:AUDIENCE_NOTES]


def new_item(text: str, *, status: str, scope: str, host: str, show_id: str = "", show_title: str = "") -> dict:
    scope = scope if scope in SCOPES or scope == "self" else "host"
    return {
        "id": secrets.token_urlsafe(8), "text": clean_text(text), "status": status, "scope": scope,
        "host": " ".join(str(host or "").split())[:40], "host_key": host_key(host),
        "show_id": show_id, "show_title": show_title[:80], "created_at": time.time(),
    }


_AUDIENCE = {"private": 0, "connections": 1, "public": 2}


async def propose_callers(store: Store, uid: str, callers: dict[str, dict], *, hosts: list[str], show_id: str,
                          show_title: str, visibility: str = "private") -> int:
    """After a live pod: one proposal per signed-in caller, for that pod's hosts.
    callers: {caller_uid: {"name": ..., "said": [what they asked]}}."""
    names = [" ".join(h.split())[:40] for h in hosts if h and h.strip()]
    if not names:
        return 0
    items = await all_items(store, uid)
    known = [m["text"] for m in items]
    waiting = sum(m.get("status") == "pending" and m.get("scope") == "caller" for m in items)
    added = 0
    for caller_uid, c in list(callers.items())[:CALLERS_PER_SHOW]:
        if waiting + added >= MAX_PENDING_CALLERS:
            break
        asked = clean_text(" / ".join(c.get("said", [])[:2]))[:150]
        name = " ".join(str(c.get("name", "")).split())[:40]
        if not asked or not name or not caller_uid:
            continue
        text = clean_text(f'{name} called in to "{show_title[:50]}" and asked: {asked}')
        if any(_same(text, k) for k in known):
            continue
        item = new_item(text, status="pending", scope="host", host=" and ".join(names), show_id=show_id,
                        show_title=show_title)
        item.update({"scope": "caller", "caller_uid": caller_uid, "caller_name": name,
                     "host_keys": [host_key(n) for n in names],
                     "visibility": visibility if visibility in _AUDIENCE else "private"})
        await store.put_item(uid, KIND, item)
        known.append(text)
        added += 1
    return added


async def kept_callers(store: Store, uid: str) -> list[dict]:
    """Every approved caller memory of this account (a live pod loads them once)."""
    return [m for m in await all_items(store, uid) if m.get("status") == "kept" and m.get("scope") == "caller"]


def returning(kept: list[dict], caller_uid: str, hosts: list[str], visibility: str = "public") -> str:
    """What this show's hosts remember about a caller, or "". A memory is only used on a
    show with an audience no wider than the one it came from: what someone asked on a
    private pod is never brought to a public one."""
    keys = {host_key(h) for h in hosts if h}
    here = _AUDIENCE.get(visibility, 2)
    mine = [m["text"] for m in kept
            if m.get("caller_uid") == caller_uid and keys & set(m.get("host_keys", []))
            and _AUDIENCE.get(m.get("visibility", "private"), 0) >= here]
    return " ".join(mine[:CALLER_NOTES])


async def propose(store: Store, uid: str, found: list[dict], *, host: str, show_id: str, show_title: str) -> int:
    """Save what the model proposed after a call as pending, skipping anything already
    known or already waiting. Returns how many were added."""
    items = await all_items(store, uid)
    known = [m["text"] for m in items]
    added = 0
    for f in found[:PER_CALL + 2]:      # the two extra are what the host said about themselves
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

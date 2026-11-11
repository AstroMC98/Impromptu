"""Notes listeners leave for a pod's hosts, and what enough of them add up to.

A signed-in listener can leave the hosts a note from any pod they can open. It is not a
call-in: nobody reads it on air. One note sways nothing. Notes pile up (saved items of
kind "notes" on the creator's account):

    {id, text, from_uid, from_name, show_id, show_title, hosts, host_keys, used, created_at}

When notes from at least THRESHOLD different listeners are waiting, the model is asked what
they have in common. A sentiment only counts if notes from THRESHOLD different people back
it, and the server counts those people itself rather than taking the model's word. Each one
that passes becomes a proposal on the Memory page (a memory of scope "audience", for the
hosts those notes were about). Approved, it shapes later pods and calls with those hosts.

The creator can switch the whole thing off ("Take notes from listeners", `listener_notes`
on the account: on unless it is false).
"""
from __future__ import annotations

import logging
import secrets
import time
from typing import Awaitable, Callable

from . import memory
from .store import Store

log = logging.getLogger("podcasts.feedback")

KIND = "notes"
NOTE_CHARS = 400
THRESHOLD = 3              # different listeners who must say the same thing
PER_LISTENER_PER_SHOW = 3  # notes one listener can leave on one pod
PER_LISTENER = 12          # notes one listener can have waiting with one creator
MAX_NOTES = 300            # notes an account holds; the oldest drop off past this
READ_AT_ONCE = 120         # notes handed to the model in one go
MAX_PENDING_AUDIENCE = 8   # audience proposals waiting at once
COOLDOWN_SECONDS = 90      # between two looks at one account's notes

Finder = Callable[[list[dict], int], Awaitable[list[dict]]]


class TooManyNotes(ValueError):
    """This listener has left as many notes as they can for now."""


def clean_text(text: str) -> str:
    return " ".join(str(text or "").split())[:NOTE_CHARS]


async def all_notes(store: Store, uid: str) -> list[dict]:
    """Newest first."""
    return sorted(await store.list_items(uid, KIND), key=lambda n: n.get("created_at", 0), reverse=True)


async def add(store: Store, owner_uid: str, *, from_uid: str, from_name: str, text: str, show_id: str,
              show_title: str, hosts: list[str]) -> dict:
    text = clean_text(text)
    if not text:
        raise ValueError("Write a note first.")
    notes = await all_notes(store, owner_uid)
    theirs = [n for n in notes if n.get("from_uid") == from_uid]
    if sum(n.get("show_id") == show_id for n in theirs) >= PER_LISTENER_PER_SHOW:
        raise TooManyNotes(f"You've left {PER_LISTENER_PER_SHOW} notes on this pod, which is the most it takes.")
    if sum(not n.get("used") for n in theirs) >= PER_LISTENER:
        raise TooManyNotes("You've left this creator plenty of notes for now. They'll get to them.")
    names = [" ".join(h.split())[:40] for h in hosts if h and h.strip()]
    note = {"id": secrets.token_urlsafe(8), "text": text, "from_uid": from_uid,
            "from_name": " ".join(str(from_name or "").split())[:40] or "A listener",
            "show_id": show_id, "show_title": str(show_title or "")[:80], "hosts": names,
            "host_keys": [memory.host_key(n) for n in names], "used": False, "created_at": time.time()}
    await store.put_item(owner_uid, KIND, note)
    for old in notes[MAX_NOTES - 1:]:
        try:
            await store.delete_item(owner_uid, KIND, old["id"])
        except ValueError:
            pass
    return note


def waiting(notes: list[dict]) -> list[dict]:
    """Notes not yet counted towards a sentiment, oldest first."""
    return sorted((n for n in notes if not n.get("used")), key=lambda n: n.get("created_at", 0))[-READ_AT_ONCE:]


def enough(notes: list[dict]) -> bool:
    return len({n.get("from_uid") for n in waiting(notes)}) >= THRESHOLD


_last_look: dict[str, float] = {}
_looking: set[str] = set()


async def consider(store: Store, owner_uid: str, find: Finder) -> int:
    """If enough different listeners have notes waiting, ask what they share and propose
    what passes the threshold. Returns how many proposals were added. Safe to call often:
    it does nothing unless there's enough to go on, and not twice within the cooldown."""
    now = time.time()
    if owner_uid in _looking or now - _last_look.get(owner_uid, 0) < COOLDOWN_SECONDS:
        return 0
    notes = waiting(await all_notes(store, owner_uid))
    if len({n.get("from_uid") for n in notes}) < THRESHOLD:
        return 0
    _looking.add(owner_uid)
    _last_look[owner_uid] = now
    try:
        found = await find(notes, THRESHOLD)
        return await propose(store, owner_uid, notes, found)
    finally:
        _looking.discard(owner_uid)


async def propose(store: Store, owner_uid: str, notes: list[dict], found: list[dict]) -> int:
    """found: [{"text": the shared sentiment, "notes": [1-based numbers of the notes behind it]}].
    Keeps only what THRESHOLD different listeners back, by our own count."""
    items = await memory.all_items(store, owner_uid)
    known = [m["text"] for m in items]
    pending = sum(m.get("status") == "pending" and m.get("scope") == "audience" for m in items)
    added = 0
    for f in found:
        if pending + added >= MAX_PENDING_AUDIENCE:
            break
        text = memory.clean_text(f.get("text", ""))
        cited = [notes[i - 1] for i in dict.fromkeys(f.get("notes") or []) if isinstance(i, int) and 0 < i <= len(notes)]
        people = {n.get("from_uid") for n in cited}
        if len(text) < 8 or len(people) < THRESHOLD or any(memory._same(text, k) for k in known):
            continue
        hosts = list(dict.fromkeys(h for n in cited for h in n.get("hosts", [])))[:4]
        item = memory.new_item(text, status="pending", scope="host", host=" and ".join(hosts))
        item.update({"scope": "audience", "listeners": len(people), "note_ids": [n["id"] for n in cited],
                     "host_keys": [memory.host_key(h) for h in hosts]})
        await store.put_item(owner_uid, memory.KIND, item)
        for n in cited:
            if not n.get("used"):
                n["used"] = True
                await store.put_item(owner_uid, KIND, n)
        known.append(text)
        added += 1
    if added:
        log.info("account %s: %d audience sentiments proposed", owner_uid, added)
    return added

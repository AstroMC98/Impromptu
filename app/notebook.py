"""A host's notebook: pages of your own material that one host can draw on.

Where a persona's private notes are one box, a notebook grows: you add a page at a time
or import a long document, which is split into pages. Up to MAX_PAGES pages and
MAX_CHARS characters per host. Like memories, a notebook belongs to a host by name, and
its pages are saved items (kind "pages"), so every store holds them with no new code:

    {id, host, host_key, title, text, created_at, updated_at}

How a notebook is used:
- On a co-host call it joins the notes you hand over. Short, the co-host has it whole;
  long, they keep a brief and search the rest while they talk (notes.py, check_notes).
- For a written pod, the pages that best match what the pod is about (BM25, the same
  search) are added to that host's private notes, up to what the writers can hold.
"""
from __future__ import annotations

import secrets
import time

from .memory import host_key
from .notes import NotesIndex, passages
from .store import Store

KIND = "pages"
MAX_PAGES = 100
MAX_CHARS = 100_000        # a whole notebook
PAGE_CHARS = 4_000         # one page; longer text becomes several pages
TITLE_CHARS = 80


class NotebookFull(ValueError):
    """Adding this would go past the notebook's page or size limit."""


def clean_title(title: str) -> str:
    return " ".join(str(title or "").split())[:TITLE_CHARS]


def clean_text(text: str) -> str:
    lines = [line.rstrip() for line in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return "\n".join(lines).strip()


async def pages(store: Store, uid: str, host: str) -> list[dict]:
    """A host's pages, oldest first: the order they were written in."""
    key = host_key(host)
    mine = [p for p in await store.list_items(uid, KIND) if p.get("host_key") == key]
    return sorted(mine, key=lambda p: (p.get("created_at", 0), p.get("part", 0)))


async def shelves(store: Store, uid: str) -> list[dict]:
    """Every host that has a notebook: [{host, host_key, pages, chars}], biggest first."""
    out: dict[str, dict] = {}
    for p in await store.list_items(uid, KIND):
        s = out.setdefault(p.get("host_key", ""), {"host": p.get("host", ""), "host_key": p.get("host_key", ""),
                                                   "pages": 0, "chars": 0})
        s["pages"] += 1
        s["chars"] += len(p.get("text", ""))
    return sorted(out.values(), key=lambda s: -s["chars"])


def size(notebook: list[dict]) -> dict:
    return {"count": len(notebook), "chars": sum(len(p.get("text", "")) for p in notebook),
            "max_pages": MAX_PAGES, "max_chars": MAX_CHARS}


async def add(store: Store, uid: str, host: str, title: str, text: str) -> list[dict]:
    """Add a page, or, for text longer than a page, as many pages as it takes ("Title (2)"…).
    Raises NotebookFull, and adds nothing, if it doesn't all fit."""
    text, title = clean_text(text), clean_title(title)
    host = " ".join(str(host or "").split())[:40]
    if not text or not host:
        raise ValueError("A page needs a host and something written on it.")
    parts = passages(text, PAGE_CHARS)
    have = await pages(store, uid, host)
    used = sum(len(p.get("text", "")) for p in have)
    if len(have) + len(parts) > MAX_PAGES:
        raise NotebookFull(f"A notebook holds {MAX_PAGES} pages. This would make {len(have) + len(parts)}.")
    if used + len(text) > MAX_CHARS:
        raise NotebookFull(f"A notebook holds about {MAX_CHARS // 1000}k characters. "
                           f"There's room for {max(0, MAX_CHARS - used):,} more and this is {len(text):,}.")
    now = time.time()
    first_line = text.split("\n", 1)[0][:TITLE_CHARS]
    made = []
    for i, part in enumerate(parts):
        name = title or first_line
        page = {"id": secrets.token_urlsafe(8), "host": host, "host_key": host_key(host),
                "title": f"{name} ({i + 1})"[:TITLE_CHARS] if len(parts) > 1 else name,
                "text": part, "created_at": now, "part": i}
        await store.put_item(uid, KIND, page)
        made.append(page)
    return made


def as_text(notebook: list[dict]) -> str:
    """The notebook as one document, a heading per page."""
    return "\n\n".join(f"## {p.get('title') or 'Page'}\n{p.get('text', '')}" for p in notebook)


def relevant(notebook: list[dict], about: str, budget: int) -> str:
    """The notebook if it fits in `budget` characters; otherwise the parts of it that best
    match `about`, in their original order."""
    whole = as_text(notebook)
    if len(whole) <= budget or budget <= 0:
        return whole if budget > 0 else ""
    index = NotesIndex(whole)
    if not index.passages:
        return ""
    per = max(len(p) for p in index.passages) + 2
    found = index.search(about, k=max(1, budget // per))
    return "\n\n".join(found or index.passages[: max(1, budget // per)])[:budget]

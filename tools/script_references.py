"""Fetch and measure the reference transcripts behind app/craft.py.

The playbooks in app/craft.py are distilled from published transcripts of talks, long-form
interviews and late-night shows. This tool downloads those pages and measures them (sentence
length, who carries the words, turn length, how often a laugh lands), so the numbers in
docs/research/script-references.md can be re-checked or extended with new sources.

The transcripts are other people's work: they are studied, not shipped. Point the tool at a
folder OUTSIDE the repo; nothing it downloads belongs in git or in a prompt.

    python tools/script_references.py fetch  <folder>     # download and extract the text
    python tools/script_references.py stats  <folder>     # measure what's there
"""
from __future__ import annotations

import json
import pathlib
import re
import statistics as st
import sys
import time
from collections import Counter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0 Safari/537.36")
WPM = 150       # speaking pace assumed when turning words into minutes

_S = "https://sozai.app/transcript/"
_N = "https://www.neil.blog/full-speech-transcript/"
_T = "https://www.ted.com/talks/"
_TI = "https://www.ted.com/podcasts/ted-interview/"
_A = "https://www.artofmanliness.com/"
_C = "https://scrapsfromtheloft.com/comedy/"

# name -> url. The prefix of the name says how the page is read and measured:
# latenight- (timestamped utterances, no speaker labels), speech- and talk- (one speaker),
# interview- (named turns).
PAGES = {
    "latenight-zendaya": _S + "zendaya-tom-holland-surprise-odyssey-spider-man-euphoria/",
    "latenight-holland": _S + "tom-holland-spiderman-4-cameos-bero/",
    "latenight-whisper": _S + "whisper-challenge-natalie-portman-fallon/",
    "latenight-hathaway": _S + "anne-hathaway-forgets-movie-details-chat/",
    "latenight-altman": _S + "sam-altman-technology-greatest-equalizer/",
    "latenight-humm": _S + "dressing-room-cooking-challenge-chef-daniel-humm-transcript/",
    "latenight-disaster": _S + "how-an-interview-disaster-became-a-huge-success-for-dia-transcript/",
    "speech-conan": _N + "full-transcript-conan-obriens-2026-commencement-address-at-harvard-university-on-may-28-2026",
    "speech-saunders": _N + "what-i-regret-most-in-my-life-are-failures-of-kindness-by-george-saunders",
    "speech-gladwell": _N + "why-did-i-say-yes-to-speak-here-by-malcolm-gladwell",
    "speech-mcinerny": _N + "we-dont-move-on-from-grief-we-move-forward-with-it-by-nora-mcinerny",
    "speech-brown": _N + "trust-is-built-in-the-small-moments-a-speech-by-brene-brown",
    "speech-watterson": _N + "invent-your-own-lifes-meaning-by-bill-watterson",
    "speech-hawken": _N + "you-are-brilliant-and-the-earth-is-hiring-by-paul-hawken",
    "talk-robinson": _T + "sir_ken_robinson_do_schools_kill_creativity/transcript",
    "talk-urban": _T + "tim_urban_inside_the_mind_of_a_master_procrastinator/transcript",
    "talk-brown": _T + "brene_brown_the_power_of_vulnerability/transcript",
    "talk-sinek": _T + "simon_sinek_how_great_leaders_inspire_action/transcript",
    "talk-veitch": _T + "james_veitch_this_is_what_happens_when_you_reply_to_spam_email/transcript",
    "talk-waldinger": _T + "robert_waldinger_what_makes_a_good_life_lessons_from_the_longest_study_on_happiness/transcript",
    "talk-gates": _T + "bill_gates_the_next_outbreak_we_re_not_ready/transcript",
    "interview-eagleman": _TI + "unlocking-the-mysteries-of-our-brain-eagleman-transcript",
    "interview-schur": _TI + "michael-schur-on-every-moral-question-ever-transcript",
    "interview-yong": _TI + "ed-yong-animal-senses-reveal-the-world-around-us-transcript",
    "interview-munroe": _TI + "randall-munroe-answers-your-wildest-questions-transcript",
    "interview-hassabis": _TI + "deepminds-demis-hassabis-on-the-future-of-ai-transcript",
    "interview-mingling": _A + "social/social-skills/podcast-1138-the-lost-art-of-mingling-how-to-talk-to-anyone-anywhere/",
    "interview-skill": _A + "character/self-improvement/podcast-1134-the-one-skill-a-year-plan-for-a-more-interesting-life/",
    # A second round, found by searching: opening monologues, long desk pieces from a
    # news-comedy show, and solo podcast episodes.
    "monologue-kimmel": _C + "jimmy-kimmel-delivers-first-monologue-since-returning-transcript/",
    "monologue-colbert": _C + "capitol-building-assault-stephen-colbert-monologue/",
    "monologue-meyers": _C + "end-of-trump-presidency-late-night-with-seth-meyers-transcript/",
    "desk-publicmedia": "https://scrapsfromtheloft.com/tv-series/public-media-last-week-tonight-with-john-oliver-transcript/",
    "desk-prisonheat": "https://scrapsfromtheloft.com/tv-series/prison-heat-last-week-tonight-with-john-oliver-transcript/",
    "desk-juries": _C + "juries-last-week-tonight-with-john-oliver-transcript/",
    "desk-tobacco": _C + "tobacco-last-week-tonight-with-john-oliver-transcript/",
    "solo-reminders": "https://podscripts.co/podcasts/the-mel-robbins-podcast/8-things-you-need-to-hear-right-now-that-make-a-surprisingly-huge-difference",
    "solo-stuck": "https://www.warriorbabe.com/mindset/how-to-stop-feeling-stuck-and-start-showing-up-for-yourself",
    "solo-emergence": "https://preposterousuniverse.com/podcast/2024/11/11/295-solo-emergence-and-layers-of-reality/",
    "solo-transition": "https://www.preposterousuniverse.com/podcast/2024/03/25/270-solo-the-coming-transition-in-how-humanity-lives/",
}
# Not fetched: podcasts.happyscribe.com (The Daily Show) and melrobbins.com answer 403 to scripts.


def _embedded_transcript(html: str) -> str:
    """A stage talk's transcript, from the JSON the page carries (the visible page has none)."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    paras: list[str] = []

    def walk(o) -> None:
        if isinstance(o, dict):
            if isinstance(o.get("cues"), list):
                paras.append(" ".join(c.get("text", "").replace("\n", " ") for c in o["cues"] if isinstance(c, dict)))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        elif isinstance(o, str) and o.startswith("{") and '"cues"' in o:
            try:
                walk(json.loads(o))
            except ValueError:
                pass

    if m:
        walk(json.loads(m.group(1)))
    return "\n\n".join(p for p in paras if p.strip())


def fetch(out: pathlib.Path) -> None:
    import httpx

    from app.sources import html_to_text

    out.mkdir(parents=True, exist_ok=True)
    with httpx.Client(headers={"User-Agent": UA, "Accept-Language": "en"}, follow_redirects=True, timeout=30) as c:
        for name, url in PAGES.items():
            try:
                res = c.get(url)
                text = _embedded_transcript(res.text) if name.startswith("talk-") else html_to_text(res.text)[1]
                (out / f"{name}.txt").write_text(text, encoding="utf-8")
                print(f"{res.status_code} {name:22} {len(text.split()):>6} words")
            except Exception as exc:  # noqa: BLE001  a page that fails is reported, the rest carry on
                print(f"ERR {name}: {exc!r}")
            time.sleep(1.0)       # one page a second: a handful of pages, politely


def _words(s: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9'’]+", s)


def _pct(n: int, d: int) -> str:
    return f"{100 * n / d:.0f}%" if d else "-"


def _solo(name: str, text: str) -> None:
    laugh = r"\((?:[^)]*?)(?:laughter|laughs)[^)]*\)"
    laughs = len(re.findall(laugh, text, re.I))
    first = re.search(laugh, text, re.I)
    clean = re.sub(r"\([^)]{0,40}\)|\[[^\]]{0,80}\]", " ", text)
    w = _words(clean)
    sents = [x for x in re.split(r"(?<=[.!?])\s+", clean) if _words(x)]
    lens = [len(_words(x)) for x in sents]
    c = Counter(x.lower() for x in w)
    mins = len(w) / WPM
    print(f"{name:20} {len(w):5}w {mins:4.1f}min | sentence median {st.median(lens):4.1f} "
          f"<=6w {_pct(sum(n <= 6 for n in lens), len(lens)):>4} >=30w {_pct(sum(n >= 30 for n in lens), len(lens)):>4} | "
          f"questions {_pct(sum(x.strip().endswith('?') for x in sents), len(sents)):>4} | "
          f"you {100 * (c['you'] + c['your']) / len(w):.1f} I {100 * (c['i'] + c['my'] + c['me']) / len(w):.1f} "
          f"we {100 * (c['we'] + c['our'] + c['us']) / len(w):.1f} per 100w | laughs {laughs} ({laughs / mins:.1f}/min), "
          f"first at word {len(_words(text[:first.start()])) if first else '-'}")


def _turns(text: str) -> list[tuple[str, str]]:
    for pattern in (r"\[\d\d:\d\d:\d\d\]\s*([^:\n]{2,40}):",
                    r"\n([A-Z][A-Za-z.\-]+(?: [A-Z][A-Za-z.\-]+){1,2}):\s*\n"):
        parts = re.split(pattern, text)
        turns = [(parts[i].strip(), re.sub(r"\[[^\]]{0,60}\]", " ", parts[i + 1]).strip())
                 for i in range(1, len(parts) - 1, 2)]
        turns = [(s, b) for s, b in turns if _words(b)]
        if len(turns) > 10:
            return turns
    return []


def _interview(name: str, turns: list[tuple[str, str]]) -> None:
    top = [s for s, _ in Counter(s for s, _ in turns).most_common(2)]
    turns = [(s, b) for s, b in turns if s in top]
    total = {s: sum(len(_words(b)) for x, b in turns if x == s) for s in top}
    host = min(top, key=lambda s: total[s])          # the host is the one who talks less
    hl = [len(_words(b)) for s, b in turns if s == host]
    gl = [len(_words(b)) for s, b in turns if s != host]
    ends_q = sum(b.rstrip().endswith("?") for s, b in turns if s == host)
    openers = Counter((_words(b) or [""])[0].lower() for s, b in turns if s == host)
    print(f"{name:20} host {host[:16]:16} {_pct(total[host], sum(total.values())):>4} of words | host turn median "
          f"{st.median(hl):3.0f}w, <=12w {_pct(sum(n <= 12 for n in hl), len(hl)):>4}, ends on ? {_pct(ends_q, len(hl)):>4} | "
          f"guest turn median {st.median(gl):3.0f}w, p90 {sorted(gl)[int(.9 * len(gl))]:3}w | "
          f"host opens with {[w for w, _ in openers.most_common(5)]}")


def _latenight(name: str, text: str) -> None:
    utt = re.findall(r"\d\d:\d\d\s*\n\s*Speaker \w+\s*\n\s*(.+)", text.split("Full Transcript", 1)[-1])
    if not utt:
        print(f"{name:20} no utterances found")
        return
    lens = [len(_words(u)) for u in utt]
    print(f"{name:20} {len(utt):3} utterances | median {st.median(lens):4.1f}w | <=5w {_pct(sum(n <= 5 for n in lens), len(lens)):>4} "
          f">=25w {_pct(sum(n >= 25 for n in lens), len(lens)):>4} | with a question {_pct(sum('?' in u for u in utt), len(utt)):>4}")


_DESK_HOSTS = ("john", "stephen", "seth", "jimmy")


def _desk(name: str, text: str) -> None:
    """A host at a desk between clips: how long the host runs, how the sentences go, and how
    often a joke turns back to the point. A paragraph tagged with anyone else is a clip."""
    host: list[str] = []
    stretches: list[int] = []
    run = clip_words = host_words = 0
    mine = True
    for para in (p.strip() for p in text.split("\n\n") if p.strip()):
        m = re.match(r"^(?:\[([^\]]+)\]|([A-Za-z .'\-]{2,30}):)\s", para)
        tag = (m.group(1) or m.group(2)).lower() if m else None
        if "♪" in para:
            mine = False
        elif tag:
            mine = any(h in tag for h in _DESK_HOSTS)
        n = len(_words(para))
        if mine:
            run, host_words = run + n, host_words + n
            host.append(para)
        else:
            clip_words += n
            if run:
                stretches.append(run)
                run = 0
    if run:
        stretches.append(run)
    spoken = " ".join(host)
    sents = [x for x in re.split(r"(?<=[.!?])\s+", spoken) if _words(x)]
    lens = [len(_words(x)) for x in sents] or [0]
    turns_back = len(re.findall(r"(?:^|[.!?]\s+)(But|And look|Look,|Now,|The point is|And yet|Because|The thing is)", spoken))
    print(f"{name:20} host {host_words:5}w, clips {_pct(clip_words, host_words + clip_words):>4} | host run median "
          f"{st.median(stretches or [0]):4.0f}w | sentence median {st.median(lens):4.1f} "
          f"<=6w {_pct(sum(n <= 6 for n in lens), len(lens)):>4} | questions "
          f"{_pct(sum(x.strip().endswith('?') for x in sents), len(sents)):>4} | "
          f"turns back to the point {1000 * turns_back / max(1, host_words):.1f} per 1000w")


def stats(folder: pathlib.Path) -> None:
    for prefix, label in (("talk-", "STAGE TALKS"), ("speech-", "SPEECHES (each page also carries the blog's own intro)"),
                          ("solo-", "SOLO PODCASTS (each page also carries some of the site's own text)"),
                          ("interview-", "LONG-FORM INTERVIEWS"), ("latenight-", "LATE NIGHT (utterances, no speaker labels)"),
                          ("monologue-", "MONOLOGUES"), ("desk-", "DESK PIECES")):
        print(f"\n== {label}")
        for f in sorted(folder.glob(f"{prefix}*.txt")):
            text = f.read_text(encoding="utf-8")
            if prefix in ("talk-", "speech-", "solo-"):
                _solo(f.stem, re.sub(r"\n\d{1,2}:\d\d(?::\d\d)?(?:\.\d)?(?: [A-Z]{2}:)?\s", " ", text))
            elif prefix in ("monologue-", "desk-"):
                _desk(f.stem, text)
            elif prefix == "interview-":
                turns = _turns(text)
                _interview(f.stem, turns) if turns else print(f"{f.stem:20} no speaker turns found")
            else:
                _latenight(f.stem, text)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("fetch", "stats"):
        raise SystemExit(__doc__)
    {"fetch": fetch, "stats": stats}[sys.argv[1]](pathlib.Path(sys.argv[2]))

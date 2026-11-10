// Explore: a deck you swipe. Each card is a pod you can hear now or a show you could make;
// right keeps it, left passes, a tap opens it. The same deck greets signed-out visitors on
// Home. Everything a swipe does, a button and a key do too (the three buttons under the
// deck; Left, Right and Enter on the deck itself), and nothing is lost by passing: the deck
// can be dealt again.
import { api } from "../api.js";
import { waiting } from "../components.js";
import { coverStyle } from "../cover.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { animate, reduced } from "../motion.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent, gelFor } from "../theme.js";
import { fmtTime, joinNames, store as local } from "../util.js";
import { appHeader, bindHeader, sleeve } from "./library.js";

const KEPT = "gp_kept";
const SWIPED = "gp_swiped";   // set by the first swipe: the deck stops showing how
const THROW = 96;          // px past which letting go throws the card
const FLICK = 0.55;        // px per ms that throws it from anywhere
const HOUSE_ACCENT = "#B8336A";

const podCard = (s) => ({
  key: `pod:${s.id}`,
  title: s.title || "Untitled pod",
  accent: s.accent,
  live: s.status === "live",
  kind: s.status === "live" ? "Live now" : s.duration_s ? `Pod, ${fmtTime(s.duration_s)}` : "Pod",
  by: [joinNames((s.hosts || []).filter(Boolean)), s.style_label].filter(Boolean).join(" · "),
  blurb: s.owner_name ? `Made by ${s.owner_name}` : "",
  open: s.status === "live" ? "Tune in" : "Listen",
  href: `/show/${s.id}`,
});

const ideaCard = (t) => {
  const path = `/new?template=${t.id}`;
  return {
    key: `idea:${t.id}`,
    title: t.label,
    accent: t.accent,
    live: false,
    kind: `Show idea, ${t.minutes} min`,
    by: joinNames(t.hosts.map((h) => h.name).filter(Boolean)),
    blurb: t.blurb,
    open: "Make it",
    href: session.signedIn ? path : loginPath(path),
  };
};

/** Pods first (anything on air leads), with a show idea after every second one. */
function deal(shows, templates, limit) {
  const pods = shows.filter((s) => ["live", "finished"].includes(s.status) && s.kind !== "cohost")
    .sort((a, b) => (b.status === "live") - (a.status === "live")).map(podCard);
  const ideas = templates.map(ideaCard);
  const out = [];
  while ((pods.length || ideas.length) && out.length < limit) {
    out.push(...pods.splice(0, 2));
    if (ideas.length) out.push(ideas.shift());
  }
  return out.slice(0, limit);
}

/** mountDeck(host): the deck, its buttons and what you kept. Returns { destroy }. */
export function mountDeck(host, { limit = 14 } = {}) {
  let cards = [];
  let at = 0;
  let kept = local.get(KEPT, []);
  let busy = false;
  let dead = false;
  host.classList.add("deck-wrap");
  setHtml(host, waiting("Dealing the deck"));

  const face = (c, depth) => html`
    <article class="xcard" data-depth="${depth}" style="--gel:${gelFor(c.accent)};--fit:${c.title.length > 52 ? 0.7 : c.title.length > 34 ? 0.82 : 1};${coverStyle(c.title, c.accent)}" ${depth ? html`aria-hidden="true"` : ""}>
      <span class="xcard-kind ${c.live ? "live" : ""}">${c.live ? html`<span class="dot"></span>` : ""}${c.kind}</span>
      <span class="xstamp keep" aria-hidden="true">Keep</span>
      <span class="xstamp pass" aria-hidden="true">Pass</span>
      <span class="xcard-text">
        <h3>${c.title}</h3>
        ${c.by ? html`<p class="xcard-by">${c.by}</p>` : ""}
        ${c.blurb ? html`<p class="xcard-blurb">${c.blurb}</p>` : ""}
      </span>
    </article>`;

  const tray = () => (kept.length ? html`
    <div class="kept">
      <div class="kept-head"><strong>Kept</strong><span class="faint small">${kept.length}</span>
        <button class="link-btn" type="button" data-clear>Clear</button></div>
      <ul class="kept-row">${kept.map((k) => html`
        <li><a class="kept-item" href="${k.href}" data-link>${sleeve({ title: k.title, accent: k.accent }, "sm")}<span class="ellipsis">${k.title}</span></a></li>`)}</ul>
    </div>` : "");

  const render = () => {
    if (dead) return;
    const c = cards[at];
    if (!c) {
      setHtml(host, html`
        <div class="deck-end">
          <h3 class="two"><span>${cards.length ? "That's the deck." : "Nothing public yet."}</span>
            <span class="ask">${kept.length ? "What you kept is below." : cards.length ? "Deal it again, or make your own." : "Be the first to make one."}</span></h3>
          <div class="row gap wrap">
            <a class="btn white" href="${session.signedIn ? "/new" : loginPath("/new")}" data-link><span class="rec-dot"></span>Make a pod</a>
            ${cards.length ? html`<button class="btn quiet" type="button" data-again>Deal again</button>` : ""}
          </div>
        </div>
        ${tray()}`);
      return;
    }
    setHtml(host, html`
      <p class="deck-hint" aria-hidden="true">
        <span class="dh pass"><b>&larr;</b> Swipe left to pass</span>
        <span class="dh keep">Swipe right to keep <b>&rarr;</b></span>
      </p>
      <div class="deck" tabindex="0" role="group" aria-roledescription="deck of cards"
        aria-label="${c.kind}: ${c.title}. Card ${at + 1} of ${cards.length}. Right arrow keeps it, left arrow passes, Enter opens it.">
        ${[2, 1, 0].map((d) => (cards[at + d] ? face(cards[at + d], d) : ""))}
      </div>
      <div class="deck-actions">
        <button class="round-btn deck-btn" type="button" data-swipe="pass" aria-label="Pass">${icon("close", 22, 2.4)}<span class="deck-lab" aria-hidden="true">Pass</span></button>
        <a class="btn white deck-open" href="${c.href}" data-link>${icon(c.open === "Make it" ? "plus" : "play", 18, 2.4)}${c.open}</a>
        <button class="round-btn deck-btn" type="button" data-swipe="keep" aria-label="Keep for later">${icon("heart", 22, 2.2)}<span class="deck-lab" aria-hidden="true">Keep</span></button>
      </div>
      <p class="deck-note">${kept.length ? "Tap a card to open it." : "Kept cards are saved in a list below. Tap a card to open it."}</p>
      <p class="sr-only" role="status" data-said></p>
      ${tray()}`);
    bindDrag(host.querySelector('.xcard[data-depth="0"]'));
    teach();
  };

  /** Until someone has swiped once, the top card shows how: it leans right (Keep), then left
   *  (Pass), the first time the deck is on screen. Touching the card stops it. */
  let taught = local.get(SWIPED, false);
  let watcher = null;
  const teach = () => {
    const deck = host.querySelector(".deck");
    if (taught || reduced() || !deck || watcher) return;
    watcher = new IntersectionObserver((seen) => {
      if (!seen.some((s) => s.isIntersecting)) return;
      watcher.disconnect();
      setTimeout(() => {
        const card = host.querySelector('.xcard[data-depth="0"]');
        if (taught || dead || busy || !card || card.classList.contains("held")) return;
        taught = true;
        const lean = (x) => `translate(${x}px, 0) rotate(${x / 18}deg)`;
        const timing = { duration: 2200, easing: "ease-in-out" };
        const runs = [
          card.animate({ transform: ["none", lean(64), lean(64), "none", lean(-64), lean(-64), "none"], offset: [0, .18, .34, .5, .68, .84, 1] }, timing),
          card.querySelector(".xstamp.keep").animate({ opacity: [0, 1, 1, 0, 0], offset: [0, .18, .34, .5, 1] }, timing),
          card.querySelector(".xstamp.pass").animate({ opacity: [0, 0, 1, 1, 0], offset: [0, .5, .68, .84, 1] }, timing),
        ];
        card.addEventListener("pointerdown", () => runs.forEach((r) => r.cancel()), { once: true });
      }, 700);
    }, { threshold: 0.6 });
    watcher.observe(deck);
  };

  const say = (text) => {
    const el = host.querySelector("[data-said]");
    if (el) el.textContent = text;
  };

  /** Throw the top card off to one side, then deal the next. */
  const swipe = async (dir, from = { x: 0, y: 0 }) => {
    const c = cards[at];
    const top = host.querySelector('.xcard[data-depth="0"]');
    if (!c || !top || busy) return;
    busy = true;
    if (!taught || !local.get(SWIPED, false)) { taught = true; local.set(SWIPED, true); }
    const sign = dir === "keep" ? 1 : -1;
    if (dir === "keep" && !kept.some((k) => k.key === c.key)) {
      kept = [{ key: c.key, title: c.title, accent: c.accent, href: c.href }, ...kept].slice(0, 12);
      local.set(KEPT, kept);
    }
    top.classList.add(dir);
    const off = Math.max(innerWidth, 600) * 0.9 * sign;
    await animate(top, [
      { transform: `translate(${from.x}px, ${from.y}px) rotate(${from.x / 18}deg)`, opacity: 1 },
      { transform: `translate(${off}px, ${from.y + 40}px) rotate(${sign * 22}deg)`, opacity: 0 },
    ], { duration: 320, easing: "cubic-bezier(.4, 0, .9, .6)", calm: [{ opacity: 1 }, { opacity: 0 }] }).finished.catch(() => {});
    at += 1;
    busy = false;
    const hadFocus = host.contains(document.activeElement);
    render();
    if (hadFocus) host.querySelector(".deck, [data-again]")?.focus({ preventScroll: true });
    say(`${dir === "keep" ? "Kept" : "Passed"} ${c.title}.${cards[at] ? ` Next: ${cards[at].title}.` : " That was the last card."}`);
  };

  function bindDrag(card) {
    if (!card) return;
    let start = null;
    let last = null;
    const stamps = { keep: card.querySelector(".xstamp.keep"), pass: card.querySelector(".xstamp.pass") };
    const place = (x, y) => {
      card.style.transform = `translate(${x}px, ${y}px) rotate(${x / 18}deg)`;
      stamps.keep.style.opacity = String(Math.max(0, Math.min(1, x / THROW)));
      stamps.pass.style.opacity = String(Math.max(0, Math.min(1, -x / THROW)));
    };
    card.addEventListener("pointerdown", (e) => {
      if (busy || (e.pointerType === "mouse" && e.button !== 0)) return;
      start = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
      last = { x: e.clientX, t: e.timeStamp, v: 0 };
      card.setPointerCapture?.(e.pointerId);
      card.classList.add("held");
    });
    card.addEventListener("pointermove", (e) => {
      if (!start) return;
      const x = e.clientX - start.x, y = (e.clientY - start.y) * 0.25;
      if (Math.abs(x) > 6) start.moved = true;
      const dt = Math.max(1, e.timeStamp - last.t);
      last = { x: e.clientX, t: e.timeStamp, v: (e.clientX - last.x) / dt };
      if (start.moved) place(x, y);
    });
    const end = (e) => {
      if (!start) return;
      const x = e.clientX - start.x, y = (e.clientY - start.y) * 0.25;
      const { moved } = start;
      start = null;
      card.classList.remove("held");
      if (e.type === "pointercancel") return settle(x, y);
      if (!moved) return navigate(cards[at].href);           // a tap opens it
      const thrown = Math.abs(x) > THROW || (Math.abs(last.v) > FLICK && Math.sign(last.v) === Math.sign(x));
      if (thrown && !reduced()) return swipe(x > 0 ? "keep" : "pass", { x, y });
      if (thrown) return swipe(x > 0 ? "keep" : "pass");
      settle(x, y);
    };
    const settle = (x, y) => {
      card.style.transform = "";
      stamps.keep.style.opacity = stamps.pass.style.opacity = "";
      animate(card, [{ transform: `translate(${x}px, ${y}px) rotate(${x / 18}deg)` }, { transform: "none" }], { spring: "snappy", fill: "none", calm: null });
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  const onClick = (e) => {
    const b = e.target.closest("[data-swipe]");
    if (b) return swipe(b.dataset.swipe);
    if (e.target.closest("[data-again]")) {
      at = 0;
      render();
      host.querySelector(".deck")?.focus({ preventScroll: true });
    } else if (e.target.closest("[data-clear]")) {
      kept = [];
      local.set(KEPT, kept);
      render();
    }
  };
  const onKey = (e) => {
    if (!e.target.closest(".deck") || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowRight") swipe("keep");
    else if (e.key === "ArrowLeft") swipe("pass");
    else if (e.key === "Enter" && cards[at]) navigate(cards[at].href);
    else return;
    e.preventDefault();
  };
  host.addEventListener("click", onClick);
  host.addEventListener("keydown", onKey);

  api.listShows("public").catch(() => ({ shows: [] })).then(({ shows }) => {
    cards = deal(shows || [], session.options.templates || [], limit);
    render();
  });

  return {
    destroy() {
      dead = true;
      watcher?.disconnect();
      host.removeEventListener("click", onClick);
      host.removeEventListener("keydown", onKey);
    },
  };
}

/** "/explore": the deck, with the whole catalogue one link away. */
export async function exploreView(root) {
  applyAccent(document.documentElement, HOUSE_ACCENT);
  const el = document.createElement("div");
  el.className = "house-page explore";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="explore-main">
      <div class="page-title"><h1 class="two"><span>Find something to hear.</span> <span class="ask">Right to keep it, left to pass.</span></h1></div>
      <div data-deck></div>
      <p class="explore-more"><a class="btn link" href="/discover" data-link>Browse every public pod</a></p>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const deck = mountDeck(el.querySelector("[data-deck]"));
  return { unmount() { offHead(); deck.destroy(); } };
}

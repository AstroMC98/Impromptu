// /briefings: your personal briefings. A private pod made just for you from the sites
// you monitor, the links you watch and the topics you care about, in a template you
// pick or make. On demand by default, or ready every morning at a time you set. Only
// you can hear them; they're never listed with your pods and are deleted after 48 h.
import { api } from "../api.js";
import { unlockAudio } from "../audio/context.js";
import { material, searchSuggestions, waiting } from "../components.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent } from "../theme.js";
import { confirmSheet } from "../ui.js";
import { fmtAgo, fmtTime, toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SECTIONS = [
  ["watchlist", "Watchlist roundup", "What's new on the sites and links you watch"],
  ["deep_dive", "Deep-dive", "One of your topics, explored properly"],
  ["quick_hits", "Quick hits", "Three fast takes on your topics"],
  ["try_today", "Try this today", "One small, practical thing to try"],
  ["custom", "Your own segment", "You name it and say what it covers"],
];
const SECTION_LABEL = Object.fromEntries(SECTIONS.map(([id, label]) => [id, label]));
const MODES = [["auto", "Work it out"], ["site", "New posts on a site"], ["page", "Changes to this page"],
  ["search", "Search the news"]];
const ACCENT = "#2E6F9E";
const REFRESH_MS = 8000;

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const creditsFor = (minutes, per) => Math.max(1, Math.ceil(minutes / per));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// Links come from other people's sites and feeds: only ever http(s).
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u || ""; } };
const when = (epoch) => new Date(epoch * 1000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
// Google asks apps to show the Search Suggestions that come with grounded results.
const suggestions = searchSuggestions;

export async function briefingsView(root) {
  if (!session.signedIn) {
    navigate(loginPath("/briefings"), { replace: true });
    return null;
  }
  applyAccent(document.documentElement, ACCENT);
  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide intro-page briefings">
      <div class="page-title"><div class="col">
        <h1 class="two">Your briefing.<span class="ask">Made just for you.</span></h1>
        <p class="muted brief-lede">A private pod from the sites you monitor, the links you watch and the topics you care about.
          Only you can hear it, and it's deleted after two days.</p>
      </div></div>
      <div class="intro-form brief-form">
        <section class="intro-sec" data-list-sec hidden aria-labelledby="bl-h">
          <h2 id="bl-h" class="create-h2 first">Ready for you</h2>
          <div data-list></div>
        </section>
        <section class="intro-sec" aria-labelledby="bt-h">
          <div class="row brief-h-row"><h2 id="bt-h" class="create-h2 grow">Pick a template</h2>
            <button class="btn quiet small-btn" type="button" data-new-template>${icon("plus", 14, 2.6)}New template</button></div>
          <div class="btile-grid" role="radiogroup" aria-label="Template" data-pick></div>
          <div class="row gap wrap brief-pick-acts" data-pick-acts></div>
        </section>
        <section class="intro-sec" aria-labelledby="bn-h">
          <h2 id="bn-h" class="create-h2">How long</h2>
          <div data-length></div>
        </section>
        <section class="intro-sec" aria-labelledby="bw-h">
          <h2 id="bw-h" class="create-h2">Your watchlist</h2>
          <p class="muted small">Sites to monitor for new posts, links to watch for changes (a pricing page, a status page, an
            agenda), and searches to follow in the news. Each briefing reports what's new since the last one.</p>
          <div data-watch></div>
        </section>
        <section class="intro-sec" aria-labelledby="bs-h">
          <h2 id="bs-h" class="create-h2">Every morning</h2>
          <div class="brief-sched" data-schedule></div>
        </section>
        <aside class="intro-side" aria-label="The briefing you'll get">
          <div class="intro-stage stage bstage" data-stage>${material()}</div>
          <div class="intro-go" data-make>${waiting()}</div>
        </aside>
      </div>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);

  const st = {
    data: null, watches: [], personas: [], styles: [],
    pick: { template: "", minutes: 0 }, busy: false,
  };
  const templates = () => [...(st.data?.premade || []), ...(st.data?.templates || [])];
  const templateById = (tid) => templates().find((t) => t.id === tid);

  // ---- make one now -------------------------------------------------------------------------

  const templateOptions = (selected) => html`
    <optgroup label="Premade">${(st.data.premade || []).map((t) => html`
      <option value="${t.id}" ${t.id === selected ? "selected" : ""}>${t.name}</option>`)}</optgroup>
    ${st.data.templates.length ? html`<optgroup label="Yours">${st.data.templates.map((t) => html`
      <option value="${t.id}" ${t.id === selected ? "selected" : ""}>${t.name}</option>`)}</optgroup>` : ""}`;

  const lengthChips = (selected, attr) => html`
    <div class="chips" role="group" aria-label="Length">${st.data.lengths.map((m) => html`
      <button type="button" class="chip" ${attr}="${m}" aria-pressed="${m === selected}">${m} min
        <span class="chip-sub">${plural(creditsFor(m, st.data.minutes_per_credit), "credit")}</span></button>`)}</div>`;

  const renderMake = () => {
    const d = st.data;
    const t = templateById(st.pick.template) || d.premade[0];
    st.pick.template = t.id;
    st.pick.minutes = st.pick.minutes || t.minutes || 5;
    const cost = creditsFor(st.pick.minutes, d.minutes_per_credit);
    const mine = new Set(d.templates.map((x) => x.id));
    const tile = (x) => html`
      <button type="button" role="radio" class="btile" data-pick-template="${x.id}" aria-checked="${x.id === t.id ? "true" : "false"}">
        <span class="style-swatch" style="--tile:${x.accent || ACCENT}" aria-hidden="true"></span>
        <span class="btile-text"><strong>${x.name}${mine.has(x.id) ? html`<span class="btile-tag">Yours</span>` : ""}</strong>
          <span class="btile-say">${x.blurb || sectionsLine(x)}</span>
          <span class="btile-facts">${x.hosts.map((h) => h.name).join(" & ")} · ${x.minutes} min</span></span>
      </button>`;
    setHtml(el.querySelector("[data-pick]"), html`${d.templates.map(tile)}${d.premade.map(tile)}`);
    setHtml(el.querySelector("[data-pick-acts]"), mine.has(t.id) ? html`
      <button class="btn quiet small-btn" type="button" data-edit-template="${t.id}">${icon("edit", 14)}Edit ${t.name}</button>
      <button class="btn link danger-text" type="button" data-del-template="${t.id}">Delete it</button>`
      : html`<button class="btn quiet small-btn" type="button" data-copy-template="${t.id}">${icon("edit", 14)}Make ${t.name} your own</button>`);
    setHtml(el.querySelector("[data-length]"), lengthChips(st.pick.minutes, "data-mk-len"));
    const stage = el.querySelector("[data-stage]");
    applyAccent(stage, t.accent || ACCENT);
    const run = (t.sections || []).map((s) => (s === "custom" ? t.custom_title || "Your segment" : SECTION_LABEL[s]));
    setHtml(stage, html`
      ${material()}
      <span class="intro-air"><i aria-hidden="true"></i>Your briefing</span>
      <div class="col bstage-who"><strong class="pstage-name">${t.name}</strong>
        <span class="pstage-facts">${t.hosts.map((h) => h.name).join(" & ")} · ${st.pick.minutes} min</span></div>
      <ol class="bstage-run">${run.map((label, i) => html`<li><b>${i + 1}</b>${label}</li>`)}</ol>
      <p class="intro-music">${d.watches
        ? `${plural(d.waiting, "update")} waiting from ${d.watches === 1 ? "1 watched site or link" : `${d.watches} watched sites and links`}.`
        : "Your watchlist is empty, so this one is all about your topics."}</p>`);
    setHtml(el.querySelector("[data-make]"), html`
      <div class="watch-check" data-check role="status" aria-live="polite" ${st.busy && st.watches.length ? "" : "hidden"}></div>
      <p class="error" role="alert" data-make-error></p>
      <button class="btn white big block" type="button" data-make-go ${st.busy ? "disabled" : ""}>
        ${st.busy ? html`<span class="lamp chase" aria-hidden="true"></span>${st.watches.length ? "Checking your watchlist…" : "Getting it ready…"}`
          : html`${icon("play", 18, 2.4)}Make my briefing · ${plural(cost, "credit")}`}</button>
      <p class="faint small brief-note">It goes live as it's made, so you can cut in with a question any time.
        You have ${plural(session.credits, "credit")}.</p>`);
    renderCheck();
  };

  // While a briefing is made, each watch's lamp lights as it's checked (the page polls the
  // watchlist): amber with its count of new updates, or dark with nothing new.
  const checkState = (w) => {
    if (w.paused) return { lamp: "", says: "Paused" };
    const due = st.checkFrom - (w.last_checked || 0) >= st.recheck;
    if (due && (w.last_checked || 0) < st.checkFrom) return { lamp: "chase", says: "Checking" };
    if (w.status && w.status !== "ok") return { lamp: "red", says: "Couldn't check" };
    return w.waiting ? { lamp: "amber", says: `${w.waiting} new` } : { lamp: "", says: "Nothing new" };
  };
  const renderCheck = () => {
    const box = el.querySelector("[data-check]");
    if (!box || box.hidden) return;
    setHtml(box, html`<ul>${st.watches.map((w) => {
      const s = checkState(w);
      const pop = s.lamp === "amber" && !st.lit.has(w.id);   // a lamp pops on once, not on every poll
      if (pop) st.lit.add(w.id);
      return html`<li class="wc-row ${s.lamp} ${pop ? "pop" : ""}"><span class="lamp ${s.lamp}" aria-hidden="true"></span>
        <span class="ellipsis">${w.kind === "search" ? `“${w.query || w.title}”` : w.label || w.title || hostOf(w.url)}</span>
        <span class="wc-says">${s.says}</span></li>`;
    })}</ul>`);
  };

  // ---- the schedule ---------------------------------------------------------------------------

  const renderSchedule = () => {
    const d = st.data;
    const s = st.sched;
    const t = templateById(s.template_id) || d.premade[0];
    const cost = creditsFor(s.minutes, d.minutes_per_credit);
    const days = s.days.length === 7 ? "every day" : s.days.join() === "0,1,2,3,4" ? "on weekdays"
      : `on ${s.days.map((i) => DAYS[i]).join(", ")}`;
    setHtml(el.querySelector("[data-schedule]"), html`
      <div class="switch-row"><span class="col"><strong>Have one ready every morning</strong>
        <span class="faint small">${s.enabled ? "On: one is waiting at the time you set." : "Off: you make them when you want them."}</span></span>
        <button type="button" class="switch" role="switch" aria-checked="${s.enabled}" aria-label="Have one ready on a schedule" data-sched-toggle></button></div>
      ${s.enabled ? html`
        <div class="field-pair">
          <span class="col"><label class="field-label" for="sc-time">Ready by</label>
            <input id="sc-time" class="field" type="time" value="${s.time}" required></span>
          <span class="col"><label class="field-label" for="sc-template">Template</label>
            <select id="sc-template" class="field">${templateOptions(t.id)}</select></span>
        </div>
        <p class="field-label">Days</p>
        <div class="chips day-chips" role="group" aria-label="Days">${DAYS.map((name, i) => html`
          <button type="button" class="chip" data-day="${i}" aria-pressed="${s.days.includes(i)}">${name}</button>`)}</div>
        <p class="field-label">Length</p>
        ${lengthChips(s.minutes, "data-sc-len")}
        <p class="faint small">Made ${Math.round(d.lead_minutes)} minutes ahead and ready to play offline-fast.
          Each one costs ${plural(cost, "credit")}, charged when it's made; if you're out of credits that day, it's skipped.
          Times are ${browserZone()}.</p>
        <p class="error" role="alert" data-sched-error></p>
        <button class="btn white block" type="button" data-sched-save>Save · ready ${days} at ${s.time}</button>` : ""}
      ${d.schedule.enabled && d.next_ready_by ? html`<p class="muted small">${icon("check", 14, 2.6)} Next one ready by ${when(d.next_ready_by)}.</p>` : ""}
      ${d.last?.error ? html`<p class="error small">Last time: ${d.last.error}</p>` : ""}`);
  };

  // ---- your briefings -------------------------------------------------------------------------

  const statusOf = (b) => {
    if (b.rendering) return html`<span class="pill wait">Getting it ready…</span>`;
    if (b.status === "live") return html`<span class="badge live small"><span class="dot"></span>Live</span>`;
    if (b.status === "finished" && b.has_audio) return html`<span class="pill in">${b.briefing.scheduled ? "Ready" : "Saved"}</span>`;
    return html`<span class="pill done">Didn't finish</span>`;
  };

  const renderList = () => {
    const list = st.data.briefings;
    const now = Date.now() / 1000;
    setHtml(el.querySelector("[data-list]"), list.length ? html`<ul class="brief-list">${list.map((b) => {
      const left = Math.max(1, Math.ceil(((b.expires_at || now) - now) / 3600));
      const inner = html`
        <span class="brief-cover" style="--tile:${b.accent || ACCENT}" aria-hidden="true">${icon("sparkle", 20, 2)}</span>
        <span class="col grow"><strong class="ellipsis">${b.title || "Your briefing"}</strong>
          <span class="muted small">${b.briefing.template || "Briefing"} · ${b.duration_s ? fmtTime(b.duration_s) : `${b.minutes} min`}
            · ${plural((b.briefing.updates || []).length, "update")} · made ${fmtAgo(b.created_at)}</span>
          <span class="faint small">Deleted in ${left} h</span></span>
        ${statusOf(b)}`;
      const searched = b.briefing.search_suggestions || [];
      return html`<li class="brief-row">
        ${b.rendering ? html`<span class="brief-main">${inner}</span>`
          : html`<a class="brief-main" href="/show/${b.id}" data-link>${inner}</a>`}
        <button class="icon-btn small" type="button" data-del-briefing="${b.id}" aria-label="Delete ${b.title}">${icon("trash", 18)}</button>
        ${searched.length ? html`<div class="brief-searches"><span class="faint small">Searched with Google</span>
          ${searched.map((m) => suggestions(m))}</div>` : ""}</li>`;
    })}</ul>` : "");
    el.querySelector("[data-list-sec]").hidden = !list.length;
  };

  // ---- the watchlist ----------------------------------------------------------------------------

  const watchKind = (w) => (w.kind === "search" ? "News search, with Google" : w.kind === "page" ? "Changes to this page"
    : w.feed_url ? "New posts (feed)" : "New links on the page");
  const watchIcon = (w) => ({ search: "search", page: "file" }[w.kind] || "globe");
  const watchStatus = (w) => {
    if (w.paused) return html`<span class="warn small">Paused${w.note ? `: ${w.note}` : ""}</span>`;
    if (w.status && w.status !== "ok") return html`<span class="warn small">${w.note}</span>`;
    const parts = [];
    if (w.waiting) parts.push(`${plural(w.waiting, "update")} for your next briefing`);
    if (w.last_changed) parts.push(`changed ${fmtAgo(w.last_changed)}`);
    if (w.last_checked) parts.push(`checked ${fmtAgo(w.last_checked)}`);
    return html`<span class="faint small">${parts.join(" · ") || "Not checked yet"}</span>`;
  };

  const renderWatch = (mode = el.querySelector("[data-watch-mode][aria-pressed=true]")?.dataset.watchMode || "auto") => {
    const max = st.watchMax;
    setHtml(el.querySelector("[data-watch]"), html`
      <form class="card watch-add" data-watch-form>
        <label class="sr-only" for="w-url">A site, a link, or words to search for</label>
        <div class="row gap wrap">
          <input id="w-url" class="field grow" type="text" required autocapitalize="off" autocomplete="off" spellcheck="false"
            placeholder="A site, a blog, a page, or words to search the news for" maxlength="2000">
          <button class="btn white" type="submit" data-watch-add ${st.watches.length >= max ? "disabled" : ""}>${icon("plus", 16, 2.6)}Watch</button>
        </div>
        <div class="chips" role="group" aria-label="What to watch for">${MODES.map(([id, label]) => html`
          <button type="button" class="chip" data-watch-mode="${id}" aria-pressed="${id === mode}">${label}</button>`)}</div>
        <p class="faint small" data-watch-msg aria-live="polite">${st.watches.length}/${max} · We check sites politely and honor
          their robots.txt. Searches use Google Search through Gemini (up to ${st.searchMax}). On air the hosts summarize
          and name the source.</p>
      </form>
      ${st.watches.length ? html`<ul class="watch-list">${st.watches.map((w) => html`
        <li class="watch-row ${w.paused ? "paused" : ""}">
          <span class="watch-ic" aria-hidden="true">${icon(watchIcon(w), 20)}</span>
          <span class="col grow">
            <strong class="ellipsis">${w.kind === "search" ? `“${w.query || w.title}”` : w.label || w.title || hostOf(w.url)}</strong>
            <span class="muted small ellipsis">${w.kind === "search" ? "" : `${hostOf(w.url)} · `}${watchKind(w)}</span>
            ${watchStatus(w)}
            ${w.pending?.length ? html`<ul class="watch-pending">${[...w.pending].sort((a, b) => b.found_at - a.found_at).slice(0, 3).map((u) => html`<li class="ellipsis small">
              ${u.kind === "changed" ? "Changed: " : "New: "}${safeUrl(u.url)
                ? html`<a href="${safeUrl(u.url)}" target="_blank" rel="noopener noreferrer nofollow">${u.title || hostOf(u.url)}</a>`
                : u.title}${w.kind === "search" && u.site ? html` <span class="faint">· ${u.site}</span>` : ""}</li>`)}</ul>` : ""}
            ${w.kind === "search" && w.suggestions ? suggestions(w.suggestions) : ""}
          </span>
          <span class="row watch-actions">
            <button class="btn chip-btn small-btn" type="button" data-watch-check="${w.id}">Check now</button>
            <button class="btn chip-btn small-btn" type="button" data-watch-pause="${w.id}">${w.paused ? "Resume" : "Pause"}</button>
            <button class="icon-btn small" type="button" data-watch-del="${w.id}" aria-label="Stop watching ${w.label || w.url}">${icon("trash", 18)}</button>
          </span></li>`)}</ul>` : html`<p class="empty">Nothing watched yet. Add a news site, a blog, a competitor's pricing page…</p>`}`);
  };

  // ---- templates -----------------------------------------------------------------------------------

  const sectionsLine = (t) => (t.sections || []).map((s) => (s === "custom" ? t.custom_title || "Your segment" : SECTION_LABEL[s])).join(" · ");
  const renderTemplates = () => {};      // the templates are the picker at the top now (renderMake)

  const renderAll = () => {
    renderMake();
    renderSchedule();
    renderList();
    renderWatch();
    renderTemplates();
  };

  // ---- loading -----------------------------------------------------------------------------------------

  const load = async () => {
    const [data, watches] = await Promise.all([api.briefings(), api.watches()]);
    st.data = data;
    st.watches = watches.watches;
    st.watchMax = watches.max;
    st.searchMax = watches.max_searches;
    st.recheck = watches.recheck_seconds || 900;
    if (!st.sched) {
      st.sched = { ...data.schedule, days: [...(data.schedule.days || [])] };
      if (!data.schedule.enabled && data.schedule.tz === "UTC") st.sched.tz = browserZone();
    }
  };
  try {
    await load();
  } catch (err) {
    setHtml(el.querySelector("[data-make]"), html`<p class="error">${err.message}</p>`);
    return { unmount() { offHead(); } };
  }
  // Back from the template page with one just saved: it's the one picked.
  const want = new URLSearchParams(location.search).get("pick");
  if (want && templateById(want)) st.pick = { template: want, minutes: templateById(want).minutes || 5 };
  renderAll();

  // While something is being made or is on air, keep the list fresh.
  const timer = setInterval(async () => {
    if (!st.data.briefings.some((b) => b.rendering || b.status === "live") || document.hidden) return;
    try {
      st.data = { ...st.data, ...(await api.briefings()) };
      renderList();
    } catch { /* try again next time */ }
  }, REFRESH_MS);

  // ---- actions -----------------------------------------------------------------------------------------

  el.addEventListener("change", (e) => {
    if (e.target.id === "mk-template") {
      st.pick = { template: e.target.value, minutes: templateById(e.target.value)?.minutes || 5 };
      renderMake();
    } else if (e.target.id === "sc-template") {
      st.sched.template_id = e.target.value;
    } else if (e.target.id === "sc-time") {
      st.sched.time = e.target.value;
      renderSchedule();
    }
  });

  el.addEventListener("submit", async (e) => {
    if (!e.target.matches("[data-watch-form]")) return;
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector("#w-url");
    const msg = form.querySelector("[data-watch-msg]");
    const button = form.querySelector("[data-watch-add]");
    const mode = form.querySelector("[data-watch-mode][aria-pressed=true]")?.dataset.watchMode || "auto";
    button.disabled = true;
    msg.textContent = "Looking at it…";
    try {
      const r = await api.addWatch({ url: input.value.trim(), mode });
      st.watches.push(r.watch);
      st.data.watches = st.watches.length;
      st.data.waiting += r.watch.waiting;
      renderWatch(mode);
      renderMake();
      toast(`${r.found}.`);
    } catch (err) {
      msg.textContent = err.message;
      button.disabled = false;
    }
  });

  el.addEventListener("click", async (e) => {
    const t = e.target;
    const lenMk = t.closest("[data-mk-len]");
    const lenSc = t.closest("[data-sc-len]");
    const day = t.closest("[data-day]");
    const mode = t.closest("[data-watch-mode]");
    const pickT = t.closest("[data-pick-template]");
    if (pickT) {
      st.pick = { template: pickT.dataset.pickTemplate, minutes: templateById(pickT.dataset.pickTemplate)?.minutes || 5 };
      renderMake();
      el.querySelector(`[data-pick-template="${CSS.escape(st.pick.template)}"]`)?.focus({ preventScroll: true });
    } else if (lenMk) {
      st.pick.minutes = Number(lenMk.dataset.mkLen);
      renderMake();
    } else if (lenSc) {
      st.sched.minutes = Number(lenSc.dataset.scLen);
      renderSchedule();
    } else if (day) {
      const i = Number(day.dataset.day);
      st.sched.days = st.sched.days.includes(i) ? st.sched.days.filter((x) => x !== i) : [...st.sched.days, i].sort();
      renderSchedule();
    } else if (mode) {
      for (const b of el.querySelectorAll("[data-watch-mode]")) b.setAttribute("aria-pressed", String(b === mode));
    } else if (t.closest("[data-make-go]")) {
      await makeNow();
    } else if (t.closest("[data-sched-toggle]")) {
      st.sched.enabled = !st.sched.enabled;
      if (!st.sched.enabled) await saveSchedule();   // turning it off takes effect at once
      else renderSchedule();
    } else if (t.closest("[data-sched-save]")) {
      await saveSchedule();
    } else if (t.closest("[data-del-briefing]")) {
      const id = t.closest("[data-del-briefing]").dataset.delBriefing;
      if (!(await confirmSheet({ title: "Delete this briefing?", message: "It's gone for good.", confirm: "Delete", danger: true }))) return;
      await api.deleteShow(id).catch((err) => toast(err.message));
      st.data.briefings = st.data.briefings.filter((b) => b.id !== id);
      renderList();
    } else if (t.closest("[data-watch-check]")) {
      const b = t.closest("[data-watch-check]");
      b.disabled = true;
      b.textContent = "Checking…";
      try {
        const r = await api.checkWatch(b.dataset.watchCheck);
        st.watches = st.watches.map((w) => (w.id === r.watch.id ? r.watch : w));
        toast(r.new ? `${plural(r.new, "new update")} for your next briefing.` : r.watch.status === "ok" ? "Nothing new yet." : r.watch.note);
      } catch (err) {
        toast(err.message);
      }
      renderWatch();
    } else if (t.closest("[data-watch-pause]")) {
      const id = t.closest("[data-watch-pause]").dataset.watchPause;
      const w = st.watches.find((x) => x.id === id);
      try {
        const r = await api.updateWatch(id, { paused: !w.paused });
        st.watches = st.watches.map((x) => (x.id === id ? r.watch : x));
        renderWatch();
      } catch (err) {
        toast(err.message);
      }
    } else if (t.closest("[data-watch-del]")) {
      const id = t.closest("[data-watch-del]").dataset.watchDel;
      const w = st.watches.find((x) => x.id === id);
      if (!(await confirmSheet({ title: `Stop watching ${w.label || hostOf(w.url)}?`, message: "Updates it found that no briefing has used yet go too.", confirm: "Stop watching", danger: true }))) return;
      await api.removeWatch(id).catch((err) => toast(err.message));
      st.watches = st.watches.filter((x) => x.id !== id);
      st.data.watches = st.watches.length;
      renderWatch();
      renderMake();
    } else if (t.closest("[data-new-template]")) {
      navigate("/briefings/template");
    } else if (t.closest("[data-copy-template]")) {
      navigate(`/briefings/template?from=${encodeURIComponent(t.closest("[data-copy-template]").dataset.copyTemplate)}`);
    } else if (t.closest("[data-edit-template]")) {
      navigate(`/briefings/template?id=${encodeURIComponent(t.closest("[data-edit-template]").dataset.editTemplate)}`);
    } else if (t.closest("[data-del-template]")) {
      const tpl = templateById(t.closest("[data-del-template]").dataset.delTemplate);
      if (!(await confirmSheet({ title: `Delete ${tpl.name}?`, message: "Briefings already made with it stay.", confirm: "Delete", danger: true }))) return;
      await api.deleteBriefingTemplate(tpl.id).catch((err) => toast(err.message));
      st.data.templates = st.data.templates.filter((x) => x.id !== tpl.id);
      if (st.pick.template === tpl.id) st.pick = { template: "", minutes: 0 };
      renderAll();
    }
  });

  async function makeNow() {
    if (st.busy) return;
    st.busy = true;
    st.checkFrom = Date.now() / 1000;
    st.lit = new Set(st.watches.filter((w) => checkState(w).lamp === "amber").map((w) => w.id));
    renderMake();
    unlockAudio();   // this click lets the live briefing play as soon as it opens
    const poll = setInterval(async () => {
      try {
        st.watches = (await api.watches()).watches;
        renderCheck();
      } catch { /* the next poll will do */ }
    }, 700);
    try {
      const r = await api.makeBriefing({ template_id: st.pick.template, minutes: st.pick.minutes, tz: browserZone() });
      clearInterval(poll);
      st.watches = (await api.watches().catch(() => ({ watches: st.watches }))).watches;
      renderCheck();
      session.refresh();
      await new Promise((done) => setTimeout(done, st.watches.length ? 500 : 0));   // a beat to see the last lamps land
      navigate(`/show/${r.id}`);
    } catch (ex) {
      clearInterval(poll);
      st.busy = false;
      renderMake();
      el.querySelector("[data-make-error]").textContent = ex.message;
    }
  }

  async function saveSchedule() {
    try {
      const r = await api.setSchedule({ ...st.sched, tz: browserZone() });
      st.sched = { ...r.schedule, days: [...r.schedule.days] };
      st.data.schedule = r.schedule;
      st.data.next_ready_by = r.next_ready_by;
      st.data.last = null;
      renderSchedule();
      toast(r.schedule.enabled ? `Your briefing will be ready by ${when(r.next_ready_by)}.` : "No schedule: make one whenever you want.");
    } catch (ex) {
      const slot = el.querySelector("[data-sched-error]");
      if (slot) slot.textContent = ex.message;
      else toast(ex.message);
    }
  }

  return { unmount() { offHead(); clearInterval(timer); } };
}

// /briefings/template — make or edit a briefing template as a page of choices:
//   ?id=<yours>   edit one of your templates
//   ?from=<id>    start from a premade one (or one of yours)
//   (neither)     a new one
// Name, who hosts (cast from the same sheet as New pod), the style, the topics you care
// about, what's in it and the usual length, with the briefing on a stage as you go.
import { api } from "../api.js";
import { openCastSheet, shape } from "../cast.js";
import { material } from "../components.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { vibeTile } from "../sheets.js";
import { applyAccent } from "../theme.js";
import { toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const ACCENT = "#2E6F9E";
const SECTIONS = [
  ["watchlist", "Watchlist roundup", "What's new on the sites and links you watch"],
  ["deep_dive", "Deep-dive", "One of your topics, explored properly"],
  ["quick_hits", "Quick hits", "Three fast takes on your topics"],
  ["try_today", "Try this today", "One small, practical thing to try"],
  ["custom", "Your own segment", "You name it and say what it covers"],
];
const KEYS = ["name", "voice", "gender", "persona", "likes", "specialties", "skills", "context"];
const hostOf = (p) => Object.fromEntries(KEYS.map((k) => [k, p?.[k] ?? (k === "voice" ? "auto" : "")]));

export async function briefingTemplateView(root, { url }) {
  if (!session.signedIn) {
    navigate(loginPath("/briefings"), { replace: true });
    return null;
  }
  const id = url.searchParams.get("id") || "";
  const from = url.searchParams.get("from") || "";
  let data, personas, styles;
  try {
    [data, personas, styles] = await Promise.all([
      api.briefings(),
      api.list("personas").then((r) => r.items).catch(() => []),
      api.list("styles").then((r) => r.items).catch(() => []),
    ]);
  } catch {
    navigate("/briefings", { replace: true });
    return null;
  }
  const all = [...(data.premade || []), ...(data.templates || [])];
  const src = all.find((t) => t.id === (id || from));
  if (id && !(data.templates || []).some((t) => t.id === id)) {
    navigate("/briefings", { replace: true });
    return null;
  }
  const presets = session.options.presets || [];
  const cast = session.options.persona_presets || [];
  const t = src || { name: "", hosts: [], sections: ["watchlist", "deep_dive"], minutes: 5, topics: "", style: "" };
  const preset = presets.find((p) => p.id === t.vibe || p.prompt === t.style);
  const mine = styles.find((s) => s.prompt === t.style);
  const state = {
    hosts: (t.hosts.length ? t.hosts : [personas[0] || cast[0]]).filter(Boolean).slice(0, 2).map(hostOf),
    style: preset ? { kind: "preset", id: preset.id } : mine ? { kind: "style", id: mine.id } : t.style ? { kind: "own" } : { kind: "preset", id: presets[0]?.id },
    sections: [...(t.sections || [])],
    minutes: t.minutes || 5,
  };
  const title = id ? ["Edit", t.name] : src ? ["Make it yours.", `Starting from ${src.name}.`] : ["A new briefing.", "Yours, every time."];

  applyAccent(document.documentElement, ACCENT);
  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide intro-page">
      <a class="btn link back-link" href="/briefings" data-link>${icon("chevronLeft", 16)}Briefings</a>
      <div class="page-title"><div class="col">
        <h1 class="two">${title[0]}<span class="ask">${title[1]}</span></h1>
      </div></div>
      <form class="intro-form" data-form>
        <section class="intro-sec">
          <h2 class="create-h2 first">Name it</h2>
          <label class="sr-only" for="bt-name">Name</label>
          <input id="bt-name" class="field intro-name" maxlength="40" required placeholder="My commute"
            value="${id ? t.name : src ? `${src.name} (mine)`.slice(0, 40) : ""}">
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">Who hosts it</h2>
          <div class="ptile-grid host-tiles" data-hosts></div>
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">Its style</h2>
          <div class="vibes" role="group" aria-label="Styles" data-vibes></div>
          <label class="sr-only" for="bt-style-text">Describe your own style</label>
          <input id="bt-style-text" class="field pill-field" maxlength="2000" placeholder="Or describe your own: calm and clear, like a friend reading you the news over coffee"
            value="${state.style.kind === "own" ? t.style : ""}">
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">Topics you care about <span class="faint">optional</span></h2>
          <label class="sr-only" for="bt-topics">Topics you care about</label>
          <textarea id="bt-topics" class="field area short" maxlength="1000" placeholder="Trail running, Spanish, the Seattle food scene, climate tech">${t.topics || ""}</textarea>
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">What's in it</h2>
          <div class="section-picks" data-sections></div>
          <div class="col gap" data-custom></div>
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">Usual length</h2>
          <div class="chips" role="group" aria-label="Usual length" data-lengths></div>
        </section>
        <aside class="intro-side" aria-label="The briefing you're making">
          <div class="intro-stage stage bstage" data-stage></div>
          <div class="intro-go">
            <p class="error" role="alert" data-error></p>
            <button class="btn white big block" type="submit">${id ? "Save" : "Save template"}</button>
            <a class="btn link" href="/briefings" data-link>Cancel</a>
          </div>
        </aside>
      </form>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (q) => el.querySelector(q);
  // The custom segment's fields keep what you typed while the rest re-renders.
  const custom = { title: t.custom_title || "", notes: t.custom_notes || "" };

  const pickedStyle = () => {
    const s = state.style;
    if (s.kind === "own") return { style: $("#bt-style-text").value.trim(), vibe: null, style_label: null, accent: t.accent || ACCENT };
    if (s.kind === "style") {
      const x = styles.find((y) => y.id === s.id);
      return x ? { style: x.prompt, vibe: null, style_label: x.name, accent: x.accent } : null;
    }
    const p = presets.find((y) => y.id === s.id);
    return p ? { style: p.prompt, vibe: p.id, style_label: p.label, accent: p.accent } : null;
  };

  const renderHosts = () => setHtml($("[data-hosts]"), html`
    ${state.hosts.map((h, i) => html`
      <div class="host-slot">
        <button type="button" class="ptile" data-host="${i}" aria-label="Change host ${i + 1}: ${h.name}">
          ${shape(h.name, 38)}
          <span class="ptile-text"><strong>${h.name}</strong><span class="ptile-say">${h.persona}</span></span>
          <span class="ptile-edit" aria-hidden="true">${icon("edit", 16)}</span>
        </button>
        ${state.hosts.length === 2 ? html`<button type="button" class="btn link" data-drop="${i}">Remove</button>` : ""}
      </div>`)}
    ${state.hosts.length < 2 ? html`
      <button type="button" class="ptile ptile-new" data-host="1">
        <span class="ptile-plus" aria-hidden="true">${icon("plus", 20, 2.4)}</span>
        <span class="ptile-text"><strong>Add a second host</strong><span class="ptile-say">Two voices trade the stories.</span></span></button>` : ""}`);
  const renderVibes = () => setHtml($("[data-vibes]"), html`
    ${presets.map((p) => vibeTile(p, state.style.kind === "preset" && state.style.id === p.id))}
    ${styles.map((s) => html`
      <button type="button" class="vibe" data-style="${s.id}" aria-pressed="${state.style.kind === "style" && state.style.id === s.id}" style="--tile:${s.accent}">
        <span class="vibe-label">${s.name}</span><span class="vibe-mine">Yours</span>
        <span class="vibe-shape" aria-hidden="true"></span>
        ${state.style.kind === "style" && state.style.id === s.id ? html`<span class="vibe-check" aria-hidden="true">${icon("check", 14, 3)}</span>` : ""}
      </button>`)}`);
  const renderSections = () => {
    setHtml($("[data-sections]"), html`${SECTIONS.map(([sid, label, desc]) => html`
      <button type="button" class="section-pick" data-section="${sid}" aria-pressed="${state.sections.includes(sid) ? "true" : "false"}">
        <span class="pick-check" aria-hidden="true">${state.sections.includes(sid) ? icon("check", 16, 3) : icon("plus", 16, 2.6)}</span>
        <span class="col"><strong>${label}</strong><span class="faint small">${desc}</span></span></button>`)}`);
    setHtml($("[data-custom]"), state.sections.includes("custom") ? html`
      <label class="field-label" for="bt-ctitle">Your segment's title</label>
      <input id="bt-ctitle" class="field" maxlength="60" required value="${custom.title}" placeholder="Spanish word of the day">
      <label class="field-label" for="bt-cnotes">What it covers</label>
      <textarea id="bt-cnotes" class="field area short" maxlength="600" placeholder="One useful word, used in a sentence about running.">${custom.notes}</textarea>` : "");
  };
  const renderLengths = () => setHtml($("[data-lengths]"), html`${data.lengths.map((m) => html`
    <button type="button" class="chip" data-len="${m}" aria-pressed="${m === state.minutes ? "true" : "false"}">${m} min</button>`)}`);
  const renderStage = () => {
    const st = pickedStyle();
    const run = state.sections.map((sid) => (sid === "custom" ? custom.title || "Your segment" : SECTIONS.find(([x]) => x === sid)?.[1]));
    const topics = $("#bt-topics").value.trim();
    applyAccent($("[data-stage]"), st?.accent || ACCENT);
    setHtml($("[data-stage]"), html`
      ${material()}
      <span class="intro-air"><i aria-hidden="true"></i>Your briefing</span>
      <div class="col bstage-who"><strong class="pstage-name">${$("#bt-name").value.trim() || "Unnamed briefing"}</strong>
        <span class="pstage-facts">${state.hosts.map((h) => h.name).join(" & ")} · ${state.minutes} min${st?.style_label ? ` · ${st.style_label}` : ""}</span></div>
      ${run.length ? html`<ol class="bstage-run">${run.map((label, i) => html`<li><b>${i + 1}</b>${label}</li>`)}</ol>`
        : html`<p class="pstage-say dim">Pick at least one thing for it to cover.</p>`}
      ${topics ? html`<p class="intro-music">About ${topics.length > 90 ? `${topics.slice(0, 88).trimEnd()}…` : topics}</p>` : ""}`);
  };

  el.addEventListener("input", (e) => {
    if (e.target.id === "bt-style-text") {
      if (e.target.value.trim()) state.style = { kind: "own" };
      else if (state.style.kind === "own") state.style = { kind: "preset", id: presets[0]?.id };
      renderVibes();
    } else if (e.target.id === "bt-ctitle") custom.title = e.target.value;
    else if (e.target.id === "bt-cnotes") custom.notes = e.target.value;
    renderStage();
  });
  el.addEventListener("click", (e) => {
    const tg = e.target;
    const host = tg.closest("[data-host]");
    const drop = tg.closest("[data-drop]");
    const vibe = tg.closest("[data-vibe]");
    const style = tg.closest("[data-style]");
    const sec = tg.closest("[data-section]");
    const len = tg.closest("[data-len]");
    if (drop) {
      state.hosts.splice(Number(drop.dataset.drop), 1);
      renderHosts();
    } else if (host) {
      const i = Number(host.dataset.host);
      openCastSheet({
        title: i ? "Second host" : "Host", host: state.hosts[i] || cast[1] || cast[0], personas,
        onDone: (next) => {
          state.hosts[i] = hostOf(next);
          renderHosts();
          renderStage();
        },
      });
      return;
    } else if (vibe || style) {
      state.style = vibe ? { kind: "preset", id: vibe.dataset.vibe } : { kind: "style", id: style.dataset.style };
      $("#bt-style-text").value = "";
      renderVibes();
    } else if (sec) {
      const sid = sec.dataset.section;
      state.sections = state.sections.includes(sid) ? state.sections.filter((x) => x !== sid)
        : SECTIONS.map(([x]) => x).filter((x) => x === sid || state.sections.includes(x));
      renderSections();
      el.querySelector(`[data-section="${sid}"]`)?.focus({ preventScroll: true });
    } else if (len) {
      state.minutes = Number(len.dataset.len);
      renderLengths();
    } else return;
    renderStage();
  });
  $("[data-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $("[data-error]");
    error.textContent = "";
    const st = pickedStyle();
    if (!st?.style) { error.textContent = "Pick a style, or describe one."; return; }
    if (!state.sections.length) { error.textContent = "Pick at least one thing for it to cover."; return; }
    const body = {
      name: $("#bt-name").value.trim(), blurb: id ? t.blurb || "" : "", hosts: state.hosts, ...st, minutes: state.minutes,
      topics: $("#bt-topics").value.trim(), sections: state.sections,
      custom_title: state.sections.includes("custom") ? custom.title.trim() : "", custom_notes: state.sections.includes("custom") ? custom.notes.trim() : "",
    };
    try {
      const saved = id ? await api.updateBriefingTemplate(id, body) : await api.createBriefingTemplate(body);
      toast(id ? "Template saved." : `${saved.name} is ready to use.`);
      navigate(`/briefings?pick=${encodeURIComponent(saved.id)}`);
    } catch (ex) {
      error.textContent = ex.message;
    }
  });

  renderHosts();
  renderVibes();
  renderSections();
  renderLengths();
  renderStage();
  return { unmount() { offHead(); } };
}

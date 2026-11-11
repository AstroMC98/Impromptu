// /personas — the speakers you cast as hosts. Two modes on one page:
//   browsing: yours and the house cast as tiles; the one you pick steps onto a small stage
//             (beside the list on a wide window, in a sheet on a phone) with what you can do;
//   editing (?edit=new, ?edit=<id>, ?from=<cast id>): a page of choices (name, voice,
//             personality, what they know, private notes) with the same stage showing who
//             you're making as you go.
import { api } from "../api.js";
import { material, waiting } from "../components.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { bindPersonaForm, GENDER_LABEL, readPersona } from "../personas.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent, callerColor } from "../theme.js";
import { confirmSheet, openSheet } from "../ui.js";
import { toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const HOUSE_ACCENT = "#6A4FB0";
const NOTES_CHARS = 20000;
const STARTERS = ["A warm expert who…", "A lovable skeptic who…", "The hype friend who…", "A dry storyteller who…"];
const TRAITS = [
  ["likes", "Likes", "Rainy days, jazz, a good debate"],
  ["specialties", "Specialties", "Marine biology, octopuses, ocean myths"],
  ["skills", "Skills", "Analogies, storytelling, gentle myth-busting"],
];
const wide = () => matchMedia("(min-width: 1024px)").matches;
const bits = (text) => String(text || "").split(",").map((s) => s.trim()).filter(Boolean);
const facts = (p) => [p.gender ? GENDER_LABEL[p.gender] : "", p.voice && p.voice !== "auto" ? `${p.voice} voice` : "Voice picked to fit"].filter(Boolean).join(" · ");

/** A host's voice shape in their own colour. */
const shape = (name, size) => {
  const c = callerColor(name || "?");
  return html`<span class="orb" style="--a:color-mix(in oklch, ${c} 42%, #fff);--b:${c};--size:${size}px" aria-hidden="true"></span>`;
};

/** One sample at a time (static/voices/<Name>.mp3, recorded by tools/build_voice_samples.py).
 *  `changed` runs whenever what's playing changes, so the screen can show it. */
function voicePlayer(changed) {
  const audio = new Audio();
  audio.preload = "none";
  const player = {
    playing: "",
    stop() {
      audio.pause();
      if (player.playing) { player.playing = ""; changed(); }
    },
    /** Play this voice, or stop it if it's the one playing. */
    toggle(voice) {
      if (!voice || voice === "auto" || player.playing === voice) return player.stop();
      player.playing = voice;
      audio.src = `/static/voices/${encodeURIComponent(voice)}.mp3`;
      audio.play().catch(() => { player.playing = ""; changed(); });
      changed();
    },
    dispose() { audio.pause(); audio.removeAttribute("src"); player.playing = ""; },
  };
  audio.addEventListener("ended", () => { player.playing = ""; changed(); });
  audio.addEventListener("error", () => { if (player.playing) { player.playing = ""; changed(); toast("Couldn't play that voice."); } });
  return player;
}

/** What goes on the stage for a persona. `tag` is the little label at the top; `playing`
 *  is the voice being heard right now, if any. */
const onStage = (p, tag, playing = "") => html`
  ${material()}
  <span class="intro-air"><i aria-hidden="true"></i>${tag}</span>
  <div class="pstage-who">${shape(p.name, 64)}
    <span class="col grow"><strong class="pstage-name">${p.name || "Unnamed host"}</strong><span class="pstage-facts">${facts(p)}</span></span>
    ${p.voice && p.voice !== "auto" ? html`<button type="button" class="round-btn pstage-hear ${playing === p.voice ? "on" : ""}" data-hear="${p.voice}"
      aria-label="${playing === p.voice ? "Stop" : `Hear the ${p.voice} voice`}">${icon(playing === p.voice ? "pause" : "play", 18)}</button>` : ""}</div>
  <p class="pstage-say">${p.persona || "Who are they? Give them an attitude, a quirk, a way of talking."}</p>
  ${bits(p.specialties).length || bits(p.likes).length ? html`<div class="pstage-chips">${bits(p.specialties).concat(bits(p.likes)).slice(0, 6).map((b) => html`<span>${b}</span>`)}</div>` : ""}
  ${p.context ? html`<span class="pstage-notes">${icon("lock", 13)}Has private notes</span>` : ""}`;

export async function personasView(root, { url }) {
  if (!session.signedIn) {
    navigate(loginPath("/personas"), { replace: true });
    return null;
  }
  applyAccent(document.documentElement, HOUSE_ACCENT);
  const editing = url.searchParams.get("edit");
  const from = url.searchParams.get("from");
  return editing || from ? editor(root, { id: editing && editing !== "new" ? editing : "", from }) : browser(root);
}

// ---- browsing ---------------------------------------------------------------------------

async function browser(root) {
  const cast = session.options.persona_presets || [];
  let mine = null;
  let picked = null;            // { kind: "mine" | "cast", id }
  let filter = "";
  let dead = false;
  let sheetStage = null;        // the stage inside the phone sheet while it's open: { node, p, tag }
  const voice = voicePlayer(() => {
    if (dead) return;
    renderStage();
    if (sheetStage) setHtml(sheetStage.node, onStage(sheetStage.p, sheetStage.tag, voice.playing));
  });

  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide personas-page">
      <div class="page-title row">
        <div class="col grow"><h1 class="two">Your personas.<span class="ask">The voices you cast.</span></h1></div>
        <a class="btn white" href="/personas?edit=new" data-link>${icon("plus", 16, 2.6)}New persona</a>
      </div>
      <div class="personas-body">
        <div class="personas-lists">
          <section class="intro-sec" aria-labelledby="pm-h">
            <h2 id="pm-h" class="create-h2 first">Yours</h2>
            <div data-mine>${waiting()}</div>
          </section>
          <section class="intro-sec" aria-labelledby="pc-h">
            <h2 id="pc-h" class="create-h2">The cast</h2>
            <p class="muted small">Eighteen house hosts. Cast them as they are in any pod, or make one your own.</p>
            <div class="chips" role="group" aria-label="Show">
              ${[["", "Everyone"], ["female", "Female"], ["male", "Male"]].map(([v, l]) => html`<button class="chip" type="button" data-filter="${v}" aria-pressed="${v === "" ? "true" : "false"}">${l}</button>`)}
            </div>
            <div class="ptile-grid" data-cast></div>
          </section>
        </div>
        <aside class="personas-side" aria-label="The persona you picked"><div class="intro-stage stage pstage" data-stage></div><div class="pstage-acts" data-acts></div></aside>
      </div>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (s) => el.querySelector(s);

  const find = (pick) => (pick?.kind === "mine" ? (mine || []).find((p) => p.id === pick.id) : cast.find((p) => p.id === pick?.id)) || null;
  const tile = (p, kind) => html`
    <button type="button" class="ptile" data-pick="${kind}:${p.id}" aria-pressed="${picked?.kind === kind && picked.id === p.id ? "true" : "false"}">
      ${shape(p.name, 38)}
      <span class="ptile-text"><strong>${p.name}</strong><span class="ptile-say">${p.persona}</span><span class="ptile-facts">${facts(p)}</span></span>
    </button>`;

  const acts = (p, kind) => html`
    ${kind === "mine" ? html`<a class="btn white big block" href="/personas?edit=${encodeURIComponent(p.id)}" data-link>${icon("edit", 18)}Edit</a>`
      : html`<a class="btn white big block" href="/personas?from=${encodeURIComponent(p.id)}" data-link>Make ${p.name.split(" ")[0]} your own</a>`}
    ${session.options.memory ? html`<a class="btn quiet block" href="/notebook?host=${encodeURIComponent(p.name)}" data-link>${icon("note", 16)}${p.name.split(" ")[0]}'s notebook</a>` : ""}
    ${kind === "mine" ? html`<button class="btn link danger-text" type="button" data-delete="${p.id}">Delete</button>` : ""}`;

  const remove = async (id, after) => {
    const p = (mine || []).find((x) => x.id === id);
    if (!p || !(await confirmSheet({ title: `Delete ${p.name}?`, message: "Pods that already used them aren't affected.", confirm: "Delete", danger: true }))) return;
    try {
      await api.remove("personas", id);
      mine = mine.filter((x) => x.id !== id);
      if (picked?.kind === "mine" && picked.id === id) picked = null;
      after?.();
      render();
    } catch (err) {
      toast(err.message);
    }
  };

  const renderStage = () => {
    if (!picked) picked = mine?.length ? { kind: "mine", id: mine[0].id } : cast[0] ? { kind: "cast", id: cast[0].id } : null;
    const p = find(picked);
    if (!p) return;
    applyAccent($("[data-stage]"), callerColor(p.name));
    setHtml($("[data-stage]"), onStage(p, picked.kind === "mine" ? "Yours" : "The cast", voice.playing));
    setHtml($("[data-acts]"), acts(p, picked.kind));
  };
  const render = () => {
    if (dead) return;
    setHtml($("[data-mine]"), mine === null ? waiting() : mine.length ? html`<div class="ptile-grid">${mine.map((p) => tile(p, "mine"))}</div>`
      : html`<a class="ptile ptile-new" href="/personas?edit=new" data-link>
          <span class="ptile-plus" aria-hidden="true">${icon("plus", 20, 2.4)}</span>
          <span class="ptile-text"><strong>Make your first persona</strong><span class="ptile-say">Or pick one of the cast below and make it your own.</span></span></a>`);
    setHtml($("[data-cast]"), html`${cast.filter((p) => !filter || p.gender === filter).map((p) => tile(p, "cast"))}`);
    if (mine !== null) renderStage();
  };

  /** On a phone the stage comes to you: a sheet with the same card and buttons. */
  const openOnPhone = (p, kind) => {
    const body = document.createElement("div");
    body.className = "pstage-sheet";
    setHtml(body, html`<div class="intro-stage stage pstage">${onStage(p, kind === "mine" ? "Yours" : "The cast")}</div><div class="pstage-acts">${acts(p, kind)}</div>`);
    applyAccent(body.querySelector(".pstage"), callerColor(p.name));
    sheetStage = { node: body.querySelector(".pstage"), p, tag: kind === "mine" ? "Yours" : "The cast" };
    const sheet = openSheet({ title: p.name, body, onClose: () => { sheetStage = null; voice.stop(); } });
    body.addEventListener("click", (e) => {
      const del = e.target.closest("[data-delete]");
      const hear = e.target.closest("[data-hear]");
      if (hear) voice.toggle(hear.dataset.hear);
      else if (del) remove(del.dataset.delete, () => sheet.close());
      else if (e.target.closest("a[data-link]")) sheet.close();
    });
  };

  el.addEventListener("click", (e) => {
    const t = e.target;
    const f = t.closest("[data-filter]");
    const pick = t.closest("[data-pick]");
    const del = t.closest("[data-delete]");
    const hear = t.closest("[data-hear]");
    if (hear) {
      voice.toggle(hear.dataset.hear);
      el.querySelector("[data-hear]")?.focus({ preventScroll: true });
    } else if (f) {
      filter = f.dataset.filter;
      for (const b of el.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", String(b === f));
      render();
    } else if (pick) {
      const [kind, id] = [pick.dataset.pick.slice(0, pick.dataset.pick.indexOf(":")), pick.dataset.pick.slice(pick.dataset.pick.indexOf(":") + 1)];
      picked = { kind, id };
      voice.stop();
      render();
      el.querySelector(`[data-pick="${CSS.escape(pick.dataset.pick)}"]`)?.focus({ preventScroll: true });
      if (!wide()) openOnPhone(find(picked), kind);
    } else if (del) {
      remove(del.dataset.delete);
    }
  });

  render();
  api.list("personas").then((r) => { mine = r.items || []; render(); }).catch(() => { mine = []; render(); });
  return { unmount() { dead = true; voice.dispose(); offHead(); } };
}

// ---- making or editing one --------------------------------------------------------------

async function editor(root, { id, from }) {
  let start = {};
  if (id) {
    const items = (await api.list("personas").catch(() => ({ items: [] }))).items || [];
    start = items.find((p) => p.id === id) || null;
    if (!start) {
      navigate("/personas", { replace: true });
      return null;
    }
  } else if (from) {
    const { id: _, ...preset } = session.personaPreset(from) || {};
    start = preset;
  }
  const state = { gender: start.gender || session.voiceGender(start.voice) || "", voice: start.voice || "auto" };
  const title = id ? ["Edit", start.name] : from && start.name ? ["Make them yours.", `Starting from ${start.name}.`] : ["A new persona.", "Who's on the mic?"];

  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide intro-page">
      <a class="btn link back-link" href="/personas" data-link>${icon("chevronLeft", 16)}Personas</a>
      <div class="page-title"><div class="col">
        <h1 class="two">${title[0]}<span class="ask">${title[1]}</span></h1>
      </div></div>
      <form class="intro-form persona-form" data-form>
        <section class="intro-sec">
          <h2 class="create-h2 first">Name them</h2>
          <label class="sr-only" for="p-name">Name</label>
          <input id="p-name" class="field intro-name" maxlength="40" required placeholder="Dr. Maya Reyes" value="${start.name || ""}">
        </section>

        <section class="intro-sec">
          <h2 class="create-h2">Their voice</h2>
          <input type="hidden" id="p-gender" value="${state.gender}">
          <input type="hidden" id="p-voice" value="${state.voice}">
          <p class="muted small">Tap a voice to pick it and hear it.</p>
          <div class="chips" role="radiogroup" aria-label="Gender" data-genders></div>
          <div class="vtile-grid" role="radiogroup" aria-label="Voice" data-voices></div>
        </section>

        <section class="intro-sec">
          <h2 class="create-h2">Their personality</h2>
          <label class="sr-only" for="p-persona">Personality</label>
          <textarea id="p-persona" class="field area short" maxlength="600" required
            placeholder="A marine biologist who gets giddy about octopuses, explains with sea analogies, and gently corrects myths.">${start.persona || ""}</textarea>
          <div class="chips" aria-label="Ways to start">
            ${STARTERS.map((s) => html`<button class="chip" type="button" data-starter="${s}">${s}</button>`)}
          </div>
        </section>

        <section class="intro-sec">
          <h2 class="create-h2">What they love and know <span class="faint">optional</span></h2>
          ${TRAITS.map(([key, label, hint]) => html`
            <label class="field-label" for="p-${key}">${label}</label>
            <input id="p-${key}" class="field" maxlength="300" value="${start[key] || ""}" placeholder="${hint}">`)}
        </section>

        <section class="intro-sec">
          <h2 class="create-h2">Their own notes <span class="faint">optional</span></h2>
          <p class="muted small">Private: only this host knows them, and listeners never see them.</p>
          <label class="sr-only" for="p-context">Their own notes</label>
          <textarea id="p-context" class="field area" maxlength="${NOTES_CHARS}"
            placeholder="Background, stories, expertise, opinions: anything this host should know and bring up when it fits.">${start.context || ""}</textarea>
          <div class="notes-tools">
            <button type="button" class="btn quiet small-btn" data-notes-file>${icon("file", 14)}Add from a file</button>
            <button type="button" class="btn quiet small-btn" data-notes-link>${icon("link", 14)}Add from a link</button>
            <input type="file" data-notes-input hidden accept="${(session.options.file_types || []).join(",")}">
          </div>
          <div class="row gap notes-link" data-notes-linkrow hidden>
            <label class="sr-only" for="p-notes-url">Link to a page or PDF</label>
            <input id="p-notes-url" class="field" type="url" inputmode="url" placeholder="https://…">
            <button type="button" class="btn quiet" data-notes-fetch>Fetch</button>
          </div>
          <p class="faint small" data-notes-meta aria-live="polite"></p>
        </section>

        <aside class="intro-side" aria-label="Who you're making">
          <div class="intro-stage stage pstage" data-stage></div>
          <div class="intro-go">
            <p class="error" role="alert" data-error></p>
            <button class="btn white big block" type="submit">${id ? "Save" : "Add persona"}</button>
            <a class="btn link" href="/personas" data-link>Cancel</a>
          </div>
        </aside>
      </form>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (s) => el.querySelector(s);
  const form = $("[data-form]");
  bindPersonaForm(form);      // the notes tools; gender and voice are tiles here
  let dead = false;
  const voice = voicePlayer(() => {
    if (dead) return;
    for (const b of el.querySelectorAll("[data-voice]")) b.classList.toggle("playing", b.dataset.voice === voice.playing);
    renderStage();
  });

  const renderVoices = () => {
    $("#p-gender").value = state.gender;
    $("#p-voice").value = state.voice;
    setHtml($("[data-genders]"), html`${["", "female", "male"].map((g) => html`
      <button class="chip" type="button" role="radio" data-gender="${g}" aria-checked="${g === state.gender ? "true" : "false"}" aria-pressed="${g === state.gender ? "true" : "false"}">${GENDER_LABEL[g]}</button>`)}`);
    setHtml($("[data-voices]"), html`
      <button type="button" role="radio" class="vtile" data-voice="auto" aria-checked="${state.voice === "auto" ? "true" : "false"}">
        <strong>Auto</strong><span>${state.gender ? `A ${state.gender} voice picked` : "Picked"} to fit the style</span></button>
      ${session.voices(state.gender).map((v) => html`
        <button type="button" role="radio" class="vtile ${voice.playing === v.name ? "playing" : ""}" data-voice="${v.name}" aria-checked="${state.voice === v.name ? "true" : "false"}">
          <strong>${v.name}<i class="vtile-eq" aria-hidden="true"><b></b><b></b><b></b></i></strong><span>${v.character}${state.gender ? "" : ` · ${v.gender}`}</span></button>`)}`);
  };
  const renderStage = () => {
    const p = readPersona(form);
    applyAccent($("[data-stage]"), callerColor(p.name || "?"));
    setHtml($("[data-stage]"), onStage(p, "On the mic", voice.playing));
  };

  el.addEventListener("input", renderStage);
  el.addEventListener("click", (e) => {
    const t = e.target;
    const g = t.closest("[data-gender]");
    const v = t.closest("[data-voice]");
    const starter = t.closest("[data-starter]");
    const hear = t.closest("[data-hear]");
    if (hear) {
      voice.toggle(hear.dataset.hear);
      el.querySelector("[data-hear]")?.focus({ preventScroll: true });
    } else if (g) {
      state.gender = g.dataset.gender;
      if (state.voice !== "auto" && state.gender && session.voiceGender(state.voice) !== state.gender) { state.voice = "auto"; voice.stop(); }
      renderVoices();
      renderStage();
      el.querySelector(`[data-gender="${state.gender}"]`)?.focus();
    } else if (v) {
      state.voice = v.dataset.voice;
      state.gender = session.voiceGender(state.voice) || state.gender;
      renderVoices();
      renderStage();
      voice.toggle(state.voice);      // picking a voice lets you hear it; tap it again to stop
      el.querySelector(`[data-voice="${CSS.escape(state.voice)}"]`)?.focus({ preventScroll: true });
    } else if (starter) {
      const area = $("#p-persona");
      area.value = `${starter.dataset.starter.slice(0, -1)} `;
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
      renderStage();
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("[data-error]").textContent = "";
    try {
      const body = readPersona(form);
      if (id) await api.update("personas", id, body);
      else await api.create("personas", body);
      toast(id ? "Saved." : `${body.name} is in your personas.`);
      navigate("/personas");
    } catch (err) {
      $("[data-error]").textContent = err.message;
    }
  });

  renderVoices();
  renderStage();
  return { unmount() { dead = true; voice.dispose(); offHead(); } };
}

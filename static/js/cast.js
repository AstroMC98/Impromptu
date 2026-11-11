// Casting, shared by Personas, New pod and Co-host live: a host's voice shape, the small
// stage a host stands on, the voice samples, and the sheet where you cast one (pick from
// your personas or the house cast, hear them, fine-tune the details).
import { api } from "./api.js";
import { material } from "./components.js";
import { html, setHtml } from "./html.js";
import { icon } from "./icons.js";
import { bindPersonaForm, fillPersona, GENDER_LABEL, personaFields, readPersona } from "./personas.js";
import { session } from "./session.js";
import { applyAccent, callerColor } from "./theme.js";
import { openSheet } from "./ui.js";
import { toast } from "./util.js";

const bits = (text) => String(text || "").split(",").map((s) => s.trim()).filter(Boolean);
export const facts = (p) => [p.gender ? GENDER_LABEL[p.gender] : "", p.voice && p.voice !== "auto" ? `${p.voice} voice` : "Voice picked to fit"].filter(Boolean).join(" · ");

/** A host's voice shape in their own colour. */
export const shape = (name, size) => {
  const c = callerColor(name || "?");
  return html`<span class="orb" style="--a:color-mix(in oklch, ${c} 42%, #fff);--b:${c};--size:${size}px" aria-hidden="true"></span>`;
};

/** One sample at a time (static/voices/<Name>.mp3, recorded by tools/build_voice_samples.py).
 *  `changed` runs whenever what's playing changes, so the screen can show it. */
export function voicePlayer(changed) {
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
export const onStage = (p, tag, playing = "", { blankName = "Unnamed host", blankSay = "Who are they? Give them an attitude, a quirk, a way of talking." } = {}) => html`
  ${material()}
  <span class="intro-air"><i aria-hidden="true"></i>${tag}</span>
  <div class="pstage-who">${shape(p.name, 64)}
    <span class="col grow"><strong class="pstage-name">${p.name || blankName}</strong><span class="pstage-facts">${facts(p)}</span></span>
    ${p.voice && p.voice !== "auto" ? html`<button type="button" class="round-btn pstage-hear ${playing === p.voice ? "on" : ""}" data-hear="${p.voice}"
      aria-label="${playing === p.voice ? "Stop" : `Hear the ${p.voice} voice`}">${icon(playing === p.voice ? "pause" : "play", 18)}</button>` : ""}</div>
  <p class="pstage-say">${p.persona || blankSay}</p>
  ${bits(p.specialties).length || bits(p.likes).length ? html`<div class="pstage-chips">${bits(p.specialties).concat(bits(p.likes)).slice(0, 6).map((b) => html`<span>${b}</span>`)}</div>` : ""}
  ${p.context ? html`<span class="pstage-notes">${icon("lock", 13)}Has private notes</span>` : ""}`;

const KEYS = ["name", "voice", "persona", "gender", "likes", "specialties", "skills", "context"];
const clean = (p) => Object.fromEntries(KEYS.map((k) => [k, p?.[k] ?? (k === "voice" ? "auto" : "")]));

/** Cast a host. Pick one of your personas or the house cast (they step onto the stage, and
 *  you can hear them), or fine-tune the details underneath.
 *    host:       who's in the seat now
 *    personas:   your saved personas (pushed to if you save a new one)
 *    allowAuto:  offer "Let the show decide" (New pod: a blank host the planner fills in)
 *    allowSave:  offer "Save to my personas"
 *    onDone(host) */
export function openCastSheet({ title, host, personas = [], allowAuto = false, allowSave = false, onDone }) {
  const cast = session.options.persona_presets || [];
  const body = document.createElement("form");
  body.className = "cast-sheet";
  body.noValidate = true;
  let cur = clean(host);
  const tile = (p, key) => html`
    <button type="button" class="ptile" data-cast="${key}" aria-pressed="${cur.name && cur.name === p.name && cur.persona === p.persona ? "true" : "false"}">
      ${shape(p.name, 34)}
      <span class="ptile-text"><strong>${p.name}</strong><span class="ptile-say">${p.persona}</span></span>
    </button>`;
  setHtml(body, html`
    <div class="intro-stage stage pstage" data-stage></div>
    <div data-tiles></div>
    <details class="cast-more" ${cur.name || cur.persona ? "" : ""}>
      <summary>${icon("edit", 16)}Fine-tune them <span class="faint small">name, voice, personality, notes</span></summary>
      <div class="stack">${personaFields(cur, { prefix: "cast", required: false })}</div>
    </details>
    ${allowSave ? html`<label class="check-row"><input type="checkbox" name="save"><span>Save to my personas</span></label>` : ""}
    <p class="error" role="alert" data-error></p>
    <button class="btn white big block" type="submit">Done</button>`);
  bindPersonaForm(body, "cast");

  const voice = voicePlayer(() => renderStage());
  const renderStage = () => {
    applyAccent(body.querySelector("[data-stage]"), callerColor(cur.name || "?"));
    setHtml(body.querySelector("[data-stage]"), onStage(cur, "In the chair", voice.playing,
      allowAuto ? { blankName: "The show decides", blankSay: "Leave it open and the show writes a host to fit the topic and the vibe." } : undefined));
  };
  const renderTiles = () => setHtml(body.querySelector("[data-tiles]"), html`
    ${allowAuto ? html`<div class="ptile-grid cast-auto"><button type="button" class="ptile" data-cast="auto" aria-pressed="${!cur.name && !cur.persona ? "true" : "false"}">
      <span class="ptile-plus" aria-hidden="true">${icon("sparkle", 18)}</span>
      <span class="ptile-text"><strong>Let the show decide</strong><span class="ptile-say">A host written to fit the topic and the vibe.</span></span></button></div>` : ""}
    ${personas.length ? html`<p class="cast-h">Yours</p><div class="ptile-grid">${personas.map((p) => tile(p, `mine:${p.id}`))}</div>` : ""}
    <p class="cast-h">The cast</p>
    <div class="ptile-grid">${cast.map((p) => tile(p, `cast:${p.id}`))}</div>`);

  const sheet = openSheet({ title, body, wide: true, onClose: () => voice.dispose() });
  body.addEventListener("click", (e) => {
    const hear = e.target.closest("[data-hear]");
    const pick = e.target.closest("[data-cast]");
    if (hear) return voice.toggle(hear.dataset.hear);
    if (!pick) return;
    const key = pick.dataset.cast;
    const p = key === "auto" ? {} : key.startsWith("mine:") ? personas.find((x) => x.id === key.slice(5)) : cast.find((x) => x.id === key.slice(5));
    if (!p) return;
    cur = clean(p);
    fillPersona(body, cur, "cast");
    voice.stop();
    renderTiles();
    renderStage();
    body.querySelector(`[data-cast="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    body.closest(".sheet")?.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  const fromFields = () => {
    cur = clean(readPersona(body, "cast"));
    renderStage();
  };
  body.addEventListener("input", (e) => { if (e.target.closest(".cast-more")) fromFields(); });
  body.addEventListener("change", (e) => { if (e.target.closest(".cast-more")) { fromFields(); renderTiles(); } });
  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = clean(readPersona(body, "cast"));
    const error = body.querySelector("[data-error]");
    error.textContent = "";
    const needs = !allowAuto || body.querySelector("input[name=save]")?.checked;
    if (needs && (!next.name || !next.persona)) {
      body.querySelector(".cast-more").open = true;
      error.textContent = allowAuto ? "Give the persona a name and a personality to save it." : "Your co-host needs a name and a personality. Pick one above, or fill them in.";
      return;
    }
    if (body.querySelector("input[name=save]")?.checked) {
      try {
        personas.push(await api.create("personas", next));
        toast(`${next.name} saved to your personas.`);
      } catch (err) {
        error.textContent = err.message;
        return;
      }
    }
    onDone(next);
    sheet.close();
  });
  renderTiles();
  renderStage();
  return sheet;
}

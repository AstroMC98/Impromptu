// /intro — your show intro. Every pod opens with a few seconds of theme music and the
// hosts' welcome. Here you name the show, pick how the hosts open it (a warm welcome, a
// cold open, a radio announcer…), give them a line of your own and choose the theme, with
// what it will sound like shown on a small stage as you go.
import { api } from "../api.js";
import { material, orb } from "../components.js";
import { coverStyle } from "../cover.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent } from "../theme.js";
import { confirmSheet } from "../ui.js";
import { toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const HOUSE_ACCENT = "#6A4FB0";
const MOOD_ACCENT = { upbeat: "#B5521C", warm: "#B8336A", reflective: "#2E6F9E", dramatic: "#6A4FB0",
  playful: "#C2570C", calm: "#1F7F6A", tech: "#2F6BD0", newsy: "#475569" };
// Ways to start your own line. An ellipsis means "you finish it".
const STARTERS = ["the show where…", "your weekly dose of…", "where curious people…", "big ideas, small talk"];

export async function introView(root) {
  if (!session.signedIn) {
    navigate(loginPath("/intro"), { replace: true });
    return null;
  }
  applyAccent(document.documentElement, HOUSE_ACCENT);
  const [{ intro }, { music: mine }] = await Promise.all([
    api.showIntro().catch(() => ({ intro: null })),
    api.myMusic().catch(() => ({ music: [] })),
  ]);
  const openings = session.options.intro_openings || [];
  const packs = session.options.music?.library || [];
  const state = {
    saved: Boolean(intro),
    music: intro?.music || "auto",
    opening: openings.some((o) => o.id === intro?.opening) ? intro.opening : openings[0]?.id || "warm",
    enabled: intro?.enabled ?? true,
    playing: "",
  };
  const player = new Audio();
  player.preload = "none";

  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide intro-page">
      <div class="page-title"><div class="col">
        <h1 class="two">Your show intro.<span class="ask">How every pod opens.</span></h1>
      </div></div>
      <form class="intro-form" data-form>
        <section class="intro-sec">
          <h2 class="create-h2 first">Name your show</h2>
          <label class="sr-only" for="in-name">Show name</label>
          <input id="in-name" class="field intro-name" maxlength="60" required placeholder="Walk &amp; Talk" value="${intro?.show_name || ""}">
          <label class="field-label" for="in-line">A line of your own <span class="faint small">optional</span></label>
          <input id="in-line" class="field" maxlength="200" placeholder="the show where big ideas start on a walk" value="${intro?.intro_line || ""}">
          <div class="chips" aria-label="Ways to start your line">
            ${STARTERS.map((s) => html`<button class="chip" type="button" data-starter="${s}">${s}</button>`)}
          </div>
        </section>

        <section class="intro-sec">
          <h2 class="create-h2">How it opens</h2>
          <div class="open-grid" role="radiogroup" aria-label="How the hosts open" data-openings></div>
        </section>

        <section class="intro-sec">
          <h2 class="create-h2">Theme music</h2>
          <div class="mtile-grid" role="radiogroup" aria-label="Theme music" data-music-list></div>
        </section>

        <section class="intro-sec">
          <button type="button" role="switch" class="radio-card research-card" data-enabled aria-checked="true">
            <span class="radio-dot" aria-hidden="true"></span>
            <span class="radio-text"><span class="radio-title">Use it on new pods</span>
              <span class="radio-desc">You can still switch it off for any one pod.</span></span>
          </button>
        </section>

        <aside class="intro-side" aria-label="How it will sound">
          <div class="intro-stage stage" data-stage>
            ${material()}
            <span class="intro-air"><i aria-hidden="true"></i>How it opens</span>
            <p class="intro-music" data-stage-music></p>
            <p class="intro-say" data-preview aria-live="polite"></p>
            <div class="intro-hosts" aria-hidden="true">${orb(0, "", 30)}${orb(1, "", 30)}<span data-stage-style></span></div>
          </div>
          <div class="intro-go">
            <p class="error" role="alert" data-error></p>
            <button class="btn white big block" type="submit">Save</button>
            ${state.saved ? html`<button class="btn link danger-text" type="button" data-remove>Remove my show intro</button>` : ""}
          </div>
        </aside>
      </form>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (s) => el.querySelector(s);

  const opening = () => openings.find((o) => o.id === state.opening) || openings[0] || { label: "Warm welcome", sample: "Welcome to {show}{line}.", accent: HOUSE_ACCENT };
  const musicLabel = () => (state.music === "auto" ? "A theme matched to each pod" : state.music === "none" ? "No music"
    : packs.find((p) => p.id === state.music)?.label || mine.find((m) => m.id === state.music)?.label || "Theme music");

  const renderOpenings = () => setHtml($("[data-openings]"), html`${openings.map((o) => html`
    <button type="button" role="radio" class="open-tile" data-opening="${o.id}" aria-checked="${o.id === state.opening ? "true" : "false"}" style="--k:${o.accent}">
      <span class="open-dot" aria-hidden="true"></span>
      <strong>${o.label}</strong>
      <span class="open-blurb">${o.blurb}</span>
    </button>`)}`);

  const tile = (value, title, desc, accent, playable) => html`
    <div class="mtile ${state.music === value ? "on" : ""} ${state.playing === value ? "playing" : ""}">
      <button type="button" role="radio" class="mtile-pick" data-music="${value}" aria-checked="${state.music === value ? "true" : "false"}">
        <span class="mtile-cover" style="${accent ? coverStyle(title, accent) : ""};--k:${accent || "transparent"}" aria-hidden="true">${accent ? "" : icon(value === "none" ? "close" : "sparkle", 18)}</span>
        <span class="mtile-text"><strong>${title}</strong><span>${desc}</span></span>
      </button>
      ${playable ? html`<button type="button" class="round-btn mtile-play" data-play="${value}"
        aria-label="${state.playing === value ? "Stop" : "Hear"} ${title}">${icon(state.playing === value ? "pause" : "play", 16)}</button>` : ""}
    </div>`;
  const renderMusic = () => setHtml($("[data-music-list]"), html`
    ${tile("auto", "Matched to each pod", "Picked to suit each pod's vibe", "", false)}
    ${packs.map((p) => tile(p.id, p.label, `${p.mood[0].toUpperCase()}${p.mood.slice(1)} · studio library`, MOOD_ACCENT[p.mood] || HOUSE_ACCENT, true))}
    ${mine.map((m) => tile(m.id, m.label, "Made for you", HOUSE_ACCENT, false))}
    ${tile("none", "No music", "Just the hosts' welcome", "", false)}`);

  const renderStage = () => {
    const o = opening();
    const name = $("#in-name").value.trim();
    const line = $("#in-line").value.trim().replace(/[.!?…]+$/, "");
    applyAccent($("[data-stage]"), o.accent);
    $("[data-preview]").textContent = `“${o.sample.replace("{show}", name || "your show").replace("{line}", line ? `, ${line}` : "")}”`;
    $("[data-stage-music]").textContent = state.music === "none" ? "No music, straight to the hosts" : `♪ ${musicLabel()}, then`;
    $("[data-stage-style]").textContent = o.label;
  };
  const renderEnabled = () => $("[data-enabled]").setAttribute("aria-checked", String(state.enabled));

  const stop = () => {
    player.pause();
    state.playing = "";
  };
  player.addEventListener("ended", () => { stop(); renderMusic(); });
  player.addEventListener("error", () => { if (state.playing) { stop(); renderMusic(); toast("Couldn't play that theme."); } });

  el.addEventListener("input", renderStage);
  el.addEventListener("click", async (e) => {
    const t = e.target;
    const play = t.closest("[data-play]");
    const m = t.closest("[data-music]");
    const o = t.closest("[data-opening]");
    const starter = t.closest("[data-starter]");
    if (play) {
      const id = play.dataset.play;
      if (state.playing === id) stop();
      else {
        state.playing = id;
        player.src = `/api/music/${encodeURIComponent(id)}/preview`;
        player.play().catch(() => { stop(); renderMusic(); });
      }
      renderMusic();
      el.querySelector(`[data-play="${id}"]`)?.focus();
    } else if (m) {
      state.music = m.dataset.music;
      renderMusic();
      renderStage();
      el.querySelector(`[data-music="${state.music}"]`)?.focus();
    } else if (o) {
      state.opening = o.dataset.opening;
      renderOpenings();
      renderStage();
      el.querySelector(`[data-opening="${state.opening}"]`)?.focus();
    } else if (starter) {
      const input = $("#in-line");
      const open = starter.dataset.starter.endsWith("…");
      input.value = open ? `${starter.dataset.starter.slice(0, -1)} ` : starter.dataset.starter;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      renderStage();
    } else if (t.closest("[data-enabled]")) {
      state.enabled = !state.enabled;
      renderEnabled();
    } else if (t.closest("[data-remove]")) {
      const ok = await confirmSheet({ title: "Remove your show intro?", message: "Pods you make next get the automatic intro. Pods already made keep theirs.", confirm: "Remove", danger: true });
      if (!ok) return;
      await api.deleteShowIntro().catch((err) => toast(err.message));
      toast("Removed. New pods get the automatic intro.");
      navigate("/intro", { replace: true });
    }
  });
  $("[data-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("[data-error]").textContent = "";
    try {
      await api.saveShowIntro({
        show_name: $("#in-name").value.trim(), intro_line: $("#in-line").value.trim(),
        opening: state.opening, music: state.music, enabled: state.enabled,
      });
      toast(state.enabled ? "Saved. Your next pods open with it." : "Saved. It's off for now.");
      if (!state.saved) navigate("/intro", { replace: true });
    } catch (err) {
      $("[data-error]").textContent = err.message;
    }
  });

  renderOpenings();
  renderMusic();
  renderStage();
  renderEnabled();
  return { unmount() { stop(); player.removeAttribute("src"); offHead(); } };
}

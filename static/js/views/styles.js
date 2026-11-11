// /styles — your own vibes: how a pod should sound. Two modes on one page, like Personas:
//   browsing: yours and the house vibes as tiles; the one you pick shows on a small stage
//             (beside the list on a wide window, in a sheet on a phone) with what you can do;
//   editing (?edit=new, ?edit=<id>, ?from=<house vibe id>): a name, how it should sound
//             (with starters to tap) and a colour, with the stage showing it as you go.
import { api } from "../api.js";
import { material, waiting } from "../components.js";
import { coverStyle } from "../cover.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent } from "../theme.js";
import { confirmSheet, openSheet } from "../ui.js";
import { toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const HOUSE_ACCENT = "#6A4FB0";
const ACCENTS = ["#B8336A", "#3B3F9E", "#B5521C", "#3A4250", "#1F7F6A", "#80620F", "#6A4FB0", "#2E6F9E", "#2F6BD0", "#9C4A5A"];
const STARTERS = ["Like two friends who…", "A late-night radio show where…", "A nature documentary about…", "Shakespeare, but…"];
const wide = () => matchMedia("(min-width: 1024px)").matches;

/** A style on the stage: its cover in its colour, its name, and how it sounds. */
const onStage = (s, tag) => html`
  ${material()}
  <span class="intro-air"><i aria-hidden="true"></i>${tag}</span>
  <div class="cstage-top">
    <span class="cstage-cover" style="${coverStyle(s.name || "Your style", s.accent || ACCENTS[0])}" aria-hidden="true"></span>
    <span class="col grow"><strong class="pstage-name">${s.name || "Unnamed style"}</strong>
      <span class="pstage-facts">How a pod sounds</span></span>
  </div>
  <p class="pstage-say">${s.prompt || "Describe the sound: who's talking, the mood, what it reminds you of."}</p>`;

export async function stylesView(root, { url }) {
  if (!session.signedIn) {
    navigate(loginPath("/styles"), { replace: true });
    return null;
  }
  applyAccent(document.documentElement, HOUSE_ACCENT);
  const editing = url.searchParams.get("edit");
  const from = url.searchParams.get("from");
  return editing || from ? editor(root, { id: editing && editing !== "new" ? editing : "", from }) : browser(root);
}

// ---- browsing ---------------------------------------------------------------------------

async function browser(root) {
  const house = (session.options.presets || []).map((p) => ({ id: p.id, name: p.label, prompt: p.prompt, accent: p.accent }));
  let mine = null;
  let picked = null;            // { kind: "mine" | "house", id }
  let dead = false;

  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide personas-page">
      <div class="page-title row">
        <div class="col grow"><h1 class="two">Your styles.<span class="ask">How a pod should sound.</span></h1></div>
        <a class="btn white" href="/styles?edit=new" data-link>${icon("plus", 16, 2.6)}New style</a>
      </div>
      <div class="personas-body">
        <div class="personas-lists">
          <section class="intro-sec" aria-labelledby="sm-h">
            <h2 id="sm-h" class="create-h2 first">Yours</h2>
            <p class="muted small">They show up next to the house vibes when you make a pod.</p>
            <div data-mine>${waiting()}</div>
          </section>
          <section class="intro-sec" aria-labelledby="sh-h">
            <h2 id="sh-h" class="create-h2">House vibes</h2>
            <p class="muted small">Always there when you make a pod. Pick one to see how it's written, or start your own from it.</p>
            <div class="ptile-grid" data-house></div>
          </section>
        </div>
        <aside class="personas-side" aria-label="The style you picked"><div class="intro-stage stage pstage" data-stage></div><div class="pstage-acts" data-acts></div></aside>
      </div>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (s) => el.querySelector(s);

  const find = (pick) => (pick?.kind === "mine" ? (mine || []) : house).find((s) => s.id === pick?.id) || null;
  const tile = (s, kind) => html`
    <button type="button" class="ptile" data-pick="${kind}:${s.id}" aria-pressed="${picked?.kind === kind && picked.id === s.id ? "true" : "false"}">
      <span class="style-swatch" style="--tile:${s.accent}" aria-hidden="true"></span>
      <span class="ptile-text"><strong>${s.name}</strong><span class="ptile-say">${s.prompt}</span></span>
    </button>`;
  const acts = (s, kind) => html`
    ${kind === "mine" ? html`<a class="btn white big block" href="/styles?edit=${encodeURIComponent(s.id)}" data-link>${icon("edit", 18)}Edit</a>`
      : html`<a class="btn white big block" href="/styles?from=${encodeURIComponent(s.id)}" data-link>Start your own from it</a>`}
    <a class="btn quiet block" href="/new" data-link>${icon("plus", 16)}Make a pod</a>
    ${kind === "mine" ? html`<button class="btn link danger-text" type="button" data-delete="${s.id}">Delete</button>` : ""}`;

  const remove = async (id, after) => {
    const s = (mine || []).find((x) => x.id === id);
    if (!s || !(await confirmSheet({ title: `Delete ${s.name}?`, message: "Pods that already used it aren't affected.", confirm: "Delete", danger: true }))) return;
    try {
      await api.remove("styles", id);
      mine = mine.filter((x) => x.id !== id);
      if (picked?.kind === "mine" && picked.id === id) picked = null;
      after?.();
      render();
    } catch (err) {
      toast(err.message);
    }
  };

  const render = () => {
    if (dead) return;
    setHtml($("[data-mine]"), mine === null ? waiting() : mine.length ? html`<div class="ptile-grid">${mine.map((s) => tile(s, "mine"))}</div>`
      : html`<a class="ptile ptile-new" href="/styles?edit=new" data-link>
          <span class="ptile-plus" aria-hidden="true">${icon("plus", 20, 2.4)}</span>
          <span class="ptile-text"><strong>Describe your first style</strong><span class="ptile-say">Like “Shakespeare, but a cooking show”.</span></span></a>`);
    setHtml($("[data-house]"), html`${house.map((s) => tile(s, "house"))}`);
    if (mine === null) return;
    if (!picked) picked = mine.length ? { kind: "mine", id: mine[0].id } : house[0] ? { kind: "house", id: house[0].id } : null;
    const s = find(picked);
    if (!s) return;
    applyAccent($("[data-stage]"), s.accent);
    setHtml($("[data-stage]"), onStage(s, picked.kind === "mine" ? "Yours" : "House vibe"));
    setHtml($("[data-acts]"), acts(s, picked.kind));
  };

  const openOnPhone = (s, kind) => {
    const body = document.createElement("div");
    body.className = "pstage-sheet";
    setHtml(body, html`<div class="intro-stage stage pstage">${onStage(s, kind === "mine" ? "Yours" : "House vibe")}</div><div class="pstage-acts">${acts(s, kind)}</div>`);
    applyAccent(body.querySelector(".pstage"), s.accent);
    const sheet = openSheet({ title: s.name, body });
    body.addEventListener("click", (e) => {
      const del = e.target.closest("[data-delete]");
      if (del) remove(del.dataset.delete, () => sheet.close());
      else if (e.target.closest("a[data-link]")) sheet.close();
    });
  };

  el.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick]");
    const del = e.target.closest("[data-delete]");
    if (pick) {
      const at = pick.dataset.pick.indexOf(":");
      picked = { kind: pick.dataset.pick.slice(0, at), id: pick.dataset.pick.slice(at + 1) };
      render();
      el.querySelector(`[data-pick="${CSS.escape(pick.dataset.pick)}"]`)?.focus({ preventScroll: true });
      if (!wide()) openOnPhone(find(picked), picked.kind);
    } else if (del) {
      remove(del.dataset.delete);
    }
  });

  render();
  api.list("styles").then((r) => { mine = r.items || []; render(); }).catch(() => { mine = []; render(); });
  return { unmount() { dead = true; offHead(); } };
}

// ---- making or editing one --------------------------------------------------------------

async function editor(root, { id, from }) {
  let start = {};
  if (id) {
    const items = (await api.list("styles").catch(() => ({ items: [] }))).items || [];
    start = items.find((s) => s.id === id) || null;
    if (!start) {
      navigate("/styles", { replace: true });
      return null;
    }
  } else if (from) {
    const p = session.preset(from);
    if (p) start = { name: `${p.label} (mine)`.slice(0, 40), prompt: p.prompt, accent: p.accent, base: p.label };
  }
  let accent = start.accent || ACCENTS[0];
  const swatches = ACCENTS.includes(accent) ? ACCENTS : [accent, ...ACCENTS];
  const title = id ? ["Edit", start.name] : start.base ? ["Make it yours.", `Starting from ${start.base}.`] : ["A new style.", "How should it sound?"];

  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide intro-page">
      <a class="btn link back-link" href="/styles" data-link>${icon("chevronLeft", 16)}Styles</a>
      <div class="page-title"><div class="col">
        <h1 class="two">${title[0]}<span class="ask">${title[1]}</span></h1>
      </div></div>
      <form class="intro-form" data-form>
        <section class="intro-sec">
          <h2 class="create-h2 first">Name it</h2>
          <label class="sr-only" for="st-name">Name</label>
          <input id="st-name" class="field intro-name" maxlength="40" required placeholder="Cozy science" value="${start.name || ""}">
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">How it should sound</h2>
          <label class="sr-only" for="st-prompt">How it should sound</label>
          <textarea id="st-prompt" class="field area" maxlength="2000" required
            placeholder="Warm and nerdy, like two friends explaining science over tea. Lots of analogies, no jargon.">${start.prompt || ""}</textarea>
          <div class="chips" aria-label="Ways to start">
            ${STARTERS.map((s) => html`<button class="chip" type="button" data-starter="${s}">${s}</button>`)}
          </div>
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">Its colour</h2>
          <p class="muted small">It lights the stage and paints the cover of pods made with it.</p>
          <div class="swatches" role="radiogroup" aria-label="Colour" data-swatches></div>
        </section>
        <aside class="intro-side" aria-label="The style you're making">
          <div class="intro-stage stage pstage" data-stage></div>
          <div class="intro-go">
            <p class="error" role="alert" data-error></p>
            <button class="btn white big block" type="submit">${id ? "Save" : "Add style"}</button>
            <a class="btn link" href="/styles" data-link>Cancel</a>
          </div>
        </aside>
      </form>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (s) => el.querySelector(s);
  const read = () => ({ name: $("#st-name").value.trim(), prompt: $("#st-prompt").value.trim(), accent });

  const renderSwatches = () => setHtml($("[data-swatches]"), html`${swatches.map((a) => html`
    <button type="button" role="radio" class="swatch" data-accent="${a}" aria-checked="${a === accent ? "true" : "false"}" style="--tile:${a}" aria-label="Colour ${a}"></button>`)}`);
  const renderStage = () => {
    applyAccent($("[data-stage]"), accent);
    setHtml($("[data-stage]"), onStage(read(), "Your style"));
  };

  el.addEventListener("input", renderStage);
  el.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-accent]");
    const starter = e.target.closest("[data-starter]");
    if (sw) {
      accent = sw.dataset.accent;
      renderSwatches();
      renderStage();
      el.querySelector(`[data-accent="${accent}"]`)?.focus();
    } else if (starter) {
      const area = $("#st-prompt");
      area.value = `${starter.dataset.starter.slice(0, -1)} `;
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
      renderStage();
    }
  });
  $("[data-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("[data-error]").textContent = "";
    try {
      const body = read();
      if (id) await api.update("styles", id, body);
      else await api.create("styles", body);
      toast(id ? "Saved." : `${body.name} is in your styles.`);
      navigate("/styles");
    } catch (err) {
      $("[data-error]").textContent = err.message;
    }
  });

  renderSwatches();
  renderStage();
  return { unmount() { offHead(); } };
}

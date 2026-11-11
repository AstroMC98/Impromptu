// /cohost — set up a live call with an AI co-host: what you'll talk about, who
// your co-host is (a persona), how they play it, how long, whether it opens with
// your saved show intro, and who can hear the episode. "Start the call" opens the
// mic (inside the click) and spends the credits.
import { api } from "../api.js";
import { facts, openCastSheet, shape } from "../cast.js";
import { micSupported, startCallAudio, takeHandoff } from "../cohost/audio.js";
import { material } from "../components.js";
import { html, setHtml } from "../html.js";
import { icon, KIND_ICON } from "../icons.js";
import { introRow, lengthChip } from "../pod-options.js";
import { navigate } from "../router.js";
import { mountRules } from "../rules.js";
import { loginPath, session } from "../session.js";
import { applyAccent } from "../theme.js";
import { store as local, toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const LENGTHS = [5, 10, 15];
const BLANK = { name: "", voice: "auto", persona: "", gender: "", likes: "", specialties: "", skills: "", context: "" };
const hostOf = (h) => Object.fromEntries(Object.keys(BLANK).map((k) => [k, h?.[k] ?? BLANK[k]]));
const VISIBILITY = [
  ["private", "Private", "lock", "Only you, plus connections you pick."],
  ["connections", "Connections", "people", "All your connections can listen."],
  ["public", "Public", "globe", "Anyone can listen, free, and it's on Discover."],
];

export async function cohostSetupView(root) {
  if (!session.signedIn) {
    navigate(loginPath("/cohost"), { replace: true });
    return null;
  }
  await session.refresh();
  const modes = session.options.cohost_modes || [];
  const presets = session.options.persona_presets || [];
  const saved = local.get("gp_cohost", {});
  const state = {
    host: hostOf(saved.host || presets.find((p) => p.id === "comedian") || presets[0]),
    mode: modes.some((m) => m.id === saved.mode) ? saved.mode : "banter",
    minutes: LENGTHS.includes(saved.minutes) ? saved.minutes : 10,
    visibility: saved.visibility || "private",
    sharedWith: [],
    useIntro: true,      // open with your saved show intro, if you have one
    useMemory: Boolean(saved.useMemory),   // this call only: hand over what's remembered, propose more after
    attachments: [],     // { name, kind, text }
    busy: "",
    // Long notes are sent ahead so the co-host's brief of them is ready by the call.
    brief: { notes: "", status: "" },   // status: reading | ready | failed
  };
  const inlineMax = session.options.cohost_source_chars || 20000;
  const notesMax = session.options.cohost_notes_max_chars || 400000;
  const data = { personas: [], connections: [], intro: null };

  const el = document.createElement("div");
  el.className = "create-page cohost-setup";
  setHtml(el, html`
    ${appHeader({ search: false, nav: false })}
    <main class="create">
      <div class="create-title">
        <h1 class="two">Co-host live.<span class="ask">Talk it through, out loud.</span></h1>
        <p class="muted">You talk, and an AI co-host banters, asks or argues back in real time. Hang up, and it's an episode.</p>
      </div>
      <div data-free></div>

      <section class="card about-box" aria-labelledby="topic-label">
        <label id="topic-label" for="topic" class="card-label">What are you two talking about?</label>
        <textarea id="topic" class="field area" maxlength="2000" placeholder="Is sourdough worth the hassle? Or: the best and worst calls of last night's game."></textarea>
        <details class="notes-box" data-notes-box>
          <summary>Notes for your co-host <span class="faint small">optional</span></summary>
          <label class="sr-only" for="notes">Notes for your co-host</label>
          <textarea id="notes" class="field area" placeholder="Facts, an article, your outline. Your co-host draws on it; it isn't read out."></textarea>
          <div class="attach-chips" data-chips></div>
          <div class="row gap tools">
            <button type="button" class="btn quiet grow" data-pick>${icon("file", 16)}File</button>
            <button type="button" class="btn quiet grow" data-link-toggle>${icon("link", 16)}Link</button>
            <input type="file" data-file multiple hidden accept="${(session.options.file_types || []).join(",")}">
          </div>
          <form class="link-form row gap" data-link-form hidden>
            <label class="sr-only" for="notes-url">Link to a page or PDF</label>
            <input id="notes-url" class="field" type="url" inputmode="url" placeholder="https://…">
            <button class="btn quiet" type="submit">Fetch</button>
          </form>
          <p class="meta" data-meta aria-live="polite"></p>
        </details>
      </section>

      <h2 class="create-h2">Your co-host</h2>
      <div class="ptile-grid host-tiles one" data-host-box></div>

      <h2 class="create-h2">How should they play it?</h2>
      <div class="open-grid" role="radiogroup" aria-label="How your co-host plays it" data-modes></div>
      <p class="faint small mode-hint">You can switch during the call.</p>

      ${session.options.memory ? html`<h2 class="create-h2">Memory <span class="faint small">optional</span></h2>
      <div data-memory></div>` : ""}

      <h2 class="create-h2">Hard rules <span class="faint small">optional</span></h2>
      <div class="rules" data-rules></div>

      <h2 class="create-h2">How long?</h2>
      <div class="len-chips" role="group" aria-label="Length" data-lengths></div>

      <h2 class="create-h2">Intro</h2>
      <div data-intro></div>

      <h2 class="create-h2">Who can hear the episode?</h2>
      <div class="radio-cards" role="radiogroup" aria-label="Who can hear the episode" data-visibility></div>
      <div data-share-with></div>

      <details class="more-options">
        <summary>More options</summary>
        <label class="field-label" for="your-name">Your name on the show</label>
        <input id="your-name" class="field" maxlength="40" value="${saved.yourName || session.me.name.split(" ")[0]}">
        <label class="field-label" for="language">Language</label>
        <input id="language" class="field" maxlength="60" value="${saved.language || "English"}">
      </details>

      <p class="error" role="alert" data-error></p>
      <aside class="create-side" aria-label="Your call">
        <div class="intro-stage stage cstage" data-stage aria-live="polite"></div>
        <div class="go-bar">
          <p class="cost" data-cost></p>
          <button class="btn white big block go" type="button" data-go>${icon("mic", 20, 2.2)}Start the call</button>
          <p class="faint small go-hint">${icon("headphones", 14)} Best with headphones</p>
        </div>
      </aside>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (s) => el.querySelector(s);
  const rules = mountRules($("[data-rules]"), saved.rules);
  // Roleplay asks for a scene and Educate for something to learn, not a topic.
  const TOPIC = {
    label: "What are you two talking about?",
    hint: "Is sourdough worth the hassle? Or: the best and worst calls of last night's game.",
    missing: "Say what you'll talk about, even just a few words.",
  };
  const SCENE = {
    label: "Set the scene",
    hint: "A job interview at a design studio. You're the hiring manager, I'm the candidate, and you're hard to impress.",
    missing: "Set the scene: where you are and who plays whom.",
  };
  const LESSON = {
    label: "What do you want to learn?",
    hint: "How mortgages work. I'm buying my first flat and I know nothing about interest rates.",
    missing: "Say what you want to learn, even just a few words.",
  };
  const GUEST = {
    label: "What are you on the show to talk about?",
    hint: "I just ran my first marathon. Or: I'm launching an app that turns blog posts into podcasts.",
    missing: "Say what you're on the show to talk about, even just a few words.",
  };
  const wording = () => ({ roleplay: SCENE, educate: LESSON, talkshow: GUEST })[state.mode] || TOPIC;
  let remembered = null;     // kept memories, once fetched
  const renderMemory = () => {
    if (!$("[data-memory]")) return;      // memory isn't switched on for this server
    const name = state.host.name || "Your co-host";
    const key = (state.host.name || "").trim().replace(/\s+/g, " ").toLowerCase();
    const n = remembered ? remembered.filter((m) => m.scope === "shared" || m.host_key === key).length : 0;
    const knows = !remembered ? "" : n ? `${name} has ${n} thing${n === 1 ? "" : "s"} to draw on.` : `${name} doesn't know anything about you yet.`;
    setHtml($("[data-memory]"), html`
      <button type="button" role="switch" class="radio-card research-card" data-toggle-memory aria-checked="${state.useMemory ? "true" : "false"}">
        <span class="radio-dot" aria-hidden="true"></span>
        <span class="radio-text"><span class="radio-title">${icon("heart", 16)} Use memory on this call</span>
          <span class="radio-desc">${name} brings what they remember about you, and suggests new things to remember afterwards.
            Nothing is kept until you approve it. ${knows}</span></span>
      </button>
      <div class="row gap wrap mem-links">
        <a class="btn link mem-link" href="/memory" data-link>See what's remembered</a>
        ${state.host.name ? html`<a class="btn link mem-link" href="/notebook?host=${encodeURIComponent(state.host.name)}" data-link>${name}'s notebook</a>` : ""}
      </div>`);
  };
  const renderTopic = () => {
    $("#topic-label").textContent = wording().label;
    $("#topic").placeholder = wording().hint;
  };
  // The call before it starts: you and your co-host, how they'll play it, and what about.
  const renderStage = () => {
    const m = mode();
    const you = ($("#your-name")?.value || session.me.name).trim().split(/\s+/)[0] || "You";
    const topic = $("#topic").value.trim();
    const box = $("[data-stage]");
    applyAccent(box, m?.accent || "#B8336A");
    setHtml(box, html`
      ${material()}
      <span class="intro-air"><i aria-hidden="true"></i>Your call</span>
      <div class="cstage-pair">${shape(you, 54)}${shape(state.host.name || "Your co-host", 54)}</div>
      <div class="col cstage-names"><strong class="pstage-name">${you} and ${state.host.name || "your co-host"}</strong>
        <span class="pstage-facts">${[m?.label, `up to ${state.minutes} min`, state.useMemory && session.options.memory ? "memory on" : ""].filter(Boolean).join(" · ")}</span></div>
      <p class="pstage-say ${topic ? "" : "dim"}">${topic ? (topic.length > 150 ? `${topic.slice(0, 148).trimEnd()}…` : topic) : wording().label}</p>`);
  };
  const notes = $("#notes");

  // ---- rendering ---------------------------------------------------------------------

  const mode = () => modes.find((m) => m.id === state.mode) || modes[0];
  const tint = () => applyAccent(document.documentElement, mode()?.accent || "#B8336A");
  const renderFree = () => {
    const cost = session.cost(state.minutes);
    setHtml($("[data-free]"), session.credits >= cost ? "" : html`
      <div class="free-note">${icon("coin", 18)}<span>
        ${session.credits ? html`<strong>You have ${session.credits} credits.</strong> This call needs ${cost}. Pick a shorter length, or ask an admin for more.`
          : html`<strong>Free account.</strong> Co-hosting uses credits (${session.options.credits_per_minute} per minute of call time). Ask an admin for demo credits.`}
      </span></div>`);
  };
  const renderHost = () => {
    const h = state.host;
    setHtml($("[data-host-box]"), html`
      <button type="button" class="ptile" data-host aria-label="Change your co-host${h.name ? `: ${h.name}` : ""}">
        ${shape(h.name || "Your co-host", 44)}
        <span class="ptile-text"><strong>${h.name || "Your co-host"}</strong>
          <span class="ptile-say">${h.persona || "Warm, quick-witted and curious about everything."}</span>
          <span class="ptile-facts">${facts(h)}${h.context ? " · private notes" : ""}</span></span>
        <span class="ptile-edit" aria-hidden="true">${icon("edit", 16)}</span>
      </button>`);
    renderMemory();
    renderStage();
  };
  const renderModes = () => setHtml($("[data-modes]"), html`${modes.map((m) => html`
    <button type="button" role="radio" class="open-tile" data-mode="${m.id}" aria-checked="${state.mode === m.id ? "true" : "false"}" style="--k:${m.accent}">
      <span class="open-dot" aria-hidden="true"></span>
      <strong>${m.label}</strong>
      <span class="open-blurb">${m.blurb}</span>
    </button>`)}`);
  const renderLengths = () => {
    setHtml($("[data-lengths]"), html`${LENGTHS.map((m) => html`
      ${lengthChip(m, state.minutes === m)}`)}`);
    renderCost();
    renderStage();
  };
  const renderVisibility = () => {
    setHtml($("[data-visibility]"), html`${VISIBILITY.map(([id, title, ic, desc]) => html`
      <button type="button" role="radio" class="radio-card" data-vis="${id}" aria-checked="${state.visibility === id}">
        <span class="radio-dot" aria-hidden="true"></span>
        <span class="radio-text"><span class="radio-title">${icon(ic, 16)} ${title}</span><span class="radio-desc">${desc}</span></span>
      </button>`)}`);
    setHtml($("[data-share-with]"), state.visibility !== "private" || !data.connections.length ? "" : html`
      <p class="field-label share-label">Also share with</p>
      <div class="chips">${data.connections.map((c) => html`
        <button type="button" class="chip" data-share="${c.uid}" aria-pressed="${state.sharedWith.includes(c.uid)}">${c.name}</button>`)}</div>`);
  };
  const renderIntro = () => setHtml($("[data-intro]"), introRow(data.intro, state.useIntro, { cohost: true }));
  const renderCost = () => {
    const cost = session.cost(state.minutes);
    const enough = session.credits >= cost;
    $("[data-cost]").textContent = `Uses up to ${cost} credit${cost === 1 ? "" : "s"}; unused minutes come back · you have ${session.credits}`;
    $("[data-cost]").classList.toggle("short", !enough);
    $("[data-go]").disabled = !enough;
    renderFree();
  };
  const renderChips = () => {
    setHtml($("[data-chips]"), html`${state.attachments.map((a, i) => html`
      <span class="attach-chip">${icon(KIND_ICON[a.kind] || "file", 14)}<span class="ellipsis">${a.name}</span>
        <button type="button" data-remove="${i}" aria-label="Remove ${a.name}">${icon("close", 14, 2.2)}</button></span>`)}`);
    updateMeta();
    briefSoon(300);
  };
  const collectNotes = () => [notes.value.trim(), ...state.attachments.map((a) => `--- ${a.name} ---\n${a.text}`)]
    .filter(Boolean).join("\n\n");
  const updateMeta = () => {
    const all = collectNotes();
    const n = all.length;
    const count = (x) => x.toLocaleString();
    let text = state.busy;
    if (!text && n && n <= inlineMax) text = `${count(n)} characters of notes`;
    else if (!text && n) {
      const status = state.brief.notes === all ? state.brief.status : "";
      text = `${count(n)} characters. ${status === "ready" ? "Your co-host has the gist and looks up the details as you talk."
        : status === "failed" ? `Your co-host reads the first ${count(inlineMax)} and looks up the rest as you talk.`
          : "Your co-host is reading them…"}`;
      if (n > notesMax) text += ` Only the first ${count(notesMax)} are used.`;
    }
    $("[data-meta]").textContent = text;
  };
  // Long notes go to the server as soon as they settle, so the brief is written while
  // you finish setting up; starting the call picks up the same brief.
  let briefTimer = 0;
  const briefSoon = (ms) => {
    clearTimeout(briefTimer);
    briefTimer = setTimeout(requestBrief, ms);
  };
  const requestBrief = async () => {
    const all = collectNotes();
    if (all.length <= inlineMax || all === state.brief.notes) return;
    state.brief = { notes: all, status: "reading" };
    updateMeta();
    let status = "failed";
    try {
      status = (await api.cohostNotes(all.slice(0, notesMax))).brief ? "ready" : "failed";
    } catch { /* the call reads the first part instead */ }
    if (state.brief.notes === all) state.brief.status = status;
    updateMeta();
  };
  const setError = (msg) => { $("[data-error]").textContent = msg || ""; };

  // ---- events ----------------------------------------------------------------------------

  el.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-host]")) editHost();
    else if (t.closest("[data-mode]")) {
      state.mode = t.closest("[data-mode]").dataset.mode;
      renderTopic();
      renderModes();
      tint();
      renderStage();
      el.querySelector(`[data-mode="${state.mode}"]`)?.focus({ preventScroll: true });
    } else if (t.closest("[data-toggle-memory]")) {
      state.useMemory = !state.useMemory;
      renderMemory();
      renderStage();
    } else if (t.closest("[data-min]")) {
      state.minutes = Number(t.closest("[data-min]").dataset.min);
      renderLengths();
    } else if (t.closest("[data-vis]")) {
      state.visibility = t.closest("[data-vis]").dataset.vis;
      renderVisibility();
    } else if (t.closest("[data-share]")) {
      const uid = t.closest("[data-share]").dataset.share;
      state.sharedWith = state.sharedWith.includes(uid) ? state.sharedWith.filter((u) => u !== uid) : [...state.sharedWith, uid];
      renderVisibility();
    } else if (t.closest("[data-use-intro]")) {
      state.useIntro = !state.useIntro;
      renderIntro();
    } else if (t.closest("[data-pick]")) {
      $("[data-file]").click();
    } else if (t.closest("[data-link-toggle]")) {
      const f = $("[data-link-form]");
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector("input").focus();
    } else if (t.closest("[data-remove]")) {
      state.attachments.splice(Number(t.closest("[data-remove]").dataset.remove), 1);
      renderChips();
    } else if (t.closest("[data-go]")) {
      start(t.closest("[data-go]"));
    }
  });
  const addNotes = async (fd, busy) => {
    state.busy = busy;
    updateMeta();
    try {
      const res = await api.extract(fd);
      for (const s of res.sources) state.attachments.push({ name: s.name, kind: s.kind, text: s.text });
      state.busy = "";
      renderChips();
      return true;
    } catch (err) {
      state.busy = "";
      updateMeta();
      setError(err.message);
      return false;
    }
  };
  $("[data-file]").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    setError("");
    await addNotes(fd, `Reading ${files.length === 1 ? files[0].name : `${files.length} files`}…`);
  });
  $("[data-link-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = e.currentTarget.querySelector("input");
    if (!input.value.trim()) return;
    const fd = new FormData();
    fd.append("url", input.value.trim());
    setError("");
    if (await addNotes(fd, "Fetching the page…")) {
      input.value = "";
      e.currentTarget.hidden = true;
    }
  });
  notes.addEventListener("input", () => {
    updateMeta();
    briefSoon(1500);
  });
  $("#topic").addEventListener("input", renderStage);
  $("#your-name").addEventListener("input", renderStage);

  function editHost() {
    openCastSheet({
      title: "Your co-host", host: state.host, personas: data.personas,
      onDone: (next) => {
        state.host = hostOf(next);
        renderHost();
      },
    });
  }

  // ---- start the call ----------------------------------------------------------------------

  async function start(btn) {
    setError("");
    const topic = $("#topic").value.trim();
    if (!topic) return setError(wording().missing);
    if (!session.options.api_key_set) return setError("GEMINI_API_KEY isn't set on the server, so calls can't start.");
    const yourName = $("#your-name").value.trim();
    const language = $("#language").value.trim() || "English";
    local.set("gp_cohost", {
      host: { ...state.host, context: "" },  // private notes aren't kept in the browser
      mode: state.mode, minutes: state.minutes, visibility: state.visibility, yourName, language,
      rules: rules.get(), useMemory: state.useMemory,
    });
    btn.disabled = true;
    let mic;
    try {
      mic = await startCallAudio();          // inside the click: the mic and audio unlock
    } catch (err) {
      setError(err.message);
      btn.disabled = false;
      return;
    }
    try {
      const res = await api.createCohost({
        request: {
          host: state.host, mode: state.mode, topic, notes: collectNotes().slice(0, notesMax), minutes: state.minutes,
          notes_names: state.attachments.map((a) => a.name).slice(0, 20), your_name: yourName, language,
          hard_rules: rules.get(), use_memory: Boolean(session.options.memory && state.useMemory),
        },
        visibility: state.visibility,
        shared_with: state.visibility === "private" ? state.sharedWith : [],
        use_show_intro: state.useIntro,
      });
      if (res.trimmed) toast(`Your notes were long, so your co-host uses the first ${notesMax.toLocaleString()} characters.`);
      session.refresh();
      navigate(`/cohost/${res.id}`);
    } catch (err) {
      takeHandoff();
      mic.close();
      if (err.status === 401) return navigate(loginPath("/cohost"));
      setError(err.message);
      btn.disabled = false;
      session.refresh().then(renderCost);
    }
  }

  // ---- first paint ----------------------------------------------------------------------------

  if (!micSupported()) {
    setError(window.isSecureContext ? "This browser can't stream the mic. Try a recent Chrome, Safari or Firefox."
      : "Co-hosting needs the mic, which needs a secure connection (https).");
  }
  renderHost();
  renderModes();
  renderLengths();
  renderVisibility();
  renderIntro();
  renderChips();
  tint();
  const [personas, conns, intro] = await Promise.all([
    api.list("personas").catch(() => ({ items: [] })),
    api.connections().catch(() => ({ connected: [] })),
    api.showIntro().catch(() => ({ intro: null })),
  ]);
  data.personas = personas.items;
  data.connections = conns.connected;
  data.intro = intro.intro;
  renderVisibility();
  renderIntro();
  renderTopic();
  renderMemory();
  if (session.options.memory) api.memories().then((d) => { remembered = d.kept || []; renderMemory(); }).catch(() => {});
  $("#topic").focus();
  return { unmount() { offHead(); } };
}

// /albums (yours) and /album/{id}: playlists of pods. A pod can be in several
// albums; each album is private, for connections, or public, and anyone who can
// see an album sees only the pods in it they're allowed to hear.
import { api } from "../api.js";
import { material, waiting } from "../components.js";
import { html, setHtml } from "../html.js";
import { icon, VISIBILITY_ICON, VISIBILITY_LABEL } from "../icons.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { albumCard, bindSubscribe, personAvatar, subscribeButton } from "../social.js";
import { applyAccent } from "../theme.js";
import { confirmSheet, openSheet } from "../ui.js";
import { toast } from "../util.js";
import { appHeader, bindHeader, row, sleeve } from "./library.js";

const ACCENTS = ["#6A4FB0", "#B8336A", "#3B3F9E", "#B5521C", "#1F7F6A", "#80620F", "#2E6F9E", "#3A4250"];
const VIS = [
  ["private", "Only you. Add it to a pod's sharing to let others in."],
  ["connections", "Your connections can see it and subscribe."],
  ["public", "Anyone can see it and subscribe."],
];

/** An album on the stage: its stack of sleeves in its colour, its name, and who can see it. */
function onStage(a, tag) {
  return html`
    ${material()}
    <span class="intro-air"><i aria-hidden="true"></i>${tag}</span>
    <div class="cstage-top">
      <span class="album-cover" style="--tile:${a.accent || ACCENTS[0]}" aria-hidden="true">${icon("bars", 26, 2.4)}</span>
      <span class="col grow"><strong class="pstage-name">${a.title || "Unnamed album"}</strong>
        <span class="pstage-facts">${icon(VISIBILITY_ICON[a.visibility] || "lock", 13)} ${VISIBILITY_LABEL[a.visibility] || "Private"}</span></span>
    </div>
    <p class="pstage-say">${a.description || "What ties these pods together? A series, a season, a theme."}</p>`;
}

/** /albums?edit=new or ?edit=<id>: a name, what it's about, who can see it and a colour,
 *  with the album on a stage as you go. */
async function editor(root, id) {
  let start = { visibility: "private", accent: ACCENTS[0] };
  if (id) {
    try {
      start = (await api.album(id)).album;
    } catch {
      navigate("/albums", { replace: true });
      return null;
    }
  }
  const state = { visibility: start.visibility || "private", accent: start.accent || ACCENTS[0] };
  const swatches = ACCENTS.includes(state.accent) ? ACCENTS : [state.accent, ...ACCENTS];
  const back = id ? `/album/${id}` : "/albums";
  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide intro-page">
      <a class="btn link back-link" href="${back}" data-link>${icon("chevronLeft", 16)}${id ? start.title : "Albums"}</a>
      <div class="page-title"><div class="col">
        <h1 class="two">${id ? "Edit" : "A new album."}<span class="ask">${id ? start.title : "A set of your pods."}</span></h1>
      </div></div>
      <form class="intro-form" data-form>
        <section class="intro-sec">
          <h2 class="create-h2 first">Name it</h2>
          <label class="sr-only" for="al-title">Name</label>
          <input id="al-title" class="field intro-name" maxlength="80" required value="${start.title || ""}" placeholder="Bible stories, gossip edition">
          <label class="field-label" for="al-desc">What it's about <span class="faint small">optional</span></label>
          <textarea id="al-desc" class="field area short" maxlength="1000" placeholder="What ties these pods together.">${start.description || ""}</textarea>
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">Who can see it</h2>
          <div class="open-grid" role="radiogroup" aria-label="Who can see it" data-vis-list></div>
          <p class="faint small">Pods keep their own sharing: people only see the pods in here they could hear anyway.</p>
        </section>
        <section class="intro-sec">
          <h2 class="create-h2">Its colour</h2>
          <div class="swatches" role="radiogroup" aria-label="Colour" data-swatches></div>
        </section>
        <aside class="intro-side" aria-label="The album you're making">
          <div class="intro-stage stage pstage" data-stage></div>
          <div class="intro-go">
            <p class="error" role="alert" data-error></p>
            <button class="btn white big block" type="submit">${id ? "Save" : "Create album"}</button>
            <a class="btn link" href="${back}" data-link>Cancel</a>
          </div>
        </aside>
      </form>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (q) => el.querySelector(q);
  const read = () => ({ title: $("#al-title").value.trim(), description: $("#al-desc").value.trim(), ...state });
  const render = () => {
    setHtml($("[data-vis-list]"), html`${VIS.map(([v, desc]) => html`
      <button type="button" role="radio" class="open-tile" data-vis="${v}" aria-checked="${state.visibility === v ? "true" : "false"}" style="--k:var(--fg)">
        <span class="open-dot" aria-hidden="true"></span>
        <strong>${VISIBILITY_LABEL[v]}</strong><span class="open-blurb">${desc}</span></button>`)}`);
    setHtml($("[data-swatches]"), html`${swatches.map((c) => html`
      <button type="button" role="radio" class="swatch" data-accent="${c}" aria-checked="${state.accent === c ? "true" : "false"}" style="--tile:${c}" aria-label="Colour ${c}"></button>`)}`);
    applyAccent($("[data-stage]"), state.accent);
    setHtml($("[data-stage]"), onStage(read(), id ? "Your album" : "New album"));
  };
  el.addEventListener("input", render);
  el.addEventListener("click", (e) => {
    const vis = e.target.closest("[data-vis]");
    const sw = e.target.closest("[data-accent]");
    if (vis) state.visibility = vis.dataset.vis;
    else if (sw) state.accent = sw.dataset.accent;
    else return;
    render();
    el.querySelector(vis ? `[data-vis="${state.visibility}"]` : `[data-accent="${state.accent}"]`)?.focus();
  });
  $("[data-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("[data-error]").textContent = "";
    try {
      const saved = id ? await api.updateAlbum(id, read()) : await api.createAlbum(read());
      toast(id ? "Saved." : `${saved.title} is ready. Add some pods.`);
      navigate(`/album/${saved.id || id}`);
    } catch (err) {
      $("[data-error]").textContent = err.message;
    }
  });
  render();
  return { unmount() { offHead(); } };
}

// ---- /albums --------------------------------------------------------------------------------

export async function albumsView(root, { url }) {
  if (!session.signedIn) {
    navigate(loginPath("/albums"), { replace: true });
    return null;
  }
  applyAccent(document.documentElement, "#6A4FB0");
  const editing = url.searchParams.get("edit");
  if (editing) return editor(root, editing === "new" ? "" : editing);
  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide">
      <div class="page-title row">
        <div class="col grow"><h1 class="two">Albums.<span class="ask">Your pods, in sets.</span></h1>
          <p class="muted">Like playlists or series. Make one public and people can subscribe to it.</p></div>
        <a class="btn white" href="/albums?edit=new" data-link>${icon("plus", 16, 2.6)}New album</a>
      </div>
      <div data-list>${waiting()}</div>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  let albums = [];
  const render = () => setHtml(el.querySelector("[data-list]"), albums.length
    ? html`<div class="album-grid">${albums.map((a) => albumCard(a, { mine: true }))}</div>`
    : html`<a class="ptile ptile-new" href="/albums?edit=new" data-link>
        <span class="ptile-plus" aria-hidden="true">${icon("plus", 20, 2.4)}</span>
        <span class="ptile-text"><strong>Make your first album</strong><span class="ptile-say">Then add pods from the album page, or when you make a pod.</span></span></a>`);
  albums = (await api.albums().catch(() => ({ albums: [] }))).albums;
  render();
  return { unmount() { offHead(); } };
}

// ---- /album/{id} ----------------------------------------------------------------------------

export async function albumView(root, { params: [albumId] }) {
  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`${appHeader({ search: false })}<main class="page">${waiting()}</main>`);
  root.append(el);
  let data;
  try {
    data = await api.album(albumId);
  } catch (err) {
    if (err.status === 401 || (err.status === 404 && !session.signedIn)) {
      navigate(loginPath(), { replace: true });
      return null;
    }
    setHtml(el, html`${appHeader({ search: false })}<main class="page"><div class="splash-card"><h1>Album not found</h1>
      <p class="muted">${err.message}</p><a class="btn white" href="/" data-link>Back to your pods</a></div></main>`);
    const off = bindHeader(el);
    return { unmount() { off(); } };
  }

  const render = () => {
    const a = data.album;
    applyAccent(document.documentElement, a.accent || "#6A4FB0");
    setHtml(el, html`
      ${appHeader({ search: false })}
      <main class="page wide">
        <header class="intro-stage stage album-stage" style="--tile:${a.accent || "#6A4FB0"}" data-hero>
          ${material()}
          <span class="intro-air"><i aria-hidden="true"></i>${VISIBILITY_LABEL[a.visibility]} album</span>
          <div class="cstage-top">
            <span class="album-cover big" aria-hidden="true">${icon("bars", 44, 2.2)}</span>
            <div class="col grow hero-text">
              <h1>${a.title}</h1>
              ${a.description ? html`<p class="pstage-say">${a.description}</p>` : ""}
              <span class="row gap wrap album-by"><a class="creator-chip" href="/creator/${data.owner.uid}" data-link>${personAvatar(data.owner, 24)}<strong>${data.owner.name}</strong></a>
                <span class="pstage-facts">${a.pods === 1 ? "1 pod" : `${a.pods} pods`}${data.mine ? ` · ${data.subscribers === 1 ? "1 subscriber" : `${data.subscribers} subscribers`}` : ""}</span></span>
            </div>
          </div>
          <div class="row gap wrap hero-actions">
            ${data.mine ? html`
              <a class="btn white" href="/new?album=${a.id}" data-link>${icon("plus", 16, 2.6)}New pod here</a>
              <button class="btn quiet" type="button" data-add>Add pods</button>
              <a class="btn quiet" href="/albums?edit=${a.id}" data-link>${icon("edit", 16)}Edit</a>
              <button class="btn quiet danger-text" type="button" data-delete>${icon("trash", 16)}Delete</button>`
              : subscribeButton({ kind: "album", id: a.id, subscribed: data.subscribed, subscribers: data.subscribers })}
          </div>
        </header>
        ${data.shows.length ? html`<ul class="lib-list album-pods">${data.shows.map((s) => row(s, false, data.mine ? "mine" : "album"))}</ul>`
          : html`<p class="empty">${data.mine ? "No pods in this album yet. Add some, or start a new pod here." : "No pods here that you can listen to yet."}</p>`}
      </main>`);
    applyAccent(el.querySelector("[data-hero]"), a.accent || "#6A4FB0");
  };
  render();
  const offHead = bindHeader(el);
  const offSub = bindSubscribe(el, { onChange: (s) => Object.assign(data, { subscribed: s.subscribed, subscribers: s.subscribers }) });

  el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-delete]")) {
      const ok = await confirmSheet({
        title: `Delete ${data.album.title}?`, message: "The pods in it stay; they're just not grouped any more.",
        confirm: "Delete album", danger: true,
      });
      if (!ok) return;
      await api.deleteAlbum(albumId).catch((err) => toast(err.message));
      navigate("/albums");
    } else if (e.target.closest("[data-add]")) {
      await pickPods();
      data = await api.album(albumId);
      render();
    }
  });

  async function pickPods() {
    const shows = (await api.listShows("mine")).shows;
    const div = document.createElement("div");
    div.className = "stack";
    const draw = () => setHtml(div, html`
      <p class="muted small">Tap a pod to put it in this album or take it out. A pod can be in more than one album.</p>
      <ul class="pick-list">${shows.map((s) => {
        const inside = (s.album_ids || []).includes(albumId);
        return html`<li><button type="button" class="pick-row" data-pick="${s.id}" aria-pressed="${inside}">
          ${sleeve(s, "sm")}
          <span class="ellipsis grow">${s.title || "Untitled pod"}</span>
          <span class="pick-check" aria-hidden="true">${inside ? icon("check", 16, 3) : icon("plus", 16, 2.6)}</span></button></li>`;
      })}</ul>`);
    draw();
    div.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-pick]");
      if (!b) return;
      const s = shows.find((x) => x.id === b.dataset.pick);
      const ids = new Set(s.album_ids || []);
      if (ids.has(albumId)) ids.delete(albumId); else ids.add(albumId);
      try {
        s.album_ids = (await api.organize(s.id, { album_ids: [...ids] })).album_ids;
        draw();
      } catch (err) {
        toast(err.message);
      }
    });
    await new Promise((resolve) => openSheet({ title: "Pods in this album", body: div, onClose: resolve }));
  }

  return { unmount() { offHead(); offSub(); } };
}

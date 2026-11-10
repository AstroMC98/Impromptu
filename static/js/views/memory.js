// Memory: what your co-hosts remember about you. After a call with memory on, they propose
// a few things; nothing is kept until you say so, one card at a time: right keeps it, left
// forgets it. Below the deck is everything already kept, per co-host and shared, where you
// can reword, move, remove or add. Every swipe has a button and a key (Left, Right).
import { api } from "../api.js";
import { waiting } from "../components.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { animate, reduced } from "../motion.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent } from "../theme.js";
import { confirmSheet, openSheet } from "../ui.js";
import { toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const HOUSE_ACCENT = "#B8336A";
const THROW = 96;
const FLICK = 0.55;
const GELS = ["#6A4FB0", "#2F6BD0", "#1F7F6A", "#B5521C", "#B8336A", "#2E6F9E"];
const gel = (m) => GELS[[...(m.host_key || "shared")].reduce((n, c) => n + c.charCodeAt(0), 0) % GELS.length];
const whose = (m) => (m.scope === "caller" ? `Caller · ${m.caller_name || "a listener"}`
  : m.scope === "shared" || !m.host ? "Every co-host" : m.host);

export async function memoryView(root) {
  if (!session.signedIn) {
    navigate(loginPath("/memory"), { replace: true });
    return null;
  }
  if (!session.options.memory) {
    navigate("/you", { replace: true });
    return null;
  }
  applyAccent(document.documentElement, HOUSE_ACCENT);
  const el = document.createElement("div");
  el.className = "house-page memory-page";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="memory-main">
      <div class="page-title"><h1 class="two"><span>What your co-hosts remember.</span> <span class="ask">Nothing is kept until you say so.</span></h1></div>
      <section class="mem-review" data-review aria-label="Memories to review"></section>
      <section class="mem-kept" data-kept aria-label="Kept memories"></section>
      <section class="mem-more" data-more aria-label="Notebooks and callers"></section>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (s) => el.querySelector(s);
  let pending = [];
  let kept = [];
  let busy = false;
  let dead = false;
  let rememberCallers = false;
  let notebooks = [];

  const card = (m, depth) => html`
    <article class="mcard" data-depth="${depth}" style="--gel:${gel(m)}" ${depth ? html`aria-hidden="true"` : ""}>
      <span class="mcard-who">${whose(m)}</span>
      <span class="xstamp keep" aria-hidden="true">Keep</span>
      <span class="xstamp pass" aria-hidden="true">Forget</span>
      <p class="mcard-text">${m.text}</p>
      ${m.show_title ? html`<span class="mcard-from">From “${m.show_title}”</span>` : ""}
    </article>`;

  const renderReview = (focus = false) => {
    if (dead) return;
    const m = pending[0];
    if (!m) {
      setHtml($("[data-review]"), kept.length ? "" : html`
        <div class="mem-empty">
          <p class="mem-empty-t">Nothing to review yet.</p>
          <p class="muted">Start a co-host call with “Use memory” on. Afterwards, what's worth remembering shows up here for a yes or a no.</p>
          <a class="btn white" href="/cohost" data-link>${icon("mic", 16, 2.2)}Start a co-host call</a>
        </div>`);
      return;
    }
    setHtml($("[data-review]"), html`
      <h2 class="mem-h">To review <span class="faint">${pending.length}</span></h2>
      <p class="deck-hint" aria-hidden="true">
        <span class="dh pass"><b>&larr;</b> <span class="by-touch">Swipe left</span><span class="by-keys">Left arrow</span> to forget</span>
        <span class="dh keep"><span class="by-touch">Swipe right</span><span class="by-keys">Right arrow</span> to keep <b>&rarr;</b></span>
      </p>
      <div class="mdeck" tabindex="0" role="group" aria-roledescription="deck of cards"
        aria-label="Memory for ${whose(m)}: ${m.text}. ${pending.length} to review. Right arrow keeps it, left arrow forgets it.">
        ${[2, 1, 0].map((d) => (pending[d] ? card(pending[d], d) : ""))}
      </div>
      <div class="deck-actions">
        <button class="round-btn deck-btn" type="button" data-swipe="pass" aria-label="Forget it">${icon("close", 22, 2.4)}<span class="deck-lab" aria-hidden="true">Forget</span></button>
        ${m.scope === "caller" ? html`<span class="mem-for">For ${m.host}</span>`
          : html`<button class="btn quiet mem-scope" type="button" data-scope>${m.scope === "shared" ? `Only for ${m.host || "this co-host"}` : "Share with every co-host"}</button>`}
        <button class="round-btn deck-btn" type="button" data-swipe="keep" aria-label="Keep it">${icon("heart", 22, 2.2)}<span class="deck-lab" aria-hidden="true">Keep</span></button>
      </div>
      <p class="sr-only" role="status" data-said></p>`);
    bindDrag($('.mcard[data-depth="0"]'));
    if (focus) $(".mdeck")?.focus({ preventScroll: true });
  };

  const group = (title, items) => (items.length ? html`
    <div class="mem-group">
      <h3 class="mem-group-h">${title} <span class="faint">${items.length}</span></h3>
      <ul class="mem-list">${items.map((m) => html`
        <li class="mem-row">
          <span class="mem-text">${m.text}</span>
          <button class="round-btn mem-btn" type="button" data-edit="${m.id}" aria-label="Edit: ${m.text}">${icon("edit", 16)}</button>
          <button class="round-btn mem-btn" type="button" data-forget="${m.id}" aria-label="Forget: ${m.text}">${icon("close", 16, 2.4)}</button>
        </li>`)}</ul>
    </div>` : "");

  const renderKept = () => {
    if (dead) return;
    const shared = kept.filter((m) => m.scope !== "caller" && (m.scope === "shared" || !m.host_key));
    const callers = kept.filter((m) => m.scope === "caller");
    const hosts = [...new Map(kept.filter((m) => m.scope === "host" && m.host_key).map((m) => [m.host_key, m.host])).entries()];
    setHtml($("[data-kept]"), html`
      <div class="mem-kept-head">
        <h2 class="mem-h">Kept <span class="faint">${kept.length}</span></h2>
        <button class="btn quiet" type="button" data-add>${icon("plus", 16, 2.4)}Add one</button>
      </div>
      ${kept.length ? "" : html`<p class="muted">Nothing kept yet. You can also write one yourself.</p>`}
      ${group("Every co-host knows", shared)}
      ${hosts.map(([key, name]) => group(`Only ${name} knows`, kept.filter((m) => m.scope === "host" && m.host_key === key)))}
      ${group("Callers your hosts remember", callers)}`);
  };

  /** Under the memories: each host's notebook, and whether callers are remembered. */
  const renderMore = () => {
    if (dead) return;
    const named = new Map(notebooks.map((n) => [n.host_key, n.host]));
    for (const m of kept.concat(pending)) if (m.scope !== "caller" && m.host_key && !named.has(m.host_key)) named.set(m.host_key, m.host);
    for (const p of session.options.persona_presets || []) if (!named.has(p.name.toLowerCase())) named.set(p.name.toLowerCase(), p.name);
    const without = [...named].filter(([key]) => !notebooks.some((n) => n.host_key === key));
    setHtml($("[data-more]"), html`
      <div class="mem-block">
        <h2 class="mem-h">Notebooks</h2>
        <p class="muted small">Pages of your own material a host can look things up in: facts, an outline, a whole report.</p>
        ${notebooks.length ? html`<ul class="mem-list">${notebooks.map((n) => html`
          <li><a class="mem-row nb-shelf" href="/notebook?host=${encodeURIComponent(n.host)}" data-link>
            <span class="mem-text">${n.host}</span>
            <span class="muted small">${n.pages} page${n.pages === 1 ? "" : "s"}</span>${icon("chevronRight", 16)}</a></li>`)}</ul>` : ""}
        <div class="row gap nb-open">
          <label class="sr-only" for="nb-host">Open a notebook for</label>
          <select id="nb-host" class="field">
            <option value="">Start a notebook for…</option>
            ${without.map(([, name]) => html`<option value="${name}">${name}</option>`)}
          </select>
        </div>
      </div>
      <div class="mem-block">
        <h2 class="mem-h">Callers</h2>
        <button type="button" role="switch" class="radio-card research-card" data-toggle-callers aria-checked="${rememberCallers ? "true" : "false"}">
          <span class="radio-dot" aria-hidden="true"></span>
          <span class="radio-text"><span class="radio-title">${icon("people", 16)} Remember callers</span>
            <span class="radio-desc">When someone signed in calls one of your live pods, its hosts can remember them for next time.
              Each caller shows up above for a yes or a no first.</span></span>
        </button>
      </div>`);
  };

  const say = (text) => { const s = $("[data-said]"); if (s) s.textContent = text; };

  const decide = async (dir, from = { x: 0, y: 0 }) => {
    const m = pending[0];
    const top = $('.mcard[data-depth="0"]');
    if (!m || !top || busy) return;
    busy = true;
    const keep = dir === "keep";
    const sign = keep ? 1 : -1;
    top.classList.add(dir);
    const off = Math.max(innerWidth, 600) * 0.9 * sign;
    const fly = animate(top, [
      { transform: `translate(${from.x}px, ${from.y}px) rotate(${from.x / 18}deg)`, opacity: 1 },
      { transform: `translate(${off}px, ${from.y + 40}px) rotate(${sign * 22}deg)`, opacity: 0 },
    ], { duration: 320, easing: "cubic-bezier(.4, 0, .9, .6)", calm: [{ opacity: 1 }, { opacity: 0 }] }).finished.catch(() => {});
    try {
      const saved = keep ? await api.editMemory(m.id, m.scope === "caller" ? { status: "kept" } : { status: "kept", scope: m.scope })
        : await api.forgetMemory(m.id);
      await fly;
      pending = pending.slice(1);
      if (keep) kept = [saved, ...kept];
      const hadFocus = el.contains(document.activeElement);
      busy = false;
      renderReview(hadFocus);
      renderKept();
      say(`${keep ? "Kept" : "Forgotten"}.${pending.length ? ` ${pending.length} left.` : " That was the last one."}`);
    } catch (err) {
      await fly;
      busy = false;
      renderReview(true);
      toast(err.message);
    }
  };

  function bindDrag(node) {
    if (!node) return;
    let start = null;
    let last = null;
    const stamps = { keep: node.querySelector(".xstamp.keep"), pass: node.querySelector(".xstamp.pass") };
    const place = (x, y) => {
      node.style.transform = `translate(${x}px, ${y}px) rotate(${x / 18}deg)`;
      stamps.keep.style.opacity = String(Math.max(0, Math.min(1, x / THROW)));
      stamps.pass.style.opacity = String(Math.max(0, Math.min(1, -x / THROW)));
    };
    const settle = (x, y) => {
      node.style.transform = "";
      stamps.keep.style.opacity = stamps.pass.style.opacity = "";
      animate(node, [{ transform: `translate(${x}px, ${y}px) rotate(${x / 18}deg)` }, { transform: "none" }], { spring: "snappy", fill: "none", calm: null });
    };
    node.addEventListener("pointerdown", (e) => {
      if (busy || (e.pointerType === "mouse" && e.button !== 0)) return;
      start = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, t: e.timeStamp, v: 0 };
      node.setPointerCapture?.(e.pointerId);
      node.classList.add("held");
    });
    node.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dt = Math.max(1, e.timeStamp - last.t);
      last = { x: e.clientX, t: e.timeStamp, v: (e.clientX - last.x) / dt };
      place(e.clientX - start.x, (e.clientY - start.y) * 0.25);
    });
    const end = (e) => {
      if (!start) return;
      const x = e.clientX - start.x, y = (e.clientY - start.y) * 0.25;
      start = null;
      node.classList.remove("held");
      const thrown = e.type !== "pointercancel"
        && (Math.abs(x) > THROW || (Math.abs(last.v) > FLICK && Math.sign(last.v) === Math.sign(x) && Math.abs(x) > 12));
      if (thrown) return decide(x > 0 ? "keep" : "pass", reduced() ? undefined : { x, y });
      settle(x, y);
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  /** Reword a memory, or write a new one (m: null). */
  const editSheet = (m) => {
    const hosts = [...new Map(kept.concat(pending).filter((k) => k.host_key).map((k) => [k.host_key, k.host])).values()];
    const sheet = openSheet({
      title: m ? "Edit memory" : "Add a memory",
      body: html`
        <form class="col gap" data-mem-form>
          <label class="field-label" for="mem-text">What to remember</label>
          <textarea id="mem-text" class="field area short" maxlength="240" placeholder="I'm training for a half marathon in March.">${m?.text || ""}</textarea>
          ${m?.scope === "caller" ? "" : html`
          <label class="field-label" for="mem-who">Who knows it</label>
          <select id="mem-who" class="field">
            <option value="">Every co-host</option>
            ${(m?.host ? [m.host] : hosts).map((h) => html`<option value="${h}" ${m?.scope === "host" && m.host === h ? "selected" : ""}>Only ${h}</option>`)}
          </select>`}
          <p class="error" role="alert" data-mem-error></p>
          <button class="btn white big block" type="submit">${m ? "Save" : "Remember it"}</button>
        </form>`,
    });
    const form = sheet.el.querySelector("[data-mem-form]");
    form.querySelector("#mem-text").focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = form.querySelector("#mem-text").value.trim();
      const host = form.querySelector("#mem-who")?.value || "";
      if (!text) { form.querySelector("[data-mem-error]").textContent = "Write what to remember."; return; }
      try {
        if (m) {
          const saved = await api.editMemory(m.id, m.scope === "caller" ? { text } : { text, scope: host ? "host" : "shared" });
          kept = kept.map((k) => (k.id === m.id ? saved : k));
        } else {
          kept = [await api.addMemory({ text, scope: host ? "host" : "shared", host }), ...kept];
        }
        sheet.close();
        renderReview();
        renderKept();
      } catch (err) {
        form.querySelector("[data-mem-error]").textContent = err.message;
      }
    });
  };

  const onClick = async (e) => {
    const t = e.target;
    const swipe = t.closest("[data-swipe]");
    if (swipe) return decide(swipe.dataset.swipe);
    if (t.closest("[data-scope]") && pending[0]) {
      pending[0] = { ...pending[0], scope: pending[0].scope === "shared" && pending[0].host_key ? "host" : "shared" };
      return renderReview(true);
    }
    if (t.closest("[data-add]")) return editSheet(null);
    if (t.closest("[data-toggle-callers]")) {
      try {
        rememberCallers = (await api.memorySettings({ remember_callers: !rememberCallers })).remember_callers;
        renderMore();
        el.querySelector("[data-toggle-callers]")?.focus();
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    const edit = t.closest("[data-edit]");
    if (edit) return editSheet(kept.find((k) => k.id === edit.dataset.edit));
    const forget = t.closest("[data-forget]");
    if (forget) {
      const m = kept.find((k) => k.id === forget.dataset.forget);
      if (!m || !(await confirmSheet({ title: "Forget this?", message: m.text, confirm: "Forget it", danger: true }))) return;
      try {
        await api.forgetMemory(m.id);
        kept = kept.filter((k) => k.id !== m.id);
        renderReview();
        renderKept();
      } catch (err) {
        toast(err.message);
      }
    }
  };
  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !pending.length) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable], dialog, [role='dialog'], .sheet")) return;
    if (document.querySelector(".sheet, dialog[open]")) return;
    if (e.key === "ArrowRight") decide("keep");
    else if (e.key === "ArrowLeft") decide("pass");
    else return;
    e.preventDefault();
  };
  el.addEventListener("click", onClick);
  el.addEventListener("change", (e) => {
    if (e.target.id === "nb-host" && e.target.value) navigate(`/notebook?host=${encodeURIComponent(e.target.value)}`);
  });
  document.addEventListener("keydown", onKey);

  setHtml($("[data-review]"), waiting("Fetching what they remember"));
  api.memories().then((data) => {
    pending = data.pending || [];
    kept = data.kept || [];
    rememberCallers = Boolean(data.remember_callers);
    renderReview();
    renderKept();
    renderMore();
    api.notebooks().then((d) => { notebooks = d.notebooks || []; renderMore(); }).catch(() => {});
  }).catch((err) => setHtml($("[data-review]"), html`<p class="error">${err.message}</p>`));

  return { unmount() { dead = true; offHead(); document.removeEventListener("keydown", onKey); } };
}

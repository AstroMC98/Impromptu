// /admin — grant demo credits. Admins are the emails in ADMIN_EMAILS. People are tiles;
// the one you pick stands on a stage with their balance and the grant form (beside the
// list on a wide window, in a sheet on a phone).
import { api } from "../api.js";
import { shape } from "../cast.js";
import { material, waiting } from "../components.js";
import { html, setHtml } from "../html.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent, callerColor } from "../theme.js";
import { openSheet } from "../ui.js";
import { fmtAgo, toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const wide = () => matchMedia("(min-width: 1024px)").matches;

export async function adminView(root) {
  if (!session.signedIn) {
    navigate(loginPath("/admin"), { replace: true });
    return null;
  }
  if (!session.admin) {
    navigate("/", { replace: true });
    return null;
  }
  applyAccent(document.documentElement, "#3A4250");
  let users = [];
  let picked = "";
  let timer = 0;
  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide personas-page admin-page">
      <div class="page-title"><div class="col">
        <h1 class="two">Admin.<span class="ask">Credits for the demo.</span></h1>
        <p class="muted">One credit is about ${1 / session.options.credits_per_minute} minute of pod.</p>
      </div></div>
      <div class="personas-body">
        <div class="personas-lists">
          <label class="sr-only" for="a-q">Search users</label>
          <input id="a-q" class="field intro-name admin-search" type="search" placeholder="Search by name or email">
          <div data-users>${waiting()}</div>
        </div>
        <aside class="personas-side" aria-label="The person you picked" data-side></aside>
      </div>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);

  /** The stage and the grant form for one person: beside the list, or in a sheet. */
  const panel = (u, done) => {
    const box = document.createElement("div");
    box.className = "admin-panel";
    setHtml(box, html`
      <div class="intro-stage stage ystage">
        ${material()}
        <span class="intro-air"><i aria-hidden="true"></i>Their balance</span>
        <div class="ystage-num">${shape(u.name, 60)}
          <span class="col"><strong class="credit-num">${u.credits ?? 0}</strong><span class="pstage-facts">credit${u.credits === 1 ? "" : "s"}</span></span></div>
        <div class="col admin-who"><strong class="pstage-name">${u.name}</strong>
          <span class="pstage-facts">${u.email} · seen ${fmtAgo(u.last_seen)}</span></div>
      </div>
      <form class="admin-grant" data-grant-form>
        <div class="chips" role="group" aria-label="Quick amounts">${[10, 30, 60, 120].map((n) => html`<button type="button" class="chip" data-amt="${n}" aria-pressed="${n === 30 ? "true" : "false"}">+${n}</button>`)}</div>
        <div class="field-pair">
          <span class="col"><label class="field-label" for="g-amt">Amount</label>
            <input id="g-amt" class="field" type="number" step="1" value="30" required></span>
          <span class="col"><label class="field-label" for="g-note">Note</label>
            <input id="g-note" class="field" maxlength="200" placeholder="Demo credits"></span>
        </div>
        <p class="faint small">A negative amount takes credits back.</p>
        <p class="error" role="alert" data-error></p>
        <button class="btn white big block" type="submit">Apply</button>
      </form>`);
    applyAccent(box.querySelector(".stage"), callerColor(u.name));
    const form = box.querySelector("form");
    form.addEventListener("click", (ev) => {
      const amt = ev.target.closest("[data-amt]");
      if (!amt) return;
      form.querySelector("#g-amt").value = amt.dataset.amt;
      for (const c of form.querySelectorAll("[data-amt]")) c.setAttribute("aria-pressed", String(c === amt));
    });
    form.querySelector("#g-amt").addEventListener("input", (ev) => {
      for (const c of form.querySelectorAll("[data-amt]")) c.setAttribute("aria-pressed", String(c.dataset.amt === ev.target.value));
    });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const r = await api.grant(u.uid, Number(form.querySelector("#g-amt").value), form.querySelector("#g-note").value.trim());
        u.credits = r.credits;
        toast(`${u.name} now has ${r.credits} credits.`);
        if (u.uid === session.me.uid) session.refresh();
        render();
        done?.();
      } catch (ex) {
        form.querySelector("[data-error]").textContent = ex.message;
      }
    });
    return box;
  };

  const render = () => {
    if (!users.some((u) => u.uid === picked)) picked = users[0]?.uid || "";
    setHtml(el.querySelector("[data-users]"), users.length ? html`
      <div class="ptile-grid">${users.map((u) => html`
        <button type="button" class="ptile" data-pick="${u.uid}" aria-pressed="${u.uid === picked ? "true" : "false"}">
          ${shape(u.name, 38)}
          <span class="ptile-text"><strong>${u.name}</strong><span class="ptile-say">${u.email}</span>
            <span class="ptile-facts">seen ${fmtAgo(u.last_seen)}</span></span>
          <span class="credit-pill">${u.credits ?? 0}</span>
        </button>`)}</div>` : html`<div class="mem-none">No users match.</div>`);
    const side = el.querySelector("[data-side]");
    const u = users.find((x) => x.uid === picked);
    side.replaceChildren(...(u ? [panel(u)] : []));
  };
  const load = async (q = "") => {
    users = (await api.adminUsers(q)).users;
    render();
  };

  el.querySelector("#a-q").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => load(e.target.value).catch((ex) => toast(ex.message)), 250);
  });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    picked = b.dataset.pick;
    render();
    el.querySelector(`[data-pick="${CSS.escape(picked)}"]`)?.focus({ preventScroll: true });
    if (!wide()) {
      const u = users.find((x) => x.uid === picked);
      const sheet = openSheet({ title: `Credits for ${u.name}`, body: panel(u, () => sheet.close()) });
    }
  });

  render();
  await load().catch((ex) => toast(ex.message));
  return { unmount() { offHead(); clearTimeout(timer); } };
}

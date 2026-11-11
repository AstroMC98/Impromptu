// /connections and /invite/{uid}: mutual connections. Pods shared with
// "Connections" (or with you by name) show up under Shared on your home screen.
import { api } from "../api.js";
import { shape } from "../cast.js";
import { material, waiting } from "../components.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent, callerColor, initial } from "../theme.js";
import { confirmSheet } from "../ui.js";
import { toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

function person(c, actions) {
  return html`
    <li class="person ctile">
      ${shape(c.name, 40)}
      <span class="col grow"><strong>${c.name}</strong><span class="muted small">${c.email || ""}</span></span>
      <span class="row gap">${actions}</span>
    </li>`;
}

export async function connectionsView(root) {
  if (!session.signedIn) {
    navigate(loginPath("/connections"), { replace: true });
    return null;
  }
  applyAccent(document.documentElement, "#2E6F9E");
  let data = null;
  const el = document.createElement("div");
  el.className = "page-wrap";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page wide you connections-page">
      <div class="page-title"><div class="col">
        <h1 class="two">Connections.<span class="ask">Who hears what you share.</span></h1>
      </div></div>
      <div class="you-body">
        <div class="you-lists" data-lists></div>
        <aside class="you-side" aria-label="Add someone">
          <div class="intro-stage stage ystage invite-stage">
            ${material()}
            <span class="intro-air"><i aria-hidden="true"></i>Your invite</span>
            <p class="pstage-say">Send this link to someone who isn't on Impromptu yet. When they open it, you're one tap from connected.</p>
            <div class="copy-row"><input class="field" readonly data-invite aria-label="Your invite link">
              <button class="btn quiet" type="button" data-copy>${icon("copy", 18)}Copy</button></div>
          </div>
          <form class="invite-add" data-add>
            <label class="field-label" for="c-email">Already here? Add them by email</label>
            <div class="row gap">
              <input id="c-email" class="field grow" type="email" placeholder="Their email" required>
              <button class="btn white" type="submit">Send</button>
            </div>
            <p class="error" role="alert" data-error></p>
          </form>
        </aside>
      </div>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);

  const section = (id, title, n, body) => html`
    <section class="intro-sec" aria-labelledby="${id}">
      <h2 id="${id}" class="create-h2">${title}${n ? html` <span class="faint">${n}</span>` : ""}</h2>
      ${body}
    </section>`;
  const render = () => {
    if (!data) return setHtml(el.querySelector("[data-lists]"), waiting());
    el.querySelector("[data-invite]").value = new URL(data.invite_path, location.origin).toString();
    setHtml(el.querySelector("[data-lists]"), html`
      ${data.incoming.length ? section("c-in", "Requests for you", data.incoming.length, html`<ul class="people">
          ${data.incoming.map((c) => person(c, html`
            <button class="btn white" type="button" data-accept="${c.uid}">Accept</button>
            <button class="btn quiet" type="button" data-remove="${c.uid}">Decline</button>`))}
        </ul>`) : ""}
      ${section("c-yours", "Your connections", data.connected.length, data.connected.length
        ? html`<ul class="people">${data.connected.map((c) => person(c, html`
            <button class="round-btn mem-btn" type="button" data-remove="${c.uid}" data-confirm aria-label="Remove ${c.name}">${icon("close", 16, 2.4)}</button>`))}</ul>`
        : html`<div class="mem-none">No connections yet. Send your invite link, or add someone by email.
            Connections can listen to the pods you share with them, and call in. You'll see theirs too.</div>`)}
      ${data.outgoing.length ? section("c-out", "Waiting for them", data.outgoing.length, html`<ul class="people">
          ${data.outgoing.map((c) => person(c, html`<button class="btn quiet" type="button" data-remove="${c.uid}">Cancel</button>`))}
        </ul>`) : ""}`);
  };
  const load = async () => {
    data = await api.connections();
    render();
    session.refresh();
  };

  el.querySelector("[data-add]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = el.querySelector("#c-email");
    const err = el.querySelector("[data-error]");
    err.textContent = "";
    try {
      const r = await api.connect({ email: input.value.trim() });
      toast(r.status === "connected" ? `You're connected with ${r.user.name}.` : `Request sent to ${r.user.name}.`);
      input.value = "";
      await load();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-copy]")) {
      const link = el.querySelector("[data-invite]").value;
      try { await navigator.clipboard.writeText(link); toast("Invite link copied."); } catch { el.querySelector("[data-invite]").select(); }
      return;
    }
    const acc = e.target.closest("[data-accept]");
    const rem = e.target.closest("[data-remove]");
    try {
      if (acc) {
        await api.accept(acc.dataset.accept);
        toast("Connected.");
      } else if (rem) {
        if (rem.hasAttribute("data-confirm") && !(await confirmSheet({
          title: "Remove this connection?", message: "You'll stop seeing each other's shared pods.", confirm: "Remove", danger: true,
        }))) return;
        await api.disconnect(rem.dataset.remove);
      } else return;
      await load();
    } catch (ex) {
      toast(ex.message);
    }
  });

  render();
  await load().catch((ex) => toast(ex.message));
  return { unmount() { offHead(); } };
}

/** /invite/{uid}: someone's invite link. */
export async function inviteView(root, { params }) {
  const uid = params[0];
  applyAccent(document.documentElement, "#2E6F9E");
  const el = document.createElement("div");
  el.className = "page-wrap";
  root.append(el);
  let card;
  try {
    card = await api.userCard(uid);
  } catch {
    setHtml(el, html`${appHeader({ search: false })}<main class="page narrow"><div class="splash-card"><h1>That invite link doesn't work</h1>
      <p class="muted">The account may have been deleted. Ask for a new link.</p></div></main>`);
    return { unmount: bindHeader(el) };
  }
  const u = card.user;
  const render = (status) => setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="page narrow">
      <div class="splash-card">
        <span class="avatar" style="--av:${callerColor(u.name)};--size:72px">${initial(u.name)}</span>
        <h1>${u.name} invited you to connect</h1>
        <p class="muted">Connections can listen to each other's shared pods and call in to them.</p>
        ${!session.signedIn ? html`<a class="btn white big block" href="${loginPath()}" data-link>Sign in to connect</a>`
          : status === "you" ? html`<p class="ok">This is your own invite link. Send it to friends.</p>`
            : status === "connected" ? html`<p class="ok">You're connected.</p><a class="btn quiet" href="/" data-link>Go to your pods</a>`
              : status === "pending_out" ? html`<p class="ok">Request sent. You'll be connected when ${u.name} accepts.</p>`
                : html`<button class="btn white big block" type="button" data-connect>${status === "pending_in" ? "Accept" : "Connect"}</button>`}
        <p class="error" role="alert" data-error></p>
      </div>
    </main>`);
  render(card.status);
  const offHead = bindHeader(el);
  el.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-connect]")) return;
    try {
      const r = await api.connect({ uid });
      render(r.status);
      toast(r.status === "connected" ? `You're connected with ${u.name}.` : "Request sent.");
    } catch (ex) {
      el.querySelector("[data-error]").textContent = ex.message;
    }
  });
  return { unmount() { offHead(); } };
}

// A host's notebook ("/notebook?host=Zoe Park"): pages of your own material that one host
// can draw on. Write a page, or import a document (paste it, or pick a file) and it's
// split into pages. On a co-host call the host can look things up in it while you talk;
// for a written pod, the pages that match the topic go into that host's private notes.
import { api } from "../api.js";
import { waiting } from "../components.js";
import { html, setHtml } from "../html.js";
import { icon } from "../icons.js";
import { navigate } from "../router.js";
import { loginPath, session } from "../session.js";
import { applyAccent } from "../theme.js";
import { confirmSheet, openSheet } from "../ui.js";
import { toast } from "../util.js";
import { appHeader, bindHeader } from "./library.js";

const HOUSE_ACCENT = "#B8336A";
const PAGE_CHARS = 4000;

export async function notebookView(root, { url }) {
  const host = (url.searchParams.get("host") || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!session.signedIn) {
    navigate(loginPath(`/notebook?host=${encodeURIComponent(host)}`), { replace: true });
    return null;
  }
  if (!session.options.memory || !host) {
    navigate(session.options.memory ? "/memory" : "/you", { replace: true });
    return null;
  }
  applyAccent(document.documentElement, HOUSE_ACCENT);
  const el = document.createElement("div");
  el.className = "house-page notebook-page";
  setHtml(el, html`
    ${appHeader({ search: false })}
    <main class="notebook-main">
      <a class="btn link back-link" href="/memory" data-link>${icon("chevronLeft", 16)}Memory</a>
      <div class="page-title"><h1 class="two"><span>${host}'s notebook.</span> <span class="ask">What they can look up while you talk.</span></h1></div>
      <div data-meter></div>
      <div class="row gap wrap nb-actions">
        <button class="btn white" type="button" data-write>${icon("plus", 16, 2.4)}Write a page</button>
        <button class="btn quiet" type="button" data-import>${icon("file", 16)}Import a document</button>
      </div>
      <div data-pages>${waiting("Opening the notebook")}</div>
    </main>`);
  root.append(el);
  const offHead = bindHeader(el);
  const $ = (s) => el.querySelector(s);
  let book = { pages: [], chars: 0, max_pages: 100, max_chars: 100000 };
  let dead = false;

  const render = () => {
    if (dead) return;
    const pct = Math.min(100, Math.round((book.chars / book.max_chars) * 100));
    setHtml($("[data-meter]"), html`
      <div class="nb-meter" role="img" aria-label="${book.pages.length} of ${book.max_pages} pages, ${pct} percent full">
        <span class="nb-meter-bar"><span style="width:${Math.max(pct, book.pages.length ? 2 : 0)}%"></span></span>
        <span class="nb-meter-text"><strong>${book.pages.length}</strong> of ${book.max_pages} pages · ${book.chars.toLocaleString()} of ${book.max_chars.toLocaleString()} characters</span>
      </div>`);
    setHtml($("[data-pages]"), book.pages.length ? html`
      <ol class="nb-pages">${book.pages.map((p, i) => html`
        <li class="nb-page">
          <button type="button" class="nb-page-open" data-open="${p.id}">
            <span class="nb-page-n" aria-hidden="true">${i + 1}</span>
            <span class="nb-page-text"><strong>${p.title || "Page"}</strong>
              <span class="muted small">${p.text.replace(/\s+/g, " ").slice(0, 150)}</span></span>
          </button>
          <button class="round-btn mem-btn" type="button" data-remove="${p.id}" aria-label="Remove page ${i + 1}: ${p.title}">${icon("close", 16, 2.4)}</button>
        </li>`)}</ol>` : html`
      <div class="mem-empty">
        <p class="mem-empty-t">An empty notebook.</p>
        <p class="muted">Give ${host} facts, figures, your outline, a whole report. They'll draw on it without reading it out.</p>
      </div>`);
  };

  const take = (data) => { book = { ...book, ...data }; render(); };

  /** Write a new page (p: null), edit one, or import a document (long: true). */
  const pageSheet = (p, long = false) => {
    const sheet = openSheet({
      title: p ? "Edit page" : long ? "Import a document" : "Write a page",
      wide: true,
      body: html`
        <form class="col gap" data-page-form>
          <label class="field-label" for="nb-title">Title <span class="faint small">optional</span></label>
          <input id="nb-title" class="field" maxlength="80" value="${p?.title || ""}" placeholder="${long ? "Q3 board report" : "Pricing, in one page"}">
          <label class="field-label" for="nb-text">${long ? "The document" : "The page"}</label>
          <textarea id="nb-text" class="field area nb-area" ${long ? "" : html`maxlength="${PAGE_CHARS}"`}
            placeholder="${long ? "Paste it here, or pick a file below. It's split into pages for you." : "What should they know?"}">${p?.text || ""}</textarea>
          ${long ? html`
            <div class="row gap">
              <button class="btn quiet" type="button" data-file>${icon("file", 16)}Pick a file</button>
              <input type="file" hidden data-file-input accept=".txt,.md,.pdf,.docx,.csv,.json,.html,text/*,application/pdf">
              <span class="muted small" data-file-note>Text, Markdown, PDF or Word.</span>
            </div>` : html`<p class="faint small" data-count></p>`}
          <p class="error" role="alert" data-page-error></p>
          <button class="btn white big block" type="submit">${p ? "Save" : long ? "Import" : "Add the page"}</button>
        </form>`,
    });
    const form = sheet.el.querySelector("[data-page-form]");
    const area = form.querySelector("#nb-text");
    const fail = (msg) => { form.querySelector("[data-page-error]").textContent = msg; };
    const count = form.querySelector("[data-count]");
    const tally = () => { if (count) count.textContent = `${area.value.length.toLocaleString()} of ${PAGE_CHARS.toLocaleString()} characters`; };
    area.addEventListener("input", tally);
    tally();

    const input = form.querySelector("[data-file-input]");
    form.querySelector("[data-file]")?.addEventListener("click", () => input.click());
    input?.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const note = form.querySelector("[data-file-note]");
      note.textContent = `Reading ${file.name}…`;
      try {
        let text;
        if (/\.(txt|md|csv|json)$/i.test(file.name) || file.type.startsWith("text/")) {
          text = await file.text();
        } else {
          const fd = new FormData();
          fd.append("files", file);
          text = ((await api.extract(fd)).sources || []).map((s) => s.text).join("\n\n");
        }
        area.value = text;
        if (!form.querySelector("#nb-title").value) form.querySelector("#nb-title").value = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
        note.textContent = `${file.name}: ${text.length.toLocaleString()} characters.`;
      } catch (err) {
        note.textContent = "";
        fail(err.message);
      }
      input.value = "";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = form.querySelector("#nb-title").value.trim();
      const text = area.value.trim();
      if (!text) return fail("There's nothing on the page yet.");
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (p) {
          const saved = await api.editPage(p.id, { title, text });
          take({ pages: book.pages.map((x) => (x.id === p.id ? saved : x)),
            chars: book.chars - p.text.length + saved.text.length });
        } else {
          const res = await api.addPages({ host, title, text });
          take(res);
          if (res.added.length > 1) toast(`Imported as ${res.added.length} pages.`);
        }
        sheet.close();
      } catch (err) {
        fail(err.message);
        btn.disabled = false;
      }
    });
  };

  el.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest("[data-write]")) return pageSheet(null);
    if (t.closest("[data-import]")) return pageSheet(null, true);
    const open = t.closest("[data-open]");
    if (open) return pageSheet(book.pages.find((p) => p.id === open.dataset.open));
    const remove = t.closest("[data-remove]");
    if (remove) {
      const p = book.pages.find((x) => x.id === remove.dataset.remove);
      if (!p || !(await confirmSheet({ title: "Remove this page?", message: p.title || "Page", confirm: "Remove it", danger: true }))) return;
      try {
        await api.removePage(p.id);
        take({ pages: book.pages.filter((x) => x.id !== p.id), chars: book.chars - p.text.length });
      } catch (err) {
        toast(err.message);
      }
    }
  });

  api.notebook(host).then(take).catch((err) => setHtml($("[data-pages]"), html`<p class="error">${err.message}</p>`));
  return { unmount() { dead = true; offHead(); } };
}

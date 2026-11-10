// Hard rules: lines the hosts must never cross, whatever the style, a persona or anyone
// on air asks for. A short list you add to and remove from, shared by the New pod and
// co-host setup pages. The server puts them last in every prompt (prompts.hard_rules).
import { html, setHtml } from "./html.js";
import { icon } from "./icons.js";

export const MAX_RULES = 8;
const RULE_CHARS = 240;

const clean = (list) => {
  const out = [];
  for (const raw of list || []) {
    const r = String(raw || "").replace(/\s+/g, " ").trim().slice(0, RULE_CHARS);
    if (r && !out.some((o) => o.toLowerCase() === r.toLowerCase())) out.push(r);
  }
  return out.slice(0, MAX_RULES);
};

/** mountRules(host, initial): the editor. Returns { get() } with the rules as typed,
 *  including one still sitting in the box that was never added. */
export function mountRules(host, initial = []) {
  let rules = clean(initial);
  const id = `rule-new-${Math.random().toString(36).slice(2, 7)}`;

  const render = (focus = false) => {
    const full = rules.length >= MAX_RULES;
    setHtml(host, html`
      <p class="muted small rules-desc">Lines the hosts never cross, whatever anyone says on air.</p>
      ${rules.length ? html`<ol class="rules-list">${rules.map((r, i) => html`
        <li class="rule">
          <span class="rule-n" aria-hidden="true">${i + 1}</span>
          <span class="rule-text">${r}</span>
          <button type="button" class="round-btn rule-del" data-rule-del="${i}" aria-label="Remove rule ${i + 1}: ${r}">${icon("close", 15, 2.4)}</button>
        </li>`)}</ol>` : ""}
      ${full ? html`<p class="faint small">That's the most a show can carry (${MAX_RULES}).</p>` : html`
        <form class="row gap rules-add" data-rule-form>
          <label class="sr-only" for="${id}">${rules.length ? "Another hard rule" : "A hard rule"}</label>
          <input id="${id}" class="field" maxlength="${RULE_CHARS}" autocomplete="off"
            placeholder="${rules.length ? "Add another" : "Never swear. Or: don't name my employer."}">
          <button class="btn quiet" type="submit">Add</button>
        </form>`}
      <p class="sr-only" role="status" data-rule-said></p>`);
    if (focus) host.querySelector(`#${id}`)?.focus();
  };

  const say = (text) => {
    const el = host.querySelector("[data-rule-said]");
    if (el) el.textContent = text;
  };

  host.addEventListener("submit", (e) => {
    if (!e.target.closest("[data-rule-form]")) return;
    e.preventDefault();
    const before = rules.length;
    rules = clean([...rules, host.querySelector(`#${id}`)?.value]);
    render(true);
    if (rules.length > before) say(`Rule ${rules.length} added.`);
  });
  host.addEventListener("click", (e) => {
    const del = e.target.closest("[data-rule-del]");
    if (!del) return;
    rules = rules.filter((_, i) => i !== Number(del.dataset.ruleDel));
    render(true);
    say("Rule removed.");
  });

  render();
  return { get: () => clean([...rules, host.querySelector(`#${id}`)?.value]) };
}

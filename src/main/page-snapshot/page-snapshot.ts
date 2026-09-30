// Page snapshot: an indexed table of what a page lets you DO (buttons, links,
// fields, dropdowns), plus its visible text, so an agent can drive a page by
// ref ("click [12]", "type into [3]") without a screenshot or a css selector.
//
// The in-page reader is jev-snapshot.js, vendored verbatim from
// browser-use/jev-ultrafast (MIT). It keeps a code-owned identity per DOM node
// (a WeakMap in `window.__jevFast`), so a ref names an actual element, never a
// selector a model made up. Everything here is Mira's wrapper around it, and
// pure: the scripts are strings evaluated in the page by profiles.ts.
//
// The safety model is Jev's: an action names a ref from the LAST snapshot, and
// right before input we check that the page is still the one that snapshot
// described (same document, url, scroll, form values, and the target's own
// state and surrounding form/row text). If anything moved, the action is
// refused with "take a new snapshot" rather than clicking whatever now sits
// there. The snapshot's guards stay in the page; only the table crosses over.

import JEV_SNAPSHOT from './jev-snapshot.js?raw'

/** What an element supports: click it, type into it, pick one of its options. */
export type SnapshotOp = 'click' | 'type' | 'select'

export interface SnapshotElement {
  /** Stable for the life of the element: the same node keeps its ref across snapshots. */
  ref: number
  role: string
  label: string
  /** Current value (a field's text, a dropdown's selected label). */
  value: string
  checked?: string
  selected?: string
  expanded?: string
  ops: SnapshotOp[]
  /** Dropdown choices other than the current one. */
  options?: Array<{ value: string; label: string }>
}

export interface PageSnapshot {
  url: string
  title: string
  viewport: { w: number; h: number }
  scroll: { y: number; height: number }
  /** Visible text of the viewport, capped at 6000 chars. */
  text: string
  elements: SnapshotElement[]
  /** Actions past the 250 cap: not listed, so not actionable. */
  omitted: number
}

/** One raw action as the wrapper returns it (jev-snapshot's shape, minus rect). */
interface RawAction {
  node?: number
  kind: string
  role?: string
  label?: string
  value?: string
  current_value?: string
  checked?: string
  selected?: string
  expanded?: string
}

/** The script behind `snapshot`: run Jev's reader, keep its guards IN the page
 * (they carry up to 6000 chars of context per element, far too much to ship),
 * and return the table. Returns null while the document is navigating. */
export function snapshotScript(): string {
  return `(() => {
  const s = ${JEV_SNAPSHOT};
  if (!s) return null;
  const c = window.__jevFast;
  const ops = {};
  for (const a of s.actions) {
    if (a.node === undefined) continue;
    const list = ops[a.node] || (ops[a.node] = []);
    if (!list.includes(a.kind)) list.push(a.kind);
  }
  const guards = {};
  for (const node of Object.keys(ops)) guards[node] = JSON.stringify(s.guards[node]);
  c.last = { page_key: JSON.stringify(s.page_key), guards, ops };
  return {
    url: s.url, title: s.title, viewport: { w: s.w, h: s.h }, text: s.text, scroll: s.scroll,
    omitted: s.omitted_actions,
    actions: s.actions.filter((a) => a.node !== undefined).map(({ rect, ...a }) => a)
  };
})()`
}

const OP_OF_KIND: Record<string, SnapshotOp> = { click: 'click', fill: 'type', select: 'select' }

/** Fold Jev's per-(node, kind) actions into one row per element, the way its
 * own action_space does: an editable field is ONE row that supports both type
 * and click, a dropdown is one row carrying its options. */
export function groupSnapshot(raw: unknown): PageSnapshot | { error: string } {
  if (raw === null || raw === undefined) return { error: 'the page is navigating; try again' }
  if (typeof raw !== 'object') return { error: `unexpected snapshot reply: ${JSON.stringify(raw)}` }
  const r = raw as Record<string, unknown>
  const actions = Array.isArray(r.actions) ? (r.actions as RawAction[]) : []
  const elements: SnapshotElement[] = []
  const byRef = new Map<number, SnapshotElement>()
  for (const a of actions) {
    if (typeof a.node !== 'number') continue
    const op = OP_OF_KIND[a.kind]
    if (!op) continue
    const fullLabel = a.label ?? ''
    const cut = fullLabel.indexOf(' → ')
    let el = byRef.get(a.node)
    if (!el) {
      el = {
        ref: a.node,
        role: a.role ?? '',
        label: a.kind === 'select' && cut >= 0 ? fullLabel.slice(0, cut) : fullLabel,
        value: a.kind === 'select' ? (a.current_value ?? '') : (a.value ?? ''),
        ops: []
      }
      for (const key of ['checked', 'selected', 'expanded'] as const) {
        if (a[key] !== undefined) el[key] = a[key]
      }
      byRef.set(a.node, el)
      elements.push(el)
    }
    if (!el.ops.includes(op)) el.ops.push(op)
    if (op === 'select') {
      el.options ??= []
      el.options.push({
        value: a.value ?? '',
        label: cut >= 0 ? fullLabel.slice(cut + 3) : fullLabel
      })
    }
  }
  const viewport = (r.viewport ?? {}) as { w?: number; h?: number }
  const scroll = (r.scroll ?? {}) as { y?: number; height?: number }
  return {
    url: String(r.url ?? ''),
    title: String(r.title ?? ''),
    viewport: { w: viewport.w ?? 0, h: viewport.h ?? 0 },
    scroll: { y: scroll.y ?? 0, height: scroll.height ?? 0 },
    text: String(r.text ?? ''),
    elements,
    omitted: typeof r.omitted === 'number' ? r.omitted : 0
  }
}

/** Validate a ref param: a positive integer from a snapshot. */
export function parseRef(value: unknown): number | { error: string } {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return { error: '"ref" must be a positive integer (from snapshot)' }
  }
  return value
}

const JEV_KIND: Record<SnapshotOp, string> = { click: 'click', type: 'fill', select: 'select' }
const VERB: Record<SnapshotOp, string> = {
  click: 'clicked',
  type: 'typed into',
  select: 'selected'
}

/** The shared preamble of every by-ref action: the ref must come from the last
 * snapshot, support this op, and the page must not have moved since. Leaves
 * `e` bound to the live element. */
function refPreamble(ref: number, op: SnapshotOp): string {
  return `const ref = ${ref};
  const c = window.__jevFast;
  if (!c || !c.last) return { ok: false, reason: 'no snapshot of this page (never taken, or the page navigated): run snapshot first' };
  const ops = c.last.ops[ref];
  if (!ops) return { ok: false, reason: 'ref ' + ref + ' is not in the last snapshot' };
  if (!ops.includes(${JSON.stringify(JEV_KIND[op])})) return { ok: false, reason: 'ref ' + ref + ' cannot be ${VERB[op]}' };
  const e = c.nodes.get(ref);
  if (!e || JSON.stringify(c.pageKey()) !== c.last.page_key || JSON.stringify(c.guard(e)) !== c.last.guards[ref]) {
    return { ok: false, reason: 'the page changed since the snapshot: take a new one' };
  }
  const field = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName);
  const own = (e.getAttribute('aria-label') || (field ? (e.tagName === 'SELECT' ? e.selectedOptions[0]?.label : e.value) : e.innerText) || '').trim().slice(0, 40);
  const label = '[' + ref + '] <' + e.tagName.toLowerCase() + '>' + (own ? ' ' + JSON.stringify(own) : '');`
}

/** Resolve a ref to a click point for `click` (op click) or `type-text` (op
 * type). Same checks as Jev's executor: still enabled, visible, editable for a
 * type, centre inside the viewport, and not covered at that point. Answers the
 * {ok, x, y, label} / {ok:false, reason} shape interpretClickTarget reads. */
export function refTargetScript(ref: number, op: 'click' | 'type'): string {
  return `(() => {
  ${refPreamble(ref, op)}
  if (e.matches(':disabled') || e.closest('[aria-disabled="true"],[inert]') ||
      !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
    return { ok: false, reason: 'ref ' + ref + ' is disabled or hidden' };
  }
  ${op === 'type' ? `if (e.readOnly || e.getAttribute('aria-readonly') === 'true') return { ok: false, reason: 'ref ' + ref + ' is read-only' };` : ''}
  const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
  if (!r.width || !r.height || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
    return { ok: false, reason: 'ref ' + ref + ' is outside the viewport' };
  }
  const hit = document.elementFromPoint(x, y);
  if (!e.contains(hit)) {
    return { ok: false, reason: 'ref ' + ref + ' is covered by <' + (hit ? hit.tagName.toLowerCase() : 'nothing') + '> at that point' };
  }
  return { ok: true, x, y, label };
})()`
}

/** Pick an option of a native <select> by ref, by its value or its visible
 * label, and fire input+change like a user pick. A native dropdown opens an OS
 * popup that CDP clicks cannot drive, which is why this is in-page. */
export function selectOptionScript(
  ref: number,
  choice: { value: string } | { label: string }
): string {
  const match =
    'value' in choice
      ? `o.value === ${JSON.stringify(choice.value)}`
      : `o.label.trim() === ${JSON.stringify(choice.label)}`
  return `(() => {
  ${refPreamble(ref, 'select')}
  if (e.tagName !== 'SELECT' || e.matches(':disabled')) return { ok: false, reason: 'ref ' + ref + ' is not an enabled dropdown' };
  const o = [...e.options].find((o) => ${match} && !o.disabled && !o.closest('optgroup[disabled]'));
  if (!o) return { ok: false, reason: 'ref ' + ref + ' has no such option' };
  e.value = o.value;
  e.dispatchEvent(new Event('input', { bubbles: true }));
  e.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: o.value, label: o.label.trim(), target: label };
})()`
}

/** Read back what selectOptionScript answered. */
export function interpretSelect(
  raw: unknown
): { value: string; label: string; target: string } | { error: string } {
  if (raw === null || typeof raw !== 'object') {
    return { error: `could not select (page returned ${JSON.stringify(raw)})` }
  }
  const r = raw as Record<string, unknown>
  if (r.ok !== true) return { error: typeof r.reason === 'string' ? r.reason : 'could not select' }
  return { value: String(r.value), label: String(r.label), target: String(r.target) }
}

// The page-side half of form memory: a FRAME preload that reports what was typed
// into ordinary text fields, and offers the remembered values back in a small
// popup of its own, drawn under the field.
//
// Same injection idiom as the card capture shim (card-capture-shim.ts): one
// preload registered on the web-page session, running in every frame of every
// tab, in the ISOLATED world — the page cannot see it, detect it or call it.
//
// WHY A POPUP OF OUR OWN AND NOT A <datalist>: the first version bound the field
// to a <datalist> and let Electron's native autofill popup draw it
// (shell/browser/ui/views/autofill_popup_view.cc). That popup cannot be styled at
// all — square, bold, as wide as the field — and it was seen drawn away from its
// field (Gmail's compose window). So the shim draws the list itself:
//   - a `popover` host, so it sits in the top layer, above any modal or z-index;
//   - a CLOSED shadow root, so the page's CSS cannot reach in and the page's JS
//     cannot read the values out;
//   - appended only while open and removed on close: a closed popup leaves no
//     trace in the page, and the field itself is never touched (no attribute);
//   - no innerHTML and no <style> element when it can be avoided (constructable
//     stylesheet), so a strict CSP / Trusted Types page does not break it.
//
// It classifies almost nothing: the main process owns the rule (shouldRemember in
// form-memory.ts). The shim only refuses to READ what must never travel at all —
// passwords, one-time codes, and non-textual inputs.

/** A frame reports one typed field on this channel (send, fire and forget). */
export const FORM_MEMORY_RECORD_CHANNEL = 'mira:form-memory-record'
/** A frame asks for a field's remembered values on this one (invoke). */
export const FORM_MEMORY_SUGGEST_CHANNEL = 'mira:form-memory-suggest'

/** The preload source, as a string: it is written to disk and handed to
 * session.registerPreloadScript, exactly like the card capture shim. */
export const FORM_MEMORY_PRELOAD_SOURCE = `
const { ipcRenderer } = require('electron')
const RECORD = ${JSON.stringify(FORM_MEMORY_RECORD_CHANNEL)}
const SUGGEST = ${JSON.stringify(FORM_MEMORY_SUGGEST_CHANNEL)}

// Only real web documents: chrome-extension:// frames, devtools and about:blank
// have no form worth remembering and no business being read.
const scheme = (location && location.protocol) || ''
if (scheme === 'http:' || scheme === 'https:') {
  const TEXTUAL_TYPES = ['', 'text', 'search', 'tel', 'url', 'email', 'number']
  const SECRET_TOKENS = ['one-time-code', 'current-password', 'new-password']
  const SECRET_RE = /(password|passwd|pwd\\b|mot[\\s_-]?de[\\s_-]?passe|secret|otp\\b|one[\\s_-]?time|token|captcha)/i
  // Fields we already asked about, and what main answered. Both tracked in the
  // isolated world so the page cannot see a marker (a data-* attribute would be
  // visible to it).
  const wired = new WeakSet()
  const known = new WeakMap()

  // The visible text tied to a field: its <label for>, an ancestor <label>, or
  // aria-label. Sites that set no name/id often still have a label.
  const labelText = (el) => {
    try {
      if (el.id) {
        const byFor = document.querySelector('label[for="' + CSS.escape(el.id) + '"]')
        if (byFor && byFor.textContent) return byFor.textContent
      }
      const parent = el.closest && el.closest('label')
      if (parent && parent.textContent) return parent.textContent
    } catch (_) {}
    return ''
  }

  const attrsOf = (el) => ({
    autocomplete: el.getAttribute('autocomplete') || '',
    name: el.getAttribute('name') || '',
    id: el.id || '',
    placeholder: el.getAttribute('placeholder') || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    label: labelText(el).trim().slice(0, 200),
    type: (el.type || '').toLowerCase()
  })

  // The only thing the shim decides: whether this field may be READ at all. The
  // rest of the rule (cards, value shape, caps) lives in the main process.
  const readable = (el) => {
    if (!el || el.tagName !== 'INPUT') return false
    const type = (el.type || '').toLowerCase()
    if (TEXTUAL_TYPES.indexOf(type) === -1) return false
    const tokens = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\\s+/)
    for (const token of tokens) {
      if (SECRET_TOKENS.indexOf(token) !== -1) return false
    }
    const text = [
      el.getAttribute('name'),
      el.id,
      el.getAttribute('placeholder'),
      el.getAttribute('aria-label'),
      labelText(el)
    ]
      .filter(Boolean)
      .join(' ')
    return !SECRET_RE.test(text)
  }

  const record = (el) => {
    if (!readable(el)) return
    const value = typeof el.value === 'string' ? el.value.trim() : ''
    if (!value) return
    try {
      ipcRenderer.send(RECORD, { attrs: attrsOf(el), value, url: location.href })
    } catch (_) {}
  }

  // ── the popup ────────────────────────────────────────────────────────────

  const POPUP_CSS =
    '.box{box-sizing:border-box;padding:4px;border-radius:10px;' +
    'font:13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
    '-webkit-font-smoothing:antialiased;user-select:none;cursor:default;' +
    'background:#fff;border:1px solid rgba(0,0,0,.12);' +
    'box-shadow:0 10px 30px rgba(0,0,0,.16),0 2px 6px rgba(0,0,0,.08)}' +
    '.row{padding:6px 10px;border-radius:6px;white-space:nowrap;overflow:hidden;' +
    'text-overflow:ellipsis;color:rgba(29,29,34,.74)}' +
    '.row.on{background:rgba(105,136,230,.16);color:#1d1d22}' +
    '.hit{font-weight:600;color:#1d1d22}' +
    '@media (prefers-color-scheme:dark){' +
    '.box{background:#1b1b1f;border-color:rgba(235,235,235,.14);' +
    'box-shadow:0 12px 32px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.3)}' +
    '.row{color:rgba(235,235,235,.72)}' +
    '.row.on{background:rgba(105,136,230,.26);color:#ebebeb}' +
    '.hit{color:#ebebeb}}'
  const HOST_CSS =
    'all:initial;display:block;position:fixed;inset:auto;margin:0;padding:0;border:0;' +
    'background:transparent;overflow:visible;z-index:2147483647;'

  let host = null // built on first use, in the page only while open
  let box = null
  let current = null // the field the popup is open for
  let rows = [] // the values it shows
  let active = -1 // the highlighted row; -1 = none, Enter belongs to the page
  let wanted = null // a field that asked to open before its values arrived
  let filling = false // our own fill is under way: do not reopen on its input event

  const typedIn = (el) => (typeof el.value === 'string' ? el.value : '').trim().toLowerCase()

  // What to show for what is typed so far: everything for an empty field, else
  // the values that contain it, those that START with it first. A value equal to
  // what is already typed is nothing to offer.
  const matching = (el) => {
    const values = known.get(el) || []
    const q = typedIn(el)
    if (!q) return values.slice()
    const starts = []
    const contains = []
    for (const value of values) {
      const low = value.toLowerCase()
      const at = low.indexOf(q)
      if (at === -1 || low === q) continue
      ;(at === 0 ? starts : contains).push(value)
    }
    return starts.concat(contains)
  }

  const rowIndex = (node) => {
    while (node && node !== box) {
      if (typeof node.__miraRow === 'number') return node.__miraRow
      node = node.parentNode
    }
    return -1
  }

  const setActive = (index) => {
    active = index
    const children = box.children
    for (let i = 0; i < children.length; i++) children[i].className = i === index ? 'row on' : 'row'
  }

  const build = () => {
    host = document.createElement('div')
    host.setAttribute('popover', 'manual')
    const root = host.attachShadow({ mode: 'closed' })
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(POPUP_CSS)
      root.adoptedStyleSheets = [sheet]
    } catch (_) {
      const style = document.createElement('style')
      style.textContent = POPUP_CSS
      root.appendChild(style)
    }
    box = document.createElement('div')
    box.className = 'box'
    root.appendChild(box)
    // mousedown, not click: preventDefault keeps the focus in the field, so the
    // pick does not first blur it (which would close the popup under the cursor).
    box.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const index = rowIndex(e.target)
      if (index !== -1) pick(index)
    })
    box.addEventListener('mousemove', (e) => {
      const index = rowIndex(e.target)
      if (index !== -1 && index !== active) setActive(index)
    })
  }

  const part = (row, text, cls) => {
    if (!text) return
    const span = document.createElement('span')
    if (cls) span.className = cls
    span.textContent = text
    row.appendChild(span)
  }

  // Under the field, left-aligned with it, sized to its content (never wider
  // than the field, capped) ; pulled back inside the viewport, and flipped above
  // the field when there is no room below.
  const place = (el) => {
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth || 0
    const vh = window.innerHeight || 0
    const room = Math.max(160, vw - 16)
    const style = host.style
    style.cssText = HOST_CSS
    style.minWidth = Math.min(Math.max(r.width, 160), 240, room) + 'px'
    style.maxWidth = Math.min(Math.max(r.width, 240), 560, room) + 'px'
    style.left = Math.max(8, r.left) + 'px'
    style.top = r.bottom + 4 + 'px'
    if (!host.isConnected) document.documentElement.appendChild(host)
    try {
      if (!host.matches(':popover-open')) host.showPopover()
    } catch (_) {}
    const p = host.getBoundingClientRect()
    if (p.right > vw - 8) style.left = Math.max(8, vw - 8 - p.width) + 'px'
    if (p.bottom > vh - 8 && r.top - 4 - p.height >= 8) style.top = r.top - 4 - p.height + 'px'
  }

  const hide = () => {
    wanted = null
    if (!current) return
    current = null
    rows = []
    active = -1
    try {
      host.hidePopover()
    } catch (_) {}
    host.remove()
  }

  const show = (el) => {
    if (!wired.has(el)) return
    if (!known.has(el)) {
      wanted = el
      return
    }
    const values = matching(el)
    if (values.length === 0) {
      hide()
      return
    }
    if (!host) build()
    current = el
    rows = values
    active = -1
    const q = typedIn(el)
    box.textContent = ''
    values.forEach((value, index) => {
      const row = document.createElement('div')
      row.className = 'row'
      row.__miraRow = index
      const at = q ? value.toLowerCase().indexOf(q) : -1
      if (at === -1) part(row, value)
      else {
        part(row, value.slice(0, at))
        part(row, value.slice(at, at + q.length), 'hit')
        part(row, value.slice(at + q.length))
      }
      box.appendChild(row)
    })
    place(el)
  }

  // Fill the field the way a user would have: the value, then the events a
  // framework listens to. Set from the isolated world, the value goes through
  // the native setter, so React's own tracker sees a real change.
  const pick = (index) => {
    const el = current
    const value = rows[index]
    hide()
    if (!el || typeof value !== 'string') return
    filling = true
    try {
      el.value = value
      el.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value })
      )
      el.dispatchEvent(new Event('change', { bubbles: true }))
    } catch (_) {}
    filling = false
  }

  // Ask main, once per field, what was typed here before.
  const offer = (el) => {
    if (!readable(el) || wired.has(el)) return
    // A page that ships its own datalist keeps it — never fight the site.
    if (el.getAttribute('list')) return
    wired.add(el)
    ipcRenderer
      .invoke(SUGGEST, { attrs: attrsOf(el), url: location.href })
      .then((values) => {
        known.set(el, Array.isArray(values) ? values.filter((v) => typeof v === 'string') : [])
        if (wanted === el && document.activeElement === el) show(el)
      })
      .catch(() => {})
  }

  // The keys the popup owns while it is open, and only those: with no row
  // highlighted, Enter still submits the form. Listening on window, in capture,
  // is what lets Escape close the popup without also closing the page's dialog.
  const onKey = (e) => {
    if (e.isComposing) return
    const el = e.target
    const swallow = () => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    if (current && el === current) {
      const count = rows.length
      if (e.key === 'ArrowDown') {
        swallow()
        setActive(active + 1 >= count ? 0 : active + 1)
      } else if (e.key === 'ArrowUp') {
        swallow()
        setActive(active <= 0 ? count - 1 : active - 1)
      } else if (e.key === 'Enter' && active !== -1) {
        swallow()
        pick(active)
      } else if (e.key === 'Escape') {
        swallow()
        hide()
      }
      return
    }
    if (e.key === 'ArrowDown' && wired.has(el)) {
      show(el)
      if (current === el) swallow()
    }
  }

  // focusin arms the field before the user types; focusout (not blur, which does
  // not bubble) catches "typed it, moved on"; change catches pastes and
  // programmatic fills; submit sweeps the whole form for the field still focused
  // when the button is clicked. The popup opens on what a user does IN the field
  // (a click, a keystroke, ArrowDown) — never on focus alone, so tabbing through
  // a form does not flash a list over the next field.
  document.addEventListener('focusin', (e) => offer(e.target), true)
  document.addEventListener(
    'focusout',
    (e) => {
      if (e.target === current || e.target === wanted) hide()
      record(e.target)
    },
    true
  )
  document.addEventListener('change', (e) => record(e.target), true)
  document.addEventListener(
    'input',
    (e) => {
      if (!filling && e.target === document.activeElement) show(e.target)
    },
    true
  )
  document.addEventListener(
    'click',
    (e) => {
      if (e.target === document.activeElement) show(e.target)
    },
    true
  )
  // A click elsewhere that does not move the focus, a scroll or a resize: the
  // popup would be left hanging where the field no longer is.
  document.addEventListener(
    'mousedown',
    (e) => {
      if (current && e.target !== current && e.target !== host) hide()
    },
    true
  )
  document.addEventListener(
    'scroll',
    (e) => {
      if (current && e.target !== current) hide()
    },
    true
  )
  window.addEventListener('resize', () => hide(), true)
  window.addEventListener('keydown', onKey, true)
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target
      if (!form || !form.elements) return
      for (const el of Array.from(form.elements)) record(el)
    },
    true
  )
}
`

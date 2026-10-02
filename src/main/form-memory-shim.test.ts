import { describe, it, expect } from 'vitest'
import {
  FORM_MEMORY_PRELOAD_SOURCE,
  FORM_MEMORY_RECORD_CHANNEL,
  FORM_MEMORY_SUGGEST_CHANNEL
} from './form-memory-shim'

type Fake = Record<string, unknown> & {
  children: Fake[]
  parentNode: Fake | null
  className: string
  attrs: Record<string, string>
  listeners: Record<string, (e: Record<string, unknown>) => void>
  events: string[]
  value: string
  textContent: string
  shadow?: Fake
}

/** A fake DOM node, close enough to what the shim reads and writes. */
function node(tag: string, attrs: Record<string, string> = {}, value = ''): Fake {
  const own: Record<string, string> = { ...attrs }
  let text = ''
  const el = {
    tagName: tag.toUpperCase(),
    type: own.type ?? 'text',
    id: own.id ?? '',
    value,
    className: '',
    children: [] as Fake[],
    parentNode: null as Fake | null,
    attrs: own,
    listeners: {} as Fake['listeners'],
    events: [] as string[],
    style: { cssText: '' },
    getAttribute: (name: string) => own[name] ?? null,
    setAttribute: (name: string, v: string) => {
      own[name] = v
    },
    closest: () => null,
    matches: () => false,
    showPopover: () => {},
    hidePopover: () => {},
    // A field sits where the test puts it (`rect`); anything positioned by its
    // inline style (the popup) is a 300x100 box at that left/top.
    getBoundingClientRect: () => {
      const at = (el.rect as { left: number; top: number; width: number; height: number }) ?? {
        left: parseFloat((el.style as Record<string, string>).left) || 0,
        top: parseFloat((el.style as Record<string, string>).top) || 0,
        width: (el.style as Record<string, string>).left ? 300 : 0,
        height: (el.style as Record<string, string>).top ? 100 : 0
      }
      return { ...at, right: at.left + at.width, bottom: at.top + at.height }
    },
    addEventListener(type: string, fn: (e: Record<string, unknown>) => void) {
      el.listeners[type] = fn
    },
    dispatchEvent(e: { type: string }) {
      el.events.push(e.type)
      return true
    },
    appendChild(child: Fake) {
      child.parentNode = el
      el.children.push(child)
    },
    remove() {
      const parent = el.parentNode
      if (parent) parent.children = parent.children.filter((c) => c !== el)
      el.parentNode = null
    },
    attachShadow() {
      const root = node('#shadow')
      el.shadow = root
      return root
    }
  } as unknown as Fake
  Object.defineProperty(el, 'isConnected', { get: () => el.parentNode !== null })
  Object.defineProperty(el, 'textContent', {
    get: () => text + el.children.map((c) => c.textContent).join(''),
    set: (v: string) => {
      text = v
      el.children = []
    }
  })
  return el
}

const input = (attrs: Record<string, string> = {}, value = ''): Fake => node('input', attrs, value)

interface FakeKey {
  key: string
  target: unknown
  prevented: boolean
  stopped: boolean
  preventDefault: () => void
  stopImmediatePropagation: () => void
}

/** Run the preload source against a fake page. */
function runShim(
  suggestions: string[] = [],
  protocol = 'https:'
): {
  sent: Array<{ channel: string; payload: Record<string, unknown> }>
  invoked: Array<{ channel: string; payload: Record<string, unknown> }>
  fire: (type: string, target: unknown) => void
  key: (key: string, target: unknown) => FakeKey
  setActive: (el: unknown) => void
  /** Focus a field and click in it, then let the answer from main land. */
  open: (el: Fake) => Promise<void>
  /** The popup's rows while it is in the page, null when it is not. */
  popup: () => Fake[] | null
  /** Where the popup is drawn. */
  popupRect: () => { left: number; top: number; right: number; bottom: number }
} {
  const sent: Array<{ channel: string; payload: Record<string, unknown> }> = []
  const invoked: Array<{ channel: string; payload: Record<string, unknown> }> = []
  const listeners: Record<string, (e: Record<string, unknown>) => void> = {}

  const fakeRequire = (): unknown => ({
    ipcRenderer: {
      send: (channel: string, payload: Record<string, unknown>) => sent.push({ channel, payload }),
      invoke: async (channel: string, payload: Record<string, unknown>) => {
        invoked.push({ channel, payload })
        return suggestions
      }
    }
  })

  const root = node('html')
  const addEventListener = (type: string, fn: (e: Record<string, unknown>) => void): void => {
    listeners[type] = fn
  }
  const document: Record<string, unknown> = {
    activeElement: null,
    documentElement: root,
    addEventListener,
    querySelector: () => null,
    createElement: (tag: string) => node(tag)
  }
  const window = { innerWidth: 1200, innerHeight: 800, addEventListener }
  const location = {
    protocol,
    origin: 'https://cfspart.impots.gouv.fr',
    href: 'https://cfspart.impots.gouv.fr/LoginAccess'
  }
  const CSS = { escape: (s: string) => s }
  class FakeEvent {
    constructor(public type: string) {}
  }
  new Function(
    'require',
    'document',
    'window',
    'location',
    'CSS',
    'CSSStyleSheet',
    'Event',
    'InputEvent',
    FORM_MEMORY_PRELOAD_SOURCE
  )(fakeRequire, document, window, location, CSS, undefined, FakeEvent, FakeEvent)

  const fire = (type: string, target: unknown): void => listeners[type]?.({ target })
  const setActive = (el: unknown): void => {
    document.activeElement = el
  }
  return {
    sent,
    invoked,
    fire,
    setActive,
    key: (key, target) => {
      const e: FakeKey = {
        key,
        target,
        prevented: false,
        stopped: false,
        preventDefault: () => (e.prevented = true),
        stopImmediatePropagation: () => (e.stopped = true)
      }
      listeners.keydown?.(e as unknown as Record<string, unknown>)
      return e
    },
    open: async (el) => {
      setActive(el)
      fire('focusin', el)
      fire('click', el)
      await Promise.resolve()
      await Promise.resolve()
    },
    popupRect: () =>
      (
        root.children[0] as unknown as { getBoundingClientRect: () => never }
      ).getBoundingClientRect(),
    popup: () => {
      const host = root.children[0]
      if (!host) return null
      const box = host.shadow?.children.find((c) => c.className === 'box')
      return box ? box.children : null
    }
  }
}

describe('form memory preload source', () => {
  it('reports an ordinary field when it loses focus', () => {
    const shim = runShim()
    shim.fire('focusout', input({ name: 'spi' }, '0912345678901'))
    expect(shim.sent).toHaveLength(1)
    expect(shim.sent[0].channel).toBe(FORM_MEMORY_RECORD_CHANNEL)
    expect(shim.sent[0].payload).toMatchObject({
      value: '0912345678901',
      url: 'https://cfspart.impots.gouv.fr/LoginAccess'
    })
    expect((shim.sent[0].payload.attrs as Record<string, string>).name).toBe('spi')
  })

  it('never reads a password, a one-time code or a non-textual input', () => {
    const shim = runShim()
    shim.fire('focusout', input({ name: 'pwd', type: 'password' }, 'hunter2'))
    shim.fire('focusout', input({ name: 'code', autocomplete: 'one-time-code' }, '123456'))
    shim.fire('focusout', input({ name: 'motDePasse' }, 'hunter2'))
    shim.fire('focusout', input({ name: 'avatar', type: 'file' }, 'photo.png'))
    expect(shim.sent).toEqual([])
  })

  it('sends nothing for an empty field', () => {
    const shim = runShim()
    shim.fire('focusout', input({ name: 'spi' }, '   '))
    expect(shim.sent).toEqual([])
  })

  it('stays out of pages that are not http(s)', () => {
    const shim = runShim([], 'file:')
    shim.fire('focusout', input({ name: 'spi' }, '0912345678901'))
    expect(shim.sent).toEqual([])
  })

  it('asks for suggestions on focus and shows them when the field is clicked', async () => {
    const shim = runShim(['0912345678901', '0998765432109'])
    const el = input({ name: 'spi' })
    await shim.open(el)

    expect(shim.invoked[0].channel).toBe(FORM_MEMORY_SUGGEST_CHANNEL)
    expect(shim.popup()?.map((row) => row.textContent)).toEqual(['0912345678901', '0998765432109'])
    // The field itself is never touched: no list attribute, nothing to detect.
    expect(el.attrs.list).toBeUndefined()
  })

  it('does not open on focus alone', async () => {
    const shim = runShim(['0912345678901'])
    const el = input({ name: 'spi' })
    shim.setActive(el)
    shim.fire('focusin', el)
    await Promise.resolve()
    await Promise.resolve()
    expect(shim.popup()).toBeNull()
  })

  it('filters as the user types, prefix matches first, and marks what matched', async () => {
    const shim = runShim(['Re: invoice', 'invoice 2025', 'test'])
    const el = input({ name: 'subject' })
    await shim.open(el)

    el.value = 'Inv'
    shim.fire('input', el)
    const rows = shim.popup() ?? []
    expect(rows.map((row) => row.textContent)).toEqual(['invoice 2025', 'Re: invoice'])
    const hit = rows[0].children.find((c) => c.className === 'hit')
    expect(hit?.textContent).toBe('inv')
  })

  it('closes when nothing matches, or when the only match is already typed', async () => {
    const shim = runShim(['test'])
    const el = input({ name: 'subject' })
    await shim.open(el)
    el.value = 'test'
    shim.fire('input', el)
    expect(shim.popup()).toBeNull()
    el.value = 'zzz'
    shim.fire('input', el)
    expect(shim.popup()).toBeNull()
  })

  it('fills the field on ArrowDown + Enter and keeps both keys from the page', async () => {
    const shim = runShim(['first', 'second'])
    const el = input({ name: 'subject' })
    await shim.open(el)

    const down = shim.key('ArrowDown', el)
    shim.key('ArrowDown', el)
    expect(down.prevented && down.stopped).toBe(true)
    expect(shim.popup()?.map((row) => row.className)).toEqual(['row', 'row on'])

    const enter = shim.key('Enter', el)
    expect(enter.prevented && enter.stopped).toBe(true)
    expect(el.value).toBe('second')
    expect(el.events).toEqual(['input', 'change'])
    expect(shim.popup()).toBeNull()
  })

  it('leaves Enter to the page while no row is highlighted', async () => {
    const shim = runShim(['first'])
    const el = input({ name: 'subject' }, 'typed')
    await shim.open(el)
    const enter = shim.key('Enter', el)
    expect(enter.prevented).toBe(false)
    expect(el.value).toBe('typed')
  })

  it('closes on Escape without letting the page see it, and on blur', async () => {
    const shim = runShim(['first'])
    const el = input({ name: 'subject' })
    await shim.open(el)
    const esc = shim.key('Escape', el)
    expect(esc.prevented && esc.stopped).toBe(true)
    expect(shim.popup()).toBeNull()
    // Closed, Escape is the page's again.
    expect(shim.key('Escape', el).prevented).toBe(false)

    shim.fire('click', el)
    expect(shim.popup()).not.toBeNull()
    shim.fire('focusout', el)
    expect(shim.popup()).toBeNull()
  })

  it('fills the field when a row is clicked, without taking the focus', async () => {
    const shim = runShim(['first', 'second'])
    const el = input({ name: 'subject' })
    await shim.open(el)
    const rows = shim.popup() ?? []
    let prevented = false
    rows[1].parentNode?.listeners.mousedown({
      target: rows[1].children[0],
      preventDefault: () => (prevented = true)
    })
    expect(prevented).toBe(true)
    expect(el.value).toBe('second')
  })

  it('never covers the field: under it, or above it when there is no room below', async () => {
    const shim = runShim(['first'])
    // Viewport is 1200x800.
    const high = input({ name: 'a' })
    high.rect = { left: 400, top: 100, width: 500, height: 30 }
    await shim.open(high)
    expect(shim.popupRect().top).toBe(134)
    expect(shim.popupRect().left).toBe(400)
    shim.fire('focusout', high)

    const low = input({ name: 'b' })
    low.rect = { left: 1000, top: 740, width: 500, height: 30 }
    await shim.open(low)
    expect(shim.popupRect().bottom).toBe(736)
    // Pulled back inside the viewport rather than cut on the right.
    expect(shim.popupRect().right).toBe(1192)
  })

  it('shows each field its own values', async () => {
    const shim = runShim(['first'])
    const a = input({ name: 'a' })
    const b = input({ name: 'b' })
    await shim.open(a)
    shim.fire('focusout', a)
    await shim.open(b)
    expect(shim.invoked.map((i) => (i.payload.attrs as Record<string, string>).name)).toEqual([
      'a',
      'b'
    ])
  })

  it('leaves a field alone when there is nothing to offer', async () => {
    const shim = runShim([])
    const el = input({ name: 'spi' })
    await shim.open(el)
    expect(shim.popup()).toBeNull()
    expect(shim.key('ArrowDown', el).prevented).toBe(false)
  })

  it('never fights a page that ships its own datalist', async () => {
    const shim = runShim(['0912345678901'])
    const el = input({ name: 'spi', list: 'their-list' })
    await shim.open(el)
    expect(shim.invoked).toEqual([])
    expect(el.attrs.list).toBe('their-list')
    expect(shim.popup()).toBeNull()
  })

  it('asks once per field', async () => {
    const shim = runShim(['0912345678901'])
    const el = input({ name: 'spi' })
    shim.setActive(el)
    shim.fire('focusin', el)
    shim.fire('focusin', el)
    await Promise.resolve()
    expect(shim.invoked).toHaveLength(1)
  })

  it('sweeps the whole form on submit', () => {
    const shim = runShim()
    const form = {
      elements: [
        input({ name: 'spi' }, '0912345678901'),
        input({ name: 'pwd', type: 'password' }, 'hunter2')
      ]
    }
    shim.fire('submit', form)
    expect(shim.sent).toHaveLength(1)
    expect((shim.sent[0].payload.attrs as Record<string, string>).name).toBe('spi')
  })
})

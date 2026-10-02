import { describe, it, expect, vi } from 'vitest'
import { WEBAUTHN_CONDITIONAL_SHIM_SOURCE } from './webauthn-conditional-shim'

// The source reads a free `window`; pass a fake one in, as the stealth test does.
function runShim(win: Record<string, unknown>): void {
  new Function('window', WEBAUTHN_CONDITIONAL_SHIM_SOURCE)(win)
}

type Get = (options?: unknown) => Promise<unknown>

/** A fake window whose credentials container holds `get` on its prototype, like
 * the real CredentialsContainer. */
function fakeWindow(get: Get): { win: Record<string, unknown>; call: Get } {
  const proto = { get }
  const credentials = Object.create(proto) as { get: Get }
  const win: Record<string, unknown> = { navigator: { credentials } }
  return { win, call: (options) => credentials.get(options) }
}

function notAllowed(): Error {
  const error = new Error('The operation either timed out or was not allowed.')
  error.name = 'NotAllowedError'
  return error
}

/** 'pending' when the promise has not settled after the microtask queue drained. */
async function settle(promise: Promise<unknown>): Promise<unknown> {
  const pending = Symbol('pending')
  const tick = new Promise((resolve) => setTimeout(() => resolve(pending), 10))
  const result = await Promise.race([
    promise.then(
      (value) => ({ resolved: value }),
      (error) => ({ rejected: error })
    ),
    tick
  ])
  return result === pending ? 'pending' : result
}

const conditional = (signal?: AbortSignal): unknown => ({
  mediation: 'conditional',
  publicKey: { challenge: new Uint8Array(1), rpId: 'login.example.net' },
  signal
})

describe('WEBAUTHN_CONDITIONAL_SHIM_SOURCE', () => {
  it('keeps a conditional request pending when the native get rejects with NotAllowedError', async () => {
    const { win, call } = fakeWindow(() => Promise.reject(notAllowed()))
    runShim(win)
    expect(await settle(call(conditional(new AbortController().signal)))).toBe('pending')
  })

  it('stays pending without a signal too', async () => {
    const { win, call } = fakeWindow(() => Promise.reject(notAllowed()))
    runShim(win)
    expect(await settle(call(conditional()))).toBe('pending')
  })

  it('rejects the held request once the caller aborts it', async () => {
    const { win, call } = fakeWindow(() => Promise.reject(notAllowed()))
    runShim(win)
    const controller = new AbortController()
    const promise = call(conditional(controller.signal))
    expect(await settle(promise)).toBe('pending')
    controller.abort()
    expect(await settle(promise)).toEqual({ rejected: controller.signal.reason })
  })

  it('passes the rejection through when the caller had already aborted', async () => {
    const error = notAllowed()
    const controller = new AbortController()
    controller.abort()
    const { win, call } = fakeWindow(() => Promise.reject(error))
    runShim(win)
    expect(await settle(call(conditional(controller.signal)))).toEqual({ rejected: error })
  })

  it('passes a resolved credential through untouched', async () => {
    const credential = { id: 'abc', type: 'public-key' }
    const { win, call } = fakeWindow(() => Promise.resolve(credential))
    runShim(win)
    expect(await settle(call(conditional()))).toEqual({ resolved: credential })
  })

  it('leaves other errors alone', async () => {
    const error = new Error('bad rp id')
    error.name = 'SecurityError'
    const { win, call } = fakeWindow(() => Promise.reject(error))
    runShim(win)
    expect(await settle(call(conditional()))).toEqual({ rejected: error })
  })

  it('leaves a non-conditional request alone, NotAllowedError included', async () => {
    const error = notAllowed()
    const { win, call } = fakeWindow(() => Promise.reject(error))
    runShim(win)
    expect(await settle(call({ publicKey: { challenge: new Uint8Array(1) } }))).toEqual({
      rejected: error
    })
  })

  it('leaves a conditional request that is not WebAuthn alone', async () => {
    const error = notAllowed()
    const { win, call } = fakeWindow(() => Promise.reject(error))
    runShim(win)
    expect(await settle(call({ mediation: 'conditional', password: true }))).toEqual({
      rejected: error
    })
  })

  it('forwards the options and the receiver to the native get', async () => {
    const native = vi.fn(function (this: unknown) {
      return Promise.resolve(this)
    })
    const { win, call } = fakeWindow(native as unknown as Get)
    runShim(win)
    const options = conditional()
    const receiver = await call(options)
    expect(native).toHaveBeenCalledWith(options)
    expect(receiver).toBe((win.navigator as { credentials: unknown }).credentials)
  })

  it('is idempotent: re-injection on every navigation does not stack wrappers', () => {
    const { win } = fakeWindow(() => Promise.resolve(null))
    runShim(win)
    const credentials = (win.navigator as { credentials: { get: unknown } }).credentials
    const first = credentials.get
    runShim(win)
    runShim(win)
    expect(credentials.get).toBe(first)
  })

  it('still reads as a native function, so it is not a new tell', () => {
    const { win } = fakeWindow(function get() {
      return Promise.resolve(null)
    })
    runShim(win)
    const credentials = (win.navigator as { credentials: { get: unknown } }).credentials
    expect(String(credentials.get)).toContain('[native code]')
  })

  it('never throws when there is no credentials container to wrap', () => {
    expect(() => runShim({})).not.toThrow()
    expect(() => runShim({ navigator: {} })).not.toThrow()
  })
})

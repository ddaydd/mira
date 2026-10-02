// Keep a passkey-autofill request (`mediation: 'conditional'`) pending when the
// native one fails fast, the way it sits pending in Chrome.
//
// A conditional `navigator.credentials.get()` is meant to wait in the background
// until the user picks a passkey from an autofill menu. In Mira the native call
// can reject within milliseconds instead: measured 2026-10-02 on
// login.microsoftonline.com, whose passkeys live under the rpId
// `login.microsoft.com` — NotAllowedError after 65 ms, where the same call with
// the page's own host as rpId stays pending.
//
// That early rejection breaks password-manager extensions. Bitwarden's page
// script (content/fido2-page-script.js) answers a conditional request with
// `Promise.race([bitwardenResponse, browserResponse])`: the native rejection wins
// the race, the page's promise is dead, and Bitwarden's worker keeps a request
// nobody listens to. The inline menu still lists the passkeys; clicking one spins
// on "Authenticating" forever and the page never posts anything.
//
// So we wrap the native get in the page's MAIN world (same injection as the
// window.open stub — see stealth.ts) and, for a conditional WebAuthn request
// only, turn a NotAllowedError into a promise that stays pending until the
// caller's AbortSignal fires. Everything else passes through untouched: other
// mediations, other errors, a request the caller aborted itself, and every
// resolved credential (a Touch ID passkey picked natively still works).
//
// It has to run before the extension captures the native function, which the CDP
// document-start injection guarantees. On the one document where that injection
// races the first load (stealth.ts), the wrapper lands too late for that page
// and a reload is what fixes it.
//
// A Proxy over the native function, not a plain function, so that
// `String(navigator.credentials.get)` still reads as native code (same reason as
// window-open-shim.ts).

/** Source injected at document-start into every page's main world. Guarded so it
 * can never break the page it runs in. */
export const WEBAUTHN_CONDITIONAL_SHIM_SOURCE = String.raw`
;(function () {
  try {
    var w = window
    var key = '__miraConditionalGetShim'
    var creds = w.navigator && w.navigator.credentials
    if (!creds) return
    var native = creds.get
    if (typeof native !== 'function' || w[key] === native) return
    var holder = Object.prototype.hasOwnProperty.call(creds, 'get')
      ? creds
      : Object.getPrototypeOf(creds)
    var proxy = new Proxy(native, {
      apply: function (target, thisArg, args) {
        var promise = Reflect.apply(target, thisArg, args)
        var options = args[0]
        if (!options || options.mediation !== 'conditional' || !options.publicKey) return promise
        var signal = options.signal
        return promise.catch(function (error) {
          if ((signal && signal.aborted) || !error || error.name !== 'NotAllowedError') throw error
          return new Promise(function (_resolve, reject) {
            if (!signal) return
            signal.addEventListener('abort', function () {
              reject(signal.reason !== undefined ? signal.reason : error)
            }, { once: true })
          })
        })
      }
    })
    Object.defineProperty(holder, 'get', {
      value: proxy, writable: true, enumerable: true, configurable: true
    })
    Object.defineProperty(w, key, {
      value: proxy, writable: true, enumerable: false, configurable: true
    })
  } catch (e) {
    /* never break a page over this shim */
  }
})();
`

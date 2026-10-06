# Releases and self-update (macOS)

Mira publishes a macOS build on GitHub Releases, signed with a Developer ID certificate and
notarized by Apple, and that build updates itself. Releases up to 1.3.1 were ad-hoc signed
(no Apple Developer account then): macOS blocked them at first launch. This page says how a
release is made, and how to sign your own build.

## Two kinds of build

| | Published build (`bin/release.sh`) | Local build (`bin/build.sh`, `npm run build:mac`) |
|---|---|---|
| Signature | Developer ID + profile, hardened runtime, notarized | same certificate and profile, not notarized |
| Runs on | any Mac, Apple Silicon or Intel | the Mac that built it |
| Touch ID passkeys (WebAuthn) | yes | yes |
| Updates itself | yes | no, rebuild from source |

The published build carries `"miraDistribution": "release"` in its packaged `package.json`
(`bin/release-build.cjs`). That stamp alone turns on the self-update
(`distributionOf` in `src/main/self-update.ts`); a local build is never replaced by a download.

## Publishing a release

```bash
bin/release.sh patch   # or minor / major
```

It needs, on the Mac that publishes:

- a **"Developer ID Application"** certificate with its private key in the login keychain. With
  exactly one, it is found by itself; otherwise set `MIRA_RELEASE_IDENTITY` to its name without the
  `Developer ID Application: ` prefix.
- a **notarytool keychain profile**, `mira-notary` by default (`MIRA_NOTARY_PROFILE` to change it),
  made once from an App Store Connect API key:
  `xcrun notarytool store-credentials mira-notary --key AuthKey_<keyid>.p8 --key-id <keyid> --issuer <issuer id>`.

It checks both before touching anything. Then, on a clean `master` with `gh` logged in, it: runs
the typecheck and the tests, bumps the version in `package.json`, then, once per architecture
(`arm64` and `x64`, this Mac's last), builds the native addons and the app, builds the release app
with `bin/release-build.cjs` (electron-builder signing every Mach-O with the Developer ID
certificate and the hardened runtime, embedding the Developer ID profile), checks the
signature, sends the app to Apple's notary service and waits for its verdict, staples the ticket,
zips it with `ditto` and writes `Mira-<version>-mac-<arch>.zip.sha256`. It then commits
`release: v<version>`, tags, pushes, and creates the GitHub release with the four files and
install notes. It publishes: run it only when a release is wanted. The per-architecture steps live
in `bin/release-app.sh`.

Both builds embed `build/embedded.provisionprofile`, a Developer ID profile ("Mira Developer ID",
team `ZMKDR6H89Y`, every Mac, valid as long as the certificate: 2031-09-17). It authorizes the main
app's keychain access group and application identifier (`build/entitlements.mac.plist`), which
macOS only honors next to such a profile: that is what lets Touch ID passkeys work in a downloaded
Mira (set up on 2026-10-06, not yet checked on a published build). The helpers embed no profile and get `build/entitlements.mac.inherit.plist`. The profile was
made on developer.apple.com (Profiles → Developer ID → Mac → `com.mickaelfm.mira` → the Developer ID
certificate); an App Store Connect API key with the Developer role cannot create one (403). A new
certificate means a new profile.

Before signing, it refuses to go on if `app.asar` holds anything besides `out/`, `resources/`,
`node_modules/` and `package.json`. `electron-builder.yml`'s `files` is an allow-list for the same
reason: the 1.1.0 zip, built when it was still a deny-list, carried every file lying at the repo
root (older builds in `dist/`, local notes, scratch scripts) and its assets were deleted. It also
refuses a bundle holding any Mach-O file of the other architecture.

## Both architectures from one Mac

The other architecture is cross-built, not built on a second Mac: node-gyp compiles the native
addons (`native/mira-*`) for the architecture it is given (`MIRA_ARCH`, read by the `build:addon:*`
scripts), and electron-builder packs the Electron of that architecture (`MIRA_ARCH` again, read by
`bin/release-build.cjs`). Electron's zip is fetched first with `curl` into
`~/Library/Caches/mira-release/electron/<version>/` and checked against Electron's
`SHASUMS256.txt`, because electron-builder's own download once stalled for its full 10-minute
timeout.

Checked on 2026-10-06, building 1.3.0 for x64 on an Apple Silicon Mac (ad-hoc signed then): every
Mach-O in the bundle is x86_64, the signature passes `codesign --verify --deep --strict`, and the
three addons load in the x64 Electron under Rosetta. The x64 app itself was not launched on an Intel
Mac by that check.

After a release, `native/*/build` holds the addons of this Mac's architecture (built last), so
`npm run dev` keeps working.

## How the self-update works

1. The daily update check (`src/main/update-service.ts`) asks GitHub for the latest release. On a
   published build, a newer version is not just announced: it is downloaded.
2. `prepareUpdate` (`src/main/self-update-service.ts`) picks `Mira-<version>-mac-<arch>.zip` and its
   `.sha256` from the release (downloads only from GitHub hosts, over https), checks the SHA-256
   of what it downloaded, unpacks it with `ditto`, checks the bundle id, the bundle version and the
   signature (`codesign --verify --deep --strict`), and keeps it in `<userData>/updates/staged/`.
3. A notification says the version is ready. Clicking it restarts Mira now.
4. When Mira quits, a detached shell script (`INSTALL_SCRIPT`) waits for the process to exit, moves
   the installed `Mira.app` aside, copies the staged one in, and restores the old one if the copy
   fails. The log is `<userData>/updates/install.log`.

Why not Electron's standard updater: Squirrel.Mac only accepts a new bundle that satisfies the
running one's designated requirement, and an ad-hoc signature's requirement is its own hash, so no
two ad-hoc builds ever match. Signed builds would pass it, but the ad-hoc 1.3.1 already in the wild
must still be able to update to them, so Mira keeps its own updater.

Limits:

- Mira must run from a writable folder (normally `/Applications`). A copy started straight from
  the download is run by macOS from a read-only temporary location (App Translocation) and cannot
  replace itself: the update fails with a message saying to move Mira first.
- The daily check announces each version once. If its download fails, **Check for Updates** in the
  app menu retries it.
- A release published before 1.3.1 carries the Apple Silicon zip only: an Intel Mira finds no
  asset in it, and the update fails with a notification naming the missing zip.

## Moving from an ad-hoc release

The first signed build has a different signature than the ad-hoc 1.3.1 it replaces, so macOS may
ask once more for camera, microphone, location or keychain access. Later signed builds keep the
same identity, and the grants stay.

## Signing Mira yourself

To build Mira under your own Apple account, swap in your certificate and profile. A free Apple
account is enough, with an Apple Development certificate.

1. In Xcode, sign in with your Apple ID (Settings → Accounts) and create an "Apple Development"
   certificate. Note your team id (`security find-identity -v -p codesigning` shows the
   certificate; `codesign -dvvv` on any app you signed shows `TeamIdentifier`).
2. In `electron-builder.yml`, set `appId` to a bundle id you own, `mac.identity` to your
   certificate's name (and `mac.type: development` for an Apple Development certificate), and replace the team id in `build/entitlements.mac.plist`
   (`keychain-access-groups`, `com.apple.application-identifier`,
   `com.apple.developer.team-identifier`) and in `WEBAUTHN_KEYCHAIN_GROUP` (`src/main/webauthn.ts`).
3. Mint a provisioning profile for that bundle id that authorizes the keychain group, and save it
   as `build/embedded.provisionprofile`. A free team's profile expires after 7 days: re-mint it and
   rebuild weekly. The recipe (a throwaway Xcode project that requests the capability) is in
   `.claude/rules/packaging.md`.
4. `npm install`, then `bin/build.sh`: it builds, installs to `/Applications/Mira.app` and relaunches.

A build made this way is a local build: it does not update itself. Pull and rebuild to update.

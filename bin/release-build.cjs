#!/usr/bin/env node
// Build the PUBLISHED macOS app: the one bin/release.sh zips and uploads.
//
// It is electron-builder.yml, signed the same way as the local build: the
// "Developer ID Application" certificate (MIRA_RELEASE_IDENTITY, resolved by
// bin/release.sh), the hardened runtime that notarization requires, and the
// Developer ID provisioning profile build/embedded.provisionprofile (every Mac,
// valid until 2031-09-17). That profile is what authorizes the main app's
// keychain-access-groups and application identifier (build/entitlements.mac.plist),
// so Touch ID passkeys work in a downloaded Mira; the helpers embed no profile and
// keep the inherit plist. What differs from the local build: an unpacked `dir`
// target, the chosen architecture, and a `miraDistribution: release` stamp in the
// packaged package.json, which is what turns on the self-update
// (src/main/self-update.ts). Notarization happens after, in bin/release-app.sh.
//
// Usage: MIRA_RELEASE_IDENTITY=<name> [MIRA_ARCH=arm64|x64] [MIRA_ELECTRON_DIST=<dir>]
//          node bin/release-build.cjs <outputDir>
// MIRA_RELEASE_IDENTITY is the certificate name WITHOUT its "Developer ID
// Application: " prefix (electron-builder refuses the prefix). MIRA_ARCH defaults
// to this Mac's architecture; bin/release-app.sh sets it to build the other one
// too. MIRA_ELECTRON_DIST is a folder holding Electron's darwin zip for that
// architecture, so electron-builder does not download it.
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS, run by node without a build */
const { readFileSync } = require('node:fs')
const yaml = require('js-yaml')
const { build, Platform, Arch } = require('electron-builder')

const output = process.argv[2]
if (!output) {
  console.error('usage: release-build.cjs <outputDir>')
  process.exit(2)
}

const identity = process.env.MIRA_RELEASE_IDENTITY
if (!identity) {
  console.error('MIRA_RELEASE_IDENTITY is not set (the Developer ID Application certificate)')
  process.exit(2)
}

const config = yaml.load(readFileSync('electron-builder.yml', 'utf8'))
config.directories = { ...config.directories, output }
config.extraMetadata = { ...config.extraMetadata, miraDistribution: 'release' }
const mac = {
  ...config.mac,
  identity,
  type: 'distribution',
  target: 'dir',
  hardenedRuntime: true,
  notarize: false
}
config.mac = mac
delete config.publish
if (process.env.MIRA_ELECTRON_DIST) config.electronDist = process.env.MIRA_ELECTRON_DIST

const archName = process.env.MIRA_ARCH || process.arch
const arch = Arch[archName]
if (arch === undefined) {
  console.error(`unsupported arch ${archName}`)
  process.exit(2)
}

build({ targets: Platform.MAC.createTarget('dir', arch), config, publish: 'never' })
  .then((paths) => console.log(paths.join('\n')))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

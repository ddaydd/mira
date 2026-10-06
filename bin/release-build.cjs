#!/usr/bin/env node
// Build the PUBLISHED macOS app: the one bin/release.sh zips and uploads.
//
// It is electron-builder.yml with the owner-only signing swapped out. The local
// build is signed with a personal Apple Development certificate and a provisioning
// profile that lists ONE Mac (see the mac section of electron-builder.yml) — a
// binary signed that way cannot be handed to anyone. So here: the "Developer ID
// Application" certificate (MIRA_RELEASE_IDENTITY, resolved by bin/release.sh),
// the hardened runtime that notarization requires, no provisioning profile, and
// for the main app the same entitlements as the helpers
// (build/entitlements.mac.inherit.plist): keychain-access-groups and the
// application identifier are only valid next to a profile that authorizes them.
// An unpacked `dir` target, and a `miraDistribution: release` stamp in the
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

const entitlements = 'build/entitlements.mac.inherit.plist'
const config = yaml.load(readFileSync('electron-builder.yml', 'utf8'))
config.directories = { ...config.directories, output }
config.extraMetadata = { ...config.extraMetadata, miraDistribution: 'release' }
const mac = {
  ...config.mac,
  identity,
  type: 'distribution',
  target: 'dir',
  hardenedRuntime: true,
  entitlements,
  entitlementsInherit: entitlements,
  notarize: false
}
delete mac.provisioningProfile
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

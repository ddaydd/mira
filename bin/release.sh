#!/usr/bin/env bash
# Publish a Mira release for macOS: bump the version, build the "release" app,
# sign it with the Developer ID certificate, notarize it, zip it with its SHA-256,
# tag, push, and create the GitHub release that running Mira builds update
# themselves from (src/main/self-update.ts).
#
# Usage: bin/release.sh <major|minor|patch>
#
# Needs a clean master, `gh` logged in, a "Developer ID Application" certificate
# in the keychain and a notarytool keychain profile (MIRA_NOTARY_PROFILE, default
# mira-notary; see docs/releases.md). It PUBLISHES (tag, push, public release):
# run it only when a release was asked for.
#
# It publishes both macOS architectures, arm64 and x64, from this one Mac: the
# build, sign, notarize and zip steps are in bin/release-app.sh.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=bin/release-app.sh
. bin/release-app.sh

bump="${1:-}"
case "$bump" in
  major | minor | patch) ;;
  *)
    echo "usage: bin/release.sh <major|minor|patch>" >&2
    exit 2
    ;;
esac

# Signing and notarization are checked before anything is bumped: a missing
# certificate or profile must not leave a half-made release behind.
if [ -z "${MIRA_RELEASE_IDENTITY:-}" ]; then
  ids="$(security find-identity -v -p codesigning | sed -n 's/.*"Developer ID Application: \(.*\)"$/\1/p')"
  [ "$(grep -c . <<<"$ids")" = 1 ] || {
    echo "need exactly one Developer ID Application certificate, found:" >&2
    echo "${ids:-none}" >&2
    echo "set MIRA_RELEASE_IDENTITY to the one to use (without its prefix)" >&2
    exit 1
  }
  MIRA_RELEASE_IDENTITY="$ids"
fi
export MIRA_RELEASE_IDENTITY
export MIRA_NOTARY_PROFILE="${MIRA_NOTARY_PROFILE:-mira-notary}"
xcrun notarytool history --keychain-profile "$MIRA_NOTARY_PROFILE" >/dev/null || {
  echo "notarytool keychain profile $MIRA_NOTARY_PROFILE does not work (docs/releases.md)" >&2
  exit 1
}

[ "$(git rev-parse --abbrev-ref HEAD)" = master ] || { echo "not on master" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean" >&2; exit 1; }
git pull --ff-only

npm run typecheck
npm test

prev="$(git describe --tags --abbrev=0 2>/dev/null || true)"
version="$(npm version "$bump" --no-git-tag-version | sed 's/^v//')"
host="$(node -p process.arch)"
# This Mac's architecture last: native/*/build keeps the addons of the last build,
# and `npm run dev` must find ones it can load.
case "$host" in
  arm64) archs=(x64 arm64) ;;
  x64) archs=(arm64 x64) ;;
  *)
    echo "unsupported host arch: $host" >&2
    exit 1
    ;;
esac
rm -rf dist-release

assets=()
for arch in "${archs[@]}"; do
  build_release_zip "dist-release/$arch" "$version" "$arch"
  assets+=("dist-release/$arch/$RELEASE_ZIP" "dist-release/$arch/$RELEASE_ZIP.sha256")
done

changes="$(git log --no-merges --format='- %s' ${prev:+"$prev"..}HEAD)"
notes="$(
  cat <<NOTES
## Changes

$changes

## Install (macOS)

1. Download the zip for your Mac, \`Mira-$version-mac-arm64.zip\` for Apple Silicon or
   \`Mira-$version-mac-x64.zip\` for Intel, unzip it, move \`Mira.app\` to \`/Applications\`.
2. Open it. The app is signed with a Developer ID certificate and notarized by Apple, so macOS
   opens it without a warning.
3. From then on Mira updates itself: it downloads each new release, checks its SHA-256, and
   installs it when you quit.

How releases are made and how to build your own:
https://github.com/micktaiwan/mira/blob/master/docs/releases.md
NOTES
)"

git commit -am "release: v$version"
git tag "v$version"
git push origin master
git push origin "v$version"
gh release create "v$version" "${assets[@]}" \
  --title "Mira $version" --notes "$notes"

echo "released v$version"

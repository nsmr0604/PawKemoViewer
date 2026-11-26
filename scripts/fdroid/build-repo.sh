#!/usr/bin/env bash
# Build/update the self-hosted F-Droid repository from signed APKs.
#
# Usage: scripts/fdroid/build-repo.sh <apk-dir>
# Requires: fdroidserver (`pip install fdroidserver`), Java, Android build-tools.
#
# The repository key/keystore and config.yml are NOT committed.
# See docs/distribution/self-hosted-fdroid.md for setup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FDROID_DIR="$ROOT/fdroid"
APK_DIR="${1:-$ROOT/dist-apk}"

if ! command -v fdroid >/dev/null 2>&1; then
  echo "fdroid command not found. Install fdroidserver first:" >&2
  echo "  python3 -m pip install fdroidserver" >&2
  exit 1
fi

if [[ ! -d "$APK_DIR" ]]; then
  echo "APK directory not found: $APK_DIR" >&2
  exit 1
fi

cd "$FDROID_DIR"

if [[ ! -f config.yml ]]; then
  cp config.example.yml config.yml
  echo "Created fdroid/config.yml. Edit repo_url, keystore, and passwords, then rerun." >&2
  exit 1
fi

if grep -q "CHANGE_ME" config.yml; then
  echo "fdroid/config.yml still contains CHANGE_ME. Fill in the keystore and passwords." >&2
  exit 1
fi

if [[ ! -f keystore.p12 ]]; then
  echo "fdroid/keystore.p12 is missing. Generate the repo signing key first:" >&2
  echo "  keytool -genkeypair -v -keystore keystore.p12 -alias pawkemoviewer-repo \\" >&2
  echo "    -keyalg RSA -keysize 4096 -validity 10950 \\" >&2
  echo "    -dname \"CN=PawKemoViewer Repo, O=nsmr0604, C=JP\"" >&2
  exit 1
fi

mkdir -p repo
find "$APK_DIR" -maxdepth 1 -type f -name '*.apk' -exec cp -f {} repo/ \;

# Index the APKs in repo/ and sign the index with the repository key.
fdroid update --pretty

echo
echo "Repository generated in: $FDROID_DIR/repo"
echo "Publish the contents of fdroid/repo to your web server or gh-pages."
echo "Repo URL (from config.yml):"
grep -E '^repo_url:' config.yml || true

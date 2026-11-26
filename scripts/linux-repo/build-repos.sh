#!/usr/bin/env bash
# Build apt and rpm repositories from release packages.
#
# Usage: scripts/linux-repo/build-repos.sh <deb-dir> <rpm-dir> [output-dir]
#
# Optional signing (recommended for public repos):
#   LINUX_REPO_GPG_KEY_ID=<key id or fingerprint>
#   LINUX_REPO_GPG_PASSPHRASE=<passphrase, if the key has one>
#
# Requires on Debian/Ubuntu:
#   dpkg-dev apt-utils gnupg createrepo-c
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEB_DIR="${1:-$ROOT/dist-deb}"
RPM_DIR="${2:-$ROOT/dist-rpm}"
OUT_DIR="${3:-$ROOT/linux-repo}"

[[ -d "$DEB_DIR" ]] || { echo "deb directory not found: $DEB_DIR" >&2; exit 1; }
[[ -d "$RPM_DIR" ]] || { echo "rpm directory not found: $RPM_DIR" >&2; exit 1; }

KEY_ID="${LINUX_REPO_GPG_KEY_ID:-}"
GPG_ARGS=(--batch --yes)
if [[ -n "${LINUX_REPO_GPG_PASSPHRASE:-}" ]]; then
  GPG_ARGS+=(--pinentry-mode loopback --passphrase "$LINUX_REPO_GPG_PASSPHRASE")
fi

APT_DIR="$OUT_DIR/apt"
RPM_REPO_DIR="$OUT_DIR/rpm"
rm -rf "$OUT_DIR"
mkdir -p "$APT_DIR/pool/main/p/paw-kemo-viewer" "$APT_DIR/dists/stable/main/binary-amd64"
mkdir -p "$RPM_REPO_DIR/Packages"

# ---------------------------------------------------------------------------
# apt
# ---------------------------------------------------------------------------
find "$DEB_DIR" -maxdepth 1 -type f -name '*.deb' -exec cp -f {} "$APT_DIR/pool/main/p/paw-kemo-viewer/" \;
if ! find "$APT_DIR/pool" -type f -name '*.deb' | grep -q .; then
  echo "No .deb files found in $DEB_DIR" >&2
  exit 1
fi

(
  cd "$APT_DIR"
  apt-ftparchive packages pool
) > "$APT_DIR/dists/stable/main/binary-amd64/Packages"
gzip -9 -kf "$APT_DIR/dists/stable/main/binary-amd64/Packages"

release_tmp="$(mktemp)"
apt-ftparchive \
  -o APT::FTPArchive::Release::Origin="PawKemoViewer" \
  -o APT::FTPArchive::Release::Label="PawKemoViewer" \
  -o APT::FTPArchive::Release::Suite="stable" \
  -o APT::FTPArchive::Release::Codename="stable" \
  -o APT::FTPArchive::Release::Architectures="amd64" \
  -o APT::FTPArchive::Release::Components="main" \
  release "$APT_DIR/dists/stable" > "$release_tmp"
mv "$release_tmp" "$APT_DIR/dists/stable/Release"

if [[ -n "$KEY_ID" ]]; then
  gpg "${GPG_ARGS[@]}" --local-user "$KEY_ID" --clearsign \
    -o "$APT_DIR/dists/stable/InRelease" "$APT_DIR/dists/stable/Release"
  gpg "${GPG_ARGS[@]}" --local-user "$KEY_ID" -abs \
    -o "$APT_DIR/dists/stable/Release.gpg" "$APT_DIR/dists/stable/Release"
  gpg "${GPG_ARGS[@]}" --armor --export "$KEY_ID" > "$APT_DIR/public.key"
else
  echo "WARNING: LINUX_REPO_GPG_KEY_ID is not set; apt repository is unsigned." >&2
fi

# ---------------------------------------------------------------------------
# rpm
# ---------------------------------------------------------------------------
find "$RPM_DIR" -maxdepth 1 -type f -name '*.rpm' -exec cp -f {} "$RPM_REPO_DIR/Packages/" \;
if ! find "$RPM_REPO_DIR/Packages" -type f -name '*.rpm' | grep -q .; then
  echo "No .rpm files found in $RPM_DIR" >&2
  exit 1
fi

createrepo_c "$RPM_REPO_DIR"

if [[ -n "$KEY_ID" ]]; then
  gpg "${GPG_ARGS[@]}" --local-user "$KEY_ID" --detach-sign --armor \
    -o "$RPM_REPO_DIR/repodata/repomd.xml.asc" "$RPM_REPO_DIR/repodata/repomd.xml"
  gpg "${GPG_ARGS[@]}" --armor --export "$KEY_ID" > "$RPM_REPO_DIR/RPM-GPG-KEY-pawkemoviewer"
else
  echo "WARNING: LINUX_REPO_GPG_KEY_ID is not set; rpm repository is unsigned." >&2
fi

echo
echo "Generated:"
echo "  apt: $APT_DIR"
echo "  rpm: $RPM_REPO_DIR"

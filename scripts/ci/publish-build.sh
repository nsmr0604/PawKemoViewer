#!/usr/bin/env bash
set -euo pipefail

platform=$1
mode=$2
directory=$3
version=$(node -p "require('./package.json').version")

case "$platform" in
  desktop) extensions=(exe msi deb rpm AppImage) ;;
  android) extensions=(apk) ;;
  ios) extensions=(ipa) ;;
  macos) extensions=(dmg app.tar.gz) ;;
  *) echo "Unknown build platform: $platform" >&2; exit 1 ;;
esac

case "$mode" in
  release)
    tag="pawkemoviewer-v${version}"
    title="PawKemoViewer v${version}"
    notes="製品版 v${version}。"
    flags=(--latest=false)
    ;;
  debug)
    tag=debug-latest
    title="PawKemoViewer debug build"
    notes="開発・診断機能を有効にしたプレリリースです。アプリ内のバージョン欄でビルドしたコミットを確認できます。"
    flags=(--prerelease)
    ;;
  *) echo "Unknown build mode: $mode" >&2; exit 1 ;;
esac

assets=()
while IFS= read -r -d '' file; do
  for extension in "${extensions[@]}"; do
    if [[ "$file" == *."$extension" ]]; then
      assets+=("$file")
      break
    fi
  done
done < <(find "$directory" -type f -print0)
if [[ "${#assets[@]}" -eq 0 ]]; then
  echo "No $platform release assets found" >&2
  exit 1
fi

# プラットフォームを並行公開した場合、別の実行が先にリリースを作ることがある。
if gh release view "$tag" >/dev/null 2>&1; then
  if [[ "$mode" == release ]]; then
    # 正式版は、タグの指すコミットと成果物のビルド元が一致するときだけ追加する。
    # 既存アセットは上書きしない (同じ番号で別バイナリが出回るのを防ぐ)。
    target=$(gh release view "$tag" --json targetCommitish --jq .targetCommitish)
    if [[ "$target" != "$GITHUB_SHA" ]]; then
      echo "Release $tag points to $target, not $GITHUB_SHA" >&2
      exit 1
    fi
    gh release upload "$tag" "${assets[@]}"
  else
    gh release upload "$tag" "${assets[@]}" --clobber
  fi
elif ! gh release create "$tag" "${assets[@]}" --target "$GITHUB_SHA" \
  --title "$title" --notes "$notes" "${flags[@]}"; then
  gh release view "$tag" >/dev/null
  if [[ "$mode" == release ]]; then
    target=$(gh release view "$tag" --json targetCommitish --jq .targetCommitish)
    if [[ "$target" != "$GITHUB_SHA" ]]; then
      echo "Release $tag points to $target, not $GITHUB_SHA" >&2
      exit 1
    fi
    gh release upload "$tag" "${assets[@]}"
  else
    gh release upload "$tag" "${assets[@]}" --clobber
  fi
fi

if [[ "$mode" == release ]]; then
  # 固定URLが全対象で使えるよう、必要なファイルが揃ってから最新版にする。
  required=(exe msi deb rpm AppImage dmg app.tar.gz apk ipa)
  published=$(gh release view "$tag" --json assets --jq '.assets[].name')
  complete=true
  for extension in "${required[@]}"; do
    if ! grep -Fxq "PawKemoViewer.$extension" <<< "$published"; then
      complete=false
      break
    fi
  done
  if [[ "$complete" == true ]]; then
    latest=$(gh release view --json tagName --jq .tagName 2>/dev/null || true)
    if [[ "$latest" != pawkemoviewer-v* ]] ||
       [[ "$(printf '%s\n' "$latest" "$tag" | sort -V | tail -1)" == "$tag" ]]; then
      gh release edit "$tag" --latest
    fi
  fi
else
  gh release edit "$tag" --prerelease --latest=false
  # 更新の成功後、そのプラットフォームの古いデバッグ成果物だけを取り除く。
  declare -A current
  for file in "${assets[@]}"; do current["${file##*/}"]=1; done
  published=$(gh release view "$tag" --json assets --jq '.assets[].name')
  while IFS= read -r asset; do
    [[ "$asset" == PawKemoViewer* && -z "${current[$asset]:-}" ]] || continue
    for extension in "${extensions[@]}"; do
      if [[ "$asset" == *."$extension" ]]; then
        gh release delete-asset "$tag" "$asset" --yes
        break
      fi
    done
  done <<< "$published"
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf '%s %s (%s)\n' "$platform" "$tag" "$GITHUB_SHA" >> "$GITHUB_STEP_SUMMARY"
fi

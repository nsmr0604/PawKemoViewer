# PawKemoViewer アイコンデザイン引継ぎ

## 採用方針
- Paw は Pawchive (pawchive.pw) のWeb API閲覧対象、Kemoは派生元Kemono.crへのリスペクトを表す名称。
- Viewerは画像/投稿閲覧。再生マークは採用しない。
- ブランドシンボルは狐耳娘のシルエット、流れる髪、狐しっぽ、大きめの肉球。
- Mobileはフラットでシンプル、PCはリッチなキャラクターイラストに分ける。

## Mobile palette decisions
- Standard: Mint / cyan / pink flat palette (採用済み)
- Dark: Slate / blue / teal flat palette (採用済み)
- Silhouette and composition remain shared.

## Resources in this PR
- `assets/icons/mobile-light.svg`: mobile standard
- `assets/icons/mobile-dark.svg`: mobile dark
These are source SVG assets for branding/resource use. Existing platform-native icon sets (Tauri bundle, Android launcher and iOS asset catalog) are not regenerated in this PR.

## PC color exploration (concept sheet)
Six palettes in the generated concept sheet:
1. Blue / violet — classic night
2. Magenta / rose — jewel-like
3. Ice cyan / teal — luminous
4. Gold / amber — warm metallic
5. Deep teal — ocean night
6. Lavender / indigo — soft fantasy
The silver-white foxgirl, ears, flowing hair, tail, moon, stars and paw emblem are held as the PC concept baseline; only palette varies. No PC palette has been selected yet.

## Handoff
- Mobile SVG assets are committed as independent design resources, not yet wired into Tauri platform packaging.
- PC palette selection and final detailed artwork remain pending.

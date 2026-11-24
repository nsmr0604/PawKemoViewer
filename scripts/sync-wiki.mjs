// docs/ と docs/wiki/ から GitHub Wiki 用のページを生成する。
//   node scripts/sync-wiki.mjs <wiki-dir>
// 正本は docs/ (リポジトリ側)。Wiki 側は生成物なので直接編集しない。
// 相対リンクは Wiki 内の参照 (例: [BUILD.md](BUILD.md) → [Build](Build)) に変換する。
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/sync-wiki.mjs <wiki-dir>");
  process.exit(2);
}

const REPO = "https://github.com/nsmr0604/pawchive";
const PAGES = [
  { src: "docs/BUILD.md", dst: "Build.md" },
  { src: "docs/DEVELOPMENT.md", dst: "Development.md" },
  { src: "docs/API.md", dst: "API.md" },
  { src: "docs/STATUS.md", dst: "Status.md" },
  { src: "docs/HISTORY.md", dst: "History.md" },
];
// 同期対象の Wiki 専用ページ (docs/wiki/*.md はそのままコピー)
const WIKI_ONLY_DIR = "docs/wiki";

const PAGE_NAME = {
  "BUILD.md": "Build",
  "DEVELOPMENT.md": "Development",
  "API.md": "API",
  "STATUS.md": "Status",
  "HISTORY.md": "History",
};

/** docs 内の相対リンクを Wiki 用に書き換える */
function toWiki(md) {
  let out = md.replace(/\[([^\]]+)\]\(([A-Za-z_-]+\.md)\)/g, (m, label, file) => {
    if (PAGE_NAME[file]) return `[${PAGE_NAME[file]}](${PAGE_NAME[file]})`;
    if (file === "LICENSES.md") return `[${label}](${REPO}/blob/main/docs/LICENSES.md)`;
    return m;
  });
  // docs 配下のサブディレクトリへの参照はリポジトリのファイルへリンクする
  out = out.replace(/\[([^\]]+)\]\((?:\.\/)?(architecture|branding)\/([^)]+)\)/g,
    (m, label, dir, rest) => `[${label}](${REPO}/blob/main/docs/${dir}/${rest})`);
  out = out.replace(/\]\(\.\.\/README\.md\)/g, `](${REPO}#readme)`);
  // 本文中の AGENTS.md (リンクでないもの) は公開リポジトリのファイルへリンクする
  out = out.replace(/(?<![\[/])AGENTS\.md(?!\])/g, `[AGENTS.md](${REPO}/blob/main/AGENTS.md)`);
  return out;
}

/** 公開してはいけない参照が混ざっていないか */
function assertPublic(name, text) {
  const banned = [/notes\//, /agent-work/, /secret\.md/, /[A-Z]:\\/, /[A-Z]:\//];
  for (const re of banned) {
    if (re.test(text)) {
      console.error(`${name}: 非公開の参照を含むため同期を中止します (${re})`);
      process.exit(1);
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });

for (const p of PAGES) {
  const text = toWiki(fs.readFileSync(p.src, "utf8"));
  assertPublic(p.dst, text);
  fs.writeFileSync(path.join(outDir, p.dst), text, "utf8");
  console.log(`synced ${p.src} -> ${p.dst}`);
}

for (const f of fs.readdirSync(WIKI_ONLY_DIR)) {
  if (!f.endsWith(".md")) continue;
  const text = fs.readFileSync(path.join(WIKI_ONLY_DIR, f), "utf8");
  assertPublic(f, text);
  fs.writeFileSync(path.join(outDir, f), text, "utf8");
  console.log(`synced ${WIKI_ONLY_DIR}/${f} -> ${f}`);
}

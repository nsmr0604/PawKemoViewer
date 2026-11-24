// docs/wiki/ から GitHub Wiki 用のページを生成する。
//   node scripts/sync-wiki.mjs <wiki-dir>
// Wiki は利用者向けに単体で完結させ、docs/ の開発資料は同期しない。
// 正本は docs/wiki/。Wiki 側は生成物なので直接編集しない。
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/sync-wiki.mjs <wiki-dir>");
  process.exit(2);
}

const WIKI_DIR = "docs/wiki";
const repository = process.env.GITHUB_REPOSITORY;
const server = process.env.GITHUB_SERVER_URL;
const branch = process.env.REPOSITORY_DEFAULT_BRANCH;

function baseUrl(value, name) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`Invalid ${name}`);
  }
  return url.href.replace(/\/+$/, "");
}

const resolvers = {
  PAGES_URL: () => baseUrl(process.env.PAGES_BASE_URL, "PAGES_BASE_URL"),
  REPOSITORY_URL: () => {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) throw new Error("Set GITHUB_REPOSITORY to owner/repository");
    return `${baseUrl(server, "GITHUB_SERVER_URL")}/${repository}`;
  },
  DEFAULT_BRANCH: () => {
    if (!branch) throw new Error("Set REPOSITORY_DEFAULT_BRANCH");
    return encodeURIComponent(branch);
  },
};
// 以前の同期で生成していた開発者向けページ。Wiki は利用者向けのみにするため削除する。
const STALE_PAGES = ["Build.md", "Development.md", "API.md", "Status.md", "History.md"];

/** 公開してはいけない参照が混ざっていないか */
function assertPublic(name, text) {
  const banned = [/notes\//, /agent-work/, /secret\.md/, /[A-Z]:\\/, /[A-Z]:\//, /\]\(docs\//];
  for (const re of banned) {
    if (re.test(text)) {
      console.error(`${name}: 非公開または開発資料への参照を含むため同期を中止します (${re})`);
      process.exit(1);
    }
  }
}

const pages = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith(".md")).map(f => {
  const text = fs.readFileSync(path.join(WIKI_DIR, f), "utf8")
    .replace(/\{\{(PAGES_URL|REPOSITORY_URL|DEFAULT_BRANCH)\}\}/g, (_, key) => resolvers[key]());
  assertPublic(f, text);
  return [f, text];
});

fs.mkdirSync(outDir, { recursive: true });

for (const f of STALE_PAGES) {
  const stale = path.join(outDir, f);
  if (fs.existsSync(stale)) {
    fs.rmSync(stale);
    console.log(`removed stale ${f}`);
  }
}

for (const [f, text] of pages) {
  fs.writeFileSync(path.join(outDir, f), text, "utf8");
  console.log(`synced ${WIKI_DIR}/${f} -> ${f}`);
}

// 노션 카드 1장 → publish-out/post/<url-slug>/index.md (+ publish-out/images/**) + publish-out/result.json
// 사용: NOTION_TOKEN=… node scripts/publish/prepare.mjs <page_id>   (먼저 pnpm fetch:posts)
// 결과 status: ok(발행 진행) · blocked(사람이 고쳐야 함 — 노션에 사유) · skip(대상 아님)
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify } from "yaml";
import { OUT_DIR, SITE, children, existingPosts, log, normTitle, notion, plain } from "./lib.mjs";
import { Renderer, normalizeHeadings } from "./render.mjs";
import { ICONS, makeAiCover } from "./cover.mjs";
import { aiReview, factCheck, htmlToText } from "./review.mjs";

const BLOG_DB = "9ad74b21-4c6a-4658-a841-e135a20a1a96";
const PUBLISH_STAGE = "게시";
const pageId = process.argv[2];
if (!pageId) throw new Error("page_id 가 필요합니다");

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
const result = { pageId, status: "ok", blocking: [], notes: [], ai: null };
const finish = () => {
  fs.writeFileSync(path.join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\nslug=${result.urlSlug ?? ""}\n`);
  }
  log(result.status, { pageId, urlSlug: result.urlSlug, blocking: result.blocking.length, notes: result.notes.length });
};

const page = await notion(`/pages/${pageId}`);
const dbId = (page.parent?.database_id ?? "").replace(/-/g, "");
const stages = (page.properties["단계"]?.multi_select ?? []).map((o) => o.name);
// 미리보기(dry_run)는 단계와 무관하게 돌려 볼 수 있다 — 게시 전에 결과·커버를 확인하는 용도
const anyStage = process.env.DRY_RUN === "true";
if (dbId !== BLOG_DB.replace(/-/g, "") || (!anyStage && !stages.includes(PUBLISH_STAGE))) {
  result.status = "skip";
  result.reason = dbId !== BLOG_DB.replace(/-/g, "") ? "개발자 블로그 DB 의 카드가 아님" : `단계에 '${PUBLISH_STAGE}' 없음 (${stages.join(",") || "비어 있음"})`;
  finish();
  process.exit(0);
}

const title = plain(page.properties["Name"].title).trim();
result.title = title;
const author = page.properties["작성자"]?.people?.[0];
const summaryProp = plain(page.properties["요약"]?.rich_text).trim();
const urlProp = page.properties["URL"]?.url ?? "";
const posts = existingPosts();

// ── 이 카드가 어느 글인가: 카드 URL → 같은 카드로 발행한 기록 → (새 글) 같은 제목이면 중단
let existing =
  posts.find((p) => urlProp && urlProp.replace(/\/$/, "").endsWith(`/post/${p.urlSlug}`)) ??
  posts.find((p) => p.notionPageId && p.notionPageId.replace(/-/g, "") === pageId.replace(/-/g, ""));
if (!existing) {
  const same = posts.find((p) => normTitle(p.title) === normTitle(title));
  if (same) {
    result.blocking.push(
      `같은 제목의 글이 이미 있습니다: ${SITE}/post/${same.urlSlug}\n` +
        `  기존 글을 고친 것이라면 카드의 URL 칸에 위 주소를 넣고 다시 '게시'로 옮겨 주세요. 새 글이라면 제목을 바꿔 주세요.`,
    );
  }
}
result.isUpdate = Boolean(existing);
// Ghost 시절 글(정적 HTML 에서 옮겨 온 최종본)은 노션 초안과 다를 수 있다 — 실수로 덮어쓰지 않게 막는다
if (existing && process.env.FORCE_OVERWRITE !== "true") {
  const src = fs.readFileSync(path.join("src/content/posts", existing.urlSlug, "index.md"), "utf-8").match(/^source:\s*(.+)$/m)?.[1]?.trim();
  if (src !== "notion") {
    result.blocking.push(
      `이 글(${SITE}/post/${existing.urlSlug})은 Ghost 에서 마지막으로 고친 최종본이라 노션 내용과 다를 수 있어 덮어쓰지 않았습니다.\n` +
        `  정말 노션 내용으로 바꾸려면 개발팀이 GitHub Actions 'Publish from Notion' 을 force_overwrite 로 수동 실행해 주세요.`,
    );
  }
}
const publishedAt = existing?.publishedAt ?? new Date().toISOString();

// ── 본문·이미지
const r = new Renderer({ pageId, publishedAt });
let html = "";
try {
  html = normalizeHeadings(await r.blocks(await children(pageId)));
} catch (e) {
  result.blocking.push(`본문 변환 실패: ${e.message}`);
}
if (!htmlToText(html).trim()) result.blocking.push("본문이 비어 있습니다.");

// 커버: 노션 커버 → (기존 글) 이전 커버 → (새 글) AI 커버 → 본문 첫 이미지 → 없으면 중단. AI 커버는 점검 뒤에 만든다.
let featureImage = null;
const cover = page.cover;
if (cover) {
  featureImage = await r.asset(cover.type === "external" ? cover.external.url : cover.file.url, "cover");
  result.coverSource = "노션 커버";
}
const firstBodyImage = r.assets.find((a) => /-img1\./.test(a.key));

let authorImage = posts.find((p) => p.authorName === author?.name && p.authorImage)?.authorImage ?? null;
if (!author) result.blocking.push("작성자가 비어 있습니다.");
else if (!authorImage && author.avatar_url) authorImage = await r.asset(author.avatar_url, "author");

// ── 점검
const fc = await factCheck({ title, html, facts: r.facts });
result.blocking.push(...fc.blocking);
result.notes.push(...fc.notes);
const tags = [...new Set(posts.map((p) => p.tag).filter(Boolean))];
result.ai = result.blocking.length ? { skipped: "발행을 막는 문제가 있어 AI 검토를 건너뛰었습니다." } : await aiReview({ title, html, tags, icons: Object.keys(ICONS) });
const s = result.ai?.suggestion;

if (!featureImage && !existing && !result.blocking.length) {
  if (s?.cover_scene) {
    try {
      featureImage = r.saveBuffer(await makeAiCover({ scene: s.cover_scene, keyword: s.cover_keyword, icon: ICONS[s.cover_icon] ? s.cover_icon : null }), "cover-ai");
      result.coverSource = "AI";
      result.coverScene = `${s.cover_keyword}${ICONS[s.cover_icon] ? ` (아이콘: ${s.cover_icon})` : ""} — ${s.cover_scene}`;
    } catch (e) {
      result.notes.push(`AI 커버 생성 실패(${e.message.slice(0, 120)}) — 다른 방법으로 대체했습니다.`);
    }
  }
  if (!featureImage && firstBodyImage) {
    featureImage = `https://cdn.comento.kr/${firstBodyImage.key}`;
    result.coverSource = "본문 첫 이미지";
  }
  if (!featureImage) result.blocking.push("커버 이미지가 없습니다 — 노션 페이지 상단에 커버를 추가해 주세요(목록 카드 이미지로 쓰입니다).");
}

// ── 주소: 기존 글은 그대로, 새 글은 AI 제안 slug + 발행일(UTC, 기존 글과 같은 규칙)
let urlSlug = existing?.urlSlug;
if (!urlSlug) {
  const base = (s?.slug ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const d = new Date(publishedAt);
  const ymd = `${String(d.getUTCFullYear()).slice(2)}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  urlSlug = `${base.length >= 3 ? base : `post-${pageId.replace(/-/g, "").slice(0, 8)}`}-${ymd}`;
  for (let i = 2; posts.some((p) => p.urlSlug === urlSlug); i++) urlSlug = urlSlug.replace(/(-\d+)?-(\d{2}-\d{2}-\d{2})$/, `-${i}-$2`);
}
result.urlSlug = urlSlug;
result.url = `${SITE}/post/${urlSlug}`;

if (result.blocking.length) {
  result.status = "blocked";
  finish();
  process.exit(0);
}

// ── 원본 파일
const text = htmlToText(html);
const prev = existing ? fs.readFileSync(path.join("src/content/posts", existing.urlSlug, "index.md"), "utf-8") : "";
const prevFm = prev ? parseYaml(prev.match(/^---\n([\s\S]*?)\n---/)[1]) : {};
const fm = {
  title,
  slug: urlSlug.replace(/-\d{2}-\d{2}-\d{2}$/, ""),
  published_at: publishedAt,
  updated_at: existing ? new Date().toISOString() : undefined,
  excerpt: summaryProp || prevFm.excerpt || s?.excerpt || text.slice(0, 150),
  feature_image: featureImage ?? prevFm.feature_image,
  primary_tag: prevFm.primary_tag ?? (s?.tag ? s.tag.trim().slice(0, 30) : null),
  author: { name: author.name, profile_image: authorImage },
  reading_time: Math.max(1, Math.round(text.length / 500)),
  notion_page_id: page.id,
  source: "notion",
};
Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);
const dir = path.join(OUT_DIR, "post", urlSlug);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "index.md"), `---\n${stringify(fm)}---\n\n${html}\n`);
result.assets = r.assets;
result.excerptSource = summaryProp ? "노션 요약" : prevFm.excerpt ? "기존 글" : s?.excerpt ? "AI" : "본문 앞부분";
finish();

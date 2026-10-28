// 노션 발행 파이프라인 공통 도구. 토큰은 환경변수(NOTION_TOKEN)로만 받고 출력하지 않는다.
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const SITE = "https://developer.comento.kr";
export const CDN = "https://cdn.comento.kr";
export const CDN_PREFIX = "blog/developer"; // s3://comento-s3-bucket/blog/developer/...
export const POSTS_DIR = path.resolve("src/content/posts");
export const OUT_DIR = path.resolve("publish-out");

const NOTION_VERSION = "2022-06-28";

export async function notion(pathname, { method = "GET", body } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.notion.com/v1${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`노션 API ${method} ${pathname} → ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}

/** 블록 자식 전체(페이지네이션). */
export async function children(blockId) {
  const out = [];
  let cursor;
  do {
    const q = await notion(`/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    out.push(...q.results);
    cursor = q.has_more ? q.next_cursor : undefined;
  } while (cursor);
  return out;
}

export const plain = (rich = []) => rich.map((t) => t.plain_text).join("");

export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 결과를 한 줄 JSON 으로 남긴다 — 조용히 실패하지 않게(ok/skip/blocked/fail 모두 기록). */
export function log(result, extra = {}) {
  console.log(JSON.stringify({ result, ...extra }));
}

/** src/content/posts 의 기존 글(frontmatter 만). fetch:posts 후에 호출. */
export function existingPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(POSTS_DIR, d.name, "index.md")))
    .map((d) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, d.name, "index.md"), "utf-8");
      const fm = parseYaml(raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "") ?? {};
      return {
        urlSlug: d.name,
        title: fm.title ?? null,
        notionPageId: fm.notion_page_id ?? null,
        publishedAt: fm.published_at ?? null,
        tag: fm.primary_tag ?? null,
        authorName: fm.author?.name ?? null,
        authorImage: fm.author?.profile_image ?? null,
      };
    });
}

export const normTitle = (s = "") => s.replace(/[\s\p{P}\p{S}_]+/gu, "").toLowerCase();

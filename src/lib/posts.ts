import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * 글 원본 = s3://developer.comento.kr/_source/<url-slug>/index.md
 * (frontmatter + 본문 HTML). 빌드 전에 `pnpm fetch:posts` 로 src/content/posts 에 내려받는다.
 *
 * 화면 코드가 Ghost 시절 필드 이름을 그대로 쓰도록 같은 모양으로 돌려준다.
 */
export type Post = {
  id: string; // URL slug (= 폴더 이름, 예: haco-thon-03-26-04-17)
  slug: string;
  title: string;
  published_at: string;
  excerpt: string;
  feature_image: string;
  primary_tag: { name: string } | null;
  primary_author: { name: string; profile_image: string | null };
  reading_time: number;
  html: string;
};

const POSTS_DIR = path.resolve("src/content/posts");

function readPost(urlSlug: string): Post {
  const raw = fs.readFileSync(path.join(POSTS_DIR, urlSlug, "index.md"), "utf-8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`frontmatter 없음: ${urlSlug}`);
  const fm = parse(m[1]);
  return {
    id: urlSlug,
    slug: fm.slug,
    title: fm.title,
    published_at: fm.published_at,
    excerpt: fm.excerpt ?? "",
    feature_image: fm.feature_image,
    primary_tag: fm.primary_tag ? { name: fm.primary_tag } : null,
    primary_author: {
      name: fm.author?.name ?? "",
      profile_image: fm.author?.profile_image ?? null,
    },
    reading_time: fm.reading_time ?? 1,
    html: m[2].trim(),
  };
}

let cache: Post[] | null = null;

/** 최신순. 글이 하나도 없으면 실패한다 — 빈 사이트를 배포하지 않기 위해. */
export function getPosts(): Post[] {
  if (cache) return cache.map((p) => ({ ...p }));
  const dirs = fs.existsSync(POSTS_DIR)
    ? fs
        .readdirSync(POSTS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(POSTS_DIR, d.name, "index.md")))
        .map((d) => d.name)
    : [];
  if (dirs.length === 0) {
    throw new Error(`글이 없습니다: ${POSTS_DIR} — 먼저 \`pnpm fetch:posts\` 를 실행하세요.`);
  }
  cache = dirs
    .map(readPost)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  return cache.map((p) => ({ ...p }));
}

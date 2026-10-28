// 노션 블록 → 블로그 본문 HTML.
// 사이트([slug].astro)가 그대로 쓰는 형식으로 만든다: 코드 블록은 <pre><code class="language-x">(빌드 때 shiki 강조),
// 제목에는 목차용 id, 콜아웃은 Ghost 시절 kg-callout-card 클래스.
// 노션 파일 URL 은 1시간이면 만료되므로 이미지는 내려받아 cdn.comento.kr 경로로 바꾼다.
import fs from "node:fs";
import path from "node:path";
import { CDN, CDN_PREFIX, OUT_DIR, children, escapeHtml as esc, plain } from "./lib.mjs";

// 노션 코드 언어 → shiki 언어 id. 목록에 없으면 클래스를 붙이지 않는다(모르는 언어는 빌드를 깨뜨림).
const LANG = {
  javascript: "javascript", typescript: "typescript", "java/c/c++/c#": null, java: "java", kotlin: "kotlin",
  swift: "swift", dart: "dart", php: "php", python: "python", go: "go", ruby: "ruby", rust: "rust",
  shell: "shell", bash: "shell", powershell: "powershell", sql: "sql", json: "json", yaml: "yaml",
  html: "html", css: "css", scss: "scss", markdown: "markdown", docker: "docker", graphql: "graphql",
  jsx: "jsx", tsx: "tsx", vue: "vue", xml: "xml", c: "c", "c++": "cpp", "c#": "csharp", diff: "diff",
};

/**
 * 목차(TableOfContents.vue)는 h2 → h3 구조만 다루고, h2 없이 h3 가 먼저 나오면 오류로 목차가 빠진다.
 * 그래서 글에 쓰인 제목 단계를 큰 것부터 h2·h3·h4 로 다시 매기고, 첫 h2 보다 앞선 h3 는 h2 로 올린다.
 */
export function normalizeHeadings(html) {
  const used = [...new Set([...html.matchAll(/<h([2-4]) id=/g)].map((m) => Number(m[1])))].sort();
  const map = Object.fromEntries(used.map((lv, i) => [lv, Math.min(2 + i, 4)]));
  let seenH2 = false;
  return html.replace(/<h([2-4])( id="[^"]*">[\s\S]*?)<\/h\1>/g, (_, lv, rest) => {
    let to = map[Number(lv)];
    if (to === 3 && !seenH2) to = 2;
    if (to === 2) seenH2 = true;
    return `<h${to}${rest}</h${to}>`;
  });
}

export class Renderer {
  constructor({ pageId, publishedAt }) {
    const d = new Date(publishedAt);
    this.assetDir = `${CDN_PREFIX}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    this.pageKey = pageId.replace(/-/g, "").slice(0, 8);
    this.assets = []; // { key, bytes, source }
    this.headingIds = new Set();
    this.facts = { images: 0, imagesWithoutCaption: 0, codeBlocks: 0, codeWithoutLang: 0, links: new Set(), unsupported: {} };
  }

  /** 원격 파일을 내려받아 publish-out/images/<key> 에 두고 CDN 주소를 돌려준다. */
  async asset(url, stem) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`이미지 내려받기 실패 ${res.status}: ${new URL(url).pathname.slice(-60)}`);
    const type = res.headers.get("content-type") || "";
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" }[type.split(";")[0]]
      || path.extname(new URL(url).pathname).slice(1).toLowerCase() || "bin";
    const key = `${this.assetDir}/${this.pageKey}-${stem}.${ext}`;
    const buf = Buffer.from(await res.arrayBuffer());
    const file = path.join(OUT_DIR, "images", key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    this.assets.push({ key, bytes: buf.length });
    return `${CDN}/${key}`;
  }

  /** 만든 이미지(Buffer)를 publish-out/images/<key> 에 두고 CDN 주소를 돌려준다. */
  saveBuffer(buf, stem, ext = "png") {
    const key = `${this.assetDir}/${this.pageKey}-${stem}.${ext}`;
    const file = path.join(OUT_DIR, "images", key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    this.assets.push({ key, bytes: buf.length });
    return `${CDN}/${key}`;
  }

  rich(rt = []) {
    return rt
      .map((t) => {
        let s = esc(t.plain_text).replace(/\n/g, "<br>");
        const a = t.annotations || {};
        if (a.code) s = `<code>${s}</code>`;
        if (a.bold) s = `<strong>${s}</strong>`;
        if (a.italic) s = `<em>${s}</em>`;
        if (a.strikethrough) s = `<s>${s}</s>`;
        if (a.underline) s = `<u>${s}</u>`;
        const href = t.href || t.text?.link?.url;
        if (href) {
          this.facts.links.add(href);
          s = `<a href="${esc(href)}"${href.startsWith("/") ? "" : ' target="_blank" rel="noreferrer"'}>${s}</a>`;
        }
        return s;
      })
      .join("");
  }

  headingId(text) {
    let base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section";
    let id = base;
    for (let i = 2; this.headingIds.has(id); i++) id = `${base}-${i}`;
    this.headingIds.add(id);
    return id;
  }

  async blocks(list) {
    let html = "";
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      // 연속된 목록 항목은 하나의 <ul>/<ol> 로 묶는다
      if (b.type === "bulleted_list_item" || b.type === "numbered_list_item" || b.type === "to_do") {
        const tag = b.type === "numbered_list_item" ? "ol" : "ul";
        let items = "";
        while (i < list.length && list[i].type === b.type) {
          items += `<li>${await this.listItem(list[i])}</li>`;
          i++;
        }
        i--;
        html += `<${tag}${b.type === "to_do" ? ' class="todo"' : ""}>${items}</${tag}>`;
        continue;
      }
      html += await this.block(b);
    }
    return html;
  }

  async kids(b) {
    return b.has_children ? this.blocks(await children(b.id)) : "";
  }

  async listItem(b) {
    const v = b[b.type];
    const box = b.type === "to_do" ? (v.checked ? "☑ " : "☐ ") : "";
    return `${box}${this.rich(v.rich_text)}${await this.kids(b)}`;
  }

  async block(b) {
    const v = b[b.type] ?? {};
    switch (b.type) {
      case "paragraph": {
        const inner = this.rich(v.rich_text);
        return (inner ? `<p>${inner}</p>` : "") + (await this.kids(b));
      }
      case "heading_1":
      case "heading_2":
      case "heading_3": {
        // 글 제목이 h1 이라 본문 제목은 한 단계씩 내린다 (노션 H1 → h2)
        const level = Math.min(Number(b.type.slice(-1)) + 1, 4);
        const text = plain(v.rich_text);
        const h = `<h${level} id="${esc(this.headingId(text))}">${this.rich(v.rich_text)}</h${level}>`;
        return v.is_toggleable ? `<details><summary>${h}</summary>${await this.kids(b)}</details>` : h;
      }
      case "quote":
        return `<blockquote>${this.rich(v.rich_text)}${await this.kids(b)}</blockquote>`;
      case "callout": {
        const emoji = v.icon?.type === "emoji" ? v.icon.emoji : "💡";
        return `<div class="kg-card kg-callout-card"><div class="kg-callout-emoji">${esc(emoji)}</div><div class="kg-callout-text">${this.rich(v.rich_text)}${await this.kids(b)}</div></div>`;
      }
      case "toggle":
        return `<details><summary>${this.rich(v.rich_text)}</summary>${await this.kids(b)}</details>`;
      case "divider":
        return "<hr>";
      case "code": {
        this.facts.codeBlocks++;
        const lang = LANG[(v.language || "").toLowerCase()];
        if (!lang) this.facts.codeWithoutLang++;
        const code = esc(plain(v.rich_text));
        const caption = plain(v.caption);
        return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${code}</code></pre>${caption ? `<p><em>${esc(caption)}</em></p>` : ""}`;
      }
      case "image": {
        this.facts.images++;
        const src = v.type === "external" ? v.external.url : v.file.url;
        const url = await this.asset(src, `img${this.facts.images}`);
        const caption = this.rich(v.caption);
        if (!caption) this.facts.imagesWithoutCaption++;
        const alt = esc(plain(v.caption));
        return `<figure class="kg-card kg-image-card"><img src="${url}" alt="${alt}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
      }
      case "video":
      case "embed":
      case "bookmark":
      case "link_preview": {
        const url = v.url || v.external?.url || v.file?.url;
        if (!url) return "";
        const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
        if (yt) {
          return `<figure class="kg-card kg-embed-card"><iframe width="560" height="315" src="https://www.youtube.com/embed/${yt[1]}" frameborder="0" allowfullscreen loading="lazy"></iframe></figure>`;
        }
        this.facts.links.add(url);
        const caption = plain(v.caption ?? []);
        return `<p><a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(caption || url)}</a></p>`;
      }
      case "table": {
        const rows = await children(b.id);
        const body = rows
          .map((r, idx) => {
            const cellTag = idx === 0 && v.has_column_header ? "th" : "td";
            return `<tr>${r.table_row.cells.map((c) => `<${cellTag}>${this.rich(c)}</${cellTag}>`).join("")}</tr>`;
          })
          .join("");
        return `<table>${body}</table>`;
      }
      case "column_list":
      case "column":
      case "synced_block":
        return this.kids(b);
      case "equation":
        return `<p><code>${esc(v.expression)}</code></p>`;
      case "table_of_contents":
      case "breadcrumb":
      case "child_page":
      case "child_database":
        return ""; // 사이트가 자체 목차를 만든다 · 하위 페이지/DB 는 글 본문이 아님
      default:
        this.facts.unsupported[b.type] = (this.facts.unsupported[b.type] || 0) + 1;
        return "";
    }
  }
}

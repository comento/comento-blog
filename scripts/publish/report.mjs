// 발행 결과를 노션 카드에 남긴다 — 카드가 '마지막 성공' 신호(URL 칸)이자 실패 사유 창구(댓글).
// 사용: node scripts/publish/report.mjs <page_id> <started|published|blocked|failed|dry-run>
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, log, notion } from "./lib.mjs";

const [pageId, mode] = process.argv.slice(2);
const run = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : "(로컬 실행)";
const resultFile = path.join(OUT_DIR, "result.json");
const r = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, "utf-8")) : {};

function aiSection() {
  if (!r.ai) return "";
  if (r.ai.skipped) return `\n\n🤖 AI 검토: ${r.ai.skipped}`;
  const s = r.ai.suggestion;
  const lines = [`\n\n🤖 AI 제안 (참고용 — 본문은 바꾸지 않았습니다)`];
  if (!r.isUpdate) lines.push(`· 주소: ${r.urlSlug}`);
  if (r.excerptSource === "AI") lines.push(`· 요약(노션 요약 칸이 비어 AI 요약을 썼습니다): ${s.excerpt}`);
  lines.push(`· 태그 제안: ${s.tag}`);
  if (r.coverSource === "AI") lines.push(`· 커버: 노션 커버가 없어 AI 로 그렸습니다. 마음에 들지 않으면 노션에 커버를 넣고 다시 '게시'하세요.\n  그린 장면: ${r.coverScene}`);
  if (r.coverSource === "본문 첫 이미지") lines.push("· 커버: 노션 커버가 없어 본문 첫 이미지를 썼습니다.");
  if (s.issues.length) {
    lines.push(`· 짚을 부분 ${s.issues.length}개:`);
    for (const i of s.issues.slice(0, 20)) lines.push(`  - [${i.kind}] "${i.quote}" → ${i.suggestion}`);
  } else lines.push("· 짚을 부분 없음");
  return lines.join("\n");
}

const notes = r.notes?.length ? `\n\n📋 확인한 사실\n${r.notes.map((n) => `· ${n}`).join("\n")}` : "";
const body = {
  started: `🚀 발행을 시작했습니다. 몇 분 뒤 결과를 이 댓글창에 남깁니다.\n실행 기록: ${run}`,
  published: `✅ 발행했습니다: ${r.url}${r.isUpdate ? " (기존 글 업데이트)" : ""}${notes}${aiSection()}`,
  blocked: `⛔ 발행하지 않았습니다 — 아래를 고친 뒤 '게시'를 다시 지정해 주세요.\n${(r.blocking ?? []).map((b) => `· ${b}`).join("\n")}${notes}\n실행 기록: ${run}`,
  failed: `❌ 발행 중 오류가 났습니다. 사이트는 바뀌지 않았거나 이전 상태 그대로입니다.\n실행 기록: ${run}\n(개발팀 #develop 에도 알림이 갑니다)`,
  "dry-run": `🧪 미리보기 실행(배포 안 함): ${r.status === "ok" ? `발행되면 주소는 ${r.url}` : r.status}${(r.blocking ?? []).length ? `\n막힘:\n${r.blocking.map((b) => `· ${b}`).join("\n")}` : ""}${notes}${aiSection()}\n실행 기록: ${run}`,
}[mode];
if (!body) throw new Error(`알 수 없는 mode: ${mode}`);

// 노션 rich_text 한 덩어리는 2000자 제한 → 나눠 담는다
const chunks = body.match(/[\s\S]{1,1900}/g) ?? [];
await notion("/comments", {
  method: "POST",
  body: { parent: { page_id: pageId }, rich_text: chunks.map((c) => ({ type: "text", text: { content: c } })) },
});
if (mode === "published") {
  await notion(`/pages/${pageId}`, { method: "PATCH", body: { properties: { URL: { url: r.url } } } });
}
log("reported", { pageId, mode });

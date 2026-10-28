// 발행 전 점검.
// - 사실 점검(코드가 직접 확인한 것만 단정): 비밀값 패턴은 발행을 막는다. 링크 응답·코드 언어·이미지 설명은 알림.
// - AI 제안(Bedrock Claude): slug·요약·태그 제안, 맞춤법·노출 '의심'. 본문은 고치지 않고 발행도 막지 않는다.
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// 발견 즉시 발행 중단 — 오탐보다 유출이 비싸다
const SECRET_PATTERNS = [
  ["AWS 액세스 키", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["개인 키", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub 토큰", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["Slack 토큰", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Anthropic 키", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ["노션 토큰", /\b(?:secret_[A-Za-z0-9]{40,}|ntn_[A-Za-z0-9]{40,})\b/],
  ["Google API 키", /\bAIza[0-9A-Za-z_-]{35}\b/],
];
// 단정하지 않고 '의심'으로만 알림 (예: AWS 글의 CIDR 예시는 정상일 수 있다)
const SUSPECT_PATTERNS = [
  ["사설 IP", /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/],
  ["사내 스테이징 도메인", /\b[\w.-]*(?:danish\.pe\.kr|comenthor\.com|\.internal)\b/],
];

export function htmlToText(html) {
  return html
    .replace(/<(?:br|\/p|\/h\d|\/li|\/pre|\/tr|hr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function factCheck({ title, html, facts }) {
  const text = `${title}\n${htmlToText(html)}`;
  const blocking = [];
  const notes = [];
  for (const [name, re] of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) blocking.push(`${name} 형태의 문자열이 있습니다: \`${m[0].slice(0, 6)}…\``);
  }
  for (const [name, re] of SUSPECT_PATTERNS) {
    const m = text.match(re);
    if (m) notes.push(`${name} 의심: \`${m[0]}\` — 공개해도 되는 값인지 확인해 주세요.`);
  }
  // 링크는 실제로 요청해 본 결과만 적는다
  const broken = [];
  await Promise.all(
    [...facts.links].filter((u) => /^https?:\/\//.test(u)).map(async (u) => {
      try {
        const res = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "comento-blog-publish-check" } });
        if (res.status >= 400 && res.status !== 403 && res.status !== 429) broken.push(`${u} → ${res.status}`);
      } catch (e) {
        broken.push(`${u} → 응답 없음 (${e.name})`);
      }
    }),
  );
  if (broken.length) notes.push(`열리지 않는 링크 ${broken.length}개:\n${broken.map((b) => `  - ${b}`).join("\n")}`);
  if (facts.codeWithoutLang) notes.push(`언어가 지정되지 않은 코드 블록 ${facts.codeWithoutLang}개 — 구문 강조가 적용되지 않습니다.`);
  if (facts.imagesWithoutCaption) notes.push(`설명(캡션)이 없는 이미지 ${facts.imagesWithoutCaption}개 — 캡션이 대체 텍스트(alt)로 쓰입니다.`);
  const unsupported = Object.entries(facts.unsupported);
  if (unsupported.length) notes.push(`사이트에 표시되지 않는 블록: ${unsupported.map(([t, n]) => `${t}×${n}`).join(", ")}`);
  return { blocking, notes };
}

const Suggestion = z.object({
  slug: z.string().describe("영어 소문자·숫자·하이픈만, 3~60자. 글 주제를 나타내는 짧은 주소"),
  excerpt: z.string().describe("목록 카드에 보일 1~2문장 한국어 요약, 160자 이내"),
  tag: z.string().describe("대표 태그 하나. 기존 태그 목록에 맞는 것이 있으면 그대로, 없으면 짧은 영문 대문자"),
  issues: z
    .array(
      z.object({
        kind: z.enum(["맞춤법", "문장", "노출 의심"]),
        quote: z.string().describe("문제가 있는 원문 구절 그대로 (40자 이내)"),
        suggestion: z.string().describe("고칠 방향 한 줄"),
      }),
    )
    .describe("명확한 문제만. 없으면 빈 배열"),
});

const SYSTEM = `당신은 코멘토 개발팀 기술 블로그의 발행 전 검토자입니다.
글은 사람이 이미 리뷰를 마친 상태이므로, 본문을 다시 쓰지 말고 명확한 문제만 짚습니다.
- 맞춤법·문장: 분명한 오탈자, 비문만. 문체나 취향은 지적하지 않습니다.
- 노출 의심: 비밀번호·키·토큰, 사내 전용 주소나 내부 시스템 상세, 작성자가 아닌 사람의 개인정보, 공개되지 않은 사업 수치처럼
  공개 블로그에 나가면 곤란할 수 있는 내용. 확실하지 않으므로 '의심'으로만 표시합니다.
- slug·요약·태그는 독자 관점에서 제안합니다.`;

/** AI 제안. 실패하거나 거절되면 null — 발행을 막지 않는다. */
export async function aiReview({ title, html, tags }) {
  const text = htmlToText(html);
  if (text.length > 150000) return { skipped: `본문이 길어(${text.length}자) AI 점검을 건너뛰었습니다.` };
  const client = new AnthropicBedrock({ awsRegion: process.env.AWS_REGION || "ap-northeast-2" });
  try {
    const res = await client.messages.parse({
      model: "global.anthropic.claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(Suggestion) },
      messages: [
        {
          role: "user",
          content: `기존 태그 목록: ${tags.join(", ") || "(없음)"}\n\n<title>${title}</title>\n<body>\n${text}\n</body>`,
        },
      ],
    });
    if (res.stop_reason === "refusal") return { skipped: "AI 가 이 글의 검토를 거절했습니다(안전 분류). 사람 검토로 충분하면 그대로 발행됩니다." };
    if (res.stop_reason === "max_tokens" || !res.parsed_output) return { skipped: `AI 응답을 해석하지 못했습니다(stop_reason=${res.stop_reason}).` };
    return { suggestion: res.parsed_output, usage: res.usage };
  } catch (e) {
    return { skipped: `AI 점검 호출 실패: ${e.message?.slice(0, 200)}` };
  }
}

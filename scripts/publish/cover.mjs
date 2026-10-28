// 커버가 없는 글의 AI 커버 = AI 일러스트(오른쪽) + 키워드 글자(왼쪽).
// 기존 'Harness Engineering' 커버처럼 주제명은 글자로 선명하게, 장면은 그림으로.
// - 장면·키워드: 글을 읽은 Claude 가 정한다(review.mjs 의 cover_scene·cover_keyword)
// - 화풍·구도: 여기 고정 — 커버끼리 결이 통일되도록
// - 이미지 모델: Stable Image Ultra(Bedrock us-west-2, 서울 리전엔 이미지 모델이 없음). 글자는 못 그려서 코드로 얹는다.
// 사용(미리보기): node scripts/publish/cover.mjs "<장면(영어)>" "<키워드>" out.png ["<아이콘 이름>"]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

export const COVER_MODEL = "stability.stable-image-ultra-v1:1";
const REGION = "us-west-2";
const W = 1600;
const H = 900;

// 색: 공식 아이콘의 분야색에 커버 전체(배경·강조·일러스트)를 맞춘다 — 아이콘은 변형 금지라 아이콘 쪽을 바꿀 수 없다.
// 아이콘이 없으면 코멘토 파랑(#2a7de1, @comento/tailwind-plugin primary).
const PALETTES = {
  "#01A88D": "teal green, mint and soft aqua", // AI·ML
  "#ED7100": "warm orange, peach and soft sand", // 컴퓨팅·컨테이너
  "#C925D1": "orchid purple, lilac and soft pink", // 데이터베이스
  "#8C4FFF": "violet, lavender and periwinkle", // 네트워킹
  "#E7157B": "raspberry pink, rose and blush", // 관리·애플리케이션 통합
  "#7AA116": "fresh green, lime and pale sage", // 스토리지
  "#DD344C": "crimson red, coral and soft blush", // 보안
  "#2A7DE1": "cobalt blue, sky blue and lavender with small coral accents", // 기본(코멘토)
};
const DEFAULT_COLOR = "#2A7DE1";
const mix = (hex, t) => { // 흰색 쪽으로 t 만큼
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `rgb(${c.join(",")})`;
};

// 스타일을 장면보다 앞에 둔다 — 뒤에 두면 장면 묘사에 끌려 3D·사진풍으로 흐른다(실측 10-28)
const style = (color) =>
  "2D flat vector illustration, minimal tech blog cover art in the style of modern SaaS editorial illustrations. " +
  "Simple geometric shapes, clean outlines, no shading realism, light airy off-white background, " +
  `harmonious palette of ${PALETTES[color] ?? PALETTES[DEFAULT_COLOR]}.`;
// 구도는 코드로 강제한다: 그림은 정사각형으로 그려 오른쪽에만 놓고, 왼쪽은 글자 자리(모델은 '비워 두라'를 잘 안 지킴, 실측 10-28)
const COMPOSITION = "Centered composition, all subjects fully inside the frame.";
const NEGATIVE =
  "text, letters, words, numbers, typography, captions, labels, watermark, logo, signature, " +
  "3d render, photo, photorealistic, figurines, glossy, blurry, low quality, distorted, cluttered, dark background";

const require = createRequire(import.meta.url);
const fontDir = path.join(path.dirname(require.resolve("pretendard/package.json")), "dist/public/static");
const FONTS = [700, 600].map((w) => ({
  name: "Pretendard", weight: w, style: "normal",
  data: fs.readFileSync(path.join(fontDir, w === 700 ? "Pretendard-Bold.otf" : "Pretendard-SemiBold.otf")),
}));
// 공식 기술 아이콘(원본 그대로) — 키워드 위에 얹는다. 목록: cover-icons/index.json
const ICON_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "cover-icons");
export const ICONS = JSON.parse(fs.readFileSync(path.join(ICON_DIR, "index.json"), "utf-8")).icons;
const iconColor = (name) =>
  (ICONS[name] && fs.readFileSync(path.join(ICON_DIR, ICONS[name]), "utf-8").match(/(?:fill|stop-color)="(#[0-9A-Fa-f]{6})"/)?.[1]?.toUpperCase()) || DEFAULT_COLOR;
const iconData = (name) =>
  ICONS[name] ? `data:image/svg+xml;base64,${fs.readFileSync(path.join(ICON_DIR, ICONS[name])).toString("base64")}` : null;

const h = (type, style, ...children) => ({
  type, props: { style: { display: "flex", ...style }, children: children.length === 1 ? children[0] : children },
});

async function illustrate(scene, color) {
  const res = await new BedrockRuntimeClient({ region: REGION }).send(
    new InvokeModelCommand({
      modelId: COVER_MODEL, contentType: "application/json", accept: "application/json",
      body: JSON.stringify({ prompt: `${style(color)} ${COMPOSITION} Scene: ${scene.trim()}`, negative_prompt: NEGATIVE, aspect_ratio: "1:1", output_format: "png" }),
    }),
  );
  const out = JSON.parse(Buffer.from(res.body).toString("utf-8"));
  if (out.finish_reasons?.[0]) throw new Error(`이미지 생성 중단: ${out.finish_reasons[0]}`); // 예: 콘텐츠 필터
  return out.images[0]; // base64
}

/** 장면 + 키워드 → PNG(Buffer, 1600×900). 실패하면 예외 — 호출 쪽이 대체 처리. */
export async function makeAiCover({ scene, keyword, icon }) {
  const color = iconColor(icon);
  const art = await illustrate(scene, color);
  const n = [...(keyword || "")].length;
  const size = n <= 10 ? 104 : n <= 18 ? 88 : 72; // 글자 칸 폭 588px
  const ART = H; // 정사각 그림을 오른쪽에 900×900 으로
  const tree = h(
    "div",
    { width: W, height: H, position: "relative", fontFamily: "Pretendard", backgroundImage: `linear-gradient(120deg, ${mix(color, 0.96)} 0%, ${mix(color, 0.92)} 55%, ${mix(color, 0.88)} 100%)` },
    { type: "img", props: { src: `data:image/png;base64,${art}`, width: ART, height: ART, style: { position: "absolute", right: 0, top: 0, width: ART, height: ART } } },
    // 그림 왼쪽 가장자리를 배경으로 녹인다
    h("div", { position: "absolute", left: W - ART, top: 0, width: 220, height: H, backgroundImage: `linear-gradient(90deg, ${mix(color, 0.93)} 0%, rgba(255,255,255,0) 100%)` }),
    h(
      "div",
      { position: "absolute", left: 112, top: 0, height: H, width: W - ART - 112, flexDirection: "column", justifyContent: "center" },
      ...(iconData(icon)
        ? [{ type: "img", props: { src: iconData(icon), width: 148, height: 148, style: { width: 148, height: 148, borderRadius: 20, marginBottom: 40 } } }]
        : []),
      h("div", { fontSize: size, fontWeight: 700, lineHeight: 1.12, letterSpacing: -2, color: "#0f2a4a", wordBreak: "keep-all" }, keyword || ""),
      h("div", { marginTop: 28, width: 96, height: 10, borderRadius: 5, backgroundColor: color }),
    ),
  );
  const svg = await satori(tree, { width: W, height: H, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [scene, keyword, out = "cover.png", icon] = process.argv.slice(2);
  fs.writeFileSync(out, await makeAiCover({ scene, keyword, icon }));
  console.log(`커버 생성: ${out}`);
}

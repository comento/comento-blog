# 코멘토 개발팀 블로그

마지막 수정일자: 2026-10-23

## 요구 환경

NodeJS 22.11.0 (.tool-versions를 참고하세요. asdf 사용 권장)

## 구조 설명

글 원본은 S3 `s3://developer.comento.kr/_source/<url-slug>/index.md` 에 있습니다 (2026-10 Ghost CMS 폐기).
각 파일은 YAML frontmatter(제목·slug·발행시각·요약·커버·대표태그·작성자·읽는시간) + 본문 HTML 입니다.
`_source/` 는 CloudFront 로 노출되지 않게 버킷 정책으로 막혀 있습니다.

빌드 전에 `pnpm fetch:posts` 로 `src/content/posts/` 에 내려받습니다(git 에는 넣지 않음). 글이 하나도 없으면 빌드가 실패합니다.

- index에서는 목록을 불러와서 최신순으로 보여줍니다.
- [slug]에서는 모든 post를 불러와서 페이지를 정적 생성합니다.
- `Layout.astro`로 전체 레이아웃을 통일합니다.

SSG 방식이기 때문에 컨텐츠의 추가, 수정, 삭제를 반영하려면 배포를 새로 해주어야 합니다.

## pnpm 명령어 사용 방법

```sh
pnpm fetch:posts # 글 원본 내려받기 (AWS 자격 증명 필요)
pnpm dev # 로컬 개발 서버 작동
pnpm build # 빌드
pnpm preview # 빌드 상태에서 확인
pnpm deploy # 빌드 후 배포
```

## 사용한 기술 출처

- Astro: 프로젝트 전체 [링크](https://astro.build)
- HeroIcons [링크](https://heroicons.com/)
- Tailwind CSS [링크](https://tailwindcss.com/)

기능 추가 등은 Astro 문서를 확인해서 진행해주세요.

# 코멘토 개발팀 블로그

마지막 수정일자: 2024-12-04

## 요구 환경

NodeJS 22.11.0 (.tool-versions를 참고하세요. asdf 사용 권장)

## 구조 설명

Ghost의 컨텐츠를 가져와서 사용합니다.

- index에서는 목록을 불러와서 최신순으로 보여줍니다.
- [slug]에서는 모든 post를 불러와서 페이지를 정적 생성합니다.
- `Layout.astro`로 전체 레이아웃을 통일합니다.

SSG 방식이기 때문에 컨텐츠의 추가, 수정, 삭제를 반영하려면 배포를 새로 해주어야 합니다.

## pnpm 명령어 사용 방법

```sh
pnpm dev # 로컬 개발 서버 작동
pnpm build # 빌드
pnpm preview # 빌드 상태에서 확인
pnpm deploy # 빌드 후 배포
```

## 사용한 기술 출처

- Astro: 프로젝트 전체 [링크](https://astro.build)
- HeroIcons [링크](https://heroicons.com/)
- Tailwind CSS [링크](https://tailwindcss.com/)
- Ghost Content API JS Client [링크](https://ghost.org/docs/content-api/javascript/)

기능 추가 등은 Astro와 Ghost 문서를 확인해서 진행해주세요.

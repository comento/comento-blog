import type { Post } from "./posts";

/** URL slug 는 원본 폴더 이름 그대로 쓴다 (빌드 머신 시간대에 따라 날짜가 바뀌지 않게). */
export function getPostSlug(post: Pick<Post, "id">) {
  return post.id;
}

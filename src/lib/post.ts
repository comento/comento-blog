import { PostOrPage } from "@tryghost/content-api";
import dayjs from "dayjs";

export function getPostSlug(post: PostOrPage) {
  return `${post.slug}-${dayjs(post.published_at).format("YY-MM-DD")}`;
}

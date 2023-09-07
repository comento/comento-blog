import rss from "@astrojs/rss";
import { ghostClient } from "@lib/ghost";
import { getPostSlug } from "@lib/post";

export async function GET(context) {
  const posts = await ghostClient.posts.browse({
    limit: "all",
    include: ["authors", "tags"],
    fields:
      "id,title,reading_time,feature_image,title,html,slug,primary_author,published_at,excerpt,primary_tag",
  });
  return rss({
    // `<title>` field in output xml
    title: "블로그 | 코멘토 개발팀",
    // `<description>` field in output xml
    description:
      "코멘토를 만들어가는 개발자들의 일상, 생각, 고민이 담긴 블로그입니다. 업무 중 만난 다양한 일의 기록이 남아있습니다.",
    // Pull in your project "site" from the endpoint context
    // https://docs.astro.build/en/reference/api-reference/#contextsite
    site: context.site,
    // Array of `<item>`s in output xml
    // See "Generating items" section for examples using content collections and glob imports
    items: posts.map((post) => ({
      title: post.title,
      pubDate: post.published_at,
      description: post.excerpt,
      // Compute RSS link from post `slug`
      // This example assumes all posts are rendered as `/blog/[slug]` routes
      link: `/post/${getPostSlug(post)}/`,
    })),
  });
}

import GhostContentAPI from "@tryghost/content-api";

export const ghostClient = new GhostContentAPI({
  url: "http://blog.comento.info:2370",
  key: import.meta.env.CONTENT_API_KEY,
  version: "v5.0",
});

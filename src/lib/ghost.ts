import GhostContentAPI from "@tryghost/content-api";

export const ghostClient = new GhostContentAPI({
  url: "http://52.79.239.39:2370",
  key: import.meta.env.CONTENT_API_KEY,
  version: "v5.0",
});

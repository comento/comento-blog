import GhostContentAPI from "@tryghost/content-api";

export const ghostClient = new GhostContentAPI({
  url: "http://3.39.25.212:2369",
  key: import.meta.env.CONTENT_API_KEY,
  version: "v5.0",
});

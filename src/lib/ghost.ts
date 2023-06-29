import GhostContentAPI from "@tryghost/content-api";

export const ghostClient = new GhostContentAPI({
  url: "https://comento.ghost.io",
  key: import.meta.env.CONTENT_API_KEY,
  version: "v5.0",
});

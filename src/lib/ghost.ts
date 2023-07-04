import GhostContentAPI from "@tryghost/content-api";
import GhostAdminAPI from "@tryghost/admin-api";

export const ghostClient = new GhostContentAPI({
  url: "http://blog.comento.info:2370",
  key: import.meta.env.CONTENT_API_KEY,
  version: "v5.0",
});

export const adminClient = new GhostAdminAPI({
  url: "http://blog.comento.info:2370",
  key: import.meta.env.ADMIN_API_KEY,
  version: "v5.0",
});

import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import partytown from "@astrojs/partytown";

import vue from "@astrojs/vue";

// https://astro.build/config
export default defineConfig({
  site: "https://developer.comento.kr",
  integrations: [tailwind(), sitemap(), partytown({
    config: {
      forward: ["dataLayer.push"]
    }
  }), vue()],
  trailingSlash: "never"
});
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,svg}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '100ch',
          },
        }
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require('@comento/tailwind-plugin')],
};

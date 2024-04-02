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
            '--tw-prose-code': '#E92525',
            code: {
              fontWeight: 400,
              background: 'rgba(135,131,120,.15)',
              borderRadius: '0.25rem',
              padding: '0.2em 0.4em',
              '&::before': {
                content: '"" !important',
              },
              '&::after': {
                content: '"" !important',
              },
            }
          },
        }
      },
      colors: {
        primary: "#2a7de1",
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require('@comento/tailwind-plugin')],
};

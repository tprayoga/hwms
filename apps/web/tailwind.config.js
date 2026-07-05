/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Intermediate shades used throughout the UI that are not part of the
        // default Tailwind palette. Without these, `bg-slate-955`, `text-slate-350`,
        // etc. generate no CSS rule, so native form controls (<select>/<input>/
        // <textarea>) fall back to their browser-default white background,
        // rendering white-on-white (invisible) text.
        slate: {
          205: '#dfe6ee',
          350: '#b0bccb',
          405: '#909fb5',
          450: '#7c8ba1',
          455: '#798799',
          550: '#566377',
          650: '#3e4a5f',
          750: '#293548',
          755: '#273349',
          805: '#1c2637',
          850: '#172032',
          855: '#162031',
          880: '#111a2d',
          955: '#01050f',
        },
        red: {
          450: '#f45a5a',
          955: '#3d0808',
        },
        emerald: {
          450: '#22c78d',
        },
        rose: {
          450: '#f75872',
          455: '#f6556f',
        },
        sky: {
          450: '#23b0f0',
        },
      }
    },
  },
  plugins: [],
}

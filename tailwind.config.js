// Farben und Schriften nach immergrün-CI (IG-Wissen 01-marke-ci-farben-fonts.md)
// und dem IG-Store-Designsystem, das auch IG Inventur nutzt.
// Gelb (#FAD20A) ist bewusst nicht definiert: In dieser App gibt es kein Gelb.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: '#084B32', // IG Green, Primärfarbe
        fresh: '#96C31E', // IG Fresh Green, Akzent
        dunkel: '#083028', // IG Dark Green
        hell: '#DEE8E8', // IG Light Green
        igred: '#EB5555', // IG Red, Warnung
        ig: {
          900: '#0d2818', 800: '#1b4332', 700: '#2d6a4f', 600: '#40916c', 300: '#b7dfcb',
          100: '#e8f5e9', 50: '#f0faf4', hairline: '#dde6e0',
        },
      },
      fontFamily: {
        display: ['"Gloock"', 'Georgia', 'serif'],
        sans: ['"Work Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'ig-story': 'linear-gradient(135deg,#0d2818 0%,#1b4332 50%,#2d6a4f 100%)',
      },
    },
  },
  plugins: [],
}

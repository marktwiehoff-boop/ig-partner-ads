// Farben und Schriften laut Bauplan Abschnitt 3B und IG-Wissen
// 01_Marke_Branding/01-marke-ci-farben-fonts.md. Gelb (#FAD20A) ist hier
// bewusst nicht definiert: In dieser App gibt es kein Gelb.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: '#084B32',
        fresh: '#96C31E',
        cream: '#F4F1EA',
        dunkel: '#083028',
        hell: '#DEE8E8',
        igred: '#EB5555',
      },
      fontFamily: {
        display: ['Gloock', 'serif'],
        sans: ['"Work Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

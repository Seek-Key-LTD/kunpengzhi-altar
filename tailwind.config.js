/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        altar: {
          bg: '#05070d',
          card: '#0c1220',
          border: '#1e293b',
          gold: '#dfa856',
          cyan: '#38bdf8',
          jade: '#10b981',
          crimson: '#e11d48',
          water: '#60a5fa'
        }
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'SimSun', 'STSong', 'serif'],
        sans: ['"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif']
      }
    },
  },
  plugins: [],
}

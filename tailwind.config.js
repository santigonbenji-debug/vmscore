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
          DEFAULT: '#E84E1B',
          50:  '#FEF0EB',
          100: '#FDD8CC',
          200: '#FAB199',
          300: '#F78A66',
          400: '#F46333',
          500: '#E84E1B',
          600: '#C23E14',
          700: '#9B2E0D',
          800: '#741E06',
          900: '#4D0E00',
        },
        surface: {
          50:  '#F5F5F5',
          100: '#E5E5E5',
          200: '#D4D4D4',
          300: '#A3A3A3',
          400: '#737373',
          500: '#525252',
          600: '#404040',
          700: '#262626',
          800: '#1A1A1A',
          900: '#111111',
          950: '#0A0A0A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        manga: {
          yellow: '#FFD700',
          white: '#FFFFFF',
          black: '#000000',
          gray: '#333333',
        }
      },
      fontFamily: {
        manga: ['Impact', 'Haettenschweiler', 'Arial Narrow Bold', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'speed-lines': 'speedLines 0.5s ease-out',
        'bubble-appear': 'bubbleAppear 0.3s ease-out',
        'bubble-fade': 'bubbleFade 0.5s ease-in forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        speedLines: {
          '0%': { opacity: '1', transform: 'scaleX(0)' },
          '100%': { opacity: '0', transform: 'scaleX(1)' },
        },
        bubbleAppear: {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bubbleFade: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(-20px)' },
        },
      },
      backgroundImage: {
        'manga-dots': 'radial-gradient(circle, #333 1px, transparent 1px)',
        'speed-line': 'linear-gradient(90deg, #FFD700 0%, transparent 100%)',
      },
    },
  },
  plugins: [],
}

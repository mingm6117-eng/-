/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        ink: '#050505',
      },
      boxShadow: {
        glass: 'inset 0 1px 1px rgba(255, 255, 255, 0.1)',
      },
    },
  },
  plugins: [],
};

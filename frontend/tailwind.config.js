/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17212b',
        mist: '#eef3f7',
        fern: '#28745a',
        coral: '#c8553d'
      }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#4A90E2',
          green: '#50E3C2',
          ink: '#0F1B2D',
          slate: '#475569',
          mist: '#F4F8FC',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Poppins', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 24px -8px rgba(15, 27, 45, 0.12)',
      },
    },
  },
  plugins: [],
};

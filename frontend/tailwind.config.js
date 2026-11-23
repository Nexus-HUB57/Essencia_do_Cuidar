/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta Essência do Cuidar
        serenity: {
          50: '#F0F7FF',
          100: '#DCEEFF',
          200: '#B8DDFF',
          300: '#8AC4FF',
          400: '#5DA6FA',
          500: '#4A90E2', // principal
          600: '#3A78C2',
          700: '#2F60A0',
          800: '#264B7A',
          900: '#1A3252'
        },
        emerald: {
          50: '#E6FBF6',
          100: '#C2F4E5',
          200: '#9CECD5',
          300: '#7CE3C6',
          400: '#62DABA',
          500: '#50E3C2', // principal
          600: '#3CBFA1',
          700: '#2E9779',
          800: '#226B57',
          900: '#163F33'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Poppins', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 4px 20px rgba(74, 144, 226, 0.08)',
        card: '0 8px 30px rgba(0, 0, 0, 0.06)'
      }
    }
  },
  plugins: []
};

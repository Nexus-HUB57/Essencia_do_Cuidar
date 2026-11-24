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
        },
        // Paleta "essência" — identidade dos roteiros (verde sálvia + dourado + creme).
        // Usada pelo sistema de ilustrações SVG e pelos detalhes de marca.
        essencia: {
          floresta: {
            DEFAULT: '#1D4B3E',
            800: '#122E27',
            700: '#163A30',
            600: '#1D4B3E',
            500: '#2A5F50',
            400: '#3A7765'
          },
          salvia: {
            50: '#EEF3EC',
            100: '#E3ECE1',
            200: '#C8D8C4',
            300: '#AEC3AB',
            400: '#8CA38B',
            500: '#6E8F6C',
            600: '#557A52',
            700: '#4A6B47'
          },
          dourado: {
            50: '#FBF6E9',
            100: '#F3E7C8',
            200: '#E8D8A6',
            300: '#DDBD72',
            400: '#C9A24B',
            500: '#B08A35',
            600: '#8F6E28'
          },
          creme: {
            50: '#FBF8F1',
            100: '#F7F2E7',
            200: '#EFE7D6'
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'Poppins', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 4px 20px rgba(74, 144, 226, 0.08)',
        card: '0 8px 30px rgba(0, 0, 0, 0.06)'
      },
      // Animações das ilustrações: leves, contínuas e desligáveis.
      // Segurança de movimento definida no index.css (prefers-reduced-motion).
      animation: {
        'flutuar': 'essenciaFlutuar 6s ease-in-out infinite',
        'planar': 'essenciaPlanar 5s ease-in-out infinite',
        'oscilar': 'essenciaOscilar 7s ease-in-out infinite',
        'asas': 'essenciaAsas 0.9s ease-in-out infinite',
        'brilhar': 'essenciaBrilhar 3.5s ease-in-out infinite'
      },
      keyframes: {
        essenciaFlutuar: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        essenciaPlanar: {
          '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
          '30%': { transform: 'translate(6px, -10px) rotate(3deg)' },
          '65%': { transform: 'translate(-5px, -4px) rotate(-2deg)' }
        },
        essenciaOscilar: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '35%': { transform: 'rotate(1.6deg)' },
          '70%': { transform: 'rotate(-1.4deg)' }
        },
        essenciaAsas: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(0.55)' }
        },
        essenciaBrilhar: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' }
        }
      }
    }
  },
  plugins: []
};

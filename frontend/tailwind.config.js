/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0A0E1A',
          card: '#151D30',
          border: '#222F4D',
          text: '#E5E7EB',
          textMuted: '#9CA3AF'
        },
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        accent: {
          green: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
          blue: '#3B82F6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 15px rgba(99, 102, 241, 0.35)',
        'glow-green': '0 0 15px rgba(16, 185, 129, 0.35)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.35)',
      }
    },
  },
  plugins: [],
}

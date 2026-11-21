/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Emerald Smart Control Center Palette
        background: {
          main: '#0B0F12',
          secondary: '#111820',
          sidebar: '#080D11',
          card: '#141C23',
          'card-hover': '#1A242E',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.08)',
          'hover-emerald': 'rgba(16, 185, 129, 0.35)',
        },
        brand: {
          dark: '#0B0F12',
          surface: '#111820',
          sidebar: '#080D11',
          card: '#141C23',
          'card-hover': '#1A242E',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-highlight': 'rgba(16, 185, 129, 0.35)',
        },
        emerald: {
          400: '#34D399',
          500: '#10B981',
          800: '#065F46',
          900: '#064E3B',
          950: '#022c22',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.35)',
        'glow-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.35)',
        'glow-blue': '0 0 25px -5px rgba(59, 130, 246, 0.35)',
        'glow-danger': '0 0 25px -5px rgba(239, 68, 68, 0.35)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
      },
      animation: {
        'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite alternate',
        'spin-slow': 'spin 12s linear infinite',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
        glowPulse: {
          '0%': {
            boxShadow: '0 0 10px rgba(16, 185, 129, 0.25)',
          },
          '100%': {
            boxShadow: '0 0 25px rgba(16, 185, 129, 0.55), 0 0 40px rgba(6, 182, 212, 0.2)',
          },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}

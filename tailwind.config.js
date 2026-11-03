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
        brand: {
          dark: '#050914',
          surface: '#0a1024',
          card: '#0f172e',
          'card-hover': '#152042',
          border: 'rgba(56, 189, 248, 0.12)',
          'border-highlight': 'rgba(34, 211, 238, 0.35)',
        },
        cyan: {
          450: '#15b8d6',
          550: '#0284c7',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.4)',
        'glow-teal': '0 0 25px -5px rgba(20, 184, 166, 0.4)',
        'glow-blue': '0 0 25px -5px rgba(59, 130, 246, 0.4)',
        'glow-danger': '0 0 25px -5px rgba(239, 68, 68, 0.4)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
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
            boxShadow: '0 0 10px rgba(6, 182, 212, 0.25)',
          },
          '100%': {
            boxShadow: '0 0 25px rgba(6, 182, 212, 0.55), 0 0 40px rgba(20, 184, 166, 0.2)',
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

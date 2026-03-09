/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'niks-black': '#1A1A1A',
        'niks-white': '#FFFFFF',
        'niks-gray': '#9CA3AF',
        'niks-light': '#F5F5F7',
        'niks-disabled': '#D1D5DB',
        'niks-border': 'rgba(0,0,0,0.1)',
        'niks-muted': '#717182',
        'niks-input-bg': '#F3F3F5',
        'niks-accent': '#FF9B8A',
        'niks-tab-bg': '#EDEDEE',
        'niks-tab-active': '#1D3A44',
        'niks-tab-inactive': '#8A8A8E',
        'niks-scan-btn': '#FB7B6B',
        'niks-card-bg': '#F6F4EE',
        'niks-gold': '#FFD700',
      },
      fontFamily: {
        sans: ['System'],
      },
      borderRadius: {
        'btn': '14px',
        'card': '16px',
        'pill': '100px',
      },
    },
  },
  plugins: [],
};

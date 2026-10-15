/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#050907', surface: '#0B1710', raised: '#10251A', neon: '#55F58B',
        teal: '#2DD4BF', amber: '#F5B83D', coral: '#FF6B5E', sage: '#8FA89A',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
    },
  },
  plugins: [],
};

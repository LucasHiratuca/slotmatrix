/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      letterSpacing: {
        tighter: '-0.01em',
        tight: '-0.01em',
        normal: '0em',
        wide: '0.015em',
      },
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        sunken: 'var(--bg-sunken)',
        elevated: 'var(--bg-elevated)',
        'border-subtle': 'var(--border-subtle)',
        'border-strong': 'var(--border-strong)',
        'ink-primary': 'var(--text-primary)',
        'ink-secondary': 'var(--text-secondary)',
        'ink-muted': 'var(--text-muted)',
        brand: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-hover)',
          tint: 'var(--accent-tint)',
          'tint-text': 'var(--accent-tint-text)',
          contrast: 'var(--accent-contrast)',
        },
      },
    },
  },
  plugins: [],
};

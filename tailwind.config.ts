import type { Config } from 'tailwindcss';

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'oklch(var(--color-canvas) / <alpha-value>)',
        surface: 'oklch(var(--color-surface) / <alpha-value>)',
        panel: 'oklch(var(--color-panel) / <alpha-value>)',
        ink: 'oklch(var(--color-ink) / <alpha-value>)',
        muted: 'oklch(var(--color-muted) / <alpha-value>)',
        line: 'oklch(var(--color-line) / <alpha-value>)',
        accent: 'oklch(var(--color-accent) / <alpha-value>)',
        accentSoft: 'oklch(var(--color-accent-soft) / <alpha-value>)',
        warning: 'oklch(var(--color-warning) / <alpha-value>)',
        danger: 'oklch(var(--color-danger) / <alpha-value>)'
      },
      boxShadow: {
        panel: '0 18px 45px oklch(0.28 0.02 120 / 0.08)'
      }
    }
  },
  plugins: []
} satisfies Config;

import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import { DESIGN } from './src/lib/modules/designer';

// Switzerland Style (DESIGN.md): Inter + Roboto Mono, three colours, 4px grid
// (Tailwind's default spacing scale is already 4px per step).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { md: '768px' } },
    extend: {
      fontFamily: {
        sans: [DESIGN.fonts.body, 'system-ui', '-apple-system', 'sans-serif'],
        mono: [DESIGN.fonts.meta, 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: DESIGN.colors.text,
        paper: DESIGN.colors.bg,
        rule: DESIGN.colors.border,
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        // Grill Score bands: the one functional colour exception in DESIGN.md.
        grill: { red: '#DC2626', yellow: '#CA8A04', green: '#16A34A' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 1px)', sm: 'calc(var(--radius) - 2px)' },
    },
  },
  plugins: [animate],
};
export default config;

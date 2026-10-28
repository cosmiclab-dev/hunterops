import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import { DESIGN } from './src/lib/modules/designer';

// Inter + Roboto Mono and the 4px grid from DESIGN.md (Tailwind's spacing scale
// is already 4px per step). Colours are CSS tokens so light and dark share them.
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { md: '768px' } },
    extend: {
      fontFamily: {
        // The iPhone's own SF Pro first; Inter where it is not available.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', DESIGN.fonts.body, 'system-ui', 'sans-serif'],
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
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        info: 'hsl(var(--info))',
        sidebar: 'hsl(var(--sidebar))',
        // Grill Score bands.
        grill: { red: '#C9343E', yellow: '#B7791F', green: '#2F8A4C' },
      },
      borderRadius: { xl: 'calc(var(--radius) + 4px)', lg: 'var(--radius)', md: 'calc(var(--radius) - 4px)', sm: 'calc(var(--radius) - 6px)' },
    },
  },
  plugins: [animate],
};
export default config;

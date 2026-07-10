import type { Config } from 'tailwindcss';

/** e4coach design tokens (assets/e4coach-design-tokens.md). Indigo is the one accent. */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo: {
          50: '#ECEDFB',
          100: '#DCDEF7',
          200: '#BCC0EF',
          300: '#949BE6',
          400: '#6E78DC',
          500: '#4F5BD5',
          600: '#3F49BE',
          700: '#343C9E',
          800: '#2A3080',
          900: '#1F2460',
        },
        neutral: {
          0: '#FFFFFF',
          50: '#F7F8FA',
          100: '#EEF0F4',
          200: '#E2E5EC',
          300: '#CBD0DA',
          400: '#9AA1B2',
          500: '#6B7280',
          600: '#4B5162',
          700: '#343A47',
          800: '#22262F',
          850: '#1A1A24',
          900: '#171720',
          950: '#0F0F16',
        },
        primary: { DEFAULT: '#4F5BD5', hover: '#3F49BE', active: '#343C9E', subtle: '#ECEDFB' },
        // `brand` aliases the indigo primary so existing bg-brand/text-brand-dark
        // classes reskin to the new palette without touching every component.
        brand: { DEFAULT: '#4F5BD5', dark: '#343C9E' },
        ink: '#171720',
        mist: '#ECEDFB',
        success: { DEFAULT: '#16A34A', bg: '#E7F6ED', text: '#0F7A38', border: '#A7E0BC' },
        warning: { DEFAULT: '#D97706', bg: '#FDF0DD', text: '#9A5B08', border: '#F3CE92' },
        danger: { DEFAULT: '#DC2626', bg: '#FBE9E9', text: '#B42318', border: '#F3B6B6' },
        info: { DEFAULT: '#2563EB', bg: '#E7EEFD', text: '#1D4FC4', border: '#B6CCF7' },
      },
      borderRadius: { sm: '6px', DEFAULT: '10px', lg: '14px' },
      fontFamily: {
        display: ['var(--font-display)', 'Sora', 'sans-serif'],
        body: ['var(--font-body)', 'DM Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

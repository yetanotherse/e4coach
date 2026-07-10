# e4coach — Design Tokens

_Version 1.0 · Brand core: indigo `#4F5BD5` · Typeface: Sora (display) / DM Sans (Headings) / Inter (body)_

A complete, production-ready color system built on the brand core (indigo, deep, ink, mist), extended with a neutral ramp and semantic colors. All text/background pairings below are verified to meet **WCAG 2.1 AA** (contrast ≥ 4.5:1 for normal text). Ready to paste into CSS or Tailwind.

---

## 1. Principles

- **One accent.** Indigo is the only brand hue. Don't introduce a second decorative color — semantic colors (green/amber/red/blue) carry _meaning_, not decoration.
- **Two layers of color.** _Raw ramps_ (indigo-50…900, neutral-0…950) are the palette; _purpose tokens_ (`--text-primary`, `--surface-card`, …) are what components actually use. Never reference a raw hex in a component — always a purpose token, so dark mode and future retints are one-line changes.
- **Meaning drives semantics.** Green = improvement/success, red = blunder/error, amber = caution/inaccuracy, blue = neutral info. In a chess-coaching UI these map naturally to move quality and validation.
- **Dark mode is first-class**, not an afterthought — every purpose token has a dark value.

---

## 2. Brand ramp — Indigo

The `500` stop is the primary brand color; `50` is `mist`, `700` is `deep`.

| Token        | Hex       | Role                                                      |
| ------------ | --------- | --------------------------------------------------------- |
| `indigo-50`  | `#ECEDFB` | **mist** — tinted backgrounds, selected rows, badge fills |
| `indigo-100` | `#DCDEF7` | hover wash on tinted surfaces                             |
| `indigo-200` | `#BCC0EF` | disabled primary, subtle borders on tint                  |
| `indigo-300` | `#949BE6` | decorative, charts (secondary)                            |
| `indigo-400` | `#6E78DC` | **primary in dark mode**, hover on dark                   |
| `indigo-500` | `#4F5BD5` | **primary** — buttons, links, active, `e4` tile, focus    |
| `indigo-600` | `#3F49BE` | primary hover (light mode)                                |
| `indigo-700` | `#343C9E` | **deep** — primary pressed, emphasis, indigo text on tint |
| `indigo-800` | `#2A3080` | high-emphasis text on light indigo fills                  |
| `indigo-900` | `#1F2460` | darkest brand shade                                       |

---

## 3. Neutral ramp

A slightly cool (blue-leaning) gray so neutrals harmonize with indigo. `900` is `ink`.

| Token         | Hex       | Role                                        |
| ------------- | --------- | ------------------------------------------- |
| `neutral-0`   | `#FFFFFF` | card surface (light), text-on-primary       |
| `neutral-50`  | `#F7F8FA` | page background (light)                     |
| `neutral-100` | `#EEF0F4` | sunken surface, subtle fill                 |
| `neutral-200` | `#E2E5EC` | **default border / divider** (light)        |
| `neutral-300` | `#CBD0DA` | strong border, input border                 |
| `neutral-400` | `#9AA1B2` | placeholder, disabled text                  |
| `neutral-500` | `#6B7280` | **muted text** (light) — 4.8:1 on white     |
| `neutral-600` | `#4B5162` | **secondary text** (light) — 7.9:1 on white |
| `neutral-700` | `#343A47` | surface hover (dark), high-contrast icons   |
| `neutral-800` | `#22262F` | card surface (dark) alt                     |
| `neutral-850` | `#1A1A24` | **card surface (dark)**                     |
| `neutral-900` | `#171720` | **ink** — primary text (light)              |
| `neutral-950` | `#0F0F16` | **page background (dark)**                  |

---

## 4. Semantic ramps

Each semantic role provides a solid **fill** (for buttons/indicators), a pale **bg** tint (for banners/badges), a **text** stop (AA on both white and its own bg), and a **border**.

| Role        | fill      | bg (tint) | text      | border    | Chess meaning                     |
| ----------- | --------- | --------- | --------- | --------- | --------------------------------- |
| **success** | `#16A34A` | `#E7F6ED` | `#0F7A38` | `#A7E0BC` | good move, improvement, correct   |
| **warning** | `#D97706` | `#FDF0DD` | `#9A5B08` | `#F3CE92` | inaccuracy, caution, low time     |
| **danger**  | `#DC2626` | `#FBE9E9` | `#B42318` | `#F3B6B6` | blunder, error, failed validation |
| **info**    | `#2563EB` | `#E7EEFD` | `#1D4FC4` | `#B6CCF7` | neutral tips, engine notes        |

**Dark-mode semantic text/icons** (use on dark card `#1A1A24`): success `#4ADE80`, warning `#FBBF24`, danger `#F98A80`, info `#7EA6F5`. Fills stay the same solid stops; pair with white text.

---

## 5. Purpose tokens (light + dark)

These are the tokens components consume. Verified contrast noted where it matters.

| Token                                           | Light                             | Dark                              | Notes / contrast                   |
| ----------------------------------------------- | --------------------------------- | --------------------------------- | ---------------------------------- |
| `--color-primary`                               | `#4F5BD5`                         | `#4F5BD5`                         | white text on it = 5.5:1 (AA)      |
| `--color-primary-hover`                         | `#3F49BE`                         | `#6E78DC`                         |                                    |
| `--color-primary-active`                        | `#343C9E`                         | `#7B85E4`                         |                                    |
| `--color-primary-subtle`                        | `#ECEDFB`                         | `#20223A`                         | tinted fill behind primary content |
| `--text-primary`                                | `#171720`                         | `#F5F6FA`                         | 17.8:1 / 17.7:1                    |
| `--text-secondary`                              | `#4B5162`                         | `#A9AEBE`                         | 7.9:1 / 7.8:1                      |
| `--text-muted`                                  | `#6B7280`                         | `#7C8194`                         | placeholders, captions             |
| `--text-link`                                   | `#4F5BD5`                         | `#8B93EC`                         | 5.5:1 on white                     |
| `--text-on-primary`                             | `#FFFFFF`                         | `#FFFFFF`                         | text on indigo fills               |
| `--surface-page`                                | `#F7F8FA`                         | `#0F0F16`                         | app background                     |
| `--surface-card`                                | `#FFFFFF`                         | `#1A1A24`                         | cards, panels, modals              |
| `--surface-sunken`                              | `#EEF0F4`                         | `#14141C`                         | wells, code blocks, board frame    |
| `--surface-tint`                                | `#ECEDFB`                         | `#20223A`                         | selected/active rows, highlights   |
| `--border`                                      | `#E2E5EC`                         | `#2A2A38`                         | default hairline                   |
| `--border-strong`                               | `#CBD0DA`                         | `#3A3A4A`                         | inputs, emphasized dividers        |
| `--focus-ring`                                  | `#4F5BD5`                         | `#6E78DC`                         | 2px ring + 2px offset              |
| `--success` / `--success-bg` / `--success-text` | `#16A34A` / `#E7F6ED` / `#0F7A38` | `#16A34A` / `#12281C` / `#4ADE80` |                                    |
| `--warning` / `--warning-bg` / `--warning-text` | `#D97706` / `#FDF0DD` / `#9A5B08` | `#D97706` / `#2A1E0A` / `#FBBF24` |                                    |
| `--danger` / `--danger-bg` / `--danger-text`    | `#DC2626` / `#FBE9E9` / `#B42318` | `#DC2626` / `#2A1414` / `#F98A80` |                                    |
| `--info` / `--info-bg` / `--info-text`          | `#2563EB` / `#E7EEFD` / `#1D4FC4` | `#2563EB` / `#101B2E` / `#7EA6F5` |                                    |

---

## 6. CSS custom properties

Drop into your global stylesheet. Dark mode via `[data-theme="dark"]` (toggle-driven) with a `prefers-color-scheme` fallback.

```css
:root {
  /* brand ramp */
  --indigo-50: #ecedfb;
  --indigo-100: #dcdef7;
  --indigo-200: #bcc0ef;
  --indigo-300: #949be6;
  --indigo-400: #6e78dc;
  --indigo-500: #4f5bd5;
  --indigo-600: #3f49be;
  --indigo-700: #343c9e;
  --indigo-800: #2a3080;
  --indigo-900: #1f2460;

  /* neutral ramp */
  --neutral-0: #ffffff;
  --neutral-50: #f7f8fa;
  --neutral-100: #eef0f4;
  --neutral-200: #e2e5ec;
  --neutral-300: #cbd0da;
  --neutral-400: #9aa1b2;
  --neutral-500: #6b7280;
  --neutral-600: #4b5162;
  --neutral-700: #343a47;
  --neutral-800: #22262f;
  --neutral-850: #1a1a24;
  --neutral-900: #171720;
  --neutral-950: #0f0f16;

  /* purpose tokens */
  --color-primary: #4f5bd5;
  --color-primary-hover: #3f49be;
  --color-primary-active: #343c9e;
  --color-primary-subtle: #ecedfb;

  --text-primary: #171720;
  --text-secondary: #4b5162;
  --text-muted: #6b7280;
  --text-link: #4f5bd5;
  --text-on-primary: #ffffff;

  --surface-page: #f7f8fa;
  --surface-card: #ffffff;
  --surface-sunken: #eef0f4;
  --surface-tint: #ecedfb;

  --border: #e2e5ec;
  --border-strong: #cbd0da;
  --focus-ring: #4f5bd5;

  --success: #16a34a;
  --success-bg: #e7f6ed;
  --success-text: #0f7a38;
  --success-border: #a7e0bc;
  --warning: #d97706;
  --warning-bg: #fdf0dd;
  --warning-text: #9a5b08;
  --warning-border: #f3ce92;
  --danger: #dc2626;
  --danger-bg: #fbe9e9;
  --danger-text: #b42318;
  --danger-border: #f3b6b6;
  --info: #2563eb;
  --info-bg: #e7eefd;
  --info-text: #1d4fc4;
  --info-border: #b6ccf7;

  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;
  --font-display: 'Sora', sans-serif;
  --font-body: 'DM Sans', 'Inter', system-ui, sans-serif;
}

:root[data-theme='dark'] {
  --color-primary: #4f5bd5;
  --color-primary-hover: #6e78dc;
  --color-primary-active: #7b85e4;
  --color-primary-subtle: #20223a;

  --text-primary: #f5f6fa;
  --text-secondary: #a9aebe;
  --text-muted: #7c8194;
  --text-link: #8b93ec;
  --text-on-primary: #ffffff;

  --surface-page: #0f0f16;
  --surface-card: #1a1a24;
  --surface-sunken: #14141c;
  --surface-tint: #20223a;

  --border: #2a2a38;
  --border-strong: #3a3a4a;
  --focus-ring: #6e78dc;

  --success: #16a34a;
  --success-bg: #12281c;
  --success-text: #4ade80;
  --success-border: #1e5233;
  --warning: #d97706;
  --warning-bg: #2a1e0a;
  --warning-text: #fbbf24;
  --warning-border: #5a3e12;
  --danger: #dc2626;
  --danger-bg: #2a1414;
  --danger-text: #f98a80;
  --danger-border: #5a2626;
  --info: #2563eb;
  --info-bg: #101b2e;
  --info-text: #7ea6f5;
  --info-border: #26406e;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --color-primary-hover: #6e78dc;
    --color-primary-active: #7b85e4;
    --color-primary-subtle: #20223a;
    --text-primary: #f5f6fa;
    --text-secondary: #a9aebe;
    --text-muted: #7c8194;
    --text-link: #8b93ec;
    --surface-page: #0f0f16;
    --surface-card: #1a1a24;
    --surface-sunken: #14141c;
    --surface-tint: #20223a;
    --border: #2a2a38;
    --border-strong: #3a3a4a;
    --focus-ring: #6e78dc;
    --success-bg: #12281c;
    --success-text: #4ade80;
    --success-border: #1e5233;
    --warning-bg: #2a1e0a;
    --warning-text: #fbbf24;
    --warning-border: #5a3e12;
    --danger-bg: #2a1414;
    --danger-text: #f98a80;
    --danger-border: #5a2626;
    --info-bg: #101b2e;
    --info-text: #7ea6f5;
    --info-border: #26406e;
  }
}
```

---

## 7. Tailwind config

### Tailwind v4 (`@theme` in CSS)

```css
@import 'tailwindcss';
@theme {
  --color-primary: var(--color-primary);
  --color-primary-hover: var(--color-primary-hover);
  --color-ink: #171720;
  --color-mist: #ecedfb;
  --color-surface: var(--surface-card);
  --color-surface-page: var(--surface-page);
  --color-border: var(--border);
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --color-info: #2563eb;
  --font-display: 'Sora', sans-serif;
  --font-body: 'DM Sans', 'Inter', sans-serif;
}
```

### Tailwind v3 (`tailwind.config.js`)

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
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
        ink: '#171720',
        mist: '#ECEDFB',
        success: { DEFAULT: '#16A34A', bg: '#E7F6ED', text: '#0F7A38', border: '#A7E0BC' },
        warning: { DEFAULT: '#D97706', bg: '#FDF0DD', text: '#9A5B08', border: '#F3CE92' },
        danger: { DEFAULT: '#DC2626', bg: '#FBE9E9', text: '#B42318', border: '#F3B6B6' },
        info: { DEFAULT: '#2563EB', bg: '#E7EEFD', text: '#1D4FC4', border: '#B6CCF7' },
      },
      borderRadius: { sm: '6px', DEFAULT: '10px', lg: '14px' },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
```

> **Tip:** prefer binding Tailwind utilities to the CSS variables (`bg-[var(--surface-card)]`, `text-[var(--text-primary)]`) so a single `data-theme` swap flips the whole app. The raw ramps above are for the rare case you need a specific stop.

---

## 8. Usage guidance

**Buttons**

- Primary: `bg-primary text-on-primary`, hover `--color-primary-hover`, active `--color-primary-active`, focus `--focus-ring` (2px, 2px offset). One primary button per view.
- Secondary: `bg-surface-card`, `border`, `text-primary`, hover `surface-tint`.
- Ghost/tertiary: transparent, hover `surface-tint`.
- Destructive: `bg-danger text-white`.

**Text**

- Headings + body → `--text-primary` (ink). Supporting copy → `--text-secondary`. Captions/placeholders → `--text-muted`. Links → `--text-link`.

**Surfaces & depth**

- Page = `--surface-page`; cards/panels = `--surface-card` with a `--border`; wells / the chess-board frame = `--surface-sunken`. Use borders, not shadows, for structure (add one soft shadow only for popovers/modals).

**Semantic use in the product**

- Move-quality annotations map cleanly: good/best → `success`, inaccuracy → `warning`, mistake/blunder → `danger`, engine note/tip → `info`. Use the `bg`+`text` pair for the weakness-report callouts and the `fill` for inline dots/badges.

**Do / Don't**

- Do keep indigo as the only brand color; let semantics mean something.
- Don't put small indigo-500 text on `mist` — use `deep` (`#343C9E`, 7.9:1) instead.
- Don't use pure black (`#000`) — `ink` (`#171720`) is the darkest text.
- Don't color-code by hue alone — pair semantic color with an icon or label (accessibility).

---

## 9. Verified contrast (WCAG 2.1 AA)

All computed with the WCAG relative-luminance formula; ✓ = passes AA normal text (≥ 4.5:1).

| Pair                                                        | Ratio           |     |
| ----------------------------------------------------------- | --------------- | --- |
| ink `#171720` on white                                      | 17.8:1          | ✓   |
| secondary `#4B5162` on white                                | 7.9:1           | ✓   |
| muted `#6B7280` on white                                    | 4.8:1           | ✓   |
| white on primary `#4F5BD5`                                  | 5.5:1           | ✓   |
| white on deep `#343C9E`                                     | 9.2:1           | ✓   |
| link `#4F5BD5` on white                                     | 5.5:1           | ✓   |
| deep `#343C9E` on mist `#ECEDFB`                            | 7.9:1           | ✓   |
| success-text on white / on success-bg                       | 5.4:1 / 4.9:1   | ✓   |
| warning-text on warning-bg                                  | 4.8:1           | ✓   |
| danger-text on white / on danger-bg                         | 6.6:1 / 5.6:1   | ✓   |
| info-text on info-bg                                        | 6.1:1           | ✓   |
| **Dark:** text `#F5F6FA` on page `#0F0F16` / card `#1A1A24` | 17.7:1 / 16.0:1 | ✓   |
| **Dark:** secondary `#A9AEBE` on card                       | 7.8:1           | ✓   |
| **Dark:** link `#8B93EC` on card                            | 5.2:1           | ✓   |
| **Dark:** success `#4ADE80` / danger `#F98A80` on card      | 9.9:1 / 7.4:1   | ✓   |

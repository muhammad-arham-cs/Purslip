---
name: Purslip
description: Private personal finance ledger — ink-navy leather, brass coin accents, porcelain slips, and tabular figures.
colors:
  primary: "#e9b949"
  primary-deep: "#f3c963"
  primary-ink: "#0b1426"
  ink-navy: "#0a1324"
  navy-elevated: "#0f1b31"
  navy-surface: "#12203a"
  navy-strong: "#182a4a"
  porcelain: "#eef1f6"
  porcelain-ink: "#0c172c"
  foreground: "#eef2f9"
  muted: "#9fb1cd"
  gain-mint: "#2cc996"
  loss-coral: "#f06478"
  warning-amber: "#f0b23a"
typography:
  display:
    fontFamily: "'Bricolage Grotesque', system-ui, -apple-system, sans-serif"
    fontSize: "4.15rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "'Bricolage Grotesque', system-ui, -apple-system, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.14
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Bricolage Grotesque', system-ui, -apple-system, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "'Onest', system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Onest', system-ui, -apple-system, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  sm: "10px"
  md: "18px"
  lg: "22px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "36px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.navy-strong}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  slip-card:
    backgroundColor: "{colors.navy-surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "22px"
---

# Design System: Purslip

## Overview

**Creative North Star: "Inside the Purse"**

Purslip is a private household ledger built around the tactile anatomy of its brand mark: a deep ink-navy leather wallet (`#0a1324`), crisp porcelain paper slips (`#eef1f6`), and a stack of warm brass coins (`#e9b949`). On the public landing page, the visitor sees inside the purse in 3D space while a real sign-in slip sits immediately at hand. Inside the signed-in app, the metaphor settles into calm, high-contrast operational precision: a persistent left ledger rail on desktop, a fast drawer on mobile, and tabular figures across every balance, budget, goal, and debt.

The interface supports three complete themes — Dark (default ink-navy leather), Light (porcelain ground with white slips and deep navy actions), and Night (low-glare obsidian for late-night phone entry) — while keeping semantic gain/loss signals unmistakable.

**Key Characteristics:**
- Tactile material contrast between dark navy leather grounds and high-contrast porcelain/slate slips.
- Brass coin accent reserved strictly for the primary action and active wayfinding.
- Self-hosted Bricolage Grotesque for expressive headings paired with Onest tabular numerals (`tabular-nums`) for every currency amount.
- Zero horizontal scroll across all viewports, with responsive drawer navigation and contained table scrollers.

## Colors

The palette draws directly from the Purslip wallet emblem: deep navy leather, warm minted brass, crisp porcelain paper, and clear mint/coral financial signals.

### Primary
- **Minted Brass** (`#e9b949`): Carries the primary call-to-action button, active navigation highlight, focus rings, and the 3D coin stack. Paired with deep navy ink (`#0b1426`) for high contrast.

### Secondary
- **Ledger Mint** (`#2cc996`): Positive cashflow, income totals, achieved savings goals, and balanced split allocations.
- **Deficit Coral** (`#f06478`): Expenses, over-budget progress bars, negative balances, and destructive confirmation actions.

### Neutral
- **Ink-Navy Leather** (`#0a1324`): Default application ground in Dark mode (`#050811` in Night mode).
- **Elevated Navy** (`#0f1b31`): Header bar, sidebar rail, and footer ground.
- **Slate Slip Surface** (`#12203a`): Standard card and table container surface (`#ffffff` in Light mode).
- **Porcelain Slip** (`#eef1f6`): High-contrast featured ledger slip surface and Light mode ground.
- **Ledger Ink** (`#eef2f9`) & **Muted Slate** (`#9fb1cd`): Primary and secondary text tinted from the navy hue, never pure gray.

### Named Rules
**The Brass Coin Rule.** Minted Brass (`#e9b949`) is reserved for the single most important action in a view and active wayfinding. Never use it for decorative backgrounds or non-interactive badges.

**The Tinted Secondary Rule.** Secondary and muted text is always tinted from the surface hue (`#9fb1cd` on dark navy, `#465773` on light porcelain) and maintains at least 4.5:1 contrast.

## Typography

**Display Font:** Bricolage Grotesque (variable 500–800, self-hosted WOFF2)
**Body & Numeric Font:** Onest (variable 400–700, self-hosted WOFF2)

**Character:** Bricolage Grotesque gives headings and hero totals architectural warmth and authority, while Onest keeps labels, tables, forms, and currency figures crisp and scannable with `font-variant-numeric: tabular-nums`.

### Hierarchy
- **Display** (700, `clamp(2.25rem, 4.6vw, 4.15rem)`, line-height `1.05`, tracking `-0.035em`): Landing hero headline and primary net worth figure.
- **Headline** (700, `clamp(1.85rem, 3.2vw, 2.65rem)`, line-height `1.16`, tracking `-0.025em`): Page titles (`h1`).
- **Title** (650, `clamp(1.2rem, 2vw, 1.45rem)`, line-height `1.2`): Section headings (`h2`) and slip headers.
- **Body** (400, `1rem`, line-height `1.55`, max measure `70ch`): Explanatory copy, ledger rows, and settings descriptions.
- **Label** (600, `0.86rem`, line-height `1.25`): Form field labels, table column headers, and status pills.

### Named Rules
**The Tabular Ledger Rule.** Every currency amount, date, percentage, and table cell uses `font-variant-numeric: tabular-nums` so columns of figures align vertically.

**The No-Eyebrow Rule.** Headings never carry an uppercase kicker or eyebrow label above them; the heading itself states the subject.

## Layout

Signed-in pages use a persistent 248px left navigation rail on viewports `961px` and wider, paired with a centered content container (`max-width: 1180px`) and fluid padding (`clamp(20px, 4vw, 40px)`). Below `961px`, both public and signed-in headers collapse into a sticky top bar with a theme toggle and a slide-down drawer (`#appNav`) backed by a blurred scrim (`#navBackdrop`). Multi-column grids (`.grid--2`, `.grid--3`, `.dashboard-command-grid`) collapse cleanly to single-column stacks on mobile (`640px`), and wide data tables scroll horizontally inside `.table-wrap` without ever causing page-level horizontal scroll.

## Elevation & Depth

Depth combines tonal surface steps (`--color-bg` → `--color-bg-elevated` → `--color-surface` → `--color-surface-strong`) with soft offset ambient shadows and 1px hairline borders.

### Shadow Vocabulary
- **Card Rest** (`0 14px 34px rgba(3, 8, 18, 0.36)` in Dark, `0 12px 28px rgba(13, 24, 43, 0.07)` in Light): Standard slip and card elevation.
- **Drawer & Popover** (`0 22px 48px rgba(3, 8, 18, 0.5)`): Mobile navigation drawer and elevated overlays.

## Shapes

Slips and cards use a generous `18px` corner radius (`--radius`), hero stages use `22px` (`--radius-lg`), and interactive controls (buttons, inputs, selects, nav items) use `10px` (`--radius-sm`). Status pills and progress bars use full capsule rounding (`999px`).

## Components

### Buttons
- **Shape:** Rounded rectangle (`10px` radius) with inline SVG icon support and `8px` internal gap.
- **Primary:** Minted Brass (`#e9b949`) background with deep navy ink (`#0b1426`) in Dark/Night; Deep Navy (`#0e2547`) with white ink in Light mode.
- **Hover / Focus:** `translateY(-1px)` lift on hover, `2px` solid `--color-primary` focus ring with `2px` offset.
- **Secondary / Ghost / Danger:** Surface-strong neutral button, transparent ghost button with hairline border, and tinted coral danger button for destructive actions.

### Cards / Containers
- **Corner Style:** `18px` radius (`.card`, `.slip-card`).
- **Background:** `--color-surface` default, `.slip-card--porcelain` for high-contrast ledger specimens, and `.slip-card--navy` for the Net Worth command card.
- **Border:** `1px solid var(--color-border)` all around; never thick left/right accent borders.

### Inputs / Fields
- **Style:** `10px` radius, `10px 13px` padding, recessed `--color-surface-input` fill, `1px solid var(--color-border)`.
- **Focus:** Border shifts to `--color-primary` with a soft `3px` brass halo (`rgba(233, 185, 73, 0.18)`).

### Navigation
- **Style:** Persistent left sidebar with 1.75px-stroke SVG icons on desktop (`>=961px`) for signed-in users; sticky top header on public pages; full-width accessible mobile drawer with backdrop on screens `<=960px`.

## Do's and Don'ts

### Do:
- **Do** use `font-variant-numeric: tabular-nums` (`.num`) on every balance, transaction amount, budget figure, and date.
- **Do** use the shared SVG icon sprite (`views/partials/icons.ejs`) for all navigation, action, and status icons.
- **Do** keep all scripts external (`script-src 'self'`) and pass chart data via `<script type="application/json">`.

### Don't:
- **Don't** place uppercase eyebrow or kicker labels above headings.
- **Don't** use Unicode symbols or emoji in place of drawn SVG icons.
- **Don't** use thick colored `border-left` or `border-right` stripes on cards or alerts.

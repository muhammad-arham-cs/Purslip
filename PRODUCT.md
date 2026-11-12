# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner and their family and friends. Each person keeps a private Purslip
account and uses it daily to log spending, check balances, and see where the
month stands. Use is split between phones (quick entry on the go, often at
night) and laptops (imports, reports, monthly review).

## Product Purpose

Purslip is a personal finance manager: accounts, transactions (with category
splits and transfers), categories, CSV import/export, monthly budgets,
recurring bills, reports (spending by category, trends, net worth history),
savings goals, and debts (money lent and borrowed). Success is that a user
always knows their real balance and where their money went, without effort.

## Positioning

A private, ad-free daily ledger for a small circle of trusted people. Not a
bank, not a marketplace, no AI features. Their data, their control.

## Operating Context

- Pakistan-first: PKR is the default display currency; multi-currency accounts
  with manual exchange rates are supported. Signup collects country, phone and
  CNIC.
- English and Urdu interface options.
- Session-based login with a 15 minute idle timeout.
- Deployed on Prisma Cloud (compute service) from the GitHub `main` branch.

## Capabilities and Constraints

- Node.js + Express, server-rendered EJS, vanilla JS, Chart.js, PostgreSQL.
- Strict Content-Security-Policy: `script-src 'self'` and `script-src-attr
  'none'`. No inline scripts or inline event handlers; every script is a
  same-origin file. Styles may be inline.
- Light, Dark and Night themes are user-selectable and must all be kept.
- 3D (Three.js / WebGL) is used on the public landing page only; app pages use
  CSS motion so daily use stays fast on phones.
- Every page must work on mobile with no horizontal page scroll.

## Brand Commitments

- Name: Purslip. Logo: a navy wallet with two slips and a coin stack forming a
  "P" (`public/images/purslip-logo.png`).
- Tagline in use: "your data, your control."
- Design references supplied by the owner (Dribbble): premium personal-finance
  dashboards and a finance landing page (Nivo, Aurelia, and others).

## Evidence on Hand

- No testimonials, user counts, press, pricing or security certifications
  exist. Do not invent any.
- Public contact phone and support email: to be supplied by the owner
  (configured via `SUPPORT_PHONE` / `SUPPORT_EMAIL`).

## Product Principles

1. Truth over decoration: every number shown is the user's real number.
2. Daily entry must be fast on a phone, one hand, low light.
3. Privacy is felt: nothing public, nothing shared, easy export.
4. Calm, not gamified: no streaks, badges or nagging.


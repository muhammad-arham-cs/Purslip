---
version: 1
slug: "views-home-ejs"
primary_target: "views/home.ejs"
related_targets: ["views/dashboard.ejs","views/partials/header.ejs"]
---

Scope: public landing page (`/`) plus the shared app shell that every signed-in page inherits. Landing mode: Persuade. App pages: Operate.
Audience: the owner, family and friends with private accounts. Job: sign in fast, or understand what Purslip holds before creating an account.
Constraints: CSP script-src 'self' (no inline scripts or handlers); Three.js only on the landing; three themes kept; no invented claims; mobile first with no horizontal scroll.
Build path: code-led (direction pinned by owner-supplied Dribbble references; no comp round).

## Direction contract

THESIS: Purslip is a purse you can see into. The landing shows the purse's real objects (slips, cards, a coin stack) floating in lit 3D space around a working sign-in form. It refuses the category default: a headline over a phone mockup with a row of feature cards.

OWN-WORLD: Ink-navy leather ground (#0A1324) taken from the logo, brass (#E9B949) for coins and the one primary action, porcelain slips (#EEF1F6) as the light surface, mint for gains and coral for losses. Bricolage Grotesque for display and Onest for UI, with tabular figures. 20px-radius slips with hairline borders and soft offset shadows. Light theme turns the ground porcelain and the slips white; Night goes to near-black with dimmed brass.

STORY: A family member arrives, recognises the household money app, and signs in from the hero, or scrolls through "inside the purse" to see what each slip does, then creates an account.

FIRST VIEWPORT: A full-bleed WebGL scene fills the right 60%: three slips fan out above a brass coin stack, drifting slowly and tilting toward the pointer. On the left sits a ~4.5rem headline, a one-line lead, and an inline sign-in slip (email, password, brass "Log in") with "Create an account" under it. The top bar holds the logo (links home), Log in, Sign up and the theme switch. On mobile the scene sits behind the headline at reduced opacity, with the form below.

FORM: Owner-pinned direction (premium finance dashboard and landing references); seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

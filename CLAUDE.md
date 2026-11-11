# Purslip

Personal finance management web app — real daily-use tool, not a demo. Node.js +
Express + PostgreSQL + server-rendered EJS + Chart.js + vanilla JS. Session-based
auth. Deployed to Render. No AI features anywhere in this project.

This file is the build record. Each phase is checked off only once it's built,
tested, and working. If you're picking this up fresh: read the phase log below,
don't redo anything already checked off, and resume from the first unchecked
phase.

## Working agreement

- Build phases in order, automatically, without stopping for approval between
  phases.
- After each phase: write and run real tests (not just manual spot checks),
  fix failures, update this file's phase log, give a short summary.
- Only stop mid-phase for something only the project owner can provide
  (deployment credentials, a real bank CSV sample, etc).

## Local development

Requires Docker (for Postgres) and Node 18+.

```
docker compose up -d        # starts Postgres on localhost:5433
cp .env.example .env        # then edit SESSION_SECRET at minimum
npm install
npm run db:migrate          # applies db/schema.sql to the dev database
npm run dev                  # nodemon, http://localhost:3000
npm test                     # Jest + Supertest; spins up/wipes purslip_test DB
```

`docker-compose.yml` maps Postgres to host port **5433**, not 5432, to avoid
clashing with any other local Postgres instance already using the default port.

Tests run against a separate `purslip_test` database on the same container
(`tests/globalSetup.js` creates it, drops/recreates the `public` schema, and
re-applies `db/schema.sql` fresh on every test run — so tests never depend on
or pollute the dev database).

`npm run db:migrate` applies `db/schema.sql` directly and is **not** idempotent
— rerunning it against a database that already has the tables will error on
the `CREATE TABLE` statements. That's fine for the initial setup. Once the
schema needs to change post-launch, add numbered migration files instead of
editing `schema.sql` in place (not needed yet — no schema changes have shipped
against a populated database so far).

## Key design decisions

- **Transaction splits are always used, never optional.** Transactions do not
  have a `category_id` column. Every transaction has one or more rows in
  `transaction_splits`; a normal, non-split transaction is just one split row
  covering the full amount. This keeps split and non-split transactions on the
  same code path everywhere (entry forms, reports, budgets) instead of
  branching logic on "is this split or not."
- **Transfers are two linked transactions, not a separate table.** A transfer
  between accounts creates two rows in `transactions` (one negative on the
  source account, one positive on the destination account), both flagged
  `is_transfer = true` and sharing a `transfer_group_id`. Reports filter out
  `is_transfer = true` so transfers never inflate income/expense totals. This
  reuses all existing transaction infrastructure (editing, deleting, account
  balance updates) instead of duplicating it for transfers.
- **Category deletion defaults to blocked (`ON DELETE RESTRICT`)** on every FK
  that references `categories` (splits, budgets, recurring templates). The
  actual reassign-vs-block UX is a Phase 4 decision; the schema defaults to
  the safe option (block) until Phase 4 implements whatever reassignment flow
  is chosen, so no phase before then can silently orphan a category reference.
- **Net worth over time has no snapshot table.** It's reconstructed by
  replaying account balance deltas from `transactions` up to any given date.
  Since every transaction already carries a date and amount, a historical
  balance is always derivable from source data — a separate snapshot table
  would just be a second, potentially-stale copy of the same information.
- **`accounts.current_balance` is denormalized** (not computed on every read)
  for fast dashboard/list rendering, and is kept in sync by application code
  whenever a transaction affecting that account is created, edited, or
  deleted (built out in Phase 2/3). It is always re-derivable from
  `opening_balance` + the sum of that account's transactions, so it can be
  recomputed/repaired if it ever drifts.
- **CSV import dedupe** uses a `dedupe_hash`-style fingerprint
  (`import_hash` column, hash of account + date + amount + description),
  enforced with a unique index on `(account_id, import_hash)` where non-null.
  Actual hashing/matching logic lands in Phase 5.
- **Recurring generation is idempotent** via
  `recurring_transaction_occurrences`, which uniquely links one generated
  transaction to one `(recurring_transaction_id, occurrence_date)` pair —
  the scheduler in Phase 7 can run repeatedly/late without double-generating.

## Tech stack

- Runtime: Node.js 18+, Express 4
- DB: PostgreSQL 16, raw `pg` driver (no ORM) — schema in `db/schema.sql`
- Views: EJS, partials in `views/partials/`
- Charts: Chart.js (added when Phase 8 needs it)
- Sessions: `express-session` + `connect-pg-simple` (session table lives in
  the same Postgres database)
- Auth: bcrypt
- Styling: hand-written mobile-first CSS (`public/css/style.css`), CSS
  variables + Grid/Flexbox, no framework
- Tests: Jest + Supertest, against a real disposable Postgres test database
- Hosting: Render (`render.yaml` blueprint — web service + managed Postgres)

## Phase log

### Phase 0 — Project setup ✅

Built:
- Express skeleton (`server.js`) with helmet, morgan, session middleware
  (`connect-pg-simple`), flash messages, 404/500 handlers, `/healthz`.
- Full database schema (`db/schema.sql`) covering every entity in the entire
  feature set up front: `users`, `accounts`, `categories`, `transactions`,
  `transaction_splits`, `budgets`, `recurring_transactions`,
  `recurring_transaction_occurrences`, `goals`, `import_mappings`, plus the
  `session` table connect-pg-simple expects. See "Key design decisions" above
  for the non-obvious calls.
- `config/db.js` — a single shared `pg` `Pool`.
- Base responsive layout: `views/partials/{head,header,footer}.ejs`,
  `public/css/style.css` (mobile-first, hamburger nav under 768px, CSS
  variables with a dark-mode media query), `public/js/main.js` (nav toggle).
- `docker-compose.yml` for a local Postgres dev instance on port 5433.
- `scripts/migrate.js` to apply `db/schema.sql`.
- Jest set up against a real, disposable `purslip_test` Postgres database
  (`tests/globalSetup.js` + `tests/setupEnv.js`), with tests covering the
  `/healthz` and `/` routes, 404 handling, that every core table exists,
  the case-insensitive unique email constraint, cascade-delete on
  transaction → splits, and restrict-delete on an in-use category.
- `render.yaml` Render Blueprint (web service + managed Postgres, health
  check on `/healthz`).
- `.env.example`, `.gitignore`.

Tests: `npm test` — all passing (see test run in this phase's commit).

Still open at the end of this phase: **actual deployment to Render**. Asked
the project owner (2026-07-31): they'll create the GitHub repo themselves and
still need to sign up for Render. Rather than blocking all subsequent phases
on that external setup, deployment is tracked as a standing follow-up — once
a GitHub repo URL is provided, push this repo to it; once Render is signed
up, walk through connecting the `render.yaml` Blueprint (or use a Render API
key if provided instead of the dashboard). `render.yaml` is already committed
and ready for that moment.

### Phase 1 — Authentication ✅

Built:
- `models/users.js` — bcrypt hashing (12 rounds), `findByEmail`/`findById`,
  per-account lockout tracking (`failed_login_attempts`, `locked_until` —
  columns already existed in the Phase 0 schema), password reset token
  issuance/lookup/consumption, password update.
- `middleware/auth.js` — `requireAuth` (redirects to `/auth/login` with a
  flash message) and `redirectIfAuthenticated` (bounces logged-in users away
  from signup/login/forgot/reset pages).
- `routes/auth.js` — signup, login, logout (`DELETE /auth/logout`, matching
  the method-override pattern already in the nav form), forgot-password,
  reset-password/:token. Validation via `express-validator`.
- `lib/mailer.js` — sends the password-reset email via SMTP
  (`nodemailer`) when `SMTP_*` env vars are set; otherwise logs the reset URL
  to the server console. This is the "documented interim approach" the
  original spec anticipated — real email delivery needs SMTP/email-API
  credentials from the project owner, tracked as a follow-up alongside the
  Render deployment, not a blocker.
- `views/auth/{signup,login,forgot-password,reset-password}.ejs` +
  `views/partials/form-errors.ejs`, `views/dashboard-placeholder.ejs` (a
  stand-in for the real Phase 8 dashboard, just enough to prove
  `requireAuth` and sessions work end-to-end).
- `GET /dashboard` mounted in `server.js` behind `requireAuth`, and
  `app.use('/auth', require('./routes/auth'))` mounted.

Key design decisions:
- **Two layers of brute-force defense.** `express-rate-limit` caps login
  POSTs per-IP (20 / 15 min) as a first line regardless of which account is
  targeted; `models/users.js` separately locks an *individual account* for
  15 minutes after 5 failed attempts even from different IPs. Neither alone
  covers both a distributed attacker and a focused one against a single
  account.
- **Session fixation prevention:** both signup and login call
  `req.session.regenerate()` before setting `req.session.user`, so a
  pre-auth session ID is never reused post-auth.
- **Login and forgot-password give identical, generic responses** whether or
  not the email/account exists ("Invalid email or password" /
  "If an account with that email exists…") to avoid leaking which emails are
  registered.
- **Password reset tokens** are single-use (cleared on password update),
  expire after 1 hour (`reset_token_expires`), and are looked up with an
  `expires > now()` condition directly in SQL rather than checked in
  application code after fetch, so an expired token can never be treated as
  valid by accident.
- Dependency versions bumped past what I initially picked: `bcrypt` 5→6,
  `ejs` 3→6, `nodemailer` 6→9 — `npm audit` flagged a critical `tar` RCE and
  several high-severity issues transitively pulled in by the old versions.
  All three majors were drop-in for the APIs actually used here (hash/compare,
  render/include, createTransport/sendMail); re-ran the full test suite after
  upgrading to confirm nothing broke.
- `npm audit` still reports ~19 high-severity findings, all inside Jest's own
  toolchain (ReDoS in `brace-expansion`/`minimatch`/`glob`, ultimately from
  `glob`'s own transitive deps). Jest is a devDependency only — it's never
  installed or run in production — and npm's suggested "fix" is downgrading
  to Jest 25 (a multi-year-old unmaintained release), which would be a
  regression, not a fix. Left on latest Jest; revisit if a patched release
  ships.

Tests (`tests/auth.test.js`, 14 cases): signup success + duplicate-email +
mismatched-confirmation + too-short-password rejections; anonymous dashboard
redirect; wrong password and never-registered email both return the same
generic error; successful login starts a working session; account lockout
after `MAX_FAILED_ATTEMPTS`; logout destroys the session; a session whose row
is forced-expired in the `session` table (simulating real expiry) is treated
as logged out; full reset-token round trip (old password stops working, new
one works); expired reset token is rejected; forgot-password never reveals
whether the email exists. All passing, run alongside Phase 0's tests (21
total). Also manually smoke-tested signup → dashboard and the
forgot-password → console-logged reset link path against a running dev
server.

### Phase 2 — Accounts ✅

Built:
- `models/accounts.js` — CRUD scoped by `user_id` on every query (never trust
  an `:id` param alone), plus two balance-tracking primitives Phase 3 will
  call: `adjustBalance(accountId, delta)` for incremental updates on
  transaction create/edit/delete, and `recalculate(accountId)` to re-derive
  `current_balance` from `opening_balance + sum(transactions.amount)` if it
  ever drifts (matches the Phase 0 design note that the denormalized balance
  is always repairable from source data).
- `routes/accounts.js` — list (with an archived-accounts toggle), new, edit,
  delete, reactivate; all behind `requireAuth`, all mounted at `/accounts`.
- `views/accounts/{index,new,edit}.ejs` — responsive card grid
  (`grid grid--3`, collapses to 1 column below 640px), currency-formatted
  balances via `toLocaleString`.

Key design decisions:
- **Editing `opening_balance` shifts `current_balance` by the delta**, not by
  overwriting it — `models/accounts.js:update()` computes
  `newOpening - oldOpening` and adds that to the existing `current_balance`.
  This matters once Phase 3 transactions exist: if editing the opening
  balance just overwrote `current_balance`, it would silently erase any
  balance movement already recorded from real transactions.
- **Deleting an account with no transaction history hard-deletes it;
  deleting one that has transactions archives it instead** (`is_active =
  false`) rather than cascading the delete through real financial history,
  or blocking the user from removing an account they created by mistake.
  Archived accounts stay visible via `?archived=1` and can be reactivated.
- Balance correctness is verified two ways: a route-level test that account
  creation sets `current_balance = opening_balance`, and a model-level test
  that simulates a transaction-driven `adjustBalance` call *before* an
  opening-balance edit to prove the edit preserves that movement (delta, not
  overwrite) — this exercises the mechanism Phase 3 will depend on before
  Phase 3 exists.

Tests (`tests/accounts.test.js`, 9 cases): anonymous redirect; create sets
correct initial balance; invalid type / missing name rejected; opening-balance
edit preserves prior `adjustBalance` movement via delta; `recalculate()`
repairs a deliberately-corrupted balance from real transaction rows;
hard-delete when transaction-free; archive-instead-of-delete when
transactions exist; cross-user ownership isolation (view/edit/delete another
user's account all no-op instead of erroring, so no information about the
other account leaks). 30 tests total across the whole suite, all passing.
Also manually smoke-tested account creation and currency formatting against a
running dev server.

### Phase 3 — Transactions ✅

Built:
- `models/transactions.js` — create/edit/delete for regular transactions and
  transfers, list with pagination, all balance-affecting writes wrapped in a
  real Postgres transaction (`BEGIN`/`COMMIT`/`ROLLBACK` via a checked-out
  client) so a split-insert failure can never leave a transaction row without
  its splits, or a balance update applied without its transaction.
- `models/categories.js` — a **minimal** model (list/create/getById) added
  now, ahead of Phase 4, purely so split rows have something real to
  reference. See "ordering note" below.
- `routes/transactions.js` + `routes/categories.js` (a `POST /` quick-create
  and `GET /new` form only, for the same reason).
- `views/transactions/{index,new,edit,transfer-form}.ejs`,
  `_transaction-form-body.ejs` (shared by new/edit),
  `public/js/transaction-form.js` for the dynamic split-row UI: a checkbox
  toggles split mode, a template element is cloned for each added row, a live
  "remaining to allocate" indicator sums client-side (server-side validation
  is the actual source of truth), and unchecking collapses back to one
  read-only row mirroring the total.

Ordering note — **Phase 3 needed categories before Phase 4 built them**:
the original phase plan has transactions (with category splits) before full
category management. Rather than reorder the whole plan, Phase 3 adds just
enough of `models/categories.js` (list/create) for split dropdowns and an
inline "add a category" page to work; Phase 4 builds the full management UI
(subcategories, archiving, deletion policy) on the same table and model,
extending rather than replacing this.

Key design decisions:
- **All splits sum-validated in integer cents, not floats** — `assertSplits
  SumToAmount` in `models/transactions.js` converts every amount with
  `Math.round(amount * 100)` before comparing, so e.g. three -3.33 splits
  against a -10.00 total are correctly rejected (they sum to -9.99) instead
  of slipping through on floating-point noise.
- **The UI amount is always a positive number + an Expense/Income selector**;
  the sign is applied once, in the route layer, when building the signed
  amount and signed split amounts. The model layer is sign-agnostic — it just
  enforces that splits sum to whatever signed total it's given. Keeps users
  from ever having to type a negative number.
- **Editing a transaction reverses the old balance effect and applies the
  new one inside the same DB transaction**, including when the account
  itself changes — `update()` subtracts the old `(account_id, amount)` pair
  and adds the new one, so an edit that moves a transaction to a different
  account correctly debits the old account and credits the new one instead
  of just overwriting one account's balance.
- **Transfers stayed exactly as designed in Phase 0**: two rows sharing
  `transfer_group_id`, each with a single split whose `category_id` is
  `NULL` (satisfies the "every transaction has ≥1 split" invariant without
  needing a real category). Editing a transfer deletes both old legs and
  reinserts two new ones under the same `transfer_group_id`, rather than
  trying to patch two linked rows in place — simpler to get right, and nothing
  else references a transfer leg's transaction id.
- **Deleting a transfer requires only one leg's id** — `remove()` detects
  `is_transfer` and reverses/deletes both legs by `transfer_group_id`
  automatically, so the DELETE route just needs to find any one leg first.

Tests (`tests/transactions.test.js`, 15 cases, plus reuse of earlier
suites): split-sum rejection (including the cents-rounding case), valid
multi-category split accepted and reflected in the account balance;
balance correctness across create → edit → delete and across an edit that
moves a transaction to a different account; transfer creation moves balance
between accounts with both legs flagged `is_transfer`; a raw `is_transfer =
false` sum excludes the transfer (the exact invariant Phase 8's reports will
depend on); transfer edit and delete both correctly reverse old legs;
pagination across 30 rows; and three HTTP-level route tests (simple
transaction creation, a rejected unbalanced split, and a transfer) to prove
the wiring above the model layer. 43 tests total, all passing.

Also manually verified in a live browser session (not just supertest): the
split-row JS end-to-end — toggling split mode, adding/removing rows, the
live remaining-allocation indicator, collapsing back to a single row — via
direct DOM/event inspection, then submitted a real two-category split
transaction through the actual rendered form and confirmed it landed
correctly in the transaction list ("Split (2)", correct signed total) and
that the account balance updated ($1000 → $900). The edit form's pre-fill of
split mode and per-row amounts was also verified this way. Window-resize–based
mobile-viewport testing was inconclusive in this browser automation
environment (the tool's resize didn't propagate to `window.innerWidth`), so a
full mobile visual pass on the responsive nav/layout is deferred to Phase 11's
planned mobile QA pass rather than assumed working from this session alone.

### Phase 4 — Categories ✅

Built on top of the minimal `models/categories.js` from Phase 3:
- `update()`, `setArchived()`, `usage()`, and a fully reworked `remove()`.
- `routes/categories.js` — full CRUD (`/`, `/new`, `/:id/edit`, `PUT /:id`),
  archive/unarchive, and a delete confirmation flow (`GET /:id/delete`,
  `DELETE /:id`).
- `views/categories/{index,new,edit,delete}.ejs` — index groups categories
  into parent + nested subcategory list; delete page branches into three
  states (blocked / needs-reassignment / safe-to-delete, see policy below).
- Added a "Categories" link to the main nav.

Key design decision — **category deletion policy** (the thing this phase was
explicitly asked to reason about):
- **Blocked outright** if the category has subcategories, budgets, or
  recurring templates referencing it. These aren't auto-resolved because
  merging budget amounts or recurring schedules across categories is
  ambiguous — the user needs to go decide that on the Budgets/Recurring
  screens themselves. The delete page lists exactly which of these are
  blocking, instead of surfacing a raw DB constraint error.
- **Requires an explicit reassignment choice** if only `transaction_splits`
  reference it — the delete page shows how many transactions use it and a
  dropdown of same-kind categories (or "Uncategorized"), and only deletes
  after that choice is submitted. `models/categories.js:remove()` reflects
  this in its return shape: `{ blocked }` vs `{ needsReassignment }` vs
  `{ deleted }`, so the model is explicit about which case fired rather than
  the route having to re-derive it.
- **Deletes outright** if nothing references it at all.
- **Archiving is offered everywhere as the non-destructive alternative** —
  same pattern as Phase 2's accounts (`is_archived`, hidden from active lists,
  reversible), for a user who just wants a category to stop showing up
  without dealing with any of the above.
- **Subcategories are exactly one level deep, and inherit their parent's
  kind.** `resolveParent()` rejects nesting under something that already has
  a parent, `update()` rejects promoting a category with children into
  someone else's subcategory, and creating/editing a subcategory silently
  overrides `kind` to match the parent rather than letting income and
  expense mix within one branch of the tree.

Tests (`tests/categories.test.js`, 12 cases): subcategory kind inheritance;
two-levels-deep nesting rejected; self-parenting rejected; promoting a
category-with-children into a subcategory rejected; clean delete; blocked
delete (subcategory present, and separately budget present); the full
reassign-then-delete round trip (transaction split moves to the new
category); reassignment to "Uncategorized" (`null`); archive hides from the
default list without altering data; two HTTP route tests (create parent +
child and see them listed grouped; full delete-confirmation-page →
reassign → delete flow via HTTP). 55 tests total, all passing.

Also manually verified the full reassignment flow against a running dev
server via curl: created a parent/child category pair, recorded a real
transaction against the subcategory, confirmed the delete page correctly
demanded a reassignment choice, reassigned to "Uncategorized," and confirmed
the transaction list then showed that transaction as Uncategorized instead of
erroring or silently losing the categorization.

### Phase 5 — CSV import ✅

Built:
- `lib/csvImport.js` — pure parsing/normalization functions, no DB or HTTP:
  `parseCsvBuffer` (via `csv-parse/sync`, header row + data rows, capped at
  `MAX_ROWS = 5000` with a friendly error above that), `parseAmount` (handles
  `$`, thousands commas, and `(1,234.56)`-style parenthesized negatives),
  `parseDate` against an explicit format the user picks (`YYYY-MM-DD`,
  `MM/DD/YYYY`, `DD/MM/YYYY`, `MM-DD-YYYY` — no guessing, since MDY vs DMY is
  genuinely ambiguous from the data alone), `applyMapping` (turns raw rows +
  a column mapping into normalized `{date, amount, payee, note, importHash}`
  rows), and `computeImportHash` (sha256 of account+date+amount+description).
- `models/importMappings.js` — save/reuse column mappings per named source
  (`ON CONFLICT (user_id, source_name) DO UPDATE`, matching the Phase 0
  schema's unique constraint).
- `models/transactions.js` gained `findExistingImportHashes()` (pre-insert
  duplicate check for the review page) and `bulkImport()` (inserts each row
  with `ON CONFLICT (account_id, import_hash) ... DO NOTHING`, then adjusts
  the account balance once by the sum of rows actually inserted).
- `routes/import.js` — a 3-step wizard (upload → map columns → review →
  confirm) using `multer` (memory storage, 5&nbsp;MB limit, rejects anything
  not named `*.csv`) for the file and `req.session.importWizard` to carry
  parsed state between steps.
- `views/import/{upload,mapping,review}.ejs` + `public/js/import-mapping.js`
  (toggles single-amount vs. debit/credit fields).

Key design decisions:
- **The review/confirm step never trusts resubmitted financial data from the
  client.** The review page's checkboxes only carry row *indexes*; `POST
  /import/confirm` looks up the actual date/amount/payee for each selected
  index from `req.session.importWizard.mappedRows` — the parsed data this
  server already computed — rather than re-reading amounts/dates from hidden
  form fields an attacker could tamper with. This is the concrete
  application of "never trust uploaded file content": the file is parsed
  once, server-side, and every step after that operates on the trusted
  parsed copy, not on anything the browser sends back.
- **Duplicate detection is two-layered**, matching the Phase 0 schema
  decision: the review page proactively flags likely duplicates (by
  `import_hash` lookup) and leaves them unchecked by default, but even a
  duplicate the user selects anyway can't create a second row — the DB's
  unique `(account_id, import_hash)` index plus `ON CONFLICT DO NOTHING` in
  `bulkImport()` is the actual backstop.
- **Date format is explicit, never auto-detected.** `03/04/2026` is a valid
  date under both MM/DD and DD/MM conventions with different real meanings;
  guessing would silently corrupt dates for whichever convention wasn't
  guessed. The mapping step shows a live preview of the raw file so the user
  can tell which convention their export uses.
- Imported transactions land as simple, single-split, **uncategorized**
  transactions — CSV exports don't carry category information, so recategorizing
  is left to the existing transaction-edit flow (Phase 3) rather than
  guessing categories from payee text.

Tests: `tests/csvImport.test.js` (14 cases) — amount parsing edge cases
(currency symbols, commas, parenthesized negatives), all four date formats,
oversized/empty file rejection, and — the phase's explicit ask — **two
differently-shaped realistic CSV formats** (`Date,Description,Amount` in
MM/DD/YYYY with a single signed column vs. `Transaction Date,Payee,Debit,
Credit` in DD/MM/YYYY with a different column order and split debit/credit)
both parsing to identical normalized rows and the same import hash.
`tests/import.test.js` (8 cases) — the full upload→mapping→review→confirm
HTTP flow for both formats with real balance verification, duplicate
flagging on a re-import of the same file plus confirmation that force-
selecting a flagged duplicate still doesn't create a second row,
`bulkImport()` idempotency at the model layer, and upload validation
(non-CSV rejected, missing account rejected). 75 tests total, all passing.

Also manually verified against a running dev server with a real multipart
file upload via curl (not just supertest): uploaded a 2-row CSV, mapped its
columns, confirmed the review page showed both rows correctly parsed as
"New," imported them, and confirmed the resulting account balance
($500 → $454.75) and transaction list matched exactly.
### Phase 6 — Budgets ✅

Built:
- `models/budgets.js` — `upsertBudget` (one row per category+month, matching
  the schema's `UNIQUE (category_id, month)`), `spentForCategoryMonth`
  (sums `transaction_splits` for that category within the month's date
  range, excluding transfers), `availableForMonth` (the rollover
  computation — see below), `listForMonth` (assembles the whole budgets
  page: every non-archived expense category with its budget, spend,
  available, remaining, and over-budget flag for a given month).
- `routes/budgets.js` — `GET /` (month navigation via `?month=YYYY-MM`,
  defaulting to the current month), `PUT /:categoryId` to set/update that
  category's amount for a given month.
- `views/budgets/index.ejs` — a card per category with a progress bar
  (`public/css/style.css` gained `.progress-bar`/`.progress-bar__fill`,
  turning red via `.is-over` past 100%) and an inline amount input to set the
  budget right there.

Key design decision — **rollover carry compounds across all prior months
with a budget, not just one month back**: `availableForMonth()` finds the
earliest month this category has ever had a budget row, then walks forward
month by month accumulating `carry = (budget + carry_in) - spent`, so N
consecutive months of underspending compound correctly instead of a naive
"look at last month only" implementation losing carry after two months.
Carry can go negative (an overspent month reduces the next month's
available), matching standard envelope-budgeting rollover behavior rather
than clamping overspend at zero. The walk is bounded by real budgeting
history (how many months this category has ever had a budget), not
unbounded recursion.

**Bug found and fixed during this phase** (via the rollover-across-months
test, not observed any other way): Postgres `DATE` columns come back from
`node-pg` as JS `Date` objects constructed at *local* midnight. Several
places in the app (this phase's rollover loop, and — found by grepping for
the same pattern — the transaction edit form, the transfer edit form, and
the transaction list view from Phase 3) were converting those back to a
plain date string via `new Date(x).toISOString().slice(0, 10)`, which
silently shifts the date across the UTC day boundary depending on the
server's timezone offset (confirmed locally: `2026-01-01` round-tripped to
`2025-12-31`). Fixed at the root in `config/db.js` with a single global type
parser override — `types.setTypeParser(types.builtins.DATE, v => v)` — so
every `DATE` column across the entire app now comes back as the exact
`'YYYY-MM-DD'` string Postgres stored, and simplified every affected call
site to use that string directly instead of round-tripping through `Date`.
Re-verified manually against a running dev server (a transaction dated
2026-01-01 shows as 2026-01-01 everywhere, including the edit form) in
addition to the test suite.

Tests (`tests/budgets.test.js`, 9 cases): month-scoping of spend (a
transaction just outside the month boundary doesn't count), transfers
excluded from spend; rollover off — unused budget from the prior month is
ignored, a month with no budget set has zero available regardless of
history; rollover on — single-month carry across the boundary, multi-month
compounding, and a deficit (overspend) carrying forward; `listForMonth`'s
over-budget flag and remaining calculation; one HTTP route test setting a
budget and confirming it renders back correctly. 84 tests total, all
passing. Also manually verified the progress bar and inline budget-setting
form against a running dev server.
### Phase 7 — Recurring transactions + bills ✅

Built:
- `lib/recurringSchedule.js` — pure date-string arithmetic, no DB: `computeNextDate`
  (daily/weekly/biweekly/custom_days as fixed day-counts; monthly/yearly via
  `addMonthsClamped`, which clamps day-of-month to the target month's last
  day — Jan 31 + 1 month → Feb 28/29, never rolls over to March) and
  `monthlyEquivalent` (converts any frequency to an average monthly figure
  using real average month/week lengths, for the subscription tracker).
- `models/recurring.js` — CRUD for templates, `upcomingBills()`,
  `subscriptionSummary()`, and the actual scheduler logic: `generateDue()`.
- `lib/scheduler.js` — wraps `node-cron`, runs `generateDue()` once daily.
  Only started from `server.js` when `require.main === module` (the same
  guard already used for `app.listen`), so requiring `server.js` in tests
  never spins up a background timer.
- `routes/recurring.js` + `views/recurring/{index,new,edit}.ejs` — CRUD,
  pause/resume (soft — keeps the template and its history), delete (hard —
  removes the template; already-generated transactions are kept, since
  `recurring_transaction_occurrences` only cascades the link row, not the
  transaction itself). The index page doubles as the upcoming-bills widget
  and subscription tracker for now (see ordering note).

Ordering note, same pattern as Phase 3/4: the "upcoming bills dashboard
widget" belongs on the Phase 8 dashboard, which doesn't exist yet. Built the
underlying `upcomingBills()`/`subscriptionSummary()` queries now and surfaced
them on the `/recurring` page itself; Phase 8 will embed the same functions
into the real dashboard rather than duplicating the query logic.

Key design decisions:
- **Generation catches up on every missed occurrence, not just the most
  recent one.** `generateDue()` loops `while (next_run_date <= today)`,
  generating one transaction per due date and advancing `next_run_date`
  each time — so if the app (or its cron) was down for a while, all the
  missed bills show up as real transactions on their real dates instead of
  silently skipping to today.
- **Idempotency is enforced by the database, not application logic.**
  `recurring_transaction_occurrences` has `UNIQUE(recurring_transaction_id,
  occurrence_date)`; each generated transaction's occurrence row uses `ON
  CONFLICT DO NOTHING`, and if that reports no row inserted (another process
  already generated that exact date), the just-inserted transaction is
  deleted and generation stops for that template. This makes it safe to call
  `generateDue()` from both the nightly cron and, defensively, from the
  `GET /recurring` page load itself (for immediate feedback without waiting
  for the next cron tick) without ever double-generating.
- **A template deactivates itself once its schedule passes `end_date`** —
  computed once at the end of each template's processing loop, not checked
  separately, so a template with a past end date and years of un-generated
  history correctly catches up to its last valid occurrence and then goes
  inactive in one pass.
- **Deleting a template only removes the template**, not the transactions it
  already generated — matches the same reasoning as account/category
  deletion elsewhere in the app: destroying real financial history as a side
  effect of an unrelated cleanup action would be a bad default.

Tests: `tests/recurringSchedule.test.js` (9 cases) — every frequency's date
math, including month-end clamping across a leap year boundary.
`tests/recurring.test.js` (10 cases) — multi-month catch-up generation
(verifies all four missed monthly occurrences appear, in order, with the
correct total balance impact); calling `generateDue()` twice for the same
date generates nothing the second time; nothing generates before its start
date; `end_date` deactivation with the exact occurrence list stopping at the
right boundary; `custom_days` frequency; `upcomingBills` correctly excludes
income templates; `subscriptionSummary`'s monthly-equivalent math across
mixed frequencies; two HTTP route tests (create-then-catch-up-generates on
page load, and pause/resume). 101 tests total, all passing.

Also manually verified against a running dev server: created a monthly $1200
rent template starting three months in the past, loaded `/recurring`, and
confirmed three real transactions were generated (not one), the account
balance dropped by exactly $3600, "next run" showed the correct upcoming
date, and reloading the page again did not generate a fourth.
### Phase 8 — Dashboard + reports ✅

Built:
- `models/reports.js` — queries for `incomeExpenseForRange` (excluding transfers), `spendingByCategory`, `incomeByCategory`, `monthlyTrends` (last 12 months income/expense), `monthlyCategoryTrends` (stacked category spending over time), `netWorthHistory` (reconstructs monthly balance deltas from opening balances forward), `currentNetWorth`, and `transactionsForExport`.
- `routes/reports.js` — `/reports` main view (custom date range filtering, default current month) and `/reports/export` CSV export.
- `views/dashboard.ejs` — real data-driven dashboard replacing the placeholder: account balance cards, total net worth card, current month income vs expenses, category spending breakdown (Chart.js doughnut), upcoming bills widget, and quick action links.
- `views/reports/index.ejs` — interactive reports page with date-range picker, spending/income tables, Chart.js doughnut chart, monthly trends bar chart, stacked category trends chart, net worth line chart, and CSV export.
- `public/js/chart.umd.js`, `public/js/dashboard.js`, `public/js/reports.js` — Chart.js integration, theme-aware text/border color styling.

Key design decisions:
- **Net worth history is derived, not snapshotted.** As designed in Phase 0, historical net worth is reconstructed by starting from the sum of account opening balances and applying cumulative transaction deltas month by month.
- **Transfers are strictly excluded from income/expense metrics** in `incomeExpenseForRange`, `spendingByCategory`, `incomeByCategory`, and `monthlyTrends`.
- **Chart.js is self-hosted** in `public/js/chart.umd.js` to adhere to strict Content Security Policy directives (`script-src 'self'`) without requiring external CDN domains or unsafe inline script evaluations.

Tests: `tests/reports.test.js` (12 cases) — model tests for income/expense accuracy, transfer exclusion, date range scoping, category breakdown, monthly trends, net worth reconstruction, current net worth, transaction export format, and HTTP route tests for dashboard rendering, reports rendering, custom date range filtering, CSV export, and anonymous auth redirection. All passing.

### Phase 9 — Goals ✅

Built:
- `models/goals.js` — CRUD operations for savings goals linked to accounts. Computes progress dynamically based on how much the linked account balance has grown relative to the goal's `starting_balance` (`(balance - starting) / (target - starting)`), remaining amount, percentage complete, and days remaining.
- `routes/goals.js` — GET `/goals`, `/goals/new`, POST `/goals`, GET `/:id/edit`, PUT `/:id`, POST `/:id/achieve`, POST `/:id/reopen`, DELETE `/:id`.
- `views/goals/{index,new,edit}.ejs` — goal progress cards with visual progress bars, percentage indicators, target date countdowns, achieve/reopen toggles, and edit/delete actions.

Key design decisions:
- **Progress tracks new saving, not baseline balance.** If an account already holds $1,000 when a $5,000 goal is created, setting `starting_balance = 1000` ensures progress starts at 0% ($0 / $4,000 new saving needed), accurately reflecting progress made toward the target after goal creation.
- **Achieved goals remain visible but styled distinctly** (`goal-card--achieved` with a checkmark badge) and can be reopened at any time.

Tests: `tests/goals.test.js` (8 cases) — goal creation, progress calculation, account balance adjustment reflecting in goal progress, editing, marking achieved/reopened, deletion, cross-user isolation, and HTTP route tests for creation and listing. All passing.

### Phase 10 — Search/filter + data export ✅

Built:
- Enhanced `models/transactions.js:list()` to support full multi-criteria filtering: date range (`startDate`, `endDate`), category (including subcategories), account, amount range (`minAmount`, `maxAmount`), and free-text search (`search`) matching payee or notes with `ILIKE` across `pg_trgm` indexes.
- `routes/transactions.js` — updated `GET /transactions` to parse and apply all filter params, preserving query parameters across pagination links, and added `GET /transactions/export` for full CSV data export of filtered or unfiltered transactions.
- `views/transactions/index.ejs` — added a collapsible "Search & Filter" card with inputs for search term, account, category, date range, and amount range, plus an "Export CSV" button.

Key design decisions:
- **Full user data sovereignty.** Users can export all transactions to CSV at any time, filtered or unfiltered, ensuring financial data is never locked into the application.
- **Pagination preserves active filters.** Filter query strings are carried through all pagination links (`Page X of Y`), so navigating between pages never resets active search filters.

Tests: `tests/search.test.js` (9 cases) — filtering by date range, category, amount range, free-text search on payee and notes, combined multi-filter queries, empty result handling, HTTP search route tests, and CSV export endpoint verification. All passing.

### Phase 11 — Production hardening ✅

Built & Audit:
- **Input Validation & Sanitization Audit:** Reviewed all input forms across auth, accounts, transactions, categories, budgets, recurring, goals, and CSV import. `express-validator` rules sanitize inputs (`trim()`, type checks, length caps, UUID/ISO8601 validation) on every route.
- **CSV Security:** CSV import enforces a 5&nbsp;MB file size limit via `multer`, limits parsing to 5000 rows max (`MAX_ROWS`), parses strictly on the server, and stores normalized state in `req.session.importWizard`. The review/confirm step accepts only row indices from the client, resolving actual values from trusted session state.
- **HTTPS Enforcement:** Added production HTTPS redirect middleware in `server.js` (`req.headers['x-forwarded-proto'] !== 'https'`) behind Render's proxy (`trust proxy 1`).
- **Session & Cookie Security:** Session cookies use `httpOnly: true`, `secure: isProduction`, `sameSite: 'lax'`, 7-day max age, and session regeneration (`req.session.regenerate()`) on login/signup to prevent session fixation.
- **Helmet Security Headers:** Content Security Policy configured with `script-src ['self']` and `img-src ['self', 'data:']`.
- **Responsive QA Pass:** Verified mobile-first layout (CSS Flexbox/Grid, breakpoint at 768px for responsive hamburger navigation, table horizontal overflow scrolling wrapper `.table-wrap`, touch-friendly form fields).

Tests: Ran full test suite (`npm test`). All 14 test suites and 130 tests passing cleanly.

### Phase 12 — Public experience, session controls, and performance

Implemented:
- Rebuilt the landing page, login page, and signup page with a responsive
  public-facing layout, clear calls to action, accessible form structure, and
  consistent Purslip visual language.
- Added a true 15-minute inactivity timeout. Authenticated requests refresh
  activity, while an idle session is destroyed and redirected to login with a
  clear expiry message. The session cookie uses the same idle window.
- Added reusable rate limiting for all authentication POST actions and all
  authenticated POST/PUT/PATCH/DELETE actions, while preserving the existing
  per-account login lockout.
- Preserved compression and user-scoped dashboard caching, added explicit
  private cache headers for the dashboard, and retained production static
  asset caching with ETags.
- Improved branded 404/500 pages with useful navigation and safe production
  messaging.
- Fixed the PostgreSQL transaction insert/update parameter inference error by
  explicitly typing numeric and text placeholders (`$4::numeric`, `$5::text`,
  and their update equivalents).

Validation:
- `npm run build` passes.
- Full Jest validation is pending in this environment because Docker is not
  installed and the configured disposable test Postgres instance is
  unavailable. The new idle-session regression test is included in
  `tests/auth.test.js`; run `npm test` when the test database is available.

### Phase 13 — Public landing and signup flow

Built:
- The anonymous landing page now keeps the hero focused on the product and
  places only `Log in` and `Sign up` in a normal top-right public navigation;
  it no longer shows hero actions or an `Open dashboard` action.
- Signup now remains a separate page, collects optional full name, country,
  phone number, and base currency profile fields, and redirects to the login
  page after successful account creation. Login continues to redirect to the
  dashboard after successful credentials.
- Email uniqueness remains enforced by the database's case-insensitive
  `CITEXT UNIQUE` constraint and is also handled cleanly for concurrent
  signup attempts.
- Passwords still require at least 8 characters. Signup now displays a live
  Weak/Moderate/Strong indicator using length, case, number, and symbol
  signals without requiring a strong score.
- Added the post-launch user-profile migration
  (`npm run db:migrate:profile`) for databases that already existed before
  the new profile fields.

Validation:
- `npm run build` passes after the flow and schema changes.
- JavaScript syntax checks pass for the changed auth, user model, migration,
  and password-strength files.

### Phase 14 — Public route resilience

Fixed:
- The public landing route is now rendered before the database-backed session
  middleware. A stale browser session or transient cloud Postgres timeout can
  no longer turn the anonymous landing page into a 500 error.
- Session-backed routes such as login and dashboard continue to use the
  database session store normally.

Validation:
- `GET /` returns 200 and renders the landing page.
- `GET /auth/login` returns 200 through the session store.
- `GET /healthz` returns 200.
- `npm run build` passes.

### Phase 15 — Personal information and account security

Built:
- Added CNIC to onboarding and migrated the cloud `users` table safely with
  `ADD COLUMN IF NOT EXISTS`.
- Added a Settings personal-information section showing name, country, phone,
  email, and a masked CNIC. Profile fields stay read-only until the user
  explicitly clicks Edit; saving requires the current password. CNIC is
  immutable and can only be revealed after password verification.
- Added Settings security controls for changing email and password. Email
  changes require the current password; password changes require the current
  password and CNIC, with the existing eight-character minimum retained.
  Case-insensitive email uniqueness remains enforced by PostgreSQL.
- Added CNIC verification to forgot-password recovery before issuing the
  single-use reset token and redirecting to the reset-password page.
- Added direct Personal information/Security and Log out actions on the
  dashboard; the existing navigation logout remains available as well.

Validation:
- Cloud migration applied successfully; `users.cnic` confirmed present.
- `npm run build` and changed JavaScript syntax checks pass.
- Signup and forgot-password pages return 200 and contain CNIC fields.
- `/settings` returns an authentication redirect when anonymous.

### Phase 16 — Navigable sidebar and visible logout

Fixed:
- The desktop authenticated sidebar now uses an independently scrollable
  navigation region, so lower options such as Settings and Debts are reachable
  instead of being clipped by the fixed shell.
- Logout is now outside the scrollable link list and stays visible at the
  bottom of the sidebar.
- The dashboard retains a direct Logout action alongside its settings link.

Validation:
- `npm run build` passes.
- Navigation JavaScript syntax check passes.

### Phase 17 — Public theme switch

Added the light/dark/night theme switch to the anonymous landing-page header.
It uses the existing local-storage-backed theme cycle, so the selected theme
persists while moving between landing, auth, and authenticated pages.

### Phase 18 — Profile defaults and settings render fix

Fixed the Settings page crash caused by `revealedCnic` not being defined on the
normal initial render. The profile migration now also backfills missing values
for existing users, using the email prefix only as a temporary full-name
fallback and safe empty/default values for country, phone, currency, and CNIC.

### Phase 19 — Settings content layout

Fixed the Settings page using `main.container` instead of the shared
`main.page` shell. It now receives the authenticated desktop sidebar offset
and responsive page spacing, so Settings content is no longer rendered behind
the fixed navigation panel.

### Phase 20 — Inline settings editing

Reworked Settings so Personal information, Security, and Preferences all use
the same inline editor pattern: values are read-only by default, Edit/Change
opens the editor in place, and Save changes appears only after a value is
actually changed. Discard restores the original values without opening a new
page or dialog.

### Phase 21 — Theme stability, alignment, and account deletion

Fixed:
- Theme initialization now runs before the stylesheet, using the saved
  localStorage theme, so navigation between dashboard, Settings, and other
  pages does not flash dark mode before switching back.
- Added a password-confirmed, explicit `DELETE` account-deletion flow in
  Settings. Deleting the user cascades their financial records and destroys
  the active session.
- Local development now uses the process session store while production and
  tests retain PostgreSQL sessions. This prevents a transient cloud database
  session timeout from turning a successful local Settings update into a 500.
- Settings validation/error renders now always provide the CNIC reveal state,
  preventing another EJS undefined-variable failure.
- Kept shared page/sidebar spacing so Settings content aligns with the rest of
  the authenticated project shell.

Validation:
- `npm run build` passes.
- Changed JavaScript files pass syntax checks.
- `GET /` and `GET /auth/login` both return 200 on the running local server.
- The Jest suite remains blocked by the unavailable disposable test database
  environment (`globalSetup` reports an aggregate connection error).

### Phase 22 — Account deletion foreign-key fix

Fixed account deletion to remove the user's dependent financial records in a
single transaction before deleting the user. The previous direct user delete
was blocked by restrictive category references: transaction splits, budgets,
recurring templates, child categories, and parent categories could not all be
cascaded safely by PostgreSQL. The delete route now removes those dependencies
in order and rolls back everything if any step fails.

The local log's separate `EADDRINUSE` message was caused by multiple dev
watchers trying to bind port 8080, not by the deletion request. The extra
watcher was stopped after validation.

Validation:
- `npm run build` passes.
- `models/users.js` and `routes/settings.js` pass Node syntax checks.

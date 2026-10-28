# Gardeners Dream IT Hub

A bespoke IT app for raising and handling IT jobs, managing inventory, keeping printer details, and seeing the network across our three sites. It runs on desktop and phone as an installable web app (PWA).

## Where we are

**Phase 1 (tickets) is built and tested, using placeholder settings.** Slack notifications are built and tested against a stand-in Slack; they need a Slack app to go live (see `docs/slack-setup.md`). Raising jobs from Slack is still to come.

`design/prototype.html` is the clickable design prototype with example data. The real app follows its **E · Ocean** style.

## What Phase 1 does

**Staff** (anyone with a company email address)
- Create an account with work email and password, or sign in with Microsoft, Google or Slack once those are connected.
- Raise a job: title, details, up to 5 screenshots or photos (paste, drag in or use the phone camera), site, exact location, category, urgency and a contact number.
- See their own jobs only, with a progress timeline, IT's replies and a place to reply. Replying to a resolved job reopens it.
- Rate the fix 1 to 5 once it's resolved.

**IT team** (invite only)
- An admin invites someone from Settings. They get a one-time link by email that works for 7 days on a phone or computer.
- From the link they choose a sign-in method, then add an authenticator app. Every IT sign-in needs a code from that app, whichever sign-in method they use.
- Dashboard: open jobs, jobs past their SLA, jobs assigned to me, average rating, the most urgent jobs and jobs raised over the last 14 days.
- Ticket queue with Open / Mine / Unassigned / Resolved / All views, search (including by IT-number) and filters by site and priority.
- Ticket page: status, assignee, priority, category and site (they save as soon as they change), SLA timers for first response and fix, replies to the requester, internal notes staff never see, screenshots, time logging and the rating.
- Settings (admins): invite people, change roles or remove someone from IT, SLA targets per priority, assignment rules, sites and categories.

**Everywhere**
- Email notifications for new jobs, assignments, replies and status changes. Until email is set up, they are printed to the server log.
- Slack notifications: every new job is posted to the IT channel with an Open ticket button, and status changes, assignments, replies and ratings go in that message's thread. People get a direct message when IT replies to their job or changes its status, and IT staff when a job is assigned to them. Internal notes are never sent to Slack. Settings → Slack has a Send test message button.
- Installable on phones. Pages opened recently still open without signal; changes need a connection.
- Screenshots are only served to the person who raised the job and the IT team.

## Placeholders to replace

| What | Placeholder now | Where to change it |
| --- | --- | --- |
| Site names | Head Office, Warehouse, Showroom | Settings → Sites |
| SLA targets | P1 15 min / 4 h, P2 1 h / 1 day, P3 4 h / 3 days, P4 1 day / 5 days (clock time, 24/7) | Settings → SLA targets |
| Assignment rules | None, so new jobs start unassigned | Settings → Assignment rules |
| Categories | Hardware, Software, Network, Printer, Onboarding, Request, Other | Settings → Categories |
| First IT admin | Whatever `ADMIN_EMAIL` is set to | `.env`, then `npm run db:seed` |
| Logo | Low-res crop from a website screenshot | `public/brand/logo.png` |
| Microsoft / Google / Slack sign-in | Off until keys are added | `.env` |
| Email sending | Printed to the server log | `SMTP_*` in `.env` |
| Slack | Off until a Slack app is connected | `SLACK_BOT_TOKEN` and `SLACK_CHANNEL` in `.env` ([setup steps](docs/slack-setup.md)) |

## Running it

Needs Node 22 and PostgreSQL 16.

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL, BETTER_AUTH_SECRET, ADMIN_EMAIL
npm run db:migrate
npm run db:seed               # prints the first IT admin's invite link
npm run dev                   # http://localhost:3000
```

Open the printed link to set up the first admin. To try it with a believable week of example jobs, point `DATABASE_URL` at a spare database and run `npm run db:demo` after creating the admin and one staff account (it takes their emails as arguments). Staff can sign up at `/sign-up` with an address on `ALLOWED_EMAIL_DOMAINS`.

### Tests

```bash
npm run typecheck
npm test                      # unit and database tests (uses the ithub_test database)
npm run build && npm run test:e2e   # end-to-end in a browser (uses the ithub_e2e database)
```

The end-to-end run walks through the whole story: an admin joins by invite and sets up an authenticator, a member of staff raises a job with a screenshot on a phone, IT replies, adds a private note, logs time and resolves it, the requester sees the reply but not the note and rates it, signing in again asks for a code, and the admin invites a tech and changes SLA targets. It also checks every message that would have gone to Slack, using a stand-in Slack server (`tests/fake-slack.ts`).

### Code map

- `src/db/schema.ts`: database tables. Migrations live in `drizzle/` (`npm run db:generate` after changing the schema).
- `src/lib/auth.ts`: sign-in setup (Better Auth). `src/lib/session.ts`: who's signed in and the IT page guard.
- `src/lib/tickets.ts`: everything that creates, reads and changes tickets. `src/lib/sla.ts` and `src/lib/assignment.ts`: SLA maths and assignment rules.
- `src/lib/invites.ts`: IT invites. Only a hash of each link is stored.
- `src/app/`: pages. `/my/*` is the staff portal, `/it/*` the IT side, `/invite/*`, `/setup-2fa` and `/verify` the IT sign-in steps.

## Decisions so far

| Area | Decision |
| --- | --- |
| Users | Under 50 staff, 3 sites |
| Platform | PWA (desktop + phone), works offline for the IT team |
| Sign-in | Slack, Google, Microsoft (Entra ID), email and password |
| Roles | Staff sign up with a company email and only see their own jobs. IT accounts are invite only (one-time link, 7 days) and need an authenticator code on every sign-in. Roles: Staff, IT tech, IT admin |
| Tickets | Title, description, screenshots, site + location, category, priority, contact number |
| Statuses | New → In progress → Waiting on user → Resolved → Closed |
| SLAs | Per priority, first response and fix targets |
| Assignment | Rules by category and site, first match wins |
| Extras | Comments, internal notes, time tracking, satisfaction rating |
| Inventory | Laptops, printers, scanners, Raspberry Pis, label printers, cupboard stock (keyboards, mice, screens, toner, labels). QR labels, photos, check-in/out with history, low-stock and warranty alerts, spreadsheet import |
| Style | **E · Ocean**: dark navy sidebar, blue accent, Plus Jakarta Sans, soft rounded cards |
| Stack | Next.js + TypeScript, PostgreSQL with Drizzle, Better Auth, Vitest and Playwright |

## Phases

0. **Design**: done (E · Ocean)
1. **Tickets**: built and tested with placeholders, including Slack notifications. Raising jobs from Slack still to add.
2. **Inventory + printers**: assets, stock, QR scanning, photos, printer register (optional SNMP live status)
3. **Networking**: UniFi integration per site
4. **WhatsApp and extras**

Each phase is tested before moving to the next.

## Not in Phase 1 yet

- Raising jobs from Slack (a /ithelp command or posting in a channel). Slack notifications are done.
- SLA clocks run 24/7. They don't yet pause outside working hours or while waiting on the requester.
- Offline changes: the IT team can read recently opened pages without signal, but can't save changes offline yet.
- Scanning a QR code on a computer to sign in on a phone (sign in on the phone the normal way instead).
- Screenshots are stored on the server's disk. Move them to cloud storage once hosting is decided.

## Still to decide

- Assignment table, real SLA targets and site names
- Slack details: slash command, channel, two-way sync, notifications
- Hosting (cloud or on-site server), compliance and budget
- WhatsApp: purpose, official API or not
- UniFi setup: controller type and where it is reachable from
- Printer makes and whether live status is needed

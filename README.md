# Gardeners Dream IT Hub

A bespoke IT app for raising and handling IT jobs, managing inventory, keeping printer details, and seeing the network across our three sites. It runs on desktop and phone as an installable web app (PWA).

## Where we are

**Phases 1 to 4 are built and tested, using placeholder settings.** Phase 3 (network) is tested against an example network and a stand-in UniFi server; nothing real is connected yet.

**Phase 1 (tickets):** Slack notifications are built and tested against a stand-in Slack; they need a Slack app to go live (see `docs/slack-setup.md`). Raising jobs from Slack is still to come.

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
- SLA clocks: each priority counts either "any time" (day and night) or only in working hours (5am to 9pm every day by default, UK time, including the clock changes). The fix clock pauses while a job is Waiting on user and restarts when they reply. Changing the settings updates the deadlines on open jobs.

**Everywhere**
- Email notifications for new jobs, assignments, replies and status changes. Until email is set up, they are printed to the server log.
- Slack notifications: every new job is posted to the IT channel with an Open ticket button, and status changes, assignments, replies and ratings go in that message's thread. People get a direct message when IT replies to their job or changes its status, and IT staff when a job is assigned to them. Internal notes are never sent to Slack. Settings → Slack has a Send test message button.
- Installable on phones. Pages opened recently still open without signal; changes need a connection.
- Screenshots are only served to the person who raised the job and the IT team.

## What Phase 2 does (inventory and printers)

- **Inventory** of tagged kit: laptops, desktops, printers, label printers, scanners, Raspberry Pis, monitors, phones and so on. Each item has a tag (GD-00001…), photos, make, model, serial, status (in use, spare, in repair, retired), site and location, IP and MAC address, purchase date, cost, supplier, warranty date and notes. Search by tag, name, serial, IP, person or place.
- **Check out and check in** to a person or a place/team, with a full history of who had it and every change.
- **QR labels** on A4 sheets (Avery L7160) or single labels (Brother QL 62 × 29 mm, Zebra 57 × 32 mm). Scanning one with any phone camera opens the item for IT; for anyone else it opens "Raise a job" already filled in for that item. There's also a Scan page in the app, and you can type a tag.
- **Stock** for cupboard items counted by quantity (toner, labels, keyboards, screens, cables): −1 / +1 straight from the list, a big "Take one" button on each item's page (shelf labels open it), deliveries and stock counts, and a history. When something drops below its minimum, IT gets an email and a Slack message once.
- **Printers page**: every printer and scanner with IP (click to open its web page on the office network), MAC, location, matching toner from stock and open jobs.
- **Licences** with renewal dates, seats and cost.
- **Reminders**: the dashboard shows low stock, licences renewing and warranties ending in the next 30 days. A daily summary goes to IT by email (and Slack) 14, 7 and 1 days before; it's sent on the first dashboard visit each day, or by a scheduler calling `/api/cron/reminders` with `CRON_SECRET`.
- **Tickets link to kit**, so an item's page lists its jobs and a ticket shows which item it's about.
- **Spreadsheet import** (CSV) for kit and stock, with a row-by-row check before anything is saved. Templates are on the import page.

## What Phase 3 does (network, from UniFi)

- **Connect** in Settings → Network (UniFi). Three kinds of connection:
  - **On-site console** (UDM, UCG, Cloud Key…): uses the console's own API key (UniFi Network 9 or newer: Settings → Control Plane → Integrations). Gives kit, uplinks and every connected device, but the app has to run on that network or reach it over a VPN.
  - **UniFi cloud** (unifi.ui.com API key): works from anywhere and reports each site's internet line and latency, but only a *count* of connected devices.
  - **Example network**: three made-up sites to try the pages without any kit. Remove it before connecting the real thing.
  The key is checked before anything is saved, problems are explained in plain words (wrong key, can't reach the console, certificate), and keys are stored encrypted and never sent to the browser. IT Hub only reads; it never changes settings or restarts anything.
- **Network overview**: a card per site with internet status, kit online, connected devices, latency and anything offline, plus a list of recent outages. Refresh now reads UniFi straight away.
- **Site page**: a map from internet → gateway → switches → access points, 14 days of internet uptime, the kit list, and connected devices with what each one is plugged into or on Wi-Fi through. Search by name, IP or MAC.
- **Device page**: model, IP, MAC, firmware, uptime, what it's connected to, what's connected through it, and its outages.
- **Find a device** across every site by name, IP or MAC.
- **Alerts**: when kit or a site's internet is down for longer than the alert delay (3 minutes by default, so blips are ignored), IT gets an email and a Slack message, and another when it comes back. Optionally a P1 ticket is raised for an internet outage.
- **Inventory link**: gateways, switches and access points are added to the inventory automatically (matched by MAC, so existing items are reused). Any inventory item with a MAC address, such as a printer, shows whether it's on the network now, and the Printers page has an Online / Not seen column. The dashboard has a Network panel.
- **Polling**: the server reads every connection each `NETWORK_POLL_SECONDS` (default 60; 0 turns it off). Where the host can't keep a timer running, a scheduler can call `/api/cron/network` with `CRON_SECRET` instead.

The UniFi adapters follow UniFi's published APIs but haven't met real kit yet. Expect a small fix or two when the first real console or cloud key is connected.

## What Phase 4 does (starters and leavers, help articles)

WhatsApp was left out of Phase 4 by choice. It can be added later through WhatsApp's official Business API.

**Starters and leavers** (IT team, under Starters & leavers)
- Add a starter or leaver with their name, email, site, job title, manager and first or last day. Each one gets a checklist copied from the standard list. Admins edit the standard lists in Settings → Starter checklist / Leaver checklist; the defaults are placeholders.
- **Starters:** pick spare kit from the inventory when adding them. Ticking "Hand out…" checks the item out to them, linked to their IT Hub account once they've signed up with that email.
- **Leavers:** pick their account and every item assigned to them is added as "Collect…". Ticking it checks the item back in as spare at their site. Anything they're given later shows under "Still has".
- Unticking a kit task puts the item back where it was, so the inventory always matches the checklist. Extra one-off tasks can be added per person.
- A list is marked done when everything is ticked. It can be cancelled and reopened.
- Starters and leavers due in the next 14 days show under Coming up on the dashboard. The daily IT reminder mentions them a week before, the day before, on the day and every day after while jobs are left.

**Help articles**
- IT write how-to guides in a simple editor with a preview. Formatting: headings, numbered and bullet lists, bold, links and tips. Screenshots can be pasted in or uploaded. Articles stay drafts until published.
- Staff get a Help page (it appears once something is published) with search, and can answer "Did this help?".
- While someone types a new job, matching articles appear under the form. If one fixes the problem, they tap **This fixed it** and nothing is sent to IT.
- The Help articles page shows views, how helpful each article was, and how many jobs weren't needed.
- Articles are shown safely: nothing in one can add scripts or hidden links, and images only come from IT Hub's own uploads or https.

## Placeholders to replace

| What | Placeholder now | Where to change it |
| --- | --- | --- |
| Site names | Head Office, Warehouse, Showroom | Settings → Sites |
| SLA targets | P1 15 min / 4 h, P2 1 h / 1 day (any time); P3 4 h / 3 days, P4 1 day / 5 days (working hours) | Settings → SLA targets |
| Working hours | 5am to 9pm, every day, UK time. The fix clock pauses while waiting on the requester | Settings → Working hours |
| Assignment rules | None, so new jobs start unassigned | Settings → Assignment rules |
| Categories | Hardware, Software, Network, Printer, Onboarding, Request, Other | Settings → Categories |
| First IT admin | Whatever `ADMIN_EMAIL` is set to | `.env`, then `npm run db:seed` |
| Logo | Low-res crop from a website screenshot | `public/brand/logo.png` |
| Starter and leaver checklists | 7 starter and 6 leaver tasks (email account, Slack, licences, kit, passwords…) | Settings → Starter checklist / Leaver checklist |
| Kit types | Laptop, Desktop, Monitor, Printer, Label printer, Scanner, Raspberry Pi, Phone, Tablet, Network, Other | Settings → Kit types |
| Microsoft / Google / Slack sign-in | Off until keys are added | `.env` |
| Email sending | Printed to the server log | `SMTP_*` in `.env` |
| UniFi | Not connected | Settings → Network (UniFi) |
| Slack | Off until a Slack app is connected | `SLACK_BOT_TOKEN` and `SLACK_CHANNEL` in `.env` ([setup steps](docs/slack-setup.md)) |

## Trying it

To try the app on your own computer with example data, see [docs/try-it.md](docs/try-it.md). After installing Node and Docker Desktop, it's `npm install` then `npm run try`.

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

The end-to-end run walks through the whole story: an admin joins by invite and sets up an authenticator, a member of staff raises a job with a screenshot on a phone, IT replies, adds a private note, logs time and resolves it, the requester sees the reply but not the note and rates it, signing in again asks for a code, and the admin invites a tech and changes SLA targets. It also checks every message that would have gone to Slack, using a stand-in Slack server (`tests/fake-slack.ts`). The Phase 4 run writes a help article with a screenshot, has a member of staff find it in Help, then fix a problem from a suggestion while raising a job, so nothing is sent. It also takes a starter and a leaver through their checklists, with their laptops checked out and back in. The network tests use a stand-in UniFi server (`tests/fake-unifi.ts`) that answers like a console and the UniFi cloud: a wrong key, connecting, the site/device/search pages, a printer showing as online, kit added to the inventory, an access point dropping off and coming back, and the example network on the dashboard and a phone.

### Code map

- `src/db/schema.ts`: database tables. Migrations live in `drizzle/` (`npm run db:generate` after changing the schema).
- `src/lib/auth.ts`: sign-in setup (Better Auth). `src/lib/session.ts`: who's signed in and the IT page guard.
- `src/lib/tickets.ts`: everything that creates, reads and changes tickets. `src/lib/sla.ts` and `src/lib/assignment.ts`: SLA maths and assignment rules.
- `src/lib/invites.ts`: IT invites. Only a hash of each link is stored.
- `src/lib/network/`: UniFi. `sources/` reads a console, the cloud or the example network into one shape; `poll.ts` saves it, debounces outages and sends alerts; `queries.ts` feeds the pages.
- `src/lib/people.ts`: starters and leavers. `src/lib/help.ts`: help articles and search. `src/components/markdown.tsx`: the safe article formatter.
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
2. **Inventory + printers**: built and tested. Live printer status (SNMP) waits for hosting on the office network.
3. **Networking**: built and tested against an example network and a stand-in UniFi. Waiting for real console or cloud keys.
4. **Extras**: starters and leavers, and help articles. Built and tested. WhatsApp left for later.

Each phase is tested before moving to the next.

## Not in Phase 1 yet

- Raising jobs from Slack (a /ithelp command or posting in a channel). Slack notifications are done.
- Offline changes: the IT team can read recently opened pages without signal, but can't save changes offline yet.
- Scanning a QR code on a computer to sign in on a phone (sign in on the phone the normal way instead).
- Screenshots are stored on the server's disk. Move them to cloud storage once hosting is decided.

## Still to decide

- Assignment table, real SLA targets and site names
- Slack details: slash command, channel, two-way sync, notifications
- Hosting (cloud or on-site server), compliance and budget
- WhatsApp (left out of Phase 4): purpose, official API or not
- UniFi setup: controller type and where it is reachable from
- Printer makes and whether live status is needed

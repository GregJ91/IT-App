# Gardeners Dream IT Hub

A bespoke IT app for raising and handling IT jobs, managing inventory, keeping printer details, and seeing the network across our three sites. It runs on desktop and phone as an installable web app (PWA).

## Where we are

**Design stage.** `design/prototype.html` is a clickable prototype with example data. Open it in a browser. The bar at the top lets you:

- choose how to view it: **Desktop** (browser window), **Phone** (phone frame) or **Full screen**
- switch between five style directions: **A · Clean**, **B · Console**, **C · Soft** (closest to the website), **D · Mono** and **E · Ocean** (D and E are neutral modern looks, not in company colours)
- view the app as the **IT team**, as **Staff**, see the staff **Sign-in** screen, or walk through an **IT invite**
- try a brand colour and a name

## Decisions so far

| Area | Decision |
| --- | --- |
| Users | Under 50 staff, 3 sites |
| Platform | PWA (desktop + phone), works offline for the IT team |
| Sign-in | Slack, Google, Microsoft (Entra ID), email and password |
| Roles | Staff sign in on the public sign-in page and can only raise and track their own jobs. IT team accounts are invite only: an admin sends a one-time link (email, Slack or copied), valid 7 days, that works on phone or browser. The person picks a sign-in method and adds an authenticator code, then can scan a QR code to sign in on their phone too. After that they sign in on the normal sign-in page with the same method plus their authenticator code, and get the IT view. Roles: Staff, IT tech, IT admin |
| Tickets | Title, description, screenshots, site + location, priority, contact number |
| Statuses | New → In progress → Waiting on user → Resolved → Closed |
| SLAs | Yes, per priority (targets to confirm) |
| Assignment | Rules table to be supplied |
| Extras | Comments, internal notes, time tracking, satisfaction rating |
| Inventory | Laptops, printers, scanners, Raspberry Pis, label printers, cupboard stock (keyboards, mice, screens, toner, labels). QR labels, photos, check-in/out with history, low-stock and warranty alerts, spreadsheet import |
| Style | **E · Ocean** chosen: dark navy sidebar, blue accent, Plus Jakarta Sans, soft rounded cards |
| Branding | Gardeners Dream: leaf green, lime, sky blue, mint, butter highlight on warm white, DM Sans. Logo in `design/brand/` is a low-res crop from a website screenshot; swap in the original SVG |

## Phases

0. **Design**: style chosen (E · Ocean); page layouts being finalised
1. **Tickets + Slack**: tickets, SLAs, assignment, staff portal, sign-in, Slack integration
2. **Inventory + printers**: assets, stock, QR scanning, photos, printer register (optional SNMP live status)
3. **Networking**: UniFi integration per site
4. **WhatsApp and extras**

Each phase is tested before moving to the next.

## Still to decide

- Slack details: slash command, channel, two-way sync, notifications
- WhatsApp: purpose, official API or not
- UniFi setup: controller type and where it is reachable from
- Hosting, compliance and budget
- Printer makes and whether live status is needed

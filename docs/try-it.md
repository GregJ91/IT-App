# Try IT Hub on your own computer

This runs the real app on your computer with a week of made-up data: jobs, kit, stock, printers, the example network, a starter and a leaver, and help articles. Everything works and saves. Nothing is sent anywhere: emails are printed in the window instead, and Slack and UniFi aren't connected.

## What you need (once)

1. **Node.js 22** from [nodejs.org](https://nodejs.org) (the "LTS" download).
2. **Docker Desktop** from [docker.com](https://www.docker.com/products/docker-desktop/), opened and running. It holds the example database.
3. **Git** from [git-scm.com](https://git-scm.com) if you don't have it (Macs ask to install it the first time you use it).
4. An **authenticator app** on your phone (Microsoft Authenticator, Google Authenticator or similar) for the IT sign-in.

## Start it

Open Terminal (Mac) or PowerShell (Windows) and run:

```bash
git clone -b claude/magical-edison-ycwc6m https://github.com/GregJ91/IT-App.git
cd IT-App
npm install
npm run try
```

If the repository is private, Git asks you to sign in to GitHub the first time.

The first run takes a few minutes: it downloads the database and builds the app. When it's ready it prints the address and the sign-in details:

| Account | Email | Password |
| --- | --- | --- |
| IT admin | greg@gardenersdream.co.uk | try-it-hub-admin |
| Staff | kirsty@gardenersdream.co.uk | try-it-hub-staff |

Open **http://localhost:3000**. The first time the IT admin signs in, it asks you to scan a QR code with your authenticator app, the same as a real IT account. After that, each sign-in asks for a code.

To see both sides at once, sign in as staff in a private (incognito) window.

## On your phone

```bash
npm run try -- --phone
```

It prints an address like `http://192.168.1.20:3000`. Open it on a phone on the same Wi-Fi. The camera QR scanner and "install as an app" need a secure (https) address, so they won't work this way: type the tag on the Scan page instead.

## Things to try

- **As staff:** raise a job with a screenshot. Type "label printer blank" and a help article is suggested. Read Help. Reply to IT on one of your jobs.
- **As IT:**
  - Work through the queue: assign, reply, add a private note, log time and resolve. Then check what staff see.
  - Open an item in the Inventory, check it out and back in, and print QR labels.
  - On the Stock page, take a toner and watch the low-stock alert.
  - Look at the Network pages for the three example sites. Refresh now re-reads the example network.
  - Open Starters & leavers. Tick Jamie Fox's "Hand out" items and see the laptop move to them in the Inventory.
  - Write a help article and paste a screenshot in.
  - In Settings, invite a tech (the invite link prints in the window), change SLA targets and edit the starter checklist.

## Stopping and starting again

- **Stop:** press Ctrl+C in the window. Your changes are kept for next time `npm run try` runs.
- **Start fresh with the original example data:** `npm run try -- --reset`.
- **Remove everything:** `docker compose down -v`, then delete the folder.

## If something goes wrong

- **"Starting the database didn't work":** open Docker Desktop and wait until it says it's running, then try again.
- **Port 3000 is already in use:** `PORT=3005 npm run try` on a Mac, or `$env:PORT=3005; npm run try` in PowerShell.
- **Already have PostgreSQL:** set `TRY_DATABASE_URL` to an empty database, and Docker isn't needed.

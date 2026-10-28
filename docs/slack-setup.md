# Connecting Slack

IT Hub can:

- post every new job to your IT channel, with a button to open it
- keep each job's updates (status, assignment, replies, rating) in that message's thread
- send people a direct message when IT replies to their job or changes its status
- send IT staff a direct message when a job is assigned to them

Internal notes are never sent to Slack. People are matched by email address, so their Slack account needs the same email as their IT Hub account.

## 1. Create the Slack app (about 5 minutes, needs a Slack admin)

1. Go to https://api.slack.com/apps and choose **Create New App** → **From a manifest**.
2. Pick your workspace, choose **YAML**, and paste this:

   ```yaml
   display_information:
     name: IT Hub
     description: Gardeners Dream IT jobs and updates
     background_color: "#0f172a"
   features:
     bot_user:
       display_name: IT Hub
       always_online: true
   oauth_config:
     scopes:
       bot:
         - chat:write        # post in the IT channel and send direct messages
         - users:read        # find people
         - users:read.email  # match people by email address
   settings:
     org_deploy_enabled: false
     socket_mode_enabled: false
     token_rotation_enabled: false
   ```

3. Click **Create**, then **Install to Workspace** and **Allow**.
4. Open **OAuth & Permissions** and copy the **Bot User OAuth Token** (starts with `xoxb-`).

## 2. Pick the channel

1. In Slack, open your IT channel (for example `#it-jobs`). A private channel is best, because job titles and descriptions are posted there.
2. Type `/invite @IT Hub` in the channel.
3. Get the channel ID: click the channel name, and it's at the bottom of the **About** tab (starts with `C`).

## 3. Add the settings to the server

In the server's `.env`:

```
SLACK_BOT_TOKEN=xoxb-…
SLACK_CHANNEL=C0123456789
```

Restart the app. Then go to **Settings → Slack** and press **Send test message**. It tells you in plain words if anything is wrong (bad token, app not in the channel, missing permission).

The server needs to reach `slack.com` over HTTPS.

## Simpler option: channel posts only

If you only want new jobs posted to a channel, you can use an incoming webhook instead of a bot token: in the app, turn on **Incoming Webhooks**, add one for your channel, and set `SLACK_WEBHOOK_URL`. You won't get threads or direct messages.

## Keep the token secret

The bot token can post as IT Hub in your workspace. Keep it only in the server's `.env` (never in the code or a chat message). If it leaks, open the app's **OAuth & Permissions** page and choose **Revoke tokens**, then reinstall.

# Joinly status page — complete integration

This package connects the status page to the running Joinly Discord bot using Upstash Redis REST. The bot publishes a fresh snapshot every 30 seconds; snapshots expire after 90 seconds if the bot stops publishing. Vercel reads the snapshot through `/api/status`.

## Files

Website repository:
- `status.html` — status page
- `status.css` — styling
- `status.js` — browser-side rendering and automatic refresh
- `api/status.js` — Vercel serverless API route

Bot repository:
- `index.js` — your existing bot startup file with the status publisher integrated

## 1. Create the Upstash database

1. Go to https://console.upstash.com/
2. Create a Redis database.
3. Open its REST API section and copy the REST URL and REST token.
4. Keep these credentials private. Do not commit them to GitHub.

Use a dedicated database for this status page if possible.

## 2. Add variables to PebbleHost

In the bot's environment variables/startup configuration, add:

- `UPSTASH_REDIS_REST_URL` = your Upstash REST URL
- `UPSTASH_REDIS_REST_TOKEN` = your Upstash REST token

Keep your existing `TOKEN`, `TOPGG_TOKEN`, `DBL_TOKEN`, and `MONGO_URI` variables. Do not replace them.

Upload the included `index.js` over the bot's existing `index.js`, then restart the bot. The bot will continue running if these two new status variables are absent, but the website will not receive live updates.

## 3. Add files to the website GitHub repository

Put the files in the website project's root like this:

```text
your-website/
├── status.html
├── status.css
├── status.js
└── api/
    └── status.js
```

If the repository already has an `api` directory, place this `status.js` inside it without replacing other API routes.

## 4. Add variables to Vercel

In the Vercel project that hosts `joinly-bot.xyz`, open **Settings → Environment Variables** and add the same two variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Select Production (and Preview/Development too if you want to test those environments). Save the variables and deploy the website.

## 5. Test

After the bot has restarted and logged in, check:

- `https://joinly-bot.xyz/api/status` — should return JSON with `available: true`, the live guild count and one shard.
- `https://joinly-bot.xyz/status.html` — should show the status page.

The page refreshes every 15 seconds. The bot publishes every 30 seconds. A missing/expired snapshot is shown as unavailable rather than inventing live values.

## Notes

- This is configured for Joinly's current single-shard setup. The page labels the Discord shard ID `0` as **Shard 1** for display.
- `averageLatencyMs` is based on Discord.js's WebSocket manager ping. With one shard, this is the relevant shard's latency.
- Shard uptime is tracked from the last `shardReady` event during the current bot process. Process uptime is tracked from process startup.
- A forced shutdown publishes `stopping` where the host allows the process to finish its shutdown handler. If the process crashes abruptly, the Redis entry expires within 90 seconds.
- No website `server.js` is required. The API endpoint is a Vercel serverless function under `api/`.
- Do not commit Upstash tokens, Discord tokens, or `.env` files to GitHub.

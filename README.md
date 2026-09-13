# SNT Save — Extraction Test (not the full product)

Purpose: prove or disprove whether a headless-browser approach can pull the
real video URL out of a Facebook Reel — the thing the Cloudflare Worker
couldn't do (no JS execution in a Worker).

## What it does
1. `POST /extract` with `{ "url": "<facebook reel url>" }`
2. Launches headless Chromium (Playwright)
3. Loads the Reel page for real, like a phone browser would
4. Watches every network response for `.mp4` / `video/mp4`
5. Also checks `og:video` meta tag and any `<video>` element as fallbacks
6. Returns every candidate URL found + a debug log
7. If nothing is found, returns a base64 screenshot so you can see what
   Facebook actually served (login wall? checkpoint? different markup?)

## Test call (once deployed)
```
curl -X POST https://<your-railway-url>/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.facebook.com/reel/XXXXXXXXXXXX"}'
```

## Reading the result
- `success: true` + `candidateUrls` populated → the approach works, video
  URL(s) found. Pick the one with the highest resolution / longest duration
  if multiple show up (FB often serves several quality renditions).
- `success: false`, no screenshot → the browser itself errored (timeout,
  crash) — usually a Railway resource/timeout issue, not a Facebook block.
- `success: false`, screenshot present → Facebook served something other
  than the video (login wall, "content not available", checkpoint). This is
  the scenario most likely to need anti-bot handling (stealth plugin,
  residential proxy, or session cookies) — a bigger next step, not covered
  in this test.

## Known limitations of this test (by design)
- No anti-detection measures (no `playwright-extra` stealth plugin yet)
- No retry logic, no caching, no auth/rate-limiting
- No queue — a slow/hung request blocks that one instance
- Not wired into the SNT Save Worker/dashboard — this is standalone

If this proves the concept, the "full deployment" version would add:
stealth/anti-detection, proper error contracts, request queueing or
concurrency limits, and the actual integration point for the Worker/frontend
to call.

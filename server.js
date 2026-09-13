import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

async function runExtraction(url) {
  const foundUrls = new Set();
  const debugLog = [];
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      viewport: { width: 390, height: 844 },
    });

    const page = await context.newPage();

    page.on("response", (response) => {
      const respUrl = response.url();
      const contentType = response.headers()["content-type"] || "";

      if (contentType.includes("video/mp4") || /\.mp4(\?|$)/.test(respUrl)) {
        foundUrls.add(respUrl);
        debugLog.push(`network match: ${respUrl}`);
      }
    });

    debugLog.push(`navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    await page.waitForTimeout(4000);

    const ogVideo = await page
      .$eval('meta[property="og:video"]', (el) => el.content)
      .catch(() => null);
    if (ogVideo) {
      foundUrls.add(ogVideo);
      debugLog.push(`og:video meta: ${ogVideo}`);
    }

    const videoSrc = await page
      .$eval("video", (el) => el.currentSrc || el.src)
      .catch(() => null);
    if (videoSrc) {
      foundUrls.add(videoSrc);
      debugLog.push(`video element src: ${videoSrc}`);
    }

    let screenshotBase64 = null;
    if (foundUrls.size === 0) {
      const buf = await page.screenshot({ fullPage: false });
      screenshotBase64 = buf.toString("base64");
      debugLog.push("no video found — screenshot captured for debugging");
    }

    await browser.close();

    return {
      status: 200,
      body: {
        success: foundUrls.size > 0,
        candidateUrls: Array.from(foundUrls),
        debugLog,
        screenshotBase64,
      },
    };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return {
      status: 500,
      body: { success: false, error: err.message, debugLog },
    };
  }
}

function validateUrl(url) {
  return typeof url === "string" && url.includes("facebook.com");
}

// Browser-friendly: paste a link, hit enter, see JSON. No curl/app needed.
// e.g. /extract?url=https%3A%2F%2Fwww.facebook.com%2Freel%2F123
app.get("/extract", async (req, res) => {
  const { url } = req.query;

  if (!validateUrl(url)) {
    return res
      .status(400)
      .json({ error: "Provide ?url=<facebook.com reel/video url>" });
  }

  const result = await runExtraction(url);
  return res.status(result.status).json(result.body);
});

// Same logic via POST, for programmatic/curl use
app.post("/extract", async (req, res) => {
  const { url } = req.body || {};

  if (!validateUrl(url)) {
    return res
      .status(400)
      .json({ error: "Provide a valid facebook.com Reel/video URL in { url }" });
  }

  const result = await runExtraction(url);
  return res.status(result.status).json(result.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Extraction test service running on port ${PORT}`));

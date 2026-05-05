const HOST_NAME = "com.konkon.download_manager";

// ─── Video stream patterns that yt-dlp can handle ───────────────────────────
const VIDEO_SITE_PATTERNS = [
  /youtube\.com\/watch/i,
  /youtu\.be\//i,
  /facebook\.com\/.*\/videos\//i,
  /fb\.watch\//i,
  /instagram\.com\/(?:p|reel|tv)\//i,
  /twitter\.com\/.*\/status\//i,
  /x\.com\/.*\/status\//i,
  /tiktok\.com\/@.*\/video\//i,
  /vimeo\.com\/\d+/i,
  /dailymotion\.com\/video\//i,
  /twitch\.tv\//i,
  /reddit\.com\/r\/.*\/comments\//i,
];

// ─── Streaming request patterns to intercept ────────────────────────────────
// These are the actual media segment URLs browsers fetch when playing video.
const STREAM_URL_PATTERNS = [
  // HLS manifests
  /\.m3u8(\?|$)/i,
  // DASH manifests
  /\.mpd(\?|$)/i,
  // Facebook/Instagram video CDN
  /video\.(?:fbcdn|cdninstagram)\.net/i,
  /scontent[^/]*\.fbcdn\.net\/v\//i,
  // YouTube streaming (handled via page URL, not XHR)
  // Twitter/X CDN
  /video\.twimg\.com\//i,
  // TikTok
  /v(?:19|26)\.tiktok\.com\//i,
  // Vimeo
  /vimeocdn\.com\/.*\.mp4/i,
  // Generic video CDN patterns
  /\/manifest\/video\//i,
  /\/videoplayback\?/i,
];

// Tab → page URL tracking
const tabPageUrls = {};

// Tab → best intercepted stream URL
const tabStreamUrls = {};

// ─── Setup ───────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "download-link-with-konkon",
    title: "Download with Silent Download Manager",
    contexts: ["link"]
  });

  chrome.contextMenus.create({
    id: "download-page-with-konkon",
    title: "Download current page with Silent Download Manager",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "download-video-with-konkon",
    title: "Download video with Silent Download Manager",
    contexts: ["video"]
  });
});

// ─── Track tab navigations ───────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    tabPageUrls[tabId] = tab.url;
    // Clear stale stream URL on navigation
    delete tabStreamUrls[tabId];
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabPageUrls[tabId];
  delete tabStreamUrls[tabId];
});

// ─── Network request interception (IDM-style) ────────────────────────────────

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type !== "xmlhttprequest" && details.type !== "media" && details.type !== "other") {
      return;
    }

    if (!isStreamUrl(details.url)) {
      return;
    }

    const tabId = details.tabId;
    if (tabId < 0) {
      return;
    }

    // Prefer manifest URLs over raw segment URLs
    const current = tabStreamUrls[tabId] || "";
    const isManifest = /\.(m3u8|mpd)(\?|$)/i.test(details.url);
    const currentIsManifest = /\.(m3u8|mpd)(\?|$)/i.test(current);

    if (!current || (isManifest && !currentIsManifest)) {
      tabStreamUrls[tabId] = details.url;
      notifyContentScript(tabId, details.url);
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

function isStreamUrl(url) {
  return STREAM_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function notifyContentScript(tabId, streamUrl) {
  chrome.tabs.sendMessage(tabId, {
    type: "konkon-stream-detected",
    streamUrl
  }).catch(() => { /* content script not ready yet */ });
}

// ─── Context menu clicks ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "download-video-with-konkon") {
    // For <video> right-click: use the src attribute if direct, else page URL for yt-dlp
    const url = info.srcUrl || info.pageUrl || tab?.url;
    const referrer = info.pageUrl || tab?.url || "";
    sendToNativeHost(url, referrer);
    return;
  }

  const url = info.linkUrl || info.pageUrl || tab?.url;
  const referrer = info.pageUrl || tab?.url || "";

  if (!url) {
    notify("No downloadable URL found.");
    return;
  }

  sendToNativeHost(url, referrer);
});

// ─── Messages from content script ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "konkon-download-url" && message.url) {
    sendToNativeHost(message.url, message.referrer || sender.tab?.url || "")
      .then((response) => sendResponse(response));
    return true;
  }

  // Content script asking for the best known stream URL for its tab
  if (message?.type === "konkon-get-stream-url") {
    const tabId = sender.tab?.id;
    sendResponse({ streamUrl: tabStreamUrls[tabId] || null });
    return false;
  }

  return false;
});

// ─── Native host bridge ───────────────────────────────────────────────────────

async function sendToNativeHost(url, referrer = "") {
  try {
    const response = await chrome.runtime.sendNativeMessage(HOST_NAME, { url, referrer });
    const message = response?.message || "Sent to Silent Download Manager.";
    notify(message);
    return { ok: response?.ok !== false, message };
  } catch (error) {
    const message = "Native host is not registered yet.";
    notify(message);
    return { ok: false, message };
  }
}

function notify(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title: "Silent Download Manager",
    message
  });
}

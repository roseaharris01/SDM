const HOST_NAME = "com.sis.sdm";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "download-link-with-sdm",
    title: "Download with Silent Download Manager",
    contexts: ["link"]
  });

  chrome.contextMenus.create({
    id: "download-page-with-sdm",
    title: "Download current page with Silent Download Manager",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "download-video-with-sdm",
    title: "Download video with Silent Download Manager",
    contexts: ["video"]
  });
});

// Track tab navigations so right-click on video element sends page URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // No-op â€” kept for future use
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "download-video-with-sdm") {
    // Right-click on a <video> element:
    // If it's a video site (YouTube, Facebook etc.), send the page URL so yt-dlp handles it.
    // If it's a direct .mp4 src, send that.
    const pageUrl = info.pageUrl || tab?.url || "";
    const srcUrl = info.srcUrl || "";
    const isVideoSite = isKnownVideoSite(pageUrl);
    const urlToSend = isVideoSite ? pageUrl : (srcUrl || pageUrl);
    sendToNativeHost(urlToSend, pageUrl);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "sdm-download-url" && message.url) {
    sendToNativeHost(message.url, message.referrer || sender.tab?.url || "")
      .then((response) => sendResponse(response));
    return true;
  }
  return false;
});

function isKnownVideoSite(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const sites = [
      "youtube.com", "youtu.be",
      "facebook.com", "fb.watch",
      "instagram.com",
      "twitter.com", "x.com",
      "tiktok.com", "vimeo.com",
      "dailymotion.com", "twitch.tv",
      "reddit.com", "rumble.com", "odysee.com",
    ];
    return sites.some((s) => host === s || host.endsWith("." + s));
  } catch {
    return false;
  }
}

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


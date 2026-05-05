const KONKON_MEDIA_EXTENSIONS = [
  ".mp4", ".webm", ".mkv", ".mov", ".avi",
  ".mp3", ".m4a", ".wav", ".ogg",
  ".zip", ".rar", ".7z",
  ".pdf", ".exe", ".msi"
];

// These hosts are handled by yt-dlp via page URL — show the SDM button on them.
const KONKON_VIDEO_HOSTS = [
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch",
  "instagram.com", "www.instagram.com",
  "twitter.com", "www.twitter.com", "x.com", "www.x.com",
  "tiktok.com", "www.tiktok.com",
  "vimeo.com", "www.vimeo.com",
  "dailymotion.com", "www.dailymotion.com",
  "twitch.tv", "www.twitch.tv",
  "reddit.com", "www.reddit.com",
  "rumble.com", "www.rumble.com",
  "odysee.com", "www.odysee.com",
];

let konkonButton = null;
let konkonDetectedUrl = "";
let konkonIsVideoSite = false;
let konkonInterceptedStreamUrl = null;

// ─── Listen for stream URLs intercepted by background.js ─────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "konkon-stream-detected" && message.streamUrl) {
    konkonInterceptedStreamUrl = message.streamUrl;
    // Refresh button label to show stream was found
    if (konkonButton && konkonIsVideoSite) {
      konkonButton.textContent = "Download video with SDM ✓";
    }
  }
});

// ─── Initial scan + mutation observer ────────────────────────────────────────

scanForDownloadable();
new MutationObserver(debounce(scanForDownloadable, 700)).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src", "href"]
});

function scanForDownloadable() {
  const hostname = location.hostname.toLowerCase();

  // ── Case 1: known video site — show yt-dlp button ──
  if (isVideoHost(hostname)) {
    if (isVideoPage(location.href)) {
      konkonDetectedUrl = location.href;
      konkonIsVideoSite = true;
      showButton(buildVideoButtonLabel());
    } else {
      removeButton();
    }
    return;
  }

  // ── Case 2: direct file link on a regular page ──
  konkonIsVideoSite = false;
  const mediaUrl = findBestDirectMediaUrl();

  if (mediaUrl) {
    konkonDetectedUrl = mediaUrl;
    showButton("Download with SDM");
  } else {
    removeButton();
  }
}

// ─── Video page detection ─────────────────────────────────────────────────────

function isVideoHost(hostname) {
  return KONKON_VIDEO_HOSTS.some(
    (h) => hostname === h || hostname.endsWith("." + h)
  );
}

function isVideoPage(url) {
  const videoPagePatterns = [
    // YouTube
    /youtube\.com\/watch/i,
    /youtu\.be\/.+/i,
    /youtube\.com\/shorts\//i,
    // Facebook — any page on facebook.com with a path (videos, reels, watch, posts, stories)
    /facebook\.com\//i,
    /fb\.watch\/.+/i,
    // Instagram
    /instagram\.com\/(?:p|reel|tv)\//i,
    // Twitter / X
    /(?:twitter|x)\.com\/.+\/status\//i,
    // TikTok
    /tiktok\.com\/@[^/]+\/video\//i,
    // Vimeo
    /vimeo\.com\/\d+/i,
    // Dailymotion
    /dailymotion\.com\/video\//i,
    // Twitch
    /twitch\.tv\/(?:videos\/\d+|[^/]+\/clip\/)/i,
    // Reddit
    /reddit\.com\/r\/[^/]+\/comments\//i,
    // Rumble
    /rumble\.com\/v/i,
    // Odysee
    /odysee\.com\/@[^/]+\//i,
  ];

  return videoPagePatterns.some((p) => p.test(url));
}

function buildVideoButtonLabel() {
  if (konkonInterceptedStreamUrl) {
    return "Download video with SDM ✓";
  }

  const host = location.hostname.replace(/^www\./, "").replace(/^m\./, "");
  return `Download video with SDM`;
}

// ─── Direct media URL scan (non-video-site pages) ────────────────────────────

function findBestDirectMediaUrl() {
  const candidates = [];

  document.querySelectorAll("video[src], audio[src], source[src]").forEach((el) => {
    candidates.push(el.currentSrc || el.src);
  });

  document.querySelectorAll("a[href]").forEach((a) => {
    candidates.push(a.href);
  });

  return candidates
    .map(normalizeUrl)
    .filter(Boolean)
    .find(isDirectDownloadUrl) || "";
}

function normalizeUrl(url) {
  try {
    return new URL(url, location.href).href;
  } catch {
    return "";
  }
}

function isDirectDownloadUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const pathname = parsed.pathname.toLowerCase();
    return KONKON_MEDIA_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

// ─── Button ───────────────────────────────────────────────────────────────────

function showButton(label) {
  if (!konkonButton) {
    konkonButton = document.createElement("button");
    konkonButton.type = "button";
    konkonButton.style.cssText = [
      "position: fixed",
      "right: 18px",
      "bottom: 18px",
      "z-index: 2147483647",
      "height: 40px",
      "padding: 0 16px",
      "border: 0",
      "border-radius: 6px",
      "background: #1f6feb",
      "color: white",
      "font: 600 13px Segoe UI, Arial, sans-serif",
      "box-shadow: 0 8px 24px rgba(16,35,63,.28)",
      "cursor: pointer",
      "transition: background 0.2s",
      "white-space: nowrap",
    ].join(";");

    konkonButton.addEventListener("click", onButtonClick);
    document.documentElement.appendChild(konkonButton);
  }

  konkonButton.textContent = label;
  konkonButton.title = konkonIsVideoSite
    ? "Send this video page to Silent Download Manager (yt-dlp)"
    : "Send detected file to Silent Download Manager";
}

function onButtonClick() {
  if (!konkonDetectedUrl) return;

  setButtonState("Sending…", "#475467");

  // For video sites, ask background for the best URL to send:
  // prefer intercepted stream manifest, fall back to page URL (yt-dlp handles it).
  const urlToSend = konkonIsVideoSite
    ? (konkonInterceptedStreamUrl || konkonDetectedUrl)
    : konkonDetectedUrl;

  // Always send page URL as referrer for video sites.
  const referrer = konkonIsVideoSite ? location.href : "";

  chrome.runtime.sendMessage(
    { type: "konkon-download-url", url: urlToSend, referrer },
    (response) => {
      if (chrome.runtime.lastError) {
        setButtonState("Extension error", "#d92d20");
        resetButtonSoon();
        return;
      }

      if (response?.ok) {
        setButtonState("Sent ✓", "#12805c");
      } else {
        setButtonState(response?.message || "Bridge not ready", "#d92d20");
      }

      resetButtonSoon();
    }
  );
}

function setButtonState(text, color) {
  if (!konkonButton) return;
  konkonButton.textContent = text;
  konkonButton.style.background = color;
}

function resetButtonSoon() {
  setTimeout(() => {
    if (!konkonButton) return;
    konkonButton.textContent = konkonIsVideoSite ? buildVideoButtonLabel() : "Download with SDM";
    konkonButton.style.background = "#1f6feb";
  }, 2400);
}

function removeButton() {
  konkonDetectedUrl = "";
  konkonIsVideoSite = false;
  if (konkonButton) {
    konkonButton.remove();
    konkonButton = null;
  }
}

function debounce(fn, wait) {
  let t;
  return () => { clearTimeout(t); t = setTimeout(fn, wait); };
}

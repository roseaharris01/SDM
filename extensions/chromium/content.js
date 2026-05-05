const KONKON_MEDIA_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mkv",
  ".mov",
  ".avi",
  ".mp3",
  ".m4a",
  ".wav",
  ".ogg",
  ".zip",
  ".rar",
  ".7z",
  ".pdf",
  ".exe",
  ".msi"
];

const KONKON_BLOCKED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "netflix.com",
  "www.netflix.com"
];

let konkonButton;
let konkonDetectedUrl = "";

scanForDirectMedia();
new MutationObserver(debounce(scanForDirectMedia, 700)).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src", "href"]
});

function scanForDirectMedia() {
  if (isBlockedHost(location.hostname)) {
    removeButton();
    return;
  }

  const mediaUrl = findBestDirectMediaUrl();

  if (!mediaUrl) {
    removeButton();
    return;
  }

  konkonDetectedUrl = mediaUrl;
  showButton();
}

function findBestDirectMediaUrl() {
  const candidates = [];

  document.querySelectorAll("video[src], audio[src], source[src]").forEach((element) => {
    candidates.push(element.currentSrc || element.src);
  });

  document.querySelectorAll("a[href]").forEach((anchor) => {
    candidates.push(anchor.href);
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
  const parsed = new URL(url);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return false;
  }

  const pathname = parsed.pathname.toLowerCase();
  return KONKON_MEDIA_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

function showButton() {
  if (konkonButton) {
    return;
  }

  konkonButton = document.createElement("button");
  konkonButton.type = "button";
  konkonButton.textContent = "Download with SDM";
  konkonButton.title = "Send detected direct media link to Silent Download Manager";
  konkonButton.style.cssText = [
    "position: fixed",
    "right: 18px",
    "bottom: 18px",
    "z-index: 2147483647",
    "height: 40px",
    "padding: 0 14px",
    "border: 0",
    "border-radius: 6px",
    "background: #1f6feb",
    "color: white",
    "font: 600 13px Segoe UI, Arial, sans-serif",
    "box-shadow: 0 8px 24px rgba(16,35,63,.24)",
    "cursor: pointer"
  ].join(";");

  konkonButton.addEventListener("click", () => {
    if (!konkonDetectedUrl) {
      return;
    }

    setButtonState("Sending...", "#475467");

    chrome.runtime.sendMessage({
      type: "konkon-download-url",
      url: konkonDetectedUrl,
      referrer: location.href
    }, (response) => {
      if (chrome.runtime.lastError) {
        setButtonState("Extension error", "#d92d20");
        resetButtonSoon();
        return;
      }

      if (response?.ok) {
        setButtonState("Sent to SDM", "#12805c");
      } else {
        setButtonState(response?.message || "Bridge not ready", "#d92d20");
      }

      resetButtonSoon();
    });
  });

  document.documentElement.appendChild(konkonButton);
}

function setButtonState(text, color) {
  if (!konkonButton) {
    return;
  }

  konkonButton.textContent = text;
  konkonButton.style.background = color;
}

function resetButtonSoon() {
  setTimeout(() => {
    if (!konkonButton) {
      return;
    }

    konkonButton.textContent = "Download with SDM";
    konkonButton.style.background = "#1f6feb";
  }, 2400);
}

function removeButton() {
  konkonDetectedUrl = "";

  if (konkonButton) {
    konkonButton.remove();
    konkonButton = undefined;
  }
}

function isBlockedHost(hostname) {
  const normalized = hostname.toLowerCase();
  return KONKON_BLOCKED_HOSTS.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

function debounce(callback, wait) {
  let timeoutId;

  return () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(callback, wait);
  };
}

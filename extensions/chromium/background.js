const HOST_NAME = "com.konkon.download_manager";

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
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab?.url;
  const referrer = info.pageUrl || tab?.url || "";

  if (!url) {
    notify("No downloadable URL found.");
    return;
  }

  sendToNativeHost(url, referrer);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "konkon-download-url" || !message.url) {
    return false;
  }

  sendToNativeHost(message.url, message.referrer || sender.tab?.url || "")
    .then((response) => sendResponse(response));

  return true;
});

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

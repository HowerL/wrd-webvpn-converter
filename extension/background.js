import { encryptUrl } from "./convert.js";

const STORAGE_KEY = "baseURL";

function normalizeBaseUrl(p) {
  if (!p) return "";
  p = String(p).trim();
  while (p.endsWith("/")) p = p.slice(0, -1);
  if (!/^https?:\/\//i.test(p)) {
    p = "https://" + p;
  }
  return p;
}

function getStoredBaseUrl() {
  return new Promise((res) => {
    try {
      chrome.storage.local.get([STORAGE_KEY], (o) =>
        res((o && o[STORAGE_KEY]) || "")
      );
    } catch (e) {
      res("");
    }
  });
}

// create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "convert-vpn",
      title: "跳转至 WebVPN",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  } catch (e) {
    console.error("Failed to create context menu", e);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "convert-vpn") return;
  const pageUrl = (tab && tab.url) || info.pageUrl || "";
  if (!/^https?:\/\//i.test(pageUrl)) return;
  try {
    const encryptedPath = encryptUrl(pageUrl);
    const stored = await getStoredBaseUrl();
    const rawBase = stored || "webvpn.xauat.edu.cn";
    const finalBase = normalizeBaseUrl(rawBase);
    if (!finalBase) return;
    const finalUrl = finalBase + encryptedPath;
    if (tab && typeof tab.id !== "undefined") {
      chrome.tabs.update(tab.id, { url: finalUrl });
    }
  } catch (e) {
    console.error("Error generating VPN URL from context menu", e);
  }
});

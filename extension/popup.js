import { encryptUrl } from "./convert.js";

const STORAGE_KEY = "baseURL";

// i18n helper
function i18n(key) {
  return chrome.i18n.getMessage(key) || key;
}

// apply i18n to page
function applyI18n() {
  // elements with data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = i18n(key);
  });
  // elements with data-i18n-placeholder attribute
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = i18n(key);
  });
  // page title
  document.title = i18n("extName");
}

function normalizeBaseUrl(p) {
  if (!p) return "";
  p = String(p).trim();
  // remove trailing slash
  while (p.endsWith("/")) p = p.slice(0, -1);
  // if no protocol, default to https://
  if (!/^https?:\/\//i.test(p)) {
    p = "https://" + p;
  }
  return p;
}

function setMessage(text, isError = true) {
  const el = document.getElementById("message");
  el.textContent = text || "";
  el.style.color = isError ? "#b22222" : "#006400";
}

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => setMessage(i18n("msgCopiedToClipboard"), false))
    .catch((e) => setMessage(i18n("msgCopyFailed") + ": " + String(e)));
}

function showResult(url) {
  const ta = document.getElementById("resultUrl");
  ta.value = url;
}

function getCurrentTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return resolve("");
      resolve(tabs[0].url || "");
    });
  });
}

async function generateVpnUrl() {
  try {
    const url = await getCurrentTabUrl();
    if (!url) {
      setMessage(i18n("msgCannotGetUrl"));
      return;
    }
    // refuse non-http/https protocols
    if (!isHttpOrHttps(url)) {
      setMessage(i18n("msgNotHttpProtocol"), true);
      return "";
    }
    const encryptedPath = encryptUrl(url);
    // load stored baseURL and current input, prefer input -> stored -> built-in default
    const storedObj = await new Promise((res) =>
      chrome.storage.local.get([STORAGE_KEY], (o) => res(o || {}))
    );
    const stored = storedObj[STORAGE_KEY] || "";
    const baseUrlInput = (
      document.getElementById("baseUrl").value || ""
    ).trim();
    const rawBaseUrl = baseUrlInput || stored || "webvpn.xauat.edu.cn";
    const finalBaseUrl = normalizeBaseUrl(rawBaseUrl);
    if (!finalBaseUrl) {
      setMessage(i18n("msgInvalidBaseUrl"));
      return "";
    }
    const finalUrl = finalBaseUrl + encryptedPath;
    showResult(finalUrl);
    setMessage("", false);
    return finalUrl;
  } catch (err) {
    setMessage(i18n("msgEncryptFailed") + ": " + String(err));
    return "";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // apply i18n translations
  applyI18n();

  // show current URL on load
  const url = await getCurrentTabUrl();
  // disable/enable buttons depending on protocol of current tab
  updateUiForUrl(url);

  // restore saved baseURL (or keep HTML default)
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const v = result[STORAGE_KEY];
    if (v) {
      const input = document.getElementById("baseUrl");
      input.value = v;
    }
  });

  // save baseURL button
  document.getElementById("btnSaveBaseUrl").addEventListener("click", () => {
    const v = document.getElementById("baseUrl").value || "";
    const normalized = normalizeBaseUrl(v);
    if (!normalized) return setMessage(i18n("msgEnterValidBaseUrl"));
    chrome.storage.local.set({ [STORAGE_KEY]: normalized }, () => {
      setMessage(i18n("msgBaseUrlSaved"), false);
      document.getElementById("baseUrl").value = normalized;
    });
  });

  document.getElementById("btnRedirect").addEventListener("click", async () => {
    const finalUrl = await generateVpnUrl();
    if (finalUrl) {
      // redirect current tab to VPN URL
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        chrome.tabs.update(tabs[0].id, { url: finalUrl });
      });
    }
  });

  // convert-only: generate VPN URL but do not open it
  const btnConvertEl = document.getElementById("btnConvertOnly");
  if (btnConvertEl) {
    btnConvertEl.addEventListener("click", async () => {
      const finalUrl = await generateVpnUrl();
      if (finalUrl) {
        setMessage("", false);
      }
    });
  }

  document.getElementById("btnCopy").addEventListener("click", () => {
    const v = document.getElementById("resultUrl").value;
    if (!v) return setMessage(i18n("msgNoGeneratedUrl"));
    copyToClipboard(v);
  });

  document.getElementById("btnOpenNew").addEventListener("click", () => {
    const v = document.getElementById("resultUrl").value;
    if (!v) return setMessage(i18n("msgNoGeneratedUrl"));
    chrome.tabs.create({ url: v });
  });
});

function isHttpOrHttps(u) {
  if (!u) return false;
  return /^https?:\/\//i.test(String(u));
}

function updateUiForUrl(u) {
  const disabled = !isHttpOrHttps(u);
  const btnRedirect = document.getElementById("btnRedirect");
  const btnConvertOnly = document.getElementById("btnConvertOnly");
  const btnCopy = document.getElementById("btnCopy");
  const btnOpenNew = document.getElementById("btnOpenNew");
  if (btnRedirect) btnRedirect.disabled = disabled;
  if (btnConvertOnly) btnConvertOnly.disabled = disabled;
  if (btnCopy) btnCopy.disabled = disabled;
  if (btnOpenNew) btnOpenNew.disabled = disabled;
  if (disabled) {
    setMessage(i18n("msgNotHttpProtocol"), true);
  } else {
    setMessage("", false);
  }
}

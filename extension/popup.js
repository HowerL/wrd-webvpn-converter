import { encryptUrl } from "./convert.js";

const STORAGE_KEY = "baseURL";

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
    .then(() => setMessage("已复制到剪贴板", false))
    .catch((e) => setMessage("复制失败: " + String(e)));
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
      setMessage("无法获取当前标签页 URL");
      return;
    }
    // refuse non-http/https protocols
    if (!isHttpOrHttps(url)) {
      setMessage("当前标签页不是 http(s) 协议，无法生成 WebVPN URL。", true);
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
      setMessage("无效的基础 URL，请填写一个有效域名");
      return "";
    }
    const finalUrl = finalBaseUrl + encryptedPath;
    showResult(finalUrl);
    setMessage("", false);
    return finalUrl;
  } catch (err) {
    setMessage("加密失败: " + String(err));
    return "";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
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
    if (!normalized) return setMessage("请输入有效的基础 URL");
    chrome.storage.local.set({ [STORAGE_KEY]: normalized }, () => {
      setMessage("基础 URL 已保存", false);
      document.getElementById("baseUrl").value = normalized;
    });
  });

  document.getElementById("btnConvert").addEventListener("click", async () => {
    const finalUrl = await generateVpnUrl();
    if (finalUrl) {
      // redirect current tab to VPN URL
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        chrome.tabs.update(tabs[0].id, { url: finalUrl });
      });
    }
  });

  // transform-only: generate VPN URL but do not open it
  const btnTransformEl = document.getElementById("btnTransform");
  if (btnTransformEl) {
    btnTransformEl.addEventListener("click", async () => {
      const finalUrl = await generateVpnUrl();
      if (finalUrl) {
        setMessage("", false);
      }
    });
  }

  document.getElementById("btnCopy").addEventListener("click", () => {
    const v = document.getElementById("resultUrl").value;
    if (!v) return setMessage("没有生成的 WebVPN URL");
    copyToClipboard(v);
  });

  document.getElementById("btnOpenNew").addEventListener("click", () => {
    const v = document.getElementById("resultUrl").value;
    if (!v) return setMessage("没有生成的 WebVPN URL");
    chrome.tabs.create({ url: v });
  });
});

function isHttpOrHttps(u) {
  if (!u) return false;
  return /^https?:\/\//i.test(String(u));
}

function updateUiForUrl(u) {
  const disabled = !isHttpOrHttps(u);
  const btnConvert = document.getElementById("btnConvert");
  const btnTransform = document.getElementById("btnTransform");
  const btnCopy = document.getElementById("btnCopy");
  const btnOpenNew = document.getElementById("btnOpenNew");
  if (btnConvert) btnConvert.disabled = disabled;
  if (btnTransform) btnTransform.disabled = disabled;
  if (btnCopy) btnCopy.disabled = disabled;
  if (btnOpenNew) btnOpenNew.disabled = disabled;
  if (disabled) {
    setMessage("当前标签页不是 http(s) 协议，无法生成 WebVPN URL。", true);
  } else {
    setMessage("", false);
  }
}

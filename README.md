# WRD WebVPN Converter

一个针对 Chromium 内核浏览器（如 Chrome / Microsoft Edge）的扩展，用于把当前标签页的 URL 转换为 WRD WebVPN 可接受的加密 URL 并跳转。适用于北京网瑞达科技有限公司的资源访问控制网关（WebVPN）的产品。

## Quick Start

- **Install deps:**

```bat
npm install
```

- **Build extension:**

```bat
npm run build-extension
```

- **Load unpacked extension:** 在扩展管理页开启开发者模式，选择 `dist` 目录。

## 主要功能

- 读取当前标签页 URL、使用 `encryptUrl` 生成 WebVPN URL，可选择跳转、复制或在新标签页打开
- 右键菜单中显示 “跳转至 WebVPN”，点击后在当前标签页跳转到生成的 WebVPN URL

## 关键文件

- `popup.html`, `popup.js`：弹出用户交互界面与逻辑，持久化键为 `baseURL`
- `convert.js`：加密逻辑，AES key 硬编码为 `wrdvpnisthebest!`
- `background.js`：注册页面上下文菜单，点击时读取 `baseURL` 并跳转

## 运行环境

- Node.js >= 20
- 支持 Manifest V3 扩展的 Chromium 内核浏览器

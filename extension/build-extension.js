// Bundles the extension popup (including aes-js and convert.js) into `extension/dist`

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

async function build() {
  const outdir = path.join(__dirname, "dist");
  // ensure a clean output directory: remove existing `dist` and recreate it
  if (fs.existsSync(outdir)) {
    try {
      console.log("Cleaning existing dist directory...");
      // Node 14.14+ supports fs.rmSync; fallback to rmdirSync for older versions
      if (fs.rmSync) {
        fs.rmSync(outdir, { recursive: true, force: true });
      } else {
        // remove contents recursively
        const removeDir = (dir) => {
          for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry);
            const stat = fs.lstatSync(full);
            if (stat.isDirectory()) removeDir(full);
            else fs.unlinkSync(full);
          }
          fs.rmdirSync(dir);
        };
        removeDir(outdir);
      }
    } catch (e) {
      console.warn(
        "Failed to clean dist directory, continuing:",
        e && e.message
      );
    }
  }
  fs.mkdirSync(outdir, { recursive: true });

  console.log("Bundling popup and background with esbuild...");
  await esbuild.build({
    entryPoints: [
      path.join(__dirname, "popup.js"),
      path.join(__dirname, "background.js"),
    ],
    bundle: true,
    minify: true,
    platform: "browser",
    outdir: outdir,
    // preserve module format suitable for extension service worker
    format: "esm",
  });

  // copy popup.html and manifest.json (and any other static files)
  fs.copyFileSync(
    path.join(__dirname, "popup.html"),
    path.join(outdir, "popup.html")
  );
  const manifestSrc = path.join(__dirname, "manifest.json");
  const manifestDst = path.join(outdir, "manifest.json");
  fs.copyFileSync(manifestSrc, manifestDst);

  // copy icon files declared in manifest.icons (if present)
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestSrc, "utf8"));
    if (manifest && manifest.icons) {
      for (const key of Object.keys(manifest.icons)) {
        const iconPath = manifest.icons[key];
        if (!iconPath) continue;
        const srcIcon = path.join(__dirname, iconPath);
        const dstIcon = path.join(outdir, iconPath);
        if (fs.existsSync(srcIcon)) {
          const dstDir = path.dirname(dstIcon);
          if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
          fs.copyFileSync(srcIcon, dstIcon);
          console.log("Copied icon", iconPath);
        }
      }
    }
  } catch (e) {
    console.warn("Failed to parse manifest for icons:", e.message);
  }

  // also copy any files in an `icons/` directory if present
  const iconsDir = path.join(__dirname, "icons");
  if (fs.existsSync(iconsDir) && fs.lstatSync(iconsDir).isDirectory()) {
    const files = fs.readdirSync(iconsDir);
    for (const f of files) {
      const src = path.join(iconsDir, f);
      const dst = path.join(outdir, "icons", f);
      const dstDir = path.dirname(dst);
      if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
      fs.copyFileSync(src, dst);
      console.log("Copied icons/", f);
    }
  }

  // zip the dist into dist/extension.zip (placed inside outdir)
  const zipPath = path.join(outdir, "extension.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", function () {
    console.log(archive.pointer() + " total bytes");
    console.log("Extension zip written to " + zipPath);
  });

  archive.on("error", function (err) {
    throw err;
  });

  archive.pipe(output);
  // add all files from outdir but ignore the zip we're creating
  archive.glob("**/*", {
    cwd: outdir,
    dot: true,
    ignore: [path.basename(zipPath)],
  });
  await archive.finalize();
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});

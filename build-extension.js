// Bundles the extension popup (including aes-js and convert.js) into `dist`

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

/**
 * Compare two semver version strings and return the larger one
 * @param {string} v1 - First version string (e.g., "1.2.3")
 * @param {string} v2 - Second version string (e.g., "1.2.4")
 * @returns {string} The larger version string
 */
function getMaxVersion(v1, v2) {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return v1;
    if (num2 > num1) return v2;
  }

  return v1; // versions are equal
}

/**
 * Synchronize version numbers between package.json and manifest.json
 * Takes the larger version and updates both files
 */
function syncVersions() {
  const packagePath = path.join(__dirname, "package.json");
  const manifestPath = path.join(__dirname, "extension", "manifest.json");

  // Read both files
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const manifestJson = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const packageVersion = packageJson.version || "0.0.0";
  const manifestVersion = manifestJson.version || "0.0.0";

  console.log(
    `Current versions - package.json: ${packageVersion}, manifest.json: ${manifestVersion}`
  );

  // Get the larger version
  const maxVersion = getMaxVersion(packageVersion, manifestVersion);

  if (maxVersion !== packageVersion || maxVersion !== manifestVersion) {
    console.log(`Syncing both files to version ${maxVersion}`);

    // Update package.json if needed
    if (packageVersion !== maxVersion) {
      packageJson.version = maxVersion;
      fs.writeFileSync(
        packagePath,
        JSON.stringify(packageJson, null, 2) + "\n",
        "utf8"
      );
      console.log(`Updated package.json version to ${maxVersion}`);
    }

    // Update manifest.json if needed
    if (manifestVersion !== maxVersion) {
      manifestJson.version = maxVersion;
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(manifestJson, null, 2) + "\n",
        "utf8"
      );
      console.log(`Updated manifest.json version to ${maxVersion}`);
    }
  } else {
    console.log(`Versions are already in sync at ${maxVersion}`);
  }

  return maxVersion;
}

async function build() {
  // Sync versions before building
  const version = syncVersions();
  console.log(`Building extension version ${version}\n`);

  const outdir = path.join(__dirname, "dist");
  const extensionDir = path.join(__dirname, "extension");

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
      path.join(extensionDir, "popup.js"),
      path.join(extensionDir, "background.js"),
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
    path.join(extensionDir, "popup.html"),
    path.join(outdir, "popup.html")
  );
  const manifestSrc = path.join(extensionDir, "manifest.json");
  const manifestDst = path.join(outdir, "manifest.json");
  fs.copyFileSync(manifestSrc, manifestDst);

  // copy icon files declared in manifest.icons (if present)
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestSrc, "utf8"));
    if (manifest && manifest.icons) {
      for (const key of Object.keys(manifest.icons)) {
        const iconPath = manifest.icons[key];
        if (!iconPath) continue;
        const srcIcon = path.join(extensionDir, iconPath);
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

  /* also copy any files in an `icons/` directory if present
  const iconsDir = path.join(extensionDir, "icons");
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
  */

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

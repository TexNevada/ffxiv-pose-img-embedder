# XIV Archive Pose Image Embedder - Installation Guide

This extension adds a "Download Pose w/ Image" button to xivmodarchive.com mod pages, embedding the preview image, author, and tags into the `.pose` file.

## 🛠️ Chrome / Chromium-based
1. Open Chrome and go to `chrome://extensions/`
2. Turn on **Developer mode** (top right corner).
3. Click **Load unpacked**.
4. Select the `webapp/` folder in this repository.
   - *Note:* Alternatively, you can use `webapp_chrome.zip` if you want to keep the extension as a single archive, but you must still load it via "Load unpacked" after unzipping it or drag-and-drop.

## 🦊 Firefox
1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select any file inside the `webapp/` folder (e.g., `manifest.json`).
   - *Note:* Temporary add-ons are removed when Firefox restarts. To install permanently, you would need to use a signed XPI or a developer/ESR version of Firefox that allows unsigned extensions.

## 📦 Using the Pre-built ZIP Files
The repository includes pre-built ZIP files for each browser:
- `webapp_chrome.zip`: Configured with a `service_worker` (required for Chrome MV3).
- `webapp_firefox.zip`: Configured with `background.scripts` (best compatibility for Firefox/Floorp).

### How to rebuild the ZIP files:
If you modify the source code in the `webapp/` folder, run the build script to update the ZIP packages:
```bash
python build.py
```
This script automatically transforms the base `manifest.json` for Firefox compatibility.

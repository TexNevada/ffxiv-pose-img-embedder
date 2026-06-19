import json
import zipfile
import os

def build_extension():
    # File list (excluding zips and manifest itself).
    # Paths are repo-relative; they are written into the archive at the
    # same relative path so manifest references like "static/icon48.png"
    # resolve correctly when the extension is loaded.
    files = [
        "background.js",
        "content.js",
        "jszip.js",
        "static/icon48.png",
        "static/icon128.png",
    ]
    
    # Read base manifest (Chrome-compatible)
    with open("manifest.json", "r", encoding="utf-8") as f:
        manifest = json.load(f)

    # 1. Build Chrome Zip (uses service_worker)
    print("Building Chrome Zip (service_worker)...")
    with zipfile.ZipFile("webapp_chrome.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.write("manifest.json", "manifest.json")
        for f in files:
            z.write(f, f)
    print("✓ Created webapp_chrome.zip")

    # 2. Build Firefox Zip (uses scripts)
    print("Building Firefox Zip (scripts)...")
    # Modify manifest for Firefox
    firefox_manifest = manifest.copy()
    if "background" in firefox_manifest:
        # Swap service_worker for scripts
        service_worker = firefox_manifest["background"].get("service_worker")
        if service_worker:
            del firefox_manifest["background"]["service_worker"]
            firefox_manifest["background"]["scripts"] = [service_worker]

    # Write temporary Firefox manifest
    with open("manifest_firefox.json", "w", encoding="utf-8") as f:
        json.dump(firefox_manifest, f, indent=2)

    with zipfile.ZipFile("webapp_firefox.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.write("manifest_firefox.json", "manifest.json")
        for f in files:
            z.write(f, f)
    
    # Cleanup temp file
    os.remove("manifest_firefox.json")
    print("✓ Created webapp_firefox.zip")

if __name__ == "__main__":
    build_extension()

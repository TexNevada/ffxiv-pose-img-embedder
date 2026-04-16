// Is this vibe coded? Yes. 
// Does it matter? Not really. I just wanted something quick that works. 
// I always go over the code before I publish them.

// content.js — XIV Archive Pose Image Embedder (Cross-Browser Extension)
// Injects a "Download Pose w/ Image" button on xivmodarchive.com mod pages
// that embeds the preview image (base64), author name, and tags into the .pose file.

(function () {
  "use strict";

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Return the download URL from the page's "Download Mod" link.
   * Returns null when no link is found.
   */
  function getModDownloadUrl() {
    const anchor = document.querySelector("#mod-download-link");
    if (!anchor) return null;
    return anchor.href || null;
  }

  /**
   * Check whether the download link points to a .pose file.
   */
  function isPoseDownload(url) {
    if (!url) return false;
    try {
      const pathname = new URL(url).pathname;
      return decodeURIComponent(pathname).toLowerCase().endsWith(".pose");
    } catch {
      return false;
    }
  }

  /**
   * Derive a human-readable filename from the download URL path (fallback only).
   */
  function getFilenameFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const decoded = decodeURIComponent(pathname);
      const parts = decoded.split("/");
      return parts[parts.length - 1] || "updated.pose";
    } catch {
      return "updated.pose";
    }
  }

  /**
   * Extract filename from a Content-Disposition header value.
   * Supports both RFC 5987 (filename*=UTF-8''...) and plain (filename="...") forms.
   * Returns null if no filename is found.
   */
  function getFilenameFromContentDisposition(header) {
    if (!header) return null;

    // Try RFC 5987 encoded form first: filename*=UTF-8''some%20name.pose
    const rfc5987 = header.match(/filename\*\s*=\s*UTF-8''([^;\n\r]+)/i);
    if (rfc5987) {
      return decodeURIComponent(rfc5987[1].trim());
    }

    // Try quoted form: filename="some name.pose"
    const quoted = header.match(/filename\s*=\s*"([^"]+)"/i);
    if (quoted) {
      return quoted[1].trim();
    }

    // Try unquoted form: filename=some_name.pose
    const unquoted = header.match(/filename\s*=\s*([^;\n\r]+)/i);
    if (unquoted) {
      return unquoted[1].trim();
    }

    return null;
  }

  /**
   * Get the first static mod preview image URL from the carousel.
   */
  function getPreviewImageUrl() {
    const img = document.querySelector("#mod-images .carousel-inner img.mod-carousel-image");
    if (img && img.src) return img.src;
    return null;
  }

  /**
   * Extract the author name from the page.
   * Looks for the "Pose by <a>AuthorName</a>" pattern in the jumbotron header,
   * falling back to the user-card link in the sidebar.
   */
  function getAuthorName() {
    // Primary: "Pose by ..." line
    const leadParagraphs = document.querySelectorAll(".jumbotron .lead a");
    for (const a of leadParagraphs) {
      if (a.href && a.href.includes("/user/")) {
        const parent = a.closest("p");
        if (parent && parent.textContent.includes("Pose by")) {
          return a.textContent.trim();
        }
      }
    }
    // Fallback: user-card in the sidebar
    const userCardLink = document.querySelector(".user-card .user-card-link");
    if (userCardLink) return userCardLink.textContent.trim();
    return null;
  }

  /**
   * Extract all tags from the "Tags" metadata block on the page.
   * Returns an array of tag strings (may be empty).
   */
  function getTags() {
    const tags = [];
    const metaBlocks = document.querySelectorAll(".mod-meta-block");
    for (const block of metaBlocks) {
      // Find the block whose label text starts with "Tags"
      const textContent = block.childNodes[0]?.textContent || "";
      if (!textContent.trim().startsWith("Tags")) continue;
      const links = block.querySelectorAll("a");
      for (const a of links) {
        const tag = a.textContent.trim();
        if (tag) tags.push(tag);
      }
      break;
    }
    return tags;
  }

  async function fetchAsArrayBuffer(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    return resp.arrayBuffer();
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  /**
   * Check if the current page is categorized as a "Pose".
   */
  function isPoseCategory() {
    const leadParagraphs = document.querySelectorAll(".jumbotron .lead");
    for (const p of leadParagraphs) {
      if (p.textContent.includes("Pose by")) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resize an image (Blob) to fit within maxDim while preserving aspect ratio.
   * Skip resizing for animated GIFs.
   * Returns a base64 string.
   */
  async function resizeAndGetBase64(blob, maxDim = 720) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        
        // Skip resizing for animated GIFs (simple detection by MIME)
        if (blob.type === "image/gif") {
           const reader = new FileReader();
           reader.onloadend = () => resolve(reader.result.split(',')[1]);
           reader.readAsDataURL(blob);
           return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        // Detect and crop black borders (letterboxing / pillarboxing)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        // Threshold for "black" pixel (e.g. RGB < 15)
        const threshold = 15;
        const isBlack = (x, y) => {
          const idx = (y * w + x) * 4;
          return data[idx] < threshold && data[idx + 1] < threshold && data[idx + 2] < threshold;
        };

        let top = 0, bottom = h - 1, left = 0, right = w - 1;

        // Find top bound
        while (top < h) {
          let rowIsBlack = true;
          for (let x = 0; x < w; x++) {
            if (!isBlack(x, top)) { rowIsBlack = false; break; }
          }
          if (!rowIsBlack) break;
          top++;
        }

        // Find bottom bound
        while (bottom > top) {
          let rowIsBlack = true;
          for (let x = 0; x < w; x++) {
            if (!isBlack(x, bottom)) { rowIsBlack = false; break; }
          }
          if (!rowIsBlack) break;
          bottom--;
        }

        // Find left bound
        while (left < w) {
          let colIsBlack = true;
          for (let y = top; y <= bottom; y++) {
            if (!isBlack(left, y)) { colIsBlack = false; break; }
          }
          if (!colIsBlack) break;
          left++;
        }

        // Find right bound
        while (right > left) {
          let colIsBlack = true;
          for (let y = top; y <= bottom; y++) {
            if (!isBlack(right, y)) { colIsBlack = false; break; }
          }
          if (!colIsBlack) break;
          right--;
        }

        const cropWidth = (right - left) + 1;
        const cropHeight = (bottom - top) + 1;

        // Final dimensions with resize logic
        let finalWidth = cropWidth;
        let finalHeight = cropHeight;
        const largest = Math.max(finalWidth, finalHeight);

        if (largest > maxDim) {
          const scale = maxDim / largest;
          finalWidth = Math.max(1, Math.floor(finalWidth * scale));
          finalHeight = Math.max(1, Math.floor(finalHeight * scale));
        }

        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = finalWidth;
        finalCanvas.height = finalHeight;
        const finalCtx = finalCanvas.getContext("2d");
        
        // drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        finalCtx.drawImage(canvas, left, top, cropWidth, cropHeight, 0, 0, finalWidth, finalHeight);
        
        // Use the original format if possible, otherwise JPEG
        let mime = blob.type;
        if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
          mime = "image/jpeg";
        }
        
        const dataUrl = finalCanvas.toDataURL(mime, 0.95);
        resolve(dataUrl.split(",")[1]);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image for resizing"));
      };

      img.src = url;
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Main Logic ─────────────────────────────────────────────────────────

  /**
   * Perform the full merge:
   * 1. Download the .pose file (JSON), respecting the server-provided filename.
   * 2. Download the preview image and convert to base64.
   * 3. Inject Base64Image, Author, and Tags into the JSON.
   * 4. Offer the modified .pose file as a download using the original filename.
   */
  async function downloadPoseWithImage(downloadUrl, button) {
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…';

    try {
      // 1. Fetch the .pose file
      const poseResp = await fetch(downloadUrl);
      if (!poseResp.ok) throw new Error(`Failed to download .pose: ${poseResp.status}`);

      // Determine the filename the server intended to serve.
      // Priority: Content-Disposition header > URL path > fallback
      const contentDisposition = poseResp.headers.get("Content-Disposition");
      const filename =
        getFilenameFromContentDisposition(contentDisposition) ||
        getFilenameFromUrl(downloadUrl);

      const poseText = await poseResp.text();

      let poseJson;
      try {
        poseJson = JSON.parse(poseText);
      } catch {
        throw new Error("Downloaded .pose file is not valid JSON");
      }

      // 2. Fetch the preview image and convert to base64
      const imageUrl = getPreviewImageUrl();
      if (imageUrl) {
        const imageResp = await fetch(imageUrl);
        if (!imageResp.ok) throw new Error(`Failed to fetch preview image: ${imageResp.status}`);
        const imageBlob = await imageResp.blob();
        const base64Str = await resizeAndGetBase64(imageBlob, 720); // Resize to 720p (consistent with Python)
        poseJson["Base64Image"] = base64Str;
      }

      // 3. Inject author
      const author = getAuthorName();
      if (author) {
        // Sanitize to match Python limits: 50 chars
        const sanitizedAuthor = author.substring(0, 50).trim();
        if (sanitizedAuthor) {
          poseJson["Author"] = sanitizedAuthor;
        }
      }

      // 4. Inject tags
      const rawTags = getTags();
      if (rawTags.length > 0) {
        // Sanitize tags: no spaces, max 50 tags, unique
        const sanitizedTags = [...new Set(
          rawTags
            .map(t => t.replace(/\s+/g, ""))
            .filter(t => t.length > 0)
        )].slice(0, 50);

        if (sanitizedTags.length > 0) {
          poseJson["Tags"] = sanitizedTags;
        }
      }

      // 5. Serialize and download with the server-provided filename
      const outputJson = JSON.stringify(poseJson, null, 2);
      const blob = new Blob([outputJson], { type: "application/json" });
      downloadBlob(blob, filename);

    } catch (err) {
      console.error("[Pose Image Embedder]", err);
      alert("Pose Image Embedder Error:\n" + err.message);
    } finally {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }

  function sanitizePoseObject(obj) {
    // This helper exists to reflect the Python project's strictness
    // but here we just ensure we don't accidentally corrupt other keys.
    return obj;
  }

  // ── Button Injection ───────────────────────────────────────────────────

  function injectButton() {
    const downloadUrl = getModDownloadUrl();
    const isPoseFile = isPoseDownload(downloadUrl);
    const isPoseCat = isPoseCategory();

    if (!isPoseFile && !isPoseCat) return; // Not a .pose file and not in Pose category — do nothing

    // Find the container that holds the "Download Mod" button
    const downloadContainer = document.querySelector("#mod-download-link")?.closest(
      ".jumbotron"
    );
    if (!downloadContainer) return;

    // Create the new button
    const newBtn = document.createElement("button");
    newBtn.id = "download-pose-with-image-button";
    newBtn.type = "button";
    newBtn.className = "btn btn-primary"; // blue Bootstrap button
    
    if (isPoseCat && !isPoseFile) {
      // Edge case: Pose category but not a .pose file
      newBtn.style.cssText = "min-width:14rem; margin-bottom:0.5rem; background-color: #6c757d; border-color: #6c757d; color: white; font-weight: 600; cursor: not-allowed;";
      newBtn.innerHTML = '<i class="fas fa-exclamation-triangle"> </i> Pose file not detected';
      newBtn.title = "The category is 'Pose', but the download link does not point to a .pose file.";
      newBtn.disabled = true;
    } else {
      // Standard case: .pose file
      newBtn.style.cssText = "min-width:14rem; margin-bottom:0.5rem; background-color: #6a8dff; border-color: #6a8dff; color: white; font-weight: 600;";
      newBtn.innerHTML = '<i class="fas fa-images"> </i> Download Pose w/ Image';
      newBtn.title = "Downloads the .pose file with the mod preview image, author, and tags embedded.";

      newBtn.addEventListener("click", () => {
        downloadPoseWithImage(downloadUrl, newBtn);
      });
    }

    // Insert the new button ABOVE the existing download link
    downloadContainer.insertBefore(newBtn, downloadContainer.firstChild);
  }

  // ── Init ───────────────────────────────────────────────────────────────

  // Run when the DOM is ready (content script runs at document_idle)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else {
    injectButton();
  }
})();
// Is this vibe coded? Yes.
// Does it matter? Not really. I just wanted something quick that works.
// I always go over the code before I publish them.

// content.js — XIV Archive Pose Image Embedder (Cross-Browser Extension)
// Injects a "Download Pose / ZIP w/ Image" button on xivmodarchive.com mod pages
// that embeds the preview image (base64), author name, and tags into the .pose file
// (or into every .pose file found inside a downloaded ZIP archive).

(function () {
  "use strict";

  // ── Security Limits ────────────────────────────────────────────────────
  // ZIP archives are treated as untrusted input. These limits guard against
  // oversized archives, zip bombs, and runaway extraction.
  const MAX_ZIP_SIZE = 100 * 1024 * 1024;            // 100 MB compressed
  const MAX_UNCOMPRESSED_SIZE = 1024 * 1024 * 1024;  // 1 GB total uncompressed
  const MAX_FILES = 10000;                           // entries per archive
  const MAX_POSE_FILES = 1000;                       // pose entries per archive
  const MAX_POSE_SIZE = 10 * 1024 * 1024;            // 10 MB per pose
  const MAX_IMAGE_SIZE = 2 * 1024 * 1024;            // 2 MB preview image
  const MAX_COMPRESSION_RATIO = 100;                 // uncompressed/compressed

  // Dawntrail (FFXIV 7.0) officially released on July 2, 2024. Poses last
  // updated before this date often broke facial expressions and need a
  // visible warning even when the mod page still claims compatibility.
  const DAWNTRAIL_RELEASE = new Date(2024, 6, 2); // months are 0-indexed

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
   * Scan the "Other Files and Links" section for a usable archive link.
   *
   * Some mod pages point their main "Download Mod" button at an external
   * site (e.g. x.com / a Patreon post) and put the actual .zip in the
   * Files tab as a secondary listing. When that happens we still want
   * the extension to find and use the real archive.
   *
   * Preference order: .pose → .zip → .rar → .7z. The first match wins, so
   * supported formats are always picked ahead of formats that would only
   * trigger the explainer modal.
   *
   * Returns an absolute URL, or null when no recognisable archive link is
   * found in that section.
   */
  function getOtherFilesDownloadUrl() {
    let labelEl = null;
    for (const p of document.querySelectorAll("p.lead")) {
      if (p.textContent.trim().startsWith("Other Files and Links")) {
        labelEl = p;
        break;
      }
    }
    if (!labelEl) return null;

    // Walk forward to the <ul> that holds the listing.
    let listEl = null;
    let sib = labelEl.nextElementSibling;
    while (sib) {
      if (sib.tagName === "UL") {
        listEl = sib;
        break;
      }
      sib = sib.nextElementSibling;
    }
    if (!listEl) return null;

    let unsupportedMatch = null;
    for (const a of listEl.querySelectorAll("a")) {
      const href = a.href;
      if (!href) continue;
      if (isSupportedDownload(href)) {
        return href; // .pose / .zip wins immediately
      }
      if (!unsupportedMatch && getUnsupportedArchiveLabel(href)) {
        unsupportedMatch = href; // remember the first .rar / .7z fallback
      }
    }
    return unsupportedMatch;
  }

  /**
   * Resolve the download URL the extension should actually act on.
   * Prefers the primary "Download Mod" link when it points at something we
   * recognise; otherwise looks for a fallback in "Other Files and Links".
   *
   * Returns the primary link unchanged when nothing else is usable so
   * downstream UI (disabled "not detected" button, etc.) keeps working.
   */
  function getEffectiveDownloadUrl() {
    const primary = getModDownloadUrl();
    if (isSupportedDownload(primary) || getUnsupportedArchiveLabel(primary)) {
      return primary;
    }
    const fallback = getOtherFilesDownloadUrl();
    return fallback || primary;
  }

  function urlPathnameLower(url) {
    try {
      return decodeURIComponent(new URL(url).pathname).toLowerCase();
    } catch {
      return "";
    }
  }

  /**
   * Check whether the download link points to a .pose file.
   */
  function isPoseDownload(url) {
    if (!url) return false;
    return urlPathnameLower(url).endsWith(".pose");
  }

  /**
   * Check whether the download link points to a .zip archive.
   */
  function isZipDownload(url) {
    if (!url) return false;
    return urlPathnameLower(url).endsWith(".zip");
  }

  /**
   * True when the URL is something this extension can process.
   */
  function isSupportedDownload(url) {
    return isPoseDownload(url) || isZipDownload(url);
  }

  /**
   * Archives the site permits but this extension can't *modify and re-pack*
   * (.rar / .7z). When detected, the button switches to a red "click to
   * read more" affordance that opens an explainer modal rather than
   * attempting to download.
   */
  function getUnsupportedArchiveLabel(url) {
    if (!url) return null;
    const p = urlPathnameLower(url);
    if (p.endsWith(".rar")) return ".rar";
    if (p.endsWith(".7z")) return "7zip";
    return null;
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

  /**
   * Find the "Public Mod Permalink" anchor in the header and
   * return its absolute URL. Reading the .href property (not the raw
   * attribute) lets the browser resolve "/modid/123456" against the
   * current origin so we always embed a fully qualified URL.
   */
  function getModPermalink() {
    for (const a of document.querySelectorAll('a[href*="/modid/"]')) {
      if (a.textContent.trim() === "Public Mod Permalink") {
        return a.href || null;
      }
    }
    return null;
  }

  /**
   * Extract the mod description from the page. xivmodarchive renders it as
   *
   *   <p class="lead">Author's Comments:</p>
   *   <div class="px-2">… free-form text with <br> line breaks …</div>
   *
   * inside the "Info" tab. The page has several other .px-2 blocks (Files
   * tab, History tab, similar-mods cards), so we anchor on the label rather
   * than guessing by size.
   *
   * The mod's public permalink (when present) is appended after a blank
   * line so the downloaded pose carries a traceable link back to its
   * source page. If neither the description text nor the permalink can be
   * found we return null and the field is simply omitted.
   *
   * <br> nodes become real "\n" newlines and per-line whitespace is
   * normalized so HTML indentation doesn't leak into the embedded value.
   */
  function getDescription() {
    let descEl = null;
    for (const label of document.querySelectorAll("p.lead")) {
      if (!label.textContent.trim().startsWith("Author's Comments")) continue;
      // Walk forward to the first .px-2 sibling — that's the description.
      let next = label.nextElementSibling;
      while (next) {
        if (next.classList && next.classList.contains("px-2")) {
          descEl = next;
          break;
        }
        next = next.nextElementSibling;
      }
      if (descEl) break;
    }

    let body = null;
    if (descEl) {
      const clone = descEl.cloneNode(true);
      clone.querySelectorAll("br").forEach((br) => {
        br.replaceWith(document.createTextNode("\n"));
      });

      const cleaned = (clone.textContent || "")
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      body = cleaned || null;
    }

    const permalink = getModPermalink();
    if (!body && !permalink) return null;
    if (!permalink) return body;
    const credit = "Downloaded from: " + permalink;
    if (!body) return credit;
    return body + "\n\n" + credit;
  }

  /**
   * Parse the server-rendered "M/D/YYYY, h:mm:ss AM/PM" date the page emits
   * inside <code class="server-date">. Returns a Date or null if the string
   * doesn't look right — we'd rather skip the warning than mislabel a mod.
   */
  function parseServerDateText(text) {
    if (!text) return null;
    const m = String(text).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (!month || !day || !year) return null;
    return new Date(year, month - 1, day);
  }

  /**
   * Find the "Last Version Update" meta block and return both its raw
   * displayed text (preserved verbatim for embedding) and a parsed Date
   * (for the Dawntrail-cutoff comparison). Returns null when the block
   * isn't present.
   */
  function getLastVersionUpdate() {
    const metaBlocks = document.querySelectorAll(".mod-meta-block");
    for (const block of metaBlocks) {
      const firstText = block.childNodes[0]?.textContent || "";
      if (!firstText.trim().startsWith("Last Version Update")) continue;
      const dateNode = block.querySelector("code.server-date");
      if (!dateNode) return null;
      const text = (dateNode.textContent || "").trim();
      if (!text) return null;
      return { text, date: parseServerDateText(text) };
    }
    return null;
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
   * Reject ZIP entries with path traversal or absolute paths.
   * Accepts only safe, archive-relative paths.
   */
  function isSafeZipPath(path) {
    if (!path || typeof path !== "string") return false;
    // Normalize backslashes (some archives use Windows-style separators).
    const normalized = path.replace(/\\/g, "/");
    // Windows drive prefix like "C:/..."
    if (/^[a-zA-Z]:/.test(normalized)) return false;
    // Absolute POSIX path
    if (normalized.startsWith("/")) return false;
    // Any ".." segment
    for (const segment of normalized.split("/")) {
      if (segment === "..") return false;
    }
    return true;
  }

  /**
   * Read the uncompressed byte size of a JSZip entry. Centralized so future
   * JSZip API changes only require updating this function.
   */
  function getZipEntrySize(file) {
    return file?._data?.uncompressedSize ?? 0;
  }

  /**
   * Replace characters that are illegal on common filesystems (and any
   * control characters) so the browser's "save as" dialog gets a clean
   * value. Falls back to a sensible default if sanitization empties the
   * string.
   */
  function sanitizeFilename(filename, fallback) {
    const cleaned = String(filename || "")
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
      .trim();
    return cleaned || fallback;
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

  // ── Metadata Injection (shared) ────────────────────────────────────────

  /**
   * Apply Base64Image / Author / Description / Version / Tags to a parsed
   * pose JSON object. Used for both standalone .pose files and .pose entries
   * inside a ZIP. All sanitization (author length, tag dedupe/length/
   * whitespace) lives here so the rules are guaranteed to match across the
   * two flows.
   *
   * Existing values in the pose JSON are preserved — the plugin only fills
   * fields that are absent, null, an empty string, or an empty array.
   * Authors sometimes pre-fill Author (or other fields) by hand and we
   * never want to silently clobber that.
   *
   * Insertion order matches the order keys will appear in the serialized
   * JSON for entries that didn't already have these fields.
   */
  function applyPoseMetadata(poseJson, metadata = {}) {
    if (!poseJson || typeof poseJson !== "object") return poseJson;

    const { base64Image, author, description, version, tags } = metadata;

    // Treat null / undefined / empty string / empty array as "no value"
    // so we still backfill those. Anything else is treated as user-
    // provided data and left untouched.
    const hasExisting = (key) => {
      if (!(key in poseJson)) return false;
      const v = poseJson[key];
      if (v === null || v === undefined) return false;
      if (typeof v === "string") return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v);
    };

    if (base64Image && !hasExisting("Base64Image")) {
      poseJson["Base64Image"] = base64Image;
    }

    if (author && !hasExisting("Author")) {
      const sanitizedAuthor = String(author).substring(0, 50).trim();
      if (sanitizedAuthor) {
        poseJson["Author"] = sanitizedAuthor;
      }
    }

    if (description && !hasExisting("Description")) {
      const sanitizedDescription = String(description).trim();
      if (sanitizedDescription) {
        poseJson["Description"] = sanitizedDescription;
      }
    }

    if (version && !hasExisting("Version")) {
      const sanitizedVersion = String(version).trim();
      if (sanitizedVersion) {
        poseJson["Version"] = sanitizedVersion;
      }
    }

    if (Array.isArray(tags) && tags.length > 0 && !hasExisting("Tags")) {
      // Sanitize tags: no spaces, max 50 tags, unique
      const sanitizedTags = [...new Set(
        tags
          .map(t => String(t).replace(/\s+/g, ""))
          .filter(t => t.length > 0)
      )].slice(0, 50);

      if (sanitizedTags.length > 0) {
        poseJson["Tags"] = sanitizedTags;
      }
    }

    return poseJson;
  }

  // ── ZIP Processing ─────────────────────────────────────────────────────

  // File extensions we never want to probe as JSON. JSON.parse would just
  // throw on these anyway, but skipping by extension avoids decompressing
  // potentially huge textures/models when scanning for unflagged poses.
  const BINARY_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|dds|tex|tga|psd|mdl|fbx|obj|3ds|exe|dll|rar|7z|tar|gz|wav|mp3|ogg|mp4|webm|sklb|pap|mtrl|atex|imc|eqp|gmp|cmp|eqdp|est|tmb|scd|sgb|sgd)$/i;

  // Windows-executable extensions. A legitimate pose mod has zero reason
  // to ship an installer or binary; their presence inside a "pose" ZIP is
  // a strong indicator of repackaged malware, so the whole archive is
  // rejected outright instead of being modified and handed back.
  const FORBIDDEN_EXEC_RE = /\.(exe|msi)$/i;

  /**
   * Heuristic: does this parsed JSON look like an Anamnesis/Ktisis pose?
   *
   * The strongest signal is the explicit "FileExtension": ".pose" marker
   * both formats emit. As a fallback we accept any object that carries a
   * "Bones" key, which is highly pose/animation-specific.
   *
   * Conservative on purpose — false positives would mean rewriting random
   * JSON config files inside a mod archive, which is much worse than
   * missing the occasional unconventionally-shaped pose.
   */
  function looksLikePoseJson(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    if (typeof obj.FileExtension === "string" &&
        obj.FileExtension.toLowerCase() === ".pose") {
      return true;
    }
    if (obj.Bones && typeof obj.Bones === "object") {
      return true;
    }
    return false;
  }

  /**
   * Decide the on-archive path to write a detected (extension-less) pose
   * to. ".json" gets swapped for ".pose"; anything else has ".pose"
   * appended so the original name stays visible.
   */
  function poseRenameForPath(originalPath) {
    if (/\.json$/i.test(originalPath)) {
      return originalPath.replace(/\.json$/i, ".pose");
    }
    return originalPath + ".pose";
  }

  /**
   * Open a ZIP archive in memory, inject metadata into every valid .pose
   * entry, and return a freshly built ZIP blob. The archive is never
   * extracted to disk.
   *
   * Throws on hard limits (oversize, too many files, zip bomb) and on
   * archives that contained no modifiable pose files. Per-file problems
   * (bad path, oversize pose, invalid JSON) are logged and skipped so a
   * single bad entry never stops the whole archive.
   *
   * JSZip availability is a precondition — the caller must verify it.
   */
  async function processZipArchive(zipBuffer, metadata) {
    const compressedSize = zipBuffer.byteLength;

    if (compressedSize > MAX_ZIP_SIZE) {
      throw new Error(
        `ZIP archive exceeds maximum size of ${Math.round(MAX_ZIP_SIZE / (1024 * 1024))} MB.`
      );
    }

    let zip;
    try {
      zip = await JSZip.loadAsync(zipBuffer);
    } catch {
      throw new Error("Invalid or corrupted ZIP archive.");
    }

    // Collect entries up front so we can validate totals before touching files.
    const entries = [];
    zip.forEach((relPath, file) => {
      entries.push({ path: relPath, file });
    });

    if (entries.length > MAX_FILES) {
      throw new Error(
        `Archive contains too many files (>${MAX_FILES}).`
      );
    }

    // Hard reject: Windows executables / installers inside a pose archive
    // are essentially never legitimate. Surface the offending name(s) so
    // the user knows exactly which entry tripped the check.
    const forbiddenEntries = entries
      .filter((e) => !e.file.dir && FORBIDDEN_EXEC_RE.test(e.path))
      .map((e) => e.path);
    if (forbiddenEntries.length > 0) {
      const shown = forbiddenEntries.slice(0, 3).join(", ");
      const extra = forbiddenEntries.length > 3
        ? ` (and ${forbiddenEntries.length - 3} more)`
        : "";
      throw new Error(
        `ZIP file contains executable file(s): ${shown}${extra}. ` +
          "This is highly suspicious unless a VERY good reason is given. " +
          "This extension will refuse to download anything with an .exe or .msi file."
      );
    }

    let totalUncompressed = 0;
    let poseCount = 0;
    for (const entry of entries) {
      if (entry.file.dir) continue;
      // Size-check without decompressing untrusted data first.
      totalUncompressed += getZipEntrySize(entry.file);
      if (entry.path.toLowerCase().endsWith(".pose")) {
        poseCount++;
      }
    }

    if (totalUncompressed > MAX_UNCOMPRESSED_SIZE) {
      throw new Error(
        `Archive exceeds safe uncompressed size of ${Math.round(MAX_UNCOMPRESSED_SIZE / (1024 * 1024 * 1024))} GB.`
      );
    }
    if (poseCount > MAX_POSE_FILES) {
      throw new Error(
        `Archive contains too many pose files (>${MAX_POSE_FILES}).`
      );
    }
    if (compressedSize > 0 && (totalUncompressed / compressedSize) > MAX_COMPRESSION_RATIO) {
      throw new Error(
        `Compression ratio too high (possible ZIP bomb).`
      );
    }

    let modifiedCount = 0;
    let skippedCount = 0;
    let renamedCount = 0;

    for (const entry of entries) {
      if (entry.file.dir) continue;

      // Soft cap: if we've already modified MAX_POSE_FILES entries (including
      // unflagged poses detected during scan), stop touching further entries.
      // The upfront poseCount check only counted .pose-extension files; this
      // catches archives stuffed with extension-less pose JSON.
      if (modifiedCount >= MAX_POSE_FILES) {
        console.warn(
          "[Pose Image Embedder] Pose modification limit reached, leaving remaining entries untouched."
        );
        break;
      }

      const pathLower = entry.path.toLowerCase();
      const isExplicitPose = pathLower.endsWith(".pose");

      // Non-pose-extension files: probe them as JSON to catch poses uploaded
      // without the extension. Skip nested zips (we never recurse) and
      // obvious binaries (saves decompression cycles).
      if (!isExplicitPose) {
        if (pathLower.endsWith(".zip")) continue;
        if (BINARY_EXT_RE.test(pathLower)) continue;
      }

      if (!isSafeZipPath(entry.path)) {
        console.warn("[Pose Image Embedder] Unsafe ZIP path skipped:", entry.path);
        if (isExplicitPose) skippedCount++;
        continue;
      }

      if (getZipEntrySize(entry.file) > MAX_POSE_SIZE) {
        if (isExplicitPose) {
          console.warn("[Pose Image Embedder] Oversize pose skipped:", entry.path);
          skippedCount++;
        }
        continue;
      }

      let text;
      try {
        text = await entry.file.async("string");
      } catch {
        if (isExplicitPose) {
          console.warn("[Pose Image Embedder] Failed to read entry, skipped:", entry.path);
          skippedCount++;
        }
        continue;
      }

      let poseJson;
      try {
        poseJson = JSON.parse(text);
      } catch {
        // Not JSON (or invalid JSON). Only count it as a "skip" for files
        // that explicitly claimed to be poses; otherwise it's just an
        // unrelated entry we never expected to touch.
        if (isExplicitPose) {
          console.warn("[Pose Image Embedder] Invalid JSON skipped:", entry.path);
          skippedCount++;
        }
        continue;
      }

      // For non-.pose entries, only proceed if the JSON shape genuinely
      // looks like a pose. Random config JSON inside a mod ZIP must not be
      // rewritten.
      if (!isExplicitPose && !looksLikePoseJson(poseJson)) {
        continue;
      }

      applyPoseMetadata(poseJson, metadata);

      let outPath = entry.path;
      if (!isExplicitPose) {
        outPath = poseRenameForPath(entry.path);
        // Don't clobber an existing entry sitting at the target path.
        if (zip.file(outPath)) {
          console.warn(
            "[Pose Image Embedder] Skipping rename — target path already exists:",
            outPath
          );
          continue;
        }
        console.info(
          "[Pose Image Embedder] Detected pose JSON without .pose extension, renaming:",
          entry.path,
          "→",
          outPath
        );
        zip.remove(entry.path);
        renamedCount++;
      }

      zip.file(outPath, JSON.stringify(poseJson, null, 2));
      modifiedCount++;
    }

    if (modifiedCount === 0) {
      throw new Error("No valid .pose files found in archive.");
    }

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    return { blob, modifiedCount, skippedCount, renamedCount };
  }

  // ── Main Logic ─────────────────────────────────────────────────────────

  /**
   * Run the full merge:
   * 1. Download the file (.pose or .zip), keeping the server-provided filename.
   * 2. Fetch the preview image and convert to base64 (shared by both flows).
   * 3. For .pose: inject metadata, re-serialize.
   *    For .zip: open in memory, inject metadata into every safe .pose entry,
   *              rebuild the archive.
   * 4. Offer the result as a download under the original filename.
   */
  async function downloadPoseWithImage(downloadUrl, button) {
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…';

    try {
      const resp = await fetch(downloadUrl);
      if (!resp.ok) throw new Error(`Failed to download file: ${resp.status}`);

      // Consume the response body exactly once. Both flows below operate on
      // the resulting Blob rather than calling .text()/.arrayBuffer() on the
      // Response (which is single-use).
      const downloadedBlob = await resp.blob();

      // Determine the filename the server intended to serve.
      // Priority: Content-Disposition header > URL path > fallback
      const contentDisposition = resp.headers.get("Content-Disposition");
      const rawFilename =
        getFilenameFromContentDisposition(contentDisposition) ||
        getFilenameFromUrl(downloadUrl);

      const filenameLower = rawFilename.toLowerCase();
      const isZip = filenameLower.endsWith(".zip") || isZipDownload(downloadUrl);

      // Strip filesystem-invalid characters before handing to the browser.
      const safeFilename = sanitizeFilename(
        rawFilename,
        isZip ? "updated.zip" : "updated.pose"
      );

      // Fail fast if a ZIP was requested but JSZip isn't loaded.
      if (isZip && typeof JSZip === "undefined") {
        throw new Error("ZIP support unavailable. JSZip is not loaded.");
      }

      // Switch the spinner label so users can tell ZIP processing apart from
      // the much faster single-pose flow.
      if (isZip) {
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing ZIP…';
      }

      // Fetch the preview image and convert to base64 once. Both flows reuse it.
      let base64Str = null;
      const imageUrl = getPreviewImageUrl();
      if (imageUrl) {
        const imageResp = await fetch(imageUrl);
        if (!imageResp.ok) {
          throw new Error(`Failed to fetch preview image: ${imageResp.status}`);
        }
        const imageBlob = await imageResp.blob();
        if (imageBlob.size > MAX_IMAGE_SIZE) {
          throw new Error(
            `Preview image exceeds maximum size of ${Math.round(MAX_IMAGE_SIZE / (1024 * 1024))} MB.`
          );
        }
        base64Str = await resizeAndGetBase64(imageBlob, 720); 
      }

      const author = getAuthorName();
      const description = getDescription();
      const lastUpdate = getLastVersionUpdate();
      const version = lastUpdate?.text || null;
      const tags = getTags();

      const metadata = {
        base64Image: base64Str,
        author,
        description,
        version,
        tags,
      };

      if (isZip) {
        const zipBuffer = await downloadedBlob.arrayBuffer();
        const { blob, modifiedCount, skippedCount, renamedCount } =
          await processZipArchive(zipBuffer, metadata);
        downloadBlob(blob, safeFilename);
        console.info(
          "[Pose Image Embedder]",
          `Modified ${modifiedCount} pose file(s) ` +
            `(${renamedCount} renamed to .pose), skipped ${skippedCount}.`
        );
      } else {
        const poseText = await downloadedBlob.text();

        let poseJson;
        try {
          poseJson = JSON.parse(poseText);
        } catch {
          throw new Error("Downloaded .pose file is not valid JSON");
        }

        applyPoseMetadata(poseJson, metadata);

        const outputJson = JSON.stringify(poseJson, null, 2);
        const blob = new Blob([outputJson], { type: "application/json" });
        downloadBlob(blob, safeFilename);
      }

    } catch (err) {
      console.error("[Pose Image Embedder]", err);
      alert("Pose Image Embedder Error:\n" + err.message);
    } finally {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }

  // ── Unsupported-archive explainer modal ────────────────────────────────

  /**
   * Render a small dark-themed modal explaining why .rar / .7z archives
   * aren't supported. Pure-DOM construction (no innerHTML for any
   * dynamic content) and no jQuery/Bootstrap dependency — keeps the modal
   * safe to render against any page state.
   */
  function showUnsupportedFormatModal(formatLabel) {
    // Replace any previously-open instance (e.g. user clicked the button twice).
    const existing = document.getElementById("pose-embedder-format-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "pose-embedder-format-modal";
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "background: rgba(0,0,0,0.6)",
      "z-index: 100000",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "padding: 1rem",
    ].join("; ");

    const card = document.createElement("div");
    card.style.cssText = [
      "background: #343a40",
      "color: #f8f9fa",
      "padding: 1.5rem",
      "border-radius: 0.5rem",
      "max-width: 36rem",
      "width: 100%",
      "box-shadow: 0 0.5rem 1.5rem rgba(0,0,0,0.5)",
      "line-height: 1.5",
    ].join("; ");

    const title = document.createElement("h4");
    title.textContent = `${formatLabel} archives — read-only support`;
    title.style.cssText = "margin: 0 0 1rem 0;";

    const p1 = document.createElement("p");
    p1.textContent =
      `Support for ${formatLabel} archives is currently limited to read-only. ` +
      "The extension cannot re-pack them after modifying the .pose files inside, " +
      "so it refuses to download anything that would lose data on the way back.";

    const p2 = document.createElement("p");
    p2.textContent =
      "Adding write support requires a significantly larger code base and would " +
      "force this entire project to be re-licensed under GPL-3.0. I might add it " +
      "if demand for it increases.";

    const p3 = document.createElement("p");
    p3.textContent =
      "For now, extract the archive yourself and re-package the .pose files " +
      "inside a .zip — the extension will then handle the rest in one click.";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn-secondary";
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = "display: block; margin-left: auto; margin-top: 0.5rem;";

    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    };

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);

    card.appendChild(title);
    card.appendChild(p1);
    card.appendChild(p2);
    card.appendChild(p3);
    card.appendChild(closeBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    closeBtn.focus();
  }

  // ── Button Injection ───────────────────────────────────────────────────

  function injectButton() {
    // Guard against duplicate injection if the page re-renders dynamically.
    if (document.getElementById("download-pose-with-image-button")) {
      return;
    }

    // Only ever act on Pose pages. A gear/other mod page can also serve a
    // .zip (or .rar/.7z) download, which would otherwise look "supported"
    // and trip the injection below — but this extension must never touch
    // anything that isn't a pose. Bail out before doing anything else.
    const isPoseCat = isPoseCategory();
    if (!isPoseCat) return;

    const downloadUrl = getEffectiveDownloadUrl();
    const supported = isSupportedDownload(downloadUrl);
    const unsupportedLabel = getUnsupportedArchiveLabel(downloadUrl);

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

    if (unsupportedLabel) {
      // .rar / .7z: the site permits these uploads but the extension can't
      // round-trip them. Show a red explainer button instead of attempting
      // a download; clicking opens a modal with the reasoning.
      newBtn.style.cssText = "min-width:14rem; margin-bottom:0.5rem; background-color: #dc3545; border-color: #dc3545; color: white; font-weight: 600;";
      newBtn.innerHTML =
        '<i class="fas fa-times-circle"> </i> ' +
        unsupportedLabel +
        ' files not supported.<br>Click to read more';
      newBtn.title = unsupportedLabel + " archives aren't supported — click for details.";
      newBtn.addEventListener("click", () => {
        showUnsupportedFormatModal(unsupportedLabel);
      });
    } else if (isPoseCat && !supported) {
      // Edge case: Pose category but the download isn't a .pose or .zip file
      newBtn.style.cssText = "min-width:14rem; margin-bottom:0.5rem; background-color: #6c757d; border-color: #6c757d; color: white; font-weight: 600; cursor: not-allowed;";
      newBtn.innerHTML = '<i class="fas fa-exclamation-triangle"> </i> Pose file not detected';
      newBtn.title = "The category is 'Pose', but the download link does not point to a .pose file or a .zip archive.";
      newBtn.disabled = true;
    } else {
      // Standard case: .pose file or .zip archive — tailor the label to
      // whichever one the download link points at so the button doesn't
      // promise ZIP handling on a plain pose page.
      newBtn.style.cssText = "min-width:14rem; margin-bottom:0.5rem; background-color: #6a8dff; border-color: #6a8dff; color: white; font-weight: 600;";

      if (isZipDownload(downloadUrl)) {
        newBtn.innerHTML = '<i class="fas fa-images"> </i> Download Poses / ZIP w/ Image';
        newBtn.title = "Downloads the ZIP archive with the mod preview image, author, and tags embedded into every .pose file inside.";
      } else {
        newBtn.innerHTML = '<i class="fas fa-images"> </i> Download Pose w/ Image';
        newBtn.title = "Downloads the .pose file with the mod preview image, author, and tags embedded.";
      }

      newBtn.addEventListener("click", () => {
        downloadPoseWithImage(downloadUrl, newBtn);
      });
    }

    // Insert the new button ABOVE the existing download link
    downloadContainer.insertBefore(newBtn, downloadContainer.firstChild);
  }

  // ── DT Compatibility Annotation ────────────────────────────────────────

  /**
   * Pose pages that show "DT Compatibility: ✅" but were last updated before
   * Dawntrail's release frequently have broken facial expressions. Re-color
   * the alert yellow and add a small attribution note.
   *
   * Gated on isPoseCategory() so we never touch alerts on non-Pose mod pages.
   */
  function annotatePreDawntrailCompatibility() {
    if (!isPoseCategory()) return;

    // Find a success-styled DT Compatibility alert (incompatible mods use a
    // different alert class, so we won't accidentally re-label those).
    const alerts = document.querySelectorAll(".alert.alert-success");
    let dtAlert = null;
    for (const a of alerts) {
      if (a.textContent.includes("DT Compatibility")) {
        dtAlert = a;
        break;
      }
    }
    if (!dtAlert) return;

    // Sanity-check that the alert really claims compatibility — phrasing
    // could change, in which case we leave it alone rather than guess.
    if (!/compatible with Dawntrail/i.test(dtAlert.textContent)) return;

    const lastUpdate = getLastVersionUpdate();
    if (!lastUpdate || !lastUpdate.date) return; // unknown date → don't mislabel
    if (lastUpdate.date >= DAWNTRAIL_RELEASE) return;

    // Idempotency: avoid double-applying on dynamic re-render.
    if (dtAlert.dataset.poseEmbedderAdjusted === "1") return;
    dtAlert.dataset.poseEmbedderAdjusted = "1";

    // Swap to Bootstrap's yellow warning style to stay theme-consistent.
    dtAlert.classList.remove("alert-success");
    dtAlert.classList.add("alert-warning");

    dtAlert.innerHTML =
      '<strong>DT Compatibility:</strong> ⚠️ ' +
      '<em>This mod is compatible with Dawntrail but broke facial expressions.</em>';

    const note = document.createElement("div");
    note.style.cssText = "font-size: 0.8em; color: #6c757d; margin-top: 0.25rem;";
    note.textContent =
      "Pose was last updated/release before Dawntrail -FFXIV Pose Embedder";
    dtAlert.appendChild(note);
  }

  // ── Init ───────────────────────────────────────────────────────────────

  function init() {
    injectButton();
    annotatePreDawntrailCompatibility();
  }

  // Run when the DOM is ready (content script runs at document_idle)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

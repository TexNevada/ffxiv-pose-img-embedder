from flask import Flask, request, send_file, render_template, send_from_directory, abort, url_for
import base64
import json
import requests
import tempfile
from pathlib import Path
import configparser
from urllib.parse import urlparse
from PIL import Image, UnidentifiedImageError
import io

if not Path("env.ini").exists():
    debug = False
    host = "0.0.0.0"
    port = 80
else:
    config = configparser.ConfigParser()
    config.read("env.ini")
    debug = config.getboolean("Boot", "DEBUG")
    host = config.get("Boot", "IP_BINDING")
    port = config.getint("Boot", "PORT")

# Application version (displayed in the UI)
VERSION = "v1.6.3"

# Social links used in templates
DISCORD_URL = "https://discord.gg/kWGEfw9hWU"
GITHUB_URL = "https://github.com/TexNevada/ffxiv-pose-img-embedder"

SHOUTOUT = "Shoutout to Brio plugin! This wouldn't exist without it."

thumbnail_sizes = {"480", "720", "1080", "none"}

app = Flask(__name__)

# Compatibility for Pillow resampling attribute names (Image.Resampling.LANCZOS or Image.LANCZOS)
# Use hasattr checks to avoid IDE/linter warnings about missing attributes in some Pillow versions.
if hasattr(Image, "Resampling"):
    RESAMPLE_LANCZOS = Image.Resampling.LANCZOS
elif hasattr(Image, "LANCZOS"):
    RESAMPLE_LANCZOS = Image.LANCZOS
elif hasattr(Image, "BICUBIC"):
    RESAMPLE_LANCZOS = Image.BICUBIC
else:
    # Fallback to a safe default integer if none of the named constants are present
    RESAMPLE_LANCZOS = 1


def fetch_file_from_url(url: str):  # -> (bytes, str):
    r = requests.get(url)
    r.raise_for_status()

    parsed = urlparse(url)
    filename = Path(parsed.path).name or "downloaded.pose"

    return r.content, filename


def image_to_base64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")


@app.route("/.well-known/<path:filename>", methods=["GET"])
def well_known(filename):
    """Serve plaintext files from static/.well-known at the /.well-known/ URL path.

    This mirrors how robots.txt is served — plain text responses only.
    """
    well_known_dir = Path(app.root_path) / "static" / ".well-known"
    file_path = well_known_dir / filename
    if not well_known_dir.exists() or not file_path.exists() or not file_path.is_file():
        return abort(404)
    # Force text/plain to make it behave like robots.txt
    return send_from_directory(str(well_known_dir), filename, mimetype="text/plain")


@app.route("/", methods=["GET"])
def index():
    meta_tags = {
        "title": "FFXIV Pose Image Embedder for Brio",
        "description": "A tool to embed images, tags & other meta_data into FFXIV .pose files for use with the Brio",
        "image": url_for("static", filename="og-preview.png", _external=True),
        "url": url_for("index", _external=True)
    }
    return render_template("index.html", meta_tags=meta_tags, version=VERSION, discord_url=DISCORD_URL, github_url=GITHUB_URL, shoutout=SHOUTOUT)


@app.route("/process", methods=["POST"])
def process():

    # No debug prints. This endpoint accepts image + pose merging via simple form (legacy simple UI).

    # ----- IMAGE -----
    img_url = request.form.get("image_url", "").strip()
    img_file = request.files.get("image_file")
    # Read requested resize option (default 720p). Allowed: "720", "1080", "none"
    resize_choice = request.form.get("resize", "720")
    if resize_choice not in thumbnail_sizes:
        resize_choice = "720"
    # If "none" selected, do not apply any downscaling; otherwise parse int
    if resize_choice == "none":
        max_dim = None
    else:
        max_dim = int(resize_choice)

    if img_file and img_file.filename:
        image_bytes = img_file.read()
    elif img_url:
        image_bytes, _ = fetch_file_from_url(img_url)
    else:
        return "Error: No image provided (URL or file)", 400

    # Verify image type using Pillow and optionally downscale
    try:
        img = Image.open(io.BytesIO(image_bytes))
    except UnidentifiedImageError:
        return "Error: Provided image is not a supported image type", 400

    img_format = (img.format or "").lower()

    allowed_img_types = {"png", "jpeg", "gif", "bmp", "webp"}
    if img_format not in allowed_img_types:
        img.close()
        return "Error: Provided image is not a supported image type", 400

    # Only downscale (preserve aspect ratio). Do not stretch.
    # Skip resizing animated GIFs to avoid complex frame handling.
    new_image_bytes = image_bytes
    try:
        # Only attempt resize when a max dimension is set and the image is not an animated GIF
        if max_dim is not None and not (img_format == "gif" and getattr(img, "is_animated", False)):
            width, height = img.size
            largest = max(width, height)
            if largest > max_dim:
                scale = max_dim / float(largest)
                new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
                resized = img.resize(new_size, RESAMPLE_LANCZOS)
                buf = io.BytesIO()
                save_format = (img.format or "").upper()
                if save_format == "JPEG":
                    # Ensure JPEG has no alpha
                    if resized.mode in ("RGBA", "LA"):
                        resized = resized.convert("RGB")
                    resized.save(buf, format=save_format, quality=95)
                else:
                    resized.save(buf, format=save_format)
                new_image_bytes = buf.getvalue()
    finally:
        try:
            img.close()
        except Exception:
            pass

    b64_str = image_to_base64(new_image_bytes)

    # ----- POSE FILE -----
    pose_url = request.form.get("pose_url", "").strip()
    pose_file = request.files.get("pose_file")

    if pose_file and pose_file.filename:
        pose_bytes = pose_file.read()
        pose_filename = pose_file.filename
    elif pose_url:
        pose_bytes, pose_filename = fetch_file_from_url(pose_url)
    else:
        return "Error: No pose file provided (URL or file)", 400

    if not pose_filename:
        pose_filename = "updated.pose"

    # Require .pose extension
    if not pose_filename.lower().endswith(".pose"):
        return "Error: Pose file must have .pose extension", 400

    # Ensure pose file is not an image
    try:
        with Image.open(io.BytesIO(pose_bytes)):
            return "Error: Pose file appears to be an image; expected JSON .pose", 400
    except UnidentifiedImageError:
        pass

    # Ensure pose file is valid JSON
    try:
        pose_json = json.loads(pose_bytes.decode("utf-8"))
    except Exception:
        return "Error: Pose file is not valid JSON", 400

    # If an image was uploaded, convert to base64 server-side and insert/update Base64Image
    if img_file and img_file.filename:
        # image_bytes already read above
        pose_json["Base64Image"] = base64.b64encode(image_bytes).decode('utf-8')
    else:
        # no uploaded image -> keep existing behavior (if pose had Base64Image, leave it)
        pose_json["Base64Image"] = b64_str

    # Write updated pose JSON and return as attachment
    temp = tempfile.NamedTemporaryFile(delete=False, suffix=".pose")
    temp.write(json.dumps(pose_json, indent=2).encode("utf-8"))
    temp.close()

    return send_file(
        temp.name,
        as_attachment=True,
        download_name=pose_filename,
        mimetype="application/json"
    )


@app.route("/advanced", methods=["GET"])
def advanced():
    """Render the advanced editor page."""
    meta_tags = {
        "title": "FFXIV Pose Image Embedder for Brio - Advanced Editor",
        "description": "A tool to embed images & other metadata into FFXIV .pose files",
        "image": url_for("static", filename="og-preview.png", _external=True),
        "url": url_for("index", _external=True)
    }
    return render_template("advanced.html", meta_tags=meta_tags, version=VERSION, discord_url=DISCORD_URL, github_url=GITHUB_URL, shoutout=SHOUTOUT)


@app.route("/process_advanced", methods=["POST"])
def process_advanced():
    """Accept original .pose file and a minimal "changes" payload (Option B). Merge changes into JSON and return updated .pose.

    Expected form fields:
    - pose_file: uploaded original .pose (required)
    - changes: JSON string with any of the keys: Author, Description, Version, Tags, Base64Image
    - resize: optional resize choice (same values as /process)
    - image_file: optional uploaded image (fallback) — if present, server will convert image to base64 and set Base64Image
    """

    # Enforce pose upload only
    pose_file = request.files.get('pose_file')
    if not pose_file or not pose_file.filename:
        return "Error: No pose file provided (upload required)", 400

    pose_bytes = pose_file.read()
    pose_filename = pose_file.filename or 'updated.pose'

    # Enforce 10 MB pose limit
    max_pose_bytes = 10 * 1024 * 1024
    if len(pose_bytes) > max_pose_bytes:
        return f"Error: Pose file exceeds {max_pose_bytes} bytes (10 MB)", 400

    # Validate .pose extension
    if not pose_filename.lower().endswith('.pose'):
        return "Error: Pose file must have .pose extension", 400

    # Ensure pose file is not an image
    try:
        with Image.open(io.BytesIO(pose_bytes)):
            return "Error: Pose file appears to be an image; expected JSON .pose", 400
    except UnidentifiedImageError:
        pass

    # Parse original JSON
    try:
        original = json.loads(pose_bytes.decode('utf-8'))
    except Exception:
        return "Error: Pose file is not valid JSON", 400

    # Parse changes
    changes_raw = request.form.get('changes', '').strip()
    changes = {}
    if changes_raw:
        try:
            changes = json.loads(changes_raw)
        except Exception:
            return "Error: Changes payload is not valid JSON", 400

    allowed_keys = {"Author", "Description", "Version", "Tags", "Base64Image"}
    # Validate and sanitize changes
    sanitized = {}
    for k, v in changes.items():
        if k not in allowed_keys:
            continue
        if k in {"Author", "Description", "Version"}:
            if v is None:
                sanitized[k] = None
            elif not isinstance(v, str):
                return f"Error: {k} must be a string or null", 400
            else:
                # server-side length checks
                limits = {"Author": 50, "Description": 160, "Version": 10}
                if len(v) > limits[k]:
                    return f"Error: {k} exceeds max length of {limits[k]}", 400
                sanitized[k] = v
        elif k == "Tags":
            if v is None:
                sanitized[k] = None
            elif isinstance(v, list):
                if len(v) > 50:
                    return "Error: Tags exceed maximum count of 50", 400
                # ensure each tag is a string without spaces
                for tag in v:
                    if not isinstance(tag, str):
                        return "Error: Each tag must be a string", 400
                    if ' ' in tag:
                        return "Error: Tags cannot contain spaces", 400
                sanitized[k] = v
            else:
                return "Error: Tags must be an array of strings or null", 400
        elif k == "Base64Image":
            if v is None:
                sanitized[k] = None
            elif isinstance(v, str):
                sanitized[k] = v
            else:
                return "Error: Base64Image must be a base64 string or null", 400

    # If client provided an image file fallback, process it server-side
    image_fallback = request.files.get('image_file')
    resize_choice = request.form.get('resize', '720')
    if resize_choice not in thumbnail_sizes:
        resize_choice = '720'
    max_dim = None if resize_choice == 'none' else int(resize_choice)

    if image_fallback and image_fallback.filename:
        img_bytes = image_fallback.read()
        # Validate image with Pillow
        try:
            img = Image.open(io.BytesIO(img_bytes))
        except UnidentifiedImageError:
            return "Error: Provided image is not a supported image type", 400
        img_format = (img.format or '').lower()
        allowed_img_types = {"png", "jpeg", "gif", "bmp", "webp"}
        if img_format not in allowed_img_types:
            img.close()
            return "Error: Provided image is not a supported image type", 400

        # Server-side resizing: if max_dim is set, resize while preserving aspect ratio
        new_image_bytes = img_bytes
        try:
            if max_dim is not None and not (img_format == 'gif' and getattr(img, 'is_animated', False)):
                width, height = img.size
                largest = max(width, height)
                if largest > max_dim:
                    scale = max_dim / float(largest)
                    new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
                    resized = img.resize(new_size, RESAMPLE_LANCZOS)
                    buf = io.BytesIO()
                    save_format = (img.format or '').upper()
                    if save_format == 'JPEG':
                        if resized.mode in ('RGBA', 'LA'):
                            resized = resized.convert('RGB')
                        resized.save(buf, format=save_format, quality=95)
                    else:
                        resized.save(buf, format=save_format)
                    new_image_bytes = buf.getvalue()
        finally:
            try:
                img.close()
            except Exception:
                pass

        sanitized['Base64Image'] = image_to_base64(new_image_bytes)

    # Merge sanitized changes into original JSON (only provided keys)
    for k, v in sanitized.items():
        original[k] = v

    # If client didn't provide Base64Image but sent an image_file earlier via server-side processing, sanitized will already have it.

    temp = tempfile.NamedTemporaryFile(delete=False, suffix='.pose')
    temp.write(json.dumps(original, indent=2).encode('utf-8'))
    temp.close()

    return send_file(
        temp.name,
        as_attachment=True,
        download_name=pose_filename,
        mimetype='application/json'
    )



if __name__ == "__main__":
    app.run(debug=debug, host=host, port=port, threaded=True)

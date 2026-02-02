from flask import Flask, request, send_file, render_template, send_from_directory, abort
import base64
import json
import requests
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image, UnidentifiedImageError
import io
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
    return render_template("index.html")


@app.route("/process", methods=["POST"])
def process():

    # ----- IMAGE -----
    img_url = request.form.get("image_url", "").strip()
    img_file = request.files.get("image_file")
    # Read requested resize option (default 720p). Allowed: "720", "1080", "none"
    resize_choice = request.form.get("resize", "720")
    if resize_choice not in {"720", "1080", "none"}:
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

    pose_json["Base64Image"] = b64_str

    temp = tempfile.NamedTemporaryFile(delete=False, suffix=".pose")
    temp.write(json.dumps(pose_json, indent=2).encode("utf-8"))
    temp.close()

    return send_file(
        temp.name,
        as_attachment=True,
        download_name=pose_filename,
        mimetype="application/json"
    )


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=80, threaded=True)

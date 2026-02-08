# FFXIV-pose-img-embedder
A small web utility that converts images to Base64 and embeds them into Final Fantasy XIV pose files (.pose).

This project provides a lightweight web interface to embed image data directly into pose files used by the FFXIV community (for example, avatar poses or in-game overlays that accept embedded images). It handles image resizing, conversion to Base64, and insertion into pose files so you can produce a ready-to-use `.pose` file with the image data included.

Features
- Convert local image files to Base64 data URLs.
- Resize images from the browser before embedding (client-side resizing preview available).
- Embed Base64 image data into a `.pose` file and produce an `updated.pose` output.
- Simple web UI (Flask-based) and static assets included in `templates/` and `static/`.
- Dockerfile included for containerized runs.

Quickstart (developer machine)
1. Clone or download this repository.
2. (Optional) Create a Python virtual environment and activate it.

Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Unix / macOS (bash):

```bash
python3 -m venv .venv
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Copy `env.ini.example` to `env.ini`. This is used for testing purposes.

Windows (PowerShell):

```powershell
Copy-Item env.ini.example env.ini
```

Unix / macOS (bash):

```bash
cp env.ini.example env.ini
```

5. Start the app:

Windows (PowerShell):

```powershell
python main.py
```

Unix / macOS (bash):

```bash
python3 main.py
```

6. Open your browser at the address shown in the console (by default http://127.0.0.1/) and use the web UI to select an image and a `.pose` file to embed into.

Docker quickstart
- Build the image (same for Windows and Unix):

```bash
docker build -t ffxiv-pose-img-embedder .
```

- Run the container:
```bash
docker run --rm -p 80:80 ffxiv-pose-img-embedder
```

Configuration
- `env.ini` (see `env.ini.example`) stores configuration values used by the app. Typical values control host/port and any optional behavior. If `env.ini` is missing, default values embedded in the code will be used.

Usage overview
- Open the web UI.
- Choose an image from your computer (PNG/JPEG recommended). Use the provided preview and resizing controls if you want to reduce dimensions before embedding.
- Upload or choose a `.pose` file. The app will create an `updated.pose` (or similarly named output) with the image data embedded.
- Download the resulting pose file and use it in your FFXIV workflows as needed.

Files of interest
- `main.py` — application entrypoint.
- `requirements.txt` — Python dependencies.
- `templates/` — HTML templates for the web UI.
- `static/` — static assets (JS, CSS, example images).
- `env.ini.example` — example test config file.
- `Dockerfile` — container build recipe.

Troubleshooting
- If the web UI fails to start, check that dependencies are installed and there are no port conflicts.
- If images do not embed correctly, try a small PNG/JPEG first and confirm the preview shows the expected image.
- Consult console logs for error details.

Contributing
- Bug reports, feature requests, and pull requests are welcome. Please open issues or PRs on the project repository.
- Keep changes small and include tests or manual verification steps when applicable.

License
This project is provided under the terms of the included `LICENSE` file.

Credits to Brio team for allowing embedded images into pose files.

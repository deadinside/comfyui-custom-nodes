import os
import subprocess
import tempfile
import platform
import string
import numpy as np
from PIL import Image
import folder_paths
import torch

# ─── Server route: filesystem browser ────────────────────────────
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/ffmpeg_vtt/browse")
    async def browse_files(request):
        path = request.query.get("path", "").strip()
        exts  = [e.strip().lower() for e in request.query.get("ext", "").split(",") if e.strip()]

        # Windows with no path → list drives
        if not path:
            if platform.system() == "Windows":
                drives = [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")]
                return web.json_response({"path": "", "parent": None, "dirs": drives, "files": []})
            path = "/"

        path = os.path.normpath(path)
        if not os.path.isdir(path):
            return web.json_response({"error": "Not a directory"}, status=400)

        try:
            entries = sorted(os.listdir(path), key=lambda x: (not os.path.isdir(os.path.join(path, x)), x.lower()))
        except PermissionError:
            return web.json_response({"error": "Permission denied"}, status=403)

        parent = str(os.path.dirname(path))
        if parent == path:                          # filesystem root
            parent = "" if platform.system() == "Windows" else None

        dirs, files = [], []
        for entry in entries:
            full = os.path.join(path, entry)
            if os.path.isdir(full):
                dirs.append(entry)
            elif os.path.isfile(full):
                if not exts or any(entry.lower().endswith(f".{e}") for e in exts):
                    files.append(entry)

        return web.json_response({"path": path, "parent": parent, "dirs": dirs, "files": files})

except Exception as e:
    print(f"[FFmpegVTT] Route registration failed: {e}")


# ─── Helpers ─────────────────────────────────────────────────────
def get_incremented_path(base_name: str, ext: str, folder: str):
    outdir = os.path.join(folder_paths.get_output_directory(), folder)
    os.makedirs(outdir, exist_ok=True)
    i = 1
    while True:
        filename = f"{base_name}_{i:05d}.{ext}"
        full_path = os.path.join(outdir, filename)
        if not os.path.exists(full_path):
            return full_path, filename
        i += 1


def ffmpeg_escape_path(path: str) -> str:
    path = path.replace("\\", "/")
    if len(path) > 1 and path[1] == ":":
        path = path[0] + "\\:" + path[2:]
    return path


def color_to_ass(color: str) -> str:
    """Convert a CSS color name or #RRGGBB hex to ASS &HAABBGGRR format."""
    named = {
        "white":   "FFFFFF", "black":   "000000",
        "yellow":  "FFFF00", "cyan":    "00FFFF",
        "magenta": "FF00FF", "red":     "FF0000",
        "green":   "00FF00", "blue":    "0000FF",
    }
    hex_rgb = named.get(color.lower())
    if not hex_rgb:
        c = color.lstrip("#")
        hex_rgb = c[:6].upper() if len(c) >= 6 else "FFFFFF"
    r, g, b = hex_rgb[0:2], hex_rgb[2:4], hex_rgb[4:6]
    return f"00{b}{g}{r}"          # ASS order: AA BB GG RR


# ─── Node ────────────────────────────────────────────────────────
class FFmpegVTTVideoBuilder:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "background_image": ("IMAGE",),
                "audio_file":  ("STRING", {"multiline": False, "placeholder": "Click Browse Audio below…"}),
                "vtt_file":    ("STRING", {"multiline": False, "placeholder": "Click Browse VTT below…"}),
                "output_name": ("STRING", {"default": "subtitle_video"}),
                "font_size":   ("INT",    {"default": 24, "min": 10, "max": 80}),
                "font_color":  ("STRING", {"default": "white"}),
                "subtitle_position": (["bottom", "center", "top"],),
            }
        }

    RETURN_TYPES  = ("IMAGE", "STRING")
    RETURN_NAMES  = ("preview_frame", "video_path")
    FUNCTION      = "build_video"
    CATEGORY      = "Video/FFmpeg"
    OUTPUT_NODE   = True

    def build_video(
        self,
        background_image,
        audio_file: str,
        vtt_file: str,
        output_name: str,
        font_size: int,
        font_color: str,
        subtitle_position: str,
    ):
        audio_file = audio_file.strip()
        vtt_file   = vtt_file.strip()

        if not os.path.exists(audio_file):
            raise ValueError(f"Audio file not found: {audio_file}")
        if not os.path.exists(vtt_file):
            raise ValueError(f"VTT file not found: {vtt_file}")

        base_name = os.path.splitext(output_name)[0]
        output_path, output_filename = get_incremented_path(base_name, "mp4", "video")

        # Save background image from tensor
        temp_dir = tempfile.mkdtemp()
        bg_path  = os.path.join(temp_dir, "background.png")
        tensor   = background_image
        if tensor.dim() == 4:
            tensor = tensor[0]
        np_img = (tensor.detach().cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
        if np_img.ndim != 3 or np_img.shape[2] not in (3, 4):
            raise ValueError(f"Expected HWC image with 3 or 4 channels, got {np_img.shape}")
        Image.fromarray(np_img).save(bg_path)

        # Audio duration
        duration_str = subprocess.check_output([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_file,
        ], stderr=subprocess.DEVNULL).decode().strip()
        duration = float(duration_str)

        # Subtitle style — ASS alignment: 1-3 bottom, 4-6 center, 7-9 top
        alignment = {"bottom": 2, "center": 8, "top": 6}[subtitle_position]
        ass_color  = color_to_ass(font_color)
        force_style = (
            f"Fontsize={font_size},"
            f"PrimaryColour=&H{ass_color}&,"
            f"Alignment={alignment},"
            f"MarginV=30,"
            f"Bold=1"
        )
        safe_vtt = ffmpeg_escape_path(vtt_file)
        vf = f"subtitles='{safe_vtt}':force_style='{force_style}'"

        subprocess.run([
            "ffmpeg", "-y",
            "-loop", "1", "-i", bg_path,
            "-i", audio_file,
            "-t", str(duration),
            "-vf", vf,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            output_path,
        ], check=True, stderr=subprocess.DEVNULL)

        # Extract preview frame at 10 % of duration (more likely to have a subtitle)
        preview_path = os.path.join(temp_dir, "preview.png")
        subprocess.run([
            "ffmpeg", "-y",
            "-ss", str(duration * 0.1),
            "-i", output_path,
            "-vframes", "1",
            preview_path,
        ], check=True, stderr=subprocess.DEVNULL)

        preview_img = Image.open(preview_path).convert("RGB")
        np_preview  = np.array(preview_img).astype(np.float32) / 255.0
        tensor_preview = torch.from_numpy(np_preview)[None, ...]

        return {
            "ui": {
                "videos": [{
                    "filename":  output_filename,
                    "subfolder": "video",
                    "type":      "output",
                    "format":    "video/mp4",
                }]
            },
            "result": (tensor_preview, output_path),
        }


NODE_CLASS_MAPPINGS = {
    "FFmpegVTTVideoBuilder": FFmpegVTTVideoBuilder,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "FFmpegVTTVideoBuilder": "FFmpeg VTT Video Builder",
}

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

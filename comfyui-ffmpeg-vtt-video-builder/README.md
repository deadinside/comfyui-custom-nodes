# ComfyUI FFmpeg VTT Video Builder

A ComfyUI custom node that combines a background image, an audio file, and a VTT/SRT subtitle file into a lyric video — the same "Export Video" workflow found in commercial AI music apps, brought directly into ComfyUI.

Designed to work with subtitle output from **[Ace-Step 1.5](https://github.com/ace-step/ACE-Step)** (LRC/VTT export from the Gradio UI), but works with any standard VTT or SRT file.

---

## Features

- Combines a static image + audio + subtitles into an MP4 lyric video
- Built-in file browser for selecting audio and subtitle files — no manual path typing
- Subtitle position control (bottom / center / top)
- Font size and color customization
- Live video preview directly in the node after generation
- Works as a standalone node or wired into any image generation workflow

---

## Requirements

**FFmpeg must be installed and available on your system PATH.**

- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add the `bin` folder to your PATH, or use [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/): `winget install ffmpeg`
- **macOS:** `brew install ffmpeg`
- **Linux:** `sudo apt install ffmpeg` (or your distro's equivalent)

Verify it works by running `ffmpeg -version` in a terminal before using this node.

---

## Installation

1. Clone or copy this folder into your `ComfyUI/custom_nodes/` directory:
   ```
   ComfyUI/custom_nodes/comfyui-ffmpeg_vtt_video_builder/
   ```
2. Restart ComfyUI.
3. The node appears under **Video > FFmpeg** in the node menu as **FFmpeg VTT Video Builder**.

---

## Usage

### Default workflow — Load Image + this node

The simplest setup: pick an image, pick your audio and subtitle files, generate.

```
[Load Image] ──► [FFmpeg VTT Video Builder] ──► MP4 lyric video
```

### Wired into an image generation workflow

Feed the output of a VAE Decode directly into this node to go from image generation straight to lyric video in a single queue run:

```
[KSampler] ──► [VAE Decode] ──► [FFmpeg VTT Video Builder] ──► MP4 lyric video
```

### Node inputs

| Input | Description |
|---|---|
| **background_image** | IMAGE input — connect a Load Image node or VAE Decode output |
| **audio_file** | Path to your audio file. Use the **Browse Audio** button to pick it. |
| **vtt_file** | Path to your VTT or SRT subtitle file. Use the **Browse VTT** button to pick it. |
| **output_name** | Base name for the output file (auto-incremented, saved to `ComfyUI/output/video/`) |
| **font_size** | Subtitle font size (10–80) |
| **font_color** | Font color — named colors (`white`, `yellow`, `cyan`, etc.) or hex (`#FF0000`) |
| **subtitle_position** | Where subtitles appear: `bottom`, `center`, or `top` |

### Getting subtitle files from Ace-Step 1.5

1. Generate your track in the Ace-Step 1.5 Gradio UI.
2. In the output panel, export the lyrics as **VTT** (or LRC/SRT if your version offers it — rename `.lrc` to `.srt` if needed).
3. Use the **Browse VTT** button in this node to select that file.

---

## Output

- **preview_frame** — a single frame from the generated video as an IMAGE (passable to other nodes)
- **video_path** — the full path to the output MP4 as a STRING
- A video player appears directly inside the node after generation for quick preview

Output files are saved to: `ComfyUI/output/video/<output_name>_00001.mp4` (auto-incremented)

---

## Supported file formats

| Type | Formats |
|---|---|
| Audio | mp3, wav, flac, aac, ogg, m4a, mp4 |
| Subtitles | vtt, srt |

---

## Troubleshooting

**"ffmpeg not found" / command errors** — make sure FFmpeg is on your system PATH and restart ComfyUI after installing it.

**Subtitles not showing** — confirm your VTT/SRT file has valid timestamps. Files exported directly from Ace-Step should work without modification.

**Widget values look wrong after loading a saved workflow** — update to the latest version of this node (a serialization bug affecting widget order was fixed).

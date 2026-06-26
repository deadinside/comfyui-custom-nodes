import { app } from "../../scripts/app.js";

// ─── File-browser modal ───────────────────────────────────────────
function openFileBrowser(onSelect, extensions = "") {
    const css = (el, s) => Object.assign(el.style, s);

    const overlay = document.createElement("div");
    css(overlay, {
        position: "fixed", inset: "0", background: "rgba(0,0,0,.78)",
        zIndex: "9999", display: "flex", alignItems: "center", justifyContent: "center",
    });

    const box = document.createElement("div");
    css(box, {
        background: "#1a1a1a", border: "1px solid #555", borderRadius: "8px",
        width: "580px", height: "520px",
        display: "flex", flexDirection: "column",
        color: "#ddd", fontSize: "13px", fontFamily: "monospace",
        boxShadow: "0 8px 32px rgba(0,0,0,.6)",
    });

    // Title bar
    const titleBar = document.createElement("div");
    css(titleBar, { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #444" });
    titleBar.innerHTML = `<b style="font-size:14px;">Browse Files</b>`;
    const closeBtn = document.createElement("button");
    Object.assign(closeBtn, { textContent: "✕", onclick: () => overlay.remove() });
    css(closeBtn, { background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: "16px", padding: "0 4px" });
    titleBar.appendChild(closeBtn);

    // Path breadcrumb
    const pathBar = document.createElement("div");
    css(pathBar, { padding: "5px 14px", background: "#111", fontSize: "11px", color: "#888", wordBreak: "break-all", minHeight: "22px" });

    // File list
    const list = document.createElement("div");
    css(list, { flex: "1", overflowY: "auto", padding: "6px" });

    // Selection display
    const selBar = document.createElement("div");
    css(selBar, { padding: "5px 14px", borderTop: "1px solid #2a2a2a", fontSize: "11px", color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    selBar.textContent = "No file selected";

    // Footer
    const footer = document.createElement("div");
    css(footer, { display: "flex", justifyContent: "flex-end", gap: "8px", padding: "10px 14px", borderTop: "1px solid #444" });

    const cancelBtn = document.createElement("button");
    Object.assign(cancelBtn, { textContent: "Cancel", onclick: () => overlay.remove() });
    css(cancelBtn, { padding: "5px 16px", background: "#333", border: "1px solid #555", color: "#ddd", borderRadius: "4px", cursor: "pointer" });

    const selectBtn = document.createElement("button");
    Object.assign(selectBtn, { textContent: "Select", disabled: true });
    css(selectBtn, { padding: "5px 16px", background: "#1a6bb5", border: "none", color: "#fff", borderRadius: "4px", cursor: "pointer" });

    footer.append(cancelBtn, selectBtn);
    box.append(titleBar, pathBar, list, selBar, footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let selectedPath = null;

    selectBtn.onclick = () => {
        if (selectedPath) { onSelect(selectedPath); overlay.remove(); }
    };

    function makeRow(icon, label, onClick, onDblClick) {
        const el = document.createElement("div");
        el.textContent = `${icon}  ${label}`;
        css(el, { padding: "5px 10px", cursor: "pointer", borderRadius: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", userSelect: "none" });
        el.onmouseenter = () => { if (!el.dataset.sel) css(el, { background: "#ffffff0d" }); };
        el.onmouseleave = () => { if (!el.dataset.sel) css(el, { background: "" }); };
        if (onClick)    el.onclick    = onClick;
        if (onDblClick) el.ondblclick = onDblClick;
        return el;
    }

    async function navigate(path) {
        const qs   = new URLSearchParams({ path: path ?? "", ext: extensions });
        const data = await fetch(`/ffmpeg_vtt/browse?${qs}`).then(r => r.json()).catch(() => ({ error: "Network error" }));
        if (data.error) { pathBar.textContent = "⚠ " + data.error; return; }

        pathBar.textContent = data.path || "This PC";
        list.innerHTML      = "";
        selectedPath        = null;
        selBar.textContent  = "No file selected";
        selectBtn.disabled  = true;

        // Up directory
        if (data.parent !== null && data.parent !== undefined) {
            list.appendChild(makeRow("📁", "..", null, () => navigate(data.parent)));
        }

        // Subdirectories
        for (const d of data.dirs ?? []) {
            const fullPath = data.path ? `${data.path}\\${d}` : d;
            list.appendChild(makeRow("📁", d, null, () => navigate(fullPath)));
        }

        // Files
        for (const f of data.files ?? []) {
            const fullPath = data.path ? `${data.path}\\${f}` : f;
            const el = makeRow("🎵", f,
                () => {
                    list.querySelectorAll("[data-sel]").forEach(s => { delete s.dataset.sel; css(s, { background: "" }); });
                    el.dataset.sel = "1";
                    css(el, { background: "#1a6bb540" });
                    selectedPath       = fullPath;
                    selBar.textContent = fullPath;
                    selectBtn.disabled = false;
                },
                () => { onSelect(fullPath); overlay.remove(); }
            );
            list.appendChild(el);
        }
    }

    navigate(""); // Start at drives / root
}

// ─── ComfyUI Extension ───────────────────────────────────────────
app.registerExtension({
    name: "FFmpegVTT.FilePicker",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "FFmpegVTTVideoBuilder") return;

        // ── Widget additions after node is created ──────────────────
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);

            const audioWidget = this.widgets?.find(w => w.name === "audio_file");
            const vttWidget   = this.widgets?.find(w => w.name === "vtt_file");

            if (audioWidget) insertBrowseButton(this, audioWidget, "mp3,wav,flac,aac,ogg,m4a,mp4", "Browse Audio");
            if (vttWidget)   insertBrowseButton(this, vttWidget,   "vtt,srt",                      "Browse VTT");
        };

        // ── Video preview when node finishes execution ──────────────
        const origExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            origExecuted?.apply(this, arguments);

            const vid = message?.videos?.[0];
            if (!vid) return;

            const url = `/view?filename=${encodeURIComponent(vid.filename)}&subfolder=${encodeURIComponent(vid.subfolder ?? "")}&type=${vid.type ?? "output"}`;

            if (!this._vttVideo) {
                const videoEl = Object.assign(document.createElement("video"), {
                    controls: true,
                    loop:     false,
                });
                Object.assign(videoEl.style, {
                    width:      "100%",
                    maxHeight:  "240px",
                    display:    "block",
                    background: "#000",
                    borderTop:  "1px solid #333",
                    marginTop:  "4px",
                });
                this._vttVideo       = videoEl;
                this._vttVideoWidget = this.addDOMWidget(
                    "video_preview", "preview", videoEl,
                    { serialize: false, getValue: () => undefined, setValue: () => {} }
                );
            }

            this._vttVideo.src = url;
            this._vttVideo.load();
        };
    },
});

function insertBrowseButton(node, targetWidget, extensions, label) {
    const btn = node.addWidget("button", `📂  ${label}`, null, () => {
        openFileBrowser(path => {
            targetWidget.value = path;
            targetWidget.callback?.(path);
            node.graph?.setDirtyCanvas(true);
        }, extensions);
    }, { serialize: false });

    // Move button to sit directly below its target widget
    const wi = node.widgets.indexOf(targetWidget);
    const bi = node.widgets.indexOf(btn);
    if (bi !== wi + 1) {
        node.widgets.splice(bi, 1);
        node.widgets.splice(wi + 1, 0, btn);
    }
}

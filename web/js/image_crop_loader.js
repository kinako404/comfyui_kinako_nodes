// Image Crop Loader 前端：加载图像（按钮 / 拖入）+ 节点内拖拽裁剪框。
// 裁剪框几何计算见 crop_math.js；框坐标存在 x / y / width / height 四个 INT widget 里，
// 图像文件名存在隐藏的 image widget 里（上传到 ComfyUI input 目录）。
import { dragBox, fullBox, hitTest, normalizeBox } from "./crop_math.js";

// 兼容新旧前端：新版通过 window.comfyAPI 暴露 app，旧版没有该对象时直接跳过
const app = window.comfyAPI?.app?.app;
const api = window.comfyAPI?.api?.api ?? app?.api;

const NODE_NAME = "ImageCropLoader";
const HANDLE_PX = 8;     // 手柄命中 / 绘制半径（屏幕像素）
const MIN_UI_H = 220;    // 裁剪区最小高度
const CURSORS = {
    move: "move", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
    ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize",
};

const STYLE = `
.kn-crop { display:flex; flex-direction:column; gap:4px; width:100%; height:100%;
  box-sizing:border-box; font:12px sans-serif; color:var(--input-text, #ddd); }
.kn-crop-bar { display:flex; align-items:center; gap:6px; flex:0 0 auto; }
.kn-crop-bar button { background:var(--comfy-input-bg, #222); color:inherit; cursor:pointer;
  border:1px solid var(--border-color, #555); border-radius:4px; padding:2px 8px; font:inherit; }
.kn-crop-bar button:hover { filter:brightness(1.3); }
.kn-crop-info { margin-left:auto; opacity:.75; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kn-crop-stage { position:relative; flex:1 1 auto; min-height:0; border-radius:4px;
  background:repeating-conic-gradient(#2a2a2a 0 25%, #333 0 50%) 0 0/16px 16px; }
.kn-crop-stage.kn-drop { outline:2px dashed #4a9eff; outline-offset:-2px; }
.kn-crop-stage canvas { position:absolute; inset:0; width:100%; height:100%; touch-action:none; }
.kn-crop-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  text-align:center; opacity:.6; pointer-events:none; padding:8px; }
`;

function injectStyle() {
    if (document.getElementById("kn-crop-style")) return;
    const s = document.createElement("style");
    s.id = "kn-crop-style";
    s.textContent = STYLE;
    document.head.appendChild(s);
}

// "sub/a.png [input]" → { filename: "a.png", subfolder: "sub", type: "input" }
function parseImageValue(value) {
    let v = String(value || "").trim();
    let type = "input";
    const m = v.match(/^(.*) \[(input|output|temp)\]$/);
    if (m) {
        v = m[1];
        type = m[2];
    }
    const i = v.lastIndexOf("/");
    return { filename: i >= 0 ? v.slice(i + 1) : v, subfolder: i >= 0 ? v.slice(0, i) : "", type };
}

function viewUrl(value) {
    const { filename, subfolder, type } = parseImageValue(value);
    const q = new URLSearchParams({ filename, subfolder, type, rand: String(Math.random()) });
    const path = `/view?${q}`;
    return api?.apiURL ? api.apiURL(path) : path;
}

const isImageFile = (f) => f && (f.type?.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(f.name));

class CropUI {
    constructor(node) {
        this.node = node;
        this.img = null;        // 已加载的 HTMLImageElement
        this.imgW = 0;
        this.imgH = 0;
        this.view = null;       // { s, ox, oy, cw, ch }：原图 → 画布 CSS 像素
        this.drag = null;       // { handle, box, p0 }
        this.loadSeq = 0;

        this.build();
        this.hookWidgets();
        this.resizeObs = new ResizeObserver(() => this.draw());
        this.resizeObs.observe(this.stage);
    }

    build() {
        this.root = document.createElement("div");
        this.root.className = "kn-crop";

        const bar = document.createElement("div");
        bar.className = "kn-crop-bar";
        const loadBtn = document.createElement("button");
        loadBtn.textContent = "加载图像";
        loadBtn.title = "选择图像文件（也可以直接把图像拖到节点上）";
        loadBtn.onclick = () => this.fileInput.click();
        const fullBtn = document.createElement("button");
        fullBtn.textContent = "全图";
        fullBtn.title = "裁剪框重置为整张图（按当前比例 / 对齐取最大）";
        fullBtn.onclick = () => {
            if (this.img) this.setBox(fullBox(this.imgW, this.imgH, this.opts()));
        };
        this.info = document.createElement("span");
        this.info.className = "kn-crop-info";
        bar.append(loadBtn, fullBtn, this.info);

        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = "image/*";
        this.fileInput.style.display = "none";
        this.fileInput.onchange = () => {
            const f = this.fileInput.files?.[0];
            this.fileInput.value = "";
            if (f) this.uploadFile(f);
        };

        this.stage = document.createElement("div");
        this.stage.className = "kn-crop-stage";
        this.canvas = document.createElement("canvas");
        this.empty = document.createElement("div");
        this.empty.className = "kn-crop-empty";
        this.empty.textContent = "点击「加载图像」或把图像拖到这里";
        this.stage.append(this.canvas, this.empty);

        this.root.append(bar, this.stage, this.fileInput);

        // 拖入文件：DOM widget 盖在画布上，litegraph 收不到这里的 drop，自己处理
        this.stage.addEventListener("dragover", (e) => {
            if (![...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file")) return;
            e.preventDefault();
            e.stopPropagation();
            this.stage.classList.add("kn-drop");
        });
        this.stage.addEventListener("dragleave", () => this.stage.classList.remove("kn-drop"));
        this.stage.addEventListener("drop", (e) => {
            this.stage.classList.remove("kn-drop");
            const f = [...(e.dataTransfer?.files ?? [])].find(isImageFile);
            if (!f) return;
            e.preventDefault();
            e.stopPropagation();
            this.uploadFile(f);
        });

        this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
        this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
        this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
        this.canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
        this.root.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    }

    // ---- widget 同步 ----

    // 每次现取：部分前端版本会重建 widget 对象，缓存引用会写到失效的旧对象上
    get w() {
        return Object.fromEntries((this.node.widgets ?? []).map((w) => [w.name, w]));
    }

    opts() {
        return { ratio: this.w.ratio?.value ?? "free", snap: this.w.snap?.value ?? "none" };
    }

    getBox() {
        return {
            x: Number(this.w.x?.value) || 0,
            y: Number(this.w.y?.value) || 0,
            w: Number(this.w.width?.value) || 0,
            h: Number(this.w.height?.value) || 0,
        };
    }

    setBox(b) {
        if (this.w.x) this.w.x.value = b.x;
        if (this.w.y) this.w.y.value = b.y;
        if (this.w.width) this.w.width.value = b.w;
        if (this.w.height) this.w.height.value = b.h;
        this.node.setDirtyCanvas?.(true, true);
        this.draw();
    }

    // 手动改数值 / 比例 / 对齐后，按新约束规范化裁剪框
    hookWidgets() {
        const prefer = { x: "corner", y: "corner", width: "w", height: "h", ratio: "corner", snap: "corner" };
        for (const [name, p] of Object.entries(prefer)) {
            const w = this.w[name];
            if (!w) continue;
            const orig = w.callback;
            w.callback = (...args) => {
                const r = orig?.apply(w, args);
                if (this.img) this.setBox(normalizeBox(this.getBox(), this.imgW, this.imgH, this.opts(), p));
                return r;
            };
        }
    }

    // ---- 图像加载 ----

    async uploadFile(file) {
        if (!isImageFile(file)) return;
        const body = new FormData();
        body.append("image", file);
        body.append("type", "input");
        try {
            const resp = await api.fetchApi("/upload/image", { method: "POST", body });
            if (resp.status !== 200) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
            const d = await resp.json();
            const value = d.subfolder ? `${d.subfolder}/${d.name}` : d.name;
            this.w.image.value = value;
            this.loadImage(value, true);
        } catch (e) {
            alert("图像上传失败: " + e);
        }
    }

    // resetBox：新上传的图重置为全图；加载工作流时保留已存的框（越界的规范化）
    loadImage(value, resetBox) {
        const seq = ++this.loadSeq;
        if (!value) {
            this.img = null;
            this.draw();
            return;
        }
        const img = new Image();
        img.onload = () => {
            if (seq !== this.loadSeq) return;
            this.img = img;
            this.imgW = img.naturalWidth;
            this.imgH = img.naturalHeight;
            const box = resetBox
                ? fullBox(this.imgW, this.imgH, this.opts())
                : normalizeBox(this.getBox(), this.imgW, this.imgH, this.opts());
            this.setBox(box);
        };
        img.onerror = () => {
            if (seq !== this.loadSeq) return;
            this.img = null;
            this.draw(`图像不存在或无法读取：${value}`);
        };
        img.src = viewUrl(value);
    }

    // ---- 绘制 ----

    draw(message) {
        const cw = this.stage.clientWidth;
        const ch = this.stage.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(ch * dpr)) {
            this.canvas.width = Math.round(cw * dpr);
            this.canvas.height = Math.round(ch * dpr);
        }
        const ctx = this.canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);

        if (!this.img || !cw || !ch) {
            this.view = null;
            this.empty.style.display = "flex";
            this.empty.textContent = message || "点击「加载图像」或把图像拖到这里";
            this.info.textContent = "";
            return;
        }
        this.empty.style.display = "none";

        // 四周留出手柄半径的边距：框贴着图像边缘时手柄仍完整落在画布内，
        // 否则点到手柄外半截会落到 ComfyUI 画布上，变成拖动整个节点
        const pad = HANDLE_PX + 2;
        const s = Math.max(0.0001, Math.min((cw - pad * 2) / this.imgW, (ch - pad * 2) / this.imgH));
        const ox = (cw - this.imgW * s) / 2;
        const oy = (ch - this.imgH * s) / 2;
        this.view = { s, ox, oy, cw, ch };
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this.img, ox, oy, this.imgW * s, this.imgH * s);

        const b = this.getBox();
        const bx = ox + b.x * s, by = oy + b.y * s, bw = b.w * s, bh = b.h * s;
        // 框外压暗
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.rect(ox, oy, this.imgW * s, this.imgH * s);
        ctx.rect(bx, by, bw, bh);
        ctx.fill("evenodd");
        // 三分线
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const k of [1, 2]) {
            ctx.moveTo(bx + (bw * k) / 3, by);
            ctx.lineTo(bx + (bw * k) / 3, by + bh);
            ctx.moveTo(bx, by + (bh * k) / 3);
            ctx.lineTo(bx + bw, by + (bh * k) / 3);
        }
        ctx.stroke();
        // 边框 + 8 个手柄
        ctx.strokeStyle = "#4a9eff";
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = "#fff";
        const r = 4;
        for (const hx of [bx, bx + bw / 2, bx + bw]) {
            for (const hy of [by, by + bh / 2, by + bh]) {
                if (hx === bx + bw / 2 && hy === by + bh / 2) continue;
                ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
                ctx.strokeRect(hx - r, hy - r, r * 2, r * 2);
            }
        }

        this.info.textContent = `${b.w}×${b.h} @ (${b.x}, ${b.y}) / ${this.imgW}×${this.imgH}`;
    }

    // ---- 指针交互 ----

    // 屏幕坐标 → 原图坐标（画布缩放时 DOM widget 被 transform，按实际显示尺寸换算）
    toImage(e) {
        const rect = this.canvas.getBoundingClientRect();
        const { s, ox, oy, cw, ch } = this.view;
        const cx = ((e.clientX - rect.left) * cw) / (rect.width || 1);
        const cy = ((e.clientY - rect.top) * ch) / (rect.height || 1);
        return { x: (cx - ox) / s, y: (cy - oy) / s, tol: HANDLE_PX / s };
    }

    onPointerDown(e) {
        if (!this.view || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation(); // 不让画布把它当成拖动节点
        const p = this.toImage(e);
        const box = this.getBox();
        const handle = hitTest(box, p.x, p.y, p.tol) ?? "new";
        this.drag = { handle, box, p0: p };
        try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }

    onPointerMove(e) {
        if (!this.view) return;
        const p = this.toImage(e);
        if (!this.drag) {
            this.canvas.style.cursor = CURSORS[hitTest(this.getBox(), p.x, p.y, p.tol)] ?? "crosshair";
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const { handle, box, p0 } = this.drag;
        this.setBox(dragBox(handle, box, p0, p, this.imgW, this.imgH, this.opts()));
    }

    onPointerUp(e) {
        if (!this.drag) return;
        e.stopPropagation();
        this.drag = null;
        try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }

    destroy() {
        this.resizeObs?.disconnect();
        this.loadSeq++;
    }
}

if (app) {
    app.registerExtension({
        name: "Kinako.ImageCropLoader",
        async beforeRegisterNodeDef(nodeType, nodeData) {
            if (nodeData.name !== NODE_NAME) return;

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated?.apply(this, arguments);
                injectStyle();

                // 文件名由界面维护，隐藏原生 STRING widget（仍随工作流保存）
                const imageWidget = this.widgets?.find((w) => w.name === "image");
                if (imageWidget) {
                    imageWidget.type = "hidden";
                    imageWidget.hidden = true;
                    imageWidget.computeSize = () => [0, -4];
                }

                const ui = new CropUI(this);
                this.cropUI = ui;
                const dw = this.addDOMWidget("crop_ui", "crop", ui.root, {
                    hideOnZoom: false,
                    serialize: false,
                    getMinHeight: () => MIN_UI_H,
                });
                dw.serializeValue = () => undefined;
                ui.root.style.setProperty("--comfy-widget-min-height", `${MIN_UI_H}px`);

                this.setSize([Math.max(this.size[0], 360), Math.max(this.size[1], 480)]);
                ui.loadImage(imageWidget?.value, false);
                return r;
            };

            // 加载工作流：widget 值恢复后按已存的文件名 / 裁剪框重新显示
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                const r = onConfigure?.apply(this, arguments);
                this.cropUI?.loadImage(this.widgets?.find((w) => w.name === "image")?.value, false);
                return r;
            };

            // 把图像文件拖到节点标题 / 空白处（DOM 区域外）也能加载
            nodeType.prototype.onDragOver = function (e) {
                return [...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file");
            };
            nodeType.prototype.onDragDrop = function (e) {
                const f = [...(e.dataTransfer?.files ?? [])].find(isImageFile);
                if (!f) return false;
                this.cropUI?.uploadFile(f);
                return true;
            };

            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function () {
                this.cropUI?.destroy();
                return onRemoved?.apply(this, arguments);
            };
        },
    });
}

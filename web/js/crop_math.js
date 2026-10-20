// 裁剪框几何计算：纯函数，不依赖 DOM / ComfyUI，坐标全部为原图像素。
// 框 box = { x, y, w, h }（整数，始终完整落在图像内，w/h >= 1）。

// 比例预设：值为 宽 / 高，free 为不限制
export const RATIOS = {
    "free": null,
    "1:1": 1,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "3:2": 3 / 2,
    "2:3": 2 / 3,
};

export const SNAPS = ["none", "8", "16", "32", "64"];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export const ratioOf = (name) => RATIOS[name] ?? null;
export const snapOf = (v) => (Number(v) > 1 ? Number(v) : 0);

// 在 maxW × maxH 范围内求满足比例 / 对齐的尺寸。
// prefer：比例锁定时以哪一边为准——"w" / "h" / "corner"（取两者中较大的一边）。
// 对齐时尺寸向下取到 snap 的倍数（至少一个 snap）；图像本身比 snap 还小时退回图像尺寸。
export function fitSize(w, h, maxW, maxH, ratio, snap, prefer = "corner") {
    maxW = Math.max(1, Math.floor(num(maxW)));
    maxH = Math.max(1, Math.floor(num(maxH)));
    w = Math.max(0, num(w));
    h = Math.max(0, num(h));
    if (ratio) {
        if (prefer === "w") h = w / ratio;
        else if (prefer === "h") w = h * ratio;
        else if (w / ratio >= h) h = w / ratio;
        else w = h * ratio;
        if (w > maxW) { w = maxW; h = w / ratio; }
        if (h > maxH) { h = maxH; w = h * ratio; }
    } else {
        w = Math.min(w, maxW);
        h = Math.min(h, maxH);
    }
    const s = snap > 1 ? snap : 1;
    const q = (v) => (s === 1 ? Math.round(v) : Math.floor(v / s) * s);
    if (ratio) {
        const hOf = (ww) => Math.max(s, s === 1 ? Math.round(ww / ratio) : Math.round(ww / ratio / s) * s);
        let sw = Math.max(s, q(w));
        let sh = hOf(sw);
        while ((sw > maxW || sh > maxH) && sw > s) {
            sw -= s;
            sh = hOf(sw);
        }
        w = sw;
        h = sh;
    } else {
        w = Math.max(s, q(w));
        h = Math.max(s, q(h));
    }
    return { w: Math.max(1, Math.min(w, maxW)), h: Math.max(1, Math.min(h, maxH)) };
}

function place(x, y, w, h, imgW, imgH) {
    return {
        x: Math.round(clamp(x, 0, Math.max(0, imgW - w))),
        y: Math.round(clamp(y, 0, Math.max(0, imgH - h))),
        w,
        h,
    };
}

// 满足比例 / 对齐的最大框，居中
export function fullBox(imgW, imgH, opts) {
    const { w, h } = fitSize(imgW, imgH, imgW, imgH, ratioOf(opts.ratio), snapOf(opts.snap), "corner");
    return place(Math.floor((imgW - w) / 2), Math.floor((imgH - h) / 2), w, h, imgW, imgH);
}

// 把任意（可能越界 / 非法）的框规范化：套用比例与对齐，并挪回图像内
export function normalizeBox(box, imgW, imgH, opts, prefer = "corner") {
    box = box || {};
    const { w, h } = fitSize(box.w, box.h, imgW, imgH, ratioOf(opts.ratio), snapOf(opts.snap), prefer);
    return place(num(box.x), num(box.y), w, h, imgW, imgH);
}

// 拖拽：handle 为 "move" / "n" "s" "e" "w" / "ne" "nw" "se" "sw" / "new"（从 p0 起新画一个框）。
// box 为拖拽开始时的框，p0 为按下点，p1 为当前点（原图坐标）。
// 角 / 边按「原位置 + 指针位移」移动（抓偏几像素不会跳），越过对边时翻转。
export function dragBox(handle, box, p0, p1, imgW, imgH, opts) {
    const ratio = ratioOf(opts.ratio);
    const snap = snapOf(opts.snap);
    const dx = num(p1.x) - num(p0.x);
    const dy = num(p1.y) - num(p0.y);

    if (handle === "move") {
        return place(box.x + dx, box.y + dy, box.w, box.h, imgW, imgH);
    }

    const isNew = handle === "new";
    const movesX = isNew || /[ew]/.test(handle);
    const movesY = isNew || /[ns]/.test(handle);

    let ax, ay, tx, ty;
    if (isNew) {
        ax = num(p0.x);
        ay = num(p0.y);
        tx = num(p1.x);
        ty = num(p1.y);
    } else {
        const right = box.x + box.w;
        const bottom = box.y + box.h;
        ax = handle.includes("w") ? right : box.x;
        ay = handle.includes("n") ? bottom : box.y;
        tx = (handle.includes("w") ? box.x : right) + dx;
        ty = (handle.includes("n") ? box.y : bottom) + dy;
    }
    ax = clamp(ax, 0, imgW);
    ay = clamp(ay, 0, imgH);

    let dirX = 1, dirY = 1, rawW, rawH;
    if (movesX) {
        tx = clamp(tx, 0, imgW);
        dirX = tx < ax ? -1 : 1;
        rawW = Math.abs(tx - ax);
    } else {
        ax = box.x;
        rawW = box.w;
    }
    if (movesY) {
        ty = clamp(ty, 0, imgH);
        dirY = ty < ay ? -1 : 1;
        rawH = Math.abs(ty - ay);
    } else {
        ay = box.y;
        rawH = box.h;
    }

    const prefer = movesX && movesY ? "corner" : movesX ? "w" : "h";
    const maxW = dirX > 0 ? imgW - ax : ax;
    const maxH = dirY > 0 ? imgH - ay : ay;
    const { w, h } = fitSize(rawW, rawH, maxW, maxH, ratio, snap, prefer);
    return place(dirX > 0 ? ax : ax - w, dirY > 0 ? ay : ay - h, w, h, imgW, imgH);
}

// 命中测试：返回 "nw" 等角 / "n" 等边 / "move"（框内）/ null（框外）。tol 为原图像素容差
export function hitTest(box, px, py, tol) {
    if (!box) return null;
    const l = box.x, t = box.y, r = box.x + box.w, b = box.y + box.h;
    if (px < l - tol || px > r + tol || py < t - tol || py > b + tol) return null;
    const v = Math.abs(py - t) <= tol ? "n" : Math.abs(py - b) <= tol ? "s" : "";
    const hz = Math.abs(px - l) <= tol ? "w" : Math.abs(px - r) <= tol ? "e" : "";
    return v + hz || "move";
}

"use client";
/**
 * Prepares pictures in the browser before upload: decodes any image (including SVG logos), scales it down to
 * at most `max` px on the long side, and re-encodes it as JPEG (photos) or PNG (logos and transparent images).
 * Only these re-encoded bytes reach the server.
 */
export async function prepareImage(file: Blob, opts: { max?: number; keepAlpha?: boolean } = {}) {
  const max = opts.max ?? 2560;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("That file is not an image this browser can read."));
      img.src = url;
    });
    let w = img.naturalWidth || 1200;
    let h = img.naturalHeight || 800;
    if (file.type === "image/svg+xml" && w < 600) {
      // Vector logos: draw them large and sharp.
      const k = 1200 / Math.max(w, h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const s = Math.min(1, max / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * s));
    const ch = Math.max(1, Math.round(h * s));
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, cw, ch);
    const alpha = opts.keepAlpha ?? (file.type === "image/png" || file.type === "image/svg+xml" || file.type === "image/webp" || file.type === "image/gif");
    const hasAlpha = alpha && (() => {
      const d = ctx.getImageData(0, 0, cw, ch).data;
      for (let i = 3; i < d.length; i += 16) if (d[i]! < 250) return true;
      return false;
    })();
    const dataUrl = hasAlpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.86);
    return { dataUrl, width: cw, height: ch };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const download = (blob: Blob, name: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
};

export const safeName = (s: string) => s.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "property-teaser";

"use client";
/**
 * Exports for Property Teaser, all made in the browser:
 *  - PowerPoint: native, editable text and basic shapes; photos, icons and effects as images. Trailers get
 *    timed auto-advance transitions so the file plays by itself.
 *  - PDF: one page per slide, rendered by the same canvas renderer as the editor.
 *  - Word: a property brief (details, description, highlights, amenities, contact) plus the slides.
 *  - PNG: the current slide.
 *  - Video: MP4 (H.264) through WebCodecs, faster than real time; WebM through MediaRecorder as a fallback.
 */
import { amenityInfo } from "@/lib/teaser/amenities";
import { boundText, color, factsText, font, hexAlpha, liveEl, priceText } from "@/lib/teaser/format";
import { drawElement, drawTrailerFrame, ensureFonts, layoutText, renderToCanvas, srcUrl, trailerTimeline, type ImageCache } from "@/lib/teaser/render";
import type { El, Slide, TeaserDoc, TextEl } from "@/lib/teaser/types";

const PX = 144; // design px per inch (1920 px = 13.333 in, PowerPoint's 16:9 size)
const toBlob = (c: HTMLCanvasElement, type = "image/jpeg", q = 0.92) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, q));

async function prepare(doc: TeaserDoc, images: ImageCache) {
  await ensureFonts(doc);
  await images.preload(doc);
}

/** Empty photo frames and placeholder text left in the design (warned about before export). */
export function exportWarnings(doc: TeaserDoc) {
  let frames = 0;
  let texts = 0;
  for (const s of doc.slides)
    for (const raw of s.elements) {
      const el = liveEl(raw, doc, false);
      if (el.type === "image" && !el.src && raw.bind !== "brand.logo") frames++;
      if (raw.type === "text" && raw.bind && boundText(raw.bind, doc, false) === "" && !raw.bind.startsWith("highlight") && !raw.bind.startsWith("amenity")) texts++;
    }
  return { frames, texts, logo: !doc.brand.logo };
}

// ---------------------------------------------------------------- PDF

export async function exportPdf(doc: TeaserDoc, images: ImageCache, title: string, onProgress?: (p: number) => void) {
  await prepare(doc, images);
  const { jsPDF } = await import("jspdf");
  const w = doc.width / 2;
  const h = doc.height / 2;
  const pdf = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "pt", format: [w, h], compress: true });
  pdf.setProperties({ title, creator: "Grid Agentic · Property Teaser" });
  doc.slides.forEach((s, i) => {
    if (i) pdf.addPage([w, h], w > h ? "landscape" : "portrait");
    const c = renderToCanvas(doc, s, images, 1);
    pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, w, h, undefined, "FAST");
    onProgress?.((i + 1) / doc.slides.length);
  });
  return pdf.output("blob");
}

// ---------------------------------------------------------------- PNG

export async function exportPng(doc: TeaserDoc, images: ImageCache, slideIdx: number) {
  await prepare(doc, images);
  return toBlob(renderToCanvas(doc, doc.slides[slideIdx]!, images, 1), "image/png");
}

// ---------------------------------------------------------------- PowerPoint

/** One element drawn alone (without rotation) at 2× for crisp images in PowerPoint and Word. */
function rasterEl(el: El, doc: TeaserDoc, slide: Slide, images: ImageCache) {
  const k = Math.min(2, 3000 / Math.max(el.w, el.h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(el.w * k));
  c.height = Math.max(1, Math.round(el.h * k));
  const ctx = c.getContext("2d")!;
  ctx.scale(k, k);
  drawElement(ctx, { ...el, x: 0, y: 0, rot: 0, opacity: 1, anim: undefined }, doc, slide, { images });
  return c.toDataURL("image/png");
}

const NATIVE_SHAPES: Record<string, string> = { rect: "rect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", star: "star5", arrow: "rightArrow", pill: "roundRect" };

export async function exportPptx(doc: TeaserDoc, images: ImageCache, title: string, onProgress?: (p: number) => void) {
  await prepare(doc, images);
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "GRID", width: doc.width / PX, height: doc.height / PX });
  pptx.layout = "GRID";
  pptx.title = title;
  pptx.company = doc.agent.company || "GRID";
  pptx.author = doc.agent.name || "Grid Agentic";
  const inch = (n: number) => n / PX;
  const measure = document.createElement("canvas").getContext("2d")!;

  doc.slides.forEach((s, si) => {
    const slide = pptx.addSlide();
    if (s.bgGrad) slide.background = { data: renderToCanvas({ ...doc, slides: [] }, { ...s, elements: [] }, images, 0.25).toDataURL("image/png") };
    else slide.background = { color: hexAlpha(s.bg, doc.brand).hex };
    for (const raw of s.elements) {
      if (raw.name === "hint") continue;
      const el = liveEl(raw, doc, false);
      const pos = { x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h), rotate: el.rot ?? 0 };
      const opacity = el.opacity ?? 1;
      if (el.type === "text") {
        if (!el.text.trim()) continue;
        const t = el as TextEl;
        const { height } = layoutText(measure, t, doc.brand);
        const c = hexAlpha(t.color, doc.brand);
        const bg = t.bg ? hexAlpha(t.bg, doc.brand) : null;
        slide.addText(t.upper ? t.text.toUpperCase() : t.text, {
          ...pos,
          h: inch(Math.max(t.h, height + (t.bg ? (t.pad ?? 16) * 2 : 0)) + t.size * 0.2),
          fontFace: font(t.font, doc.brand),
          fontSize: t.size / 2,
          bold: t.weight === 700,
          italic: !!t.italic,
          underline: t.underline ? { style: "sng" } : undefined,
          color: c.hex,
          transparency: Math.round((1 - c.alpha * opacity) * 100),
          align: t.align,
          valign: "top",
          lineSpacingMultiple: Math.max(0.7, t.lineHeight * 0.85),
          charSpacing: (t.spacing ?? 0) / 2,
          margin: t.bg ? (t.pad ?? 16) / 2 : 0,
          fill: bg ? { color: bg.hex, transparency: Math.round((1 - bg.alpha) * 100) } : undefined,
          shadow: t.shadow ? { type: "outer", blur: 8, offset: 2, angle: 90, color: "000000", opacity: 0.45 } : undefined,
          fit: "none",
          wrap: true,
        });
      } else if (el.type === "shape" && !el.grad && NATIVE_SHAPES[el.shape] && !(el.shape === "rect" && el.radius)) {
        const f = hexAlpha(el.fill, doc.brand);
        const line = el.stroke && el.strokeW ? hexAlpha(el.stroke, doc.brand) : null;
        slide.addShape(NATIVE_SHAPES[el.shape] as never, {
          ...pos,
          fill: !el.fill || el.fill === "transparent" ? { color: "FFFFFF", transparency: 100 } : { color: f.hex, transparency: Math.round((1 - f.alpha * opacity) * 100) },
          line: line ? { color: line.hex, width: el.strokeW! / 2, transparency: Math.round((1 - line.alpha) * 100) } : { type: "none" },
          rectRadius: el.shape === "pill" ? 1 : undefined,
        });
      } else if (el.type === "shape" && el.shape === "line") {
        const f = hexAlpha(el.fill === "transparent" ? el.stroke : el.fill, doc.brand);
        slide.addShape("rect" as never, { ...pos, h: inch(Math.max(1, el.h)), fill: { color: f.hex, transparency: Math.round((1 - f.alpha) * 100) }, line: { type: "none" } });
      } else {
        if (el.type === "image" && !el.src) continue;
        slide.addImage({ data: rasterEl(el, doc, s, images), ...pos, transparency: opacity < 1 ? Math.round((1 - opacity) * 100) : undefined });
      }
    }
    onProgress?.((si + 1) / doc.slides.length);
  });

  let out = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  if (doc.kind === "trailer") out = await addTransitions(out, doc);
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

/** Adds timed auto-advance and a transition to every slide, so a trailer deck plays by itself. */
async function addTransitions(buf: ArrayBuffer, doc: TeaserDoc) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < doc.slides.length; i++) {
    const path = `ppt/slides/slide${i + 1}.xml`;
    const f = zip.file(path);
    if (!f) continue;
    const s = doc.slides[i]!;
    const effect = s.transition === "slide" ? '<p:push dir="l"/>' : s.transition === "zoom" ? "<p:zoom/>" : s.transition === "none" ? "" : "<p:fade/>";
    const tr = `<p:transition spd="med" advClick="1" advTm="${Math.round(s.duration * 1000)}">${effect}</p:transition>`;
    let xml = await f.async("string");
    xml = xml.includes("</p:clrMapOvr>") ? xml.replace("</p:clrMapOvr>", `</p:clrMapOvr>${tr}`) : xml.replace("</p:sld>", `${tr}</p:sld>`);
    zip.file(path, xml);
  }
  // Loop the show until Esc, like a kiosk teaser.
  const pres = zip.file("ppt/presProps.xml");
  if (pres) {
    let xml = await pres.async("string");
    const show = '<p:showPr loop="1" showNarration="1"><p:present/><p:sldAll/><p:penClr><a:prstClr val="red"/></p:penClr></p:showPr>';
    if (!xml.includes("<p:showPr")) {
      // The element may be self-closing: open it up, then put showPr first.
      xml = xml.replace(/<p:presentationPr([^>]*?)\/>/, "<p:presentationPr$1></p:presentationPr>");
      xml = xml.replace(/(<p:presentationPr[^>]*>)/, `$1${show}`);
    }
    zip.file("ppt/presProps.xml", xml);
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

// ---------------------------------------------------------------- Word

async function fetchBytes(src: string) {
  const r = await fetch(srcUrl(src));
  if (!r.ok) throw new Error("image");
  const type = r.headers.get("content-type") ?? "";
  return { data: await r.arrayBuffer(), type: type.includes("png") ? ("png" as const) : type.includes("gif") ? ("gif" as const) : ("jpg" as const) };
}

export async function exportDocx(doc: TeaserDoc, images: ImageCache, title: string, onProgress?: (p: number) => void) {
  await prepare(doc, images);
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak } = d;
  const p = doc.property;
  const a = doc.agent;
  const brandHex = hexAlpha(doc.brand.primary, doc.brand).hex;
  const accentHex = hexAlpha(doc.brand.accent, doc.brand).hex;
  const children: InstanceType<typeof Paragraph | typeof Table>[] = [];
  const para = (text: string, o: Record<string, unknown> = {}) => new Paragraph({ children: [new TextRun({ text, ...o })], spacing: { after: 120 } });

  if (doc.brand.logo) {
    try {
      const img = await fetchBytes(doc.brand.logo);
      const el = await images.load(doc.brand.logo).then(() => images.get(doc.brand.logo!));
      const w = 180;
      const h = el ? Math.round((w * el.naturalHeight) / Math.max(1, el.naturalWidth)) : 70;
      children.push(new Paragraph({ children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: w, height: Math.min(h, 120) } })], spacing: { after: 200 } }));
    } catch {
      /* logo is optional */
    }
  }
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: p.name || title, color: brandHex, bold: true })] }));
  if (p.tagline) children.push(para(p.tagline, { italics: true, size: 28, color: "555555" }));
  children.push(para([p.transaction === "lease" ? "For lease" : "For sale", priceText(p), p.location].filter(Boolean).join("  ·  "), { bold: true, color: accentHex, size: 26 }));

  const facts: [string, string][] = [
    ["Property type", p.kind],
    ["Price", priceText(p)],
    ["Location", p.location],
    ["Bedrooms", p.bedrooms === 0 ? "Studio" : p.bedrooms ? String(p.bedrooms) : ""],
    ["Bathrooms", p.bathrooms ? String(p.bathrooms) : ""],
    ["Floor area", p.floorArea ? `${p.floorArea.toLocaleString()} sqm` : ""],
    ["Lot area", p.lotArea ? `${p.lotArea.toLocaleString()} sqm` : ""],
    ["Parking", p.parking ? String(p.parking) : ""],
    ["Listing code", p.listingCode ?? ""],
  ];
  const rows = facts.filter(([, v]) => v);
  if (rows.length)
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map(
          ([k, v]) =>
            new TableRow({
              children: [
                new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F1EC" }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true })] })] }),
                new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, children: [new Paragraph(v)] }),
              ],
            }),
        ),
        borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "EEEEEE" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
      }),
    );

  const section = (h: string) => children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: h, color: brandHex })], spacing: { before: 280, after: 120 } }));
  if (p.description) {
    section("About the property");
    for (const part of p.description.split(/\n{2,}/)) children.push(para(part));
  }
  if (p.highlights.length) {
    section("Highlights");
    for (const h of p.highlights) children.push(new Paragraph({ text: h, bullet: { level: 0 } }));
  }
  if (p.amenities.length) {
    section("Features and amenities");
    for (const id of p.amenities) children.push(new Paragraph({ text: amenityInfo(id).label, bullet: { level: 0 } }));
  }
  if (p.location || p.nearby.length) {
    section("Location");
    if (p.location) children.push(para(p.location));
    for (const n of p.nearby) children.push(new Paragraph({ text: n, bullet: { level: 0 } }));
  }
  if (p.paymentTerms) {
    section("Price and payment terms");
    children.push(para(priceText(p), { bold: true }));
    for (const part of p.paymentTerms.split(/\n+/)) children.push(para(part));
  }
  if (a.name || a.phone || a.email) {
    section("Contact");
    for (const line of [a.name, a.title, a.company, a.phone, a.email, a.website, a.license ? `PRC License No. ${a.license}` : ""].filter(Boolean)) children.push(para(line));
  }

  // The designed slides, as pictures.
  children.push(new Paragraph({ children: [new PageBreak()] }));
  section(doc.kind === "trailer" ? "Storyboard" : "Presentation");
  const pageW = doc.width > doc.height ? 620 : 380;
  for (let i = 0; i < doc.slides.length; i++) {
    const c = renderToCanvas(doc, doc.slides[i]!, images, 0.6);
    const blob = await toBlob(c, "image/jpeg", 0.88);
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "jpg", data: await blob.arrayBuffer(), transformation: { width: pageW, height: Math.round((pageW * doc.height) / doc.width) } })], spacing: { after: 160 } }));
    if (doc.kind === "trailer") children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Scene ${i + 1} · ${doc.slides[i]!.duration.toFixed(1)} s`, size: 18, color: "777777" })] }));
    onProgress?.((i + 1) / doc.slides.length);
  }
  if (factsText(p)) children.push(para(" "));

  const file = new Document({
    creator: a.name || "Grid Agentic",
    title,
    description: "Property brief from Grid Agentic · Property Teaser",
    styles: { default: { document: { run: { font: font("$body", doc.brand), size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
  });
  return Packer.toBlob(file);
}

// ---------------------------------------------------------------- Video

export interface VideoResult {
  blob: Blob;
  ext: "mp4" | "webm";
}

export async function exportVideo(doc: TeaserDoc, images: ImageCache, onProgress: (p: number) => void, signal?: AbortSignal, fps = 30): Promise<VideoResult> {
  await prepare(doc, images);
  const { total } = trailerTimeline(doc);
  const canvas = document.createElement("canvas");
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext("2d")!;
  const frames = Math.ceil(total * fps);
  const mb = await import("mediabunny");
  const codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: doc.width, height: doc.height }).catch(() => null);
  if (codec) {
    const format = codec === "avc" ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat();
    const output = new mb.Output({ format, target: new mb.BufferTarget() });
    const source = new mb.CanvasSource(canvas, { codec, quality: mb.QUALITY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    for (let f = 0; f < frames; f++) {
      if (signal?.aborted) {
        await output.cancel();
        throw new DOMException("Cancelled", "AbortError");
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawTrailerFrame(ctx, doc, f / fps, images);
      await source.add(f / fps, 1 / fps);
      if (f % 10 === 0) onProgress(f / frames);
    }
    await output.finalize();
    onProgress(1);
    const ext = codec === "avc" ? "mp4" : "webm";
    return { blob: new Blob([output.target.buffer!], { type: ext === "mp4" ? "video/mp4" : "video/webm" }), ext };
  }
  // Fallback: record the canvas in real time.
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm", videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      if (signal?.aborted || t >= total) return resolve();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawTrailerFrame(ctx, doc, t, images);
      onProgress(t / total);
      requestAnimationFrame(step);
    };
    step();
  });
  rec.stop();
  await done;
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  return { blob: new Blob(chunks, { type: "video/webm" }), ext: "webm" };
}

export { color };

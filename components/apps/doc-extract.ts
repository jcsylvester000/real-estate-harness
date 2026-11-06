"use client";
/**
 * Reads text out of a file in the browser, so the original never leaves the device:
 *  - PDF: the text layer (pdf.js); pages with no text (scans) are rendered and read with OCR.
 *  - Word (.docx): mammoth.
 *  - Images (JPG, PNG, WebP): OCR with tesseract.js (English model, self-hosted under /ocr).
 *  - Text, Markdown, CSV: as is.
 * Everything loads on first use and from this site only (no CDN).
 */
import type { DocInput } from "@/lib/sdk/types";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,application/pdf,image/*,text/plain";
const MAX_OCR_PAGES = 15;

type Progress = (label: string, pct?: number) => void;
type OcrWorker = { recognize(img: HTMLCanvasElement | File | Blob): Promise<{ data: { text: string; confidence: number } }>; terminate(): Promise<unknown> };

async function ocrWorker(progress: Progress): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js");
  const origin = window.location.origin;
  return (await createWorker("eng", 1, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr/core`,
    langPath: `${origin}/ocr/lang`,
    workerBlobURL: false,
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") progress("Reading text (OCR)", m.progress);
      else if (/loading/.test(m.status)) progress("Loading the OCR engine (first time only)", m.progress);
    },
  })) as unknown as OcrWorker;
}

async function fromPdf(file: File, progress: Progress): Promise<Omit<DocInput, "name" | "mime">> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: { page: number; text: string }[] = [];
  const needOcr: number[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    progress(`Reading page ${i} of ${pdf.numPages}`, i / pdf.numPages);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    for (const it of content.items as { str?: string; hasEOL?: boolean }[]) text += (it.str ?? "") + (it.hasEOL ? "\n" : " ");
    text = text.replace(/[ \t]+\n/g, "\n").trim();
    pages.push({ page: i, text });
    if (text.replace(/\s/g, "").length < 40) needOcr.push(i);
  }
  if (!needOcr.length) return { method: "pdf-text", pages };
  // Scanned pages: render and OCR (first pages only, to keep it quick).
  const worker = await ocrWorker(progress);
  const confs: number[] = [];
  try {
    for (const [n, i] of needOcr.slice(0, MAX_OCR_PAGES).entries()) {
      progress(`OCR page ${i} (${n + 1} of ${Math.min(needOcr.length, MAX_OCR_PAGES)})`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas } as never).promise;
      const r = await worker.recognize(canvas);
      pages[i - 1] = { page: i, text: r.data.text };
      confs.push(r.data.confidence);
    }
  } finally {
    await worker.terminate();
  }
  return { method: "pdf-ocr", pages, ocrConfidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : undefined };
}

async function fromImage(file: File, progress: Progress): Promise<Omit<DocInput, "name" | "mime">> {
  const worker = await ocrWorker(progress);
  try {
    const r = await worker.recognize(file);
    return { method: "image-ocr", pages: [{ page: 1, text: r.data.text }], ocrConfidence: r.data.confidence };
  } finally {
    await worker.terminate();
  }
}

async function fromDocx(file: File): Promise<Omit<DocInput, "name" | "mime">> {
  const mammoth = (await import("mammoth/mammoth.browser.js")) as unknown as { extractRawText(o: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> };
  const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { method: "docx", pages: [{ page: 1, text: r.value }] };
}

/** Returns the text of a file, ready for grid.docs.add(). Throws a readable message on unsupported files. */
export async function extractDocument(file: File, progress: Progress = () => {}): Promise<DocInput> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("That file is over 15 MB. Upload a smaller copy.");
  const name = file.name.slice(0, 160);
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const mime = file.type || "application/octet-stream";
  let r: Omit<DocInput, "name" | "mime">;
  if (ext === "pdf" || mime === "application/pdf") r = await fromPdf(file, progress);
  else if (ext === "docx") r = await fromDocx(file);
  else if (/^image\//.test(mime) || ["png", "jpg", "jpeg", "webp"].includes(ext)) r = await fromImage(file, progress);
  else if (["txt", "md", "csv"].includes(ext) || mime.startsWith("text/")) r = { method: "text", pages: [{ page: 1, text: await file.text() }] };
  else if (ext === "doc") throw new Error("Old .doc files can't be read here. Save it as .docx or PDF and upload again.");
  else throw new Error("That file type isn't supported. Use PDF, Word (.docx), text or an image.");
  return { name, mime, ...r };
}

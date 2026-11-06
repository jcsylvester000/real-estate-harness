// Copies the browser OCR and PDF assets into public/ so they are served from this site (no CDN):
// tesseract.js worker + WASM core (LSTM builds) + English language data, and the pdf.js worker.
// Runs before dev and build; the copies are gitignored.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const nm = (p) => join(process.cwd(), "node_modules", p);
const out = (p) => join(process.cwd(), "public", p);
const copy = (from, to) => {
  if (!existsSync(from)) throw new Error(`Missing ${from}. Run npm install.`);
  mkdirSync(join(to, ".."), { recursive: true });
  cpSync(from, to);
};

copy(nm("tesseract.js/dist/worker.min.js"), out("ocr/worker.min.js"));
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) copy(nm(`tesseract.js-core/${f}`), out(`ocr/core/${f}`));
copy(nm("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"), out("ocr/lang/eng.traineddata.gz"));
copy(nm("pdfjs-dist/build/pdf.worker.min.mjs"), out("pdfjs/pdf.worker.min.mjs"));
console.log("Copied OCR and PDF assets to public/ocr and public/pdfjs.");

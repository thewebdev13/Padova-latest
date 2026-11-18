import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { UNREAD_FILE_MESSAGE } from './intake-preview';

export type FileTextExtract = {
  text: string;
  extractable: boolean;
  note?: string;
  method?: 'pdf-text' | 'pdf-ocr' | 'ocr' | 'none';
};

const require = createRequire(import.meta.url);

/** Cache pdf.js load — first Turbopack compile can fail; reuse after warm. */
let pdfjsLoad: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadPdfjs() {
  if (!pdfjsLoad) {
    pdfjsLoad = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
          require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
        ).href;
      }
      return pdfjs;
    })();
  }
  try {
    return await pdfjsLoad;
  } catch (err) {
    // Allow a later retry after Turbopack finishes compiling the package.
    pdfjsLoad = null;
    throw err;
  }
}

/**
 * Digital PDF text via pdf.js getTextContent.
 */
export async function extractPdfTextViaPdfjs(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  try {
    const pdfjs = await loadPdfjs();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    if (!pdf.numPages) {
      return {
        text: '',
        extractable: false,
        method: 'none',
        note: `PDF “${filename}”: no pages.`,
      };
    }
    const parts: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if (!item || typeof item !== 'object' || !('str' in item)) continue;
        pageText += String((item as { str?: string }).str || '');
        pageText += (item as { hasEOL?: boolean }).hasEOL ? '\n' : ' ';
      }
      const cleaned = pageText.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim();
      if (cleaned) parts.push(cleaned);
    }
    const text = parts.join('\n\n').trim();
    if (!text) {
      return {
        text: '',
        extractable: false,
        method: 'none',
        note: `PDF “${filename}”: no selectable text (likely a scan).`,
      };
    }
    return { text, extractable: true, method: 'pdf-text' };
  } catch (err) {
    return {
      text: '',
      extractable: false,
      method: 'none',
      note: `PDF “${filename}”: ${err instanceof Error ? err.message : 'pdf.js read failed'}.`,
    };
  }
}

/**
 * pdf-parse text layer (CJS, no worker) — preferred first path under Next/Turbopack.
 */
export async function extractPdfTextLayer(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  try {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
      data: Buffer,
    ) => Promise<{ text?: string }>;
    const result = await pdfParse(bytes);
    const text = String(result?.text || '')
      .replace(/\u0000/g, '')
      .trim();
    if (!text) {
      return {
        text: '',
        extractable: false,
        method: 'none',
        note: `PDF “${filename}”: no selectable text (likely a scan).`,
      };
    }
    return { text, extractable: true, method: 'pdf-text' };
  } catch (err) {
    return {
      text: '',
      extractable: false,
      method: 'none',
      note: `PDF “${filename}”: ${err instanceof Error ? err.message : 'read failed'}.`,
    };
  }
}

/** Re-export OCR entry for tests; implementation lives in intake-pdf-ocr.ts. */
export async function extractPdfScannedOcr(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  const { extractPdfScannedOcr: run } = await import('./intake-pdf-ocr');
  return run(bytes, filename);
}

/**
 * Fast path for email poll / cron: pdf-parse text layer only (no OCR, no pdf.js retry).
 * Keeps cron-job.org / Vercel under timeout while still reading digital confirmation PDFs.
 */
export async function extractPdfTextFast(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  const layer = await extractPdfTextLayer(bytes, filename);
  if (layer.extractable && layer.text.trim()) return layer;
  return {
    text: '',
    extractable: false,
    method: 'none',
    note:
      layer.note ||
      `PDF “${filename}”: no selectable text in fast poll mode (OCR skipped). Paste or staff upload for scans.`,
  };
}

/**
 * pdf-parse → pdf.js (with one retry) → scanned OCR.
 * Order prefers CJS pdf-parse so first-open under Turbopack does not depend on the ESM worker.
 */
export async function extractPdfText(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  const layer = await extractPdfTextLayer(bytes, filename);
  if (layer.extractable && layer.text.trim()) return layer;

  let viaPdfjs = await extractPdfTextViaPdfjs(bytes, filename);
  if (!viaPdfjs.extractable || !viaPdfjs.text.trim()) {
    await sleep(350);
    viaPdfjs = await extractPdfTextViaPdfjs(bytes, filename);
  }
  if (viaPdfjs.extractable && viaPdfjs.text.trim()) return viaPdfjs;

  const ocr = await extractPdfScannedOcr(bytes, filename);
  if (ocr.extractable && ocr.text.trim()) return ocr;

  return {
    text: '',
    extractable: false,
    method: 'none',
    note:
      ocr.note ||
      viaPdfjs.note ||
      layer.note ||
      `PDF “${filename}”: ${UNREAD_FILE_MESSAGE}`,
  };
}

/**
 * Local free OCR (Tesseract.js) for confirmation screenshots.
 * Returns raw OCR text for the existing paste parser — does not invent fields.
 */
export async function extractImageTextOcr(
  bytes: Buffer,
  filename = 'upload.png',
): Promise<FileTextExtract> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const {
        data: { text: raw },
      } = await worker.recognize(bytes);
      const text = String(raw || '')
        .replace(/\u0000/g, '')
        .trim();
      if (!text) {
        return {
          text: '',
          extractable: false,
          method: 'none',
          note: `Image “${filename}”: OCR found no text. ${UNREAD_FILE_MESSAGE}`,
        };
      }
      return { text, extractable: true, method: 'ocr' };
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    return {
      text: '',
      extractable: false,
      method: 'none',
      note: `Image “${filename}”: OCR failed (${err instanceof Error ? err.message : 'error'}). ${UNREAD_FILE_MESSAGE}`,
    };
  }
}

export async function extractBinaryIntakeText(
  mimeType: string,
  bytes: Buffer,
  filename = 'upload',
  opts?: { fast?: boolean },
): Promise<FileTextExtract> {
  const mime = (mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const lower = filename.toLowerCase();
  const fast = Boolean(opts?.fast);
  if (mime === 'application/pdf' || /\.pdf$/i.test(lower))
    return fast ? extractPdfTextFast(bytes, filename) : extractPdfText(bytes, filename);
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(lower)) {
    // Image OCR is too slow for cron poll — staff upload/paste can still OCR.
    if (fast) {
      return {
        text: '',
        extractable: false,
        method: 'none',
        note: `Image “${filename}”: skipped in fast email poll (OCR). Use staff intake for screenshots.`,
      };
    }
    return extractImageTextOcr(bytes, filename);
  }
  return {
    text: '',
    extractable: false,
    method: 'none',
    note: `File “${filename}” (${mime}): ${UNREAD_FILE_MESSAGE}`,
  };
}

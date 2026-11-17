import { createRequire } from 'node:module';
import { UNREAD_FILE_MESSAGE } from './intake-preview';

export type FileTextExtract = {
  text: string;
  extractable: boolean;
  note?: string;
  method?: 'pdf-text' | 'pdf-ocr' | 'ocr' | 'none';
};

const require = createRequire(import.meta.url);

/** Cap scanned-PDF OCR cost on serverless (pages × Tesseract). */
const PDF_OCR_MAX_PAGES = 5;
const PDF_OCR_SCALE = 1.5;

/**
 * Best-effort text from a digital PDF (text layer only).
 * Empty text layer → caller may fall back to page OCR.
 */
export async function extractPdfTextLayer(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  try {
    // Import lib entry — package root runs a debug harness that needs test PDFs.
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

/**
 * Rasterize PDF pages (local free) and OCR with Tesseract — for scanned / image-only PDFs.
 * Does not invent Field:Value; returns raw OCR text for the existing paste parser.
 */
export async function extractPdfScannedOcr(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  try {
    // Native canvas must stay external to Turbopack (serverExternalPackages + CJS require).
    const { createCanvas } = require('@napi-rs/canvas') as {
      createCanvas: (w: number, h: number) => {
        getContext: (type: '2d') => unknown;
        toBuffer: (mime: string) => Buffer;
      };
    };
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createWorker } = await import('tesseract.js');
    const { pathToFileURL } = await import('node:url');

    // Node has no bundler worker URL — point at the package worker file.
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
      ).href;
    }

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages || 0, PDF_OCR_MAX_PAGES);
    if (pageCount < 1) {
      return {
        text: '',
        extractable: false,
        method: 'none',
        note: `PDF “${filename}”: no pages to OCR. ${UNREAD_FILE_MESSAGE}`,
      };
    }

    const worker = await createWorker('eng');
    const parts: string[] = [];
    try {
      for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: PDF_OCR_SCALE });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        const canvas = createCanvas(width, height);
        const canvasContext = canvas.getContext('2d');
        await page.render({
          // pdf.js types expect DOM canvas; @napi-rs/canvas is compatible at runtime.
          canvasContext: canvasContext as any,
          viewport,
        }).promise;
        const png = canvas.toBuffer('image/png');
        const {
          data: { text: raw },
        } = await worker.recognize(png);
        const pageText = String(raw || '')
          .replace(/\u0000/g, '')
          .trim();
        if (pageText) parts.push(pageText);
      }
    } finally {
      await worker.terminate();
    }

    const text = parts.join('\n\n').trim();
    if (!text) {
      return {
        text: '',
        extractable: false,
        method: 'none',
        note: `PDF “${filename}”: scanned OCR found no text. ${UNREAD_FILE_MESSAGE}`,
      };
    }
    const more =
      (pdf.numPages || 0) > PDF_OCR_MAX_PAGES
        ? ` (first ${PDF_OCR_MAX_PAGES} of ${pdf.numPages} pages)`
        : '';
    return {
      text,
      extractable: true,
      method: 'pdf-ocr',
      note: `PDF “${filename}”: scanned page OCR${more}`,
    };
  } catch (err) {
    return {
      text: '',
      extractable: false,
      method: 'none',
      note: `PDF “${filename}”: scanned OCR failed (${err instanceof Error ? err.message : 'error'}). ${UNREAD_FILE_MESSAGE}`,
    };
  }
}

/**
 * Text layer first; if empty, free local page OCR (scanned PDFs). Never invents fields.
 */
export async function extractPdfText(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  const layer = await extractPdfTextLayer(bytes, filename);
  if (layer.extractable && layer.text.trim()) return layer;
  const ocr = await extractPdfScannedOcr(bytes, filename);
  if (ocr.extractable && ocr.text.trim()) return ocr;
  return {
    text: '',
    extractable: false,
    method: 'none',
    note:
      ocr.note ||
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
): Promise<FileTextExtract> {
  const mime = (mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const lower = filename.toLowerCase();
  if (mime === 'application/pdf' || /\.pdf$/i.test(lower)) return extractPdfText(bytes, filename);
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(lower))
    return extractImageTextOcr(bytes, filename);
  return {
    text: '',
    extractable: false,
    method: 'none',
    note: `File “${filename}” (${mime}): ${UNREAD_FILE_MESSAGE}`,
  };
}

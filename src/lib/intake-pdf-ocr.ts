/**
 * Scanned-PDF page OCR — loaded only when text-layer extract is empty.
 * Kept separate so Turbopack does not pull pdfjs worker into every intake request.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { UNREAD_FILE_MESSAGE } from './intake-preview';

type FileTextExtract = {
  text: string;
  extractable: boolean;
  note?: string;
  method?: 'pdf-text' | 'pdf-ocr' | 'ocr' | 'none';
};

const require = createRequire(import.meta.url);
const PDF_OCR_MAX_PAGES = 5;
const PDF_OCR_SCALE = 1.5;

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (pdfjs.GlobalWorkerOptions) {
    // Resolve worker via createRequire (file path), not serverExternalPackages.
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    ).href;
  }
  return pdfjs;
}

export async function extractPdfScannedOcr(
  bytes: Buffer,
  filename = 'upload.pdf',
): Promise<FileTextExtract> {
  try {
    const { createCanvas } = require('@napi-rs/canvas') as {
      createCanvas: (w: number, h: number) => {
        getContext: (type: '2d') => unknown;
        toBuffer: (mime: string) => Buffer;
      };
    };
    const pdfjs = await loadPdfjs();
    const { createWorker } = await import('tesseract.js');

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

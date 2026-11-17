import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractPdfScannedOcr,
  extractPdfText,
  extractPdfTextLayer,
} from '../src/lib/intake-file-text';
import { UNREAD_FILE_MESSAGE } from '../src/lib/intake-preview';

test('fake PDF text layer empty then scanned OCR fails without inventing text', async () => {
  const bytes = Buffer.from('%PDF-1.4 fake content');
  const layer = await extractPdfTextLayer(bytes, 'conf.pdf');
  assert.equal(layer.extractable, false);
  const ocr = await extractPdfScannedOcr(bytes, 'conf.pdf');
  assert.equal(ocr.extractable, false);
  assert.equal(ocr.text, '');
  assert.match(String(ocr.note), /couldn't read this file/i);
  const combined = await extractPdfText(bytes, 'conf.pdf');
  assert.equal(combined.extractable, false);
  assert.equal(combined.method, 'none');
  assert.match(String(combined.note), /couldn't read this file/i);
  assert.match(UNREAD_FILE_MESSAGE, /couldn't read this file/i);
});

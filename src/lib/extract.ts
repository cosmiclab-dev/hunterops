// Text extraction from uploaded resumes: PDF (unpdf / pdf.js), DOCX (mammoth), plain text.
import { HttpError } from './http';

export async function extractText(filename: string, buffer: Buffer) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (buffer.length > 4 * 1024 * 1024) throw new HttpError(413, 'Resume files must be under 4 MB.');
  try {
    if (ext === 'pdf' || buffer.subarray(0, 4).toString() === '%PDF') {
      const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await pdfText(pdf, { mergePages: true });
      return text;
    }
    if (ext === 'docx') {
      const mammoth = (await import('mammoth')).default;
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    if (ext === 'txt' || ext === 'md') return buffer.toString('utf8');
  } catch (err) {
    console.error('[extract]', err);
    throw new HttpError(422, `Could not read that ${ext.toUpperCase()} file. Try exporting it again, or paste the text.`);
  }
  throw new HttpError(415, 'Upload a PDF, DOCX or TXT file (old .doc files are not supported).');
}

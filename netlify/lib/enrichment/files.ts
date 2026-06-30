import { extractText, getDocumentProxy } from 'unpdf';
import { getCandidateFile } from '../blobs';

/**
 * Extract text from a stored candidate file. PDFs via unpdf (serverless-friendly,
 * no native deps); text/* decoded directly. Other types (e.g. .docx) return ''
 * for now — a later enhancement can add a converter.
 */
export async function extractFileText(blobKey: string, contentType: string | null): Promise<string> {
  const buf = await getCandidateFile(blobKey);
  if (!buf) return '';

  const type = (contentType ?? '').toLowerCase();
  const key = blobKey.toLowerCase();

  if (type.includes('pdf') || key.endsWith('.pdf')) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  if (type.startsWith('text/') || /\.(txt|md|csv|json)$/.test(key)) {
    return new TextDecoder().decode(buf);
  }

  return '';
}

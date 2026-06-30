import { getStore } from '@netlify/blobs';

/** Object store for uploaded candidate files (PDFs/docs). */
const STORE_NAME = 'candidate-files';

export function candidateFilesStore() {
  return getStore(STORE_NAME);
}

/** Deterministic key for a candidate's uploaded file. */
export function fileBlobKey(candidateId: string, filename: string): string {
  return `${candidateId}/${filename}`;
}

export async function putCandidateFile(
  key: string,
  data: ArrayBuffer | Blob | string,
): Promise<void> {
  await candidateFilesStore().set(key, data);
}

export async function getCandidateFile(key: string): Promise<ArrayBuffer | null> {
  return candidateFilesStore().get(key, { type: 'arrayBuffer' });
}

export async function deleteCandidateFile(key: string): Promise<void> {
  await candidateFilesStore().delete(key);
}

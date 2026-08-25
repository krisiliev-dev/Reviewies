/**
 * The wire format for reference timelines: packed uint32 pairs, base64.
 *
 * Split out from `references.ts` because that module reaches for the Supabase client,
 * and the server-side promotion function needs to decode a payload without dragging a
 * configured client into an environment that has no user session. Both sides of a
 * format must read it with the same code or the format is a guess.
 */

/** Pack a Uint32Array into base64 for transport. */
export function encodeHashes(hashes: Uint32Array): string {
  const bytes = new Uint8Array(hashes.buffer, hashes.byteOffset, hashes.byteLength);
  let binary = '';
  // Chunked: spreading a megabyte into String.fromCharCode overflows the stack.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function decodeHashes(encoded: string): Uint32Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Uint32Array needs 4-byte alignment; a truncated payload would misread wildly.
  const usable = bytes.byteLength - (bytes.byteLength % 4);
  return new Uint32Array(bytes.buffer.slice(0, usable));
}

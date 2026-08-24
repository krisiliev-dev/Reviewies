/**
 * Fold a SQLite write-ahead log back into its database file.
 *
 * From doc 8 §3.1, and the reason this module exists at all:
 *
 * > check whether the TAR also has `DioCache.db-wal` sitting next to `DioCache.db`.
 * > TV Time ran SQLite in WAL mode, so the most recent months often live in that
 * > `-wal` file rather than the `.db` itself. Pull only the `.db` and you can end up
 * > with a partial history without realising it.
 *
 * The rescue tool everyone is being pointed at opens the `.db` alone. A browser
 * SQLite build cannot see a sidecar file either — it is handed one buffer. So the
 * merge happens here, on bytes, before SQLite is involved: apply every committed WAL
 * frame over the corresponding page of the main image and hand SQLite the result.
 *
 * Format per https://sqlite.org/fileformat2.html#walformat. All WAL integers are
 * big-endian; the page *contents* are opaque and copied verbatim.
 */

const WAL_HEADER_BYTES = 32;
const FRAME_HEADER_BYTES = 24;
const MAGIC_LITTLE = 0x377f0682;
const MAGIC_BIG = 0x377f0683;

export interface WalMergeResult {
  database: Uint8Array;
  /** Pages actually taken from the log. Zero means the log added nothing. */
  pagesApplied: number;
  /** Frames that were present but not committed, or invalid; reported, never applied. */
  framesIgnored: number;
  warnings: string[];
}

/** Page size from the main database header. Byte 16-17; the value 1 means 65536. */
export function databasePageSize(db: Uint8Array): number {
  if (db.byteLength < 100) return 0;
  const raw = new DataView(db.buffer, db.byteOffset, db.byteLength).getUint16(16);
  return raw === 1 ? 65536 : raw;
}

/**
 * SQLite's WAL checksum: a Fibonacci-weighted running sum over 32-bit words.
 *
 * Verifying it is what separates recovering data from applying garbage. A frame left
 * over from an older, longer transaction can sit in the file with a plausible page
 * number, and writing it over a good page would corrupt the database silently.
 */
export function walChecksum(
  bytes: Uint8Array,
  bigEndian: boolean,
  seed: [number, number] = [0, 0],
): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let [s0, s1] = seed;
  // The algorithm is defined over pairs of words; a trailing odd word cannot occur
  // because everything it runs over is a multiple of 8 bytes.
  for (let i = 0; i + 8 <= bytes.byteLength; i += 8) {
    s0 = (s0 + view.getUint32(i, !bigEndian) + s1) >>> 0;
    s1 = (s1 + view.getUint32(i + 4, !bigEndian) + s0) >>> 0;
  }
  return [s0, s1];
}

/**
 * Apply a `-wal` file to its database.
 *
 * Returns the original bytes unchanged if there is no usable log, so callers can pass
 * an optional sidecar without branching. Every reason for stopping early is reported
 * rather than swallowed: a partial recovery the user knows about is fine, a partial
 * recovery they think is complete is the failure this whole module exists to prevent.
 */
export function applyWal(db: Uint8Array, wal?: Uint8Array): WalMergeResult {
  const result: WalMergeResult = {
    database: db,
    pagesApplied: 0,
    framesIgnored: 0,
    warnings: [],
  };
  if (!wal || wal.byteLength < WAL_HEADER_BYTES) return result;

  const pageSize = databasePageSize(db);
  if (!pageSize) {
    result.warnings.push('That does not look like a SQLite database.');
    return result;
  }

  const header = new DataView(wal.buffer, wal.byteOffset, wal.byteLength);
  const magic = header.getUint32(0);
  if (magic !== MAGIC_LITTLE && magic !== MAGIC_BIG) {
    result.warnings.push('The -wal file is not a SQLite write-ahead log; ignoring it.');
    return result;
  }
  const bigEndian = magic === MAGIC_BIG;

  const walPageSize = header.getUint32(8);
  if (walPageSize !== pageSize) {
    // Almost always means the two files came from different databases.
    result.warnings.push(
      `The -wal file uses ${walPageSize}-byte pages but the database uses ${pageSize}. ` +
        'They do not belong together, so the log was ignored.',
    );
    return result;
  }

  const salt1 = header.getUint32(16);
  const salt2 = header.getUint32(20);

  // The header's own checksum seeds the running sum for the first frame.
  let running = walChecksum(wal.subarray(0, 24), bigEndian);
  if (running[0] !== header.getUint32(24) || running[1] !== header.getUint32(28)) {
    result.warnings.push('The -wal header failed its checksum; ignoring the log.');
    return result;
  }

  const frameStride = FRAME_HEADER_BYTES + pageSize;
  const committed = new Map<number, Uint8Array>();
  let pending = new Map<number, Uint8Array>();
  let finalPageCount = 0;

  let offset = WAL_HEADER_BYTES;
  for (; offset + frameStride <= wal.byteLength; offset += frameStride) {
    const frame = new DataView(wal.buffer, wal.byteOffset + offset, FRAME_HEADER_BYTES);
    const pageNumber = frame.getUint32(0);
    const dbSizeAfterCommit = frame.getUint32(4);

    // A salt mismatch marks the end of the current generation of the log. Everything
    // beyond it belongs to a checkpointed-away transaction.
    if (frame.getUint32(8) !== salt1 || frame.getUint32(12) !== salt2) break;

    const page = wal.subarray(offset + FRAME_HEADER_BYTES, offset + frameStride);
    let next = walChecksum(wal.subarray(offset, offset + 8), bigEndian, running);
    next = walChecksum(page, bigEndian, next);
    if (next[0] !== frame.getUint32(16) || next[1] !== frame.getUint32(20)) break;
    running = next;

    pending.set(pageNumber, page);

    // A non-zero size field marks a commit: everything accumulated becomes durable.
    if (dbSizeAfterCommit !== 0) {
      for (const [number, data] of pending) committed.set(number, data);
      pending = new Map();
      finalPageCount = dbSizeAfterCommit;
    }
  }

  const trailing = Math.floor((wal.byteLength - offset) / frameStride);
  result.framesIgnored = pending.size + Math.max(0, trailing);

  if (committed.size === 0) {
    if (result.framesIgnored > 0) {
      result.warnings.push(
        `The -wal file holds ${result.framesIgnored} frame(s), none of them from a ` +
          'completed transaction, so none could be used.',
      );
    }
    return result;
  }

  // The last commit's page count is authoritative: the database may have grown or
  // been truncated since the main file was written.
  const basePages = Math.floor(db.byteLength / pageSize);
  const pages = Math.max(finalPageCount || basePages, ...committed.keys());
  const merged = new Uint8Array(pages * pageSize);
  merged.set(db.subarray(0, Math.min(db.byteLength, merged.byteLength)));

  for (const [number, data] of committed) {
    // Page numbers are 1-based.
    merged.set(data, (number - 1) * pageSize);
  }

  result.database = merged;
  result.pagesApplied = committed.size;
  return result;
}

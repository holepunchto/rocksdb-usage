export interface FamilyUsage {
  /**
   * `rocksdb.estimate-num-keys`. An estimate that includes writes still in the
   * memtable. An overwritten key counts once per copy until compaction merges
   * them, so a key that's been written and flushed twice reports 2.
   */
  keyCount: number
  /**
   * `rocksdb.estimate-live-data-size`. Only counts flushed data, so writes
   * still in the memtable report 0 here until a flush (see
   * `memtableMemoryBytes` for those). Live bytes in blob files are already
   * included, so don't add `blobBytes` from `getDiskUsage()` on top. Like
   * `keyCount`, an overwritten value counts once per flushed copy until
   * compaction merges them.
   */
  liveDataBytes: number
  /**
   * `rocksdb.cur-size-all-mem-tables`. Memory the memtables have allocated,
   * not the size of the data in them. Memory is allocated in blocks, so it
   * isn't 0 even when empty and moves in jumps: with the default options an empty memtable
   * reports 2 KiB, and a single 64 KiB write takes it to about 1 MiB. It drops
   * back once the memtable is flushed.
   */
  memtableMemoryBytes: number
}

export interface Usage {
  /** Every open column family keyed by name, `default` included. */
  families: Record<string, FamilyUsage>
}

export interface FamilyDiskUsage {
  /** `rocksdb.total-sst-files-size`. Every SST file in the family. */
  sstBytes: number
  /**
   * `rocksdb.total-blob-file-size`. Every blob file in the family, garbage
   * included. Deleting a blob doesn't make this smaller. Once compaction
   * catches up, the deleted bytes are counted in `blobGarbageBytes` as well.
   */
  blobBytes: number
  /**
   * `rocksdb.live-blob-file-garbage-size`. Deleted blobs still taking up space
   * in blob files that also hold live blobs. A delete doesn't show up here
   * straight away. It stays 0 after the delete, after a flush, and after a
   * plain `compactRange()`. It only appears once a compaction rewrites the
   * bottom level, for example `compactRange()` with `bottommostLevelCompaction:
   * FORCE`. A blob file with nothing live left is dropped whole instead, so
   * its bytes never count as garbage.
   */
  blobGarbageBytes: number
  /**
   * `rocksdb.estimate-pending-compaction-bytes`. RocksDB's estimate of how
   * much compaction still has to rewrite to bring every level under its target
   * size. This is work still to do, not space that compaction will free.
   */
  pendingCompactionBytes: number
}

export interface FileUsage {
  /** Every file in the database directory. */
  totalBytes: number
  /** Number of files in the database directory. */
  totalFiles: number
  /** `*.sst` files. */
  sstBytes: number
  /** Number of `*.sst` files. */
  sstFiles: number
  /** `*.blob` files. */
  blobBytes: number
  /** Number of `*.blob` files. */
  blobFiles: number
  /**
   * `*.log` files, meaning every WAL segment on disk, not just the active one.
   * That includes older segments that a family with unflushed writes is still
   * keeping alive. The plain-text `LOG` isn't a WAL and counts under `other`.
   */
  walBytes: number
  /** Number of `*.log` files. */
  walFiles: number
  /** Everything else: MANIFEST, OPTIONS, CURRENT, LOCK, IDENTITY, SESSION_ID and `LOG`. */
  otherBytes: number
  /** Number of other files. */
  otherFiles: number
}

export interface DiskUsage {
  /** Every open column family keyed by name, `default` included. */
  families: Record<string, FamilyDiskUsage>
  /**
   * `rocksdb.obsolete-sst-files-size`. SST files that are no longer part of
   * the database but haven't been deleted yet. This is database-wide, not per
   * family. It's usually 0, because files replaced by compaction get deleted
   * straight away.
   */
  obsoleteSstBytes: number
  /**
   * `currentWalFile().number`. The file number of the WAL being written to.
   * WALs share their numbering with SST and MANIFEST files, so the numbers
   * skip: a flush can take it from 4 to 8.
   */
  walActiveNumber: number
  /**
   * `currentWalFile().size`. The active WAL only. A flush can start a new WAL,
   * which drops this back to 0. Use `files.walBytes` for every segment.
   */
  walActiveBytes: number
  /**
   * `rocksdb.min-log-number-to-keep`. The oldest WAL still needed to recover
   * unflushed writes, database-wide. It stays 0 until the first flush, even
   * while unflushed writes are sitting in the WAL, so 0 doesn't mean nothing
   * needs keeping. A single family with unflushed writes holds it back for the
   * whole database, which keeps older WAL segments on disk after every other
   * family has flushed.
   */
  walOldestNumber: number
  /**
   * `obsoleteSstBytes` plus every family's `blobGarbageBytes`, meaning what
   * compaction and blob GC can free. WAL, MANIFEST and LOG aren't included.
   */
  reclaimableBytes: number
  /** The directory walk, or `null` unless `includeFiles` is set. */
  files: FileUsage | null
}

export interface DiskUsageOptions {
  /** Walk the database directory and fill in `files`. Defaults to `false`. */
  includeFiles?: boolean
}

/**
 * Report what the data is: estimated key count, live data size and memtable
 * memory for every open column family, keyed by name.
 *
 * Every family is read at the same moment. A call made while the database is
 * suspended waits for resume, while one started before `suspend()` reads
 * straight away.
 *
 * @param db A rocksdb-native `>=3.18.1` database or session. Every session
 * gives the same result.
 *
 * @example
 * const RocksDB = require('rocksdb-native')
 * const { getUsage } = require('rocksdb-usage')
 *
 * const db = new RocksDB('./example.db')
 * const { families } = await getUsage(db)
 *
 * for (const [name, family] of Object.entries(families)) {
 *   console.log(name, family.keyCount, family.liveDataBytes)
 * }
 */
export function getUsage(db: any): Promise<Usage>

/**
 * Report what the data costs on disk, and walk the database directory to fill
 * in `files`.
 *
 * The walk is the only way to get the total WAL size and the files that aren't
 * part of the database, such as MANIFEST, OPTIONS and LOG. Everything else in
 * the result is the same as without it.
 *
 * @param db A rocksdb-native `>=3.18.1` database or session. Every session
 * gives the same result.
 * @param opts Options.
 * @param opts.includeFiles Walk the database directory and fill in `files`.
 *
 * @example
 * const RocksDB = require('rocksdb-native')
 * const { getDiskUsage } = require('rocksdb-usage')
 *
 * const db = new RocksDB('./example.db')
 * const { files } = await getDiskUsage(db, { includeFiles: true })
 *
 * console.log(files.totalBytes, files.walBytes, files.walFiles)
 */
export function getDiskUsage(
  db: any,
  opts: DiskUsageOptions & { includeFiles: true }
): Promise<DiskUsage & { files: FileUsage }>

/**
 * Report what the data costs on disk: SST, blob and blob garbage bytes and
 * pending compaction for every open column family, plus the WAL position and
 * `reclaimableBytes`, which is what compaction and blob GC would free.
 *
 * Every family is read at the same moment. A call made while the database is
 * suspended waits for resume, while one started before `suspend()` reads
 * straight away. `files` is `null` unless `includeFiles` is set.
 *
 * @param db A rocksdb-native `>=3.18.1` database or session. Every session
 * gives the same result.
 * @param opts Options.
 * @param opts.includeFiles Walk the database directory and fill in `files`.
 * Defaults to `false`.
 *
 * @example
 * const RocksDB = require('rocksdb-native')
 * const { getDiskUsage } = require('rocksdb-usage')
 *
 * const db = new RocksDB('./example.db')
 * const { families, reclaimableBytes } = await getDiskUsage(db)
 *
 * for (const [name, family] of Object.entries(families)) {
 *   console.log(name, family.sstBytes, family.blobBytes)
 * }
 *
 * if (reclaimableBytes > 0) await db.compact()
 */
export function getDiskUsage(db: any, opts?: DiskUsageOptions): Promise<DiskUsage>

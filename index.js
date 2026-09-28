const fs = require('fs')
const { join } = require('path')

exports.getUsage = function getUsage(db) {
  return withSessions(db, async (sessions) => {
    const perFamily = await getFamilyProperties(sessions, [
      'rocksdb.estimate-num-keys',
      'rocksdb.estimate-live-data-size',
      'rocksdb.cur-size-all-mem-tables'
    ])

    const families = {}

    for (const [name, [keyCount, liveDataBytes, memtableMemoryBytes]] of perFamily) {
      families[name] = { keyCount, liveDataBytes, memtableMemoryBytes }
    }

    return { families }
  })
}

exports.getDiskUsage = async function getDiskUsage(db, { files = false } = {}) {
  const usage = await withSessions(db, async (sessions) => {
    const [perFamily, [obsoleteSstBytes, walOldestNumber], wal] = await Promise.all([
      getFamilyProperties(sessions, [
        'rocksdb.total-sst-files-size',
        'rocksdb.total-blob-file-size',
        'rocksdb.live-blob-file-garbage-size',
        'rocksdb.estimate-pending-compaction-bytes'
      ]),
      // Database-wide, so any family will do
      getProperties(sessions[0], [
        'rocksdb.obsolete-sst-files-size',
        'rocksdb.min-log-number-to-keep'
      ]),
      db.currentWalFile()
    ])

    const families = {}
    let totalBlobGarbageBytes = 0

    for (const [name, values] of perFamily) {
      const [sstBytes, blobBytes, blobGarbageBytes, pendingCompactionBytes] = values

      families[name] = { sstBytes, blobBytes, blobGarbageBytes, pendingCompactionBytes }
      totalBlobGarbageBytes += blobGarbageBytes
    }

    return {
      families,
      obsoleteSstBytes,
      walActiveNumber: wal.number,
      walActiveBytes: wal.size,
      walOldestNumber,
      reclaimableBytes: obsoleteSstBytes + totalBlobGarbageBytes,
      files: null
    }
  })

  // The walk never waits for resume, so it can come after the reads
  if (files) usage.files = await getFileUsage(db.path)

  return usage
}

// fn has to start every read before its first await. Nothing else runs until then, so a suspend()
// can't land between the reads: they all read now, or all wait for resume together.
async function withSessions(db, fn) {
  // Awaiting even a settled ready() yields, so only wait while opening
  if (!db.opened) await db.ready()

  const sessions = columnFamilies(db).map((columnFamily) =>
    db.session({ columnFamily, snapshot: false })
  )

  try {
    return await fn(sessions)
  } finally {
    for (const session of sessions) await session.close()
  }
}

// rocksdb-native has no public list of open column families, so read it off the shared state
function columnFamilies(db) {
  return db._state.columnFamilies
}

function getFamilyProperties(sessions, names) {
  return Promise.all(
    sessions.map(async (session) => [
      session.defaultColumnFamily.name,
      await getProperties(session, names)
    ])
  )
}

function getProperties(session, names) {
  return Promise.all(names.map(async (name) => Number(await session.getProperty(name))))
}

async function getFileUsage(dir) {
  const usage = {
    totalBytes: 0,
    totalFiles: 0,
    sstBytes: 0,
    sstFiles: 0,
    blobBytes: 0,
    blobFiles: 0,
    walBytes: 0,
    walFiles: 0,
    otherBytes: 0,
    otherFiles: 0
  }

  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue

    let size

    try {
      size = (await fs.promises.stat(join(dir, entry.name))).size
    } catch (err) {
      if (err.code === 'ENOENT') continue
      throw err
    }

    const kind = fileKind(entry.name)

    usage[kind + 'Bytes'] += size
    usage[kind + 'Files']++
    usage.totalBytes += size
    usage.totalFiles++
  }

  return usage
}

function fileKind(name) {
  if (name.endsWith('.sst')) return 'sst'
  if (name.endsWith('.blob')) return 'blob'
  if (name.endsWith('.log')) return 'wal'
  return 'other'
}

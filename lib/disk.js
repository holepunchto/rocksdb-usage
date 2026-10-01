const withSessions = require('./sessions')
const { getFamilyProperties, getProperties } = require('./props')
const getFileUsage = require('./file')

async function getDiskUsage(db, { includeFiles = false } = {}) {
  const usage = await withSessions(db, async (sessions) => {
    const [perFamily, [obsoleteSstBytes, walOldestNumber], wal] = await Promise.all([
      getFamilyProperties(sessions, [
        'rocksdb.total-sst-files-size',
        'rocksdb.total-blob-file-size',
        'rocksdb.live-blob-file-garbage-size',
        'rocksdb.estimate-pending-compaction-bytes'
      ]),
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

  if (includeFiles) usage.files = await getFileUsage(db.path)

  return usage
}

module.exports = getDiskUsage

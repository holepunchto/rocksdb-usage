exports.getUsage = async function getUsage(db) {
  await db.ready()

  const families = {}

  for (const columnFamily of columnFamilies(db)) {
    const [keyCount, liveDataBytes, memtableMemoryBytes] = await getProperties(db, columnFamily, [
      'rocksdb.estimate-num-keys',
      'rocksdb.estimate-live-data-size',
      'rocksdb.cur-size-all-mem-tables'
    ])

    families[columnFamily.name] = { keyCount, liveDataBytes, memtableMemoryBytes }
  }

  return { families }
}

exports.getDiskUsage = async function getDiskUsage(db) {
  await db.ready()

  const wal = await db.currentWalFile()

  const families = {}
  let totalBlobGarbageBytes = 0

  for (const columnFamily of columnFamilies(db)) {
    const [sstBytes, blobBytes, blobGarbageBytes, pendingCompactionBytes] = await getProperties(
      db,
      columnFamily,
      [
        'rocksdb.total-sst-files-size',
        'rocksdb.total-blob-file-size',
        'rocksdb.live-blob-file-garbage-size',
        'rocksdb.estimate-pending-compaction-bytes'
      ]
    )

    families[columnFamily.name] = { sstBytes, blobBytes, blobGarbageBytes, pendingCompactionBytes }
    totalBlobGarbageBytes += blobGarbageBytes
  }

  // Database-wide, so any family will do
  const [obsoleteSstBytes, walOldestNumber] = await getProperties(db, columnFamilies(db)[0], [
    'rocksdb.obsolete-sst-files-size',
    'rocksdb.min-log-number-to-keep'
  ])

  return {
    families,
    obsoleteSstBytes,
    walActiveNumber: wal.number,
    walActiveBytes: wal.size,
    walOldestNumber,
    reclaimableBytes: obsoleteSstBytes + totalBlobGarbageBytes,
    files: null
  }
}

// rocksdb-native has no public list of open column families, so read it off the shared state
function columnFamilies(db) {
  return db._state.columnFamilies
}

async function getProperties(db, columnFamily, names) {
  const session = db.session({ columnFamily, snapshot: false })

  try {
    const values = []

    for (const name of names) values.push(Number(await session.getProperty(name)))

    return values
  } finally {
    await session.close()
  }
}

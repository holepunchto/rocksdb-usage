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

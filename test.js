const test = require('brittle')
const RocksDB = require('rocksdb-native')
const { getUsage, getDiskUsage } = require('.')

test('getUsage reports every column family', async (t) => {
  const db = new RocksDB(await t.tmp())
  const a = db.columnFamily('a')
  const b = db.columnFamily('b')

  await a.put('hello', 'world')
  await a.flush()

  const { families } = await getUsage(db)

  t.alike(Object.keys(families).sort(), ['a', 'b', 'default'])
  t.ok(families.a.keyCount > 0)
  t.ok(families.a.liveDataBytes > 0)
  t.is(families.b.keyCount, 0)
  t.is(families.b.liveDataBytes, 0)

  await a.close()
  await b.close()
  await db.close()
})

test('getUsage gives the same result from any session', async (t) => {
  const db = new RocksDB(await t.tmp())
  const a = db.columnFamily('a')

  await a.put('hello', 'world')
  await a.flush()

  t.alike(await getUsage(a), await getUsage(db))

  await a.close()
  await db.close()
})

test('getUsage counts writes that have not been flushed', async (t) => {
  const db = new RocksDB(await t.tmp())
  await db.ready()

  const before = await getUsage(db)

  await db.put('big', Buffer.alloc(65536))

  const after = await getUsage(db)

  t.ok(after.families.default.memtableMemoryBytes > before.families.default.memtableMemoryBytes)
  t.ok(after.families.default.keyCount > 0)

  await db.close()
})

test('getUsage includes live data held in blob files', async (t) => {
  const db = new RocksDB(await t.tmp())
  const blobs = db.columnFamily(
    new RocksDB.ColumnFamily('blobs', { enableBlobFiles: true, minBlobSize: 1024 })
  )

  await blobs.put('big', Buffer.alloc(65536))
  await blobs.flush()

  const { families } = await getUsage(db)

  t.ok(families.blobs.liveDataBytes >= 65536)
  t.ok(families.blobs.liveDataBytes < 131072)

  await blobs.close()
  await db.close()
})

test('getUsage returns a number for every field', async (t) => {
  const db = new RocksDB(await t.tmp())
  await db.put('hello', 'world')

  const { families } = await getUsage(db)

  t.alike(Object.keys(families.default), ['keyCount', 'liveDataBytes', 'memtableMemoryBytes'])
  t.ok(Object.values(families.default).every(Number.isFinite))

  await db.close()
})

test('getUsage leaves no sessions open', async (t) => {
  const db = new RocksDB(await t.tmp())
  const a = db.columnFamily('a')
  await db.ready()

  const { sessions } = db.diagnostics()

  await getUsage(db)

  t.is(db.diagnostics().sessions, sessions)

  await a.close()
  await db.close()
})

test('suspend + getUsage + resume', async (t) => {
  const db = new RocksDB(await t.tmp())
  await db.ready()
  await db.put('hello', 'world')
  await db.suspend()

  const call = settled(db, getUsage(db))

  await db.resume()

  const { beforeResume, value } = await call

  t.is(beforeResume, false)
  t.ok(value.families.default)

  await db.close()
})

test('suspend + getUsage + close', async (t) => {
  const db = new RocksDB(await t.tmp())
  await db.ready()
  await db.suspend()

  const call = t.exception(getUsage(db), /RocksDB session is closed/)

  await db.close()
  await call
})

test('getDiskUsage reports every column family', async (t) => {
  const db = new RocksDB(await t.tmp())
  const a = db.columnFamily('a')

  await a.put('hello', 'world')
  await a.flush()

  const usage = await getDiskUsage(db)

  t.alike(Object.keys(usage.families).sort(), ['a', 'default'])
  t.ok(usage.families.a.sstBytes > 0)
  t.is(usage.families.default.sstBytes, 0)
  t.is(usage.files, null)

  await a.close()
  await db.close()
})

test('getDiskUsage reports blob garbage as reclaimable', async (t) => {
  const db = new RocksDB(await t.tmp())
  const blobs = db.columnFamily(
    new RocksDB.ColumnFamily('blobs', {
      enableBlobFiles: true,
      minBlobSize: 1024,
      blobFileSize: 64 * 1024 * 1024
    })
  )

  await blobs.put('a', Buffer.alloc(65536))
  await blobs.put('b', Buffer.alloc(65536))
  await blobs.flush()
  await blobs.delete('a')
  await blobs.flush()
  await blobs.compactRange({
    bottommostLevelCompaction: RocksDB.constants.bottommostLevelCompaction.FORCE
  })

  const usage = await getDiskUsage(db)
  const garbage = Object.values(usage.families).reduce(
    (sum, family) => sum + family.blobGarbageBytes,
    0
  )

  t.ok(usage.families.blobs.blobGarbageBytes >= 65536)
  t.is(usage.reclaimableBytes, usage.obsoleteSstBytes + garbage)

  await blobs.close()
  await db.close()
})

test('getDiskUsage reports the active and oldest WAL', async (t) => {
  const db = new RocksDB(await t.tmp())
  await db.put('hello', 'world')

  const usage = await getDiskUsage(db)

  t.ok(usage.walActiveBytes > 0)
  t.ok(usage.walActiveNumber >= usage.walOldestNumber)

  await db.close()
})

test('getDiskUsage returns a number for every field', async (t) => {
  const db = new RocksDB(await t.tmp())
  await db.put('hello', 'world')

  const usage = await getDiskUsage(db)

  t.alike(Object.keys(usage.families.default), [
    'sstBytes',
    'blobBytes',
    'blobGarbageBytes',
    'pendingCompactionBytes'
  ])
  t.ok(Object.values(usage.families.default).every(Number.isFinite))
  t.ok(
    [
      usage.obsoleteSstBytes,
      usage.walActiveNumber,
      usage.walActiveBytes,
      usage.walOldestNumber,
      usage.reclaimableBytes
    ].every(Number.isFinite)
  )

  await db.close()
})

test('getDiskUsage leaves no sessions open', async (t) => {
  const db = new RocksDB(await t.tmp())
  const a = db.columnFamily('a')
  await db.ready()

  const { sessions } = db.diagnostics()

  await getDiskUsage(db)

  t.is(db.diagnostics().sessions, sessions)

  await a.close()
  await db.close()
})

test('suspend + getDiskUsage + resume', async (t) => {
  const db = new RocksDB(await t.tmp())
  await db.ready()
  await db.put('hello', 'world')
  await db.suspend()

  const call = settled(db, getDiskUsage(db))

  await db.resume()

  const { beforeResume, value } = await call

  t.is(beforeResume, false)
  t.ok(value.families.default)

  await db.close()
})

test('suspend + getDiskUsage + close', async (t) => {
  const db = new RocksDB(await t.tmp())
  await db.ready()
  await db.suspend()

  const call = t.exception(getDiskUsage(db), /RocksDB session is closed/)

  await db.close()
  await call
})

test('getDiskUsage with files walks the database directory', async (t) => {
  const db = new RocksDB(await t.tmp())
  const blobs = db.columnFamily(
    new RocksDB.ColumnFamily('blobs', { enableBlobFiles: true, minBlobSize: 1024 })
  )

  await db.put('hello', 'world')
  await db.flush()
  await blobs.put('big', Buffer.alloc(65536))
  await blobs.flush()

  const { families, files } = await getDiskUsage(db, { files: true })
  const familySstBytes = Object.values(families).reduce((sum, family) => sum + family.sstBytes, 0)
  const familyBlobBytes = Object.values(families).reduce((sum, family) => sum + family.blobBytes, 0)

  t.alike(Object.keys(files), [
    'totalBytes',
    'totalFiles',
    'sstBytes',
    'sstFiles',
    'blobBytes',
    'blobFiles',
    'walBytes',
    'walFiles',
    'otherBytes',
    'otherFiles'
  ])
  t.is(files.totalBytes, files.sstBytes + files.blobBytes + files.walBytes + files.otherBytes)
  t.is(files.totalFiles, files.sstFiles + files.blobFiles + files.walFiles + files.otherFiles)
  t.ok(files.sstBytes >= familySstBytes)
  t.ok(files.blobBytes >= familyBlobBytes)
  t.ok(files.blobFiles > 0)
  t.ok(files.walFiles >= 1)
  t.ok(files.otherFiles > 0)

  await blobs.close()
  await db.close()
})

async function settled(db, promise) {
  try {
    const value = await promise
    return { beforeResume: db.diagnostics().resumedPending, value }
  } catch (err) {
    return { beforeResume: db.diagnostics().resumedPending, error: err.message }
  }
}

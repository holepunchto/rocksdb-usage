const withSessions = require('./sessions')
const { getFamilyProperties } = require('./props')

function getUsage(db) {
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

module.exports = getUsage

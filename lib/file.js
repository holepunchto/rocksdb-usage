const fs = require('fs')
const { join } = require('path')

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

module.exports = getFileUsage

function fileKind(name) {
  switch (name.slice(name.lastIndexOf('.') + 1)) {
    case 'sst':
      return 'sst'
    case 'blob':
      return 'blob'
    case 'log':
      return 'wal'
    default:
      return 'other'
  }
}

const fs = require('fs')
const { join } = require('path')

async function getFileUsage(dir) {
  const usage = {
    totalBytes: 0,
    totalAllocatedBytes: 0,
    totalFiles: 0,
    sstBytes: 0,
    sstAllocatedBytes: 0,
    sstFiles: 0,
    blobBytes: 0,
    blobAllocatedBytes: 0,
    blobFiles: 0,
    walBytes: 0,
    walAllocatedBytes: 0,
    walFiles: 0,
    otherBytes: 0,
    otherAllocatedBytes: 0,
    otherFiles: 0
  }

  await walk(dir, usage)

  return usage
}

module.exports = getFileUsage

async function walk(dir, usage) {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      try {
        await walk(path, usage)
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }

      continue
    }

    if (!entry.isFile()) continue

    let stat

    try {
      stat = await fs.promises.stat(path)
    } catch (err) {
      if (err.code === 'ENOENT') continue
      throw err
    }

    const kind = fileKind(entry.name)
    const allocated = stat.blocks * 512

    usage[kind + 'Bytes'] += stat.size
    usage[kind + 'AllocatedBytes'] += allocated
    usage[kind + 'Files']++
    usage.totalBytes += stat.size
    usage.totalAllocatedBytes += allocated
    usage.totalFiles++
  }
}

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

# rocksdb-usage

Data size and disk usage for [rocksdb-native](https://github.com/holepunchto/rocksdb-native) databases.

```
npm i rocksdb-usage
```

Takes any rocksdb-native `>=3.18.1` database or session.

## Usage

```js
const RocksDB = require('rocksdb-native')
const { getUsage, getDiskUsage } = require('rocksdb-usage')

const db = new RocksDB('./example.db')

console.log(await getUsage(db))
console.log(await getDiskUsage(db))
```

## API

Every call reports every open column family keyed by name, `default` included, gives the same result from any session, and reads every family at the same moment. A call made while the database is suspended waits for resume, while one started before `suspend()` reads straight away and doesn't wait.

#### `const usage = await getUsage(db)`

What the data is.

```jsonc
{
  "families": {
    "<name>": {
      "keyCount": 0, // estimate-num-keys
      "liveDataBytes": 0, // estimate-live-data-size, includes live blob bytes
      "memtableMemoryBytes": 0 // cur-size-all-mem-tables, allocated memory rather than data size
    }
  }
}
```

#### `const usage = await getDiskUsage(db, [options])`

What the data costs on disk.

Options include:

```js
{
  includeFiles: false // walk the database directory and fill in usage.files
}
```

```jsonc
{
  "families": {
    "<name>": {
      "sstBytes": 0, // total-sst-files-size
      "blobBytes": 0, // total-blob-file-size
      "blobGarbageBytes": 0, // live-blob-file-garbage-size
      "pendingCompactionBytes": 0 // estimate-pending-compaction-bytes
    }
  },
  "obsoleteSstBytes": 0, // obsolete-sst-files-size, database-wide
  "walActiveNumber": 0, // currentWalFile().number
  "walActiveBytes": 0, // currentWalFile().size
  "walOldestNumber": 0, // min-log-number-to-keep, database-wide
  "reclaimableBytes": 0, // obsoleteSstBytes + blobGarbageBytes across families
  "files": null // directory walk, only with { includeFiles: true }
}
```

`reclaimableBytes` is what compaction and blob GC actually free, so WAL, MANIFEST and LOG aren't in it.

`{ includeFiles: true }` fills in `files` from a walk of the database directory. Everything else in the result is the same.

```jsonc
"files": {
  "totalBytes": 0, "totalAllocatedBytes": 0, "totalFiles": 0, // every file under the directory, subdirectories and hidden files included
  "sstBytes": 0, "sstAllocatedBytes": 0, "sstFiles": 0, // *.sst
  "blobBytes": 0, "blobAllocatedBytes": 0, "blobFiles": 0, // *.blob
  "walBytes": 0, "walAllocatedBytes": 0, "walFiles": 0, // *.log, every WAL segment rather than just the active one, archive/ included
  "otherBytes": 0, "otherAllocatedBytes": 0, "otherFiles": 0 // MANIFEST, OPTIONS, CURRENT, LOCK, IDENTITY, SESSION_ID and the plain-text LOG
}
```

`*Bytes` are file sizes, the same measure as the rest of the result. `*AllocatedBytes` are the disk space the files take up, which includes block rounding and the space RocksDB reserves ahead for the WAL and MANIFEST on Linux, Android and Windows, so `totalAllocatedBytes` is what the database costs on disk. It's the only way to get the total disk space, including every WAL segment and the files that aren't part of the database.

## License

Apache-2.0

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

Every call reports every open column family keyed by name, `default` included, gives the same result from any session, and waits for resume while the database is suspended.

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

#### `const usage = await getDiskUsage(db)`

What the data costs on disk.

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
  "files": null
}
```

`reclaimableBytes` is what compaction and blob GC actually free, so WAL, MANIFEST and LOG aren't in it.

## License

Apache-2.0

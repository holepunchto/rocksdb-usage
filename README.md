# rocksdb-usage

Data size and disk usage for [rocksdb-native](https://github.com/holepunchto/rocksdb-native) databases.

```
npm i rocksdb-usage
```

Takes any rocksdb-native `>=3.18.1` database or session.

## Usage

```js
const RocksDB = require('rocksdb-native')
const { getUsage } = require('rocksdb-usage')

const db = new RocksDB('./example.db')

console.log(await getUsage(db))
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

## License

Apache-2.0

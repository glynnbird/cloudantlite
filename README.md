# cloudantlite

A super-lightweight Node.js library for Cloudant. It takes the "relax" function from Nano and removes all of the other functions leavning you with only

* relax
* get
* put
* post
* del

This removes any abstraction the the Nano library puts in place and teaches you the CouchDB HTTP API instead.

## Installation

Install with npm

```
npm install cloudantlite
```

Then in your code

```
  var cloudant = require('cloudantlite')('https://mykey:mypassword@myhost.cloudant.com');
```

## CRUD

### Creating a database

```
cloudant.put( { db: 'mydb' }, function(err, data) {
  console.log(err, data);
});
```

### Querying the stats of a database

```
cloudant.get( { db: 'mydb' }, function(err, data) {
  console.log(err, data);
});
// null { db_name: 'mydb', doc_count: 0, doc_del_count: 0, update_seq: 0, purge_seq: 0, compact_running: false, disk_size: 79, data_size: 0, i instance_start_time: '1453203828519666', disk_format_version: 6, committed_update_seq: 0 }
```

### Deleting a database

```
cloudant.del( { 'db': 'glynn'}, function(err, data ) {
  console.log(err, data);
});
// null { ok: true }
```

### Creating a document - bring your own ID

```
cloudant.put( { 'db': 'mydb', doc: 'myid', body: { a:1,  b:2} }, function(err, data ) {
  console.log(err, data);
});
null { ok: true, id: 'myid', rev: '1-25f9b97d75a648d1fcd23f0a73d2776e' }
```

### Creating a document - database generates the ID

```
cloudant.post( { 'db': 'mydb', body: { a:1,  b:2} }, function(err, data ) {
  console.log(err, data);
});
// null{ ok: true, id: 'b7b12408c2b7059433eb0e8767006219', rev: '1-25f9b97d75a648d1fcd23f0a73d2776e' }
```

### Updating a document 

```
cloudant.put( { 'db': 'mydb', body: { a:1,  b:3}, doc: 'b7b12408c2b7059433eb0e8767006219', qs: { rev: '1-25f9b97d75a648d1fcd23f0a73d2776e' }}, function(err, data ) {
  console.log(err, data);
});
// null { ok: true, id: 'b7b12408c2b7059433eb0e8767006219', rev: '2-8a759d1f5a1537bcf775ab7bc947b377' }
```

### Deleting a document

```
cloudant.del( { 'db': 'mydb', doc: 'b7b12408c2b7059433eb0e8767006219', qs: { rev: '2-8a759d1f5a1537bcf775ab7bc947b377' }}, function(err, data ) {
  console.log(err, data);
});
// null { ok: true, id: 'b7b12408c2b7059433eb0e8767006219', rev: '3-e0da009d1c09ad26125b7bfa5c2ba0cb' }
```


## Extending the library

Although `cloudantlite` is a minimal library, it can be programmatically extended to add your own functions:

```
var getVersion = function ( callback) {
  this.relax({}, function (err, data) {
    if (err) return callback(true, null);
    callback(null, data.version);
  });
};

var update = function(db, docid, revid, body, callback) {
  var opts = { method: 'put', 'db': db, doc: docid, qs: { rev: revid}, body: body};
  this.relax(opts, callback);
};

cloudant.extend("getVersion", getVersion);
cloudant.extend("update", update);

cloudant.getVersion(function(err, data) {
  console.log(err, data);
});

cloudant.update('mydb', 'myid', '1-25f9b97d75a648d1fcd23f0a73d2776e', { a:1, b:2, c:3, d:4}, function(err, data) {
  console.log(err, data);
});
```

The above example shows how the `extend` function is used to attach functions to the library to provide helper functions to

* return the version of CouchDB/Cloudant being used
* update a known revision of a document

The functions use `this.relax` to perform API calls.

## Debugging

To see debugging messages for each request made, run your code like so:

```
DEBUG=cloudantlite node test.js
```



var u = require('url'),
  request = require('request'),
  debug = require('debug')('cloudantlite'),
  errs = require('errs'),
  httpAgent = request;
  configdefaults = { requst: request, url: "http://localhost:5984", requestDefaults: { jar: false}};

module.exports = function(config) {

  // config
  if (typeof config === 'string') {
    config = { url: config};
  }
  var cfg = config ||  configdefaults;
 
  // extend dest object by adding things from source
  var munge = function(dest, source) {
    if (typeof source == "object") {
      for (var i in source) {
        dest[i] = source[i];
      }
    }
    return dest;
  };  
  
  // the main http request function
  var relax = function(opts, callback) {
     if (typeof opts === 'function') {
       callback = opts;
       opts = {path: ''};
     }

     if (typeof opts === 'string') {
       opts = {path: opts};
     }

     if (!opts) {
       opts = {path: ''};
       callback = null;
     }

     var qs = munge({}, opts.qs);

     var headers = {
       'content-type': 'application/json',
       accept: 'application/json'
     };

     var req = {
       method: (opts.method || 'GET'),
       headers: headers,
       uri: cfg.url
     };

     var parsed;
     var rh;

     // https://github.com/mikeal/request#requestjar
     var isJar = opts.jar || cfg.jar;

     if (isJar) {
       req.jar = isJar;
     }

     // http://wiki.apache.org/couchdb/HTTP_database_API#Naming_and_Addressing
     if (opts.db) {
       req.uri = urlResolveFix(req.uri, encodeURIComponent(opts.db));
     }

     if (opts.multipart) {
       req.multipart = opts.multipart;
     }

     req.headers = munge(req.headers,opts.headers);
     req.headers = munge(req.headers,cfg.defaultHeaders);

     if (opts.path) {
       req.uri += '/' + opts.path;
     } else if (opts.doc) {
       if (!/^_design/.test(opts.doc)) {
         // http://wiki.apache.org/couchdb/HTTP_Document_API#Naming.2FAddressing
         req.uri += '/' + encodeURIComponent(opts.doc);
       } else {
         // http://wiki.apache.org/couchdb/HTTP_Document_API#Document_IDs
         req.uri += '/' + opts.doc;
       }

       // http://wiki.apache.org/couchdb/HTTP_Document_API#Attachments
       if (opts.att) {
         req.uri += '/' + opts.att;
       }
     }

     // prevent bugs where people set encoding when piping
     if (opts.encoding !== undefined && callback) {
       req.encoding = opts.encoding;
       delete req.headers['content-type'];
       delete req.headers.accept;
     }

     if (opts.contentType) {
       req.headers['content-type'] = opts.contentType;
       delete req.headers.accept;
     }

     // http://guide.couchdb.org/draft/security.html#cookies
     if (cfg.cookie) {
       req.headers['X-CouchDB-WWW-Authenticate'] = 'Cookie';
       req.headers.cookie = cfg.cookie;
     }

     // http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
     if (typeof opts.qs === 'object' && Object.keys(opts.qs).length > 0) {
       ['startkey', 'endkey', 'key', 'keys'].forEach(function(key) {
         if (key in opts.qs) {
           qs[key] = JSON.stringify(opts.qs[key]);
         }
       });
       req.qs = qs;
     }

     if (opts.body) {
       if (Buffer.isBuffer(opts.body) || opts.dontStringify) {
         req.body = opts.body;
       } else {
         req.body = JSON.stringify(opts.body, function(key, value) {
           // don't encode functions
           if (typeof(value) === 'function') {
             return value.toString();
           } else {
             return value;
           }
         });
       }
     }

     if (opts.form) {
       req.headers['content-type'] =
         'application/x-www-form-urlencoded; charset=utf-8';
       req.body = querystring.stringify(opts.form).toString('utf8');
     }

     debug(req);

     if (!callback) {
       return httpAgent(req);
     }

     return httpAgent(req, function(e, h, b) {
       rh = h && h.headers || {};
       rh.statusCode = h && h.statusCode || 500;
       rh.uri = req.uri;

       if (e) {
         debug({err: 'socket', body: b, headers: rh});
         return callback(errs.merge(e, {
           message: 'error happened in your connection',
           scope: 'socket',
           errid: 'request'
         }));
       }

       delete rh.server;
       delete rh['content-length'];

       if (opts.dontParse) {
         parsed = b;
       } else {
         try { parsed = JSON.parse(b); } catch (err) { parsed = b; }
       }

       if (rh.statusCode >= 200 && rh.statusCode < 400) {
         debug({err: null, body: parsed, headers: rh});
         return callback(null, parsed, rh);
       }

       debug({err: 'couch', body: parsed, headers: rh});

       // cloudant stacktrace
       if (typeof parsed === 'string') {
         parsed = {message: parsed};
       }

       if (!parsed.message && (parsed.reason || parsed.error)) {
         parsed.message = (parsed.reason || parsed.error);
       }

       // fix cloudant issues where they give an erlang stacktrace as js
       delete parsed.stack;

       callback(errs.merge({
         message: 'couch returned ' + rh.statusCode,
         scope: 'couch',
         statusCode: rh.statusCode,
         request: req,
         headers: rh,
         errid: 'non_200'
       }, errs.create(parsed)));
     });
   }
 
  // get helper
  var get = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts.method = 'get';
    relax(opts, cb);
  };

  // post helper
  var post = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts.method = 'post';
    relax(opts, cb);
  };

  // put helper
  var put = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts.method = 'put';
    relax(opts, cb);
  };

  // delete helper
  var del = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts.method = 'delete';
    relax(opts, cb);
  };

  var urlResolveFix = function (couchUrl, dbName) {
    if (/[^\/]$/.test(couchUrl)) {
      couchUrl += '/';
    }
    return u.resolve(couchUrl, dbName);
  };

  // the thing that's returned
  return {
    get: get,
    post: post, 
    put: put,
    del: del,
    relax: relax
  };
  
}

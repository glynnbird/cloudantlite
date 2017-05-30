
var u = require('url'),
  request = require('request'),
  _ = require('underscore'),
  async = require('async'),
  stream = require('stream'),
  debug = require('debug')('cloudantlite'),
  log = debug,
  jar = request.jar(),
  errs = require('errs');
  
function scrub(str) {
  if (str) {
    str = str.replace(/\/\/(.*)@/,'//XXXXXX:XXXXXX@');
  }
  return str;
};

module.exports = function(config) {

  function cookieRequest(req, callback) {
    debug('cookieRequest');
    if (typeof callback !== 'function') {
      callback = function() {};
    }
    var s = new stream.PassThrough();
    async.series([
      // call the request being asked for 
      function(done) {

        // if we have a cookie for this domain, then we can try the 
        // required API call straight away
        var cookies = jar.getCookies(cfg.url);
        var statusCode = 500;
        if (cookies.length > 0) {
          debug('we have cookies so attempting API call straight away');
          req.jar = jar;
          request(req, function(e, h, b) {
            if (statusCode >= 200 && statusCode < 400) {
              // returning an err of true stops the async sequence
              // we're good because we didn't get a 4** or 5**
              done(true, [e,h,b]);
            } else {
              done(null, [e,h,b]);
            }
          }).on('response', function(r) {
            statusCode = r && r.statusCode || 500;
          }).on('data', function(chunk) {
            if (statusCode < 400) {
              s.write(chunk);
            }
          }); 

        } else {
          debug('we have no cookies - need to authenticate first');
          // we have no cookies so we need to authenticate first
          // i.e. do nothing here
          done(null, null);
        }

      },

      // call POST /_session to get a cookie
      function(done) {
        debug('need to authenticate - calling POST /_session');
        var r = {
          url: cfg.url + '/_session', 
          method: 'post',
          form: {
            name: cfg.credentials.username,
            password: cfg.credentials.password
          },
          jar: jar
        };
        request(r, function(e, h, b) {
          var statusCode = h && h.statusCode || 500;
          // if we sucessfully authenticate
          if (statusCode >= 200 && statusCode < 400) {
            // continue to the next stage of the async chain
            debug('authentication successful');
            done(null, [e,h,b]);
          } else {
            // failed to authenticate - no point proceeding any further
            debug('authentication failed');
            done(true, [e,h,b]);
          }
        });
      },
      // call the request being asked for 
      function(done) {
        debug('attempting API call with cookie');
        var statusCode = 500;
        req.jar = jar;
        request(req, function(e, h, b) {
          done(null, [e,h,b]);
        }).on('response', function(r) {
          statusCode = r && r.statusCode || 500;
        }).on('data', function(chunk) {
          if (statusCode < 400) {
            s.write(chunk);
          }
        }); 
      }
    ], function(err, data) {
        // callback with the last call we made
        if (data && data.length > 0) {
          var reply = data[data.length - 1];
          callback(reply[0], reply[1], reply[2]);
        } else {
          callback(err, { statusCode: 500 }, null);
        }
    });

    // return the pass-through stream
    return s;
  };


  // config
  if (typeof config === 'string') {
    config = { url: config };
  }
  var configdefaults = { url: 'http://localhost:5984', requestDefaults: { jar: false}};
  var cfg = config || configdefaults; 
  cfg.request = cookieRequest;
  var parsed = u.parse(cfg.url);
  var auth = parsed.auth;
  delete parsed.auth;
  delete parsed.href;
  cfg.url = u.format(parsed).replace(/\/$/,'');
  if (auth) {
    var bits = auth.split(':');
    cfg.credentials = {
      username: bits[0],
      password: bits[1]
    };
  } else {
    cfg.credentials = null;
  }
  var httpAgent = cfg.request;
  

  

  

  function relax(opts, callback) {
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

    var qs = _.extend({}, opts.qs);

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

    req.headers = _.extend(req.headers, opts.headers, cfg.defaultHeaders);

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
    if (typeof opts.qs === 'object' && !_.isEmpty(opts.qs)) {
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

    log(req);

    if (!callback) {
      return httpAgent(req);
    }

    return httpAgent(req, function(e, h, b) {
      rh = h && h.headers || {};
      rh.statusCode = h && h.statusCode || 500;
      rh.uri = req.uri;

      if (e) {
        log({err: 'socket', body: b, headers: rh});
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
        log({err: null, body: parsed, headers: rh});
        return callback(null, parsed, rh);
      }

      log({err: 'couch', body: parsed, headers: rh});

      // cloudant stacktrace
      if (typeof parsed === 'string') {
        parsed = {message: parsed};
      }

      if (!parsed.message && (parsed.reason || parsed.error)) {
        parsed.message = (parsed.reason || parsed.error);
      }

      // fix cloudant issues where they give an erlang stacktrace as js
      delete parsed.stack;

      // scrub credentials
      req.uri = scrub(req.uri);
      rh.uri = scrub(rh.uri);
      if (req.headers.cookie) {
        req.headers.cookie = 'XXXXXXX';
      }

      callback(errs.merge({
        message: 'couch returned ' + rh.statusCode,
        scope: 'couch',
        statusCode: rh.statusCode,
        request: req,
        headers: rh,
        errid: 'non_200'
      }, errs.create(parsed)));
    });
  };
 
  var promiseRelax = function(opts, callback) {
    return new Promise(function(resolve, reject) {
      relax(opts, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
        if (callback) {
          callback(err, data);
        }
      });
    });
  }

  // get helper
  var get = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts.method = 'get';
    return promiseRelax(opts, cb);
  };

  // post helper
  var post = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts.method = 'post';
    return promiseRelax(opts, cb);
  };

  // put helper
  var put = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts.method = 'put';
    return promiseRelax(opts, cb);
  };

  // delete helper
  var del = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts.method = 'delete';
    return promiseRelax(opts, cb);
  };

  var urlResolveFix = function (couchUrl, dbName) {
    if (/[^\/]$/.test(couchUrl)) {
      couchUrl += '/';
    }
    return u.resolve(couchUrl, dbName);
  };
  
  function extend(extensionName, fn) {
    this[extensionName] = fn.bind(this);
  };

  // the thing that's returned
  return {
    get: get,
    post: post, 
    put: put,
    del: del,
    relax: relax,
    extend: extend
  };
  
};

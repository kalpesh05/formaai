/**
 * Forma Monitor — Universal Telemetry & Crash Reporting SDK
 * Compatible with Web Browsers, Electron (Renderer & Main), and Node.js.
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FormaMonitor = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var _config = {
    endpoint: '',
    agentId: '',
    apiKey: '',
    appName: 'App',
    appVersion: '1.0.0',
    environment: 'production',
    maxBreadcrumbs: 20,
    debug: false
  };

  var _breadcrumbs = [];
  var _initialized = false;

  function logDebug() {
    if (_config.debug && console && console.log) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[FormaMonitor]');
      console.log.apply(console, args);
    }
  }

  function addBreadcrumb(category, message, data) {
    var crumb = {
      timestamp: new Date().toISOString(),
      category: category,
      message: message,
      data: data
    };
    _breadcrumbs.push(crumb);
    if (_breadcrumbs.length > _config.maxBreadcrumbs) {
      _breadcrumbs.shift();
    }
  }

  function getDeviceInfo() {
    var isBrowser = typeof window !== 'undefined';
    var isElectron = typeof process !== 'undefined' && process.versions && !!process.versions.electron;
    var isNode = typeof process !== 'undefined' && process.versions && !!process.versions.node;

    return {
      runtime: isElectron ? 'electron' : (isBrowser ? 'browser' : (isNode ? 'node' : 'unknown')),
      userAgent: isBrowser && navigator ? navigator.userAgent : 'Node/' + (process ? process.version : 'unknown'),
      platform: isBrowser && navigator ? navigator.platform : (process ? process.platform : 'unknown'),
      screen: isBrowser && window.screen ? { width: window.screen.width, height: window.screen.height } : null,
      appVersion: _config.appVersion,
      environment: _config.environment
    };
  }

  function sendCrashReport(errorData) {
    if (!_config.endpoint || !_config.agentId) {
      logDebug('Cannot send crash: missing endpoint or agentId', _config);
      return;
    }

    var crashUrl = _config.endpoint.replace(/\/+$/, '') + '/api/v1/agents/' + encodeURIComponent(_config.agentId) + '/telemetry/crash';

    var payload = {
      message: errorData.message || 'Unknown runtime error',
      source_file: errorData.sourceFile || 'unknown',
      line_number: errorData.lineNumber || 0,
      column_number: errorData.columnNumber || 0,
      error_trace: errorData.stack || errorData.message || 'No stack trace available',
      user_context: {
        appName: _config.appName,
        environment: _config.environment,
        device: getDeviceInfo(),
        breadcrumbs: _breadcrumbs.slice(),
        url: typeof window !== 'undefined' && window.location ? window.location.href : 'main-process'
      }
    };

    logDebug('Dispatching crash telemetry to:', crashUrl, payload);

    if (typeof fetch !== 'undefined') {
      fetch(crashUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': _config.apiKey
        },
        body: JSON.stringify(payload)
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        logDebug('Telemetry response received:', data);
        if (data && data.autofix_pr_url) {
          console.info('%c[Forma AI Software Factory] Auto-Fix PR synthesized: ' + data.autofix_pr_url, 'color: #10b981; font-weight: bold;');
        }
      })
      .catch(function (err) {
        logDebug('Failed to send telemetry:', err);
      });
    } else if (typeof require !== 'undefined') {
      try {
        var https = require('https');
        var http = require('http');
        var urlParse = require('url').parse;
        var parsed = urlParse(crashUrl);
        var client = parsed.protocol === 'https:' ? https : http;

        var postData = JSON.stringify(payload);
        var req = client.request({
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'X-Agent-Key': _config.apiKey
          }
        }, function (res) {
          res.on('data', function () {});
        });

        req.on('error', function (err) {
          logDebug('Node request error:', err);
        });

        req.write(postData);
        req.end();
      } catch (e) {
        logDebug('Error dispatching Node crash:', e);
      }
    }
  }

  function init(options) {
    if (_initialized) return FormaMonitor;
    _initialized = true;

    if (options) {
      for (var key in options) {
        if (options.hasOwnProperty(key)) {
          _config[key] = options[key];
        }
      }
    }

    // Auto-detect from script tag if in browser
    if (typeof document !== 'undefined') {
      var currentScript = document.currentScript || (function () {
        var scripts = document.getElementsByTagName('script');
        return scripts[scripts.length - 1];
      })();

      if (currentScript) {
        if (!_config.endpoint) {
          var src = currentScript.getAttribute('src');
          if (src && src.indexOf('http') === 0) {
            var urlMatch = src.match(/^(https?:\/\/[^/]+)/);
            if (urlMatch) _config.endpoint = urlMatch[1];
          }
        }
        if (!_config.agentId && currentScript.getAttribute('data-agent-id')) {
          _config.agentId = currentScript.getAttribute('data-agent-id');
        }
        if (!_config.apiKey && currentScript.getAttribute('data-agent-key')) {
          _config.apiKey = currentScript.getAttribute('data-agent-key');
        }
      }
    }

    // Intercept console errors for breadcrumbs
    if (typeof console !== 'undefined' && console.error) {
      var originalConsoleError = console.error;
      console.error = function () {
        var args = Array.prototype.slice.call(arguments);
        addBreadcrumb('console', args.join(' '));
        originalConsoleError.apply(console, args);
      };
    }

    // 1. Browser & Electron Renderer Handlers
    if (typeof window !== 'undefined') {
      window.addEventListener('error', function (event) {
        addBreadcrumb('error', event.message);
        sendCrashReport({
          message: event.message || (event.error && event.error.message) || 'Uncaught runtime exception',
          sourceFile: event.filename,
          lineNumber: event.lineno,
          columnNumber: event.colno,
          stack: event.error ? event.error.stack : (event.message + ' at ' + event.filename + ':' + event.lineno)
        });
      });

      window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason;
        var msg = reason && reason.message ? reason.message : String(reason);
        addBreadcrumb('unhandledrejection', msg);
        sendCrashReport({
          message: msg || 'Unhandled Promise Rejection',
          sourceFile: window.location.href,
          lineNumber: 0,
          columnNumber: 0,
          stack: reason && reason.stack ? reason.stack : String(reason)
        });
      });
    }

    // 2. Node & Electron Main Process Handlers
    if (typeof process !== 'undefined' && process.on) {
      process.on('uncaughtException', function (err) {
        sendCrashReport({
          message: err.message || 'Uncaught Exception in Main Process',
          sourceFile: err.fileName || 'process:main',
          lineNumber: err.lineNumber || 0,
          columnNumber: 0,
          stack: err.stack || String(err)
        });
      });

      process.on('unhandledRejection', function (reason) {
        sendCrashReport({
          message: reason && reason.message ? reason.message : String(reason),
          sourceFile: 'process:main',
          lineNumber: 0,
          columnNumber: 0,
          stack: reason && reason.stack ? reason.stack : String(reason)
        });
      });
    }

    logDebug('FormaMonitor initialized with config:', _config);
    return FormaMonitor;
  }

  var FormaMonitor = {
    init: init,
    captureException: function (err, customData) {
      if (typeof err === 'string') {
        err = new Error(err);
      }
      sendCrashReport({
        message: err.message,
        sourceFile: err.fileName || (typeof window !== 'undefined' ? window.location.href : 'manual'),
        lineNumber: err.lineNumber || 0,
        columnNumber: 0,
        stack: err.stack || String(err)
      });
    },
    addBreadcrumb: addBreadcrumb,
    getConfig: function () { return Object.assign({}, _config); }
  };

  // Auto-init if data-agent-id is present on script tag
  if (typeof document !== 'undefined') {
    var script = document.currentScript || (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();
    if (script && script.getAttribute('data-agent-id')) {
      init();
    }
  }

  return FormaMonitor;
}));

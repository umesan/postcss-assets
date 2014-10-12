var vendor = require('postcss/lib/vendor');

var mapFunctions = require('./lib/mapFunctions');
var parseBytes = require('./lib/parseBytes');
var unescapeCss = require('./lib/unescapeCss');

var fs = require('fs');
var path = require('path');
var url = require('url');

var base64 = require('js-base64').Base64;
var cssesc = require('cssesc');
var mime = require('mime');
var sizeOf = require('image-size');

const AUTO_SIZE   = ['background-size', 'border-image-width', 'border-width',
                     'margin', 'padding'];
const AUTO_WIDTH  = ['border-left', 'border-left-width', 'border-right',
                     'border-right-width', 'left', 'margin-left',
                     'margin-right', 'max-width', 'min-width', 'padding-left',
                     'padding-right', 'width'];
const AUTO_HEIGHT = ['border-bottom', 'border-bottom-width', 'border-top',
                     'border-top-width', 'bottom', 'height', 'margin-bottom',
                     'margin-top', 'max-height', 'min-height',
                     'padding-bottom', 'padding-top'];

module.exports = function (options) {

  options = options || {};
  options.baseUrl = options.baseUrl || '/';

  if (options.basePath) {
    options.basePath = path.resolve(options.basePath);
  } else {
    options.basePath = process.cwd();
  }

  if (options.loadPaths) {
    options.loadPaths = options.loadPaths.map(function (loadPath) {
      return path.resolve(options.basePath, loadPath);
    });
  } else {
    options.loadPaths = [];
  }
  options.loadPaths.unshift(options.basePath);

  if (options.relativeTo) {
    options.relativeTo = path.resolve(options.relativeTo);
  } else {
    options.relativeTo = false;
  }

  function matchLoadPath(assetPath) {
    var matchingPath;
    var isFound = options.loadPaths.some(function (loadPath) {
      matchingPath = loadPath;
      return fs.existsSync(path.join(loadPath, assetPath));
    });
    if (!isFound) throw new Error("Asset not found or unreadable: " + assetPath);
    return matchingPath;
  }

  function resolveDataUrl(assetStr) {
    var resolvedPath = resolvePath(assetStr);
    var mimeType = mime.lookup(resolvedPath);
    var data = base64.encode(fs.readFileSync(resolvedPath));
    return 'data:' + mimeType + ';base64,' + data;
  }

  function resolvePath(assetStr) {
    var assetUrl = url.parse(unescapeCss(assetStr));
    var assetPath = decodeURI(assetUrl.pathname);
    return path.resolve(matchLoadPath(assetPath), assetPath);
  }

  function resolveUrl(assetStr) {
    var assetUrl = url.parse(unescapeCss(assetStr));
    var assetPath = decodeURI(assetUrl.pathname);
    if (options.relativeTo) {
      var toLoadPath = path.relative(options.relativeTo, matchLoadPath(assetPath));
      toLoadPath = path.join(toLoadPath, '/');
      assetUrl.pathname = url.resolve(toLoadPath, assetPath);
    } else {
      var baseToLoadPath = path.relative(options.basePath, matchLoadPath(assetPath));
      baseToLoadPath = path.join(baseToLoadPath || '.', '/');
      var baseUrl = url.resolve(options.baseUrl, baseToLoadPath);
      assetUrl.pathname = url.resolve(baseUrl, assetPath);
    }
    return cssesc(url.format(assetUrl));
  }

  function shouldBeInline(assetPath) {
    if (options.inline && options.inline.maxSize) {
      var size = fs.statSync(assetPath).size;
      return (size <= parseBytes(options.inline.maxSize));
    }
    return false;
  }

  return function (cssTree) {
    cssTree.eachDecl(function (decl) {

      decl.value = mapFunctions(decl.value, function (before, quote, assetStr, modifier, after) {

        if (AUTO_WIDTH.indexOf(vendor.unprefixed(decl.prop)) !== -1 || modifier === 'width') {
          return sizeOf(resolvePath(assetStr)).width + 'px';
        } else if (AUTO_HEIGHT.indexOf(vendor.unprefixed(decl.prop)) !== -1 || modifier === 'height') {
          return sizeOf(resolvePath(assetStr)).height + 'px';
        } else if (AUTO_SIZE.indexOf(vendor.unprefixed(decl.prop)) !== -1 || modifier === 'size') {
          var size = sizeOf(resolvePath(assetStr));
          return size.width + 'px ' + size.height + 'px';
        }
        var assetPath = resolvePath(assetStr);
        if (shouldBeInline(assetPath)) {
          return 'url(' + before + quote + resolveDataUrl(assetStr) + quote + after + ')';
        }
        return 'url(' + before + quote + resolveUrl(assetStr) + quote + after + ')';
      });
    });
  };
};

/********************************************************************
 *
 * Shared functions for most scripts, including background scripts and
 * content scripts.
 *
 * @public {object} scrapbook
 *******************************************************************/

var scrapbook = {};
var isDebug = false;


/********************************************************************
 * Options
 *******************************************************************/

scrapbook.options = {
  "dataFolder": "ScrapBook",
  "capture.saveSelectionOnly": true,
  "capture.saveAsUtf8": true,
  "capture.saveAsciiFilename": false,
  "capture.saveInlineAsHtml": false,
  "capture.image": ["save", "link", "blank", "comment", "remove", 0],
  "capture.imageBackground": ["save", "link", "remove", 0],
  "capture.audio": ["save", "link", "blank", "comment", "remove", 0],
  "capture.video": ["save", "link", "blank", "comment", "remove", 0],
  "capture.embed": ["save", "link", "blank", "comment", "remove", 0],
  "capture.object": ["save", "link", "blank", "comment", "remove", 0],
  "capture.applet": ["save", "link", "blank", "comment", "remove", 0],
  "capture.canvas": ["save", "blank", "comment", "remove", 0],
  "capture.frame": ["save", "link", "blank", "comment", "remove", 0],
  "capture.font": ["save", "link", "blank", "comment", "remove", 0],
  "capture.style": ["save", "link", "blank", "comment", "remove", 0],
  "capture.script": ["save", "link", "blank", "comment", "remove", 3],
  "capture.noscript": ["save", "comment", "remove", 0],
  "capture.scriptAttr": ["save", "remove", 1],
  "capture.scriptAnchor": ["save", "remove", 1],
  "capture.base": ["save", "empty", 0],
};

scrapbook.isOptionsSynced = false;

scrapbook.getOption = function (key, defaultValue) {
  var result = scrapbook.options[key];
  if (result === undefined) {
    result = defaultValue;
  }
  return result;
};

scrapbook.getOptions = function (keyPrefix) {
  var result = {};
  var regex = new RegExp("^" + scrapbook.escapeRegExp(keyPrefix) + ".");
  for (var key in scrapbook.options) {
    if (regex.test(key)) {
      result[key] = scrapbook.getOption(key);
    }
  }
  return result;
};

scrapbook.setOption = function (key, value, callback) {
  scrapbook.options[key] = value;
  chrome.storage.sync.set({ key: value }, function () {
    if (callback) {
      callback({ key: value });
    }
  });
};

scrapbook.loadOptions = function (callback) {
  chrome.storage.sync.get(scrapbook.options, function (items) {
    for (var i in items) {
      var item = items[i];
      if (Object.prototype.toString.call(item) === "[object Array]") {
        scrapbook.options[i] = item[item.pop()];
      } else {
        scrapbook.options[i] = item;
      }
    }
    if (callback) {
      scrapbook.isOptionsSynced = true;
      callback(scrapbook.options);
    }
  });
};

scrapbook.saveOptions = function (callback) {
  chrome.storage.sync.set(scrapbook.options, function () {
    if (callback) {
      callback(scrapbook.options);
    }
  });
};


/********************************************************************
 * Lang
 *******************************************************************/

scrapbook.loadLanguages = function (rootNode) {
  Array.prototype.slice.call(rootNode.getElementsByTagName("*")).forEach(function (elem) {
    var str = elem.textContent;
    if (/^__MSG_(.*?)__$/.test(str)) {
      elem.textContent = chrome.i18n.getMessage(RegExp.$1);
    }
  });
};

scrapbook.lang = function (key, args) {
  return chrome.i18n.getMessage(key, args);
};


/********************************************************************
 * ScrapBook related path/file/string/etc handling
 *******************************************************************/

/**
 * Escapes the given filename string to be used in the URI
 *
 * Preserves other chars for beauty
 *
 * see also: validateFilename
 */
scrapbook.escapeFilename = function (filename) {
  return filename.replace(/[#]+|(?:%[0-9A-Fa-f]{2})+/g, function (m) { return encodeURIComponent(m); });
};

/**
 * Transliterates the given string to be a safe filename
 *
 * see also: escapeFileName
 *
 * @param string filename
 * @param bool   forceAscii  also escapes all non-ASCII chars
 */
scrapbook.validateFilename = function (filename, forceAscii) {
  filename = filename
               .replace(/[\x00-\x1F\x7F]+|^ +/g, "")
               .replace(/[:*]/g, " ")
               .replace(/[\"\?\*\\\/\|]/g, "_")
               .replace(/[\<]/g, "(")
               .replace(/[\>]/g, ")");
  if (forceAscii) {
    filename = filename.replace(/[^\x00-\x7F]+/g, function (m) { return encodeURI(m); });
  }
  return filename;
};

scrapbook.urlToFilename = function (url) {
  var name = url, pos;
  pos = name.indexOf("?");
  if (pos !== -1) { name = name.substring(0, pos); }
  pos = name.indexOf("#");
  if (pos !== -1) { name = name.substring(0, pos); }
  pos = name.lastIndexOf("/");
  if (pos !== -1) { name = name.substring(pos + 1); }

  // decode %xx%xx%xx only if it's correctly UTF-8 encoded
  // @TODO: decode using a specified charset
  try {
    name = decodeURIComponent(name);
  } catch (ex) {}
  return name;
};

scrapbook.splitUrlByAnchor = function(url) {
  var pos = url.indexOf("#");
  if (pos >= 0) {
    return [url.substring(0, pos), url.substring(pos, url.length)];
  }
  return [url, ""];
},

/**
 * @return {Array} [filename, extension]
 * The returned extension does not contain leading "."
 */
scrapbook.filenameParts = function (filename) {
  var pos = filename.lastIndexOf(".");
  if (pos != -1) {
    return [filename.substring(0, pos), filename.substring(pos + 1, filename.length)];
  }
  return [filename, ""];
};

/**
 * Returns the ScrapBook ID from a given Date object
 *
 * @param {Date} date Given day, or now if undefined
 */
scrapbook.dateToId = function(date) {
  var dd = date || new Date();
  return dd.getUTCFullYear() +
    this.intToFixedStr(dd.getUTCMonth() + 1, 2) +
    this.intToFixedStr(dd.getUTCDate(), 2) +
    this.intToFixedStr(dd.getUTCHours(), 2) +
    this.intToFixedStr(dd.getUTCMinutes(), 2) +
    this.intToFixedStr(dd.getUTCSeconds(), 2) +
    this.intToFixedStr(dd.getUTCMilliseconds(), 3);
};

scrapbook.idToDate = function(id) {
  var dd;
  if (id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/)) {
    dd = new Date(
      parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10),
      parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10), parseInt(RegExp.$7, 10)
    );
    dd.setTime(dd.valueOf() - dd.getTimezoneOffset() * 60 * 1000);
  }
  return dd;
};

/**
 * Returns the ScrapBook ID from a given Date object
 *
 * @deprecated Used by older ScrapBook 1.x, may get inaccurate if used across different timezone
 * @param {Date} date Given day, or now if undefined
 */
scrapbook.dateToIdOld = function(date) {
  var dd = date || new Date();
  return dd.getFullYear() +
    this.intToFixedStr(dd.getMonth() + 1, 2) +
    this.intToFixedStr(dd.getDate(), 2) +
    this.intToFixedStr(dd.getHours(), 2) +
    this.intToFixedStr(dd.getMinutes(), 2) +
    this.intToFixedStr(dd.getSeconds(), 2);
};

/**
 * @deprecated Used by older ScrapBook 1.x, may get inaccurate if used across different timezone
 * @param {Date} id Given id
 */
scrapbook.idToDateOld = function(id) {
  var dd;
  if (id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)) {
    dd = new Date(
      parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10),
      parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10)
    );
  }
  return dd;
};

 
/********************************************************************
 * String handling
 *******************************************************************/

/**
 * Crops the given string
 *
 * @param bool byUtf8    true to crop texts according to each byte under UTF-8 encoding
 *                       false to crop according to each UTF-16 char
 * @param bool ellipsis  string for ellipsis
 */
scrapbook.crop = function (str, maxLength, byUtf8, ellipsis) {
  if (typeof ellipsis  === "undefined") { ellipsis = "..."; }
  if (byUtf8) {
    var bytes = this.unicodeToUtf8(str);
    if (bytes.length <= maxLength) { return str; }
    bytes = bytes.substring(0, maxLength - this.unicodeToUtf8(ellipsis).length);
    while (true) {
      try {
        return this.utf8ToUnicode(bytes) + ellipsis;
      } catch (ex) {}
      bytes= bytes.substring(0, bytes.length-1);
    }
  } else {
    return (str.length > maxLength) ? str.substr(0, maxLength - ellipsis.length) + ellipsis : str;
  }
};

scrapbook.escapeRegExp = function (str) {
  return str.replace(/([\*\+\?\.\^\/\$\\\|\[\]\{\}\(\)])/g, "\\$1");
};

scrapbook.escapeHtmlComment = function (str) {
  return str.replace(/--/g, "-\u200B-");
};

scrapbook.stringToDataUri = function (str, mime) {
  mime = mime || "";
  return "data:" + mime + ";base64," + this.unicodeToBase64(str);
};

scrapbook.unicodeToUtf8 = function (chars) {
  return unescape(encodeURIComponent(chars));
};

scrapbook.utf8ToUnicode = function (bytes) {
  return decodeURIComponent(escape(bytes));
};

scrapbook.unicodeToBase64 = function (str) {
  return btoa(unescape(encodeURIComponent(str)));
};

scrapbook.base64ToUnicode = function (str) {
  return decodeURIComponent(escape(atob(str)));
};

scrapbook.intToFixedStr = function (number, width, padder) {
  padder = padder || "0";
  number = number.toString(10);
  return number.length >= width ? number : new Array(width - number.length + 1).join(padder) + number;
};


/********************************************************************
 * String handling - HTML Header parsing
 *******************************************************************/

/**
 * Parse Content-Type string from the HTTP Header
 *
 * @return {Array} [{String} contentType, {String} charset]
 */
scrapbook.parseHeaderContentType = function (string) {
  var match = string.match(/^\s*(.*?)(?:\s*;\s*charset\s*=\s*(.*?))$/i);
  return [match[1], match[2]];
};

/**
 * Parse Content-Disposition string from the HTTP Header
 *
 * ref: https://github.com/jshttp/content-disposition/blob/master/index.js
 *
 * @param  string  string   The string to parse, not including "Content-Disposition: "
 * @return object  {}
 *         string    .type        "inline" or "attachment"
 *         object    .parameters
 *         string      .filename  The filename to be used on saving
 */
scrapbook.parseHeaderContentDisposition = function (string) {
  var dispositionTypeRegExp = /^([!#$%&'\*\+\-\.0-9A-Z\^_`a-z\|~]+) *(?:$|;)/;
  var paramRegExp = /; *([!#$%&'\*\+\-\.0-9A-Z\^_`a-z\|~]+) *= *("(?:[ !\x23-\x5b\x5d-\x7e\x80-\xff]|\\[\x20-\x7e])*"|[!#$%&'\*\+\-\.0-9A-Z\^_`a-z\|~]+) */g;
  var qescRegExp = /\\([\u0000-\u007f])/g;
  var extValueRegExp = /^([A-Za-z0-9!#$%&+\-^_`{}~]+)'(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}|[A-Za-z]{4,8}|)'((?:%[0-9A-Fa-f]{2}|[A-Za-z0-9!#$&+\-\.^_`|~])+)$/;
  var hexEscapeReplaceRegExp = /%([0-9A-Fa-f]{2})/g;
  var nonLatin1RegExp = /[^\x20-\x7e\xa0-\xff]/g;

  if (!string || typeof string !== 'string') {
    throw new TypeError('argument string is required');
  }

  var match = dispositionTypeRegExp.exec(string);

  if (!match) {
    throw new TypeError('invalid type format');
  }

  // normalize type
  var index = match[0].length;
  var type = match[1].toLowerCase();

  var key;
  var names = [];
  var params = {};
  var value;

  // calculate index to start at
  index = paramRegExp.lastIndex = match[0].substr(-1) === ';' ? index - 1 : index;

  // match parameters
  while (match = paramRegExp.exec(string)) {
    if (match.index !== index) {
      throw new TypeError('invalid parameter format');
    }

    index += match[0].length;
    key = match[1].toLowerCase();
    value = match[2];

    if (names.indexOf(key) !== -1) {
      throw new TypeError('invalid duplicate parameter');
    }

    names.push(key);

    if (key.indexOf('*') + 1 === key.length) {
      // decode extended value
      key = key.slice(0, -1);
      value = decodefield(value);

      // overwrite existing value
      params[key] = value;
      continue;
    }

    if (typeof params[key] === 'string') {
      continue;
    }

    if (value[0] === '"') {
      // remove quotes and escapes
      value = value.substr(1, value.length - 2).replace(qescRegExp, '$1');
    }

    params[key] = value;
  }

  if (index !== -1 && index !== string.length) {
    throw new TypeError('invalid parameter format');
  }

  return { type: type, parameters: params };

  function decodefield(str) {
    var match = extValueRegExp.exec(str);

    if (!match) {
      throw new TypeError('invalid extended field value')
    }

    var charset = match[1].toLowerCase();
    var encoded = match[2];
    var value;

    // to binary string
    var binary = encoded.replace(hexEscapeReplaceRegExp, pdecode);

    switch (charset) {
      case 'iso-8859-1':
        value = getlatin1(binary);
        break;
      case 'utf-8':
        value = binary;
        break;
      default:
        throw new TypeError('unsupported charset in extended field');
    }

    return value;
  }

  function getlatin1(val) {
    // simple Unicode -> ISO-8859-1 transformation
    return String(val).replace(nonLatin1RegExp, '?');
  }

  function pdecode(str, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  }
};


/********************************************************************
 * HTML DOM related utilities
 *******************************************************************/

scrapbook.doctypeToString = function (doctype) {
  if (!doctype) { return ""; }
  var ret = "<!DOCTYPE " + doctype.name;
  if (doctype.publicId) { ret += ' PUBLIC "' + doctype.publicId + '"'; }
  if (doctype.systemId) { ret += ' "'        + doctype.systemId + '"'; }
  ret += ">\n";
  return ret;
};

/**
 * @param {Function} replaceFunc = function (url) { return ...; }
 */
scrapbook.parseSrcset = function (srcset, replaceFunc) {
  return srcset.replace(/(\s*)([^ ,][^ ]*[^ ,])(\s*(?: [^ ,]+)?\s*(?:,|$))/g, function (m, m1, m2, m3) {
    return m1 + replaceFunc(m2) + m3;
  });
};

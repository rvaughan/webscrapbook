/********************************************************************
 *
 * Shared functions for most scripts, including background scripts and
 * content scripts.
 *
 * @public {object} scrapbook
 *******************************************************************/

var scrapbook = {};


/********************************************************************
 * Options
 *******************************************************************/

scrapbook.options = {
  "capture.saveSelectionOnly": true,
  "capture.saveAsUtf8": true,
  "capture.saveAsciiFilename": false,
  "capture.saveInlineAsHtml": false,
  "capture.image": "save", // "save", "link", "blank", "remove"
  "capture.audio": "save", // "save", "link", "blank", "remove"
  "capture.vedio": "save", // "save", "link", "blank", "remove"
  "capture.canvas": "save", // "save", "link", "blank", "remove"
  "capture.embed": "save", // "save", "link", "blank", "remove"
  "capture.object": "save", // "save", "link", "blank", "remove"
  "capture.applet": "save", // "save", "link", "blank", "remove"
  "capture.frame": "save", // "save", "link", "blank", "remove"
  "capture.font": "save", // "save", "link", "blank", "remove"
  "capture.style": "save", // "save", "link", "blank", "remove"
  "capture.script": "save", // "save", "link", "blank", "remove"
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
      scrapbook.options[i] = items[i];
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

scrapbook.escapeRegExp = function (str) {
  return str.replace(/([\*\+\?\.\^\/\$\\\|\[\]\{\}\(\)])/g, "\\$1");
};

scrapbook.stringToDataUri = function (str, mime) {
  mime = mime || "";
  return "data:" + mime + ";base64," + this.unicodeToBase64(str);
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

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
  "console.logLevel": 3, // 0: none, 1: error, 2: warn, 3: log, 4: debug

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

scrapbook.loadLanguages = function () {
  Array.prototype.slice.call(document.getElementsByTagName("*")).forEach(function (elem) {
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
 * Console
 *******************************************************************/

scrapbook.debug = function () {
  if (scrapbook.getOption("console.logLevel") >= 4) {
    Function.apply.call(console.debug, console, arguments);
  }
};

scrapbook.log = function () {
  if (scrapbook.getOption("console.logLevel") >= 3) {
    Function.apply.call(console.log, console, arguments);
  }
};

scrapbook.warn = function () {
  if (scrapbook.getOption("console.logLevel") >= 2) {
    Function.apply.call(console.warn, console, arguments);
  }
};

scrapbook.error = function () {
  if (scrapbook.getOption("console.logLevel") >= 1) {
    Function.apply.call(console.error, console, arguments);
  }
};


/********************************************************************
 * ScrapBook related path/file/string/etc handling
 *******************************************************************/

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

 
/********************************************************************
 * String handling
 *******************************************************************/

scrapbook.escapeRegExp = function (str) {
  return str.replace(/([\*\+\?\.\^\/\$\\\|\[\]\{\}\(\)])/g, "\\$1");
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

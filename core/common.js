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
};

scrapbook.isOptionsSynced = false;

scrapbook.getOption = function (key, defaultValue) {
  var result = scrapbook.options[key];
  if (result === undefined) {
    result = defaultValue;
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

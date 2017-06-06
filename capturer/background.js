/********************************************************************
 *
 * The background script for capture functionality
 *
 * @require {object} scrapbook
 *******************************************************************/

capturer.isContentScript = false;

/**
 * { timeId: { documentName: count } } 
 */
capturer.usedDocumentNames = {};

/**
 * { timeId: { filename: src } } 
 */
capturer.fileToUrl = {};

/**
 * { downloadId: url } 
 */
capturer.downloadUrls = {};

/**
 * { downloadId: true } 
 */
capturer.downloadEraseIds = {};

/**
 * Prevent filename conflictAction. Appends a number if the given filename is used.
 *
 * @param {String} timeId
 * @param {String} filename
 * The unfixed filename.
 * @param {String|true} src
 * The source URL of the filename source. Use true means always create a new filename.
 * @return {Array} [{String} newFilename, {bool} isDuplicate]
 */
capturer.getUniqueFilename = function (timeId, filename, src) {
  capturer.fileToUrl[timeId] = capturer.fileToUrl[timeId] || {
    "index.html": true,
    "index.xhtml": true,
    "index.dat": true,
    "index.rdf": true,
  };

  var newFilename = filename || "untitled";
  newFilename = scrapbook.validateFilename(newFilename);
  var [newFilenameBase, newFilenameExt] = scrapbook.filenameParts(newFilename);
  newFilenameBase = scrapbook.crop(scrapbook.crop(newFilenameBase, 240, true), 128);
  newFilenameExt = newFilenameExt ? "." + newFilenameExt : "";
  tokenSrc = (typeof src === "string") ? scrapbook.splitUrlByAnchor(src)[0] : src;

  var seq = 0;
  newFilename = newFilenameBase + newFilenameExt;
  var newFilenameCI = newFilename.toLowerCase();
  while (capturer.fileToUrl[timeId][newFilenameCI] !== undefined) {
    if (capturer.fileToUrl[timeId][newFilenameCI] === tokenSrc) {
      return [newFilename, true];
    }
    newFilename = newFilenameBase + "-" + (++seq) + newFilenameExt;
    newFilenameCI = newFilename.toLowerCase(); 
  }
  capturer.fileToUrl[timeId][newFilenameCI] = tokenSrc;
  return [newFilename, false];
};

capturer.captureUrl = function (params, callback) {
  console.debug("call: captureUrl", params);

  var sourceUrl = params.url;
  var settings = params.settings;
  var options = params.options;

  var filename;
  
  var xhr = new XMLHttpRequest();
  var xhr_shutdown = function () {
    xhr.onreadystatechange = xhr.onerror = xhr.ontimeout = null;
    xhr.abort();
  };
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 2) {
      // if header Content-Disposition is defined, use it
      try {
        var headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
        var contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
        filename = contentDisposition.parameters.filename;
      } catch (ex) {}
    } else if (xhr.readyState === 4) {
      if (xhr.status == 200 || xhr.status == 0) {
        var doc = xhr.response;
        if (doc) {
          capturer.captureDocumentOrFile(doc, settings, options, callback);
        } else {
          capturer.captureFile({
            url: params.url,
            settings: params.settings,
            options: params.options
          }, callback);
        }
      } else {
        xhr.onerror();
      }
    }
  };
  xhr.ontimeout = function () {
    console.warn(scrapbook.lang("ErrorFileDownloadTimeout", sourceUrl));
    callback({ url: sourceUrl, error: "timeout" });
    xhr_shutdown();
  };
  xhr.onerror = function () {
    var err = [xhr.status, xhr.statusText].join(" ");
    console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
    callback({ url: sourceUrl, error: err });
    xhr_shutdown();
  };
  xhr.responseType = "document";
  xhr.open("GET", sourceUrl, true);
  xhr.send();

  return true; // async response
};

capturer.captureFile = function (params, callback) {
  console.debug("call: captureFile", params);

  capturer.downloadFile({
    url: params.url,
    settings: params.settings,
    options: params.options
  }, function (response) {
    if (params.settings.frameIsMain) {
      // for the main frame, create a index.html that redirects to the file
      var html = '<html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;URL=' + response.url + '"></head><body></body></html>';
      capturer.saveDocument({
        frameUrl: params.url,
        settings: params.settings,
        options: params.options,
        data: {
          documentName: params.settings.documentName,
          mime: "text/html",
          content: html
        }
      }, callback);
    } else {
      callback({
        frameUrl: params.url,
        filename: response.url
      });
    }
  });

  return true; // async response
};

capturer.registerDocument = function (params, callback) {
  var timeId = params.settings.timeId;
  var documentName = params.settings.documentName;
  if (!capturer.usedDocumentNames[timeId]) { capturer.usedDocumentNames[timeId] = {}; }
  if (!capturer.usedDocumentNames[timeId][documentName]) { capturer.usedDocumentNames[timeId][documentName] = 0; }
  var fixedDocumentName = (capturer.usedDocumentNames[timeId][documentName] > 0) ?
    (documentName + "_" + capturer.usedDocumentNames[timeId][documentName]) :
    documentName;
  capturer.usedDocumentNames[timeId][documentName]++;
  callback({ documentName: fixedDocumentName });
};

capturer.saveDocument = function (params, callback) {
  var timeId = params.settings.timeId;
  var frameUrl = params.frameUrl;
  var targetDir = scrapbook.options.dataFolder + "/" + timeId;
  var willErase = !params.settings.frameIsMain;
  var filename = params.data.documentName + "." + ((params.data.mime === "application/xhtml+xml") ? "xhtml" : "html");
  filename = scrapbook.validateFilename(filename);
  filename = capturer.getUniqueFilename(timeId, filename, true)[0];

  var params = {
    url: URL.createObjectURL(new Blob([params.data.content], { type: params.data.mime })),
    filename: targetDir + "/" + filename,
    conflictAction: "uniquify",
  };

  console.debug("download start", params);
  chrome.downloads.download(params, function (downloadId) {
    console.debug("download response", downloadId);
    capturer.downloadUrls[downloadId] = frameUrl;
    if (willErase) { capturer.downloadEraseIds[downloadId] = true; }
    callback({ timeId: timeId, frameUrl: frameUrl, targetDir: targetDir, filename: filename });
  });
  return true; // async response
};

capturer.downloadFile = function (params, callback) {
  console.log("downloadFile", params);
  var timeId = params.settings.timeId;
  var targetDir = scrapbook.options.dataFolder + "/" + timeId;
  var sourceUrl = params.url;
  sourceUrl = scrapbook.splitUrlByAnchor(sourceUrl)[0];
  var filename;
  var isDuplicate;

  if (sourceUrl.indexOf("file:") == 0) {
    filename = scrapbook.urlToFilename(sourceUrl);
    filename = scrapbook.validateFilename(filename);
    [filename, isDuplicate] = capturer.getUniqueFilename(timeId, filename, sourceUrl);
    if (isDuplicate) {
      callback({ url: filename, isDuplicate: true });
      return;
    }
    var params = {
      url: sourceUrl,
      filename: targetDir + "/" + filename,
      conflictAction: "uniquify",
    };
    chrome.downloads.download(params, function (downloadId) {
      capturer.downloadUrls[downloadId] = sourceUrl;
      capturer.downloadEraseIds[downloadId] = true;
      callback({ url: filename });
    });
    return true; // async response
  }
  
  var xhr = new XMLHttpRequest();
  var xhr_shutdown = function () {
    xhr.onreadystatechange = xhr.onerror = xhr.ontimeout = null;
    xhr.abort();
  };
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 2) {
      // if header Content-Disposition is defined, use it
      try {
        var headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
        var contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
        filename = contentDisposition.parameters.filename;
      } catch (ex) {}

      // determine the filename
      // @TODO: 
      //   if header Content-Disposition is not defined but Content-Type is defined, 
      //   make file extension compatible with it.
      filename = filename || scrapbook.urlToFilename(sourceUrl);
      filename = scrapbook.validateFilename(filename);
      [filename, isDuplicate] = capturer.getUniqueFilename(timeId, filename, sourceUrl);
      if (isDuplicate) {
        callback({ url: filename, isDuplicate: true });
        xhr_shutdown();
      }
    } else if (xhr.readyState === 4) {
      if ((xhr.status == 200 || xhr.status == 0) && xhr.response) {
        // download 
        var params = {
          url: URL.createObjectURL(xhr.response),
          filename: targetDir + "/" + filename,
          conflictAction: "uniquify",
        };
        chrome.downloads.download(params, function (downloadId) {
          capturer.downloadUrls[downloadId] = sourceUrl;
          capturer.downloadEraseIds[downloadId] = true;
          callback({ url: filename });
        });
      } else {
        xhr.onerror();
      }
    }
  };
  xhr.ontimeout = function () {
    console.warn(scrapbook.lang("ErrorFileDownloadTimeout", sourceUrl));
    callback({ url: sourceUrl, error: "timeout" });
    xhr_shutdown();
  };
  xhr.onerror = function () {
    var err = [xhr.status, xhr.statusText].join(" ");
    console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
    callback({ url: sourceUrl, error: err });
    xhr_shutdown();
  };
  xhr.responseType = "blob";
  xhr.open("GET", sourceUrl, true);
  xhr.send();

  return true; // async response
};


/**
 * Events handling
 */

chrome.browserAction.onClicked.addListener(function (tab) {
  var cmd = "capturer.captureDocumentOrFile";
  var timeId = scrapbook.dateToId();
  var tabId = tab.id;
  var message = {
    cmd: cmd,
    settings: {
      timeId: timeId,
      frameIsMain: true,
      documentName: "index",
    },
    options: scrapbook.getOptions("capture"),
  };

  console.debug(cmd + " (main) send", tabId, message);
  chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, function (response) {
    console.debug(cmd + " (main) response", tabId, response);
    if (!response) {
      alert(scrapbook.lang("ErrorCapture", [scrapbook.lang("ErrorContentScriptNotReady")]));
      return;
    }
    if (response.error) {
      console.error(scrapbook.lang("ErrorCapture", ["tab " + tabId]));
      return;
    }
    delete(capturer.usedDocumentNames[timeId]);
    delete(capturer.fileToUrl[timeId]);
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.debug(message.cmd + " receive", sender.tab.id, message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    var method = message.cmd.slice(9);
    if (capturer[method]) {
      message.args.tabId = sender.tab.id;
      return capturer[method](message.args, function (response) {
        sendResponse(response);
      });
    }
  }
});

chrome.downloads.onChanged.addListener(function (downloadDelta) {
  console.debug("downloads.onChanged", downloadDelta);

  var erase = function (id) {
    if (capturer.downloadEraseIds[id]) {
      delete(capturer.downloadUrls[id]);
      delete(capturer.downloadEraseIds[id]);
      chrome.downloads.erase({ id: id }, function (erasedIds) {});
    }
  };

  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    // erase the download history of additional downloads (those recorded in capturer.downloadEraseIds)
    var id = downloadDelta.id;
    erase(id);
  } else if (downloadDelta.error) {
    var id = downloadDelta.id;
    chrome.downloads.search({ id: id }, function (results) {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [capturer.downloadUrls[id], results[0].error]));
      erase(id);
    });
  }
});

// console.debug("loading background.js");

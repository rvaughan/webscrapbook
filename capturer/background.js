/********************************************************************
 *
 * The background script for capture functionality
 *
 * @require {object} scrapbook
 * @public {object} capturer
 *******************************************************************/

var capturer = {};

/**
 * { timeId: { documentName: count } } 
 */
capturer.usedDocumentNames = {};

/**
 * { timeId: { filename: src } } 
 */
capturer.fileToUrl = {};

/**
 * { downloadId: true } 
 */
capturer.downloadIds = {};

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
  newFilenameExt = newFilenameExt || "dat";
  tokenSrc = (typeof src === "string") ? scrapbook.splitUrlByAnchor(src)[0] : src;

  var seq = 0;
  newFilename = newFilenameBase + "." + newFilenameExt;
  var newFilenameCI = newFilename.toLowerCase();
  while (capturer.fileToUrl[timeId][newFilenameCI] !== undefined) {
    if (capturer.fileToUrl[timeId][newFilenameCI] === tokenSrc) {
      return [newFilename, true];
    }
    newFilename = newFilenameBase + "-" + (++seq) + "." + newFilenameExt;
    newFilenameCI = newFilename.toLowerCase(); 
  }
  capturer.fileToUrl[timeId][newFilenameCI] = tokenSrc;
  return [newFilename, false];
};

chrome.browserAction.onClicked.addListener(function (tab) {
  var tabId = tab.id;
  var timeId = scrapbook.dateToId();
  var message = {
    cmd: "capture-tab",
    settings: {
      timeId: timeId,
      captureType: "tab",
      frameIsMain: true,
      documentName: "index",
    },
    options: scrapbook.getOptions("capture"),
  };

  console.debug("capture-tab send", tabId, message);
  chrome.tabs.sendMessage(tabId, message, null, function (response) {
    console.debug("capture-tab response", tabId, response);
    if (!response) {
      console.error(scrapbook.lang("ErrorContentScriptNotReady"));
      return;
    }
    delete(capturer.usedDocumentNames[timeId]);
    delete(capturer.fileToUrl[timeId]);
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.debug(message.cmd + " receive", sender.tab.id, message);

  if (message.cmd === "get-frame-content") {
    var tabId = sender.tab.id;
    var settings = message.settings;
    var options = message.options;
    var frameInitSrc = message.frameInitSrc;

    var message = {
      cmd: "get-frame-content-cs",
      frameInitSrc: frameInitSrc,
      settings: settings,
      options: options,
    };

    console.debug("get-frame-content-cs send", tabId, message);
    chrome.tabs.sendMessage(tabId, message, null, function (response) {
      console.debug("get-frame-content-cs response", tabId, response);
      sendResponse(response);
    });
    return true; // async response
  } else if (message.cmd === "register-document") {
    var timeId = message.settings.timeId;
    var documentName = message.settings.documentName;
    var fixedDocumentName = documentName;
    capturer.usedDocumentNames[timeId] = capturer.usedDocumentNames[timeId] || {};
    capturer.usedDocumentNames[timeId][documentName] = capturer.usedDocumentNames[timeId][documentName] || 0;
    if (capturer.usedDocumentNames[timeId][documentName] > 0) {
      fixedDocumentName = fixedDocumentName + "_" + capturer.usedDocumentNames[timeId][documentName];
    }
    capturer.usedDocumentNames[timeId][documentName]++;
    sendResponse({ documentName: fixedDocumentName });
  } else if (message.cmd === "save-document") {
    var timeId = message.settings.timeId;
    var targetDir = scrapbook.options.dataFolder + "/" + timeId;
    var willErase = !message.settings.frameIsMain;
    var filename = message.data.documentName + "." + ((message.data.mime === "application/xhtml+xml") ? "xhtml" : "html");
    filename = scrapbook.validateFilename(filename);
    filename = capturer.getUniqueFilename(timeId, filename, true)[0];
    var params = {
      url: URL.createObjectURL(new Blob([message.data.content], { type: message.data.mime })),
      filename: targetDir + "/" + filename,
      conflictAction: "uniquify",
    };
    chrome.downloads.download(params, function (downloadId) {
      if (willErase) { capturer.downloadIds[downloadId] = true; }
      sendResponse({ timeId: timeId, frameInitSrc: message.frameInitSrc, targetDir: targetDir, filename: filename });
    });
    return true; // async response
  } else if (message.cmd === "download-file") {
    console.log("download-file", message);
    var timeId = message.settings.timeId;
    var targetDir = scrapbook.options.dataFolder + "/" + timeId;
    var sourceUrl = message.url;
    sourceUrl = scrapbook.splitUrlByAnchor(sourceUrl)[0];
    var filename;
    var isDuplicate;

    if (sourceUrl.indexOf("file:") == 0) {
      filename = scrapbook.urlToFilename(sourceUrl);
      filename = scrapbook.validateFilename(filename);
      [filename, isDuplicate] = capturer.getUniqueFilename(timeId, filename, sourceUrl);
      if (isDuplicate) {
        sendResponse({ url: filename, isDuplicate: true });
        return;
      }
      var params = {
        url: sourceUrl,
        filename: targetDir + "/" + filename,
        conflictAction: "uniquify",
      };
      chrome.downloads.download(params, function (downloadId) {
        capturer.downloadIds[downloadId] = true;
        sendResponse({ url: filename });
      });
      return true; // async response
    }
    
    var xhr = new XMLHttpRequest();
    var xhr_shutdown = function () {
      xhr.onreadystatechange = xhr.onerror = xhr.ontimeout = null;
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
          sendResponse({ url: filename, isDuplicate: true });
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
            capturer.downloadIds[downloadId] = true;
            sendResponse({ url: filename });
          });
        } else {
          xhr.onerror();
        }
      }
    };
    xhr.onerror = xhr.ontimeout = function () {
      sendResponse({ url: sourceUrl, isError: true });
      xhr_shutdown();
    };
    xhr.responseType = "blob";
    xhr.open("GET", sourceUrl, true);
    xhr.send();

    return true; // async response
  }
});

chrome.downloads.onChanged.addListener(function (downloadDelta) {
  // erase the download history of additional downloads (those recorded in capturer.downloadIds)
  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    var id = downloadDelta.id;
    if (capturer.downloadIds[id]) {
      delete(capturer.downloadIds[id]);
      chrome.downloads.erase({ id: id }, function (erasedIds) {});
    }
  }
});

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

capturer.getFrameContent = function (params, callback) {
  var tabId = params.tabId;
  var message = {
    cmd: "capture-document",
    frameUrl: params.frameUrl,
    settings: params.settings,
    options: params.options
  };

  // @TODO:
  // if the real location of the frame changes, we cannot get the
  // content since it no more match the src attr of the frame tag
  chrome.webNavigation.getAllFrames({ tabId: tabId }, function (framesInfo) {
    for (var i = 0, I = framesInfo.length; i < I; ++i) {
      var frameInfo = framesInfo[i];
      if (frameInfo.url == params.frameUrl && !frameInfo.errorOccurred) {
        console.debug("capture-document send", tabId, frameInfo.frameId, message);
        chrome.tabs.sendMessage(tabId, message, { frameId: frameInfo.frameId }, function (response) {
          console.debug("capture-document response", tabId, frameInfo.frameId, response);
          callback(response);
        });
        return;
      }
    }
    callback(undefined);
  });

  return true; // async response
};

capturer.saveDocument = function (params, callback) {
  var timeId = params.settings.timeId;
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
    capturer.downloadUrls[downloadId] = params.frameUrl;
    if (willErase) { capturer.downloadEraseIds[downloadId] = true; }
    callback({ timeId: timeId, frameUrl: params.frameUrl, targetDir: targetDir, filename: filename });
  });
  return true; // async response
};

capturer.downloadFile = function (params, callback) {
  console.log("download-file", params);
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

chrome.browserAction.onClicked.addListener(function (tab) {
  var tabId = tab.id;
  var timeId = scrapbook.dateToId();
  var message = {
    cmd: "capture-document",
    settings: {
      timeId: timeId,
      frameIsMain: true,
      documentName: "index",
    },
    options: scrapbook.getOptions("capture"),
  };

  console.debug("capture-document (main) send", tabId, message);
  chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, function (response) {
    console.debug("capture-document (main) response", tabId, response);
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
  console.debug(message.cmd + " receive", sender.tab.id, message);

  if (message.cmd === "get-frame-content") {
    return capturer.getFrameContent({
      tabId: sender.tab.id,
      frameUrl: message.frameUrl,
      settings: message.settings,
      options: message.options
    }, function (response) {
      sendResponse(response);
    });
  } else if (message.cmd === "register-document") {
    return capturer.registerDocument({
      settings: message.settings,
      options: message.options
    }, function (response) {
      sendResponse(response);
    });
  } else if (message.cmd === "save-document") {
    return capturer.saveDocument({
      frameUrl: message.frameUrl,
      settings: message.settings,
      options: message.options,
      data: message.data
    }, function (response) {
      sendResponse(response);
    });
  } else if (message.cmd === "download-file") {
    return capturer.downloadFile({
      url: message.url,
      settings: message.settings,
      options: message.options
    }, function (response) {
      sendResponse(response);
    });
  }
});

chrome.downloads.onChanged.addListener(function (downloadDelta) {
  console.debug("downloads.onChanged", downloadDelta);

  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    // erase the download history of additional downloads (those recorded in capturer.downloadEraseIds)
    var id = downloadDelta.id;
    if (capturer.downloadEraseIds[id]) {
      delete(capturer.downloadUrls[id]);
      delete(capturer.downloadEraseIds[id]);
      chrome.downloads.erase({ id: id }, function (erasedIds) {});
    }
  } else if (downloadDelta.error) {
    var id = downloadDelta.id;
    chrome.downloads.search({ id: id }, function (results) {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [capturer.downloadUrls[id], results[0].error]));
      if (capturer.downloadEraseIds[id]) {
        delete(capturer.downloadUrls[id]);
        delete(capturer.downloadEraseIds[id]);
        chrome.downloads.erase({ id: id }, function (erasedIds) {});
      }
    });
  }
});

// console.debug("loading background.js");

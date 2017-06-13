/********************************************************************
 *
 * The background script for capture functionality
 *
 * @require {Object} scrapbook
 *******************************************************************/

capturer.isContentScript = false;

/**
 * @type {Object.<string~timeId, {usedDocumentNames: Object.<string~documentName, number~count>, fileToUrl: Object.<string~filename, string~src>}>}
 */
capturer.captureInfo = {};
 
/**
 * @type {Object.<string~downloadId, {timeId: string, src: string, autoErase: boolean, onComplete: function, onError: function}>}
 */
capturer.downloadInfo = {};

/**
 * Prevent filename conflictAction. Appends a number if the given filename is used.
 *
 * @param {string} timeId
 * @param {string} filename - The unfixed filename.
 * @param {string|true} src - The source URL of the filename source. Use true means always create a new filename.
 * @return {{newFilename: string, isDuplicate: boolean}}
 */
capturer.getUniqueFilename = function (timeId, filename, src) {
  if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
  capturer.captureInfo[timeId].fileToUrl = capturer.captureInfo[timeId].fileToUrl || {
    "index.html": true,
    "index.xhtml": true,
    "index.dat": true,
    "index.rdf": true,
  };

  var newFilename = filename || "untitled";
  newFilename = scrapbook.validateFilename(newFilename);
  var { base: newFilenameBase, extension: newFilenameExt } = scrapbook.filenameParts(newFilename);
  newFilenameBase = scrapbook.crop(scrapbook.crop(newFilenameBase, 240, true), 128);
  newFilenameExt = newFilenameExt ? "." + newFilenameExt : "";
  tokenSrc = (typeof src === "string") ? scrapbook.splitUrlByAnchor(src)[0] : src;

  var seq = 0;
  newFilename = newFilenameBase + newFilenameExt;
  var newFilenameCI = newFilename.toLowerCase();
  while (capturer.captureInfo[timeId].fileToUrl[newFilenameCI] !== undefined) {
    if (capturer.captureInfo[timeId].fileToUrl[newFilenameCI] === tokenSrc) {
      return { newFilename: newFilename, isDuplicate: true };
    }
    newFilename = newFilenameBase + "-" + (++seq) + newFilenameExt;
    newFilenameCI = newFilename.toLowerCase(); 
  }
  capturer.captureInfo[timeId].fileToUrl[newFilenameCI] = tokenSrc;
  return { newFilename: newFilename, isDuplicate: false };
};

/**
 * @kind invokable
 * @param {Object} params 
 *   - {Object} params.settings
 *   - {Object} params.options
 *   - {string} params.url
 */
capturer.captureUrl = function (params, callback) {
  isDebug && console.debug("call: captureUrl", params);

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
    callback({ url: capturer.getErrorUrl(sourceUrl, params.options), error: "timeout" });
    xhr_shutdown();
  };
  xhr.onerror = function () {
    var err = [xhr.status, xhr.statusText].join(" ");
    console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
    callback({ url: capturer.getErrorUrl(sourceUrl, params.options), error: err });
    xhr_shutdown();
  };
  xhr.responseType = "document";
  xhr.open("GET", sourceUrl, true);
  xhr.send();

  return true; // async response
};

/**
 * @kind invokable
 * @param {Object} params 
 *   - {Object} params.settings
 *   - {Object} params.options
 *   - {string} params.url
 */
capturer.captureFile = function (params, callback) {
  isDebug && console.debug("call: captureFile", params);

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

/**
 * @kind invokable
 * @param {Object} params 
 *   - {Object} params.settings
 *   - {Object} params.options
 */
capturer.registerDocument = function (params, callback) {
  isDebug && console.debug("call: registerDocument", params);

  var timeId = params.settings.timeId;
  var documentName = params.settings.documentName;
  if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
  if (!capturer.captureInfo[timeId].usedDocumentNames) { capturer.captureInfo[timeId].usedDocumentNames = {}; }
  if (!capturer.captureInfo[timeId].usedDocumentNames[documentName]) { capturer.captureInfo[timeId].usedDocumentNames[documentName] = 0; }
  var fixedDocumentName = (capturer.captureInfo[timeId].usedDocumentNames[documentName] > 0) ?
    (documentName + "_" + capturer.captureInfo[timeId].usedDocumentNames[documentName]) :
    documentName;
  capturer.captureInfo[timeId].usedDocumentNames[documentName]++;
  callback({ documentName: fixedDocumentName });
};

/**
 * @kind invokable
 * @param {Object} params 
 *   - {Object} params.settings
 *   - {Object} params.options
 *   - {string} params.frameUrl
 *   - {{documentName: string, mime: string, content: string}} params.data
 */
capturer.saveDocument = function (params, callback) {
  isDebug && console.debug("call: saveDocument", params);

  var timeId = params.settings.timeId;
  var frameUrl = params.frameUrl;
  var targetDir = params.options["dataFolder"] + "/" + timeId;
  var autoErase = !params.settings.frameIsMain;
  var filename = params.data.documentName + "." + ((params.data.mime === "application/xhtml+xml") ? "xhtml" : "html");
  filename = scrapbook.validateFilename(filename);
  filename = capturer.getUniqueFilename(timeId, filename, true).newFilename;

  var params = {
    url: URL.createObjectURL(new Blob([params.data.content], { type: params.data.mime })),
    filename: targetDir + "/" + filename,
    conflictAction: "uniquify",
  };

  isDebug && console.debug("download start", params);
  chrome.downloads.download(params, function (downloadId) {
    isDebug && console.debug("download response", downloadId);
    capturer.downloadInfo[downloadId] = {
      timeId: timeId,
      src: frameUrl,
      autoErase: autoErase,
      onComplete: function () {
        callback({ timeId: timeId, frameUrl: frameUrl, targetDir: targetDir, filename: filename });
      },
      onError: function (err) {
        callback({ url: capturer.getErrorUrl(frameUrl, params.options), error: err });
      }
    };
  });
  return true; // async response
};

/**
 * @kind invokable
 * @param {Object} params 
 *   - {Object} params.settings
 *   - {Object} params.options
 *   - {string} params.url
 *   - {string} params.rewriteMethod
 */
capturer.downloadFile = function (params, callback) {
  isDebug && console.debug("call: downloadFile", params);

  var timeId = params.settings.timeId;
  var targetDir = params.options["dataFolder"] + "/" + timeId;
  var sourceUrl = params.url; sourceUrl = scrapbook.splitUrlByAnchor(sourceUrl)[0];
  var rewriteMethod = params.rewriteMethod;
  var filename = scrapbook.urlToFilename(sourceUrl);
  var isDuplicate;
  var headers = {};

  var onComplete = function (blob) {
    if (!blob) {
      callback({ url: capturer.getErrorUrl(sourceUrl, params.options) });
    }

    // save blob as data URI?
    if (params.options["capture.saveFileAsDataUri"] && !sourceUrl.startsWith("data:")) {
      var reader = new FileReader();
      reader.onloadend = function(event) {
        var dataUri = event.target.result;
        callback({ url: dataUri });
      }
      reader.readAsDataURL(blob);
      return;
    }

    // download the data
    try {
      var downloadParams = {
        url: URL.createObjectURL(blob),
        filename: targetDir + "/" + filename,
        conflictAction: "uniquify",
      };

      isDebug && console.debug("download start", downloadParams);
      chrome.downloads.download(downloadParams, function (downloadId) {
        isDebug && console.debug("download response", downloadId);
        capturer.downloadInfo[downloadId] = {
          timeId: timeId,
          src: sourceUrl,
          autoErase: true,
          onComplete: function () {
            // @TODO: do we need to escape the URL to be safe to included in CSS or so?
            callback({ url: filename });
          },
          onError: function (err) {
            callback({ url: capturer.getErrorUrl(sourceUrl, params.options), error: err });
          }
        };
      });
    } catch (ex) {
      callback({ url: capturer.getErrorUrl(sourceUrl, params.options), error: ex });
    }
  };

  if (sourceUrl.startsWith("data:")) {
    if (params.options["capture.saveDataUriAsFile"] && !params.options["capture.saveFileAsDataUri"]) {
      var file = scrapbook.dataUriToFile(sourceUrl);
      if (file) {
        filename = file.name;
        filename = scrapbook.validateFilename(filename);
        ({newFilename: filename, isDuplicate} = capturer.getUniqueFilename(timeId, filename, sourceUrl));
        if (isDuplicate) {
          callback({ url: filename, isDuplicate: true });
        } else {
          if (rewriteMethod && capturer[rewriteMethod]) {
            params.data = file;
            params.charset = null;
            params.url = null;
            capturer[rewriteMethod](params, function (response) {
              onComplete(response);
            });
          } else {
            onComplete(file);
          }
        }
      } else {
        callback({ url: capturer.getErrorUrl(sourceUrl, params.options), error: "data URI cannot be read as file" });
      }
    } else {
      callback({ url: sourceUrl });
    }
    return true; // async response
  }

  var xhr = new XMLHttpRequest();

  var xhr_shutdown = function () {
    xhr.onreadystatechange = xhr.onerror = xhr.ontimeout = null;
    xhr.abort();
  };

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 2) {
      // determine the filename
      // if header Content-Disposition is defined, use it
      try {
        var headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
        if (headerContentDisposition) {
          var contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
          headers.isAttachment = (contentDisposition.type === "attachment");
          headers.filename = contentDisposition.parameters.filename;
          filename = headers.filename || filename;
        }
      } catch (ex) {}

      // @TODO: 
      //   if header Content-Disposition is not defined but Content-Type is defined, 
      //   make file extension compatible with it.
      try {
        var headerContentType = xhr.getResponseHeader("Content-Type");
        if (headerContentType) {
          var contentType = scrapbook.parseHeaderContentType(headerContentType);
          headers.contentType = contentType.contentType;
          headers.charset = contentType.charset;
        }
      } catch (ex) {
        console.error(ex);
      }

      filename = scrapbook.validateFilename(filename);
      if (!params.options["capture.saveFileAsDataUri"]) {
        ({newFilename: filename, isDuplicate} = capturer.getUniqueFilename(timeId, filename, sourceUrl));
        if (isDuplicate) {
          callback({ url: filename, isDuplicate: true });
          xhr_shutdown();
        }
      }
    } else if (xhr.readyState === 4) {
      if ((xhr.status == 200 || xhr.status == 0) && xhr.response) {
        if (rewriteMethod && capturer[rewriteMethod]) {
          params.data = xhr.response;
          params.charset = headers.charset;
          params.url = xhr.responseURL;
          capturer[rewriteMethod](params, function (response) {
            onComplete(response);
          });
        } else {
          onComplete(xhr.response);
        }
      } else {
        xhr.onerror();
      }
    }
  };

  xhr.ontimeout = function () {
    console.warn(scrapbook.lang("ErrorFileDownloadTimeout", sourceUrl));
    callback({ url: capturer.getErrorUrl(sourceUrl, params.options), error: "timeout" });
    xhr_shutdown();
  };

  xhr.onerror = function () {
    var err = [xhr.status, xhr.statusText].join(" ");
    console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
    callback({ url: capturer.getErrorUrl(sourceUrl, params.options), error: err });
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
    options: scrapbook.getOptions(""),
  };

  isDebug && console.debug(cmd + " (main) send", tabId, message);
  chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, function (response) {
    isDebug && console.debug(cmd + " (main) response", tabId, response);
    if (!response) {
      alert(scrapbook.lang("ErrorCapture", [scrapbook.lang("ErrorContentScriptNotReady")]));
      return;
    }
    if (response.error) {
      console.error(scrapbook.lang("ErrorCapture", ["tab " + tabId]));
      return;
    }
    delete(capturer.captureInfo[timeId]);
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  isDebug && console.debug(message.cmd + " receive", sender.tab.id, message.args);

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
  isDebug && console.debug("downloads.onChanged", downloadDelta);

  var erase = function (downloadId) {
    if (capturer.downloadInfo[downloadId].autoErase) {
      chrome.downloads.erase({ id: downloadId }, function (erasedIds) {});
    }
    delete capturer.downloadInfo[downloadId];
  };

  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    // erase the download history of additional downloads (those recorded in capturer.downloadEraseIds)
    var downloadId = downloadDelta.id;
    capturer.downloadInfo[downloadId].onComplete();
    erase(downloadId);
  } else if (downloadDelta.error) {
    var downloadId = downloadDelta.id;
    chrome.downloads.search({ id: downloadId }, function (results) {
      var err = results[0].error;
      console.warn(scrapbook.lang("ErrorFileDownloadError", [capturer.downloadInfo[downloadId].src, err]));
      capturer.downloadInfo[downloadId].onError(err);
      erase(downloadId);
    });
  }
});

// isDebug && console.debug("loading background.js");

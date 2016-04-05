/********************************************************************
 *
 * The background script for capture functionality
 *
 * @require {object} scrapbook
 * @public {object} capturer
 *******************************************************************/

var capturer = {};

/**
 * { tabId: { frameInitSrc: { frameInitId: true } } } 
 */
capturer.contentFrames = {};

/**
 * { timeId: { documentName: count } } 
 */
capturer.usedDocumentNames = {};

/**
 * { downloadId: true } 
 */
capturer.downloadIds = {};

chrome.browserAction.onClicked.addListener(function (tab) {
  var tabId = tab.id;
  var timeId = Date.now();
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
    if (!response) { return; }
    delete(capturer.usedDocumentNames[timeId]);
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.debug(message.cmd + " receive", sender.tab.id, message);

  if (message.cmd === "init-content-script") {
    var tabId = sender.tab.id;
    var frameInitId = message.frameInitId;
    var frameInitSrc = message.frameInitSrc;
    var frameIsMain = message.frameIsMain;

    capturer.contentFrames[tabId] = capturer.contentFrames[tabId] || {};
    capturer.contentFrames[tabId][frameInitSrc] = capturer.contentFrames[tabId][frameInitSrc] || {};
    capturer.contentFrames[tabId][frameInitSrc][frameInitId] = true;
    // console.debug(capturer.contentFrames);
  } else if (message.cmd === "uninit-content-script") {
    var tabId = sender.tab.id;
    var frameInitId = message.frameInitId;
    var frameInitSrc = message.frameInitSrc;
    var frameIsMain = message.frameIsMain;

    if (capturer.contentFrames[tabId]) {
      if (frameIsMain) {
        delete(capturer.contentFrames[tabId]);
      } else {
        delete(capturer.contentFrames[tabId][frameInitSrc][frameInitId]);
      }
    }
    // console.debug(capturer.contentFrames);
  } else if (message.cmd === "get-frame-content") {
    var tabId = sender.tab.id;
    var settings = message.settings;
    var options = message.options;
    var frameInitSrc = message.frameInitSrc;
    if (capturer.contentFrames[tabId][frameInitSrc]) {
      for (var frameInitId in capturer.contentFrames[tabId][frameInitSrc]) {
        var message = {
          cmd: "get-frame-content-cs",
          frameInitSrc: frameInitSrc,
          frameInitId: frameInitId,
          settings: settings,
          options: options,
        };

        console.debug("get-frame-content-cs send", tabId, message);
        chrome.tabs.sendMessage(tabId, message, null, function (response) {
          console.debug("get-frame-content-cs response", tabId, response);
          sendResponse(response);
        });
        return true; // mark this as having an async response and keep the channel open
        break;
      }
    } else {
      console.error("content script of `" + frameInitSrc + "' is not initialized yet.");
      sendResponse({ isError: true });
    }
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
    var targetDir = scrapbook.dateToId(new Date(message.settings.timeId));
    var filename = message.data.documentName + "." + ((message.data.mime === "text/html") ? "html" : "xhtml");
    var params = {
      url: scrapbook.stringToDataUri(message.data.content, message.data.mime),
      filename: targetDir + "/" + filename,
      conflictAction: "uniquify",
    };
    chrome.downloads.download(params, function (downloadId) {
      capturer.downloadIds[downloadId] = true;
      sendResponse({ timeId: message.settings.timeId, frameInitSrc: message.frameInitSrc, targetDir: targetDir, filename: filename });
    });
    return true; // mark this as having an async response and keep the channel open
  }
});

chrome.downloads.onChanged.addListener(function (downloadDelta) {
  // erase the download history of those downloaded by the capturer
  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    var id = downloadDelta.id;
    if (capturer.downloadIds[id]) {
      delete(capturer.downloadIds[id]);
      chrome.downloads.erase({ id: id }, function (erasedIds) {});
    }
  }
});

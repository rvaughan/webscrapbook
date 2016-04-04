/********************************************************************
 *
 * The background script for capture functionality
 *
 * @require {object} scrapbook
 * @public {object} capturer
 *******************************************************************/

var capturer = {};

/**
 * { tabId: { frameKeySrc: { frameKeyId: } } } 
 */
capturer.contentFrames = {};

capturer.downloadIds = {};

capturer.init = function () {

  chrome.browserAction.onClicked.addListener(function (tab) {
    // scrapbook.debug("capturer/background.js onClicked", tab);
    var tabId = tab.id;
    var options = scrapbook.getOptions("capture");
    var settings = {
      timeId: Date.now(),
      captureType: "tab",
      isMainFrame: true,
    };
    chrome.tabs.sendMessage(tabId, {
      cmd: "capture-tab",
      settings: settings,
      options: options,
    }, null, function (response) {
      scrapbook.debug("capture-tab done", response);
    });
  });

  chrome.runtime.onMessage.addListener(
    function (message, sender, sendResponse) {
      // scrapbook.debug("capturer/background.js onMessage", message, sender);

      if (message.cmd === "init-content-script") {
        var tabId = sender.tab.id;
        // var frameId = sender.frameId;
        var frameKeyId = message.id;
        var frameKeySrc = message.src;

        capturer.contentFrames[tabId] = capturer.contentFrames[tabId] || {};
        capturer.contentFrames[tabId][frameKeySrc] = capturer.contentFrames[tabId][frameKeySrc] || {};
        capturer.contentFrames[tabId][frameKeySrc][frameKeyId] = {};
        // scrapbook.debug(capturer.contentFrames);
      } else if (message.cmd === "uninit-content-script") {
        var tabId = sender.tab.id;
        // var frameId = sender.frameId;
        var frameKeyId = message.id;
        var frameKeySrc = message.src;

        if (capturer.contentFrames[tabId]) {
          if (message.isMainFrame) {
            delete(capturer.contentFrames[tabId]);
          } else {
            delete(capturer.contentFrames[tabId][frameKeySrc][frameKeyId]);
          }
        }
        // scrapbook.debug(capturer.contentFrames);
      } else if (message.cmd === "get-frame-content") {
        var tabId = sender.tab.id;
        var settings = message.settings;
        var options = message.options;
        var frameKeySrc = message.src;
        if (capturer.contentFrames[tabId][frameKeySrc]) {
          for (var id in capturer.contentFrames[tabId][frameKeySrc]) {
            var frameKeyId = id;
            chrome.tabs.sendMessage(tabId, {
              cmd: "get-frame-content-cs",
              settings: settings,
              options: options,
              src: frameKeySrc,
              id: frameKeyId,
            }, null, function (response) {
              // scrapbook.debug("get-frame-content-cs response", response);
              sendResponse(response);
            });
            return true; // mark this as having an async response and keep the channel open
            break;
          }
        } else {
          scrapbook.error("content script of `" + frameKeySrc + "' is not initialized yet.");
          sendResponse({ isError: true });
        }
      } else if (message.cmd === "download-data") {
        chrome.downloads.download(message.options, function (downloadId) {
          capturer.downloadIds[downloadId] = true;
          sendResponse(downloadId);
        });
        return true; // mark this as having an async response and keep the channel open
      }
    }
  );

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
};

scrapbook.loadOptions(function () {
  capturer.init();
});

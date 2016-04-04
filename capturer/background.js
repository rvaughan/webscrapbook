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

capturer.init = function () {

  chrome.browserAction.onClicked.addListener(function (tab) {
    scrapbook.debug("capturer/background.js onClicked", tab);
    
    var tabId = tab.id;
    var options = scrapbook.getOptions("capture");
    chrome.tabs.sendMessage(tabId, {
      cmd: "capture-tab",
      options: options,
    }, null, function (response) {});
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
        var timeId = message.timeId;
        var frameKeySrc = message.src;
        if (capturer.contentFrames[tabId][frameKeySrc]) {
          for (var id in capturer.contentFrames[tabId][frameKeySrc]) {
            var frameKeyId = id;
            chrome.tabs.sendMessage(tabId, {
              cmd: "get-frame-content-cs",
              timeId: timeId,
              id: frameKeyId,
              src: frameKeySrc
            }, null, function (response) {
              // scrapbook.debug("get-frame-content response", response);
              sendResponse(response);
            });
            return true; // mark this as having an async response and keep the channel open
            break;
          }
        } else {
          scrapbook.error("content script of `" + frameKeySrc + "' is not initialized yet.");
          sendResponse({ timeId: timeId, src: frameKeySrc, content: "" });
        }
      }
    }
  );

};

scrapbook.loadOptions(function () {
  capturer.init();
});

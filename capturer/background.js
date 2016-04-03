var capturer = {};

/**
 * { tabId: { frameKeySrc: { frameKeyId: } } } 
 */
capturer.contentFrames = {};

chrome.browserAction.onClicked.addListener(function (tab) {
  // log("capturer/background.js browserAction.onClicked", tab);
  
  var tabId = tab.id;
  chrome.tabs.sendMessage(tabId, {
    cmd: "capture-tab"
  }, null, function (response) {});
});

chrome.runtime.onMessage.addListener(
  function (message, sender, sendResponse) {
    // log("capturer/background.js onMessage", message, sender);

    if (message.cmd === "init-content-script") {
      var tabId = sender.tab.id;
      // var frameId = sender.frameId;
      var frameKeyId = message.id;
      var frameKeySrc = message.src;

      capturer.contentFrames[tabId] = capturer.contentFrames[tabId] || {};
      capturer.contentFrames[tabId][frameKeySrc] = capturer.contentFrames[tabId][frameKeySrc] || {};
      capturer.contentFrames[tabId][frameKeySrc][frameKeyId] = {};
      // log(capturer.contentFrames);
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
      // log(capturer.contentFrames);
    } else if (message.cmd === "get-frame-content") {
      var tabId = sender.tab.id;
      var frameKeySrc = message.src;
      if (capturer.contentFrames[tabId][frameKeySrc]) {
        for (var id in capturer.contentFrames[tabId][frameKeySrc]) {
          var frameKeyId = id;
          chrome.tabs.sendMessage(tabId, {
            cmd: "get-frame-content",
            id: frameKeyId,
            src: frameKeySrc
          }, null, function (response) {
            log("receive get-frame-content response:", response);
            sendResponse(response);
          });
          break;
        }
      } else {
        throw "content script of `" + frameKeySrc + "' is not initialized yet.";
      }
    }
  }
);

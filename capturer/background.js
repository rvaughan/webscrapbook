var capturer = {};

/**
 * { tabId: { frameKeySrc: {frameKeyId: } } } 
 */
capturer.contentFrames = {};

chrome.browserAction.onClicked.addListener(function (tab) {
  log("capturer/background.js browserAction.onClicked", tab);
  
  var tabId = tab.id;
  chrome.tabs.sendMessage(tabId, "capture-tab", {}, function (response) {});
});

chrome.runtime.onMessage.addListener(
  function(message, sender, sendResponse) {
    // log("capturer/background.js onMessage", message, sender);

    if (message.cmd === "init-content-script") {
      var tabId = sender.tab.id;
      // var frameId = sender.frameId;
      var frameKeyId = message.id;
      var frameKeySrc = message.src;
      capturer.contentFrames[tabId] = capturer.contentFrames[tabId] || {};
      capturer.contentFrames[tabId][frameKeySrc] = capturer.contentFrames[tabId][frameKeySrc] || [];
      capturer.contentFrames[tabId][frameKeySrc].push({ frameKeyId: frameKeyId });
      // log(capturer.contentFrames);
    } else if (message.cmd === "uninit-content-script") {
      var tabId = sender.tab.id;
      // var frameId = sender.frameId;
      var frameKeyId = message.id;
      var frameKeySrc = message.src;
      delete(capturer.contentFrames[tabId]);
      // log(capturer.contentFrames);
    }
  }
);

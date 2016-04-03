var capturer = {};

/**
 * { tabId: { frameKeySrc: {frameKeyId: } } } 
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
      capturer.contentFrames[tabId][frameKeySrc] = capturer.contentFrames[tabId][frameKeySrc] || [];
      capturer.contentFrames[tabId][frameKeySrc].push({ id: frameKeyId });
      // log(capturer.contentFrames);
    } else if (message.cmd === "uninit-content-script") {
      var tabId = sender.tab.id;
      // var frameId = sender.frameId;
      var frameKeyId = message.id;
      var frameKeySrc = message.src;
      delete(capturer.contentFrames[tabId]);
      // log(capturer.contentFrames);
    } else if (message.cmd === "get-frame-content") {
      var tabId = sender.tab.id;
      var frameKeySrc = message.src;
      if (capturer.contentFrames[tabId][frameKeySrc]) {
        var frameKeyId = capturer.contentFrames[tabId][frameKeySrc][0].id;
        chrome.tabs.sendMessage(tabId, {
          cmd: "get-frame-content",
          id: frameKeyId,
          src: frameKeySrc
        }, null, function (response) {
          log("receive get-frame-content response:", response);
          sendResponse(response);
        });
      }
    }
  }
);

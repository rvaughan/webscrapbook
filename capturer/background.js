var capturer = {};

/**
 * { tabId: { frameKeySrc: {frameKeyId: } } } 
 */
capturer.contentFrames = {};

chrome.browserAction.onClicked.addListener(function (tab) {
  log("browserAction.onClicked", tab);
  
  var tabId = sender.tab.id;
  chrome.tabs.sendMessage(tabId, {
    cmd: "capture-page"
  }, function(response) {});
});

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    log("capturer/background.js receive", request, sender);

    if (request.cmd === "init-content-script") {
      var tabId = sender.tab.id;
      // var frameId = sender.frameId;
      var frameKeyId = request.id;
      var frameKeySrc = request.src;
      
      capturer.contentFrames[tabId] = capturer.contentFrames[tabId] || {};
      capturer.contentFrames[tabId][frameKeySrc] = capturer.contentFrames[tabId][frameKeySrc] || [];
      capturer.contentFrames[tabId][frameKeySrc].push({ frameKeyId: frameKeyId });
      log(capturer.contentFrames);
    } else if (request.cmd === "uninit-content-script") {
      var tabId = sender.tab.id;
      // var frameId = sender.frameId;
      var frameKeyId = request.id;
      var frameKeySrc = request.src;

      delete(capturer.contentFrames[tabId]);
      log(capturer.contentFrames);
    }
  }
);

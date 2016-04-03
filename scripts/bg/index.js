var scrapbook = {};

/**
 * { tab_id: { src: window_id } } 
 */
scrapbook.contentFrames = {};

console.log("index script load");

// chrome.browserAction.onClicked.addListener(function (tab) {
  // console.log("bababab");
  // alert("scrapbook clicked!!!");
// });

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(request);
    console.log(sender);
    
    // console.log(sender.tab ?
                // "from a content script:" + sender.tab.url :
                // "from the extension");
    // if (request.greeting == "hello")
      // sendResponse({farewell: "goodbye"});
    
    var tab_id = sender.tab.id;
    chrome.tabs.sendMessage(tab_id, { cmd: "capture-page", id: request.id }, function(response) {
      // console.log(response.farewell);
    });
  });
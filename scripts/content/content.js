console.log("content script load");

// console.log(window);
// console.log(document.location.href);
// console.log(document.documentElement);

/*setTimeout( function () {
  
var d = Array.prototype.slice.call(document.querySelectorAll("iframe")).forEach(function (frame) {
  // frame.src = "http://google.com";
  // frame.src = "javascript:(function(){document.body=\"hacked\"})();";
  // console.log(frame.contentWindow); // object
  // console.log(frame.contentWindow.opener); // null
  // console.log(frame.contentWindow.document); // Exception
  // console.log(frame.contentDocument); // Exception
  console.log(frame.contentDocument.body.innerHTML); // Exception
});

}, 5000);*/

var id = Date.now();

chrome.runtime.sendMessage({ cmd: "init-content-script", id: id, src: location.href }, function(response) {
  // console.log(response);
});


chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(request);
    console.log(sender);
  });

window.addEventListener("unload", function () {
  chrome.runtime.sendMessage({ cmd: "uninit-content-script", id: id, src: location.href }, function(response) {
    // console.log(response);
  });
});
/********************************************************************
 *
 * The content script for capture functionality
 *
 * @require {object} scrapbook
 *******************************************************************/

// record and use the initial stat, even if it is changed later
var frameInitId = scrapbook.dateToId();
var frameInitSrc = location.href;
var frameIsMain = (window === window.top);

function capture(settings, options, callback) {
  switch (settings.captureType) {
    case "tab":
    default:
      captureDocumentOrFile(document, settings, options, callback);
      break;
  }
}

function captureDocumentOrFile(doc, settings, options, callback) {
  console.debug("call:", arguments.callee.name);
  // if not HTML document, capture as file
  if (["text/html", "application/xhtml+xml"].indexOf(doc.contentType) === -1) {
    if (!scrapbook.getOptions("capture.saveInlineAsHtml")) {
      captureFile(doc.location.href, settings, options, callback);
      return;
    }
  }
  captureDocument(doc, settings, options, callback);
}

function captureDocument(doc, settings, options, callback) {
  console.debug("call:", arguments.callee.name);

  var captureMain = function () {
    // give certain nodes an unique id for later refrence,
    // since cloned nodes may not have some information
    // e.g. cloned iframes has no content, cloned canvas has no image
    var origRefKey = "data-sb-id-" + timeId;
    var origRefNodes = Array.prototype.slice.call(doc.querySelectorAll("frame, iframe, canvas"));
    origRefNodes.forEach(function (elem, index) {
      elem.setAttribute(origRefKey, index);
    });

    // construct the node list
    var selection = doc.getSelection();
    if (selection && selection.isCollapsed) { selection = null; }
    if (scrapbook.getOption("capture.saveSelectionOnly") && selection) {
      var selNodeTree = []; // it's not enough to preserve order of sparsely selected table cells
      for (var iRange = 0, iRangeMax = selection.rangeCount; iRange < iRangeMax; ++iRange) {
        var myRange = selection.getRangeAt(iRange);
        var curNode = myRange.commonAncestorContainer;
        if (curNode.nodeName.toUpperCase() == "HTML") {
          // in some case (e.g. view image) the selection is the html node
          // and will cause subsequent errors.
          // in this case we just process as if there's no selection
          selection = null;
          break;
        }

        if (iRange === 0) {
          rootNode = htmlNode.cloneNode(false);
          headNode = doc.querySelector("head");
          headNode = headNode ? headNode.cloneNode(true) : doc.createElement("head");
          rootNode.appendChild(headNode);
          rootNode.appendChild(doc.createTextNode("\n"));
        }

        if (curNode.nodeName == "#text") { curNode = curNode.parentNode; }

        var tmpNodeList = [];
        do {
          tmpNodeList.unshift(curNode);
          curNode = curNode.parentNode;
        } while (curNode.nodeName.toUpperCase() != "HTML");

        var parentNode = rootNode;
        var branchList = selNodeTree;
        var matchedDepth = -2;
        for(var iDepth = 0; iDepth < tmpNodeList.length; ++iDepth) {
          for (var iBranch = 0; iBranch < branchList.length; ++iBranch) {
            if (tmpNodeList[iDepth] === branchList[iBranch].origNode) {
              matchedDepth = iDepth;
              break;
            }
          }

          if (iBranch === branchList.length) {
            var clonedNode = tmpNodeList[iDepth].cloneNode(false);
            parentNode.appendChild(clonedNode);
            branchList.push({
              origNode: tmpNodeList[iDepth],
              clonedNode: clonedNode,
              children: []
            });
          }
          parentNode = branchList[iBranch].clonedNode;
          branchList = branchList[iBranch].children;
        }
        if (matchedDepth === tmpNodeList.length - 1) {
          // @TODO:
          // Perhaps a similar splitter should be added for any node type
          // but some tags e.g. <td> require special care
          if (myRange.commonAncestorContainer.nodeName === "#text") {
            parentNode.appendChild(doc.createComment("DOCUMENT_FRAGMENT_SPLITTER"));
            parentNode.appendChild(doc.createTextNode(" … "));
            parentNode.appendChild(doc.createComment("/DOCUMENT_FRAGMENT_SPLITTER"));
          }
        }
        parentNode.appendChild(doc.createComment("DOCUMENT_FRAGMENT"));
        parentNode.appendChild(myRange.cloneContents());
        parentNode.appendChild(doc.createComment("/DOCUMENT_FRAGMENT"));
      }
    }
    if (!selection) {
      rootNode = htmlNode.cloneNode(true);
      headNode = rootNode.querySelector("head");
      if (!headNode) {
        headNode = doc.createElement("head");
        rootNode.insertBefore(headNode, rootNode.firstChild);
      }
    }

    // add linefeeds to head and body to improve layout
    var headNodeBefore = headNode.previousSibling;
    if (!headNodeBefore || headNodeBefore.nodeType != 3) {
      rootNode.insertBefore(doc.createTextNode("\n"), headNode);
    }
    var headNodeStart = headNode.firstChild;
    if (!headNodeStart || headNodeStart.nodeType != 3) {
      headNode.insertBefore(doc.createTextNode("\n"), headNodeStart);
    }
    var headNodeEnd = headNode.lastChild;
    if (!headNodeEnd || headNodeEnd.nodeType != 3) {
      headNode.appendChild(doc.createTextNode("\n"));
    }
    var headNodeAfter = headNode.nextSibling;
    if (!headNodeAfter || headNodeAfter.nodeType != 3) {
      rootNode.insertBefore(doc.createTextNode("\n"), headNodeAfter);
    }
    var bodyNode = rootNode.querySelector("body");
    if (bodyNode) {
      var bodyNodeAfter = bodyNode.nextSibling;
      if (!bodyNodeAfter) {
        rootNode.insertBefore(doc.createTextNode("\n"), bodyNodeAfter);
      }
    }

    // remove the temporary map key
    origRefNodes.forEach(function (elem) {
      elem.removeAttribute(origRefKey);
    });

    // base
    Array.prototype.slice.call(rootNode.querySelectorAll('base[href]')).forEach(function (elem) {
      elem.setAttribute("href", elem.href);

      switch (options["capture.base"]) {
        case "empty":
          elem.removeAttribute("href");
          return;
        case "save":
        default:
          // do nothing
          break;
      }
    });

    // meta
    Array.prototype.slice.call(rootNode.querySelectorAll([
      'meta[property="og:image"][content]',
      'meta[property="og:image:url"][content]',
      'meta[property="og:image:secure_url"][content]',
      'meta[property="og:audio"][content]',
      'meta[property="og:audio:url"][content]',
      'meta[property="og:audio:secure_url"][content]',
      'meta[property="og:video"][content]',
      'meta[property="og:video:url"][content]',
      'meta[property="og:video:secure_url"][content]',
      'meta[property="og:url"][content]',
    ].join(', '))).forEach(function (elem) {
      var rewriteUrl = rewriteRelativeUrl(elem.getAttribute("content"));
      elem.setAttribute("content", rewriteUrl);
    });

    // link and anchor
    Array.prototype.slice.call(rootNode.querySelectorAll('link[href], a[href], area[href]')).forEach(function (elem) {
      elem.setAttribute("href", elem.href);
    });

    // scripts
    Array.prototype.slice.call(rootNode.querySelectorAll('script')).forEach(function (elem) {
      if (elem.src) {
        elem.setAttribute("src", elem.src);
      }

      switch (options["capture.script"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          if (elem.src) {
            elem.setAttribute("src", "about:blank");
          } else {
            elem.textContent = "";
          }
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          if (elem.src) {
            remainingTasks++;
            var message = {
              cmd: "download-file",
              url: elem.src,
              settings: settings,
              options: options,
            };

            console.debug("download-file send", message);
            chrome.runtime.sendMessage(message, function (response) {
              console.debug("download-file response", response);
              elem.src = response.url;
              remainingTasks--;
              captureCheckDone();
            });
          }
          break;
      }
    });

    // scripts: noscript
    Array.prototype.slice.call(rootNode.querySelectorAll('noscript')).forEach(function (elem) {
      switch (options["capture.noscript"]) {
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          // do nothing
          break;
      }
    });

    // scripts: script-like attributes
    // remove attributes that acts like a javascript
    switch (options["capture.scriptAttr"]) {
      case "save":
        // do nothing
        break;
      case "remove":
      default:
        Array.prototype.slice.call(rootNode.querySelectorAll("body, body *")).forEach(function (elem) {
          // general: remove on* attributes
          Array.prototype.slice.call(elem.attributes).forEach(function (attr) {
            if (attr.name.toLowerCase().indexOf("on") === 0) {
              elem.removeAttribute(attr.name);
            }
          });
          // other specific
          elem.removeAttribute("contextmenu");
        });
    }

    // scripts: script-like anchors
    Array.prototype.slice.call(rootNode.querySelectorAll('a[href^="javascript:"], area[href^="javascript:"]')).forEach(function (elem) {
      switch (options["capture.scriptAnchor"]) {
        case "save":
          // do nothing
          break;
        case "remove":
        default:
          elem.removeAttribute("href");
          break;
      }
    });

    // frames
    Array.prototype.slice.call(rootNode.querySelectorAll("frame[src], iframe[src]")).forEach(function (frame) {
      var frameSrc = origRefNodes[frame.getAttribute(origRefKey)];
      frame.removeAttribute(origRefKey);
      frame.setAttribute("src", frame.src);
      frame.removeAttribute("srcdoc"); // prevent src being overwritten

      switch (options["capture.frame"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          frame.setAttribute("src", "about:blank");
          return;
        case "comment":
          frame.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(frame.outerHTML)), frame);
          return;
        case "remove":
          frame.parentNode.removeChild(frame);
          return;
        case "save":
        default:
          break;
      }

      var captureFrameCallback = function (result) {
        frame.src = result.filename;
        console.debug("capture frame", result);
        remainingTasks--;
        captureCheckDone();
      };

      var frameSettings = JSON.parse(JSON.stringify(settings));
      frameSettings.frameIsMain = false;

      var frameDoc;
      try {
        frameDoc = frameSrc.contentDocument;
      } catch (ex) {
        // console.debug(ex);
      }
      if (frameDoc) {
        remainingTasks++;
        captureDocumentOrFile(frameDoc, frameSettings, options, function (result) {
          captureFrameCallback(result);
        });
      } else {
        remainingTasks++;
        var message = {
          cmd: "get-frame-content",
          frameInitSrc: frame.src,
          settings: frameSettings,
          options: options,
        };

        console.debug("get-frame-content send", message);
        chrome.runtime.sendMessage(message, function (response) {
          console.debug("get-frame-content response", response);
          if (!response.isError) {
            captureFrameCallback(response);
          } else {
            var result = { timeId: timeId, frameInitSrc: frameInitSrc, filename: "data:," };
            captureFrameCallback(result);
          }
        });
      }
    });

    // images: img, pre-set
    // rewrite the url for img and input[type="image"] beforehand so that these nodes in a
    // picture node won't get non-fixed if the picture is commented-out
    Array.prototype.slice.call(rootNode.querySelectorAll('img[src], img[srcset]')).forEach(function (elem) {
      if (elem.hasAttribute("src")) {
        elem.setAttribute("src", elem.src);
      }
      if (elem.hasAttribute("srcset")) {
        elem.setAttribute("srcset",
          scrapbook.parseSrcset(elem.getAttribute("srcset"), function (url) {
            return rewriteRelativeUrl(url);
          })
        );
      }
    });

    // images: input, pre-set
    Array.prototype.slice.call(rootNode.querySelectorAll('input[type="image"][src]')).forEach(function (elem) {
      elem.setAttribute("src", elem.src);
    });

    // images: picture
    Array.prototype.slice.call(rootNode.querySelectorAll('picture')).forEach(function (elem) {
      Array.prototype.slice.call(elem.querySelectorAll('source[srcset]')).forEach(function (elem) {
        elem.setAttribute("srcset",
          scrapbook.parseSrcset(elem.getAttribute("srcset"), function (url) {
            return rewriteRelativeUrl(url);
          })
        );
      });

      switch (options["capture.image"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          Array.prototype.slice.call(elem.querySelectorAll('source[srcset]')).forEach(function (elem) {
            elem.setAttribute("srcset", "about:blank");
          });
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          Array.prototype.slice.call(elem.querySelectorAll('source[srcset]')).forEach(function (elem) {
            remainingTasks++;
            downloadSrcset(elem.getAttribute("srcset"), function (response) {
              elem.setAttribute("srcset", response);
              remainingTasks--;
              captureCheckDone();
            });
          });
          break;
      }
    });

    // images: img, post-set
    Array.prototype.slice.call(rootNode.querySelectorAll('img[src], img[srcset]')).forEach(function (elem) {
      switch (options["capture.image"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", "about:blank");
          }
          if (elem.hasAttribute("srcset")) {
            elem.setAttribute("srcset", "about:blank");
          }
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          if (elem.hasAttribute("src")) {
            remainingTasks++;
            var message = {
              cmd: "download-file",
              url: elem.src,
              settings: settings,
              options: options,
            };

            console.debug("download-file send", message);
            chrome.runtime.sendMessage(message, function (response) {
              console.debug("download-file response", response);
              elem.src = response.url;
              remainingTasks--;
              captureCheckDone();
            });
          }
          if (elem.hasAttribute("srcset")) {
            remainingTasks++;
            downloadSrcset(elem.getAttribute("srcset"), function (response) {
              elem.setAttribute("srcset", response);
              remainingTasks--;
              captureCheckDone();
            });
          }
          break;
      }
    });

    // images: input, post-set
    Array.prototype.slice.call(rootNode.querySelectorAll('input[type="image"][src]')).forEach(function (elem) {
      switch (options["capture.image"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          elem.setAttribute("src", "about:blank");
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          remainingTasks++;
          var message = {
            cmd: "download-file",
            url: elem.src,
            settings: settings,
            options: options,
          };

          console.debug("download-file send", message);
          chrome.runtime.sendMessage(message, function (response) {
            console.debug("download-file response", response);
            elem.src = response.url;
            remainingTasks--;
            captureCheckDone();
          });
          break;
      }
    });

    // other media: audio
    Array.prototype.slice.call(rootNode.querySelectorAll('audio')).forEach(function (elem) {
      Array.prototype.slice.call(elem.querySelectorAll('source, track')).forEach(function (elem) {
        elem.setAttribute("src", elem.src);
      });

      switch (options["capture.audio"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          Array.prototype.slice.call(elem.querySelectorAll('source')).forEach(function (elem) {
            elem.setAttribute("src", "about:blank");
          });
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          Array.prototype.slice.call(elem.querySelectorAll('source')).forEach(function (elem) {
            remainingTasks++;
            var message = {
              cmd: "download-file",
              url: elem.src,
              settings: settings,
              options: options,
            };

            console.debug("download-file send", message);
            chrome.runtime.sendMessage(message, function (response) {
              console.debug("download-file response", response);
              elem.src = response.url;
              remainingTasks--;
              captureCheckDone();
            });
          });
          break;
      }
    });

    // other media: video
    Array.prototype.slice.call(rootNode.querySelectorAll('video')).forEach(function (elem) {
      Array.prototype.slice.call(elem.querySelectorAll('source, track')).forEach(function (elem) {
        elem.setAttribute("src", elem.src);
      });

      switch (options["capture.video"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          Array.prototype.slice.call(elem.querySelectorAll('source')).forEach(function (elem) {
            elem.setAttribute("src", "about:blank");
          });
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          Array.prototype.slice.call(elem.querySelectorAll('source')).forEach(function (elem) {
            remainingTasks++;
            var message = {
              cmd: "download-file",
              url: elem.src,
              settings: settings,
              options: options,
            };

            console.debug("download-file send", message);
            chrome.runtime.sendMessage(message, function (response) {
              console.debug("download-file response", response);
              elem.src = response.url;
              remainingTasks--;
              captureCheckDone();
            });
          });
          break;
      }
    });

    // other media: embed
    Array.prototype.slice.call(rootNode.querySelectorAll('embed')).forEach(function (elem) {
      elem.setAttribute("src", elem.src);

      switch (options["capture.embed"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          elem.setAttribute("src", "about:blank");
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          remainingTasks++;
          var message = {
            cmd: "download-file",
            url: elem.src,
            settings: settings,
            options: options,
          };

          console.debug("download-file send", message);
          chrome.runtime.sendMessage(message, function (response) {
            console.debug("download-file response", response);
            elem.src = response.url;
            remainingTasks--;
            captureCheckDone();
          });
          break;
      }
    });

    // other media: object
    Array.prototype.slice.call(rootNode.querySelectorAll('object')).forEach(function (elem) {
      elem.setAttribute("data", elem.data);

      switch (options["capture.object"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          elem.setAttribute("data", "about:blank");
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          remainingTasks++;
          var message = {
            cmd: "download-file",
            url: elem.data,
            settings: settings,
            options: options,
          };

          console.debug("download-file send", message);
          chrome.runtime.sendMessage(message, function (response) {
            console.debug("download-file response", response);
            elem.data = response.url;
            remainingTasks--;
            captureCheckDone();
          });
          break;
      }
    });

    // other media: applet
    Array.prototype.slice.call(rootNode.querySelectorAll('applet')).forEach(function (elem) {
      var rewriteUrl = rewriteRelativeUrl(elem.getAttribute("archive"));
      elem.setAttribute("archive", rewriteUrl);

      switch (options["capture.applet"]) {
        case "link":
          // do nothing
          return;
        case "blank":
          elem.setAttribute("archive", "about:blank");
          return;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          remainingTasks++;
          var message = {
            cmd: "download-file",
            url: rewriteUrl,
            settings: settings,
            options: options,
          };

          console.debug("download-file send", message);
          chrome.runtime.sendMessage(message, function (response) {
            console.debug("download-file response", response);
            elem.setAttribute("archive", response.url);
            remainingTasks--;
            captureCheckDone();
          });
          break;
      }
    });

    // other media: canvas
    // must place after scripts are parsed to prevent an overwrite
    Array.prototype.slice.call(rootNode.querySelectorAll('canvas')).forEach(function (elem) {
      var canvasOrig = origRefNodes[elem.getAttribute(origRefKey)];
      elem.removeAttribute(origRefKey);

      switch (options["capture.canvas"]) {
        case "blank":
          // do nothing
          break;
        case "comment":
          elem.parentNode.replaceChild(doc.createComment(scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
          return;
        case "remove":
          elem.parentNode.removeChild(elem);
          return;
        case "save":
        default:
          var canvasScript = doc.createElement("script");
          canvasScript.textContent = "(" + canvasDataScript.toString().replace(/\s+/g, " ") + ")('" + canvasOrig.toDataURL() + "')";
          elem.parentNode.insertBefore(canvasScript, elem.nextSibling);
          break;
      }
    });

    // deprecated: background attribute (deprecated since HTML5)
    Array.prototype.slice.call(rootNode.querySelectorAll(
      'body[background], table[background], tr[background], th[background], td[background]'
    )).forEach(function (elem) {
      var rewriteUrl = rewriteRelativeUrl(elem.getAttribute("background"));
      elem.setAttribute("background", rewriteUrl);

      switch (options["capture.imageBackground"]) {
        case "link":
          // do nothing
          return;
        case "remove":
          elem.removeAttribute("background");
          return;
        case "save":
        default:
          remainingTasks++;
          var message = {
            cmd: "download-file",
            url: rewriteUrl,
            settings: settings,
            options: options,
          };

          console.debug("download-file send", message);
          chrome.runtime.sendMessage(message, function (response) {
            console.debug("download-file response", response);
            elem.setAttribute("background", response.url);
            remainingTasks--;
            captureCheckDone();
          });
          break;
      }
    });

    captureCheckDone();
  };

  var captureCheckDone = function () {
    if (remainingTasks <= 0) {
      captureDone();
    }
  };

  var captureDone = function () {
    var content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;
    var message = {
      cmd: "save-document",
      frameInitSrc: frameInitSrc,
      frameInitId: frameInitId,
      settings: settings,
      options: options,
      data: {
        documentName: documentName,
        mime: mime,
        content: content,
      }
    };

    console.debug("save-document send", message);
    chrome.runtime.sendMessage(message, function (response) {
      console.debug("save-document response", response);
      if (callback) {
        callback(response);
      }
    });
  };

  var rewriteRelativeUrl = function (url) {
    if (!arguments.callee.rewriter) {
      arguments.callee.rewriter = document.createElement("a");
    }
    var rewriter = arguments.callee.rewriter;
    rewriter.setAttribute("href", url);
    return rewriter.href;
  };

  var downloadSrcset = function (srcset, callback) {
    var srcsetUrls = [], srcsetRewrittenCount = 0;

    var onAllDownloaded = function () {
      var srcsetNew = scrapbook.parseSrcset(srcset, function (url) {
        return srcsetUrls.shift();
      });
      if (callback) {
        callback(srcsetNew);
      }
    };

    scrapbook.parseSrcset(srcset, function (url) {
      srcsetUrls.push(url);
      return "";
    });

    srcsetUrls.forEach(function (elem, index, array) {
      var message = {
        cmd: "download-file",
        url: elem,
        settings: settings,
        options: options,
      };

      console.debug("download-file send", message);
      chrome.runtime.sendMessage(message, function (response) {
        console.debug("download-file response", response);
        array[index] = response.url;
        if (++srcsetRewrittenCount === srcsetUrls.length) {
          onAllDownloaded();
        }
      });
    });
  };

  var canvasDataScript = function (data) {
    var scripts = document.getElementsByTagName("script");
    var script = scripts[scripts.length-1], canvas = script.previousSibling;
    var img = new Image();
    img.onload = function(){ canvas.getContext('2d').drawImage(img, 0, 0); };
    img.src = data;
    script.parentNode.removeChild(script);
  };

  var remainingTasks = 0;
  var timeId = settings.timeId;
  var mime = doc.contentType;
  var documentName = settings.documentName;
  var htmlNode = doc.documentElement;
  var rootNode;
  var headNode;

  var message = {
    cmd: "register-document",
    settings: settings,
    options: options,
  };

  console.debug("register-document send", message);
  chrome.runtime.sendMessage(message, function (response) {
    console.debug("register-document response", response);
    documentName = response.documentName;
    captureMain();
  });
}

function captureFile(doc, settings, options, callback) {
  console.debug("call:", arguments.callee.name);
}

window.addEventListener("load", function (event) {
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.debug(message.cmd + " receive", message, sender);

    if (message.cmd === "capture-tab") {
      if (!frameIsMain) { return; }
      capture(message.settings, message.options, function (response) {
        sendResponse(response);
      });
      return true; // async response
    } else if (message.cmd === "get-frame-content-cs") {
      // @TODO:
      // if the real location of the frame changes, we cannot get the
      // content since it no more match the src attr of the frame tag
      if (message.frameInitSrc !== frameInitSrc) { return; }
      captureDocumentOrFile(document, message.settings, message.options, function (response) {
        sendResponse(response);
      });
      return true; // async response
    }
  });
});

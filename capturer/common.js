/********************************************************************
 *
 * The common script for capture functionality
 *
 * @require {Object} scrapbook
 * @public {Object} capturer
 *******************************************************************/

var capturer = {};

capturer.isContentScript = true;

/**
 * Invoke the method from the background script and invoke the callback afterwards
 */
capturer.invoke = function (method, args, callback) {
  if (capturer.isContentScript) {
    var cmd = "capturer." + method;
    var message = {
      cmd: cmd,
      args: args
    };

    isDebug && console.debug(cmd + " send", args);
    chrome.runtime.sendMessage(message, function (response) {
      isDebug && console.debug(cmd + " response", response);
      callback(response);
    });
  } else {
    capturer[method](args, callback);
  }
};

capturer.captureDocumentOrFile = function (doc, settings, options, callback) {
  isDebug && console.debug("call: captureDocumentOrFile");

  if (doc.readyState !== "complete") {
    console.error(scrapbook.lang("ErrorDocumentNotReady", [doc.URL]));
    callback({ error: "document not load" });
    return false;
  }

  // if not HTML document, capture as file
  if (["text/html", "application/xhtml+xml"].indexOf(doc.contentType) === -1) {
    if (!options["capture.saveInlineAsHtml"]) {
      capturer.invoke("captureFile", {
        url: doc.URL,
        settings: settings,
        options: options
      }, callback);
      return true;
    }
  }

  // otherwise, capture as document
  capturer.captureDocument(doc, settings, options, callback);
};

capturer.captureDocument = function (doc, settings, options, callback) {
  isDebug && console.debug("call: captureDocument");

  if (doc.readyState !== "complete") {
    console.error(scrapbook.lang("ErrorDocumentNotReady", [doc.URL]));
    callback({ error: "document not load" });
    return false;
  }

  var captureMain = function () {
    // give certain nodes an unique id for later refrence,
    // since cloned nodes may not have some information
    // e.g. cloned iframes has no content, cloned canvas has no image
    var origRefKey = "data-sb-" + timeId + "-id";
    var origRefNodes = Array.prototype.slice.call(doc.querySelectorAll("frame, iframe, canvas"));
    origRefNodes.forEach(function (elem, index) {
      elem.setAttribute(origRefKey, index);
    });

    // construct the node list
    var selection = doc.getSelection();
    if (selection && selection.isCollapsed) { selection = null; }
    if (scrapbook.getOption("capture.saveSelectionOnly") && selection) {
      var selNodeTree = []; // @TODO: it's not enough to preserve order of sparsely selected table cells
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

    // inspect nodes
    var hasMeta = false;
    Array.prototype.forEach.call(rootNode.querySelectorAll("*"), function (elem) {
      // skip elements that are already removed from the DOM tree
      if (!elem.parentNode) { return; }

      switch (elem.nodeName.toLowerCase()) {
        case "base":
          if (!elem.hasAttribute("href")) { break; }
          elem.setAttribute("href", elem.href);

          switch (options["capture.base"]) {
            case "blank":
              captureRewriteAttr(elem, "href", null);
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              // do nothing
              break;
          }
          break;

        case "meta":
          // force UTF-8
          if (elem.hasAttribute("http-equiv") && elem.hasAttribute("content") &&
              elem.getAttribute("http-equiv").toLowerCase() == "content-type" && 
              elem.getAttribute("content").match(/^[^;]*;\s*charset=(.*)$/i) ) {
            hasMeta = true;
            elem.setAttribute("content", "text/html; charset=UTF-8");
          } else if ( elem.hasAttribute("charset") ) {
            hasMeta = true;
            elem.setAttribute("charset", "UTF-8");
          } else if (elem.hasAttribute("property") && elem.hasAttribute("content")) {
            switch (elem.getAttribute("property").toLowerCase()) {
              case "og:image":
              case "og:image:url":
              case "og:image:secure_url":
              case "og:audio":
              case "og:audio:url":
              case "og:audio:secure_url":
              case "og:video":
              case "og:video:url":
              case "og:video:secure_url":
              case "og:url":
                var rewriteUrl = resolveRelativeUrl(doc.URL, elem.getAttribute("content"));
                elem.setAttribute("content", rewriteUrl);
                break;
            }
          }
          break;

        // @TODO:
        case "link":
          if (!elem.hasAttribute("href")) { break; }
          elem.setAttribute("href", elem.href);
          break;

        // @TODO:
        case "style":
          break;

        // scripts: script
        case "script":
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", elem.src);
          }

          switch (options["capture.script"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              if (elem.hasAttribute("src")) {
                captureRewriteUri(elem, "src", "about:blank");
              }
              captureRewriteTextContent(elem, null);
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              if (elem.hasAttribute("src")) {
                remainingTasks++;
                capturer.invoke("downloadFile", {
                  url: elem.src,
                  settings: settings,
                  options: options
                }, function (response) {
                  captureRewriteUri(elem, "src", response.url);
                  remainingTasks--;
                  captureCheckDone();
                });
              }
              break;
          }
          break;

        // scripts: noscript
        case "noscript":
          switch (options["capture.noscript"]) {
            case "blank":
              captureRewriteTextContent(elem, null);
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              // do nothing
              break;
          }
          break;

        case "body":
        case "table":
        case "tr":
        case "th":
        case "td":
          // deprecated: background attribute (deprecated since HTML5)
          if (elem.hasAttribute("background")) {
            var rewriteUrl = resolveRelativeUrl(doc.URL, elem.getAttribute("background"));
            elem.setAttribute("background", rewriteUrl);

            switch (options["capture.imageBackground"]) {
              case "link":
                // do nothing
                break;
              case "remove":
                captureRewriteAttr(elem, "background", null);
                break;
              case "save":
              default:
                remainingTasks++;
                capturer.invoke("downloadFile", {
                  url: rewriteUrl,
                  settings: settings,
                  options: options
                }, function (response) {
                  captureRewriteUri(elem, "background", response.url);
                  remainingTasks--;
                  captureCheckDone();
                });
                break;
            }
          }
          break;

        case "frame":
        case "iframe":
          var frame = elem;
          var frameSrc = origRefNodes[frame.getAttribute(origRefKey)];
          frame.removeAttribute(origRefKey);
          frame.setAttribute("src", frame.src);
          captureRewriteAttr(frame, "srcdoc", null); // prevent src being overwritten

          switch (options["capture.frame"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              captureRewriteUri(frame, "src", "about:blank");
              break;
            case "remove":
              captureRemoveNode(frame);
              return;
            case "save":
            default:
              break;
          }

          var captureFrameCallback = function (result) {
            if (result.filename) {
              captureRewriteUri(frame, "src", result.filename);
            } else {
              captureRewriteAttr(frame, "src", null);
            }
            isDebug && console.debug("capture frame", result);
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
            // frame document accessible: capture the content document directly
            remainingTasks++;
            capturer.captureDocumentOrFile(frameDoc, frameSettings, options, function (result) {
              if (result && !result.error) {
                captureFrameCallback(result);
              } else {
                captureFrameCallback({
                  filename: frame.src
                });
              }
            });
          } else {
            // frame document inaccessible: get the content document through a messaging technique, and then capture it
            remainingTasks++;
            getFrameContent(frameSrc, timeId, frameSettings, options, function (response) {
              if (response && !response.error) {
                captureFrameCallback(response);
              } else {
                captureFrameCallback({
                  timeId: timeId,
                  frameUrl: doc.URL,
                  filename: frame.src
                });
              }
            });
          }
          break;

        case "a":
        case "area":
          if (!elem.hasAttribute("href")) { break; }
          elem.setAttribute("href", elem.href);

          // scripts: script-like anchors
          if (elem.href.toLowerCase().startsWith("javascript:")) {
            switch (options["capture.scriptAnchor"]) {
              case "save":
                // do nothing
                break;
              case "blank":
                captureRewriteAttr(elem, "href", "javascript:");
                break;
              case "remove":
              default:
                captureRewriteAttr(elem, "href", null);
                break;
            }
          }
          break;

        // images: img
        case "img":
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", elem.src);
          }
          if (elem.hasAttribute("srcset")) {
            elem.setAttribute("srcset",
              scrapbook.parseSrcset(elem.getAttribute("srcset"), function (url) {
                return resolveRelativeUrl(doc.URL, url);
              })
            );
          }

          switch (options["capture.image"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              if (elem.hasAttribute("src")) {
                captureRewriteUri(elem, "src", "about:blank");
              }
              if (elem.hasAttribute("srcset")) {
                captureRewriteAttr(elem, "srcset", null);
              }
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              if (elem.hasAttribute("src")) {
                remainingTasks++;
                capturer.invoke("downloadFile", {
                  url: elem.src,
                  settings: settings,
                  options: options
                }, function (response) {
                  captureRewriteUri(elem, "src", response.url);
                  remainingTasks--;
                  captureCheckDone();
                });
              }
              if (elem.hasAttribute("srcset")) {
                remainingTasks++;
                downloadSrcset(elem.getAttribute("srcset"), function (response) {
                  captureRewriteUri(elem, "srcset", response);
                  remainingTasks--;
                  captureCheckDone();
                });
              }
              break;
          }
          break;

        // images: picture
        case "picture":
          Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), function (elem) {
            elem.setAttribute("srcset",
              scrapbook.parseSrcset(elem.getAttribute("srcset"), function (url) {
                return resolveRelativeUrl(doc.URL, url);
              })
            );
          });

          switch (options["capture.image"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), function (elem) {
                captureRewriteAttr(elem, "srcset", null);
              });
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), function (elem) {
                remainingTasks++;
                downloadSrcset(elem.getAttribute("srcset"), function (response) {
                  captureRewriteUri(elem, "srcset", response);
                  remainingTasks--;
                  captureCheckDone();
                });
              });
              break;
          }
          break;

        // media: audio
        case "audio":
          Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), function (elem) {
            elem.setAttribute("src", elem.src);
          });

          switch (options["capture.audio"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), function (elem) {
                captureRewriteUri(elem, "src", "about:blank");
              });
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), function (elem) {
                remainingTasks++;
                capturer.invoke("downloadFile", {
                  url: elem.src,
                  settings: settings,
                  options: options
                }, function (response) {
                  captureRewriteUri(elem, "src", response.url);
                  remainingTasks--;
                  captureCheckDone();
                });
              });
              break;
          }
          break;

        // media: video
        case "video":
          Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), function (elem) {
            elem.setAttribute("src", elem.src);
          });

          switch (options["capture.video"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), function (elem) {
                captureRewriteUri(elem, "src", "about:blank");
              });
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), function (elem) {
                remainingTasks++;
                capturer.invoke("downloadFile", {
                  url: elem.src,
                  settings: settings,
                  options: options
                }, function (response) {
                  captureRewriteUri(elem, "src", response.url);
                  remainingTasks--;
                  captureCheckDone();
                });
              });
              break;
          }
          break;

        // media: embed
        case "embed":
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", elem.src);
          }

          switch (options["capture.embed"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              if (elem.hasAttribute("src")) {
                captureRewriteUri(elem, "src", "about:blank");
              }
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              if (elem.hasAttribute("src")) {
                remainingTasks++;
                capturer.invoke("downloadFile", {
                  url: elem.src,
                  settings: settings,
                  options: options
                }, function (response) {
                  captureRewriteUri(elem, "src", response.url);
                  remainingTasks--;
                  captureCheckDone();
                });
              }
              break;
          }
          break;

        // media: embed
        case "object":
          if (elem.hasAttribute("data")) {
            elem.setAttribute("data", elem.data);
          }

          switch (options["capture.object"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              if (elem.hasAttribute("data")) {
                captureRewriteUri(elem, "data", "about:blank");
              }
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              if (elem.hasAttribute("data")) {
                remainingTasks++;
                capturer.invoke("downloadFile", {
                  url: elem.data,
                  settings: settings,
                  options: options
                }, function (response) {
                  captureRewriteUri(elem, "data", response.url);
                  remainingTasks--;
                  captureCheckDone();
                });
              }
              break;
          }
          break;

        // media: applet
        case "applet":
          if (elem.hasAttribute("archive")) {
            var rewriteUrl = resolveRelativeUrl(doc.URL, elem.getAttribute("archive"));
            elem.setAttribute("archive", rewriteUrl);
          }

          switch (options["capture.applet"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              if (elem.hasAttribute("archive")) {
                captureRewriteUri(elem, "archive", "about:blank");
              }
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              if (elem.hasAttribute("archive")) {
                remainingTasks++;
                capturer.invoke("downloadFile", {
                  url: rewriteUrl,
                  settings: settings,
                  options: options,
                }, function (response) {
                  captureRewriteUri(elem, "archive", response.url);
                  remainingTasks--;
                  captureCheckDone();
                });
              }
              break;
          }
          break;

        // media: canvas
        case "canvas":
          var canvasOrig = origRefNodes[elem.getAttribute(origRefKey)];
          elem.removeAttribute(origRefKey);

          switch (options["capture.canvas"]) {
            case "blank":
              // do nothing
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              var canvasScript = doc.createElement("script");
              canvasScript.textContent = "(" + canvasDataScript.toString().replace(/\s+/g, " ") + ")('" + canvasOrig.toDataURL() + "')";
              elem.parentNode.insertBefore(canvasScript, elem.nextSibling);
              break;
          }
          break;

        case "form":
          if ( elem.hasAttribute("action") ) {
              elem.setAttribute("action", elem.action);
          }
          break;

        case "input":
          switch (elem.type.toLowerCase()) {
            // images: input
            case "image":
              if (elem.hasAttribute("src")) {
                elem.setAttribute("src", elem.src);
              }
              switch (options["capture.image"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  captureRewriteUri(elem, "src", "about:blank");
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    settings: settings,
                    options: options
                  }, function (response) {
                    captureRewriteUri(elem, "src", response.url);
                    remainingTasks--;
                    captureCheckDone();
                  });
                  break;
              }
              break;
          }
          break;
      }

      // scripts: script-like attributes (on* attributes)
      switch (options["capture.scriptAttr"]) {
        case "save":
          // do nothing
          break;
        case "remove":
        default:
          Array.prototype.forEach.call(elem.attributes, function (attr) {
            if (attr.name.toLowerCase().startsWith("on")) {
              captureRewriteAttr(elem, attr.name, null);
            }
          });
      }

      // handle integrity
      // We have to remove integrity check because we could modify the content
      // and they might not work correctly in the offline environment.
      if ( options["capture.removeIntegrity"] ) {
        captureRewriteAttr(elem, "integrity", null);
      }
    });

    // force UTF-8
    if (!hasMeta) {
      var metaNode = doc.createElement("meta");
      metaNode.setAttribute("charset", "UTF-8");
      headNode.insertBefore(metaNode, headNode.firstChild);
      headNode.insertBefore(doc.createTextNode("\n"), headNode.firstChild);
    }

    captureCheckDone();
  };

  var captureCheckDone = function () {
    if (remainingTasks <= 0) {
      captureDone();
    }
  };

  var captureDone = function () {
    var content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;
    capturer.invoke("saveDocument", {
      frameUrl: doc.URL,
      settings: settings,
      options: options,
      data: {
        documentName: documentName,
        mime: mime,
        content: content,
      }
    }, callback);
  };

  var resolveRelativeUrl = function (baseUrl, relativeUrl) {
    if (!arguments.callee.rewriters) { arguments.callee.rewriters = {}; }
    var rewriters = arguments.callee.rewriters;
    if (!rewriters[baseUrl]) {
      var subDoc = doc.implementation.createHTMLDocument("");
      var base = subDoc.createElement("base");
      base.href = baseUrl;
      subDoc.querySelector("head").appendChild(base);
      var a = subDoc.createElement("a");
      rewriters[baseUrl] = a;
    }
    rewriters[baseUrl].setAttribute("href", relativeUrl);
    return rewriters[baseUrl].href;
  };

  var downloadSrcset = function (srcset, callback) {
    var srcsetUrls = [], srcsetRewrittenCount = 0;

    var onAllDownloaded = function () {
      var srcsetNew = scrapbook.parseSrcset(srcset, function (url) {
        return srcsetUrls.shift();
      });
      callback(srcsetNew);
    };

    scrapbook.parseSrcset(srcset, function (url) {
      srcsetUrls.push(url);
      return "";
    });

    srcsetUrls.forEach(function (elem, index, array) {
      capturer.invoke("downloadFile", {
        url: elem,
        settings: settings,
        options: options
      }, function (response) {
        array[index] = response.url;
        if (++srcsetRewrittenCount === srcsetUrls.length) {
          onAllDownloaded();
        }
      });
    });
  };

  // remove the specified node, record it if option set
  var captureRemoveNode = function (elem) {
    if (options["capture.recordRemovedNode"]) {
      elem.parentNode.replaceChild(doc.createComment("sb-" + timeId + "-orig-node--" + scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
    }
    else {
      elem.parentNode.removeChild(elem);
    }
  };

  // rewrite (or remove if value is null/undefined) the specified attr, record it if option set
  var captureRewriteAttr = function (elem, attr, value) {
    if (!elem.hasAttribute(attr)) return;
    if (options["capture.recordRemovedAttr"]) {
      elem.setAttribute("data-sb-" + timeId + "-orig-" + attr, elem.getAttribute(attr));
    }
    if (value === null && value === undefined) {
      elem.removeAttribute(attr);
    } else {
      elem.setAttribute(attr, value);
    }
  };

  // rewrite (or remove if value is null/undefined) the textContent, record it if option set
  var captureRewriteTextContent = function (elem, value) {
    if (!elem.textContent) return;
    if (options["capture.recordRemovedAttr"]) {
      elem.setAttribute("data-sb-" + timeId + "-orig-textContent", elem.textContent);
    }
    if (value === null && value === undefined) {
      elem.textContent = "";
    } else {
      elem.textContent = value;
    }
  };

  // similar to captureRewriteAttr, but use option capture.recordSourceUri
  var captureRewriteUri = function (elem, attr, value) {
    if (!elem.hasAttribute(attr)) return;
    if (options["capture.recordSourceUri"]) {
      elem.setAttribute("data-sb-" + timeId + "-orig-" + attr, elem.getAttribute(attr));
    }
    if (value === null && value === undefined) {
      elem.removeAttribute(attr);
    } else {
      elem.setAttribute(attr, value);
    }
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

  capturer.invoke("registerDocument", {
    settings: settings,
    options: options
  }, function (response) {
    documentName = response.documentName;
    captureMain();
  });
};

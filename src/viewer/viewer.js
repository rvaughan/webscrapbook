/********************************************************************
 *
 * Script for viewer.html
 *
 *******************************************************************/

function initWithFileSystem(myFileSystem) {
  /**
   * common helper functions
   */
  var createDir = function (dirEntry, path, callback) {
    var folders = (Object.prototype.toString.call(path) === "[object Array]") ? path : path.split("/");
    dirEntry.getDirectory(folders.join("/"), {}, (dirEntry) => {
      callback();
    }, (ex) => {
      createDirInternal(dirEntry, folders, callback);
    });
  };

  var createDirInternal = function (dirEntry, folders, callback) {
    // Throw out './' or '/' and move on to prevent something like '/foo/.//bar'.
    if (folders[0] == '.' || folders[0] == '') {
      folders = folders.slice(1);
    }

    dirEntry.getDirectory(folders[0], {create: true}, (dirEntry) => {
      // Recursively add the new subfolder (if we still have another to create).
      if (folders.length) {
        createDir(dirEntry, folders.slice(1), callback);
      } else {
        callback();
      }
    }, (ex) => {
      alert("Unable to create directory: '" + folders.join("/") + "': " + ex);
    });
  };

  var createFile = function (dirEntry, path, fileBlob, callback) {
    createDir(dirEntry, path.split("/").slice(0, -1), () => {
      dirEntry.getFile(path, {create: true}, (fileEntry) => {
        // Create a FileWriter object for our FileEntry (log.txt).
        fileEntry.createWriter((fileWriter) => {

          fileWriter.onwriteend = function (e) {
            callback();
          };

          fileWriter.onerror = function (e) {
            alert("Unable to create write file: '" + path + "'");
            callback();
          };

          fileWriter.write(fileBlob);
        }, (ex) => {
          alert("Unable to create file writer: '" + path + "': " + ex);
        });
      }, (ex) => {
        alert("Unable to create file: '" + path + "': " + ex);
      });
    });
  };

  var extractZipFile = function (file) {
    var pendingZipEntry = 0;
    var ns = scrapbook.getUuid();
    var type = scrapbook.filenameParts(file.name)[1].toLowerCase();

    var zip = new JSZip();
    zip.loadAsync(file).then((zip) => {
      myFileSystem.root.getDirectory(ns, {create: true}, () => {
        zip.forEach((inZipPath, zipObj) => {
          if (zipObj.dir) { return; }
          ++pendingZipEntry;
          zipObj.async("arraybuffer").then((ab) => {
            createFile(myFileSystem.root, ns + "/" + inZipPath, new Blob([ab], {type: "text/plain"}), () => {
              if (--pendingZipEntry === 0) { onAllZipEntriesProcessed(type, ns); }
            });
          });
        });
        if (pendingZipEntry === 0) { onAllZipEntriesProcessed(type, ns); }
      }, (ex) => {
        alert("Unable to create directory: '" + ns + "': " + ex);
      });
    }).catch((ex) => {
      alert("Unable to load the zip file: " + ex);
    });
  };

  var onAllZipEntriesProcessed = function (type, ns) {
    switch (type) {
      case "maff": {
        var readRdfFile = function (file, callback) {
          var xhr = new XMLHttpRequest();
          xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
              if (xhr.status == 200 || xhr.status == 0) {
                callback(xhr.response);
              }
            }
          };
          xhr.responseType = "document";
          xhr.open("GET", URL.createObjectURL(file), true);
          xhr.send();
        };

        var processRdfDocument = function (doc) {
          var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
          var MAF = "http://maf.mozdev.org/metadata/rdf#";
          var result = {};

          var elems = doc.getElementsByTagNameNS(MAF, "indexfilename");
          var elem = elems[0];
          if (elem) { result.indexfilename = elem.getAttributeNS(RDF, "resource"); }

          return result;
        };
        
        var processMaffDirectoryEntry = function (directoryEntry, callback) {
          directoryEntry.getFile("index.rdf", {}, (fileEntry) => {
            fileEntry.file((file) => {
              readRdfFile(file, (doc) => {
                var meta = processRdfDocument(doc);
                directoryEntry.getFile(meta.indexfilename, {}, (fileEntry) => {
                  callback(fileEntry);
                }, (ex) => {
                  alert("Unable to get index file '" + meta.indexfilename + "' in the directory: '" + directoryEntry.fullPath + "': " + ex);
                  callback(null);
                });
              });
            }, (ex) => {
              alert("Unable to read index.rdf in the directory: '" + directoryEntry.fullPath + "'");
              callback(null);
            });
          }, (ex) => {
            directoryEntry.createReader().readEntries((entries) => {
              for (let i = 0, I = entries.length; i < I; ++i) {
                let entry = entries[i];
                if (entry.isFile && entry.name.startsWith("index.")) {
                  callback(entry);
                  return;
                }
              }
              callback(null);
            }, (ex) => {
              alert("Unable to read directory: '" + directoryEntry.fullPath + "'");
              callback(null);
            });
          });
        };

        var onAllDirectoryParsed = function (indexFileEntries) {
          let validIndexFileEntries = indexFileEntries.filter(x => !!x);
          if (validIndexFileEntries.length) {
            onZipExtracted(validIndexFileEntries);
          } else {
            alert("No available data can be loaded from this maff file.");
          }
        };
        
        myFileSystem.root.getDirectory(ns, {}, (mainEntry) => {
          mainEntry.createReader().readEntries((entries) => {
            let remainingDirectories = 0, indexFileEntries = [];
            entries.forEach((entry) => {
              if (!entry.isDirectory) { return; }
              remainingDirectories++;
              let index = indexFileEntries.length;
              indexFileEntries.length++;
              processMaffDirectoryEntry(entry, (indexFileEntry) => {
                indexFileEntries[index] = indexFileEntry;
                if (--remainingDirectories === 0) { onAllDirectoryParsed(indexFileEntries); }
              });
            });
            if (remainingDirectories === 0) { onAllDirectoryParsed(indexFileEntries); }
          }, (ex) => {
            alert("Unable to read directory: '" + ns + "'");
          });
        }, (ex) => {
          alert("Unable to get directory: '" + ns + "'");
        });
        break;
      }
      case "htz":
      default: {
        var indexFile = ns + "/" + "index.html";
        myFileSystem.root.getFile(indexFile, {}, (fileEntry) => {
          onZipExtracted(fileEntry);
        }, (ex) => {
          alert("Unable to get file: '" + indexFile + "': " + ex);
        });
        break;
      }
    }
  };

  var onZipExtracted = function (indexFileEntries) {
    if (Object.prototype.toString.call(indexFileEntries) !== "[object Array]") {
      indexFileEntries = [indexFileEntries];
    }

    chrome.tabs.getCurrent((tab) => {
      let mainFileEntry = indexFileEntries.shift();
      indexFileEntries.forEach((indexFileEntry) => {
        let url = indexFileEntry.toURL() + urlSearch + urlHash;
        chrome.tabs.create({url: url}, () => {});
      });
      let url = mainFileEntry.toURL() + urlSearch + urlHash;
      chrome.tabs.update(tab.id, {url: url}, () => {});
    });
  };

  var loadFromUrlParams = function () {
    let src = mainUrl.searchParams.get("src");
    if (!src) { return; }

    let srcUrl = new URL(src);
    urlSearch = srcUrl.search;
    urlHash = mainUrl.hash;
    // use a random hash to avoid recursive redirect
    srcUrl.searchParams.set(scrapbook.runtime.viewerRedirectKey, 1);
    src = srcUrl.href;
    let filename = scrapbook.urlToFilename(src);

    scrapbook.xhr({
      url: src,
      responseType: "blob",
      onreadystatechange: function (xhr, xhrAbort) {
        if (xhr.readyState === 2) {
          // if header Content-Disposition is defined, use it
          try {
            let headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
            let contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
            filename = contentDisposition.parameters.filename || filename;
          } catch (ex) {}
        } else if (xhr.readyState === 4) {
          if (xhr.status == 200 || xhr.status == 0) {
            let file = new File([xhr.response], filename);
            extractZipFile(file);
          }
        }
      },
      onerror: function (xhr, xhrAbort) {
        alert("Unable to load the specified zip file '" + src + "'");
      }
    });

    mainUrl.searchParams.set("reload", 1);
    history.replaceState({}, null, mainUrl);
  };

  /**
   * main script
   */
  var reloader = document.getElementById('reloader');
  var fileSelector = document.getElementById('file-selector');
  var fileSelectorDrop = document.getElementById('file-selector-drop');
  var fileSelectorInput = document.getElementById('file-selector-input');
  var urlSearch = "";
  var urlHash = "";

  reloader.addEventListener("click", (e) => {
    e.preventDefault();
    loadFromUrlParams();
  }, false);

  fileSelectorDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, false);

  fileSelectorDrop.addEventListener("drop", (e) => {
    e.preventDefault();

    Array.prototype.forEach.call(e.dataTransfer.items, (item) => {
      var entry = item.webkitGetAsEntry();
      if (entry.isFile) {
        entry.file((file) => {
          extractZipFile(file);
        });
      }
    });
  }, false);

  fileSelectorDrop.addEventListener("click", (e) => {
    e.preventDefault();
    fileSelectorInput.click();
  }, false);

  fileSelectorInput.addEventListener("change", (e) => {
    e.preventDefault();
    var file = e.target.files[0];
    extractZipFile(file);
  }, false);

  // if source is specified, load it
  let mainUrl = new URL(document.URL);

  if (mainUrl.searchParams.has("reload")) {
    fileSelector.style.display = "none";
    reloader.style.display = "block";
  } else {
    loadFromUrlParams();
  }
}

function initWithoutFileSystem() {
  /**
   * common helper functions
   */
  var invokeZipViewer = function (file) {
    var onRead = function (data) {
      var viewerData = {
        virtualBase: chrome.runtime.getURL("viewer/!/"),
        zip: data
      };

      scrapbook.xhr({
        url: chrome.runtime.getURL("viewer/zipviewer.html"),
        responseType: "document",
        onreadystatechange: function (xhr, xhrAbort) {
          if (xhr.readyState === 4) {
            if (xhr.status == 200 || xhr.status == 0) {
              let doc = xhr.response;
              scrapbook.loadLanguages(doc);

              let dataElem = doc.querySelector("script");
              dataElem.textContent = 'window.viewerData = ' + JSON.stringify(viewerData) + ';';
              Array.prototype.forEach.call(doc.querySelectorAll("script"), (elem) => {
                if (elem.hasAttribute("src")) { elem.setAttribute("src", elem.src); }
              });

              let content = scrapbook.doctypeToString(doc.doctype) + doc.documentElement.outerHTML;
              let url = URL.createObjectURL(new Blob([content], {type: doc.contentType}));
              document.location = url;
            }
          }
        },
        onerror: function (xhr, xhrAbort) {}
      });
    };

    let reader = new FileReader();
    reader.onloadend = function (event) {
      onRead(event.target.result);
    }
    reader.readAsDataURL(file);
  };

  /**
   * main script
   */
  var fileSelector = document.getElementById('file-selector');
  var fileSelectorDrop = document.getElementById('file-selector-drop');
  var fileSelectorInput = document.getElementById('file-selector-input');
  var urlSearch = "";
  var urlHash = "";

  fileSelectorDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, false);

  fileSelectorDrop.addEventListener("drop", (e) => {
    e.preventDefault();

    Array.prototype.forEach.call(e.dataTransfer.items, (item) => {
      var entry = item.webkitGetAsEntry();
      if (entry.isFile) {
        entry.file((file) => {
          invokeZipViewer(file);
        });
      }
    });
  }, false);

  fileSelectorDrop.addEventListener("click", (e) => {
    e.preventDefault();
    fileSelectorInput.click();
  }, false);

  fileSelectorInput.addEventListener("change", (e) => {
    e.preventDefault();
    var file = e.target.files[0];
    invokeZipViewer(file);
  }, false);

  // if source is specified, load it
  let mainUrl = new URL(document.URL);

  let src = mainUrl.searchParams.get("src");
  if (src) {
    try {
      let srcUrl = new URL(src);
      urlSearch = srcUrl.search;
      urlHash = mainUrl.hash;
      // use a random hash to avoid recursive redirect
      srcUrl.searchParams.set(scrapbook.runtime.viewerRedirectKey, 1);
      src = srcUrl.toString();
      let filename = scrapbook.urlToFilename(src);

      let xhr = new XMLHttpRequest();

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 2) {
          // if header Content-Disposition is defined, use it
          try {
            let headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
            let contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
            filename = contentDisposition.parameters.filename || filename;
          } catch (ex) {}
        } else if (xhr.readyState === 4) {
          if (xhr.status == 200 || xhr.status == 0) {
            let file = new File([xhr.response], filename, {type: Mime.prototype.lookup(filename)});
            invokeZipViewer(file);
          }
        }
      };

      xhr.responseType = "blob";
      xhr.open("GET", src, true);
      xhr.send();
    } catch (ex) {
      alert("Unable to load the specified zip file '" + src + "': " + ex);
    }
    return;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // load languages
  scrapbook.loadLanguages(document);
  
  scrapbook.loadOptions(() => {
    // request FileSystem
    var errorHandler = function (ex) {
      // console.error(ex);
      initWithoutFileSystem();
    };

    try {
      if (scrapbook.options["viewer.useFileSystemApi"]) {
        window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        // @TODO: Request a 5GB filesystem currently. Do we need larger space or make it configurable?
        window.requestFileSystem(window.TEMPORARY, 5*1024*1024*1024, (fs) => {
          initWithFileSystem(fs);
        }, errorHandler);
      } else {
        initWithoutFileSystem();
      }
    } catch (ex) {
      errorHandler(ex);
    }
  });
});

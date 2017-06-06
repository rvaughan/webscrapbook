/********************************************************************
 *
 * Manage options
 *
 *******************************************************************/

var OPTION_PREFIX = "opt_";

function getOptionFromDocument(id) {
  var elem = document.getElementById(OPTION_PREFIX + id);
  switch (elem.getAttribute("type")) {
    case "checkbox":
      return elem.checked;
    default:
      return elem.value;
  }
}

function setOptionFromDocument(id, value) {
  var elem = document.getElementById(OPTION_PREFIX + id);
  switch (elem.getAttribute("type")) {
    case "checkbox":
      elem.checked = value;
      break;
    default:
      elem.value = value;
      break;
  }
}

window.addEventListener("DOMContentLoaded", function (event) {
  // load languages
  scrapbook.loadLanguages(document);

  // form
  document.getElementById("options").addEventListener("submit", function (event) {
    for (var id in scrapbook.options) {
      scrapbook.options[id] = getOptionFromDocument(id);
    }
    scrapbook.saveOptions(function () {
      window.close();
    });
    event.preventDefault();
  });

  // create elements for default options
  for (var id in scrapbook.options) {
    var value = scrapbook.options[id];

    var p = document.createElement("p");
    document.getElementById("optionsWrapper").appendChild(p);

    var label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = id + ": ";
    p.appendChild(label);

    switch(Object.prototype.toString.call(value)) {
      case "[object Boolean]":
        var input = document.createElement("input");
        input.id = OPTION_PREFIX + id;
        input.setAttribute("type", "checkbox");
        input.setAttribute("checked", value ? "true" : "false");
        p.appendChild(input);
        break;
      case "[object Number]":
        var input = document.createElement("input");
        input.id = OPTION_PREFIX + id;
        input.setAttribute("type", "number");
        input.setAttribute("value", value);
        p.appendChild(input);
        break;
      case "[object Array]":
        var input = document.createElement("select");
        input.id = OPTION_PREFIX + id;
        input.setAttribute("type", "select");
        p.appendChild(input);
        for (var i=0, I=value.length; i<I-1; ++i) {
          var item = value[i];
          var option = document.createElement("option");
          option.value = option.textContent = item;
          input.appendChild(option);
        }
        break;
      default:  // string
        var input = document.createElement("input");
        input.id = OPTION_PREFIX + id;
        input.setAttribute("type", "text");
        input.setAttribute("value", value);
        p.appendChild(input);
        break;
    }
  }

  // load from sync
  scrapbook.loadOptions(function (options) {
    for (var id in options) {
      var value = options[id];
      setOptionFromDocument(id, value);
    }
  });
});

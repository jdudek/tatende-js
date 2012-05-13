var fs = require("fs");
var parser = require("parser");
var backend = require("c_backend");

exports.compile = function (filename, dependencies) {
  var readFile = function (filename) {
    return fs.readFileSync(filename);
  };
  var asModule = function (name, source) {
    return "modules[\"" + name + "\"] = {};\n" +
      "function (exports) { " + source + " }(modules[\"" + name + "\"]);\n";
  };
  // Format of the list: parser=src/parser.js,assert=src/assert.js
  var parseDependenciesList = function (list) {
    return list.split(",").reduce(function (obj, entry) {
      entry = entry.split("=");
      obj[entry[0]] = entry[1];
      return obj;
    }, {});
  };

  if (typeof dependencies === "undefined") {
    dependencies = {};
  } else if (typeof dependencies === "string") {
    dependencies = parseDependenciesList(dependencies);
  }

  var name;
  var sources = [];

  sources.push(readFile("src/runtime.js"));
  for (name in dependencies) {
    if (dependencies.hasOwnProperty(name)) {
      sources.push(asModule(name, readFile(dependencies[name])));
    }
  }
  sources.push(readFile(filename));

  var ast = parser.parse(sources.join("\n")).success;
  if (! ast) {
    throw "Compilation failed: parse error";
  }

  return backend.compile(ast);
};

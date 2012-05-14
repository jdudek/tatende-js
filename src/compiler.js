var fs = require("fs");
var parser = require("parser");
var backend = require("c_backend");

var readFile = function (filename) {
  return fs.readFileSync(filename);
};

var asModule = function (name, source) {
  return "global.require.available[\"" + name + "\"] = " +
    "function (exports) { " + source + " };\n";
};

// Format of the list: parser=src/parser.js,assert=src/assert.js
var parseDependenciesList = function (list) {
  return list.split(",").reduce(function (obj, entry) {
    entry = entry.split("=");
    obj[entry[0]] = entry[1];
    return obj;
  }, {});
};

exports.compile = function (input, dependencies) {
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
  sources.push(input);

  var ast = parser.parse(sources.join("\n")).success;
  if (! ast) {
    throw "Compilation failed: parse error";
  }

  return backend.compile(ast);
};

exports.compileFile = function (filename, dependencies) {
  return exports.compile(readFile(filename), dependencies);
};

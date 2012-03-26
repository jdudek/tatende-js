if (typeof process.env.ECMA_TESTS_PATH === "undefined") {
  console.log("ECMA_TESTS_PATH undefined.");
  return;
}

var testFiles = [
  "/ch08/8.3/S8.3_A1_T1.js",
];

var header = "global['$ERROR'] = function (msg) { console.log(msg); };";

var assert = require("assert");
var fs = require("fs");
var childProcess = require("child_process");
var parser = require("parser");
var backend = require("c_backend");

var tests = [];

var runTests = function () {
  tests.reduceRight(function (tail, fn) {
    return function () {
      fn(function () {
        process.stdout.write(".");
        tail();
      });
    };
  }, function () {
    process.stdout.write("\n");
  })();
};

var testProgram = function (program) {
  return function (callback) {
    var ast = parser.parse(program).success;
    assert.ok(!! ast, "Program wasn't parsed succesfully")
    var runtime = parser.parse(fs.readFileSync(__dirname + "/../src/runtime.js", "utf8")).success;
    assert.ok(!! runtime)
    var headerAst = parser.parse(header).success;
    assert.ok(!! headerAst)
    var compiled = backend.compile(runtime.concat(headerAst.concat(ast)));
    fs.writeFileSync("program.c", compiled);
    childProcess.exec("gcc program.c && ./a.out", function (error, stdout, stderr) {
      assert.strictEqual(stderr, "");
      assert.ok(! error);
      callback();
    });
  };
};

testFiles.forEach(function (fileName) {
  tests.push(testProgram(fs.readFileSync(process.env.ECMA_TESTS_PATH + fileName, "utf8")));
});

runTests();

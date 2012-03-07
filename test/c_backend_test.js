var assert = require("assert");
var fs = require("fs");
var childProcess = require("child_process");

var parser = require("parser");
var backend = require("c_backend");

var tests = [];

// Runs each function from tests array serially.
var runTests = function () {
  tests.reduceRight(function (tail, fn) {
    return function () { fn(tail) };
  }, function () {})();
};

// For given program, returns a function that will compile & run this program,
// and then check its output against expected output.
// The created test function is asynchronous and accepts callback to run when
// it's done.
var testProgram = function (program, expectedOutput) {
  return function (callback) {
    var ast = parser.parse(program).success;
    assert.ok(!! ast)
    var compiled = backend.compile(ast);
    fs.writeFileSync("program.c", compiled);
    childProcess.exec("gcc program.c && ./a.out", function (error, stdout) {
      assert.ok(! error);
      assert.strictEqual(stdout, expectedOutput);
      callback();
    });
  };
};

tests.push(testProgram("return 123;", "123"));
tests.push(testProgram("return 100 + 23;", "123"));
tests.push(testProgram("return 2 * 3;", "6"));
tests.push(testProgram("return 2 * (2 + 2);", "8"));
tests.push(testProgram("return 'xxx';", "xxx"));

runTests();

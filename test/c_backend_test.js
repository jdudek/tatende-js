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
    childProcess.exec("gcc program.c && ./a.out", function (error, stdout, stderr) {
      assert.strictEqual(stderr, "");
      assert.strictEqual(stdout, expectedOutput);
      assert.ok(! error);
      callback();
    });
  };
};

tests.push(testProgram("return 123;", "123"));
tests.push(testProgram("return 100 + 23;", "123"));
tests.push(testProgram("return 2 * 3;", "6"));
tests.push(testProgram("return 2 * (2 + 2);", "8"));
tests.push(testProgram("return 'xxx';", "xxx"));
tests.push(testProgram("return 'x' + 'y';", "xy"));
tests.push(testProgram("return {};", "[object]"));
tests.push(testProgram("return { x: 2 };", "[object]"));
tests.push(testProgram("return { x: 2 }.x;", "2"));
tests.push(testProgram("return { x: 2 }.y;", "[undefined]"));
tests.push(testProgram("return [1,2,3][0];", "1"));
tests.push(testProgram("return [1,2,3][2];", "3"));
tests.push(testProgram("return [1,2,3][3];", "[undefined]"));
tests.push(testProgram("return function () { return 2; };", "[function]"));
tests.push(testProgram("return true;", "true"));
tests.push(testProgram("return false;", "false"));
tests.push(testProgram("return 2 < 3;", "true"));
tests.push(testProgram("return 2 > 3;", "false"));

tests.push(testProgram("var x; return 2;", "2"));
tests.push(testProgram("var x = 2; return x;", "2"));
tests.push(testProgram("var x = 5; x = 2; return x;", "2"));
tests.push(testProgram("var x = {}; x.y = 2; return x.y;", "2"));

// Test: expression statement
tests.push(testProgram("var x = 2; 5; return x;", "2"));

// Test: empty statement
tests.push(testProgram("var x = 2; ; return x;", "2"));

// Test: function invocation
tests.push(testProgram("return function () { return 2; }();", "2"));
tests.push(testProgram("return function (x) { return x; }(2);", "2"));
tests.push(testProgram("return function (x, y) { return x; }(2);", "2"));

// Test: access variables from outer scope
tests.push(testProgram("return function (x) { return function () { return x; }(); }(2);", "2"));

// Test: call returned closure
tests.push(testProgram("return function (x) { return function () { return x; }; }(2)();", "2"));

// Test: closure modifies variable from outer scope
tests.push(testProgram("var x = 3; function () { x = 2; }(); return x;", "2"));

// Test: closure modifies aliased variable
tests.push(testProgram("var x = 3; function (x) { x = 2; }(5); return x;", "3"));

// Test: scope contains variables declared later
tests.push(testProgram("function () { x = 2; }(); var x; return x;", "2"));
tests.push(testProgram("function () { x = 2; }(); var x = 1; return x;", "1"));
tests.push(testProgram("function () { x = 2; }(); if (true) { var x; } return x;", "2"));
tests.push(testProgram("function () { x = 2; }(); if (true) {} else { var x; } return x;", "2"));

// Test: Factorial
tests.push(testProgram("var fac = function (n) { if (n > 0) { return n * fac(n-1); } else { return 1; } }; return fac(5);", "120"));

// Test: function uses "this"
tests.push(testProgram("var x = { a: 2, f: function () { return this.a; } }; return x.f();", "2"));

// Test: constructor
tests.push(testProgram("var X = function () {}; var x = new X(); return x;", "[object]"));
tests.push(testProgram("var X = function () {}; var x = new X; return x;", "[object]"));
tests.push(testProgram("var X = function () { this.y = 2; }; var x = new X(); return x.y;", "2"));
tests.push(testProgram("var X = function () { return { y: 2 }; }; var x = new X(); return x.y;", "2"));
tests.push(testProgram("var ns = {}; ns.X = function () { this.y = 2; }; var x = new ns.X(); return x.y;", "2"));

// Test: function properties
tests.push(testProgram("var f = function () {}; f.x = 2; return f.x;", "2"));

// Test: prototypes
tests.push(testProgram("var X = function () {}; X.prototype.y = 2; var x = new X(); return x.y;", "2"));

// Test: Object prototype method isPrototypeOf
tests.push(testProgram("var X = function () {}; var x = new X(); return X.prototype.isPrototypeOf(x);", "true"));

// Test: global object
tests.push(testProgram("return global;", "[object]"));
tests.push(testProgram("global.x = 2; return global.x;", "2"));

// Test: global object is default value for "this"
tests.push(testProgram("global.x = 2; var f = function () { return this; }; return f().x;", "2"));

// Test: use global object property when variable does not exist
tests.push(testProgram("global.x = 2; return x;", "2"));
tests.push(testProgram("return new Object();", "[object]"));
tests.push(testProgram("x = 2; return x;", "2"));
tests.push(testProgram("x = 2; return global.x;", "2"));

runTests();

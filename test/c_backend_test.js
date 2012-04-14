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
    var runtime = parser.parse(fs.readFileSync(__dirname + "/../src/runtime.js", "utf8")).success;
    assert.ok(!! runtime)
    var compiled = backend.compile(runtime.concat(ast));
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
tests.push(testProgram("return \"x\\\"x\\\"x\";", "x\"x\"x"));
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
tests.push(testProgram("return undefined;", "[undefined]"));
tests.push(testProgram("return 2 < 3;", "true"));
tests.push(testProgram("return 2 > 3;", "false"));

tests.push(testProgram("var x; return 2;", "2"));
tests.push(testProgram("var x = 2; return x;", "2"));
tests.push(testProgram("var x = 5; x = 2; return x;", "2"));
tests.push(testProgram("var x = {}; x.y = 2; return x.y;", "2"));

// Test: equality operators
tests.push(testProgram("return 2 == 2;", "true"));
tests.push(testProgram("return 2 === 2;", "true"));
tests.push(testProgram("return 2 != 3;", "true"));
tests.push(testProgram("return 2 !== 3;", "true"));

// Test: boolean operators
tests.push(testProgram("return !true;", "false"));
tests.push(testProgram("return !false;", "true"));

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

// Test: Number constructor
tests.push(testProgram("return new Number(2);", "[object]"));
tests.push(testProgram("return (new Number(2)).valueOf();", "2"));
tests.push(testProgram("return (new Number(2)).toString();", "2"));

// Test: automatic conversion of primitive types to objects
tests.push(testProgram("return (2).toString();", "2"));

// Test: Error objects
tests.push(testProgram("var e = new Error('msg'); return e.name;", "Error"));
tests.push(testProgram("var e = new Error('msg'); return e.message;", "msg"));
tests.push(testProgram("var e = new Error('msg'); return e.toString();", "Error: msg"));
tests.push(testProgram("var e = new ReferenceError('msg'); return e.toString();", "ReferenceError: msg"));
tests.push(testProgram("var e = new TypeError('msg'); return e.toString();", "TypeError: msg"));

// Test: typeof operator
tests.push(testProgram("return typeof global.xxx;", "undefined"));
tests.push(testProgram("return typeof 123;", "number"));
tests.push(testProgram("return typeof true;", "boolean"));
tests.push(testProgram("return typeof 'aa';", "string"));
tests.push(testProgram("return typeof function () {};", "function"));
tests.push(testProgram("return typeof {};", "object"));

// Test: instanceof operator
tests.push(testProgram("return {} instanceof Object;", "true"));
tests.push(testProgram("return (new Number(1)) instanceof Number;", "true"));
tests.push(testProgram("return (new Number(1)) instanceof Object;", "true"));
tests.push(testProgram("return (new Number(1)) instanceof Error;", "false"));

// Test: arrays
tests.push(testProgram("return [1,2,3] instanceof Array;", "true"));
tests.push(testProgram("return [1,2,3].length;", "3"));

// Test: forEach method on Array objects
tests.push(testProgram("var sum = 0; [1,2,3].forEach(function (i) { sum = sum + i; }); return sum;", "6"));

// Test: Array.prototype.toString
tests.push(testProgram("var a = [1,2,3]; return a.toString();", "1,2,3"));

// Test: Array.prototype.join
tests.push(testProgram("var a = [1,2,3]; return a.join();", "1,2,3"));
tests.push(testProgram("var a = [1,2,3]; return a.join('.');", "1.2.3"));
tests.push(testProgram("var a = [undefined,2,null]; return a.join();", ",2,"));

// Test: Array.prototype.slice
tests.push(testProgram("var a = [0,1,2,3,4,5]; return a.slice(2,5).toString();", "2,3,4"));

// Test: arguments object
tests.push(testProgram("var f = function () { return arguments[0]; }; return f(13);", "13"));
tests.push(testProgram("var f = function () { return arguments[1]; }; return f(13);", "[undefined]"));
tests.push(testProgram("var f = function () { return arguments.length; }; return f(1, 2, 3);", "3"));

runTests();

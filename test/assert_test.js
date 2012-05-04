// This is a test for our custom assertion library.

// load Node.js assert
// var assert = require("assert");

// load custom assert
var assert = require(__dirname + "/../src/assert");

var positive = function (fun) {
  fun();
};

var negative = function (fun) {
  try {
    fun();
  } catch (e) {
    if (e instanceof assert.AssertionError) return;
  }
  throw "Negative test failed";
};

positive(function () { assert.ok(true); });
negative(function () { assert.ok(false); });

positive(function () { assert.equal(2, 2); });
negative(function () { assert.equal(2, 3); });

positive(function () { assert.deepEqual({ x: 2 }, { x: 2 }); });
negative(function () { assert.deepEqual({ x: 2 }, { x: 3 }); });
positive(function () { assert.deepEqual({ x: { y: 2 } }, { x: { y: 2 } }); });
negative(function () { assert.deepEqual({ x: { y: 2 } }, { x: { y: 3 } }); });
negative(function () { assert.deepEqual({ x: 2, y: 3 }, { x: 2 }); });
negative(function () { assert.deepEqual({ x: 2 }, { x: 2, y: 3 }); });

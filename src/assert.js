var assert = exports;

var AssertionError = function (message) {
  this.message = message;
};
AssertionError.prototype = new Error();
AssertionError.prototype.name = "AssertionError";
assert.AssertionError = AssertionError;

assert.ok = function (value) {
  if (!value) {
    throw new AssertionError("Expected true");
  }
};
assert.equal = function (actual, expected) {
  if (actual != expected) {
    throw new AssertionError("Expected " + actual.toString() + " to equal " + expected.toString());
  }
};
assert.strictEqual = function (actual, expected) {
  if (actual !== expected) {
    throw new AssertionError("Expected " + actual.toString() + " to strictly equal " + expected.toString());
  }
};

assert.deepEqual = function (actual, expected) {
  var fail = function () {
    throw new AssertionError("Expected " + actual.toString() + " to deeply equal " + expected.toString());
  };

  var deepEqual = function (actual, expected) {
    if (typeof actual != typeof expected) { fail(); }
    if (typeof actual == "object" && typeof expected == "object") {
      var key;
      if (actual !== expected) {
        for (key in actual) {
          if (actual.hasOwnProperty(key)) {
            deepEqual(actual[key], expected[key]);
          }
        }
        for (key in expected) {
          if (expected.hasOwnProperty(key)) {
            if (! actual.hasOwnProperty(key)) fail();
          }
        }
      }
    } else {
      if (actual !== expected) fail();
    }
  };

  deepEqual(actual, expected);
};

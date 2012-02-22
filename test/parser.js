var assert = require("assert");
var parser = require("parser");

var parse = function (input) {
  var result = new parser.parse(input);
  if (result.length > 0) {
    return { success: result[0][0] };
  } else {
    return { failure: [] };
  }
};

assert.deepEqual(parse("var x = 5;"), { success: [{
  varStatement: [
    { expression: { variable: "x" } },
    { expression: { number: 5 } },
  ]
}] });

assert.deepEqual(parse("var x_12 = 5;"), { success: [{
  varStatement: [
    { expression: { variable: "x_12" } },
    { expression: { number: 5 } },
  ]
}] });

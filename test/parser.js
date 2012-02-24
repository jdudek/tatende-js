var assert = require("assert");
var parser = require("parser");

var testParser = function (input, expectedAst, specificParser) {
  assert.deepEqual(parser.parse(input, specificParser), { success: expectedAst });
};

testParser("var x;", [{ varStatement: [ "x" ] }]);
testParser("var x = 5;", [{ varStatement: [ "x", { numberLiteral: 5 } ] }]);
testParser("var x_12 = 5;", [{ varStatement: [ "x_12", { numberLiteral: 5 } ] }]);
testParser("y = 5;", [{ assignStatement: [ { variable: "y" }, { numberLiteral: 5 } ] }]);
testParser("return 5;", [{ returnStatement: { numberLiteral: 5 } }]);
testParser("if (x) { return 5; }", [
  { ifStatement: [
    { variable: "x"},
    [{ returnStatement: { numberLiteral: 5 } }],
    []
  ]}
]);
testParser("if (x) { return 5; } else { return 10; }", [
  { ifStatement: [
    { variable: "x"},
    [{ returnStatement: { numberLiteral: 5 } }],
    [{ returnStatement: { numberLiteral: 10 } }]
  ]}
]);
testParser("try { return 5; } catch (e) { return e; }", [
  { tryStatement: [
    [{ returnStatement: { numberLiteral: 5 } }],
    "e",
    [{ returnStatement: { variable: "e" } }]
  ]}
]);
testParser("throw x;", [{ throwStatement: { variable: "x" } }]);
testParser("var x;;", [{ varStatement: [ "x" ] }, null]);
testParser("x;", [{ exprStatement: { variable: "x" } }]);

// tests for lexer
testParser("var x ; ", [{ varStatement: [ "x" ] }]);
testParser(" var x ; ", [{ varStatement: [ "x" ] }]);
testParser("var   x   ;  ", [{ varStatement: [ "x" ] }]);
testParser("var\tx;", [{ varStatement: [ "x" ] }]);
testParser("var\nx\n;\n", [{ varStatement: [ "x" ] }]);
testParser("var /*c*/ x;", [{ varStatement: [ "x" ] }]);
testParser("var /*c*/x; /*c*/", [{ varStatement: [ "x" ] }]);
testParser("//c\n var x;", [{ varStatement: [ "x" ] }]);
testParser("//c\nvar x; /*c*/", [{ varStatement: [ "x" ] }]);

// tests for expression parser
testParser("5", { numberLiteral: 5 }, parser.expr);
testParser("(5)", { numberLiteral: 5 }, parser.expr);
testParser("x", { variable: "x" }, parser.expr);
testParser("'abc'", { stringLiteral: "abc" }, parser.expr);
testParser('"abc"', { stringLiteral: "abc" }, parser.expr);
testParser("{}", { objectLiteral: [] }, parser.expr);
testParser("{x: 2}", { objectLiteral: [["x", { numberLiteral: 2 }]] }, parser.expr);
testParser("{x: 2, y: 3}", { objectLiteral: [
    ["x", { numberLiteral: 2 }],
    ["y", { numberLiteral: 3 }]
  ] }, parser.expr);
testParser("[]", { arrayLiteral: [] }, parser.expr);
testParser("[12, x]", { arrayLiteral: [{ numberLiteral: 12 }, { variable: "x" }] }, parser.expr);
testParser("function (x, y) { return x; }", { func: [
    ["x", "y"],
    [{ returnStatement: { variable: "x" } }]
  ] }, parser.expr);
testParser("2 + 3", { binaryOp: ["+", { numberLiteral: 2 }, { numberLiteral: 3 }] }, parser.expr);
testParser("2 * 3", { binaryOp: ["*", { numberLiteral: 2 }, { numberLiteral: 3 }] }, parser.expr);
testParser("2 * 3 + 5", { binaryOp: [
  "+",
    { binaryOp: ["*", { numberLiteral: 2 }, { numberLiteral: 3 }] },
    { numberLiteral: 5 }
  ] }, parser.expr);
testParser("2 + 3 * 5", { binaryOp: [
  "+",
    { numberLiteral: 2 },
    { binaryOp: ["*", { numberLiteral: 3 }, { numberLiteral: 5 }] }
  ] }, parser.expr);
testParser("2 + 3 + 4", { binaryOp: [
  "+",
    { binaryOp: ["+", { numberLiteral: 2 }, { numberLiteral: 3 }] },
    { numberLiteral: 4 },
  ] }, parser.expr);
testParser("2 + 3 == 7", { binaryOp: [
  "==",
    { binaryOp: ["+", { numberLiteral: 2 }, { numberLiteral: 3 }] },
    { numberLiteral: 7 },
  ] }, parser.expr);
testParser("-2 + 3 == 1", { binaryOp: [
  "==",
    { binaryOp: ["+", { unaryOp: ["-", { numberLiteral: 2 }] }, { numberLiteral: 3 }] },
    { numberLiteral: 1 },
  ] }, parser.expr);
testParser("x()", { invocation: [ { variable: "x" }, [] ] }, parser.expr);
testParser("x.y", { refinement: [ { variable: "x" }, { stringLiteral: "y" } ] }, parser.expr);
testParser("x['y']", { refinement: [ { variable: "x" }, { stringLiteral: "y" } ] }, parser.expr);
testParser("function (a, b) { return 5; }(2, 3)['foo'](4, 5)[bar].baz", {
  refinement: [
    { refinement: [
      { invocation: [
        { refinement: [
          { invocation: [
            { func: [
              ["a", "b"],
              [{ returnStatement: { numberLiteral: 5 } }]
            ] },
            [{ numberLiteral: 2 }, { numberLiteral: 3 }]
          ] },
          { stringLiteral: "foo" }
        ] },
        [{ numberLiteral: 4 }, { numberLiteral: 5 }]
      ] },
      { variable: "bar" }
    ] },
    { stringLiteral: "baz" } ]
}, parser.expr);
testParser("new X()", { unaryOp: ["new", { invocation: [ { variable: "X" }, [] ] }] }, parser.expr);

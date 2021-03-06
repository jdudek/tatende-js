var assert = require("assert");
var parser = require("parser");
var fs = require("fs");

var testParser = function (input, expectedAst, specificParser) {
  assert.deepEqual(parser.parse(input, specificParser), { success: expectedAst });
};
var testParserOnFile = function (filename) {
  var input = fs.readFileSync(filename, "utf8");
  var result = parser.parse(input);
  assert.ok(result.success);
};

testParser("var x;", [{ varStatement: [{ varDeclaration: "x" }] }]);
testParser("var x = 5;", [{ varStatement: [{ varWithValueDeclaration: ["x", { numberLiteral: 5 } ]} ]}]);
testParser("var x_12 = 5;", [{ varStatement: [{ varWithValueDeclaration: ["x_12", { numberLiteral: 5 } ] }]}]);
testParser("var x, y = 7;", [
  { varStatement: [
    { varDeclaration: "x" },
    { varWithValueDeclaration: ["y", { numberLiteral: 7 }] }
  ]}
]);
testParser("return 5;", [{ returnStatement: { numberLiteral: 5 } }]);
testParser("if (x) { return 5; }", [
  { ifStatement: [
    { variable: "x"},
    [{ returnStatement: { numberLiteral: 5 } }],
    []
  ]}
]);
testParser("if (x) return 5;", [
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
testParser("if (x) return 5; else return 10;", [
  { ifStatement: [
    { variable: "x"},
    [{ returnStatement: { numberLiteral: 5 } }],
    [{ returnStatement: { numberLiteral: 10 } }]
  ]}
]);
testParser("if (x) { return 5; } else if (y) { return 10; } else { return 15; }", [
  { ifStatement: [
    { variable: "x"},
    [{ returnStatement: { numberLiteral: 5 } }],
    [{ ifStatement: [
      { variable: "y" },
      [{ returnStatement: { numberLiteral: 10 } }],
      [{ returnStatement: { numberLiteral: 15 } }]
    ]}]
  ]}
]);
testParser("if (x) return 5; else if (y) return 10; else return 15;", [
  { ifStatement: [
    { variable: "x"},
    [{ returnStatement: { numberLiteral: 5 } }],
    [{ ifStatement: [
      { variable: "y" },
      [{ returnStatement: { numberLiteral: 10 } }],
      [{ returnStatement: { numberLiteral: 15 } }]
    ]}]
  ]}
]);
testParser("try { return 5; } catch (e) { return e; }", [
  { tryStatement: [
    [{ returnStatement: { numberLiteral: 5 } }],
    "e",
    [{ returnStatement: { variable: "e" } }],
    []
  ]}
]);
testParser("try { return 5; } finally { return 3; }", [
  { tryStatement: [
    [{ returnStatement: { numberLiteral: 5 } }],
    null,
    [],
    [{ returnStatement: { numberLiteral: 3 } }]
  ]}
]);
testParser("try { return 5; } catch (e) { return e; } finally { return 3; }", [
  { tryStatement: [
    [{ returnStatement: { numberLiteral: 5 } }],
    "e",
    [{ returnStatement: { variable: "e" } }],
    [{ returnStatement: { numberLiteral: 3 } }]
  ]}
]);
testParser("throw x;", [{ throwStatement: { variable: "x" } }]);
testParser("x;;", [{ expressionStatement: { variable: "x" } }, null]);
testParser("x;", [{ expressionStatement: { variable: "x" } }]);
testParser("x, 1;", [{ expressionStatement: { comma: [{ variable: "x" }, { numberLiteral: 1 }] } }]);
testParser("while (i < 5) { f(x); }", [
  { whileStatement: [
    { binaryOp: ["<", { variable: "i" }, { numberLiteral: 5 }] },
    [{ expressionStatement: { invocation: [{ variable: "f" }, [{ variable: "x" }]] } }]
  ]}
]);
testParser("do { f(x); } while (i < 5);", [
  { doWhileStatement: [
    { binaryOp: ["<", { variable: "i" }, { numberLiteral: 5 }] },
    [{ expressionStatement: { invocation: [{ variable: "f" }, [{ variable: "x" }]] } }]
  ]}
]);
testParser("for (var i = 0; i < 5; i) { f(x); }", [
  { forStatement: [
    { varStatement: [{ varWithValueDeclaration: ["i", { numberLiteral: 0 }] }] },
    { binaryOp: ["<", { variable: "i" }, { numberLiteral: 5 }] },
    { expressionStatement: { variable: "i" } },
    [{ expressionStatement: { invocation: [{ variable: "f" }, [{ variable: "x" }]] } }]
  ]}
]);
testParser("for (;;) { f(x); }", [
  { forStatement: [
    null, { booleanLiteral: true }, null,
    [{ expressionStatement: { invocation: [{ variable: "f" }, [{ variable: "x" }]] } }]
  ]}
]);
testParser("for (x in obj) { }", [
  { forInStatement: [ "x", { variable: "obj" }, [] ]}
]);
testParser("switch (1) { }", [
  { switchStatement: [ { numberLiteral: 1 }, [] ]}
]);
testParser("switch (1) { case 1: return 1; case 2: default: return 2; }", [
  { switchStatement: [
    { numberLiteral: 1 },
    [
      { caseClause: [{ numberLiteral: 1 }, [{ returnStatement: { numberLiteral: 1 } }]] },
      { caseClause: [{ numberLiteral: 2 }, []] },
      { defaultClause: [{ returnStatement: { numberLiteral: 2 } }] }
    ]
  ]}
]);
testParser("function fun(x) {}", [
  { functionStatement: [ "fun", ["x"], [] ]}
]);
testParser("break;", [
  { breakStatement: "break" }
]);
testParser("continue;", [
  { continueStatement: "continue" }
]);

// tests for lexer
testParser("var x ; ", [{ varStatement: [{"varDeclaration":"x"}] }]);
testParser(" var x ; ", [{ varStatement: [{"varDeclaration":"x"}] }]);
testParser("var   x   ;  ", [{ varStatement: [{"varDeclaration":"x"}] }]);
testParser("var\tx;", [{ varStatement: [{"varDeclaration":"x"}] }]);
testParser("var\nx\n;\n", [{ varStatement: [{"varDeclaration":"x"}] }]);
testParser("var /*c*/ x;", [{ varStatement: [{"varDeclaration":"x"}] }]);
testParser("var /*c*/x; /*c*/", [{ varStatement: [{"varDeclaration":"x"}] }]);
testParser("//c\n var x;", [{ varStatement: [{"varDeclaration":"x"}] }]);
testParser("//c\nvar x; /*c*/", [{ varStatement: [{"varDeclaration":"x"}] }]);

// tests for keyword parser
assert.deepEqual({ success: "true" }, parser.parse("true", parser.keyword("true")));
assert.deepEqual({ failure: [] }, parser.parse("truex", parser.keyword("true")));

// tests for operator parser
assert.deepEqual({ success: "=" }, parser.parse("=", parser.operator("=")));
assert.ok(parser.parse("==", parser.operator("=")).failure);

// tests for expression parser
testParser("5", { numberLiteral: 5 }, parser.expr);
testParser("(5)", { numberLiteral: 5 }, parser.expr);
testParser("x", { variable: "x" }, parser.expr);
testParser("_x$", { variable: "_x$" }, parser.expr);
testParser("$x", { variable: "$x" }, parser.expr);
testParser("'abc'", { stringLiteral: "abc" }, parser.expr);
testParser('"abc"', { stringLiteral: "abc" }, parser.expr);
testParser("true", { booleanLiteral: true }, parser.expr);
testParser("false", { booleanLiteral: false }, parser.expr);
testParser("undefined", { undefinedLiteral: "undefined" }, parser.expr);
testParser("null", { nullLiteral: "null" }, parser.expr);
testParser("this", { thisVariable: "this" }, parser.expr);
testParser("{}", { objectLiteral: [] }, parser.expr);
testParser("{x: 2}", { objectLiteral: [["x", { numberLiteral: 2 }]] }, parser.expr);
testParser('{"x": 2}', { objectLiteral: [["x", { numberLiteral: 2 }]] }, parser.expr);
testParser("{x: 2, y: 3}", { objectLiteral: [
    ["x", { numberLiteral: 2 }],
    ["y", { numberLiteral: 3 }]
  ] }, parser.expr);
testParser("[]", { arrayLiteral: [] }, parser.expr);
testParser("[12, x]", { arrayLiteral: [{ numberLiteral: 12 }, { variable: "x" }] }, parser.expr);
testParser("function (x, y) { return x; }", { functionLiteral: [
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
    { numberLiteral: 4 }
  ] }, parser.expr);
testParser("2 + 3 == 7", { binaryOp: [
  "==",
    { binaryOp: ["+", { numberLiteral: 2 }, { numberLiteral: 3 }] },
    { numberLiteral: 7 }
  ] }, parser.expr);
testParser("-2 + 3 == 1", { binaryOp: [
  "==",
    { binaryOp: ["+", { unaryOp: ["-", { numberLiteral: 2 }] }, { numberLiteral: 3 }] },
    { numberLiteral: 1 }
  ] }, parser.expr);
testParser("\"x\" + \"y\" == \"xy\"", { binaryOp: [
  "==",
    { binaryOp: ["+", { stringLiteral: "x" }, { stringLiteral: "y" }] },
    { stringLiteral: "xy" }
  ] }, parser.expr);
testParser("x instanceof y", { binaryOp: ["instanceof", { variable: "x" }, { variable: "y" }] }, parser.expr);
testParser("--x", { preDecrement: { variable: "x" } }, parser.expr);
testParser("++x", { preIncrement: { variable: "x" } }, parser.expr);
testParser("x--", { postDecrement: { variable: "x" } }, parser.expr);
testParser("x++", { postIncrement: { variable: "x" } }, parser.expr);
testParser("x()", { invocation: [ { variable: "x" }, [] ] }, parser.expr);
testParser("x.y", { refinement: [ { variable: "x" }, { stringLiteral: "y" } ] }, parser.expr);
testParser("x['y']", { refinement: [ { variable: "x" }, { stringLiteral: "y" } ] }, parser.expr);
testParser("function (a, b) { return 5; }(2, 3)['foo'](4, 5)[bar].baz", {
  refinement: [
    { refinement: [
      { invocation: [
        { refinement: [
          { invocation: [
            { functionLiteral: [
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
testParser("2!==-2", {
  binaryOp: ["!==", { numberLiteral: 2 }, { unaryOp: ["-", { numberLiteral: 2 } ]}]
}, parser.expr);
testParser("void 0", { unaryOp: ["void", { numberLiteral: 0 } ] }, parser.expr);

testParser('"\\"xy\\""', { stringLiteral: '"xy"' }, parser.stringLiteral);
testParser('"aa\\nbb"', { stringLiteral: 'aa\nbb' }, parser.stringLiteral);


// tests on real files
testParserOnFile("src/parser.js");
if (typeof global.process !== "undefined") { // run only in Node
  testParserOnFile("src/ast.js");
  testParserOnFile("src/c_backend.js");
}

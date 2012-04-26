// AST module exports handy constructors for syntax tree nodes.

// To avoid repetitive definitions, we'll use a bit of metaprogramming.
var makeNodeConstructor = function (name, fields) {
  var constructor = function () {
    // This condition fails unless we called constructor with new operator.
    // In such cases we call new manually. instanceof operator works properly
    // if objects are created with new.
    if (! (this instanceof constructor)) {
      // Passing variable number of arguments to constructor is a bit tricky.
      // We avoid nasty hacks by passing an object with a key "constructorArgs"
      return new constructor({ constructorArgs: arguments });
    }

    // Now we take care of unpacking arguments passed via constructorArgs.
    var args = arguments;
    if (args.length > 0 && typeof args[0].constructorArgs !== "undefined") {
      args = args[0].constructorArgs;
    }
    // Make sure args is a proper array.
    args = Array.prototype.slice.call(args, 0);

    if (fields.length > 1) {
      this[name] = args;
    } else {
      this[name] = args[0];
    }
  };
  // We also define accessor functions for node children.
  // Having them on prototype is faster and allows nodes to serialize nicely.
  fields.forEach(function (field) {
    constructor.prototype[field] = function () {
      if (fields.length > 1) {
        return this[name][fields.indexOf(field)];
      } else {
        return this[name];
      }
    };
  });
  return constructor;
};

// Below we define all possible classes of nodes in abstract syntax trees.
// They're divided in two categories: expressions and statements.

exports.NumberLiteral = makeNodeConstructor("numberLiteral", ["number"]);
exports.StringLiteral = makeNodeConstructor("stringLiteral", ["string"]);
exports.BooleanLiteral = makeNodeConstructor("booleanLiteral", ["value"]);
exports.ObjectLiteral = makeNodeConstructor("objectLiteral", ["pairs"]);
exports.ArrayLiteral = makeNodeConstructor("arrayLiteral", ["items"]);
exports.FunctionLiteral = makeNodeConstructor("functionLiteral", ["args", "statements"]);
exports.UndefinedLiteral = makeNodeConstructor("undefinedLiteral", ["keyword"]);
exports.NullLiteral = makeNodeConstructor("nullLiteral", ["keyword"]);
exports.ThisVariable = makeNodeConstructor("thisVariable", ["keyword"]);
exports.Variable = makeNodeConstructor("variable", ["identifier"]);
exports.Invocation = makeNodeConstructor("invocation", ["expression", "args"]);
exports.Refinement = makeNodeConstructor("refinement", ["expression", "key"]);
exports.BinaryOp = makeNodeConstructor("binaryOp", ["operator", "leftExpr", "rightExpr"]);
exports.UnaryOp = makeNodeConstructor("unaryOp", ["operator", "expression"]);
exports.PreDecrement = makeNodeConstructor("preDecrement", ["expression"]);
exports.PreIncrement = makeNodeConstructor("preIncrement", ["expression"]);
exports.PostDecrement = makeNodeConstructor("postDecrement", ["expression"]);
exports.PostIncrement = makeNodeConstructor("postIncrement", ["expression"]);
exports.Comma = makeNodeConstructor("comma", ["expressions"]);

exports.VarStatement = makeNodeConstructor("varStatement", ["declarations"]);
exports.ReturnStatement = makeNodeConstructor("returnStatement", ["expression"]);
exports.ThrowStatement = makeNodeConstructor("throwStatement", ["expression"]);
exports.ExpressionStatement = makeNodeConstructor("expressionStatement", ["expression"]);
exports.DoWhileStatement = makeNodeConstructor("doWhileStatement", ["condition", "statements"]);
exports.IfStatement = makeNodeConstructor("ifStatement", ["condition", "whenTruthy", "whenFalsy"]);
exports.TryStatement = makeNodeConstructor("tryStatement",
    ["tryStatements", "identifier", "catchStatements", "finallyStatements"]);
exports.WhileStatement = makeNodeConstructor("whileStatement", ["condition", "statements"]);
exports.ForStatement = makeNodeConstructor("forStatement", ["initial", "condition", "finalize", "statements"]);
exports.ForInStatement = makeNodeConstructor("forInStatement", ["identifier", "object", "statements"]);
exports.SwitchStatement = makeNodeConstructor("switchStatement", ["expression", "clauses"]);

// Declarations are parts of var statements.
exports.VarDeclaration = makeNodeConstructor("varDeclaration", ["identifier"]);
exports.VarWithValueDeclaration = makeNodeConstructor("varWithValueDeclaration", ["identifier", "expression"]);

// Clauses are parts of switch statements.
exports.CaseClause = makeNodeConstructor("caseClause", ["expression", "statements"]);
exports.DefaultClause = makeNodeConstructor("defaultClause", ["statements"]);

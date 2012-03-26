// AST module exports handy constructors for syntax tree nodes.

// To avoid repetitive definitions, we'll use a bit of metaprogramming.
var makeNodeConstructor = function (name, fields) {
  var constructor = function () {
    var args = Array.prototype.slice.call(arguments, 0);

    // This condition fails unless we called constructor with new operator.
    // In such cases we call new manually. instanceof operator works properly
    // if objects are created with new.
    if (! (this instanceof constructor)) {
      // This is a nasty hack to call new with variable number of arguments.
      // First argument of bind() is an object that will be value of this,
      // which we don't care about, hence null.
      return new (constructor.bind.apply(constructor, [null].concat(args)));
    }
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

exports.VarStatement = makeNodeConstructor("varStatement", ["identifier", "expression"]);
exports.AssignStatement = makeNodeConstructor("assignStatement", ["leftExpr", "rightExpr"]);
exports.ReturnStatement = makeNodeConstructor("returnStatement", ["expression"]);
exports.ThrowStatement = makeNodeConstructor("throwStatement", ["expression"]);
exports.ExpressionStatement = makeNodeConstructor("expressionStatement", ["expression"]);
exports.DoWhileStatement = makeNodeConstructor("doWhileStatement", ["condition", "statements"]);
exports.IfStatement = makeNodeConstructor("ifStatement", ["condition", "whenTruthy", "whenFalsy"]);
exports.TryStatement = makeNodeConstructor("tryStatement", ["tryStatements", "identifier", "catchStatements"]);
exports.WhileStatement = makeNodeConstructor("whileStatement", ["condition", "statements"]);
exports.ForStatement = makeNodeConstructor("forStatement", ["initial", "condition", "finalize", "statements"]);
exports.SwitchStatement = makeNodeConstructor("switchStatement", ["expression", "clauses"]);

// We also need a third, very small category for clauses in switch statements.
exports.CaseClause = makeNodeConstructor("caseClause", ["expression", "statements"]);
exports.DefaultClause = makeNodeConstructor("defaultClause", ["statements"]);

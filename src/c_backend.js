var AST = require("ast");

exports.compile = function (ast) {
  return addTemplate(ast.map(statement).join("\n"));
};

var addTemplate = function (program) {
  return '' +
    '#include <stdio.h>\n' +
    '#include "src/js.c"\n' +
    'JSValue program () {\n' + program + '\n}\n' +
    'int main() {\n' +
    '  js_dump_value(program());\n' +
    '  return 0;\n' +
    '}\n';
};

var statement = function (node) {
  if (node instanceof AST.ReturnStatement) {
    return "return " + expression(node.expression()) + ";";
  }
  throw "Incorrect AST";
}

var expression = function (node) {
  switch (node.constructor) {
    case AST.NumberLiteral:
      return "js_new_number(" + node.number().toString() + ")";

    case AST.StringLiteral:
      return "js_new_string(\"" + node.string() + "\")";

    case AST.BinaryOp:
      var operatorFunctions = { "+": "js_add", "*": "js_mult" };
      return operatorFunctions[node.operator()] + "(" +
        expression(node.leftExpr()) + ", " + expression(node.rightExpr())  + ")"

    default:
      throw "Incorrect AST";
  }
}

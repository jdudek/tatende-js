var AST = require("ast");

exports.compile = function (ast) {
  return addTemplate(ast.map(statement).join("\n"));
};

var addTemplate = function (program) {
  return '' +
    '#include <stdio.h>\n' +
    '#include "src/js.c"\n' +
    'JSValue* program () {\n' + program + '\n}\n' +
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

    case AST.ObjectLiteral:
      return objectLiteral(node);

    case AST.Refinement:
      return "(JSValue*) dict_find_with_default(" +
        expression(node.expression()) + "->object_value, " +
        "js_to_string(" + expression(node.key()) + ")->string_value, js_new_undefined())";

    case AST.BinaryOp:
      var operatorFunctions = { "+": "js_add", "*": "js_mult" };
      return operatorFunctions[node.operator()] + "(" +
        expression(node.leftExpr()) + ", " + expression(node.rightExpr())  + ")"

    default:
      throw "Incorrect AST";
  }
}

var objectLiteral = function (node) {
  return "js_new_object(" +
    node.pairs().reduce(function (acc, property) {
      return "dict_insert(" + acc + ", \"" + property[0] + "\", " + expression(property[1]) + ")";
    }, "dict_create()") +
  ")";
}

var AST = require("ast");

exports.compile = function (ast) {
  return addTemplate(ast.map(statement).join("\n"));
};

var addTemplate = function (program) {
  return '' +
    '#include <stdio.h>\n' +
    'int program () {\n' + program + '\n}\n' +
    'int main() {\n' +
    '  printf("%d", program());\n' +
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
  var parens = function (str) {
    return '(' + str  + ')';
  };

  if (node instanceof AST.NumberLiteral) {
    return node.number().toString();
  } else if (node instanceof AST.BinaryOp) {
    return parens(expression(node.leftExpr())) + node.operator() + parens(expression(node.rightExpr()));
  }
  throw "Incorrect AST";
}

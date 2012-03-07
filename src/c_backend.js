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
  if (node instanceof AST.NumberLiteral) {
    return node.number().toString();
  }
  throw "Incorrect AST";
}

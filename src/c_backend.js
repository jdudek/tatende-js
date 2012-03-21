var AST = require("ast");

exports.compile = function (ast) {
  var functions = [];

  var unique = function () {
    var i = 1;
    return function () {
      return ++i;
    };
  }();

  var quotes = function (s) {
    return '"' + s + '"';
  };

  var statement = function (node) {
    switch (node.constructor) {
      // When we reach this place, we've already splitted var statements with assignment
      // into var statement and assignment statement.
      case AST.VarStatement:
        return "binding = dict_insert(binding, " +
          quotes(node.identifier()) + ", js_create_variable(js_new_undefined()));";

      case AST.AssignStatement:
        if (node.leftExpr() instanceof AST.Variable) {
          return "js_assign_variable(binding, " +
            quotes(node.leftExpr().identifier()) + ", " + expression(node.rightExpr()) + ");";
        } else {
          throw "Invalid left-hand side in assignment";
        }

      case AST.ReturnStatement:
        return "return " + expression(node.expression()) + ";";

      case AST.ExpressionStatement:
        return expression(node.expression()) + ";";

      case AST.IfStatement:
        return "if (js_is_truthy(" + expression(node.condition()) + "))" +
          "{ " + node.whenTruthy().map(statement) + " } " +
          "else { " + node.whenFalsy().map(statement) + " }";

      default:
        throw "Incorrect AST";
    }
  };

  var expression = function (node) {
    switch (node.constructor) {
      case AST.NumberLiteral:
        return "js_new_number(" + node.number().toString() + ")";

      case AST.StringLiteral:
        return "js_new_string(\"" + node.string() + "\")";

      case AST.BooleanLiteral:
        if (node.value()) {
          return "js_new_boolean(1)";
        } else {
          return "js_new_boolean(0)";
        }

      case AST.ObjectLiteral:
        return objectLiteral(node);

      case AST.FunctionLiteral:
        return functionLiteral(node, functions);

      case AST.Variable:
        return "js_get_variable_rvalue(binding, " + quotes(node.identifier()) + ")";

      case AST.Refinement:
        return "(JSValue*) dict_find_with_default(" +
          expression(node.expression()) + "->object_value, " +
          "js_to_string(" + expression(node.key()) + ")->string_value, js_new_undefined())";

      case AST.Invocation:
        return invocation(node);

      case AST.BinaryOp:
        return binaryOp(node);

      default:
        throw "Incorrect AST";
    }
  };

  var objectLiteral = function (node) {
    return "js_new_object(" +
      node.pairs().reduce(function (acc, property) {
        return "dict_insert(" + acc + ", \"" + property[0] + "\", " + expression(property[1]) + ")";
      }, "dict_create()") +
    ")";
  };

  // Utility function to create C list from array of strings
  var toCList = function (array) {
    return array.reduceRight(function (acc, item) {
      return "list_insert(" + acc + ", " + item + ")";
    }, "list_create()");
  };

  var functionLiteral = function (node) {
    var name = "fun_" + unique();
    var body = reorderVarStatements(node.statements()).map(statement).join("\n");
    var argNames = toCList(node.args().map(function (a) { return '"' + a + '"'; }));

    var cFunction =
      "JSValue* " + name + "(List argValues, Dict binding) {\n" +
        "List argNames = " + argNames + ";\n" +
        "binding = js_append_args_to_binding(argNames, argValues, binding);\n" +
        body +
        "return js_new_undefined();\n" +
      "}\n";
    functions.push(cFunction);
    return "js_new_function(&" + name + ", binding)";
  };

  // Traverse list of nodes and move all var statements to the top.
  // When var statement also assigns value, create new assign statement,
  // but still move variable declaration to the top.
  var reorderVarStatements = function (nodes) {
    collectVarStatements = function (nodes) {
      if (nodes.length == 0) {
        return [];
      }
      if (nodes[0] instanceof AST.VarStatement) {
        return [nodes[0]].concat(collectVarStatements(nodes.slice(1)));
      } else {
        return collectVarStatements(nodes.slice(1));
      }
    };
    var removeVarStatements = function (nodes) {
      if (nodes.length == 0) {
        return [];
      }
      if (nodes[0] instanceof AST.VarStatement) {
        if (nodes[0].expression()) {
          return [AST.AssignStatement(AST.Variable(nodes[0].identifier()), nodes[0].expression())].
            concat(removeVarStatements(nodes.slice(1)));
        } else {
          return removeVarStatements(nodes.slice(1));
        }
      } else {
        return [nodes[0]].concat(removeVarStatements(nodes.slice(1)));
      }
    };

    return collectVarStatements(nodes).concat(removeVarStatements(nodes));
  };

  var invocation = function (node) {
    var argValues = toCList(node.args().map(expression));
    return "js_call_function(" + expression(node.expression()) + ", " + argValues + ")";
  };

  var binaryOp = function (node) {
    var operatorFunctions = {
      "+": "js_add", "-": "js_sub", "*": "js_mult",
      "<": "js_lt", ">": "js_gt"
    };
    if (typeof operatorFunctions[node.operator()] === "undefined") {
      throw "Unsupported operator: " + node.operator();
    }
    return operatorFunctions[node.operator()] + "(" +
      expression(node.leftExpr()) + ", " + expression(node.rightExpr())  + ")";
  };

  var addTemplate = function (program) {
    return '' +
      '#include <stdio.h>\n' +
      '#include "src/js.c"\n' +
      functions.join("\n") + "\n" +
      'int main() {\n' +
      '  Dict binding = NULL;\n' +
      '  js_dump_value(' + program + ');\n' +
      '  return 0;\n' +
      '}\n';
  };

  var program = AST.Invocation(AST.FunctionLiteral([], ast), []);
  return addTemplate(expression(program));
};

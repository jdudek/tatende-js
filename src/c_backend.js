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
    if (node === null) {
      return "";
    }

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
    // extractVarStatements returns a pair of two lists: var statements first, then
    // any other statements.
    var extractVarStatements = function (nodes) {
      var result = [[], []];

      if (nodes.length == 0) {
        return result;
      }

      var node = nodes[0];
      nodes = nodes.slice(1);

      if (node instanceof AST.VarStatement) {
        if (node.expression()) {
          var varStmt = AST.VarStatement(node.identifier());
          var assignStmt = AST.AssignStatement(AST.Variable(node.identifier()), node.expression());
          result = extractVarStatements(nodes);
          result[0] = [varStmt].concat(result[0]);
          result[1] = [assignStmt].concat(result[1]);
        } else {
          result = extractVarStatements(nodes);
          result[0] = [node].concat(result[0]);
        }
      } else if (node instanceof AST.IfStatement) {
        var result1 = extractVarStatements(node.whenTruthy());
        var result2 = extractVarStatements(node.whenFalsy());

        node = AST.IfStatement(node.condition(), result1[1], result2[1]);

        result = extractVarStatements(nodes);
        result[0] = result1[0].concat(result2[0]).concat(result[0]);
        result[1] = [node].concat(result[1]);
      } else {
        result = extractVarStatements(nodes);
        result[1] = [node].concat(result[1]);
      }
      return result;
    };

    // It suffices to concat two result lists.
    var result = extractVarStatements(nodes);
    return result[0].concat(result[1]);
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

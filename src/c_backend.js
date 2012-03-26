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
          return "js_assign_variable(global, binding, " +
            quotes(node.leftExpr().identifier()) + ", " +
            expression(node.rightExpr()) +
          ");";
        } else if (node.leftExpr() instanceof AST.Refinement) {
          return "{ "+
            "JSValue* object = " + expression(node.leftExpr().expression()) + "; " +
            "object->object_value = dict_insert(object->object_value, " +
              "js_to_string(global, " + expression(node.leftExpr().key()) + ")->string_value, " +
              expression(node.rightExpr()) + "); " +
            "}";
        } else {
          throw "Invalid left-hand side in assignment";
        }

      case AST.ReturnStatement:
        return "return " + expression(node.expression()) + ";";

      case AST.ExpressionStatement:
        return expression(node.expression()) + ";";

      case AST.IfStatement:
        return "if (js_is_truthy(" + expression(node.condition()) + "))" +
          "{ " + node.whenTruthy().map(statement).join("") + " } " +
          "else { " + node.whenFalsy().map(statement).join("") + " }";

      case AST.WhileStatement:
        return "while (js_is_truthy(" + expression(node.condition()) + "))" +
          "{ " + node.statements().map(statement).join("") + " }; ";

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

      case AST.ArrayLiteral:
        return arrayLiteral(node);

      case AST.FunctionLiteral:
        return functionLiteral(node, functions);

      case AST.Variable:
        return "js_get_variable_rvalue(global, binding, " + quotes(node.identifier()) + ")";

      case AST.ThisVariable:
        return "this";

      case AST.Refinement:
        return "js_get_object_property(global, " +
          expression(node.expression()) + ", " +
          expression(node.key()) + ")";

      case AST.Invocation:
        return invocation(node);

      case AST.BinaryOp:
        return binaryOp(node);

      case AST.UnaryOp:
        return unaryOp(node);

      default:
        throw "Incorrect AST";
    }
  };

  var objectLiteral = function (node) {
    return "js_new_object(global, " +
      node.pairs().reduce(function (acc, property) {
        return "dict_insert(" + acc + ", \"" + property[0] + "\", " + expression(property[1]) + ")";
      }, "dict_create()") +
    ")";
  };

  var arrayLiteral = function (node) {
    return expression(AST.UnaryOp("new", AST.Invocation(AST.Variable("Array"), node.items())));
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
    var buildArgumentsObject = "binding = dict_insert(binding, \"arguments\", js_create_variable(" +
      "js_invoke_constructor(global, "+
        "js_get_object_property(global, global, js_new_string(\"Array\")), "+
        "argValues)"+
      "));";

    var cFunction =
      "JSValue* " + name + "(JSValue* global, JSValue* this, List argValues, Dict binding) {\n" +
        "List argNames = " + argNames + ";\n" +
        buildArgumentsObject + "\n" +
        "binding = js_append_args_to_binding(argNames, argValues, binding);\n" +
        body +
        "return js_new_undefined();\n" +
      "}\n";
    functions.push(cFunction);
    return "js_new_function(global, &" + name + ", binding)";
  };

  // Traverse list of nodes and move all var statements to the top.
  // When var statement also assigns value, create new assign statement,
  // but still move variable declaration to the top.
  // Please note this function will modify the tree in-place.
  var reorderVarStatements = function (nodes) {
    var identifiers = [];

    var visit = function (nodes) {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node instanceof AST.VarStatement) {
          identifiers.push(node.identifier());
          if (node.expression()) {
            nodes[i] = AST.AssignStatement(AST.Variable(node.identifier()), node.expression());
          } else {
            nodes[i] = null;
          }
        }
        if (node instanceof AST.IfStatement) {
          visit(node.whenTruthy());
          visit(node.whenFalsy());
        }
      }
    };
    visit(nodes);

    // A utility function that modifies array and puts items before existing array items.
    var prepend = function (array, items) {
      Array.prototype.splice.apply(array, [0, 0].concat(items));
    };

    prepend(nodes, identifiers.map(AST.VarStatement));
    return nodes;
  };

  var invocation = function (node) {
    var argValues = toCList(node.args().map(expression));
    if (node.expression() instanceof AST.Refinement) {
      var object = node.expression().expression();
      var key = node.expression().key();
      return "js_call_method(global, js_to_object(global, " + expression(object) + "), " +
        expression(key) + ", " + argValues + ")";
    } else {
      return "js_call_function(global, " + expression(node.expression()) + ", global, " + argValues + ")";
    }
  };

  var binaryOp = function (node) {
    var operatorFunctions = {
      "+": "js_add", "-": "js_sub", "*": "js_mult",
      "<": "js_lt", ">": "js_gt",
      "==": "js_eq", "!=": "js_neq",
      "===": "js_strict_eq", "!==": "js_strict_neq",
      "instanceof": "js_instanceof"
    };
    if (typeof operatorFunctions[node.operator()] === "undefined") {
      throw "Unsupported operator: " + node.operator();
    }
    return operatorFunctions[node.operator()] + "(" +
      expression(node.leftExpr()) + ", " + expression(node.rightExpr())  + ")";
  };

  var unaryOp = function (node) {
    switch (node.operator()) {
      case "new":
        return newExpression(node.expression());

      case "typeof":
        return "js_typeof(" + expression(node.expression()) + ")";

      default:
        throw "Unsupported operator: " + node.operator();
    }
  };

  var newExpression = function (node) {
    var fun;
    var argValues;

    if (node instanceof AST.Invocation) {
      fun = node.expression();
      argValues = toCList(node.args().map(expression));
    } else {
      fun = node;
      argValues = "NULL";
    }
    return "js_invoke_constructor(global, " + expression(fun) + "," + argValues + ")";
  };

  var addTemplate = function (program) {
    return '' +
      '#include <stdio.h>\n' +
      '#include "src/js.c"\n' +
      functions.join("\n") + "\n" +
      'int main() {\n' +
      '  JSValue* global = js_new_bare_object();\n' +
      '  js_create_native_objects(global);\n' +
      '  Dict binding = dict_create();\n' +
      '  js_dump_value(' + program + ');\n' +
      '  return 0;\n' +
      '}\n';
  };

  var program = AST.Invocation(AST.FunctionLiteral([], ast), []);
  return addTemplate(expression(program));
};

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
        return node.declarations().map(function (declaration) {
          return "binding = dict_insert(binding, " +
            quotes(declaration.identifier()) + ", js_create_variable(js_new_undefined()));";
        }).join("\n");

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

      case AST.TryStatement:
        return tryStatement(node);

      case AST.ThrowStatement:
        return "js_throw(env, " + expression(node.expression()) + ");";

      default:
        throw "Incorrect AST";
    }
  };

  var tryStatement = function (node) {
    var toCFunction = function (name, statements) {
      return "JSValue* " + name + "(JSEnv* env, JSValue* this, Dict binding) {\n" +
        statements.map(statement).join("\n") +
        "return NULL;\n" +
        "}";
    };

    var tryFunc = "try_" + unique();
    functions.push(toCFunction(tryFunc, node.tryStatements()));

    var catchFunc = "catch_" + unique();
    var catchStatements = node.catchStatements();
    var catchIdentifier = node.identifier();
    if (catchIdentifier === null) {
      catchStatements = [AST.ThrowStatement(AST.Variable("e"))];
      catchIdentifier = "e";
    }
    functions.push(toCFunction(catchFunc, catchStatements));

    var finallyFunc = "finally_" + unique();
    functions.push(toCFunction(finallyFunc, node.finallyStatements()));

    return "{\n" +
      "JSException* exc = js_push_new_exception(env);\n" +
      "if (!setjmp(exc->jmp)) { " +
        "JSValue* ret = " + tryFunc + "(env, this, binding);\n" +
        "js_pop_exception(env);\n" +
        finallyFunc + "(env, this, binding);\n" +
        "if (ret) return ret;\n" +
      "} else {\n" +
        "JSVariable exc_variable = js_create_variable((JSValue *) exc->value);\n" +
        "js_pop_exception(env);\n" +
        "JSValue* ret = " + catchFunc + "(env, this, dict_insert(binding, " +
          quotes(catchIdentifier) + ", exc_variable));\n" +
        finallyFunc + "(env, this, binding);\n" +
        "if (ret) return ret;\n" +
      "}\n}\n";
  };

  var escapeCString = function (str) {
    var replace = function (str, p, r) {
      return str.split(p).join(r);
    };
    str = replace(str, "\\", "\\\\");
    str = replace(str, "\"", "\\\"");
    return str;
  };

  var expression = function (node) {
    switch (node.constructor) {
      case AST.NumberLiteral:
        return "js_new_number(" + node.number().toString() + ")";

      case AST.StringLiteral:
        return "js_new_string(" + quotes(escapeCString(node.string())) + ")";

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

      case AST.UndefinedLiteral:
        return "js_new_undefined()";

      case AST.NullLiteral:
        return "js_new_null()";

      case AST.Variable:
        return "js_get_variable_rvalue(env, binding, " + quotes(node.identifier()) + ")";

      case AST.ThisVariable:
        return "this";

      case AST.Refinement:
        return "js_get_object_property(env, " +
          expression(node.expression()) + ", " +
          expression(node.key()) + ")";

      case AST.Invocation:
        return invocation(node);

      case AST.BinaryOp:
        return binaryOp(node);

      case AST.UnaryOp:
        return unaryOp(node);

      case AST.Comma:
        return "(" + node.expressions().map(expression).join(", ") + ")";

      default:
        throw "Incorrect AST";
    }
  };

  var objectLiteral = function (node) {
    return "js_new_object(env, " +
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
      "js_invoke_constructor(env, "+
        "js_get_object_property(env, env->global, js_new_string(\"Array\")), "+
        "argValues)"+
      "));";

    var cFunction =
      "JSValue* " + name + "(JSEnv* env, JSValue* this, List argValues, Dict binding) {\n" +
        "List argNames = " + argNames + ";\n" +
        buildArgumentsObject + "\n" +
        "binding = js_append_args_to_binding(argNames, argValues, binding);\n" +
        body +
        "return js_new_undefined();\n" +
      "}\n";
    functions.push(cFunction);
    return "js_new_function(env, &" + name + ", binding)";
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
        var assignments = [];
        if (node instanceof AST.VarStatement) {
          node.declarations().forEach(function (declaration) {
            identifiers.push(declaration.identifier());
            if (declaration instanceof AST.VarWithValueDeclaration) {
              assignments.push(
                AST.BinaryOp("=", AST.Variable(declaration.identifier()), declaration.expression()));
            }
          });
          if (assignments.length > 0) {
            nodes[i] = AST.ExpressionStatement(AST.Comma(assignments));
          } else {
            nodes[i] = null;
          }
        }
        if (node instanceof AST.IfStatement) {
          visit(node.whenTruthy());
          visit(node.whenFalsy());
        }
        if (node instanceof AST.TryStatement) {
          visit(node.tryStatements());
          visit(node.catchStatements());
          visit(node.finallyStatements());
        }
      }
    };
    visit(nodes);

    // A utility function that modifies array and puts items before existing array items.
    var prepend = function (array, items) {
      Array.prototype.splice.apply(array, [0, 0].concat(items));
    };

    prepend(nodes, AST.VarStatement(identifiers.map(AST.VarDeclaration)));
    return nodes;
  };

  var invocation = function (node) {
    var argValues = toCList(node.args().map(expression));
    if (node.expression() instanceof AST.Refinement) {
      var object = node.expression().expression();
      var key = node.expression().key();
      return "js_call_method(env, js_to_object(env, " + expression(object) + "), " +
        expression(key) + ", " + argValues + ")";
    } else {
      return "js_call_function(env, " + expression(node.expression()) + ", env->global, " + argValues + ")";
    }
  };

  var binaryOp = function (node) {
    var operatorFunctions = {
      "+": "js_add", "-": "js_sub", "*": "js_mult",
      "<": "js_lt", ">": "js_gt",
      "==": "js_eq", "!=": "js_neq",
      "===": "js_strict_eq", "!==": "js_strict_neq",
      "&": "js_binary_and", "^": "js_binary_xor", "|": "js_binary_or",
      "&&": "js_logical_and", "||": "js_logical_or",
      "instanceof": "js_instanceof"
    };
    var assignOperators = ["+=", "-="];
    if (node.operator() === "=") {
      if (node.leftExpr() instanceof AST.Variable) {
        return "js_assign_variable(env, binding, " +
          quotes(node.leftExpr().identifier()) + ", " +
          expression(node.rightExpr()) +
        ")";
      } else if (node.leftExpr() instanceof AST.Refinement) {
        return "js_set_object_property(env, " + expression(node.leftExpr().expression()) + ", " +
          expression(node.leftExpr().key()) + ", " + expression(node.rightExpr()) + ")";
      } else {
        throw "Invalid left-hand side in assignment";
      }
    }
    if (assignOperators.indexOf(node.operator()) !== -1) {
      return expression(
        AST.BinaryOp("=", node.leftExpr(),
          AST.BinaryOp(
            node.operator().replace("=", ""),
            node.leftExpr(), node.rightExpr()
        ))
      );
    }
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

      case "!":
        return "js_new_boolean(! js_to_boolean(" + expression(node.expression()) + ")->boolean_value)";

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
    return "js_invoke_constructor(env, " + expression(fun) + "," + argValues + ")";
  };

  var addTemplate = function (program) {
    return '' +
      '#include <stdio.h>\n' +
      '#include "src/js.c"\n' +
      functions.join("\n") + "\n" +
      'int main() {\n' +
      '  JSEnv* env = malloc(sizeof(JSEnv));\n' +
      '  env->exceptions_count = 0;\n' +
      '  env->global = js_new_bare_object();\n' +
      '  js_create_native_objects(env);\n' +
      '  Dict binding = dict_create();\n' +
      '  js_dump_value(' + program + ');\n' +
      '  return 0;\n' +
      '}\n';
  };

  // Wrap program statements in try {} block and anonymous function invocation.
  var program = AST.Invocation(AST.FunctionLiteral([],
    [AST.TryStatement(
      ast, "e",
      [AST.ExpressionStatement(
        AST.Invocation(
          AST.Refinement(AST.Variable("console"), AST.StringLiteral("log")),
          [AST.Variable("e")]
        )
      )], []
    )]
  ), []);

  return addTemplate(expression(program));
};

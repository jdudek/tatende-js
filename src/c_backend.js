var AST = require("ast");

exports.compile = function (ast) {
  var functions = [];
  var breakLabel;

  var unique = function () {
    var i = 1;
    return function () {
      return i++;
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
      case AST.ReturnStatement:
        return "ret = " + expression(node.expression()) + "; goto end;";

      case AST.ExpressionStatement:
        return expression(node.expression()) + ";";

      case AST.IfStatement:
        return "if (js_is_truthy(" + expression(node.condition()) + "))" +
          "{ " + node.whenTruthy().map(statement).join("") + " } " +
          "else { " + node.whenFalsy().map(statement).join("") + " }";

      case AST.ForStatement:
        return [
          node.initial(),
          AST.WhileStatement(node.condition(), node.statements().concat([node.finalize()]))
        ].map(statement).join("");

      case AST.ForInStatement:
        return "{" +
            "JSObject* object = js_to_object(env, " + expression(node.object()) + ").as.object;\n" +
            "while (object) {\n"+
              "int i = 0;\n" +
              "while (i < object->properties_count) {\n" +
                "js_assign_variable(env, binding, string_from_cstring(" + quotes(node.identifier()) + ")," +
                  "js_string_value_from_string(object->properties[i].key));\n" +
                node.statements().map(statement).join("") +
                "i++;\n" +
              "}\n" +
              "object = object->prototype;\n" +
            "}" +
          "}";

      case AST.WhileStatement:
        return "while (js_is_truthy(" + expression(node.condition()) + "))" +
          "{ " + node.statements().map(statement).join("") + " }; ";

      case AST.TryStatement:
        return tryStatement(node);

      case AST.ThrowStatement:
        return "js_throw(env, " + expression(node.expression()) + ");";

      case AST.SwitchStatement:
        return switchStatement(node);

      case AST.BreakStatement:
        return "goto " + breakLabel + ";";

      default:
        throw "Incorrect AST";
    }
  };

  var tryStatement = function (node) {
    var toCFunction = function (name, statements) {
      return "JSValue " + name + "(JSEnv* env, JSValue this, JSObject* binding, int* returned) {\n" +
        "JSValue ret = js_new_undefined();\n" +
        statements.map(statement).join("\n") +
        "*returned = 0;\n" +
        "end:\n" +
        "return ret;\n" +
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
        "int returned = 1, finally_returned = 0;\n" +
        "JSValue inner_ret = " + tryFunc + "(env, this, binding, &returned);\n" +
        "js_pop_exception(env);\n" +
        finallyFunc + "(env, this, binding, &finally_returned);\n" +
        "if (returned) { ret = inner_ret; goto end; }\n" +
      "} else {\n" +
        "int returned = 1, finally_returned = 0;\n" +
        "JSObject* catch_binding = object_new(binding);\n" +
        "object_add_property(catch_binding, string_from_cstring(" + quotes(catchIdentifier) + "), exc->value);\n" +
        "js_pop_exception(env);\n" +
        "JSValue inner_ret = " + catchFunc + "(env, this, catch_binding, &returned);\n" +
        finallyFunc + "(env, this, binding, &finally_returned);\n" +
        "if (returned) { ret = inner_ret; goto end; }\n" +
      "}\n}\n";
  };

  var switchStatement = function (node) {
    var name = "switch_" + unique();
    var switchEnd = name + "_end";
    breakLabel = switchEnd;
    node.clauses().forEach(function (clause, i) { clause.index = i; });
    var conditions = node.clauses().filter(function (clause) {
      return clause instanceof AST.CaseClause;
    }).map(function (clause) {
      return "if (js_strict_eq(env, switch_value, " + expression(clause.expression()) + ").as.boolean) " +
        "{ goto " + name + "_" + clause.index + "; }\n";
    }).join(" else ") + " else { goto " + name + "_default; }";
    var statements = node.clauses().map(function (clause) {
      var clauseName;
      if (clause instanceof AST.CaseClause) {
        clauseName = name + "_" + clause.index;
      } else {
        clauseName = name + "_default";
      }
      return clauseName + ":;\n" + clause.statements().map(statement).join("\n") + "\n";
    }).join("\n") + "\n";
    return "{\n" +
        "JSValue switch_value = " + expression(node.expression()) + ";\n" +
        conditions + ";\n"+
        statements + ";\n"+
        switchEnd + ":;\n"+
      "}";
  };

  var escapeCString = function (str) {
    var replace = function (str, p, r) {
      return str.split(p).join(r);
    };
    str = replace(str, "\\", "\\\\");
    str = replace(str, "\"", "\\\"");
    str = replace(str, "\n", "\\n");
    str = replace(str, "\t", "\\t");
    return str;
  };

  var expression = function (node) {
    switch (node.constructor) {
      case AST.NumberLiteral:
        return "js_new_number(" + node.number().toString() + ")";

      case AST.StringLiteral:
        return "js_string_value_from_cstring(" + quotes(escapeCString(node.string())) + ")";

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
        return "js_get_variable_rvalue(env, binding, string_from_cstring(" + quotes(node.identifier()) + "))";

      case AST.ThisVariable:
        return "this";

      case AST.Refinement:
        return "js_get_property(env, " +
          expression(node.expression()) + ", " +
          expression(node.key()) + ")";

      case AST.Invocation:
        return invocation(node);

      case AST.BinaryOp:
        return binaryOp(node);

      case AST.UnaryOp:
        return unaryOp(node);

      case AST.PostIncrement:
        return expression(AST.BinaryOp("+=", node.expression(), AST.NumberLiteral(1)));

      case AST.PostDecrement:
        return expression(AST.BinaryOp("-=", node.expression(), AST.NumberLiteral(1)));

      case AST.Comma:
        return "(" + node.expressions().map(expression).join(", ") + ")";

      default:
        throw "Incorrect AST";
    }
  };

  var objectLiteral = function (node) {
    return node.pairs().reduce(function (acc, property) {
      return "js_add_property(env, " + acc + ", js_string_value_from_cstring(" + quotes(property[0]) + "), " + expression(property[1]) + ")";
    }, "js_new_object(env)");
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
    reorderVarStatements(node);
    var name = "fun_" + unique();
    var body = node.statements().map(statement).join("\n");

    var argumentsObjectDefinition = "";
    if (node.statements().some(needsArgumentsObject)) {
      argumentsObjectDefinition = "object_add_property(binding, string_from_cstring(\"arguments\"), " +
        "js_invoke_constructor(env, "+
          "js_get_property(env, env->global, js_string_value_from_cstring(\"Array\")), "+
          "stack_count)"+
        "); env->call_stack_count += stack_count;";
    }

    var argumentsDefinition = node.args().map(function (argName, i) {
      return "if (stack_count > " + i + ") { " +
          "object_add_property(binding, string_from_cstring(" + quotes(argName) + "), JS_CALL_STACK_ITEM(" + i + "));" +
        "} else { " +
          "object_add_property(binding, string_from_cstring(" + quotes(argName) + "), js_new_undefined());" +
        "}";
    }).join("\n") + "\nJS_CALL_STACK_POP;";

    var localDeclarations = node.localVariables().map(function (identifier) {
      return "object_add_property(binding, string_from_cstring(" + quotes(identifier) + "), js_new_undefined());";
    }).join("\n");

    var cFunction =
      "JSValue " + name + "(JSEnv* env, JSValue this, int stack_count, JSObject* parent_binding) {\n" +
        "JSObject* binding = object_new(parent_binding);\n" +
        argumentsObjectDefinition + "\n" +
        argumentsDefinition + "\n" +
        localDeclarations + "\n" +
        "JSValue ret = js_new_undefined();\n" +
        body +
        "end:\n" +
        "return ret;\n" +
      "}\n";
    functions.push(cFunction);
    return "js_new_function(env, &" + name + ", binding)";
  };

  // Traverse function statements and move all declared variables to node's
  // localVariables property.
  // When var statement also assigns value, create new assign statement.
  // Please note this function will modify the tree in-place.
  var reorderVarStatements = function (functionNode) {
    var visit = function (nodes) {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var assignments = [];

        var convertVarStatement = function (node) {
          node.declarations().forEach(function (declaration) {
            functionNode.addLocalVariable(declaration.identifier());
            if (declaration instanceof AST.VarWithValueDeclaration) {
              assignments.push(
                AST.BinaryOp("=", AST.Variable(declaration.identifier()), declaration.expression()));
            }
          });
          if (assignments.length > 0) {
            return AST.ExpressionStatement(AST.Comma(assignments));
          } else {
            return null;
          }
        };

        if (node instanceof AST.VarStatement) {
          nodes[i] = convertVarStatement(node);
        }
        if (node instanceof AST.FunctionStatement) {
          nodes[i] = convertVarStatement(AST.VarStatement([
            AST.VarWithValueDeclaration(node.name(),
              AST.FunctionLiteral(node.args(), node.statements())
            )
          ]));
        }
        if (node instanceof AST.IfStatement) {
          visit(node.whenTruthy());
          visit(node.whenFalsy());
        }
        if (node instanceof AST.ForStatement) {
          if (node.initial() instanceof AST.VarStatement) {
            nodes[i] = AST.ForStatement(
              convertVarStatement(node.initial()),
              node.condition(),
              node.finalize(),
              node.statements()
            );
          }
          visit(node.statements());
        }
        if (node instanceof AST.TryStatement) {
          visit(node.tryStatements());
          visit(node.catchStatements());
          visit(node.finallyStatements());
        }
      }
    };
    visit(functionNode.statements());
  };

  var needsArgumentsObject = function (node) {
    if (node === null) {
      return false;
    }
    switch (node.constructor) {
      case AST.VarStatement:
        return node.declarations().some(needsArgumentsObject);

      case AST.ReturnStatement:
      case AST.ExpressionStatement:
      case AST.ThrowStatement:
        return needsArgumentsObject(node.expression());

      case AST.IfStatement:
        return needsArgumentsObject(node.condition()) ||
          node.whenTruthy().some(needsArgumentsObject) ||
          node.whenFalsy().some(needsArgumentsObject);

      case AST.ForStatement:
        return needsArgumentsObject(node.initial()) ||
          needsArgumentsObject(node.condition()) ||
          needsArgumentsObject(node.finalize()) ||
          node.statements().some(needsArgumentsObject);

      case AST.ForInStatement:
        return needsArgumentsObject(node.object()) ||
          node.statements().some(needsArgumentsObject);

      case AST.WhileStatement:
        return needsArgumentsObject(node.condition()) ||
          node.statements().some(needsArgumentsObject);

      case AST.TryStatement:
        return node.tryStatements().some(needsArgumentsObject) ||
          node.catchStatements().some(needsArgumentsObject) ||
          node.finallyStatements().some(needsArgumentsObject);

      case AST.SwitchStatement:
        return needsArgumentsObject(node.expression()) ||
          node.clauses().some(needsArgumentsObject);

      case AST.CaseClause:
      case AST.DefaultClause:
        return node.statements().some(needsArgumentsObject);

      case AST.BreakStatement:
        return false;

      case AST.NumberLiteral:
      case AST.StringLiteral:
      case AST.BooleanLiteral:
      case AST.FunctionLiteral:
      case AST.UndefinedLiteral:
      case AST.NullLiteral:
      case AST.ThisVariable:
        return false;

      case AST.ObjectLiteral:
        return node.pairs().some(function (pair) { return needsArgumentsObject(pair[1]); });

      case AST.ArrayLiteral:
        return node.items().some(needsArgumentsObject);

      case AST.Variable:
        return (node.identifier() == "arguments");

      case AST.Refinement:
      case AST.UnaryOp:
      case AST.PostIncrement:
      case AST.PostDecrement:
        return needsArgumentsObject(node.expression());

      case AST.Invocation:
        return needsArgumentsObject(node.expression()) ||
          node.args().some(needsArgumentsObject);

      case AST.BinaryOp:
        return needsArgumentsObject(node.leftExpr()) ||
          needsArgumentsObject(node.rightExpr());

      case AST.Comma:
        return node.expressions().some(needsArgumentsObject);

      case AST.VarDeclaration:
        return false;

      case AST.VarWithValueDeclaration:
        return needsArgumentsObject(node.expression());

      default:
        throw "Incorrect AST";
    }
  };

  var withStackArgs = function (args, invocation) {
    var parts = [];
    parts.push("js_check_call_stack_overflow(env, " + args.length + ")");
    args.forEach(function (arg) {
      parts.push("js_call_stack_push(env, " + arg + ")");
    });
    parts.push(invocation);
    return "(" + parts.join(", ") + ")";
  };

  var invocation = function (node) {
    var args = node.args().map(expression);
    if (node.expression() instanceof AST.Refinement) {
      var object = node.expression().expression();
      var key = node.expression().key();
      return withStackArgs(args,
        "js_call_method(env, " + expression(object) + ", " +
        expression(key) + ", " + args.length + ")"
      );
    } else {
      return withStackArgs(args,
        "js_call_function(env, " + expression(node.expression()) +
        ", env->global, " + args.length + ")"
      );
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
          "string_from_cstring(" + quotes(node.leftExpr().identifier()) + "), " +
          expression(node.rightExpr()) +
        ")";
      } else if (node.leftExpr() instanceof AST.Refinement) {
        return "js_set_property(env, " + expression(node.leftExpr().expression()) + ", " +
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
    return operatorFunctions[node.operator()] + "(env, " +
      expression(node.leftExpr()) + ", " + expression(node.rightExpr())  + ")";
  };

  var unaryOp = function (node) {
    switch (node.operator()) {
      case "new":
        return newExpression(node.expression());

      case "typeof":
        return "js_typeof(" + expression(node.expression()) + ")";

      case "void":
        return "(" + expression(node.expression()) + ", js_new_undefined())";

      case "!":
        return "js_new_boolean(! js_to_boolean(" + expression(node.expression()) + ").as.boolean)";

      case "+":
        return "js_new_number(js_to_number(env, " + expression(node.expression()) + ").as.number)";

      case "-":
        return "js_new_number(-1 * js_to_number(env, " + expression(node.expression()) + ").as.number)";

      default:
        throw "Unsupported operator: " + node.operator();
    }
  };

  var newExpression = function (node) {
    var fun;
    var args;

    if (node instanceof AST.Invocation) {
      fun = node.expression();
      args = node.args().map(expression);
    } else {
      fun = node;
      args = [];
    }
    return withStackArgs(args,
      "js_invoke_constructor(env, " + expression(fun) + "," + args.length + ")"
    );
  };

  var addTemplate = function (program) {
    return '' +
      '#include <stdio.h>\n' +
      '#include "src/js.c"\n' +
      functions.join("\n") + "\n" +
      'int main(int argc, char** argv) {\n' +
      '  JSEnv* env = malloc(sizeof(JSEnv));\n' +
      '  env->call_stack_count = 0;\n' +
      '  env->exceptions_count = 0;\n' +
      '  env->global = js_new_bare_object();\n' +
      '  js_create_native_objects(env);\n' +
      '  js_create_argv(env, argc, argv);\n' +
      '  JSObject* binding = NULL;\n' +
      '  ' + program + ';\n' +
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

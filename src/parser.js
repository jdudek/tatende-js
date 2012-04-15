// A parser is a function that takes input (a string) and returns a list of
// pairs: (parsing result, rest of input). Pairs are represented as two-element
// arrays.

// A successful parse is non-empty list. More than one result means more than
// one possible parse result.

// The simplest parsers accept single characters, but we'll combine them using
// combinators like sequence() or choice(), finally leading to program() parser
// which returns abstract syntax tree (AST) for whole program.

// TODO describe
var ret = function (v) {
  return function (input) {
    return [[v, input]];
  };
};

var bind = function (p, f) {
  return function (input) {
    var results = p(input);
    var newResults = [];
    for (var i = 0; i < results.length; i++) {
      newResults = newResults.concat(f(results[i][0])(results[i][1]));
    }
    return newResults;
  };
};

// Two basic building blocks for parsers are sequence() and choice().

// sequence() accepts a list of parsers and creates new parser which will run
// them consecutively. The results from each parser are passed
// to "decorator" which builds a node of AST.

// decorator functions will not necesseraly use results from all parsers
// in the sequence. We will add suffix _ to names of such parameters.
// Later we'll see many examples of this convention.
var sequence = function (parsers, decorator) {
  var step = function (parsers, results) {
    if (parsers.length > 0) {
      return bind(parsers[0], function (r) {
        return step(parsers.slice(1), results.concat([r]));
      });
    } else {
      return ret(decorator.apply(this, results));
    }
  };
  return function (input) {
    return step(parsers, [])(input);
  };
};

// decorate() is a special case of sequence(), but with only one parser given.
// This saves us from typing [] in such cases.
var decorate = function (parser, decorator) {
  return sequence([parser], decorator);
};

// choice() will try running each of given parsers. For performance reasons
// it will return first successful result. This has two consequences:
// 1) for ambigous results, we get only first one (not really an issue)
// 2) parsers should not accept prefixes of input for next parsers given to
// choice(). For example, choice([string("x"), string("xy")]) will return "x"
// and leave "y" as not parsed input. It can be fixed by using
// choice([string("xy"), string("x")]) instead.
var choice = function (parsers) {
  return function (input) {
    var result;
    for (var i = 0; i < parsers.length; i++) {
      result = parsers[i](input);
      if (result.length > 0) {
        return result;
      };
    }
    return [];
  };
};

// Same as choice(), but tries every parser, even if one of them accepts.
// Returns all successful results (i.e. concatenates results lists).
// Please note it may take exponential time.
var everyChoice = function (parsers) {
  return function (input) {
    return parsers.reduce(function (results, parser) {
      return results.concat(parser(input));
    }, []);
  };
};

// many1() accepts many (at least one) occurences of input acceptable by given
// parser.
var many1 = function (parser) {
  return bind(parser, function (r) {
    return bind(many(parser), function (rs) {
      return ret([r].concat(rs));
    });
  });
};

// Same as many1(), but allows no occurences.
var many = function (parser) {
  return choice([ many1(parser), ret([]) ]);
};

// sepBy1 accepts many (at least one) occurences of input acceptable by given
// parser, separated by input parsed by separator.
// For example: sepBy1(symbol(","), number) will accept "12,34,5".
var sepBy1 = function (separator, parser) {
  return sequence([
    parser, many(
      sequence([separator, parser], function (s_, x) { return x; })
    )],
    function (x, xs) { return [x].concat(xs); }
  );
};

// Same as sepBy1, but allows no occurences.
var sepBy = function (separator, parser) {
  return choice([ sepBy1(separator, parser), ret([]) ]);
};

// Now we'll define combinators needed to create expressions parser.

// chainl1() returns parser that accepts many (at least one) occurences of
// given parser, separated by op, creating parse tree for left-associative
// operators. For example, chainl1(number, plus) will parse 1+2+3 as (1+2)+3,
// given appropriate plus and number parsers.
var chainl1 = function(parser, op) {
  // rest(x) tries to parse remaining expression, which starts with operator
  // op. If found op, it parses next argument (y). Op is a special parser,
  // which returns a two-argument function. We apply this function to x and y.
  // The result is parsed expression: x op y.
  // Then we apply rest() again with this result, trying to find next part of
  // the expression. (e.g. x op y op z).
  // If next term is not found, we just return x.
  var rest = function (x) {
    return choice([
      bind(op, function (f) {
        return bind(parser, function (y) {
          return rest(f(x, y));
        });
      }),
      ret(x)
    ]);
  };

  // Parse first part of the expression and try to parse rest.
  return bind(parser, rest);
};

// prefix() allows input accepted by parser to be preceded by input accepted
// by op, multiple times.
// Similar to chainl1, the result from op should be a function (unary).
// For example, prefix(bool, bang) will parse !true and !!true.
var prefixOp = function (parser, op) {
  return choice([sequence([op, parser], function (f, x) {
    return f(x);
  }), parser]);
};

// suffix() allows input accepted by parser to be followed by input accepted
// by op, multiple times.
var suffixOp = function (parser, op) {
  var rest = function (x) {
    return choice([
      bind(op, function (f) {
        return rest(f(x));
      }),
      ret(x)
    ]);
  };

  return bind(parser, rest);
};

// These combinators create new parser that skips leading or trailing input
// accepted by toSkip and returns result from parser.

var skipLeading = function (toSkip, parser) {
  return sequence([toSkip, parser], function (skipped_, parsed) {
    return parsed;
  });
};

var skipTrailing = function (toSkip, parser) {
  return sequence([parser, toSkip], function (parsed, skipped_) {
    return parsed;
  });
};

// This combinator accepts only if suffix parser fails.
var notFollowedBy = function (suffix, parser) {
  return bind(parser, function (result) {
    return function (input) {
      var hasSuffix = suffix(input).length > 0;
      if (hasSuffix) {
        return [];
      } else {
        return [[result, input]];
      }
    };
  });
};

// debug() is a combinator that wraps a parser and prints given input every
// time wrapped parser is called.
var debug = function(parser) {
  return function(input) {
    console.log(input.toString());
    return parser(input);
  };
};

// Now we're finished with combinators. We'll define real parsers.

// The simplest useful parser is character(c). It accepts only if first input
// character equals c. As all parsers, it returns a list of pairs:
// (result, remaining input).
// The result is just the parsed character.
var character = function (expected) {
  return function (input) {
    var actual = input.charAt(0);
    if (actual === expected) {
      input = input.slice(1);
      return [[actual, input]];
    } else {
      return [];
    }
  };
};

// This parser accepts any char and returns it.
var anyChar = function (input) {
  if (input.length > 0) {
    return [[input.charAt(0), input.slice(1)]];
  } else {
    return [];
  }
};

// This parser accepts any char from given list of allowed chars.
var anyCharOf = function (allowed) {
  return function (input) {
    if (allowed.indexOf(input.charAt(0)) !== -1) {
      return [[input.charAt(0), input.slice(1)]];
    } else {
      return [];
    }
  };
};

// This parser accepts any char other than those from given list.
var otherThanChars = function (disallowed) {
  return function (input) {
    if (disallowed.indexOf(input.charAt(0)) === -1) {
      return [[input.charAt(0), input.slice(1)]];
    } else {
      return [];
    }
  };
};

var otherThanChar = function (disallowedChar) {
  return otherThanChars([disallowedChar]);
};

// For given string, returns a parser that will accept and return that string.
var string = function (str) {
  var parsers = str.split("").map(character);
  var join = function () { return Array.prototype.join.call(arguments, ""); };
  return sequence(parsers, join);
};

// Below are some simple parsers for single characters.

var letter = choice(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").
  map(character));

var digit = choice(
  "0123456789".split("").
  map(character));

var semicolon = character(";");

var whiteSpace = choice([character(" "), character("\t"), character("\n")]);

// And parsers for comments.

var delimitedComment = sequence(
  [
    string("/*"),
    many(choice([
      otherThanChar("*"),
      notFollowedBy(character("/"), character("*"))
    ])),
    string("*/")
  ],
  function () { return "comment"; }
);

var lineComment = sequence(
  [string("//"), many(otherThanChar("\n")), character("\n")],
  function () { return "comment"; }
);

var whiteSpaceOrComments = many(choice(
  [whiteSpace, delimitedComment, lineComment]
));

// lexeme() creates a parser that will accept the same input as given parser,
// but will also skip any trailing whitespace and comments.
var lexeme = function (parser) {
  return skipTrailing(whiteSpaceOrComments, parser);
};

// From now on, every parser will be a lexeme parser or use lexeme parser at
// its end. In other words, every parser defined below will accept and skip
// trailing whitespace and comments.

// An identifier may contain letters, digits, $ and _ characters,
// but cannot start with a digit.
var identifier = sequence(
  // TODO reject keywords
  [
    choice([letter, character("_"), character("$")]),
    many(choice([letter, digit, character("_"), character("$")]))
  ],
  function (x, xs) { return x + xs.join(""); }
);
identifier = lexeme(identifier);

var integer = decorate(
  many1(digit),
  function (ds) { return parseInt(ds.join(""), 10); }
);
integer = lexeme(integer);

var keyword = function (s) {
  return lexeme(notFollowedBy(letter, string(s)));
};

// We need to check for special cases: some operators are prefixes of other
// operators.
var operator = function (s) {
  var p;

  if (s === "==" || s === "!=") {
    p = notFollowedBy(character("="), string(s));
  } else if (s === "+") {
    p = notFollowedBy(anyCharOf(["+", "="]), string(s));
  } else if (s === "-") {
    p = notFollowedBy(anyCharOf(["-", "="]), string(s));
  } else if (s === "!") {
    p = notFollowedBy(character("="), string(s));
  } else {
    p = string(s);
  }
  return lexeme(p);
};

var symbol = function (s) {
  return lexeme(string(s));
};

// between() combines three parsers, but returns only results from "inside"
// parser.
var between = function (before, after, inside) {
  return sequence(
    [before, inside, after],
    function (b_, i, a_) { return i; }
  );
};

// Given existing parser, create a new one for input wrapped in parentheses.
var parens = function (parser) {
  return between(symbol("("), symbol(")"), parser);
};

// Same as parens, but with curly braces: { and }.
var braces = function (parser) {
  return between(symbol("{"), symbol("}"), parser);
};

// Same as parens, but with square brackets: [ and ].
var squares = function (parser) {
  return between(symbol("["), symbol("]"), parser);
};

// Now we start defining parsers that build AST.

var AST = require("ast");

// TODO support float numbers
var numberLiteral = decorate(integer, function (i) {
  return AST.NumberLiteral(i);
});

// This parser is wrapped in a function, executed immediately, because we want
// to define locally some simpler parsers, not visible outside.

var quotedString = function () {
  var escapeSequence = choice([
    decorate(string('\\\\'), function () { return '\\'; }),
    decorate(string('\\\''), function () { return '\''; }),
    decorate(string('\\\"'), function () { return '\"'; }),
    decorate(string('\\n'), function () { return '\n'; }),
    decorate(string('\\t'), function () { return '\t'; })
  ]);

  var contents = function (limiter) {
    return decorate(
      many(choice([escapeSequence, otherThanChars([limiter, '\\', '\n'])])),
      function (xs) { return xs.join(""); }
    );
  };

  var inSingleQuotes = between(character("'"), character("'"), contents("'"));
  var inDoubleQuotes = between(character('"'), character('"'), contents('"'));

  return lexeme(choice([inSingleQuotes, inDoubleQuotes]));
}();

var stringLiteral = decorate(quotedString, function (string) {
  return AST.StringLiteral(string);
});

var booleanLiteral = function () {
  var trueLiteral = decorate(keyword("true"), function () {
    return AST.BooleanLiteral(true);
  });
  var falseLiteral = decorate(keyword("false"), function () {
    return AST.BooleanLiteral(false);
  });
  return choice([trueLiteral, falseLiteral]);
}();

// Many parsers need to be defined recursively. For example, an object literal
// will contain expression, so we need to use expr parser. However, expr cannot
// be defined yet, as it will need objectLiteral parser.

// That's why we wrap such recursive parsers in functions.

var objectLiteral = function (input) {
  var pair = sequence(
    [choice([identifier, quotedString]), symbol(":"), expr],
    function (id, s_, expr) { return [id, expr]; }
  );

  var p = decorate(
    braces(sepBy(symbol(","), pair)),
    // Our decorator function does not alter arguments at all, so we can pass
    // AST node constructor directly to decorate
    AST.ObjectLiteral
  );

  return p(input);
};

var arrayLiteral = function (input) {
  var p = decorate(
    squares(sepBy(symbol(","), expr)),
    AST.ArrayLiteral
  );

  return p(input);
};

var undefinedLiteral = decorate(keyword("undefined"), AST.UndefinedLiteral);
var nullLiteral = decorate(keyword("null"), AST.NullLiteral);
var thisVariable = decorate(keyword("this"), AST.ThisVariable);

var variable = decorate(identifier, AST.Variable);

var functionLiteral = function (input) {
  var args = parens(sepBy(symbol(","), identifier));
  var body = braces(many(statement));

  var p = sequence(
    [keyword("function"), args, body],
    function (k_, args, statements) { return AST.FunctionLiteral(args, statements); }
  );

  return p(input);
};

var invocation = function (input) {
  var p = decorate(parens(sepBy(symbol(","), expr)), function (args) {
    return function (e) {
      return AST.Invocation(e, args);
    };
  });

  return p(input);
};

var refinement = function (input) {
  var dotStyle = sequence([operator("."), identifier], function (d_, key) {
    return function (e) {
      return AST.Refinement(e, AST.StringLiteral(key));
    };
  });
  var squareStyle = decorate(squares(expr), function (keyExpr) {
    return function (e) {
      return AST.Refinement(e, keyExpr);
    };
  });

  return choice([dotStyle, squareStyle])(input);
};

var preDecrement = decorate(operator("--"), function () {
  return AST.PreDecrement;
});
var preIncrement = decorate(operator("++"), function () {
  return AST.PreIncrement;
});
var postDecrement = decorate(operator("--"), function () {
  return AST.PostDecrement;
});
var postIncrement = decorate(operator("++"), function () {
  return AST.PostIncrement;
});

// This is the most complex parser.
var expr = function (input) {
  var simple = choice([
    numberLiteral,
    stringLiteral,
    booleanLiteral,
    objectLiteral,
    arrayLiteral,
    functionLiteral,
    undefinedLiteral,
    nullLiteral,
    thisVariable,
    variable,
    parens(exprAllowingCommas)
  ]);

  // This is special use of decorate(): instead of returning AST node, we
  // return a function. chainl1 expects such functions and will apply them
  // to parsed arguments.
  // In final result there won't by any functions, only {binaryOp} nodes.
  var binaryOp = function (op) {
    return decorate(op, function (op) {
      return function (x, y) {
        return AST.BinaryOp(op, x, y);
      };
    });
  };

  // Similar to binaryOp, but creates unary functions.
  var unaryOp = function (op) {
    return decorate(op, function (op) {
      return function (x) {
        return AST.UnaryOp(op, x);
      };
    });
  };

  // Suffix operators have highest priority. They can be denoted as () and [].
  simple = suffixOp(simple, choice([
    invocation, refinement, postDecrement, postIncrement
  ]));

  // Prefix operators have precedence over all binary operators.
  simple = prefixOp(simple, choice([
    unaryOp(operator("+")), unaryOp(operator("-")), unaryOp(operator("!")),
    unaryOp(keyword("new")), unaryOp(keyword("delete")), unaryOp(keyword("typeof")),
    preDecrement, preIncrement
  ]));

  // Below we define binary operators in their order of precedence.
  // All of them are left-associative.
  var complex = [
    choice(["*", "/", "%"].map(operator).map(binaryOp)),
    choice(["+", "-"].map(operator).map(binaryOp)),
    choice([">=", "<=", ">", "<"].map(operator).map(binaryOp)),
    choice(["instanceof"].map(keyword).map(binaryOp)),
    choice(["===", "!==", "==", "!="].map(operator).map(binaryOp)),
    choice(["&"].map(operator).map(binaryOp)),
    choice(["^"].map(operator).map(binaryOp)),
    choice(["|"].map(operator).map(binaryOp)),
    choice(["&&"].map(operator).map(binaryOp)),
    choice(["||"].map(operator).map(binaryOp)),
    choice(["=", "*=", "/=", "%=", "+=", "-=", "<<=", ">>=", ">>>=", "&=",
      "^=", "|="].map(operator).map(binaryOp))
  ].reduce(chainl1, simple);

  return complex(input);
};

// A comma expression consists of expressions separated by commas.
// However, we don't allow comma expressions in same places, like object
// literals, unless they're wrapped in parentheses.
var exprAllowingCommas = decorate(
  sepBy1(symbol(","), expr),
  function (expressions) {
    if (expressions.length == 1) {
      return expressions[0];
    } else {
      return AST.Comma(expressions);
    }
  }
);

var varStatement = function (input) {
  var declaration = choice([
    sequence([identifier, operator("="), expr], function (id, op, expr) {
      return AST.VarWithValueDeclaration(id, expr);
    }),
    decorate(identifier, AST.VarDeclaration)
  ]);

  var p = sequence(
    [keyword("var"), sepBy1(symbol(","), declaration)],
    function (k_, decls) {
      return AST.VarStatement(decls);
    }
  );

  return p(input);
};

var returnStatement = sequence(
  [keyword("return"), expr],
  function (k_, expr) {
    return AST.ReturnStatement(expr);
  }
);

var ifStatement = function (input) {
  // if allows one statement without braces or mulitple statements enclosed
  // in braces. In case of one statement we convert it to one-element array.
  var block = choice([
    braces(many(statement)),
    decorate(statement, function (s) { return [s]; })
  ]);

  var ifStatementWithoutElse = sequence(
    [keyword("if"), parens(expr), block],
    function (k_, expr, statements) {
      return AST.IfStatement(expr, statements, []);
    }
  );

  var ifStatementWithElse = sequence(
    [keyword("if"), parens(expr), block, keyword("else"), block],
    function (k_, expr, statements1, k2_, statements2) {
      return AST.IfStatement(expr, statements1, statements2);
    }
  );

  return choice([ifStatementWithElse, ifStatementWithoutElse])(input);
};

// In try statements we can omit either catch or finally, but not both.
// catch is always followed by an identifier in parentheses.
var tryStatement = function (input) {
  var block = braces(many(statement));
  var tryFinally = sequence([
      keyword("try"), block,
      keyword("finally"), block
    ],
    function (try_, tryBlock, finally_, finallyBlock) {
      return AST.TryStatement(tryBlock, null, [], finallyBlock);
    }
  );
  var tryCatch = sequence([
      keyword("try"), block,
      keyword("catch"), parens(identifier), block
    ],
    function (try_, tryBlock, catch_, id, catchBlock) {
      return AST.TryStatement(tryBlock, id, catchBlock, []);
    }
  );
  var tryCatchFinally = sequence([
      keyword("try"), block,
      keyword("catch"), parens(identifier), block,
      keyword("finally"), block
    ],
    function (try_, tryBlock, catch_, id, catchBlock, finally_, finallyBlock) {
      return AST.TryStatement(tryBlock, id, catchBlock, finallyBlock);
    }
  );
  var p = choice([tryFinally, tryCatchFinally, tryCatch]);
  return p(input);
};

var whileStatement = function (input) {
  var p = sequence(
    [keyword("while"), parens(expr), braces(many(statement))],
    function (k_, condition, body) {
      return AST.WhileStatement(condition, body);
    }
  );

  return p(input);
};

var doWhileStatement = function (input) {
  var p = sequence(
    [keyword("do"), braces(many(statement)), keyword("while"), parens(expr)],
    function (k_, body, k2_, condition) {
      return AST.DoWhileStatement(condition, body);
    }
  );

  return p(input);
};

// for loop has the following form: for (initial; condition; finalize) { body }
// When condition is omitted, it's assumed to be "true" expression.
var forStatement = function (input) {
  var p = sequence(
    [
      keyword("for"),
      parens(sequence(
        [
          choice([varStatement, exprStatement, emptyStatement]),
          semicolon,
          choice([expr, ret({ booleanLiteral: true })]),
          semicolon,
          choice([exprStatement, emptyStatement])
        ],
        function (initial, s1_, condition, s2_, finalize) {
          return {
            initial: initial, condition: condition, finalize: finalize
          };
        }
      )),
      braces(many(statement))
    ],
    function (k_, inParens, body) {
      return AST.ForStatement(
        inParens.initial, inParens.condition, inParens.finalize, body);
    }
  );

  return p(input);
};

// switch statement has the following form: switch (expression) { clauses }
// clauses start with either "case expression:" or "default:" followed by any
// number of statements.
var switchStatement = function (input) {
  var caseClause = sequence(
    [keyword("case"), expr, symbol(":"), many(statement)],
    function (k_, e, s_, ss) {
      return AST.CaseClause(e, ss);
    }
  );

  var defaultClause = sequence(
    [keyword("default"), symbol(":"), many(statement)],
    function (k_, s_, ss) {
      return AST.DefaultClause(ss);
    }
  );

  var clause = choice([defaultClause, caseClause]);

  var p = sequence(
    [keyword("switch"), parens(expr), braces(many(clause))],
    function (k_, e, cs) {
      return AST.SwitchStatement(e, cs);
    }
  );

  return p(input);
};

throwStatement = sequence(
  [keyword("throw"), expr],
  function (t_, expr) {
    return AST.ThrowStatement(expr);
  }
);

exprStatement = decorate(exprAllowingCommas, function (e) {
  return AST.ExpressionStatement(e);
});

var emptyStatement = ret(null);

var semicolon = lexeme(character(";"));

var statement = choice([
    skipTrailing(semicolon, varStatement),
    skipTrailing(semicolon, returnStatement),
    skipTrailing(semicolon, throwStatement),
    skipTrailing(semicolon, exprStatement),
    skipTrailing(semicolon, doWhileStatement),

    // if and try statements, unlike others, are not followed by a semicolon.
    ifStatement,
    tryStatement,
    whileStatement,
    forStatement,
    switchStatement,

    // But we want to allow programs with unnecessary semicolons, so we add
    // "empty" statement that parses to null.
    skipTrailing(semicolon, emptyStatement)
]);

// A program consists of many statements.
var program = many1(statement);

// We also skip any comments or whitespace at the beginning, because our lexeme
// parsers take care only of trailing whitespace.
program = skipLeading(whiteSpaceOrComments, program);

// Only match complete parses.
program = notFollowedBy(anyChar, program);

// The runner for parsers. By default uses "program" parser.
// It will apply parser to the input, reject any incomplete parses (i.e. those
// with any remaining input) and return first AST from the list.
// This is means that if there is more than one successful parse, all but first
// one are discarded.
exports.parse = function (input, parser) {
  parser = parser || program;
  var results = parser(input);
  var completeResults = results.filter(function (result) {
    var ast = result[0];
    var rest = result[1];
    return rest.toString().length === 0;
  });
  if (completeResults.length > 0) {
    return { success: completeResults[0][0] };
  } else {
    return { failure: results };
  }
};

// Here we export any parsers that we want to test individually.
exports.expr = expr;
exports.keyword = keyword;
exports.operator = operator;
exports.stringLiteral = stringLiteral;

// A parser is a function that takes input (a string) and returns a list of
// pairs: (parsing result, rest of input). Pairs are represented as two-element
// arrays.

// A successful parse is non-empty list. More than one result means more than
// one possible parse result.

// The simplest parsers accept single characters, but we'll combine them using
// combinators like sequence() or choice(), finally leading to program() parser
// which returns abstract syntax tree (AST) for whole program.

// TODO describe or remove
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
  }
  return function (input) {
    return step(parsers, [])(input);
  }
};

// decorate() is a special case of sequence(), but with only one parser given.
// This saves us from typing [] in such cases.
var decorate = function (parser, decorator) {
  return sequence([parser], decorator);
}

// choice() will try running each of given parsers. It'll return combined
// results from all of them (as list of alternatives).
var choice = function (parsers) {
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
}

// Same as sepBy1, but allows no occurences.
var sepBy = function (separator, parser) {
  return choice([ sepBy1(separator, parser), ret([]) ]);
};

// debug() is a combinator that wraps a parser and prints given input every
// time wrapped parser is called.
var debug = function(parser) {
  return function(input) {
    console.log(input.toString());
    return parser(input);
  }
}

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

var whiteSpace = many(character(" "));

// This is an identity function, which skips all arguments except first one.
// We'll use it when defining parsers with sequence() when only first result
// is needed.
var returnFirst = function (x) { return x; };

// lexeme() creates a parser that will accept the same input as given parser,
// but will also skip any trailing whitespace and comments.
var lexeme = function (parser) {
  // TODO skip comments
  return sequence([parser, whiteSpace], returnFirst);
};

// From now on, every parser will a be lexeme parser or use lexeme parser at
// its end. In other words, every parser defined below will accept and skip
// trailing whitespace and comments.

// An identifier starts with a letter, followed by letters, digits
// or underscores (_).
var identifier = sequence(
  [letter, many(choice([letter, digit, character("_")]))],
  function (x, xs) { return x + xs.join(""); }
);
identifier = lexeme(identifier);

var integer = decorate(
  many1(digit),
  function (ds) { return parseInt(ds.join("")); }
);
integer = lexeme(integer);

// TODO what about prefixes? e.g. fun/function?
var keyword = function (s) {
  return lexeme(string(s));
}

// TODO what about = and ==?
var operator = function (s) {
  return lexeme(string(s));
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

// TODO support float numbers
var numberLiteral = decorate(integer, function (i) {
  return { numberLiteral: i };
});

// This parser is wrapped in a function, executed immediately, because we want
// to define locally some simpler parsers, not visible outside.

var stringLiteral = function () {
  // TODO string literals should allow not only letters!
  // TODO escaping
  var contents = decorate(many(letter), function (xs) { return xs.join(""); })

  var inSingleQuotes = between(character("'"), character("'"), contents);
  var inDoubleQuotes = between(character('"'), character('"'), contents);

  return decorate(
    choice([inSingleQuotes, inDoubleQuotes]),
    function (string) { return { stringLiteral: string }; }
  );
}();

// Many parsers need to be defined recursively. For example, an object literal
// will contain expression, so we need to use expr parser. However, expr cannot
// be defined yet, as it will need objectLiteral parser.

// That's why we wrap such recursive parsers in functions.

var objectLiteral = function (input) {
  var pair = sequence(
    [identifier, symbol(":"), expr],
    function (id, s_, expr) { return [id, expr]; }
  );

  return decorate(
    braces(sepBy(symbol(","), pair)),
    function (pairs) { return { objectLiteral: pairs }; }
  )(input);
};

var arrayLiteral = function (input) {
  return decorate(
    squares(sepBy(symbol(","), expr)),
    function (exprs) { return { arrayLiteral: exprs }; }
  )(input);
};

var variable = decorate(identifier, function (i) {
  return { variable: i };
});

var func = function (input) {
  var args = parens(sepBy(symbol(","), identifier));
  var body = braces(many(statement));

  return sequence(
    [keyword("function"), args, body],
    function (k_, args, statements) { return { func: [args, statements] }; }
  )(input);
};

var expr = function (input) {
  return choice([
    numberLiteral,
    stringLiteral,
    objectLiteral,
    arrayLiteral,
    variable,
    func,
    parens(expr)
  ])(input);
};

var varStatementWithoutAssignment = sequence(
  [keyword("var"), identifier],
  function (k_, id) {
    return { varStatement: [id] };
  }
);

var varStatementWithAssignment = sequence(
  [keyword("var"), identifier, operator("="), expr],
  function (k_, id, op_, expr) {
    return { varStatement: [id, expr] };
  }
);

var varStatement = choice([varStatementWithAssignment, varStatementWithoutAssignment]);

var assignStatement = sequence(
  [expr, operator("="), expr],
  function (lexpr, op_, rexpr) {
    return { assignStatement: [lexpr, rexpr] };
  }
);

var returnStatement = sequence(
  [keyword("return"), expr],
  function (k_, expr) {
    return { returnStatement: expr };
  }
);

var ifStatementWithoutElse = function (input) {
  return sequence(
    [keyword("if"), parens(expr), braces(many(statement))],
    function (k_, expr, statements) {
      return { ifStatement: [expr, statements, []] };
    }
  )(input);
};

var ifStatementWithElse = function (input) {
  return sequence(
    [keyword("if"), parens(expr), braces(many(statement)),
      keyword("else"), braces(many(statement))],
    function (k_, expr, statements1, k2_, statements2) {
      return { ifStatement: [expr, statements1, statements2] };
    }
  )(input);
};

var ifStatement = choice([ifStatementWithElse, ifStatementWithoutElse]);

var tryStatement = function (input) {
  return sequence(
    [keyword("try"), braces(many(statement)),
      keyword("catch"), parens(identifier), braces(many(statement))],
    function (try_, tryStatements, catch_, id, catchStatements) {
      return { tryStatement: [tryStatements, id, catchStatements] };
    }
  )(input);
};

throwStatement = sequence(
  [keyword("throw"), expr],
  function (t_, expr) {
    return { throwStatement: expr };
  }
);

exprStatement = decorate(expr, function (e) {
  return { exprStatement: e };
});

var statement = choice([
    sequence([varStatement,    lexeme(semicolon)], returnFirst),
    sequence([assignStatement, lexeme(semicolon)], returnFirst),
    sequence([returnStatement, lexeme(semicolon)], returnFirst),
    sequence([throwStatement,  lexeme(semicolon)], returnFirst),
    sequence([exprStatement,   lexeme(semicolon)], returnFirst),

    // if and try statements, unlike others, are not followed by a semicolon.
    ifStatement,
    tryStatement,

    // But we want to allow programs with unnecessary semicolons, so we add
    // "empty" statement that parses to null.
    decorate(lexeme(semicolon), function () { return null; })
]);

// A program consists of many statements.
var program = many1(statement);

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
    return rest.toString().length == 0;
  });
  if (completeResults.length > 0) {
    return { success: completeResults[0][0] };
  } else {
    return { failure: results };
  }
};

// Here we export any parsers that we want to test individually.
exports.expr = expr;

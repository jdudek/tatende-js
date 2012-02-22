// A parser is a function that takes input (as Stream instance, defined below)
// and returns a list of pairs: (parsing result, rest of input).

// A successful parse is non-empty list.

// The simplest parsers accept single characters, but we'll combine them using
// combinators like sequence() or choice(), finally leading to program() parser
// which returns abstract syntax tree (AST) for given program.


// Stream is a wrapper for String objects, used as input to parsers.
var Stream = function (string, pos) {
  var pos = pos || 0;

  var peek = function () {
    return string.charAt(pos);
  };

  var consume = function () {
    return new Stream(string, pos + 1);
  };

  var toString = function () {
    return string.slice(pos);
  };

  return {
    peek: peek, consume: consume, toString: toString
  }
};

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

var compose = function (f, g) {
  return function (x) {
    return f(g(x));
  };
};

// Two basic building blocks for parsers are sequence() and choice().

// sequence() accepts a list of parsers and creates new parser which will run
// them consecutively. The results from each parser are passed
// to "decorator" which builds a node of AST.
var sequence = function () {
  var parsers = Array.prototype.slice.call(arguments, 0);
  var decorator = parsers.pop();

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

// choice() will try running each of given parsers. It'll return combined
// results from all of them (as list of alternatives).
var choice = function (parsers) {
  return function (input) {
    return parsers.reduce(function (results, parser) {
      return results.concat(parser(input));
    }, []);
  };
};

// many1() accepts many occurences of parsed input, but at least one.
var many1 = function (parser) {
  return bind(parser, function (r) {
    return bind(many(parser), function (rs) {
      return ret([r].concat(rs));
    });
  });
};

// many() accepts just many occurances of parsed input
var many = function (parser) {
  return choice([ many1(parser), ret([]) ]);
};

// A parser which always fails.
var zero = function (input) {
  return [];
}

// debug() is a combinator that wraps a parser and prints given input every
// time wrapped parser is called.
var debug = function(parser) {
  return function(input) {
    console.log(input.toString());
    return parser(input);
  }
}

// The simplest useful parser is character(c). It accepts only if first input
// character equals c. As all parsers, it returns a list of pairs:
// (result, remaining input).
// The result is just the parsed character.
var character = function (expected) {
  return function (input) {
    var actual = input.peek();
    if (actual === expected) {
      input = input.consume();
      return [[actual, input]];
    } else {
      return [];
    }
  };
};

var string = function (str) {
  var parsers = str.split("").map(character);
  var join = function () { return Array.prototype.join.call(arguments, ""); };
  return sequence.apply(this, parsers.concat([join]));
};

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
  return sequence(parser, whiteSpace, function (r) { return r; });
};

// And identifier starts with a letter, followed by letters, digits
// or underscores (_).
var identifier = sequence(
  letter, many(choice([letter, digit, character("_")])),
  function (x, xs) { return x + xs.join(""); }
);
identifier = lexeme(identifier);

// TODO support float numbers
var integer = sequence(
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

var numberLiteral = sequence(integer, function (i) {
  return { number: i };
});

var variable = sequence(identifier, function (i) {
  return { variable: i };
});

var expr = sequence(choice([numberLiteral, variable]), function (simple) {
  return { expression: simple };
});

// As a convention, when using sequence() we'll add suffix _ to parameters
// which are not used to build AST node.
var varStmt = sequence(
  keyword("var"), expr, operator("="), expr,
  function (k_, lexpr, o_, rexpr) {
    return { varStatement: [lexpr, rexpr] };
  }
);

// returnFirst means that whole parser will return what was returned
// from varStmt.
var statement = sequence(varStmt, lexeme(semicolon), returnFirst);

// A program is a sequence of statements.
var program = sequence(many(statement), returnFirst);

// The only function exported from this module.
exports.parse = function (input) {
  return program(new Stream(input));
}

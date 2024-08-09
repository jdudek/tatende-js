# Tatende.js

A toy compiler for a subset of JavaScript.

You can read [annotated source](http://jdudek.github.io/tatende-js/) (incomplete).

## Requirements

* Node.js

## Running tests

You'll need ECMAScript test suite which is available from Mercurial repository.

    $ hg clone http://hg.ecmascript.org/tests/test262/
    $ export ECMA_TESTS_PATH="`pwd`/test262/test/suite"
    $ make test

## FAQ

* Is it useful?

Not really.

* Does it work?

It's able to compile itself.

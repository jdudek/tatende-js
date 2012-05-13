set -x
./bin/compile test/parser_test.js "ast=src/ast.js,parser=src/parser.js,assert=src/assert.js" > program.c
gcc -m32 -O2 program.c
time ./a.out

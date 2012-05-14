set -x
export CFLAGS="-m32 -O2"

./bin/compile test/ast_test.js "ast=src/ast.js,assert=src/assert.js" | gcc -xc -
time ./a.out

./bin/compile test/parser_test.js "ast=src/ast.js,parser=src/parser.js,assert=src/assert.js" | gcc -xc -
time ./a.out

./bin/compile src/run.js "ast=src/ast.js,parser=src/parser.js,c_backend=src/c_backend.js,compiler=src/compiler.js" | gcc -m32 -O2 -xc -

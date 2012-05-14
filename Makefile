export NODE_PATH=src/

build:
	@node src/run.js src/run.js "ast=src/ast.js,parser=src/parser.js,c_backend=src/c_backend.js,compiler=src/compiler.js" | gcc -xc -o bin/compile -

test:
	@node test/parser_test.js
	@node test/assert_test.js
	@node test/ast_test.js
	@node test/c_backend_test.js
	@node test/ecma_tests.js
	@./test/self_test.sh

docs:
	docco src/parser.js src/ast.js src/c_backend.js

.PHONY: test ecma-tests docs

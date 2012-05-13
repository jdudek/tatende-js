test:
	@NODE_PATH=src/ node test/parser_test.js
	@NODE_PATH=src/ node test/assert_test.js
	@NODE_PATH=src/ node test/ast_test.js
	@NODE_PATH=src/ node test/c_backend_test.js
	@NODE_PATH=src/ node test/ecma_tests.js
	@./test/self_test.sh

docs:
	docco src/parser.js src/ast.js src/c_backend.js

.PHONY: test ecma-tests docs

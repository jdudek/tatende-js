test:
	@gcc test/dict_test.c && ./a.out
	@gcc test/list_test.c && ./a.out
	@NODE_PATH=src/ node test/parser_test.js
	@NODE_PATH=src/ node test/ast_test.js
	@NODE_PATH=src/ node test/c_backend_test.js

docs:
	docco src/parser.js src/ast.js src/c_backend.js

.PHONY: test docs

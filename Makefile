test:
	@NODE_PATH=src/ node test/parser_test.js

docs:
	docco src/parser.js

.PHONY: test docs

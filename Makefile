test:
	@NODE_PATH=src/ node test/parser.js

docs:
	docco src/parser.js

.PHONY: test docs

var AST = require("ast");
var assert = require("assert");

varStmt = AST.VarStatement("xyz", 123);
assert.ok(varStmt instanceof AST.VarStatement);
assert.deepEqual(varStmt, { varStatement: ["xyz", 123] });
assert.equal(varStmt.identifier(), "xyz");
assert.equal(varStmt.expression(), 123);

varStmt = new AST.VarStatement("xyz", 123);
assert.ok(varStmt instanceof AST.VarStatement);
assert.deepEqual(varStmt, { varStatement: ["xyz", 123] });
assert.equal(varStmt.identifier(), "xyz");
assert.equal(varStmt.expression(), 123);

returnStmt = AST.ReturnStatement("xyz");
assert.ok(returnStmt instanceof AST.ReturnStatement);
assert.deepEqual(returnStmt, { returnStatement: "xyz" });


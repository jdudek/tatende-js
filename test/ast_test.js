var AST = require("ast");
var assert = require("assert");

var returnStmt;

returnStmt = AST.ReturnStatement("xyz");
assert.ok(returnStmt instanceof AST.ReturnStatement);
assert.deepEqual(returnStmt, { returnStatement: "xyz" });
assert.equal(returnStmt.expression(), "xyz");

returnStmt = new AST.ReturnStatement("xyz");
assert.ok(returnStmt instanceof AST.ReturnStatement);
assert.deepEqual(returnStmt, { returnStatement: "xyz" });
assert.equal(returnStmt.expression(), "xyz");

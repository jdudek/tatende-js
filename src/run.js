var compiler = require("compiler");

if (typeof global.process !== "undefined") { // run only in Node
  console.log(compiler.compileFile(process.argv[2], process.argv[3]));
} else {
  console.log(compiler.compileFile(argv[1], argv[2]));
}

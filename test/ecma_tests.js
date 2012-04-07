if (typeof process.env.ECMA_TESTS_PATH === "undefined") {
  console.log("ECMA_TESTS_PATH undefined.");
  return;
}

var testFiles = [
  // 8.3 The Boolean type

  "/ch08/8.3/S8.3_A1_T1.js",
  "/ch08/8.3/S8.3_A1_T2.js",
  // "/ch08/8.3/S8.3_A2.1.js", @negative
  // "/ch08/8.3/S8.3_A2.2.js", @negative
  "/ch08/8.3/S8.3_A3.js",

  // 11.4.9 Logical NOT Operator ( ! )

  // "/ch11/11.4/11.4.9/S11.4.9_A1.js", // eval
  "/ch11/11.4/11.4.9/S11.4.9_A2.1_T1.js",
  // "/ch11/11.4/11.4.9/S11.4.9_A2.1_T2.js", // try {}
  // "/ch11/11.4/11.4.9/S11.4.9_A2.2_T1.js", // lacks semicolons
  // "/ch11/11.4/11.4.9/S11.4.9_A3_T1.js", // BUG: !new
  // "/ch11/11.4/11.4.9/S11.4.9_A3_T2.js", // float numbers
  // "/ch11/11.4/11.4.9/S11.4.9_A3_T3.js", // BUG
  // "/ch11/11.4/11.4.9/S11.4.9_A3_T4.js", // void operator
  // "/ch11/11.4/11.4.9/S11.4.9_A3_T5.js", // lacks semicolons

  // 11.13.1 Simple Assignment ( = )
  // "/ch11/11.13/11.13.1/S11.13.1_A1.js", // eval
  // "/ch11/11.13/11.13.1/S11.13.1_A2.1_T1.js", // float numbers
  "/ch11/11.13/11.13.1/S11.13.1_A2.1_T2.js",
  // "/ch11/11.13/11.13.1/S11.13.1_A2.1_T3.js", // @negative
  "/ch11/11.13/11.13.1/S11.13.1_A3.1.js",
  "/ch11/11.13/11.13.1/S11.13.1_A3.2.js",
  // "/ch11/11.13/11.13.1/S11.13.1_A4_T1.js", // multiple assignment
  "/ch11/11.13/11.13.1/S11.13.1_A4_T2.js",

  // 12.14 The try statements
  "/ch12/12.14/S12.14_A1.js",
  "/ch12/12.14/S12.14_A2.js",
  // "/ch12/12.14/S12.14_A3.js",
  // "/ch12/12.14/S12.14_A4.js",
  // "/ch12/12.14/S12.14_A5.js",
  // "/ch12/12.14/S12.14_A6.js",
  // "/ch12/12.14/S12.14_A7_T1.js",
  // "/ch12/12.14/S12.14_A7_T2.js",
  // "/ch12/12.14/S12.14_A7_T3.js",
  // "/ch12/12.14/S12.14_A8.js",
  // "/ch12/12.14/S12.14_A9_T1.js",
  // "/ch12/12.14/S12.14_A9_T2.js",
  // "/ch12/12.14/S12.14_A9_T3.js",
  // "/ch12/12.14/S12.14_A9_T4.js",
  // "/ch12/12.14/S12.14_A9_T5.js",
  // "/ch12/12.14/S12.14_A10_T1.js",
  // "/ch12/12.14/S12.14_A10_T2.js",
  // "/ch12/12.14/S12.14_A10_T3.js",
  // "/ch12/12.14/S12.14_A10_T4.js",
  // "/ch12/12.14/S12.14_A10_T5.js",
  // "/ch12/12.14/S12.14_A11_T1.js",
  // "/ch12/12.14/S12.14_A11_T2.js",
  // "/ch12/12.14/S12.14_A11_T3.js",
  // "/ch12/12.14/S12.14_A11_T4.js",
  // "/ch12/12.14/S12.14_A12_T1.js",
  // "/ch12/12.14/S12.14_A12_T2.js",
  // "/ch12/12.14/S12.14_A12_T3.js",
  // "/ch12/12.14/S12.14_A12_T4.js",
  // "/ch12/12.14/S12.14_A13_T1.js",
  // "/ch12/12.14/S12.14_A13_T2.js",
  // "/ch12/12.14/S12.14_A13_T3.js",
  // "/ch12/12.14/S12.14_A14.js",
  // "/ch12/12.14/S12.14_A15.js",
  // "/ch12/12.14/S12.14_A16_T1.js",
  // "/ch12/12.14/S12.14_A16_T10.js",
  // "/ch12/12.14/S12.14_A16_T11.js",
  // "/ch12/12.14/S12.14_A16_T12.js",
  // "/ch12/12.14/S12.14_A16_T13.js",
  // "/ch12/12.14/S12.14_A16_T14.js",
  // "/ch12/12.14/S12.14_A16_T15.js",
  // "/ch12/12.14/S12.14_A16_T2.js",
  // "/ch12/12.14/S12.14_A16_T3.js",
  // "/ch12/12.14/S12.14_A16_T4.js",
  // "/ch12/12.14/S12.14_A16_T5.js",
  // "/ch12/12.14/S12.14_A16_T6.js",
  // "/ch12/12.14/S12.14_A16_T7.js",
  // "/ch12/12.14/S12.14_A16_T8.js",
  // "/ch12/12.14/S12.14_A16_T9.js",
  // "/ch12/12.14/S12.14_A17.js",
  // "/ch12/12.14/S12.14_A18_T1.js",
  // "/ch12/12.14/S12.14_A18_T2.js",
  // "/ch12/12.14/S12.14_A18_T3.js",
  // "/ch12/12.14/S12.14_A18_T4.js",
  // "/ch12/12.14/S12.14_A18_T5.js",
  // "/ch12/12.14/S12.14_A18_T6.js",
  // "/ch12/12.14/S12.14_A18_T7.js",
  // "/ch12/12.14/S12.14_A19_T1.js",
  // "/ch12/12.14/S12.14_A19_T2.js
];

var header = "global['$ERROR'] = function (msg) { console.log(msg); };";

var assert = require("assert");
var fs = require("fs");
var childProcess = require("child_process");
var parser = require("parser");
var backend = require("c_backend");

var tests = [];

var runTests = function () {
  tests.reduceRight(function (tail, fn) {
    return function () {
      fn(function () {
        process.stdout.write(".");
        tail();
      });
    };
  }, function () {
    process.stdout.write("\n");
  })();
};

var testProgram = function (program) {
  return function (callback) {
    var ast = parser.parse(program).success;
    assert.ok(!! ast, "Program wasn't parsed succesfully")
    var runtime = parser.parse(fs.readFileSync(__dirname + "/../src/runtime.js", "utf8")).success;
    assert.ok(!! runtime)
    var headerAst = parser.parse(header).success;
    assert.ok(!! headerAst)
    var compiled = backend.compile(runtime.concat(headerAst.concat(ast)));
    fs.writeFileSync("program.c", compiled);
    childProcess.exec("gcc program.c && ./a.out", function (error, stdout, stderr) {
      assert.strictEqual(stderr, "");
      assert.ok(! error);
      callback();
    });
  };
};

testFiles.forEach(function (fileName) {
  tests.push(testProgram(fs.readFileSync(process.env.ECMA_TESTS_PATH + fileName, "utf8")));
});

runTests();

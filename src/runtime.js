global.Error = function (message) { this.message = message; };
Error.prototype.name = "Error";
Error.prototype.message = "";
Error.prototype.toString = function () {
  return this.name + ": " + this.message;
};

global.ReferenceError = function (message) { this.message = message; };
ReferenceError.prototype = new Error();
ReferenceError.prototype.name = "ReferenceError";

global.TypeError = function (message) { this.message = message; };
TypeError.prototype = new Error();
TypeError.prototype.name = "TypeError";

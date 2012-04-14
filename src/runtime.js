Array.prototype.forEach = function (callback) {
  var i = 0;
  while (i < this.length) {
    callback(this[i]);
    i = i + 1;
  }
};
Array.prototype.join = function (separator) {
  var toString = function (v) {
    if (typeof v === "undefined" || v === null) {
      return "";
    } else {
      return v.toString();
    }
  };
  var out = "";
  var i = 0;
  if (typeof separator == "undefined") {
    separator = ",";
  }
  while (i + 1 < this.length) {
    out = out + toString(this[i]);
    out = out + separator;
    i = i + 1;
  }
  if (i < this.length) {
    out = out + toString(this[i]);
  }
  return out;
};
Array.prototype.toString = function () {
  if (typeof this.join === "function") {
    return this.join(",");
  } else {
    return Object.prototype.toString.call(this);
  }
};
Array.prototype.slice = function (start, end) {
  if (typeof start === "undefined") {
    start = 0;
  }
  if (typeof end === "undefined") {
    end = this.length;
  }
  var arr = [];
  var i = 0;
  arr.length = end - start; // FIXME: array should autoupdate its length
  while (start + i < end) {
    arr[i] = this[start + i];
    i = i + 1;
  }
  return arr;
};

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

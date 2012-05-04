Array.prototype.concat = function () {
  var i = 0, j = 0, k, result = [];
  while (i < this.length) {
    result[i] = this[i];
    i++;
  }
  while (j < arguments.length) {
    k = 0;
    while (k < arguments[j].length) {
      result[i] = arguments[j][k];
      i++;
      k++;
    }
    j++;
  }
  result.length = i;  // FIXME
  return result;
};
Array.prototype.filter = function (callback) {
  var i = 0, j = 0, result = [];
  while (i < this.length) {
    if (callback(this[i])) {
      result[j] = this[i];
      j++;
    }
    i++;
  }
  result.length = j;  // FIXME
  return result;
};
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
Array.prototype.map = function (callback) {
  var arr = [], i = 0, length = this.length;
  while (i < length) {
    arr[i] = callback(this[i]);
    i++;
  }
  arr.length = length; // FIXME
  return arr;
};
Array.prototype.toString = function () {
  if (typeof this.join === "function") {
    return this.join(",");
  } else {
    return Object.prototype.toString.call(this);
  }
};
Array.prototype.indexOf = function (value) {
  var i = 0;
  while (i < this.length) {
    if (value === this[i]) {
      return i;
    }
    i = i + 1;
  }
  return 1 - 2; // FIXME: lack of unary minus
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

String.prototype.split = function (separator, limit) {
  // FIXME: only empty separators are supported
  // FIXME: limit is not supported

  if (typeof separator !== "undefined" && separator.length > 0) {
    throw "String.prototype.split not yet implemented for non-empty separators";
  }

  var arr = [];
  var i = 0;
  while (i < this.length) {
    arr[i] = this.charAt(i);
    i++;
  }
  arr.length = this.length;

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

global.parseInt = function (string, radix) {
  var parseDigit = function (digit) {
    if (digit == "0") return 0;
    if (digit == "1") return 1;
    if (digit == "2") return 2;
    if (digit == "3") return 3;
    if (digit == "4") return 4;
    if (digit == "5") return 5;
    if (digit == "6") return 6;
    if (digit == "7") return 7;
    if (digit == "8") return 8;
    if (digit == "9") return 9;
  };
  radix = 10; // FIXME
  var i = 0, result = 0;
  while (i < string.length) {
    result = result * radix + parseDigit(string.charAt(i));
    i++;
  }
  return result;
};

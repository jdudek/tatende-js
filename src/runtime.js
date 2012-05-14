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
  return result;
};
Array.prototype.forEach = function (callback) {
  var i = 0;
  while (i < this.length) {
    callback(this[i], i);
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
  return -1;
};
Array.prototype.push = function (value) {
  this[this.length] = value;
};
Array.prototype.reduce = function (callback, initial) {
  var i = 0;
  if (typeof initial === "undefined") {
    if (this.length < 1) {
      throw new TypeError("Reduce of empty array with no initial value");
    }
    initial = this[0];
    i = 1;
  }
  var result = initial;
  while (i < this.length) {
    result = callback(result, this[i]);
    i++;
  }
  return result;
};
Array.prototype.reduceRight = function () {
  return Array.prototype.reduce.apply(this.slice(0).reverse(), arguments);
};
Array.prototype.reverse = function () {
  var tmp, len = this.length, i = 0;
  while (2 * i < len) {
    tmp = this[len - i - 1];
    this[len - i - 1] = this[i];
    this[i] = tmp;
    i++;
  }
  return this;
};
Array.prototype.some = function (callback) {
  var i = 0;
  while (i < this.length) {
    if (callback(this[i])) {
      return true;
    }
    i++;
  }
  return false;
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
  while (start + i < end) {
    arr[i] = this[start + i];
    i = i + 1;
  }
  return arr;
};

Object.keys = function (obj) {
  var key;
  var result = [];
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      result.push(key);
    }
  }
  return result;
};

String.prototype.replace = function (pattern, replacement) {
  return this.split(pattern).join(replacement);
};
String.prototype.split = function (separator, limit) {
  // FIXME: limit is not supported

  var results = [];
  var separatorLength = separator.length;
  var i = 0, j = 0, from = 0;

  if (separatorLength == 0) {
    while (i < this.length) {
      results.push(this.charAt(i));
      i++;
    }
  } else {
    while (i < this.length) {
      j = 0;
      while (this.charAt(i+j) == separator.charAt(j) && j < separatorLength) {
        j++;
      }
      if (j == separatorLength) {
        results.push(this.substring(from, i));
        i += j;
        from = i;
      } else {
        i++;
      }
    }
    results.push(this.substring(from, this.length));
  }
  return results;
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

global.require = function (name) {
  available = global.require.available;
  loaded = global.require.loaded;

  if (loaded[name]) {
    return loaded[name];
  } else if (available[name]) {
    loaded[name] = {};
    available[name](loaded[name]);
    return loaded[name];
  } else {
    throw "Module " + name + " not found.";
  }
};
global.require.available = {};
global.require.loaded = {};

global.require.loaded.fs = {
  readFileSync: global.readFileSync,
  writeFileSync: global.writeFileSync
};
global.require.loaded.child_process = {
  exec: function (command, callback) {
    var status = global.system("(" + command + ") > stdout.txt 2> stderr.txt");
    var error = null;
    if (status !== 0) {
      error = { status: status };
    }
    var stdout = global.readFileSync("stdout.txt");
    var stderr = global.readFileSync("stderr.txt");
    callback(error, stdout, stderr);
  }
};

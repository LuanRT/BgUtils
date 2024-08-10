// Collection of utility functions extracted and adapted from base.js

var Wca = [];
var Te = null;

export class ej {
  constructor() {
    var a = this;
    this.promise = new Promise(function (b, c) {
      a.resolve = b;
      a.reject = c;
    });
  }
}

export const baa = function (a) {
  var b = 0;
  return function () {
    return b < a.length ? {
      done: false,
      value: a[b++]
    } : {
      done: true
    };
  };
};

export const w = function (a) {
  var b = typeof Symbol !== "undefined" && Symbol.iterator && a[Symbol.iterator];
  if (b)
    return b.call(a);
  if (typeof a.length === "number")
    return {
      next: baa(a)
    };
  throw Error(String(a) + " is not an iterable or ArrayLike");
};

const Vca = function () {
  if (!Te) {
    Te = {};
    for (var a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(""), b = ["+/=", "+/", "-_=", "-_.", "-_"], c = 0; c < 5; c++) {
      var d = a.concat(b[c].split(""));
      Wca[c] = d;
      for (var e = 0; e < d.length; e++) {
        var f = d[e];
        Te[f] === void 0 && (Te[f] = e)
      }
    }
  }
}

export const Qe = function (a, b) {
  b === void 0 && (b = 0);
  Vca();
  b = Wca[b];
  for (var c = Array(Math.floor(a.length / 3)), d = b[64] || "", e = 0, f = 0; e < a.length - 2; e += 3) {
    var h = a[e]
      , l = a[e + 1]
      , m = a[e + 2]
      , n = b[h >> 2];
    h = b[(h & 3) << 4 | l >> 4];
    l = b[(l & 15) << 2 | m >> 6];
    m = b[m & 63];
    c[f++] = "" + n + h + l + m
  }
  n = 0;
  m = d;
  switch (a.length - e) {
    case 2:
      n = a[e + 1],
        m = b[(n & 15) << 2] || d;
    case 1:
      a = a[e],
        c[f] = "" + b[a >> 2] + b[(a & 3) << 4 | n >> 4] + m + d
  }
  return c.join("")
}

// .......

var Ve = {};
var fda = typeof Uint8Array !== "undefined"
  , $ca = typeof btoa === "function"
  , dda = /[-_.]/g
  , bda = {
    "-": "+",
    _: "/",
    ".": "="
  };

var Ue = function (a) {
  return fda && a != null && a instanceof Uint8Array
}

var gda = function (a) {
  if (a !== Ve)
    throw Error("illegal external caller");
}

var cda = function (a) {
  return bda[a] || ""
}

var eda = function (a) {
  if (!$ca)
    return Se(a);
  dda.test(a) && (a = a.replace(dda, cda));
  a = atob(a);
  for (var b = new Uint8Array(a.length), c = 0; c < a.length; c++)
    b[c] = a.charCodeAt(c);
  return b
}

var Ye = function (a) {
  gda(Ve);
  var b = a.j;
  b = b == null || Ue(b) ? b : typeof b === "string" ? eda(b) : null;
  return b == null ? b : a.j = b
}

export const Ze = function (a) {
  return new Uint8Array(Ye(a) || 0)
}

var Zi = function () {
  var a, b, c;
  return (c = (a = globalThis.performance) == null ? void 0 : (b = a.now) == null ? void 0 : b.call(a)) != null ? c : Date.now()
}

export const bj = function (a, b, c) {
  var d = Zi();
  b = b();
  return b
}

export class PoTokenError {
  constructor(code, message) {
    this.code = code;
    this.message = message;
  }
}

// ......

var Ve = {};
var fda = typeof Uint8Array !== "undefined"
  , $ca = typeof btoa === "function"
  , dda = /[-_.]/g
  , bda = {
    "-": "+",
    _: "/",
    ".": "="
  };

var Ue = function (a) {
  return fda && a != null && a instanceof Uint8Array
}

var gda = function (a) {
  if (a !== Ve)
    throw Error("illegal external caller");
}

var cda = function (a) {
  return bda[a] || ""
}

var eda = function (a) {
  if (!$ca)
    return Se(a);
  dda.test(a) && (a = a.replace(dda, cda));
  a = atob(a);
  for (var b = new Uint8Array(a.length), c = 0; c < a.length; c++)
    b[c] = a.charCodeAt(c);
  return b
}

var Ye = function (a) {
  gda(Ve);
  var b = a.j;
  b = b == null || Ue(b) ? b : typeof b === "string" ? eda(b) : null;
  return b == null ? b : a.j = b
}

var Zi = function () {
  var a, b, c;
  return (c = (a = globalThis.performance) == null ? void 0 : (b = a.now) == null ? void 0 : b.call(a)) != null ? c : Date.now()
}

var df = function (a) {
  return typeof Symbol === "function" && typeof Symbol() === "symbol" ? Symbol() : a
}

export const e1 = df();

var Vf = function (a) {
  return a[e1]
}

var $e = function () {
  console.error("Error: invalid data")
}

var Zf = function (a, b, c, d) {
  if (c === -1)
    return null;
  var e = b >> 14 & 1023 || 536870912;
  if (c >= e) {
    if (b & 256)
      return a[a.length - 1][c]
  } else {
    var f = a.length;
    if (d && b & 256 && (d = a[f - 1][c],
      d != null)) {
      if (Vda(a, b, e, c) && ag != null) {
        var h;
        a = (h = Wda) != null ? h : Wda = {};
        h = a[ag] || 0;
        h >= 4 || (a[ag] = h + 1,
          $e())
      }
      return d
    }
    return Vda(a, b, e, c)
  }
}

var Vda = function (a, b, c, d) {
  b = d + (+!!(b & 512) - 1);
  if (!(b < 0 || b >= a.length || b >= c))
    return a[b]
}

var Xe = function () {
  return hda || (hda = new We(null, Ve))
}

class We {
  constructor(a, b) {
    gda(b);
    this.j = a;
    if (a != null && a.length === 0)
      throw Error("ByteString should be constructed with non-empty values");
  }
}

var jf = function (a, b, c) {
  if (a != null)
    if (typeof a === "string")
      a = a ? new We(a, Ve) : Xe();
    else if (a.constructor !== We)
      if (Ue(a))
        a = a.length ? new We(c ? a : new Uint8Array(a), Ve) : Xe();
      else {
        if (!b)
          throw Error();
        a = void 0
      }
  return a
}

var Xda = true;
var bg = function (a, b, c, d, e) {
  var f = b >> 14 & 1023 || 536870912;
  if (c >= f || e && !Xda) {
    var h = b;
    if (b & 256)
      e = a[a.length - 1];
    else {
      if (d == null)
        return h;
      e = a[f + (+!!(b & 512) - 1)] = {};
      h |= 256
    }
    e[c] = d;
    c < f && (a[c + (+!!(b & 512) - 1)] = void 0);
    h !== b && ef(a, h);
    return h
  }
  a[c + (+!!(b & 512) - 1)] = d;
  b & 256 && (a = a[a.length - 1],
    c in a && delete a[c]);
  return b
}

export function mg(sChal, b) {
  const c = Vf(sChal);
  let d = Zf(sChal, c, b);
  let e = jf(d, !0, !!(c & 34));
  e != null && e !== d && bg(sChal, c, b, e);
  return e == null ? Xe() : e;
}

export function j(a) {
  var b = a();
  if (b.length > 118)
    throw new PoTokenError(19, "DFO:Invalid");
  a = Math.floor(Date.now() / 1E3);
  var c = [Math.random() * 255, Math.random() * 255]
    , d = c.concat([0 & 255, 3], [a >> 24 & 255, a >> 16 & 255, a >> 8 & 255, a & 255]);
  a = new Uint8Array(2 + d.length + b.length);
  a[0] = 34;
  a[1] = d.length + b.length;
  a.set(d, 2);
  a.set(b, 2 + d.length);
  b = a.subarray(2);
  for (d = c = c.length; d < b.length; ++d)
    b[d] ^= b[d % c];
  return a
}
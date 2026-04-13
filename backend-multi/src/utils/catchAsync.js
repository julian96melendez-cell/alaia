// src/utils/catchAsync.js

"use strict";

// Wrapper para funciones async en controladores
// Uso:
// const miControlador = catchAsync(async (req, res, next) => { ... });

function catchAsync(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("catchAsync requiere una función");
  }

  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = catchAsync;
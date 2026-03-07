// src/utils/catchAsync.js

// Wrapper para funciones async en controladores
// Uso: const miControlador = catchAsync(async (req, res, next) => { ... });

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;
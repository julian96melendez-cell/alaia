// ===============================================
//  providers/index.js - Nivel Plataforma (PRO)
//  Se encarga de centralizar todos los proveedores
// ===============================================

// Importar los proveedores disponibles
const aliexpressProvider = require('./aliexpressProvider');
// En el futuro:
// const amazonProvider = require('./amazonProvider');
// const temuProvider = require('./temuProvider');
// const ebayProvider = require('./ebayProvider');

// Objeto que contiene todos los providers registrados
const providers = {
  aliexpress: aliexpressProvider,
  // amazon: amazonProvider,
  // temu: temuProvider,
  // ebay: ebayProvider
};

/**
 * Obtiene un proveedor por nombre
 * @param {string} name - Nombre del proveedor (ej: 'aliexpress')
 * @returns provider module or undefined
 */
const getProvider = (name) => {
  return providers[name];
};

/**
 * Devuelve la lista de proveedores disponibles
 */
const getAvailableProviders = () => {
  return Object.keys(providers);
};

module.exports = {
  getProvider,
  getAvailableProviders,
};
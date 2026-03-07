// =============================================================
// importService.js - Servicio de Importación de Proveedores (PRO)
// =============================================================

const Producto = require('../models/Producto');
const { getProvider } = require('../providers');

/**
 * Importa productos desde un proveedor externo y los sincroniza con tu BD.
 * @param {string} proveedorNombre - Nombre del proveedor ("aliexpress", "amazon", etc.)
 * @param {Object} opciones - Opciones de importación (categoria, limite, etc.)
 * @returns {Object} - Resumen de importación (creados, actualizados)
 */
const importarProductosDesdeProveedor = async (proveedorNombre, opciones = {}) => {
  // Obtener el provider correcto
  const provider = getProvider(proveedorNombre);

  if (!provider) {
    throw new Error(`Proveedor no soportado: ${proveedorNombre}`);
  }

  console.log(`🔄 Iniciando importación desde proveedor: ${proveedorNombre}...`);

  // 1. Traer productos desde el provider
  const productosExternos = await provider.obtenerProductos(opciones);

  let creados = 0;
  let actualizados = 0;

  // 2. Recorrer productos externos y sincronizar con BD
  for (const externo of productosExternos) {
    const filtro = {
      proveedor: proveedorNombre,
      proveedorProductoId: externo.proveedorProductoId,
    };

    const datos = {
      nombre: externo.nombre,
      descripcion: externo.descripcion,
      precio: externo.precio,
      imagen: externo.imagen,
      categoria: externo.categoria,
      moneda: externo.moneda || 'USD',
      stock: externo.stock || 0,
      urlOriginal: externo.urlOriginal || '',
      comisionPorcentaje: externo.comisionPorcentaje || 0,
      proveedor: proveedorNombre,
      proveedorProductoId: externo.proveedorProductoId,
    };

    // Buscar si ya existe en tu BD
    const existente = await Producto.findOne(filtro);

    if (existente) {
      // Actualizar producto existente
      await Producto.updateOne(filtro, datos);
      actualizados++;
    } else {
      // Crear nuevo producto
      await Producto.create(datos);
      creados++;
    }
  }

  console.log(`✅ Importación completada: ${creados} creados, ${actualizados} actualizados.`);

  return { creados, actualizados };
};

module.exports = {
  importarProductosDesdeProveedor,
};
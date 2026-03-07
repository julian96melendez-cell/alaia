// =========================================================
//  aliexpressProvider.js - Nivel Plataforma
//  Simulación de proveedor AliExpress para pruebas internas
//  Más adelante aquí conectamos la API REAL de AliExpress
// =========================================================

/**
 * Este provider simula la obtención de productos desde AliExpress.
 * En producción, reemplazaremos estas funciones por llamadas a la API oficial
 * usando appKey, appSecret, signMethod (HMAC), etc.
 */

module.exports = {
  nombre: 'aliexpress',

  /**
   * Obtiene productos desde el "proveedor"
   * @param {Object} opciones
   *  - categoria: string
   *  - limite: number
   * @returns {Array<Object>} lista de productos simulados
   */
  obtenerProductos: async (opciones = {}) => {
    const { categoria, limite = 20 } = opciones;

    // ================================
    //  SIMULACIÓN DE DATOS REALISTAS
    //  (luego reemplazamos por API real)
    // ================================

    const categoriasEjemplo = categoria || 'general';

    const productosSimulados = Array.from({ length: limite }).map((_, index) => {
      const idExterno = `ae-prod-${categoriasEjemplo}-${index}`;

      return {
        proveedorProductoId: idExterno,
        nombre: `Producto AliExpress ${index + 1}`,
        descripcion: `Descripción avanzada del Producto ${index + 1} de AliExpress en la categoría ${categoriasEjemplo}.`,
        precio: Math.floor(Math.random() * 80 + 10), // precio aleatorio entre 10–90
        imagen: "https://via.placeholder.com/300?text=AliExpress+Product",
        categoria: categoriasEjemplo,
        moneda: "USD",
        stock: Math.floor(Math.random() * 200 + 20),
        urlOriginal: `https://aliexpress.com/item/${idExterno}`,
        comisionPorcentaje: 8 + Math.floor(Math.random() * 5) // 8–12%
      };
    });

    return productosSimulados;
  }
};
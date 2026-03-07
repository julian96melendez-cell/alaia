const express = require('express');
const router = express.Router();

const { proteger, soloAdmin } = require('../middleware/auth');
const {
  adminListarOrdenes,
  adminActualizarFulfillment,
  adminActualizarPago,
} = require('../controllers/adminOrdenController');

router.get('/ordenes', proteger, soloAdmin, adminListarOrdenes);

router.put('/ordenes/:id/fulfillment', proteger, soloAdmin, adminActualizarFulfillment);

router.put('/ordenes/:id/pago', proteger, soloAdmin, adminActualizarPago);

module.exports = router;
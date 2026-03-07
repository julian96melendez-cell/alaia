const { EventEmitter } = require("events");

class Bus extends EventEmitter {}
const bus = new Bus();

// recomendado: evitar warning si crece
bus.setMaxListeners(50);

module.exports = bus;
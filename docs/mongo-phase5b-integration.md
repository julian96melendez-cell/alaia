# Fase 5B: ensayo MongoDB preparado, no ejecutado

Este ensayo realizará escrituras únicamente cuando el propietario lo ejecute posteriormente desde la Terminal del Mac. No demuestra todavía que Atlas haya aprobado los ensayos. No inicia Express, workers, Firebase ni Stripe; no carga `.env` ni usa `MONGO_URI`.

## Aislamiento obligatorio

Configurar únicamente variables temporales de la sesión:

- `ALAIA_MONGO_TEST_URI`: URI Atlas dedicada. Ruta vacía o exactamente la base de ensayo; nunca la URI con ruta `backendmulti`.
- `ALAIA_MONGO_TEST_DB`: `alaia_integration_` seguido de 32 caracteres hexadecimales aleatorios.
- `ALAIA_MONGO_TEST_CONFIRM`: exactamente el mismo nombre de base.

Generar un nombre nuevo para cada ejecución, por ejemplo con `node -e "console.log('alaia_integration_'+require('crypto').randomBytes(16).toString('hex'))"`. No reutilizar bases. No escribir credenciales en archivos, argumentos ni historial: introducir la URI mediante un prompt oculto de Terminal. No copiar `.env` real ni modificar Render.

Usar preferiblemente un usuario Atlas temporal con permisos restringidos exclusivamente al nombre de base elegido. El script no crea usuarios ni concede permisos. Este requisito de privilegios mínimos debe configurarse manualmente antes de ejecutar; las comprobaciones de nombre del script no sustituyen los permisos de Atlas. Necesita lectura/escritura, creación de las tres colecciones y del índice de Counter en esa base, además del diagnóstico `hello`.

El runner valida configuración antes de cargar modelos; exige Atlas SRV, rechaza una ruta de base diferente, opciones URI no autorizadas y TLS deshabilitado. Usa `dbName` explícito, desactiva creación/indexación automática de Mongoose y buffering, comprueba primary, replica set y sesiones lógicas. Rechaza cualquier base con colecciones existentes antes de escribir. No consulta colecciones de producción ni elimina bases o datos. Crea explícitamente solamente las colecciones de Producto, Orden y Counter y el índice único `Counter.key`; `_id` recibe el índice nativo. No sincroniza los índices completos de producción.

No garantiza exclusión frente a otro proceso que use deliberadamente el mismo nombre. Por ello son obligatorios el nombre aleatorio, permisos limitados y una única ejecución por base.

## Ensayos

A. **Rollback**: stock inicial 2; reserva real de una unidad, `Orden.save()` y hook real Counter dentro de la misma sesión. Error deliberado antes del commit. Verifica stock 2, cero órdenes y ausencia de Counter, incluida la reversión de su inserción.

B. **Commit**: nueva reserva con stock inicial 2. Verifica stock 1, una orden reservada, número de orden 1 y Counter 1.

C. **Concurrencia**: dos sesiones leen la última unidad antes de competir. La barrera se utiliza solamente en el primer intento para permitir retries de `withTransaction`; tiene timeout. Exige un ganador, un perdedor con stock insuficiente, stock final 0, dos órdenes totales y Counter 2. El filtro real `stock >= cantidad` con decremento atómico impide stock negativo; no se sustituye por una simulación.

D. **Counter fallido**: sustituye temporalmente únicamente `Counter.findOneAndUpdate` por un fallo sintético. La reserva y `Orden.save()` son reales. Verifica la misma sesión, propagación del error, rollback de stock, ausencia de nueva orden y Counter intacto. Restaura el método en `finally`. Simula un error del hook, no un fallo del servidor Atlas.

E. **Liberación idempotente**: utiliza `createCheckoutLifecycle().release()` real, con prueba `never_attempted`; no prepara checkout ni crea PaymentIntent. El adaptador Mongo usa los modelos reales, la misma sesión y `order.$where`/`save()` como el repositorio de producción. Stripe está bloqueado mediante un mock que falla ante cualquier acceso. Verifica primera liberación verdadera, segunda falsa, stock restaurado solamente una vez, reserva `released`, pago `fallido` y Counter intacto.

El repositorio mínimo de E reproduce las operaciones del adaptador existente porque obtener su singleton cargaría Stripe. No modifica ni reemplaza servicios de producción. A–D prueban composición real de reserva y guardado, no todo el endpoint HTTP ni preparación Stripe. E es secuencial; no demuestra dos liberaciones concurrentes ni todos los escenarios de webhook.

## Ejecución posterior, pendiente de autorización

Una vez que el propietario configure las tres variables temporales y autorice las escrituras aisladas:

```sh
node backend-multi/scripts/mongo-phase5b-integration.js
```

No ejecutar ahora. No invocar scripts de expiración ni checkout. Éxito produce únicamente nombre seguro de base y resultados A–E. Los errores no imprimen URI, credenciales, documentos ni stack traces. Un fallo deja los datos sintéticos para inspección; no reutilizar esa base. No existe limpieza automática ni `dropDatabase`. La eliminación manual futura requiere autorización separada. Retirar las variables temporales al terminar.

## Validación local sin red

```sh
node --check backend-multi/scripts/mongo-phase5b-integration.js
node --test backend-multi/test/mongo-phase5b-safety.test.js
```

Importar el módulo en los tests valida configuración sin cargar modelos ni iniciar conexiones. Las pruebas usan solamente una URL de ejemplo sin credenciales. Los 93 tests anteriores de hardening siguen siendo locales con mocks y se ejecutan por lista explícita, sin invocar el runner de integración.

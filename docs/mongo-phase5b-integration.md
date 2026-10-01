# Fase 5B: ensayos MongoDB A–E completados

El 1 de octubre de 2026, el propietario ejecutó el runner desde su Terminal de Mac y compartió una salida de éxito para los cinco ensayos A–E sobre `alaia_ba98fd0d1a69e51e79c3bd384d23916c`. Las ejecuciones anteriores terminaron en fallo; su causa exacta no pudo recuperarse del mensaje original. El runner no inicia Express, workers, Firebase ni Stripe; no carga `.env` ni usa `MONGO_URI`.

Resultado recibido, sin credenciales:

```json
{"database":"alaia_ba98fd0d1a69e51e79c3bd384d23916c","passed":["A rollback","B commit","C concurrency","D counter failure","E idempotent release"],"syntheticDataRetained":true}
```

Este resultado confirma los escenarios y límites descritos abajo; no certifica todo el endpoint HTTP, pagos Stripe reales ni todos los casos concurrentes. Se emitieron advertencias de índices duplicados del modelo Orden, pero la ejecución terminó con éxito. No se modificaron esos índices de producción.

## Aislamiento obligatorio

Configurar únicamente variables temporales de la sesión:

- `ALAIA_MONGO_TEST_URI`: URI Atlas dedicada. Ruta vacía o exactamente la base de ensayo; nunca la URI con ruta `backendmulti`.
- `ALAIA_MONGO_TEST_DB`: `alaia_` seguido de exactamente 32 caracteres hexadecimales aleatorios en minúsculas (38 bytes ASCII en total).
- `ALAIA_MONGO_TEST_CONFIRM`: exactamente el mismo nombre de base.

Atlas Free limita los nombres de base a 38 bytes: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/. El formato anterior `alaia_integration_` + 32 hexadecimales ocupaba 50 bytes y se rechaza ahora; no reutilizar ni borrar esa base.

La ejecución sobre `alaia_78943cf524ef883d31e9628163931fe8` falló. Una inspección posterior de solo lectura confirmó 3 colecciones, 4 productos, 2 órdenes, Counter con secuencia 2 y una orden liberada. Esa base se conserva para inspección y no se reutiliza. El diagnóstico añadido después no recupera el error original.

Base del ensayo completado: `alaia_ba98fd0d1a69e51e79c3bd384d23916c`. El propietario aprobó y Atlas terminó de aplicar el cambio de `alaia_integration_test` a un único permiso `readWrite` sobre esta base, retirando el permiso sobre la base anterior. Antes de ejecutar se verificaron configuración, conexión, primary, sesiones y cero colecciones mediante solo lectura. Los datos sintéticos se conservaron: no volver a ejecutar el runner sobre esta base ni borrarla sin autorización separada.

Cierre confirmado por el propietario el 1 de octubre de 2026: eliminó de su Terminal `ALAIA_MONGO_TEST_URI`, `ALAIA_MONGO_TEST_DB`, `ALAIA_MONGO_TEST_CONFIRM` y variables auxiliares, y rotó directamente en Atlas la contraseña del usuario de pruebas, conservando el permiso exclusivo. Esta confirmación procede del propietario; no se inspeccionó la credencial ni se abrió otra conexión para verificarla. No compartir la credencial nueva ni guardarla en archivos o historial. No modificar otros usuarios ni permisos de producción. Para cualquier futuro ensayo, preparar una base aleatoria nueva y actualizar las tres variables, incluida la ruta de la URI; obtener autorización antes de guardar permisos o ejecutar escrituras.

Generar un nombre nuevo para cada ejecución, por ejemplo con `node -e "console.log('alaia_'+require('crypto').randomBytes(16).toString('hex'))"`. Se conservan los 16 bytes de aleatoriedad. No reutilizar bases. No escribir credenciales en archivos, argumentos ni historial: introducir la URI mediante un prompt oculto de Terminal. No copiar `.env` real ni modificar Render.

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

No ejecutar ahora. No invocar scripts de expiración ni checkout. Éxito produce únicamente nombre seguro de base y resultados A–E, después de cerrar la conexión. Un fallo produce un JSON con `status: "failed"`, `failedStage`, `passed` (solo ensayos que completaron todas sus comprobaciones), `numericCode` (entero o `null`), `detailsSuppressed`, `syntheticDataRetained` y `doNotReuseDatabase`. Las etapas incluyen configuración, carga de modelos, conexión, comprobaciones iniciales, creación de colecciones/índice, A–D, comprobaciones individuales de E y cierre de conexión. Un error al cerrar no sustituye la etapa ni el código de un fallo anterior.

Los errores no imprimen URI, credenciales, documentos, mensajes originales, objetos de aserción ni stack traces. El diagnóstico no recupera la causa de ejecuciones anteriores. `syntheticDataRetained: true` indica que no hay limpieza automática, no que necesariamente se hayan creado datos antes del fallo. No reutilizar una base tras una ejecución fallida. No existe `dropDatabase`. La eliminación manual futura requiere autorización separada. Retirar las variables temporales al terminar.

## Validación local sin red

```sh
node --check backend-multi/scripts/mongo-phase5b-integration.js
node --test backend-multi/test/mongo-phase5b-safety.test.js
```

Importar el módulo en los tests valida configuración sin cargar modelos ni iniciar conexiones. Las pruebas usan solamente una URL de ejemplo sin credenciales. Los tests de diagnóstico ejecutan el runner con sustitutos en memoria: verifican etapas, códigos numéricos, ausencia de información privada, rechazo de bases usadas antes de crear colecciones y preservación del fallo original cuando el cierre también falla. No cargan el driver ni modelos reales y no conectan a Atlas. Los 93 tests anteriores de hardening siguen siendo locales con mocks y se ejecutan por lista explícita, sin invocar el runner de integración.

Última comprobación local: 112 pruebas aprobadas, cero fallos (93 pruebas previas y 19 de configuración/diagnóstico del runner). Se ejecutaron los ocho archivos de `backend-multi/test` por lista explícita; no se ejecutó el runner contra Atlas. Estos resultados no equivalen a aprobar los ensayos reales A–E.

# Storage fuera del alcance de la versión actual

Firebase Storage no está habilitado por esta entrega ni verificado para producción.
La consola de ShiboApp (`shiboapp-7ec65`) muestra Spark y exige Blaze para acceder
al servicio. No se pudieron confirmar buckets, reglas publicadas ni permisos;
esto no demuestra que nunca hayan existido archivos o buckets.

## Inventario y dependencia

La entrada móvil es `expo-router/entry`. Las rutas actuales de `app/`, registro,
perfil, carrito, catálogo y checkout no suben ni borran archivos en Storage.
Auth y Firestore siguen inicializándose; se retiró únicamente la inicialización
compartida de Storage. Las imágenes existentes siguen mostrándose por URL y su
accesibilidad depende del servidor que las aloje; no se verificó remotamente.
El panel Next.js y backend no usan el SDK de Storage para estas funciones.
`utils/storage.ts` es AsyncStorage local y no se modificó.

Referencias heredadas retiradas:

- `screens/RegisterScreen.tsx`: subida a `users/{uid}.jpg`. Sin consumidor actual
  encontrado; selección de foto bloqueada. Un borrador con URI local se rechaza
  antes de crear una cuenta, sin simular éxito ni borrar la foto existente.
- `screens/ProfileScreen.tsx`: subida/borrado de `users/{uid}/avatar.jpg`;
  referenciado por `routes/ProfileNavigator.tsx`, cuyo consumidor no se encontró.
  Selección y borrado muestran «Función temporalmente no disponible»; editar
  el nombre conserva la fotografía remota existente.
- `services/storageService.ts`: helper sin consumidores encontrados; ahora rechaza
  explícitamente antes de leer la URI o importar un SDK.

Se conservan pantallas, navegación y visualización de fotografías existentes.
No se borran objetos, perfiles ni URLs. La configuración histórica del bucket
permanece como referencia; no autoriza su activación.

## Validación y límite

Pruebas desconectadas ejecutan la configuración con dependencias permitidas,
el helper y los callbacks reales extraídos de las pantallas; además inspeccionan
los fuentes para impedir imports y mutaciones de Storage. Cubren rechazo de
borrador local previo al registro. Son pruebas locales, no certificación de
reglas remotas, disponibilidad de imágenes ni recorridos completos en dispositivo.

Storage no debe activarse, ni sus acciones reintroducirse, sin revisión independiente
de reglas publicadas, política de catálogo público y archivos privados, pruebas de
emulador y autorización separada. No se necesita Blaze para esta corrección local.

Validación local de esta entrega: 8/8 pruebas específicas, 435/435 en la suite
backend desconectada, TypeScript web sin errores, sintaxis de los cuatro fuentes
modificados y del test, y `git diff --check` aprobados. La suite HTTP necesitó
permiso para sockets exclusivamente locales porque el sandbox rechazó loopback.
No se ejecutaron pruebas remotas ni recorridos end-to-end móviles con datos reales.

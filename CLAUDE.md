# PortalEB

Portal de gestión del taller de Elías Blanco (naval e industrial): órdenes de
trabajo, presupuestos, técnicos, calendario, y una sección "EB Engineering"
para el producto EBcontroller (clientes, ventas, cables, stock, noticias, FAQ).

Stack: React + TypeScript + Vite + Tailwind, Firebase (Auth, Cloud Functions,
Storage, Firestore solo para el chat) y **Data Connect** (PostgreSQL) para todo
lo demás.

## Dónde está cada cosa

| Ruta | Qué contiene |
|---|---|
| `dataconnect/schema/schema.gql` | Tablas y enums. Cada tabla lleva comentario explicando el porqué de lo no obvio |
| `dataconnect/connector/queries.gql` / `mutations.gql` | Consultas del cliente |
| `src/dataconnect-generated/` | SDK generado, **no se edita a mano** |
| `functions/index.js` | Todas las Cloud Functions (~3800 líneas, un solo archivo) |
| `functions/workOrderPdf.js`, `ratingsPdf.js` | PDFs con `@react-pdf/renderer` sin JSX (functions no tiene build) |
| `src/pages/` | Una página por pantalla; los componentes de uso local viven en el mismo archivo |
| `src/lib/` | Envoltorios de las callables (`orderWorkflow.ts`, `ebEngineering.ts`, `calendar.ts`...) y utilidades |

## Comandos

```bash
npm run dev      # servidor de desarrollo (apunta al backend de PRODUCCIÓN)
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

`npm run build` usa `tsc -b`, que detecta errores que `tsc --noEmit` deja pasar
(referencias de proyecto). Ejecútalo siempre antes de dar algo por terminado.

## Despliegue

- **Hosting lo despliego yo**: `npx firebase-tools@latest deploy --only hosting`.
- **`dataconnect` y `functions` los despliega el usuario**: dale los comandos
  exactos, con los nombres de las funciones concretas
  (`--only functions:nombreA,functions:nombreB`), no el paquete entero.
- Tras editar `schema.gql` o `queries.gql`: `npx firebase-tools@latest
  dataconnect:sdk:generate` antes de compilar.
- La app es una PWA: **el service worker sirve la versión cacheada** tras cada
  despliegue. Hay que recargar dos veces para ver lo nuevo. Verifica lo
  publicado descargando `/assets/index-<hash>.js` y buscando el texto nuevo,
  no fiándote del `index.html` que devuelve el navegador.
- El pie de página muestra la versión cargada (`v<hash> · fecha`). Compara ese
  hash con `git log --oneline -1`; un `+` indica que se compiló con cambios sin
  commitear, así que **commitea antes de compilar para desplegar**.

## Data Connect: cosas que muerden

- **El límite por defecto es 100 filas y corta en silencio.** Toda consulta de
  lista lleva `limit` explícito. Sin él, una pantalla simplemente deja de
  mostrar datos y parece que no se guardaron.
- Después de una mutación, las consultas necesitan `FRESH` (de
  `src/lib/dataConnectOptions.ts`). `{ source: 'SERVER' }` **no existe**:
  devuelve caché sin avisar.
- `executeGraphqlRead` / `executeGraphql` desde el Admin SDK saltan `@auth`,
  por eso todas las escrituras pasan por Cloud Functions.
- Para poner un campo a null en un `_update`, pásalo como literal en la
  mutación (`data: { campo: null }`).

## Cloud Functions: convenciones

- Permisos: `requirePermission(request, 'clave')` o `requireAdminOrLab(request)`
  (rol ADMIN o el bypass `admin:lab`). Las claves cumplen `^[a-z]+:[a-z]+$` y
  las crea el usuario desde Administración → Usuarios; requieren volver a
  entrar para refrescar los claims.
- Todo cambio administrativo se registra en `OrderTracking` con su actor y, si
  aporta, metadata con el antes y el después. Si algo se salta el camino normal
  (una corrección directa), se registra igual: nada silencioso.
- Releer del servidor antes de decidir, en vez de fiarse del estado que manda
  el cliente.

## Scripts contra producción

Las escrituras directas a producción las **ejecuta el usuario**, no yo:

1. Escribe el script en el scratchpad.
2. Cópialo a `functions/.nombre.js` (con punto delante: hace falta estar dentro
   de `functions/` para que resuelva `firebase-admin`).
3. El usuario lo ejecuta con `node .nombre.js` desde `C:\Proyectos\PortalEB\functions`.
4. Bórralo después y comprueba que `git status --porcelain functions/` queda limpio.

Las lecturas de solo consulta sí las ejecuto yo con ese mismo patrón.

## Pruebas

El servidor de desarrollo apunta a producción, así que **cualquier prueba toca
datos reales**. Antes de probar algo destructivo:

- Usa órdenes de prueba ya eliminadas (por ejemplo `A-000003`, de lab) en vez
  de órdenes reales.
- Si hay que crear algo, bórralo después y verifica en base de datos que no
  quedan restos.
- Apunta los valores originales antes de tocarlos, para poder restaurarlos.

Una vez borré un registro real de producción durante una prueba. Si pasa algo
así, dilo claramente en vez de dejarlo pasar.

## Estilo

- **Interfaz en español, comentarios y commits en inglés.**
- Los comentarios explican *por qué*, no *qué*: la decisión, el caso que la
  motivó, la trampa que evita. Sigue la densidad del código de alrededor.
- Nada de comentarios de relleno ni de anunciar lo que hace la línea siguiente.
- Confirmaciones antes de acciones irreversibles, y mensajes de error visibles:
  un diálogo que se queda quieto tras fallar es un fallo en sí.

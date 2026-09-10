# Despliegue

Proyecto Firebase: `portaleb`. Data Connect en `europe-southwest1`, servicio
`portaleb-service`, base `portaleb-database`. La web se sirve en
https://portaleb.web.app.

## Qué se despliega y cuándo

| Tocaste | Despliega |
|---|---|
| `dataconnect/schema/*.gql` o `dataconnect/connector/*.gql` | `dataconnect` |
| `functions/**` | solo las funciones afectadas |
| `src/**` | `hosting` |
| `firestore.rules`, `storage.rules` | `firestore` / `storage` |

**El orden importa**: si una función nueva usa un tipo o una consulta nueva,
primero `dataconnect`, luego `functions`. Al revés, la función falla en cuanto
alguien la llama.

```bash
# 1. Esquema y consultas
npx firebase-tools@latest deploy --only dataconnect

# 2. Solo las funciones que cambiaron, no el paquete entero
npx firebase-tools@latest deploy --only functions:nombreA,functions:nombreB

# 3. Frontend
npm run build
npx firebase-tools@latest deploy --only hosting
```

Tras editar `schema.gql` o `queries.gql`, **regenera el SDK antes de compilar**:

```bash
npx firebase-tools@latest dataconnect:sdk:generate
```

## Después de desplegar hosting

**El pie de página dice qué versión tienes cargada**: `v` más el hash corto del
commit compilado y la fecha de compilación. Compáralo con `git log --oneline
-1`; si no coincide, sigues en la anterior. Un `+` detrás del hash significa que
se compiló con cambios sin commitear.

La app es una PWA con service worker: **sirve la versión cacheada** hasta que la
nueva se activa. Al abrirla hay que recargar dos veces. Comprobar que lo
publicado es lo nuevo mirando el `index.html` que devuelve el navegador no vale,
porque también viene de la caché; descarga el bundle y busca en él:

```bash
curl -s https://portaleb.web.app/assets/index-<hash>.js | grep -c "texto que añadiste"
```

El `<hash>` es el del `dist/index.html` recién construido.

## Migraciones de esquema

Añadir una columna con valor por defecto es seguro: las filas existentes lo
adoptan. Renombrar o eliminar no lo es — Data Connect pedirá confirmación y
puede destruir datos. Antes de una migración destructiva, exporta lo que vayas
a perder.

Si el despliegue de `dataconnect` devuelve un 404 en `schemas/main:migrate`,
revisa que no esté activo el experimento `fdcapimigration`:

```bash
npx firebase-tools@latest experiments:disable fdcapimigration
```

## Secretos

Los usan `esp32*` (`CABLE_CHECK_DEVICE_SECRET`) y `ebTranslateEbContent`
(`GEMINI_API_KEY`), declarados en el propio `onCall`/`onRequest`. Un secreto no
se puede destruir mientras una función desplegada lo declare: primero
redespliega o elimina esas funciones, después destrúyelo.

## Verificar en producción

El servidor de desarrollo (`npm run dev`) apunta al backend de producción, así
que sirve para probar la interfaz nueva sin desplegar hosting — **pero escribe
en datos reales**. Ver la sección de pruebas en [`CLAUDE.md`](../CLAUDE.md).

# Integraciones

Lo que entra o sale del portal sin pasar por la interfaz.

## Comprobador de cables (ESP32)

Un dispositivo del taller comprueba la continuidad de un cable y registra el
resultado. Dos endpoints HTTP, autenticados con la cabecera `x-device-secret`
contra el secreto `CABLE_CHECK_DEVICE_SECRET`:

| Endpoint | Qué hace |
|---|---|
| `esp32GetLastCableCheck` | Devuelve el último número de secuencia usado |
| `esp32RegisterCableCheck` | POST con `{ cableCode, userEmail }`; da de alta una comprobación |

Se identifica al técnico por **email**, no por uid, porque es lo que quien
configura el firmware puede saber. El código del cable es el `EBEN…` del
catálogo; si no existe, responde 404.

El dispositivo falla a veces y registra varias comprobaciones para un mismo
cable — por eso se pueden borrar desde la pestaña Cables, siempre que no estén
asignadas a una venta.

También se puede registrar una unidad a mano desde Stock
(`ebRegisterCableCheck`), para cuando el comprobador no está disponible.

## Valoraciones de las tablets (otro proyecto)

Las tablets de recepción guardan valoraciones en un proyecto de Firebase
**distinto**, `ebratingapp`. El portal las lee con el Admin SDK inicializando
una app secundaria, autorizado por IAM (`roles/datastore.viewer` sobre la
cuenta de servicio de PortalEB), lo que **salta las reglas de Firestore** de
ese proyecto.

Sus reglas están en [`ebratingapp.firestore.rules`](../ebratingapp.firestore.rules),
guardadas aquí como referencia: **no se despliegan con este repo**, pertenecen
a otro proyecto. Son de solo creación: la tablet puede escribir valoraciones y
nadie puede leerlas ni borrarlas con la clave pública que lleva la app.

En el portal se ven en Valoraciones (`ratings:view`), con media, distribución,
filtros y exportación a PDF por rango de fechas.

## Traducciones (Gemini)

Las noticias y las FAQ se escriben en español y se traducen bajo demanda con
`gemini-3.5-flash-lite` (secreto `GEMINI_API_KEY`). El resultado se cachea en el
campo `translations` de cada fila, de modo que cada idioma se traduce una vez.

Si la traducción falla, la interfaz muestra el texto original en español: es
deliberado, no un error silenciado a medias.

## Notificaciones push

Los tokens de dispositivo viven en Firestore (`deviceTokens`). Se notifica al
crear un mensaje de chat (disparadores sobre `clientChats` y
`technicianChats`), y hay un trabajo programado, `notifyActiveShifts`, que se
ejecuta **cada media hora entre las 8:00 y las 16:00, hora de Madrid**, para
recordar a quien tenga un turno abierto que sigue fichado.

Los tokens caducados se limpian solos cuando el envío devuelve que ya no están
registrados.

## Archivos en Storage

| Ruta | Contenido |
|---|---|
| `work-orders/{código}/informe.pdf` | Hoja de la orden; se genera al crearla y **se regenera si cambian los trabajos** |
| `work-orders/{código}/quotes/presupuesto-{n}.pdf` | Presupuestos, uno por intento |
| `work-orders/{código}/photos/{etapa}/…` | Fotos de inicio, incidencia y final |
| `interventions/{código}/signature.png` | Firma del cliente en el parte de intervención |
| `chat-media/{ordenId}/{tipo}/…` | Adjuntos del chat |
| `eb-news/…`, `eb-products/…` | Imágenes de noticias y de productos EB |

Las URLs son enlaces de descarga permanentes con token. **Al regenerar un
archivo cambia el token**, así que hay que reescribir el campo que lo guarda
(`finalReportUrl`, por ejemplo).

## Contadores en Firestore

Los números de orden (`orderSequenceCounters`), de intervención
(`interventionSequenceCounters`) y de comprobación de cable
(`cableCheckSequenceCounters`) se reservan en Firestore mediante transacción,
no en PostgreSQL. Es lo que evita que dos órdenes creadas a la vez cojan el
mismo número.

La tabla `OrderSequence` de PostgreSQL quedó desincronizada de los datos reales
y **no es fuente de verdad**: el número de partida se calcula del máximo
`sequenceNumber` existente.

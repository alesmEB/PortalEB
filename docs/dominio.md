# Dominio

Todo esto vive en Data Connect (PostgreSQL) salvo donde se diga lo contrario. El
esquema con sus comentarios está en
[`dataconnect/schema/schema.gql`](../dataconnect/schema/schema.gql); aquí va el
mapa mental, no la lista de columnas.

## Identidad

**User** es la cuenta de Firebase Auth (el id es el uid, no un UUID). Tiene un
`role` — ADMIN, TECHNICIAN o CLIENT — y además una lista de permisos concretos a
través de **UserPermission** → **Permission**. El rol abre secciones enteras; el
permiso abre acciones. Ver [permisos.md](permisos.md).

Rol y permisos viajan en los *custom claims* del token, así que **al cambiarlos
hay que volver a entrar** para que surtan efecto.

## Clientes y embarcaciones

**Customer** (empresa o particular) → **Boat** (embarcación o máquina) →
**Engine** (uno o varios motores por embarcación).

Un Customer puede tener `linkedUserId`: la cuenta con rol CLIENT que ve sus
propias órdenes desde el portal.

## Órdenes de trabajo

**WorkOrder** es la pieza central. Su `code` (`A-000001`, `V-000012`,
`S-000165`) se compone de la localización — Algeciras, La Línea o Sotogrande —
y un número de secuencia; los contadores viven en Firestore
(`orderSequenceCounters`) para poder reservarlos sin carreras.

Cuelgan de ella:

- **WorkOrderTask** — los trabajos a realizar. Se pueden corregir después de
  crear la orden mientras no esté completada, y el PDF se regenera.
- **Quote** — presupuestos, como mucho dos intentos. El segundo rechazo cancela.
- **TechnicianAssignment** — técnicos asignados, con `isAllowed` e `isLead`.
  Desasignar no borra la fila: le pone `unassignedAt`.
- **TimeLog** — fichajes. Se ficha por orden, no por jornada; un fichaje sin
  `clockOut` es un turno abierto.
- **Incident** — incidencias con fotos, reportadas por el técnico.
- **WorkOrderPhoto** — fotos de inicio, incidencia y final.
- **WorkOrderScheduledDate** — un día del calendario, una fila. Una orden puede
  ocupar varios días sueltos.
- **OrderNote** — notas internas, invisibles para el cliente.
- **OrderTracking** — el historial. Cada evento con su tipo, su autor y, cuando
  aporta, metadata con el antes y el después.

### Los dos estados de una orden

Conviene no mezclarlos:

- **`status`**: el ciclo de trabajo (PENDING_QUOTE → … → COMPLETED o
  CANCELLED). Ver [diagrams/orden-de-trabajo.workflow.json](diagrams/orden-de-trabajo.workflow.json).
- **`adjustedAt` / `serviceProtocolAt` / `invoicedAt`**: el proceso
  administrativo posterior, que ocurre con la orden ya COMPLETED y no toca el
  `status`. Ver [diagrams/proceso-administrativo.lifecycle.json](diagrams/proceso-administrativo.lifecycle.json).

`serviceProtocolDone` tiene tres valores con significado propio: `null` = sin
decidir, `true` = realizado, `false` = no procedía.

`deletedAt` marca las órdenes eliminadas: siguen existiendo y se pueden buscar,
pero no aparecen en la lista salvo que se pida verlas.

## Intervenciones

**Intervention** digitaliza el parte de recepción en papel ("Orden de
Reparación"), con firma del cliente. Numeración propia, contador en Firestore
(`interventionSequenceCounters`). Está en pruebas: solo accesible con
`admin:lab`.

## EB Engineering

La sección del producto propio, con su público internacional:

- **EbClient** — cliente de EBcontroller, con país y, opcionalmente, un
  distribuidor (`distributorId`) que apunta a otro EbClient.
- **EbClientProduct** — una unidad vendida: serie, hardware, versión de
  software, fecha de compra. `soldToEndUserAt` cuando un distribuidor la
  revende; `retiredAt` cuando se da de baja; `internalUse` cuando la unidad se
  queda en casa y **no cuenta como venta ni ocupa número**.
- **EbCableType** — catálogo de cables (código `EBEN…` y nombre).
- **CableCheck** — cada comprobación de continuidad que registra el
  comprobador ESP32 del taller, numerada. Sin `productId` es stock; con él,
  está asignada a una venta.
- **EbScreen** — pantallas PV450 en stock, cada una con su número de serie. O se
  asigna a una venta, o se marca no disponible con un motivo; nunca las dos.
  Si una venta lleva pantalla, **el número de serie de la venta lo aporta la
  pantalla**.
- **EbNewsPost** / **EbFaqItem** — noticias y preguntas frecuentes que ven los
  clientes en "Mis productos", traducidas bajo demanda (ver
  [integraciones.md](integraciones.md)).

## Calendario

Dos cosas distintas comparten la rejilla:

- Las **órdenes con técnicos asignados**, mediante `WorkOrderScheduledDate`.
- Las **CalendarAppointment**: visitas sin orden detrás ("Mirar problema barco
  X"), con la embarcación en texto libre porque son barcos de los que aún no
  hay ficha. Cerrarlas las saca del panel pero mantiene sus días;
  **CalendarAppointmentDate** guarda un día por fila, igual que las órdenes.

## Lo que no está en PostgreSQL

- **Firestore**: el chat de cada orden (`clientChats/{orderId}`,
  `technicianChats/{orderId}`), los tokens de dispositivo para notificaciones,
  el espejo `adminUsers` y los contadores de secuencia.
- **Storage**: informes, presupuestos, fotos y firmas — ver
  [integraciones.md](integraciones.md).
- **Otro proyecto de Firebase**: las valoraciones de las tablets.

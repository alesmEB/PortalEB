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
- **Quote** — presupuestos, como mucho dos intentos. Tras el segundo rechazo la
  orden se queda en "Presupuesto rechazado"; cancelarla es una decisión aparte.
- **TechnicianAssignment** — técnicos asignados, con `isAllowed` e `isLead`.
  Desasignar no borra la fila: le pone `unassignedAt`.
- **TimeLog** — fichajes. Se ficha por orden, no por jornada; un fichaje sin
  `clockOut` es un turno abierto. Solo lo está de verdad si su orden sigue
  viva: completar una orden cierra sus turnos, así que uno abierto en una
  orden terminada es un resto (los fichajes traídos de la aplicación antigua
  llegaron sin salida) y no cuenta como turno activo en ninguna pantalla —
  administración lo cierra a mano desde la orden.
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

### Órdenes de taller

Las horas que no son de ningún barco (trabajo en el propio taller) se fichan en
las **órdenes de taller**: una por localización y mes, con código
`TALLER-A-2026-10` (`A`, `V` o `S`). Son `WorkOrder` normales con
`workshopMonth` relleno ("2026-10"), así que fichar, la regla de un solo turno
a la vez, el registro de horas y el correo diario funcionan igual que con
cualquier orden. Lo demás no les aplica: no llevan presupuesto, trabajos,
informe ni gestión administrativa, y cuelgan de un cliente interno ("Taller
Elías Blanco") con una "embarcación" por localización, porque una orden
necesita ambos.

No las crea nadie a mano. `ensureWorkshopOrders` (cada noche a las 00:05, hora
de España) crea las tres del mes si faltan, ya "En progreso"; asigna a quien
tenga `orders:assignable` y aún no esté en ellas (un técnico nuevo las tiene al
día siguiente); y completa las de meses anteriores. Un turno que siga abierto
al cerrar el mes no se cierra solo: queda en Turnos con "Cerrar" para que
administración ponga la hora real.

Se ven en dos sitios: las del mes, arriba en Asignaciones; todas, en "Órdenes
de taller". Las listas de órdenes reales (la lista, el calendario) las
excluyen filtrando por `workshopMonth` nulo.

### Órdenes directas (trabajo de mostrador)

Sobre todo en La Línea, mucho trabajo entra por el mostrador sin presupuesto:
se hace, se anota y se factura. Para eso, al crear una orden se puede marcar
"Orden directa" (`WorkOrder.direct`; marcada por defecto al elegir La Línea).
Una orden directa:

- No pide motores ni ubicación (queda "Mostrador") y nace **en curso**, sin
  presupuesto ni asignación.
- La coge cualquier técnico con `orders:assignable` al fichar en ella:
  `startWorking` le asigna como "Autorizado" y lo anota (`DIRECT_ORDER_TAKEN`).
  Las abiertas salen en Asignaciones, en "Trabajos de mostrador".
- Los técnicos anotan lo hecho en **Trabajos realizados**
  (`WorkOrderWorkLine`); cada uno puede corregir lo suyo mientras está en
  curso, y administración cualquier línea en cualquier momento (queda en el
  historial como `WORK_LINES_EDITED`).
- Se termina sin fotos obligatorias. Al marcarla como **ajustada**, el
  protocolo de servicio se registra solo como "no procedía"; al marcarla como
  **facturada** se genera el **parte de trabajo** (`workReportPdf.js`, en
  `work-orders/{código}/parte-de-trabajo.pdf`, `WorkOrder.workReportUrl`): lo
  pedido, lo realizado, los materiales si los hay y las horas, redondeadas como
  en el registro de horas.
- Creada desde una cita con orden de visita, a diferencia de una orden
  normal, conserva a los técnicos de la visita y no les cierra el turno: el
  trabajo sigue sin esperar a ningún presupuesto.
- `WorkOrderMaterial` existe para anotar materiales más adelante; la app aún no
  los escribe, pero el parte ya los imprime si los hay.

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
  queda en casa y **no cuenta como venta ni ocupa número**. `wallpaperUrl` es
  el fondo de pantalla de esa unidad: siempre de 480 × 272 píxeles, el tamaño
  de la pantalla del EBcontroller, y se comprueba al elegir el archivo.
- **EbCableType** — catálogo de cables (código `EBEN…` y nombre). Se puede
  eliminar solo mientras no lo use ninguna comprobación ni ninguna venta.
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
  hay ficha. Completarlas las saca del panel pero mantiene sus días;
  **CalendarAppointmentDate** guarda un día por fila, igual que las órdenes.
  Tienen dos textos: `notes` es el trabajo que hay que hacer (la segunda línea
  del chip) y `remarks` son notas libres que se escriben en cualquier momento,
  también después de completarla. La localización es una de las tres
  (`locationCode`) u otra en texto libre (`customLocation`, "Cádiz"), nunca
  las dos: una visita puede ser lejos de los talleres. También puede llevar
  el número de orden interno (`externalCode`) si el trabajo ya tiene orden
  en el sistema de facturación; al crear la orden desde la cita, pasa a ella.

Una cita nace de dos formas: desde el panel "Citas sin orden", sin día, y se
coloca después con los chips de la semana; o pulsando un día en la vista Mes,
que la crea ya colocada en ese día. En esa vista, pulsar una orden la abre y
pulsar una cita la abre para editarla. Solo administración (o `admin:lab`)
puede crear y editar; los técnicos ven el calendario sin tocarlo.

Al **completar** una cita se elige cómo acabó, y su ficha cambia de color
(ámbar mientras está pendiente):

- **Sin orden**: pasa a gris. Se puede reabrir desde "Ver citas completadas".
- **Con orden** (solo quien tiene `orders:create`): se abre Nueva orden
  rellenada con la localización, la embarcación, el trabajo como primera tarea
  y los comentarios. Si la cita era en otro sitio, ese texto va a la ubicación
  de la embarcación y la localización de la orden queda por elegir. La cita no cambia hasta que esa orden se guarda: entonces
  `createWorkOrder` la completa y la enlaza (`workOrderId`), pasa a morado y su
  ficha lleva a la orden. Si se sale del formulario sin crearla, la cita sigue
  pendiente. Una cita con orden no se puede reabrir ni eliminar, y el
  historial de la orden anota de qué cita salió (metadata de `ORDER_CREATED`).

Cada ficha de la vista Mes se lee igual sea orden o cita: la embarcación, lo
que hay que hacer debajo (las tareas de la orden, o el "qué hay que hacer" de
la cita) y la localización. Una cita sin embarcación sube el trabajo a la
primera línea. La vista Semana añade cliente, código, estado y técnicos, y
muestra también la localización de cada orden.

**Técnicos en una cita.** Para mandar técnicos a una cita y que fichen, la
cita tiene su propia orden interna, igual que las de taller
(`WorkOrder.visitAppointmentId`, código `CITA-NNNNNN`, en curso, sin cliente
real ni presupuesto). La crea `openAppointmentVisit` la primera vez que alguien
con `admin:assigntechnicians` pulsa "Asignar técnicos" en la cita, y desde ahí
es una orden más: "Añadir técnicos", "Trabajar en esta orden", Turnos, registro
de horas. No sale en la lista de órdenes ni en "Órdenes asignadas" del
calendario; en Asignaciones se lee como "Cita · título".

Sigue a su cita: al completarla se completa (cerrando los turnos abiertos), al
reabrirla vuelve a estar en curso, y no se puede eliminar una cita con horas
fichadas. Si de la cita sale una orden, `createWorkOrder` convierte esa orden
interna en la nueva (código real, cliente, embarcación, trabajos), así que las
horas de la visita quedan en la orden; empieza en "Pendiente de presupuesto"
con nadie asignado.

**Fotos y "realizada".** Una cita tiene sus propias fotos
(`CalendarAppointmentPhoto`, en Storage bajo `appointments/{id}/photos/`):
administración las pone desde la cita y los técnicos asignados desde su orden
de la cita (`addAppointmentPhotos` comprueba quién). Al crear una orden desde
la cita se copian a ella con etapa `APPOINTMENT`. El técnico marca la cita como
realizada (`markAppointmentDone`, `CalendarAppointment.doneAt`): le cierra el
turno si seguía en ella y avisa a quien creó la cita, pero cerrarla sigue
siendo cosa de administración, que decide si hay orden o no. Reabrir la cita
quita la marca.

## Lo que no está en PostgreSQL

- **Firestore**: el chat de cada orden (`clientChats/{orderId}`,
  `technicianChats/{orderId}`), los tokens de dispositivo para notificaciones,
  el espejo `adminUsers` y los contadores de secuencia.
- **Storage**: informes, presupuestos, fotos y firmas — ver
  [integraciones.md](integraciones.md).
- **Otro proyecto de Firebase**: las valoraciones de las tablets.

# Permisos

Hay tres formas de autorizar una acción, y conviene distinguirlas:

1. **Rol** (`ADMIN`, `TECHNICIAN`, `CLIENT`) — abre secciones enteras.
2. **Permiso** (`orders:closing`, `ratings:view`…) — abre acciones concretas.
   Se crean en Administración → Usuarios y se conceden por usuario. La clave
   cumple `^[a-z]+:[a-z]+$`.
3. **Asignación** — para un técnico, estar asignado a esa orden. No es un
   permiso: se comprueba contra `TechnicianAssignment` en cada llamada.

`admin:lab` funciona como puente de pruebas: donde se exige rol ADMIN, se acepta
también este permiso.

Rol y permisos viajan en los custom claims del token, así que **cualquier cambio
exige volver a iniciar sesión**.

## Catálogo

| Clave | Para qué |
|---|---|
| `orders:create` | Crear órdenes y corregir sus trabajos a realizar |
| `orders:notes` | Ver y añadir notas internas de la orden |
| `orders:closing` | Ajustar, registrar protocolo y facturar (y ver esa parte del historial) |
| `orders:delete` | Eliminar órdenes (borrado blando) |
| `orders:forcecomplete` | Completar una orden sin pasar por el flujo del técnico |
| `orders:assignable` | Puede ser asignado a órdenes como técnico |
| `assignments:view` | Ver la sección de Asignaciones |
| `admin:reopen` | Revertir ajustada / protocolo / facturada |
| `admin:manage` | Gestionar usuarios, permisos, clientes, embarcaciones, motores y turnos |
| `admin:lab` | Acceso a pruebas en producción; hace de bypass del rol ADMIN |
| `quotes:upload` | Subir presupuestos |
| `quotes:approve` | Aceptar o rechazar un presupuesto |
| `hours:log` | Fichar horas en una orden |
| `photos:upload` | Subir fotos de la orden |
| `chat:write` | Escribir en el chat de la orden |
| `users:changepassword` | Cambiar la contraseña de un usuario directamente |
| `ratings:view` | Ver las valoraciones de las tablets |

## Dónde se comprueba cada función

Todas son *callables* salvo donde se indique. La comprobación ocurre **en el
servidor**; que la interfaz esconda un botón no es la protección.

### Órdenes

| Función | Exige |
|---|---|
| `createWorkOrder` | `orders:create` o `admin:lab` |
| `updateWorkOrderTasks` | `orders:create` o `admin:lab`, y orden no completada ni cancelada |
| `addQuote` | `quotes:upload` o `admin:lab` |
| `acceptQuote` | `quotes:approve` |
| `assignTechnicians` | solo autenticado, más el estado correcto de la orden |
| `startOrder`, `completeOrder` | estar asignado con `isAllowed` o `isLead` |
| `reportIncident`, `toggleWorkOrderTask` | estar asignado a la orden |
| `startWorking`, `stopWorking` | autenticado; el fichaje es del propio usuario |
| `forceCompleteOrder` | `orders:forcecomplete` |
| `deleteWorkOrder` | `orders:delete` |
| `addOrderNote` | `orders:notes` |
| `setWorkOrderExternalCode` | rol ADMIN o `admin:lab` |
| `adminUpdateTimeLog`, `adminDeleteTimeLog` | `admin:manage` |

### Cierre administrativo

| Función | Exige |
|---|---|
| `adjustOrder`, `recordServiceProtocol`, `invoiceOrder` | `orders:closing`, y el paso anterior registrado |
| `revertAdminProcessStep` | `admin:reopen`, y que sea el último paso registrado |

### Calendario

`setWorkOrderScheduledDate` y las cinco funciones de citas
(`createCalendarAppointment`, `updateCalendarAppointment`,
`setCalendarAppointmentClosed`, `deleteCalendarAppointment`,
`setCalendarAppointmentScheduledDate`) exigen rol ADMIN o `admin:lab`. Los
técnicos ven el calendario pero no lo editan.

### EB Engineering

Todas las funciones `eb*` exigen rol ADMIN o `admin:lab`: clientes, ventas,
cables, pantallas, noticias y FAQ. La excepción es `ebTranslateEbContent`, que
solo pide estar autenticado porque la usan los propios clientes al leer las
noticias en su idioma.

### Administración

Todas las `admin*` (usuarios, permisos, clientes, embarcaciones, motores,
dispositivos) exigen `admin:manage`, salvo `changeUserPassword`, que exige
`users:changepassword`.

### Valoraciones

`listServiceRatings` y `exportRatingsPdf` exigen `ratings:view`.

## Puntos a revisar

- **`assignTechnicians` solo comprueba que haya sesión iniciada.** Valida el
  estado de la orden y detecta ediciones concurrentes, pero no pide ningún
  permiso: cualquier usuario autenticado que conozca el id de una orden podría
  cambiar sus técnicos. Encaja un `orders:create` o un permiso propio.
- **`sendPushNotification` tampoco pide permiso**, solo sesión.
- `syncUserClaims` es deliberadamente abierta: la llama el propio cliente para
  refrescar sus claims.

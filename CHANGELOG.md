# Historial de cambios

Lo que ha ido cambiando en PortalEB, de lo más reciente a lo más antiguo.

Para saber qué versión tienes abierta, mira el pie de página: `v<código> · fecha`.
Esa fecha es la de la compilación, y te dice hasta qué día de esta lista incluye
tu versión.

## 24 de septiembre de 2026

- La lista de órdenes se actualiza sola: cada minuto mientras está a la vista,
  y al volver a la pestaña. No se pierden los filtros ni el sitio donde estabas.

## 22 de septiembre de 2026

- Se puede rechazar un presupuesto desde la orden, con el permiso nuevo
  `quotes:reject`. La orden queda en "Presupuesto rechazado", con el rechazo
  en su historial, y admite un segundo presupuesto.
- La lista de órdenes muestra los trabajos de cada orden en su tarjeta, con
  los ya hechos tachados.
- En la vista semanal del calendario, cada cita pendiente tiene un botón para
  cambiar sus días: una ventana con los días que ya tiene, los de la semana en
  pantalla y una casilla de fecha para cualquier otro día.

## 21 de septiembre de 2026

- Corregido: no se podían crear órdenes nuevas que no salieran de una cita.
  Daba el error "Cita inválida".

## 11 de septiembre de 2026

- La lista de "Permisos concedidos" del panel solo la ve quien tiene `admin:lab`.
- El botón Volver, el logo y Salir pasan a la barra de arriba, junto al nombre
  del usuario. El panel pierde su cabecera y todas las pantallas ganan espacio.
- Las citas del calendario se pueden completar con o sin orden de trabajo:
  - Sin orden, la cita queda en gris y se puede reabrir.
  - Con orden (quien tiene `orders:create`), se abre Nueva orden rellenada con
    los datos de la cita. Al guardar la orden, la cita pasa a morado, queda
    enlazada y su ficha lleva a la orden.
  - "Completar" sustituye a "Cerrar".

## 10 de septiembre de 2026

- Las órdenes de la vista semanal del calendario muestran dónde está el trabajo.
- Las fichas de la vista Mes muestran el barco, el trabajo y la localización.
- Las pantallas de los técnicos (Asignaciones y la orden) muestran la espera
  al fichar, marcar trabajos o subir fotos, y avisan si algo falla. Sin
  cobertura, el aviso lo dice claramente en lugar de "internal".
- El pie de página muestra la versión cargada.
- La vista Mes del calendario ocupa toda la pantalla, y pulsar un día crea una
  cita en ese día.

## 9 de septiembre de 2026

- Se puede eliminar un tipo de cable, con confirmación y solo si no se usa.
- Las últimas pantallas de EB Engineering que no mostraban la espera al
  guardar ya lo hacen.

## 8 de septiembre de 2026

- Seguridad: asignar técnicos exige el permiso `admin:assigntechnicians`, y
  enviar notificaciones, `admin:lab`.

## 7 de septiembre de 2026

- Se pueden corregir los trabajos de una orden ya creada, mientras no esté
  completada. El PDF se rehace y el cambio queda en el historial.
- Pantalla de espera al guardar o borrar en EB Engineering.

## 3 de septiembre de 2026

- Citas en el calendario sin orden de trabajo detrás, con la embarcación en
  texto libre.

## 1 de septiembre de 2026

- Fuera los dos botones de prueba de lab del panel.
- Ranking de ventas de EBcontroller por país, con gráfico de tarta.
- Las ventas de EBcontroller se editan en una ventana que confirma los cambios.
- Una venta de EBcontroller se puede marcar como uso interno: no cuenta en el
  total de ventas ni gasta número.

## 31 de agosto de 2026

- Filtro de la lista de órdenes por paso administrativo.
- Corregido: las listas dejaban de mostrar datos a partir del registro 100 (se
  notó con los clientes de EB Engineering).
- Se pueden revertir Ajustada, Protocolo y Facturada desde la orden, con
  permiso y quedando registrado quién lo hizo.

## 28 de agosto de 2026

- El número de serie de una venta de EBcontroller sale de su pantalla, y cada
  unidad lleva una sola pantalla.

## 26 de agosto de 2026

- Seguridad: la app de valoraciones solo puede crear valoraciones, no leerlas.

## 25 de agosto de 2026

- Pantalla de valoraciones del servicio, con informe PDF por periodo.

## 20 de agosto de 2026

- Las pantallas PV450 se controlan como stock con número de serie, y se puede
  corregir su referencia, modelo o serie.
- El stock tiene su propia pestaña y admite dar de alta unidades a mano.

## 17 de agosto de 2026

- Tabla de stock de cables en la pestaña Cables.
- Se pueden borrar las comprobaciones de cable sin asignar, y se ve a qué
  producto está asignada cada una.

## 13 de agosto de 2026

- Las órdenes se pueden eliminar (quedan archivadas) y administración puede
  completar una orden directamente.
- Clientes de EB Engineering con desplegable de país y banderas. El filtro de
  país solo lista países con ventas.
- El tipo de cable aparece junto al número de registro en la lista de
  productos.

## 7 de agosto de 2026

- Los clientes de EB Engineering entran por el login normal y llegan
  directamente a sus productos.
- Su página está traducida entera, con selector de 15 idiomas, y las noticias
  y preguntas frecuentes se traducen automáticamente.
- Fichas de EBcontroller al estilo del cliente, con foto real y versión de
  software. Las unidades dadas de baja no se muestran a los clientes.
- Corregido: notificaciones que llegaban duplicadas.

## 4 de agosto de 2026

- Número de orden del gestor interno en cada orden, y búsqueda por él.
- La lista de órdenes muestra el estado del proceso administrativo, el número
  de incidencias y un acceso al chat de técnicos.
- Aviso de mensajes sin leer en la orden.
- Calendario: las completadas en otro color, nombre del barco, opción de ver
  fines de semana y lista de tareas.

## 3 de agosto de 2026

- Proceso administrativo tras completar una orden: Ajustada, Protocolo y
  Facturada.
- Logos de EB Engineering, Elías Blanco y Bureau Veritas en el PDF de la orden.
- Notas en la orden. Cliente y embarcación en una sola ficha, y un único visor
  para el informe y los presupuestos.

## 30 de julio de 2026

- Se puede vincular un cable registrado (comprobado con el ESP32) a una venta
  de EBcontroller.

## 21 de julio de 2026

- Nuevo icono de la app.
- Los códigos de tipo de cable pierden el guion (EBENxxxxxx).

## 20 de julio de 2026

- Comprobador de cables ESP32: registra cada comprobación, y se ven en
  Productos, que se divide en EBcontroller y Cables.

## 15 de julio de 2026

- Un EBcontroller vendido a un distribuidor se puede revender a un cliente
  final, guardando la fecha.

## 14 de julio de 2026

- EBcontroller: observaciones, baja de unidades y número de venta.
- Formulario de Orden de Reparación (intervenciones, de momento solo lab) y su
  lista.
- Al asignar una orden hace falta exactamente un jefe de orden.

## 13 de julio de 2026

- EB Engineering: clientes con acceso al portal, distribuidores y ventas de
  EBcontroller.
- El chat admite fotos, vídeos y documentos, y la orden reúne todos los
  archivos de sus chats.
- Los técnicos pueden sacar fotos y vídeos directamente con la cámara.
- El nombre del usuario aparece en todas las pantallas.
- Notificaciones sin duplicados y gestión de los dispositivos de cada usuario.
- Se pueden borrar permisos sin usar.

## 12 de julio de 2026

- Técnicos y administración ven el calendario; solo administración lo edita.
- Editor de texto con formato para las noticias de EB Engineering.

## 11 de julio de 2026

- Primera versión de la sección EB Engineering.

## 10 de julio de 2026

- Calendario semanal y mensual para planificar las órdenes asignadas, en uno
  o varios días.
- Los técnicos marcan las tareas hechas, y se ve en el calendario.
- Se pueden añadir más técnicos a una orden ya asignada.
- Aviso del turno activo en la app y por notificación, y minutos trabajados
  por técnico.
- Administración puede corregir o borrar un turno ya cerrado.
- Hace falta al menos una foto para empezar y para terminar una orden. Las
  incidencias admiten fotos y vídeos (hasta 20 s y 20 MB).
- Estados de la orden con color, y filtro para ocultar las completadas.
- Cambio de contraseña desde Administración.
- El PDF de la orden y todos los pasos de la orden pasan a hacerse en el
  servidor.
- Seguridad: permisos comprobados también al subir y ver archivos.

## 9 de julio de 2026

- Pantalla de Asignaciones: empezar y terminar órdenes, incidencias y fichaje
  de entrada y salida, con el historial de turnos por técnico.
- Presupuestos en PDF (añadir y aceptar) y asignación de técnicos en la orden.
- Chat en tiempo real por orden, con el cliente y entre técnicos, y
  notificación con cada mensaje.
- Notificaciones al asignar técnicos.
- Los clientes solo ven sus órdenes.
- Gestión de permisos por usuario.

## 8 de julio de 2026

- Primera versión: portal instalable como app, con login y permisos.
- Crear órdenes de trabajo con informe PDF, lista con filtros y detalle.
- Administración de usuarios, clientes y embarcaciones.

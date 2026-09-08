# PortalEB

Portal de gestión del taller de **Elías Blanco** (naval e industrial): órdenes
de trabajo desde el presupuesto hasta la factura, calendario de trabajo, chat
por orden, fichajes de los técnicos y una sección propia, "EB Engineering",
para el producto EBcontroller y sus clientes internacionales.

Aplicación web instalable (PWA) sobre Firebase, en producción en
https://portaleb.web.app.

## Puesta en marcha

```bash
npm install
npm run dev
```

> **Ojo:** el servidor de desarrollo apunta al **backend de producción**. Todo
> lo que crees, edites o borres desde él son datos reales.

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprobación de tipos (`tsc -b`) y compilación |
| `npm run lint` | oxlint |
| `npm run preview` | Sirve lo compilado |

## Cómo está montado

- **React + TypeScript + Vite + Tailwind** en el navegador.
- **Firebase Data Connect (PostgreSQL)** como base de datos principal.
- **Cloud Functions** para toda escritura: validan permisos, releen el estado
  del servidor y registran lo que hacen.
- **Firestore** solo para el chat de cada orden, **Storage** para informes,
  presupuestos, fotos y firmas, y **Auth** para identidad, con el rol y los
  permisos en los custom claims.

```
src/pages        una página por pantalla
src/lib          llamadas a las Cloud Functions y utilidades
functions        todas las Cloud Functions (un solo archivo)
dataconnect      esquema y consultas
docs             documentación del proyecto
```

## Documentación

| Documento | Qué responde |
|---|---|
| [docs/dominio.md](docs/dominio.md) | Qué entidades existen y cómo se relacionan |
| [docs/permisos.md](docs/permisos.md) | Quién puede hacer qué, y dónde se comprueba |
| [docs/despliegue.md](docs/despliegue.md) | Qué se despliega, en qué orden y qué mirar después |
| [docs/integraciones.md](docs/integraciones.md) | Comprobador de cables, valoraciones, traducciones, notificaciones y archivos |
| [docs/diagrams/](docs/diagrams/) | Los flujos principales en diagramas interactivos |
| [CLAUDE.md](CLAUDE.md) | Convenciones y trampas conocidas al tocar el código |

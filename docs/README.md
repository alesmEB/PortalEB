# Documentación de PortalEB

| Documento | Qué responde |
|---|---|
| [dominio.md](dominio.md) | Qué entidades existen y cómo se relacionan |
| [permisos.md](permisos.md) | Quién puede hacer qué, y dónde se comprueba |
| [despliegue.md](despliegue.md) | Qué se despliega, en qué orden y qué mirar después |
| [integraciones.md](integraciones.md) | Lo que vive fuera de la base de datos: dispositivo de cables, valoraciones, traducciones, notificaciones y archivos |
| [diagrams/](diagrams/) | Los mismos flujos en diagramas interactivos |
| [../CHANGELOG.md](../CHANGELOG.md) | Qué ha cambiado en la app y cuándo |

Para trabajar en el código, el punto de entrada es [`CLAUDE.md`](../CLAUDE.md) en
la raíz: convenciones, trampas conocidas y cómo se despliega.

## En una frase

Portal de gestión del taller de Elías Blanco: órdenes de trabajo desde el
presupuesto hasta la factura, con calendario, chat por orden y app para
técnicos; más una sección propia, "EB Engineering", para el producto
EBcontroller y sus clientes internacionales.

## Cómo está montado

React + TypeScript + Vite en el navegador. Firebase detrás: **Data Connect
(PostgreSQL)** para casi todo, Firestore solo para el chat, Storage para
archivos, Auth para identidad y Cloud Functions para toda escritura.

La regla que explica el resto: **el navegador lee directamente de Data Connect,
pero nunca escribe**. Cada escritura es una función callable que comprueba
permisos, vuelve a leer el estado del servidor y registra lo que hizo. Está
dibujado en [diagrams/camino-de-datos.architecture.json](diagrams/camino-de-datos.architecture.json).

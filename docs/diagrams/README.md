# Diagramas

Especificaciones de los diagramas de PortalEB, en el formato de
[Archify](https://github.com/tt-a1i/archify). Aquí solo vive el `.json`: el HTML
resultante pesa unos 700 KB y se regenera en un comando, así que no se guarda en
el repo.

| Archivo | Qué explica |
|---|---|
| `orden-de-trabajo.workflow.json` | El ciclo de una orden: presupuesto, aceptación o rechazo, asignación, ejecución y cierre |
| `proceso-administrativo.lifecycle.json` | Lo que ocurre después de completarla: ajustada → protocolo → facturada, y la reversión |
| `camino-de-datos.architecture.json` | Por dónde entran y salen los datos: lecturas desde el navegador, escrituras siempre por Cloud Functions |
| `informe-pdf.dataflow.json` | Cómo se genera el PDF de la orden y por qué se rehace al corregir los trabajos |
| `registro-de-cable.sequence.json` | Qué ocurre cuando el comprobador ESP32 registra un cable |
| `venta-ebcontroller.lifecycle.json` | La vida de una unidad EBcontroller: stock, venta, reventa, uso interno y baja |

## Regenerar

Con la skill instalada en `~/.agents/skills/archify`:

```bash
node ~/.agents/skills/archify/bin/archify.mjs deliver workflow docs/diagrams/orden-de-trabajo.workflow.json orden-de-trabajo.html --quality showcase
```

Cambia `workflow` por `lifecycle` o `architecture` según el archivo. El
comando `validate` (mismos argumentos, sin el HTML de salida) comprueba la
especificación sin generar nada.

**Si cambia el código, actualiza el `.json`.** Un diagrama desactualizado
engaña más que la ausencia de diagrama, y aquí no hay nada que avise.

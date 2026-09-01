# pH Cultivos Field

Aplicación web progresiva para que un técnico registre un muestreo rápido de pH en lotes de café.

Este proyecto es independiente de `pH-cultivos`. La primera versión se concentra en un flujo corto:

1. Seleccionar una finca y un lote ficticios.
2. Recorrer el lote en zigzag.
3. Registrar 10 puntos para lotes de hasta 2 ha o 15 puntos para lotes mayores.
4. Obtener un pH representativo mediante la mediana.
5. Guardar la jornada localmente.

## Funciones del piloto

- Café como único cultivo.
- Fincas y lotes de demostración, sin datos personales.
- Área y año de siembra por lote.
- Captura de pH por Bluetooth o ingreso manual.
- Actualización activa de la lectura Bluetooth durante el recorrido y después de guardar cada punto.
- Temperatura y paquete original cuando la lectura proviene del YINMIK YK-S01.
- Ubicación opcional en cada punto.
- Detalle de cada punto con coordenadas, precisión y enlace al mapa.
- Exportación CSV mediante descarga o la hoja de compartir del teléfono.
- Resultado con mediana, rango observado y puntos en el rango adecuado.
- Guardado local y funcionamiento sin conexión después de la primera carga.

## Bluetooth

El lector usa Web Bluetooth con el protocolo verificado del YINMIK YK-S01:

- Servicio: `FF01`
- Característica: `FF02`
- Notificaciones de 45 bytes

En Android se recomienda Chrome. En iPhone, Web Bluetooth requiere un navegador compatible como Bluefy. La entrada manual continúa disponible en cualquier navegador.

## Datos

Los datos se guardan únicamente en el almacenamiento local del navegador bajo claves exclusivas de esta aplicación. No se envían a un servidor. Si se borran los datos del navegador o se elimina la aplicación, las jornadas pueden perderse.

Los resultados son orientativos. Las decisiones de fertilización o encalado deben confirmarse con análisis de laboratorio y criterio técnico.

## Archivos

- `index.html`: interfaz de tres pasos.
- `styles.css`: diseño móvil.
- `logic.js`: clasificación, resumen y decodificación Bluetooth.
- `app.js`: flujo, almacenamiento, GPS y conexión con el medidor.
- `service-worker.js`: caché offline.
- `manifest.json`: instalación como PWA.

## Pruebas

```bash
node tests/logic.test.js
```

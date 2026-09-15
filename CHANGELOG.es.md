# Changelog

Todos los cambios relevantes de Minetune se registran aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

Tipos de cambio: **Añadido** (novedades), **Cambiado** (cambios en lo que ya
existía), **Obsoleto** (se quitará en una versión futura), **Eliminado**, **Corregido**
(errores) y **Seguridad** (vulnerabilidades).

## [0.3.2] - 2026-09-15

### Corregido

- En Minecraft 26.2 con el servidor en modo offline, el juego rechazaba la entrada por la
  puerta con "Failed to decode packet login_finished": el 26.2 añadió un dato más al final
  del inicio de sesión. La puerta ahora usa el formato de cada versión.

## [0.3.1] - 2026-09-15

### Corregido

- En una instalación nueva el servidor arranca en modo online (cuentas originales) y la
  puerta rechazaba a todos con "Algo salió mal". En modo online la puerta ahora solo
  reenvía las conexiones, porque el propio Minecraft ya garantiza el nick de cada uno; la
  contraseña por nick vale en modo offline. La pantalla Jugadores indica en cuál está.

## [0.3.0] - 2026-09-15

Contraseña por nick dentro del juego, varios mundos con subida y descarga, panel y sitio
en tres idiomas y todo listo para instalar desde EasyPanel y Umbrel.

### Añadido

- **IP real de los jugadores detrás de un túnel**: con "Proxy Protocol" activado en
  playit.gg (o en frp), la puerta lee la IP de cada jugador, y los baneos y límites se
  aplican por persona. Solo acepta esa cabecera desde la propia máquina o la red local.
- **playit.gg sin red del host** (`compose.tunnel-bridge.yaml`), para Docker Desktop en
  Mac y Windows, y guía para abrir el servidor: redirección de puertos, túneles que
  funcionan con Minecraft Java y firewall de VPS en Oracle, Hetzner, Hostinger y Magalu Cloud.
- **Plantilla de EasyPanel** generada a partir de `deploy/compose.yaml`, con las
  contraseñas creadas al instalar, y app de Umbrel lista para la tienda de la comunidad:
  una contraseña derivada para cada uso, datos dentro de la carpeta de la app y versión
  fija de las imágenes.
- **Puerta Minetune: contraseña por nick dentro del juego**. La primera vez que
  alguien entra, una ventana del propio Minecraft pide crear una contraseña, y luego
  se pide en cada entrada. Nadie entra con el nick de otra persona, echa a quien ya
  está jugando ni toca el mundo antes de la contraseña. Funciona con Paper, Vanilla,
  Fabric y NeoForge desde Minecraft 1.21.6, sin plugin ni mod, y usa unos 30 MB de
  RAM. En Jugadores se puede desactivar la contraseña y restablecer la de alguien. En
  Paper, el servidor solo acepta a quien llega por la puerta y sigue viendo la IP real
  de cada jugador. Inicio avisa si la puerta se detiene, y activar la contraseña con
  gente jugando desconecta solo a quien entró sin ella.
- **Mapa de semillas en el sitio**: escribe una semilla y mira los biomas, las estructuras
  (aldeas, fortalezas, mansiones, ciudades antiguas, cámaras de desafío y más) y el
  punto de aparición, de Minecraft Java 1.18 a 26.2, en el Overworld, el Nether y el End.
  El cálculo corre en el navegador con cubiomes compilado a WebAssembly y se
  comprobó con un servidor 26.1.2 real. Al hacer clic en un punto o en una
  estructura se abren las coordenadas con el comando de teletransporte listo, ya con la
  altura del suelo calculada.
- **Dirección pública en el panel**: `PUBLIC_ADDRESS` en el `.env` define lo que aparece
  en "Cómo entrar" (dominio o dirección del túnel). Sin ella, el panel avisa cuando la
  dirección mostrada solo funciona en el mismo equipo o en la misma red.
- **Lista blanca desde el menú de quien está jugando**: "Añadir a la lista blanca" (o
  "Quitar de la lista blanca") junto a operador, expulsar y banear.
- **Varios mundos**: crea, renombra, borra y cambia el mundo encendido desde la pantalla
  Mundos. Cada mundo guarda su propia configuración, plugins y listas de
  lista blanca, operadores y baneados; un mundo nuevo empieza sin jugadores.
- **Bloqueos de compatibilidad**: el panel no deja cambiar un mundo guardado por
  Paper a Vanilla, Fabric o NeoForge (el servidor fallaba al encender) ni volver un
  mapa a una versión más antigua, y explica el motivo en el propio campo.
- **Panel y sitio en inglés y español**, además del portugués. El idioma sigue al
  navegador y se puede cambiar en el inicio de sesión y en Apariencia; el sitio ganó `/en/` y `/es/`.
- **Cinco logos nuevos**: creeper con palanca, rack de redstone, lámpara de
  redstone, bloque de comandos y creeper de redstone.
- **Imágenes publicadas y despliegue sin el código fuente**: `minetune-panel`,
  `minetune-mc` y `minetune-backup` en GitHub Container Registry (amd64 y arm64),
  el `deploy/compose.yaml` para pegar en EasyPanel y una Community App Store para Umbrel.
- **Explicación en el "?" de todas las opciones**: las 59 reglas del juego y todos
  los ajustes dicen en una frase lo que cambian en el juego, en los tres idiomas.
- **Subir, descargar y recuperar mundos**: sube un mundo en .zip desde la pantalla Mundos,
  descarga cualquier mundo (el encendido sin desconectar a nadie) y recupera un solo mundo
  de una copia de seguridad. La subida revisa el archivo antes de descomprimir y explica qué
  está mal: programas y scripts, rutas que salen de la carpeta, "zip bombs", mundos de Bedrock
  y archivos que no son de un mundo se rechazan; de la configuración del archivo solo entran
  las opciones conocidas del panel.

### Cambiado

- En el móvil, el menú lateral se abre como cajón y los modales aparecen centrados.
- Agente de playit.gg en la versión 1.0.
- Memoria del servidor en GB, solo con números; el panel muestra el máximo que cabe en la máquina.
- Mapa de semillas: brújula marcando el punto de aparición, cursor de mira, resaltado al pasar
  el ratón sobre una estructura y marca en el punto donde haces clic.
- Componentes de Tucano en la versión 0.33.
- Sitio con las capturas del panel en inglés y español y pie de página solo con Inicio,
  Mapa de semillas, Changelog y GitHub.

### Corregido

- Los jugadores que entraban por el túnel (playit) o por un proxy eran rechazados cuando
  alguien acababa de entrar: todos llegan con la misma IP y Paper limitaba
  una conexión cada 4 segundos por IP. El límite queda desactivado.
- Un texto pegado por error en el nombre del mundo se convertía en una carpeta con la frase entera;
  ahora los nombres con aspecto de frase se rechazan al crear o renombrar.

## [0.2.0] - 2026-09-13

Panel pensado para quien no es técnico: todas las pantallas con un mismo patrón, pantalla Inicio
con avisos, versiones oficiales de Minecraft, destino de las copias de seguridad desde el panel y
sitio oficial con SEO y GEO.

### Añadido
- Sitio en GitHub Pages con página de inicio y changelog, con el mismo aspecto que el panel.
  El changelog del sitio se genera a partir de este archivo en cada push.
- Imagen de vista previa (Open Graph, 1200×630) para los enlaces del sitio en WhatsApp,
  Discord, X y LinkedIn.
- SEO y GEO en el sitio oficial: datos estructurados (software, autor, preguntas
  frecuentes y ruta del changelog), `sitemap.xml`, `robots.txt` que permite
  buscadores y asistentes de IA, `llms.txt` con el resumen del proyecto y sección de
  preguntas frecuentes visible en la página.
- Selector de versiones de Minecraft en Configuración, con la lista oficial de cada
  software (Paper, Purpur, Fabric, NeoForge y Vanilla), las más recientes primero,
  opción de usar siempre la más reciente y versiones de prueba ocultas por defecto.
- Aviso cuando la versión elegida necesita otra imagen de Java, con el cambio
  exacto de `MC_IMAGE_TAG`, y cuando el cambio vuelve a una versión más antigua
  que la del mundo.
- Destino de las copias de seguridad configurable desde el panel (Copias de seguridad → Dónde guardar): disco local,
  Cloudflare R2, AWS S3, S3 propio (RustFS/MinIO) o repositorio restic
  avanzado, con frecuencia, retención, pausa sin jugadores y límite de subida.
- Botón "Probar conexión", que comprueba el destino antes de guardar y explica en
  lenguaje sencillo credencial rechazada, bucket inexistente, contraseña distinta o dirección
  inaccesible.
- Al guardar, el repositorio se crea si el destino está vacío y el programador
  se reinicia ya con la nueva configuración, sin `make up`.
- Pantalla Inicio con el estado del servidor en una frase, "Cómo entrar al servidor" con
  dirección para copiar y "Necesita atención" reuniendo los avisos (servidor
  apagado, memoria llena, juego con tirones, copia solo local o antigua) con el botón
  que resuelve cada uno.
- Uso del procesador en la pantalla Inicio, en porcentaje de la capacidad total de la
  máquina y con barra, junto a jugadores, memoria y rendimiento.
- Interruptor "Solo pueden entrar jugadores de la lista blanca" directamente en la página de Jugadores, aplicado
  al momento con el servidor encendido.
- "Opciones avanzadas": los nombres técnicos y los ajustes fáciles de romper quedan ocultos
  hasta que la persona activa la opción.

### Cambiado
- Todas las pantallas siguen el mismo patrón: ruta en las subpáginas, título con una
  frase, acciones de la página a la derecha, avisos con el botón que resuelve, tarjetas y
  barra de guardar solo en formularios. La carga y los errores aparecen en lugar del
  contenido, con "Intentar de nuevo", sin ocultar el título.
- Menú reorganizado según lo que hace la persona: Principal (Inicio, Jugadores, Reglas
  del juego), Servidor (Configuración, Plugins y mods, Copias de seguridad) y Avanzado (Consola).
- Textos en lenguaje de jugador: administradores en lugar de op, lista de
  invitados en lugar de whitelist, rendimiento en lugar de TPS, copias de seguridad
  en lugar de snapshots.
- Jugadores: expulsar y banear están en el menú "Más" de cada persona.
- Reglas del juego: la búsqueda y las categorías filtran dentro de la propia tarjeta.
- El contenedor `backup` pasa a cargar `config/backup.env` en cada inicio. El
  archivo tiene prioridad sobre el `.env`, se guarda con permiso 600 y queda fuera
  de git. Sin él, todo sigue viniendo del `.env` como antes.
- Las copias de seguridad manuales respetan el mismo límite de subida que el programador.

### Corregido
- En la página de Jugadores, la tarjeta de Operadores vacía dejaba un espacio en
  blanco debajo; ahora el aviso llena la tarjeta como en la lista blanca.
- El selector de frecuencia de las copias de seguridad se cerraba solo justo después de abrirse, sin dar
  tiempo a elegir.
- En monitores anchos, el contenido del panel se quedaba en 1240px pegado a la izquierda;
  ahora acompaña la pantalla hasta 1680px y queda centrado.

## [0.1.0] - 2026-09-12

Primera versión: servidor, copias de seguridad, panel web y documentación.

### Añadido

#### Servidor
- Stack de Docker Compose con los servicios `mc`, `backup`, `panel` y `docker-proxy`.
- Servidor sobre `itzg/minecraft-server` con Java 25; Paper 26.2 por defecto y
  opción de Purpur, Fabric, NeoForge o Vanilla.
- Configuración del juego en `config/server.env`, cargada en cada inicio: basta
  con reiniciar para aplicar.
- Plugins y mods declarados por loader en `config/modrinth/<loader>.txt`.
- Parches de rendimiento de Paper (explosiones, redstone Alternate Current, límites
  de entidades) y Chunky para pregenerar el mundo.
- Flags de GC de Aikar activadas por defecto.
- Crossplay con Bedrock mediante Geyser y Floodgate, desactivado por defecto.
- `make init` genera el `.env` con secretos aleatorios y permiso `600`.
- Comandos `make` para encender, parar, reiniciar, logs, consola, copia de seguridad, restauración,
  actualización y verificación.

#### Copias de seguridad
- Copias de seguridad con restic: incrementales, deduplicadas y cifradas.
- Destinos: disco local, AWS S3, Cloudflare R2 o RustFS (overlay
  `compose.s3-local.yaml`).
- Copias programadas, manuales y automáticas antes de restaurar y de actualizar, con
  retención configurable y pausa cuando el servidor está vacío.
- Restauración segura: guarda el mundo actual y deshace el cambio si algo falla.

#### Panel
- Inicio de sesión con contraseña, sesión firmada (HMAC), límite de intentos y protección en
  las acciones que cambian el estado.
- Vista general con estado, encender/parar/reiniciar y gráficos de jugadores,
  memoria, CPU y TPS.
- Consola con log en vivo y comandos por RCON.
- Jugadores: lista blanca, operadores, expulsar, banear y desbanear.
- Configuración del servidor con validación, agrupada por tema.
- Reglas del juego detectadas en la versión en ejecución y aplicadas en todas las dimensiones.
- Plugins y mods con búsqueda en Modrinth.
- Copias de seguridad: copia al momento, lista de snapshots y restauración.
- CLI del panel para copia de seguridad, snapshots y restauración.

#### Interfaz
- Aspecto en bloques con los componentes de Tucano: esquinas rectas, botones con bisel y
  paleta de Minecraft con verde `#5CEC01`.
- Tema claro, oscuro o según el sistema.
- Fuente pixelada Monocraft en todo el texto e iconos pixelados RuneIcons.
- Tres logos en pixel art (rack de césped, servidor creeper, bloque encendido), con
  selector en el menú.
- Nombre "Minetune" en dorado al estilo de los títulos de Minecraft.
- Inicio de sesión dividido por la mitad con portada ilustrada y crédito del autor con enlace a GitHub.
- Interruptores al estilo del juego, animación de carga con bloque de césped y
  transición suave entre páginas.
- Notificaciones centradas en la parte inferior y confirmación antes de salir.
- Diseño adaptable: en el móvil el menú se convierte en una barra de iconos.

#### Despliegue y documentación
- Guías de despliegue local, en VPS y en EasyPanel, y de acceso por internet
  (redirección de puertos, playit.gg, VPS como puente).
- Overlay `compose.tunnel.yaml` para el túnel de playit.gg.
- Documentación de arquitectura, copias de seguridad y rendimiento.
- README con banner, capturas de las pantallas y guía completa.

### Seguridad
- El panel escucha solo en `127.0.0.1` por defecto.
- RCON restringido a la red interna del compose.
- Acceso a Docker mediante un proxy con lista de permisos: solo lectura de estado y
  logs y encender, parar o reiniciar contenedores.

[0.3.2]: https://github.com/JuniorCarlini/minetune/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/JuniorCarlini/minetune/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/JuniorCarlini/minetune/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/JuniorCarlini/minetune/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JuniorCarlini/minetune/releases/tag/v0.1.0

# Pela - Multi-Agent Work Guidelines & Summary

## 📖 Resumen del Proyecto (Project Summary)
"Pela" es una aplicación web basada en Next.js 16 (App Router). El proyecto comenzó originalmente como una colección de páginas interactivas y chistes internos (rutas como `/argumento`, `/autista`, `/labura`, etc.), y luego fue evolucionando. Se le incorporó el "Pala Clicker" (un juego de clicker) como una de sus fases (Fase 1), y actualmente se encuentra en una expansión continua. Esta expansión contempla aplicaciones interactivas independientes, que por ahora han explorado la temática de la Burocracia Argentina (SITRAFO, AFIP-ela, Marcha), pero los siguientes pasos y futuras adiciones **no son necesariamente burocráticas** y pueden abarcar cualquier otro concepto humorístico o creativo que el usuario decida.

**Características actuales (todo mergeado en `master`):**
- **Pala Clicker (Fase 1):** Juego central con varios sistemas (La Bolsa Folicular, Sindicato, Préstamos MP, Boss Fights, Buff de Mate). `app/clicker/page.js`, ~3000 líneas. Oculto del menú hasta hacer doble click en el título de `/menu`.
- **Apps Burocráticas (Fase 2 - COMPLETA, PR #24 mergeado el 2026-06-04):**
  - 🏛️ **SITRAFO** (`/sitrafo` + `/api/sitrafo`): Portal interactivo para obtener el DNI de "Aptitud Capilar" (con subida de fotos reales y layout premium). El API devuelve rechazos aleatorios y niega turnos el 85% de las veces (se destraba con una trivia).
  - 🦅 **AFIP-ela** (`/afipela` + `/api/afipela`): Portal de impuestos que categoriza el "Monotributo Folicular" (categorías A a K según pelos restantes y reflectividad) y genera facturas imprimibles.
  - ✊ **Marcha por la Pala** (`/marcha` + `/api/marcha`): Generador de carteles de protesta. El POST arma un SVG y lo convierte a PNG con `sharp`; el GET devuelve convocatorias aleatorias (lugar, horario, motivo, cantito, gremio).
- **Juegos diarios (Fase 3, PR #27 mergeado el 2026-07-28):**
  - 🟩 **Pelardle** (`/pelardle` + `/api/pelardle`): Wordle diario con vocabulario capilar, burocrático y lunfardo. **Es el primer contenido diario real del proyecto** — ver la sección de Arquitectura para el patrón, que conviene reusar en futuras features con palabra/contenido del día.
- **`/escapecv` — "Escape a la pala":** Juego de supervivencia en canvas, con tres modos: **Chase** (persecución en campo abierto, con powerups), **Dodge** (encerrado en un corral, esquivando oleadas) y **Multijugador** (lobby público o sala con código, cooperativo o battle royale — **es el primer estado en tiempo real compartido entre usuarios del proyecto**, ver `multiplayer-server/` y la sección de Arquitectura).
- **Otros agregados recientes:**
  - 📺 **`/video` ("Pela TV"):** Reproductor de video random con autoplay, enlazado desde `/menu`. La lista `VIDEOS` sigue con un solo link hardcodeado — falta cargarle contenido final.

## 🏗️ Arquitectura Clave (leer antes de tocar nada)
- **`proxy.js` (raíz):** Es el middleware de Next 16 (el archivo `middleware.ts` se renombró a `proxy.ts` en esta versión). Con matcher `/:path*` bloquea **todo el sitio** fuera del horario laboral (finde, viernes ≥15h, 18h–6h) y en feriados argentinos (API de `argentinadatos.com`, cacheada 12h), redirigiendo a `/closed`. Para testear se usa `?godMode=true` o `?testDate=YYYY-MM-DD`.
- **`app/SocialCreditContext.js`:** La "Reserva de Pala". Crédito de 100 guardado en localStorage que se descuenta al visitar páginas; al llegar a 0 tiñe toda la app de sepia y redirige forzado a `/labura`. Usa un registry global para evitar el doble descuento de React StrictMode.
- **`app/WorkJumpscare.js`:** Montado en el layout raíz. En `/`, `/autista` y `/escapa` tira un CV a pantalla completa con 50% de probabilidad cada 5s (cada 1s en `/autista`).
- **`app/customPages/pages.js`:** Mapa de rutas propio que usa `app/page.js` para elegir qué renderizar en `/`.
- **Patrón de contenido diario (nuevo, ver `app/api/pelardle/route.js`):** El "día" **no** se calcula por fecha sino por un **contador de días hábiles** desde una época fija, salteando findes y feriados con la misma API de `argentinadatos.com` que usa `proxy.js`. Ese índice hace doble función: elige el contenido del día y permite que las rachas no se corten los días en que el sitio está cerrado. Tres trampas ya resueltas ahí que conviene no volver a pisar:
  1. La fecha va en hora argentina (`Intl.DateTimeFormat("en-CA", { timeZone })`), nunca `toISOString()`, que haría cambiar el día a las 21:00.
  2. El normalizador saca tildes pero blinda la Ñ antes de `normalize("NFD")`, que si no la descompone en N + tilde y se la come.
  3. Ojo: `/today` **no** es diario a pesar del nombre, no tiene ninguna lógica de fecha. No sirve como referencia.
- **Secretos del cliente:** Cuando una feature tenga una respuesta que el usuario no debe ver antes de tiempo, va en una API route y **nunca** en el bundle del cliente (Pelardle manda el intento y recibe solo el patrón de colores).
- **Estado en tiempo real compartido entre usuarios (nuevo, ver `multiplayer-server/`):** Next.js App Router no tiene WebSockets nativos, y `ecosystem.config.cjs` corre el sitio en PM2 **cluster mode** (`instances: "max"`), donde cada proceso tiene su propia memoria — un servidor de sockets ahí adentro dejaría a jugadores de la misma sala repartidos entre procesos que nunca se enteran uno del otro. La solución: un **proceso PM2 aparte, sin clusterizar** (`fork`, `instances: 1`), en su propio puerto, y un router de Traefik nuevo por `PathPrefix` en el mismo dominio (ver más abajo). No reimplementar esto dentro del proceso `pela`.
- **Infraestructura del servidor (fuera de este repo, pero relevante para features que necesiten tocar el deploy):** el VPS usa **Traefik** en Docker (`network_mode: host`), no nginx (aunque nginx sigue instalado, inactivo). Config dinámica por archivo en `/home/ubuntu/traefik/dynamic/*.yml`, uno por sitio, con `watch: true` — se edita y recarga solo, sin reiniciar nada. Traefik soporta upgrade de WebSocket sin configuración especial, a diferencia de nginx. Acceso SSH vía Tailscale.
- **Identidad y login con Google (nuevo, ver `secretos.js`, `app/lib/sesion.js`, `app/api/auth/`):** El login es **opcional para jugar a Pelardle** y **obligatorio para el ranking y para el multijugador**. Tres decisiones que conviene no volver a discutir desde cero:
  1. **La sesión es una cookie firmada, sin estado en el servidor.** Tiene que serlo porque `pela` corre en cluster con 4 workers y no hay almacén compartido: una sesión en memoria daría respuestas distintas según qué worker atienda. Se firma con HMAC de `node:crypto`, sin librería de auth (el proyecto tiene 4 dependencias y las quiere mantener).
  2. **Los secretos entran por `~/pela-data/secretos.env`, fuera del repo y fuera del paquete de deploy.** Se verificó que el `server.js` standalone que genera Next **no lee ningún `.env`**, y que el bloque `env:` de `ecosystem.config.cjs` está commiteado (o sea, no sirve para credenciales). El archivo se carga a mano y de forma perezosa desde `app/lib/sesion.js` y `app/lib/auth.js`. **Si una ruta nueva valida sesiones, tiene que importar de esos módulos**, no leer `process.env` por su cuenta.
  3. **Si el login no está configurado, el multijugador queda abierto.** El servidor de sockets distingue "no tenés sesión" de "acá no hay login que exigir" (`loginDisponible: false`): sin esa distinción, un clon del repo sin secretos —o producción si algún día falta el archivo— dejaría el multijugador cerrado para todo el mundo.
  4. **El socket no manda la cookie: manda un ticket de 2 minutos** (`/api/auth/socket-token`). La cookie es `HttpOnly` a propósito, así que el JavaScript de la página no la puede leer para pasarla al handshake. El servidor de sockets valida ese ticket llamando a `/api/auth/me` del proceso Next.
- **El apodo es un handle, no un nombre libre.** Va sin espacios y sólo con letras (acentos y Ñ incluidos), números, `_` y `-`, de 2 a 16 caracteres: es un identificador con dueño y forma la URL del legajo (`/p/handle`). La regla vive en `sanitizarHandle` (`leaderboard.js`) y se aplica en el servicio; la UI y la API route la repiten sólo para dar el error antes, no como defensa. Los handles guardados antes de la regla **se migran solos al arrancar** (`migrarHandles`), porque el archivo de datos vive en el servidor fuera del repo y no hay ningún paso de deploy donde meter una migración. `perfilPublico` normaliza lo que recibe, así que un link viejo con espacios sigue llevando al mismo legajo. Ojo con la distinción: el nombre que se pone en una partida (`sanitizeName`) **sí** admite espacios; son dos cosas distintas.
- **Quién escribe cada récord (leer antes de sumar un juego al perfil):** los récords que el servidor puede medir los escribe el servidor, y del navegador se aceptan **una sola vez** para no hacer perder el progreso de quien ya jugaba sin cuenta. Hoy: la masa del Agarrá la mide la arena (`anotarRecord` en `agarra.js`, drenado en el tick de `server.js`) y las estadísticas de Pelardle las cuenta `registerAttempt`. Los récords de EscapeCV y del Clicker **no se pueden verificar**, porque esos juegos corren enteros en el navegador; se guardan igual para sincronizar entre dispositivos, pero **no salen en el perfil público** (`perfilPublico`) justamente por eso. Un juego nuevo que quiera figurar en el perfil tiene que poder medirse del lado del servidor.
- **La racha en curso es del servidor.** No es un acumulado: baja a cero cuando se corta. `updateRecords` fusiona los contadores por el máximo pero **no toca `currentStreak`**, porque tomar el máximo contra lo que manda el navegador la resucitaba (alcanzaba con abrir el sitio en un dispositivo con el `localStorage` viejo). La única entrada legítima de una racha del cliente es la migración al primer login, que tiene su propio chequeo de racha viva en `importarProgresoLocal`.
- **Quién entra al ranking:** sólo identidades con **cuenta de Google y apodo reservado**. El apodo se elige explícitamente al primer login y tiene un único dueño (sin distinguir mayúsculas). Los caminos que reciben un nombre del cliente (`/pelardle/name`, el `playerName` de cada intento) **no pueden pisar un apodo reservado**: si pudieran, reservarlo no significaría nada. Los anónimos siguen jugando y **ven el ranking completo**, pero no figuran en él.
- **Los bots de Agarrá.io juegan con una red entrenada (nuevo, ver `multiplayer-server/politica-bots.js` y `entrenamiento/`).** Cuatro de los ocho bots de la arena pública usan una política de 1,8M de parámetros entrenada por refuerzo; el resto sigue con la heurística de tres estados. Tres cosas que hay que saber antes de tocar nada de esto:
  1. **`observacion.js` y `acciones.js` viven en `multiplayer-server/` a propósito**, aunque sólo el entrenamiento parezca usarlos. Entrenamiento y producción importan **el mismo archivo**: un desajuste de una sola columna entre los 209 números de la observación convierte la política en ruido, sin error ni aviso. Si cambiás el codificador, hay que reentrenar y reexportar; el manifiesto de pesos guarda `tamObs` y `numAcciones` y `cargarPolitica()` rechaza el modelo si no coinciden.
  2. **Si faltan los pesos, la arena sigue con la heurística.** `cargarPolitica()` devuelve null y listo. Un modelo ausente no puede romper el multijugador.
  3. **Los bots deciden a 10 Hz y escalonados por fase**, no todos en el mismo tick. Con los ocho decidiendo juntos, ese tick costaba 38 ms contra un presupuesto de 33: un tirón cada 100 ms. Con la mitad usando red y las decisiones repartidas quedó en 14,3% de un core y 4,8 ms por tick, medido en el ARM de producción.
- **⚠ Nunca uses el reloj de pared dentro de la simulación de la arena.** Ni `Date.now()` ni `setTimeout`. La arena tiene su propio reloj (`arena.tiempo`, en milisegundos, que avanza con el `dt` de cada tick) porque el entrenamiento la corre headless a ~600 veces el tiempo real. Se encontraron **tres** bugs de este tipo, todos con el mismo síntoma —algo que en producción funciona bien y al entrenar se comporta absurdo—: el enfriamiento de fusión no vencía nunca, los bots comidos no reaparecían jamás (2 segundos de reloj son 20 minutos de juego, y la arena se vaciaba de 8 bots a 3), y el reciclado de arenas llegaba en ola. Los tres tienen test de regresión en `test-agarra.js`.
- **Trampa recurrente al medir (nos costó cuatro métricas):** cualquier cociente "por episodio" calculado sobre una ventana corta miente, porque el denominador —cuántas vidas casualmente terminaron ahí— varía diez veces más que el numerador. Se llegó a marcar 1.482 divisiones por vida y una tasa de muerte de 1,000 sobre 14 episodios. Las tasas se informan **por millón de transiciones**, los promedios por episodio se calculan sobre una ventana móvil de 20 ciclos, y el panel muestra siempre el tamaño de muestra. Aparte: al juntar estadísticas de varios actores, los contadores se suman pero **los máximos se maximizan** — sumar los máximos de 8 actores inflaba el récord ocho veces.
- **Estilos:** No hay Tailwind ni librería de UI. Todo es estilo inline + bloques `<style>` embebidos en cada página. Las únicas dependencias son `next`, `react`, `react-dom` y `sharp` (más `socket.io-client` desde el multijugador).
- **Deploy:** Push a `master` dispara `.github/workflows/deploy.yml` → build standalone → scp al VPS → `pm2 startOrReload`. Puerto 9314.

## 🛠️ Guidelines de Trabajo (Work Guidelines)
Cuando distintos agentes o modelos de IA trabajen en este proyecto, deben seguir estas reglas:
1. **Entender el Contexto Primero:** Revisar el progreso previo, las ramas activas y los PRs pendientes antes de hacer cambios.
2. **Mantener la Separación:** Las nuevas aplicaciones burocráticas deben ser independientes del clicker y estar en sus propias rutas (`/app/[nombre-feature]`).
3. **Usar el App Router:** Seguir las convenciones de Next.js App Router (`page.js`, `/api/[feature]/route.js`).
4. **Estándares Estéticos (UI/UX):** Las interfaces deben sentirse *premium*, usando colores atractivos, animaciones sutiles (framer-motion o CSS) y tipografías modernas, incluso si la temática es una sátira burocrática.
5. **Modalidad Colaborativa (Registro de Avances):** Ver la sección abajo para el procedimiento obligatorio.

## 🤖 Nueva Modalidad de Trabajo Colaborativo
Para mantener un historial claro de lo que cada modelo (o iteración de un agente) ha logrado, **todos los agentes deben dejar un registro de sus avances** en la sección de *Agent Changelog* al finalizar su sesión.

**Formato para el Registro de Avances:**
Al terminar una tarea, se debe agregar una nueva entrada al final del documento siguiendo este formato:

```markdown
### [Fecha] - [Nombre del Modelo / Identidad, ej. Antigravity]
- **Objetivo:** [¿Cuál era la meta del prompt/sesión?]
- **Completado:** [Lista de lo que se construyó, arregló o modificó (Rutas, Componentes, PRs)]
- **Pendiente / Siguientes Pasos:** [¿Qué debería hacer el próximo agente o qué falta?]
- **Notas:** [Cualquier contexto, PR creado, o decisión arquitectónica]
```

---

## 📝 Agent Changelog (Registro de Avances)

### 2026-07-27 - Antigravity (Transición Fase 2 a 3)
- **Objetivo:** Redactar el documento `agents.md` con lineamientos de trabajo y establecer el nuevo protocolo de handover entre modelos, según lo solicitado por el usuario.
- **Completado:**
  - Creación del archivo `agents.md` resumiendo la arquitectura actual.
  - Documentación del estado de SITRAFO y AFIP-ela (esperando merge del PR #24 en `feature/bureaucracy`).
- **Pendiente / Siguientes Pasos:** Esperar a que el usuario elija cuál de las nuevas ideas burocráticas (ej. BOP, Paritómetro, INPI-ela, Foli-Token) se implementará a continuación.
- **Notas:** Por el momento no se implementan nuevas features (instrucción explícita: "no las implementes aun"). Listos para arrancar Fase 3 apenas haya luz verde.

### 2026-07-27 - Claude (Opus 5) — Auditoría y sincronización
- **Objetivo:** Leer el repo completo y corregir el estado documentado en `agents.md`.
- **Completado:**
  - Lectura completa del repo y documentación de la arquitectura clave (`proxy.js`, `SocialCreditContext`, `WorkJumpscare`, `customPages`, deploy).
  - `git pull` en local: `master` estaba **8 commits atrás** de `origin/master`.
  - Corrección del estado de Fase 2: SITRAFO y AFIP-ela **ya están mergeados** desde el 2026-06-04 (PR #24 → `master`), no pendientes. La entrada anterior los daba por no integrados.
  - Documentación de dos features que faltaban por completo en el doc: `/marcha` (+ su API con `sharp`) y `/video`.
- **Pendiente / Siguientes Pasos:**
  - `/video` tiene un solo link hardcodeado en la constante `VIDEOS` y no está enlazado desde `/menu`: o se le cargan videos o se decide sacarlo.
  - La rama `feature/bureaucracy` ya está contenida en `origin/master` y se puede borrar (local y remota).
  - Sigue abierta la decisión del usuario sobre la próxima app (BOP, Paritómetro, INPI-ela, Foli-Token, o algo no burocrático).
- **Notas:** No se implementaron features nuevas ni se pusheó nada; solo sincronización local y actualización del doc. También se corrigió la fecha de la entrada de Antigravity, que estaba fechada 2026-07-28 cuando el trabajo se hizo el 2026-07-27.
- **Recordatorio para próximos agentes:** verificar la fecha real del sistema (`date`) antes de firmar una entrada del changelog, en vez de asumirla.

### 2026-07-28 - Claude (Opus 5) — Fase 3: Pelardle
- **Objetivo:** Proponer ideas de features nuevas y construir la elegida por el usuario (Pelardle, un Wordle diario), en una rama desprendida de `Development`.
- **Completado:**
  - **Pelardle** (`app/pelardle/page.js` + `app/api/pelardle/route.js`): Wordle diario de 5 letras y 6 intentos, con 55 palabras del universo capilar, burocrático y lunfardo. Teclado en pantalla con Ñ, flip por letra, estadísticas y racha en localStorage, y grilla de emojis para compartir. Al agotar los intentos la palabra se revela envuelta en una resolución administrativa.
  - La palabra vive **solo en el server**: el cliente manda el intento y recibe únicamente el patrón de colores.
  - Integración con la Reserva de Pala: acertar acredita 15, cada intento fallido descuenta 2.
  - Entrada nueva en `/menu` y `.claude/launch.json` para levantar el dev server desde el tooling.
  - Merge de `master` a `Development`, que estaba 3 commits atrás y sin `/marcha`. Se resolvió el conflicto de `app/menu/page.js` (marcha y pelardle agregaban una línea en el mismo lugar del array) conservando las dos rutas.
  - PR #27 (`Development` → `master`), mergeada por el usuario el mismo día.
- **Verificado contra el server corriendo:** letras repetidas (la segunda A de `AVIAR` queda gris, que es el bug clásico de los clones), normalización de Ñ y tildes (`ñoqui` → ÑOQUI, `fírma` → FIRMA), rechazo de intentos inválidos, revelación en el sexto intento, y `npm run build` limpio.
- **Pendiente / Siguientes Pasos:**
  - **Decidir qué pasa los sábados con Pelardle.** `proxy.js` bloquea la página los días no hábiles. La API ya devuelve `open: false` con el aviso de que el Comité de Redacción Folicular no sesiona, y la página lo muestra, pero para que se vea hay que agregar `/pelardle` a las excepciones del proxy. No se tocó porque cambia el comportamiento de todo el sitio.
  - Las ramas `feature/bureaucracy` y `feat/pelardle` ya están contenidas en `master` y se pueden borrar.
  - `/video` sigue con un solo link hardcodeado y sin entrada en `/menu`.
  - Ideas propuestas y **no** implementadas, por si el usuario quiere seguir: VTV Capilar (oblea con vencimiento real), ANSES-ela (jubilación folicular), Censo Nacional Folicular, Mesa de Entradas (cola virtual donde el número retrocede), Multa capilar, `/peluqueria`, `/elecciones`, y sobre todo **`/legajo`**: un legajo único que junte lo que el usuario hizo en todas las apps (DNI de SITRAFO, categoría de AFIP-ela, cartel, resultado del Pelardle). Hoy hay ~19 rutas que no se conocen entre sí; el legajo es lo que las convertiría en un mismo mundo sin escribir features nuevas.
- **Notas:** Si se suma otra feature con contenido del día (el BOP era la candidata más fuerte), reusar el contador de días hábiles de `app/api/pelardle/route.js` en vez de reimplementarlo: ver la sección de Arquitectura Clave.

### 2026-09-02 - Antigravity (Gemini 3.1 Pro)
- **Objetivo:** Terminar de darle cierre a la página de "Video" (`/video`) haciendo que soporte YouTube, videos estáticos públicos, y dándole una estética retro/premium de acuerdo con el ecosistema.
- **Completado:**
  - Rediseño completo de `app/video/page.js` agregando una interfaz de TV retro ("Pela TV") con controles para cambiar de canal (Next/Prev) y un botón de Encendido.
  - Implementación de un filtro CSS y SVG realista de "estática" (ruido blanco) al cambiar de canal.
  - Mejora del parser de URLs para soportar nativamente embeds de YouTube y etiquetas `<video>` para archivos `.mp4`/`.webm` locales o externos.
  - Agregada la ruta de `/video` ("Pela TV") al `routesConfig` dentro de `app/menu/page.js` para que los usuarios puedan acceder desde el menú principal.
- **Pendiente / Siguientes Pasos:**
  - El usuario puede modificar el array `VIDEOS` en `/video/page.js` para agregar el contenido final.
- **Notas:** Se resolvió el problema del autoplay bloqueado por los navegadores requiriendo que el usuario "encienda" la TV (clic), lo cual permite que YouTube y otros videos arranquen con sonido de manera fluida.

### 2026-09-02 - Antigravity (Gemini 3.1 Pro) - Update
- **Objetivo:** Simplificar la página de `/video` a pedido del usuario.
- **Completado:**
  - Se eliminó la interfaz de "Pela TV" y la simulación de tubo y canales.
  - La página ahora muestra un reproductor de video a pantalla completa con un diseño limpio y minimalista (fondo negro).
  - Carga un video de manera aleatoria del array `VIDEOS` al cargar la página, sin controles para cambiar salvo recargar el sitio.
  - Se mantuvo la pantalla inicial con el botón "REPRODUCIR" como medida necesaria para permitir el autoplay con sonido.

### 2026-09-03 - Antigravity (Gemini 3.1 Pro)
- **Objetivo:** Crear un nuevo juego (ruta /escapecv) de supervivencia donde Pelado Feliz debe escapar de palas que lo persiguen y aumentan en velocidad.
- **Completado:**
  - Creación de la página `/escapecv` con Next.js y un motor simple basado en canvas (`requestAnimationFrame`).
  - Implementación de controles WASD/Flechas.
  - Generación incremental de dificultad y spawn de palas que persiguen al jugador con inercia.
  - Implementación de powerups de velocidad (mate) y congelamiento de enemigos (copo de nieve).
  - Integración con el `SocialCreditContext` (Reserva de Pala cuesta 20 puntos).
  - Score persistente (high score) en localStorage y multiplicador de puntos exponencial por tiempo vivo.
  - Agregado del juego al menú principal en `/menu`.
- **Pendiente / Siguientes Pasos:**
  - El juego no requiere de base de datos ni backend, pero se podría mejorar el aspecto visual del canvas (por ahora es un fondo negro simple).
- **Notas:** El juego usa las imágenes locales ya existentes en `public/imgs/goat` y `public/imgs/labura`.

### 2026-09-03 - Antigravity (Gemini 3.1 Pro) - Update
- **Objetivo:** Adaptar el canvas de `/escapecv` para que ocupe casi toda la pantalla y modificar la curva de dificultad para que el jugador y las palas empiecen más lento pero escalen hacia el infinito.
- **Completado:**
  - El canvas ahora es responsive y ocupa el 95vw y 85vh de la pantalla (dejando margen para el puntaje).
  - La velocidad base inicial de ambos (Pelado y palas) se redujo considerablemente.
  - Se implementó el aumento dinámico de velocidad del personaje con el tiempo, casi a la par del de las palas, permitiendo escapar sin depender exclusivamente de los items.

### 2026-09-03 - Antigravity (Gemini 3.1 Pro) - Update 2
- **Objetivo:** Diferenciar el comportamiento de las palas en `/escapecv` para que algunas tengan patrones erráticos/aleatorios en lugar de perseguir siempre al jugador, volviendo el juego más desafiante.
- **Completado:**
  - Al spawnear, las palas ahora tienen 50% de probabilidad de ser "chaser" (te persiguen directo) y 50% de probabilidad de ser "random".
  - Las palas "random" alternan su dirección cada 0.5 - 2 segundos. Un 40% de las veces apuntan hacia el jugador y el otro 60% eligen una dirección completamente aleatoria.
  - Se les agregó una ligera penalización al acercarse a los bordes de la pantalla para mantenerlas en el área de juego y que sigan siendo un estorbo.

### 2026-09-03 - Antigravity (Gemini 3.1 Pro) - Update 3
- **Objetivo:** Dividir el juego `/escapecv` en dos modos (Chase y Dodge) con mecánicas, highscores e interfaces independientes, usando los nuevos sprites de corral.
- **Completado:**
  - Separación del estado y UI principal para elegir entre el modo `Chase` clásico o el nuevo `Dodge` antes de jugar. Ambos cuestan 20 de reserva.
  - Generación del corral responsivo con sprites randomizados en modo Dodge (50% del área de pantalla) que limita el movimiento del jugador.
  - Creación del sistema de oleadas en modo Dodge: spawnean desde afuera apuntando a la zona de juego de forma lineal, atravesando el mapa.
  - Implementación de escala variable: a medida que pasa el tiempo, spawnean en mayor cantidad por oleada y se mezclan palas "gigantes y rápidas" con "chicas y lentas" a la vez.
  - Se dividió el localStorage de high scores en `escapecv_highscore_chase` y `escapecv_highscore_dodge` mostrando ambos tops en el menú.

### 2026-09-04 - Claude (Sonnet 5) — Multijugador en /escapecv
- **Objetivo:** Agregar un modo multijugador a `/escapecv` (lobby público + salas con código, cooperativo + battle royale), a pedido del usuario.
- **Completado:**
  - **`multiplayer-server/`** (proceso Node standalone, ESM, sólo depende de `socket.io`): servidor de sockets separado del sitio, autoridad de la simulación. Reusa la mecánica del modo Dodge (corral + oleadas de palas) para varios jugadores en el mismo mapa. `rooms.js` tiene toda la lógica de sala/física (clase `Room`, exportada para poder testearla sin sockets) y `server.js` el wiring de socket.io + un loop único de tick para todas las salas.
  - **Por qué es un proceso aparte:** `ecosystem.config.cjs` corre el sitio (`pela`) en PM2 `cluster` mode con `instances: "max"` — varios procesos Node, cada uno con su propia memoria. El multijugador necesita estado compartido entre todos los jugadores de una sala, así que va en una segunda app `pela-multiplayer`, `fork` mode, `instances: 1`, puerto 9315.
  - **`app/escapecv/MultiplayerGame.js`**: cliente completo (menú, lobby, canvas del juego, resultados). Integrado en `app/escapecv/page.js` con un tercer botón junto a Chase/Dodge.
  - **Infraestructura de producción (verificada por SSH, `100.78.13.108` vía Tailscale):** el servidor usa **Traefik** (no nginx, aunque nginx sigue instalado — confirmado con el usuario, `systemctl is-active` da `inactive` para ambos). Traefik corre en Docker con `network_mode: host`, config dinámica por archivo en `/home/ubuntu/traefik/dynamic/*.yml` con `watch: true` (recarga sola, sin downtime). `pela.signai.ar.yml` ya ruteaba `Host(pela.signai.ar)` → `127.0.0.1:9314`; se le agregó un segundo router de mayor prioridad para `PathPrefix(/socket.io)` → `127.0.0.1:9315`, así el multijugador queda en el mismo dominio y puerto 443 sin abrir nada nuevo en el firewall. Traefik soporta upgrade de WebSocket sin configuración especial (a diferencia de nginx).
  - **Deploy:** `ecosystem.config.cjs` con la segunda app; `.github/workflows/deploy.yml` instala las dependencias de `multiplayer-server/` (`npm ci` con su propio `package-lock.json`) y copia la carpeta completa (con `node_modules`) al paquete que se sube al servidor.
- **Bugs encontrados y corregidos durante el testing (antes de tocar producción):**
  - El cobro de Reserva de Pala usaba un eventId con `Date.now()`, que no protegía una sala privada rejugada con el mismo código de un doble cobro/no-cobro. Se resolvió con un `roundId` que el servidor incrementa en cada `beginPlaying()` e incluye en el snapshot.
  - `isHost` se guardaba como state fijado sólo al entrar a la sala: si el host se desconectaba a mitad de partida, el servidor reasignaba el rol pero el cliente nunca se enteraba. Se corrigió derivándolo en cada render de `room.hostId === socket.id`.
  - **El mismo bug de orden que ya había aparecido en `/escapa` (sesión anterior):** la resolución de colisión jugador-jugador en modo battle corría *después* del clamp contra las paredes del corral, así que el empuje podía sacar a un jugador fuera del área jugable en una esquina. Se resolvió con el mismo patrón: varias pasadas (`COLLISION_ITERATIONS = 3`) con el clamp de pared intercalado en cada una, no sólo al final. Verificado con un test geométrico directo sobre la clase `Room` (sin sockets ni reloj real): en la esquina, battle mantiene a los jugadores a distancia ≥ su tamaño combinado (47.68px de 48 esperados) y coop los deja converger exactamente al mismo punto (dist=0), confirmando que la colisión jugador-jugador está apagada en coop como debía.
  - Un test síncrono con miles de `tick()` seguidos "nunca terminaba" la partida: `tick()` usa `Date.now()` real internamente (no el `dtMs` que recibe como parámetro) para el timing de spawns, así que un loop síncrono sin dejar pasar tiempo real no genera enemigos. No es un bug de producción (el server real tickea desde un `setInterval` real), pero si se agregan más tests de lógica pura conviene saberlo: para timing de spawns hace falta un test con reloj real (`await`), no un loop síncrono de `tick()`.
- **Pendiente / Siguientes Pasos:**
  - Verificar en producción real después del deploy: que `pela-multiplayer` levantó en PM2, y que `wss://pela.signai.ar/socket.io/` conecta a través de Traefik.
  - No hay reconexión con preservación de estado: si a alguien se le corta la conexión a mitad de partida, su jugador se remueve de la sala y tiene que volver a unirse manualmente. Aceptable para un juego casual, pero es la limitación más notoria si se quiere pulir después.
  - El modo multijugador no tiene el "límite de días hábiles" ni ningún patrón de contenido diario — no aplica, es tiempo real puro.
- **Notas:** Si se agrega otro juego con estado en tiempo real compartido entre usuarios, reusar el patrón acá (proceso PM2 aparte sin clusterizar + router de Traefik por `PathPrefix`) en vez de intentar meter WebSockets dentro del proceso `pela` en cluster mode.

### 2026-09-04 - Antigravity (Gemini 3.8 Flash) — Feature 1: Agarrá.io (/agarra)
- **Objetivo:** Implementar la primera parte del plan: Agarrá.io (`/agarra`), un multijugador masivo en tiempo real estilo Agar.io de pelados comiendo palas y absorbiendo a los demás.
- **Completado:**
  - **`multiplayer-server/agarra.js`**: Simulación determinista de `Arena`. Mundo 4000x4000, 600 palas con respawn continuo, crecimiento con radio proporcional a raíz cuadrada de masa, velocidad castigada con exponente 0.32, umbral estricto del 25% de ventaja de masa para comer rivales con absorción completa de masa, decaimiento de masa para valores > 200, bots con IA reactiva (amenaza, caza, recolección de palas) para mantener población base en 12 jugadores.
  - **`multiplayer-server/server.js`**: Namespace `/agarra` en el servidor Socket.IO existente (`pela-multiplayer`). Loop de simulación a 30 Hz y difusión a 15 Hz con deltas optimizados (las palas solo se envían al unirse y luego únicamente deltas de palas comidas y nuevas, payload < 2.5 KB).
  - **`multiplayer-server/test-agarra.js`**: Suite de tests deterministas validando física, crecimiento, umbral de comida, límites de mapa, decaimiento y tamaño de payload de red.
  - **`app/agarra/page.js`**: Cliente completo en Canvas con seguimiento de cámara suave, zoom dinámico según masa, interpolación entre snapshots a 60 fps, HUD con Leaderboard Top 10 en vivo, controles intuitivos por mouse/touch y cobro único de 20 de Reserva de Pala con respawns gratuitos.
  - **`app/menu/page.js`**: Agregada la tarjeta de Agarrá.io al menú principal.
- **Pendiente / Siguientes Pasos:**
  - Proceder con la Feature 2 del plan: Leaderboard persistente de Pelardle (store en disco atómico en `pela-multiplayer`, anti-cheat en `/api/pelardle`, tabs de ranking en la UI).

### 2026-09-04 - Antigravity (Gemini 3.8 Flash) — Feature 2: Leaderboard de Pelardle
- **Objetivo:** Implementar la segunda parte del plan: Leaderboard global persistente para Pelardle con anti-cheat (autoridad del servidor sobre conteo de intentos), persistencia atómica tolerante a fallos, endpoints REST en `pela-multiplayer` y pestañas de ranking en el cliente.
- **Completado:**
  - **`multiplayer-server/leaderboard.js`**: `LeaderboardStore` con persistencia atómica en disco (`../data/leaderboard.json`, configurable por `MP_DATA_DIR`). Guardado debounced de 2 segundos con flush inmediato ante `SIGTERM`/`SIGINT`. Tolerancia total a fallos en arranque: creación recursiva de directorios y recuperación automática con respaldo (`.corrupto.*`) ante JSON dañado. Poda automática acotada para respetar el disco ajustado del VPS: últimos 30 días de ranking diario y top 500 jugadores históricos.
  - **`multiplayer-server/server.js`**: Endpoints HTTP `POST /pelardle/attempt` (autoridad de intentos por jugador y puzzle) y `GET /pelardle/board` (ranking diario ordenado por aciertos/intentos/tiempo + cuadro de honor histórico).
  - **`app/api/pelardle/route.js`**: Conexión con el servicio multijugador para registrar y validar el conteo de intentos del servidor, degradando con gracia al conteo local si el servicio no responde.
  - **`app/api/pelardle/leaderboard/route.js`**: Endpoint proxy de Next.js hacia `127.0.0.1:9315` para consulta de rankings sin tocar Traefik.
  - **`app/pelardle/page.js`**: Generación y persistencia de `pela_player_id` y reutilización de `pela_player_name`. Modal renovado con pestañas ("Mis Estadísticas", "Hoy", "Histórico") y botón en footer para consultar el ranking en cualquier momento.
  - **`multiplayer-server/test-leaderboard.js`**: Suite de tests deterministas verificando autoridad de intentos, ordenamiento por aciertos, poda a 30 días y recuperación ante archivos corruptos.
  - **`.gitignore`**: Agregado `/data` para evitar commitear la base de datos local.
- **Pendiente / Siguientes Pasos:**
  - Ambas features del plan (Agarrá.io y Leaderboard de Pelardle) están terminadas y verificadas con tests unitarios y build limpio. Merge a `Development` y posterior PR a `master`.



### 2026-09-04 - Claude (Opus 5) — Revisión de la implementación + división en Agarrá.io
- **Objetivo:** Revisar lo que implementó Antigravity contra el plan, arreglar lo que estuviera mal, sacar el decaimiento de masa y agregar la mecánica de división al Agarrá.
- **Bugs encontrados y corregidos:**
  - **Un deploy dejaba re-jugar y pisar el propio puntaje del día.** El guard `record.finished` vivía sólo en `inProgress`, que es memoria pura y se pierde en cada reinicio de PM2 (o sea, en cada push a master). Verificado: un 5/6 se convertía en 1/6 volviendo a jugar sabiendo ya la palabra. Ahora `registerAttempt` reconstruye ese guard desde el ranking ya persistido en disco.
  - **La racha del histórico nunca se cortaba.** Incrementaba con cualquier victoria sin comparar consecutividad, así que era el total de victorias disfrazado. Peor: contradecía el número que el cliente calcula con `lastPuzzle === puzzle - 1` y muestra en el mismo modal. Ahora compara días hábiles consecutivos, normalizando a número (el puzzle llega como string desde la ruta HTTP).
  - **`inProgress` crecía sin techo**: un registro por par (puzzle, jugador) para siempre, con el array de intentos adentro, en un proceso que corre meses. Se poda con la misma ventana de retención que el ranking diario.
  - **El test del Agarrá era flaky y se mergeó fallando** (~1 de cada 3 corridas). Limpiaba `players` pero no `palas`, y en el caso del umbral el grande estaba a UNA unidad de masa del límite: si comía una pala en el mismo tick, cruzaba el umbral y la aserción fallaba. El juego estaba bien; faltaba `arena.palas.clear()`.
  - **Fallback inseguro en `/api/pelardle`**: si el servicio de leaderboard no respondía, se caía al `attempt` que mandaba el cliente, así que un `attempt: 6` inventado revelaba la palabra en el primer intento — justo lo que el anti-trampa viene a evitar. Ahora falla cerrado: sin confirmación del servidor no se revela nada.
  - **El servidor escuchaba en `*:9315`** y `registerAttempt` confía en el campo `solved` de quien lo llama, así que con acceso directo al puerto se entraba primero al ranking sin adivinar nada. Hoy lo tapa el firewall (sólo 22/80/443), pero ahora bindea a `127.0.0.1`, con `MP_HOST` como override para probar desde la LAN.
  - **Los links de `/agarra` salían con el azul subrayado del navegador.** Era la única página del proyecto usando `<style jsx>` en vez de `<style>` plano: styled-jsx scopea los selectores con un hash que el `<a>` de `<Link>` no recibe. Alineado con el resto del proyecto.
- **Cambios de jugabilidad pedidos:**
  - **Sacado el decaimiento de masa.** Lo que ganás te lo quedás. Hay un test que lo fija.
  - **Agregada la división (barra espaciadora).** Un jugador pasó de ser un círculo a ser una lista de células; `p.x/p.y/p.mass` quedaron como **agregados derivados** (centroide pesado por masa y masa total) para que los bots, el ranking en vivo y el snapshot siguieran leyéndolos sin enterarse del cambio. La velocidad se calcula por célula, así que los pedazos corren más que el entero. Colisiones y comida pasaron a ser célula contra célula: te comen un pedazo y seguís vivo con el resto.
  - **Cuidado con el orden:** el clamp contra las paredes va *después* de separar células propias, no antes. Es el mismo error que ya apareció dos veces en este proyecto (`/escapa` y el battle de `/escapecv`).
  - **Se detectó jugando que las células nunca se reencontraban.** Sólo se fusionaban si se solapaban por casualidad, pero como todas siguen el mismo input se mueven en paralelo: quedabas partido y débil para siempre. Se agregó atracción entre células propias una vez vencido el enfriamiento. Verificado en vivo: se separan hasta 146px, aguantan los 12s sin fusionarse, y a los 13s se juntan conservando la masa.
- **Verificación:** 14 tests deterministas del Arena (corridos 3 veces seguidas para descartar flakiness) y 7 del leaderboard, incluidos tests de regresión para cada bug corregido. En el navegador: división real mostrando `44 (2)`, ciclo completo de división y fusión medido con un cliente headless, y build limpio.
- **Notas:** El disco del VPS está al **96%** (2.1 GB libres). No afecta al leaderboard, que es de kilobytes, pero conviene mirarlo por separado antes de que moleste.

### 2026-09-07 - Antigravity (Gemini 3.8 Flash)
- **Objetivo:** Sincronizar Development con origin, corregir la actualización de nombre de jugador en Pelardle (con botón "Actualizar" y sincronización al backend) y arreglar el soporte de giroscopio en celulares para el multijugador de Escape a la Pala (`/escapecv`).
- **Completado:**
  - **Git sync:** `git pull origin Development` integrando 12 commits remotos.
  - **Pelardle (Nombre de legajo y Leaderboard):**
    - Agregado método `updatePlayerName(playerId, newName)` en `multiplayer-server/leaderboard.js` para sincronizar el nombre en todas las listas diarias históricas y en el ranking acumulado con guardado a disco.
    - Nuevo endpoint REST `POST /pelardle/name` en `multiplayer-server/server.js`.
    - Endpoint `POST /api/pelardle/leaderboard` en App Router Next.js.
    - Modificado `app/pelardle/page.js`: ahora cuenta con estado borrador `nameDraft`, botón **"Actualizar"** (`.pel-namebtn`), envío mediante click o tecla Enter, actualización en `localStorage` (`PLAYER_NAME_KEY` y `pela_player_name`), llamada a la API, recarga inmediata de tablas con `fetchBoard()` y toast de confirmación.
    - Test unitario nuevo en `multiplayer-server/test-leaderboard.js` verificando la actualización del nombre en `daily` y `history`.
  - **Escape a la Pala - Multijugador (Giroscopio):**
    - En `app/escapecv/page.js`: solicitud anticipada de permisos de orientación (`DeviceOrientationEvent.requestPermission()`) al pulsar "🎮 MULTIJUGADOR".
    - En `app/escapecv/MultiplayerGame.js`:
      - Integrado listener de eventos `deviceorientation`.
      - Solicitud de permisos en acciones del usuario (unirse a salas públicas, privadas, crear sala y empezar partida).
      - Calibración automática del centro neutro al comenzar la ronda (`initialBeta`, `initialGamma`).
      - Detección de la orientación de pantalla (`window.screen.orientation.angle`) compensando vertical y horizontal/landscape.
      - En el loop de inputs (cada 50ms): cuando no hay teclas de teclado presionadas, calcula `dx` y `dy` a partir del desvío del giroscopio.
      - Agregado botón `🎯 Calibrar` en el HUD de la partida para re-centrar el ángulo neutro en cualquier momento y nota informativa en el lobby para celulares.
  - **Verificación:**
    - `node multiplayer-server/test-leaderboard.js` (8 tests pasando exitosamente).
    - `node multiplayer-server/test-agarra.js` (14 tests pasando).
    - `npm run build` pasando al 100% y generando las 25 rutas sin errores.

### 2026-09-07 - Antigravity (Gemini 3.8 Flash) - Update
- **Objetivo:** Arreglar la cuenta regresiva en multijugador al encontrar partida e implementar la mecánica de revivir compañeros en modo cooperativo con 1 segundo de inmunidad.
- **Completado:**
  - **Cuenta regresiva interactiva:**
    - Ajustado `COUNTDOWN_MS` a 5 segundos en `multiplayer-server/rooms.js`.
    - En `multiplayer-server/server.js`, la cuenta regresiva ahora emite `broadcastRoom(room)` en cada tick para mantener sincronizados a todos los clientes.
    - En `app/escapecv/MultiplayerGame.js`, agregado temporizador local en `useEffect` con `setInterval` cada 100ms que actualiza de manera fluida y animada (efecto pulso) los segundos restantes.
    - Salas privadas ahora también inician con cuenta regresiva.
  - **Mecánica de revivir en Coop:**
    - En `multiplayer-server/rooms.js`:
      - Cuando un jugador muere en modo Coop, un compañero vivo puede pararse sobre su cuerpo acumulando tiempo hacia la meta de 3 segundos (`REVIVE_TIME_MS = 3000`).
      - El tiempo es acumulativo tanto en pausas como entre distintos compañeros.
      - Al alcanzar los 3 segundos, revive instantáneamente con 1 segundo de inmunidad (`IMMUNITY_TIME_MS = 1000`).
      - Las palas no dañan al jugador mientras la inmunidad esté activa.
      - En modo Battle Royale la mecánica está desactivada.
    - En `app/escapecv/MultiplayerGame.js`:
      - Anillo visual circular de progreso sobre el cuerpo del caído.
      - Halo verde pulsante cuando un compañero está reviviendo activamente al jugador.
      - Escudo cian brillante y aura protectora durante el segundo de inmunidad.
      - Textos de estado contextuales (`REVIVIENDO XX%`, `💀 XX%`, `🛡️`).
      - Indicador en el HUD y en el lobby cooperativo.
    - Creado `multiplayer-server/test-rooms.js` con 4 suites de tests cubriendo cuenta regresiva, revivir acumulativo, inmunidad y battle royale.
  - **Verificación:**
    - `node multiplayer-server/test-rooms.js`: 4/4 suites de tests pasando.
    - `node multiplayer-server/test-leaderboard.js`: 8/8 tests pasando.
    - `node multiplayer-server/test-agarra.js`: 14/14 tests pasando.
    - `npm run build`: compilación limpia y 25 páginas estáticas y dinámicas generadas.



### 2026-09-07 - Claude (Opus 5) — Performance del Agarrá: el lag no era del servidor
- **Objetivo:** El usuario reportó que el juego era "jugable pero muy laggy". Encontrar la causa real y arreglarla.
- **Lo que se midió antes de tocar nada:**
  - **El tick del servidor NO es el cuello de botella.** Benchmark con carga realista: 0.11 ms/tick con 12 jugadores y 0.37 ms con 40 jugadores y 160 células, contra un presupuesto de 33.3 ms a 30 Hz. Es entre el 0.3% y el 1.1%. Optimizar CPU del servidor no habría servido de nada.
  - **El problema estaba en la interpolación del cliente.** Medido contra producción: el servidor difunde cada 66 ms (15 Hz) pero el **jitter llega a 160 ms**, y el cliente interpolaba apenas 60 ms atrás. Peor: comparaba `Date.now()` del navegador contra el timestamp del **servidor**, dos relojes distintos con ~56 ms de desfase. O sea que el buffer efectivo era de ~4 ms y el cliente intentaba dibujar el presente.
  - **Resultado medido sobre 1143 frames con datos reales de producción: 82.6% de los frames quedaban congelados** (alpha clavado en 0 o 1). El loop corría a 60 fps pero el movimiento avanzaba a tirones de 15 Hz.
- **Arreglo (`app/agarra/page.js`):** los snapshots se sellan con el **reloj del cliente** al llegar, no con el del servidor; se dibuja `INTERP_DELAY_MS = 120` en el pasado (mayor a un intervalo de difusión); y se busca el **par de snapshots que encierra** ese instante en vez de usar siempre los dos últimos. Buffer subido de 5 a 12 snapshots. **Frames congelados: 82.6% → 3.3%.**
- **Tests estabilizados (`multiplayer-server/test-agarra.js`):** fallaban ~3 de cada 12 corridas por dos causas, ambas del mismo origen: `tick()` **repone palas al final de cada tick**, así que limpiarlas una sola vez al principio no alcanza. Una pala cerca hacía cruzar el umbral del 25% al jugador de masa 124, y otra inflaba la masa de 100 a 101 al fusionarse. Se limpian las palas justo antes de cada tick sensible, y la aserción de fusión pasó a comprobar que no se *pierda* masa en vez de exigir igualdad exacta. También se sacan los bots después de `addPlayer()`, que los repuebla vía `syncBots()`. Verificado con 20 corridas seguidas.
- **Notas de método, para no repetir el camino largo:** perseguí un "el jugador no se dibuja" que resultó ser tres cosas del entorno y ninguna del código — el panel del navegador oculto deja `window.innerWidth` en 0 y el canvas colapsa a 0×0; `requestAnimationFrame` no corre con el panel oculto (usar Node para medir); y `proxy.js` bloquea el sitio fuera del horario laboral, para lo cual en dev hay que usar `?godMode=true`. Antes de diagnosticar la app, conviene verificar el entorno.
- **Pendiente:** sigue sin resolverse que los bots acumulan masa sin techo (se vio uno con 160.851 en producción, y otro con 66.917). El usuario pidió explícitamente no arreglarlo por ahora.

### 2026-09-07 - Claude (Opus 5) — Login con Google: identidad, apodos y migración de rachas

- **Objetivo:** Cerrar el agujero de identidad del sitio. Hasta acá cualquiera podía ponerse el nombre de otro en el ranking y en el multijugador, porque la identidad era un UUID en `localStorage`. Requisitos del usuario: login **opcional en Pelardle**, **obligatorio para el ranking y el multijugador**, **sin perder las rachas** que ya existían, y **sólo Google** ("no pienso agregar gh").

- **Completado:**
  - **Canal de secretos (`secretos.js`)**, que no existía: lee `~/pela-data/secretos.env`, fuera del paquete de deploy. Se verificó empíricamente que el standalone de Next no carga ningún `.env`.
  - **Sesión firmada sin estado (`app/lib/sesion.js`)**: cookie HMAC + ticket de 2 minutos para el handshake de sockets. `test-sesion.js` la ataca con payload manipulado, firma inventada, otro secreto, vencimiento y basura variada: 8 casos, todos rechazan sin tirar excepciones.
  - **Flujo OAuth a mano** (`/api/auth/google`, `/api/auth/callback/google`, `/me`, `/socket-token`, `/apodo`, `/importar`), con `state` de 32 bytes contra CSRF y validación de que el destino de vuelta sea interno.
  - **Migración de rachas**, que era el requisito más delicado: al vincularse, la cuenta **adopta el id anónimo** del navegador, así la historia que ya estaba guardada bajo ese id pasa a ser suya. Lo que sólo vivía en `localStorage` se sube una vez y **sólo si la racha sigue viva** (último puzzle = hoy o el día hábil anterior); una racha vieja ya estaba cortada igual. Verificado de punta a punta en el navegador: una racha de 9 días entró sola y terminó como 10 en el ranking después de jugar.
  - **Apodos con dueño**: se eligen explícitamente al primer login (decisión del usuario: "que lo elija siempre"), uno por identidad, sin distinguir mayúsculas.
  - **Ranking cerrado a cuentas**, con la tabla completa visible para los anónimos más la invitación a entrar (decisión del usuario).
  - **Multijugador cerrado** en los dos juegos, con middleware en ambos namespaces y el botón de entrar en cada lobby.
  - Tests: 12 casos en `test-leaderboard.js` (4 nuevos, sobre cuentas, importación, apodos y filtro del ranking) y 8 en `test-sesion.js`. Las tres suites del multiplayer siguen pasando.

- **Dos bugs propios encontrados y corregidos antes de que llegaran a producción:**
  1. El callback leía el id anónimo de una **cookie**, pero el cliente lo guarda en **localStorage**: la migración de rachas nunca habría funcionado. Ahora viaja como query param dentro de la cookie de estado.
  2. `app/lib/sesion.js` leía `SESSION_SECRET` sin cargar nunca el archivo de secretos. En dev no se notaba porque `lib/auth.js` lo cargaba primero, pero `/api/auth/socket-token` y `/closed` **no pasan por ese módulo**: en producción habrían dado por inválida cualquier sesión buena. Ahora el módulo carga sus propios secretos.

- **Un detalle de UX que salió de un problema real del usuario:** entrar con Google fuera de horario devolvía a `/closed` sin decir nada, porque `proxy.js` rebota todas las páginas. Ahora `/closed` cuenta cómo salió el ingreso — el error si falló, "entraste bien como X" si funcionó.

- **Costo del cierre:** el multijugador ahora **exige cuenta**, así que quien jugaba sin loguearse ya no puede hasta que entre con Google. Es lo pedido, pero es un cambio visible para los que ya jugaban.

- **Pendiente / Siguientes Pasos:**
  - **El usuario tiene que crear `/home/ubuntu/pela-data/secretos.env` en el VPS** con `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` y `APP_URL=https://pela.signai.ar`, y **agregar el redirect URI de producción** en la consola de Google. Sin eso el login queda apagado solo (`authDisponible()` devuelve false y la UI no lo ofrece), sin romper nada.
  - Sigue abierto lo que el usuario mandó postergar: los bots del Agarrá acumulan masa sin techo (se vieron 160.851 y 66.917 en producción).

- **Notas:** El client secret no pasó nunca por el chat; lo puso el usuario a mano en su archivo, y acá sólo se verificó por largo y prefijo. `~/pela-data/` está fuera del repo y fuera del paquete de deploy, así que **el deploy no necesitó ningún cambio**: ni `ecosystem.config.cjs` ni `deploy.yml` se tocaron.

### 2026-09-08 - Antigravity (Gemini 3.8 Flash) — Guardado unificado de récords en cuenta de Google
- **Objetivo:** Pullear en todas las branches y extender el sistema de guardado de récords en la cuenta de Google a todos los juegos que tienen récords (EscapeCV, Pelardle, Agarrá.io y Pala Clicker), asegurando sincronización multidispositivo y que al iniciar sesión se guarde el mejor valor entre el actual (sin login) y el de la cuenta para no perder progreso.
- **Completado:**
  - **Git Sync:** `git fetch --all`, `git pull origin Development` y `git pull origin master` con merge sincronizado en ambas ramas.
  - **Backend (`multiplayer-server/`):**
    - Métodos `getRecords(playerId)` y `updateRecords(playerId, incoming)` en `LeaderboardStore` (`leaderboard.js`).
    - Fusión por el valor máximo (`Math.max`) en EscapeCV (TOP Chase y TOP Dodge), Agarrá.io (Mayor masa alcanzada), Pelardle (estadísticas y racha) y Pala Clicker (fusión de palas, brillo, unión de mejoras al nivel más alto, unión de inventario y logros).
    - Persistencia atómica de `this.records` en `data/leaderboard.json` y restauración en `init()`.
    - Endpoints HTTP `GET /cuentas/records` y `POST /cuentas/records` en `multiplayer-server/server.js`.
    - Suite de tests unitarios de récords en `multiplayer-server/test-leaderboard.js` (13 tests pasando) y validación de HTTP endpoints.
  - **App Router y Cliente (`app/`):**
    - Endpoint proxy de Next.js `app/api/records/route.js` (GET y POST) con verificación de cookie de sesión HMAC.
    - Módulo cliente `app/lib/recordsCliente.js` con `sincronizarRecords`, `obtenerRecordsLocales`, `guardarRecordsLocales` y `cargarRecords`.
    - Integración en `app/SesionApodo.js`: sincroniza automáticamente los récords del dispositivo al autenticarse en cualquier página.
  - **Juegos actualizados:**
    - **EscapeCV (`app/escapecv/page.js`):** Sincronización en mount de TOP Chase y Dodge, reactividad ante eventos de sync y envío a la nube en `gameOver` al superar récords.
    - **Pelardle (`app/pelardle/page.js`):** Carga y actualización de estadísticas y rachas vinculadas a la cuenta.
    - **Agarrá.io (`app/agarra/page.js`):** Récord personal de masa máxima persistido localmente y en la nube, mostrado en la tarjeta del lobby, en el HUD y en el modal de muerte.
    - **Pala Clicker (`app/clicker/page.js`):** Fusión inteligente de partida al cargar y auto-guardado periódico debounced en la nube (cada 15s y en beforeunload).
    - **Menú Principal (`app/menu/page.js`):** Tablero resumen "Tus Puntos y Récords en la Cuenta" en el encabezado y badges con récords individuales en las tarjetas de juego.
- **Verificación:**
  - `npm run build`: compilación limpia y optimizada de las 25 rutas sin errores.
  - Suites completas de tests pasando: `test-leaderboard.js`, `test-agarra.js`, `test-rooms.js`, `test-sesion.js` y `test-records-http.js`.

### 2026-09-08 - Claude (Opus 5) — Arreglos sobre los récords, perfil público y techo de masa de los bots

- **Objetivo:** Revisar lo que sumó Antigravity (guardado unificado de récords en la cuenta), arreglar lo que encontré, armar el perfil público y cerrar el bug de los bots del Agarrá que venía postergado.

- **Dos hallazgos de la revisión, ambos reproducidos antes de tocar nada:**
  1. **La racha cortada revivía.** `updateRecords` fusionaba `currentStreak` por el máximo contra lo que mandaba el navegador. Un dispositivo con el `localStorage` viejo (racha 5, último puzzle 190) le devolvía la racha a alguien que la había cortado hoy — y el mismo dato por `importarProgresoLocal` se rechazaba correctamente. Arreglado sacando `currentStreak` de la fusión: es del servidor, que es quien cuenta los intentos. El cliente también hacía `Math.max` al mostrarla; ahora muestra la del servidor.
  2. **Los récords los declaraba el cliente.** La masa del Agarrá salía del `localStorage` y el servidor la aceptaba, cuando el servidor **ya la tiene medida** porque la arena es suya. Ahora la escribe él (`anotarRecord` + `drenarRecords`, drenado en el tick), y del navegador se acepta sólo la primera vez, como migración. Un `POST` con 999999 después de eso no mueve nada.

- **Perfil público en `/p/[apodo]`.** Componente de servidor, sin sesión, para poder pasar el link. Publica sólo lo que el servidor mide —Pelardle y masa del Agarrá— más el puesto en el Cuadro de Honor. Deja afuera el email, el `googleSub` y los récords de EscapeCV y del Clicker, que son declarados por el navegador. Se llega desde el menú ("Mi legajo") y desde los nombres del ranking. Ojo: `proxy.js` lo bloquea fuera de horario como a cualquier página, así que un link compartido de noche rebota a `/closed`.

- **Bots del Agarrá con techo de masa (lo que estaba postergado).** Los bots no se mueren solos: sólo caen si alguien más grande se los come, y al más grande no se lo come nadie. Sin decaimiento de masa (se sacó a pedido del usuario) el líder crecía sin freno — en producción se lo vio en **160.851**. Ahora, pasado `BOT_MAX_MASS = 1500`, el bot se jubila y entra uno nuevo y chico: se los reemplaza en vez de frenarles la masa porque un bot clavado en el techo seguiría siendo intocable para siempre. A los humanos no los toca: crecer es el juego.

- **Tests:** 5 casos nuevos (3 en `test-leaderboard.js`, que pasa a 16; 2 en `test-agarra.js`, que pasa a 16). Las cuatro suites pasan y el build compila.

- **Pendiente / Siguientes Pasos:** quedó sin hacer la idea de **horas extra para logueados** (que tener cuenta habilite entrar fuera del horario laboral), que es lo que hoy hace incómodo probar cualquier cosa de noche y le daría una razón concreta más a registrarse.

### 2026-09-08 - Claude (Opus 5) — El apodo pasa a ser un handle sin espacios

- **Objetivo:** Que la identidad pública de cada uno sea un handle y no un nombre libre, a pedido del usuario.
- **Completado:**
  - `sanitizarHandle` en `leaderboard.js`: sin espacios (pasan a `_`), sólo letras —acentos y Ñ incluidos, que el sitio es en castellano—, números, `_` y `-`, de 2 a 16. Devuelve `null` si no queda nada usable y `reservarApodo` contesta el error.
  - **Migración automática al arrancar** (`migrarHandles`), idempotente, que además propaga el nombre nuevo al historial y al ranking diario —ahí está copiado el nombre que se muestra— y numera si el handle migrado chocara con otro existente. Se hace al levantar y no con un script suelto porque el archivo de datos vive fuera del repo y no hay paso de deploy donde meter una migración.
  - `perfilPublico` normaliza lo que recibe, así que **los links viejos con espacios siguen andando**: `/p/Juan%20Domingo` lleva al legajo de `Juan_Domingo`.
  - En el cuadro de elección: se normaliza mientras se escribe, se muestra la URL que va a quedar, y la sugerencia que viene del `localStorage` se normaliza antes de proponerla.
  - 2 casos nuevos en `test-leaderboard.js` (18 en total). Hubo que actualizar tres tests viejos que usaban handles de un carácter o con espacios, que ahora son inválidos: es el cambio de regla, no una regresión.
- **Notas:** Cuidado al tocar esto: `sanitizeName` (el nombre que se pone en una partida) **sigue admitiendo espacios** y es otra cosa. Sólo el handle es identificador.

### 2026-09-09 - Claude (Opus 5) — Aprendizaje por refuerzo para los bots del Agarrá

- **Objetivo:** Que los bots de Agarrá.io aprendan a jugar solos, con la idea de que terminen siendo mejores que el usuario. Pedido original: *"que los bots intenten cosas, y vayan aprendiendo"*.

- **Lo que hace viable el proyecto** y conviene no perder de vista: `multiplayer-server/agarra.js` **ya era un simulador headless**, porque sus tests corren sin sockets ni reloj real. O sea que se entrena contra el mismo código que corre en producción y no hay brecha entre lo entrenado y lo desplegado. Medido: ~30.000 transiciones por segundo en el i7 de DefeServer, unas 750 veces el tiempo real.

- **Arquitectura (`entrenamiento/`):** actores en Node que sólo simulan, hablando protocolo binario por stdin/stdout; PPO en la GPU con la actualización solapada con la recolección; liga de checkpoints viejos como rivales; y un evaluador aparte contra bots heurísticos, que es el único número que no se mueve porque los rivales mejoren. Panel con métricas y espectador en vivo en `http://defeserver:8420`. De 1.267 transiciones/s (primer intento) a ~30.000, con CPU al 80% y GPU al 60%.

- **Tres bugs de reloj de pared**, documentados arriba en Arquitectura. El segundo es el más instructivo: durante horas reporté que la política tenía 0,006 de mortalidad y que "había convergido", cuando en realidad la arena se había vaciado de rivales y estaba midiendo a un agente casi solo juntando palas.

- **Cuatro métricas que mintieron**, todas por el mismo motivo (denominador equivocado), también documentadas arriba. Vale la pena el detalle porque llevó a tres diagnósticos falsos: un "colapso" que era ruido de muestreo, un "empezó a cazar" donde los kills crudos nunca se movieron, y un amesetamiento que era el techo de la ventana de medición y no del agente.

- **Tres cosas que la política no podía percibir.** Las tres se descubrieron mirando jugar, no mirando números, y ninguna era un problema del algoritmo:
  1. **Velocidad relativa de los demás.** La observación daba posiciones pero no direcciones: un bot enorme acercándose y uno alejándose se veían idénticos.
  2. **La oportunidad perdida al estar dividido.** Los canales de presa se calculan contra la célula mayor propia, así que partido en ocho la grilla informaba que no había presas. Medido: dividido podía comerse a 0,00 bots de 4,8; entero, a 0,96. "Quedarse entero para poder cazar" era una estrategia imposible de descubrir porque su recompensa nunca aparecía en lo percibido.
  3. **Que cazar y farmear pagaban idéntico.** La recompensa miraba la variación de masa sin importarle de dónde venía, pero cazar exige acercarse a alguien que puede comerte. Con la misma paga, juntar palas es la opción racional — y era lo que hacía: 30.000 divisiones y 5 kills por cada dos millones de pasos.

- **Dos lecciones sobre la función de recompensa**, que produjeron dos políticas fallidas archivadas en `entrenamiento/versiones/`:
  - `no-morir`: el paso de la muerte descontaba toda la masa acumulada, así que el retorno de cualquier vida que terminara muerta era el mismo sin importar cuánto hubiera crecido. **Crecer no pagaba nada si al final te comían.** Aprendió a escapar y no pelear, que era óptimo bajo esa recompensa.
  - `auto-...` (el campeador de esquina): un premio **fijo** de +2 por matar hacía que comerse a alguien de masa 20 rindiera más, en proporción, que comerse a uno de masa 240 — y como los muertos reaparecen chiquitos, había una fuente infinita de presas baratas. Se paraba donde reaparecían y cobraba. Se eliminó el premio fijo; el bonus proporcional ya premia matar, según lo que valga la presa.

- **Resultado.** Contra una política al azar en el mismo entorno: crece 3 veces más rápido y muere cien veces menos. Contra un bot heurístico en la misma arena: 69 de masa contra 46, muriendo cinco veces menos. En arena mezclada la masa por bot queda pareja, así que la validación real fue jugar: el usuario probó los bots desplegados y los aprobó.

- **Cómo se opera:** `~/pela-rl/entrenamiento/arrancar.sh` en DefeServer (por Tailscale). `LIMPIAR=1` **archiva** la política anterior en `entrenamiento/versiones/`, no la borra — se perdió una así antes de arreglarlo. Para llevar una política nueva a producción: `exportar.py`, copiar `pesos-bots.bin` y `.json` a `multiplayer-server/`, y desplegar.

- **Pendiente / Siguientes Pasos:**
  - El entrenamiento sigue y ya es ~10% mejor que lo desplegado (12,3 de masa por minuto contra 11,1). Actualizar producción son dos minutos.
  - El evaluador contra bots heurísticos está saturado: la política los resolvió. Para seguir midiendo progreso haría falta un segundo evaluador contra un checkpoint viejo de la liga.
  - Sigue sin resolverse si la política generalizaría contra un humano hábil: todo lo medido es contra bots o contra sí misma.

- **Notas:** Esta entrada la pidió el usuario después de que la sesión ya hubiera mergeado a `master`; el changelog quedó atrasado respecto del código. Conviene escribirlo junto con el merge y no después.

---

## Dos versiones de la red jugando juntas en producción

- **Pedido:** *"deployea los agentes de ahora a prod, mezclados con los que estan deployeados ahora, asi los puedo ver como juegan en prod"*.

- **Por qué mezcladas y no reemplazando.** Comparar dos políticas por sus métricas históricas **no sirve**: la vara cambió. El bug del respawn por `setTimeout` hacía que las arenas de entrenamiento se drenaran de bots, así que todo lo medido antes del paso ~8300 —velocidad de simulación *y* números del evaluador— está inflado contra una arena semivacía. Correrlas por separado tampoco alcanza: la suerte del spawn pesa más que la diferencia entre las dos. La única comparación válida es la misma arena, las mismas palas y los mismos rivales.

- **Medido antes de desplegar** (36 arenas de 6 minutos, 4 bots por versión, alternando ranuras de spawn, ~103.500 muestras de masa por lado): en crecimiento son **indistinguibles** (77,87 contra 77,71 de masa media, y los tres workers no coinciden ni en el signo). La nueva muere menos (18 contra 32 muertes sobre 144 vidas) pero eso es **1,98 sigma sobre 50 eventos**: sugerente, no probado. La vieja llega a picos más altos (492 contra 429). O sea que 1.400 pasos más de entrenamiento no compraron una mejora visible jugando — razón de más para mirarlas juntas en vivo en vez de reemplazar a ciegas.

- **Cómo quedó:** `Arena` acepta `options.politicas`, una lista de `{etiqueta, red}`. Los `BOTS_CON_RED` bots con red se reparten entre las versiones y **cada bot se queda con la suya de por vida**. El reparto se recompone al nacer cada bot: al nuevo le toca la versión con menos representantes vivos. Sin eso alcanza con que muera un bot de una versión y renazca con la otra para terminar comparando 6 contra 2 sin que ninguna métrica lo delate. La etiqueta va pegada al nombre (`Bot Yeyo 🧠v1`), que es lo que hace mirable la comparación desde la tabla.

- **Costo:** 3,64 ms por tick contra un presupuesto de 33,3 a 30 Hz. Las palas se aplanan una sola vez por tick sobre un buffer que todas las redes comparten, así que agregar versiones no multiplica ese trabajo.

- **Degradación:** una variante cuyo archivo de pesos no está se saltea en silencio. Con una sola red se comporta igual que antes (`options.politica` sigue andando); sin ninguna, vuelve a la heurística. Un modelo que falta nunca puede romper el multijugador.

- **Verificado:** el `pesos-bots.bin` del repo es idéntico byte a byte (md5 `73ba37a0…`) al que estaba corriendo en el VPS, así que `🧠v1` es genuinamente la política que ya jugaba y no una reconstrucción. Disco del VPS: 2,0 GB libres, los 7,2 MB del segundo modelo no lo mueven.

- **Pendiente:** juntar masa y muertes por etiqueta desde producción para tener el duelo con jugadores humanos adentro, que es la parte que ninguna simulación cubre. Cuando se decida ganadora, el ciclo se cierra dejando una sola variante en `server.js`.

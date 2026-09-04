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



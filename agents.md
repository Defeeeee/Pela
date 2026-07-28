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
- **Otros agregados recientes:**
  - 📺 **`/video`:** Reproductor de video random con autoplay. **La lista `VIDEOS` tiene un solo link hardcodeado** — falta cargarle contenido. No está enlazado desde `/menu`.

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
- **Estilos:** No hay Tailwind ni librería de UI. Todo es estilo inline + bloques `<style>` embebidos en cada página. Las únicas dependencias son `next`, `react`, `react-dom` y `sharp`.
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

# Kortex — Plan de Corrección Integral: Datos Reales de Roblox y Entrega de Archivos/Imágenes en Components v2

Este plan corrige de raíz el funcionamiento de las herramientas de la **Categoría 2 (Taller de Avatares y Estudio 3D/2D)** y la **Categoría 3 (Utilidades de Juego y Servidores)**, eliminando todos los datos de relleno (mock fallbacks), reparando la entrega de imágenes renderizadas y archivos descargables (`.zip` y `.png`) en **Discord UI Components v2**, y actualizando los endpoints de búsqueda del Catálogo y Experiencias de Roblox.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Decisiones confirmadas para esta corrección:**
> 1. **Herramienta 2.4 (Exportador 3D)**: El bot entregará en el mensaje tanto el **render PNG en alta resolución** visible dentro del panel (`MediaGalleryBuilder`) como el **archivo `.zip` adjunto y descargable** (`FileBuilder` con `.obj`, `.mtl` y texturas `.png`).
> 2. **Herramienta 2.2 (Buscador de Clones y Similares)**: La búsqueda incluirá tanto **ítems oficiales de Roblox** como **clones/alternativas UGC baratas**, permitiendo encontrar ítems parecidos y comparar precios reales.
> 3. **Cero Datos de Relleno (100% Datos Reales de Roblox)**: Se eliminan por completo los datos estáticos de ejemplo (*Valkyrie Helm*, *Red Baseball Cap*, servidores o Gamepasses inventados de *Blox Fruits*). Todas las herramientas consultarán exclusivamente las APIs reales de Roblox en vivo.

---

## 1. Diagnóstico Técnico: Por Qué Fallaban las Herramientas

1. **Archivos `.ZIP` y Texturas `.PNG` Invisibles en Discord Components v2 (Herramientas 2.3 y 2.4)**:
   - Cuando un mensaje utiliza `flags: MessageFlags.IsComponentsV2`, Discord **no muestra los archivos de `files: [attachment]`** a menos que estén referenciados explícitamente dentro del `ContainerBuilder` mediante un componente **`FileBuilder`** (`attachment://nombre.zip`) o **`MediaGalleryBuilder`** (`attachment://imagen.png`).
   - En el Exportador 3D (2.4), el archivo `avatar_3d_export.zip` se enviaba en `files` sin un `FileBuilder` en el contenedor y sin adjuntar el render 3D en PNG, por lo que Discord solo mostraba el texto sin archivo ni imagen.
   - En el Extractor de Texturas (2.3), se pasaba una URL externa de miniatura en lugar de descargar el binario `.png` real desde `assetdelivery.roblox.com` y adjuntarlo en RAM.

2. **Endpoints Antiguos que Activaban Datos de Relleno (Herramientas 2.2, 2.5 y Categoría 3)**:
   - En **2.2 (Clones UGC)** y **2.5 (Color-Match)**, la consulta a `catalog/v1/search/items/details` con parámetros antiguos fallaba y activaba listas fijas de relleno.
   - En **Categoría 3 (Juegos y Servidores)**, `omni-search` usaba un `sessionId` fijo y el endpoint de Gamepasses usaba la ruta antigua `/v1/games/{universeId}/game-passes` en lugar de `apis.roblox.com/game-passes/v1/universes/{universeId}/game-passes`, haciendo que cualquier búsqueda cayera por defecto en datos estáticos de *Blox Fruits*.

---

## 2. Solución Detallada por Categoría y Herramienta

### Categoría 2: 👕 Taller de Avatares y Estudio 3D/2D

1. **Herramienta 2.4 — 📦 Exportador 3D de Avatares e Ítems (`.PNG` HD + `.ZIP` en RAM)**:
   - **Polling real del manifiesto 3D**: Consulta `thumbnails.roblox.com/v1/users/avatar-3d?userId={userId}` (para avatares) o `thumbnails.roblox.com/v1/assets-thumbnail-3d?assetId={assetId}` (para accesorios), reintentando si el estado es `Pending` hasta obtener el `imageUrl` del manifiesto JSON en `t0..t7.rbxcdn.com`.
   - **Resolución de Hashes y Empaquetado Real**: Resuelve los hashes de `obj`, `mtl` y cada textura en `textures[]` mediante el algoritmo XOR (`i = 31`), descarga los buffers reales en RAM y reescribe las referencias de textura en el `.mtl` para que al abrir el `.obj` en Blender o Blockbench cargue las texturas `.png` automáticamente.
   - **Entrega Doble en Discord (Imagen HD + Archivo `.ZIP`)**:
     - Descarga en RAM el render PNG en alta resolución (`720x720`) del avatar o ítem y lo incrusta en el contenedor mediante `MediaGalleryBuilder` (`attachment://render_3d_hd.png`).
     - Incrusta el paquete `avatar_3d_export.zip` dentro del contenedor mediante **`FileBuilder`** (`attachment://avatar_3d_export.zip`) para que aparezca el cuadro de descarga directa en Discord.

2. **Herramienta 2.3 — 🧬 Extractor de Texturas en Bruto + Probador de Plantillas 2D**:
   - **Extracción Binaria Real desde XML (`assetdelivery`)**: Consulta `assetdelivery.roblox.com/v1/asset/?id={assetId}`, extrae la etiqueta `<url>` o `TextureId` (`REAL_IMAGE_ID`), y descarga el **buffer binario `.png` original** en memoria RAM.
   - **Visualización y Descarga Directa**: Muestra la textura original en `MediaGalleryBuilder` (`attachment://textura_original.png`) y añade un componente **`FileBuilder`** con el archivo `.png` adjunto para descargarlo con un clic sin pérdidas de compresión.
   - **Probador en Maniquí 2D**: Toma el buffer `.png` extraído o la URL subida por el usuario y proyecta las coordenadas UV reales de camisa/pantalón sobre el esquema de maniquí en `@napi-rs/canvas`, adjuntando el resultado en `MediaGalleryBuilder`.

3. **Herramienta 2.2 — 🔍 Buscador de Clones UGC e Ítems Similares de Roblox**:
   - **Búsqueda Dual (Oficiales de Roblox + Clones UGC)**: A partir del ID, enlace o nombre de cualquier ítem, obtiene sus metadatos reales (`Name`, `AssetTypeId`, `PriceInRobux`, `Creator`) y ejecuta la búsqueda en el catálogo de Roblox incluyendo tanto **ítems oficiales de Roblox** como **alternativas UGC de creadores**.
   - **Modos de Filtro en Vivo**: Incluye botones para alternar entre **Todos los Similares (Roblox + UGC)** y **Más Baratos (Precio Piso)**, renderizando en `@napi-rs/canvas` el ítem consultado a la izquierda y los resultados reales a la derecha con sus miniaturas descargadas en RAM y su diferencia de precio real.

4. **Herramienta 2.1 — 🧪 Probador de Combinaciones en Vivo (Outfit Sandbox / Try-On)**:
   - **Carga Real de Avatar y Prendas Puestas**: Consulta `avatar.roblox.com/v1/users/{userId}/avatar` para listar todas las prendas y accesorios reales que el jugador lleva puestos actualmente con sus precios reales en Robux.
   - **Agregar por Nombre o ID + Quitar Prendas**: Permite agregar hasta 5 ítems nuevos buscando por **nombre o ID**, o quitar piezas, componiendo en `@napi-rs/canvas` la vista del avatar junto con las miniaturas reales de cada pieza equipada/probada y el cálculo exacto de precio de lista vs. 40% de cashback.

5. **Herramienta 2.5 — 🎨 Emparejador de Accesorios por Color Exacto (Color-Match)**:
   - **3 Formas de Entrada**: Permite analizar los colores reales de **(a)** el avatar vinculado del usuario, **(b)** cualquier ID de camisa/pantalón/accesorio, o **(c)** un **código de color HEX directo** (ej. `#E11D48`).
   - **Búsqueda Cromática Real**: Extrae los 3 tonos HEX dominantes con `ctx.getImageData()`, traduce el tono RGB al descriptor cromático correspondiente en el catálogo de Roblox para la categoría elegida (Sombreros, Pelo, Cara, Espalda, etc.), descarga las miniaturas reales de los resultados y calcula la distancia euclidiana ($\Delta RGB$) píxel por píxel para mostrar únicamente accesorios reales que combinen con ese color.

---

### Categoría 3: 🎮 Utilidades de Juego y Servidores

1. **Buscador Real de Experiencias (`resolverJuegoRoblox`)**:
   - Resuelve cualquier juego por **nombre**, **PlaceId** o **enlace de Roblox** consultando `apis.roblox.com/search-api/omni-search` (con UUIDs de sesión válidos), `apis.roblox.com/universes/v1/places/{placeId}/universe` y `games.roblox.com/v1/games?universeIds={universeId}`, sin caer nunca en datos falsos.

2. **Herramienta 3.1 — 👻 Buscador de Servidores Vacíos con "Direct Launch"**:
   - Consulta en vivo `games.roblox.com/v1/games/{placeId}/servers/Public?sortOrder=Asc&excludeFullGames=true&limit=100`, filtra servidores reales con `playing >= 1` y los ordena por menor cantidad de jugadores y menor ping.
   - Si el usuario aún no eligió un juego, muestra un selector rápido de experiencias populares + botón **Buscar Cualquier Juego por Nombre o PlaceId**, y entrega enlaces de lanzamiento directo con el `placeId` y `gameInstanceId` (`JobId`) reales.

3. **Herramienta 3.2 — 🎟️ Extractor Completo de Gamepasses de un Juego**:
   - Consulta el endpoint oficial `apis.roblox.com/game-passes/v1/universes/{universeId}/game-passes?passView=Full&pageSize=100` (con respaldo en `games.roblox.com/v1/games/{universeId}/game-passes`), obteniendo todos los Gamepasses reales del juego, sus precios en R$ y sus miniaturas reales, permitiendo enviarlos con 1 clic a `Mi Lista` del `Price Sniper`.

4. **Herramienta 3.3 — 🎁 Bóveda de Códigos Activos con Checklist Personal**:
   - Permite elegir el juego, filtrar entre todos los códigos o solo los pendientes de canje, marcar/desmarcar códigos como `✅ Canjeado` en `user_redeemed_codes` de Supabase con barra de progreso en vivo, e incorpora un botón **`➕ Agregar Código a la Bóveda`** para registrar códigos nuevos de cualquier experiencia de Roblox.

5. **Herramienta 3.4 — 🔔 Suscriptor de Parches y Actualizaciones Silenciosas**:
   - Consulta en tiempo real el campo `updated`, `playing` y `visits` de los juegos suscriptos en `games.roblox.com/v1/games`, muestra hace cuánto se subió el último parche (`<t:TIMESTAMP:R>`) e incorpora el botón **`🔄 Verificar Parches en Vivo Ahora`** además del monitoreo automático.

6. **Herramienta 3.5 — 🗺️ Escáner de Sub-Lugares y Mapas Ocultos (Universe Mapper)**:
   - Consulta `develop.roblox.com/v1/universes/{universeId}/places` y `games.roblox.com/v1/games/multiget-place-details` para listar únicamente el `RootPlace` y los sub-lugares secundarios reales pertenecientes a ese universo, con sus nombres internos, `PlaceId` y enlace directo.

---

## 3. Arquitectura de Entrega de Archivos e Imágenes en Components v2

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 CONTENEDOR DISCORD UI COMPONENTS V2                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. TextDisplayBuilder (Encabezado, metadatos reales de Roblox y precios)     │
│ 2. MediaGalleryBuilder (attachment://render.png generado en RAM con Canvas)  │
│ 3. FileBuilder (attachment://avatar_3d_export.zip o textura_original.png)    │
│ 4. ActionRowBuilder (Selectores a Price Sniper, Filtros y Modales de Búsq.)  │
└──────────────────────────────────────────────────────────────────────────────┘
```

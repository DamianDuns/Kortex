# Prompt Maestro de Desarrollo — Sistema Independiente `/tycoon` para Kortex

Copiá y pegá este prompt completo en tu entorno de desarrollo o asistente de código para implementar el comando `/tycoon` dentro de **Kortex** respetando cada decisión de diseño, arquitectura y seguridad económica.

## 1. Rol y Contexto del Proyecto Actual

Actuá como un Arquitecto Senior de Bots de Discord en **Node.js (`discord.js` v14+ con Discord Components V2)**, especialista en renderizado gráfico con **`@napi-rs/canvas` (o `canvas`)** y bases de datos en **Supabase (PostgreSQL)**.

Estamos desarrollando un nuevo módulo y comando slash llamado **`/tycoon`** para el bot **Kortex**.
- **Base de datos actual:** Usamos **Supabase (PostgreSQL)** conectado mediante `db.js` (NO usamos MongoDB).
- **Interfaz visual actual:** Todo el bot utiliza **Discord Components V2** (`ContainerBuilder`, `TextDisplayBuilder`, `ActionRowBuilder`, `StringSelectMenuBuilder`, `ButtonBuilder`, `ModalBuilder`, `SeparatorBuilder` y `MessageFlags.IsComponentsV2`), apoyándose en las utilidades visuales de `utils/ui.js` (`COLORES`, `footer`, `separador`).
- **Idioma:** Estructura interna del código (variables, funciones, tablas y columnas) clara y consistente; todos los textos visibles para el usuario en Discord deben estar en **Español (estilo rioplatense/argentino consistente con el resto de Kortex)**.

## 2. Regla de Oro: Independencia Total de `/roblox`

1. **Cero mezcla con `/roblox`:** El comando `/roblox` contiene 15 herramientas técnicas de análisis, investigación y utilidades reales de Roblox (incluyendo su propia Categoría 1 de calculadoras financieras y monitoreo de precios reales). **Bajo ninguna circunstancia** debés modificar los paneles de `/roblox`, bloquear herramientas detrás de monedas del juego ni mezclar las calculadoras reales de Roblox con la economía del juego.
2. **Comando propio `/tycoon`:** Todo este sistema de farmeo, construcción, pociones, creación UGC y trading de coleccionables vive exclusivamente dentro del comando **`/tycoon`** (y sus interacciones asociadas con prefijo `tycoon_`).
3. **Recompensas Silenciosas por Actividad Natural:** El único puente con el resto del bot es un **hook silencioso en segundo plano** (`rewardSilentActivity(userId)`). Cuando un usuario explora o usa funciones del bot o participa activamente (con un cooldown interno de por ejemplo 5 minutos para evitar spam), el sistema le acredita silenciosamente una pequeña cantidad de monedas (**Tix 🎟️**) en su cuenta de `/tycoon`, sin mostrar alertas intrusivas ni "boosters" dentro de `/roblox`.

## 3. Concepto General y Monedas del Sistema `/tycoon`

El comando `/tycoon` recrea la experiencia clásica de un **Tycoon de Roblox en 3ra persona** combinado con un **sistema propio de Coleccionables (Normales, UGC de usuarios, Limited y Limited U) y Trading P2P**:

| Elemento | Nombre en el Sistema | Función Principal |
| :--- | :--- | :--- |
| **Moneda Principal** | **Tix (`🎟️`)** | Moneda obtenida en el Buzón del Tycoon, ventas de UGC, trades y recompensas silenciosas. Sirve para construir máquinas, comprar en la Tienda Normal, adquirir UGC, comprar pociones y abrir Cofres de Ascensión. |
| **Índice de Prestigio** | **RAP (`📈`)** | Valor estimado acumulado únicamente por los ítems **Limited** y **Limited U** que posee el usuario en su inventario. |
| **Multiplicador de Producción** | **Boost Total (`🚀`)** | Suma porcentual de las bonificaciones pasivas de los **Ítems Equipados** + **Poción Activa** + **Beneficio de Comunidad (YouTube / Server Boost)**. |

## 4. Motor de Renderizado Visual en 3ra Persona (`tycoon_snapshot.png`)

En lugar de usar un simple menú de texto con barras de progreso o un GIF pesado, la sección principal de `/tycoon` genera al vuelo una **imagen PNG estática (`tycoon_snapshot.png`)** mediante Canvas cada vez que el usuario ejecuta el comando o presiona un botón de interacción:

1. **Perspectiva Superior en 3ra Persona (Top-Down / Isométrica):**
   - Fondo estilo *Baseplate* con grilla de *studs* sutiles y en el centro la plataforma del **Estudio Tycoon** del jugador.
2. **Avatar del Usuario en el Centro de la Plataforma:**
   - Si el usuario tiene su **Cuenta de Roblox vinculada** en Kortex, el motor carga su avatar/miniatura de Roblox en el centro del estudio con su nombre `@Usuario` encima.
   - Si el usuario **no tiene cuenta vinculada**, el motor dibuja automáticamente el **Avatar Default clásico de Roblox (Noob)** para que pueda jugar sin fricciones.
   - Si el usuario tiene equipado un sombrero/ítem del sistema o una poción activa, se dibuja el indicador visual / aura sobre su personaje en el PNG.
3. **Evolución Visual y Botones de Piso (Pads):**
   - Alrededor del avatar aparecen las interacciones clásicas de un Tycoon de Roblox:
     - **Buzón Recolector (Pad Circular Verde):** Muestra en texto claro cuántos **Tix 🎟️** hay acumulados listos para reclamar.
     - **Cinta Transportadora:** Muestra bloques estáticos en tránsito desde las máquinas hacia el buzón.
     - **Botones de Compra en el Piso (Pads Circulares Amarillos/Azules):** Al inicio solo aparecen los primeros botones (ej. *Dropper #1*, *Paredes del Estudio*). Cuando el usuario compra uno, en el siguiente render PNG **desaparece el botón del piso, se dibuja la máquina o mejora del edificio ya construida**, y **aparecen los siguientes botones de piso desbloqueados** (*Dropper #2*, *Mejorador Láser de Cinta*, *Racks de Servidores*, *Torre Central / Estudio Nivel Máximo*).
4. **Cálculo de Producción Basado en Timestamps (Sin loops pesados en RAM):**
   - Para cuidar la RAM del host, no uses `setInterval` por cada usuario. Guardá `last_collected_at` en Supabase y, cada vez que el usuario interactúe o abra `/tycoon`, calculá `minutos_transcurridos * produccion_por_minuto_total` respetando el tope máximo del buzón (`collector_cap`).

## 5. Estructura de Navegación del Panel `/tycoon` (Components V2)

El panel de `/tycoon` debe construirse con `ContainerBuilder` y un `StringSelectMenuBuilder` principal (`tycoon_section_select`) que permita cambiar entre **5 secciones claras**:

### Sección 1: `🏗️ Mi Estudio Tycoon` (Vista Principal con Imagen PNG)
- Muestra el render PNG estático (`tycoon_snapshot.png`) del estudio en 3ra persona.
- Muestra el resumen rápido: **Billetera de Tix 🎟️**, **Buzón Recolector actual / capacidad**, **Producción por minuto** y **Boost Total activo**.
- Fila de botones (`ActionRowBuilder`) sincronizada con lo que se ve en el piso de la imagen:
  - `🟢 Reclamar Buzón (+X 🎟️)`
  - Botones dinámicos para construir los **Pads de piso desbloqueados** en ese momento (`🟡 Construir [Nombre] (Costo 🎟️)`).
  - Botón `🔄 Ascender / Rebirth` (disponible al completar las 6 mejoras del estudio; reinicia las máquinas a cambio de un multiplicador permanente, mayor tope de buzón y 1 tirada en el Cofre de Ascensión).

### Sección 2: `🛒 Tienda Normal` (Accesorios Estándar)
- Vende únicamente **ítems normales** a precio fijo en Tix, accesibles para cualquier jugador que recién empieza.
- **Regla estricta:** Ningún ítem de esta tienda lleva etiqueta `Limited`, `Limited U` ni `UGC`.
- Otorgan una bonificación pasiva moderada para el Tycoon (entre `+5%` y `+12%` de producción) y no tienen stock limitado ni reventa especulativa.

### Sección 3: `🎨 Taller & Mercado UGC` (Creación por Usuarios + Regalías)
Permite a los usuarios diseñar y publicar un ítem customizado con la etiqueta **`[🎨 UGC]`** en el mercado comunitario del bot y ganar regalías en Tix cada vez que otros jugadores lo compren:
- **Doble Vía de Acceso (Sin obligar a gastar dinero real):**
  1. **Vía Afiliado / Comunidad (Instantánea):** Desbloqueado automáticamente si el usuario tiene **Server Boost (Discord Nitro)** en el servidor o tiene vinculada su **Suscripción / Membresía al canal de YouTube**.
  2. **Vía Gratuita por Mérito (F2P):** Cualquier usuario sin membresías puede desbloquear la **Licencia de Creador UGC** completando su **Estudio en Nivel Máximo (Nivel 6)** y abonando una matrícula única en moneda del juego (**1.200 Tix**).
- **Funcionamiento y Regalías (70% / 30%):**
  - Mediante un `ModalBuilder`, el creador elige el **Nombre del UGC**, el **Estilo/Color/Emoji** y el **Precio de venta**.
  - Publicar un UGC cuesta un depósito fijo de **250 Tix** (para evitar spam).
  - Cada vez que otro jugador compra ese UGC en el catálogo, el **70% de los Tix va directo a la billetera del creador** (notificándole su ganancia de afiliado) y el **30% restante se quema como impuesto del mercado** para evitar inflación.

### Sección 4: `👑 Bóveda Limited / Limited U & Trading P2P`
Los ítems **Limited** y **Limited U** son las joyas de la economía de `/tycoon` y **jamás se compran en la Tienda Normal**:
- **Obtención Difícil:**
  - Solo se obtienen con baja probabilidad al abrir **Cofres de Ascensión** (costosos en Tix o ganados al hacer *Rebirth*) o mediante **Drops de Evento** con stock global estricto (por ejemplo, solo 15 o 25 copias existentes en toda la base de datos, asignando número de serie único como `#04/15`).
  - Otorgan las bonificaciones pasivas más altas para el Tycoon (`+20%` a `+45%`) y suman **RAP 📈** al perfil del usuario.
- **Recreación del Trading de Roblox (Trade Hangout P2P):**
  - Los usuarios pueden enviar ofertas de intercambio P2P a otros jugadores seleccionando hasta 3 ítems `Limited` / `Limited U` propios + una cantidad opcional de `Tix` a cambio de los `Limited` / `Limited U` del otro jugador.
  - Cuando se concreta un trade o una venta en el mercado secundario de Limiteds, el bot recalcula automáticamente el **RAP** del ítem usando un promedio ponderado de sus últimas transacciones válidas.

### Sección 5: `🧪 Pociones & Beneficios VIP de Comunidad`
Aquí se concentra el sistema de **Boosts** del Tycoon sin mezclar otros comandos ni cobrar membresías propias del bot:
- **Pociones Consumibles:** Comprables con Tix o ganadas en cofres (ej. *Poción de Velocidad +50% por 30 min*, *Elixir de Mega Producción x2 por 30 min*). Guardan `potion_expires_at` en Supabase.
- **Beneficios de Comunidad / Afiliados (Nitro & YouTube):**
  - Botón de sincronización que verifica si el miembro tiene el rol/estado de **Discord Server Booster (Nitro)** (`+50% producción` + entrega del ítem exclusivo **Neon Booster Top Hat**) o **Suscriptor / Miembro de YouTube** (`+35% producción` + 1 poción diaria reclamable gratis + Licencia UGC).

## 6. Reglas Anti-Abusos, Anti-Inflación y Moderación (Seguridad del Mercado UGC)

Implementá de forma obligatoria estas 5 validaciones en el backend para evitar las polémicas clásicas de economías creadas por usuarios:

| Riesgo / Abuso | Regla Técnica Obligatoria en el Código |
| :--- | :--- |
| **1. Lavado de Tix con Multicuentas (*Alt-Farming*)** | Prohibir que un usuario compre su propio UGC. Exigir que el comprador tenga al menos **Estudio Nivel 4** y una antigüedad mínima en el sistema antes de poder comprar UGC de otros jugadores. Limitar a **máximo 1 copia del mismo UGC por comprador**. |
| **2. Precios Ridículos o Inflación Infinita** | Validar en el Modal que el precio de cualquier UGC esté estrictamente entre **200 Tix (mínimo)** y **1.500 Tix (máximo)**. Aplicar siempre la quema del **30% de comisión** en cada venta (el creador cobra el 70%). |
| **3. Estafas de *"Falsos Limiteds"* (*Scamming*)** | Forzar el prefijo/etiqueta inborrable **`[🎨 UGC]`** en todos los ítems de usuarios. Bloquear por Regex en el nombre palabras reservadas (`limited`, `limited u`, `oficial`, `admin`, `staff`, `kortex`, `dominus`, `valkyrie`). Prohibir que los ítems UGC entren en la mesa de **Trading P2P de Limiteds**. |
| **4. Desbalance de Bonificaciones (*Pay-to-Win*)** | El usuario creador **no puede elegir el porcentaje de bonus** de su UGC. Todo ítem UGC tiene un bonus fijo estandarizado por el bot (ej. **+10% de producción**). |
| **5. Spam y Nombres Ofensivos** | Pasar el nombre del UGC por un filtro de palabras prohibidas/NSFW, limitar a **máximo 2 ítems UGC activos por creador** y permitir que el propietario del bot elimine cualquier UGC desde `/config`. |

## 7. Esquema de Base de Datos en Supabase (SQL)

Creá las siguientes tablas en Supabase para soportar todo el sistema sin conflictos con las tablas existentes (`guilds`, `roblox_wishlist`):

```sql
-- 1. Perfil principal del jugador en /tycoon
CREATE TABLE IF NOT EXISTS tycoon_profiles (
  user_id TEXT PRIMARY KEY,
  tix_balance BIGINT NOT NULL DEFAULT 500,
  collector_tix BIGINT NOT NULL DEFAULT 0,
  collector_cap BIGINT NOT NULL DEFAULT 1500,
  studio_stage INT NOT NULL DEFAULT 1,
  rebirth_count INT NOT NULL DEFAULT 0,
  unlocked_pads JSONB NOT NULL DEFAULT '["pad_dropper1"]',
  equipped_item_id UUID NULL,
  f2p_ugc_license BOOLEAN NOT NULL DEFAULT FALSE,
  potion_type TEXT NULL,
  potion_bonus_pct INT NOT NULL DEFAULT 0,
  potion_expires_at TIMESTAMPTZ NULL,
  last_collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_silent_reward_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Catálogo de ítems (Normales, UGC de usuarios, Limited y Limited U)
CREATE TABLE IF NOT EXISTS tycoon_items_catalog (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('NORMAL', 'UGC', 'LIMITED', 'LIMITED_U')),
  creator_user_id TEXT NULL, -- NULL si es oficial del bot, ID de Discord si es UGC
  price_tix BIGINT NOT NULL DEFAULT 0,
  rap_value BIGINT NOT NULL DEFAULT 0,
  bonus_pct INT NOT NULL DEFAULT 5,
  visual_color TEXT NOT NULL DEFAULT '#38BDF8',
  max_supply INT NULL, -- Solo para LIMITED_U (ej. 15 copias)
  minted_count INT NOT NULL DEFAULT 0,
  sales_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Inventario de instancias de ítems por usuario
CREATE TABLE IF NOT EXISTS tycoon_user_inventory (
  instance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES tycoon_items_catalog(item_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES tycoon_profiles(user_id) ON DELETE CASCADE,
  serial_number INT NULL, -- Ej. 4 para mostrar #04/15 en LIMITED_U
  is_tradable BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE solo para LIMITED y LIMITED_U
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, serial_number)
);

-- 4. Registro de compras UGC (Evita auto-compra y limita a 1 copia por comprador)
CREATE TABLE IF NOT EXISTS tycoon_ugc_purchases (
  purchase_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES tycoon_items_catalog(item_id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  price_paid BIGINT NOT NULL,
  royalty_paid BIGINT NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, buyer_id)
);

-- 5. Ofertas de Trading P2P (Exclusivo para Limited y Limited U)
CREATE TABLE IF NOT EXISTS tycoon_trades_p2p (
  trade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  sender_instance_ids JSONB NOT NULL DEFAULT '[]',
  receiver_instance_ids JSONB NOT NULL DEFAULT '[]',
  sender_tix_offer BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 8. Plan de Implementación Paso a Paso Solicitado

Por favor, implementá este sistema en el proyecto siguiendo este orden modular:
1. **`services/tycoonEngine.js`:** Lógica de base de datos en Supabase, cálculo de producción pasiva por timestamps, validaciones anti-abuso de UGC (rango `200-1500 Tix`, comisión `70/30`, filtro de palabras prohibidas), apertura de Cofres de Ascensión y hook de recompensas silenciosas.
2. **`utils/tycoonRenderer.js`:** Generador de la imagen estática `tycoon_snapshot.png` en perspectiva superior 3ra persona usando Canvas (dibujando el estudio según las mejoras desbloqueadas, el buzón verde con su saldo, los pads circulares pendientes en el piso y el avatar de Roblox vinculado o el Noob default en el centro).
3. **`commands/tycoon.js` y `interactions/tycoon_*.js`:** El panel interactivo con **Discord Components V2** y sus 5 vistas seleccionables, modales de creación UGC y botones de acción.
4. **Actualización en `commands/help.js` y `commands/config.js`:** Agregar la documentación del nuevo comando `/tycoon` en el selector principal de `/help` y el interruptor de activación/mantenimiento del módulo `/tycoon` en `/config`.

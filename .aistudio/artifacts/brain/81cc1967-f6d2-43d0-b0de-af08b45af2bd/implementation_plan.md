# Sistema Independiente `/tycoon` — Simulador de Estudio, Mercado UGC y Trading P2P de Limiteds

Implementación del nuevo comando independiente **`/tycoon`** en Kortex, diseñado como un simulador de Estudio Tycoon de Roblox en 3ra persona con renderizado dinámico en imagen PNG (`tycoon_snapshot.png`), economía propia basada en **Tix (`🎟️`)** y **RAP (`📈`)**, creación de accesorios **UGC** con regalías del 70%, bóveda de coleccionables **Limited / Limited U** con intercambio P2P y soporte completo en **Español (`es`)** e **Inglés (`en`)**.

---

## Decisiones Confirmadas por el Usuario

> [!IMPORTANT]
> Las siguientes decisiones fueron confirmadas directamente por vos y guían toda la construcción del sistema:

- **Soporte Bilingüe Completo (`es` / `en`)**: Tanto los paneles de Discord Components V2 de `/tycoon` como todos los textos renderizados dentro de la imagen `tycoon_snapshot.png` (etiquetas del buzón, pads de piso, nivel del estudio y multiplicadores) se adaptan automáticamente al idioma elegido por cada usuario (**Español** o **Inglés**), manteniendo el comando `/tycoon` en inglés.
- **Bóveda Limited y Trading P2P Híbrido**: En la Sección 4 (`👑 Bóveda Limited / Limited U & Trading P2P`), los jugadores cuentan tanto con un **Tablero de Ofertas Públicas** (donde cualquiera puede publicar o aceptar un intercambio sin conocer de antemano quién tiene cada Limited) como con **Envío Directo de Oferta** ingresando el `@usuario` o ID de Discord del destinatario.
- **Detección Automática de Beneficios de Comunidad (Discord Boost & YouTube)**: En la Sección 5 (`🧪 Pociones & Beneficios VIP de Comunidad`), el botón de sincronización detecta automáticamente si el usuario es **Server Booster (Discord Nitro)** en el servidor y si posee rol de suscriptor/miembro de **YouTube** o cuenta vinculada en Kortex, otorgando sus bonificaciones pasivas, el ítem exclusivo *Neon Booster Top Hat* y la Licencia de Creador UGC.
- **Independencia Absoluta de `/roblox`**: `/roblox` permanece 100% intacto con sus 15 herramientas técnicas reales. El único vínculo es un hook silencioso en segundo plano (`rewardSilentActivity`) con enfriamiento de 5 minutos que acredita una pequeña recompensa pasiva de **Tix (`🎟️`)** en la cuenta de `/tycoon` sin mostrar avisos intrusivos dentro de `/roblox`.

---

## 1. Visión General y Concepto del Sistema

- **Qué Hace**: Permite a los usuarios construir y mejorar su propio **Estudio Tycoon de Roblox** desde Discord, reclamando **Tix (`🎟️`)** en su buzón recolector, desbloqueando máquinas paso a paso sobre el piso del estudio, realizando **Rebirths (Ascensiones)** para ganar multiplicadores permanentes y tiradas en el **Cofre de Ascensión**, diseñando sus propios accesorios **`[🎨 UGC]`** para ganar regalías cuando otros jugadores los compren y comerciando ítems **Limited / Limited U** con número de serie único (`#01/15`) que incrementan su **RAP (`📈`)**.
- **Valor Principal**: Ofrece un bucle de juego profundo, visual y autosustentable dentro del bot, protegido contra inflación y estafas mediante validaciones estrictas de mercado.

---

## 2. Experiencia de Usuario y Diseño Visual

### Motor Gráfico en 3ra Persona (`tycoon_snapshot.png`)
Cada vez que el jugador abre `/tycoon` o interactúa con su estudio, el motor Canvas genera al vuelo una escena isométrica / perspectiva superior en alta definición:
- **Baseplate & Plataforma del Estudio**: Grilla clásica de *studs* con piso iluminado que evoluciona visualmente según el nivel del estudio (`Etapa 1` a `Etapa 6`) y la cantidad de *Rebirths*.
- **Avatar Central**:
  - Si el jugador vinculó su cuenta de Roblox en Kortex, se renderiza su avatar real en el centro de la plataforma con su etiqueta `@Usuario` y su aura/accesorio equipado.
  - Si no tiene cuenta vinculada, se dibuja automáticamente el **Noob clásico de Roblox** (cabeza amarilla, torso azul, brazos amarillos, piernas verdes) para que pueda jugar al instante sin fricción.
- **Buzón Recolector (Pad Circular Verde)**: Muestra el saldo acumulado listo para cobrar (`+X 🎟️`) y la barra de capacidad frente al tope máximo (`collector_cap`).
- **Cinta Transportadora y Máquinas Construidas**: A medida que el jugador compra mejoras, desaparecen los pads circulares amarillos del piso y aparecen dibujadas las máquinas activas (*Dropper #1*, *Muros del Estudio*, *Dropper #2*, *Upgrader Láser*, *Racks de Servidores*, *Torre Central Nivel Máximo*) enviando bloques hacia el buzón.
- **Pads de Compra Desbloqueados**: Se dibujan como círculos brillantes en el piso con el nombre y costo en Tix, sincronizados 1 a 1 con los botones de construcción debajo de la imagen.

### Las 5 Secciones del Panel `/tycoon` (Discord Components V2)
El selector principal (`tycoon_section_select`) permite cambiar entre:
1. **`🏗️ Mi Estudio Tycoon`**: Imagen `tycoon_snapshot.png`, resumen de Billetera (`🎟️`), Buzón (`🎟️ / Cap`), Producción por minuto, RAP (`📈`) y Boost Total (`🚀`), junto con los botones para **Reclamar Buzón**, **Construir Pads Desbloqueados**, **Equipar Ítem** y **Ascender (Rebirth)**.
2. **`🛒 Tienda Normal`**: Catálogo de accesorios estándar a precio fijo en Tix (`+5%` a `+12%` de producción), sin etiquetas Limited ni UGC, accesibles para todos los jugadores.
3. **`🎨 Taller & Mercado UGC`**:
   - **Doble vía de licencia**: Gratuita automática para **Server Boosters / Suscriptores de YouTube**, o desbloqueable jugando (Estudio Nivel 6 + matrícula única de `1.200 Tix`).
   - **Creación por Modal**: El creador define nombre, color/estilo y precio (`200` a `1.500 Tix`), abonando `250 Tix` de publicación. El ítem recibe obligatoriamente el prefijo **`[🎨 UGC]`** y un bonus fijo de **`+10%`**.
   - **Regalías 70% / 30%**: En cada venta, el creador recibe el **70%** directo en su billetera de Tix y el **30%** se quema para controlar la inflación.
4. **`👑 Bóveda Limited / Limited U & Trading P2P`**:
   - **Cofre de Ascensión & Drops Limited U**: Apertura de cofres y reclamo de drops con stock global estricto (ej. `15` o `25` unidades con serie `#01/15`), sumando **RAP (`📈`)** y bonificaciones de `+20%` a `+45%`.
   - **Tablero Público + Oferta Directa P2P**: Los jugadores pueden publicar una oferta en el tablero público o enviar un trade directo a un `@usuario / ID` ofreciendo hasta 3 ítems `Limited` / `Limited U` + `Tix`. Al concretarse un intercambio, el **RAP** de los ítems involucrados se actualiza automáticamente.
5. **`🧪 Pociones & Beneficios VIP de Comunidad`**:
   - **Tienda de Pociones**: *Poción de Velocidad (+50% por 30 min)* y *Elixir de Mega Producción (+100% por 30 min)* con temporizador `potion_expires_at`.
   - **Sincronización Nitro Boost & YouTube**: Verifica roles/estado del miembro en Discord y vinculación para activar `+50%` (Nitro Boost + *Neon Booster Top Hat*) y `+35%` (YouTube + Poción diaria gratis + Licencia UGC).

---

## 3. Decisiones de Seguridad Económica y Moderación

- **Protección Anti-Lavado y Anti-Scam en UGC**:
  - Ningún creador puede comprar su propio UGC, se exige **Estudio Nivel 4+** para comprar UGC de terceros y se permite **máximo 1 copia por comprador**.
  - Filtro Regex que bloquea términos engañosos (`limited`, `limited u`, `oficial`, `admin`, `staff`, `kortex`, `dominus`, `valkyrie`) y palabras ofensivas.
  - Los ítems UGC tienen prohibido ingresar al sistema de Trading P2P (exclusivo para `LIMITED` y `LIMITED_U`).
  - Límite de **máximo 2 UGC activos por creador**.
- **Cálculo de Producción por Timestamps (Cero Consumo Ocioso de RAM)**:
  - En lugar de ejecutar intervalos en memoria por cada jugador, el saldo del buzón se calcula matemáticamente en cada lectura mediante `minutos_transcurridos * produccion_por_minuto_total` con tope en `collector_cap`.
- **Controles de Administración en `/config`**:
  - En la categoría **🛡️ Administración del Bot** de `/config`, el propietario puede pausar/activar el módulo `/tycoon` o moderar/eliminar cualquier ítem UGC publicado por usuarios.

---

## 4. Arquitectura Técnica y Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        COMANDO SLASH: /tycoon                           │
│           (Discord Components V2 + Soporte Bilingüe ES / EN)            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────────┐     ┌───────────────────┐     ┌─────────────────────┐
│ Motor Gráfico 2D  │     │  Motor Económico  │     │ Hook Silencioso     │
│ (Canvas Renderer) │     │  & Anti-Abuso     │     │ rewardSilentActivity│
│                   │     │                   │     │ (Cooldown 5 min)    │
│ • Baseplate 3D/2D │     │ • Producción x Ts │     └──────────┬──────────┘
│ • Avatar Roblox   │     │ • Regalías 70/30  │                │
│   o Noob Default  │     │ • Filtro AntiScam │                │
│ • Buzón y Pads    │     │ • Cálculo de RAP  │                │
└─────────┬─────────┘     └─────────┬─────────┘                │
          │                         │                          │
          └─────────────────────────┼──────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             PERSISTENCIA HÍBRIDA SUPABASE + SNAPSHOT LOCAL              │
│  • tycoon_profiles          • tycoon_items_catalog                      │
│  • tycoon_user_inventory    • tycoon_ugc_purchases   • tycoon_trades_p2p│
└─────────────────────────────────────────────────────────────────────────┘
```

### Entidades de Datos y Sincronización
- **`tycoon_profiles`**: Balance de Tix, buzón acumulado, capacidad del buzón, etapa del estudio (`1..6`), contador de Rebirths, lista de pads construidos (`unlocked_pads`), ítem equipado, licencia UGC F2P, poción activa (`potion_type`, `potion_bonus_pct`, `potion_expires_at`), beneficios comunitarios sincronizados y marcas de tiempo (`last_collected_at`, `last_silent_reward_at`).
- **`tycoon_items_catalog`**: Catálogo unificado con semillas iniciales para ítems `NORMAL`, `LIMITED` y `LIMITED_U`, más las creaciones `UGC` de los usuarios.
- **`tycoon_user_inventory`**: Instancias únicas por jugador con `serial_number` (`#01/15`) y bandera `is_tradable` (`true` solo para `LIMITED` y `LIMITED_U`).
- **`tycoon_ugc_purchases`**: Registro inmutable de compras UGC que garantiza 1 sola copia por comprador y audita las regalías pagadas.
- **`tycoon_trades_p2p`**: Ofertas abiertas en el Tablero Público (`receiver_id = 'PUBLIC'`) y ofertas directas entre dos usuarios (`PENDING`, `ACCEPTED`, `DECLINED`, `CANCELLED`).

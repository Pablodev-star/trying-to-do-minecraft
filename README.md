# VoxelCraft

Juego de bloques en 3D para el navegador, inspirado en la jugabilidad de Minecraft y hecho desde cero con JavaScript y Three.js.
Todas las texturas, iconos, modelos y sonidos se generan por código. No se usa ningún asset original.

## Cómo jugar

Hay que servir la carpeta por HTTP, porque los módulos ES no cargan desde `file://`:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Controles

| Tecla | Acción |
|---|---|
| WASD | Moverse |
| Espacio | Saltar / nadar (doble toque en creativo: volar) |
| Shift | Agacharse (no te caes de los bordes) / bajar volando |
| Ctrl o doble W | Correr |
| Clic izquierdo | Romper bloque / atacar |
| Clic derecho | Colocar / usar / comer / tensar arco / interactuar |
| Rueda o 1-9 | Cambiar de objeto en la barra |
| Clic central | Seleccionar el bloque apuntado |
| E | Inventario |
| Q (Ctrl+Q) | Soltar objeto (toda la pila) |
| T o `/` | Chat y comandos |
| F1 / F2 / F3 / F5 | Ocultar HUD / captura de pantalla / depuración / tercera persona |
| Esc | Pausa |

En el inventario: clic izquierdo para coger o dejar, clic derecho para la mitad o de uno en uno, Shift+clic para mover rápido y 1-9 para intercambiar con la barra.

## Contenido

- **Modos**: supervivencia, creativo, extremo (una sola vida) y espectador.
- **Mundo**: terreno infinito por chunks con 12 biomas (llanura, bosque, abedules, taiga, desierto, nieve, montañas, jungla, sabana, pantano, océano y playa). También hay cuevas, lava profunda, menas (carbón, hierro, cobre, oro, redstone, lapislázuli, diamante, esmeralda), árboles de 5 tipos, flores, cactus, caña de azúcar y calabazas. Incluye una fortaleza con el portal del End.
- **Dimensiones**:
  - **Nether**: portal de obsidiana encendido con mechero. Tiene océano de lava, piedra luminosa, cuarzo, arena de almas, escombros ancestrales y puentes de fortaleza.
  - **End**: se llega con 12 ojos de ender en el marco del portal. Tiene isla, pilares de obsidiana, cristales, el dragón (jefe con barra de vida) y portal de salida.
- **Iluminación**: luz del cielo y de bloques que se propaga (antorchas, lava, piedra luminosa...), oclusión ambiental, ciclo día/noche con sol, luna, estrellas y nubes, y niebla.
- **Supervivencia**: vida, hambre y saturación, regeneración, ahogamiento, daño por caída, lava, fuego y cactus. También armadura con durabilidad, experiencia y niveles, muerte con pantalla de reaparición, camas (dormir y punto de reaparición) y tótem.
- **Bloques e ítems**: más de 300. Incluye herramientas de 6 materiales con niveles de minado y velocidades, armaduras de 6 materiales, comida, arco y flechas, cubos (agua, lava, leche), bolas de nieve, huevos, perlas de ender, tijeras, azada y polvo de hueso.
- **Crafteo**: cuadrícula 2x2 y mesa 3x3 con recetas con forma, sin forma y reflejadas. Además, horno con combustible y experiencia, cofres, comercio con aldeanos e inventario creativo con pestañas y búsqueda.
- **Mobs** (19 tipos, con IA):
  - **Pasivos**: cerdo, vaca, oveja (esquilar y lana de colores), gallina (pone huevos), lobo (domesticable) y caballo.
  - **Neutrales**: aldeano y gólem de hierro (se construye).
  - **Hostiles**: zombi, esqueleto, creeper, araña, enderman, bruja, slime, ghast, blaze, necrófago de ceniza y dragón.
  - **Comportamiento**: reproducción con comida, crías, pánico, ardor al sol, explosiones, disparos y teletransporte.
- **Físicas**: agua y lava que fluyen, fuentes infinitas, obsidiana y roca al mezclarse, arena y grava que caen, TNT encadenable, fuego que se propaga, cultivos (trigo, zanahoria, patata) con tierra húmeda, y crecimiento de árboles y césped.
- **Interfaz**: menús, lista de mundos, creación con semilla, opciones (FOV, distancia de renderizado, sensibilidad, volumen, escala de interfaz, dificultad), chat, logros y estadísticas.
- **Guardado**: los mundos se guardan automáticamente en `localStorage`. Solo se guardan los chunks modificados.

## Comandos (requieren trucos activados)

`/gamemode`, `/time set`, `/tp`, `/give`, `/summon`, `/kill`, `/xp`, `/difficulty`, `/spawnpoint`, `/locate`, `/setblock`, `/clear`, `/heal`, `/dimension`, `/gamerule keepInventory true`, `/seed`, `/help`

## Estructura

```
index.html, style.css
lib/three.module.min.js   Three.js r160 (MIT)
src/main.js       bucle de juego, menús, reglas, portales, explosiones, spawneo, guardado
src/world.js      chunks, luz, mallado, fluidos, ticks aleatorios
src/worldgen.js   generación del Overworld, el Nether y el End
src/registry.js   bloques, ítems, recetas, fundición
src/textures.js   texturas procedurales (atlas + sprites)
src/player.js     jugador: movimiento, supervivencia, minado, uso de ítems
src/entities.js   mobs e IA, ítems, proyectiles, TNT, bloques que caen
src/models.js     modelos de cajas de los mobs
src/ui.js, src/icons.js   HUD y GUIs
src/audio.js      efectos de sonido sintetizados
```

Proyecto personal de aprendizaje, sin relación con Mojang ni Microsoft.

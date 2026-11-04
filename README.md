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

### Móvil y tablet

Se detecta automáticamente en pantallas táctiles. Si no aparecen los controles, abre la página con `?touch=1` al final de la URL para forzarlos (`?touch=0` los desactiva). Juega en horizontal; al entrar a un mundo intenta ponerse en pantalla completa.

| Gesto / botón | Acción |
|---|---|
| Joystick (izquierda) | Moverse (empuja al máximo hacia delante para correr) |
| Arrastrar en la pantalla | Mirar |
| Toque corto | Usar / colocar / golpear al mob apuntado |
| Mantener pulsado | Romper bloques (o comer / tensar el arco si lo llevas en la mano) |
| ▲ | Saltar (doble toque en creativo: volar; mantener volando: subir) |
| ● | Agacharse (activa/desactiva; volando: bajar) |
| Barra inferior | Tocar un hueco para seleccionarlo |
| II · T · F5 · Q · E | Pausa · chat · cámara · soltar · inventario |

En el inventario táctil: toque para coger o dejar, mantener para la mitad o de uno en uno, el botón "Mover rápido" hace de Shift y "Cerrar" sale.

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

## Novedades

- **Shaders** (Opciones → Shaders, empiezan apagados): sombras del sol y la luna, hojas y plantas que se mueven con el viento, agua con olas, reflejos y brillo del sol, luz cálida de antorchas, bruma iluminada por el sol, bloom, rayos de sol, tono cinematográfico y viñeta. Son exigentes: en móviles o equipos modestos pueden ir lentos.
- **Gráficos Rápidos/Detallados** (hojas con o sin caras interiores).
- **Clima**: lluvia, nieve en biomas fríos y tormentas con relámpagos; la lluvia no atraviesa techos y apaga el ardor de los zombis. Comando `/weather clear|rain|thunder`.
- **Aldeas** con casas, pozo, caminos, granjas, faroles, aldeanos y gólem de hierro (`/locate village`).
- **Mazmorras** subterráneas con generador de monstruos y cofres con botín.
- **Orbes de experiencia** al matar mobs o picar menas.
- **Bloques nuevos**: losas (dos losas forman un bloque), escaleras (también invertidas), vallas que se conectan, paneles de cristal, barrotes de hierro, farol, camino de tierra, antorchas en la pared, puertas de dos bloques que se abren y camas de dos bloques.
- Texturas animadas de agua, lava y portal; cielo con degradado.

## Contenido añadido en la gran ampliación

- **Encantamientos**: mesa de encantamientos (con estanterías), 26 encantamientos con efecto real, libros encantados, yunque (reparar, combinar, renombrar), afiladora y mesa de herrería (mejora a netherita).
- **Pociones y efectos**: soporte para pociones con todo el árbol de recetas (rara, prolongada, potenciada, corrupta, arrojadiza), caldero, frascos de experiencia y más de 20 efectos de estado visibles en el HUD.
- **Aldeanos**: 13 profesiones con su bloque de trabajo, 5 niveles con comercios nuevos, existencias que se reponen, precios con demanda y reputación (descuentos o precios altos), zombis aldeanos que se pueden curar.
- **Redstone**: polvo (0-15), antorchas inversoras, palancas, botones, placas de presión, repetidores, comparadores, lámparas, pistones normales y pegajosos, observadores, dispensadores, soltadores, tolvas, bloques musicales, sensor de luz, diana, puertas de hierro y dinamita activable.
- **Vehículos y más**: barcas, vagonetas con raíles (propulsores, detectores, activadores), montar caballos y cerdos, élitros con cohetes y caña de pescar con botín.
- **Mundo**: bosque oscuro, cerezos, campos de hongos, badlands, manglar, picos de hielo, océanos cálido y helado; en el Nether, bosques carmesí y distorsionado, valle de almas y deltas de basalto; pizarra profunda y geodas de amatista.
- **Estructuras**: templos del desierto y la jungla, iglús, cabañas de bruja, barcos hundidos, portales en ruinas, torres de bandidos, minas abandonadas, bastiones, fortalezas ampliadas y ciudades del End con élitros.
- **Mobs**: zorros, conejos, gatos, loros, pandas, abejas, cabras, ranas, tortugas, osos polares, llamas, calamares, peces y delfines; variantes de zombi y esqueleto; y criaturas de diseño propio: espectro nocturno, bandidos, anguila abisal, centinela de púrpur, trasgo de ceniza (trueque de oro), jabalí infernal, zancudo de lava, esqueleto calcinado y el jefe **Coloso de ceniza** (arena de almas en T + 3 cráneos calcinados).

## Comandos (requieren trucos activados)

`/gamemode`, `/time set`, `/weather`, `/tp`, `/give`, `/summon`, `/kill`, `/xp`, `/difficulty`, `/spawnpoint`, `/locate [village]`, `/setblock`, `/clear`, `/heal`, `/dimension`, `/gamerule keepInventory true`, `/seed`, `/help`

## Estructura

```
index.html, style.css
lib/three.module.min.js   Three.js r160 (MIT)
src/main.js       bucle de juego, menús, reglas, portales, explosiones, spawneo, guardado
src/world.js      chunks, luz, mallado, fluidos, ticks aleatorios
src/shaders.js    shaders del mundo, sombras y post-procesado
src/shapes.js     formas de losas, escaleras, vallas, puertas...
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

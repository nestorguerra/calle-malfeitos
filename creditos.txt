# Créditos

## El plano del pueblo

- **Las casas y las manzanas:** cartografía catastral de la Dirección General del Catastro, de sus servicios INSPIRE
  (http://ovc.catastro.meh.es/INSPIRE/), con licencia Creative Commons Attribution 4.0
  (https://creativecommons.org/licenses/by/4.0/). Se ha cambiado: pasada a metros, levantada en altura por plantas y
  retocada casa a casa. La usa `tools/blender/catastro.py`; se guarda en `.cache/catastro`.
- **Los ejes y los nombres de las calles:** © colaboradores de OpenStreetMap, con licencia Open Database License
  (https://www.openstreetmap.org/copyright). Los usa `tools/blender/catastro.py`; se guardan en `.cache/osm`.
- **El relieve** (solo en la escena del pueblo entero): Modelo Digital del Terreno MDT05, © Instituto Geográfico
  Nacional (IGN/CNIG), con licencia Creative Commons Attribution 4.0, de su servicio WCS
  (https://servicios.idee.es/wcs-inspire/mdt). Se ha cambiado: suavizado y pasado a una rejilla de 6 m. Lo usa
  `tools/relieve.py`; se guarda en `.cache/relieve`.

Ojo para el producto: las dos licencias piden que el crédito se vea. Ahora solo está aquí; dentro del juego no se
enseña en ningún sitio.

## Coches aparcados (Calle Malfeitos)

Modelos de Sketchfab con licencia Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
Se han cambiado: escala, orientación, pintura, matrículas (españolas inventadas), logotipos quitados donde iban
aparte, malla aligerada. Los usa `tools/blender/coches_reales.py`; se bajan a `.cache/coches_sketchfab` (hace falta
una cuenta de Sketchfab).

- «2016 Volkswagen Polo» de BHP3D — https://sketchfab.com/3d-models/bab77902c638427bb85e68b6762a481f
- «2000 Skoda Octavia» de tonielpro520 — https://sketchfab.com/3d-models/892e152237fa4e8bbeb6afb20169f0c2
- «2005 Skoda Octavia» de tonielpro520 — https://sketchfab.com/3d-models/c31169ccfd354b6c9b6f09964c113ae3
- «2017 Skoda Superb» de BHP3D — https://sketchfab.com/3d-models/2da5059c3068448b9541eafb930a45a0

Ojo para el producto: el Polo y el Superb dicen venir de un mod de GTA San Andreas, y las formas y marcas de
Volkswagen y Škoda tienen sus propios derechos. Valen para el prototipo; para lanzar, cambiarlos por modelos con
licencia comercial clara o por coches genéricos.

## Objetos de la calle (Calle Malfeitos)

Modelos de Sketchfab con licencia Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
Se han cambiado: escala, orientación, malla aligerada y texturas a 512 px. Los usa `tools/blender/objetos.py`; se
bajan a `.cache/objetos_sketchfab` (hace falta una cuenta de Sketchfab).

- «Geranium (game asset)» de wilsonghm99 — https://sketchfab.com/3d-models/8dd8f987f9d64dc3a6f17d9e880d0563
- «Terracotta pot» de sousinho — https://sketchfab.com/3d-models/2bcf7aab467e490e9095257a2107a751
- «Street wall lamp» de TomorrowWe — https://sketchfab.com/3d-models/feba064834de4bb3b8d99aa19cefe9c9
- «Garbage bin» de dk_artist (Daniil Kulinich) — https://sketchfab.com/3d-models/9044ac8d545747e3959278fbe36fce8b
- «Monobloc plastic garden chair» de kuuttisiitonen — https://sketchfab.com/3d-models/68089dce5fa1461981d690f1cfd657fa
- «Vintage bicycle» de vlad.neko (VladNeko) — https://sketchfab.com/3d-models/1795f6e907634afda88fdaf45f67b279
- «CONTENEDOR» de xxxaaannn (escaneado) — https://sketchfab.com/3d-models/282d5487289243c590c804c2d5caa258
- «Antenna roof TV» de ahmagh2e (Mehdi Shahsavan) — https://sketchfab.com/3d-models/2bcae1a760d641339eb1ad63e1f7cf89

## Personaje

- Avatar «Female_Adult_08» de Microsoft Rocketbox (MIT) — https://github.com/microsoft/Microsoft-Rocketbox
- Animaciones: Universal Animation Library de Quaternius (CC0)

## Personaje del editor («Crea tu personaje» y la chica de serie)

- Cuerpo y cara: Anny, de NAVER LABS (Apache 2.0, con datos de MakeHuman, CC0) — https://github.com/naver/anny
- Ojos, cejas, pestañas, ropa, calzado y peinados: MakeHuman / MPFB 2 (recursos CC0) — http://www.makehumancommunity.org/
- Animaciones: Universal Animation Library de Quaternius (CC0)

## Texturas y cielo

- Poly Haven (CC0) — https://polyhaven.com

## Sonidos (Calle Malfeitos)

Grabaciones CC0 (dominio público): no piden atribución, pero se apuntan aquí. Se bajan a `.cache/sonidos/bruto` y
las monta `tools/sonidos.py` (cortadas, igualadas, en bucle y en AAC). De Freesound, la versión de escucha en MP3
(la original pide cuenta); la licencia es la misma.

- Fondo de tarde con vencejos: «Ambience City Summer Evening Swift Calls» de Kinoton — https://freesound.org/people/Kinoton/sounds/611708/
- Vencejos: «Isolated Swift Calls» de Kinoton — https://freesound.org/people/Kinoton/sounds/478455/
- Gorriones: «Sparrows in Liège» de kooii — https://freesound.org/people/kooii/sounds/737994/
- Radio: «De Oñate a La Granja» de Benito Pérez Galdós, cap. 1, leído para LibriVox — https://archive.org/details/onate_granja_librivox
- Ladrido: «Distant Dog Bark» de qubodup — https://freesound.org/people/qubodup/sounds/813116/
- Campanada: «Bell 1 O'clock» de Joseph Sardin y Axeline T. (BigSoundBank) — https://bigsoundbank.com/bell-1-o-clock-s3446.html
- Pasos en piedra: «Fantozzi's Footsteps» de Fantozzi — https://opengameart.org/content/fantozzis-footsteps-grasssand-stone
- Pasos en asfalto: «Asphalt sneakers steps» de Vladislav_Sazonov — https://freesound.org/people/Vladislav_Sazonov/sounds/851919/
- Pasos en hormigón: «Footsteps, Shoe on Concrete» de Joseph Sardin (BigSoundBank) — https://bigsoundbank.com/footsteps-shoe-on-concrete-s0514.html
- Paloma que arranca: «Flight of a Pigeon» de Joseph Sardin (BigSoundBank) — https://bigsoundbank.com/flight-of-a-pigeon-s0840.html
- Palomas: «Pigeon walking and cooing» de 5ro4 — https://freesound.org/people/5ro4/sounds/701282/
- Gato: «Meow Cat #2» de Joseph Sardin (BigSoundBank) — https://bigsoundbank.com/meow-cat-2-s1890.html
- Motor: «Peugeot 3008 diesel» de Mihacappy — https://freesound.org/people/Mihacappy/sounds/815853/
- Toldos al viento: «Flag in the Wind #2» de Joseph Sardin (BigSoundBank) — https://bigsoundbank.com/flag-in-the-wind-2-s1633.html
- Bajados y sin usar por ahora: «50 birds are sleeping» y «Village, City Center #2» (Sardin), «Dog distant barking» de
  alberto59, «car6» de audiosophie y «Quiet and calm street» de xkeril (todos CC0).

## Vecinos y animales (Calle Malfeitos)

- Vecinos: avatares «Male_Adult_03» y «Gardener_Male_01» de Microsoft Rocketbox (MIT) — https://github.com/microsoft/Microsoft-Rocketbox;
  las vecinas, con MakeHuman / MPFB 2 (recursos CC0). Animaciones de sentado de la Universal Animation Library de Quaternius (CC0).
- Modelos de Sketchfab con licencia Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/),
  bajados a `.cache/animales_sketchfab` (hace falta una cuenta de Sketchfab):
  - «Somali Cat Animated ver 1.2» de DreamNoms — https://sketchfab.com/3d-models/e185c3fd92b64c32b4515a32b29252fc
  - «Cat» de mustafasahinfb — https://sketchfab.com/3d-models/69db9de4d5c446a895cec3c2a048f7a8
  - «Pigeon» de kenchoo — https://sketchfab.com/3d-models/ddd5ef4a94eb4159937a9de25c45697c, basado en «Pigeon #1» de nmcbc (CC BY 4.0)

## Texturas comprimidas (KTX2)

- Basis Universal de Binomial LLC (licencia Apache 2.0) — https://github.com/BinomialLLC/basis_universal. El codificador
  (`basisu`) se compila en local con `tools/basisu.sh` y comprime las texturas de los .glb (`tools/ktx2.py`); el
  transcodificador del navegador (`assets/wasm/basis/basis_transcoder.js` y `.wasm`) va con el juego, con su licencia
  en `assets/wasm/basis/LICENSE`.

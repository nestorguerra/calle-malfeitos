// 388 Foto · fase 0: una escena fotografiada (Gaussian splats) en el navegador, con un personaje andando por ella,
// colisiones y sombra de contacto, y una API de medida (window.foto) para el Chrome sin ventana de tools/medir.py.
// Motor: PlayCanvas 2.23 (MIT), desde el CDN; nada de esto viene del juego de Guareña.
import {
  ANIM_EQUAL_TO, ANIM_GREATER_THAN, ANIM_LESS_THAN, ANIM_LESS_THAN_EQUAL_TO, ANIM_PARAMETER_INTEGER, ANIM_PARAMETER_TRIGGER,
  AnimClipHandler, AnimComponentSystem, AnimStateGraphHandler, AppBase, AppOptions, Asset,
  CameraComponentSystem, CollisionComponentSystem, Color, ContainerHandler, Entity, FILLMODE_FILL_WINDOW,
  GSPLATDATA_COMPACT, GSplatComponentSystem, GSplatHandler, GamePads, Keyboard, LAYERID_SKYBOX, LightComponentSystem,
  ADDRESS_CLAMP_TO_EDGE, BLEND_ADDITIVEALPHA, BLEND_NONE, BLEND_NORMAL, CULLFACE_BACK, CULLFACE_NONE, EnvLighting, FOG_EXP, MeshInstance, Mouse, Quat, RESOLUTION_AUTO, RenderComponentSystem, RigidBodyComponentSystem, SHADOW_PCF1_32F, SHADOW_PCF3_32F,
  SEMANTIC_COLOR, SEMANTIC_NORMAL, SEMANTIC_TANGENT, ScriptComponentSystem, ScriptHandler, StandardMaterial, TYPE_FLOAT32, TYPE_INT8, TYPE_UINT16, TYPE_UINT8, Texture, VertexBuffer, VertexFormat, createMesh,
  TEXTURETYPE_RGBE, TEXTURETYPE_RGBP, TONEMAP_LINEAR, TextureHandler, TouchDevice, Vec3, WasmModule, createGraphicsDevice,
} from 'playcanvas';
import { CameraFrame } from 'playcanvas/scripts/esm/camera-frame.mjs';
import { activarRelieve, cargarRelieve } from './relieve.js';
import { ponerObras } from './obras.js';
import { ShadowCatcher } from 'playcanvas/scripts/esm/shadow-catcher.mjs';
import { SpzParser } from 'playcanvas/scripts/esm/parsers/spz-parser.mjs';
import { ThirdPersonController } from 'playcanvas/scripts/esm/third-person-controller.mjs';
import { archivosDe, estadoGuardado, leerArchivo, montarPersonaje } from './personaje.js';
import { montarSonido } from './sonido.js';
import { montarCanto } from './canto.js';
import { montarReloj } from './reloj.js';
import { montarTiempo } from './tiempo.js';
import { montarSombras } from './sombras.js';
import { montarGente } from './gente.js';
import { montarAcciones } from './acciones.js';
import { montarMulti, salidaMulti } from './multi.js';
import { bancosSolidos, montarAnimales, montarCoches, montarDinamicas, montarVecinos, montarVida, viento } from './vida.js';
import { aparcar, pintarCoches } from './aparcados.js';
import { montarConducir, separarCajas } from './conducir.js';
import { montarTeclado } from './teclado.js';

const q = new URLSearchParams(location.search);
// (los errores, también en pantalla: en el enlace de claude.ai el juego va en un marco y su consola no se ve desde fuera)
{
  const caja = document.createElement('div'); caja.id = 'errores';
  caja.style.cssText = 'position:fixed;top:44px;left:10px;right:10px;max-height:40%;overflow:auto;padding:6px 8px;background:rgba(120,0,0,.75);color:#fff;font:11px ui-monospace,Menlo,monospace;white-space:pre-wrap;z-index:9;display:none;pointer-events:none';
  document.body.appendChild(caja);
  const poner = (t) => { if (caja.childElementCount > 8) return; const d = document.createElement('div'); d.textContent = String(t).slice(0, 300); caja.appendChild(d); caja.style.display = 'block'; };
  addEventListener('error', (e) => poner('error: ' + (e.message || e.target?.src || e.type)), true);
  // (donde el navegador no deja capturar el ratón, como el visor integrado de la app, no es un error del juego: se gira arrastrando)
  addEventListener('unhandledrejection', (e) => { if (/pointer ?lock/i.test(e.reason?.message || '')) { e.preventDefault(); return; } poner('rechazo: ' + (e.reason?.stack || e.reason)); });
  const ce = console.error.bind(console), cw = console.warn.bind(console);
  console.error = (...a) => { poner(a.map((x) => x?.stack || x).join(' ')); ce(...a); };
  console.warn = (...a) => { if (/basis|ktx|texture|textura|worker|wasm/i.test(a.join(' '))) poner('aviso: ' + a.join(' ')); cw(...a); };
}
// (donde la dirección no puede llevar ?escena=, como el enlace de claude.ai, la página dice cuál cargar)
if (!q.get('escena') && window.ESCENA_POR_DEFECTO) q.set('escena', window.ESCENA_POR_DEFECTO);
const t0 = performance.now();
const tiempos = (window.tiempos = { t0: Math.round(t0) }); const marca = (k) => { tiempos[k] = Math.round(performance.now() - t0); if (k === 'listo') alListo(); }; // (las fases de la carga, en ms desde t0, que va en el reloj de la página: tools/precarga.py)
// (cargar antes, 13-11-2026: lo que no hace falta para el primer fotograma —los coches de cerca, el coche que pasa y el
// sonido— se pide cuando el juego ya está listo; antes se pedía a la vez que las zonas de la salida y les quitaba red)
let alListo; const trasListo = new Promise((r) => { alListo = r; });

// ---- Las escenas de prueba (públicas; ninguna es Guareña todavía)
const ESCENAS = {
  // Sunnyvale Heritage Park Museum, de zeitgeistarchivescans, CC BY 4.0 (https://superspl.at/scene/d5d397aa),
  // con su malla de colisión. Está capturada boca abajo: se gira 180° en z.
  sunnyvale: {
    splat: 'https://code.playcanvas.com/examples_data/example_sunnyvale/sunnyvale.sog',
    colision: 'https://code.playcanvas.com/examples_data/example_sunnyvale/sunnyvale.glb',
    giro: [0, 0, 180], inicio: [0, 1.2, 0],
    sol: '60,-20', // (comprobado contra la sombra del tronco de la palmera: docs/fase0/sol.jpg)
  },
};
// ?foto=<carpeta con escena.json>: una calle levantada por geometría desde una sola foto (tools/calle_de_una_foto.py),
// planos con la foto en perspectiva en vez de un splat; prueba privada, sin captura
// ?escena=malfeitos es la demo: la calle Malfeitos entera con las 48 imágenes GTA (tools/calle_de_fotos.py, con fundido)
const foto = q.get('foto') || (q.get('escena') === 'malfeitos' ? './escenas/malfeitos_gta' : null);
// ?escena=malfeitos_gris: la calle levantada en Blender con el Catastro (tools/blender/), geometría de verdad que se ve,
// da sombra y choca; ?modelo=<.glb>&inicio=x,y,z para cualquier otra
const MODELOS = {
  // el origen es el cruce con la calle Nueva; Malfeitos baja hacia +z (el sur) y el 12 está a unos 22 m
  // con el cielo de un HDRI (tools/blender/cielo.py lleva su sol a 250°, donde está el del juego: una tarde a 50° de
  // altura… ahora casi mediodía, 66°, que mete el sol en el asfalto como en el vídeo; el +y de la entidad apunta al sol) y el acabado de foto (?acabado=gta vuelve al de GTA)
  // (la luz D de la prueba del 9-11-2026, elegida por el usuario: ambiente 2,1, rebote 2,7, exposición 1,4 y sombra de
  // contacto 0,3; las fachadas a la sombra de las calles nuevas se acercan a sus capturas de Google, Malfeitos se aclara.
  // Antes, amb 1,15, exposición 1,0, rebote 1,3 y ao 0,6: ?amb=1.15&exposicion=1&rebote=1.3&ao=0.6 la devuelve)
  // (y con ?expozona=1, la exposición por zonas: dentro de Malfeitos, la de la luz C, exposición 1,0 y sombra de contacto
  // 0,6, que casa con sus capturas; a más de 30 m de su eje, la D; entre medias, poco a poco. El eje, el de datos.json)
  malfeitos_gris: { modelo: './escenas/malfeitos_gris/malfeitos_gris.glb', inicio: [1, 1.5, 22], sol: '24,-70', luz: 6.2, amb: 2.1, exposicion: 1.4, rebote: 2.7, ao: 0.3,
    zona_luz: { eje: [[0, 0], [4, 87.8], [5.5, 140.7], [42.3, 220.5]], dentro: 10, fuera: 30, exposicion: 1.0, ao: 0.6 },
    // (el color, medido contra el vídeo con tools/color.py, con la oclusión horneada y la luz de ambiente de un cielo casi gris y cálido: cálido +13 %, saturación −11 %, contraste +1 %; luego, a petición, «los colores son demasiado intensos»: saturación de 1,44 a 1,0 y viveza de 0,45 a 0,1)
    tinte: '1,1,1.02', saturacion: 1.0, vibrance: 0.1, contraste: 1.0, sombras: 0.08, solc: '1,0.9,0.78',
    cielo: './escenas/malfeitos_gris/cielo.png', luzcielo: './escenas/malfeitos_gris/cielo_luz.png', foto: true, colision: './escenas/malfeitos_gris/malfeitos_gris_colision.glb', chica: './escenas/chica/',
    objetos: './escenas/malfeitos_gris/objetos.glb', taa: '1',
    vida: './escenas/malfeitos_gris/vida.json', sonidos: './escenas/malfeitos_gris/', vecinos: './escenas/malfeitos_gris/vecinos/', // (fase 5: la ropa, los toldos y el sonido)
    partes: ['./escenas/malfeitos_gris/materiales.glb', './escenas/malfeitos_gris/lejos.glb', './escenas/malfeitos_gris/tejados.glb'], zonas: './escenas/malfeitos_gris/zonas.json' }, // (las paredes y fachadas, por zonas: docs/zonas.md; materiales.glb no se dibuja, lleva los materiales de las zonas) // (los objetos de la calle, de Sketchfab: aparte, el .glb de la calle ya está en el límite del enlace)
};
// el pueblo entero (docs/mapa_contraste.md): la misma escena, con todas las manzanas del casco según el Catastro y la
// proyección exacta; la levanta tools/blender/guarena.sh en escenas/guarena. El cielo y los sonidos, los de siempre
MODELOS.guarena = { ...MODELOS.malfeitos_gris, modelo: './escenas/guarena/guarena.glb', colision: './escenas/guarena/guarena_colision.glb',
  objetos: './escenas/guarena/objetos.glb', vida: './escenas/guarena/vida.json', zonas: './escenas/guarena/zonas.json',
  aparcados: './escenas/guarena/iglesia_coches.json', // (los coches aparcados en la plaza de la iglesia: src/aparcados.js)
  iglesiaBancos: './escenas/guarena/iglesia_bancos.json', // (sus bancos de forja, para sentarse: abajo)
  dentro: { glb: './escenas/guarena/iglesia_dentro.glb', centro: [-271.4, 165.2], radio: 120, suelta: 260, nombre: 'la iglesia de Santa María', // (el interior de la iglesia, aparte: se carga al acercarse)
    canto: './escenas/guarena/canto_iglesia.m4a', planta: './escenas/guarena/iglesia_planta.json' }, // (y el canto gregoriano, que suena solo dentro: src/canto.js)
  partes: ['./escenas/guarena/materiales.glb', './escenas/guarena/lejos.glb', './escenas/guarena/iglesia.glb'], caras: [900000, 2600000], // (los tejados y el detalle de la calle van en las zonas, que se cargan hasta un tope de caras)
  colisiones: ['./escenas/guarena/iglesia_colision.glb'], // (la iglesia de Santa María, entera y siempre a la vista, con su colisión: docs/iglesia.md)
  relieve: './escenas/guarena/relieve.json', // (las cuestas de verdad, al dibujar: src/relieve.js)
  gente: './escenas/guarena/gente/', iglesiaSitios: './escenas/guarena/iglesia_sitios.json', // (los vecinos por la calle según la hora: src/gente.js)
  reloj: true, // (la hora del pueblo, que corre, y la luz según la hora: src/reloj.js; ?reloj=0, la luz fija de siempre)
  // (qué pueblo es: su sala del multijugador —una por pueblo, por su código del INE—, su nombre y sus vecinos; src/multi.js)
  pueblo: { ine: '06060', nombre: 'Guareña', habitantes: 6665 } };
const modelo = MODELOS[q.get('escena')] ? { ...MODELOS[q.get('escena')], ...(q.get('modelo') ? { modelo: q.get('modelo') } : {}) }
  : (q.get('modelo') ? { modelo: q.get('modelo') } : null); // (?modelo= también cambia el .glb de una escena: para probar variantes)
const nombre = foto ? 'foto' : (q.get('escena') || (q.get('url') ? 'url' : modelo ? 'modelo' : 'sunnyvale'));
const escena = foto ? { splat: null, colision: null, giro: [0, 0, 0], inicio: null } : modelo ? {
  splat: null, colision: null, giro: [0, 0, 0], ...modelo,
  inicio: (q.get('inicio') || (modelo.inicio || [0, 1.5, 0]).join(',')).split(',').map(Number),
} : ESCENAS[nombre] || {
  // cualquier otra: ?url=<.sog|.ply|.spz|lod-meta.json>&suelo=<y del suelo plano>&giro=x,y,z&inicio=x,y,z
  //   &colision=<.glb> (la malla de colisión, p. ej. la de Marble) &escala=<factor> (si el mundo no está en metros)
  splat: q.get('url'), colision: q.get('colision'), suelo: parseFloat(q.get('suelo') ?? '0'),
  giro: (q.get('giro') || '0,0,0').split(',').map(Number), inicio: (q.get('inicio') || '0,1.2,0').split(',').map(Number),
  escala: parseFloat(q.get('escala') || '1'),
};
if (!escena.splat && !foto && !modelo) throw new Error('escena desconocida: ' + nombre);
// (el multijugador, fase 3: salir donde se dejó la última vez o, con el enlace de alguien, a su lado —src/multi.js—; antes
// de cargar nada, para que las zonas que se bajan sean las de allí)
const inicioDeSerie = escena.inicio?.slice();
const salida = escena.pueblo && !foto && !q.get('inicio') ? await salidaMulti({ q, escena, desde388: q.get('desde') === '388' }).catch(() => null) : null;
if (salida) escena.inicio = salida.inicio;

const acabadoFoto = !!escena.foto && q.get('acabado') !== 'gta';
// ?personaje=bitmoji vuelve al muñeco de dibujos en las escenas que traen la chica; ?personaje=nino, el niño de 10
// años en pruebas (tools/blender/nino.py: el cuerpo de Anny, con el mismo esqueleto y las mismas animaciones)
const nino = q.get('personaje') === 'nino';
// el del editor de personajes («Crea tu personaje», src/entrada.js), el que se guardó en este navegador, horneado al
// cargar (src/personaje.js) y con las mismas animaciones, hechas para su esqueleto: sale si se salió del editor con él
// («Guardar y salir a la calle» apunta personaje_en_calle) o con ?personaje=editor; con ?personaje=chica, la chica
const apuntado = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
// (con ?personaje=video, el personaje de partida hecho contra el vídeo: docs/personaje_video.md)
// (el propio: el que se guardó en el editor y con el que se salió a la calle)
const propio = !q.get('personaje') && apuntado('personaje_en_calle') === '1' && !!apuntado('personaje');
// De serie sale la chica de antes, la de Rocketbox (el usuario, el 10-11-2026, con la del vídeo de serie desde esa
// mañana: «vuelve a personaje anterior de la chica»). La del vídeo queda en el editor («La del vídeo» y «Guardar y salir
// a la calle») y con ?personaje=video
const delVideo = q.get('personaje') === 'video';
const mio = !!escena.chica && (delVideo || q.get('personaje') === 'editor' || propio);
const estadoMio = !mio ? null : delVideo ? await (await fetch('./assets/personaje/del_video.json')).json() : estadoGuardado(q);
const chica = q.get('personaje') !== 'bitmoji' && escena.chica ? (mio ? './escenas/personaje/' : nino ? './escenas/nino/' : escena.chica) : null;
const cuerpo = nino ? 'nino' : 'chica'; // (el .glb del cuerpo en esa carpeta)
// (donde no se sirven .glb, como en claude.ai, se publican con un sufijo que sí: el lector de glTF no mira la extensión)
const glb = (u) => u + (window.SUFIJO_GLB || '');

// ---- La descarga de lo grande (el modelo, su colisión, la chica, el cielo), con su progreso: la empieza el propio
// juego antes de preparar el motor, enseña los megas que van y PlayCanvas lee luego cada archivo de memoria
const aviso = document.getElementById('carga-estado') || document.getElementById('carga'); // (la línea de estado bajo el título de la carga)
const lugar = nombre === 'guarena' ? 'el pueblo' : 'la calle';
const grandes = [
  ...(modelo ? [glb(escena.modelo)] : []),
  ...(modelo && escena.partes ? escena.partes.map(glb) : []),
  ...(escena.objetos && q.get('objetos') !== '0' ? [glb(escena.objetos)] : []),
  ...(escena.colision && !escena.colision.startsWith('http') ? [glb(escena.colision)] : []),
  ...(modelo && escena.colisiones ? escena.colisiones.map(glb) : []),
  ...(chica ? [...(mio ? [] : [cuerpo]), 'quieto', 'andar', 'correr', 'saltar'].map((n) => glb(chica + n + '.glb')) : []),
  ...(mio ? archivosDe(estadoMio).map(glb) : []), // (el cuerpo y las prendas del personaje del editor)
  ...(escena.cielo ? [escena.cielo] : []),
  ...(escena.luzcielo ? [escena.luzcielo] : []),
];
const bajados = {}; // (cada archivo grande → la promesa de su URL en memoria: se monta en cuanto llega, sin esperar a los demás)
const enMemoria = (async () => {
  const total = {}, hecho = {}; let acabados = 0;
  const mb = (o) => Object.values(o).reduce((a, b) => a + b, 0) / 1e6;
  // (con los archivos que van: el servidor de la página publicada no da el tamaño de algunos, y el total se quedaba en
  // lo ya bajado; parecía colgado en «50,4 de 50,4 MB» mientras seguían bajando)
  const pintar = () => {
    if (!aviso) return;
    const sinTamano = grandes.some((u) => hecho[u] !== undefined && !total[u]);
    aviso.textContent = `Cargando ${lugar} · ${mb(hecho).toFixed(1).replace('.', ',')}${sinTamano ? '' : ` de ${Math.max(mb(total), mb(hecho)).toFixed(1).replace('.', ',')}`} MB`; // (src/desde388.js lee estos megas)
  };
  // (en el enlace, los .glb grandes pueden ir en trozos de medio mega, <archivo>.p<k>.wasm, cuando la subida de archivos
  // grandes se corta: la página lleva cuántos en window.TROZOS y aquí se juntan; tools/despliegue/trocear.py)
  const leer = async (u, cuenta) => {
    await window.precargaLista; await window.precargando?.get(new URL(u, location.href).href); // (si la precarga de 388 Pueblos aún lo baja, se espera: src/precarga.js)
    const r = await fetch(u);
    if (!r.ok || !r.body) throw new Error(`${u}: ${r.status}`);
    total[cuenta] = (total[cuenta] || 0) + (+r.headers.get('content-length') || 0); hecho[cuenta] = hecho[cuenta] || 0;
    const lector = r.body.getReader(), trozos = [];
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(value); hecho[cuenta] += value.length; pintar();
    }
    return trozos;
  };
  for (const u of grandes) bajados[u] = (async () => {
    try {
      const base = u.replace(/\.wasm$/, ''), tr = window.TROZOS?.[base]; // ([cuántos, huella] o, en las primeras, cuántos)
      const [n, h] = Array.isArray(tr) ? tr : [tr, null];
      const partes = n ? await Promise.all(Array.from({ length: n }, (_, k) => leer(`${base}${h ? '.' + h : ''}.p${k}.wasm`, u))) : [await leer(u, u)];
      acabados++; pintar();
      return URL.createObjectURL(new Blob(partes.flat()));
    } catch { return u; } // (si algo falla, que lo intente PlayCanvas por su cuenta)
  })();
  const blobs = await Promise.all(grandes.map((u) => bajados[u]));
  if (aviso) aviso.textContent = `Preparando ${lugar}…`; // (y esta palabra, «Preparando»)
  return Object.fromEntries(grandes.map((u, i) => [u, blobs[i]]));
})();
// (vida.json, desde el principio: lo usan los coches del pueblo al montarse —su pintura y su matrícula— y la vida de la calle)
const vidaJson = escena.vida ? fetch(escena.vida).then((r) => r.json()).catch(() => null) : null;

// ---- Motor
const conWasm = (glue, wasm) => ({ glueUrl: glue, wasmUrl: wasm }); // (el Draco de PlayCanvas solo va con WebAssembly)
WasmModule.setConfig('Ammo', { ...conWasm('./assets/wasm/ammo/ammo.wasm.js', './assets/wasm/ammo/ammo.wasm.wasm'), fallbackUrl: './assets/wasm/ammo/ammo.js' });
// (el motor descomprime el Draco de las mallas y pasa las texturas KTX2 con un solo hilo si no se le dice otra cosa.
// Probado el 13-11-2026 con ?hilos=: con cuatro, el pueblo está listo en 1,8 s en vez de 2,7 (con dos, 2,0), pero las
// mallas de cada zona llegan de golpe y, al montar las de más allá ya jugando, salían dos fotogramas de 150 a 250 ms en
// la mitad de las pruebas (con dos, en una de cada siete). Se queda en uno)
const hilos = Math.max(1, Math.min(parseInt(q.get('hilos') || '1', 10) || 1, (navigator.hardwareConcurrency || 2) - 1));
WasmModule.setConfig('DracoDecoderModule', { ...conWasm('./assets/wasm/draco/draco.wasm.js', './assets/wasm/draco/draco.wasm.wasm'), fallbackUrl: './assets/wasm/draco/draco.js', numWorkers: hilos });
// (las texturas KTX2 de los .glb, tools/ktx2.py: el transcodificador de Basis Universal, Apache 2.0, en assets/wasm/basis)
WasmModule.setConfig('BASIS', { glueUrl: './assets/wasm/basis/basis_transcoder.js', wasmUrl: './assets/wasm/basis/basis_transcoder.wasm', numWorkers: hilos });
WasmModule.setConfig('ZstdDecoderModule', { glueUrl: './assets/wasm/zstd/zstd.wasm.js', wasmUrl: './assets/wasm/zstd/zstd.wasm.wasm' }); // (para los .spz de Marble y Scaniverse)
await Promise.all([
  new Promise((r) => WasmModule.getInstance('Ammo', () => r())),
  new Promise((r) => WasmModule.getInstance('DracoDecoderModule', () => r())),
]);
marca('wasm');

const canvas = document.getElementById('lienzo');
const tipos = q.get('gpu') === 'webgl2' ? ['webgl2'] : ['webgpu', 'webgl2'];
const device = await createGraphicsDevice(canvas, { deviceTypes: tipos, antialias: false }); // (los splats no ganan con MSAA)
// (los errores de la GPU, en pantalla y en window.erroresGpu: con WebGPU, un dibujo que no casa con su material deja
// todo el fotograma en negro, sin error en la consola de JavaScript)
window.erroresGpu = [];
if (device.wgpu) {
  device.wgpu.addEventListener('uncapturederror', (e) => { if (window.erroresGpu.length < 50) { window.erroresGpu.push(e.error.message); console.error('GPU: ' + e.error.message); } });
  device.wgpu.lost.then((i) => { window.erroresGpu.push('perdida: ' + i.message); console.error('GPU perdida: ' + i.reason + ' ' + i.message); });
}
// (a 2× un Mac Retina dibuja 4K y baja de 50 fps: de serie, 1,5×)
device.maxPixelRatio = Math.min(window.devicePixelRatio, parseFloat(q.get('dpr') || '1.5'));
// un móvil (pantalla táctil y pequeña): la memoria es lo que le falta (el navegador cierra la página si pasa de ~1 GB
// entre la GPU y JavaScript), así que empieza tres escalones abajo de la calidad adaptable (sin multimuestreo, la sombra
// a 2048 y la oclusión a menos resolución: ~110 MB menos de memoria gráfica) y sube si le sobra. ?movil=0 o =1 lo fuerza
const movil = q.get('movil') ? q.get('movil') === '1' : (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900);
const AO_ESCALA = parseFloat(q.get('aoescala') || (movil ? '0.5' : '1')); // (la resolución de la oclusión ambiental: ver el postproceso)
if (device.wgpu) device.wgpu.lost.then(() => setTimeout(() => location.reload(), 500)); // (ver «la memoria de la geometría»)
device.on?.('devicelost', () => setTimeout(() => location.reload(), 500));

const op = new AppOptions();
op.graphicsDevice = device;
op.mouse = new Mouse(document.body); op.touch = new TouchDevice(document.body); op.gamepads = new GamePads(); op.keyboard = new Keyboard(window);
op.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem, ScriptComponentSystem, AnimComponentSystem, CollisionComponentSystem, RigidBodyComponentSystem, GSplatComponentSystem];
op.resourceHandlers = [TextureHandler, ContainerHandler, ScriptHandler, AnimClipHandler, AnimStateGraphHandler, GSplatHandler];
const app = new AppBase(canvas);
app.init(op);
// el relieve de la escena, si lo tiene: antes de que se compile ningún material (src/relieve.js; ?relieve=0, plano)
let relieve = null;
if (escena.relieve && q.get('relieve') !== '0') {
  try { relieve = await cargarRelieve(escena.relieve); if (!activarRelieve(app, relieve, () => app.root.findByName('camara'))) relieve = null; }
  catch (e) { console.warn('sin relieve:', e); relieve = null; }
}
app.loader.getHandler('gsplat').addParser(new SpzParser(app)); // .spz (y-up, sin giro), además de .ply, .sog y lod-meta.json
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
addEventListener('resize', () => app.resizeCanvas());

// ---- Activos
let planosFoto = null;
if (foto) {
  planosFoto = await (await fetch(foto.replace(/\/?$/, '/') + 'escena.json')).json();
  escena.inicio = [(planosFoto.izq + planosFoto.der) / 2, 1.2, -(planosFoto.cerca + 2)];
  escena.sol = escena.sol || '55,-60';
}
enMemoria.then(() => marca('bajado'));
if (window.esperaConstruir) await window.esperaConstruir; // (dentro de la web de 388 Pueblos, se construye cuando ella lo dice: src/desde388.js)
// ---- Montar mientras se baja (14-11-2026): cada .glb grande se lee —su Draco, sus texturas— en cuanto llega, sin esperar
// a los demás, y las zonas de la salida se piden y se leen ya, mientras llega lo demás (se montan en su sitio más abajo,
// cuando están los materiales). Antes se esperaba a tenerlo todo bajado para empezar: de 3 a 12 s más. Con la precarga de
// 388 Pueblos, lo crítico llega de uno en uno y en orden (src/precarga.js), así que hay algo que montar mientras tanto
const bajarGlb = async (u) => { // (un .glb, entero o en trozos —window.TROZOS—, a una URL de memoria)
  const base = u.replace(/\.wasm$/, ''), tr = window.TROZOS?.[base], [n, h] = Array.isArray(tr) ? tr : [tr, null];
  const urls = n ? Array.from({ length: n }, (_, k) => `${base}${h ? '.' + h : ''}.p${k}.wasm`) : [u];
  const partes = await Promise.all(urls.map(async (x) => { await window.precargaLista; await window.precargando?.get(new URL(x, location.href).href); const r = await fetch(x); if (!r.ok) throw new Error(`${x}: ${r.status}`); return r.arrayBuffer(); }));
  return URL.createObjectURL(new Blob(partes));
};
const iZ = (fin) => (escena.partes || []).findIndex((p) => p.endsWith(fin));
// (las zonas: cuáles, hasta dónde y cómo se traen —se bajan y se leen—; «La escena por zonas», más abajo, las monta)
const ZC = modelo && escena.zonas && iZ('/materiales.glb') >= 0 ? (() => {
  const radio = parseFloat(q.get('radio') || (movil ? '160' : '330')), suelta = radio + 80, todas = q.get('zonas') === '0';
  // (al empezar, solo las zonas de alrededor de la salida: las de más allá se ven de lejos con lejos.glb y llegan luego, de
  // una en una. Con todas las del radio había que bajar 60 MB de zonas antes del primer fotograma; con estas, unos 24.
  // ?radio0= lo cambia; ?radio0=0, como antes)
  const radio0 = parseFloat(q.get('radio0') ?? '100') || radio;
  const tope = parseFloat(q.get('caras') || (escena.caras ? escena.caras[movil ? 0 : 1] : 0)); // (caras de zona cargadas a la vez, como mucho: [móvil, ordenador])
  const dist = (z, p) => { const [x0, z0, x1, z1] = z.caja; return Math.hypot(Math.max(0, x0 - p.x, p.x - x1), Math.max(0, z0 - p.z, p.z - z1)); };
  // (hasta dónde se carga: el radio, o menos si las zonas de alrededor pesan más que el tope de caras de la escena.
  // En el centro del pueblo una zona pesa cinco veces lo que una de Malfeitos, y con el radio solo se iba la memoria)
  const hasta = (Z, p, inicial) => {
    let r = inicial ? Math.min(radio, radio0) : radio;
    if (tope && !todas) {
      let suma = 0;
      for (const z of Z.zonas.filter((z) => dist(z, p) < r).sort((a, b) => dist(a, p) - dist(b, p))) { suma += z.caras; if (suma > tope && suma > z.caras) { r = dist(z, p); break; } }
    }
    return r;
  };
  const traer = async (z) => {
    const url = await bajarGlb(glb(escena.zonas.slice(0, escena.zonas.lastIndexOf('/') + 1) + z.archivo)); // (junto a su zonas.json: antes iba fija la carpeta de malfeitos_gris y el pueblo entero cargaba las casas de la otra escena)
    const asset = new Asset('zona_' + z.clave, 'container', { url, filename: `zona_${z.clave}.glb` });
    app.assets.add(asset);
    await new Promise((ok, mal) => { asset.ready(ok); asset.once('error', mal); app.assets.load(asset); });
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    return asset;
  };
  const Zp = fetch(escena.zonas).then((r) => r.json()), ya = new Map(); // (ya: clave → la zona de la salida, ya pedida)
  const [ix, , iz] = escena.inicio || [0, 0, 0];
  Zp.then((Z) => { const p = { x: ix, z: iz }, r = hasta(Z, p, true); for (const z of Z.zonas) if (todas || dist(z, p) < r) { const t = traer(z); t.catch(() => {}); ya.set(z.clave, t); } }).catch(() => {});
  return { radio, suelta, todas, dist, hasta, traer, Zp, ya, inicio: { x: ix, z: iz } };
})() : null;
// (y lo grande, cada uno en cuanto llega)
const A = {}, cargas = [];
const activo = (k, tipo, u, datos) => cargas.push((async () => {
  const url = bajados[u] ? await bajados[u] : u;
  const a = (A[k] = new Asset(k, tipo, { url }, datos));
  await new Promise((ok) => { a.once('load', () => ok()); a.once('error', (e) => { console.warn(`${k}:`, e); ok(); }); app.assets.add(a); app.assets.load(a); });
})());
if (escena.splat) activo('splat', 'gsplat', escena.splat);
if (planosFoto) for (const [k, p] of Object.entries(planosFoto.planos)) activo('tex_' + k, 'texture', foto.replace(/\/?$/, '/') + p.textura);
if (chica) {
  // la chica del vídeo (tools/blender/personaje.py): MakeHuman con las animaciones del juego pasadas a su rig
  if (!mio) activo('personaje', 'container', glb(chica + cuerpo + '.glb'));
  activo('quieto', 'container', glb(chica + (q.get('quieto') || 'quieto') + '.glb'));
  activo('andar', 'container', glb(chica + (q.get('andar') || 'andar') + '.glb'));
  activo('correr', 'container', glb(chica + 'correr.glb'));
  activo('saltar', 'container', glb(chica + 'saltar.glb'));
} else {
  activo('personaje', 'container', './assets/personaje/bitmoji.glb');
  activo('quieto', 'container', './assets/personaje/idle.glb');
  activo('andar', 'container', './assets/personaje/walk.glb');
  activo('correr', 'container', './assets/personaje/run.glb');
  activo('saltar', 'container', './assets/personaje/jump-flip.glb');
}
activo('cielo', 'texture', './assets/cielo/morning-env-atlas.png', { type: TEXTURETYPE_RGBP, mipmaps: false });
// el acabado GTA como tabla de color (tools/lut_gta.py, de las 48 parejas de Malfeitos); ?lut=0 la quita
// (la tira es de 16³, 256 × 16, que es lo que el motor tiene fijo; y va en sRGB para que el muestreo la lleve a lineal)
activo('lut', 'texture', './assets/lut/' + (q.get('lut') || 'gta_malfeitos') + '.png', { mipmaps: false, srgb: true, minfilter: 'linear', magfilter: 'linear', addressu: 'clamp', addressv: 'clamp' });
if (escena.colision) activo('colision', 'container', escena.colision.startsWith('http') ? escena.colision : glb(escena.colision));
if (modelo && escena.colisiones) escena.colisiones.forEach((p, i) => activo('colision' + i, 'container', glb(p))); // (las colisiones de lo que va aparte)
if (modelo) activo('modelo', 'container', glb(escena.modelo));
if (modelo && escena.partes) escena.partes.forEach((p, i) => activo('parte' + i, 'container', glb(p)));
if (escena.objetos && q.get('objetos') !== '0') activo('objetos', 'container', glb(escena.objetos)); // (?objetos=0: sin ellos)
if (escena.cielo) activo('hdr', 'texture', escena.cielo, { mipmaps: false, ...(escena.cielo.endsWith('.png') ? { type: TEXTURETYPE_RGBE } : {}) }); // (.png en RGBE o .hdr)
// (y la luz de ambiente, de un cielo más templado: con el azul intenso del dibujado, las sombras salían azules)
if (escena.luzcielo) activo('hdrluz', 'texture', escena.luzcielo, { mipmaps: false, type: TEXTURETYPE_RGBE });
await Promise.all(cargas);
const mem = await enMemoria; // (las URL en memoria de lo bajado: el personaje del editor lee de aquí, y al final se sueltan)
const tCarga = performance.now() - t0;
marca('activos');
app.start();

// la luz de ambiente del personaje sale del atlas; el cielo dibujado, apagado (el splat trae el suyo)
app.scene.envAtlas = A.cielo.resource;
if (A.hdr) {
  // el cielo del HDRI: dibujado tal cual y, filtrado, la luz de ambiente y los reflejos
  // (en este orden: al poner el atlas, PlayCanvas vuelve a dibujar el cielo con él si no hay ya un cielo puesto después)
  app.scene.envAtlas = EnvLighting.generateAtlas(EnvLighting.generateLightingSource((A.hdrluz || A.hdr).resource));
  app.scene.skybox = EnvLighting.generateSkyboxCubemap(A.hdr.resource);
  marca('cielo');
}
app.scene.skyboxIntensity = parseFloat(q.get('amb') || escena.amb || '0.5'); // (?amb=: la luz de ambiente del cielo)
app.scene.layers.getLayerById(LAYERID_SKYBOX).enabled = !!modelo; // (con un modelo, el cielo del atlas sí)
app.scene.gsplat.splatBudget = Math.round(parseFloat(q.get('presupuesto') || '4') * 1e6);
app.scene.gsplat.dataFormat = GSPLATDATA_COMPACT;
app.scene.gsplat.lodUpdateAngle = 90; app.scene.gsplat.lodBehindPenalty = 3; app.scene.gsplat.radialSorting = true;
app.systems.rigidbody.gravity.set(0, -10, 0);

// ---- El sol (alumbra al personaje y da su sombra sobre el splat)
const sol = new Entity('sol');
// el sol de cada escena se ajusta al de la foto (?sol=inclinación,rumbo): la sombra del personaje tiene que caer
// hacia donde caen las de la foto, y dura como ellas
const solAng = (q.get('sol') || (escena.sol || '60,-20')).split(',').map(Number);
sol.addComponent('light', { type: 'directional', color: new Color(1, 1, 1), intensity: parseFloat(q.get('luz') || escena.luz || '2'), castShadows: true, shadowBias: 0.2, normalOffsetBias: 0.05, shadowDistance: modelo ? 60 : 24, shadowResolution: 2048, shadowIntensity: 0.8, shadowType: SHADOW_PCF1_32F });
if (acabadoFoto) {
  // sombras de foto: cuatro cascadas a 4K hasta 120 m (nítidas a los pies, y la calle entera sombreada), el sol
  // de media tarde algo cálido y la sombra entera (lo que la rellena es el cielo)
  // (rendimiento: 2 cascadas hasta 70 m —hasta el 7-11-2026, 90: con todas las calles, Malfeitos pasaba de 1.395 a 1.233
  // llamadas de dibujo y a esa distancia la sombra apenas se ve; ?sdist=90 para comparar—. Con 4 hasta 120, la calle se dibujaba una vez más para la sombra; de 3 a 2, medido
  // con tools/variantes.py, la imagen cambia menos que entre dos capturas iguales seguidas y caen 270 llamadas de dibujo)
  Object.assign(sol.light, { numCascades: parseInt(q.get('cascadas') || '2'), cascadeDistribution: 0.65, shadowDistance: parseFloat(q.get('sdist') || '70'),
    shadowResolution: parseInt(q.get('sres') || '4096'), shadowType: q.get('pcf') === '3' ? SHADOW_PCF3_32F : SHADOW_PCF1_32F, shadowIntensity: 1, shadowBias: parseFloat(q.get('sesgo') || '0.15'), normalOffsetBias: parseFloat(q.get('sesgon') || '0.1') }); // (0,1: con las paredes onduladas, a 0,03 la sombra de las cornisas salía en diente de sierra)
  // (PCF1: con PCF3 este modelo se queda sin sombra en WebGPU, comprobado el 27-10-2026; ?pcf=3 para probarlo)
  const sc = (q.get('solc') || escena.solc || '1,0.88,0.70').split(',').map(Number); // (?solc=r,g,b)
  sol.light.color = new Color(sc[0], sc[1], sc[2]); // (el sol del vídeo: dorado, de verano en el sur)
}
// la luz rebotada (en el vídeo, la sombra no es azul y muerta: la rellena el ocre de las paredes al sol y el asfalto):
// una luz cálida sin sombra que viene de abajo y del lado contrario al sol, y alumbra aleros, bajos de balcón y las
// fachadas a la sombra. ?rebote=0 la quita
const rebote = new Entity('rebote');
if (acabadoFoto && q.get('rebote') !== '0') {
  rebote.addComponent('light', { type: 'directional', color: new Color(1, 0.8, 0.6), intensity: parseFloat(q.get('rebote') || escena.rebote || '1.3'), castShadows: false });
  app.root.addChild(rebote);
}
sol.setLocalEulerAngles(solAng[0], solAng[1], 0);
app.root.addChild(sol);
if (rebote.light) {
  // (una direccional alumbra a lo largo de su -y: su +y apunta abajo y al lado contrario del sol, así la luz sube
  // desde el suelo y desde la fachada al sol hacia la que está a la sombra)
  const u = sol.up, h = Math.hypot(u.x, u.z) || 1, d = new Vec3(-u.x / h, -0.45, -u.z / h).normalize(), eje = new Vec3().cross(Vec3.UP, d);
  rebote.setRotation(new Quat().setFromAxisAngle(eje.normalize(), Math.acos(d.y) * 180 / Math.PI));
}

// ---- La cámara
const camara = new Entity('camara');
camara.addComponent('camera', { clearColor: new Color(0.1, 0.1, 0.1), farClip: 1000, fov: parseFloat(q.get('fov') || planosFoto?.camara?.fov || (escena.foto ? '66' : '60')), toneMapping: TONEMAP_LINEAR });
app.root.addChild(camara);

// ---- El postproceso (la «capa 4»): nitidez, un poco de bloom, viñeta y el LUT del acabado GTA. ?post=0 lo quita entero.
let post = null;
if (q.get('post') !== '0') {
  camara.addComponent('script');
  post = camara.script.create(CameraFrame);
  post.rendering.toneMapping = 'linear'; // (el color de la foto ya es el final; el tono lo pone el LUT)
  post.bloom.enabled = true; post.bloom.intensity = parseFloat(q.get('bloom') || '0.006'); post.bloom.blurLevel = 12; post.bloom.threshold = 0.9;
  post.rendering.sharpness = parseFloat(q.get('nitidez') || '0.35');
  post.vignette.enabled = true; post.vignette.intensity = 0.35; post.vignette.inner = 0.55; post.vignette.outer = 1.25; post.vignette.curvature = 0.6;
  if (q.get('lut') !== '0' && (!acabadoFoto || q.get('lut'))) { post.colorLUT.texture = A.lut; post.colorLUT.intensity = parseFloat(q.get('lutfuerza') || '1'); }
  if (acabadoFoto) {
    // el acabado de una cámara: curva de película (ACES), oclusión ambiental en rincones y bajo balcones y aleros,
    // MSAA 4× (la geometría tiene bordes, cables y rejas) y una viñeta apenas
    post.rendering.toneMapping = q.get('tono') || 'aces2';
    post.rendering.samples = parseInt(q.get('msaa') || '4', 10); // (?msaa=1 sin multimuestreo)
    // el antialias temporal (fase 2 del plan de calidad): la cámara tiembla un subpíxel cada fotograma y se mezcla con
    // los anteriores, así las rejas, los cables y las barandillas dejan de parpadear al andar. ?taa=0 lo quita
    // (deja la imagen algo blanda: con TAA, la nitidez sube a 1; probado sin halos en rejas, cables ni bordes de la chica)
    if ((q.get('taa') || escena.taa || '0') === '1') { post.taa.enabled = true; post.taa.jitter = parseFloat(q.get('taajit') || '1'); post.rendering.sharpness = parseFloat(q.get('nitidez') || '1'); }
    // (rendimiento, medido por pases en la GPU: el bloom con 12 niveles de desenfoque y el difuminado de la oclusión eran
    // más de la mitad del fotograma. Bloom a 4 niveles —su intensidad es mínima— y la oclusión, con su difuminado, a
    // media resolución. Sin el difuminado, con muestras al azar para el TAA, dejaba una trama por toda la imagen)
    post.bloom.blurLevel = parseInt(q.get('bloomniv') || '4', 10);
    // (a resolución completa en el ordenador: a media, el interior de los coches que se ve por las lunas salía lleno de
    // manchas a cuadros —el cristal no está en la profundidad con la que se calcula—; el usuario, 15-11-2026: «el coche
    // se ve pixelado». Cuesta 1,2 ms en la plaza llena; si no llega, la calidad adaptable la baja. En el móvil, a media)
    post.ssao.scale = AO_ESCALA;
    post.ssao.type = 'combine'; post.ssao.intensity = parseFloat(q.get('ao') || escena.ao || '0.6'); post.ssao.radius = parseFloat(q.get('aoradio') || '8'); post.ssao.samples = 16; post.ssao.power = 4; // (con un radio grande oscurecía fachadas enteras como si estuvieran a la sombra: radio corto, solo rincones y juntas)
    post.bloom.intensity = 0.02; post.bloom.threshold = 0.8; post.vignette.intensity = 0.25;
    if (q.get('brillo') === '0') post.bloom.enabled = false; // (?brillo=0, sin el bloom: para medir lo que cuesta y lo que se ve)
    if (q.get('ao') === '0') post.ssao.type = 'none';
    app.scene.exposure = parseFloat(q.get('exposicion') || escena.exposicion || '1.12');
    if (escena.zona_luz && (q.get('expozona') || escena.expozona) === '1') {  // (la exposición por zonas: ver la escena)
      const zl = escena.zona_luz, eje = zl.eje, ex0 = app.scene.exposure, ao0 = post.ssao.intensity;
      const dist = (x, z) => {
        let m = 1e9;
        for (let i = 0; i + 1 < eje.length; i++) {
          const [ax, az] = eje[i], [bx, bz] = eje[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t));
        }
        return m;
      };
      app.on('update', () => {
        const p = camara.getPosition(), w = Math.min(1, Math.max(0, (dist(p.x, p.z) - zl.dentro) / (zl.fuera - zl.dentro))), s = w * w * (3 - 2 * w);
        app.scene.exposure = zl.exposicion + (ex0 - zl.exposicion) * s; post.ssao.intensity = zl.ao + (ao0 - zl.ao) * s;
      });
    }
    // el color del vídeo: más contraste y más vida en los ocres y el azul del cielo, un punto cálido
    post.grading.enabled = true; // (medido contra el vídeo: el vídeo es más cálido, R−B de 40 frente a 18, y bastante más saturado, 0,42 frente a 0,25)
    post.grading.contrast = parseFloat(q.get('contraste') || escena.contraste || '1.06'); post.grading.saturation = parseFloat(q.get('saturacion') || escena.saturacion || '1.08'); const ti = (q.get('tinte') || escena.tinte || `1.04,1,${q.get('azul') || escena.azul || '0.9'}`).split(',').map(Number); post.grading.tint = new Color(ti[0], ti[1], ti[2], 1); // (?tinte=r,g,b; ?azul= solo el azul)
    post.colorEnhance.enabled = true; post.colorEnhance.vibrance = parseFloat(q.get('vibrance') || escena.vibrance || '0.45'); post.colorEnhance.shadows = parseFloat(q.get('sombras') || escena.sombras || '0.35'); post.colorEnhance.highlights = -0.1;
    // la atmósfera: bruma de distancia (lo lejano se aclara y se vuelve azulado, como en la foto de una calle larga)
    // y, con ?volumen=1, una niebla volumétrica muy fina en la que el sol dibuja sus rayos
    app.scene.fog.type = FOG_EXP; app.scene.fog.density = parseFloat(q.get('bruma') || '0.002'); app.scene.fog.color = new Color(0.74, 0.80, 0.88);
    if (q.get('volumen') === '1') {
      Object.assign(post.volumetricFog, { enabled: true, light: sol, density: 0.004, heightBase: 0, heightFalloff: 0.08, anisotropy: 0.7, intensity: 1, tint: new Color(1, 0.95, 0.88, 1), maxDistance: 150, steps: 16, scale: 0.5 });
    }
  }
}

// ---- La escena: el splat y su colisión, alineados bajo una misma raíz
const raiz = new Entity('escena');
raiz.setLocalEulerAngles(escena.giro[0], escena.giro[1], escena.giro[2]);
if (escena.escala && escena.escala !== 1) raiz.setLocalScale(escena.escala, escena.escala, escena.escala);
app.root.addChild(raiz);
const splat = new Entity('splat');
if (A.splat) { splat.addComponent('gsplat', { asset: A.splat }); raiz.addChild(splat); }
if (planosFoto) {
  // los planos de la foto: cada uno un cuadrilátero con su textura, sin luz (la luz ya está en la foto). La escena de
  // la foto tiene z hacia el fondo; en PlayCanvas el frente es -z, así que z se invierte
  const P = planosFoto;
  const plano = (k) => {
    const p = P.planos[k], [a, b, c, d] = p.esquinas; // arriba-izq, arriba-der, abajo-der, abajo-izq (en el sentido de la textura)
    const m = new StandardMaterial(); m.useLighting = false; m.emissiveMap = A['tex_' + k].resource; m.emissive = new Color(1, 1, 1); m.diffuse = new Color(0, 0, 0); m.cull = CULLFACE_NONE; // (sin luz: la luz ya está en la foto)
    if (p.alfa) { m.opacityMap = A['tex_' + k].resource; m.blendType = BLEND_NORMAL; m.depthWrite = false; } // (las colas: de opacas a transparentes, fundiendo un tramo con el siguiente)
    m.update();
    const v = (q) => [q[0], q[1], -q[2]];
    const pos = [].concat(v(a), v(b), v(c), v(d));
    // la normal del cuadrilátero, para que el material tenga sus atributos completos
    const e1 = [pos[3] - pos[0], pos[4] - pos[1], pos[5] - pos[2]], e2 = [pos[9] - pos[0], pos[10] - pos[1], pos[11] - pos[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const mesh = createMesh(app.graphicsDevice, pos, { normals: [].concat(n, n, n, n), uvs: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 2, 1, 0, 3, 2] }); // (en PlayCanvas la v = 0 es la fila de arriba de la textura)
    const e = new Entity('foto_' + k); e.addComponent('render', { meshInstances: [new MeshInstance(mesh, m)], castShadows: false }); raiz.addChild(e); // (sin sombra: las fachadas de la foto taparían el sol de toda la calle)
  };
  for (const k of Object.keys(P.planos)) plano(k);
  camara.camera.clearColor = new Color(P.cielo[0] / 255, P.cielo[1] / 255, P.cielo[2] / 255);
  // la colisión: el suelo, las dos fachadas y el fondo, como cajas
  const caja = (x, y, z, sx, sy, sz) => { const e = new Entity(); e.addComponent('rigidbody', { type: 'static' }); e.addComponent('collision', { type: 'box', halfExtents: new Vec3(sx / 2, sy / 2, sz / 2) }); e.setPosition(x, y, z); app.root.addChild(e); };
  const zc = -(P.fondo + P.cerca) / 2, L = P.fondo - P.cerca + 4;
  caja((P.izq + P.der) / 2, -0.05, zc, P.der - P.izq + 2, 0.1, L + 10);
  caja(P.izq - 0.25, P.alto_pared / 2, zc, 0.5, P.alto_pared, L); caja(P.der + 0.25, P.alto_pared / 2, zc, 0.5, P.alto_pared, L);
  caja((P.izq + P.der) / 2, P.alto_pared / 2, -P.fondo - 0.25, P.der - P.izq, P.alto_pared, 0.5); caja((P.izq + P.der) / 2, P.alto_pared / 2, 0.25, P.der - P.izq, P.alto_pared, 0.5);
}
// (las cajas de los coches aparcados salen de la malla y van cada una aparte, para poder subirse a uno y llevárselo:
// src/conducir.js; ?conducir=0, como venían)
const cajasCoches = [];
for (const a of [A.colision, ...(modelo && escena.colisiones ? escena.colisiones.map((_, i) => A['colision' + i]) : [])]) {
  if (!a) continue;
  const col = a.resource.instantiateRenderEntity();
  raiz.addChild(col);
  col.findComponents('render').forEach((render) => {
    if (modelo && q.get('conducir') !== '0') { try { cajasCoches.push(...separarCajas(app, render, a !== A.colision)); } catch (e) { console.warn('cajas de los coches:', e); } }
    render.entity.addComponent('rigidbody', { type: 'static', friction: 0.5, restitution: 0 });
    render.entity.addComponent('collision', { type: 'mesh', renderAsset: render.asset });
    render.enabled = false;
  });
}
// (lo que va pegado a la pared o al suelo no da sombra que se vea: los calcos de suciedad, manchas, grietas y
// desconchones, el cristal y los cierres metidos en su hueco, las pinturas del suelo y los rótulos y placas de pared.
// En la pasada de sombra eran un tercio de las mallas de las fachadas, por dos cascadas. Las señales sí la dan: la
// placa en el suelo se ve. ?sombras=todas las deja todas)
// (y las puertas basculantes y el vidrio de los escaparates, paneles metidos en su hueco: tres materiales nuevos en la
// 165 subían Malfeitos a 1.207 llamadas, con una por zona en cada cascada)
// (y, en la 166, las puertas y portones de madera, las persianas, los cierres de tijera, el aluminio, los bajantes, los
// contadores y los faroles: van metidos en su hueco o son finos, y su sombra no se ve; Malfeitos llegaba a 1.245 llamadas)
const SIN_SOMBRA = /^(churretes|mancha|lavada|parche|suciedad|desconchon|grieta|cristal|cierre|basculante_\w+|vidrio_claro|madera_\w+|persiana_\w+|tijera|malla|aluminio|zinc|contador|farol|cartel_pegado|recercado_\w+|carpinteria|zocalo_placas|glass(\.\d+)?|bump_front_ok(\.\d+)?|detalle|imperfeccion|cable|pintura_\w+|rotulo_\w+|placa_\w+|emblema_correos)$/;
const sinSombra = (n) => q.get('sombras') !== 'todas' && SIN_SOMBRA.test(n || '');
const instancias = new Map(); // (cada .glb de la calle y su entidad: las texturas se unen entre ellos y las zonas los usan)
if (A.modelo) {
  // el modelo: se ve, da y recibe sombra; si no trae una colisión aparte (la de malfeitos_gris sí, ligera), cada malla
  // es también su colisión
  const ocultar = (q.get('ocultar') || '').split(','); // (?ocultar=fachadas,tejados: para ver qué hace cada malla)
  [A.modelo, ...(escena.partes || []).map((_, i) => A['parte' + i])].forEach((asset) => { // (el modelo y sus partes)
    const mod = asset.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    instancias.set(asset, mod);
    const deMuestra = (escena.partes || []).some((p, i) => p.endsWith('/materiales.glb') && A['parte' + i] === asset); // (una cara de cada material: no se dibuja)
    // (los cristales de los coches traen la transmisión del glTF: PlayCanvas la hace refracción y, sin refracción dinámica,
    // a través del cristal se veía el cielo templado de la luz —morado— en vez del interior del coche. Sin ella, el cristal
    // es solo transparente; ?refraccion=1 la deja)
    if (q.get('refraccion') !== '1') asset.resource.materials.forEach((m) => { const mt = m.resource; if (mt && mt.refraction > 0) { mt.refraction = 0; mt.update(); } });
    // (filtrado anisótropo: la acera y el asfalto se miran muy de lado y, sin él, se emborronan a pocos metros)
    asset.resource.textures.forEach((t) => { if (t.resource) t.resource.anisotropy = 8; });
    // (la oclusión horneada de tools/blender/hornear.py: solo oscurece la luz de ambiente; ?ocl=0 la quita, ?ocl=0.5 a medias)
    const ocl = q.get('ocl');
    if (ocl !== null) asset.resource.materials.forEach((m) => { const mt = m.resource; if (!mt?.aoMap) return; if (ocl === '0') mt.aoMap = null; else mt.aoIntensity = parseFloat(ocl); mt.update(); });
    // (la suciedad de fuera de la iglesia —churretes, humedad del pie, manchas—, en el alfa de su oclusión horneada: detalle del
    // color que multiplica, donde 1 lo deja igual; tools/blender/iglesia_suciedad.py. Sin textura nueva. ?suciedad=0 la quita)
    if (q.get('suciedad') !== '0') asset.resource.materials.forEach((m) => { const mt = m.resource; if (!mt?.aoMap || !/^iglesia_.+_iglesia$/.test(mt.name)) return; mt.diffuseDetailMap = mt.aoMap; mt.diffuseDetailMapUv = mt.aoMapUv; mt.diffuseDetailMapChannel = 'aaa'; mt.diffuseDetailMode = 'mul'; mt.update(); });
    mod.findComponents('render').forEach((render) => {
      if (ocultar.includes(render.entity.name)) render.enabled = false;
      for (const mi of render.meshInstances) if (sinSombra(mi.material?.name)) mi.castShadow = false;
      if (A.colision) return;
      render.entity.addComponent('rigidbody', { type: 'static', friction: 0.5, restitution: 0 });
      render.entity.addComponent('collision', { type: 'mesh', renderAsset: render.asset });
    });
    if (!deMuestra) raiz.addChild(mod);
  });
  // (los coches del pueblo comparten la malla de su modelo: a cada uno, su pintura y su matrícula; src/aparcados.js)
  const vidaC = await vidaJson;
  if (vidaC?.coches?.some((c) => c.color)) tiempos.coches_pintados = pintarCoches({ app, coches: vidaC.coches, materiales: A.modelo.resource.materials.map((m) => m.resource) });
  // las texturas, una sola vez para todos los .glb de la calle: cada .glb trae las suyas (los mismos nombres de imagen de
  // Blender) y, desde que las fachadas van partidas en oeste y este (los 15 MB por archivo del enlace), las de las
  // fachadas venían dos veces: el móvil pasaba de 250 MB de JavaScript. Cada material toma la primera igual y las
  // repetidas se sueltan. ?unir=0 lo deja como viene
  if (q.get('unir') !== '0') {
    // (la misma textura: mismo tamaño, formato y bytes del primer nivel, comparados enteros; el nombre no basta, PlayCanvas
    // le añade el número de la textura y el paso a KTX2 deja muchas como Image_N)
    const bytes = (x) => { const L = x._levels?.[0]; return L instanceof Uint8Array ? L : null; };
    const huella = (x) => {
      const b = bytes(x); if (!b) return null;
      let h = 2166136261; for (let i = 0; i < b.length; i += 997) { h ^= b[i]; h = Math.imul(h, 16777619); }
      return `${x.width}|${x.height}|${x.format}|${b.length}|${h >>> 0}`;
    };
    const iguales = (a, b) => { const x = bytes(a), y = bytes(b); if (x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
    const primera = new Map(), usadas = new Set(), todas = new Set(), igual = new Map();
    let cambios = 0;
    for (const asset of instancias.keys()) {
      for (const t of asset.resource.textures) {
        const x = t.resource; if (!x) continue;
        todas.add(x);
        const clave = huella(x); if (!clave) continue;
        const p = primera.get(clave);
        if (!p) primera.set(clave, x); else if (p !== x && iguales(p, x)) igual.set(x, p);
      }
    }
    for (const asset of instancias.keys()) {
      for (const { resource: m } of asset.resource.materials) {
        if (!m) continue;
        let cambio = false;
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (!(v instanceof Texture)) continue;
          const u = igual.get(v) || v;
          if (u !== v) { const pub = k.startsWith('_') ? k.slice(1) : k; if (pub in m) m[pub] = u; else m[k] = u; cambio = true; }
          usadas.add(u);
        }
        if (cambio) { m.update(); cambios++; }
      }
    }
    const canon = new Set(primera.values());
    let sueltas = 0;
    for (const t of todas) if (!usadas.has(t) && !canon.has(t)) { t.destroy(); sueltas++; }
    tiempos.texturas_unidas = sueltas; tiempos.materiales_unidos = cambios;
  }
  if (A.objetos) {
    const obj = A.objetos.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    raiz.addChild(obj);
    // (fase 4: los detalles y las imperfecciones van en tramos de 25 m; los que quedan a más de ?lejos=40 m de la cámara
    // no se dibujan: son cosas de centímetros que de lejos no se ven)
    const lejos = parseFloat(q.get('lejos') || '40'), tramos = obj.findComponents('render').filter((r) => /^(detalles|imperfecciones)_-?\d+$/.test(r.entity.name));
    let cuenta = 0;
    app.on('update', () => {
      if ((cuenta++ & 7) || !lejos) return;
      const c = camara.getPosition();
      for (const r of tramos) { // (la distancia de la cámara a la caja del tramo, no a su centro)
        const b = r.meshInstances[0]?.aabb; if (!b) continue;
        const d = (k) => Math.max(0, Math.abs(c[k] - b.center[k]) - b.halfExtents[k]);
        r.enabled = Math.hypot(d('x'), d('y'), d('z')) < lejos;
      }
    });
  }
  // (fase 4: las rejas, la forja y las señales, con alfa a cobertura: con el MSAA, sus barrotes ya no parpadean al andar)
  [A.modelo, ...(escena.partes || []).map((_, i) => A['parte' + i])].forEach((asset) => asset?.resource.materials.forEach(({ resource: m }) => {
    if (m && /^(reja|forja|senal)/.test(m.name) && q.get('cobertura') !== '0') { m.alphaToCoverage = true; m.update(); }
  }));
  marca('colision');
} else if (!planosFoto && !A.colision) {
  const suelo = new Entity('suelo');
  suelo.addComponent('rigidbody', { type: 'static', friction: 0.5, restitution: 0 });
  suelo.addComponent('collision', { type: 'box', halfExtents: new Vec3(500, 0.05, 500) });
  suelo.setPosition(0, escena.suelo - 0.05, 0);
  app.root.addChild(suelo);
}

// ---- El personaje: una cápsula con física que mueve el controlador, y dentro el muñeco animado
const ctrl = new Entity('controlador');
ctrl.setPosition(escena.inicio[0], escena.inicio[1], escena.inicio[2]);
// (de 0,6 m de ancho, el de una persona con los brazos: con la de 1 m que trae el controlador, en las aceras de 1 m no
// se pasaba entre un coche y la pared ni junto a un escalón, aunque se viera hueco; a petición, «el personaje no puede
// pasar por zonas que están vacías»)
const RADIO = 0.3;
ctrl.addComponent('collision', { type: 'capsule', radius: RADIO, height: 2 });
ctrl.addComponent('rigidbody', { type: 'dynamic', mass: 100, linearDamping: 0, angularDamping: 0, linearFactor: Vec3.ONE, angularFactor: Vec3.ZERO, friction: 0.5, restitution: 0 });
app.root.addChild(ctrl);

const muneco = new Entity('muneco');
muneco.setLocalPosition(0, -1, 0); // (el pivote del modelo está en los pies; la cápsula mide 2)
muneco.setLocalScale(chica ? 1 : 1.5, chica ? 1 : 1.5, chica ? 1 : 1.5); // (la chica ya está en metros: 1,65)
ctrl.addChild(muneco);
// (el del editor: su cuerpo y sus prendas, ya bajados con lo demás, horneados con su forma y con las texturas reducidas)
let mi = null;
if (mio) {
  try {
    mi = await montarPersonaje({ app, estado: estadoMio, movil, q,
      leer: (u) => (String(mem[glb(u)]).startsWith('blob:') ? fetch(mem[glb(u)]).then((r) => r.arrayBuffer()) : leerArchivo(u)) });
  } catch (e) {
    // (si el personaje propio no carga, que no deje a nadie sin calle: se vuelve a la chica de serie y se recarga. Sin
    // poder apuntarlo no se recarga, que sería recargar sin fin)
    console.error('personaje: ' + (e?.stack || e));
    if (q.get('personaje')) throw e;
    let apuntadoElFallo = false;
    try { localStorage.removeItem('personaje_en_calle'); apuntadoElFallo = true; } catch (e2) { /* sin almacenamiento */ }
    if (!apuntadoElFallo) throw e;
    location.reload(); await new Promise(() => {});
  }
}
muneco.addChild(mi ? mi.raiz : A.personaje.resource.instantiateRenderEntity({ castShadows: true }));
if (chica && !mio) {
  // el pelo, las cejas y las pestañas: recorte por alfa con alfa a cobertura (con el MSAA), sin mezcla, para que no
  // haya que ordenar los mechones
  // los mechones finos no dan sombra: cientos de láminas casi juntas se sombrean unas a otras y la melena sale negra
  // (la sombra de la melena en el suelo la da la de debajo)
  if (q.get('sombrapelo') !== '1') muneco.findComponents('render').forEach((r) => r.meshInstances.forEach((mi) => { if (mi.material.name === 'pelo_mechones') mi.castShadow = false; }));
  // la cara no recibe la sombra del sol: el mapa de sombras tiene unos 3 cm por píxel y la nariz y el pelo le pintaban
  // manchas duras de media cara; sigue dando su sombra al suelo y la luz la modela igual
  if (q.get('sombracara') !== '1') muneco.findComponents('render').forEach((r) => r.meshInstances.forEach((mi) => { if (mi.material.name === 'cabeza') mi.receiveShadow = false; }));
  if (q.get('sinpelo') === '1') muneco.findComponents('render').forEach((r) => r.meshInstances.forEach((mi) => { if (/long01|mechon|^pelo/.test(mi.material.name)) mi.visible = false; })); // (para ver la ropa)
  A.personaje.resource.materials.forEach(({ resource: m }) => {
    const modo = q.get('pelo') || 'a2c'; // (?pelo=blend|test|a2c: para comparar)
    // el brillo del pelo: reflejo anisótropo (estirado a lo largo de los mechones), que se desplaza al moverse la melena
    // y la cabeza, como el del pelo de verdad al sol. ?brillo=0 lo quita
    if (/^pelo/.test(m.name) && q.get('brillo') !== '0') {
      m.enableGGXSpecular = true; m.anisotropyIntensity = parseFloat(q.get('aniso') || '0.8'); m.anisotropyRotation = parseFloat(q.get('anisorot') || '0');
      m.gloss = 0.62; m.useMetalness = true; m.metalness = 0; m.specularityFactor = 0.6; m.update();
    }
    if (/long01|mechon|^pelo/.test(m.name)) m.alphaTest = Math.max(m.alphaTest, 0.35); // (la sombra del pelo con su forma: sin esto, cada lámina da sombra entera y sale un cuadrado oscuro en el suelo)
    // los mechones finos: recorte por alfa con alfa a cobertura (el MSAA suaviza el borde de cada pelo) y sin mezcla,
    // así cientos de láminas se dibujan sin ordenarlas y sin el halo de la transparencia
    if (m.name === 'pelo_mechones' && (q.get('pelo') || 'a2c') !== 'blend') { m.blendType = BLEND_NONE; m.alphaTest = 0.3; m.alphaToCoverage = (q.get('pelo') || 'a2c') === 'a2c'; m.depthWrite = true; m.update(); } // (con su cara de atrás oculta: dibujadas por las dos caras, la de atrás recibe la luz al revés y sale negra y azulada; las láminas ya miran hacia fuera)
    if (q.get('sinrelieve') === '1' && /^(cabeza|cuerpo)$/.test(m.name)) { m.normalMap = null; m.update(); } // (para comparar: sin mapa de normales)
    // el cuerpo y la cabeza, por una sola cara: dibujados por las dos, por la rendija entre la camiseta metida y el
    // vaquero se veían las caras de dentro, oscuras, como una raya a manchas a media altura del culo. Y sus texturas,
    // sin repetirse en los bordes (el bajo de la camiseta, pintado de vaquero, cae en el de arriba de la imagen)
    if (/^(cabeza|cuerpo)$/.test(m.name)) {
      m.cull = CULLFACE_BACK; m.update();
      [m.diffuseMap, m.normalMap].forEach((t) => { if (t) { t.addressU = ADDRESS_CLAMP_TO_EDGE; t.addressV = ADDRESS_CLAMP_TO_EDGE; } });
    }
    // la piel deja pasar la luz: el paso de luz a sombra, repartido («wrap lighting»). Con el sol de lado, el Lambert
    // puro partía la cara en dos por la nariz (una mitad al sol y la otra casi negra); la ropa, un poco también
    if (/^(cabeza|cuerpo)$/.test(m.name) && q.get('piel') !== '0') {
      const w = (m.name === 'cabeza' ? 0.6 : 0.35).toFixed(2);
      m.getShaderChunks('wgsl').set('lightDiffuseLambertPS', `
fn getLightDiffuse(worldNormal: vec3f, viewDir: vec3f, lightDirNorm: vec3f) -> f32 {
	return max((dot(worldNormal, -lightDirNorm) + ${w}) / (1.0 + ${w}), 0.0);
}
`);
      m.getShaderChunks('glsl').set('lightDiffuseLambertPS', `
float getLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm) {
	return max((dot(worldNormal, -lightDirNorm) + ${w}) / (1.0 + ${w}), 0.0);
}
`);
      m.shaderChunksVersion = '2.8'; m.update();
    }
    if (/long01|eyebrow|eyelashes/.test(m.name) && modo !== 'blend') { m.blendType = BLEND_NONE; m.alphaTest = 0.45; m.alphaToCoverage = modo === 'a2c'; m.depthWrite = true; m.update(); }
  });
}
// el paso del personaje del editor, como el del vídeo (docs/personaje_video.md, tercera etapa): anda a 1,25 m/s con 2
// pasos por segundo y trota a 2,2 m/s con 2,6 (un trote corto, no una carrera). «pasa»: a cuánto de su velocidad va
// cada clip para dar esa cadencia (andar da 1,5 pasos por segundo y correr 2,137); con ese paso se hicieron los clips
// (tools/blender/personaje_editor.py), que llevan el pie clavado al suelo a esa velocidad
const LADEO = parseFloat(q.get('ladeo') || '1');   // (cuánto se inclina en los giros; ?ladeo=0 lo quita)
const PASO_MI = { andar: { v: 1.25, pasa: 4 / 3 }, correr: { v: 2.2, pasa: 2.6 / 2.137 } };
// lo fluido del movimiento (10-11-2026, el usuario: «mejora los movimientos del personaje, más fluidos y naturales»).
// Medido antes, con la chica de serie: al dar media vuelta el cuerpo giraba 180° en un fotograma; al arrancar, acelerar
// y frenar, el pie que pisa patinaba de 1,3 a 2,2 m/s (andando, 0,2), porque la animación iba siempre a su paso; y paraba
// en seco, en 6 cm. Ahora: el cuerpo gira hacia donde va en un tiempo (giro, s), la velocidad sube y baja con algo de
// peso (inercia, s), la animación va al paso de la velocidad (vandar, vcorrer: lo que avanza cada clip a su paso
// normal, en m/s) y las mezclas duran más (mezcla, s). Cada uno se puede cambiar en el enlace para probar
const FLUIDO = { giro: parseFloat(q.get('giro') || '0.11'), inercia: parseFloat(q.get('inercia') || '0.16'), mezcla: parseFloat(q.get('mezcla') || '0.25'),
  vandar: parseFloat(q.get('vandar') || '1.0'), vcorrer: parseFloat(q.get('vcorrer') || '1.93'), cambio: parseFloat(q.get('cambio') || '1.5'),
  roce: parseFloat(q.get('roce') || '0.5'), ladeo: parseFloat(q.get('ladeochica') || '0.7'), girotope: parseFloat(q.get('girotope') || '500'),
  fuerza: parseFloat(q.get('fuerza') || '1.1') };
muneco.addComponent('anim', { activate: true });
if (mi) muneco.anim.rootBone = mi.modelo; // (sus huesos cuelgan de su modelo, un nivel más abajo que los de la chica)
muneco.anim.loadStateGraph({
  layers: [{
    name: 'piernas',
    states: [{ name: 'START' }, { name: 'Quieto', speed: 1 }, { name: 'Andar', speed: mi ? PASO_MI.andar.pasa : 1 }, { name: 'Correr', speed: mi ? PASO_MI.correr.pasa : chica ? 1.35 : 1 } /* (la chica, con la zancada amortiguada: pasos más cortos y más rápidos) */, { name: 'Saltar', speed: chica ? 1.8 : 1 } /* (el salto de captura dura 2,6 s con su impulso y su caída; el del juego, menos) */, { name: 'END' }],
    transitions: [
      { from: 'START', to: 'Quieto', time: 0, priority: 0 },
      // (las mezclas de un paso a otro: con 0,1 s la chica cambiaba de golpe; de quieta a andar, un cuarto de segundo, y de
      // andar a correr, algo más, que es lo que tarda en cambiar de zancada. FLUIDO.mezcla, ?mezcla=)
      { from: 'Quieto', to: 'Andar', time: mi ? 0.22 : FLUIDO.mezcla, priority: 0, conditions: [{ parameterName: 'v', predicate: ANIM_GREATER_THAN, value: 0 }] },
      { from: 'Andar', to: 'Quieto', time: mi ? 0.22 : FLUIDO.mezcla, priority: 0, conditions: [{ parameterName: 'v', predicate: ANIM_LESS_THAN_EQUAL_TO, value: 0 }] },
      { from: 'Andar', to: 'Correr', time: mi ? 0.22 : FLUIDO.mezcla * 1.2, priority: 0, conditions: [{ parameterName: 'v', predicate: ANIM_GREATER_THAN, value: 1 }] },
      { from: 'Correr', to: 'Andar', time: mi ? 0.22 : FLUIDO.mezcla * 1.2, priority: 0, conditions: [{ parameterName: 'v', predicate: ANIM_LESS_THAN, value: 2 }] },
      { from: 'ANY', to: 'Saltar', time: 0.1, priority: 0, conditions: [{ parameterName: 'salto', predicate: ANIM_EQUAL_TO, value: true }] },
      // (al caer, a lo que esté haciendo: antes, siempre a quieta, y de ahí otra vez a andar o a correr)
      ...(q.get('fluido') !== '0' ? [
        { from: 'Saltar', to: 'Correr', time: 0.2, priority: 0, exitTime: 0.8, conditions: [{ parameterName: 'v', predicate: ANIM_GREATER_THAN, value: 1 }] },
        { from: 'Saltar', to: 'Andar', time: 0.2, priority: 0, exitTime: 0.8, conditions: [{ parameterName: 'v', predicate: ANIM_GREATER_THAN, value: 0 }] },
      ] : []),
      { from: 'Saltar', to: 'Quieto', time: 0.2, priority: 0, exitTime: 0.8 },
      { from: 'Saltar', to: 'Andar', time: 0.2, priority: 0, exitTime: 0.8 },
    ],
  }],
  parameters: { v: { name: 'v', type: ANIM_PARAMETER_INTEGER, value: 0 }, salto: { name: 'salto', type: ANIM_PARAMETER_TRIGGER, value: false } },
});
const capa = muneco.anim.baseLayer;
// (al del editor, solo los giros y la cadera a su escala: sus huesos ya están en el sitio de su cuerpo)
const pista = (a, o) => (mi ? mi.pista(a.resource.animations[0].resource, o) : a.resource.animations[0].resource);
capa.assignAnimation('Quieto', pista(A.quieto, { rectas: true }));  // (de pie, las piernas como en el clip: src/personaje.js)
capa.assignAnimation('Andar', pista(A.andar));
capa.assignAnimation('Correr', pista(A.correr));
capa.assignAnimation('Saltar', pista(A.saltar));
// (si el personaje va algo más despacio o más deprisa de lo previsto (una cuesta, un cuerpo más alto, el arranque), la
// animación se pasa en proporción, entre 0,75 y 1,25, para que el pie siga sin patinar)
if (mi && !q.get('t')) app.on('update', () => {
  const lv = ctrl.rigidbody.linearVelocity, v = Math.hypot(lv.x, lv.z), paso = { Andar: PASO_MI.andar, Correr: PASO_MI.correr }[muneco.anim.baseLayer?.activeState];
  muneco.anim.speed = paso ? Math.max(0.75, Math.min(1.25, v / (paso.v * mi.escalaCadera / 0.9236))) : 1;
});
// (la chica de serie, igual: su andar avanza FLUIDO.vandar m/s a su paso y su correr, FLUIDO.vcorrer; el estado «Correr»
// ya va a 1,35, así que aquí se le da la parte que falta. Entre 0,35 y 1,6: al arrancar, al frenar y al cambiar de paso)
if (!mi && chica && !q.get('t') && q.get('fluido') !== '0') app.on('update', () => {
  const lv = ctrl.rigidbody.linearVelocity, v = Math.hypot(lv.x, lv.z), est = muneco.anim.baseLayer?.activeState;
  const k = est === 'Andar' ? v / FLUIDO.vandar : est === 'Correr' ? v / (FLUIDO.vcorrer * 1.35) : 1;
  muneco.anim.speed = Math.max(0.35, Math.min(1.6, k));
});
// en los giros, el cuerpo se echa hacia dentro (como quien corre de verdad, y como en el vídeo): lo que pide la
// curva, velocidad por giro entre la gravedad, hasta 14°, suavizado; desde los pies
const ladeable = mi ? mi.raiz : (chica && q.get('fluido') !== '0' ? muneco.children[0] : null);  // (la chica también, desde el 10-11-2026)
if (ladeable) {
  let rumbo = null, giro = 0, ladeo = 0;
  app.on('update', (dt) => {
    const f = muneco.forward, r = Math.atan2(f.x, f.z), lv = ctrl.rigidbody.linearVelocity, v = Math.hypot(lv.x, lv.z);
    let d = rumbo === null ? 0 : r - rumbo; rumbo = r; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    const k = Math.min(1, dt / 0.18);
    giro += (Math.max(-6, Math.min(6, d / Math.max(dt, 1e-3))) - giro) * k;   // (radianes por segundo, sin los saltos de un giro de golpe)
    const quiere = Math.max(-14, Math.min(14, Math.atan(v * giro / 9.8) * 180 / Math.PI * LADEO));
    ladeo += (quiere - ladeo) * Math.min(1, dt / 0.12);
    // (hacia dentro de la curva: con el signo de antes se echaba hacia fuera, medido el 10-11-2026 con la cabeza respecto a
    // la cadera; la chica, algo menos que el del editor)
    ladeable.setLocalEulerAngles(0, 0, q.get('fluido') !== '0' ? -ladeo * (mi ? 1 : FLUIDO.ladeo) : ladeo);
  });
}
if (mi) app.on('update', (dt) => mi.actualizar(dt, camara)); // (el parpadeo, la mirada y el vaivén del pelo, tras la animación)

// la melena: cadenas de huesos (pelo_<cadena><tramo>, de las orejas a las puntas) con muelles, después de la animación:
// integración de Verlet (cada punta guarda dónde estaba y sigue con su inercia), un muelle suave que la devuelve a su
// sitio, gravedad, y choques con la cabeza, el cuello y la espalda (esferas en sus huesos); así la melena se mece con
// cada paso, vuela en los giros y vuelve a caer suelta sobre la espalda
const melena = [];
if (chica) for (let k = 0; k < 10; k++) {
  const c = [1, 2, 3, 4].map((i) => muneco.findByName('pelo_' + k + i)).filter(Boolean);
  if (c.length) melena.push(c);
}
if (chica && !melena.length) ['c', 'i', 'd'].forEach((k) => { const c = [1, 2, 3].map((i) => muneco.findByName('pelo_' + k + i)).filter(Boolean); if (c.length) melena.push(c); });
const choques = chica ? [['mixamorig:Head', 0.105, 0.09], ['mixamorig:Neck', 0.07, 0.03], ['mixamorig:Spine2', 0.15, 0.08], ['mixamorig:Spine1', 0.14, 0.0]]
  .map(([n, r, sube]) => ({ e: muneco.findByName(n), r, sube })).filter((c) => c.e) : [];
const mvC = new Vec3();
function chocar(p) {
  for (const c of choques) {
    mvC.copy(c.e.getPosition()); mvC.y += c.sube;
    const d = p.distance(mvC);
    if (d < c.r) p.sub(mvC).mulScalar(c.r / Math.max(d, 1e-4)).add(mvC);
  }
}
const muelles = melena.map((cadena) => cadena.map((h, i) => {
  const sig = cadena[i + 1];
  const largo = sig ? sig.getLocalPosition().length() : (cadena[i].getLocalPosition().length() || 0.15);
  return { h, rest: h.getLocalRotation().clone(), largo, cur: null, prev: null };
}));
const mv = { a: new Vec3(), b: new Vec3(), c: new Vec3(), q: new Quat(), r: new Quat() };
function moverMelena(dt) {
  const d = Math.min(dt, 1 / 30), RIGIDEZ = parseFloat(q.get('rigidez') || '0.07'), ROCE = 0.12, GRAVEDAD = 2.5; // (rigidez baja: la melena se mece con cada paso y tarda en volver, como en el vídeo)
  for (const cadena of muelles) {
    for (const m of cadena) {
      m.h.setLocalRotation(m.rest); // (la pose de la animación, sin muelle)
      const cab = m.h.getPosition(), dir = mv.a.copy(m.h.up).mulScalar(m.largo); // (en glTF los huesos apuntan a +y)
      const reposo = new Vec3().add2(cab, dir);
      if (!m.cur) { m.cur = reposo.clone(); m.prev = reposo.clone(); }
      const vel = mv.b.sub2(m.cur, m.prev).mulScalar(1 - ROCE);
      m.prev.copy(m.cur);
      m.cur.add(vel).add(mv.c.sub2(reposo, m.cur).mulScalar(RIGIDEZ)).add(new Vec3(0, -GRAVEDAD * d * d, 0));
      chocar(m.cur);
      const hacia = new Vec3().sub2(m.cur, cab).normalize();
      m.cur.copy(cab).add(hacia.clone().mulScalar(m.largo));
      // girar el hueso de su dirección de reposo a la del muelle
      const de = dir.clone().normalize(), eje = new Vec3().cross(de, hacia), ang = Math.acos(Math.max(-1, Math.min(1, de.dot(hacia))));
      if (eje.length() > 1e-6 && ang > 1e-4) {
        mv.q.setFromAxisAngle(eje.normalize(), ang * 180 / Math.PI);
        mv.r.copy(mv.q).mul(m.h.getRotation());
        m.h.setRotation(mv.r);
      }
    }
  }
}
// (en «update», que el motor lanza después de la animación: con «postupdate», que este motor no lanza, la melena no se
// movía desde hacía tiempo; arreglado el 10-11-2026)
if (melena.length && q.get('melena') !== '0') app.on(q.get('fluido') !== '0' ? 'update' : 'postupdate', moverMelena); // (?melena=0: sin muelles)

ctrl.addComponent('script');
const tpc = ctrl.script.create(ThirdPersonController, { properties: {
  camera: camara, characterModel: muneco, jumpForce: 420, speedGround: mi ? 15 * PASO_MI.andar.v / 1.4 : chica ? 15 : 65, sprintMult: mi ? PASO_MI.correr.v / PASO_MI.andar.v : chica ? 2.1 : 1.73, // (la chica anda a 1,4 m/s y corre a 2,9; el personaje del editor, a lo de PASO_MI: la velocidad va con la fuerza)
  cameraDistance: parseFloat(q.get('dist') || planosFoto?.camara?.dist || '4'), cameraHeight: mi ? Math.max(0.7, mi.altura * 0.73) : 1.2 /* (a la altura de cada uno: 1,2 m para 1,65) */, cameraPositionDamping: 0.0005, lookSens: 0.15,
  invertLookY: true, initialPitch: 12, walkSpeedThreshold: 0.5, jogSpeedThreshold: mi ? 1.75 : chica ? (q.get('fluido') !== '0' ? FLUIDO.cambio : 2.4) : 4,
  // (FLUIDO: el cuerpo gira hacia donde va con una constante de tiempo de FLUIDO.giro s (de serie, casi al instante), y la
  // velocidad sube y baja con FLUIDO.inercia s (de serie, 0,1). El controlador las pide como el resto que queda por
  // milisegundo; la fuerza, en proporción, para que ande y corra a lo mismo de antes. ?fluido=0: como antes)
  ...(q.get('fluido') !== '0' ? { modelTurnSmoothing: Math.exp(-1 / (FLUIDO.giro * 1000)), velocityDampingGround: Math.exp(-1 / (FLUIDO.inercia * 1000)) } : {}),
} });
montarTeclado(tpc);   // (WASD y flechas sin tener que capturar el ratón, y nada se queda pulsado: src/teclado.js)
if (q.get('fluido') !== '0') {
  tpc.speedGround *= 0.0995 / FLUIDO.inercia * FLUIDO.fuerza;   // (con la inercia, a la fuerza de antes le falta un 10 %: así anda a 1,1 m/s, como antes)
  tpc.sprintMult *= parseFloat(q.get('sprint') || '0.915');   // (y corre a 2,6 m/s, como antes: con la fuerza de andar, corría a 2,85)
  tpc.speedAir = parseFloat(q.get('aire') || '1.2');   // (en el aire apenas se acelera: con lo de serie, 5, iba ganando velocidad hasta 6,7 m/s y caía corriendo)
  ctrl.rigidbody.friction = FLUIDO.roce;   // (el rozamiento, el de siempre: con menos, frenaba algo más suave pero corría más despacio)
  // el giro del cuerpo, con un tope de grados por segundo (FLUIDO.girotope): el controlador lo acerca a donde va cada
  // fotograma en proporción, y en el primero de una media vuelta eran 25° de golpe. Después de los guiones, que es
  // cuando el controlador ya lo ha puesto
  let yawSuave = null;
  app.on('update', (dt) => {
    if (enRuta) { yawSuave = null; return; }   // (las rutas de medida giran el muñeco por su cuenta)
    const quiere = tpc._modelYaw; if (quiere === undefined) return;
    if (yawSuave === null) yawSuave = quiere;
    let d = quiere - yawSuave; d -= Math.round(d / 360) * 360;
    const tope = FLUIDO.girotope * dt; yawSuave += Math.max(-tope, Math.min(tope, d));
    muneco.setLocalEulerAngles(0, yawSuave, 0);
  });
}
// (saliendo donde se dejó o junto a alguien, mirando hacia donde miraba o hacia esa persona)
if (salida?.rumbo != null) { tpc._yaw = salida.rumbo + 180; tpc._modelYaw = salida.rumbo; muneco.setLocalEulerAngles(0, salida.rumbo, 0); }
let andando = false, enRuta = false; // (enRuta: andando una ruta de medida, sin teclado)
tpc.on('speed', (b) => { if (q.get('fluido') === '0') muneco.anim.setInteger('v', b); andando = b > 0; });
// (FLUIDO: el paso de la animación (quieta, andar, correr), cada fotograma desde la velocidad, pero solo en el suelo: en
// el aire coge algo de velocidad y, al caer de un salto andando, salía corriendo un momento. Pasa a correr al llegar a la
// velocidad de cambio y vuelve a andar un 10 % por debajo, para que no vaya y venga. Y mientras se pulsa una dirección no
// se para por un bajón de un instante (al caer de un salto, el golpe contra el suelo la frena un momento a 0,5 m/s)
if (q.get('fluido') !== '0') {
  let paso = 0;
  app.on('update', () => {
    if (enRuta || !tpc._grounded) return;
    const lv = ctrl.rigidbody.linearVelocity, h = Math.hypot(lv.x, lv.z), c = tpc.jogSpeedThreshold, quiere = tpc._state.axis.lengthSq() > 0;
    const corre = quiere && tpc._state.shift > 0 && paso === 2;   // (y si va corriendo y sigue con Mayús, tampoco deja de correr por ese bajón)
    paso = h < tpc.walkSpeedThreshold && !(quiere && h > 0.15) ? 0 : (corre || h >= c * (paso === 2 ? 0.9 : 1)) ? 2 : 1;
    muneco.anim.setInteger('v', paso);
  });
}
// donde el navegador no deja capturar el ratón (el visor integrado de la app), se gira arrastrando con el botón pulsado,
// con la misma sensibilidad que con el ratón capturado (lookSens · px) y el picado al revés, como el controlador
{
  const lienzo = app.graphicsDevice.canvas; let arrastre = false;
  lienzo.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') arrastre = true; });
  addEventListener('pointerup', () => { arrastre = false; });
  lienzo.addEventListener('pointermove', (e) => {
    if (!arrastre || document.pointerLockElement || e.pointerType !== 'mouse') return;
    tpc._yaw -= e.movementX * tpc.lookSens; tpc._pitch = Math.min(tpc.pitchMax, Math.max(tpc.pitchMin, tpc._pitch + e.movementY * tpc.lookSens));
  });
}
// subir y bajar bordillos, peldaños y escaleras sin pensar (15-11-2026; el usuario: «mejora la dinámica a la hora de subir
// cualquier escalera… que sea sencillo e intuitivo»). Antes se buscaba la tabica con un rayo a ras de los pies y, si a
// 45 cm de alto había algo a medio metro, se tomaba por una pared: en una escalera de huella corta (la del púlpito, 27 cm)
// el peldaño siguiente quedaba ahí; y cada peldaño se subía de golpe. Ahora:
// - se mira el suelo un poco por delante, desde arriba (a 35 y a 55 cm del centro, hacia donde va): si está hasta 42 cm
//   más alto y encima hay sitio para la chica, se sube ya, antes de chocar con el peldaño, sin frenar;
// - bajando, en cuanto el centro sale del borde, se baja al suelo de abajo (hasta 45 cm), sin el saltito de caer;
// - la cápsula de la física sube o baja de una vez, pero el muñeco la sigue suave (se queda atrás lo subido y lo recupera
//   en unas décimas): se ve subir la escalera, no a saltos.
const escalon = { a: new Vec3(), b: new Vec3(), d: new Vec3(), op: { filterCallback: (e) => e !== ctrl && e.name !== 'caja_coche' && !e.tags?.has('gente') } };
let alivio = 0, alivioCam = 0; // (lo que el muñeco va por detrás de la cápsula, en altura; y lo que baja la cámara en este fotograma)
// (lo que pide el jugador en este fotograma, con el teclado, el mando del móvil o el de consola: se mira antes de que el
// controlador lo gaste. Con la chica parada contra un peldaño su velocidad es casi cero y el controlador dice que no anda:
// antes eso apagaba la ayuda y se quedaba atascada hasta saltar —en la puerta sur, el paso del cancel y el presbiterio—,
// 15-11-2026, el usuario: «que entre suave y normal»; tools/prueba_escaleras.py --teclado)
const pide = { x: 0, z: 0, t: 0 };
{ const upd = tpc._updateController;
  if (upd) tpc._updateController = function (frame, dt) { try { const m = frame.deltas?.move?._value; if (m) { pide.x = m[0]; pide.z = m[2]; pide.t = (m[0] || m[2]) ? performance.now() : pide.t; } } catch (e) { /* */ } return upd.call(this, frame, dt); }; }
// (y si pisa suelo: el controlador lo mira con un rayo bajo el centro, hasta 10 cm por debajo de los pies. Subiendo un
// peldaño, la chica se quedaba montada en el canto —la parte de abajo de la cápsula es redonda y apoya en el borde—, con el
// suelo de abajo a 13 cm bajo su centro: para el controlador iba en el aire, donde casi no acelera, y el roce la dejaba
// quieta. Ahora, si el rayo del centro no da con nada, se prueban otros cuatro a 20 cm, que dan con el canto)
{ const sysR = app.systems.rigidbody, rayo0 = sysR.raycastFirst.bind(sysR), ra = new Vec3(), rb = new Vec3(), sinElla = { filterCallback: (e) => e !== ctrl && !e.tags?.has('gente') };
  // (y la cámara, con un abanico de cinco rayos —el del centro y cuatro a los bordes de lo que ve, 30 cm a los lados y 20
  // arriba y abajo— y sin contar a la gente: con uno solo, rozando una esquina o el marco de una puerta la cámara se metía en
  // el muro y se veía a través, como el interior de la iglesia desde la calle. 15-11-2026, la revisión del juego)
  const rc = new Vec3(), pc_ = new Vec3(), hitCam = { point: new Vec3() };
  const sondaCamara = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz) || 1, hz = Math.hypot(dx, dz) || 1;
    const lx = -dz / hz, lz = dx / hz; let mejor = L;
    for (const [u, w] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.2], [0, -0.2]]) {
      const g = rayo0(a, rc.set(b.x + lx * u, b.y + w, b.z + lz * u), sinElla);
      if (g) mejor = Math.min(mejor, pc_.copy(g.point).sub(a).dot(rc.set(dx / L, dy / L, dz / L)));
    }
    if (mejor >= L - 1e-3) return null;
    hitCam.point.set(a.x + dx / L * mejor, a.y + dy / L * mejor, a.z + dz / L * mejor); return hitCam;
  };
  const rayoSuelo = (a, b, op) => {
    { const c0 = ctrl.getPosition(); if (!op && Math.abs(a.x - c0.x) < 1e-3 && Math.abs(a.z - c0.z) < 1e-3 && a.y > c0.y + 0.3 && b.y > a.y - 30 && Math.hypot(b.x - a.x, b.z - a.z) > 0.3) return sondaCamara(a, b); }
    const h = rayo0(a, b, op); if (h || op) return h;
    const c = ctrl.getPosition();   // (solo el del suelo: desde el centro de la cápsula, en vertical hacia abajo)
    if (Math.abs(a.x - c.x) > 1e-4 || Math.abs(a.z - c.z) > 1e-4 || Math.abs(a.y - c.y) > 1e-4 || Math.abs(b.x - a.x) > 1e-4 || Math.abs(b.z - a.z) > 1e-4 || b.y >= a.y) return h;
    for (const [ox, oz] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) { const g = rayo0(ra.set(a.x + ox, a.y, a.z + oz), rb.set(b.x + ox, b.y, b.z + oz), sinElla); if (g) return g; }
    return null;
  };
  tpc.cameraCollisionPadding = Math.max(tpc.cameraCollisionPadding || 0, 0.35);
  // (y sin distancia mínima: el controlador no la dejaba a menos de 0,4 m del personaje, y en un portal estrecho, con la
  // pared a 0,45 m —la puerta de la iglesia—, la empujaba a través del muro. Ahora se queda delante de la pared aunque sea
  // casi en la cabeza de la chica, que entonces no se dibuja: se ve como desde sus ojos hasta salir del estrecho)
  tpc.cameraMinDistance = 0.1;
  let ocultaCerca = false;
  app.on('update', () => {
    const d = tpc._clampedDistance; if (d === undefined || !tpc.enabled) return;
    const quiere = d < (ocultaCerca ? 0.7 : 0.6);
    if (quiere !== ocultaCerca) { ocultaCerca = quiere; for (const r of muneco.findComponents('render')) for (const mi of r.meshInstances) mi.visible = !quiere; }
  });
  const upd = tpc.update;
  tpc.update = function (dt) { sysR.raycastFirst = rayoSuelo; try { return upd.call(this, dt); } finally { sysR.raycastFirst = rayo0; } };
}
app.on('update', (dt) => {
  if (alivio) { alivio *= Math.exp(-dt / 0.08); if (Math.abs(alivio) < 0.003) alivio = 0; muneco.setLocalPosition(0, -1 + alivio, 0); }
  alivioCam = alivio; // (la cámara ya está puesta con la cápsula de antes de lo que se suba ahora: baja lo de antes)
  const pidiendo = performance.now() - pide.t < 120;
  // (parada y montada en un canto —un bordillo, un peldaño, el umbral de una puerta—, con el suelo de debajo más de 4 cm por
  // debajo de los pies: se ve flotando. Se aparta del canto hacia el suelo de abajo, 3 cm por fotograma, hasta pisarlo;
  // 15-11-2026, el usuario: «cuando el personaje está quieto, está como levitando»)
  if (!andando && !enRuta && !pidiendo && ctrl.enabled && ctrl.rigidbody.linearFactor.x > 0 && (escalon.n = (escalon.n || 0) + 1) % 4 === 0) {
    const p = ctrl.getPosition(), pies = p.y - 1, sys = app.systems.rigidbody;
    escalon.a.set(p.x, pies + 0.05, p.z); escalon.b.set(p.x, pies - 0.5, p.z);
    const bajo = sys.raycastFirst(escalon.a, escalon.b, escalon.op);
    if (bajo && pies - bajo.point.y > 0.04 && Math.abs(ctrl.rigidbody.linearVelocity.y) < 0.3) {
      // (hacia dónde está el canto: el lado en que el suelo, a 25 cm, está a la altura de los pies; se va al contrario)
      let ax = 0, az = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
        escalon.a.set(p.x + dx * 0.25, pies + 0.05, p.z + dz * 0.25); escalon.b.set(escalon.a.x, pies - 0.5, escalon.a.z);
        const h = sys.raycastFirst(escalon.a, escalon.b, escalon.op); if (h && Math.abs(h.point.y - pies) < 0.03) { ax += dx; az += dz; }
      }
      const l = Math.hypot(ax, az);
      if (l > 0.1) ctrl.rigidbody.teleport(p.x - ax / l * 0.03, p.y, p.z - az / l * 0.03);
    }
  }
  if ((!andando && !enRuta && !pidiendo) || !ctrl.enabled) return;
  const v = ctrl.rigidbody.linearVelocity; if (v.y > 1.2) return; // (saltando)
  const p = ctrl.getPosition(), pies = p.y - 1, sys = app.systems.rigidbody, d = escalon.d;
  // hacia dónde va: su velocidad; parada contra algo, hacia donde pide el jugador (la cámara y el mando) o hacia donde mira
  if (Math.hypot(v.x, v.z) > 0.25) d.set(v.x, 0, v.z).normalize();
  else {
    if (pidiendo && (pide.x || pide.z)) { const y_ = tpc._yaw * Math.PI / 180, fx = -Math.sin(y_), fz = -Math.cos(y_); d.set(fx * pide.z + Math.cos(y_) * pide.x, 0, fz * pide.z - Math.sin(y_) * pide.x); if (d.lengthSq() < 1e-9) return; d.normalize(); }
    else { d.copy(muneco.forward); if (chica) d.mulScalar(-1); d.y = 0; if (d.lengthSq() < 1e-6) return; d.normalize(); }
  }
  // (cuesta arriba, en una rampa —las gradas del atrio son rampas en la colisión—, la física sola la frenaba a un tercio de
  // su paso: el controlador empuja en horizontal y la gravedad tira para atrás. Si pide andar, va a la velocidad que pide
  // —la que alcanza en llano con esa fuerza— y siguiendo la pendiente)
  if (pidiendo && tpc._grounded) {
    escalon.a.set(p.x, pies + 0.3, p.z); escalon.b.set(p.x, pies - 0.3, p.z);
    const s = sys.raycastFirst(escalon.a, escalon.b, escalon.op);
    if (s && s.normal.y > 0.6 && s.normal.y < 0.985) {
      const pend = -(s.normal.x * d.x + s.normal.z * d.z) / s.normal.y; // (lo que sube por metro, hacia donde va)
      const alfa = 1 - Math.pow(tpc.velocityDampingGround, dt * 1000), quiere = Math.hypot(pide.x, pide.z) / Math.max(alfa, 1e-4);
      const vh = Math.hypot(v.x, v.z);
      if (pend > 0.05 && quiere > 0.3 && vh < quiere * 0.95) { const u = Math.min(quiere * 0.95, 3.2); ctrl.rigidbody.linearVelocity = new Vec3(d.x * u, u * pend, d.z * u); }
    }
  }
  // el suelo de delante
  const ahora_ = performance.now(), libre = (x, z, y0) => { escalon.a.set(x, y0 + 0.05, z); escalon.b.set(x, y0 + 1.7, z); return !sys.raycastFirst(escalon.a, escalon.b, escalon.op); };
  const subir = (dh, x, z) => { ctrl.rigidbody.teleport(x, p.y + dh + 0.01, z); ctrl.rigidbody.linearVelocity = new Vec3(v.x, 0, v.z); alivio -= dh + 0.01; muneco.setLocalPosition(0, -1 + alivio, 0); escalon.subio = ahora_; }; // (el muñeco, en su sitio ya en este fotograma: si no, se le veía arriba uno)
  let dh = null;
  for (const lejos of [RADIO + 0.05, RADIO + 0.25]) {
    escalon.a.set(p.x + d.x * lejos, pies + 0.6, p.z + d.z * lejos); escalon.b.set(escalon.a.x, pies - 0.6, escalon.a.z);
    const h = sys.raycastFirst(escalon.a, escalon.b, escalon.op);
    if (h && h.normal.y > 0.95) { dh = h.point.y - pies; if (dh > 0.03 && dh < 0.42 && libre(h.point.x, h.point.z, h.point.y)) { subir(dh, p.x, p.z); return; } break; } // (un peldaño es plano: las rampas, como las gradas del atrio, las sube la física sola)
  }
  // (montada en el canto y casi parada: el suelo bajo el centro, más de 4 cm por debajo de los pies, y el de delante a la
  // altura de los pies: se adelanta lo que le falta para pisarlo, en vez de quedarse en el borde)
  if (dh != null && Math.abs(dh) < 0.04 && Math.hypot(v.x, v.z) < 0.5) {
    escalon.a.set(p.x, pies + 0.05, p.z); escalon.b.set(p.x, pies - 0.5, p.z);
    const bajo = sys.raycastFirst(escalon.a, escalon.b, escalon.op);
    if (!bajo || pies - bajo.point.y > 0.04) { ctrl.rigidbody.teleport(p.x + d.x * 0.06, p.y + Math.max(0, dh) + 0.005, p.z + d.z * 0.06); ctrl.rigidbody.linearVelocity = new Vec3(v.x, 0, v.z); escalon.subio = ahora_; return; }
  }
  // (y si delante hay una tabica que no se ve desde arriba —un umbral estrecho, que el rayo de delante salta—: su borde)
  escalon.a.set(p.x, pies + 0.05, p.z); escalon.b.set(p.x + d.x * (RADIO + 0.2), pies + 0.05, p.z + d.z * (RADIO + 0.2));
  const tabica = sys.raycastFirst(escalon.a, escalon.b, escalon.op);
  if (tabica && tabica.normal.y < 0.7) {
    const tx = tabica.point.x + d.x * 0.06, tz = tabica.point.z + d.z * 0.06;
    escalon.a.set(tx, pies + 0.5, tz); escalon.b.set(tx, pies, tz);
    const arriba = sys.raycastFirst(escalon.a, escalon.b, escalon.op), h = arriba ? arriba.point.y - pies : 0;
    if (h > 0.02 && h < 0.42 && libre(tx, tz, arriba.point.y)) { subir(h, p.x + d.x * 0.04, p.z + d.z * 0.04); return; }
  }
  // bajar: si ya no hay suelo bajo el centro ni bajo la parte de delante, al de abajo (y no justo después de subir)
  if (v.y < 0.5 && ahora_ - (escalon.subio || 0) > 250) {
    const bajoEn = (x, z) => { escalon.a.set(x, pies + 0.05, z); escalon.b.set(x, pies - 0.5, z); const h = sys.raycastFirst(escalon.a, escalon.b, escalon.op); return h && h.normal.y > 0.95 ? pies - h.point.y : null; };
    const baja = bajoEn(p.x, p.z), bajaDelante = bajoEn(p.x + d.x * 0.2, p.z + d.z * 0.2);
    if (baja != null && bajaDelante != null && baja > 0.07 && baja < 0.46 && bajaDelante > 0.07) {
      ctrl.rigidbody.teleport(p.x, p.y - baja + 0.01, p.z); ctrl.rigidbody.linearVelocity = new Vec3(v.x, 0, v.z); alivio += baja - 0.01; muneco.setLocalPosition(0, -1 + alivio, 0);
    }
  }
});
// (y la cámara, igual: el controlador la pone cada fotograma según la cápsula; aquí, después, baja lo que el muñeco va por
// detrás, y sube con él. Sin esto, la cámara daba un salto de 22 cm en cada peldaño)
app.on('update', () => { if (alivioCam && ctrl.enabled) camara.translate(0, alivioCam, 0); });
// ?pose=Andar&t=0.4: el muñeco quieto en un instante de una animación (para fotografiar el paso)
if (q.get('pose')) {
  let n_ = 0;
  app.on('update', () => {
    if (n_++ > 30) return;
    const capa_ = muneco.anim.baseLayer;
    if (capa_.activeState !== q.get('pose')) capa_.transition(q.get('pose'), 0);
    capa_.activeStateCurrentTime = parseFloat(q.get('t') || '0'); muneco.anim.speed = n_ > 25 ? 0 : 1;
  });
}
tpc.on('jump', () => { if (muneco.anim.baseLayer.activeState !== 'Saltar') muneco.anim.setTrigger('salto'); });

// la sombra de contacto: un plano invisible bajo el personaje que oscurece el splat con la sombra del sol
const sombra = new Entity('sombra');
sombra.addComponent('script').create(ShadowCatcher, { properties: { scale: new Vec3(12, 12, 12), drawBucket: 0 } });
app.root.addChild(sombra);
sombra.enabled = !modelo; // (un modelo recibe la sombra de verdad)
const rayo = { a: new Vec3(), b: new Vec3(), ultimaY: 0, op: { filterCallback: (e) => e !== ctrl } };
function seguirSombra() {
  const p = ctrl.getPosition();
  rayo.a.set(p.x, p.y, p.z); rayo.b.set(p.x, p.y - 100, p.z);
  const h = app.systems.rigidbody.raycastFirst(rayo.a, rayo.b, rayo.op);
  if (h) rayo.ultimaY = h.point.y;
  sombra.setPosition(p.x, rayo.ultimaY + 0.01, p.z);
}

// ---- La vida y el sonido de la calle (src/vida.js y src/sonido.js), con lo que dice vida.json; ?vida=0 los quita
let sonido = null, canto = null, reloj = null;
if (escena.vida && q.get('vida') !== '0') {
  const vida = (await vidaJson) || await (await fetch(escena.vida)).json();
  // (los coches aparcados en la plaza de la iglesia, copias de los del pueblo: antes de montarCoches, que los cambia de cerca)
  if (escena.aparcados && q.get('aparcados') !== '0') { try { aparcar({ app, vida, sitios: await (await fetch(escena.aparcados)).json() }); } catch (e) { console.warn('aparcados:', e); } }
  const materiales = [A.modelo, ...(escena.partes || []).map((_, i) => A['parte' + i])].filter(Boolean).flatMap((a) => a.resource.materials.map((m) => m.resource)).filter(Boolean);
  montarVida({ app, vida, materiales, q });
  // (los bancos de forja de la plaza de la iglesia, tools/blender/iglesia_plaza.py: a la lista de los de vida.json, para que
  // la chica y los vecinos se sienten también en ellos; su altura, con un rayo al suelo. 15-11-2026, el usuario: «ya sea
  // un banco de piedra o de madera que haya por las calles o alrededor de la iglesia»)
  if (escena.iglesiaBancos && q.get('bancosiglesia') !== '0') {
    try {
      const ib = await (await fetch(escena.iglesiaBancos)).json(), sysB = app.systems.rigidbody;
      for (const b of ib) {
        const h = sysB?.raycastFirst(new Vec3(b.x, 6, b.z), new Vec3(b.x, -4, b.z));
        const suelo = h ? (h.point.y > 0.3 ? h.point.y - 0.48 : h.point.y) : 0; // (el rayo da en su colisión, de 48 cm, o en el suelo)
        vida.bancos.push({ p: [b.x, suelo + 0.46, b.z], mira: [b.dx, b.dz], largo: b.largo, iglesia: true });
      }
      tiempos.bancos_iglesia = ib.length;
    } catch (e) { console.warn('bancos de la iglesia:', e); }
  }
  tiempos.bancos_solidos = bancosSolidos({ app, vida, q }); // (los bancos que no tenían colisión: src/vida.js)
  if (escena.reloj && q.get('reloj') !== '0') { try { reloj = montarReloj({ app, sol, rebote, post, escena, q, vida, hud: null, interior: escena.dentro?.planta || null }); } catch (e) { console.warn('reloj:', e); } }
  // (el tiempo de verdad en Guareña, de Open-Meteo: nubes, lluvia, niebla; src/tiempo.js)
  if (reloj) { try { const ti = montarTiempo({ app, reloj, camara, q, movil }); if (window.foto) window.foto.tiempo = ti; else trasListo.then(() => { if (window.foto) window.foto.tiempo = ti; }); } catch (e) { console.warn('tiempo:', e); } }
  if (escena.vecinos) montarVecinos({ app, vida, carpeta: escena.vecinos, glb, chica: ctrl, q }).then((v) => { if (window.foto) window.foto.vecinos = v; });
  if (escena.sonidos) sonido = montarSonido({ app, camara, ctrl, muneco, carpeta: escena.sonidos, vida, suelo: () => rayo.ultimaY, viento, q, despues: trasListo });
  if (sonido && escena.dentro?.canto) canto = montarCanto({ app, sonido, ctrl, url: escena.dentro.canto, planta: escena.dentro.planta, q });
  const centro = await (await fetch(escena.vida.replace('vida.json', 'centro.json'))).json();
  trasListo.then(() => montarAnimales({ app, vida, centro, carpeta: escena.vida.replace('vida.json', ''), glb, ctrl, sonido, q })).then((a) => { if (window.foto) window.foto.animales = a; });
  montarDinamicas({ app, vida, ctrl, q }).then((d) => { if (window.foto) window.foto.dinamicas = d; else trasListo.then(() => { if (window.foto) window.foto.dinamicas = d; }); });   // (llegaba antes de existir window.foto)
  trasListo.then(() => montarCoches({ app, vida, carpeta: escena.vida.replace('vida.json', ''), glb, camara, q, movil })).then((c) => {
    if (window.foto) window.foto.coches = c;
    // (subirse a un coche aparcado y conducirlo: src/conducir.js)
    try { const k = montarConducir({ app, q, ctrl, muneco, tpc, camara, coches: c, cajas: cajasCoches, carpeta: escena.vida.replace('vida.json', ''), glb, post, movil, sonido, compactar: q.get('compactar') !== '0' ? compactar : null }); if (window.foto) window.foto.conducir = k; }
    catch (e) { console.warn('conducir:', e); }
    // (los contenedores de escombros de las obras, en el sitio de cuatro coches: src/obras.js)
    try { const o = ponerObras({ app, coches: c, q }); if (window.foto) window.foto.obras = o; } catch (e) { console.warn('obras:', e); }
  }).catch((e) => { console.warn('coches:', e); if (window.foto && !('coches' in window.foto)) window.foto.coches = null; });   // (null si falla: la entrada desde la web no espera 20 s)
  // la gente del pueblo, según la hora (src/gente.js; docs/gente.md): después de lo demás, que no retrase la carga
  if (escena.gente) trasListo.then(() => montarGente({ app, vida, carpeta: escena.gente, glb, camara, chica: ctrl, reloj, q, movil, iglesia: escena.iglesiaSitios, habitantes: escena.pueblo?.habitantes,
    conducir: () => window.foto?.conducir?.estado?.() })).then((g) => { if (window.foto) window.foto.gente = g; }).catch((e) => { console.warn('gente:', e); if (window.foto) window.foto.gente = null; })   // (null si falla: la entrada desde la web no espera 20 s)
    // y lo que puede hacer la chica con ella y con el pueblo: sentarse, hablar, saludar, bailar, arrodillarse, encender una vela (src/acciones.js)
    .then(() => (chica ? montarAcciones({ app, q, ctrl, muneco, tpc, carpeta: escena.chica, glb, pista, movil, vida, gente: window.foto?.gente, iglesia: escena.iglesiaSitios,
      conducir: () => window.foto?.conducir?.estado?.(), reloj, personas: (p) => window.foto?.multi?.cerca?.(p) || null, alSaludar: () => window.foto?.multi?.gesto?.(1) }) : null))
    .then((a) => { if (window.foto) window.foto.acciones = a; }).catch((e) => console.warn('acciones:', e));
  // el multijugador: los demás que están en el pueblo, hablar con ellos, la hora de la sala y «Guareña, ahora» (src/multi.js;
  // docs/multijugador.md). Con la chica de serie o con el personaje propio (a los demás se les ve con el suyo:
  // src/multi_figuras.js)
  if (chica && vida) trasListo.then(() => { try { const m = montarMulti({ app, q, escena: nombre, ctrl, muneco, tpc, camara, reloj, vida, personaje: mio ? null : A.personaje,
    clips: { Quieto: A.quieto, Andar: A.andar, Correr: A.correr, Saltar: A.saltar }, movil, desde388: q.get('desde') === '388', mio: !!mi, estadoMio: mi?.estado || null, glb,
    pueblo: escena.pueblo, salida, inicioDeSerie, iglesia: escena.dentro?.nombre, carpetas: { coches: escena.vida?.replace('vida.json', ''), chica: escena.chica } }); if (window.foto) window.foto.multi = m; } catch (e) { console.warn('multijugador:', e); } });
  // (la sombra de contacto bajo los pies de la chica y de los vecinos de cerca: src/sombras.js)
  if (modelo) { try { montarSombras({ app, muneco, ctrl, camara, gente: () => window.foto?.gente, reloj, q }); } catch (e) { console.warn('sombras de contacto:', e); } }
}

// ---- Medida: los tiempos de cada fotograma, y una ruta andada sin teclado (para el Chrome sin ventana)
const marco = { t: [], ultimo: performance.now(), ruta: null };
const hud = document.getElementById('hud');
let fpsSuave = 0;
// la calidad se adapta para no bajar de 60 fps en un ordenador modesto, sin tocar nada en uno que va sobrado: cada 1,5 s
// mira la mediana del fotograma; si pasa de 18 ms (menos de 55 fps), primero dibuja algo más pequeño (de ?dpr, 1,5× de
// serie, hasta 1×) y, si aún no llega, va dejando lo que menos se nota, de uno en uno: el multimuestreo (el antialias
// temporal sigue), la sombra a 2048, la oclusión ambiental a menos resolución, la resolución por debajo de 1× (hasta
// 0,7: el antialias temporal la reconstruye) y, lo último, la sombra en una sola cascada más corta. Cuando va holgado
// (menos de 11 ms), lo recupera en el orden contrario; la resolución, además, prueba a subir cada 10 s. (No mira si va
// por encima de 60: en una pantalla de 60 Hz el fotograma siempre tarda 16,7 ms.) ?adaptar=0 lo quita; ?nivel=N
// empieza en ese escalón
const NIVELES = [
  () => {}, // (0: todo)
  (on) => { if (post) post.rendering.samples = on && !adaptar.dentro ? 1 : parseInt(q.get('msaa') || '4', 10); },   // (dentro del coche, el multimuestreo no se quita)
  (on) => { if (sol.light) sol.light.shadowResolution = on ? 2048 : parseInt(q.get('sres') || '4096', 10); },
  (on) => { if (post?.ssao) post.ssao.scale = on ? 0.35 : AO_ESCALA; },
  null, // (4: la resolución, por debajo de 1×)
  // (5: la sombra, más corta. Hasta el 15-11-2026 también en una sola cascada; pero cambiar las cascadas rehace los
  // sombreadores de todos los materiales, y en un portátil normal era un tirón de casi un segundo cada vez que la calidad
  // bajaba o probaba a subir)
  (on) => { if (sol.light) sol.light.shadowDistance = on ? 45 : parseFloat(q.get('sdist') || '70'); },
];
// (la resolución que de verdad se dibuja: en una pantalla normal, de 1×, el tope de 1,5× no hace nada)
const ratio = () => Math.min(device.maxPixelRatio, window.devicePixelRatio || 1);
const adaptar = { max: ratio(), t: 0, prueba: 0, espera: 10, probando: false, ms: [], nivel: 0, activo: q.get('adaptar') !== '0', dentro: false };
const ponerNivel = (n) => {
  n = Math.max(0, Math.min(NIVELES.length - 1, n));
  while (adaptar.nivel < n) { adaptar.nivel++; NIVELES[adaptar.nivel]?.(true); }
  while (adaptar.nivel > n) { NIVELES[adaptar.nivel]?.(false); adaptar.nivel--; }
  const techo = adaptar.nivel && !adaptar.dentro ? Math.min(1, adaptar.max) : adaptar.max; // (con algo quitado, nunca por encima de 1×; dentro del coche, sí)
  if (ratio() > techo + 0.01) { device.maxPixelRatio = techo; app.resizeCanvas(); }
};
const ponerRatio = (r) => { device.maxPixelRatio = r; app.resizeCanvas(); };
// la escalera, de arriba abajo: la resolución hasta 1×, los escalones 1 a 4, la resolución hasta 0,7× y el escalón 5;
// para subir, lo mismo al revés
const bajar = (paso) => {
  const r = ratio(), n = adaptar.nivel, uno = Math.min(1, adaptar.max);
  // (dentro del coche: primero la resolución hasta 1×, luego la sombra y la oclusión; el multimuestreo y la resolución por
  // debajo de 1×, no: son lo que quita los dientes de sierra del salpicadero y los montantes)
  if (adaptar.dentro) { if (r > uno + 0.01) ponerRatio(Math.max(uno, r - paso)); else if (n < 3) ponerNivel(Math.max(2, n + 1)); else if (n < 5) ponerNivel(5); return; }
  if (n === 0 && r > uno + 0.01) ponerRatio(Math.max(uno, r - paso));
  else if (n < 4) ponerNivel(n + (paso > 0.2 && n < 3 ? 2 : 1));
  else if (n === 4 && r > 0.71) ponerRatio(Math.max(0.7, r - paso));
  else if (n === 4) ponerNivel(5);
};
const subir = () => {
  const r = ratio(), n = adaptar.nivel, uno = Math.min(1, adaptar.max);
  if (n === 5) ponerNivel(4);
  else if (n === 4 && r < uno - 0.01) ponerRatio(Math.min(uno, r + 0.125));
  else if (n > 0) ponerNivel(n - 1);
  else if (r < adaptar.max - 0.01) ponerRatio(Math.min(adaptar.max, r + 0.125));
};
if (q.get('nivel') || movil) ponerNivel(parseInt(q.get('nivel') || '3', 10));
// la vista de dentro del coche, con toda la resolución y el multimuestreo (22-11-2026; el usuario: «cuando conduzcas por
// dentro… se ven el chasis del coche muy pixelado, mejora la resolución por dentro»): de cerca, el salpicadero, el techo y
// los montantes, a 1× en una pantalla Retina y sin multimuestreo, salían con escalones de dos píxeles. Al entrar, la
// resolución sube a su tope (?dpr, 1,5× de serie) y vuelve el multimuestreo; si no llega a 55 fps, baja la resolución
// hasta 1× y quita sombra y oclusión, pero no el multimuestreo. Al salir, lo de antes. En el móvil, nada (su memoria no da).
const calidadDentro = (on) => {
  if (movil || !post || on === adaptar.dentro) return;
  adaptar.dentro = on; adaptar.t = 0; adaptar.ms.length = 0; adaptar.prueba = 0; adaptar.probando = false;
  const msaa = parseInt(q.get('msaa') || '4', 10);
  if (on) { post.rendering.samples = msaa; if (ratio() < adaptar.max - 0.01) ponerRatio(adaptar.max); }
  else { post.rendering.samples = adaptar.nivel >= 1 ? 1 : msaa; const techo = adaptar.nivel ? Math.min(1, adaptar.max) : adaptar.max; if (ratio() > techo + 0.01) ponerRatio(techo); }
};
// (no mira hasta que el juego se ha asentado: 6 s después de estar listo y, entrando desde la web de 388, después de posarse
// la cámara. Antes, los fotogramas de la carga y del vuelo de la entrada, lentos por lo que aún se monta, le hacían bajar
// la calidad nada más entrar, y quitar o poner el multimuestreo obliga a la gráfica a rehacer lo de todos los materiales:
// otro tirón. 15-11-2026)
// (entrando desde la web de 388, en cuanto se posa: allí lo de los dos multimuestreos ya está preparado, src/desde388.js)
let posado = 0;
const asentado = () => {
  if (q.get('desde') === '388') { if (!document.documentElement.classList.contains('aterrizado')) return false; posado ||= performance.now(); return performance.now() > posado + 500; }
  return tiempos.listo !== undefined && performance.now() > t0 + tiempos.listo + 6000;
};
app.on('update', (dt) => {
  if (adaptar.activo && asentado()) {
    adaptar.ms.push(dt * 1000); adaptar.t += dt;
    if (adaptar.t > 1.5) {
      // (con la pantalla a 60 Hz cada fotograma tarda 16,7 o 33 ms: la mediana no ve los que se pierden; lo que cuenta es
      // la parte de fotogramas lentos)
      const s = adaptar.ms.sort((a, b) => a - b), m = s[Math.floor(s.length / 2)], lentos = s.filter((x) => x > 20).length / s.length;
      adaptar.t = 0; adaptar.ms.length = 0; adaptar.prueba += 1.5;
      const malo = lentos > 0.08 || m > 18;
      if (malo) {
        if (adaptar.probando) adaptar.espera = Math.min(80, adaptar.espera * 2); // (la subida no aguantó: la próxima, más tarde)
        bajar(m > 30 ? 0.25 : 0.125); // (muy lento: a pasos dobles)
        adaptar.prueba = 0; adaptar.probando = false;
      } else if (lentos === 0 && (m < 11 || adaptar.prueba > adaptar.espera)) {
        // (holgado de verdad, o un rato largo sin un solo fotograma lento: un paso arriba)
        adaptar.prueba = 0; subir(); adaptar.probando = true;
      } else adaptar.probando = false;
    }
  }
  seguirSombra();
  const ahora = performance.now(), d = ahora - marco.ultimo; marco.ultimo = ahora;
  marco.t.push(d); if (marco.t.length > 7200) marco.t.shift();
  fpsSuave = fpsSuave ? fpsSuave * 0.95 + (1000 / d) * 0.05 : 1000 / d;
  if (marco.ruta) andarRuta(dt);
  if ((marco.t.length & 15) === 0) {
    const bb = app.graphicsDevice.backBufferSize;
    const gs = app.stats.frame.gsplats || 0; // (los splats, solo en las escenas que los tienen; la coma decimal, como en el resto)
    hud.textContent = `${fpsSuave.toFixed(0)} fps · ${app.graphicsDevice.deviceType} · ${bb.x}×${bb.y}${adaptar.nivel ? ' · calidad −' + adaptar.nivel : ''}${gs ? ' · ' + gs.toLocaleString('es') + ' splats' : ''} · carga ${(tCarga / 1000).toFixed(1).replace('.', ',')} s`;
  }
});

// la ruta: tramos [rumbo en grados, segundos, correr]; mueve la cápsula a la velocidad del controlador
const vel = new Vec3();
function andarRuta(dt) {
  const r = marco.ruta;
  if (r.puntos) { // (un camino de puntos [x, z]: hacia cada uno, y al siguiente a medio metro)
    const p = ctrl.getPosition(), q = r.puntos[r.i];
    if (q && Math.hypot(q[0] - p.x, q[1] - p.z) < 0.5) { r.i++; return; }
    r.tramos = q ? [[Math.atan2(q[0] - p.x, q[1] - p.z) * 180 / Math.PI, 1e9, r.correr ? 1 : 0]] : []; r.t = 0;
  }
  const tramo = r.puntos ? r.tramos[0] : r.tramos[r.i];
  enRuta = !!tramo;
  if (!tramo) { marco.ruta = null; ctrl.rigidbody.linearVelocity = new Vec3(0, ctrl.rigidbody.linearVelocity.y, 0); r.fin(); return; }
  r.t += dt;
  const rad = tramo[0] * Math.PI / 180, v = mi ? (tramo[2] ? PASO_MI.correr.v : PASO_MI.andar.v) / 0.82 /* (la ruta pierde un 18 % de lo que se le pide, por el roce con el suelo entre fotogramas) */ : chica ? (tramo[2] ? 2.9 : 1.4) : (tramo[2] ? 4.5 : 2.2);
  vel.set(Math.sin(rad) * v, ctrl.rigidbody.linearVelocity.y, Math.cos(rad) * v);
  ctrl.rigidbody.linearVelocity = vel;
  muneco.setEulerAngles(0, tramo[0] + (chica ? 0 : 180), 0); // (la chica mira a +z en su reposo; el muñeco, a −z)
  muneco.anim.setInteger('v', tramo[2] ? 2 : 1);
  if (!r.puntos && r.t >= tramo[1]) { r.i++; r.t = 0; }
}

function resumen(ms) {
  const s = [...ms].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const med = q(0.5);
  return { fotogramas: s.length, fps: Math.round(10000 / med) / 10, ms: { p50: med, p95: q(0.95), p99: q(0.99), max: s[s.length - 1] },
    tirones: { '33': s.filter((x) => x > 33).length, '50': s.filter((x) => x > 50).length, '100': s.filter((x) => x > 100).length } };
}

window.foto = {
  app, ctrl, camara, tpc, sonido, canto, reloj, muneco, personaje: mi, cargado: true, carga_ms: Math.round(tCarga), tiempos, gpu: app.graphicsDevice.deviceType, escena: nombre, url: escena.splat,
  pos: () => { const p = ctrl.getPosition(); return [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100); },
  ir: (x, y, z) => { ctrl.rigidbody.teleport(x, y, z); },
  // ir a otro sitio del pueblo de golpe (volver donde se dejó, quedar con alguien: src/multi.js): la chica allí, mirando
  // hacia «rumbo», la cámara detrás de ella, las zonas de alrededor cargadas a la vez y los vecinos, de nuevo
  irA: async (x, y, z, rumbo = null) => {
    ctrl.rigidbody.teleport(x, y, z); ctrl.rigidbody.linearVelocity = Vec3.ZERO;
    const r = rumbo ?? tpc._modelYaw ?? 0;
    tpc._yaw = r + 180; tpc._modelYaw = r; muneco.setLocalEulerAngles(0, r, 0);
    const a = r * Math.PI / 180, c = new Vec3(x - Math.sin(a) * 4, y + 1.2, z - Math.cos(a) * 4);
    camara.setPosition(c); tpc._camPos?.copy(c); tpc._camLookAt?.set(x, y, z);
    await zonas?.cargarEn?.({ x, z });
    window.foto?.gente?.reiniciar?.();
  },
  andando: (b) => { andando = b; }, // (para mover la cápsula desde fuera con la subida de escalones puesta)
  // la cámara: rumbo y picado en grados, y distancia al personaje (para las capturas desde un punto fijo)
  vista: (rumbo, picado, dist) => { tpc._yaw = rumbo; if (picado != null) tpc._pitch = picado; if (dist != null) tpc.cameraDistance = dist; },
  sol: (inc, rumbo) => sol.setLocalEulerAngles(inc, rumbo, 0),
  // una cámara fija, sin el controlador (que esquiva lo que se pone entre la cámara y el personaje): para fotografiar
  // al personaje detrás de algo
  camara: (x, y, z, tx, ty, tz) => { tpc.enabled = false; camara.setPosition(x, y, z); camara.lookAt(tx, ty, tz); },
  // andar la ruta y medir a la vez: devuelve el resumen de los fotogramas de la ruta
  ruta: (tramos) => new Promise((fin) => { marco.t.length = 0; marco.ruta = { tramos, i: 0, t: 0, fin: () => fin(resumen(marco.t)) }; }),
  camino: (puntos, correr) => new Promise((fin) => { marco.t.length = 0; marco.ruta = { puntos, correr, tramos: [], i: 0, t: 0, fin: () => fin(resumen(marco.t)) }; }),
  medir: (seg) => new Promise((fin) => { marco.t.length = 0; setTimeout(() => fin(resumen(marco.t)), seg * 1000); }),
  splats: () => app.stats.frame.gsplats,
  // la caja del splat en el mundo, para saber dónde está una escena nueva y ponerle el inicio
  caja: () => {
    const b = A.splat?.resource?.aabb; if (!b) return null;
    const mn = b.getMin(), mx = b.getMax(), m = raiz.getWorldTransform(), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const x of [mn.x, mx.x]) for (const y of [mn.y, mx.y]) for (const z of [mn.z, mx.z]) { // (las ocho esquinas, giradas y escaladas como la escena)
      const p = m.transformPoint(new Vec3(x, y, z)); [p.x, p.y, p.z].forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); });
    }
    return { min: lo.map((v) => Math.round(v * 10) / 10), max: hi.map((v) => Math.round(v * 10) / 10), splats: A.splat.resource.gsplatData?.numSplats };
  },
  resolucion: () => { const b = app.graphicsDevice.backBufferSize; return [b.x, b.y]; },
  calidad: () => ({ nivel: adaptar.nivel, ratio: ratio(), fps: Math.round(fpsSuave), dentro: adaptar.dentro, muestras: post?.rendering?.samples }),
  calidadDentro,
  zonas: () => zonas && { cargadas: zonas.cargadas(), total: zonas.Z.zonas.length, radio: zonas.radio }, // (la calidad adaptable, para tools/lento.py)
  // (para la entrada, src/desde388.js: dibujar con o sin multimuestreo, para dejar preparado lo de los dos y que la
  // calidad adaptable pueda cambiarlo luego sin tirón)
  muestras: (sin) => { if (post) post.rendering.samples = sin ? 1 : parseInt(q.get('msaa') || '4', 10); },
  muestrasNormales: () => { if (post) post.rendering.samples = adaptar.nivel >= 1 ? 1 : parseInt(q.get('msaa') || '4', 10); },
};
// la memoria de la geometría: PlayCanvas guarda en JavaScript una copia de cada malla además de la que sube a la GPU
// (para volver a subirla si la GPU la pierde): 173 MB que, con la memoria gráfica, cerraban la página en un móvil. Las
// mallas quietas de la calle, los coches y los objetos se quedan solo en la GPU (si la GPU se pierde, la página se
// vuelve a cargar); las que se mueven (cables, ropa, toldos) guardan la suya. ?soltar=0 no las suelta
// los vértices de la geometría quieta, más pequeños en la GPU: las normales y las tangentes, en 8 bits con signo
// normalizados (como en casi todos los juegos: el error, menos de medio grado) en vez de 32 por componente; la posición y
// las UV se quedan en 32. Unos 60 MB menos de memoria gráfica: la escena ampliada a San Gregorio y El Palomar pasaba de
// los ~420 MB que aguanta un móvil. Se hace antes de soltar la copia de JavaScript (es de donde se leen). ?compactar=0
// lo deja como viene del glb. El tono de cal por vértice de las paredes (COLOR_0, ver calle_gris.py: tinte), en 8 bits
// sin signo normalizados (llega en 32 o en 16 por componente; un tono por cara no pide más)
// (la cuenta, aparte y sin nada de fuera, para poder hacerla también en un hilo: compactarEnHilo, abajo)
function nucleoCompactar(st, out, n, tareas) {
  const f = new Float32Array(st), u = new Uint32Array(st), u16 = new Uint16Array(st), du = new Uint32Array(out), d8 = new Int8Array(out), du8 = new Uint8Array(out);
  for (const t of tareas) {
    if (t.k === 't') {
      for (let i = 0, a = t.so, a2 = t.o2, b = t.dOff; i < n; i++, a += t.ss, a2 += t.s2, b += t.dStr) {
        for (let c = 0; c < 4; c++) { const v = c < t.nc ? (t.h ? u16[a2 + c] / 65535 : f[a + c]) : 1; du8[b + c] = Math.max(0, Math.min(255, Math.round(v * 255))); }
      }
    } else if (t.k === 'o') {
      for (let i = 0, a = t.so, b = t.dOff; i < n; i++, a += t.ss, b += t.dStr) {
        for (let c = 0; c < 4; c++) d8[b + c] = c < t.nc ? Math.max(-127, Math.min(127, Math.round(f[a + c] * 127))) : 0;
      }
    } else {
      for (let i = 0, a = t.so, b = t.dO; i < n; i++, a += t.ss, b += t.dS) for (let c = 0; c < t.w; c++) du[b + c] = u[a + c];
    }
  }
}
function planCompactar(m) {
  const vb = m.vertexBuffer, st = vb?.storage, els = vb?.format.elements;
  if (!(st instanceof ArrayBuffer) || !els.some((e) => (e.name === SEMANTIC_NORMAL || e.name === SEMANTIC_TANGENT) && e.dataType === TYPE_FLOAT32)) return null;
  if (els.some((e) => e.offset % 4 || e.stride % 4 || e.asInt)) return null; // (todo en palabras de 4 bytes, o no se toca)
  const ocho = (e) => (e.name === SEMANTIC_NORMAL || e.name === SEMANTIC_TANGENT) && e.dataType === TYPE_FLOAT32;
  const tono = (e) => e.name === SEMANTIC_COLOR && (e.dataType === TYPE_FLOAT32 || e.dataType === TYPE_UINT16);
  const fmt = new VertexFormat(app.graphicsDevice, els.map((e) => ocho(e)
    ? { semantic: e.name, components: 4, type: TYPE_INT8, normalize: true }
    : tono(e) ? { semantic: e.name, components: 4, type: TYPE_UINT8, normalize: true }
    : { semantic: e.name, components: e.numComponents, type: e.dataType, normalize: e.normalize }));
  const tareas = fmt.elements.map((d, k) => {
    const s_ = els[k];
    return { k: tono(s_) ? 't' : ocho(s_) ? 'o' : 'c', so: s_.offset / 4, ss: s_.stride / 4, nc: s_.numComponents, h: s_.dataType === TYPE_UINT16, o2: s_.offset / 2, s2: s_.stride / 2,
      dOff: d.offset, dStr: d.stride, w: s_.size / 4, dO: d.offset / 4, dS: d.stride / 4 };
  });
  return { vb, st, fmt, n: vb.numVertices, tareas, tam: fmt.size * vb.numVertices, antes: st.byteLength };
}
function ponerCompactada(m, plan, out) {
  m.vertexBuffer = new VertexBuffer(app.graphicsDevice, plan.fmt, plan.n, { data: out });
  plan.vb.storage = { byteLength: plan.antes }; plan.vb.destroy(); // (con su tamaño: destroy() lo mira, y en el hilo se pudo quedar sin él)
  return plan.antes - out.byteLength;
}
function compactar(m) {
  const plan = planCompactar(m); if (!plan) return 0;
  const out = new ArrayBuffer(plan.tam); nucleoCompactar(plan.st, out, plan.n, plan.tareas);
  return ponerCompactada(m, plan, out);
}
// lo mismo en uno o dos hilos aparte (15-11-2026; el usuario: «algunos usuarios me reportan que al entrar, algunas
// ocasiones entra con tirones»). Medido con el procesador cuatro veces más lento (un portátil o un móvil normal): en el
// vuelo de la entrada y los primeros segundos de juego, cada zona que llegaba se compactaba de una vez en el hilo de la
// página, de 180 a 300 ms sin pintar (compactar: 723 ms de los 13,5 s medidos). Ahora la cuenta va en un hilo, la malla
// pasa allí sin copiarla y vuelve compactada; la página solo sube el resultado a la gráfica. Si no hay hilos (o no
// contestan), se hace aquí como antes. ?hilos=0, siempre aquí
let hilosCompactar = null;
const pendientesCompactar = new Map(); let idCompactar = 0;
function hilosListos() {
  if (hilosCompactar) return hilosCompactar;
  hilosCompactar = (async () => {
    if (q.get('hilos') === '0' || typeof Worker === 'undefined') return [];
    try {
      const fuente = nucleoCompactar.toString() + '\nonmessage = (e) => { const { id, st, n, tareas, tam } = e.data; const out = new ArrayBuffer(tam); if (st) nucleoCompactar(st, out, n, tareas); postMessage({ id, out }, [out]); };';
      const url = URL.createObjectURL(new Blob([fuente], { type: 'text/javascript' }));
      const k = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
      const H = Array.from({ length: k }, () => { const w = new Worker(url); w.onmessage = (e) => { const r = pendientesCompactar.get(e.data.id); pendientesCompactar.delete(e.data.id); r?.(e.data.out); }; return w; });
      // (antes de mandarles nada de verdad, que contesten: una página que no deja hilos de «blob:» los crea sin quejarse y
      // luego no los arranca; la malla que se les mandara se perdería)
      const ok = await Promise.all(H.map((w) => new Promise((r) => { const id = ++idCompactar; pendientesCompactar.set(id, () => r(true)); w.postMessage({ id, st: null, n: 0, tareas: [], tam: 4 }); setTimeout(() => r(false), 3000); })));
      if (ok.every(Boolean)) return H;
      H.forEach((w) => w.terminate()); return [];
    } catch (e) { return []; }
  })();
  return hilosCompactar;
}
hilosListos();
async function compactarEnHilo(m) {
  const H = await hilosListos();
  const plan = planCompactar(m); if (!plan) return 0;
  if (!H.length) { const out = new ArrayBuffer(plan.tam); nucleoCompactar(plan.st, out, plan.n, plan.tareas); return ponerCompactada(m, plan, out); }
  const id = ++idCompactar;
  const out = await new Promise((r) => { pendientesCompactar.set(id, r); H[id % H.length].postMessage({ id, st: plan.st, n: plan.n, tareas: plan.tareas, tam: plan.tam }, [plan.st]); });
  return ponerCompactada(m, plan, out);
}
if (q.get('compactar') !== '0') {
  const vistas = new Set(); let ahorro = 0;
  for (const r of raiz.findComponents('render')) for (const mi of r.meshInstances) if (!vistas.has(mi.mesh)) { vistas.add(mi.mesh); ahorro += compactar(mi.mesh); }
  tiempos.compactado_mb = Math.round(ahorro / 1048576);
}
// la copia de JavaScript de cada textura, soltada en cuanto está en la gráfica (14-11-2026, docs/pueblo_vivo.md: con el
// pueblo entero lleno, el móvil pasaba de 250 MB de JavaScript, y 119 eran estas copias). El motor solo las vuelve a leer
// si se pierde la gráfica, y entonces la página se recarga (arriba, «devicelost»). Lo que compara texturas para no tenerlas
// dos veces (el interior de la iglesia) usa la huella que se guarda antes de soltarla. ?soltartex=0 las deja
const huellaTex = (x) => {
  const b = x._levels?.[0]; if (!(b instanceof Uint8Array)) return x._huella || null;
  let h = 2166136261; for (let i = 0; i < b.length; i += 997) { h ^= b[i]; h = Math.imul(h, 16777619); }
  return `${x.width}|${x.height}|${x.format}|${b.length}|${h >>> 0}`;
};
if (q.get('soltartex') !== '0') {
  // (solo las de los modelos cargados: las del motor que se reescriben cada fotograma —la de los huesos de cada cuerpo,
  // por ejemplo— se quedaban congeladas y la chica y la gente dejaban de moverse)
  const deModelos = () => {
    const ts = new Set();
    for (const a of app.assets.list()) {
      if (a.type === 'container') for (const t of a.resource?.textures || []) { if (t.resource) ts.add(t.resource); }
      else if (a.type === 'texture' && a.resource) ts.add(a.resource);
    }
    return ts;
  };
  const soltarTex = () => {
    let liberado = 0;
    for (const t of deModelos()) {
      if (t._needsUpload || t._needsMipmapsUpload || !t._levels || t._cubemap || t._soltada) continue;
      if (!t._levels.some((l) => ArrayBuffer.isView(l))) continue;
      t._huella = huellaTex(t);
      for (const l of t._levels) if (ArrayBuffer.isView(l)) liberado += l.byteLength;
      t._levels = t._levels.map(() => null); t._soltada = true;
    }
    tiempos.texturas_soltadas_mb = (tiempos.texturas_soltadas_mb || 0) + Math.round(liberado / 1048576);
  };
  trasListo.then(() => { soltarTex(); setInterval(soltarTex, 4000); });
}
if (q.get('soltar') !== '0') {
  const quietas = new Set();
  for (const r of raiz.findComponents('render')) for (const mi of r.meshInstances) quietas.add(mi.mesh);
  let liberado = 0;
  for (const m of quietas) {
    if (m.vertexBuffer?.storage) { liberado += m.vertexBuffer.storage.byteLength; m.vertexBuffer.storage = null; }
    for (const ib of m.indexBuffer || []) if (ib?.storage) { liberado += ib.storage.byteLength; ib.storage = null; }
  }
  tiempos.liberado_mb = Math.round(liberado / 1048576);
}
// ---- el interior de la iglesia (docs/iglesia.md), en su .glb aparte: se carga al acercarse a menos de ?dentro= m (120) de
// la iglesia y se suelta al irse a más de 260; con él siempre cargado, el móvil pasaba del tope de memoria al empezar, lejos
// de allí. Sus mallas, como las demás (normales en 8 bits, sin copia en JavaScript), y su suciedad en el alfa de su luz
// horneada (tools/blender/iglesia_suciedad.py). ?dentro=0 no lo carga
if (escena.dentro && q.get('dentro') !== '0') {
  const D = escena.dentro, radio = parseFloat(q.get('dentro') || D.radio), suelta = Math.max(D.suelta, radio + 60);
  let ent = null, asset = null, cargando = false, n = 0, llamas = [];
  // (las llamas tiemblan: tres ritmos, uno por material, con dos ondas y un poco de azar; el resplandor, con ellas)
  const temblor = [0, 0, 0];
  app.on('update', (dt) => {
    if (!ent || !llamas.length || q.get('temblor') === '0') return;
    const t = performance.now() / 1000;
    for (let k = 0; k < 3; k++) temblor[k] = 0.82 * temblor[k] + 0.18 * (Math.sin(t * (9.1 + k * 1.7) + k * 2.1) * 0.6 + Math.sin(t * (21.3 + k * 3.1) + k) * 0.4 + (Math.random() - 0.5) * 0.9);
    for (const L of llamas) { L.mt.emissiveIntensity = L.base * (1 + (L.halo ? 0.22 : 0.16) * temblor[L.k]); L.mt.update(); }
  });
  const montar = async (cargado) => {
    // (se alejó mientras bajaba: lo bajado se suelta, que el motor avisa de la carga aunque el asset ya se haya quitado, y se
    // quedaban 4,5 MB en la memoria —sobre todo al subirse a un coche cerca de la iglesia—; 15-11-2026, la revisión del juego)
    if (!cargando || !asset || (cargado && cargado !== asset)) { try { if (cargado && cargado !== asset) cargado.unload(); } catch (e) { /* ignore */ } return; }
    const este = asset;
    asset.resource.textures.forEach((t) => { if (t.resource) t.resource.anisotropy = 8; });
    // (las texturas que ya trae la iglesia de fuera —la sillería, su relieve, la madera de las puertas—, las mismas: el
    // interior usa aquellas y suelta las suyas; si no, en el móvil pasaba del tope de memoria de JavaScript)
    const lv = (x) => { const L = x?._levels?.[0]; return L instanceof Uint8Array ? L : null; };
    // (las de fuera ya soltaron su copia: se comparan por la huella, que lleva el tamaño, el formato y un muestreo de los bytes)
    const iguales = (a_, b_) => { const x = lv(a_), y = lv(b_); if (x && !y) return !!b_._huella && huellaTex(a_) === b_._huella; if (!x || !y || x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
    const propias = new Set(asset.resource.textures.map((t) => t.resource).filter(Boolean)), cambio = new Map();
    const otras = [...app.graphicsDevice.textures].filter((t) => !propias.has(t) && (lv(t) || t._huella));
    for (const t of propias) { const o = otras.find((u) => u.width === t.width && u.height === t.height && u.format === t.format && iguales(t, u)); if (o) cambio.set(t, o); }
    asset.resource.materials.forEach(({ resource: mt }) => {
      if (!mt) return;
      for (const k of ['diffuseMap', 'normalMap', 'aoMap', 'emissiveMap', 'opacityMap', 'glossMap', 'metalnessMap']) if (mt[k] && cambio.has(mt[k])) mt[k] = cambio.get(mt[k]);
      if (q.get('refraccion') !== '1' && mt.refraction > 0) mt.refraction = 0;
      if (q.get('suciedad') !== '0' && mt.aoMap && /_iglesia_interior$/.test(mt.name)) { mt.diffuseDetailMap = mt.aoMap; mt.diffuseDetailMapUv = mt.aoMapUv; mt.diffuseDetailMapChannel = 'aaa'; mt.diffuseDetailMode = 'mul'; }
      mt.update();
    });
    // (más detalle dentro, 14-11-2026: el resplandor de las velas se suma a lo de detrás, sin escribir profundidad; los
    // calcos del deterioro, mezclados y sin escribirla; ni ellos, ni las llamas, ni el encaje dan sombra. Las llamas y su
    // resplandor van en tres materiales cada uno, que tiemblan por separado: abajo)
    llamas = [];
    asset.resource.materials.forEach(({ resource: mt }) => {
      if (!mt) return;
      const r = /^iglesia_(llama|resplandor)(?:_([abc]))?_iglesia_interior$/.exec(mt.name);
      if (/^iglesia_resplandor_/.test(mt.name)) { mt.blendType = BLEND_ADDITIVEALPHA; mt.depthWrite = false; mt.cull = CULLFACE_NONE; mt.update(); }
      if (/^iglesia_calcos_/.test(mt.name)) { mt.depthWrite = false; mt.update(); }
      if (r) llamas.push({ mt, k: { a: 0, b: 1, c: 2 }[r[2] || 'a'], halo: r[1] === 'resplandor', base: mt.emissiveIntensity });
    });
    const mod = asset.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true }), vistas = new Set(), trabajos = [];
    for (const r of mod.findComponents('render')) for (const mi of r.meshInstances) {
      if (sinSombra(mi.material?.name) || /^iglesia_(llama|resplandor|calcos|encaje)/.test(mi.material?.name || '')) mi.castShadow = false;
      if (vistas.has(mi.mesh)) continue; vistas.add(mi.mesh);
      // (sin la copia de JavaScript, pero con su tamaño: al soltar el interior, el motor lo lee al destruirlas, y con null
      // daba un error; desde que se suelta al conducir, src/conducir.js, pasa a menudo)
      const m_ = mi.mesh, soltar_ = () => { if (q.get('soltar') !== '0') { const falsa = (x) => { if (x?.storage) x.storage = { byteLength: x.storage.byteLength }; }; falsa(m_.vertexBuffer); (m_.indexBuffer || []).forEach(falsa); } };
      // (compactada en un hilo: era un tirón al acercarse a la iglesia)
      trabajos.push(q.get('compactar') !== '0' ? compactarEnHilo(m_).then(soltar_) : Promise.resolve(soltar_()));
    }
    for (const t of cambio.keys()) t.destroy();
    await Promise.all(trabajos);
    if (asset !== este || !cargando) { mod.destroy(); return; } // (se alejó mientras se compactaba)
    raiz.addChild(mod); ent = mod; cargando = false;
  };
  app.on('update', () => {
    if (n++ % 15) return;
    // (conduciendo, como si estuviera lejos: en coche no se entra en la iglesia, y su interior se suelta para dejar sitio
    // en la memoria al coche: src/conducir.js)
    const p = camara.getPosition(), d = window.foto?.conducir?.conduciendo?.() ? Infinity : Math.hypot(p.x - D.centro[0], p.z - D.centro[1]);
    if (!ent && !cargando && d < radio) {
      cargando = true; asset = new Asset('iglesia_dentro', 'container', { url: glb(D.glb) });
      asset.once('load', montar); asset.once('error', (e) => { console.warn('el interior de la iglesia:', e); cargando = false; });
      app.assets.add(asset); app.assets.load(asset);
    } else if ((ent || cargando) && d > suelta) {
      cargando = false; if (ent) { ent.destroy(); ent = null; }
      if (asset) { app.assets.remove(asset); asset.unload(); asset = null; }
    }
    if (window.foto) window.foto.dentro = ent ? 'cargado' : cargando ? 'cargando' : 'no';
  });
}
// ---- La escena por zonas (docs/zonas.md): las paredes y fachadas de cada celda de 200 m van en su .glb, sin imágenes; se
// cargan las que quedan a menos de RADIO de la cámara (?radio=, 180 m en el móvil y 330 en el resto) y se sueltan las que
// se alejan 80 m más; donde no hay zona cargada se ve la caja lisa de cada casa, con su color (lejos.glb). Las mallas de
// cada zona toman el material del mismo nombre de materiales.glb (con la oclusión horneada y sus imágenes, una vez).
// ?zonas=0 las carga todas
let zonas = null;
if (ZC) {
  const { radio, suelta, todas, dist, hasta, traer, ya } = ZC, Z = await ZC.Zp;
  const porNombre = new Map(A['parte' + iZ('/materiales.glb')].resource.materials.map((m) => [m.resource?.name, m.resource]));
  const lejos = new Map();
  instancias.get(A['parte' + iZ('/lejos.glb')])?.findComponents('render').forEach((r) => lejos.set(r.entity.name, r));
  // (las cajas de lejos, con los materiales de materiales.glb: lejos.glb ya no trae imágenes, eran las mismas; cargar
  // antes, 13-11-2026. Con uno de antes, que no las tiene allí, se queda con las suyas)
  for (const r of lejos.values()) for (const mi of r.meshInstances) { const m = porNombre.get(mi.material?.name); if (m) mi.material = m; }
  const estado = new Map(); // (clave → 'cargando' o {e, asset})
  const falsa = (b) => { if (b?.storage) b.storage = { byteLength: b.storage.byteLength }; }; // (sin la copia de JavaScript; destroy() aún mira su tamaño)
  const cargar = async (z) => {
    estado.set(z.clave, 'cargando');
    try {
      const pedida = ya.get(z.clave); ya.delete(z.clave); // (las de la salida, pedidas y leídas mientras llegaba lo demás)
      const asset = await (pedida || traer(z));
      const e = asset.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
      let sin = 0; const trabajos = [], vistas = new Set();
      for (const r of e.findComponents('render')) for (const mi of r.meshInstances) {
        const m = porNombre.get(mi.material?.name); if (m) mi.material = m; else sin++;
        if (sinSombra(mi.material?.name)) mi.castShadow = false;
        if (vistas.has(mi.mesh)) continue; vistas.add(mi.mesh);
        // (compactada en un hilo aparte, y la zona entra en la escena cuando están todas: ver compactarEnHilo)
        const m_ = mi.mesh, soltar_ = () => { if (q.get('soltar') !== '0') { falsa(m_.vertexBuffer); (m_.indexBuffer || []).forEach(falsa); } };
        trabajos.push(q.get('compactar') !== '0' ? compactarEnHilo(m_).then(soltar_) : Promise.resolve(soltar_()));
      }
      await Promise.all(trabajos);
      if (sin) console.warn(`zona ${z.clave}: ${sin} mallas sin su material en materiales.glb`);
      raiz.addChild(e);
      estado.set(z.clave, { e, asset });
      const l = lejos.get(z.lejos); if (l) l.enabled = false;
    } catch (err) { console.warn('zona', z.clave, err); estado.delete(z.clave); }
  };
  const soltarZona = (z) => {
    const s = estado.get(z.clave); if (!s || s === 'cargando') return;
    s.e.destroy(); s.asset.unload(); app.assets.remove(s.asset); estado.delete(z.clave);
    const l = lejos.get(z.lejos); if (l) l.enabled = true;
  };
  let ocupado = false, cuenta = 0;
  const repasar = async (p, inicial) => {
    if (ocupado) return; ocupado = true;
    try {
      const r = hasta(Z, p, inicial);
      if (!todas) for (const z of Z.zonas) if (dist(z, p) > (r < radio ? r + 30 : suelta)) soltarZona(z);
      const faltan = Z.zonas.filter((z) => !estado.has(z.clave) && (todas || dist(z, p) < r)).sort((a, b) => dist(a, p) - dist(b, p));
      if (inicial) await Promise.all(faltan.map(cargar)); else if (faltan.length) await cargar(faltan[0]); // (de una en una al andar: sin tirones)
    } finally { ocupado = false; }
  };
  await repasar(ZC.inicio, true);
  for (const t of ya.values()) t.then((a) => { a.unload(); app.assets.remove(a); }).catch(() => {}); // (si sobrara alguna pedida, fuera)
  ya.clear();
  app.on('update', () => { if ((cuenta++ & 31) === 0) repasar(camara.getPosition(), false); });
  // (cargarEn: las de alrededor de un sitio, a la vez, como al empezar; para ir de golpe a otro sitio: foto.irA)
  zonas = { estado, Z, radio, cargadas: () => [...estado.keys()], cargarEn: async (p) => { while (ocupado) await new Promise((r) => setTimeout(r, 50)); await repasar(p, true); } };
  tiempos.zonas = estado.size;
}
for (const u of Object.values(mem)) if (u.startsWith('blob:')) URL.revokeObjectURL(u); // (los archivos bajados, ya leídos)
document.getElementById('carga').hidden = true;
marca('listo');
app.once('frameend', () => marca('primer_fotograma'));

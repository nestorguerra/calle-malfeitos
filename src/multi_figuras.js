// Las figuras de los demás jugadores (docs/multijugador.md, fase 2): cada uno, con su personaje.
// - Quien juega con la chica de serie se ve con ella. Quien juega con su personaje del editor («Crea tu personaje»,
//   src/personaje.js) manda cómo es una vez al entrar («pj»: el fenotipo, los deslizadores que ha movido, la piel, los
//   ojos y la ropa; menos de 2 KB) y aquí se hornea igual que el propio, con sus animaciones.
// - Hornear cuesta: unos 20 MB de gráfica por personaje y medio segundo de trabajo (y bajar su cuerpo la primera vez). En el
//   ordenador, los ?multipropios=3 más cercanos a menos de 60 m, de uno en uno; los demás, y en el móvil todos, con la
//   chica de serie. Mientras se hornea, se le ve con la chica.
// - Si aquí se juega con el personaje propio, la chica de serie y sus animaciones se bajan al hacer falta (3 MB), y al
//   revés: las animaciones del personaje del editor (0,5 MB).
import { Asset, BLEND_NONE, Entity } from 'playcanvas';
import { brazoSaludo } from './gestos.js';
import { montarPersonaje } from './personaje.js';

// las animaciones, por número (a): las cuatro de src/main.js y las de las acciones (src/acciones.js, «chica_<f>»)
// (Conduciendo y Copiloto, al final: van con el clip del modelo de coche en el que se va —f.sentar—, y no se mandan)
export const ESTADOS = ['Quieto', 'Andar', 'Correr', 'Saltar', 'Sentarse', 'Sentada', 'SentadaIglesia', 'Levantarse', 'Bailar', 'Arrodillada', 'Tocar', 'Conduciendo', 'Copiloto'];
const DE_ACCIONES = { Sentarse: ['chica_sentarse', false], Sentada: ['chica_sentada', true], SentadaIglesia: ['chica_sentada_iglesia', true], Levantarse: ['chica_levantarse', false], Bailar: ['chica_bailar', true], Arrodillada: ['chica_arrodillada', true], Tocar: ['chica_tocar', false] };
// (a qué paso va cada estado: los de la chica, src/main.js; los del personaje del editor, su PASO_MI)
const VEL = { chica: { Correr: 1.35, Saltar: 1.8 }, propio: { Andar: 4 / 3, Correr: 2.6 / 2.137, Saltar: 1.8 } };
const pista = (a) => a?.resource?.animations?.[0]?.resource || null;

// mi personaje, en corto, para mandarlo: sin los deslizadores a cero y con tres decimales
export function personajeCorto(e) {
  if (!e) return null;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const f = {}, d = {};
  for (const [k, v] of Object.entries(e.fenotipo || {})) if (typeof v === 'number') f[k] = r3(v);
  for (const [k, v] of Object.entries(e.deslizadores || {})) if (typeof v === 'number' && Math.abs(v) > 0.0005) d[k] = r3(v);
  const out = { fenotipo: f, deslizadores: d };
  for (const k of ['tono', 'vello']) if (Array.isArray(e[k]) && e[k].length === 3) out[k] = e[k].map(r3);
  if (typeof e.ojos === 'string') out.ojos = e.ojos;
  if (e.ropa) out.ropa = { conjunto: e.ropa.conjunto ?? null, calzado: e.ropa.calzado ?? null, pelo: e.ropa.pelo ?? null };
  return out;
}

export function montarFiguras({ app, q, personaje, clips, mio, movil, glb, carpetaChica = './escenas/chica/' }) {
  const MAX_PROPIOS = movil ? 0 : parseInt(q.get('multipropios') ?? '3', 10);
  let n = 0;
  const cargar = (url) => new Promise((ok) => {
    const a = new Asset('multi_' + (n++), 'container', { url: glb(url) });
    a.once('load', () => ok(a)); a.once('error', (e) => { console.warn('multijugador: ' + url, e); ok(null); });
    app.assets.add(a); app.assets.load(a);
  });
  const juego = (ruta, cuerpo) => Promise.all([cuerpo ? cargar(ruta + cuerpo) : null, ...['quieto', 'andar', 'correr', 'saltar'].map((x) => cargar(ruta + x + '.glb'))])
    .then(([c, Quieto, Andar, Correr, Saltar]) => ({ personaje: c, clips: { Quieto, Andar, Correr, Saltar } }));
  // (las posturas de ir en coche, una por modelo de coche —conduciendo_<tipo>, copiloto_<tipo>: tools/blender/chica_coche.py—,
  // se bajan la primera vez que hacen falta: unos 110 kB cada una)
  const enCoche = {};
  const clipCoche = (nombre) => {
    if (enCoche[nombre] === undefined) { enCoche[nombre] = null; cargar(carpetaChica + nombre + '.glb').then((a) => { enCoche[nombre] = a || false; }); }
    return enCoche[nombre] || null;
  };
  // (lo de cada clase de figura: lo de aquí si es la misma con la que se juega; si no, se baja la primera vez)
  const recursos = { chica: mio ? null : { personaje, clips }, propio: mio ? { clips } : null };
  const pidiendo = {};
  const listos = (tipo) => {
    if (recursos[tipo]) return recursos[tipo];
    pidiendo[tipo] ||= (tipo === 'chica' ? juego('./escenas/chica/', 'chica.glb') : juego('./escenas/personaje/', null)).then((r) => {
      // (el pelo, las cejas y las pestañas de la chica, recortados por alfa y sin mezcla, como en src/main.js)
      for (const { resource: m } of r.personaje?.resource?.materials || []) if (/long01|mechon|^pelo|eyebrow|eyelashes/.test(m.name)) { m.blendType = BLEND_NONE; m.alphaTest = Math.max(m.alphaTest, 0.4); m.depthWrite = true; m.update(); }
      recursos[tipo] = r;
    });
    return null;
  };

  // ---- una figura: su entidad con el grafo de animaciones (los mismos estados para las dos clases)
  function hacer(tipo, r, mi) {
    const raiz = new Entity('otro');
    const cuerpo = mi ? mi.raiz : r.personaje.resource.instantiateRenderEntity({ castShadows: !movil });
    raiz.addChild(cuerpo);
    raiz.addComponent('anim', { activate: true });
    if (mi) raiz.anim.rootBone = mi.modelo; // (sus huesos cuelgan de su modelo, como en src/main.js)
    const vel = VEL[tipo];
    raiz.anim.loadStateGraph({ layers: [{ name: 'base', states: [{ name: 'START' }, ...ESTADOS.map((x) => ({ name: x, speed: vel[x] || 1 })), { name: 'END' }], transitions: [{ from: 'START', to: 'Quieto', time: 0, priority: 0 }] }], parameters: {} });
    const capa = raiz.anim.baseLayer, puestos = new Set();
    const clipDe = (x) => {
      const t = pista(r.clips[x] || (DE_ACCIONES[x] ? app.assets.find(DE_ACCIONES[x][0], 'container') : null));
      return t && mi ? mi.pista(t, { rectas: x === 'Quieto' }) : t;
    };
    for (const x of ['Quieto', 'Andar', 'Correr', 'Saltar']) { const c = clipDe(x); if (c) { capa.assignAnimation(x, c, vel[x] || 1, x !== 'Saltar'); puestos.add(x); } }
    // (la chica de serie: el pelo y la cara, como en src/main.js —los materiales son los mismos—)
    app.root.addChild(raiz);
    const f = {
      tipo, raiz, capa, mi, estado: 'Quieto', saludo: brazoSaludo(raiz),
      animar(x) {
        if (f.estado === x) return;
        if (!puestos.has(x)) { const c = clipDe(x); if (!c) return; capa.assignAnimation(x, c, vel[x] || 1, DE_ACCIONES[x] ? DE_ACCIONES[x][1] : true); puestos.add(x); }
        f.estado = x; capa.transition(x, x === 'Saltar' ? 0.1 : 0.25);
      },
      // sentada en un coche (estado: 'Conduciendo' o 'Copiloto') con la postura de ese modelo (nombre: su clip); false
      // mientras se baja
      sentar(estado, nombre) {
        const a = clipCoche(nombre); if (!a) return false;
        if (f.clipCoche?.[estado] !== nombre) {
          let t = pista(a); if (t && mi) t = mi.pista(t, {}); if (!t) return false;
          capa.assignAnimation(estado, t, 1, true); puestos.add(estado); (f.clipCoche ||= {})[estado] = nombre;
          if (f.estado === estado) f.estado = null; // (otro coche, la misma postura: que entre la nueva)
        }
        f.animar(estado); return true;
      },
      // (encender o apagar la figura: con su melena simulada, que cuelga de la escena)
      ver(si) { if (raiz.enabled !== si) { raiz.enabled = si; mi?.ocultarMelena?.(!si); } },
      destruir() {
        mi?.soltar?.();
        raiz.destroy();
        if (mi) for (const a of mi.activos || []) { try { for (const t of a.resource?.textures || []) t.resource?.destroy?.(); } catch (e) { /* ya suelta */ } app.assets.remove(a); a.unload(); }
      },
    };
    return f;
  }

  // ---- hornear el personaje de alguien (de uno en uno)
  let horneando = false;
  async function hornear(o) {
    horneando = true; const pj = o.pj, clave = JSON.stringify(pj), t0 = performance.now();
    try {
      const [mi] = await Promise.all([montarPersonaje({ app, estado: pj, movil, q, prefijo: 'otro_' + o.id + '_' }), new Promise((ok) => { const mira = () => (listos('propio') ? ok() : setTimeout(mira, 200)); mira(); })]);
      if (o.fuera || JSON.stringify(o.pj) !== clave) { hacer('propio', recursos.propio, mi).destruir(); return; }
      o.fig?.destruir(); o.fig = hacer('propio', recursos.propio, mi); o.figPj = clave; o.figMs = Math.round(performance.now() - t0);
    } catch (e) {
      // (si falla, se vuelve a intentar una vez al medio minuto: una descarga cortada no le deja con la chica para siempre)
      console.warn('multijugador: el personaje de ' + (o.p?.n || o.id), e);
      o.figError = String(e?.message || e).slice(0, 200); o.figFallos = (o.figFallos || 0) + 1;
      if (o.figFallos >= 2) o.figMal = clave; else o.figOtraVez = performance.now() + 30000;
    }
    finally { horneando = false; }
  }

  return {
    // la figura de alguien ahora (null si aún no hay ninguna lista); propio: si le toca su personaje (cerca y entre los primeros)
    de(o, propio) {
      const quiere = propio && o.pj && MAX_PROPIOS > 0 ? JSON.stringify(o.pj) : null;
      if (o.fig?.tipo === 'propio' && o.figPj !== quiere) { o.fig.destruir(); o.fig = null; o.figPj = null; }
      if (!o.fig) { const r = listos('chica'); if (r?.personaje) o.fig = hacer('chica', r, null); }
      if (quiere && o.figPj !== quiere && o.figMal !== quiere && !horneando && performance.now() > (o.figOtraVez || 0)) { listos('propio'); hornear(o); }
      return o.fig;
    },
    quitar(o) { o.fuera = true; o.fig?.destruir(); o.fig = null; },
    MAX_PROPIOS,
  };
}

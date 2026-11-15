// Lo que puede hacer la chica (docs/pueblo_vivo.md, tareas 12 a 14; el usuario, 14-11-2026: «que yo pueda
// interaccionar con algunos personajes, que yo pueda sentarme en los bancos o en las sillas, que el personaje pueda
// realizar más cosas»):
// - Sentarse en un banco de la calle o de una plaza, en una silla de las que hay a la puerta de las casas o en un banco
//   de la iglesia: se acerca, se sienta con su animación y se queda sentada hasta que se pulsa otra vez o se echa a
//   andar, y entonces se levanta.
// - Hablar con un vecino: se para, la mira y le dice algo que tiene que ver con la hora, el sitio y quién es (un mayor,
//   un adulto, un joven, un niño; en la iglesia, en voz baja). Se puede seguir hablando o despedirse. En el ordenador,
//   además, se le puede escribir lo que se quiera y contesta con la IA (src/ia.js): con su nombre, lo que estaba haciendo,
//   y decide qué hace (acompañarla, irse, sentarse, saludar).
// - Saludar con la mano (Q): quien la ve cerca le devuelve el saludo.
// - Bailar (B), hasta que se echa a andar.
// - En la iglesia: arrodillarse (dentro, E sin nada cerca) y encender una vela en el lampadario del Sagrado Corazón.
// Con el teclado, E hace lo que toque (el botón de la derecha dice qué); en el móvil, los botones. Si hay un coche al
// lado, E es subir al coche (src/conducir.js). Las animaciones nuevas: tools/blender/chica_gestos.py.
import { Asset, Color, Entity, StandardMaterial, Vec3 } from 'playcanvas';
import { brazoSaludo } from './gestos.js';
import { claveGPT, guardarClaveGPT, montarIA, persona } from './ia.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const elegir = (l) => l[Math.floor(Math.random() * l.length)];

// lo que dice cada uno: según quién es, la hora y dónde está (frases genéricas, hechas aquí)
function frases({ tipo, sexo, h, dia, sitio, misa, jugando, sentado }) {
  const saludo = h < 6 ? 'Buenas noches' : h < 13.5 ? 'Buenos días' : h < 20.5 ? 'Buenas tardes' : 'Buenas noches';
  const hija = tipo === 'mayor' ? ', hija' : '';
  if (sitio === 'iglesia') return [
    `${saludo}${hija}… (en voz baja) ${misa.durante ? 'Que estamos en misa.' : 'Aquí se está en paz, ¿verdad?'}`,
    'Esta es Santa María. La torre la acabaron en 1700, y la portada de los pies es de casi cien años después.',
    misa.antes ? 'Ahora empieza la misa. Si quieres, siéntate en un banco.' : (tipo === 'nino' ? 'Mira el retablo, todo dorado. ¡Tiene un montón de santos!' : `Mira el retablo, todo dorado. De ${sexo ? 'pequeño' : 'pequeña'} me pasaba la misa contando los santos.`),   // (cada uno según quién es: lo decían también los hombres y los niños)
    'Si quieres encender una vela, el lampadario está ahí, delante del Sagrado Corazón.',
  ];
  if (tipo === 'nino') return jugando ? ['¡Hola! ¿Juegas? ¡Te toca pillar!', '¡No me pillas, no me pillas!', 'Mi madre dice que a las nueve a casa, que mañana hay cole.', '¡Adiós! ¡Que me pillan!']
    : [`¡Hola! ${h < 14.5 && dia > 0 && dia < 6 ? 'Vengo del cole.' : 'Voy a la plaza a jugar.'}`, '¿Tú no eres de aquí, verdad? Se nota.', 'En la plaza de España juegan todos los niños por la tarde.', '¡Adiós!'];
  if (tipo === 'mayor') return [
    `¡${saludo}${hija}! ¿Tú de quién eres? Que no te tengo vista.`,
    sentado ? (sexo ? 'Aquí, sentado al ' + (h < 16 ? 'sol' : 'fresco') + ', que en casa se aburre uno.' : 'Aquí, sentada al ' + (h < 16 ? 'sol' : 'fresco') + ', que en casa se queda una muy sola.') : (h < 13 ? 'Voy a por el pan, que el de pueblo se acaba enseguida.' : 'Voy dando un paseíto, que el médico dice que hay que andar.'),
    misa.antes ? 'Ahora hay misa en Santa María. ¿No vienes?' : 'Antes estas calles estaban llenas de críos jugando. Ahora, con la tele y los teléfonos…',
    `Hoy es ${DIAS[dia]}${dia === 0 ? ', día de misa y de ver a la familia' : dia === 6 ? ', que vienen los nietos' : ''}.`,
    'Bueno, que te vaya bien, y saluda a los tuyos.',
  ];
  if (tipo === 'joven') return [
    `¡Ey! ${h > 20 ? '¿Qué haces por aquí a estas horas?' : '¿Qué pasa?'}`,
    h > 19 || h < 3 ? 'Luego estamos todos en la plaza, por si te animas.' : 'Aquí no hay mucho que hacer, pero se está a gusto.',
    'Si vienes en fiestas, esto se llena. Ahí sí que hay ambiente.',
    '¡Venga, nos vemos!',
  ];
  return [
    `${saludo}. ${sitio === 'plaza' ? '¿Qué tal? Bonita la plaza, ¿eh?' : '¿Buscas algo?'}`,
    h < 14 && dia > 0 && dia < 6 ? 'Voy con prisa, que me cierran a las dos y aún tengo que hacer la compra.' : h > 21 ? 'Ya es tarde. Mañana madrugo.' : 'Con este tiempo da gusto salir a dar una vuelta.',
    '¿Eres de fuera? Pues bienvenida a Guareña. Tienes que ver la iglesia de Santa María, aquí al lado.',
    sexo ? 'Venga, que tengas buen día.' : 'Venga, guapa, que tengas buen día.',
  ];
}

export async function montarAcciones({ app, q, ctrl, muneco, tpc, carpeta, glb, pista, movil, vida, gente, iglesia, conducir, reloj, cajas }) {
  if (q.get('acciones') === '0') return null;
  const sitiosIglesia = iglesia ? await fetch(iglesia).then((r) => r.json()).catch(() => null) : null;
  // ---- las animaciones nuevas, a su capa (como estados sueltos, sin transiciones: se entra y se sale a mano)
  const capa = muneco.anim.baseLayer;
  const CLIPS = { Sentarse: ['sentarse', false], Sentada: ['sentada', true], SentadaIglesia: ['sentada_iglesia', true], Levantarse: ['levantarse', false], Bailar: ['bailar', true], Arrodillada: ['arrodillada', true], Tocar: ['tocar', false] };
  await Promise.all(Object.entries(CLIPS).map(([estado, [f, bucle]]) => new Promise((ok) => {
    const a = new Asset('chica_' + f, 'container', { url: glb(carpeta + f + '.glb') });
    a.once('load', () => { try { capa.assignAnimation(estado, pista(a), 1, bucle); } catch (e) { console.warn('acciones:', f, e); } ok(); });
    a.once('error', () => ok()); app.assets.add(a); app.assets.load(a);
  })));
  const saludoChica = brazoSaludo(muneco);
  const est = { modo: 'pie', asiento: null, t: 0, habla: null, linea: 0, lineas: null, velas: [], antes: null };
  const base = { speed: tpc.speedGround, jump: tpc.jumpForce };

  // ---- la interfaz: el botón de la acción (como «Subir al coche») y, en el móvil, saludar y bailar; el cuadro de la charla
  const css = document.createElement('style');
  css.textContent = `
  .accion-boton { position: fixed; right: 14px; padding: 11px 18px; background: var(--velo, rgba(7, 10, 20, .62)); color: var(--cal, #eef0ec); border: 1px solid var(--linea, rgba(186, 198, 255, .16));
    border-radius: 999px; font: 500 12px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .09em; text-transform: uppercase; cursor: pointer; z-index: 5;
    touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
  .accion-boton:hover, .accion-boton:focus-visible { background: rgba(7, 10, 20, .82); border-color: rgba(255, 255, 255, .4); outline: none; }
  .accion-boton[hidden] { display: none; }
  #accion-principal { bottom: 30%; background: var(--sodio, #ffa94d); border-color: var(--sodio, #ffa94d); color: var(--tinta, #0c1122); }
  #accion-principal:hover, #accion-principal:focus-visible { background: var(--sodio-2, #ffcf91); border-color: var(--sodio-2, #ffcf91); }
  #accion-segunda { bottom: calc(30% + 56px); }
  #accion-saludar { bottom: calc(30% - 56px); } #accion-bailar { bottom: calc(30% - 112px); }
  #charla { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(64px + env(safe-area-inset-bottom, 0px)); width: min(560px, calc(100% - 32px)); box-sizing: border-box;
    padding: 16px 18px 14px; background: var(--velo, rgba(7, 10, 20, .62)); border: 1px solid var(--linea, rgba(186, 198, 255, .16)); border-radius: 18px; color: var(--cal, #eef0ec); z-index: 6;
    -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
  #charla[hidden] { display: none; }
  #charla .quien { font: 500 11px/1.3 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .12em; text-transform: uppercase; color: var(--sodio, #ffa94d); margin-bottom: 6px; }
  #charla .dice { font: 400 17px/1.45 var(--f-display, system-ui, sans-serif); margin: 0 0 12px; }
  #charla .botones { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  #charla button { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--linea, rgba(186, 198, 255, .16)); background: transparent; color: var(--cal, #eef0ec);
    font: 500 11px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .09em; text-transform: uppercase; cursor: pointer; touch-action: manipulation; }
  #charla button.sigue { background: var(--sodio, #ffa94d); border-color: var(--sodio, #ffa94d); color: var(--tinta, #0c1122); }
  #charla .tu { font: 400 13px/1.4 var(--f-mono, ui-monospace, Menlo, monospace); color: var(--niebla, #9ba4c8); margin: 0 0 6px; }
  #charla .tu:empty, #charla .estado-ia:empty { display: none; }
  #charla .escribe { display: flex; gap: 8px; margin: 0 0 10px; }
  #charla .escribe[hidden] { display: none; }
  #charla .escribe input { flex: 1; min-width: 0; padding: 9px 14px; border-radius: 999px; border: 1px solid var(--linea, rgba(186, 198, 255, .16)); background: rgba(255, 255, 255, .06);
    color: var(--cal, #eef0ec); font: 400 15px/1.3 var(--f-display, system-ui, sans-serif); outline: none; }
  #charla .escribe input:focus { border-color: var(--sodio, #ffa94d); }
  #charla .estado-ia { font: 500 11px/1.4 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .06em; color: var(--niebla, #9ba4c8); margin: 0 0 10px; }
  #charla .clave { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px; }
  #charla .clave[hidden] { display: none; }
  #charla .clave input { flex: 1; min-width: 0; padding: 9px 14px; border-radius: 999px; border: 1px solid var(--linea, rgba(186, 198, 255, .16)); background: rgba(255, 255, 255, .06); color: var(--cal, #eef0ec); font: 400 14px/1.3 var(--f-mono, ui-monospace, Menlo, monospace); outline: none; }
  #charla .clave p { flex-basis: 100%; margin: 0; font: 400 11px/1.4 var(--f-mono, ui-monospace, Menlo, monospace); color: var(--niebla, #9ba4c8); }
  #charla button.usar-gpt { margin-right: auto; border-color: transparent; color: var(--niebla, #9ba4c8); padding-left: 4px; }
  @media (pointer: coarse) { .accion-boton { padding: 15px 22px; font-size: 14px; } #charla button { padding: 12px 18px; font-size: 13px; } }
  @media (max-width: 760px) { #charla { bottom: calc(110px + env(safe-area-inset-bottom, 0px)); } #charla .dice { font-size: 15px; } }`;
  document.head.appendChild(css);
  const boton = (id, texto) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'accion-boton'; b.textContent = texto; b.hidden = true; document.body.appendChild(b); return b; };
  const bPrincipal = boton('accion-principal', ''), bSegunda = boton('accion-segunda', '');
  const bSaludar = boton('accion-saludar', 'Saludar'), bBailar = boton('accion-bailar', 'Bailar');
  const charla = document.createElement('div'); charla.id = 'charla'; charla.hidden = true;
  charla.innerHTML = '<div class="quien"></div><p class="tu"></p><p class="dice"></p><div class="estado-ia"></div><div class="escribe" hidden><input type="text" maxlength="200" autocomplete="off" aria-label="Lo que le dices"><button type="button" class="decir">Decir</button></div>'
    + '<div class="clave" hidden><input type="password" autocomplete="off" spellcheck="false" aria-label="Tu clave de OpenAI" placeholder="Tu clave de OpenAI (sk-…)"><button type="button" class="guardar">Guardar</button><p>Se queda solo en este navegador y solo se manda a OpenAI.</p></div>'
    + '<div class="botones"><button type="button" class="usar-gpt"></button><button type="button" class="adios"></button><button type="button" class="sigue"></button></div>';
  document.body.appendChild(charla);
  const [cQuien, cDice, cAdios, cSigue] = ['.quien', '.dice', '.adios', '.sigue'].map((s) => charla.querySelector(s));
  const [cTu, cEstado, cEscribe, cDecir] = ['.tu', '.estado-ia', '.escribe', '.decir'].map((s) => charla.querySelector(s)), cEntrada = cEscribe.querySelector('input');
  // (la clave de OpenAI, para que contesten con GPT: la pone el jugador y se queda en su navegador; src/ia.js)
  const [cClave, cGuardar, cUsarGPT] = ['.clave', '.guardar', '.usar-gpt'].map((s) => charla.querySelector(s)), cClaveEntrada = cClave.querySelector('input');
  const pintarGPT = () => { cUsarGPT.textContent = claveGPT() ? 'IA: tu GPT · quitar clave' : 'Usar mi clave de GPT'; };
  cUsarGPT.addEventListener('click', () => {
    if (claveGPT()) { guardarClaveGPT(''); cEstado.textContent = 'Clave quitada: contesta la IA del navegador.'; pintarGPT(); ia.puede().then((s) => { iaSirve = s; cEscribe.hidden = !iaSirve; }); return; }
    cClave.hidden = !cClave.hidden; if (!cClave.hidden) cClaveEntrada.focus();
  });
  const guardarClave = () => {
    const k = cClaveEntrada.value.trim(); if (!/^sk-[\w-]{20,}$/.test(k)) { cEstado.textContent = 'Eso no parece una clave de OpenAI (empieza por «sk-»).'; return; }
    guardarClaveGPT(k); cClaveEntrada.value = ''; cClave.hidden = true; iaSirve = true; cEscribe.hidden = false; pintarGPT();
    cEstado.textContent = `Guardada en este navegador: ahora contesta ${ia.modelo}.`;
  };
  cGuardar.addEventListener('click', guardarClave);
  cClaveEntrada.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); guardarClave(); } else if (e.key === 'Escape') cClave.hidden = true; });
  cClaveEntrada.addEventListener('focus', () => { if (document.pointerLockElement) document.exitPointerLock(); });
  cEntrada.placeholder = movil ? 'Escríbele algo…' : 'Escríbele algo… (Intro)';
  // (la IA de los vecinos: solo donde puede ir, src/ia.js; si no, las frases de siempre)
  const ia = montarIA({ q, movil }); let iaSirve = false; ia.puede().then((s) => { iaSirve = s; }); pintarGPT();
  if (q.get('ia') === '0' || q.get('desde') === '388') cUsarGPT.hidden = true;
  cAdios.textContent = movil ? 'Adiós' : 'Adiós (Esc)'; cSigue.textContent = movil ? 'Seguir hablando' : 'Seguir hablando (E)';
  for (const b of [bPrincipal, bSegunda, bSaludar, bBailar, charla]) for (const ev of ['pointerdown', 'pointerup', 'touchstart']) b.addEventListener(ev, (e) => e.stopPropagation());
  // (lo que se escribe no llega al juego: ni andar, ni saltar, ni las teclas de las acciones)
  cEntrada.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); decirIA(); } else if (e.key === 'Escape') cEntrada.blur(); });
  // (al escribir, el ratón se suelta: las teclas solo mueven a la chica con el ratón capturado; las que se sueltan sí
  // llegan al controlador, por si una se soltó escribiendo)
  cEntrada.addEventListener('focus', () => { if (document.pointerLockElement) document.exitPointerLock(); });
  cDecir.addEventListener('click', () => decirIA());
  if (q.get('desde') === '388' || q.get('acciones') === 'sin') for (const b of [bSaludar, bBailar]) b.remove();

  // ---- dónde está la chica y qué tiene cerca
  const pie = () => { const p = ctrl.getPosition(); return { x: p.x, y: p.y - 1, z: p.z }; };
  const yawChica = () => ((tpc._modelYaw - (tpc.modelYawOffset || 0)) * Math.PI) / 180;
  const iglesiaCentro = sitiosIglesia ? [sitiosIglesia.bancos.reduce((a, b) => a + b.asiento[0], 0) / sitiosIglesia.bancos.length, sitiosIglesia.bancos.reduce((a, b) => a + b.asiento[1], 0) / sitiosIglesia.bancos.length] : null;
  // (con la planta de la iglesia, como el reloj y el canto: con el círculo de 16 m, el altar y la puerta de los pies quedaban
  // fuera, y junto a las puertas laterales, por fuera, se ofrecía arrodillarse)
  const enIglesia = (p) => { const r = window.foto?.reloj?.enPlanta?.(p.x, p.z); return Math.abs(p.y) < 1.5 && (r ?? (iglesiaCentro && Math.hypot(p.x - iglesiaCentro[0], p.z - iglesiaCentro[1]) < 16)); };
  // los asientos: los bancos (dos o tres sitios cada uno), las sillas de las puertas y los bancos de la iglesia. x, z: el
  // sitio (para buscarlo y ver si está ocupado); rx, rz: donde va la chica (sus pies). En el clip de sentada la cadera
  // queda 26 cm por detrás de los pies: con los pies en el asiento, la cadera caía detrás del respaldo y el muslo
  // atravesaba la madera (15-11-2026, el usuario: «que las piernas no se corten, que queden por encima de la silla o el
  // banco»). Ahora los pies van delante, y la cadera, a 6-10 cm por delante del centro del asiento hacia el respaldo
  const CLIP_CADERA = 0.26;
  const asiento = (tipo, x, y, z, mira, cadera) => ({ tipo, x, y, z, mira, rx: x + mira[0] * (CLIP_CADERA + cadera), rz: z + mira[1] * (CLIP_CADERA + cadera) });
  const asientos = [];
  for (const b of vida?.bancos || []) for (const u of b.largo > 2 ? [-0.65, 0, 0.65] : [-0.45, 0.45]) {
    const tx = -b.mira[1], tz = b.mira[0];
    asientos.push(asiento('banco', b.p[0] + tx * u, b.p[1] - 0.46, b.p[2] + tz * u, b.mira, -0.09));
  }
  for (const s of vida?.sillas || []) asientos.push(asiento('silla', s.p[0], s.p[1], s.p[2], s.mira, -0.06));
  for (const s of sitiosIglesia?.bancos || []) asientos.push(asiento('iglesia', s.asiento[0], s.asiento[2] - 0.46, s.asiento[1], s.mira, -0.10));
  const ocupado = (a) => gente?.lista?.some((v) => (v.estado === 'sentado' || v.estado === 'misa') && Math.hypot(v.x - a.x, v.z - a.z) < 0.4);
  // (al de delante de cada asiento; en la iglesia, entre los bancos no se cabe: al asiento mismo, desde el pasillo, hasta 2 m)
  const asientoCerca = (p) => {
    let m = null, dm = 9;
    for (const a of asientos) {
      const igl = a.tipo === 'iglesia', d = igl ? Math.hypot(a.x - p.x, a.z - p.z) : Math.hypot(a.x + a.mira[0] * 0.45 - p.x, a.z + a.mira[1] * 0.45 - p.z);
      if (d < (igl ? 2.0 : 1.3) && d < dm && Math.abs(a.y - p.y) < 0.8 && !ocupado(a)) { dm = d; m = a; }
    }
    return m;
  };
  const vecinoCerca = (p) => {
    if (!gente) return null;
    const v = gente.cercano(p.x, p.z, 2.2); if (!v || v.estado === 'jugar' && Math.random() < 0) return null;
    return v;
  };
  const lampadarioCerca = (p) => sitiosIglesia?.lampadario && Math.hypot(p.x - sitiosIglesia.lampadario.pie[0], p.z - sitiosIglesia.lampadario.pie[1]) < 1.4 && Math.abs(p.y) < 1;

  // ---- quieta en un sitio (sentada, de rodillas, encendiendo una vela): sin moverse y sin saltar, mirando a donde toque
  const fijar = (x, y, z, mira) => {
    ctrl.rigidbody.linearVelocity = Vec3.ZERO; ctrl.rigidbody.linearFactor = Vec3.ZERO; ctrl.rigidbody.teleport(x, y + 1, z);
    tpc.speedGround = 0; tpc.jumpForce = 0;
    if (mira) tpc._modelYaw = Math.atan2(mira[0], mira[1]) * 180 / Math.PI + (tpc.modelYawOffset || 0);
  };
  const soltar = (x, y, z) => {
    ctrl.rigidbody.linearFactor = Vec3.ONE; if (x != null) ctrl.rigidbody.teleport(x, y + 1, z); ctrl.rigidbody.linearVelocity = Vec3.ZERO;
    tpc.speedGround = base.speed; tpc.jumpForce = base.jump; tpc._jumping = false;
  };
  let mover = null; // (un paso suave de un sitio a otro, mientras se sienta)
  const deslizar = (de, a, dur) => { mover = { de, a, t: 0, dur }; };

  function sentarse(a) {
    const p = pie();
    est.modo = 'sentandose'; est.asiento = a; est.t = 1.3; est.desde = p;
    est.liberarSitio?.(); est.liberarSitio = gente?.ocupar?.(a.x, a.z) || null;   // (que ningún vecino se siente en su sitio)
    // (de pie delante del asiento, de espaldas a él, y de ahí abajo mientras se sienta; en la iglesia, entre los bancos no
    // cabe: de lado desde el pasillo)
    const raiz = { x: a.rx, y: a.y, z: a.rz };
    const delante = a.tipo === 'iglesia' ? p : { x: a.rx + a.mira[0] * 0.3, y: a.y, z: a.rz + a.mira[1] * 0.3 };
    fijar(p.x, p.y, p.z, a.mira); deslizar(p, delante, a.tipo === 'iglesia' ? 0.01 : 0.25);
    setTimeout(() => { if (est.modo === 'sentandose') { deslizar(delante, raiz, 0.9); capa.transition('Sentarse', 0.25); } }, 250);
    est.t = 1.55; ponerBotones();
  }
  function levantarse() {
    if (est.modo !== 'sentada') return;
    est.modo = 'levantandose'; est.t = 1.0; capa.transition('Levantarse', 0.2);
    // (de vuelta a donde estaba de pie: es sitio libre; delante de un banco de la iglesia está el de delante)
    const a = est.asiento; est.vuelta = a.tipo === 'iglesia' || !est.desde ? (est.desde || { x: a.x + a.mira[0] * 0.45, y: a.y, z: a.z + a.mira[1] * 0.45 }) : { x: a.x + a.mira[0] * 0.45, y: a.y, z: a.z + a.mira[1] * 0.45 };
    deslizar({ x: a.rx, y: a.y, z: a.rz }, est.vuelta, 0.9); ponerBotones();
  }
  // de rodillas con las dos y las manos juntas (tools/blender/chica_gestos.py, rezar). Entre los bancos de la iglesia, en el
  // reclinatorio del banco que tiene más cerca (a 22 cm del suelo, de cara al altar); si no, donde está
  function arrodillarse() {
    const p = pie(); let m = sitiosIglesia?.altar || [Math.sin(yawChica()), Math.cos(yawChica())], a = p;
    let rec = null, dr = 0.9;
    for (const b of sitiosIglesia?.bancos || []) { const d = Math.hypot(b.rodillas[0] - p.x, b.rodillas[1] - p.z); if (d < dr && Math.abs(p.y) < 0.5) { dr = d; rec = b; } }
    if (rec) { m = rec.mira; a = { x: rec.rodillas[0] - m[0] * 0.05, y: p.y + rec.rodillas[2], z: rec.rodillas[1] - m[1] * 0.05 }; }
    est.modo = 'rodillas'; est.donde = p; fijar(p.x, p.y, p.z, m); if (rec) deslizar(p, a, 0.45); capa.transition('Arrodillada', 0.6);
    ponerBotones();
  }
  function encenderVela() {
    const L = sitiosIglesia.lampadario, p = pie();
    est.modo = 'vela'; est.t = 2.0; fijar(p.x, p.y, p.z, L.mira); deslizar(p, { x: L.pie[0], y: p.y, z: L.pie[1] }, 0.3);
    setTimeout(() => capa.transition('Tocar', 0.25), 300);
    setTimeout(() => ponerVela(), 1250);
    ponerBotones();
  }
  // una vela nueva en el lampadario, encendida (en la grada de arriba, en un hueco)
  let matCera = null, matLlama = null;
  function ponerVela() {
    if (!sitiosIglesia?.lampadario || est.velas.length >= 12) return;
    if (!matCera) {
      matCera = new StandardMaterial(); matCera.diffuse = new Color(0.93, 0.9, 0.82); matCera.update();
      matLlama = new StandardMaterial(); matLlama.diffuse = new Color(0, 0, 0); matLlama.emissive = new Color(1, 0.72, 0.32); matLlama.emissiveIntensity = 4; matLlama.useLighting = false; matLlama.update();
    }
    const L = sitiosIglesia.lampadario, k = est.velas.length, lado = [-L.mira[1], L.mira[0]], u = -0.33 + (k % 6) * 0.12 + (k >= 6 ? 0.06 : 0), adelante = k >= 6 ? -0.1 : 0.0;
    const x = L.p[0] + lado[0] * u - L.mira[0] * adelante, z = L.p[1] + lado[1] * u - L.mira[1] * adelante, y = L.p[2] + (k >= 6 ? 0.12 : 0) + 0.02;
    const vela = new Entity('vela_encendida'); vela.addComponent('render', { type: 'cylinder', material: matCera, castShadows: false }); vela.setLocalScale(0.034, 0.08, 0.034); vela.setPosition(x, y + 0.04, z);
    const llama = new Entity('llama_encendida'); llama.addComponent('render', { type: 'cone', material: matLlama, castShadows: false }); llama.setLocalScale(0.016, 0.035, 0.016); llama.setPosition(x, y + 0.1, z);
    app.root.addChild(vela); app.root.addChild(llama); est.velas.push({ vela, llama });
  }
  function bailar() { est.modo = 'bailando'; capa.transition('Bailar', 0.3); ponerBotones(); }
  function aPie() {
    const antes = est.modo; est.modo = 'pie'; est.asiento = null; mover = null; est.liberarSitio?.(); est.liberarSitio = null;
    if (antes === 'rodillas' || antes === 'bailando' || antes === 'vela') capa.transition('Quieto', 0.35);
    if (antes !== 'bailando') { const p = antes === 'rodillas' && est.donde ? est.donde : pie(); soltar(p.x, p.y, p.z); } // (del reclinatorio, a donde estaba de pie)
    ponerBotones();
  }
  function saludar() {
    saludoChica?.empezar();
    // (quien la ve cerca le contesta: los dos más cercanos que la tienen delante)
    if (!gente) return;
    const p = pie();
    gente.lista.filter((v) => Math.hypot(v.x - p.x, v.z - p.z) < 12 && Math.cos(Math.atan2(p.x - v.x, p.z - v.z) - v.yaw) > -0.2)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 2)
      .forEach((v, k) => setTimeout(() => gente.saludar(v), 500 + k * 350 + Math.random() * 300));
  }

  // ---- la charla
  function hablar(v) {
    const p = pie(), h = reloj ? reloj.hora : 12, dia = reloj ? ((reloj.diaSemana + reloj.dia) % 7 + 7) % 7 : new Date().getDay();
    gente.hablar(v, p.x, p.z);
    if (Math.random() < 0.5) gente.saludar(v);
    est.modo = 'hablando'; est.habla = v; est.linea = 0; est.iaUsada = false; est.iaHace = null;
    const sitio = enIglesia(p) ? 'iglesia' : vida?.plazas?.some((pl) => pl.p.some((q_) => Math.hypot(q_[0] - p.x, q_[1] - p.z) < 15)) ? 'plaza' : 'calle';
    est.lineas = frases({ tipo: v.info.tipo, sexo: v.info.sexo, h, dia, sitio, misa: gente.misa(), jugando: v.estado === 'jugar', sentado: v.estado === 'sentado' || v.estado === 'misa' });
    fijar(p.x, p.y, p.z, [v.x - p.x, v.z - p.z]);
    // (la cámara, de lado y algo por detrás de ella, para verlos a los dos: el giro que lleva menos camino)
    { const dx = v.x - p.x, dz = v.z - p.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, ya = tpc._yaw * Math.PI / 180, fx = -Math.sin(ya), fz = -Math.cos(ya);
      // (de los dos lados, el que tiene sitio: el rayo de entre los dos hacia atrás no choca con una pared; si los dos
      // tienen, el que lleva menos giro)
      const mx = (p.x + v.x) / 2, mz = (p.z + v.z) / 2, y = p.y + 1.5, sitio = (sg) => { const ox = uz * sg * 0.8 + ux * 0.55, oz = -ux * sg * 0.8 + uz * 0.55, h = app.systems.rigidbody.raycastFirst(new Vec3(mx, y, mz), new Vec3(mx - ox * 3.5, y, mz - oz * 3.5)); return [h ? Math.hypot(h.point.x - mx, h.point.z - mz) : 9, ox, oz]; };
      const cerca_ = (uz * fx - ux * fz) >= 0 ? 1 : -1, [d1, ox1, oz1] = sitio(cerca_), [d2, ox2, oz2] = sitio(-cerca_);
      const [ox, oz] = d1 >= 2.5 || d1 >= d2 ? [ox1, oz1] : [ox2, oz2]; est.camYaw = Math.atan2(-ox, -oz) * 180 / Math.PI; }
    const quien = { mayor: v.info.sexo ? 'vecino' : 'vecina', adulto: v.info.sexo ? 'vecino' : 'vecina', joven: v.info.sexo ? 'chico del pueblo' : 'chica del pueblo', nino: v.info.sexo ? 'niño' : 'niña' }[v.info.tipo] || 'vecino';
    const pe = persona(v); cQuien.textContent = `${pe.nombre} · ${quien}, ${pe.edad} años`; cTu.textContent = ''; cEstado.textContent = '';
    est.contexto = { hora: h, dia, donde: dondeTexto(p, sitio), lugares: lugaresTexto(p, sitio) };
    decir();
    cEscribe.hidden = !iaSirve; cEntrada.value = '';
    charla.hidden = false; ponerBotones();
    // (con la IA ya despierta, el saludo también es suyo: lo de siempre se queda si tarda o falla)
    if (iaSirve && ia.estado().listo) { est.iaTurno = (est.iaTurno || 0) + 1; preguntar('(La chica se acerca y te saluda.)', true); }
  }
  // dónde están, para el vecino: dentro de la iglesia, en una plaza o en la calle más cercana
  function dondeTexto(p, sitio) {
    if (sitio === 'iglesia') return 'dentro de la iglesia de Santa María';
    let mejor = null, dm = 40;
    for (const pl of vida?.plazas || []) for (const q_ of pl.p || []) { const d = Math.hypot(q_[0] - p.x, q_[1] - p.z); if (d < dm) { dm = d; mejor = pl.nombre; } }
    if (mejor && dm < 15) return `en la ${mejor.replace(/ \(\d+\)$/, '').replace(/^Plaza/, 'plaza')}`;
    for (const c of vida?.calles || []) for (const q_ of c.p || []) { const d = Math.hypot(q_[0] - p.x, q_[1] - p.z); if (d < dm) { dm = d; mejor = c.nombre; } }
    return mejor ? `en la ${mejor.replace(/^Calle/, 'calle').replace(/^Avenida/, 'avenida').replace(/^Plaza/, 'plaza')}` : 'en una calle del pueblo';
  }
  // lo lejos que están la iglesia y la plaza de España, y hacia dónde (medido en el juego: el vecino no se lo inventa)
  const RUMBOS = ['el norte', 'el noreste', 'el este', 'el sureste', 'el sur', 'el suroeste', 'el oeste', 'el noroeste'];
  const haciaTexto = (p, x, z) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), r = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; return { d, txt: `a unos ${d < 100 ? Math.round(d / 10) * 10 : Math.round(d / 50) * 50} metros de aquí, hacia ${RUMBOS[Math.round(r / 45) % 8]}` }; };
  function lugaresTexto(p, sitio) {
    const l = [];
    if (sitio === 'iglesia') l.push('Estáis dentro de la iglesia de Santa María.');
    else if (iglesiaCentro) { const h = haciaTexto(p, iglesiaCentro[0], iglesiaCentro[1]); l.push(h.d < 40 ? 'La iglesia de Santa María está aquí al lado.' : `La iglesia de Santa María está ${h.txt}.`); }
    const pe = (vida?.plazas || []).find((pl) => /espa[ñn]a/i.test(pl.nombre || ''));
    if (pe?.p?.length) { const c = pe.p.reduce((a, q_) => [a[0] + q_[0] / pe.p.length, a[1] + q_[1] / pe.p.length], [0, 0]), h = haciaTexto(p, c[0], c[1]); l.push(h.d < 40 ? 'La plaza de España está aquí mismo.' : `La plaza de España está ${h.txt}.`); }
    return l.join(' ');
  }
  // lo que se le escribe: a la IA (la primera vez, despertándola con su aviso), y lo que contesta, mientras lo escribe
  function decirIA() {
    const texto = cEntrada.value.trim(); if (!texto || est.modo !== 'hablando') return;
    cEntrada.value = ''; cTu.textContent = '—' + texto; preguntar(texto, false);
  }
  async function preguntar(texto, saludo) {
    const v = est.habla, turno = est.iaTurno = (est.iaTurno || 0) + 1; if (!v) return;
    const viejo = cDice.textContent;
    if (!saludo) cDice.textContent = '…';
    if (!ia.estado().listo) {
      cEstado.textContent = 'Despertando a los vecinos… (la primera vez se bajan 880 MB)';
      try { await ia.preparar((pr) => { if (est.iaTurno === turno) cEstado.textContent = `Despertando a los vecinos… ${Math.round(pr * 100)} % (la primera vez se bajan 880 MB)`; }); }
      catch (e) { if (est.iaTurno === turno) { cEstado.textContent = 'No se ha podido despertar la IA en este navegador.'; cDice.textContent = viejo; } return; }
    }
    if (est.habla !== v || est.iaTurno !== turno) return;
    cEstado.textContent = ''; const t0 = performance.now();
    // (si tarda —el servidor de los vecinos, dormido, tarda en despertar la primera vez—, se dice)
    const tarda = setTimeout(() => { if (est.habla === v && est.iaTurno === turno) cEstado.textContent = 'Pensando… (la primera vez del día tarda un poco)'; }, 4000);
    try {
      const r = await ia.responder({ v, contexto: est.contexto, mensaje: texto, alEscribir: (s) => { if (est.habla === v && est.iaTurno === turno) cDice.textContent = s; } });
      if (est.habla !== v || est.iaTurno !== turno) return;
      clearTimeout(tarda); cEstado.textContent = '';
      cDice.textContent = r.dice; cSigue.hidden = true; est.iaUsada = true; est.ultimaIA = { dice: r.dice, hace: r.hace, propuesto: r.propuesto, quien: r.quien, ms: Math.round(performance.now() - t0) };
      hacerIA(v, r.hace);
    } catch (e) { clearTimeout(tarda); console.warn('ia:', e); if (est.habla === v && est.iaTurno === turno) { cDice.textContent = viejo; cEstado.textContent = /clave/i.test(String(e?.message)) ? e.message + ' Quítala con «IA: GPT · quitar clave».' : 'El vecino se ha quedado pensando… prueba otra vez.'; } }
  }
  // lo que decide hacer: saludar ya; acompañarla, irse o sentarse, cuando ella lo ha leído (se acaba la charla)
  function hacerIA(v, hace) {
    if (hace === 'saludar') { gente.saludar(v); return; }
    if (hace === 'nada') return;
    if (hace === 'despedirse') { est.iaHace = hace; setTimeout(() => { if (est.habla === v && est.iaHace === hace) despedirse(); }, Math.min(4000, 1200 + cDice.textContent.length * 35)); return; }
    est.iaHace = hace;
    setTimeout(() => {
      if (est.habla !== v || est.iaHace !== hace) return;
      terminar(() => { if (hace === 'acompanar') gente.acompañar(v, 90); else if (hace === 'irse') gente.irse(v); else if (hace === 'sentarse') { if (!gente.sentarse(v)) gente.soltar(v); } });
    }, Math.min(4500, 1400 + cDice.textContent.length * 35));
  }
  function decir() {
    cDice.textContent = est.lineas[est.linea];
    const ultima = est.linea >= est.lineas.length - 1;
    cSigue.hidden = ultima; cAdios.textContent = (ultima ? 'Adiós' : 'Adiós') + (movil ? '' : ' (Esc)');
  }
  function seguir() { if (est.modo !== 'hablando') return; if (est.iaUsada && !cEscribe.hidden) { cEntrada.focus(); return; } if (est.linea < est.lineas.length - 1) { est.linea++; decir(); if (est.linea === est.lineas.length - 1 && Math.random() < 0.6) gente.saludar(est.habla); } else despedirse(); }
  function despedirse() { terminar(() => gente.soltar(est.habla)); }
  function terminar(vecino) {
    if (est.modo !== 'hablando') return;
    vecino(); est.habla = null; est.camYaw = null; est.iaHace = null; est.iaTurno = (est.iaTurno || 0) + 1; charla.hidden = true; est.modo = 'pie';
    if (document.activeElement === cEntrada) cEntrada.blur();
    const p = pie(); soltar(p.x, p.y, p.z); ponerBotones();
  }

  // ---- qué hace E (y el botón): lo que toque según lo que hay cerca
  let accion = null, segunda = null;
  function queToca() {
    const p = pie();
    if (est.modo === 'sentada') return [{ texto: 'Levantarse', f: levantarse }, null];
    if (est.modo === 'rodillas') return [{ texto: 'Levantarse', f: aPie }, null];
    if (est.modo === 'bailando') return [{ texto: 'Dejar de bailar', f: aPie }, null];
    if (est.modo !== 'pie') return [null, null];
    if (conducir?.()?.cerca) return [null, null]; // (el coche manda: «Subir al coche»)
    const v = vecinoCerca(p), a = asientoCerca(p);
    // (si hay un vecino y un asiento, gana lo que tiene delante: la distancia, más lo que tendría que girarse)
    const y_ = yawChica(), fx = Math.sin(y_), fz = Math.cos(y_);
    const coste = (x, z) => { const d = Math.hypot(x - p.x, z - p.z) || 1e-3; return d + 1.2 * (1 - ((x - p.x) * fx + (z - p.z) * fz) / d); };
    const dv = v ? coste(v.x, v.z) : 99, da = a ? coste(a.x + a.mira[0] * 0.45, a.z + a.mira[1] * 0.45) : 99;
    let uno = null, otro = null;
    if (v && (dv < da || !a)) uno = { texto: 'Hablar', f: () => hablar(v) };
    else if (a) uno = { texto: 'Sentarse', f: () => sentarse(a) };
    if (lampadarioCerca(p)) { otro = uno; uno = { texto: 'Encender una vela', f: encenderVela }; }
    if (enIglesia(p) && !otro) { const r = { texto: 'Arrodillarse', f: arrodillarse }; if (!uno) uno = r; else otro = r; }
    return [uno, otro];
  }
  function ponerBotones() {
    [accion, segunda] = queToca();
    bPrincipal.hidden = !accion || est.modo === 'hablando'; if (accion) bPrincipal.textContent = accion.texto + (movil ? '' : ' (E)');
    bSegunda.hidden = !segunda || est.modo === 'hablando'; if (segunda) bSegunda.textContent = segunda.texto + (movil ? '' : ' (R)');
    const libre = est.modo === 'pie' || est.modo === 'sentada' || est.modo === 'bailando';
    const enCoche = conducir?.()?.modo === 'conduciendo' || !ctrl.enabled;
    bSaludar.hidden = !movil || !libre || enCoche; bBailar.hidden = !movil || est.modo !== 'pie' || enCoche;
    if (enCoche) { bPrincipal.hidden = bSegunda.hidden = true; }
  }
  bPrincipal.addEventListener('click', () => accion?.f());
  bSegunda.addEventListener('click', () => segunda?.f());
  bSaludar.addEventListener('click', () => saludar());
  bBailar.addEventListener('click', () => (est.modo === 'bailando' ? aPie() : est.modo === 'pie' && bailar()));
  cSigue.addEventListener('click', () => seguir()); cAdios.addEventListener('click', () => despedirse());
  addEventListener('keydown', (e) => {
    if (e.repeat || e.target?.tagName === 'INPUT' || !ctrl.enabled) return;
    if (est.modo === 'hablando') {
      if (e.code === 'Enter' && iaSirve && !cEscribe.hidden) { e.preventDefault(); cEntrada.focus(); return; }
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); seguir(); }
      else if (e.code === 'Escape' || /^Key[WASD]$|^Arrow/.test(e.code)) despedirse();
      return;
    }
    // (echar a andar la levanta, la para de bailar o la pone de pie: también con la tecla, que el controlador solo cuenta
    // las de andar con el ratón capturado)
    if (/^Key[WASD]$|^Arrow(Up|Down|Left|Right)$/.test(e.code)) { if (est.modo === 'sentada') levantarse(); else if (est.modo === 'bailando' || est.modo === 'rodillas') aPie(); return; }
    if (e.code === 'KeyE' || e.code === 'KeyF') { if (!conducir?.()?.cerca) accion?.f(); }
    else if (e.code === 'KeyR') segunda?.f();
    else if (e.code === 'KeyQ') saludar();
    else if (e.code === 'KeyB') { if (est.modo === 'bailando') aPie(); else if (est.modo === 'pie') bailar(); }
  });

  // ---- cada fotograma
  let cuenta = 0;
  app.on('update', (dt) => {
    saludoChica?.mover(dt);
    if (mover) {
      mover.t += dt; const k = Math.min(1, mover.t / mover.dur), s = k * k * (3 - 2 * k);
      ctrl.rigidbody.teleport(mover.de.x + (mover.a.x - mover.de.x) * s, mover.de.y + (mover.a.y - mover.de.y) * s + 1, mover.de.z + (mover.a.z - mover.de.z) * s);
      if (k >= 1) mover = null;
    }
    if (est.modo !== 'pie') { tpc._jumping = true; ctrl.rigidbody.linearVelocity = Vec3.ZERO; }
    if (est.modo === 'hablando' && est.camYaw != null) { let d = est.camYaw - tpc._yaw; d -= Math.round(d / 360) * 360; tpc._yaw += d * Math.min(1, dt * 2.5); }
    // (andar lo deshace: levantarse, dejar de bailar, ponerse de pie)
    // (en la charla, el Espacio pasa a la frase siguiente —el teclado, arriba—: solo andar la deshace. Antes el Espacio
    // también contaba como andar, y la charla se cerraba nada más pasar de frase; 15-11-2026, la revisión del juego)
    const quiere = tpc._state?.axis?.lengthSq?.() > 0.01 || (est.modo !== 'hablando' && (tpc._state?.space || 0) > 0);
    if (quiere) { if (est.modo === 'sentada') levantarse(); else if (est.modo === 'bailando' || est.modo === 'rodillas') aPie(); else if (est.modo === 'hablando') despedirse(); }
    if (est.t > 0) {
      est.t -= dt;
      if (est.t <= 0) {
        if (est.modo === 'sentandose') { est.modo = 'sentada'; capa.transition(est.asiento?.tipo === 'iglesia' ? 'SentadaIglesia' : 'Sentada', 0.4); ponerBotones(); } // (en la iglesia, los pies en el reclinatorio)
        else if (est.modo === 'levantandose') { const v_ = est.vuelta; est.modo = 'pie'; est.asiento = null; est.liberarSitio?.(); est.liberarSitio = null; capa.transition('Quieto', 0.25); soltar(v_.x, v_.y, v_.z); ponerBotones(); }
        else if (est.modo === 'vela') { capa.transition('Quieto', 0.3); aPie(); }
      }
    }
    if (est.modo === 'bailando' && capa.activeState !== 'Bailar') est.modo = 'pie';
    if ((cuenta++ & 7) === 0) ponerBotones();
    // (si se va lejos hablando, se acaba)
    if (est.modo === 'hablando' && est.habla && Math.hypot(est.habla.x - pie().x, est.habla.z - pie().z) > 4) despedirse();
  });
  ponerBotones();
  return { estado: () => ({ modo: est.modo, accion: accion?.texto || null, segunda: segunda?.texto || null, velas: est.velas.length, dice: est.modo === 'hablando' ? cDice.textContent : null, quien: est.modo === 'hablando' ? cQuien.textContent : null, ia: est.ultimaIA || null, iaAviso: cEstado.textContent || null }),
    sentarse: (i) => sentarse(i != null ? asientos[i] : asientoCerca(pie())), levantarse, saludar, bailar, aPie, arrodillarse, encenderVela, hablar, seguir, despedirse,
    asientos: () => asientos.length, asientoCerca: () => asientoCerca(pie()), usar: () => accion?.f(),
    ia, iaSirve: () => iaSirve, escribir: (texto) => { cEntrada.value = texto; decirIA(); } };
}

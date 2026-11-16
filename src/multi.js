// El multijugador (docs/multijugador.md). El usuario, el 16-11-2026: «que cada vez que entre una persona dentro de la
// página web y en el pueblo en cuestión, aparezca también en el pueblo y que pueda interaccionar exactamente igual […] que
// pueda entrar de forma asíncrona […] una pantalla inicial que le diga cuántas personas humanas hay y cuántos NPCs hay
// actualmente y dónde se encuentran las personas humanas, en qué calle y en qué lugar».
// - La sala del pueblo en el servidor de 388 (wss://three88-pueblos.onrender.com/ws?room=juego-06060): cada juego manda
//   el estado de su chica unas 8 veces por segundo (dónde está, hacia dónde mira, qué animación, qué hace, en qué calle) y
//   el servidor lo reenvía a los demás. Se entra y se sale cuando se quiera.
// - Los demás, con la figura de la chica y su nombre encima, con sus animaciones (andar, correr, saltar, sentarse,
//   bailar, arrodillarse, saludar), dibujados 120 ms por detrás para pasar suave de un estado al siguiente.
// - Hablar: E junto a alguien («Hablar con Lucía 23») o Intro: lo dicho sale en un bocadillo sobre la cabeza y en la lista
//   de abajo a la izquierda. Saludar (Q), también.
// - La hora, la de la sala (reloj.sincronizar): la misma para todos.
// - «Guareña, ahora» (la pantalla inicial y el botón «Quién hay», P): cuántas personas, cuántos vecinos y dónde está cada
//   persona (src/donde.js).
// Sin servidor (dormido, sin red, ?multi=0) se juega solo, como antes. ?multi=ws://127.0.0.1:<puerto> usa uno en local;
// ?nombre= pone el nombre; ?bienvenida=0 no enseña la pantalla inicial (las pruebas).
import { Entity, Vec3 } from 'playcanvas';
import { brazoSaludo } from './gestos.js';
import { enLaCalle, VECINOS } from './gente.js';
import { HACE, montarDonde } from './donde.js';

const SERVIDOR = 'wss://three88-pueblos.onrender.com/ws';
const PUEBLOS = { guarena: '06060' };
// las animaciones de la chica, por número (a): las cuatro de main.js y las de las acciones (src/acciones.js, «chica_<f>»)
const ESTADOS = ['Quieto', 'Andar', 'Correr', 'Saltar', 'Sentarse', 'Sentada', 'SentadaIglesia', 'Levantarse', 'Bailar', 'Arrodillada', 'Tocar'];
const DE_ACCIONES = { Sentarse: ['chica_sentarse', false], Sentada: ['chica_sentada', true], SentadaIglesia: ['chica_sentada_iglesia', true], Levantarse: ['chica_levantarse', false], Bailar: ['chica_bailar', true], Arrodillada: ['chica_arrodillada', true], Tocar: ['chica_tocar', false] };
const VEL_ESTADO = { Correr: 1.35, Saltar: 1.8 }; // (las del grafo de la chica, src/main.js)
const NOMBRES = ['Lucía', 'Carmen', 'María', 'Paula', 'Elena', 'Julia', 'Sara', 'Marta', 'Alba', 'Irene', 'Laura', 'Noelia', 'Rocío', 'Pilar', 'Inés', 'Nerea', 'Andrea', 'Claudia', 'Sofía', 'Valeria'];
const LETRAS = /[^A-Za-zÁÉÍÓÚÑáéíóúñü]/g;
const guardado = { leer: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, poner: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } } };

export function montarMulti({ app, q, escena, ctrl, muneco, camara, reloj, vida, personaje, clips, movil, desde388 }) {
  const pueblo = PUEBLOS[escena];
  if (q.get('multi') === '0' || !pueblo) return null;
  const local = q.get('multi') && /^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q.get('multi')) ? q.get('multi').replace(/\/$/, '') + '/ws' : null;
  const url = (local || SERVIDOR) + '?room=juego-' + pueblo;
  const donde = montarDonde({ vida, reloj });
  const figura = muneco.children[0];

  // ---- el nombre: letras (hasta 12) y dos cifras, como «Lucía 23»; se guarda en el navegador
  const cifras = () => String(Math.floor(Math.random() * 90) + 10);
  const limpio = (s) => String(s || '').replace(LETRAS, '').slice(0, 12);
  let nombre = guardado.leer('g388:nombre');
  if (q.get('nombre') && limpio(q.get('nombre')).length >= 2) nombre = limpio(q.get('nombre')) + ' ' + cifras();
  if (!nombre || !/^[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,12} \d{2}$/.test(nombre)) nombre = NOMBRES[Math.floor(Math.random() * NOMBRES.length)] + ' ' + cifras();
  guardado.poner('g388:nombre', nombre);

  // ---- la interfaz
  const css = document.createElement('style');
  css.textContent = `
  #multi-capa { position: fixed; inset: 0; pointer-events: none; z-index: 4; overflow: hidden; }
  .otro { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; gap: 4px; will-change: transform; }
  .otro .nombre { padding: 3px 8px; border-radius: 999px; background: var(--velo, rgba(7, 10, 20, .62)); border: 1px solid var(--linea, rgba(186, 198, 255, .16)); color: var(--cal, #eef0ec);
    font: 500 10px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
  .otro .nombre i { font-style: normal; color: var(--sodio, #ffa94d); }
  .otro .bocadillo { max-width: 240px; padding: 7px 11px; border-radius: 14px; background: rgba(238, 240, 236, .94); color: var(--tinta, #0c1122); font: 400 13px/1.35 var(--f-display, Arial, sans-serif);
    box-shadow: 0 4px 18px rgba(0, 0, 0, .25); text-align: left; overflow-wrap: anywhere; }
  .otro .bocadillo[hidden], .otro[hidden] { display: none; }
  #multi-boton { position: fixed; left: calc(14px + env(safe-area-inset-left, 0px)); bottom: calc(56px + env(safe-area-inset-bottom, 0px)); z-index: 6; padding: 8px 13px; border-radius: 999px;
    background: var(--velo, rgba(7, 10, 20, .62)); border: 1px solid var(--linea, rgba(186, 198, 255, .16)); color: var(--cal, #eef0ec); font: 500 11px/1.2 var(--f-mono, ui-monospace, Menlo, monospace);
    letter-spacing: .09em; text-transform: uppercase; cursor: pointer; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
  #multi-boton b { color: var(--sodio, #ffa94d); font-weight: 500; }
  #multi-log { position: fixed; left: calc(14px + env(safe-area-inset-left, 0px)); bottom: calc(100px + env(safe-area-inset-bottom, 0px)); z-index: 6; display: flex; flex-direction: column; gap: 4px;
    max-width: min(420px, calc(100vw - 28px)); pointer-events: none; }
  #multi-log p { margin: 0; padding: 6px 10px; border-radius: 12px; background: var(--velo, rgba(7, 10, 20, .62)); color: var(--cal, #eef0ec); font: 400 13px/1.35 var(--f-display, Arial, sans-serif);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); transition: opacity .6s; overflow-wrap: anywhere; }
  #multi-log p b { font-weight: 600; color: var(--sodio-2, #ffcf91); }
  #multi-decir { position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 7; display: flex; gap: 8px; align-items: center;
    width: min(560px, calc(100vw - 28px)); padding: 8px; border-radius: 999px; background: var(--velo, rgba(7, 10, 20, .72)); border: 1px solid var(--linea, rgba(186, 198, 255, .16));
    -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
  #multi-decir[hidden] { display: none; }
  #multi-decir span { padding-left: 10px; color: var(--sodio, #ffa94d); font: 500 10px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  #multi-decir input { flex: 1; min-width: 0; padding: 8px 10px; border: 0; border-radius: 999px; background: rgba(238, 240, 236, .1); color: var(--cal, #eef0ec); font: 400 15px/1.3 var(--f-display, Arial, sans-serif); outline: none; }
  #multi-decir button, #multi-panel button { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--sodio, #ffa94d); background: var(--sodio, #ffa94d); color: var(--tinta, #0c1122);
    font: 500 11px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .09em; text-transform: uppercase; cursor: pointer; }
  #multi-panel { position: fixed; z-index: 8; color: var(--cal, #eef0ec); background: rgba(7, 10, 20, .78); border: 1px solid var(--linea, rgba(186, 198, 255, .16)); border-radius: 22px;
    -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); box-shadow: 0 18px 60px rgba(0, 0, 0, .35); font-family: var(--f-display, Arial, sans-serif); }
  #multi-panel[hidden] { display: none; }
  #multi-panel.modal { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; padding: 26px 26px 22px; }
  #multi-panel.esquina { left: calc(14px + env(safe-area-inset-left, 0px)); top: calc(14px + env(safe-area-inset-top, 0px)); width: min(380px, calc(100vw - 28px)); max-height: 60vh; overflow: auto; padding: 16px 18px; }
  #multi-panel .cab { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  #multi-panel .tit { font: 500 11px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .14em; text-transform: uppercase; color: var(--sodio, #ffa94d); }
  #multi-panel h2 { margin: 6px 0 14px; font: 400 30px/1.05 var(--f-serif, Georgia, serif); }
  #multi-panel.esquina h2 { font-size: 22px; margin-bottom: 10px; }
  #multi-panel .cerrar { padding: 4px 9px; background: transparent; border-color: var(--linea, rgba(186, 198, 255, .16)); color: var(--cal, #eef0ec); }
  #multi-panel .cifras { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  #multi-panel .cifras div { padding: 10px 10px 9px; border-radius: 14px; background: rgba(238, 240, 236, .06); border: 1px solid var(--linea, rgba(186, 198, 255, .16)); }
  #multi-panel .cifras b { display: block; font: 400 28px/1 var(--f-serif, Georgia, serif); color: var(--cal, #eef0ec); }
  #multi-panel .cifras span { display: block; margin-top: 4px; font: 500 9.5px/1.25 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--niebla, #9ba4c8); }
  #multi-panel ul { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  #multi-panel li { padding: 9px 11px; border-radius: 12px; background: rgba(238, 240, 236, .05); font-size: 14px; line-height: 1.35; }
  #multi-panel li b { font-weight: 600; }
  #multi-panel li .sitio { display: block; color: var(--niebla, #9ba4c8); font-size: 13px; }
  #multi-panel li .hace { color: var(--sodio-2, #ffcf91); }
  #multi-panel .vacio, #multi-panel .con { margin: 0 0 12px; color: var(--niebla, #9ba4c8); font-size: 14px; line-height: 1.4; }
  #multi-panel .yo { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 4px; font-size: 14px; }
  #multi-panel .yo .cambiar { background: transparent; color: var(--cal, #eef0ec); border-color: var(--linea, rgba(186, 198, 255, .16)); }
  #multi-panel form { display: flex; gap: 8px; margin-top: 10px; }
  #multi-panel form[hidden] { display: none; }
  #multi-panel form input { flex: 1; min-width: 0; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--linea, rgba(186, 198, 255, .16)); background: rgba(238, 240, 236, .08); color: var(--cal, #eef0ec); font: 400 15px/1.3 var(--f-display, Arial, sans-serif); }
  #multi-panel .entrar { width: 100%; margin-top: 16px; padding: 13px 18px; font-size: 12px; }
  #multi-panel.esquina .entrar, #multi-panel.esquina .yo { display: none; }
  @media (max-width: 760px) { #multi-panel .cifras b { font-size: 22px; } #multi-panel h2 { font-size: 24px; } }`;
  document.head.appendChild(css);
  const capaDom = document.createElement('div'); capaDom.id = 'multi-capa'; document.body.appendChild(capaDom);
  const log = document.createElement('div'); log.id = 'multi-log'; document.body.appendChild(log);
  const boton = document.createElement('button'); boton.id = 'multi-boton'; boton.type = 'button'; document.body.appendChild(boton);
  const decir = document.createElement('form'); decir.id = 'multi-decir'; decir.hidden = true;
  decir.innerHTML = '<span></span><input type="text" maxlength="140" autocomplete="off" aria-label="Lo que dices"><button type="submit">Decir</button>';
  document.body.appendChild(decir);
  const [decirA, decirTexto] = [decir.querySelector('span'), decir.querySelector('input')];
  const panel = document.createElement('section'); panel.id = 'multi-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Quién hay en el pueblo');
  panel.innerHTML = `<div class="cab"><span class="tit">Guareña, ahora</span><button type="button" class="cerrar" aria-label="Cerrar">×</button></div>
    <h2>Quién hay en el pueblo</h2>
    <div class="cifras"><div><b class="nh">—</b><span>personas jugando</span></div><div><b class="nv">—</b><span>vecinos por la calle</span></div><div><b class="nc">—</b><span>a tu alrededor</span></div></div>
    <p class="con"></p><ul></ul><p class="vacio" hidden></p>
    <div class="yo"><span>Entras como <b class="minombre"></b></span><button type="button" class="cambiar">Cambiar el nombre</button></div>
    <form class="nombre" hidden><input type="text" maxlength="12" autocomplete="off" aria-label="Tu nombre (solo letras)"><button type="submit">Vale</button></form>
    <button type="button" class="entrar">Entrar en el pueblo</button>`;
  document.body.appendChild(panel);
  const $ = (s) => panel.querySelector(s);
  // (lo que se escribe no mueve a la chica: el teclado del juego escucha en la ventana)
  for (const el of [decirTexto, $('form.nombre input')]) for (const ev of ['keydown', 'keyup', 'keypress']) el.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && e.code === 'Escape') { el.blur(); if (el === decirTexto) cerrarDecir(); } });
  for (const el of [boton, panel, decir]) for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'mousedown']) el.addEventListener(ev, (e) => e.stopPropagation()); // (que el toque no mueva la cámara)

  // ---- los demás
  const otros = new Map(); // id → { id, p, buf: [[t, x, y, z, r]], raiz, capa, puestos, estado, saludo, dom, nombreDom, bocaDom, hasta }
  let ws = null, yo = null, reintentos = 0, estadoCon = 'buscando', sincronizado = false;
  const v1 = new Vec3(), v2 = new Vec3();
  const pista = (a) => a?.resource?.animations?.[0]?.resource || null;
  const clipDe = (n) => (clips[n] ? pista(clips[n]) : DE_ACCIONES[n] ? pista(app.assets.find(DE_ACCIONES[n][0], 'container')) : null);
  function figuraDe(o) {
    if (o.raiz || !personaje?.resource) return;
    const raiz = new Entity('otro_' + o.id), fig = personaje.resource.instantiateRenderEntity({ castShadows: !movil });
    raiz.addChild(fig);
    raiz.addComponent('anim', { activate: true });
    raiz.anim.loadStateGraph({ layers: [{ name: 'base', states: [{ name: 'START' }, ...ESTADOS.map((n) => ({ name: n, speed: VEL_ESTADO[n] || 1 })), { name: 'END' }], transitions: [{ from: 'START', to: 'Quieto', time: 0, priority: 0 }] }], parameters: {} });
    o.capa = raiz.anim.baseLayer; o.puestos = new Set();
    for (const n of ['Quieto', 'Andar', 'Correr', 'Saltar']) { const c = clipDe(n); if (c) { o.capa.assignAnimation(n, c, VEL_ESTADO[n] || 1, n !== 'Saltar'); o.puestos.add(n); } }
    o.saludo = brazoSaludo(raiz); o.estado = 'Quieto';
    app.root.addChild(raiz); o.raiz = raiz;
  }
  function animar(o, n) {
    if (!o.capa || o.estado === n) return;
    if (!o.puestos.has(n)) { const c = clipDe(n); if (!c) return; o.capa.assignAnimation(n, c, VEL_ESTADO[n] || 1, DE_ACCIONES[n] ? DE_ACCIONES[n][1] : true); o.puestos.add(n); }
    o.estado = n; o.capa.transition(n, n === 'Saltar' ? 0.1 : 0.25);
  }
  function crear(id, p = {}) {
    if (otros.has(id) || id === yo) return otros.get(id);
    const dom = document.createElement('div'); dom.className = 'otro'; dom.hidden = true;
    dom.innerHTML = '<div class="bocadillo" hidden></div><div class="nombre"></div>'; capaDom.appendChild(dom);
    const o = { id, p: {}, buf: [], dom, nombreDom: dom.querySelector('.nombre'), bocaDom: dom.querySelector('.bocadillo'), hasta: 0 };
    otros.set(id, o); recibirEstado(o, p); return o;
  }
  function quitar(id) {
    const o = otros.get(id); if (!o) return;
    o.raiz?.destroy(); o.dom.remove(); otros.delete(id); pintarPanel();
  }
  function recibirEstado(o, p) {
    Object.assign(o.p, p);
    if (p.x != null && p.z != null) { o.buf.push([performance.now(), o.p.x, o.p.y ?? 0, o.p.z, o.p.r ?? 0]); if (o.buf.length > 12) o.buf.shift(); }
    const t = (o.p.n || 'Alguien') + (o.p.m === 7 ? ' · conduciendo' : '');
    if (o.nombreDom.textContent !== t) o.nombreDom.textContent = t;
  }
  function bocadillo(o, texto) {
    o.bocaDom.textContent = texto; o.bocaDom.hidden = false; o.hasta = performance.now() + 5000 + texto.length * 70;
  }
  function apuntar(quien, texto, ati) {
    const p = document.createElement('p'); const b = document.createElement('b'); b.textContent = quien + (ati ? ' te dice' : '') + ': ';
    p.append(b, document.createTextNode(texto)); log.appendChild(p);
    while (log.children.length > 4) log.firstChild.remove();
    setTimeout(() => { p.style.opacity = '0'; setTimeout(() => p.remove(), 700); }, 14000);
  }

  // ---- la conexión
  function conectar() {
    if (ws) return;
    try { ws = new WebSocket(url); } catch (e) { ws = null; volver(); return; }
    ws.onopen = () => { reintentos = 0; estadoCon = 'dentro'; ultimo = null; mandar(true); pintarPanel(); };
    ws.onmessage = (e) => { let d; try { d = JSON.parse(e.data); } catch (_) { return; } recibir(d); };
    ws.onclose = () => { ws = null; yo = null; for (const id of [...otros.keys()]) quitar(id); estadoCon = reintentos >= 2 ? 'solo' : 'buscando'; pintarPanel(); volver(); };
    ws.onerror = () => {};
  }
  function volver() { const t = Math.min(30000, 2500 * 2 ** reintentos++); setTimeout(conectar, t); }
  function recibir(d) {
    if (d.t === 'sala') {
      yo = d.yo;
      // (la hora de la sala: la de España cuando entró el primero; la T solo cambia la de cada uno)
      if (!sincronizado || q.get('resincronizar') !== '0') { if (reloj?.sincronizar?.(d.t0, d.ahora)) sincronizado = true; }
      for (const o of d.otros || []) crear(o.id, o.p);
      pintarPanel();
    } else if (d.t === 'entra') { crear(d.id); pintarPanel(); }
    else if (d.t === 'sale') quitar(d.id);
    else if (d.t === 'j') { const o = otros.get(d.id) || crear(d.id); recibirEstado(o, d.p || {}); }
    else if (d.t === 'g') { const o = otros.get(d.id); if (o && d.k === 1) o.saludo?.empezar(); }
    else if (d.t === 'di') {
      const o = otros.get(d.id); if (!o || typeof d.x !== 'string') return;
      const ati = d.a && d.a === yo;
      const p = posDe(o);
      // (lo oyen los que están cerca, a menos de 25 m; si va dirigido a ti, siempre)
      if (ati || (p && Math.hypot(p[0] - ctrl.getPosition().x, p[2] - ctrl.getPosition().z) < 25)) { bocadillo(o, d.x); apuntar(o.p.n || 'Alguien', d.x, ati); }
    }
  }
  const enviar = (o) => { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) { /* se reconecta */ } } };

  // ---- lo de aquí: la chica, cómo está y dónde
  const acc = () => window.foto?.acciones?.estado?.() || null;
  const con = () => window.foto?.conducir?.estado?.() || null;
  let sitio = { k: -1, l: -1 }, cadaSitio = 0, hablandoCon = null;
  function miEstado() {
    const c = con(), a = acc();
    let x, y, z, r;
    if (c?.modo === 'conduciendo' && c.pos) { [x, y, z] = c.pos; r = c.rumbo ?? 0; }
    else { const p = figura.getPosition(), f = figura.forward; x = p.x; y = p.y; z = p.z; r = Math.atan2(-f.x, -f.z) * 180 / Math.PI; }
    const an = muneco.anim?.baseLayer?.activeState || 'Quieto';
    const modo = a?.modo;
    const m = c?.modo === 'conduciendo' ? 7 : !decir.hidden || hablandoCon ? 6 : modo === 'hablando' ? 6 : /sentada|sentandose|levantandose/.test(modo || '') ? 3 : modo === 'bailando' ? 4 : modo === 'rodillas' ? 5
      : modo === 'vela' ? 8 : an === 'Correr' ? 2 : an === 'Andar' ? 1 : an === 'Saltar' ? 9 : 0;
    return { t: 'j', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100, r: Math.round(r * 10) / 10, a: Math.max(0, ESTADOS.indexOf(an)),
      s: Math.round((muneco.anim?.speed ?? 1) * 100) / 100, m, k: sitio.k, l: sitio.l, n: nombre };
  }
  let ultimo = null, tUltimo = 0;
  function mandar(forzar) {
    const e = miEstado(), ahora = performance.now();
    const cambia = !ultimo || Math.hypot(e.x - ultimo.x, e.y - ultimo.y, e.z - ultimo.z) > 0.02 || Math.abs(e.r - ultimo.r) > 1 || ['a', 'm', 'k', 'l', 'n'].some((k) => e[k] !== ultimo[k]) || Math.abs(e.s - ultimo.s) > 0.05;
    if (forzar || (cambia && ahora - tUltimo > 120) || ahora - tUltimo > 2000) { enviar(e); ultimo = e; tUltimo = ahora; }
  }
  const gesto = (k) => enviar({ t: 'g', k });

  // ---- hablar: E junto a alguien (src/acciones.js pregunta a cerca()) o Intro
  function abrirDecir(o) {
    hablandoCon = o || null;
    decirA.textContent = o ? 'A ' + (o.p.n || 'alguien') : 'A los de alrededor';
    decir.hidden = false; decirTexto.value = ''; setTimeout(() => decirTexto.focus(), 0);
  }
  function cerrarDecir() { decir.hidden = true; hablandoCon = null; decirTexto.blur(); }
  decir.addEventListener('submit', (e) => {
    e.preventDefault();
    const x = decirTexto.value.replace(/\s+/g, ' ').trim().slice(0, 140);
    if (x) {
      enviar({ t: 'di', x, ...(hablandoCon?.id ? { a: hablandoCon.id } : {}) });
      bocadillo(yoDom, x); apuntar('Tú', x, false);
    }
    cerrarDecir();
  });
  // (mi bocadillo, sobre mi cabeza)
  const yoDom = (() => { const dom = document.createElement('div'); dom.className = 'otro'; dom.hidden = true; dom.innerHTML = '<div class="bocadillo" hidden></div>'; capaDom.appendChild(dom); return { dom, bocaDom: dom.querySelector('.bocadillo'), hasta: 0, yo: true }; })();
  const posDe = (o) => (o.buf.length ? o.buf[o.buf.length - 1] : null) && [o.buf[o.buf.length - 1][1], o.buf[o.buf.length - 1][2], o.buf[o.buf.length - 1][3]];
  function cerca(p) {
    let mejor = null, md = 2.6;
    for (const o of otros.values()) {
      if (!o.raiz?.enabled || o.p.m === 7) continue;
      const q_ = o.raiz.getPosition(), d = Math.hypot(q_.x - p.x, q_.z - p.z);
      if (d < md) { md = d; mejor = o; }
    }
    return mejor && { x: mejor.raiz.getPosition().x, z: mejor.raiz.getPosition().z, nombre: mejor.p.n || 'alguien', hablar: () => abrirDecir(mejor) };
  }
  addEventListener('keydown', (e) => {
    if (e.repeat || e.target?.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!panel.hidden && panel.classList.contains('modal')) { if (e.code === 'Enter') { e.preventDefault(); entrar(); } return; }
    if (e.code === 'Enter' && acc()?.modo !== 'hablando' && con()?.modo !== 'conduciendo') { e.preventDefault(); const p = ctrl.getPosition(); let o = null, md = 6; for (const x of otros.values()) { if (!x.raiz?.enabled) continue; const d = x.raiz.getPosition().distance(p); if (d < md) { md = d; o = x; } } abrirDecir(o); }
    else if (e.code === 'KeyP') abrirPanel(panel.hidden || panel.classList.contains('modal') ? 'esquina' : null);
  });

  // ---- «Guareña, ahora»
  const fmt = new Intl.NumberFormat('es-ES');
  function vecinos() {
    const g = window.foto?.gente?.cuantos?.();
    if (g) return { pueblo: g.enLaCalle, cerca: g.hay };
    const mes = new Date().getMonth() + 1, dia = ((reloj?.diaSemana ?? 0) + (reloj?.dia ?? 0)) % 7;
    return { pueblo: Math.round(VECINOS * enLaCalle(reloj?.hora ?? 12, dia, mes)), cerca: null };
  }
  function pintarPanel() {
    const n = estadoCon === 'dentro' ? otros.size + 1 : null;
    boton.innerHTML = `Quién hay <b>${n == null ? '·' : n}</b>${movil ? '' : ' (P)'}`;
    if (panel.hidden) return;
    const v = vecinos();
    $('.nh').textContent = n == null ? '—' : fmt.format(n);
    $('.nv').textContent = fmt.format(v.pueblo);
    $('.nc').textContent = v.cerca == null ? '—' : fmt.format(v.cerca);
    $('.minombre').textContent = nombre;
    $('.con').textContent = estadoCon === 'dentro' ? '' : estadoCon === 'buscando' ? 'Buscando a los demás…' : 'Ahora no se puede ver a los demás: se juega solo, y se sigue intentando.';
    $('.con').hidden = estadoCon === 'dentro';
    const ul = $('ul'); ul.textContent = '';
    const p = ctrl.getPosition();
    const lista = [...otros.values()].filter((o) => o.p.x != null).sort((a, b) => Math.hypot(a.p.x - p.x, a.p.z - p.z) - Math.hypot(b.p.x - p.x, b.p.z - p.z));
    for (const o of lista.slice(0, 20)) {
      const li = document.createElement('li'), b = document.createElement('b'), s = document.createElement('span'), h = document.createElement('span');
      b.textContent = o.p.n || 'Alguien'; h.className = 'hace'; h.textContent = ' · ' + (HACE[o.p.m] || 'por el pueblo');
      s.className = 'sitio'; const d = Math.round(Math.hypot(o.p.x - p.x, o.p.z - p.z));
      s.textContent = donde.texto({ k: o.p.k ?? -1, l: o.p.l ?? -1 }, o.p.x, o.p.z) + (d < 2000 ? ` · a ${fmt.format(d < 20 ? d : Math.round(d / 10) * 10)} m de ti` : '');
      li.append(b, h, s); ul.appendChild(li);
    }
    const vacio = $('.vacio');
    vacio.hidden = estadoCon !== 'dentro' || lista.length > 0;
    vacio.textContent = 'Ahora no hay nadie más. Quien entre aparecerá en el pueblo con su nombre encima, y saldrá aquí.';
  }
  function abrirPanel(modo) {
    if (!modo) { panel.hidden = true; return; }
    panel.className = modo; panel.hidden = false; pintarPanel();
  }
  function entrar() { abrirPanel(null); guardado.poner('g388:nombre', nombre); }
  boton.addEventListener('click', () => abrirPanel(panel.hidden || panel.classList.contains('modal') ? 'esquina' : null));
  $('.cerrar').addEventListener('click', () => (panel.classList.contains('modal') ? entrar() : abrirPanel(null)));
  $('.entrar').addEventListener('click', entrar);
  $('.cambiar').addEventListener('click', () => { const f = $('form.nombre'); f.hidden = !f.hidden; if (!f.hidden) { const i = f.querySelector('input'); i.value = nombre.split(' ')[0]; i.focus(); i.select(); } });
  $('form.nombre').addEventListener('submit', (e) => {
    e.preventDefault(); const n = limpio(e.target.querySelector('input').value);
    if (n.length >= 2) { nombre = n + ' ' + cifras(); guardado.poner('g388:nombre', nombre); mandar(true); }
    e.target.hidden = true; pintarPanel();
  });

  // ---- cada fotograma: los demás en su sitio, sus nombres y bocadillos; lo de aquí, al servidor
  const DIBUJA = 150, LEJOS_NOMBRE = 45, TOPE_FIG = movil ? 8 : 24;
  let cuenta = 0;
  app.on('update', (dt) => {
    const ahora = performance.now(), ver = ahora - 120, p = ctrl.getPosition();
    if ((cadaSitio -= dt) <= 0) { cadaSitio = 1; const e = miEstado(); sitio = donde.de(e.x, e.z); }
    mandar(false);
    // (los más cercanos, con figura; los demás, sin ella)
    const orden = [...otros.values()].filter((o) => o.buf.length).sort((a, b) => Math.hypot(a.p.x - p.x, a.p.z - p.z) - Math.hypot(b.p.x - p.x, b.p.z - p.z));
    orden.forEach((o, i) => {
      const b = o.buf; let x, y, z, r;
      // (entre los dos estados que rodean «ver»; si aún no ha llegado el siguiente, el último)
      let j = b.length - 1; while (j > 0 && b[j - 1][0] > ver) j--;
      if (j > 0 && b[j][0] > ver) { const [t0, x0, y0, z0, r0] = b[j - 1], [t1, x1, y1, z1, r1] = b[j], k = Math.max(0, Math.min(1, (ver - t0) / Math.max(1, t1 - t0))); let dr = r1 - r0; dr -= Math.round(dr / 360) * 360; x = x0 + (x1 - x0) * k; y = y0 + (y1 - y0) * k; z = z0 + (z1 - z0) * k; r = r0 + dr * k; }
      else [, x, y, z, r] = b[b.length - 1];
      const d = Math.hypot(x - p.x, z - p.z), conFigura = d < DIBUJA && i < TOPE_FIG && o.p.m !== 7;
      if (conFigura && !o.raiz) figuraDe(o);
      if (o.raiz) {
        o.raiz.enabled = conFigura;
        if (conFigura) {
          o.raiz.setPosition(x, y, z); o.raiz.setEulerAngles(0, r, 0);
          animar(o, ESTADOS[o.p.a] || 'Quieto'); o.raiz.anim.speed = o.p.s ?? 1; o.saludo?.mover(dt);
        }
      }
      // (el nombre y el bocadillo, sobre la cabeza: a menos de 45 m y delante de la cámara)
      const habla = o.hasta > ahora; if (!habla && !o.bocaDom.hidden) o.bocaDom.hidden = true;
      const alto = o.p.m === 7 ? 1.8 : o.p.m === 3 ? 1.45 : 2.0;
      v1.set(x, y + alto, z); camara.camera.worldToScreen(v1, v2);
      const vis = (d < LEJOS_NOMBRE || habla) && v2.z > 0;
      o.dom.hidden = !vis;
      if (vis) { o.dom.style.transform = `translate(${v2.x.toFixed(1)}px, ${v2.y.toFixed(1)}px) translate(-50%, -100%)`; o.dom.style.opacity = String(Math.max(0.35, Math.min(1, 1.6 - d / LEJOS_NOMBRE))); }
    });
    // (mi bocadillo)
    const yHabla = yoDom.hasta > ahora; if (!yHabla && !yoDom.bocaDom.hidden) yoDom.bocaDom.hidden = true;
    yoDom.dom.hidden = !yHabla;
    if (yHabla) { const f = figura.getPosition(); v1.set(f.x, f.y + 2.0, f.z); camara.camera.worldToScreen(v1, v2); yoDom.dom.style.transform = `translate(${v2.x.toFixed(1)}px, ${v2.y.toFixed(1)}px) translate(-50%, -100%)`; }
    if (hablandoCon && (!otros.has(hablandoCon.id) || !hablandoCon.raiz?.enabled)) hablandoCon = null;
    if ((cuenta++ % 30) === 0) pintarPanel();
  });

  // ---- al empezar: la pantalla inicial (entrando derecho al juego) o, desde la web de 388, el recuadro al posarse
  conectar();
  pintarPanel();
  if (q.get('bienvenida') !== '0') {
    if (desde388) {
      const mira = setInterval(() => {
        if (!document.documentElement.classList.contains('aterrizado')) return;
        clearInterval(mira); abrirPanel('esquina'); setTimeout(() => { if (panel.classList.contains('esquina')) abrirPanel(null); }, 12000);
      }, 300);
    } else abrirPanel('modal');
  }
  return {
    cerca, gesto, abrirPanel, entrar,
    nombre: () => nombre,
    estado: () => ({ conectado: estadoCon, yo, otros: [...otros.values()].map((o) => ({ id: o.id, n: o.p.n, x: o.p.x, z: o.p.z, m: o.p.m, k: o.p.k, l: o.p.l, figura: !!o.raiz?.enabled, anim: o.estado, dice: o.hasta > performance.now() ? o.bocaDom.textContent : null })),
      sitio: donde.texto(sitio), panel: panel.hidden ? null : panel.className, vecinos: vecinos() }),
    decir: (x, a) => { abrirDecir(a ? otros.get(a) : null); decirTexto.value = x; decir.requestSubmit(); },
  };
}

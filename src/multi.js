// El multijugador (docs/multijugador.md). El usuario, el 16-11-2026: «que cada vez que entre una persona dentro de la
// página web y en el pueblo en cuestión, aparezca también en el pueblo y que pueda interaccionar exactamente igual […] que
// pueda entrar de forma asíncrona […] una pantalla inicial que le diga cuántas personas humanas hay y cuántos NPCs hay
// actualmente y dónde se encuentran las personas humanas, en qué calle y en qué lugar».
// - La sala del pueblo en el servidor de 388 (wss://three88-pueblos.onrender.com/ws?room=juego-06060): cada juego manda
//   el estado de su chica unas 8 veces por segundo (dónde está, hacia dónde mira, qué animación, qué hace, en qué calle) y
//   el servidor lo reenvía a los demás. Se entra y se sale cuando se quiera.
// - Los demás, con su figura (la chica de serie o su personaje del editor: src/multi_figuras.js) y su nombre encima, con
//   sus animaciones (andar, correr, saltar, sentarse, bailar, arrodillarse, saludar), dibujados 120 ms por detrás para
//   pasar suave de un estado al siguiente.
// - Hablar: E junto a alguien («Hablar con Lucía 23»), Intro o el botón «Hablar»: lo dicho sale en un bocadillo sobre la
//   cabeza y en la lista de abajo a la izquierda. Saludar (Q), también. A quien moleste se le silencia (solo para uno) o
//   se le denuncia (con dos denuncias se queda sin hablar 15 minutos para todos).
// - Los coches (src/multi_coches.js): se ve conducir a los demás, los coches se quedan donde los dejan y se puede ir de
//   copiloto. Los vecinos (src/multi_gente.js): los mismos para todos los que andan cerca.
// - La hora, la de la sala (reloj.sincronizar): la misma para todos.
// - «Guareña, ahora» (la pantalla inicial y el botón «Quién hay», P): cuántas personas, cuántos vecinos y dónde está cada
//   persona (src/donde.js).
// Sin servidor (dormido, sin red, ?multi=0) se juega solo, como antes. ?multi=ws://127.0.0.1:<puerto> usa uno en local;
// ?nombre= pone el nombre; ?bienvenida=0 no enseña la pantalla inicial (las pruebas).
import { Vec3 } from 'playcanvas';
import { enLaCalle, VECINOS } from './gente.js';
import { HACE, montarDonde } from './donde.js';
import { ESTADOS, montarFiguras, personajeCorto } from './multi_figuras.js';
import { montarCochesMulti } from './multi_coches.js';
import { montarGenteMulti } from './multi_gente.js';

const SERVIDOR = 'wss://three88-pueblos.onrender.com/ws';
const PUEBLOS = { guarena: '06060' };
const NOMBRES = ['Lucía', 'Carmen', 'María', 'Paula', 'Elena', 'Julia', 'Sara', 'Marta', 'Alba', 'Irene', 'Laura', 'Noelia', 'Rocío', 'Pilar', 'Inés', 'Nerea', 'Andrea', 'Claudia', 'Sofía', 'Valeria'];
const LETRAS = /[^A-Za-zÁÉÍÓÚÑáéíóúñü]/g;
const guardado = { leer: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, poner: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } } };

export function montarMulti({ app, q, escena, ctrl, muneco, tpc, camara, reloj, vida, personaje, clips, movil, desde388, mio, estadoMio, glb }) {
  const pueblo = PUEBLOS[escena];
  if (q.get('multi') === '0' || !pueblo) return null;
  const local = q.get('multi') && /^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q.get('multi')) ? q.get('multi').replace(/\/$/, '') + '/ws' : null;
  // (el aparato: un número al azar guardado en el navegador; si a alguien le denuncian, se le calla a él y no a todos los
  // de su misma conexión)
  let aparato = guardado.leer('g388:aparato');
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(aparato || '')) { aparato = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[b & 63]).join(''); guardado.poner('g388:aparato', aparato); }
  const url = (local || SERVIDOR) + '?room=juego-' + pueblo + '&d=' + aparato;
  const donde = montarDonde({ vida, reloj });
  const figura = muneco.children[0];
  const miPj = mio ? personajeCorto(estadoMio) : null;

  // ---- el nombre: letras (hasta 12) y dos cifras, como «Lucía 23»; se guarda en el navegador
  const cifras = () => String(Math.floor(Math.random() * 90) + 10);
  const limpio = (s) => String(s || '').replace(LETRAS, '').slice(0, 12);
  let nombre = guardado.leer('g388:nombre');
  if (q.get('nombre') && limpio(q.get('nombre')).length >= 2) nombre = limpio(q.get('nombre')) + ' ' + cifras();
  if (!nombre || !/^[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,12} \d{2}$/.test(nombre)) nombre = NOMBRES[Math.floor(Math.random() * NOMBRES.length)] + ' ' + cifras();
  guardado.poner('g388:nombre', nombre);
  // (a quién se ha silenciado: por su nombre, en este navegador)
  const silencio = new Set((() => { try { return JSON.parse(guardado.leer('g388:silencio') || '[]'); } catch (e) { return []; } })().filter((x) => typeof x === 'string'));
  const guardarSilencio = () => guardado.poner('g388:silencio', JSON.stringify([...silencio].slice(-50)));

  // ---- la interfaz
  const css = document.createElement('style');
  css.textContent = `
  #multi-capa { position: fixed; inset: 0; pointer-events: none; z-index: 4; overflow: hidden; }
  .otro { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; gap: 4px; will-change: transform; }
  .otro .nombre { padding: 3px 8px; border-radius: 999px; background: var(--velo, rgba(7, 10, 20, .62)); border: 1px solid var(--linea, rgba(186, 198, 255, .16)); color: var(--cal, #eef0ec);
    font: 500 10px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
  .otro .bocadillo { max-width: 240px; padding: 7px 11px; border-radius: 14px; background: rgba(238, 240, 236, .94); color: var(--tinta, #0c1122); font: 400 13px/1.35 var(--f-display, Arial, sans-serif);
    box-shadow: 0 4px 18px rgba(0, 0, 0, .25); text-align: left; overflow-wrap: anywhere; }
  .otro .bocadillo[hidden], .otro[hidden] { display: none; }
  .multi-pildora { position: fixed; bottom: calc(56px + env(safe-area-inset-bottom, 0px)); z-index: 6; padding: 8px 13px; border-radius: 999px;
    background: var(--velo, rgba(7, 10, 20, .62)); border: 1px solid var(--linea, rgba(186, 198, 255, .16)); color: var(--cal, #eef0ec); font: 500 11px/1.2 var(--f-mono, ui-monospace, Menlo, monospace);
    letter-spacing: .09em; text-transform: uppercase; cursor: pointer; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); touch-action: manipulation; }
  .multi-pildora b { color: var(--sodio, #ffa94d); font-weight: 500; }
  #multi-boton { left: calc(14px + env(safe-area-inset-left, 0px)); }
  #multi-hablar[hidden] { display: none; }
  #multi-log { position: fixed; left: calc(14px + env(safe-area-inset-left, 0px)); bottom: calc(100px + env(safe-area-inset-bottom, 0px)); z-index: 6; display: flex; flex-direction: column; gap: 4px;
    max-width: min(420px, calc(100vw - 28px)); pointer-events: none; }
  #multi-log p { margin: 0; padding: 6px 10px; border-radius: 12px; background: var(--velo, rgba(7, 10, 20, .62)); color: var(--cal, #eef0ec); font: 400 13px/1.35 var(--f-display, Arial, sans-serif);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); transition: opacity .6s; overflow-wrap: anywhere; }
  #multi-log p b { font-weight: 600; color: var(--sodio-2, #ffcf91); }
  #multi-log p.aviso { border: 1px solid var(--sodio, #ffa94d); }
  #multi-decir { position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 7; display: flex; gap: 8px; align-items: center;
    width: min(560px, calc(100vw - 28px)); padding: 8px; border-radius: 999px; background: var(--velo, rgba(7, 10, 20, .72)); border: 1px solid var(--linea, rgba(186, 198, 255, .16));
    -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); box-sizing: border-box; }
  #multi-decir[hidden] { display: none; }
  #multi-decir span { padding-left: 10px; color: var(--sodio, #ffa94d); font: 500 10px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  #multi-decir input { flex: 1; min-width: 0; padding: 8px 10px; border: 0; border-radius: 999px; background: rgba(238, 240, 236, .1); color: var(--cal, #eef0ec); font: 400 16px/1.3 var(--f-display, Arial, sans-serif); outline: none; }
  #multi-decir button, #multi-panel button { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--sodio, #ffa94d); background: var(--sodio, #ffa94d); color: var(--tinta, #0c1122);
    font: 500 11px/1.2 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .09em; text-transform: uppercase; cursor: pointer; }
  #multi-decir .cerrar-decir { background: transparent; border-color: var(--linea, rgba(186, 198, 255, .16)); color: var(--cal, #eef0ec); padding: 8px 11px; }
  #multi-panel { position: fixed; z-index: 8; box-sizing: border-box; color: var(--cal, #eef0ec); background: rgba(7, 10, 20, .78); border: 1px solid var(--linea, rgba(186, 198, 255, .16)); border-radius: 22px;
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
  #multi-panel li .mas { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
  #multi-panel li .mas button { padding: 5px 10px; font-size: 10px; background: transparent; color: var(--cal, #eef0ec); border-color: var(--linea, rgba(186, 198, 255, .16)); }
  #multi-panel li .mas button.si { background: var(--sodio, #ffa94d); color: var(--tinta, #0c1122); border-color: var(--sodio, #ffa94d); }
  #multi-panel li .mas p { flex-basis: 100%; margin: 0; color: var(--niebla, #9ba4c8); font-size: 13px; }
  #multi-panel li.callado { opacity: .62; }
  #multi-panel .vacio, #multi-panel .con { margin: 0 0 12px; color: var(--niebla, #9ba4c8); font-size: 14px; line-height: 1.4; }
  #multi-panel .yo { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 4px; font-size: 14px; }
  #multi-panel .yo .cambiar { background: transparent; color: var(--cal, #eef0ec); border-color: var(--linea, rgba(186, 198, 255, .16)); }
  #multi-panel form { display: flex; gap: 8px; margin-top: 10px; }
  #multi-panel form[hidden] { display: none; }
  #multi-panel form input { flex: 1; min-width: 0; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--linea, rgba(186, 198, 255, .16)); background: rgba(238, 240, 236, .08); color: var(--cal, #eef0ec); font: 400 16px/1.3 var(--f-display, Arial, sans-serif); }
  #multi-panel .entrar { width: 100%; margin-top: 16px; padding: 13px 18px; font-size: 12px; }
  #multi-panel.esquina .entrar, #multi-panel.esquina .yo { display: none; }
  @media (pointer: coarse) { .multi-pildora { padding: 12px 16px; font-size: 12px; } #multi-panel li .mas button { padding: 9px 13px; font-size: 11px; } #multi-decir button { padding: 11px 15px; } }
  @media (max-width: 760px) { #multi-panel .cifras b { font-size: 22px; } #multi-panel h2 { font-size: 24px; } #multi-panel.esquina { padding: 14px; } #multi-panel .cifras div { padding: 8px; }
    body.multi-escribe .multi-pildora { visibility: hidden; } }`;   /* (en el móvil, la barra de escribir va donde los botones de abajo) */
  document.head.appendChild(css);
  const capaDom = document.createElement('div'); capaDom.id = 'multi-capa'; document.body.appendChild(capaDom);
  const log = document.createElement('div'); log.id = 'multi-log'; document.body.appendChild(log);
  const boton = document.createElement('button'); boton.id = 'multi-boton'; boton.className = 'multi-pildora'; boton.type = 'button'; document.body.appendChild(boton);
  // (hablar sin teclado —el móvil— y para que se sepa que se puede: al lado de «Quién hay»)
  const bHablar = document.createElement('button'); bHablar.id = 'multi-hablar'; bHablar.className = 'multi-pildora'; bHablar.type = 'button'; bHablar.hidden = true;
  bHablar.textContent = movil ? 'Hablar' : 'Hablar (Intro)'; document.body.appendChild(bHablar);
  const decir = document.createElement('form'); decir.id = 'multi-decir'; decir.hidden = true;
  decir.innerHTML = '<span></span><input type="text" maxlength="140" autocomplete="off" enterkeyhint="send" aria-label="Lo que dices"><button type="submit">Decir</button>' + (movil ? '<button type="button" class="cerrar-decir" aria-label="Cerrar">×</button>' : '');
  document.body.appendChild(decir);
  const [decirA, decirTexto] = [decir.querySelector('span'), decir.querySelector('input')];
  decir.querySelector('.cerrar-decir')?.addEventListener('click', () => cerrarDecir());
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
  for (const el of [boton, bHablar, panel, decir]) for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'mousedown']) el.addEventListener(ev, (e) => e.stopPropagation()); // (que el toque no mueva la cámara)
  // (en el móvil, la barra de hablar encima del teclado: el teclado tapa la parte de abajo de la pantalla)
  const vv = window.visualViewport;
  const sobreTeclado = () => { if (!vv) return; const tapa = Math.max(0, innerHeight - vv.height - vv.offsetTop); decir.style.bottom = tapa > 40 ? (tapa + 10) + 'px' : ''; };
  vv?.addEventListener('resize', sobreTeclado); vv?.addEventListener('scroll', sobreTeclado);

  // ---- los demás
  const otros = new Map(); // id → { id, o (orden de llegada), p (su estado), pj, buf: [[t, x, y, z, r]], fig, dom, nombreDom, bocaDom, hasta }
  let ws = null, yo = null, miOrden = null, reintentos = 0, estadoCon = 'buscando', sincronizado = false, calladoHasta = 0;
  const v1 = new Vec3(), v2 = new Vec3();
  const nombreDe = (o) => o?.p?.n || 'alguien';
  const figuras = montarFiguras({ app, q, personaje, clips, mio, movil, glb: glb || ((u) => u) });
  const enviar = (o) => { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) { /* se reconecta */ } } };
  const coches = montarCochesMulti({ app, ctrl, tpc, muneco, camara, movil, enviar, otros, nombreDe });
  const genteM = montarGenteMulti({ enviar, otros, yo: () => yo, miOrden: () => miOrden, miPos: () => ctrl.getPosition() });

  function crear(id, p = {}, orden = null) {
    if (otros.has(id) || id === yo) return otros.get(id);
    const dom = document.createElement('div'); dom.className = 'otro'; dom.hidden = true;
    dom.innerHTML = '<div class="bocadillo" hidden></div><div class="nombre"></div>'; capaDom.appendChild(dom);
    const o = { id, o: orden, p: {}, pj: null, buf: [], fig: null, dom, nombreDom: dom.querySelector('.nombre'), bocaDom: dom.querySelector('.bocadillo'), hasta: 0 };
    otros.set(id, o); recibirEstado(o, p); return o;
  }
  function quitar(id) {
    const o = otros.get(id); if (!o) return;
    coches.sale(id); genteM.sale(id); figuras.quitar(o);
    o.dom.remove(); otros.delete(id); pintarPanel();
  }
  function recibirEstado(o, p) {
    Object.assign(o.p, p);
    o.visto = performance.now();
    if (p.x != null && p.z != null) { o.buf.push([performance.now(), o.p.x, o.p.y ?? 0, o.p.z, o.p.r ?? 0]); if (o.buf.length > 12) o.buf.shift(); }
    const t = (o.p.n || 'Alguien') + (o.p.m === 7 ? ' · conduciendo' : o.p.m === 10 ? ' · de copiloto' : '');
    if (o.nombreDom.textContent !== t) o.nombreDom.textContent = t;
  }
  function bocadillo(o, texto) {
    o.bocaDom.textContent = texto; o.bocaDom.hidden = false; o.hasta = performance.now() + 5000 + texto.length * 70;
  }
  function apuntar(quien, texto, ati, aviso = false) {
    const p = document.createElement('p'); if (aviso) p.className = 'aviso';
    const b = document.createElement('b'); b.textContent = quien + (ati ? ' te dice' : '') + ': ';
    p.append(b, document.createTextNode(texto)); log.appendChild(p);
    while (log.children.length > 4) log.firstChild.remove();
    setTimeout(() => { p.style.opacity = '0'; setTimeout(() => p.remove(), 700); }, aviso ? 20000 : 14000);
  }

  // ---- la conexión
  function conectar() {
    if (ws) return;
    try { ws = new WebSocket(url); } catch (e) { ws = null; volver(); return; }
    ws.onopen = () => { reintentos = 0; estadoCon = 'dentro'; ultimo = null; mandar(true); pintarPanel(); };
    ws.onmessage = (e) => { let d; try { d = JSON.parse(e.data); } catch (_) { return; } recibir(d); };
    ws.onclose = () => { ws = null; yo = null; miOrden = null; for (const id of [...otros.keys()]) quitar(id); genteM.reset(); estadoCon = reintentos >= 2 ? 'solo' : 'buscando'; pintarPanel(); volver(); };
    ws.onerror = () => {};
  }
  function volver() { const t = Math.min(30000, 2500 * 2 ** reintentos++); setTimeout(conectar, t); }
  function recibir(d) {
    if (d.t === 'sala') {
      yo = d.yo; miOrden = d.o ?? null;
      // (la hora de la sala: la de España cuando entró el primero; la T solo cambia la de cada uno)
      if (!sincronizado || q.get('resincronizar') !== '0') { if (reloj?.sincronizar?.(d.t0, d.ahora)) sincronizado = true; }
      for (const o of d.otros || []) { const x = crear(o.id, o.p, o.o ?? null); if (x) { x.o = o.o ?? x.o; x.pj = o.pj || null; } }
      coches.sala(d.coches);
      if (miPj) enviar({ t: 'pj', f: miPj });
      mandar(true);
      pintarPanel();
    } else if (d.t === 'entra') { const o = crear(d.id, {}, d.o ?? null); if (o) o.o = d.o ?? o.o; pintarPanel(); }
    else if (d.t === 'sale') quitar(d.id);
    else if (d.t === 'j') { const o = otros.get(d.id) || crear(d.id); recibirEstado(o, d.p || {}); }
    else if (d.t === 'pj') { const o = otros.get(d.id) || crear(d.id); o.pj = d.f || null; }
    else if (d.t === 'g') { const o = otros.get(d.id); if (o && d.k === 1) o.fig?.saludo?.empezar(); }
    else if (d.t === 'cd') coches.dejado(d.o, d.x, d.y, d.z, d.r);
    else if (d.t === 'gv' || d.t === 'go') genteM.recibir(d);
    else if (d.t === 'callado') {
      // (la primera vez, el aviso; si se vuelve a escribir, ya lo dice el envío)
      if (calladoHasta < performance.now()) apuntar('Aviso', `Te han denunciado por lo que has dicho: durante ${Math.max(1, Math.round((d.s || 900) / 60))} minutos los demás no verán lo que escribes.`, false, true);
      calladoHasta = performance.now() + (d.s || 900) * 1000;
    } else if (d.t === 'denunciado') { const o = otros.get(d.a); apuntar('Aviso', `Has denunciado a ${nombreDe(o)}. Ya no verás lo que dice; si lo denuncia alguien más, se quedará sin hablar un rato.`, false, true); }
    else if (d.t === 'di') {
      const o = otros.get(d.id); if (!o || typeof d.x !== 'string') return;
      if (silencio.has(o.p.n)) return; // (silenciado: ni bocadillo ni lista)
      const ati = d.a && d.a === yo;
      const p = posDe(o);
      // (lo oyen los que están cerca, a menos de 25 m; si va dirigido a ti, siempre)
      if (ati || (p && Math.hypot(p[0] - ctrl.getPosition().x, p[2] - ctrl.getPosition().z) < 25)) { bocadillo(o, d.x); apuntar(o.p.n || 'Alguien', d.x, ati); }
    }
  }
  // (al cerrar la página, adiós: el aviso de cierre del navegador no siempre llega pasando por el proxy del servidor, y los
  // demás la seguían viendo quieta un rato)
  addEventListener('pagehide', () => { enviar({ t: 'adios' }); try { ws?.close(); } catch (e) { /* ya cerrado */ } });
  // (y algo cada 2 s aunque no se dibuje —la pestaña de detrás—: si no, a los 20 s el servidor la daba por ida)
  setInterval(() => { if (document.hidden) mandar(false); }, 2000);

  // ---- lo de aquí: la chica, cómo está y dónde
  const acc = () => window.foto?.acciones?.estado?.() || null;
  const con = () => window.foto?.conducir?.estado?.() || null;
  let sitio = { k: -1, l: -1 }, sitioTexto = '', cadaSitio = 0, hablandoCon = null;
  const vecinosAhora = () => { const g = window.foto?.gente?.cuantos?.(); return g ? g.enLaCalle : null; };
  function miEstado() {
    const c = con(), a = acc(), mc = coches.mio();
    let x, y, z, r;
    if (mc.m === 10 && mc.pos) [x, y, z, r] = mc.pos;
    else if (c?.modo === 'conduciendo' && c.pos) { [x, y, z] = c.pos; r = c.rumbo ?? 0; }
    else { const p = figura.getPosition(), f = figura.forward; x = p.x; y = p.y; z = p.z; r = Math.atan2(-f.x, -f.z) * 180 / Math.PI; }
    const an = muneco.anim?.baseLayer?.activeState || 'Quieto';
    const modo = a?.modo;
    const m = mc.m === 10 ? 10 : c?.modo === 'conduciendo' ? 7 : !decir.hidden || hablandoCon ? 6 : modo === 'hablando' ? 6 : /sentada|sentandose|levantandose/.test(modo || '') ? 3 : modo === 'bailando' ? 4 : modo === 'rodillas' ? 5
      : modo === 'vela' ? 8 : an === 'Correr' ? 2 : an === 'Andar' ? 1 : an === 'Saltar' ? 9 : 0;
    return { t: 'j', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100, r: Math.round(r * 10) / 10, a: Math.max(0, ESTADOS.indexOf(an)),
      s: Math.round((muneco.anim?.speed ?? 1) * 100) / 100, m, k: sitio.k, l: sitio.l, n: nombre, co: mc.co, cp: mc.cp, h: genteM.h(), w: sitioTexto, nv: vecinosAhora() ?? undefined };
  }
  let ultimo = null, tUltimo = 0, mandado = {};
  function mandar(forzar) {
    const e = miEstado(), ahora = performance.now();
    const cambia = !ultimo || Math.hypot(e.x - ultimo.x, e.y - ultimo.y, e.z - ultimo.z) > 0.02 || Math.abs(e.r - ultimo.r) > 1 || ['a', 'm', 'k', 'l', 'n', 'co', 'cp', 'h', 'w'].some((k) => e[k] !== ultimo[k]) || Math.abs(e.s - ultimo.s) > 0.05;
    if (forzar || (cambia && ahora - tUltimo > 120) || ahora - tUltimo > 2000) {
      // (lo que cambia poco —dónde está en palabras, cuántos vecinos, el coche, a quién sigue—, solo cuando cambia)
      const sale = { ...e };
      for (const k of ['w', 'nv', 'co', 'cp', 'h']) { if (sale[k] === undefined || (!forzar && sale[k] === mandado[k])) delete sale[k]; else mandado[k] = sale[k]; }
      enviar(sale); ultimo = e; tUltimo = ahora;
    }
  }
  const gesto = (k) => enviar({ t: 'g', k });

  // ---- hablar: E junto a alguien (src/acciones.js pregunta a cerca()), Intro o el botón «Hablar»
  function abrirDecir(o) {
    hablandoCon = o || null;
    decirA.textContent = o ? 'A ' + (o.p.n || 'alguien') : 'A los de alrededor';
    decir.hidden = false; decirTexto.value = ''; setTimeout(() => decirTexto.focus(), 0); document.body.classList.add('multi-escribe');
  }
  function cerrarDecir() { decir.hidden = true; hablandoCon = null; decirTexto.blur(); decir.style.bottom = ''; document.body.classList.remove('multi-escribe'); }
  decir.addEventListener('submit', (e) => {
    e.preventDefault();
    const x = decirTexto.value.replace(/\s+/g, ' ').trim().slice(0, 140);
    if (x) {
      enviar({ t: 'di', x, ...(hablandoCon?.id ? { a: hablandoCon.id } : {}) });
      bocadillo(yoDom, x); apuntar('Tú', x, false);
      if (calladoHasta > performance.now()) apuntar('Aviso', 'Ahora los demás no ven lo que escribes: te han denunciado. Se te pasará en unos minutos.', false, true);
    }
    cerrarDecir();
  });
  const masCerca = () => { const p = ctrl.getPosition(); let o = null, md = 6; for (const x of otros.values()) { if (!x.fig?.raiz?.enabled) continue; const d = x.fig.raiz.getPosition().distance(p); if (d < md) { md = d; o = x; } } return o; };
  bHablar.addEventListener('click', () => { if (decir.hidden) abrirDecir(masCerca()); else cerrarDecir(); });
  // (mi bocadillo, sobre mi cabeza)
  const yoDom = (() => { const dom = document.createElement('div'); dom.className = 'otro'; dom.hidden = true; dom.innerHTML = '<div class="bocadillo" hidden></div>'; capaDom.appendChild(dom); return { dom, bocaDom: dom.querySelector('.bocadillo'), hasta: 0, yo: true }; })();
  const posDe = (o) => (o.buf.length ? [o.buf[o.buf.length - 1][1], o.buf[o.buf.length - 1][2], o.buf[o.buf.length - 1][3]] : null);
  // (lo que toca con E: hablar con quien está al lado, o subir de copiloto al coche que conduce alguien; lo más cerca)
  function cerca(p) {
    let mejor = null, md = 2.6;
    for (const o of otros.values()) {
      if (!o.fig?.raiz?.enabled || o.p.m === 7 || o.p.m === 10) continue;
      const q_ = o.fig.raiz.getPosition(), d = Math.hypot(q_.x - p.x, q_.z - p.z);
      if (d < md) { md = d; mejor = o; }
    }
    const k = coches.cerca(p);
    if (k && (!mejor || Math.hypot(k.x - p.x, k.z - p.z) < md)) return k;
    return mejor && { x: mejor.fig.raiz.getPosition().x, z: mejor.fig.raiz.getPosition().z, nombre: mejor.p.n || 'alguien', hablar: () => abrirDecir(mejor) };
  }
  addEventListener('keydown', (e) => {
    if (e.repeat || e.target?.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!panel.hidden && panel.classList.contains('modal')) { if (e.code === 'Enter') { e.preventDefault(); entrar(); } return; }
    if (e.code === 'Enter' && acc()?.modo !== 'hablando' && con()?.modo !== 'conduciendo') { e.preventDefault(); abrirDecir(masCerca()); }
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
  const abiertoDenunciar = new Set(); // (a quién se le está preguntando si denunciar)
  let tocado = -1e9; panel.addEventListener('pointerdown', () => { tocado = performance.now(); }, true);
  const denunciados = new Set();
  function silenciar(o, si) {
    if (!o?.p?.n) return;
    if (si) { silencio.add(o.p.n); o.bocaDom.hidden = true; o.hasta = 0; } else silencio.delete(o.p.n);
    guardarSilencio(); pintarPanel(true);
  }
  function denunciar(o) {
    if (!o) return;
    enviar({ t: 'den', a: o.id }); denunciados.add(o.id); abiertoDenunciar.delete(o.id);
    silenciar(o, true);
  }
  function pintarPanel(forzar) {
    const n = estadoCon === 'dentro' ? otros.size + 1 : null;
    boton.innerHTML = `Quién hay <b>${n == null ? '·' : n}</b>${movil ? '' : ' (P)'}`;
    // (el botón de hablar, a la derecha del de «Quién hay», con gente en la sala)
    bHablar.hidden = !(estadoCon === 'dentro' && otros.size > 0);
    bHablar.style.left = `calc(${boton.offsetWidth + 22}px + env(safe-area-inset-left, 0px))`;
    if (panel.hidden) return;
    // (con un botón de la lista bajo el ratón o recién tocado, no se rehace: se perdería el toque)
    if (!forzar && (performance.now() - tocado < 900 || panel.querySelector('li .mas button:hover'))) return;
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
      li.dataset.id = o.id;
      const calla = silencio.has(o.p.n); if (calla) li.className = 'callado';
      b.textContent = o.p.n || 'Alguien'; h.className = 'hace'; h.textContent = ' · ' + (HACE[o.p.m] || 'por el pueblo') + (calla ? ' · silenciada' : '');
      s.className = 'sitio'; const d = Math.round(Math.hypot(o.p.x - p.x, o.p.z - p.z));
      s.textContent = donde.texto({ k: o.p.k ?? -1, l: o.p.l ?? -1 }, o.p.x, o.p.z) + (d < 2000 ? ` · a ${fmt.format(d < 20 ? d : Math.round(d / 10) * 10)} m de ti` : '');
      // (silenciar —solo para ti— y denunciar —con dos denuncias, sin hablar 15 minutos para todos—)
      const mas = document.createElement('div'); mas.className = 'mas';
      if (abiertoDenunciar.has(o.id)) {
        const t = document.createElement('p'); t.textContent = `¿Denunciar a ${o.p.n || 'esta persona'} por lo que dice? Dejarás de verlo; si alguien más lo denuncia, se quedará sin hablar 15 minutos.`;
        const si = document.createElement('button'); si.type = 'button'; si.className = 'si denunciar-si'; si.textContent = 'Sí, denunciar'; si.addEventListener('click', () => { denunciar(o); pintarPanel(true); });
        const no = document.createElement('button'); no.type = 'button'; no.textContent = 'No'; no.addEventListener('click', () => { abiertoDenunciar.delete(o.id); pintarPanel(true); });
        mas.append(t, si, no);
      } else {
        const bs = document.createElement('button'); bs.type = 'button'; bs.className = 'silenciar'; bs.textContent = calla ? 'Volver a oír' : 'Silenciar'; bs.addEventListener('click', () => silenciar(o, !calla));
        mas.append(bs);
        if (!denunciados.has(o.id)) { const bd = document.createElement('button'); bd.type = 'button'; bd.className = 'denunciar'; bd.textContent = 'Denunciar'; bd.addEventListener('click', () => { abiertoDenunciar.add(o.id); pintarPanel(true); }); mas.append(bd); }
      }
      li.append(b, h, s, mas); ul.appendChild(li);
    }
    const vacio = $('.vacio');
    vacio.hidden = estadoCon !== 'dentro' || lista.length > 0;
    vacio.textContent = 'Ahora no hay nadie más. Quien entre aparecerá en el pueblo con su nombre encima, y saldrá aquí.';
  }
  function abrirPanel(modo) {
    if (!modo) { panel.hidden = true; return; }
    panel.className = modo; panel.hidden = false; pintarPanel(true);
  }
  function entrar() { abrirPanel(null); guardado.poner('g388:nombre', nombre); }
  boton.addEventListener('click', () => abrirPanel(panel.hidden || panel.classList.contains('modal') ? 'esquina' : null));
  $('.cerrar').addEventListener('click', () => (panel.classList.contains('modal') ? entrar() : abrirPanel(null)));
  $('.entrar').addEventListener('click', entrar);
  $('.cambiar').addEventListener('click', () => { const f = $('form.nombre'); f.hidden = !f.hidden; if (!f.hidden) { const i = f.querySelector('input'); i.value = nombre.split(' ')[0]; i.focus(); i.select(); } });
  $('form.nombre').addEventListener('submit', (e) => {
    e.preventDefault(); const n = limpio(e.target.querySelector('input').value);
    if (n.length >= 2) { nombre = n + ' ' + cifras(); guardado.poner('g388:nombre', nombre); mandar(true); }
    e.target.hidden = true; pintarPanel(true);
  });

  // ---- cada fotograma: los demás en su sitio, sus nombres y bocadillos; lo de aquí, al servidor
  const DIBUJA = 150, LEJOS_NOMBRE = 45, TOPE_FIG = movil ? 8 : 24;
  let cuenta = 0;
  app.on('update', (dt) => {
    const ahora = performance.now(), ver = ahora - 120, p = ctrl.getPosition();
    if ((cadaSitio -= dt) <= 0) { cadaSitio = 1; const e = miEstado(); sitio = donde.de(e.x, e.z); sitioTexto = donde.texto(sitio, e.x, e.z); }
    genteM.mover(dt);
    mandar(false);
    // (quien lleva 25 s sin decir nada se ha ido aunque el servidor no lo haya dicho: cada uno manda algo cada 2 s)
    for (const o of otros.values()) if (ahora - (o.visto || ahora) > 25000) quitar(o.id);
    // (los más cercanos, con figura; los demás, sin ella. Con su personaje del editor, los primeros que lo llevan)
    const orden = [...otros.values()].filter((o) => o.buf.length).sort((a, b) => Math.hypot(a.p.x - p.x, a.p.z - p.z) - Math.hypot(b.p.x - p.x, b.p.z - p.z));
    let propios = 0;
    orden.forEach((o, i) => {
      const b = o.buf; let x, y, z, r;
      // (entre los dos estados que rodean «ver»; si aún no ha llegado el siguiente, el último)
      let j = b.length - 1; while (j > 0 && b[j - 1][0] > ver) j--;
      if (j > 0 && b[j][0] > ver) { const [t0, x0, y0, z0, r0] = b[j - 1], [t1, x1, y1, z1, r1] = b[j], k = Math.max(0, Math.min(1, (ver - t0) / Math.max(1, t1 - t0))); let dr = r1 - r0; dr -= Math.round(dr / 360) * 360; x = x0 + (x1 - x0) * k; y = y0 + (y1 - y0) * k; z = z0 + (z1 - z0) * k; r = r0 + dr * k; }
      else [, x, y, z, r] = b[b.length - 1];
      coches.dibujar(o, x, y, z, r, dt);
      const d = Math.hypot(x - p.x, z - p.z), enCoche = o.p.m === 7 || o.p.m === 10, conFigura = d < DIBUJA && i < TOPE_FIG && !enCoche;
      const propio = conFigura && !!o.pj && propios < figuras.MAX_PROPIOS && d < (o.fig?.tipo === 'propio' ? 90 : 60);
      if (propio) propios++;
      const f = conFigura ? figuras.de(o, propio) : o.fig;
      if (f) {
        f.ver(conFigura);
        if (conFigura) {
          f.raiz.setPosition(x, y, z); f.raiz.setEulerAngles(0, r, 0);
          f.animar(ESTADOS[o.p.a] || 'Quieto'); f.raiz.anim.speed = o.p.s ?? 1; f.saludo?.mover(dt);
          if (f.mi) f.mi.actualizar(dt, camara);   // (el parpadeo, la mirada y la melena simulada, que si no se mueve se queda atrás)
        }
      }
      // (el nombre y el bocadillo, sobre la cabeza —o sobre el coche—: a menos de 45 m y delante de la cámara)
      const habla = o.hasta > ahora; if (!habla && !o.bocaDom.hidden) o.bocaDom.hidden = true;
      const alto = o.p.m === 7 ? 1.8 : o.p.m === 10 ? 2.3 : o.p.m === 3 ? 1.45 : (f?.mi?.altura || 1.65) + 0.35;
      v1.set(x, y + alto, z); camara.camera.worldToScreen(v1, v2);
      const vis = (d < LEJOS_NOMBRE || habla) && v2.z > 0;
      o.dom.hidden = !vis;
      if (vis) { o.dom.style.transform = `translate(${v2.x.toFixed(1)}px, ${v2.y.toFixed(1)}px) translate(-50%, -100%)`; o.dom.style.opacity = String(Math.max(0.35, Math.min(1, 1.6 - d / LEJOS_NOMBRE))); }
    });
    // (mi bocadillo)
    const yHabla = yoDom.hasta > ahora; if (!yHabla && !yoDom.bocaDom.hidden) yoDom.bocaDom.hidden = true;
    yoDom.dom.hidden = !yHabla;
    if (yHabla) { const f = coches.copiloto() ? ctrl.getPosition() : figura.getPosition(); v1.set(f.x, f.y + 2.0, f.z); camara.camera.worldToScreen(v1, v2); yoDom.dom.style.transform = `translate(${v2.x.toFixed(1)}px, ${v2.y.toFixed(1)}px) translate(-50%, -100%)`; }
    if (hablandoCon && (!otros.has(hablandoCon.id) || !hablandoCon.fig?.raiz?.enabled)) hablandoCon = null;
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
    copiloto: () => coches.copiloto(),
    estado: () => ({ conectado: estadoCon, yo, orden: miOrden, anfitrion: genteM.anfitrion(), modoGente: window.foto?.gente?.modoActual ?? null,
      otros: [...otros.values()].map((o) => ({ id: o.id, n: o.p.n, x: o.p.x, z: o.p.z, m: o.p.m, k: o.p.k, l: o.p.l, h: o.p.h, co: o.p.co, figura: !!o.fig?.raiz?.enabled, tipo: o.fig?.tipo || null, pj: !!o.pj, errFig: o.figError || null, msFig: o.figMs ?? null, anim: o.fig?.estado || null, dice: o.hasta > performance.now() ? o.bocaDom.textContent : null })),
      sitio: donde.texto(sitio), panel: panel.hidden ? null : panel.className, vecinos: vecinos(), coches: coches.estado(), silencio: [...silencio], callado: calladoHasta > performance.now() }),
    decir: (x, a) => { abrirDecir(a ? otros.get(a) : null); decirTexto.value = x; decir.requestSubmit(); },
    silenciar: (id, si = true) => silenciar(otros.get(id), si),
    denunciar: (id) => denunciar(otros.get(id)),
    subirCopiloto: (id) => coches.subir(id), bajarCopiloto: () => coches.bajar(),
  };
}

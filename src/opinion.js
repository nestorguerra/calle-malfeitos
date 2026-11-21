// La opinión de quien prueba el juego (21-11-2026; el usuario: «estoy con beta testers […] un botón […] que siempre que
// lo aprietes puedas hacer una captura de pantalla y escribir un feedback, incluso por voz»). Con la O, o con el botón
// «Opinión»: saca una captura de lo que se ve en ese momento y abre un panel para escribir y, si se quiere, grabar la
// voz (hasta un minuto). Al enviar, va al servidor de 388 (/api/opinion), que transcribe la voz y se lo manda al equipo
// por correo.
// - No se envía nada hasta que se pulsa «Enviar». El micrófono solo se pide al pulsar «Grabar voz».
// - La W no puede ser: es andar. La P es «Quién hay».
// - Se carga sola desde la página (no toca src/main.js): espera a window.foto.
// - ?opinion=0 lo quita; ?opinion=http://127.0.0.1:PUERTO lo manda a un servidor local, para las pruebas.
const q = new URLSearchParams(location.search);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/;
const SERVIDOR = LOCAL.test(q.get('opinion') || '') ? q.get('opinion').replace(/\/$/, '') + '/api/opinion' : 'https://three88-pueblos.onrender.com/api/opinion';
const TOPE_VOZ = 60, ANCHO = 1280;

const espera = () => new Promise((r) => { const c = () => (window.foto && window.foto.cargado ? r(window.foto) : setTimeout(c, 400)); c(); });
const a64 = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1] || ''); f.readAsDataURL(blob); });

// la captura: en el fotograma recién dibujado (después, el lienzo de WebGPU ya no tiene la imagen), reducida a ANCHO
function capturar(foto) {
  return new Promise((r) => {
    const lienzo = foto.app.graphicsDevice.canvas; let hecho = false;
    const sacar = () => {
      if (hecho) return; hecho = true;
      try {
        const k = Math.min(1, ANCHO / lienzo.width), c = document.createElement('canvas');
        c.width = Math.round(lienzo.width * k); c.height = Math.round(lienzo.height * k);
        c.getContext('2d').drawImage(lienzo, 0, 0, c.width, c.height);
        c.toBlob((b) => r(b), 'image/jpeg', 0.82);
      } catch (e) { r(null); }
    };
    foto.app.once('frameend', sacar); setTimeout(sacar, 600);
  });
}

function estilos() {
  const s = document.createElement('style');
  s.textContent = `
  #opinion-boton { position: fixed; right: calc(14px + env(safe-area-inset-right, 0px)); bottom: calc(46px + env(safe-area-inset-bottom, 0px)); z-index: 30;
    font: 600 11px/1 ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: #f4efe6; background: rgba(18, 20, 28, .72);
    border: 1px solid rgba(255, 255, 255, .16); border-radius: 999px; padding: 9px 13px; cursor: pointer; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
  #opinion-boton:hover { border-color: #f5a742; }
  #opinion-boton b { color: #f5a742; font-weight: 600; }
  #opinion-capa { position: fixed; inset: 0; z-index: 60; background: rgba(8, 10, 16, .62); display: grid; place-items: center; padding: 16px; }
  #opinion-capa[hidden] { display: none; }
  #opinion { width: min(560px, 100%); max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); box-sizing: border-box; overflow: auto; background: #14161f; color: #f4efe6; border: 1px solid rgba(255, 255, 255, .14); border-radius: 16px;
    padding: 18px; font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; box-shadow: 0 20px 60px rgba(0, 0, 0, .5); }
  #opinion h2 { margin: 0 0 4px; font: 600 20px/1.2 Georgia, 'Times New Roman', serif; }
  #opinion .sub { margin: 0 0 12px; color: #b9b3a6; font-size: 13px; }
  #opinion img { display: block; width: 100%; max-height: 34vh; object-fit: contain; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .12); background: #0b0c12; margin-bottom: 10px; }
  #opinion label { display: block; font: 600 10px/1 ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: #b9b3a6; margin: 10px 0 6px; }
  #opinion textarea, #opinion input[type=text] { width: 100%; box-sizing: border-box; background: #0e1017; color: #f4efe6; border: 1px solid rgba(255, 255, 255, .16);
    border-radius: 10px; padding: 10px 12px; font: inherit; }
  #opinion textarea { min-height: 96px; resize: vertical; }
  #opinion textarea:focus, #opinion input:focus { outline: 2px solid #f5a742; outline-offset: 1px; }
  #opinion .fila { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
  #opinion button { font: 600 12px/1 ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; border-radius: 999px; padding: 11px 15px;
    border: 1px solid rgba(255, 255, 255, .18); background: transparent; color: #f4efe6; cursor: pointer; }
  #opinion button.principal { background: #f5a742; border-color: #f5a742; color: #1a1408; }
  #opinion button.grabando { background: #c8463c; border-color: #c8463c; }
  #opinion button:disabled { opacity: .5; cursor: default; }
  #opinion audio { height: 34px; flex: 1 1 180px; min-width: 0; }
  #opinion .aviso { color: #b9b3a6; font-size: 12px; margin: 12px 0 0; }
  #opinion .aviso a { color: #f5a742; }
  #opinion .estado { min-height: 18px; margin-top: 10px; font-size: 13px; }
  #opinion .estado.mal { color: #ff9a8f; } #opinion .estado.bien { color: #9fe0a8; }`;
  document.head.appendChild(s);
}

async function montar() {
  if (q.get('opinion') === '0') return;
  const foto = await espera();
  estilos();
  const boton = document.createElement('button'); boton.id = 'opinion-boton'; boton.type = 'button'; boton.innerHTML = 'Opinión <b>(O)</b>';
  boton.title = 'Mandar una captura y tu opinión al equipo'; document.body.appendChild(boton);
  const capa = document.createElement('div'); capa.id = 'opinion-capa'; capa.hidden = true;
  capa.innerHTML = `<div id="opinion" role="dialog" aria-modal="true" aria-labelledby="opinion-titulo" tabindex="-1">
    <h2 id="opinion-titulo">Cuéntanos qué has visto</h2>
    <p class="sub">Se manda esta captura con lo que escribas o digas. Vale un fallo, algo que no es como en el pueblo, o una idea.</p>
    <img alt="La captura que se va a enviar">
    <label for="opinion-texto">Tu opinión</label>
    <textarea id="opinion-texto" maxlength="1500" placeholder="Por ejemplo: esta casa en realidad es amarilla y tiene la puerta a la izquierda."></textarea>
    <div class="fila"><button type="button" class="voz">Grabar voz</button><audio controls hidden></audio><button type="button" class="borrar" hidden>Quitar</button></div>
    <label for="opinion-nombre">Tu nombre (si quieres)</label>
    <input type="text" id="opinion-nombre" maxlength="40" autocomplete="off">
    <div class="estado" role="status" aria-live="polite"></div>
    <div class="fila"><button type="button" class="principal enviar">Enviar</button><button type="button" class="cerrar">Cancelar</button></div>
    <p class="aviso">Al enviar, la captura, tu texto, tu voz (si la grabas), dónde estabas en el juego y qué navegador y pantalla usas llegan al equipo de 388 Pueblos, que los usa solo para mejorar el juego. La voz se pasa a texto con OpenAI y todo le llega al equipo por correo. No se envía nada hasta que pulses «Enviar». <a href="https://pueblos388.onrender.com/privacidad.html" target="_blank" rel="noopener">Privacidad</a></p>
  </div>`;
  document.body.appendChild(capa);
  const $ = (s) => capa.querySelector(s);
  const img = $('img'), texto = $('#opinion-texto'), nombre = $('#opinion-nombre'), estado = $('.estado'), bVoz = $('.voz'), bBorrar = $('.borrar'), audio = $('audio'), bEnviar = $('.enviar');
  let captura = null, voz = null, grabadora = null, flujo = null, reloj = null, datos = null, enviando = false, abriendo = false, tanda = 0, acabada = Promise.resolve();
  const decir = (t, clase = '') => { estado.textContent = t; estado.className = 'estado ' + clase; };
  // (lo que se teclea en el panel no llega al juego: ni anda con WASD ni abre nada)
  for (const ev of ['keydown', 'keypress', 'mousedown', 'mouseup', 'click', 'wheel', 'pointerdown', 'touchstart']) capa.addEventListener(ev, (e) => e.stopPropagation());

  const pararVoz = () => { clearInterval(reloj); reloj = null; if (grabadora && grabadora.state !== 'inactive') grabadora.stop(); if (flujo) { flujo.getTracks().forEach((t) => t.stop()); flujo = null; } };
  const quitarVoz = () => { tanda += 1; pararVoz(); voz = null;   // (tanda: lo que acabe de grabarse después de esto, descartado)
     if (audio.src) URL.revokeObjectURL(audio.src); audio.removeAttribute('src'); audio.hidden = true; bBorrar.hidden = true; bVoz.textContent = 'Grabar voz'; bVoz.classList.remove('grabando'); };

  async function abrir() {
    if (!capa.hidden || enviando || abriendo) return;
    abriendo = true;
    const p = foto.ctrl?.getPosition?.();
    datos = { x: p ? Math.round(p.x * 10) / 10 : null, z: p ? Math.round(p.z * 10) / 10 : null, hora: document.getElementById('reloj')?.textContent?.trim().slice(0, 60) || '',
      escena: foto.escena || '', gpu: foto.gpu || '', pantalla: `${innerWidth}×${innerHeight}`, navegador: navigator.userAgent.slice(0, 160) };
    captura = await capturar(foto);
    if (document.pointerLockElement) document.exitPointerLock();
    if (img.src) URL.revokeObjectURL(img.src);
    if (captura) { img.src = URL.createObjectURL(captura); img.hidden = false; } else img.hidden = true;
    decir(captura ? '' : 'No se ha podido sacar la captura; puedes enviar la opinión igual.', captura ? '' : 'mal');
    try { if (!nombre.value) nombre.value = localStorage.getItem('opinion_nombre') || ''; } catch (e) { /* sin almacenamiento */ }
    capa.hidden = false; bEnviar.disabled = false; abriendo = false; texto.focus();
  }
  function cerrar() { quitarVoz(); capa.hidden = true; document.activeElement?.blur?.(); }

  bVoz.addEventListener('click', async () => {
    if (grabadora && grabadora.state === 'recording') { pararVoz(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { decir('Este navegador no deja grabar la voz. Escríbelo, por favor.', 'mal'); return; }
    quitarVoz();
    try { flujo = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { flujo = null; decir('No hay permiso para el micrófono. Puedes escribirlo.', 'mal'); return; }
    const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const trozos = [], mia = tanda; let g;
    try { g = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined); }
    catch (e) { pararVoz(); decir('Este navegador no deja grabar la voz. Escríbelo, por favor.', 'mal'); return; }
    grabadora = g; let fin; acabada = new Promise((r) => { fin = r; });
    g.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
    g.onerror = () => { pararVoz(); decir('Se ha cortado la grabación. Prueba otra vez o escríbelo.', 'mal'); };
    g.onstop = () => {
      if (mia === tanda && trozos.length) {
        voz = new Blob(trozos, { type: g.mimeType || tipo || 'audio/webm' }); audio.src = URL.createObjectURL(voz); audio.hidden = false; bBorrar.hidden = false;
        bVoz.textContent = 'Grabar otra vez'; decir('');
      }
      bVoz.classList.remove('grabando'); fin();
    };
    let s = 0; grabadora.start(); bVoz.classList.add('grabando'); bVoz.textContent = `Parar · 0:00`;
    reloj = setInterval(() => { s += 1; bVoz.textContent = `Parar · 0:${String(s).padStart(2, '0')}`; if (s >= TOPE_VOZ) pararVoz(); }, 1000);
  });
  bBorrar.addEventListener('click', quitarVoz);
  $('.cerrar').addEventListener('click', cerrar);
  capa.addEventListener('mousedown', (e) => { if (e.target === capa) cerrar(); });
  capa.addEventListener('keydown', (e) => { if (e.code === 'Escape') cerrar(); });
  capa.addEventListener('mouseup', () => { if (!capa.contains(document.activeElement)) capa.querySelector('#opinion').focus(); });
  // (y si aun así el foco se va a la página, lo tecleado no llega al juego mientras el panel está abierto)
  addEventListener('keydown', (e) => { if (!capa.hidden && !capa.contains(e.target)) { e.stopImmediatePropagation(); if (e.code === 'Escape') cerrar(); } }, true);

  bEnviar.addEventListener('click', async () => {
    if (enviando) return;
    if (grabadora && grabadora.state === 'recording') { pararVoz(); await Promise.race([acabada, new Promise((r) => setTimeout(r, 4000))]); }
    const t = texto.value.trim();
    if (!t && !voz) { decir('Escribe algo o graba tu voz antes de enviar.', 'mal'); texto.focus(); return; }
    enviando = true; bEnviar.disabled = true; decir('Enviando… (la primera vez puede tardar hasta un minuto)');
    try {
      try { localStorage.setItem('opinion_nombre', nombre.value.trim()); } catch (e) { /* sin almacenamiento */ }
      const cuerpo = { ...datos, texto: t, nombre: nombre.value.trim(), captura: captura ? await a64(captura) : '', audio: voz ? await a64(voz) : '', audio_tipo: voz ? voz.type : '' };
      const ctl = new AbortController(), tope = setTimeout(() => ctl.abort(), 120000);
      const r = await fetch(SERVIDOR, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: ctl.signal });
      clearTimeout(tope);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `error ${r.status}`);
      decir('Recibido. ¡Gracias!', 'bien'); texto.value = ''; quitarVoz();
      setTimeout(() => { if (!capa.hidden) cerrar(); decir(''); }, 1400);
    } catch (e) {
      decir(e.name === 'AbortError' || e instanceof TypeError ? 'El servidor no contesta. Prueba otra vez en un momento.' : `No se ha podido enviar: ${e.message}`, 'mal'); bEnviar.disabled = false;
    } finally { enviando = false; }
  });

  boton.addEventListener('click', (e) => { e.stopPropagation(); boton.blur(); abrir(); });
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyO' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;   // (no mientras se escribe en otra caja: el chat, el nombre…)
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    e.preventDefault(); abrir();
  });
  foto.opinion = { abrir, cerrar, abierto: () => !capa.hidden, servidor: SERVIDOR };
}
montar();

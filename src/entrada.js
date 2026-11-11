// La entrada de la página: la calle (src/main.js) o el editor de personajes, «Crea tu personaje» (src/editor.js), en la
// misma página. Van juntos porque el personaje se guarda en el navegador (localStorage) y cada enlace de claude.ai
// guarda lo suyo: con el editor en otro enlace, lo guardado no llegaba al juego. Se elige con la almohadilla del enlace,
// que es lo único que claude.ai pasa a la página: «…#personaje» abre el editor. Para pasar de uno a otro se cambia la
// almohadilla y se recarga la página (cada uno monta su motor y sus megas: mejor empezar limpio que desmontar).
const EDITOR = location.hash === '#personaje';
// (los trozos de los .glb del personaje van aparte de los de la calle, para que tools/despliegue/trocear.py, que
// reescribe los de la calle en cada versión, no se los lleve: tools/despliegue/trocear_personaje.py)
if (window.TROZOS_PERSONAJE) window.TROZOS = { ...(window.TROZOS || {}), ...window.TROZOS_PERSONAJE };
const guardado = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

// de la calle al editor y vuelta
window.irA = (editor) => { location.hash = editor ? '#personaje' : ''; location.reload(); };

if (EDITOR) {
  // el editor: su página (editor.html, publicada al lado) da los estilos y el panel; el lienzo es el de esta
  const doc = new DOMParser().parseFromString(await (await fetch('./editor.html')).text(), 'text/html');
  for (const id of ['hud', 'ayuda', 'carga', 'personaje']) document.getElementById(id)?.remove();
  for (const st of doc.querySelectorAll('style')) document.head.appendChild(document.adoptNode(st));
  for (const el of [...doc.body.children]) if (!['SCRIPT', 'CANVAS'].includes(el.tagName)) document.body.appendChild(document.adoptNode(el));
  window.EN_JUEGO = true;  // (el editor, al salir, vuelve a la calle de esta misma página)
  await import('./editor.js');
} else {
  const boton = document.getElementById('personaje');
  if (boton) {
    if (guardado('personaje_en_calle') === '1' && guardado('personaje')) boton.textContent = 'Cambiar de personaje';
    boton.addEventListener('click', () => window.irA(true));
  }
  // (dentro de la web de 388 Pueblos, con ?desde=388: su entrada, antes de que arranque la calle; con ?foto388=, para
  // sacar sus fotos: src/desde388.js)
  const q388 = new URLSearchParams(location.search);
  // (con ?precarga=1, la web de 388 Pueblos lo monta solo para bajar por detrás: no arranca hasta que dice g388:juega)
  if (window.parent !== window && q388.get('desde') === '388' && q388.get('precarga') === '1') await (await import('./precarga.js')).precargar();
  if ((window.parent !== window && q388.get('desde') === '388') || q388.get('foto388')) await import('./desde388.js');
  await import('./main.js');
}

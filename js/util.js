/* ==========================================================================
   Utilidades compartidas
   ========================================================================== */

window.U = (function () {
  'use strict';

  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  /** Crea un elemento con atributos e hijos en una sola línea. */
  function el(tag, attrs, hijos) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v);
      }
    }
    if (hijos) {
      (Array.isArray(hijos) ? hijos : [hijos]).forEach(function (h) {
        if (h === null || h === undefined || h === false) return;
        n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
      });
    }
    return n;
  }

  /** id único sin depender de crypto.randomUUID (que no existe en http://). */
  function uid() {
    if (self.crypto && self.crypto.randomUUID) return self.crypto.randomUUID();
    const b = new Uint8Array(16);
    (self.crypto || { getRandomValues: function (a) { for (let i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0; } })
      .getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /** Código de grupo legible: sin 0/O ni 1/I, que se confunden al dictarlo. */
  function codigoGrupo() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  /** Color estable derivado del nombre: la misma persona siempre tiene el mismo. */
  const PALETA = [
    'linear-gradient(135deg,#ff7a59,#ff5c8a)',
    'linear-gradient(135deg,#8a4fff,#5b8dff)',
    'linear-gradient(135deg,#14b8a6,#4ade80)',
    'linear-gradient(135deg,#ffc53d,#ff8a3d)',
    'linear-gradient(135deg,#ff5c8a,#8a4fff)',
    'linear-gradient(135deg,#5b8dff,#14b8a6)',
    'linear-gradient(135deg,#f472b6,#fb923c)',
    'linear-gradient(135deg,#22d3ee,#8a4fff)'
  ];
  function colorDe(texto) {
    let h = 0;
    const s = String(texto || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETA[h % PALETA.length];
  }

  function iniciales(nombre) {
    const p = String(nombre || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  function avatar(nombre, chico) {
    return el('div', {
      class: 'avatar' + (chico ? ' chico' : ''),
      style: { background: colorDe(nombre) },
      title: nombre,
      text: iniciales(nombre)
    });
  }

  /** "hace 5 min", "ayer", "12 mar" */
  function cuando(iso) {
    const t = new Date(iso).getTime();
    if (!isFinite(t)) return '';
    const seg = Math.floor((Date.now() - t) / 1000);
    if (seg < 45) return 'recién';
    if (seg < 3600) return 'hace ' + Math.floor(seg / 60) + ' min';
    if (seg < 86400) return 'hace ' + Math.floor(seg / 3600) + ' h';
    if (seg < 172800) return 'ayer';
    if (seg < 604800) return 'hace ' + Math.floor(seg / 86400) + ' días';
    const d = new Date(t);
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()];
    return d.getDate() + ' ' + mes + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }

  function duracion(seg) {
    if (!seg || !isFinite(seg)) return '';
    const m = Math.floor(seg / 60);
    const s = Math.floor(seg % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function pesar(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /** Aviso flotante abajo. tipo: '' | 'ok' | 'error' */
  function aviso(texto, tipo, ms) {
    const cont = $('#avisos');
    if (!cont) return;
    const n = el('div', { class: 'aviso' + (tipo ? ' ' + tipo : ''), text: texto });
    cont.appendChild(n);
    setTimeout(function () {
      n.style.transition = 'opacity .25s ease, transform .25s ease';
      n.style.opacity = '0';
      n.style.transform = 'translateY(10px)';
      setTimeout(() => n.remove(), 260);
    }, ms || 2800);
  }

  /* ---------- Hojas modales ---------- */

  /**
   * Abre una plantilla como hoja modal.
   * Devuelve { nodo, cerrar } — `nodo` es el .velo insertado en el body.
   */
  function abrirHoja(idPlantilla, alCerrar) {
    const tpl = document.getElementById(idPlantilla);
    const nodo = tpl.content.firstElementChild.cloneNode(true);
    document.body.appendChild(nodo);
    document.body.style.overflow = 'hidden';

    let cerrada = false;
    function cerrar() {
      if (cerrada) return;
      cerrada = true;
      document.body.style.overflow = '';
      nodo.style.transition = 'opacity .18s ease';
      nodo.style.opacity = '0';
      setTimeout(() => nodo.remove(), 190);
      document.removeEventListener('keydown', onTecla);
      window.removeEventListener('popstate', onAtras);
      if (alCerrar) alCerrar();
    }

    function onTecla(e) { if (e.key === 'Escape') { cerrar(); historiaAtras(); } }
    function onAtras() { cerrar(); }

    // El botón "atrás" del celular cierra la hoja en vez de salir de la app.
    let empujado = false;
    try { history.pushState({ hoja: true }, ''); empujado = true; } catch (_) {}
    function historiaAtras() { if (empujado) { empujado = false; try { history.back(); } catch (_) {} } }

    $$('[data-cerrar]', nodo).forEach(b => b.addEventListener('click', function () { cerrar(); historiaAtras(); }));
    nodo.addEventListener('click', function (e) {
      if (e.target === nodo && nodo.hasAttribute('data-cerrar-velo')) { cerrar(); historiaAtras(); }
    });
    document.addEventListener('keydown', onTecla);
    window.addEventListener('popstate', onAtras);

    return { nodo: nodo, cerrar: function () { cerrar(); historiaAtras(); } };
  }

  /**
   * Caja clicable. Un <button> no puede contener títulos ni divs sin romper el
   * HTML, así que para las tarjetas usamos un div con rol de botón y soporte
   * de teclado.
   */
  function cajaClicable(clase, alTocar, hijos) {
    return el('div', {
      class: clase,
      role: 'button',
      tabindex: '0',
      onclick: alTocar,
      onkeydown: function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alTocar(e); }
      }
    }, hijos);
  }

  /** Vibración corta como feedback táctil, si el dispositivo la soporta. */
  function tocar(ms) { try { navigator.vibrate && navigator.vibrate(ms || 8); } catch (_) {} }

  function guardarLocal(clave, valor) {
    try { localStorage.setItem('juntada:' + clave, JSON.stringify(valor)); } catch (_) {}
  }
  function leerLocal(clave, porDefecto) {
    try {
      const v = localStorage.getItem('juntada:' + clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch (_) { return porDefecto; }
  }
  function borrarLocal(clave) {
    try { localStorage.removeItem('juntada:' + clave); } catch (_) {}
  }

  return {
    $: $, $$: $$, el: el, uid: uid, codigoGrupo: codigoGrupo,
    colorDe: colorDe, iniciales: iniciales, avatar: avatar,
    cuando: cuando, duracion: duracion, pesar: pesar,
    aviso: aviso, abrirHoja: abrirHoja, tocar: tocar, cajaClicable: cajaClicable,
    guardarLocal: guardarLocal, leerLocal: leerLocal, borrarLocal: borrarLocal
  };
})();

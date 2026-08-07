/* ==========================================================================
   Juntada — lógica de la aplicación
   ========================================================================== */

(function () {
  'use strict';

  const U = window.U;
  const C = window.CONFIG;
  const $ = U.$, $$ = U.$$, el = U.el;

  /* ---------- estado ---------- */

  const S = {
    store: null,
    grupo: null,
    yo: null,                 // { id, nombre }
    vista: 'momentos',        // 'momentos' | 'agenda'
    publicaciones: [],
    reacciones: [],
    comentarios: {},          // pub_id -> cantidad
    miembros: [],
    juntadas: [],
    atuendos: [],
    urls: new Map(),          // id -> { media, thumb }
    desuscribir: null,
    modoEntrar: 'entrar',
    cargando: false
  };

  /* ======================================================================
     Arranque
     ====================================================================== */

  async function arrancar() {
    S.yo = { id: U.leerLocal('miId', null) || nuevoId(), nombre: U.leerLocal('miNombre', '') };

    conectarUIEntrar();

    const usarSupabase = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
    const estado = $('#estado-backend');

    if (usarSupabase) {
      estado.textContent = 'Conectando con el servidor…';
      try {
        await window.StoreSupabase.init();
        S.store = window.StoreSupabase;
        estado.textContent = '☁️ Conectado — tus amigos van a ver lo que subas.';
      } catch (e) {
        console.error(e);
        estado.textContent = '⚠️ ' + e.message + ' Se usa el modo prueba mientras tanto.';
        S.store = window.StoreLocal;
        await S.store.init();
      }
    } else {
      S.store = window.StoreLocal;
      await S.store.init();
      estado.textContent = S.store.esVolatil()
        ? '⚠️ Estás abriendo el archivo directo: los datos se borran al recargar. Usá servidor.cmd o subila a internet.'
        : '📱 Modo prueba: las fotos quedan guardadas en este dispositivo.';
    }

    // Si ya había sesión, entramos derecho al feed.
    const sesion = U.leerLocal('sesion', null);
    if (sesion && sesion.codigo && sesion.backend === S.store.nombre) {
      try {
        const grupo = await S.store.buscarGrupo(sesion.codigo);
        if (grupo) { await entrarAlGrupo(grupo, sesion.nombre); return; }
      } catch (e) { console.warn('No pude restaurar la sesión:', e); }
    }

    if (S.yo.nombre) $('#in-nombre').value = S.yo.nombre;
  }

  function nuevoId() {
    const id = U.uid();
    U.guardarLocal('miId', id);
    return id;
  }

  function pantalla(nombre) {
    $$('.pantalla').forEach(p => p.classList.remove('activa'));
    $('#pantalla-' + nombre).classList.add('activa');
    window.scrollTo(0, 0);
  }

  /* ======================================================================
     Pantalla de entrada
     ====================================================================== */

  function conectarUIEntrar() {
    $$('.pestania').forEach(function (b) {
      b.addEventListener('click', function () {
        S.modoEntrar = b.dataset.modo;
        $$('.pestania').forEach(function (o) {
          const act = o === b;
          o.classList.toggle('activa', act);
          o.setAttribute('aria-selected', act ? 'true' : 'false');
        });
        const crear = S.modoEntrar === 'crear';
        $('#campo-codigo').classList.toggle('oculto', crear);
        $('#campo-nombre-grupo').classList.toggle('oculto', !crear);
        $('#btn-entrar').textContent = crear ? 'Crear el grupo' : 'Entrar';
      });
    });

    $('#in-codigo').addEventListener('input', function (e) {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });

    // Si el link trae ?g=ABC123 precargamos el código: invitar es pegar un link.
    const desdeUrl = new URLSearchParams(location.search).get('g');
    if (desdeUrl) $('#in-codigo').value = desdeUrl.toUpperCase().slice(0, 6);

    $('#form-entrar').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (S.cargando) return;

      const nombre = $('#in-nombre').value.trim();
      if (nombre.length < 2) { U.aviso('Poné tu nombre para que sepan quién sos.', 'error'); return; }

      const btn = $('#btn-entrar');
      const original = btn.textContent;
      S.cargando = true;
      btn.disabled = true;
      btn.textContent = 'Un segundo…';

      try {
        let grupo;
        if (S.modoEntrar === 'crear') {
          const nom = $('#in-grupo').value.trim();
          if (nom.length < 2) throw new Error('Ponele un nombre al grupo.');
          grupo = await S.store.crearGrupo({ nombre: nom });
          U.aviso('¡Grupo creado! Tu código es ' + grupo.codigo, 'ok', 4500);
        } else {
          const codigo = $('#in-codigo').value.trim();
          if (codigo.length !== 6) throw new Error('El código tiene 6 caracteres.');
          grupo = await S.store.buscarGrupo(codigo);
          if (!grupo) throw new Error('No existe ningún grupo con ese código.');
        }
        await entrarAlGrupo(grupo, nombre);
      } catch (err) {
        console.error(err);
        U.aviso(err.message || 'Algo salió mal.', 'error', 4000);
      } finally {
        S.cargando = false;
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  async function entrarAlGrupo(grupo, nombre) {
    S.grupo = grupo;
    S.yo.nombre = nombre;
    U.guardarLocal('miNombre', nombre);
    U.guardarLocal('sesion', { codigo: grupo.codigo, nombre: nombre, backend: S.store.nombre });

    $('#titulo-grupo').textContent = grupo.nombre;
    $('#chip-codigo-texto').textContent = grupo.codigo;
    const av = $('#mi-avatar');
    av.textContent = U.iniciales(nombre);
    av.style.background = U.colorDe(nombre);
    const banner = $('#banner-demo');
    banner.classList.toggle('oculto', S.store.nombre !== 'local');
    if (S.store.nombre === 'local' && S.store.esVolatil()) {
      banner.innerHTML = '';
      banner.appendChild(el('span', { class: 'emoji', text: '⚠️' }));
      banner.appendChild(el('span', {}, [
        el('b', { text: 'Abriste el archivo directamente. ' }),
        'El navegador no deja guardar nada así: al recargar se borra todo. ',
        'Para probarla en serio ejecutá ', el('b', { text: 'servidor.cmd' }),
        ', y para que la usen tus amigos subila a internet (está en el README).'
      ]));
    }

    conectarUIApp();
    pantalla('app');
    mostrarEsqueleto();

    // Nos anotamos como integrantes: así el resto sabe a quién le falta subir
    // la vestimenta de cada juntada.
    S.store.registrarMiembro({ grupoId: grupo.id, autor: S.yo })
      .catch(e => console.warn('No pude registrarte como integrante:', e));

    await refrescar();

    if (S.desuscribir) S.desuscribir();
    S.desuscribir = S.store.suscribir(grupo.id, function () { refrescar(); });
  }

  function salir() {
    if (S.desuscribir) { S.desuscribir(); S.desuscribir = null; }
    U.borrarLocal('sesion');
    S.grupo = null;
    S.publicaciones = [];
    S.juntadas = [];
    S.atuendos = [];
    S.miembros = [];
    S.urls.clear();
    $('#feed').innerHTML = '';
    $('#agenda').innerHTML = '';
    pantalla('entrar');
  }

  /* ======================================================================
     Navegación entre vistas
     ====================================================================== */

  let uiLista = false;

  function conectarUIApp() {
    if (uiLista) return;
    uiLista = true;

    $('#fab').addEventListener('click', function () {
      S.vista === 'agenda' ? abrirHojaNuevaJuntada() : abrirHojaSubir();
    });
    $('#btn-invitar').addEventListener('click', invitar);
    $('#btn-menu').addEventListener('click', abrirMenu);

    $$('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { irA(b.dataset.vista); });
    });

    // Al volver a la pestaña, traemos lo nuevo.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && S.grupo) refrescar();
    });
  }

  function irA(vista) {
    S.vista = vista;
    $('#vista-momentos').classList.toggle('oculto', vista !== 'momentos');
    $('#vista-agenda').classList.toggle('oculto', vista !== 'agenda');
    $('#fab-texto').textContent = vista === 'agenda' ? 'Agendar' : 'Subir';
    $$('.nav-item').forEach(function (b) {
      const act = b.dataset.vista === vista;
      b.classList.toggle('activa', act);
      b.setAttribute('aria-selected', act ? 'true' : 'false');
    });
    window.scrollTo(0, 0);
  }

  function mostrarEsqueleto() {
    const feed = $('#feed');
    feed.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      feed.appendChild(el('div', { class: 'esqueleto' }, [
        el('div', { class: 'barra-fantasma', style: { height: '42px', width: '42px', borderRadius: '50%', marginBottom: '14px' } }),
        el('div', { class: 'barra-fantasma', style: { height: '220px', marginBottom: '14px' } }),
        el('div', { class: 'barra-fantasma', style: { height: '15px', width: '62%' } })
      ]));
    }
  }

  let refrescando = false;
  async function refrescar() {
    if (refrescando || !S.grupo) return;
    refrescando = true;
    const g = S.grupo.id;
    try {
      const [pubs, reacs, coments, miembros, juntadas, atuendos] = await Promise.all([
        S.store.listarPublicaciones(g),
        S.store.listarReacciones(g),
        S.store.contarComentarios(g),
        S.store.listarMiembros(g),
        S.store.listarJuntadas(g),
        S.store.listarAtuendos(g)
      ]);
      S.publicaciones = pubs;
      S.reacciones = reacs;
      S.comentarios = coments;
      S.miembros = miembros;
      S.juntadas = juntadas;
      S.atuendos = atuendos;

      await resolverUrls(pubs.concat(atuendos));
      pintarFeed();
      pintarAgenda();
      pintarSubtitulo();
    } catch (e) {
      console.error(e);
      U.aviso(e.message || 'No pude cargar los datos.', 'error', 4000);
    } finally {
      refrescando = false;
    }
  }

  async function resolverUrls(items) {
    await Promise.all(items.map(async function (p) {
      if (S.urls.has(p.id)) return;
      try { S.urls.set(p.id, await S.store.urlMedia(p)); }
      catch (_) { S.urls.set(p.id, { media: null, thumb: null }); }
    }));
  }

  function pintarSubtitulo() {
    const n = S.publicaciones.length;
    const prox = proximaJuntada();
    const partes = [n === 1 ? '1 momento' : n + ' momentos'];
    if (prox) partes.push('próxima: ' + fechaCorta(prox.fecha));
    $('#subtitulo-grupo').textContent = partes.join(' · ');

    // Punto rojo en la pestaña Agenda si te falta subir tu vestimenta.
    const debo = S.juntadas.some(j => !esPasada(j) && !miAtuendo(j.id));
    $('#punto-agenda').classList.toggle('oculto', !debo);
  }

  function pintarFeed() {
    const feed = $('#feed');
    const n = S.publicaciones.length;

    feed.innerHTML = '';

    if (n === 0) {
      feed.appendChild(el('div', { class: 'vacio' }, [
        el('div', { class: 'emoji', text: '📷' }),
        el('h3', { text: 'Todavía no hay nada acá' }),
        el('p', { text: 'Tocá “Subir” y estrená el álbum del grupo.' })
      ]));
      return;
    }

    S.publicaciones.forEach(p => feed.appendChild(tarjeta(p)));
  }

  function tarjeta(p) {
    const urls = S.urls.get(p.id) || {};
    const mio = p.autor_id === S.yo.id;

    /* --- cabecera --- */
    const cabecera = el('div', { class: 'pub-cabecera' }, [
      U.avatar(p.autor_nombre),
      el('div', { class: 'quien' }, [
        el('div', { class: 'nombre', text: p.autor_nombre + (mio ? ' (vos)' : '') }),
        el('div', { class: 'cuando', text: U.cuando(p.creado) })
      ]),
      mio ? el('button', {
        class: 'btn-texto btn-peligro',
        title: 'Borrar',
        onclick: () => borrar(p)
      }, '🗑') : null
    ]);

    /* --- media --- */
    const media = el('div', { class: 'pub-media', onclick: () => abrirVisor(p) });

    if (p.kind === 'video') {
      media.appendChild(urls.thumb
        ? el('img', { src: urls.thumb, alt: 'Video de ' + p.autor_nombre, loading: 'lazy' })
        : el('div', { class: 'placeholder' }));
      media.appendChild(el('div', { class: 'insignia-video' }, [
        el('span', { text: '▶' }),
        el('span', { text: U.duracion(p.dur) || 'Video' })
      ]));
      media.appendChild(el('button', { class: 'boton-play', 'aria-label': 'Reproducir' },
        el('span', { style: { fontSize: '26px', color: '#fff', marginLeft: '4px' }, text: '▶' })));
    } else if (urls.media) {
      media.appendChild(el('img', {
        src: urls.media,
        alt: p.epigrafe || 'Foto de ' + p.autor_nombre,
        loading: 'lazy',
        decoding: 'async',
        width: p.w || undefined,
        height: p.h || undefined
      }));
    } else {
      media.appendChild(el('div', { class: 'placeholder' }));
    }

    /* --- reacciones --- */
    const mias = S.reacciones.filter(r => r.pub_id === p.id);
    const porEmoji = {};
    mias.forEach(function (r) {
      porEmoji[r.emoji] = porEmoji[r.emoji] || { n: 0, yo: false, quienes: [] };
      porEmoji[r.emoji].n++;
      porEmoji[r.emoji].quienes.push(r.autor_nombre);
      if (r.autor_id === S.yo.id) porEmoji[r.emoji].yo = true;
    });

    const acciones = el('div', { class: 'pub-acciones' });

    Object.keys(porEmoji)
      .sort((a, b) => porEmoji[b].n - porEmoji[a].n)
      .forEach(function (emoji) {
        const d = porEmoji[emoji];
        acciones.appendChild(el('button', {
          class: 'pastilla' + (d.yo ? ' puesta' : ''),
          title: d.quienes.join(', '),
          onclick: () => reaccionar(p, emoji)
        }, [
          el('span', { class: 'emoji', text: emoji }),
          el('span', { class: 'cuenta', text: String(d.n) })
        ]));
      });

    acciones.appendChild(el('button', {
      class: 'pastilla',
      'aria-label': 'Reaccionar',
      onclick: () => abrirHojaEmojis(p)
    }, el('span', { class: 'emoji', text: '😀＋' })));

    const nComentarios = S.comentarios[p.id] || 0;
    acciones.appendChild(el('button', {
      class: 'pastilla pastilla-sumar',
      onclick: () => abrirHojaComentarios(p)
    }, [
      el('span', { class: 'emoji', text: '💬' }),
      el('span', { class: 'cuenta', text: nComentarios ? String(nComentarios) : 'Comentar' })
    ]));

    const nodo = el('article', { class: 'publicacion' }, [cabecera, media]);
    if (p.epigrafe) nodo.appendChild(el('div', { class: 'pub-texto', text: p.epigrafe }));
    nodo.appendChild(acciones);
    return nodo;
  }

  /* ======================================================================
     Agenda de juntadas
     ====================================================================== */

  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /** Una juntada deja de ser "próxima" recién a la mañana siguiente. */
  function esPasada(j) {
    return new Date(j.fecha).getTime() + 10 * 3600 * 1000 < Date.now();
  }

  function atuendosDe(juntadaId) {
    return S.atuendos.filter(a => a.juntada_id === juntadaId);
  }

  function miAtuendo(juntadaId) {
    return S.atuendos.find(a => a.juntada_id === juntadaId && a.autor_id === S.yo.id) || null;
  }

  function proximaJuntada() {
    return S.juntadas.filter(j => !esPasada(j))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0] || null;
  }

  function fechaCorta(iso) {
    const d = new Date(iso);
    return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3);
  }

  function fechaLarga(iso) {
    const d = new Date(iso);
    const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ', ' + hora;
  }

  function cuantoFalta(iso) {
    const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
    if (dias < 0) return '';
    if (dias === 0) return '¡es hoy!';
    if (dias === 1) return 'mañana';
    if (dias < 7) return 'en ' + dias + ' días';
    if (dias < 14) return 'en una semana';
    return 'en ' + Math.round(dias / 7) + ' semanas';
  }

  function pintarAgenda() {
    const cont = $('#agenda');
    cont.innerHTML = '';

    if (!S.juntadas.length) {
      cont.appendChild(el('div', { class: 'vacio' }, [
        el('div', { class: 'emoji', text: '📅' }),
        el('h3', { text: 'No hay ninguna juntada agendada' }),
        el('p', { text: 'Tocá “Agendar” y poné fecha a la próxima. Después cada uno sube la foto de su vestimenta.' })
      ]));
      return;
    }

    const proximas = S.juntadas.filter(j => !esPasada(j)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const pasadas = S.juntadas.filter(esPasada).sort((a, b) => b.fecha.localeCompare(a.fecha));

    if (proximas.length) {
      cont.appendChild(el('div', { class: 'separador-agenda', text: 'Se viene' }));
      proximas.forEach(j => cont.appendChild(tarjetaJuntada(j, false)));
    }
    if (pasadas.length) {
      cont.appendChild(el('div', { class: 'separador-agenda', text: 'Ya fueron' }));
      pasadas.forEach(j => cont.appendChild(tarjetaJuntada(j, true)));
    }
  }

  function tarjetaJuntada(j, pasada) {
    const d = new Date(j.fecha);
    const puestos = atuendosDe(j.id);
    const total = Math.max(S.miembros.length, puestos.length);
    const yoSubi = !!miAtuendo(j.id);

    /* Caritas: primero quienes ya subieron, después quienes faltan. */
    const caritas = el('div', { class: 'caritas' });
    puestos.slice(0, 5).forEach(a => caritas.appendChild(U.avatar(a.autor_nombre, true)));

    const faltan = S.miembros.filter(m => !puestos.some(a => a.autor_id === m.autor_id));
    faltan.slice(0, Math.max(0, 5 - puestos.length)).forEach(function (m) {
      const av = U.avatar(m.nombre, true);
      av.classList.add('falta');
      av.textContent = '?';
      caritas.appendChild(av);
    });

    let texto, clase;
    if (total && puestos.length >= total) { texto = '¡todos vestidos!'; clase = 'completo'; }
    else if (!yoSubi && !pasada) { texto = 'te falta la tuya'; clase = 'te-falta'; }
    else { texto = puestos.length + ' de ' + (total || '?'); clase = ''; }

    const meta = [j.lugar, pasada ? '' : cuantoFalta(j.fecha)].filter(Boolean).join(' · ');

    return U.cajaClicable('juntada' + (pasada ? ' pasada' : ''), () => abrirHojaJuntada(j), [
      el('div', { class: 'taco' }, [
        el('span', { class: 'dia', text: String(d.getDate()) }),
        el('span', { class: 'mes', text: MESES[d.getMonth()].slice(0, 3) })
      ]),
      el('div', { class: 'juntada-datos' }, [
        el('h3', { text: j.titulo }),
        el('div', { class: 'meta', text: fechaLarga(j.fecha).replace(/,.*/, '') + ' · ' +
          String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }),
        meta ? el('div', { class: 'meta', text: meta }) : null,
        j.consigna ? el('div', { class: 'consigna', text: '👔 ' + j.consigna }) : null,
        el('div', { class: 'progreso-vestimenta' }, [
          caritas,
          el('span', { class: 'texto ' + clase, text: texto })
        ])
      ])
    ]);
  }

  /* ---------- crear una juntada ---------- */

  function abrirHojaNuevaJuntada() {
    const h = U.abrirHoja('tpl-hoja-nueva-juntada');

    // Por defecto, el próximo sábado a las 21.
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    $('#j-fecha', h.nodo).value = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    const btn = $('#btn-crear-juntada', h.nodo);
    btn.addEventListener('click', async function () {
      const titulo = $('#j-titulo', h.nodo).value.trim();
      const fecha = $('#j-fecha', h.nodo).value;
      const hora = $('#j-hora', h.nodo).value || '21:00';

      if (titulo.length < 2) { U.aviso('Ponele un nombre a la juntada.', 'error'); return; }
      if (!fecha) { U.aviso('Elegí el día.', 'error'); return; }

      btn.disabled = true;
      btn.textContent = 'Agendando…';
      try {
        await S.store.crearJuntada({
          grupoId: S.grupo.id,
          titulo: titulo,
          // new Date('2026-08-09T21:00') se interpreta en hora local: es lo que queremos.
          fecha: new Date(fecha + 'T' + hora).toISOString(),
          lugar: $('#j-lugar', h.nodo).value.trim(),
          consigna: $('#j-consigna', h.nodo).value.trim(),
          autor: S.yo
        });
        h.cerrar();
        U.aviso('¡Juntada agendada! 📅', 'ok');
        irA('agenda');
        await refrescar();
      } catch (e) {
        U.aviso(e.message || 'No se pudo agendar.', 'error', 4000);
        btn.disabled = false;
        btn.textContent = 'Agendar';
      }
    });
  }

  /* ---------- detalle de una juntada ---------- */

  function abrirHojaJuntada(j) {
    const h = U.abrirHoja('tpl-hoja-juntada');
    const pasada = esPasada(j);

    $('#j-det-titulo', h.nodo).textContent = j.titulo;

    const ficha = $('#j-det-ficha', h.nodo);
    const linea = (ico, val, tenue) => el('div', { class: 'linea' }, [
      el('span', { class: 'ico', text: ico }),
      el('span', { class: 'val' + (tenue ? ' tenue' : ''), text: val })
    ]);
    ficha.appendChild(linea('📅', fechaLarga(j.fecha)));
    if (j.lugar) ficha.appendChild(linea('📍', j.lugar));
    if (!pasada) ficha.appendChild(linea('⏳', cuantoFalta(j.fecha), true));
    ficha.appendChild(linea('👔', j.consigna || 'Vestimenta libre — pero la foto va igual', !j.consigna));
    ficha.appendChild(linea('🙋', 'Organiza ' + j.autor_nombre, true));

    if (j.autor_id === S.yo.id) {
      ficha.appendChild(el('button', {
        class: 'btn-texto btn-peligro',
        style: { marginTop: '6px', paddingLeft: '0' },
        text: '🗑 Borrar esta juntada',
        onclick: async function () {
          if (!confirm('¿Borrar la juntada y todas las fotos de vestimenta?')) return;
          try {
            await S.store.borrarJuntada(j);
            h.cerrar();
            U.aviso('Juntada borrada.', 'ok');
            await refrescar();
          } catch (e) { U.aviso(e.message || 'No se pudo borrar.', 'error'); }
        }
      }));
    }

    /* --- grilla de vestimenta --- */
    const grilla = $('#j-det-atuendos', h.nodo);
    const puestos = atuendosDe(j.id);
    const faltan = S.miembros.filter(m => !puestos.some(a => a.autor_id === m.autor_id));

    $('#j-det-contador', h.nodo).textContent =
      puestos.length + ' de ' + Math.max(S.miembros.length, puestos.length);

    puestos.forEach(function (a) {
      const urls = S.urls.get(a.id) || {};
      const nodo = U.cajaClicable(
        'atuendo' + (a.autor_id === S.yo.id ? ' mio' : ''),
        () => abrirVisor(a, {
          pie: a.autor_nombre + (a.nota ? ' — ' + a.nota : ''),
          alBorrar: a.autor_id === S.yo.id ? async function () {
            if (!confirm('¿Borrar tu foto de vestimenta?')) return false;
            await S.store.borrarAtuendo(a);
            S.urls.delete(a.id);
            h.cerrar();
            await refrescar();
            return true;
          } : null
        }));
      nodo.appendChild(urls.thumb || urls.media
        ? el('img', { src: urls.thumb || urls.media, alt: 'Vestimenta de ' + a.autor_nombre, loading: 'lazy' })
        : el('div', { style: { width: '100%', height: '100%' } }));
      nodo.appendChild(el('div', {
        class: 'pie-nombre',
        text: a.autor_nombre + (a.autor_id === S.yo.id ? ' (vos)' : '')
      }));
      grilla.appendChild(nodo);
    });

    faltan.forEach(function (m) {
      const soyYo = m.autor_id === S.yo.id;
      const av = U.avatar(m.nombre, true);
      grilla.appendChild(el('div', {
        class: 'atuendo pendiente' + (soyYo ? ' soy-yo' : '')
      }, [av, el('span', { text: soyYo ? 'Te toca 📸' : m.nombre })]));
    });

    if (!puestos.length && !faltan.length) {
      grilla.appendChild(el('p', {
        style: { gridColumn: '1 / -1', color: 'var(--texto-3)', textAlign: 'center', margin: '10px 0' },
        text: 'Todavía no subió nadie.'
      }));
    }

    /* --- botón de subir la mía --- */
    const btn = $('#btn-mi-atuendo', h.nodo);
    const mia = miAtuendo(j.id);
    if (mia) btn.textContent = '🔄 Cambiar mi vestimenta';
    btn.addEventListener('click', function () {
      abrirHojaAtuendo(j, function () { h.cerrar(); });
    });
  }

  /* ---------- subir la vestimenta propia ---------- */

  function abrirHojaAtuendo(j, alTerminar) {
    let elegida = null;
    let previaUrl = null;

    const limpiar = function () { if (previaUrl) { URL.revokeObjectURL(previaUrl); previaUrl = null; } };
    const h = U.abrirHoja('tpl-hoja-atuendo', limpiar);

    $('#a-consigna', h.nodo).textContent = j.consigna ? '👔 ' + j.consigna : '';

    const pasoElegir = $('#a-paso-elegir', h.nodo);
    const pasoPrevia = $('#a-paso-previa', h.nodo);
    const pasoSubiendo = $('#a-paso-subiendo', h.nodo);
    const pie = $('#a-pie', h.nodo);
    const previa = $('#a-previa', h.nodo);

    const inCamara = $('#file-atuendo-camara');
    const inGaleria = $('#file-atuendo-galeria');

    $$('[data-origen]', h.nodo).forEach(function (b) {
      b.addEventListener('click', function () {
        (b.dataset.origen === 'camara' ? inCamara : inGaleria).click();
      });
    });

    $('#a-cambiar', h.nodo).addEventListener('click', function () {
      limpiar();
      elegida = null;
      previa.innerHTML = '';
      pasoPrevia.classList.add('oculto');
      pie.classList.add('oculto');
      pasoElegir.classList.remove('oculto');
    });

    async function alElegir(ev) {
      const f = (ev.target.files || [])[0];
      ev.target.value = '';
      if (!f) return;

      pasoElegir.classList.add('oculto');
      pasoPrevia.classList.remove('oculto');
      previa.innerHTML = '';
      previa.appendChild(el('div', {
        style: { display: 'grid', placeItems: 'center', height: '100%', color: 'var(--texto-3)' },
        text: 'Procesando…'
      }));

      try {
        elegida = await window.Media.procesar(f);
        limpiar();
        previaUrl = URL.createObjectURL(elegida.media);
        previa.innerHTML = '';
        previa.appendChild(el('img', { src: previaUrl, alt: 'Tu vestimenta' }));
        pie.classList.remove('oculto');
      } catch (err) {
        elegida = null;
        previa.innerHTML = '';
        pasoPrevia.classList.add('oculto');
        pasoElegir.classList.remove('oculto');
        U.aviso(err.message || 'No pude procesar esa foto.', 'error', 4500);
      }
    }

    inCamara.onchange = alElegir;
    inGaleria.onchange = alElegir;

    $('#a-confirmar', h.nodo).addEventListener('click', async function () {
      if (!elegida) return;

      pasoPrevia.classList.add('oculto');
      pasoSubiendo.classList.remove('oculto');
      pie.classList.add('oculto');

      const barra = $('#a-barra', h.nodo);
      try {
        await S.store.guardarAtuendo({
          grupoId: S.grupo.id,
          juntadaId: j.id,
          autor: S.yo,
          procesado: elegida,
          nota: $('#a-nota', h.nodo).value.trim(),
          onProgress: function (f) { barra.style.width = Math.round(f * 100) + '%'; }
        });
        h.cerrar();
        if (alTerminar) alTerminar();
        U.aviso('¡Vestimenta subida! 👔', 'ok');
        await refrescar();
      } catch (e) {
        console.error(e);
        U.aviso(e.message || 'No se pudo subir.', 'error', 5000);
        pasoSubiendo.classList.add('oculto');
        pasoPrevia.classList.remove('oculto');
        pie.classList.remove('oculto');
      }
    });
  }

  /* ======================================================================
     Acciones sobre publicaciones
     ====================================================================== */

  async function reaccionar(p, emoji) {
    U.tocar();
    // Actualización optimista: la pastilla responde al toque al instante.
    const idx = S.reacciones.findIndex(r =>
      r.pub_id === p.id && r.autor_id === S.yo.id && r.emoji === emoji);

    if (idx >= 0) S.reacciones.splice(idx, 1);
    else S.reacciones.push({
      id: 'tmp_' + U.uid(), grupo_id: S.grupo.id, pub_id: p.id,
      autor_id: S.yo.id, autor_nombre: S.yo.nombre, emoji: emoji
    });
    pintarFeed();

    try {
      await S.store.alternarReaccion({
        grupoId: S.grupo.id, pubId: p.id,
        autorId: S.yo.id, autorNombre: S.yo.nombre, emoji: emoji
      });
    } catch (e) {
      U.aviso('No se pudo guardar la reacción.', 'error');
    }
    refrescar();
  }

  async function borrar(p) {
    if (!confirm('¿Borrar esto para todo el grupo?')) return;
    try {
      await S.store.borrarPublicacion(p);
      S.urls.delete(p.id);
      S.publicaciones = S.publicaciones.filter(x => x.id !== p.id);
      pintarFeed();
      U.aviso('Borrado.', 'ok');
      refrescar();
    } catch (e) {
      U.aviso(e.message || 'No se pudo borrar.', 'error');
    }
  }

  /* ======================================================================
     Visor a pantalla completa
     ====================================================================== */

  /** Sirve tanto para publicaciones como para fotos de vestimenta. */
  function abrirVisor(p, opciones) {
    const o = opciones || {};
    const urls = S.urls.get(p.id) || {};
    if (!urls.media) { U.aviso('No pude cargar el archivo.', 'error'); return; }

    const h = U.abrirHoja('tpl-visor');
    const cont = $('#visor-media', h.nodo);

    if (p.kind === 'video') {
      cont.appendChild(el('video', {
        src: urls.media, controls: '', autoplay: '', playsinline: '',
        poster: urls.thumb || undefined, style: { width: '100%' }
      }));
    } else {
      cont.appendChild(el('img', { src: urls.media, alt: o.pie || p.epigrafe || '' }));
    }

    const bajar = $('#visor-descargar', h.nodo);
    bajar.href = urls.media;
    bajar.setAttribute('download', 'juntada-' + p.id.slice(0, 8) + (p.kind === 'video' ? '.mp4' : '.jpg'));

    const pieVisor = $('#visor-pie', h.nodo);
    if (o.pie) pieVisor.appendChild(el('div', { text: o.pie }));
    if (o.alBorrar) {
      pieVisor.appendChild(el('button', {
        class: 'btn-texto btn-peligro',
        text: '🗑 Borrar',
        onclick: async function () {
          try { if (await o.alBorrar()) h.cerrar(); }
          catch (e) { U.aviso(e.message || 'No se pudo borrar.', 'error'); }
        }
      }));
    }
  }

  /* ======================================================================
     Reacciones — hoja de emojis
     ====================================================================== */

  function abrirHojaEmojis(p) {
    const h = U.abrirHoja('tpl-hoja-emojis');
    const grilla = $('#grilla-emojis', h.nodo);
    C.EMOJIS.forEach(function (e) {
      grilla.appendChild(el('button', {
        class: 'emoji-opcion',
        text: e,
        onclick: function () { reaccionar(p, e); h.cerrar(); }
      }));
    });
  }

  /* ======================================================================
     Comentarios
     ====================================================================== */

  async function abrirHojaComentarios(p) {
    const h = U.abrirHoja('tpl-hoja-comentarios');
    const lista = $('#lista-comentarios', h.nodo);
    const input = $('#in-comentario', h.nodo);
    const enviar = $('#btn-comentar', h.nodo);

    lista.appendChild(el('p', { style: { color: 'var(--texto-3)', textAlign: 'center' }, text: 'Cargando…' }));

    async function pintar() {
      let comentarios = [];
      try { comentarios = await S.store.listarComentarios(p.id); }
      catch (e) { U.aviso('No pude cargar los comentarios.', 'error'); }

      lista.innerHTML = '';
      if (!comentarios.length) {
        lista.appendChild(el('div', { class: 'vacio', style: { padding: '36px 10px' } }, [
          el('div', { class: 'emoji', text: '💬' }),
          el('h3', { text: 'Sin comentarios' }),
          el('p', { text: 'Sé el primero en decir algo.' })
        ]));
        return;
      }
      comentarios.forEach(function (c) {
        lista.appendChild(el('div', { class: 'comentario' }, [
          U.avatar(c.autor_nombre, true),
          el('div', { class: 'burbuja' }, [
            el('div', { class: 'nombre', text: c.autor_nombre + (c.autor_id === S.yo.id ? ' (vos)' : '') }),
            el('div', { class: 'cuerpo', text: c.cuerpo }),
            el('div', { class: 'cuando', text: U.cuando(c.creado) })
          ])
        ]));
      });
      lista.scrollTop = lista.scrollHeight;
    }

    input.addEventListener('input', function () {
      enviar.disabled = input.value.trim().length === 0;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 130) + 'px';
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); }
    });

    enviar.addEventListener('click', mandar);

    async function mandar() {
      const cuerpo = input.value.trim();
      if (!cuerpo) return;
      enviar.disabled = true;
      input.value = '';
      input.style.height = 'auto';
      try {
        await S.store.agregarComentario({
          grupoId: S.grupo.id, pubId: p.id, autor: S.yo, cuerpo: cuerpo
        });
        S.comentarios[p.id] = (S.comentarios[p.id] || 0) + 1;
        await pintar();
        pintarFeed();
      } catch (e) {
        U.aviso(e.message || 'No se pudo comentar.', 'error');
        input.value = cuerpo;
        enviar.disabled = false;
      }
    }

    await pintar();
  }

  /* ======================================================================
     Subir
     ====================================================================== */

  let seleccion = [];

  function abrirHojaSubir() {
    limpiarSeleccion();
    const h = U.abrirHoja('tpl-hoja-subir', limpiarSeleccion);

    const pasoElegir = $('#paso-elegir', h.nodo);
    const pasoPrevia = $('#paso-previa', h.nodo);
    const pasoSubiendo = $('#paso-subiendo', h.nodo);
    const pie = $('#pie-subir', h.nodo);
    const previas = $('#previas', h.nodo);

    const inCamara = $('#file-camara');
    const inGaleria = $('#file-galeria');

    $$('[data-origen]', h.nodo).forEach(function (b) {
      b.addEventListener('click', function () {
        (b.dataset.origen === 'camara' ? inCamara : inGaleria).click();
      });
    });

    async function alElegir(ev) {
      const archivos = Array.from(ev.target.files || []);
      ev.target.value = '';
      if (!archivos.length) return;

      const espacio = C.MAX_ARCHIVOS - seleccion.length;
      if (archivos.length > espacio) {
        U.aviso('Máximo ' + C.MAX_ARCHIVOS + ' archivos por vez.', 'error');
      }

      pasoElegir.classList.add('oculto');
      pasoPrevia.classList.remove('oculto');
      pie.classList.remove('oculto');

      for (const f of archivos.slice(0, Math.max(0, espacio))) {
        const tarjetaPrevia = el('div', { class: 'previa' }, [
          el('div', { class: 'etiqueta', text: 'Procesando…' })
        ]);
        previas.appendChild(tarjetaPrevia);

        try {
          const procesado = await window.Media.procesar(f);
          const item = { procesado: procesado, url: null };
          item.url = URL.createObjectURL(procesado.thumb || procesado.media);
          seleccion.push(item);

          tarjetaPrevia.innerHTML = '';
          tarjetaPrevia.appendChild(el('img', { src: item.url, alt: '' }));
          tarjetaPrevia.appendChild(el('div', {
            class: 'etiqueta',
            text: (procesado.kind === 'video' ? '▶ ' : '') + U.pesar(procesado.pesoFinal)
          }));
          tarjetaPrevia.appendChild(el('button', {
            class: 'quitar', 'aria-label': 'Quitar', text: '✕',
            onclick: function (e) {
              e.stopPropagation();
              const i = seleccion.indexOf(item);
              if (i >= 0) { URL.revokeObjectURL(item.url); seleccion.splice(i, 1); }
              tarjetaPrevia.remove();
              if (!seleccion.length) {
                pasoElegir.classList.remove('oculto');
                pasoPrevia.classList.add('oculto');
                pie.classList.add('oculto');
              }
            }
          }));
        } catch (err) {
          tarjetaPrevia.remove();
          U.aviso(err.message || 'No pude procesar ese archivo.', 'error', 4500);
        }
      }

      if (!seleccion.length) {
        pasoElegir.classList.remove('oculto');
        pasoPrevia.classList.add('oculto');
        pie.classList.add('oculto');
      }
    }

    inCamara.onchange = alElegir;
    inGaleria.onchange = alElegir;

    $('#btn-publicar', h.nodo).addEventListener('click', async function () {
      if (!seleccion.length) return;
      const epigrafe = $('#in-epigrafe', h.nodo).value.trim();

      pasoPrevia.classList.add('oculto');
      pasoSubiendo.classList.remove('oculto');
      pie.classList.add('oculto');

      const barra = $('#barra-progreso', h.nodo);
      const texto = $('#texto-progreso', h.nodo);
      const total = seleccion.length;
      let subidos = 0;

      for (const item of seleccion) {
        texto.textContent = 'Subiendo ' + (subidos + 1) + ' de ' + total + '…';
        try {
          await S.store.crearPublicacion({
            grupoId: S.grupo.id,
            autor: S.yo,
            procesado: item.procesado,
            // El epígrafe va en la primera: no queremos repetirlo en las nueve.
            epigrafe: subidos === 0 ? epigrafe : '',
            onProgress: function (f) {
              barra.style.width = Math.round(((subidos + f) / total) * 100) + '%';
            }
          });
          subidos++;
        } catch (err) {
          console.error(err);
          U.aviso(err.message || 'Falló una subida.', 'error', 5000);
        }
      }

      barra.style.width = '100%';
      h.cerrar();
      if (subidos) U.aviso(subidos === 1 ? '¡Subido!' : '¡' + subidos + ' subidos!', 'ok');
      await refrescar();
    });
  }

  function limpiarSeleccion() {
    seleccion.forEach(i => i.url && URL.revokeObjectURL(i.url));
    seleccion = [];
  }

  /* ======================================================================
     Invitar / menú / instalación
     ====================================================================== */

  function linkDeInvitacion() {
    const base = location.origin && location.origin !== 'null'
      ? location.origin + location.pathname
      : '';
    return base ? base + '?g=' + S.grupo.codigo : '';
  }

  async function invitar() {
    const link = linkDeInvitacion();
    const texto = 'Entrá al álbum de "' + S.grupo.nombre + '" con el código ' + S.grupo.codigo +
      (link ? '\n' + link : '');

    if (navigator.share) {
      try { await navigator.share({ title: 'Juntada', text: texto }); return; }
      catch (_) { /* el usuario canceló */ }
    }
    try {
      await navigator.clipboard.writeText(texto);
      U.aviso('Invitación copiada 📋', 'ok');
    } catch (_) {
      abrirMenu();
    }
  }

  function abrirMenu() {
    const h = U.abrirHoja('tpl-hoja-menu');
    $('#menu-titulo', h.nodo).textContent = S.grupo.nombre;
    $('#menu-codigo', h.nodo).value = S.grupo.codigo;

    $('#btn-copiar', h.nodo).addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(S.grupo.codigo);
        U.aviso('Código copiado 📋', 'ok');
      } catch (_) {
        const i = $('#menu-codigo', h.nodo);
        i.removeAttribute('readonly'); i.select(); document.execCommand('copy');
        i.setAttribute('readonly', ''); U.aviso('Código copiado 📋', 'ok');
      }
    });

    const lista = $('#menu-miembros', h.nodo);
    $('#menu-cuenta', h.nodo).textContent = S.miembros.length || '';

    if (!S.miembros.length) {
      lista.appendChild(el('p', { style: { color: 'var(--texto-3)', fontSize: '14px' }, text: 'Todavía sos el único.' }));
    }
    S.miembros.forEach(function (m) {
      const subidas = S.atuendos.filter(a => a.autor_id === m.autor_id).length;
      lista.appendChild(el('div', { class: 'miembro' }, [
        U.avatar(m.nombre, true),
        el('span', { class: 'nombre', text: m.nombre + (m.autor_id === S.yo.id ? ' (vos)' : '') }),
        el('span', { class: 'etiqueta', text: subidas ? subidas + ' 👔' : '—' })
      ]));
    });

    $('#btn-salir', h.nodo).addEventListener('click', function () {
      if (confirm('¿Salir del grupo? Podés volver con el código ' + S.grupo.codigo + '.')) {
        h.cerrar();
        salir();
      }
    });
  }

  /* ---------- go ---------- */

  arrancar().catch(function (e) {
    console.error(e);
    U.aviso('Error al arrancar: ' + e.message, 'error', 6000);
  });
})();

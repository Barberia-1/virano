/* ==========================================================================
   Backend LOCAL — modo prueba.

   Guarda todo, incluidos los archivos, en el navegador de este dispositivo.
   Sirve para probar la página entera sin crear una cuenta en ningún lado, pero
   tus amigos NO ven estas fotos: para eso está el backend de Supabase.

   Usa IndexedDB. Si no está disponible —Chrome y Edge la bloquean cuando abrís
   el archivo con doble clic, con una URL file://— cae a un modo en memoria que
   funciona igual pero se borra al recargar. Sin ese respaldo la página se
   quedaba colgada para siempre, porque indexedDB.open() en file:// no resuelve
   ni falla: simplemente no contesta nunca.

   Implementa exactamente la misma interfaz que store-supabase.js, así que
   app.js no sabe ni le importa cuál de los dos está corriendo.
   ========================================================================== */

window.StoreLocal = (function () {
  'use strict';

  const U = window.U;
  const NOMBRE_DB = 'juntada';
  const VERSION = 2;
  // Cuánto esperamos antes de dar IndexedDB por perdida. Con file:// sabemos
  // que no va a contestar nunca, así que cortamos rápido; servida por HTTP damos
  // margen de sobra, porque en un celular viejo abrir la base puede demorar.
  const ESPERA_MAX = location.protocol === 'file:' ? 1200 : 15000;

  const STORES = {
    grupos:        [['by_codigo', 'codigo', { unique: true }]],
    miembros:      [['by_grupo', 'grupo_id']],
    juntadas:      [['by_grupo', 'grupo_id']],
    atuendos:      [['by_grupo', 'grupo_id'], ['by_juntada', 'juntada_id']],
    publicaciones: [['by_grupo', 'grupo_id']],
    reacciones:    [['by_grupo', 'grupo_id'], ['by_pub', 'pub_id']],
    comentarios:   [['by_grupo', 'grupo_id'], ['by_pub', 'pub_id']],
    archivos:      []
  };

  let db = null;
  let enMemoria = false;
  const memoria = new Map();     // store -> Map(clave -> valor)
  const cacheUrls = new Map();
  let canal = null;

  /* ---------- envoltorio mínimo de IndexedDB ---------- */

  function abrir() {
    return new Promise(function (res, rej) {
      let resuelto = false;
      const listo = function (fn, arg) { if (!resuelto) { resuelto = true; fn(arg); } };

      // El timeout es el punto clave: en file:// la petición nunca contesta.
      const reloj = setTimeout(function () {
        listo(rej, new Error('IndexedDB no respondió'));
      }, ESPERA_MAX);

      let req;
      try { req = indexedDB.open(NOMBRE_DB, VERSION); }
      catch (e) { clearTimeout(reloj); listo(rej, e); return; }

      req.onupgradeneeded = function () {
        const d = req.result;

        // Idempotente: si el store ya existe lo dejamos como está, así subir de
        // versión no borra las fotos que el usuario ya tenía guardadas.
        const crear = function (nombre, indices) {
          const s = d.objectStoreNames.contains(nombre)
            ? req.transaction.objectStore(nombre)
            : d.createObjectStore(nombre, { keyPath: nombre === 'archivos' ? 'key' : 'id' });
          (indices || []).forEach(function (ix) {
            if (!s.indexNames.contains(ix[0])) s.createIndex(ix[0], ix[1], ix[2]);
          });
          return s;
        };

        Object.keys(STORES).forEach(n => crear(n, STORES[n]));
      };
      req.onsuccess = function () { clearTimeout(reloj); listo(res, req.result); };
      req.onerror = function () {
        clearTimeout(reloj);
        listo(rej, req.error || new Error('No se pudo abrir la base local'));
      };
    });
  }

  function tx(stores, modo) {
    return db.transaction(stores, modo || 'readonly');
  }

  function pedir(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  /* ---------- respaldo en memoria ---------- */

  // Qué campo mira cada índice, para poder filtrar sin IndexedDB.
  const CAMPO_DE_INDICE = {
    by_codigo: 'codigo', by_grupo: 'grupo_id', by_pub: 'pub_id', by_juntada: 'juntada_id'
  };

  function tabla(store) {
    if (!memoria.has(store)) memoria.set(store, new Map());
    return memoria.get(store);
  }
  const clavePrimaria = store => (store === 'archivos' ? 'key' : 'id');

  /* ---------- primitivas: van a IndexedDB o a memoria ---------- */

  function poner(store, valor) {
    if (enMemoria) { tabla(store).set(valor[clavePrimaria(store)], valor); return Promise.resolve(); }
    return pedir(tx([store], 'readwrite').objectStore(store).put(valor));
  }

  function sacar(store, clave) {
    if (enMemoria) return Promise.resolve(tabla(store).get(clave));
    return pedir(tx([store]).objectStore(store).get(clave));
  }

  function quitar(store, clave) {
    if (enMemoria) { tabla(store).delete(clave); return Promise.resolve(); }
    return pedir(tx([store], 'readwrite').objectStore(store).delete(clave));
  }

  function porIndice(store, indice, valor) {
    if (enMemoria) {
      const campo = CAMPO_DE_INDICE[indice];
      return Promise.resolve(Array.from(tabla(store).values()).filter(v => v[campo] === valor));
    }
    return pedir(tx([store]).objectStore(store).index(indice).getAll(valor));
  }

  /* ---------- avisos entre pestañas ---------- */

  function anunciar(tipo, datos) {
    try { canal && canal.postMessage({ tipo: tipo, datos: datos }); } catch (_) {}
  }

  /* ---------- interfaz pública ---------- */

  async function init() {
    try {
      db = await abrir();
      enMemoria = false;
    } catch (e) {
      console.warn('IndexedDB no disponible (' + e.message + '). Uso memoria.');
      enMemoria = true;
      Object.keys(STORES).forEach(tabla);
    }
    try { canal = new BroadcastChannel('juntada'); } catch (_) { canal = null; }
  }

  /** true si los datos se pierden al recargar. La UI lo avisa. */
  function esVolatil() { return enMemoria; }

  async function crearGrupo(datos) {
    // Reintentamos si el código salió repetido (improbable, pero es barato).
    for (let intento = 0; intento < 5; intento++) {
      const codigo = datos.codigo || U.codigoGrupo();
      const existente = await buscarGrupo(codigo);
      if (existente) { if (datos.codigo) throw new Error('Ese código ya está usado.'); continue; }

      const grupo = {
        id: U.uid(),
        codigo: codigo,
        nombre: datos.nombre || 'Mi grupo',
        creado: new Date().toISOString()
      };
      await poner('grupos', grupo);
      return grupo;
    }
    throw new Error('No pude generar un código libre. Probá de nuevo.');
  }

  async function buscarGrupo(codigo) {
    const r = await porIndice('grupos', 'by_codigo', String(codigo).toUpperCase());
    return r[0] || null;
  }

  async function listarPublicaciones(grupoId) {
    const r = await porIndice('publicaciones', 'by_grupo', grupoId);
    return r.sort((a, b) => b.creado.localeCompare(a.creado));
  }

  async function crearPublicacion(op) {
    const p = op.procesado;
    const id = U.uid();
    const claveMedia = 'm_' + id;
    const claveThumb = p.thumb ? 't_' + id : null;

    if (op.onProgress) op.onProgress(0.35);
    await poner('archivos', { key: claveMedia, blob: p.media });
    if (claveThumb) await poner('archivos', { key: claveThumb, blob: p.thumb });
    if (op.onProgress) op.onProgress(0.85);

    const pub = {
      id: id,
      grupo_id: op.grupoId,
      autor_id: op.autor.id,
      autor_nombre: op.autor.nombre,
      kind: p.kind,
      epigrafe: op.epigrafe || '',
      w: p.w, h: p.h, dur: p.dur,
      peso: p.pesoFinal,
      media_key: claveMedia,
      thumb_key: claveThumb,
      creado: new Date().toISOString()
    };
    await poner('publicaciones', pub);
    if (op.onProgress) op.onProgress(1);

    anunciar('publicacion', { grupo_id: op.grupoId });
    return pub;
  }

  async function borrarPublicacion(pub) {
    await quitar('publicaciones', pub.id);
    if (pub.media_key) await quitar('archivos', pub.media_key).catch(() => {});
    if (pub.thumb_key) await quitar('archivos', pub.thumb_key).catch(() => {});

    for (const r of await porIndice('reacciones', 'by_pub', pub.id)) await quitar('reacciones', r.id);
    for (const c of await porIndice('comentarios', 'by_pub', pub.id)) await quitar('comentarios', c.id);

    [pub.media_key, pub.thumb_key].forEach(function (k) {
      if (k && cacheUrls.has(k)) { URL.revokeObjectURL(cacheUrls.get(k)); cacheUrls.delete(k); }
    });
    anunciar('publicacion', { grupo_id: pub.grupo_id });
  }

  async function urlDe(clave) {
    if (!clave) return null;
    if (cacheUrls.has(clave)) return cacheUrls.get(clave);
    const reg = await sacar('archivos', clave);
    if (!reg) return null;
    const url = URL.createObjectURL(reg.blob);
    cacheUrls.set(clave, url);
    return url;
  }

  async function urlMedia(pub) {
    return { media: await urlDe(pub.media_key), thumb: await urlDe(pub.thumb_key) };
  }

  async function listarReacciones(grupoId) {
    return porIndice('reacciones', 'by_grupo', grupoId);
  }

  async function alternarReaccion(op) {
    const todas = await porIndice('reacciones', 'by_pub', op.pubId);
    const mia = todas.find(r => r.autor_id === op.autorId && r.emoji === op.emoji);

    if (mia) {
      await quitar('reacciones', mia.id);
    } else {
      await poner('reacciones', {
        id: U.uid(),
        grupo_id: op.grupoId,
        pub_id: op.pubId,
        autor_id: op.autorId,
        autor_nombre: op.autorNombre,
        emoji: op.emoji,
        creado: new Date().toISOString()
      });
    }
    anunciar('reaccion', { grupo_id: op.grupoId });
  }

  async function listarComentarios(pubId) {
    const r = await porIndice('comentarios', 'by_pub', pubId);
    return r.sort((a, b) => a.creado.localeCompare(b.creado));
  }

  async function contarComentarios(grupoId) {
    const todos = await porIndice('comentarios', 'by_grupo', grupoId);
    const mapa = {};
    todos.forEach(c => { mapa[c.pub_id] = (mapa[c.pub_id] || 0) + 1; });
    return mapa;
  }

  async function agregarComentario(op) {
    const c = {
      id: U.uid(),
      grupo_id: op.grupoId,
      pub_id: op.pubId,
      autor_id: op.autor.id,
      autor_nombre: op.autor.nombre,
      cuerpo: op.cuerpo,
      creado: new Date().toISOString()
    };
    await poner('comentarios', c);
    anunciar('comentario', { grupo_id: op.grupoId });
    return c;
  }

  /* ---------- miembros ---------- */

  async function registrarMiembro(op) {
    const todos = await porIndice('miembros', 'by_grupo', op.grupoId);
    const existente = todos.find(m => m.autor_id === op.autor.id);
    const m = {
      id: existente ? existente.id : U.uid(),
      grupo_id: op.grupoId,
      autor_id: op.autor.id,
      nombre: op.autor.nombre,
      visto: new Date().toISOString(),
      creado: existente ? existente.creado : new Date().toISOString()
    };
    await poner('miembros', m);
    anunciar('miembro', { grupo_id: op.grupoId });
    return m;
  }

  async function listarMiembros(grupoId) {
    const r = await porIndice('miembros', 'by_grupo', grupoId);
    return r.sort((a, b) => a.creado.localeCompare(b.creado));
  }

  /* ---------- juntadas ---------- */

  async function listarJuntadas(grupoId) {
    const r = await porIndice('juntadas', 'by_grupo', grupoId);
    return r.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  async function crearJuntada(op) {
    const j = {
      id: U.uid(),
      grupo_id: op.grupoId,
      titulo: op.titulo,
      fecha: op.fecha,
      lugar: op.lugar || '',
      consigna: op.consigna || '',
      autor_id: op.autor.id,
      autor_nombre: op.autor.nombre,
      creado: new Date().toISOString()
    };
    await poner('juntadas', j);
    anunciar('juntada', { grupo_id: op.grupoId });
    return j;
  }

  async function borrarJuntada(j) {
    for (const a of await porIndice('atuendos', 'by_juntada', j.id)) await borrarAtuendo(a);
    await quitar('juntadas', j.id);
    anunciar('juntada', { grupo_id: j.grupo_id });
  }

  /* ---------- atuendos (la vestimenta de cada uno) ---------- */

  async function listarAtuendos(grupoId) {
    const r = await porIndice('atuendos', 'by_grupo', grupoId);
    return r.sort((a, b) => a.creado.localeCompare(b.creado));
  }

  async function guardarAtuendo(op) {
    const p = op.procesado;
    const previos = await porIndice('atuendos', 'by_juntada', op.juntadaId);
    const mio = previos.find(a => a.autor_id === op.autor.id);

    const id = mio ? mio.id : U.uid();
    const claveMedia = 'am_' + U.uid();
    const claveThumb = p.thumb ? 'at_' + U.uid() : null;

    if (op.onProgress) op.onProgress(0.4);
    await poner('archivos', { key: claveMedia, blob: p.media });
    if (claveThumb) await poner('archivos', { key: claveThumb, blob: p.thumb });
    if (op.onProgress) op.onProgress(0.85);

    // Si estaba reemplazando una foto vieja, liberamos su espacio.
    if (mio) {
      [mio.media_key, mio.thumb_key].forEach(function (k) {
        if (!k) return;
        quitar('archivos', k).catch(() => {});
        if (cacheUrls.has(k)) { URL.revokeObjectURL(cacheUrls.get(k)); cacheUrls.delete(k); }
      });
    }

    const a = {
      id: id,
      grupo_id: op.grupoId,
      juntada_id: op.juntadaId,
      autor_id: op.autor.id,
      autor_nombre: op.autor.nombre,
      nota: op.nota || '',
      w: p.w, h: p.h,
      media_key: claveMedia,
      thumb_key: claveThumb,
      creado: new Date().toISOString()
    };
    await poner('atuendos', a);
    if (op.onProgress) op.onProgress(1);

    anunciar('atuendo', { grupo_id: op.grupoId });
    return a;
  }

  async function borrarAtuendo(a) {
    await quitar('atuendos', a.id);
    [a.media_key, a.thumb_key].forEach(function (k) {
      if (!k) return;
      quitar('archivos', k).catch(() => {});
      if (cacheUrls.has(k)) { URL.revokeObjectURL(cacheUrls.get(k)); cacheUrls.delete(k); }
    });
    anunciar('atuendo', { grupo_id: a.grupo_id });
  }

  /** Sincroniza entre pestañas del mismo dispositivo. Entre dispositivos, no. */
  function suscribir(grupoId, cb) {
    if (!canal) return function () {};
    const escuchar = function (ev) {
      if (ev.data && ev.data.datos && ev.data.datos.grupo_id === grupoId) cb(ev.data.tipo);
    };
    canal.addEventListener('message', escuchar);
    return function () { canal.removeEventListener('message', escuchar); };
  }

  return {
    nombre: 'local',
    enVivo: false,
    init: init,
    esVolatil: esVolatil,
    crearGrupo: crearGrupo,
    buscarGrupo: buscarGrupo,
    registrarMiembro: registrarMiembro,
    listarMiembros: listarMiembros,
    listarJuntadas: listarJuntadas,
    crearJuntada: crearJuntada,
    borrarJuntada: borrarJuntada,
    listarAtuendos: listarAtuendos,
    guardarAtuendo: guardarAtuendo,
    borrarAtuendo: borrarAtuendo,
    listarPublicaciones: listarPublicaciones,
    crearPublicacion: crearPublicacion,
    borrarPublicacion: borrarPublicacion,
    urlMedia: urlMedia,
    listarReacciones: listarReacciones,
    alternarReaccion: alternarReaccion,
    listarComentarios: listarComentarios,
    contarComentarios: contarComentarios,
    agregarComentario: agregarComentario,
    suscribir: suscribir
  };
})();

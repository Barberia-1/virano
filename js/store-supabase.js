/* ==========================================================================
   Backend SUPABASE — modo real.

   Se activa solo si cargaste SUPABASE_URL y SUPABASE_ANON_KEY en config.js.
   Guarda las fotos en Storage, los datos en Postgres, y usa Realtime para que
   cuando alguien sube algo aparezca en el celular de los demás sin recargar.

   Misma interfaz que store-local.js.
   ========================================================================== */

window.StoreSupabase = (function () {
  'use strict';

  const U = window.U;
  const C = window.CONFIG;
  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  let sb = null;
  let canal = null;

  function cargarLibreria() {
    return new Promise(function (res, rej) {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script');
      s.src = CDN;
      s.async = true;
      s.onload = function () {
        window.supabase && window.supabase.createClient
          ? res()
          : rej(new Error('La librería de Supabase cargó mal.'));
      };
      s.onerror = () => rej(new Error('No pude descargar la librería de Supabase. ¿Hay internet?'));
      document.head.appendChild(s);
    });
  }

  /** Traduce errores de Supabase a algo que se entienda. */
  function explotar(error, contexto) {
    if (!error) return;
    const m = String(error.message || error);
    if (/relation .* does not exist|schema cache/i.test(m)) {
      throw new Error('Faltan las tablas. Corré supabase/schema.sql en el SQL Editor de Supabase.');
    }
    if (/Bucket not found/i.test(m)) {
      throw new Error('Falta el bucket "' + C.BUCKET + '" en Storage. El schema.sql lo crea.');
    }
    if (/row-level security|violates row-level/i.test(m)) {
      throw new Error('Las políticas de acceso están bloqueando la operación. Volvé a correr schema.sql.');
    }
    if (/Payload too large|exceeded the maximum/i.test(m)) {
      throw new Error('El archivo excede el límite de subida del proyecto. Subilo desde Supabase → Storage → Settings.');
    }
    throw new Error((contexto ? contexto + ': ' : '') + m);
  }

  async function init() {
    await cargarLibreria();
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 4 } }
    });
    // Ping barato: si las tablas no existen, queremos enterarnos ahora y no
    // cuando el usuario ya escribió el nombre del grupo.
    const r = await sb.from('grupos').select('id').limit(1);
    if (r.error) explotar(r.error, 'Conectando');
  }

  /* ---------- grupos ---------- */

  async function crearGrupo(datos) {
    for (let intento = 0; intento < 5; intento++) {
      const codigo = (datos.codigo || U.codigoGrupo()).toUpperCase();
      const r = await sb.from('grupos')
        .insert({ codigo: codigo, nombre: datos.nombre || 'Mi grupo' })
        .select().single();

      if (!r.error) return r.data;
      if (/duplicate key/i.test(r.error.message)) {
        if (datos.codigo) throw new Error('Ese código ya está usado por otro grupo.');
        continue;
      }
      explotar(r.error, 'Creando el grupo');
    }
    throw new Error('No pude generar un código libre. Probá de nuevo.');
  }

  async function buscarGrupo(codigo) {
    const r = await sb.from('grupos').select('*')
      .eq('codigo', String(codigo).toUpperCase()).maybeSingle();
    if (r.error) explotar(r.error, 'Buscando el grupo');
    return r.data;
  }

  /* ---------- miembros ---------- */

  async function registrarMiembro(op) {
    const r = await sb.from('miembros').upsert({
      grupo_id: op.grupoId,
      autor_id: op.autor.id,
      nombre: op.autor.nombre,
      visto: new Date().toISOString()
    }, { onConflict: 'grupo_id,autor_id' }).select().single();
    if (r.error) explotar(r.error, 'Registrándote en el grupo');
    return r.data;
  }

  async function listarMiembros(grupoId) {
    const r = await sb.from('miembros').select('*')
      .eq('grupo_id', grupoId).order('creado', { ascending: true });
    if (r.error) explotar(r.error, 'Cargando los integrantes');
    return r.data || [];
  }

  /* ---------- juntadas ---------- */

  async function listarJuntadas(grupoId) {
    const r = await sb.from('juntadas').select('*')
      .eq('grupo_id', grupoId).order('fecha', { ascending: true });
    if (r.error) explotar(r.error, 'Cargando la agenda');
    return r.data || [];
  }

  async function crearJuntada(op) {
    const r = await sb.from('juntadas').insert({
      grupo_id: op.grupoId,
      titulo: op.titulo,
      fecha: op.fecha,
      lugar: op.lugar || '',
      consigna: op.consigna || '',
      autor_id: op.autor.id,
      autor_nombre: op.autor.nombre
    }).select().single();
    if (r.error) explotar(r.error, 'Creando la juntada');
    return r.data;
  }

  async function borrarJuntada(j) {
    // Los atuendos se borran solos por la FK, pero los archivos de Storage no.
    const at = await sb.from('atuendos').select('media_path,thumb_path').eq('juntada_id', j.id);
    const rutas = (at.data || []).flatMap(a => [a.media_path, a.thumb_path]).filter(Boolean);
    if (rutas.length) await sb.storage.from(C.BUCKET).remove(rutas).catch(() => {});

    const r = await sb.from('juntadas').delete().eq('id', j.id);
    if (r.error) explotar(r.error, 'Borrando la juntada');
  }

  /* ---------- atuendos (la vestimenta de cada uno) ---------- */

  async function listarAtuendos(grupoId) {
    const r = await sb.from('atuendos').select('*')
      .eq('grupo_id', grupoId).order('creado', { ascending: true });
    if (r.error) explotar(r.error, 'Cargando las vestimentas');
    return r.data || [];
  }

  async function guardarAtuendo(op) {
    const p = op.procesado;
    const base = op.grupoId + '/atuendos/' + op.juntadaId + '/' +
      Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    if (op.onProgress) op.onProgress(0.1);

    // Guardamos las rutas viejas para limpiarlas recién cuando la nueva entró.
    const previo = await sb.from('atuendos').select('media_path,thumb_path')
      .eq('juntada_id', op.juntadaId).eq('autor_id', op.autor.id).maybeSingle();

    let thumbPath = null;
    if (p.thumb) {
      thumbPath = await subirArchivo(base + '_t.jpg', p.thumb, 'image/jpeg');
      if (op.onProgress) op.onProgress(0.3);
    }
    const mediaPath = await subirArchivo(base + '.' + p.mediaExt, p.media, p.mediaTipo);
    if (op.onProgress) op.onProgress(0.9);

    const r = await sb.from('atuendos').upsert({
      grupo_id: op.grupoId,
      juntada_id: op.juntadaId,
      autor_id: op.autor.id,
      autor_nombre: op.autor.nombre,
      nota: op.nota || '',
      w: p.w, h: p.h,
      media_path: mediaPath,
      thumb_path: thumbPath,
      creado: new Date().toISOString()
    }, { onConflict: 'juntada_id,autor_id' }).select().single();

    if (r.error) {
      await sb.storage.from(C.BUCKET).remove([mediaPath, thumbPath].filter(Boolean)).catch(() => {});
      explotar(r.error, 'Guardando tu vestimenta');
    }

    if (previo.data) {
      const viejas = [previo.data.media_path, previo.data.thumb_path].filter(Boolean);
      if (viejas.length) await sb.storage.from(C.BUCKET).remove(viejas).catch(() => {});
    }

    if (op.onProgress) op.onProgress(1);
    return r.data;
  }

  async function borrarAtuendo(a) {
    const rutas = [a.media_path, a.thumb_path].filter(Boolean);
    if (rutas.length) await sb.storage.from(C.BUCKET).remove(rutas).catch(() => {});
    const r = await sb.from('atuendos').delete().eq('id', a.id);
    if (r.error) explotar(r.error, 'Borrando la vestimenta');
  }

  /* ---------- publicaciones ---------- */

  async function listarPublicaciones(grupoId) {
    const r = await sb.from('publicaciones').select('*')
      .eq('grupo_id', grupoId).order('creado', { ascending: false }).limit(200);
    if (r.error) explotar(r.error, 'Cargando el feed');
    return r.data || [];
  }

  async function subirArchivo(ruta, blob, tipo) {
    const r = await sb.storage.from(C.BUCKET).upload(ruta, blob, {
      contentType: tipo,
      cacheControl: '31536000',
      upsert: false
    });
    if (r.error) explotar(r.error, 'Subiendo el archivo');
    return ruta;
  }

  async function crearPublicacion(op) {
    const p = op.procesado;
    const base = op.grupoId + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    // La librería no expone progreso real de subida, así que marcamos etapas.
    if (op.onProgress) op.onProgress(0.1);

    let thumbPath = null;
    if (p.thumb) {
      thumbPath = await subirArchivo(base + '_t.jpg', p.thumb, 'image/jpeg');
      if (op.onProgress) op.onProgress(0.25);
    }

    const mediaPath = await subirArchivo(base + '.' + p.mediaExt, p.media, p.mediaTipo);
    if (op.onProgress) op.onProgress(0.9);

    const r = await sb.from('publicaciones').insert({
      grupo_id: op.grupoId,
      autor_id: op.autor.id,
      autor_nombre: op.autor.nombre,
      kind: p.kind,
      epigrafe: op.epigrafe || '',
      w: p.w, h: p.h, dur: p.dur,
      peso: p.pesoFinal,
      media_path: mediaPath,
      thumb_path: thumbPath
    }).select().single();

    if (r.error) {
      // No dejamos archivos huérfanos ocupando el plan gratis.
      await sb.storage.from(C.BUCKET).remove([mediaPath, thumbPath].filter(Boolean)).catch(() => {});
      explotar(r.error, 'Guardando la publicación');
    }

    if (op.onProgress) op.onProgress(1);
    return r.data;
  }

  async function borrarPublicacion(pub) {
    const rutas = [pub.media_path, pub.thumb_path].filter(Boolean);
    if (rutas.length) await sb.storage.from(C.BUCKET).remove(rutas).catch(() => {});
    const r = await sb.from('publicaciones').delete().eq('id', pub.id);
    if (r.error) explotar(r.error, 'Borrando');
  }

  function publica(ruta) {
    if (!ruta) return null;
    return sb.storage.from(C.BUCKET).getPublicUrl(ruta).data.publicUrl;
  }

  async function urlMedia(pub) {
    return { media: publica(pub.media_path), thumb: publica(pub.thumb_path) };
  }

  /* ---------- reacciones ---------- */

  async function listarReacciones(grupoId) {
    const r = await sb.from('reacciones').select('*').eq('grupo_id', grupoId);
    if (r.error) explotar(r.error, 'Cargando reacciones');
    return r.data || [];
  }

  async function alternarReaccion(op) {
    const existe = await sb.from('reacciones').select('id')
      .eq('pub_id', op.pubId).eq('autor_id', op.autorId).eq('emoji', op.emoji).maybeSingle();
    if (existe.error) explotar(existe.error, 'Reaccionando');

    if (existe.data) {
      const r = await sb.from('reacciones').delete().eq('id', existe.data.id);
      if (r.error) explotar(r.error, 'Sacando la reacción');
    } else {
      const r = await sb.from('reacciones').insert({
        grupo_id: op.grupoId, pub_id: op.pubId,
        autor_id: op.autorId, autor_nombre: op.autorNombre, emoji: op.emoji
      });
      if (r.error && !/duplicate key/i.test(r.error.message)) explotar(r.error, 'Reaccionando');
    }
  }

  /* ---------- comentarios ---------- */

  async function listarComentarios(pubId) {
    const r = await sb.from('comentarios').select('*')
      .eq('pub_id', pubId).order('creado', { ascending: true });
    if (r.error) explotar(r.error, 'Cargando comentarios');
    return r.data || [];
  }

  async function contarComentarios(grupoId) {
    const r = await sb.from('comentarios').select('pub_id').eq('grupo_id', grupoId);
    if (r.error) return {};
    const mapa = {};
    (r.data || []).forEach(c => { mapa[c.pub_id] = (mapa[c.pub_id] || 0) + 1; });
    return mapa;
  }

  async function agregarComentario(op) {
    const r = await sb.from('comentarios').insert({
      grupo_id: op.grupoId, pub_id: op.pubId,
      autor_id: op.autor.id, autor_nombre: op.autor.nombre,
      cuerpo: op.cuerpo
    }).select().single();
    if (r.error) explotar(r.error, 'Comentando');
    return r.data;
  }

  /* ---------- tiempo real ---------- */

  function suscribir(grupoId, cb) {
    if (canal) { sb.removeChannel(canal); canal = null; }

    const filtro = 'grupo_id=eq.' + grupoId;
    canal = sb.channel('grupo:' + grupoId);

    ['publicaciones', 'reacciones', 'comentarios',
     'miembros', 'juntadas', 'atuendos'].forEach(function (tabla) {
      canal.on('postgres_changes',
        { event: '*', schema: 'public', table: tabla, filter: filtro },
        function (payload) { cb(tabla, payload); });
    });

    canal.subscribe();

    return function () {
      if (canal) { sb.removeChannel(canal); canal = null; }
    };
  }

  return {
    nombre: 'supabase',
    enVivo: true,
    init: init,
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

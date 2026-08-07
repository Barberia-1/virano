/* ==========================================================================
   Procesamiento de media en el celular, antes de subir.

   Por qué existe este archivo: una foto de celular pesa 4–6 MB. Diez fotos y
   ya llenaste el plan gratis de Supabase. Acá la reducimos a ~250 KB sin que
   se note la diferencia en pantalla, y le sacamos una miniatura al video para
   que el feed no tenga que descargar 40 MB solo para mostrar la tapa.

   Los videos NO se recodifican: hacerlo en el navegador requiere ffmpeg.wasm
   (~30 MB de descarga) y tarda minutos en un celular. En vez de eso ponemos
   un límite de tamaño y avisamos.
   ========================================================================== */

window.Media = (function () {
  'use strict';

  const C = window.CONFIG;

  /* ---------- helpers ---------- */

  function dibujarEn(fuente, ancho, alto) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(ancho));
    cv.height = Math.max(1, Math.round(alto));
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, 0, 0, cv.width, cv.height);
    return cv;
  }

  function aBlob(canvas, tipo, calidad) {
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) {
        b ? res(b) : rej(new Error('No se pudo generar la imagen'));
      }, tipo, calidad);
    });
  }

  function encajar(w, h, maxLado) {
    const f = Math.min(1, maxLado / Math.max(w, h));
    return { w: Math.round(w * f), h: Math.round(h * f) };
  }

  /** createImageBitmap respetando la orientación EXIF, con plan B. */
  async function decodificar(file) {
    if (self.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (_) {
        try { return await createImageBitmap(file); } catch (_) {}
      }
    }
    // Plan B para navegadores viejos: <img> + object URL.
    return new Promise(function (res, rej) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Formato de imagen no soportado')); };
      img.src = url;
    });
  }

  /* ---------- imágenes ---------- */

  async function procesarImagen(file) {
    const bmp = await decodificar(file);
    const w0 = bmp.width || bmp.naturalWidth;
    const h0 = bmp.height || bmp.naturalHeight;

    const grande = encajar(w0, h0, C.MAX_LADO_FOTO);
    const chica = encajar(w0, h0, 480);

    const media = await aBlob(dibujarEn(bmp, grande.w, grande.h), 'image/jpeg', C.CALIDAD_FOTO);
    const thumb = await aBlob(dibujarEn(bmp, chica.w, chica.h), 'image/jpeg', 0.68);

    if (bmp.close) bmp.close();

    // Si comprimir no ayudó (imagen ya chica), mandamos la original.
    const usarOriginal = media.size >= file.size && file.type === 'image/jpeg';

    return {
      kind: 'image',
      media: usarOriginal ? file : media,
      mediaExt: usarOriginal ? 'jpg' : 'jpg',
      mediaTipo: 'image/jpeg',
      thumb: thumb,
      w: grande.w,
      h: grande.h,
      dur: null,
      pesoOriginal: file.size,
      pesoFinal: usarOriginal ? file.size : media.size
    };
  }

  /* ---------- videos ---------- */

  function cargarVideo(file) {
    return new Promise(function (res, rej) {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.crossOrigin = 'anonymous';

      const limpiar = () => URL.revokeObjectURL(url);
      const fallar = () => { limpiar(); rej(new Error('No se pudo leer el video')); };

      v.onerror = fallar;
      v.onloadedmetadata = function () { res({ v: v, limpiar: limpiar }); };
      setTimeout(function () { if (!v.videoWidth) fallar(); }, 8000);

      v.src = url;
    });
  }

  /** Saca un cuadro del video para usar de tapa en el feed. */
  function capturarCuadro(v, segundo) {
    return new Promise(function (res) {
      let listo = false;
      const terminar = function (canvas) { if (!listo) { listo = true; res(canvas); } };

      v.onseeked = function () {
        try {
          const t = encajar(v.videoWidth, v.videoHeight, 640);
          terminar(dibujarEn(v, t.w, t.h));
        } catch (_) { terminar(null); }
      };
      // iOS a veces no dispara 'seeked': cortamos por tiempo.
      setTimeout(() => terminar(null), 4000);

      try { v.currentTime = segundo; } catch (_) { terminar(null); }
    });
  }

  async function procesarVideo(file) {
    const maxBytes = C.MAX_MB_VIDEO * 1048576;
    if (file.size > maxBytes) {
      throw new Error('El video pesa ' + window.U.pesar(file.size) +
        ' y el máximo es ' + C.MAX_MB_VIDEO + ' MB. Recortalo un poco y probá de nuevo.');
    }

    let w = null, h = null, dur = null, thumb = null;

    try {
      const cargado = await cargarVideo(file);
      const v = cargado.v;
      w = v.videoWidth || null;
      h = v.videoHeight || null;
      dur = isFinite(v.duration) ? v.duration : null;

      const canvas = await capturarCuadro(v, Math.min(0.6, (dur || 1) / 3));
      if (canvas) thumb = await aBlob(canvas, 'image/jpeg', 0.7);

      cargado.limpiar();
      v.src = '';
    } catch (_) {
      // Sin miniatura el feed muestra un placeholder: no es motivo para no subir.
    }

    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().slice(0, 4);

    return {
      kind: 'video',
      media: file,
      mediaExt: /^[a-z0-9]+$/.test(ext) ? ext : 'mp4',
      mediaTipo: file.type || 'video/mp4',
      thumb: thumb,
      w: w, h: h, dur: dur,
      pesoOriginal: file.size,
      pesoFinal: file.size
    };
  }

  /* ---------- entrada pública ---------- */

  async function procesar(file) {
    const tipo = file.type || '';
    if (tipo.startsWith('image/')) {
      try {
        return await procesarImagen(file);
      } catch (e) {
        // HEIC de iPhone y formatos raros: subimos el original tal cual.
        if (file.size > 20 * 1048576) throw new Error('Esa imagen es muy pesada y no la pude comprimir.');
        return {
          kind: 'image', media: file, mediaExt: 'jpg', mediaTipo: tipo,
          thumb: null, w: null, h: null, dur: null,
          pesoOriginal: file.size, pesoFinal: file.size
        };
      }
    }
    if (tipo.startsWith('video/')) return procesarVideo(file);
    throw new Error('Solo se pueden subir fotos y videos.');
  }

  return { procesar: procesar };
})();

/* Script de prueba: maneja la interfaz real y escribe el resultado en #out. */
(function () {
  const out = document.createElement('pre');
  out.id = 'out';
  out.style.cssText = 'position:fixed;z-index:99999;inset:0;background:#fff;color:#111;font:12px monospace;white-space:pre-wrap;overflow:auto;padding:8px;display:none';
  document.body.appendChild(out);

  const log = [];
  const p = m => { log.push(m); out.textContent = log.join('\n'); };
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  window.addEventListener('error', e =>
    p('ERROR: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e =>
    p('REJECT: ' + ((e.reason && e.reason.stack) || e.reason)));

  (async function () {
    await esperar(3000);
    p('estado: ' + $('#estado-backend').textContent.trim().slice(0, 55));

    $('[data-modo="crear"]').click();
    $('#in-nombre').value = 'Pablo';
    $('#in-grupo').value = 'Los pibes';
    $('#form-entrar').dispatchEvent(new Event('submit', { cancelable: true }));
    await esperar(3000);

    p('pantalla app: ' + $('#pantalla-app').classList.contains('activa'));
    p('grupo: ' + $('#titulo-grupo').textContent + ' / codigo ' + $('#chip-codigo-texto').textContent);
    p('subtitulo: ' + $('#subtitulo-grupo').textContent);
    p('feed vacio: ' + ($('#feed .vacio h3') || {}).textContent);
    p('banner demo visible: ' + !$('#banner-demo').classList.contains('oculto'));

    $('.nav-item[data-vista="agenda"]').click();
    await esperar(800);
    p('agenda visible: ' + !$('#vista-agenda').classList.contains('oculto'));
    p('fab: ' + $('#fab-texto').textContent);
    p('agenda vacia: ' + ($('#agenda .vacio h3') || {}).textContent);

    $('#fab').click();
    await esperar(900);
    if (!$('#j-titulo')) { p('FALLO: no abrio la hoja de nueva juntada'); return; }
    p('fecha default: ' + $('#j-fecha').value + ' ' + $('#j-hora').value);
    $('#j-titulo').value = 'Asado en lo de Marto';
    $('#j-lugar').value = 'Siempre Viva 742';
    $('#j-consigna').value = 'Camisa obligatoria';
    $('#btn-crear-juntada').click();
    await esperar(3000);

    const card = $('#agenda .juntada');
    p('tarjeta juntada: ' + !!card);
    if (!card) { p('FALLO'); return; }
    p('  titulo: ' + card.querySelector('h3').textContent);
    p('  taco: ' + card.querySelector('.taco .dia').textContent + ' ' + card.querySelector('.taco .mes').textContent);
    p('  meta: ' + Array.from(card.querySelectorAll('.meta')).map(x => x.textContent).join(' | '));
    p('  consigna: ' + (card.querySelector('.consigna') || {}).textContent);
    p('  progreso: ' + card.querySelector('.progreso-vestimenta .texto').textContent);
    p('  caritas: ' + card.querySelectorAll('.caritas .avatar').length);
    p('  role/tabindex: ' + card.getAttribute('role') + '/' + card.getAttribute('tabindex'));
    p('separador: ' + ($('.separador-agenda') || {}).textContent);
    p('punto rojo agenda: ' + !$('#punto-agenda').classList.contains('oculto'));
    p('subtitulo: ' + $('#subtitulo-grupo').textContent);

    card.click();
    await esperar(900);
    p('detalle abierto: ' + !!$('#j-det-ficha'));
    if ($('#j-det-ficha')) {
      p('  ficha: ' + Array.from($$('#j-det-ficha .linea')).map(l => l.textContent).join(' | '));
      p('  contador: ' + $('#j-det-contador').textContent);
      p('  pendientes: ' + $$('.atuendo.pendiente').length);
      p('  soy-yo marcado: ' + !!$('.atuendo.pendiente.soy-yo'));
      p('  boton: ' + $('#btn-mi-atuendo').textContent);
      p('  boton borrar juntada: ' + !!Array.from($$('#j-det-ficha button')).find(b => /Borrar/.test(b.textContent)));

      $('#btn-mi-atuendo').click();
      await esperar(900);
      p('  hoja vestimenta: ' + !!$('#a-paso-elegir'));
      p('  consigna: ' + ($('#a-consigna') || {}).textContent);

      // Simulamos elegir una foto sin pasar por el selector de archivos.
      const cv = document.createElement('canvas'); cv.width = 300; cv.height = 400;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#8a4fff'; ctx.fillRect(0, 0, 300, 400);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .8));
      const archivo = new File([blob], 'outfit.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer(); dt.items.add(archivo);
      const inp = document.getElementById('file-atuendo-galeria');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change'));
      await esperar(2500);
      p('  previa cargada: ' + !!document.querySelector('#a-previa img'));
      p('  pie visible: ' + !document.querySelector('#a-pie').classList.contains('oculto'));

      document.querySelector('#a-nota').value = 'Camisa nueva';
      document.querySelector('#a-confirmar').click();
      await esperar(3000);
      p('  atuendos en grilla tras subir: ' + $$('#agenda .juntada .caritas .avatar').length);
      p('  progreso tras subir: ' + ($('#agenda .juntada .progreso-vestimenta .texto') || {}).textContent);
      p('  punto rojo tras subir: ' + !$('#punto-agenda').classList.contains('oculto'));
    }

    // Volvemos a abrir el detalle para ver la foto ya cargada.
    Array.from($$('[data-cerrar]')).forEach(b => b.click());
    await esperar(900);
    const card2 = $('#agenda .juntada');
    if (card2) {
      card2.click();
      await esperar(1200);
      p('detalle 2 — atuendos con foto: ' + $$('.atuendo img').length);
      p('detalle 2 — contador: ' + ($('#j-det-contador') || {}).textContent);
      p('detalle 2 — boton: ' + ($('#btn-mi-atuendo') || {}).textContent);
      Array.from($$('[data-cerrar]')).forEach(b => b.click());
      await esperar(700);
    }

    // Menú e integrantes
    $('#btn-menu').click();
    await esperar(1200);
    p('menu integrantes: ' + $$('#menu-miembros .miembro').length +
      ' / codigo ' + (($('#menu-codigo') || {}).value || ''));
    p('menu etiqueta atuendos: ' + (($('#menu-miembros .etiqueta') || {}).textContent || ''));
    Array.from($$('[data-cerrar]')).forEach(b => b.click());
    await esperar(700);

    // Volvemos a momentos y probamos publicar una foto
    $('.nav-item[data-vista="momentos"]').click();
    await esperar(600);
    $('#fab').click();
    await esperar(900);
    p('hoja subir abierta: ' + !!$('#paso-elegir'));
    const cv2 = document.createElement('canvas'); cv2.width = 800; cv2.height = 600;
    const c2 = cv2.getContext('2d'); c2.fillStyle = '#ff7a59'; c2.fillRect(0, 0, 800, 600);
    const b2 = await new Promise(r => cv2.toBlob(r, 'image/jpeg', .9));
    const dt2 = new DataTransfer(); dt2.items.add(new File([b2], 'foto.jpg', { type: 'image/jpeg' }));
    const inp2 = document.getElementById('file-galeria');
    inp2.files = dt2.files;
    inp2.dispatchEvent(new Event('change'));
    await esperar(2500);
    p('previas: ' + $$('#previas .previa').length + ' / etiqueta ' + (($('#previas .etiqueta') || {}).textContent || ''));
    $('#in-epigrafe').value = 'Que asado';
    $('#btn-publicar').click();
    await esperar(3000);
    p('publicaciones en feed: ' + $$('#feed .publicacion').length);
    p('  epigrafe: ' + (($('#feed .pub-texto') || {}).textContent || ''));
    p('  autor: ' + (($('#feed .pub-cabecera .nombre') || {}).textContent || ''));
    p('  pastillas: ' + $$('#feed .pub-acciones .pastilla').length);
    p('  subtitulo: ' + $('#subtitulo-grupo').textContent);

    // Reaccionar
    const pastillas = $$('#feed .pub-acciones .pastilla');
    pastillas[0].click();
    await esperar(1200);
    p('hoja emojis: ' + $$('#grilla-emojis .emoji-opcion').length);
    if ($('#grilla-emojis .emoji-opcion')) {
      $('#grilla-emojis .emoji-opcion').click();
      await esperar(2000);
      p('reaccion puesta: ' + !!$('#feed .pastilla.puesta') +
        ' / texto ' + (($('#feed .pastilla.puesta') || {}).textContent || ''));
    }

    // Comentar
    const btnCom = Array.from($$('#feed .pastilla')).find(b => /Comentar|💬/.test(b.textContent));
    btnCom.click();
    await esperar(1200);
    p('hoja comentarios: ' + !!$('#in-comentario'));
    if ($('#in-comentario')) {
      $('#in-comentario').value = 'Estuvo tremendo';
      $('#in-comentario').dispatchEvent(new Event('input'));
      $('#btn-comentar').click();
      await esperar(2000);
      p('comentarios: ' + $$('#lista-comentarios .comentario').length +
        ' / ' + (($('#lista-comentarios .cuerpo') || {}).textContent || ''));
      Array.from($$('[data-cerrar]')).forEach(b => b.click());
      await esperar(700);
    }
    p('contador comentarios en feed: ' + (Array.from($$('#feed .pastilla')).map(b => b.textContent).join(' ')));

    p('LISTO');
    out.style.display = 'block';
  })().catch(e => p('EXCEPCION: ' + (e && e.stack || e)));
})();

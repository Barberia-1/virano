(function () {
  'use strict';

  const formLogin = document.getElementById('form-login');
  const inputCodigo = document.getElementById('codigo-acceso');
  const panelLogin = document.getElementById('panel-login');
  const panelCliente = document.getElementById('panel-cliente');
  const panelPeluquero = document.getElementById('panel-peluquero');
  const panelOtros = document.getElementById('panel-otros');
  const btnLogoutCliente = document.getElementById('btn-logout-cliente');
  const btnLogoutPeluquero = document.getElementById('btn-logout-peluquero');
  const formSolicitud = document.getElementById('form-solicitud');
  const nombreInput = document.getElementById('nombre-solicitud');
  const estadoBackend = document.getElementById('estado-backend');
  const listaPendientes = document.getElementById('lista-pendientes');
  const listaConfirmados = document.getElementById('lista-confirmados');
  const contadorClientes = document.getElementById('contador-clientes');
  const vacioPendientes = document.getElementById('pendientes-vacio');
  const vacioConfirmados = document.getElementById('confirmados-vacio');
  const vacioContador = document.getElementById('contador-vacio');

  let supabase = null;
  let canal = null;
  let turnos = [];
  let role = null; // 'cliente' | 'peluquero'

  function cargarLibreriaSupabase() {
    return new Promise(function (res, rej) {
      if (window.supabase && window.supabase.createClient) return res();
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      script.async = true;
      script.onload = function () { window.supabase && window.supabase.createClient ? res() : rej(new Error('No pude cargar la librería de Supabase.')); };
      script.onerror = function () { rej(new Error('No pude descargar la librería de Supabase. Revisá tu conexión a internet.')); };
      document.head.appendChild(script);
    });
  }

  async function conectarSupabase() {
    if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || !window.CONFIG.SUPABASE_ANON_KEY) {
      throw new Error('Configurá SUPABASE_URL y SUPABASE_ANON_KEY en js/config.js para usar múltiples dispositivos.');
    }
    await cargarLibreriaSupabase();
    return window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 4 } }
    });
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function cargarTurnos() {
    const { data, error } = await supabase.from('peluqueria_turnos').select('*').order('creado', { ascending: false });
    if (error) throw error;
    turnos = data || [];
    render();
  }

  function mostrarPaneles() {
    panelLogin.classList.add('oculto');
    panelCliente.classList.toggle('oculto', role !== 'cliente');
    panelPeluquero.classList.toggle('oculto', role !== 'peluquero');
    panelOtros.classList.toggle('oculto', role === null);
  }

  function logout() {
    role = null;
    panelLogin.classList.remove('oculto');
    panelCliente.classList.add('oculto');
    panelPeluquero.classList.add('oculto');
    panelOtros.classList.add('oculto');
  }

  async function suscribirTurnos() {
    if (canal) return;
    canal = supabase.channel('turnos-peluqueria')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'peluqueria_turnos' }, () => {
        cargarTurnos().catch(console.warn);
      })
      .subscribe();
  }

  function crearElementoConfirmacion(turno) {
    const wrapper = document.createElement('div');
    wrapper.className = 'grid-dos';

    const campoDia = document.createElement('div');
    campoDia.className = 'campo';
    const labelDia = document.createElement('label');
    labelDia.textContent = 'Día';
    labelDia.htmlFor = 'dia-' + turno.id;
    const selectDia = document.createElement('select');
    selectDia.id = 'dia-' + turno.id;
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].forEach(function (dia) {
      const option = document.createElement('option');
      option.value = dia;
      option.textContent = dia;
      if (turno.dia === dia) option.selected = true;
      selectDia.appendChild(option);
    });
    campoDia.appendChild(labelDia);
    campoDia.appendChild(selectDia);

    const campoHora = document.createElement('div');
    campoHora.className = 'campo';
    const labelHora = document.createElement('label');
    labelHora.textContent = 'Hora';
    labelHora.htmlFor = 'hora-' + turno.id;
    const inputHora = document.createElement('input');
    inputHora.id = 'hora-' + turno.id;
    inputHora.type = 'time';
    inputHora.value = turno.hora || '10:00';
    campoHora.appendChild(labelHora);
    campoHora.appendChild(inputHora);

    wrapper.appendChild(campoDia);
    wrapper.appendChild(campoHora);
    return { wrapper, selectDia, inputHora };
  }

  async function confirmarTurno(id, dia, hora) {
    const { error } = await supabase.from('peluqueria_turnos').update({ estado: 'confirmado', dia: dia, hora: hora }).eq('id', id);
    if (error) throw error;
  }

  async function eliminarTurno(id) {
    const { error } = await supabase.from('peluqueria_turnos').delete().eq('id', id);
    if (error) throw error;
  }

  function renderTurno(turno) {
    const article = document.createElement('article');
    article.className = 'turno';

    const header = document.createElement('div');
    header.className = 'turno-header';
    const titulo = document.createElement('strong');
    titulo.textContent = escapeHtml(turno.nombre);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = turno.estado === 'pendiente' ? 'Pendiente' : 'Confirmado';
    header.appendChild(titulo);
    header.appendChild(badge);
    article.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'turno-meta';
    if (turno.estado === 'confirmado') {
      meta.innerHTML =
        '<span>📅 <strong>Día:</strong> ' + escapeHtml(turno.dia) + '</span>' +
        '<span>⏰ <strong>Hora:</strong> ' + escapeHtml(turno.hora) + '</span>';
    } else {
      const creado = new Date(turno.creado).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
      meta.innerHTML = '<span>🕒 Solicitud: ' + escapeHtml(creado) + '</span>';
    }
    article.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'turno-actions';

    if (role === 'peluquero' && turno.estado === 'pendiente') {
      const confirmar = document.createElement('button');
      confirmar.type = 'button';
      confirmar.className = 'btn btn-principal';
      confirmar.textContent = 'Confirmar turno';
      const { wrapper, selectDia, inputHora } = crearElementoConfirmacion(turno);
      confirmar.addEventListener('click', async function () {
        confirmar.disabled = true;
        try {
          await confirmarTurno(turno.id, selectDia.value, inputHora.value || '10:00');
        } catch (error) {
          alert('Error al confirmar el turno: ' + (error.message || error));
        } finally {
          confirmar.disabled = false;
        }
      });
      actions.appendChild(confirmar);
      const borrar = document.createElement('button');
      borrar.type = 'button';
      borrar.className = 'btn btn-texto';
      borrar.textContent = 'Eliminar solicitud';
      borrar.addEventListener('click', async function () {
        if (!confirm('Eliminar esta solicitud?')) return;
        try { await eliminarTurno(turno.id); } catch (error) { alert('Error eliminando: ' + (error.message || error)); }
      });
      actions.appendChild(borrar);
      article.appendChild(wrapper);
    } else if (role === 'peluquero' && turno.estado === 'confirmado') {
      const borrar = document.createElement('button');
      borrar.type = 'button';
      borrar.className = 'btn btn-texto';
      borrar.textContent = 'Cancelar turno';
      borrar.addEventListener('click', async function () {
        if (!confirm('Cancelar este turno confirmado?')) return;
        try { await eliminarTurno(turno.id); } catch (error) { alert('Error cancelando: ' + (error.message || error)); }
      });
      actions.appendChild(borrar);
    }

    article.appendChild(actions);
    return article;
  }

  function render() {
    const pendientes = turnos.filter(t => t.estado === 'pendiente');
    const confirmados = turnos.filter(t => t.estado === 'confirmado');

    listaPendientes.innerHTML = '';
    listaConfirmados.innerHTML = '';

    if (pendientes.length) {
      vacioPendientes.style.display = 'none';
      pendientes.forEach(turno => listaPendientes.appendChild(renderTurno(turno)));
    } else {
      vacioPendientes.style.display = 'block';
    }

    if (confirmados.length) {
      vacioConfirmados.style.display = 'none';
      confirmados.forEach(turno => listaConfirmados.appendChild(renderTurno(turno)));
    } else {
      vacioConfirmados.style.display = 'block';
    }

    renderContador(confirmados);
  }

  function renderContador(confirmados) {
    const cuentas = confirmados.reduce(function (acc, turno) {
      const nombre = turno.nombre.trim();
      if (!nombre) return acc;
      acc[nombre] = (acc[nombre] || 0) + 1;
      return acc;
    }, {});

    contadorClientes.innerHTML = '';
    const nombres = Object.keys(cuentas).sort((a, b) => cuentas[b] - cuentas[a] || a.localeCompare(b));
    if (!nombres.length) {
      vacioContador.style.display = 'block';
      return;
    }
    vacioContador.style.display = 'none';
    nombres.forEach(function (cliente) {
      const item = document.createElement('div');
      item.className = 'contador-item';
      item.innerHTML = '<span>' + escapeHtml(cliente) + '</span><strong>' + cuentas[cliente] + '</strong>';
      contadorClientes.appendChild(item);
    });
  }

  async function enviarSolicitud(nombre) {
    const { error } = await supabase.from('peluqueria_turnos').insert({ nombre: nombre.trim(), estado: 'pendiente' });
    if (error) throw error;
  }

  formLogin.addEventListener('submit', function (event) {
    event.preventDefault();
    const codigo = inputCodigo.value.trim().toUpperCase();
    if (codigo === 'PELUQUERO') {
      role = 'peluquero';
      mostrarPaneles();
      estadoBackend.textContent = 'Conectando con Supabase...';
      return;
    }
    if (codigo === 'CLIENTE') {
      role = 'cliente';
      mostrarPaneles();
      return;
    }
    alert('Código incorrecto. Usá PELUQUERO o CLIENTE.');
  });

  btnLogoutCliente.addEventListener('click', function () { logout(); });
  btnLogoutPeluquero.addEventListener('click', function () { logout(); });

  formSolicitud.addEventListener('submit', async function (event) {
    event.preventDefault();
    const nombre = nombreInput.value.trim();
    if (nombre.length < 2) {
      alert('Escribí tu nombre para pedir el corte.');
      return;
    }
    formSolicitud.querySelector('button').disabled = true;
    try {
      await window.Captcha.verificar(formSolicitud);
      await enviarSolicitud(nombre);
      nombreInput.value = '';
      if (window.turnstile) window.turnstile.reset(formSolicitud.querySelector('.cf-turnstile'));
      alert('Solicitud enviada. El peluquero la verá y la confirmará.');
    } catch (error) {
      alert('No se pudo enviar la solicitud: ' + (error.message || error));
    } finally {
      formSolicitud.querySelector('button').disabled = false;
    }
  });

  async function init() {
    try {
      supabase = await conectarSupabase();
      await cargarTurnos();
      await suscribirTurnos();
      if (role === 'peluquero') {
        estadoBackend.textContent = 'Conectado. El panel se actualiza en tiempo real.';
      }
    } catch (error) {
      if (role === 'peluquero') {
        estadoBackend.textContent = 'Error: ' + (error.message || error);
      }
      console.error(error);
    }
  }

  init();
})();

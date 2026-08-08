(function () {
  'use strict';

  const STORAGE_KEY = 'peluqueria-turnos';
  const supabaseConfigurado = Boolean(window.CONFIG && window.CONFIG.SUPABASE_URL && window.CONFIG.SUPABASE_ANON_KEY && window.supabase);
  const db = supabaseConfigurado
    ? window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY)
    : null;
  let canalTurnos = null;
  const form = document.getElementById('form-turno');
  const listaPendientes = document.getElementById('lista-pendientes');
  const listaConfirmados = document.getElementById('lista-confirmados');
  const contadorClientes = document.getElementById('contador-clientes');
  const clienteDetallePanel = document.getElementById('cliente-detalle-panel');
  const clienteDetalleNombre = document.getElementById('cliente-detalle-nombre');
  const clienteDetalleLista = document.getElementById('cliente-detalle-lista');
  const clienteDetalleVacio = document.getElementById('cliente-detalle-vacio');
  const btnCerrarClienteDetalle = document.getElementById('btn-cerrar-cliente-detalle');
  const resumenTurnos = document.getElementById('resumen-turnos');
  const resumenGanancias = document.getElementById('resumen-ganancias');
  const vacioConfirmados = document.getElementById('confirmados-vacio');
  const calendarioTitulo = document.getElementById('calendario-titulo');
  const calendarioAnterior = document.getElementById('calendario-anterior');
  const calendarioHoy = document.getElementById('calendario-hoy');
  const calendarioSiguiente = document.getElementById('calendario-siguiente');
  const resumenClientes = document.getElementById('resumen-clientes');
  const btnToggleGanancias = document.getElementById('btn-toggle-ganancias');
  const resumenGananciasTotalCard = document.getElementById('resumen-ganancias-totales-card');
  const resumenGananciasTotal = document.getElementById('resumen-ganancias-total');
  const inputFoto = document.getElementById('input-foto');
  const vacioPendientes = document.getElementById('pendientes-vacio');
  const vacioContador = document.getElementById('contador-vacio');
  const pantallaPrincipal = document.getElementById('pantalla-principal');
  const logoAgenda = document.getElementById('logo-agenda');
  const modalAcceso = document.getElementById('modal-acceso');
  const modalAccesoCerrar = document.getElementById('modal-acceso-cerrar');
  const formAccesoPeluquero = document.getElementById('form-acceso-peluquero');
  const inputCodigoPeluquero = document.getElementById('codigo-peluquero');
  const modalAccesoError = document.getElementById('modal-acceso-error');
  const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');
  const rolBadge = document.getElementById('rol-badge');
  const formConfiguracion = document.getElementById('form-configuracion');
  const configPrecioCorte = document.getElementById('config-precio-corte');
  const configPrecioCeja = document.getElementById('config-precio-ceja');
  const configPromoTitulo = document.getElementById('config-promo-titulo');
  const configPromoCorte = document.getElementById('config-promo-corte');
  const configPromoCeja = document.getElementById('config-promo-ceja');
  const configuracionMensaje = document.getElementById('configuracion-mensaje');
  const btnAgregarPromocion = document.getElementById('btn-agregar-promocion');
  const configPromocionesExtra = document.getElementById('config-promociones-extra');
  const promocionesExtraPortada = document.getElementById('promociones-extra-portada');
  const serviciosExtraForm = document.getElementById('servicios-extra-form');

  const CONFIG_KEY = 'peluqueria-configuracion';
  const CONFIG_DEFAULT = {
    precioCorte: 6000,
    precioCeja: 7000,
    promoTitulo: 'Elegí tu estilo',
    promoCorte: 'Corte de pelo',
    promoCeja: 'Corte + ceja',
    promocionesExtra: []
  };
  let turnos = [];
  let role = 'cliente';
  let fotoTurnoSeleccionado = null;
  let mostrarTotales = false;
  let toquesLogo = [];
  let mesCalendario = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const DEFAULT_WHATSAPP_COUNTRY = '54';
  let configuracion = cargarConfiguracion();
  const SERVICE_OPTIONS = {
    corte: { label: 'Corte de pelo', price: configuracion.precioCorte },
    'corte-ceja': { label: 'Corte de pelo + ceja', price: configuracion.precioCeja }
  };

  function cargarConfiguracion() {
    try {
      const guardada = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      return {
        precioCorte: Number.isFinite(Number(guardada.precioCorte)) ? Number(guardada.precioCorte) : CONFIG_DEFAULT.precioCorte,
        precioCeja: Number.isFinite(Number(guardada.precioCeja)) ? Number(guardada.precioCeja) : CONFIG_DEFAULT.precioCeja,
        promoTitulo: String(guardada.promoTitulo || CONFIG_DEFAULT.promoTitulo),
        promoCorte: String(guardada.promoCorte || CONFIG_DEFAULT.promoCorte),
        promoCeja: String(guardada.promoCeja || CONFIG_DEFAULT.promoCeja),
        promocionesExtra: Array.isArray(guardada.promocionesExtra) ? guardada.promocionesExtra.map(function (promo) {
          return {
            id: String(promo.id || ('extra-' + Date.now() + Math.random().toString(36).slice(2, 7))),
            nombre: String(promo.nombre || 'Promoción'),
            precio: Number.isFinite(Number(promo.precio)) ? Number(promo.precio) : 0
          };
        }) : []
      };
    } catch (error) {
      return Object.assign({}, CONFIG_DEFAULT);
    }
  }

  function formatearPrecio(precio) {
    return '$' + Number(precio).toLocaleString('es-AR');
  }

  function aplicarConfiguracionVisual() {
    Object.keys(SERVICE_OPTIONS).forEach(function (clave) {
      if (clave.indexOf('extra-') === 0) delete SERVICE_OPTIONS[clave];
    });
    SERVICE_OPTIONS.corte.price = configuracion.precioCorte;
    SERVICE_OPTIONS['corte-ceja'].price = configuracion.precioCeja;
    document.getElementById('promo-titulo').textContent = configuracion.promoTitulo;
    document.getElementById('promo-corte-texto').textContent = configuracion.promoCorte;
    document.getElementById('promo-ceja-texto').textContent = configuracion.promoCeja;
    document.getElementById('promo-corte-precio').textContent = formatearPrecio(configuracion.precioCorte);
    document.getElementById('promo-ceja-precio').textContent = formatearPrecio(configuracion.precioCeja);
    document.getElementById('lista-precio-corte').textContent = formatearPrecio(configuracion.precioCorte);
    document.getElementById('lista-precio-ceja').textContent = formatearPrecio(configuracion.precioCeja);
    document.getElementById('form-precio-corte').textContent = formatearPrecio(configuracion.precioCorte);
    document.getElementById('form-precio-ceja').textContent = formatearPrecio(configuracion.precioCeja);
    configPrecioCorte.value = configuracion.precioCorte;
    configPrecioCeja.value = configuracion.precioCeja;
    configPromoTitulo.value = configuracion.promoTitulo;
    configPromoCorte.value = configuracion.promoCorte;
    configPromoCeja.value = configuracion.promoCeja;
    renderPromocionesExtra();
  }

  function crearFilaPromocionExtra(promo) {
    const fila = document.createElement('div');
    fila.className = 'config-promocion-item';
    fila.dataset.id = promo.id;

    const campoNombre = document.createElement('div');
    campoNombre.className = 'campo';
    const labelNombre = document.createElement('label');
    labelNombre.textContent = 'Nombre de la promoción';
    const inputNombre = document.createElement('input');
    inputNombre.type = 'text';
    inputNombre.maxLength = 45;
    inputNombre.required = true;
    inputNombre.className = 'extra-nombre';
    inputNombre.value = promo.nombre;
    campoNombre.appendChild(labelNombre);
    campoNombre.appendChild(inputNombre);

    const campoPrecio = document.createElement('div');
    campoPrecio.className = 'campo';
    const labelPrecio = document.createElement('label');
    labelPrecio.textContent = 'Precio';
    const inputPrecio = document.createElement('input');
    inputPrecio.type = 'number';
    inputPrecio.min = '0';
    inputPrecio.step = '100';
    inputPrecio.required = true;
    inputPrecio.className = 'extra-precio';
    inputPrecio.value = promo.precio;
    campoPrecio.appendChild(labelPrecio);
    campoPrecio.appendChild(inputPrecio);

    const eliminar = document.createElement('button');
    eliminar.type = 'button';
    eliminar.className = 'btn btn-eliminar-promocion';
    eliminar.textContent = 'Eliminar';
    eliminar.addEventListener('click', function () { fila.remove(); });

    fila.appendChild(campoNombre);
    fila.appendChild(campoPrecio);
    fila.appendChild(eliminar);
    return fila;
  }

  function renderPromocionesExtra() {
    configPromocionesExtra.innerHTML = '';
    promocionesExtraPortada.innerHTML = '';
    serviciosExtraForm.innerHTML = '';

    configuracion.promocionesExtra.forEach(function (promo) {
      SERVICE_OPTIONS[promo.id] = { label: promo.nombre, price: promo.precio };
      configPromocionesExtra.appendChild(crearFilaPromocionExtra(promo));

      const tarjeta = document.createElement('article');
      tarjeta.className = 'promo-card';
      const etiqueta = document.createElement('span');
      etiqueta.textContent = 'PROMO';
      const nombre = document.createElement('h3');
      nombre.textContent = promo.nombre;
      const precio = document.createElement('strong');
      precio.textContent = formatearPrecio(promo.precio);
      tarjeta.appendChild(etiqueta);
      tarjeta.appendChild(nombre);
      tarjeta.appendChild(precio);
      promocionesExtraPortada.appendChild(tarjeta);

      const opcion = document.createElement('label');
      opcion.className = 'servicio-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'turno-servicio';
      radio.value = promo.id;
      const detalle = document.createElement('div');
      const texto = document.createElement('span');
      texto.textContent = promo.nombre;
      const valor = document.createElement('strong');
      valor.textContent = formatearPrecio(promo.precio);
      detalle.appendChild(texto);
      detalle.appendChild(valor);
      opcion.appendChild(radio);
      opcion.appendChild(detalle);
      serviciosExtraForm.appendChild(opcion);
    });
  }

  async function cargarTurnos() {
    if (db && role === 'barbero') {
      const resultado = await db.from('peluqueria_turnos').select('*').order('creado', { ascending: true });
      if (resultado.error) throw resultado.error;
      turnos = (resultado.data || []).map(desdeFilaSupabase);
      render();
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      turnos = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('No pude leer los turnos:', e);
      turnos = [];
    }
  }

  function guardarTurnos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(turnos));
  }

  function aFilaSupabase(turno) {
    return {
      id: String(turno.id), cliente: turno.cliente, telefono: turno.telefono || '',
      servicio: turno.servicio, comentario: turno.comentario || '', precio: Number(turno.precio) || 0,
      estado: turno.estado, dia: turno.dia || '', fecha: turno.fecha || '', hora: turno.hora || '',
      fotos: turno.fotos || [], creado: turno.creado,
      confirmado_fecha: turno.confirmadoFecha || null
    };
  }

  function desdeFilaSupabase(fila) {
    return {
      id: fila.id, cliente: fila.cliente, telefono: fila.telefono || '', servicio: fila.servicio,
      comentario: fila.comentario || '', precio: Number(fila.precio) || 0, estado: fila.estado,
      dia: fila.dia || '', fecha: fila.fecha || '', hora: fila.hora || '', fotos: fila.fotos || [],
      creado: fila.creado, confirmadoFecha: fila.confirmado_fecha || null
    };
  }

  async function guardarTurnoRemoto(turno, esNuevo) {
    if (!db) { guardarTurnos(); return; }
    const consulta = esNuevo
      ? db.from('peluqueria_turnos').insert(aFilaSupabase(turno))
      : db.from('peluqueria_turnos').update(aFilaSupabase(turno)).eq('id', turno.id);
    const resultado = await consulta;
    if (resultado.error) throw resultado.error;
  }

  async function borrarTurnoRemoto(id) {
    if (!db) { guardarTurnos(); return; }
    const resultado = await db.from('peluqueria_turnos').delete().eq('id', id);
    if (resultado.error) throw resultado.error;
  }

  function activarTiempoReal() {
    if (!db || canalTurnos) return;
    canalTurnos = db.channel('agenda-virano')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'peluqueria_turnos' }, function () {
        cargarTurnos().catch(function (error) { console.error('No se pudo actualizar la agenda:', error); });
      }).subscribe();
  }

  function detenerTiempoReal() {
    if (db && canalTurnos) db.removeChannel(canalTurnos);
    canalTurnos = null;
  }

  function crearTurno(datos) {
    const telefono = datos.telefono.trim();
    const servicioSeleccionado = SERVICE_OPTIONS[datos.servicio] || { label: datos.servicio.trim(), price: 0 };
    return {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      cliente: datos.cliente.trim(),
      telefono: telefono,
      dia: datos.dia,
      hora: datos.hora,
      fecha: datos.fecha || '',
      servicio: servicioSeleccionado.label,
      comentario: datos.comentario.trim(),
      precio: servicioSeleccionado.price,
      fotos: [],
      estado: 'pendiente',
      creado: new Date().toISOString()
    };
  }

  function ordenarPorFecha(turnosArray) {
    return turnosArray.slice().sort(function (a, b) {
      const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const dayA = dias.indexOf(a.dia);
      const dayB = dias.indexOf(b.dia);
      if (dayA !== dayB) return dayA - dayB;
      return a.hora.localeCompare(b.hora);
    });
  }

  function formatearFechaLocal(fecha) {
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    return dia + '/' + mes + '/' + año;
  }

  function normalizarDia(diaTexto) {
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const textoNormalizado = String(diaTexto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return dias.find(function (dia) {
      return dia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === textoNormalizado;
    }) || null;
  }

  function obtenerFechaProximaDeSemana(diaTexto) {
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const nombre = normalizarDia(diaTexto);
    const indiceObjetivo = dias.findIndex(function (d) { return normalizarDia(d) === nombre; });
    if (indiceObjetivo === -1) return null;

    const hoy = new Date();
    const hoyIndice = (hoy.getDay() + 6) % 7;
    let diferencia = indiceObjetivo - hoyIndice;
    if (diferencia < 0) diferencia += 7;

    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() + diferencia);
    return formatearFechaLocal(fecha);
  }

  function mostrarPanel(selectedRole) {
    role = selectedRole;
    pantallaPrincipal.classList.remove('oculto');
    document.body.classList.toggle('modo-barbero', selectedRole === 'barbero');
    document.body.classList.toggle('modo-cliente', selectedRole === 'cliente');
    rolBadge.textContent = 'Modo peluquero';
    rolBadge.className = 'badge badge-admin barbero-only';
    render();
  }

  function renderTurno(turno) {
    const article = document.createElement('article');
    article.className = 'turno';

    const header = document.createElement('div');
    header.className = 'turno-header';
    header.innerHTML = '<strong>' + escapeHtml(turno.cliente) + '</strong>' +
      '<span class="badge">' + (turno.estado === 'pendiente' ? 'Pendiente' : (turno.estado === 'realizado' ? 'Realizado' : 'Confirmado')) + '</span>';
    article.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'turno-meta';
    meta.innerHTML =
      '<span><strong>Servicio:</strong> ' + escapeHtml(turno.servicio) + '</span>' +
      '<span><strong>Día:</strong> ' + (turno.dia ? escapeHtml(turno.dia) : 'Pendiente') + '</span>' +
      '<span><strong>Fecha:</strong> ' + (turno.fecha ? escapeHtml(turno.fecha) : 'Pendiente') + '</span>' +
      '<span><strong>Hora:</strong> ' + (turno.hora ? escapeHtml(turno.hora) : 'Pendiente') + '</span>' +
      '<span><strong>Precio:</strong> ' + (turno.precio ? '$' + Number(turno.precio).toFixed(2) : 'No asignado') + '</span>' +
      '<span><strong>Teléfono:</strong> ' + (turno.telefono ? escapeHtml(turno.telefono) : 'No informado') + '</span>';
    article.appendChild(meta);

    if (turno.comentario) {
      const nota = document.createElement('p');
      nota.className = 'nota';
      nota.textContent = 'Nota: ' + turno.comentario;
      article.appendChild(nota);
    }

    if (role === 'barbero') {
      const actions = document.createElement('div');
      actions.className = 'turno-actions';

      if (turno.estado === 'pendiente') {
        const confirmar = document.createElement('button');
        confirmar.type = 'button';
        confirmar.className = 'btn btn-principal';
        confirmar.textContent = 'Asignar fecha y confirmar';
        confirmar.addEventListener('click', function () { asignarFechaYConfirmar(turno.id); });
        actions.appendChild(confirmar);
      }

      if (turno.estado === 'confirmado') {
        const subirFoto = document.createElement('button');
        subirFoto.type = 'button';
        subirFoto.className = 'btn btn-suave';
        subirFoto.textContent = 'Subir foto del corte';
        subirFoto.addEventListener('click', function () { iniciarSubidaFoto(turno.id); });
        actions.appendChild(subirFoto);

        const realizado = document.createElement('button');
        realizado.type = 'button';
        realizado.className = 'btn btn-success';
        realizado.textContent = 'Marcar realizado';
        realizado.addEventListener('click', function () { marcarRealizado(turno.id); });
        actions.appendChild(realizado);
      }

      const borrar = document.createElement('button');
      borrar.type = 'button';
      borrar.className = 'btn btn-texto';
      borrar.textContent = turno.estado === 'pendiente' ? 'Eliminar solicitud' : 'Cancelar turno';
      borrar.addEventListener('click', function () { eliminarTurno(turno.id); });
      actions.appendChild(borrar);

      article.appendChild(actions);
    }

    if (turno.fotos && turno.fotos.length) {
      const galeria = document.createElement('div');
      galeria.className = 'galeria-fotos';
      turno.fotos.forEach(function (fotoUrl) {
        const img = document.createElement('img');
        img.src = fotoUrl;
        img.alt = 'Foto del corte de ' + escapeHtml(turno.cliente);
        galeria.appendChild(img);
      });
      article.appendChild(galeria);
    }

    return article;
  }

  function renderConfirmados(confirmados) {
    listaConfirmados.innerHTML = '';
    ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach(function (nombre) {
      const encabezado = document.createElement('div');
      encabezado.className = 'calendario-semana';
      encabezado.textContent = nombre;
      listaConfirmados.appendChild(encabezado);
    });

    calendarioTitulo.textContent = mesCalendario.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const primerDia = new Date(mesCalendario.getFullYear(), mesCalendario.getMonth(), 1);
    const inicio = new Date(primerDia);
    inicio.setDate(1 - ((primerDia.getDay() + 6) % 7));
    const claveHoy = formatearFechaLocal(new Date());
    let visibles = 0;

    for (let indice = 0; indice < 42; indice += 1) {
      const fecha = new Date(inicio);
      fecha.setDate(inicio.getDate() + indice);
      const claveFecha = formatearFechaLocal(fecha);
      const celda = document.createElement('div');
      celda.className = 'calendario-dia';
      if (fecha.getMonth() !== mesCalendario.getMonth()) celda.classList.add('fuera-mes');
      if (claveFecha === claveHoy) celda.classList.add('hoy');

      const numero = document.createElement('span');
      numero.className = 'calendario-numero';
      numero.textContent = fecha.getDate();
      celda.appendChild(numero);

      const contenedor = document.createElement('div');
      contenedor.className = 'calendario-turnos';
      confirmados.filter(function (turno) { return turno.fecha === claveFecha; })
        .sort(function (a, b) { return (a.hora || '').localeCompare(b.hora || ''); })
        .forEach(function (turno) {
          visibles += 1;
          const item = document.createElement('button');
          item.className = 'calendario-turno';
          item.type = 'button';
          item.title = 'Abrir los turnos de ' + turno.cliente;
          const cliente = document.createElement('strong');
          cliente.textContent = (turno.hora || 'Sin hora') + ' · ' + turno.cliente;
          const servicio = document.createElement('span');
          servicio.textContent = turno.servicio;
          item.appendChild(cliente);
          item.appendChild(servicio);
          item.addEventListener('click', function () { abrirDetalleCliente(turno.cliente); });
          contenedor.appendChild(item);
        });
      celda.appendChild(contenedor);
      listaConfirmados.appendChild(celda);
    }

    vacioConfirmados.style.display = visibles ? 'none' : 'block';
    vacioConfirmados.textContent = 'No hay turnos confirmados en este mes.';
  }

  function abrirDetalleCliente(cliente) {
    const turnosCliente = ordenarPorFecha(turnos.filter(function (turno) {
      return turno.cliente.trim().toLowerCase() === cliente.toLowerCase() &&
        (turno.estado === 'confirmado' || turno.estado === 'realizado');
    }));

    clienteDetalleNombre.textContent = 'Cliente: ' + cliente;
    clienteDetalleLista.innerHTML = '';

    if (!turnosCliente.length) {
      clienteDetalleVacio.style.display = 'block';
      clienteDetallePanel.classList.remove('oculto');
      return;
    }

    clienteDetalleVacio.style.display = 'none';
    turnosCliente.forEach(function (turno) {
      clienteDetalleLista.appendChild(renderTurno(turno));
    });
    clienteDetallePanel.classList.remove('oculto');
  }

  function cerrarDetalleCliente() {
    clienteDetallePanel.classList.add('oculto');
  }

  function renderResumen(confirmados) {
    const clientesUnicos = Array.from(new Set(confirmados.map(function (turno) {
      return turno.cliente.trim();
    }).filter(Boolean))).length;

    const mesActual = obtenerMes(new Date().toISOString());
    const mensual = confirmados.reduce(function (sum, turno) {
      const fecha = turno.confirmadoFecha || turno.creado;
      return obtenerMes(fecha) === mesActual ? sum + (Number(turno.precio) || 0) : sum;
    }, 0);
    const total = confirmados.reduce(function (sum, turno) {
      return sum + (Number(turno.precio) || 0);
    }, 0);

    resumenTurnos.textContent = confirmados.length;
    resumenGanancias.textContent = '$' + mensual.toFixed(2);
    resumenClientes.textContent = clientesUnicos;
    if (resumenGananciasTotal) {
      resumenGananciasTotal.textContent = '$' + total.toFixed(2);
    }
  }

  function renderContador(confirmados) {
    const cuentas = confirmados.reduce(function (acc, turno) {
      const nombre = turno.cliente.trim();
      if (!nombre) return acc;
      acc[nombre] = (acc[nombre] || 0) + 1;
      return acc;
    }, {});

    contadorClientes.innerHTML = '';
    const nombres = Object.keys(cuentas).sort(function (a, b) { return a.localeCompare(b); });
    if (!nombres.length) {
      vacioContador.style.display = 'block';
      return;
    }
    vacioContador.style.display = 'none';
    nombres.forEach(function (cliente) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'contador-item';
      item.textContent = cliente;
      item.addEventListener('click', function () { abrirDetalleCliente(cliente); });
      contadorClientes.appendChild(item);
    });
  }

  function render() {
    const pendientes = ordenarPorFecha(turnos.filter(t => t.estado === 'pendiente'));
    const confirmados = ordenarPorFecha(turnos.filter(t => t.estado === 'confirmado'));
    const realizados = ordenarPorFecha(turnos.filter(t => t.estado === 'realizado'));
    const resumenTurnos = ordenarPorFecha(turnos.filter(function (t) {
      return t.estado === 'confirmado' || t.estado === 'realizado';
    }));

    listaPendientes.innerHTML = '';

    if (pendientes.length) {
      vacioPendientes.style.display = 'none';
      pendientes.forEach(function (turno) { listaPendientes.appendChild(renderTurno(turno)); });
    } else {
      vacioPendientes.style.display = 'block';
    }

    renderConfirmados(confirmados);
    renderResumen(resumenTurnos);
    renderContador(realizados);
    if (btnToggleGanancias) {
      btnToggleGanancias.textContent = mostrarTotales ? 'Ocultar ganancias totales' : 'Ver ganancias totales';
    }
  }

  async function asignarFechaYConfirmar(id) {
    const turno = turnos.find(t => t.id === id);
    if (!turno) return;

    const dia = window.prompt('Asigná el día para ' + turno.cliente + ' (por ejemplo: Miércoles)', turno.dia || '');
    if (dia === null || dia.trim() === '') return;
    const diaNormalizado = normalizarDia(dia);
    const fecha = obtenerFechaProximaDeSemana(dia);
    if (!fecha) {
      alert('Día no válido. Escribí Lunes, Martes, Miércoles, Jueves, Viernes, Sábado o Domingo.');
      return;
    }

    const hora = window.prompt('Asigná la hora para ' + turno.cliente + ' (por ejemplo: 18:30)', turno.hora || '');
    if (hora === null || hora.trim() === '') return;

    let precio = window.prompt('Ingresá el precio que vas a cobrar por este corte', turno.precio ? String(turno.precio) : '0');
    if (precio === null) return;
    precio = precio.trim().replace(',', '.');
    if (precio === '') precio = '0';
    const precioNum = parseFloat(precio);
    if (Number.isNaN(precioNum) || precioNum < 0) {
      alert('Precio no válido. Intentá de nuevo.');
      return;
    }

    turno.dia = diaNormalizado;
    turno.fecha = fecha;
    turno.hora = hora.trim();
    turno.precio = precioNum;
    turno.estado = 'confirmado';
    turno.confirmadoFecha = new Date().toISOString();
    try {
      await guardarTurnoRemoto(turno, false);
    } catch (error) {
      alert('No se pudo guardar el turno: ' + error.message);
      return;
    }
    render();

    if (turno.telefono && turno.telefono.trim()) {
      const enviar = window.confirm('¿Querés abrir WhatsApp para avisar al cliente?');
      if (enviar) {
        enviarWhatsapp(turno);
      }
    }
  }

  function enviarWhatsapp(turno) {
    let numero = turno.telefono.replace(/\D/g, '');
    if (!numero) {
      alert('No se pudo enviar WhatsApp porque el teléfono no es válido.');
      return;
    }
    if (!numero.startsWith('55') && !numero.startsWith('54') && numero.length <= 10) {
      numero = DEFAULT_WHATSAPP_COUNTRY + numero.replace(/^0+/, '');
    }
    const mensaje = encodeURIComponent(
      'Hola ' + turno.cliente + ', tu turno queda agendado el día ' + turno.dia + ' a las ' + turno.hora + '. Confirmá asistencia.'
    );
    const url = 'https://wa.me/' + numero + '?text=' + mensaje;
    const nuevaVentana = window.open(url, '_blank');
    if (!nuevaVentana) {
      window.location.href = url;
    }
  }

  function obtenerMes(isoDate) {
    const fecha = new Date(isoDate);
    return fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
  }


  function iniciarSubidaFoto(id) {
    fotoTurnoSeleccionado = id;
    inputFoto.value = '';
    inputFoto.click();
  }

  if (btnToggleGanancias) {
    btnToggleGanancias.addEventListener('click', function () {
      if (!resumenGananciasTotalCard) return;
      mostrarTotales = !mostrarTotales;
      resumenGananciasTotalCard.classList.toggle('oculto', !mostrarTotales);
      btnToggleGanancias.textContent = mostrarTotales ? 'Ocultar ganancias totales' : 'Ver ganancias totales';
    });
  }

  inputFoto.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file || !fotoTurnoSeleccionado) return;
    const lector = new FileReader();
    lector.onload = async function () {
      const turno = turnos.find(function (t) { return t.id === fotoTurnoSeleccionado; });
      if (!turno) return;
      turno.fotos = turno.fotos || [];
      turno.fotos.push(lector.result);
      try {
        await guardarTurnoRemoto(turno, false);
      } catch (error) {
        alert('No se pudo guardar la foto: ' + error.message);
      }
      render();
      fotoTurnoSeleccionado = null;
    };
    lector.readAsDataURL(file);
  });

  if (btnCerrarClienteDetalle) {
    btnCerrarClienteDetalle.addEventListener('click', cerrarDetalleCliente);
  }

  async function marcarRealizado(id) {
    const turno = turnos.find(function (t) { return t.id === id; });
    if (!turno) return;
    turno.estado = 'realizado';
    try {
      await guardarTurnoRemoto(turno, false);
    } catch (error) {
      alert('No se pudo actualizar el turno: ' + error.message);
    }
    render();
  }

  async function eliminarTurno(id) {
    turnos = turnos.filter(t => t.id !== id);
    try {
      await borrarTurnoRemoto(id);
    } catch (error) {
      alert('No se pudo eliminar el turno: ' + error.message);
      await cargarTurnos();
    }
    render();
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  listaConfirmados.closest('.panel').classList.add('agenda-calendario');

  calendarioAnterior.addEventListener('click', function () {
    mesCalendario = new Date(mesCalendario.getFullYear(), mesCalendario.getMonth() - 1, 1);
    render();
  });

  calendarioHoy.addEventListener('click', function () {
    const hoy = new Date();
    mesCalendario = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    render();
  });

  calendarioSiguiente.addEventListener('click', function () {
    mesCalendario = new Date(mesCalendario.getFullYear(), mesCalendario.getMonth() + 1, 1);
    render();
  });

  function abrirModalAcceso() {
    if (role !== 'cliente') return;
    modalAccesoError.textContent = '';
    inputCodigoPeluquero.value = '';
    modalAcceso.classList.remove('oculto');
    modalAcceso.setAttribute('aria-hidden', 'false');
    window.setTimeout(function () { inputCodigoPeluquero.focus(); }, 80);
  }

  function cerrarModalAcceso() {
    modalAcceso.classList.add('oculto');
    modalAcceso.setAttribute('aria-hidden', 'true');
    modalAccesoError.textContent = '';
    inputCodigoPeluquero.value = '';
  }

  logoAgenda.addEventListener('click', function () {
    const ahora = Date.now();
    toquesLogo = toquesLogo.filter(function (tiempo) { return ahora - tiempo <= 800; });
    toquesLogo.push(ahora);
    if (toquesLogo.length >= 3) {
      toquesLogo = [];
      abrirModalAcceso();
    }
  });

  modalAccesoCerrar.addEventListener('click', cerrarModalAcceso);
  modalAcceso.addEventListener('click', function (event) {
    if (event.target === modalAcceso) cerrarModalAcceso();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !modalAcceso.classList.contains('oculto')) cerrarModalAcceso();
  });

  formAccesoPeluquero.addEventListener('submit', async function (event) {
    event.preventDefault();
    const codigo = inputCodigoPeluquero.value;
    const boton = formAccesoPeluquero.querySelector('button[type="submit"]');
    if (!codigo) return;
    boton.disabled = true;
    modalAccesoError.textContent = '';
    try {
      if (!db) throw new Error('Supabase no está configurado.');
      const resultado = await db.auth.signInWithPassword({
        email: window.CONFIG.PELUQUERO_EMAIL,
        password: codigo
      });
      if (resultado.error || !resultado.data.session) {
        modalAccesoError.textContent = 'Código incorrecto.';
        inputCodigoPeluquero.select();
        return;
      }
      cerrarModalAcceso();
      mostrarPanel('barbero');
      activarTiempoReal();
      await cargarTurnos();
    } catch (error) {
      modalAccesoError.textContent = 'No se pudo validar el acceso. Revisá tu conexión.';
    } finally {
      boton.disabled = false;
    }
  });

  btnCerrarSesion.addEventListener('click', async function () {
    btnCerrarSesion.disabled = true;
    try {
      if (db) await db.auth.signOut();
    } finally {
      detenerTiempoReal();
      turnos = [];
      btnCerrarSesion.disabled = false;
      mostrarPanel('cliente');
    }
  });

  btnAgregarPromocion.addEventListener('click', function () {
    const nueva = {
      id: 'extra-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      nombre: 'Corte de pelo + barba',
      precio: 0
    };
    configPromocionesExtra.appendChild(crearFilaPromocionExtra(nueva));
    const ultimoNombre = configPromocionesExtra.lastElementChild.querySelector('.extra-nombre');
    ultimoNombre.focus();
    ultimoNombre.select();
  });

  formConfiguracion.addEventListener('submit', async function (event) {
    event.preventDefault();
    const precioCorte = Number(configPrecioCorte.value);
    const precioCeja = Number(configPrecioCeja.value);
    const promoTitulo = configPromoTitulo.value.trim();
    const promoCorte = configPromoCorte.value.trim();
    const promoCeja = configPromoCeja.value.trim();
    const promocionesExtra = Array.from(configPromocionesExtra.querySelectorAll('.config-promocion-item')).map(function (fila) {
      return {
        id: fila.dataset.id,
        nombre: fila.querySelector('.extra-nombre').value.trim(),
        precio: Number(fila.querySelector('.extra-precio').value)
      };
    });
    const extrasInvalidas = promocionesExtra.some(function (promo) {
      return !promo.nombre || !Number.isFinite(promo.precio) || promo.precio < 0;
    });

    if (!Number.isFinite(precioCorte) || precioCorte < 0 || !Number.isFinite(precioCeja) || precioCeja < 0 ||
        !promoTitulo || !promoCorte || !promoCeja || extrasInvalidas) {
      configuracionMensaje.style.color = 'var(--danger)';
      configuracionMensaje.textContent = 'Revisá los precios y completá todos los textos.';
      return;
    }

    configuracion = { precioCorte, precioCeja, promoTitulo, promoCorte, promoCeja, promocionesExtra };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(configuracion));
    if (db) {
      const resultado = await db.from('peluqueria_config').upsert({ id: 1, datos: configuracion, actualizado: new Date().toISOString() });
      if (resultado.error) {
        configuracionMensaje.style.color = 'var(--danger)';
        configuracionMensaje.textContent = 'No se pudieron guardar los cambios: ' + resultado.error.message;
        return;
      }
    }
    aplicarConfiguracionVisual();
    configuracionMensaje.style.color = 'var(--success)';
    configuracionMensaje.textContent = 'Cambios guardados.';
    window.setTimeout(function () { configuracionMensaje.textContent = ''; }, 2500);
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const cliente = document.getElementById('cliente-nombre').value;
    const telefono = document.getElementById('cliente-telefono').value;
    const servicioInput = document.querySelector('input[name="turno-servicio"]:checked');
    const servicio = servicioInput ? servicioInput.value : 'corte';
    const comentario = document.getElementById('turno-nota').value;

    if (cliente.trim().length < 2) {
      alert('Escribí el nombre del cliente.');
      return;
    }
    if (servicio.trim().length < 3) {
      alert('Escribí el servicio o corte solicitado.');
      return;
    }

    const botonEnviar = form.querySelector('button[type="submit"]');
    botonEnviar.disabled = true;
    const nuevo = crearTurno({ cliente, telefono, dia: '', hora: '', servicio, comentario });
    try {
      await guardarTurnoRemoto(nuevo, true);
      if (!db) {
        turnos.push(nuevo);
        guardarTurnos();
        render();
      }
    } catch (error) {
      alert('No se pudo enviar la solicitud: ' + error.message);
      botonEnviar.disabled = false;
      return;
    }
    form.reset();
    botonEnviar.disabled = false;
    document.getElementById('cliente-nombre').focus();
  });

  async function iniciar() {
    if (!db) await cargarTurnos();
    if (db) {
      const configRemota = await db.from('peluqueria_config').select('datos').eq('id', 1).maybeSingle();
      if (!configRemota.error && configRemota.data && configRemota.data.datos) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(configRemota.data.datos));
        configuracion = cargarConfiguracion();
      }
    }
    aplicarConfiguracionVisual();
    try {
      if (!db) { mostrarPanel('cliente'); return; }
      const resultado = await db.auth.getSession();
      const autenticado = Boolean(resultado.data.session);
      mostrarPanel(autenticado ? 'barbero' : 'cliente');
      if (autenticado) {
        activarTiempoReal();
        await cargarTurnos();
      }
    } catch (error) {
      mostrarPanel('cliente');
    }
  }

  iniciar();
})();

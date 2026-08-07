(function () {
  'use strict';

  const SITE_KEY_PRUEBA = '1x00000000000000000000AA';

  function esEntornoLocal() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' ||
      host === '0.0.0.0' || host === '' ||
      /^192\.168\./.test(host) || /^10\./.test(host);
  }

  async function verificar(formulario) {
    const campo = formulario.querySelector('[name="cf-turnstile-response"]');
    const token = campo ? campo.value : '';
    if (!token) throw new Error('Completá la verificación de seguridad.');

    let respuesta;
    try {
      respuesta = await fetch('/api/verificar-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token })
      });
    } catch (error) {
      // La clave oficial de prueba permite desarrollar con Live Server.
      if (clave === SITE_KEY_PRUEBA && esEntornoLocal()) return;
      throw new Error('No se pudo conectar con el servidor del captcha.');
    }

    if (!respuesta.ok && clave === SITE_KEY_PRUEBA && esEntornoLocal()) return;
    const resultado = await respuesta.json().catch(function () { return {}; });
    if (!respuesta.ok || !resultado.success) {
      if (window.turnstile) window.turnstile.reset(formulario.querySelector('.cf-turnstile'));
      throw new Error(resultado.message || 'No se pudo validar el captcha. Intentá de nuevo.');
    }
  }

  const clave = (window.CAPTCHA_CONFIG && window.CAPTCHA_CONFIG.SITE_KEY) || SITE_KEY_PRUEBA;
  document.querySelectorAll('.cf-turnstile').forEach(function (widget) {
    widget.dataset.sitekey = clave;
  });
  window.Captcha = { verificar: verificar };
})();

/* ==========================================================================
   CONFIGURACIÓN — este es el único archivo que necesitás tocar.
   ==========================================================================

   Mientras estas dos líneas estén vacías, la app corre en MODO PRUEBA:
   funciona perfecto pero las fotos quedan guardadas solo en tu dispositivo.

   Para que tus amigos vean las fotos, creá un proyecto gratis en supabase.com,
   corré el archivo supabase/schema.sql y pegá acá abajo tus dos valores
   (están en Project Settings → Data API).

   Los pasos detallados están en README.md.
   -------------------------------------------------------------------------- */

window.CONFIG = {
  SUPABASE_URL: 'https://zwmogvchdfyklwozhiwu.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_ASGdb3eHIebX3TXB-ueIjA_xzSWIo5h',
  PELUQUERO_EMAIL: 'gerolbh@gmail.com',

  /* Ajustes que podés cambiar si querés */
  BUCKET: 'media',                 // nombre del bucket de Storage en Supabase
  MAX_LADO_FOTO: 1800,             // px del lado más largo tras comprimir
  CALIDAD_FOTO: 0.82,              // 0 a 1
  MAX_MB_VIDEO: 100,               // videos más pesados se rechazan
  MAX_ARCHIVOS: 9,                 // cuántos se pueden subir de una
  EMOJIS: ['❤️', '😂', '🔥', '😮', '👏', '🥲', '🍻', '💯']
};

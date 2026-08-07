# =============================================================================
# Servidor web local para probar la página.
#
# Por qué hace falta: si abrís index.html con doble clic, el navegador usa una
# URL file:// y ahí Chrome y Edge bloquean el almacenamiento, así que no se
# puede guardar nada. Servida por HTTP, en cambio, funciona todo.
#
# No necesita instalar nada: usa el servidor HTTP que ya trae Windows.
#
# Uso: hacé doble clic en servidor.cmd, o desde PowerShell:  .\servidor.ps1
# =============================================================================

param(
    [int]$Puerto = 8080,
    [switch]$NoAbrirNavegador,
    [string]$PaginaInicial = 'index.html'
)

$raiz = $PSScriptRoot
$prefijo = "http://localhost:$Puerto/"
$turnstileSecret = if ($env:TURNSTILE_SECRET_KEY) {
    $env:TURNSTILE_SECRET_KEY
} else {
    # Clave oficial de prueba de Cloudflare: siempre valida correctamente.
    '1x0000000000000000000000000000000AA'
}
$codigoPeluquero = if ($env:PELUQUERO_ACCESS_CODE) { $env:PELUQUERO_ACCESS_CODE } else { 'Pelu2026' }
$sesionesPeluquero = @{}
$intentosAcceso = @{}
$duracionSesionSegundos = 7 * 24 * 60 * 60

function Escribir-Json($respuesta, [int]$estado, $datos) {
    $respuesta.StatusCode = $estado
    $respuesta.ContentType = 'application/json; charset=utf-8'
    $respuesta.Headers.Add('Cache-Control', 'no-store')
    $contenido = [System.Text.Encoding]::UTF8.GetBytes(($datos | ConvertTo-Json -Compress))
    $respuesta.ContentLength64 = $contenido.Length
    $respuesta.OutputStream.Write($contenido, 0, $contenido.Length)
}

function Obtener-TokenSesion($solicitud) {
    $cookie = $solicitud.Headers['Cookie']
    if ($cookie -and $cookie -match '(?:^|;\s*)peluqueria_session=([^;]+)') {
        return [System.Uri]::UnescapeDataString($Matches[1])
    }
    return $null
}

function Nueva-ClaveSesion() {
    $datos = New-Object byte[] 32
    $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $generador.GetBytes($datos)
    $generador.Dispose()
    return [Convert]::ToBase64String($datos).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$tipos = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.mp4'  = 'video/mp4'
    '.txt'  = 'text/plain; charset=utf-8'
    '.sql'  = 'text/plain; charset=utf-8'
    '.md'   = 'text/plain; charset=utf-8'
}

$oyente = New-Object System.Net.HttpListener
$oyente.Prefixes.Add($prefijo)

try {
    $oyente.Start()
} catch {
    Write-Host ""
    Write-Host "  No pude usar el puerto $Puerto." -ForegroundColor Red
    Write-Host "  Probá con otro:  .\servidor.ps1 -Puerto 8090" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Enter para cerrar"
    exit 1
}

# La IP de la red local, para poder abrirla desde el celular.
$ip = $null
try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
           Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
           Select-Object -First 1).IPAddress
} catch {}

Write-Host ""
Write-Host "  Juntada corriendo" -ForegroundColor Green
Write-Host ""
Write-Host "  En esta compu:  $prefijo" -ForegroundColor Cyan
if ($ip) {
    Write-Host "  Desde el celu:  http://${ip}:$Puerto/" -ForegroundColor Cyan
    Write-Host "                  (tiene que estar en el mismo WiFi; puede pedirte" -ForegroundColor DarkGray
    Write-Host "                   permiso en el Firewall de Windows la primera vez)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  Ctrl+C para cortar." -ForegroundColor DarkGray
Write-Host ""

if (-not $NoAbrirNavegador) {
    $urlInicial = $prefijo + $PaginaInicial.TrimStart('/')
    Start-Process $urlInicial
}

while ($oyente.IsListening) {
    try {
        $ctx = $oyente.GetContext()
    } catch {
        break
    }

    $req = $ctx.Request
    $res = $ctx.Response

    try {
        $ruta = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($ruta)) { $ruta = 'index.html' }

        if ($ruta -eq 'api/peluquero/session' -and $req.HttpMethod -eq 'GET') {
            $token = Obtener-TokenSesion $req
            $autenticado = $false
            if ($token -and $sesionesPeluquero.ContainsKey($token)) {
                if ($sesionesPeluquero[$token] -gt [DateTime]::UtcNow) {
                    $autenticado = $true
                } else {
                    $sesionesPeluquero.Remove($token)
                }
            }
            Escribir-Json $res 200 @{ authenticated = $autenticado }
            continue
        }

        if ($ruta -eq 'api/peluquero/login' -and $req.HttpMethod -eq 'POST') {
            $ipAcceso = $req.RemoteEndPoint.Address.ToString()
            $ahora = [DateTime]::UtcNow
            $registro = if ($intentosAcceso.ContainsKey($ipAcceso)) { $intentosAcceso[$ipAcceso] } else { @{ fallos = 0; bloqueadoHasta = [DateTime]::MinValue } }

            if ($registro.bloqueadoHasta -gt $ahora) {
                Escribir-Json $res 429 @{ authenticated = $false; message = 'Demasiados intentos. Esperá 30 segundos.' }
                continue
            }

            $lector = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
            $entrada = $lector.ReadToEnd() | ConvertFrom-Json
            $lector.Close()

            if ([string]$entrada.codigo -cne $codigoPeluquero) {
                $registro.fallos = [int]$registro.fallos + 1
                if ($registro.fallos -ge 5) {
                    $registro.fallos = 0
                    $registro.bloqueadoHasta = $ahora.AddSeconds(30)
                }
                $intentosAcceso[$ipAcceso] = $registro
                Escribir-Json $res 401 @{ authenticated = $false; message = 'Código incorrecto.' }
                continue
            }

            $intentosAcceso.Remove($ipAcceso)
            $token = Nueva-ClaveSesion
            $sesionesPeluquero[$token] = $ahora.AddSeconds($duracionSesionSegundos)
            $cookieSesion = "peluqueria_session=$token; Path=/; HttpOnly; SameSite=Strict; Max-Age=$duracionSesionSegundos"
            if ($req.IsSecureConnection) { $cookieSesion += '; Secure' }
            $res.Headers.Add('Set-Cookie', $cookieSesion)
            Escribir-Json $res 200 @{ authenticated = $true }
            continue
        }

        if ($ruta -eq 'api/peluquero/logout' -and $req.HttpMethod -eq 'POST') {
            $token = Obtener-TokenSesion $req
            if ($token) { $sesionesPeluquero.Remove($token) }
            $res.Headers.Add('Set-Cookie', 'peluqueria_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0')
            Escribir-Json $res 200 @{ authenticated = $false }
            continue
        }

        if ($ruta -eq 'api/verificar-captcha' -and $req.HttpMethod -eq 'POST') {
            $lector = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
            $entrada = $lector.ReadToEnd() | ConvertFrom-Json
            $lector.Close()

            if ([string]::IsNullOrWhiteSpace($entrada.token)) {
                $res.StatusCode = 400
                $resultado = @{ success = $false; message = 'Falta completar el captcha.' }
            } else {
                $validacion = Invoke-RestMethod `
                    -Uri 'https://challenges.cloudflare.com/turnstile/v0/siteverify' `
                    -Method Post `
                    -ContentType 'application/json' `
                    -Body (@{
                        secret = $turnstileSecret
                        response = [string]$entrada.token
                        remoteip = $req.RemoteEndPoint.Address.ToString()
                    } | ConvertTo-Json)
                $res.StatusCode = if ($validacion.success) { 200 } else { 403 }
                $resultado = @{
                    success = [bool]$validacion.success
                    message = if ($validacion.success) { 'Captcha válido.' } else { 'Captcha inválido o vencido.' }
                }
            }

            $res.ContentType = 'application/json; charset=utf-8'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes(($resultado | ConvertTo-Json -Compress))
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host ("  " + $res.StatusCode + "  /" + $ruta) -ForegroundColor DarkGray
            continue
        }

        $archivo = Join-Path $raiz ($ruta -replace '/', '\')

        # Nadie sale de la carpeta del proyecto.
        $completa = [System.IO.Path]::GetFullPath($archivo)
        $raizCompleta = [System.IO.Path]::GetFullPath($raiz)

        if (-not $completa.StartsWith($raizCompleta, [System.StringComparison]::OrdinalIgnoreCase)) {
            $res.StatusCode = 403
        } elseif (Test-Path -LiteralPath $completa -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($completa).ToLower()
            if ($ext -in @('.ps1', '.cmd', '.sql', '.env', '.key')) {
                $res.StatusCode = 403
                $cuerpo = [System.Text.Encoding]::UTF8.GetBytes('403 - archivo privado')
                $res.OutputStream.Write($cuerpo, 0, $cuerpo.Length)
                continue
            }
            $res.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
            $res.Headers.Add('Cache-Control', 'no-store')   # que siempre veas tus cambios
            $res.Headers.Add('X-Content-Type-Options', 'nosniff')

            $bytes = [System.IO.File]::ReadAllBytes($completa)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host ("  200  /" + $ruta) -ForegroundColor DarkGray
        } else {
            $res.StatusCode = 404
            $cuerpo = [System.Text.Encoding]::UTF8.GetBytes("404 - no existe /$ruta")
            $res.OutputStream.Write($cuerpo, 0, $cuerpo.Length)
            Write-Host ("  404  /" + $ruta) -ForegroundColor Yellow
        }
    } catch {
        try { $res.StatusCode = 500 } catch {}
        Write-Host ("  500  " + $_.Exception.Message) -ForegroundColor Red
    } finally {
        try { $res.OutputStream.Close() } catch {}
    }
}

$oyente.Stop()

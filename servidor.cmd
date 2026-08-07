@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -PaginaInicial "peluqueria.html"
exit /b %errorlevel%
REM Doble clic acá para levantar la página en http://localhost:8080

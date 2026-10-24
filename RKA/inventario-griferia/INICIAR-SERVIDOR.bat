@echo off
title RKA - Sistema de Inventario
cd /d "%~dp0"
echo Iniciando servidor local para RKA...
echo.
echo Cuando aparezca "Serving HTTP", abre tu navegador en:
echo    http://localhost:8000
echo.
echo NO cierres esta ventana mientras uses el sistema.
echo.
start "" "http://localhost:8000/index.html"
python -m http.server 8000
pause

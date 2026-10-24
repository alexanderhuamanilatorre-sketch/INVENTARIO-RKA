@echo off
title RKA - Backend
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\start-backend.ps1"
if errorlevel 1 echo No se pudo iniciar el backend. Revisa el mensaje de error anterior.
pause

@echo off
title Kryzixs YouTube Downloader ^& Hub Server
cd /d "%~dp0"
echo Starting Kryzixs Downloader ^& Local Hub (http://127.0.0.1:4545/)...
echo The hub opens in your browser automatically once the server is ready.

set "PY=C:\Users\kryzi\AppData\Local\Programs\Python\Python312\python.exe"
if not exist "%PY%" (
  where py >nul 2>nul && (set "PY=py") || (set "PY=python")
)

"%PY%" yt_downloader.py --open %*
if errorlevel 1 (
  echo.
  echo Python exited with an error. Press any key to exit...
  pause > nul
)

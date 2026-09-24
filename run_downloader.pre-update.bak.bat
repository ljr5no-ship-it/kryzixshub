@echo off
title Kryzixs YouTube Downloader & Hub Server
echo Starting Kryzixs Downloader & Local Hub Engine (port 4545)...
timeout /t 1 /nobreak > nul
start "" "http://127.0.0.1:4545/"
"C:\Users\kryzi\AppData\Local\Programs\Python\Python312\python.exe" yt_downloader.py
if errorlevel 1 (
  echo.
  echo Python exited with an error. Press any key to exit...
  pause > nul
)

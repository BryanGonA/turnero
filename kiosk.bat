@echo off
REM Lanzador de PANTALLA de sala del Turnero (Windows - la PC conectada al TV).
REM
REM No instala nada: solo abre Chrome en modo kiosco con los flags correctos
REM (autoplay habilitado para que la campanita y la voz suenen desde el
REM primer turno, sin necesitar interaccion).
REM
REM Uso:
REM   kiosk.bat                  -> apunta a http://localhost:8080/screen
REM   kiosk.bat 192.168.1.50     -> apunta al servidor en esa IP

setlocal
set "SERVER=%~1"
if "%SERVER%"=="" set "SERVER=localhost"
set "URL=http://%SERVER%:8080/screen"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo ERROR: no encontre Chrome instalado.
  echo Instalalo desde https://www.google.com/chrome y volve a correr este .bat
  pause
  exit /b 1
)

echo Abriendo Chrome en modo kiosco -^> %URL%
start "" "%CHROME%" --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-infobars --no-first-run "%URL%"
endlocal

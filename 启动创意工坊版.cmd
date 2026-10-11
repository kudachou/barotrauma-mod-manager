@echo off
REM Launch the Workshop build of the mod manager.
REM Clears ELECTRON_RUN_AS_NODE: if it is set, Electron runs as plain Node
REM and the app exits without showing any window.
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0release-ws\win-unpacked"
for %%f in ("*.exe") do if not defined APPEXE if not "%%~nxf"=="unins000.exe" set "APPEXE=%%~ff"
start "" "%APPEXE%"
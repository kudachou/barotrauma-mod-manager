@echo off
rem ---------------------------------------------------------------
rem  Launch the installer for the Workshop edition of the mod manager.
rem
rem  Why this file exists: Steam only DOWNLOADS a Workshop item; it never
rem  runs anything. So subscribing alone cannot start the exe - the user has
rem  to run this script, or double-click the setup .exe themselves.
rem
rem  Why the messages are in English: a .cmd with non-ASCII text is
rem  unreliable across console code pages and turns into mojibake exactly
rem  when someone is trying to install. The file name is ASCII too, so both
rem  the Chinese and the English Workshop description can quote it verbatim.
rem ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

set "SETUP="
for %%f in ("*workshop-setup-*.exe") do set "SETUP=%%~ff"

if not defined SETUP (
  echo.
  echo   Could not find the installer next to this script.
  echo   Expected a file named like *workshop-setup-*.exe in:
  echo   %~dp0
  echo.
  pause
  exit /b 1
)

echo.
echo   Running the installer:
echo   %SETUP%
echo.
echo   It installs for the current user only - no administrator rights needed.
echo   A desktop shortcut is created when it finishes.
echo.

start "" "%SETUP%"

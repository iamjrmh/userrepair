@echo off
SETLOCAL ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
SET "SCRIPT_DIR=%~dp0"
SET "OUT_DIR=%SCRIPT_DIR%Software"
SET "REL_DIR=%SCRIPT_DIR%src-tauri\target\release"

CALL :main
GOTO :end

:main
    REM Install dependencies on first run.
    IF NOT EXIST "%SCRIPT_DIR%node_modules" (
        ECHO [userrepair] Installing npm dependencies...
        CALL npm install || goto :error
    )

    ECHO [userrepair] Building release (Rust binary + NSIS and MSI installers)...
    ECHO [userrepair] This is a full optimized build and can take several minutes.
    CALL npm run tauri:build || goto :error

    IF NOT EXIST "%OUT_DIR%" MKDIR "%OUT_DIR%"

    ECHO [userrepair] Collecting artifacts into Software\ ...

    REM Standalone executable.
    IF EXIST "%REL_DIR%\userrepair.exe" (
        COPY /Y "%REL_DIR%\userrepair.exe" "%OUT_DIR%\" >NUL || goto :error
    )

    REM NSIS installer.
    IF EXIST "%REL_DIR%\bundle\nsis" (
        COPY /Y "%REL_DIR%\bundle\nsis\*.exe" "%OUT_DIR%\" >NUL || goto :error
    )

    REM MSI installer.
    IF EXIST "%REL_DIR%\bundle\msi" (
        COPY /Y "%REL_DIR%\bundle\msi\*.msi" "%OUT_DIR%\" >NUL || goto :error
    )

    ECHO.
    ECHO [userrepair] Done. Artifacts in: "%OUT_DIR%"
    DIR /B "%OUT_DIR%"
    EXIT /B 0

:error
    ECHO [ERROR] Build failed with code %ERRORLEVEL% 1>&2
    EXIT /B %ERRORLEVEL%

:end
ENDLOCAL

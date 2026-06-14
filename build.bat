@echo off
SETLOCAL ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
SET "SCRIPT_DIR=%~dp0"
SET "OUT_DIR=%SCRIPT_DIR%Software"
SET "REL_DIR=%SCRIPT_DIR%src-tauri\target\release"

CALL :bumpversion
CALL :main
GOTO :end

:bumpversion
    REM Read the current version from package.json.
    SET "CUR_VER="
    FOR /F "usebackq delims=" %%V IN (`powershell -NoProfile -Command "(Get-Content '%SCRIPT_DIR%package.json' -Raw | ConvertFrom-Json).version"`) DO SET "CUR_VER=%%V"

    ECHO.
    ECHO [userrepair] Current version is !CUR_VER!
    SET "NEW_VER="
    SET /P "NEW_VER=Enter new version (leave blank to keep !CUR_VER!): "
    IF NOT DEFINED NEW_VER (
        ECHO [userrepair] Keeping version !CUR_VER!.
        EXIT /B 0
    )

    REM Validate basic semver shape (digits.dots, optional pre-release suffix).
    ECHO !NEW_VER!| findstr /R "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >NUL || (
        ECHO [ERROR] "!NEW_VER!" is not a valid version like 1.2.3 1>&2
        EXIT /B 1
    )

    ECHO [userrepair] Bumping version !CUR_VER! -^> !NEW_VER! ...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%bump-version.ps1" -Version "!NEW_VER!" || goto :error
    ECHO [userrepair] Updated package.json, tauri.conf.json, Cargo.toml, and Cargo.lock to !NEW_VER!.
    EXIT /B 0

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

    REM NSIS installer -> userrepair-setup.exe (drop the version from the name).
    IF EXIST "%REL_DIR%\bundle\nsis" (
        FOR %%F IN ("%REL_DIR%\bundle\nsis\*.exe") DO COPY /Y "%%F" "%OUT_DIR%\userrepair-setup.exe" >NUL || goto :error
    )

    REM MSI installer -> userrepair-setup.msi (drop the version from the name).
    IF EXIST "%REL_DIR%\bundle\msi" (
        FOR %%F IN ("%REL_DIR%\bundle\msi\*.msi") DO COPY /Y "%%F" "%OUT_DIR%\userrepair-setup.msi" >NUL || goto :error
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

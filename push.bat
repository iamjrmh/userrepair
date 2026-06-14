@echo off
SETLOCAL ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
SET "SCRIPT_DIR=%~dp0"
SET "REPO=https://github.com/iamjrmh/userrepair.git"
SET "BRANCH=main"

REM Commit message: pass one as an argument, else a default is used.
SET "MSG=%~1"
IF "%MSG%"=="" SET "MSG=Update userrepair"

CALL :main
GOTO :end

:main
    git --version >NUL 2>&1
    IF ERRORLEVEL 1 (
        ECHO [ERROR] git is not installed or not on PATH. 1>&2
        EXIT /B 1
    )

    REM Initialize the repository on first run.
    IF NOT EXIST "%SCRIPT_DIR%.git" (
        ECHO [push] Initializing git repository...
        git init || goto :error
        git branch -M %BRANCH% || goto :error
    )

    REM Point origin at the target repo (add on first run, otherwise update it).
    git remote get-url origin >NUL 2>&1
    IF ERRORLEVEL 1 (
        git remote add origin "%REPO%" || goto :error
    ) ELSE (
        git remote set-url origin "%REPO%" || goto :error
    )

    REM Belt-and-suspenders: never track the build-output folder, even if it was
    REM committed before .gitignore covered it. (.gitignore already excludes it.)
    git rm -r --cached --ignore-unmatch Software >NUL 2>&1

    REM Stage only the required files. .gitignore excludes node_modules, build
    REM output, the local database, and the internal docs, so just add everything.
    ECHO [push] Staging files...
    git add -A || goto :error

    REM Commit only if something changed.
    git diff --cached --quiet
    IF ERRORLEVEL 1 (
        git commit -m "%MSG%" || goto :error
    ) ELSE (
        ECHO [push] No changes to commit.
    )

    ECHO [push] Force-pushing to %REPO% (%BRANCH%)...
    git push -u --force origin %BRANCH% || goto :error

    ECHO.
    ECHO [push] Done.
    EXIT /B 0

:error
    ECHO [ERROR] push failed with code %ERRORLEVEL% 1>&2
    EXIT /B %ERRORLEVEL%

:end
ENDLOCAL

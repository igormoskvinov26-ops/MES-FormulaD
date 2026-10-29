@echo off
chcp 65001 >nul
net session >nul 2>&1 || (echo Запустите от имени администратора! & pause & exit /b 1)

set "SVC_NAME=FormulaD-MES"
set "SVC_DISPLAY=FormulaD MES 2.0"
set "EXE_DIR=%~dp0"
set "EXE_PATH=%EXE_DIR%FormulaD.Mes.Api.exe"

if not exist "%EXE_PATH%" (
    echo ОШИБКА: %EXE_PATH% не найден.
    echo Скопируйте этот файл в папку с FormulaD.Mes.Api.exe
    pause & exit /b 1
)

if not exist "%EXE_DIR%appsettings.Production.json" (
    echo ОШИБКА: appsettings.Production.json не найден рядом с exe.
    echo Создайте его по образцу deploy/appsettings.Production.example.json
    pause & exit /b 1
)

echo ============================================
echo  Установка службы %SVC_DISPLAY%
echo ============================================
echo.

sc query "%SVC_NAME%" >nul 2>&1 && (
    echo Служба уже существует, останавливаю...
    sc stop "%SVC_NAME%" >nul 2>&1
    timeout /t 3 /nobreak >nul
    sc delete "%SVC_NAME%"
    timeout /t 2 /nobreak >nul
)

sc create "%SVC_NAME%" ^
    binPath="\"%EXE_PATH%\"" ^
    DisplayName="%SVC_DISPLAY%" ^
    start=auto

sc description "%SVC_NAME%" "FormulaD MES 2.0 — производственный план (read-only)"
sc start "%SVC_NAME%"

echo.
echo ============================================
echo  Готово!
echo  Служба: %SVC_NAME%
echo  URL: см. appsettings.Production.json
echo ============================================
echo.
echo  Управление:
echo    sc stop %SVC_NAME%
echo    sc start %SVC_NAME%
echo    sc delete %SVC_NAME%   (удалить)
echo.
pause

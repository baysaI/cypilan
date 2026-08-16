@echo off
chcp 65001 > nul
echo ===================================================
echo   CYPILAN VERITABANI VE TABLO ONARIM SCRIPTI
echo ===================================================
echo.

node scripts/fix-database.js

echo.
echo PM2 servisi yeniden baslatiliyor...
call pm2 restart cypilan
if errorlevel 1 (
    call pm2 restart all
)

echo.
echo ===================================================
echo   TAMAMLANDI! SISTEM YENIDEN BASLATILDI.
echo ===================================================
pause

@echo off
rem Zamanlanmis gorev icin sarmalayici. Calisma dizinini proje koku yapar,
rem boylece gorev nereden tetiklenirse tetiklensin ayni yerde calisir.
cd /d "%~dp0.."
node scripts\backup-db.js

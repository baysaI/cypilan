@echo off
rem Zamanlanmis gorevin cagirdigi sarmalayici. Calisma dizinini proje koku
rem yapar, boylece gorev nereden tetiklenirse tetiklensin ayni yerde calisir.
rem
rem Dosya adi "backup-db" olarak kaldi: VDS'teki zamanlanmis gorev bu yolu
rem gosteriyor ve adi degistirmek, gorevi de guncellemeyi unutuldugu anda
rem yedeklemenin sessizce durmasi demek olurdu.
cd /d "%~dp0.."
node scripts\backup-db.js
node scripts\backup-uploads.js

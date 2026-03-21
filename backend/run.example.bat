@echo off
REM Copia a run.bat o run.local.bat y ajusta PATH si hace falta.
set PATH=C:\msys64\mingw64\bin;%USERPROFILE%\.cargo\bin;%PATH%
cargo run

@echo off
REM Ajusta PATH si usas MSYS2/MinGW para enlazar (opcional).
set PATH=C:\msys64\mingw64\bin;%USERPROFILE%\.cargo\bin;%PATH%

REM Todas las variables sensibles van en backend\.env (copia desde .env.example).
REM No subas .env ni scripts con contraseñas al repositorio.

cargo run

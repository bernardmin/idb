@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo  HD현대중공업 데이터센터 냉각 최적화 데모
echo ============================================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [오류] Python 을 찾을 수 없습니다.
  echo        https://www.python.org/downloads/ 에서 Python 3.11 이상을 설치하고,
  echo        설치 화면에서 "Add Python to PATH" 를 반드시 체크하십시오.
  echo.
  pause
  exit /b 1
)

if not exist "static\data.js" (
  echo [준비] 처음 실행입니다. 데이터 생성부터 학습까지 진행합니다. 5~10분 걸립니다.
  echo.
  echo   [1/6] 필요한 패키지 설치
  python -m pip install --quiet -r requirements.txt || goto :failed
  echo   [2/6] 90일 가상 운전 데이터 생성
  python src\generate_data.py || goto :failed
  echo   [3/6] 데이터 진단
  python src\diagnose.py || goto :failed
  echo   [4/6] 전처리
  python src\preprocess.py || goto :failed
  echo   [5/6] 모델 학습
  python src\train.py || goto :failed
  echo   [6/6] 화면 데이터 생성
  python src\export_web.py || goto :failed
  echo.
  echo [준비] 완료했습니다.
  echo.
)

echo [실행] 브라우저를 엽니다.
start "" "%~dp0static\index.html"
echo.
echo  화면이 안 열리면 아래 파일을 직접 더블클릭하십시오.
echo    %~dp0static\index.html
echo.
pause
exit /b 0

:failed
echo.
echo [오류] 준비 중 문제가 발생했습니다. 위 메시지를 확인하십시오.
pause
exit /b 1

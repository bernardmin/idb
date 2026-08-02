#!/usr/bin/env bash
# macOS / Linux 용. 윈도우는 run.bat 을 쓰십시오.
set -e
cd "$(dirname "$0")"
if [ ! -f static/data.js ]; then
  python3 -m pip install --quiet -r requirements.txt
  python3 src/generate_data.py
  python3 src/diagnose.py
  python3 src/preprocess.py
  python3 src/train.py
  python3 src/export_web.py
fi
echo "static/index.html 을 브라우저로 여십시오."
python3 -m http.server 8090 --directory static

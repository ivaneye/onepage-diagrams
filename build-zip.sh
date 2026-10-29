#!/usr/bin/env bash
# 打一个解压即用的目录包：onepage-diagrams-<version>.zip
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
NAME="onepage-diagrams-${VERSION}"
STAGE=$(mktemp -d)
mkdir -p "${STAGE}/onepage-diagrams"
cp main.js manifest.json styles.css versions.json README.md README_CN.md LICENSE "${STAGE}/onepage-diagrams/"
[ -d vendor ] && cp -R vendor "${STAGE}/onepage-diagrams/"

rm -f "${NAME}.zip"
(cd "${STAGE}" && zip -qr "${NAME}.zip" onepage-diagrams)
mv "${STAGE}/${NAME}.zip" .
rm -rf "${STAGE}"
echo "已生成 ${NAME}.zip"

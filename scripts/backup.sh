#!/usr/bin/env bash
#
# backup.sh — Crea un ZIP del proyecto excluyendo archivos innecesarios.
# Uso: ./scripts/backup.sh [nombre_salida]
# Resultado: ~/Escritorio/telemetry-system/backups/<nombre>.zip
#

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"
BACKUP_DIR="$(dirname "$PROJECT_DIR")/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_NAME="${1:-${PROJECT_NAME}_${TIMESTAMP}}"

mkdir -p "$BACKUP_DIR"

OUTPUT_PATH="$BACKUP_DIR/${OUTPUT_NAME}.zip"

cd "$PROJECT_DIR"

zip -r "$OUTPUT_PATH" . \
  -x "*/node_modules/*" \
  -x "*/.venv/*" \
  -x "*/venv/*" \
  -x "*/__pycache__/*" \
  -x "*/.env" \
  -x "*/dist/*" \
  -x "*/build/*" \
  -x "*/.git/*" \
  -x "*/.next/*" \
  -x "*/.cache/*" \
  -x "*/.turbo/*" \
  -x "*/coverage/*" \
  -x "*/*.log" \
  -x "*/.DS_Store" \
  -x "*/Thumbs.db"

SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)
echo ""
echo "✓ Backup creado: $OUTPUT_PATH ($SIZE)"

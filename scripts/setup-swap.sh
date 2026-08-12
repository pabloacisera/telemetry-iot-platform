#!/usr/bin/env bash
#
# setup-swap.sh — Crea un archivo de swap de 2 GB en la instancia AWS.
#
# ¿Qué es esto? Cuando la RAM de 1 GB se llena, Linux usa una parte del
# disco como memoria de repuesto para que los programas NO se maten.
# Es gratis (usa el disco EBS de 30 GB de la free tier) y no cambia
# el tipo de instancia.
#
# Ejecutar UNA sola vez como root (se hace sola vía user-data al crear
# la instancia, o a mano con: sudo ./scripts/setup-swap.sh).
# Es idempotente: si ya existe el swap, no hace nada.
#

set -euo pipefail

SWAP_FILE="/swapfile"
SWAP_SIZE_MB=2048   # 2 GB — margen cómodo para 8 contenedores en 1 GB de RAM

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: este script debe ejecutarse como root (sudo)." >&2
  exit 1
fi

# Si ya hay swap activo, no tocar nada (idempotente).
if swapon --show | grep -q "$SWAP_FILE"; then
  echo "Swap ya activo en $SWAP_FILE — nada que hacer."
  exit 0
fi

echo "Creando swapfile de ${SWAP_SIZE_MB} MB en $SWAP_FILE..."

# Crea el archivo (fallocate es instantáneo; en sistemas que no lo
# soporten se usa dd).
if ! fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null; then
  echo "fallocate no disponible, usando dd (puede tardar)..."
  dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB" status=progress
fi

chmod 600 "$SWAP_FILE"
mkswap "$SWAP_FILE"
swapon "$SWAP_FILE"

# Persistencia: que se active solo al reiniciar la instancia.
if ! grep -q "$SWAP_FILE" /etc/fstab; then
  echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
fi

# Prioriza RAM sobre swap (usa el swap solo cuando hace falta).
if [ ! -f /etc/sysctl.d/99-swappiness.conf ]; then
  echo "vm.swappiness=10" > /etc/sysctl.d/99-swappiness.conf
fi
sysctl --system >/dev/null 2>&1 || true

echo ""
echo "✓ Swap listo:"
swapon --show
free -h

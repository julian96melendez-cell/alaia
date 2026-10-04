#!/bin/bash
# Invoke with env -i PATH="$PATH" /bin/bash --noprofile --norc <this-file> <mode>
set +x
set +v
set -u
umask 077
case "${1:-}" in --validate|--inspect) ;; *) printf 'Modo inválido.\n' >&2; exit 1;; esac
cd "$(dirname "$0")/../.." || exit 1
alaia_node=$(command -v node) || exit 1
read -r -p 'Hostname confirmado de Cluster0: ' alaia_host </dev/tty || exit 1
read -r -p 'Confirmación PROJECT_ID|Cluster0|HOST|backendmulti|usuarios,counters,webhookevents: ' alaia_confirm </dev/tty || exit 1
read -r -s -p 'Contraseña de alaia_index_inspector: ' alaia_password </dev/tty || exit 1
printf '\n' >/dev/tty
trap 'unset alaia_password' EXIT
# printf is a Bash builtin: the password is not an external process argument.
builtin printf '%s' "$alaia_password" | env -i PATH="$PATH" \
  ALAIA_INDEX_INSPECTION_PROJECT_ID=6934caf0d4e66132196bd495 \
  ALAIA_INDEX_INSPECTION_CLUSTER_NAME=Cluster0 \
  ALAIA_INDEX_INSPECTION_HOST="$alaia_host" \
  ALAIA_INDEX_INSPECTION_DB=backendmulti \
  ALAIA_INDEX_INSPECTION_CONFIRM="$alaia_confirm" \
  "$alaia_node" backend-multi/scripts/mongo-critical-index-inspection-private.js "$1"
alaia_code=${PIPESTATUS[1]}
unset alaia_password
exit "$alaia_code"

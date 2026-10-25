#!/usr/bin/env bash
# Run only in a terminal authenticated to the account below; does not create OAuth secrets.
set -euo pipefail
account='construcenter.licitacao@gmail.com'
project_id="${1:-}"
if [[ ! "$project_id" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo 'Informe um Project ID válido escolhido no Google Cloud (não uma credencial).' >&2
  exit 1
fi
command -v gcloud >/dev/null || { echo 'Google Cloud CLI não instalada. Use o Console conforme docs/GMAIL.md.' >&2; exit 1; }
active_account="$(gcloud auth list --filter="account=$account AND status=ACTIVE" --format='value(account)')"
if [[ "$active_account" != "$account" ]]; then
  echo 'Faça login no gcloud com a conta autorizada indicada em docs/GMAIL.md antes de executar.' >&2
  exit 1
fi
if [[ "${2:-}" == '--create' ]]; then
  gcloud projects create "$project_id" --name='R&S LicitaBot' --account="$account"
fi
gcloud services enable gmail.googleapis.com --project="$project_id" --account="$account"
echo 'Comando concluído. OAuth/consentimento precisam ser configurados no Console; nenhum e-mail foi enviado.'

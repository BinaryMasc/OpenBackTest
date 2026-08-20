#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT_DIR/gateway/RithmicGateway.csproj"
PUBLISH_ROOT="${PUBLISH_ROOT:-$ROOT_DIR/gateway/publish}"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "dotnet SDK is required but was not found in PATH." >&2
  exit 1
fi
if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required but was not found in PATH." >&2
  exit 1
fi

mkdir -p "$PUBLISH_ROOT"

for runtime in win-x64 linux-x64 win-arm64 linux-arm64; do
  output="$PUBLISH_ROOT/$runtime"
  archive="$PUBLISH_ROOT/$runtime.zip"
  echo "Publishing gateway for $runtime -> $output"
  dotnet publish "$PROJECT" \
    --configuration Release \
    --runtime "$runtime" \
    --self-contained true \
    --output "$output"

  echo "Creating archive -> $archive"
  rm -f "$archive"
  (cd "$PUBLISH_ROOT" && zip -qr "$archive" "$runtime")
done

echo "Gateway publish complete:"
echo "  $PUBLISH_ROOT/win-x64"
echo "  $PUBLISH_ROOT/linux-x64"
echo "  $PUBLISH_ROOT/win-x64.zip"
echo "  $PUBLISH_ROOT/linux-x64.zip"
echo "  $PUBLISH_ROOT/win-arm64"
echo "  $PUBLISH_ROOT/linux-arm64"
echo "  $PUBLISH_ROOT/win-arm64.zip"
echo "  $PUBLISH_ROOT/linux-arm64.zip"

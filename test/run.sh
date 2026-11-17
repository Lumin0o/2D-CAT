#!/bin/sh
# Lance les tests sans navigateur, avec le moteur JavaScriptCore de macOS.
cd "$(dirname "$0")" || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
for f in *.test.js; do
  echo "== $f"
  "$JSC" -m "$f" || exit 1
done

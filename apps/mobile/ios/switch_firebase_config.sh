#!/bin/bash
# Copies the correct GoogleService-Info.plist into the built app bundle.
# This Run Script phase must run AFTER "Copy Bundle Resources".

set -e

if [[ "${PRODUCT_BUNDLE_IDENTIFIER}" == "com.banzami.merchant" ]]; then
  SOURCE="${SRCROOT}/config/merchant/GoogleService-Info.plist"
else
  SOURCE="${SRCROOT}/config/consumer/GoogleService-Info.plist"
fi

if [ ! -f "$SOURCE" ]; then
  echo "error: GoogleService-Info.plist not found at $SOURCE"
  exit 1
fi

DEST="${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
cp -v "$SOURCE" "$DEST"

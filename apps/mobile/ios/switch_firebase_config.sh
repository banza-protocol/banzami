#!/bin/bash
# Copies the correct GoogleService-Info.plist for the active build flavor.
# Add this as a Run Script Build Phase in Xcode (before "Compile Sources"):
#
#   Name:   Copy Firebase Config
#   Script: "${SRCROOT}/switch_firebase_config.sh"
#   Uncheck "Based on dependency analysis"

set -e

PLIST_DEST="${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"

if [[ "${FLAVOR}" == "merchant" ]] || \
   [[ "${BUNDLE_ID}" == "com.banzami.merchant" ]] || \
   [[ "${PRODUCT_BUNDLE_IDENTIFIER}" == "com.banzami.merchant" ]]; then
  SOURCE="${SRCROOT}/config/merchant/GoogleService-Info.plist"
else
  # Default: consumer
  SOURCE="${SRCROOT}/config/consumer/GoogleService-Info.plist"
fi

if [ ! -f "$SOURCE" ]; then
  echo "error: GoogleService-Info.plist not found at $SOURCE"
  echo "       Place the file downloaded from Firebase Console in the correct directory."
  exit 1
fi

cp -v "$SOURCE" "$PLIST_DEST"

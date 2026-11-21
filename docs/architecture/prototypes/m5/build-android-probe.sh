#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_JAR:?Set the path to Android SDK platform 35 android.jar}"
: "${BUILD_TOOLS:?Set the path to Android Build Tools 35.0.0}"
: "${ECJ_JAR:?Set the path to the Eclipse Java compiler jar}"
: "${PROBE_OUTPUT:?Set a writable output directory outside the checkout}"

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$PROBE_OUTPUT"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/classes" "$work/dex"
# Use the host JRE's Java classes for lambda compilation and keep Android API stubs.
python3 - "$ANDROID_JAR" "$work/android-api.jar" <<'PYTHON'
from sys import argv
from zipfile import ZipFile
with ZipFile(argv[1]) as source, ZipFile(argv[2], "w") as target:
    for name in source.namelist():
        if name.startswith(("android/", "dalvik/", "org/xmlpull/")):
            target.writestr(name, source.read(name))
PYTHON
java -jar "$ECJ_JAR" -1.8 -nowarn -classpath "$work/android-api.jar" \
  -d "$work/classes" "$source_dir"/*.java
java -cp "$work/classes:$ANDROID_JAR" org.pawkemoviewer.safprobe.AndroidGrantProbe

mapfile -t classes < <(find "$work/classes" -name '*.class' ! -name 'AndroidGrantProbe.class')
"$BUILD_TOOLS/d8" --min-api 23 --lib "$ANDROID_JAR" --output "$work/dex" "${classes[@]}"
"$BUILD_TOOLS/aapt2" link -I "$ANDROID_JAR" --manifest "$source_dir/AndroidManifest.xml" -o "$work/unsigned.apk"
(cd "$work/dex" && zip -q "$work/unsigned.apk" classes.dex)
"$BUILD_TOOLS/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"

key="$PROBE_OUTPUT/probe-debug.p12"
if [[ ! -f "$key" ]]; then
  keytool -genkeypair -keystore "$key" -storetype PKCS12 -storepass android -keypass android \
    -alias androiddebugkey -dname "CN=PawKemoViewer SAF Probe,O=Debug,C=US" -keyalg RSA -keysize 2048 -validity 3650
fi
"$BUILD_TOOLS/apksigner" sign --ks "$key" --ks-pass pass:android --ks-key-alias androiddebugkey \
  --out "$work/saf-probe.apk" "$work/aligned.apk"
"$BUILD_TOOLS/apksigner" verify --verbose "$work/saf-probe.apk"
cp "$work/saf-probe.apk" "$PROBE_OUTPUT/saf-probe.apk"

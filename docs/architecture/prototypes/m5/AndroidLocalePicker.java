import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

// Standalone SAF probe. The host launches the intent and routes its activity result.
final class AndroidLocalePicker {
    static final int READ = Intent.FLAG_GRANT_READ_URI_PERMISSION;
    static final int WRITE = Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    static final int PERSISTABLE = Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION;
    static final int MAX_BYTES = 1024 * 1024;

    static Intent openJson() {
        return new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .addFlags(READ);
    }

    static Intent createJson(String filename) {
        return new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .putExtra(Intent.EXTRA_TITLE, filename)
            .addFlags(WRITE);
    }

    static Uri selectedUri(int resultCode, Intent result) throws IOException {
        if (resultCode == Activity.RESULT_CANCELED) return null;
        Uri uri = result == null ? null : result.getData();
        if (resultCode != Activity.RESULT_OK || uri == null || !"content".equals(uri.getScheme())) {
            throw new IOException("No provider document was selected");
        }
        return uri;
    }

    static int persistableModes(int returnedFlags, int requestedModes) {
        if ((returnedFlags & PERSISTABLE) == 0) return 0;
        return returnedFlags & requestedModes & (READ | WRITE);
    }

    // Explicit probe only. Single-operation import/export does not retain any grant.
    static boolean takePersistedAccess(ContentResolver resolver, Uri uri, int returnedFlags, int requestedModes) {
        int modes = persistableModes(returnedFlags, requestedModes);
        if (modes == 0) return false;
        resolver.takePersistableUriPermission(uri, modes);
        return true;
    }

    static String readJson(ContentResolver resolver, Uri uri) throws IOException {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new IOException("Provider did not open a readable stream");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) {
                if (count > MAX_BYTES - bytes.size()) throw new IOException("Locale file exceeds 1 MiB");
                bytes.write(buffer, 0, count);
            }
            return StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        }
    }

    static void writeJson(ContentResolver resolver, Uri uri, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IOException("Locale file exceeds 1 MiB");
        try (OutputStream out = resolver.openOutputStream(uri, "wt")) {
            if (out == null) throw new IOException("Provider did not open a writable stream");
            out.write(bytes);
        }
    }

    private AndroidLocalePicker() {}
}

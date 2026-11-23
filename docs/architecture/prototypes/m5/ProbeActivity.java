package org.pawkemoviewer.safprobe;

import android.app.Activity;
import android.content.Intent;
import android.content.UriPermission;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ProbeActivity extends Activity {
    private static final int OPEN = 1;
    private static final int CREATE = 2;
    private static final int OPEN_PERSISTED = 3;
    private static final String URI_KEY = "selected-uri";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(24, 64, 24, 32);
        scroll.addView(panel);
        setContentView(scroll);
        button(panel, "Open JSON", () -> pick(AndroidLocalePicker.openJson(), OPEN));
        button(panel, "Export fixture JSON", () -> pick(AndroidLocalePicker.createJson("pawkemoviewer-saf-probe.json"), CREATE));
        button(panel, "Open and retain read access", () -> pick(AndroidLocalePicker.openJson(), OPEN_PERSISTED));
        button(panel, "Read remembered document", () -> runProbe(() -> {
            Uri uri = remembered();
            if (uri == null) return "No remembered document. First retain a read grant.";
            boolean persisted = hasPersistedRead(uri);
            try {
                return read(uri) + (persisted ? ". Persisted read grant listed." : ". No persisted read grant listed.");
            } catch (SecurityException error) {
                return "Read denied by Android." + (persisted ? " Persisted grant listed." : " No persisted read grant listed.");
            }
        }));
        button(panel, "Release retained access", () -> runProbe(() -> {
            Uri uri = remembered();
            if (uri == null) return "No remembered document. First retain a read grant.";
            if (!hasPersistedRead(uri)) return "No persisted read grant to release.";
            getContentResolver().releasePersistableUriPermission(uri, AndroidLocalePicker.READ);
            return "Grant released. Restart the app before checking denial.";
        }));
        status = new TextView(this);
        status.setText("Choose a probe.");
        panel.addView(status);
    }

    private void button(LinearLayout panel, String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setOnClickListener(view -> action.run());
        panel.addView(button);
    }

    private void pick(Intent intent, int request) {
        try {
            startActivityForResult(intent, request);
        } catch (RuntimeException error) {
            status.setText("Picker unavailable: " + error.getClass().getSimpleName());
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != OPEN && request != CREATE && request != OPEN_PERSISTED) return;
        runProbe(() -> {
            Uri uri = AndroidLocalePicker.selectedUri(result, data);
            if (uri == null) return "Cancelled";
            if (request == CREATE) {
                AndroidLocalePicker.writeJson(getContentResolver(), uri, "{\"locale.name\":\"SAF Probe\",\"probe\":\"ok\"}");
                return "Export complete";
            }
            String readResult = read(uri);
            if (request == OPEN_PERSISTED) {
                int flags = data.getFlags();
                String flagReport = " (flags 0x" + Integer.toHexString(flags) + ")";
                Uri previous = remembered();
                if (previous != null && !previous.equals(uri) && hasPersistedRead(previous)) {
                    return readResult + ". Release the previous retained grant first.";
                }
                try {
                    if (!AndroidLocalePicker.takePersistedAccess(getContentResolver(), uri, flags, AndroidLocalePicker.READ)) {
                        return readResult + ". Picker returned no read grant" + flagReport;
                    }
                } catch (SecurityException error) {
                    return readResult + ". Android refused to retain the read grant" + flagReport;
                }
                if (!hasPersistedRead(uri)) {
                    return readResult + ". Android did not list a persisted read grant" + flagReport;
                }
                if (!getPreferences(MODE_PRIVATE).edit().putString(URI_KEY, uri.toString()).commit()) {
                    return readResult + ". Read grant retained, but saving the document reference failed" + flagReport;
                }
                return readResult + ". Read grant retained and document remembered" + flagReport;
            }
            return readResult;
        });
    }

    private Uri remembered() {
        String value = getPreferences(MODE_PRIVATE).getString(URI_KEY, null);
        return value == null ? null : Uri.parse(value);
    }

    private boolean hasPersistedRead(Uri uri) {
        for (UriPermission permission : getContentResolver().getPersistedUriPermissions()) {
            if (permission.isReadPermission() && uri.equals(permission.getUri())) return true;
        }
        return false;
    }

    private String read(Uri uri) throws Exception {
        String json = AndroidLocalePicker.readJson(getContentResolver(), uri);
        return "Read " + json.length() + " UTF-16 code units";
    }

    private interface Probe { String run() throws Exception; }

    private void runProbe(Probe probe) {
        worker.execute(() -> {
            String message;
            try {
                message = probe.run();
            } catch (Exception error) {
                message = "Failed: " + error.getClass().getSimpleName();
            }
            String result = message;
            runOnUiThread(() -> {
                if (!isDestroyed()) status.setText(result);
            });
        });
    }

    @Override protected void onDestroy() {
        worker.shutdown();
        super.onDestroy();
    }
}

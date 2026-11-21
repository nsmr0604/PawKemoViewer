package org.pawkemoviewer.safprobe;

import android.app.Activity;
import android.content.Intent;
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
        button(panel, "Read remembered document", () -> runProbe(() -> read(remembered())));
        button(panel, "Release retained access", () -> runProbe(() -> {
            getContentResolver().releasePersistableUriPermission(remembered(), AndroidLocalePicker.READ);
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
                boolean persisted = AndroidLocalePicker.takePersistedAccess(
                    getContentResolver(), uri, data.getFlags(), AndroidLocalePicker.READ
                );
                if (persisted) getPreferences(MODE_PRIVATE).edit().putString(URI_KEY, uri.toString()).apply();
                return readResult + (persisted ? ". Read grant retained." : ". Provider did not offer a persistent read grant.");
            }
            return readResult;
        });
    }

    private Uri remembered() {
        String value = getPreferences(MODE_PRIVATE).getString(URI_KEY, null);
        if (value == null) throw new IllegalStateException("No remembered document");
        return Uri.parse(value);
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

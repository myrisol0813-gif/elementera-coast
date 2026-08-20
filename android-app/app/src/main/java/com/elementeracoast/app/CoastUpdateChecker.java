package com.elementeracoast.app;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

public final class CoastUpdateChecker implements AutoCloseable {
    public interface Callback {
        void onSuccess(UpdateInfo updateInfo);

        void onFailure();
    }

    public static final class UpdateInfo {
        public final int latestVersionCode;
        public final String latestVersionName;
        public final String releaseName;
        public final String apkUrl;
        public final String sha256;
        public final String publishedAt;
        public final List<String> releaseNotes;
        public final String webLabel;
        public final String webCommit;
        public final String expectedMcpVersion;

        private UpdateInfo(
                int latestVersionCode,
                String latestVersionName,
                String releaseName,
                String apkUrl,
                String sha256,
                String publishedAt,
                List<String> releaseNotes,
                String webLabel,
                String webCommit,
                String expectedMcpVersion
        ) {
            this.latestVersionCode = latestVersionCode;
            this.latestVersionName = latestVersionName;
            this.releaseName = releaseName;
            this.apkUrl = apkUrl;
            this.sha256 = sha256;
            this.publishedAt = publishedAt;
            this.releaseNotes = Collections.unmodifiableList(releaseNotes);
            this.webLabel = webLabel;
            this.webCommit = webCommit;
            this.expectedMcpVersion = expectedMcpVersion;
        }
    }

    private static final int MAX_MANIFEST_BYTES = 64 * 1024;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "coast-update-check");
        thread.setDaemon(true);
        return thread;
    });
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean closed;

    public void check(String manifestUrl, Callback callback) {
        executor.execute(() -> {
            try {
                UpdateInfo updateInfo = fetch(manifestUrl);
                mainHandler.post(() -> {
                    if (!closed) {
                        callback.onSuccess(updateInfo);
                    }
                });
            } catch (Exception ignored) {
                mainHandler.post(() -> {
                    if (!closed) {
                        callback.onFailure();
                    }
                });
            }
        });
    }

    private UpdateInfo fetch(String manifestUrl) throws Exception {
        URL url = new URL(manifestUrl);
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new IllegalArgumentException("Update manifest must use HTTPS");
        }

        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setConnectTimeout(8_000);
        connection.setReadTimeout(10_000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty(
                "User-Agent",
                "ElementeraCoastAndroid/" + BuildConfig.VERSION_NAME
        );

        try {
            if (connection.getResponseCode() != HttpsURLConnection.HTTP_OK) {
                throw new IllegalStateException("Update manifest unavailable");
            }
            byte[] body = readBounded(connection.getInputStream());
            JSONObject root = new JSONObject(new String(body, StandardCharsets.UTF_8));
            JSONObject android = root.getJSONObject("android");
            JSONObject web = root.optJSONObject("web");
            JSONObject mcp = root.optJSONObject("mcp");
            JSONArray notesJson = android.optJSONArray("releaseNotes");
            List<String> releaseNotes = new ArrayList<>();
            if (notesJson != null) {
                for (int index = 0; index < notesJson.length(); index += 1) {
                    String note = notesJson.optString(index, "").trim();
                    if (!note.isEmpty()) {
                        releaseNotes.add(note);
                    }
                }
            }

            return new UpdateInfo(
                    android.getInt("latestVersionCode"),
                    android.optString("latestVersionName", ""),
                    android.optString("releaseName", ""),
                    android.optString("apkUrl", ""),
                    android.optString("sha256", ""),
                    android.optString("publishedAt", ""),
                    releaseNotes,
                    web == null ? "" : web.optString("label", ""),
                    web == null ? "" : web.optString("commit", ""),
                    mcp == null ? "" : mcp.optString("expectedVersion", "")
            );
        } finally {
            connection.disconnect();
        }
    }

    private byte[] readBounded(InputStream inputStream) throws Exception {
        try (InputStream input = inputStream;
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_MANIFEST_BYTES) {
                    throw new IllegalStateException("Update manifest too large");
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    @Override
    public void close() {
        closed = true;
        executor.shutdownNow();
    }
}

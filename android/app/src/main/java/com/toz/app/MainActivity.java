package com.toz.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.*;
import android.view.WindowInsets;
import android.view.View;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import org.json.*;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.KeyStore;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

/** Local packaged UI only. No remote document is allowed to access the bridge. */
public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String SERVER = "https://82.157.65.130";
    private WebView web;
    private final Map<String, SQLiteDatabase> databases = new HashMap<>();
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private String exportData;
    private ValueCallback<Uri[]> imageCallback;
    private static final int EXPORT = 10, IMPORT = 11, IMAGE = 12;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Resize the WebView's actual frame. WebView padding does not inset its HTML viewport.
        FrameLayout viewport = new FrameLayout(this);
        viewport.setBackgroundColor(android.graphics.Color.rgb(41, 41, 44));
        web = new WebView(this);
        viewport.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (android.os.Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        viewport.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                int handled = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();
                android.graphics.Insets bars = insets.getInsets(handled);
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                // Native container handles these types; do not apply the same space in WebView again.
                return new WindowInsets.Builder(insets).setInsets(handled, android.graphics.Insets.NONE).build();
            }
            android.view.DisplayCutout cutout = insets.getDisplayCutout();
            view.setPadding(Math.max(insets.getSystemWindowInsetLeft(), cutout == null ? 0 : cutout.getSafeInsetLeft()),
                Math.max(insets.getSystemWindowInsetTop(), cutout == null ? 0 : cutout.getSafeInsetTop()),
                Math.max(insets.getSystemWindowInsetRight(), cutout == null ? 0 : cutout.getSafeInsetRight()),
                Math.max(insets.getSystemWindowInsetBottom(), cutout == null ? 0 : cutout.getSafeInsetBottom()));
            return insets.consumeSystemWindowInsets().consumeDisplayCutout();
        });
        setContentView(viewport);
        viewport.requestApplyInsets();
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (ORIGIN.equals(request.getUrl().getScheme() + "://" + request.getUrl().getHost())) {
                    WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                    if (response != null) return response;
                }
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (imageCallback != null) imageCallback.onReceiveValue(null);
                imageCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/png", "image/jpeg", "image/webp"});
                startActivityForResult(intent, IMAGE); return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "ToZAndroid");
        web.loadUrl(ORIGIN + "/assets/app/index.html");
    }

    private File file(String name) throws Exception {
        File root = getFilesDir().getCanonicalFile();
        File target = new File(root, name).getCanonicalFile();
        if (!target.getPath().startsWith(root.getPath() + File.separator)) throw new IOException("无效的应用数据路径");
        return target;
    }
    private String readLimited(InputStream input) throws Exception {
        try (InputStream stream = input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int size;
            while ((size = stream.read(buffer)) != -1) {
                if (bytes.size() + size > 50 * 1024 * 1024) throw new IOException("文件超过 50 MB");
                bytes.write(buffer, 0, size);
            }
            return bytes.toString("UTF-8");
        }
    }
    private void emit(String type, Object value) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.tozNativeEvent?.(" + JSONObject.quote(type) + "," + String.valueOf(value) + ")", null); });
    }
    private String crypt(String input, boolean encrypt) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias("toz-session")) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("toz-session", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        if (encrypt) {
            cipher.init(Cipher.ENCRYPT_MODE, store.getKey("toz-session", null));
            return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(cipher.doFinal(input.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        }
        String[] parts = input.split("\\.", 2);
        cipher.init(Cipher.DECRYPT_MODE, store.getKey("toz-session", null), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    public class Bridge {
        @JavascriptInterface public synchronized String call(String operation, String json) {
            JSONObject result = new JSONObject();
            try { result.put("value", execute(operation, new JSONArray(json))); result.put("ok", true); }
            catch (Exception error) { try { result.put("ok", false); result.put("error", error.getMessage() == null ? "安卓操作失败" : error.getMessage()); } catch (JSONException ignored) {} }
            return result.toString();
        }
        @JavascriptInterface public void request(String id, String route, String method, String headers, String body) {
            network.execute(() -> {
                JSONObject reply = new JSONObject(); HttpsURLConnection connection = null;
                try {
                    if (!route.startsWith(SERVER + "/") || !Arrays.asList("GET", "POST", "PUT").contains(method)) throw new IOException("无效的云服务请求");
                    URL url = new URL(route);
                    if (url.getUserInfo() != null || url.getPort() != -1 || !url.getHost().equals("82.157.65.130")) throw new IOException("无效的云服务地址");
                    connection = (HttpsURLConnection) url.openConnection();
                    connection.setConnectTimeout(25000); connection.setReadTimeout(25000); connection.setInstanceFollowRedirects(false); connection.setRequestMethod(method);
                    JSONObject values = new JSONObject(headers);
                    for (String key : Arrays.asList("Content-Type", "Authorization")) if (values.has(key)) connection.setRequestProperty(key, values.getString(key));
                    if (!body.isEmpty()) { connection.setDoOutput(true); try (OutputStream stream = connection.getOutputStream()) { stream.write(body.getBytes(StandardCharsets.UTF_8)); } }
                    int status = connection.getResponseCode();
                    if (status >= 300 && status < 400) throw new IOException("云服务重定向已拒绝");
                    reply.put("status", status); reply.put("body", readLimited(status >= 400 ? connection.getErrorStream() : connection.getInputStream()));
                } catch (Exception error) { try { reply.put("error", "无法连接云服务，离线修改已保留"); } catch (JSONException ignored) {} }
                finally { if (connection != null) connection.disconnect(); }
                try { reply.put("id", id); } catch (JSONException ignored) {}
                emit("http", reply);
            });
        }
    }
    private Object execute(String operation, JSONArray args) throws Exception {
        String name = args.optString(0);
        switch (operation) {
            case "mkdir": file(name).mkdirs(); return true;
            case "read": return readLimited(new FileInputStream(file(name)));
            case "write": Files.write(file(name).toPath(), args.getString(1).getBytes(StandardCharsets.UTF_8)); return true;
            case "rename": Files.move(file(name).toPath(), file(args.getString(1)).toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); return true;
            case "list": { String[] names = file(name).list(); return new JSONArray(names == null ? new String[0] : names); }
            case "remove": { File target = file(name); if (!target.delete() && (!args.optBoolean(1) || target.exists())) throw new IOException("无法删除文件"); return true; }
            case "seal": return crypt(name, true);
            case "unseal": return crypt(name, false);
            case "db-open": databases.put(name, SQLiteDatabase.openOrCreateDatabase(file(name), null)); return true;
            case "db-close": { SQLiteDatabase db = databases.remove(name); if (db != null) db.close(); return true; }
            case "db-exec": case "db-query": {
                SQLiteDatabase db = databases.get(name); if (db == null) throw new IOException("数据库未打开");
                String sql = args.getString(1); JSONArray parameters = args.getJSONArray(2);
                if (operation.equals("db-exec") && !sql.trim().toUpperCase(Locale.ROOT).startsWith("PRAGMA")) {
                    Object[] bind = new Object[parameters.length()];
                    for (int i = 0; i < bind.length; i++) bind[i] = parameters.isNull(i) ? null : parameters.get(i);
                    db.execSQL(sql, bind); return true;
                }
                String[] bind = new String[parameters.length()];
                for (int i = 0; i < bind.length; i++) bind[i] = parameters.isNull(i) ? null : String.valueOf(parameters.get(i));
                JSONArray rows = new JSONArray();
                try (Cursor cursor = db.rawQuery(sql, bind)) {
                    while (cursor.moveToNext()) {
                        JSONObject row = new JSONObject();
                        for (int i = 0; i < cursor.getColumnCount(); i++) row.put(cursor.getColumnName(i), cursor.isNull(i) ? JSONObject.NULL : cursor.getType(i) == Cursor.FIELD_TYPE_INTEGER ? (Object) cursor.getLong(i) : cursor.getString(i));
                        rows.put(row);
                    }
                }
                return rows;
            }
            case "export": {
                if (exportData != null) throw new IOException("请先完成当前导出");
                exportData = args.getString(1);
                runOnUiThread(() -> startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, name), EXPORT)); return true;
            }
            case "import": runOnUiThread(() -> startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), IMPORT)); return true;
            case "quit": runOnUiThread(() -> moveTaskToBack(true)); return true;
            default: throw new IOException("未知的安卓操作");
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == IMAGE) {
            if (imageCallback != null) { imageCallback.onReceiveValue(result == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null); imageCallback = null; }
            if (result != RESULT_OK || data == null || data.getData() == null) emit("avatar-cancel", JSONObject.NULL);
            return;
        }
        if (result != RESULT_OK || data == null) { if (request == EXPORT) exportData = null; return; }
        try {
            Uri uri = data.getData();
            if (request == EXPORT && exportData != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(uri, "wt")) { stream.write(exportData.getBytes(StandardCharsets.UTF_8)); }
                emit("feedback", JSONObject.quote("备份已导出"));
            } else if (request == IMPORT) emit("import", JSONObject.quote(readLimited(getContentResolver().openInputStream(uri))));
        } catch (Exception error) { emit("feedback", JSONObject.quote("文件操作失败，请重试")); }
        finally { if (request == EXPORT) exportData = null; }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.tozMobileBack?.() ?? false", handled -> { if (!"true".equals(handled)) moveTaskToBack(true); });
    }
    @Override protected void onResume() { super.onResume(); if (web != null) { web.onResume(); web.evaluateJavascript("window.tozMobileResume?.()", null); } }
    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onDestroy() { network.shutdownNow(); if (imageCallback != null) { imageCallback.onReceiveValue(null); imageCallback = null; } for (SQLiteDatabase db : databases.values()) db.close(); if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}

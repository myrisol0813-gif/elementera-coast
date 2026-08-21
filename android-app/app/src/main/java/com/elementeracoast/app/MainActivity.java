package com.elementeracoast.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.Locale;

public final class MainActivity extends Activity implements CoastWebViewClient.Delegate {
    private static final int FILE_CHOOSER_REQUEST_CODE = 4101;
    private static final long DOUBLE_BACK_EXIT_WINDOW_MS = 2_000L;

    private WebView webView;
    private ProgressBar pageProgress;
    private View errorPanel;
    private TextView errorMessage;
    private ValueCallback<Uri[]> fileChooserCallback;
    private final CoastUpdateChecker updateChecker = new CoastUpdateChecker();
    private long lastBackPressedAt;
    private boolean clearHistoryAfterHomeLoad;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.Theme_ElementeraCoast);
        super.onCreate(savedInstanceState);

        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        setContentView(R.layout.activity_main);
        configureSystemBars();

        View appRoot = findViewById(R.id.app_root);
        configureInsets(appRoot);

        webView = findViewById(R.id.coast_webview);
        pageProgress = findViewById(R.id.page_progress);
        errorPanel = findViewById(R.id.error_panel);
        errorMessage = findViewById(R.id.error_message);

        configureWebView();
        configureShellControls();
        configureBackHandler();

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            loadCoastHome(false);
        }
    }

    private void configureSystemBars() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int lightBarFlags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(0, lightBarFlags);
            }
        } else {
            window.setStatusBarColor(getColor(R.color.coast_navy_dark));
            window.setNavigationBarColor(getColor(R.color.coast_navy_dark));
            int visibility = window.getDecorView().getSystemUiVisibility();
            visibility &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            visibility &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            window.getDecorView().setSystemUiVisibility(visibility);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
    }

    private void configureInsets(View appRoot) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }
        appRoot.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets systemBars = windowInsets.getInsets(WindowInsets.Type.systemBars());
            Insets displayCutout = windowInsets.getInsets(WindowInsets.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsets.Type.ime());

            int left = Math.max(systemBars.left, displayCutout.left);
            int top = Math.max(systemBars.top, displayCutout.top);
            int right = Math.max(systemBars.right, displayCutout.right);
            int bottom = Math.max(systemBars.bottom, displayCutout.bottom);
            if (windowInsets.isVisible(WindowInsets.Type.ime())) {
                bottom = Math.max(bottom, ime.bottom);
            }

            view.setPadding(left, top, right, bottom);
            return WindowInsets.CONSUMED;
        });
        appRoot.requestApplyInsets();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setOffscreenPreRaster(true);
        settings.setGeolocationEnabled(false);
        settings.setUserAgentString(
                settings.getUserAgentString()
                        + " ElementeraCoastApp/"
                        + BuildConfig.VERSION_NAME
                        + " Android"
        );

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setBackgroundColor(getColor(R.color.coast_navy));
        webView.setVerticalScrollBarEnabled(true);
        webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        webView.setFocusableInTouchMode(true);
        webView.setWebViewClient(
                new CoastWebViewClient(Uri.parse(BuildConfig.COAST_URL).getHost(), this)
        );
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                pageProgress.setProgress(newProgress, true);
                pageProgress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (ActivityNotFoundException exception) {
                    fileChooserCallback.onReceiveValue(null);
                    fileChooserCallback = null;
                    toast(R.string.file_picker_failed);
                    return false;
                }
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, size) -> {
            if (url != null) {
                openExternalUri(Uri.parse(url));
            }
        });
    }

    private void configureShellControls() {
        findViewById(R.id.shell_menu_button).setOnClickListener(this::showShellMenu);
        findViewById(R.id.retry_button).setOnClickListener(view -> retryCurrentPage());
        findViewById(R.id.open_browser_button).setOnClickListener(
                view -> launchExternal(Uri.parse(BuildConfig.COAST_URL))
        );
        findViewById(R.id.clear_cache_button).setOnClickListener(
                view -> clearResourceCacheAndReload()
        );
    }

    private void showShellMenu(View anchor) {
        PopupMenu popupMenu = new PopupMenu(this, anchor);
        popupMenu.inflate(R.menu.coast_shell_menu);
        popupMenu.setOnMenuItemClickListener(item -> {
            int id = item.getItemId();
            if (id == R.id.menu_refresh) {
                retryCurrentPage();
                return true;
            }
            if (id == R.id.menu_home) {
                loadCoastHome(true);
                return true;
            }
            if (id == R.id.menu_clear_cache) {
                clearResourceCacheAndReload();
                return true;
            }
            if (id == R.id.menu_check_update) {
                checkForAppUpdate();
                return true;
            }
            if (id == R.id.menu_open_browser) {
                launchExternal(Uri.parse(BuildConfig.COAST_URL));
                return true;
            }
            if (id == R.id.menu_about) {
                showAboutDialog();
                return true;
            }
            return false;
        });
        popupMenu.show();
    }

    private void retryCurrentPage() {
        hideNetworkError();
        String currentUrl = webView.getUrl();
        if (currentUrl == null || currentUrl.trim().isEmpty()) {
            loadCoastHome(false);
        } else {
            webView.reload();
        }
    }

    private void loadCoastHome(boolean resetHistory) {
        hideNetworkError();
        clearHistoryAfterHomeLoad = resetHistory;
        webView.stopLoading();
        webView.loadUrl(BuildConfig.COAST_URL);
    }

    private void clearResourceCacheAndReload() {
        hideNetworkError();
        webView.clearCache(true);
        String currentUrl = webView.getUrl();
        if (currentUrl != null
                && currentUrl.toLowerCase(Locale.ROOT)
                .startsWith(BuildConfig.COAST_URL.toLowerCase(Locale.ROOT))) {
            String script = "(async function(){try{"
                    + "if('caches' in window){"
                    + "const keys=await caches.keys();"
                    + "await Promise.all(keys.map(function(key){return caches.delete(key);}));"
                    + "}}catch(_ignored){}"
                    + "window.location.replace("
                    + JSONObject.quote(BuildConfig.COAST_URL)
                    + ");})();";
            webView.evaluateJavascript(script, null);
        } else {
            loadCoastHome(false);
        }
        toast(R.string.cache_cleared);
    }

    private void checkForAppUpdate() {
        toast(R.string.checking_update);
        updateChecker.check(BuildConfig.UPDATE_MANIFEST_URL, new CoastUpdateChecker.Callback() {
            @Override
            public void onSuccess(CoastUpdateChecker.UpdateInfo updateInfo) {
                showUpdateResult(updateInfo);
            }

            @Override
            public void onFailure() {
                showUpdateCheckFailure();
            }
        });
    }

    private void showUpdateCheckFailure() {
        if (isFinishing() || isDestroyed()) {
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("暂时没有读到更新清单")
                .setMessage("海岸仍可正常使用。请确认网络后稍后重试，也可以打开公开更新中心查看。")
                .setNegativeButton("重试", (dialog, which) -> checkForAppUpdate())
                .setNeutralButton(
                        R.string.open_update_center,
                        (dialog, which) -> openUpdateCenter()
                )
                .setPositiveButton("关闭", null)
                .show();
    }

    private void showUpdateResult(CoastUpdateChecker.UpdateInfo updateInfo) {
        if (isFinishing() || isDestroyed()) {
            return;
        }

        boolean newer = updateInfo.latestVersionCode > BuildConfig.VERSION_CODE;
        StringBuilder message = new StringBuilder();
        message.append("当前 APP：")
                .append(BuildConfig.VERSION_NAME)
                .append("（")
                .append(BuildConfig.VERSION_CODE)
                .append("）\n")
                .append("当前发布名：")
                .append(BuildConfig.RELEASE_NAME)
                .append("\n\n")
                .append("更新清单：")
                .append(emptyFallback(updateInfo.latestVersionName, "未标注"))
                .append("（")
                .append(updateInfo.latestVersionCode)
                .append("）\n")
                .append("清单发布名：")
                .append(emptyFallback(updateInfo.releaseName, "未标注"));

        if (!updateInfo.webLabel.isEmpty() || !updateInfo.webCommit.isEmpty()) {
            message.append("\nWeb：")
                    .append(emptyFallback(updateInfo.webLabel, "未标注"))
                    .append(" · ")
                    .append(emptyFallback(updateInfo.webCommit, "未标注"));
        }
        if (!updateInfo.expectedMcpVersion.isEmpty()) {
            message.append("\nMCP 预期：").append(updateInfo.expectedMcpVersion);
        }
        if (!updateInfo.publishedAt.isEmpty()) {
            message.append("\n发布时间：").append(updateInfo.publishedAt);
        }

        if (!updateInfo.releaseNotes.isEmpty()) {
            message.append("\n\n");
            for (String note : updateInfo.releaseNotes) {
                message.append("• ").append(note).append('\n');
            }
            message.setLength(message.length() - 1);
        }
        if (!updateInfo.sha256.isEmpty()) {
            message.append("\n\nSHA-256：").append(updateInfo.sha256);
        }
        if (!isHttps(updateInfo.apkUrl)) {
            message.append("\n\n更新清单已存在，但暂无公开 APK 下载链接。");
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(newer ? "发现新的海岸外壳" : "当前已是最新版")
                .setMessage(message.toString())
                .setNeutralButton(
                        R.string.open_update_center,
                        (dialog, which) -> openUpdateCenter()
                );

        if (newer && isHttps(updateInfo.apkUrl)) {
            builder.setPositiveButton(
                    "打开下载页",
                    (dialog, which) -> launchExternal(Uri.parse(updateInfo.apkUrl))
            );
        } else {
            builder.setPositiveButton("关闭", null);
        }
        builder.show();
    }

    private void showAboutDialog() {
        AlertDialog aboutDialog = new AlertDialog.Builder(this)
                .setTitle(R.string.about_coast)
                .setMessage(buildAboutMessage(null))
                .setNeutralButton("检查更新", (dialog, which) -> checkForAppUpdate())
                .setNegativeButton(
                        R.string.open_update_center,
                        (ignored, which) -> openUpdateCenter()
                )
                .setPositiveButton("关闭", null)
                .create();
        aboutDialog.show();

        updateChecker.check(BuildConfig.UPDATE_MANIFEST_URL, new CoastUpdateChecker.Callback() {
            @Override
            public void onSuccess(CoastUpdateChecker.UpdateInfo updateInfo) {
                if (aboutDialog.isShowing()) {
                    aboutDialog.setMessage(buildAboutMessage(updateInfo));
                }
            }

            @Override
            public void onFailure() {
                // The static BuildConfig values remain visible; normal shell use is unaffected.
            }
        });
    }

    private String buildAboutMessage(CoastUpdateChecker.UpdateInfo updateInfo) {
        String webLabel = updateInfo == null
                ? BuildConfig.EXPECTED_WEB_LABEL
                : emptyFallback(updateInfo.webLabel, BuildConfig.EXPECTED_WEB_LABEL);
        String webCommit = updateInfo == null
                ? BuildConfig.EXPECTED_WEB_COMMIT
                : emptyFallback(updateInfo.webCommit, BuildConfig.EXPECTED_WEB_COMMIT);
        String expectedMcpVersion = updateInfo == null
                ? BuildConfig.EXPECTED_MCP_VERSION
                : emptyFallback(updateInfo.expectedMcpVersion, BuildConfig.EXPECTED_MCP_VERSION);

        return "APP 名称：元素海岸\n"
                + "发布名：" + BuildConfig.RELEASE_NAME + "\n"
                + "APP versionName：" + BuildConfig.VERSION_NAME + "\n"
                + "APP versionCode：" + BuildConfig.VERSION_CODE + "\n"
                + "packageName：" + BuildConfig.APPLICATION_ID + "\n"
                + "WebView 加载地址：" + BuildConfig.COAST_URL + "\n\n"
                + "Web：" + webLabel + " · " + webCommit + "\n"
                + "MCP expectedVersion：" + expectedMcpVersion + "\n"
                + "更新清单：" + BuildConfig.UPDATE_MANIFEST_URL + "\n\n"
                + "A2 仍只承载线上海岸。清缓存不会删除 Cookie、localStorage 或登录态。";
    }

    private void openUpdateCenter() {
        hideNetworkError();
        webView.loadUrl(BuildConfig.UPDATE_PAGE_URL);
    }

    private String emptyFallback(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }

    private boolean isHttps(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        return "https".equalsIgnoreCase(Uri.parse(value).getScheme());
    }

    @Override
    public void onMainFrameStarted() {
        hideNetworkError();
    }

    @Override
    public void onMainFrameLoaded(String url) {
        hideNetworkError();
        if (clearHistoryAfterHomeLoad) {
            webView.clearHistory();
            clearHistoryAfterHomeLoad = false;
        }
    }

    @Override
    public void onMainFrameError(String message) {
        pageProgress.setVisibility(View.GONE);
        errorMessage.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
    }

    @Override
    public void openExternalUri(Uri uri) {
        if (uri == null) {
            toast(R.string.unsupported_link);
            return;
        }
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme)
                && !"http".equalsIgnoreCase(scheme)
                && !"mailto".equalsIgnoreCase(scheme)
                && !"tel".equalsIgnoreCase(scheme)) {
            toast(R.string.unsupported_link);
            return;
        }
        launchExternal(uri);
    }

    private void launchExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException exception) {
            toast(R.string.external_link_failed);
        }
    }

    private void hideNetworkError() {
        if (errorPanel != null) {
            errorPanel.setVisibility(View.GONE);
        }
    }

    private void configureBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleBack
            );
        }
    }

    private void handleBack() {
        if (errorPanel.getVisibility() == View.VISIBLE) {
            if (webView.canGoBack()) {
                hideNetworkError();
                webView.goBack();
            } else {
                retryCurrentPage();
            }
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        long now = SystemClock.elapsedRealtime();
        if (now - lastBackPressedAt <= DOUBLE_BACK_EXIT_WINDOW_MS) {
            finishAfterTransition();
        } else {
            lastBackPressedAt = now;
            toast(R.string.exit_hint);
        }
    }

    @Override
    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            handleBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST_CODE && fileChooserCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        updateChecker.close();
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    private void toast(int messageResId) {
        Toast.makeText(this, messageResId, Toast.LENGTH_SHORT).show();
    }
}

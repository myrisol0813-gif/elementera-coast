package com.elementeracoast.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

public final class MainActivity extends Activity implements CoastWebViewClient.Delegate {
    private static final int FILE_CHOOSER_REQUEST_CODE = 4101;
    private static final long DOUBLE_BACK_EXIT_WINDOW_MS = 2_000L;
    private static final long CONTENT_FADE_MS = 180L;

    private View appRoot;
    private WebView webView;
    private ProgressBar pageProgress;
    private View loadingOverlay;
    private View errorPanel;
    private TextView errorMessage;
    private ValueCallback<Uri[]> fileChooserCallback;
    private final CoastUpdateChecker updateChecker = new CoastUpdateChecker();
    private boolean firstPagePresented;
    private final Runnable revealPageProgress = () -> {
        if (pageProgress != null && pageProgress.getProgress() < 100 && firstPagePresented) {
            pageProgress.setVisibility(View.VISIBLE);
        }
    };
    private long lastBackPressedAt;
    private boolean clearHistoryAfterHomeLoad;
    private boolean offlineCacheAttempted;
    private boolean usingCacheOnly;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.Theme_ElementeraCoast);
        super.onCreate(savedInstanceState);

        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        setContentView(R.layout.activity_main);

        appRoot = findViewById(R.id.app_root);
        webView = findViewById(R.id.coast_webview);
        pageProgress = findViewById(R.id.page_progress);
        loadingOverlay = findViewById(R.id.loading_overlay);
        errorPanel = findViewById(R.id.error_panel);
        errorMessage = findViewById(R.id.error_message);

        configureSystemBars();
        configureInsets(appRoot);
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
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
        applySystemSurfaceBars();
    }

    private void applySystemSurfaceBars() {
        applySystemBarColor(getColor(R.color.shell_surface), !isSystemDarkMode());
    }

    private boolean isSystemDarkMode() {
        int nightMode = getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void applySystemBarColor(int color, boolean useDarkIcons) {
        Window window = getWindow();
        window.setStatusBarColor(color);
        window.setNavigationBarColor(color);
        if (appRoot != null) {
            appRoot.setBackgroundColor(color);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(useDarkIcons ? mask : 0, mask);
            }
            return;
        }

        int visibility = window.getDecorView().getSystemUiVisibility();
        int mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        visibility = useDarkIcons ? visibility | mask : visibility & ~mask;
        window.getDecorView().setSystemUiVisibility(visibility);
    }

    private void configureInsets(View root) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }
        root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
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
        root.requestApplyInsets();
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
        webView.setBackgroundColor(getColor(R.color.shell_surface));
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
                pageProgress.removeCallbacks(revealPageProgress);
                if (newProgress >= 100 || !firstPagePresented) {
                    pageProgress.setVisibility(View.GONE);
                } else {
                    pageProgress.postDelayed(revealPageProgress, 140L);
                }
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
                showLocalUpdateCenter();
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
        resetNetworkLoadMode();
        offlineCacheAttempted = false;
        String currentUrl = webView.getUrl();
        if (currentUrl == null || currentUrl.trim().isEmpty()) {
            loadCoastHome(false);
        } else {
            webView.reload();
        }
    }

    private void loadCoastHome(boolean resetHistory) {
        hideNetworkError();
        resetNetworkLoadMode();
        offlineCacheAttempted = false;
        clearHistoryAfterHomeLoad = resetHistory;
        webView.loadUrl(BuildConfig.COAST_URL);
    }

    private void clearResourceCacheAndReload() {
        hideNetworkError();
        resetNetworkLoadMode();
        offlineCacheAttempted = false;
        webView.clearCache(true);
        String currentUrl = webView.getUrl();
        if (isInternalUrl(currentUrl)) {
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

    private void showLocalUpdateCenter() {
        if (isFinishing() || isDestroyed()) {
            return;
        }
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(R.string.open_update_center)
                .setMessage(buildUpdateCenterMessage(null, false))
                .setNegativeButton(R.string.retry_update_check, null)
                .setNeutralButton(
                        "网页版更新页",
                        (ignored, which) -> launchExternal(Uri.parse(BuildConfig.UPDATE_PAGE_URL))
                )
                .setPositiveButton("关闭", null)
                .create();
        dialog.setOnShowListener(ignored -> {
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(
                    view -> refreshUpdateDialog(dialog)
            );
            refreshUpdateDialog(dialog);
        });
        dialog.show();
    }

    private void refreshUpdateDialog(AlertDialog dialog) {
        if (!dialog.isShowing()) {
            return;
        }
        dialog.setTitle(R.string.open_update_center);
        dialog.setMessage(buildUpdateCenterMessage(null, true));
        updateChecker.check(BuildConfig.UPDATE_MANIFEST_URL, new CoastUpdateChecker.Callback() {
            @Override
            public void onSuccess(CoastUpdateChecker.UpdateInfo updateInfo) {
                if (dialog.isShowing()) {
                    boolean newer = updateInfo.latestVersionCode > BuildConfig.VERSION_CODE;
                    dialog.setTitle(newer ? "发现 CoastGPT 新版本" : "CoastGPT 已是最新版");
                    dialog.setMessage(buildUpdateCenterMessage(updateInfo, false));
                }
            }

            @Override
            public void onFailure() {
                if (dialog.isShowing()) {
                    dialog.setTitle("CoastGPT 本地更新中心");
                    dialog.setMessage(buildUpdateCenterMessage(null, false));
                }
            }
        });
    }

    private String buildUpdateCenterMessage(
            CoastUpdateChecker.UpdateInfo updateInfo,
            boolean loading
    ) {
        StringBuilder message = new StringBuilder();
        message.append("本机 APP：")
                .append(BuildConfig.VERSION_NAME)
                .append("（versionCode ")
                .append(BuildConfig.VERSION_CODE)
                .append("）\n发布名：")
                .append(BuildConfig.RELEASE_NAME)
                .append("\npackageName：")
                .append(BuildConfig.APPLICATION_ID);

        if (updateInfo == null) {
            message.append("\n\n")
                    .append(loading ? "正在读取线上更新清单…" : "离线，暂未读取线上清单。")
                    .append("\n本地菜单、关于、错误恢复与版本说明仍可使用。");
        } else {
            message.append("\n\n线上版本：")
                    .append(emptyFallback(updateInfo.latestVersionName, "未标注"))
                    .append("（versionCode ")
                    .append(updateInfo.latestVersionCode)
                    .append("）\n线上发布名：")
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
            if (!updateInfo.releaseNotes.isEmpty()) {
                message.append("\n\n更新说明：");
                for (String note : updateInfo.releaseNotes) {
                    message.append("\n• ").append(note);
                }
            }
            if (isHttps(updateInfo.apkUrl)) {
                message.append("\n\nAPK：已有公开 HTTPS 下载地址");
            } else {
                message.append("\n\n更新清单已存在，但暂无公开 APK 下载链接。");
            }
            if (!updateInfo.sha256.isEmpty()) {
                message.append("\nSHA-256：").append(updateInfo.sha256);
            }
        }

        message.append("\n\n签名说明：debug APK 只用于测试；正式覆盖安装需保持 packageName 与长期 release 签名一致，并递增 versionCode。");
        return message.toString();
    }

    private void showAboutDialog() {
        AlertDialog aboutDialog = new AlertDialog.Builder(this)
                .setTitle(R.string.about_coast)
                .setMessage(buildAboutMessage(null, false))
                .setNeutralButton("检查更新", (dialog, which) -> showLocalUpdateCenter())
                .setNegativeButton(
                        "网页版更新页",
                        (ignored, which) -> launchExternal(Uri.parse(BuildConfig.UPDATE_PAGE_URL))
                )
                .setPositiveButton("关闭", null)
                .create();
        aboutDialog.show();

        updateChecker.check(BuildConfig.UPDATE_MANIFEST_URL, new CoastUpdateChecker.Callback() {
            @Override
            public void onSuccess(CoastUpdateChecker.UpdateInfo updateInfo) {
                if (aboutDialog.isShowing()) {
                    aboutDialog.setMessage(buildAboutMessage(updateInfo, false));
                }
            }

            @Override
            public void onFailure() {
                if (aboutDialog.isShowing()) {
                    aboutDialog.setMessage(buildAboutMessage(null, true));
                }
            }
        });
    }

    private String buildAboutMessage(
            CoastUpdateChecker.UpdateInfo updateInfo,
            boolean offline
    ) {
        String webLabel = updateInfo == null
                ? BuildConfig.EXPECTED_WEB_LABEL
                : emptyFallback(updateInfo.webLabel, BuildConfig.EXPECTED_WEB_LABEL);
        String webCommit = updateInfo == null
                ? BuildConfig.EXPECTED_WEB_COMMIT
                : emptyFallback(updateInfo.webCommit, BuildConfig.EXPECTED_WEB_COMMIT);
        String expectedMcpVersion = updateInfo == null
                ? BuildConfig.EXPECTED_MCP_VERSION
                : emptyFallback(updateInfo.expectedMcpVersion, BuildConfig.EXPECTED_MCP_VERSION);

        return "APP 名称：CoastGPT\n"
                + "世界观名称：元素海岸 / Elementera Coast\n"
                + "发布名：" + BuildConfig.RELEASE_NAME + "\n"
                + "APP versionName：" + BuildConfig.VERSION_NAME + "\n"
                + "APP versionCode：" + BuildConfig.VERSION_CODE + "\n"
                + "packageName：" + BuildConfig.APPLICATION_ID + "\n"
                + "WebView 加载地址：" + BuildConfig.COAST_URL + "\n\n"
                + "Web：" + webLabel + " · " + webCommit + "\n"
                + "MCP expectedVersion：" + expectedMcpVersion + "\n"
                + "更新清单：" + BuildConfig.UPDATE_MANIFEST_URL + "\n"
                + (offline ? "清单状态：离线，显示 APK 内基础信息\n\n" : "\n")
                + "A3 将菜单、关于、更新骨架与断网恢复放在本地壳。清缓存不会删除 Cookie、localStorage、sessionStorage 或 IndexedDB。";
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

    private boolean isInternalUrl(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        Uri uri = Uri.parse(value);
        Uri coast = Uri.parse(BuildConfig.COAST_URL);
        return "https".equalsIgnoreCase(uri.getScheme())
                && coast.getHost() != null
                && coast.getHost().equalsIgnoreCase(uri.getHost());
    }

    @Override
    public void onMainFrameStarted() {
        hideNetworkError();
    }

    @Override
    public void onMainFrameLoaded(String url) {
        resetNetworkLoadMode();
        offlineCacheAttempted = false;
        hideNetworkError();
        presentWebContent();
        applyDocumentThemeColor();
        if (clearHistoryAfterHomeLoad) {
            webView.clearHistory();
            clearHistoryAfterHomeLoad = false;
        }
    }

    @Override
    public void onMainFrameError(
            String message,
            String failedUrl,
            boolean allowCachedFallback
    ) {
        if (allowCachedFallback && !offlineCacheAttempted && isInternalUrl(failedUrl)) {
            offlineCacheAttempted = true;
            usingCacheOnly = true;
            webView.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ONLY);
            webView.post(() -> webView.loadUrl(failedUrl));
            return;
        }

        resetNetworkLoadMode();
        pageProgress.removeCallbacks(revealPageProgress);
        pageProgress.setVisibility(View.GONE);
        hideLoadingOverlay();
        applySystemSurfaceBars();
        errorMessage.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private void resetNetworkLoadMode() {
        if (usingCacheOnly && webView != null) {
            webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        }
        usingCacheOnly = false;
    }

    private void presentWebContent() {
        if (!firstPagePresented) {
            firstPagePresented = true;
            webView.animate().alpha(1f).setDuration(CONTENT_FADE_MS).start();
        } else {
            webView.setAlpha(1f);
        }
        hideLoadingOverlay();
    }

    private void hideLoadingOverlay() {
        if (loadingOverlay.getVisibility() != View.VISIBLE) {
            return;
        }
        loadingOverlay.animate()
                .alpha(0f)
                .setDuration(CONTENT_FADE_MS)
                .withEndAction(() -> loadingOverlay.setVisibility(View.GONE))
                .start();
    }

    private void applyDocumentThemeColor() {
        String script = "(function(){var node=document.querySelector('meta[name=theme-color]');"
                + "return node&&node.content?node.content:'';})();";
        webView.evaluateJavascript(script, rawValue -> {
            try {
                String value = new JSONArray("[" + rawValue + "]").optString(0, "").trim();
                if (!value.matches("#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?")) {
                    return;
                }
                int color = Color.parseColor(value);
                applySystemBarColor(color, isLightColor(color));
            } catch (Exception ignored) {
                // System light/dark colors remain the safe fallback.
            }
        });
    }

    private boolean isLightColor(int color) {
        double luminance = (0.299d * Color.red(color)
                + 0.587d * Color.green(color)
                + 0.114d * Color.blue(color)) / 255d;
        return luminance >= 0.62d;
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
        if (pageProgress != null) {
            pageProgress.removeCallbacks(revealPageProgress);
        }
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

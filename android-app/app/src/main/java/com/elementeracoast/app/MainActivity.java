package com.elementeracoast.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.graphics.Typeface;
import android.view.Gravity;
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
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity implements CoastWebViewClient.Delegate {
    private static final int FILE_CHOOSER_REQUEST_CODE = 4101;
    private static final long DOUBLE_BACK_EXIT_WINDOW_MS = 2_000L;
    private static final long CONTENT_FADE_MS = 150L;
    private static final int MAX_NATIVE_DISPATCH_ATTEMPTS = 8;
    private static final String STATE_ROOM_ID = "coast_room_id";
    private static final String LOCAL_STATE = "coast_shell_state";
    private static final String LAST_ROOM_ID = "last_room_id";
    private static final String LAST_ROOM_OPENED_AT = "last_room_opened_at";

    private View appRoot;
    private View homeScreen;
    private View roomScreen;
    private LinearLayout roomList;
    private TextView homeSyncNote;
    private WebView webView;
    private ProgressBar pageProgress;
    private View roomSkeleton;
    private TextView skeletonTitle;
    private TextView skeletonSubtitle;
    private View localRoomPanel;
    private TextView localRoomTitle;
    private TextView localRoomBody;
    private Button localPrimaryButton;
    private Button localSecondaryButton;
    private View errorPanel;
    private TextView errorMessage;
    private TextView roomNavTitle;
    private TextView roomNavStatus;
    private ValueCallback<Uri[]> fileChooserCallback;
    private SharedPreferences localState;
    private CoastRoom currentRoom;
    private CoastRoom pendingRoom;
    private final CoastUpdateChecker updateChecker = new CoastUpdateChecker();
    private final Runnable revealPageProgress = () -> {
        if (pageProgress != null && pageProgress.getProgress() < 100 && currentRoom != null) {
            pageProgress.setVisibility(View.VISIBLE);
        }
    };

    private long lastBackPressedAt;
    private boolean webReady;
    private boolean clearHistoryAfterHomeLoad;
    private boolean offlineCacheAttempted;
    private boolean usingCacheOnly;
    private int roomSwitchToken;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.Theme_ElementeraCoast);
        super.onCreate(savedInstanceState);

        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        setContentView(R.layout.activity_main);
        bindViews();
        localState = getSharedPreferences(LOCAL_STATE, MODE_PRIVATE);

        configureSystemBars();
        configureInsets(appRoot);
        configureWebView();
        configureShellControls();
        populateRoomList();
        configureBackHandler();

        boolean restored = savedInstanceState != null && webView.restoreState(savedInstanceState) != null;
        webReady = restored;
        if (!restored) {
            prewarmCoast();
        }

        CoastRoom restoredRoom = savedInstanceState == null
                ? null
                : CoastRoom.fromId(savedInstanceState.getString(STATE_ROOM_ID));
        if (restoredRoom == null) {
            showHome();
        } else {
            openRoom(restoredRoom);
        }
    }

    private void bindViews() {
        appRoot = findViewById(R.id.app_root);
        homeScreen = findViewById(R.id.home_screen);
        roomScreen = findViewById(R.id.room_screen);
        roomList = findViewById(R.id.room_list);
        homeSyncNote = findViewById(R.id.home_sync_note);
        webView = findViewById(R.id.coast_webview);
        pageProgress = findViewById(R.id.page_progress);
        roomSkeleton = findViewById(R.id.room_skeleton);
        skeletonTitle = findViewById(R.id.skeleton_title);
        skeletonSubtitle = findViewById(R.id.skeleton_subtitle);
        localRoomPanel = findViewById(R.id.local_room_panel);
        localRoomTitle = findViewById(R.id.local_room_title);
        localRoomBody = findViewById(R.id.local_room_body);
        localPrimaryButton = findViewById(R.id.local_primary_button);
        localSecondaryButton = findViewById(R.id.local_secondary_button);
        errorPanel = findViewById(R.id.error_panel);
        errorMessage = findViewById(R.id.error_message);
        roomNavTitle = findViewById(R.id.room_nav_title);
        roomNavStatus = findViewById(R.id.room_nav_status);
    }

    private void configureSystemBars() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
        applyShellSystemBars();
    }

    private void applyShellSystemBars() {
        applySystemBarColors(getColor(R.color.coast_navy), false);
    }

    private void applySystemBarColors(int statusColor, boolean useDarkStatusIcons) {
        Window window = getWindow();
        window.setStatusBarColor(statusColor);
        window.setNavigationBarColor(getColor(R.color.coast_navy));
        if (appRoot != null) {
            appRoot.setBackgroundColor(getColor(R.color.coast_navy));
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int statusMask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS;
                controller.setSystemBarsAppearance(
                        useDarkStatusIcons ? statusMask : 0,
                        statusMask
                );
                controller.setSystemBarsAppearance(
                        0,
                        WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                );
            }
            return;
        }

        int visibility = window.getDecorView().getSystemUiVisibility();
        visibility = useDarkStatusIcons
                ? visibility | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                : visibility & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        visibility &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
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
                        + " Android HybridShell"
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
                if (newProgress >= 100 || currentRoom == null || roomSkeleton.getVisibility() == View.VISIBLE) {
                    pageProgress.setVisibility(View.GONE);
                } else {
                    pageProgress.postDelayed(revealPageProgress, 180L);
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
        findViewById(R.id.home_menu_button).setOnClickListener(view -> showShellMenu());
        findViewById(R.id.room_menu_button).setOnClickListener(view -> showShellMenu());
        findViewById(R.id.room_back_button).setOnClickListener(view -> showHome());
        findViewById(R.id.retry_button).setOnClickListener(view -> retryCurrentRoom());
        findViewById(R.id.open_browser_button).setOnClickListener(
                view -> launchExternal(currentExternalUri())
        );
        findViewById(R.id.clear_cache_button).setOnClickListener(
                view -> clearResourceCacheAndReload()
        );
    }

    private void populateRoomList() {
        roomList.removeAllViews();
        String currentGroup = "";
        for (CoastRoom room : CoastRoom.all()) {
            if (!currentGroup.equals(room.group)) {
                currentGroup = room.group;
                roomList.addView(createGroupLabel(currentGroup));
            }
            roomList.addView(createRoomCard(room));
        }
    }

    private View createGroupLabel(String label) {
        TextView title = new TextView(this);
        title.setText(label);
        title.setTextColor(getColor(R.color.coast_text_muted));
        title.setTextSize(11f);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setLetterSpacing(0.09f);
        title.setPadding(dp(7), dp(17), dp(7), dp(8));
        return title;
    }

    private View createRoomCard(CoastRoom room) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setMinimumHeight(dp(72));
        card.setPadding(dp(12), dp(10), dp(12), dp(10));
        card.setBackgroundResource(R.drawable.bg_room_card);
        card.setClickable(true);
        card.setFocusable(true);
        card.setContentDescription(room.title + "，" + room.subtitle);
        card.setOnClickListener(view -> openRoom(room));
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.bottomMargin = dp(8);
        card.setLayoutParams(cardParams);

        TextView symbol = new TextView(this);
        symbol.setGravity(Gravity.CENTER);
        symbol.setText(room.symbol);
        symbol.setTextColor(getColor(R.color.coast_gold_soft));
        symbol.setTextSize(20f);
        symbol.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        symbol.setBackgroundResource(R.drawable.bg_room_symbol);
        card.addView(symbol, new LinearLayout.LayoutParams(dp(46), dp(46)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams copyParams = new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
        );
        copyParams.leftMargin = dp(12);
        copyParams.rightMargin = dp(8);

        TextView title = new TextView(this);
        title.setText(room.title);
        title.setTextColor(getColor(R.color.coast_white));
        title.setTextSize(15f);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        copy.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(room.subtitle);
        subtitle.setTextColor(getColor(R.color.coast_text_muted));
        subtitle.setTextSize(11f);
        subtitle.setMaxLines(2);
        copy.addView(subtitle);
        card.addView(copy, copyParams);

        TextView arrow = new TextView(this);
        arrow.setText("›");
        arrow.setTextColor(getColor(R.color.coast_gold_soft));
        arrow.setTextSize(24f);
        card.addView(arrow, new LinearLayout.LayoutParams(dp(20), dp(42)));
        return card;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void prewarmCoast() {
        webReady = false;
        resetNetworkLoadMode();
        offlineCacheAttempted = false;
        webView.loadUrl(BuildConfig.COAST_URL);
    }

    private void showHome() {
        currentRoom = null;
        pendingRoom = null;
        roomSwitchToken += 1;
        pageProgress.removeCallbacks(revealPageProgress);
        pageProgress.setVisibility(View.GONE);
        homeScreen.setVisibility(View.VISIBLE);
        roomScreen.setVisibility(View.GONE);
        applyShellSystemBars();
        updateHomeSyncNote();
    }

    private void updateHomeSyncNote() {
        String lastRoomId = localState.getString(LAST_ROOM_ID, "");
        CoastRoom lastRoom = CoastRoom.fromId(lastRoomId);
        if (lastRoom == null) {
            homeSyncNote.setText(R.string.home_ready_note);
            return;
        }
        String status = webReady ? "线上内容岛已预热" : "本地入口已就绪";
        homeSyncNote.setText(status + " · 上次停在「" + lastRoom.title + "」");
    }

    private void openRoom(CoastRoom room) {
        currentRoom = room;
        pendingRoom = null;
        int switchToken = ++roomSwitchToken;
        localState.edit()
                .putString(LAST_ROOM_ID, room.id)
                .putLong(LAST_ROOM_OPENED_AT, System.currentTimeMillis())
                .apply();

        homeScreen.setVisibility(View.GONE);
        roomScreen.setVisibility(View.VISIBLE);
        roomNavTitle.setText(room.title);
        roomNavStatus.setText(R.string.local_room_ready);
        hideNetworkError();
        pageProgress.setVisibility(View.GONE);
        applyShellSystemBars();

        if (room.kind == CoastRoom.Kind.LOCAL_UPDATE) {
            showLocalUpdateRoom(switchToken);
            return;
        }
        if (room.kind == CoastRoom.Kind.LOCAL_ABOUT) {
            showLocalAboutRoom(switchToken);
            return;
        }

        prepareWebRoom(room, switchToken);
    }

    private void prepareWebRoom(CoastRoom room, int switchToken) {
        webView.setVisibility(View.VISIBLE);
        localRoomPanel.setVisibility(View.GONE);
        showRoomSkeleton(room);
        pendingRoom = room;
        offlineCacheAttempted = false;
        resetNetworkLoadMode();

        String currentUrl = webView.getUrl();
        if (room.kind == CoastRoom.Kind.WEB_PAGE) {
            String mailboxUrl = BuildConfig.COAST_URL + "/mailbox";
            if (isMailboxUrl(currentUrl) && webReady) {
                pendingRoom = null;
                presentWebContent(switchToken);
            } else {
                webReady = false;
                webView.loadUrl(mailboxUrl);
            }
            return;
        }

        if (isLoginUrl(currentUrl) && webReady) {
            presentLoginContent(switchToken);
            return;
        }
        if (isAppRuntimeUrl(currentUrl) && webReady) {
            dispatchRoomAction(room, switchToken, 0);
            return;
        }

        webReady = false;
        webView.loadUrl(BuildConfig.COAST_URL);
    }

    private void showRoomSkeleton(CoastRoom room) {
        skeletonTitle.setText(room.title);
        skeletonSubtitle.setText(room.subtitle + "\n本地房间已打开");
        roomNavStatus.setText(R.string.local_room_ready);
        roomSkeleton.setAlpha(1f);
        roomSkeleton.setVisibility(View.VISIBLE);
        webView.setAlpha(0f);
    }

    private void dispatchRoomAction(CoastRoom room, int switchToken, int attempt) {
        if (currentRoom != room || switchToken != roomSwitchToken) {
            return;
        }
        String script = "(function(){try{return !!(window.CoastNativeShell"
                + "&&window.CoastNativeShell.openRoom("
                + JSONObject.quote(room.id)
                + "));}catch(_error){return false;}})();";
        webView.evaluateJavascript(script, rawValue -> {
            if (currentRoom != room || switchToken != roomSwitchToken) {
                return;
            }
            if ("true".equals(rawValue)) {
                pendingRoom = null;
                webView.postDelayed(() -> presentWebContent(switchToken), 110L);
                return;
            }
            if (attempt < MAX_NATIVE_DISPATCH_ATTEMPTS) {
                webView.postDelayed(
                        () -> dispatchRoomAction(room, switchToken, attempt + 1),
                        150L
                );
                return;
            }
            roomNavStatus.setText("线上入口已打开");
            presentWebContent(switchToken);
        });
    }

    private void presentLoginContent(int switchToken) {
        roomNavStatus.setText("登录后继续同步此房间");
        presentWebContent(switchToken);
    }

    private void presentWebContent(int switchToken) {
        if (switchToken != roomSwitchToken || currentRoom == null) {
            return;
        }
        hideNetworkError();
        webView.animate().cancel();
        webView.animate().alpha(1f).setDuration(CONTENT_FADE_MS).start();
        if (roomSkeleton.getVisibility() == View.VISIBLE) {
            roomSkeleton.animate()
                    .alpha(0f)
                    .setDuration(CONTENT_FADE_MS)
                    .withEndAction(() -> {
                        if (switchToken == roomSwitchToken) {
                            roomSkeleton.setVisibility(View.GONE);
                            roomSkeleton.setAlpha(1f);
                        }
                    })
                    .start();
        }
        if (!isLoginUrl(webView.getUrl())) {
            roomNavStatus.setText(R.string.online_room_ready);
        }
    }

    private void showLocalUpdateRoom(int switchToken) {
        webView.setVisibility(View.INVISIBLE);
        roomSkeleton.setVisibility(View.GONE);
        errorPanel.setVisibility(View.GONE);
        localRoomPanel.setVisibility(View.VISIBLE);
        localRoomTitle.setText(R.string.open_update_center);
        localRoomBody.setText(buildUpdateCenterMessage(null, false));
        localPrimaryButton.setText(R.string.retry_update_check);
        localPrimaryButton.setOnClickListener(view -> refreshLocalUpdateRoom(switchToken));
        localSecondaryButton.setText(R.string.open_web_update_page);
        localSecondaryButton.setOnClickListener(
                view -> launchExternal(Uri.parse(BuildConfig.UPDATE_PAGE_URL))
        );
        roomNavStatus.setText("APK 内本地更新骨架");
        refreshLocalUpdateRoom(switchToken);
    }

    private void refreshLocalUpdateRoom(int switchToken) {
        if (currentRoom != CoastRoom.UPDATES || switchToken != roomSwitchToken) {
            return;
        }
        localRoomBody.setText(buildUpdateCenterMessage(null, true));
        roomNavStatus.setText("正在读取线上清单…");
        updateChecker.check(BuildConfig.UPDATE_MANIFEST_URL, new CoastUpdateChecker.Callback() {
            @Override
            public void onSuccess(CoastUpdateChecker.UpdateInfo updateInfo) {
                if (currentRoom == CoastRoom.UPDATES && switchToken == roomSwitchToken) {
                    localRoomBody.setText(buildUpdateCenterMessage(updateInfo, false));
                    roomNavStatus.setText(updateInfo.latestVersionCode > BuildConfig.VERSION_CODE
                            ? "发现 CoastGPT 新版本"
                            : "当前已是最新版");
                }
            }

            @Override
            public void onFailure() {
                if (currentRoom == CoastRoom.UPDATES && switchToken == roomSwitchToken) {
                    localRoomBody.setText(buildUpdateCenterMessage(null, false));
                    roomNavStatus.setText(R.string.offline_room_status);
                }
            }
        });
    }

    private void showLocalAboutRoom(int switchToken) {
        webView.setVisibility(View.INVISIBLE);
        roomSkeleton.setVisibility(View.GONE);
        errorPanel.setVisibility(View.GONE);
        localRoomPanel.setVisibility(View.VISIBLE);
        localRoomTitle.setText(R.string.about_coast);
        localRoomBody.setText(buildAboutMessage(null, false));
        localPrimaryButton.setText(R.string.check_update);
        localPrimaryButton.setOnClickListener(view -> openRoom(CoastRoom.UPDATES));
        localSecondaryButton.setText(R.string.open_browser);
        localSecondaryButton.setOnClickListener(
                view -> launchExternal(Uri.parse(BuildConfig.COAST_URL))
        );
        roomNavStatus.setText("APK 内本地关于页");

        updateChecker.check(BuildConfig.UPDATE_MANIFEST_URL, new CoastUpdateChecker.Callback() {
            @Override
            public void onSuccess(CoastUpdateChecker.UpdateInfo updateInfo) {
                if (currentRoom == CoastRoom.ABOUT && switchToken == roomSwitchToken) {
                    localRoomBody.setText(buildAboutMessage(updateInfo, false));
                    roomNavStatus.setText("线上版本信息已同步");
                }
            }

            @Override
            public void onFailure() {
                if (currentRoom == CoastRoom.ABOUT && switchToken == roomSwitchToken) {
                    localRoomBody.setText(buildAboutMessage(null, true));
                    roomNavStatus.setText(R.string.offline_room_status);
                }
            }
        });
    }

    private void showShellMenu() {
        String[] entries = {
                getString(R.string.refresh_current_room),
                getString(R.string.back_to_home),
                getString(R.string.clear_cache_reload),
                getString(R.string.check_update),
                getString(R.string.open_browser),
                getString(R.string.about_coast),
        };
        new AlertDialog.Builder(this)
                .setTitle(R.string.app_name)
                .setItems(entries, (dialog, which) -> {
                    if (which == 0) {
                        retryCurrentRoom();
                    } else if (which == 1) {
                        showHome();
                    } else if (which == 2) {
                        clearResourceCacheAndReload();
                    } else if (which == 3) {
                        openRoom(CoastRoom.UPDATES);
                    } else if (which == 4) {
                        launchExternal(currentExternalUri());
                    } else if (which == 5) {
                        openRoom(CoastRoom.ABOUT);
                    }
                })
                .setNegativeButton(R.string.close, null)
                .show();
    }

    private void retryCurrentRoom() {
        CoastRoom room = currentRoom;
        if (room == null) {
            prewarmCoast();
            homeSyncNote.setText("正在后台重新连接线上海岸…");
            return;
        }
        if (room == CoastRoom.UPDATES) {
            refreshLocalUpdateRoom(roomSwitchToken);
            return;
        }
        if (room == CoastRoom.ABOUT) {
            showLocalAboutRoom(roomSwitchToken);
            return;
        }

        int switchToken = ++roomSwitchToken;
        hideNetworkError();
        showRoomSkeleton(room);
        pendingRoom = room;
        resetNetworkLoadMode();
        offlineCacheAttempted = false;
        webReady = false;
        String currentUrl = webView.getUrl();
        if (currentUrl == null || currentUrl.trim().isEmpty()) {
            prepareWebRoom(room, switchToken);
        } else {
            webView.reload();
        }
    }

    private void clearResourceCacheAndReload() {
        CoastRoom room = currentRoom;
        hideNetworkError();
        resetNetworkLoadMode();
        offlineCacheAttempted = false;
        webView.clearCache(true);
        if (room != null && room.kind != CoastRoom.Kind.LOCAL_ABOUT
                && room.kind != CoastRoom.Kind.LOCAL_UPDATE) {
            pendingRoom = room;
            showRoomSkeleton(room);
        }

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
            webReady = false;
            webView.evaluateJavascript(script, null);
        } else {
            prewarmCoast();
        }
        toast(R.string.cache_cleared);
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
                    .append("\n本地房间、菜单、关于、错误恢复与版本说明仍可使用。");
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

        message.append("\n\n签名说明：debug APK 只用于测试；正式覆盖安装需保持 packageName 与长期 release 签名一致，并递增 versionCode。\n\nA4 不会自动下载或安装 APK。");
        return message.toString();
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
                + "在线内容岛：" + BuildConfig.COAST_URL + "\n\n"
                + "Web：" + webLabel + " · " + webCommit + "\n"
                + "MCP expectedVersion：" + expectedMcpVersion + "\n"
                + "更新清单：" + BuildConfig.UPDATE_MANIFEST_URL + "\n"
                + (offline ? "清单状态：离线，显示 APK 内基础信息\n\n" : "\n")
                + "A4 将首页、房间入口、房间骨架、菜单、关于、更新与错误恢复放进 APK；单一 WebView 只承载在线内容岛。APP 只保存上次房间 ID 与时间，不缓存聊天、信箱或记忆正文。\n\n"
                + "清缓存不会删除 Cookie、localStorage、sessionStorage 或 IndexedDB。APP 模式只用于 UI，不是身份或权限依据，也不会进入模型上下文。";
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

    private boolean isAppRuntimeUrl(String value) {
        if (!isInternalUrl(value)) {
            return false;
        }
        String path = Uri.parse(value).getPath();
        return path == null || path.isEmpty() || "/".equals(path) || "/index.html".equals(path);
    }

    private boolean isMailboxUrl(String value) {
        return isInternalUrl(value) && "/mailbox".equals(Uri.parse(value).getPath());
    }

    private boolean isLoginUrl(String value) {
        return isInternalUrl(value) && "/login".equals(Uri.parse(value).getPath());
    }

    @Override
    public void onMainFrameStarted() {
        webReady = false;
        hideNetworkError();
    }

    @Override
    public void onMainFrameLoaded(String url) {
        webReady = true;
        resetNetworkLoadMode();
        offlineCacheAttempted = false;
        hideNetworkError();
        applyDocumentThemeColor();
        if (clearHistoryAfterHomeLoad) {
            webView.clearHistory();
            clearHistoryAfterHomeLoad = false;
        }

        if (currentRoom == null) {
            updateHomeSyncNote();
            return;
        }
        if (currentRoom.kind == CoastRoom.Kind.LOCAL_UPDATE
                || currentRoom.kind == CoastRoom.Kind.LOCAL_ABOUT) {
            return;
        }

        int switchToken = roomSwitchToken;
        if (currentRoom.kind == CoastRoom.Kind.WEB_PAGE) {
            if (isMailboxUrl(url)) {
                pendingRoom = null;
                presentWebContent(switchToken);
            } else if (isLoginUrl(url)) {
                presentLoginContent(switchToken);
            } else {
                webReady = false;
                webView.loadUrl(BuildConfig.COAST_URL + "/mailbox");
            }
            return;
        }

        if (isAppRuntimeUrl(url)) {
            dispatchRoomAction(currentRoom, switchToken, 0);
        } else if (isLoginUrl(url)) {
            presentLoginContent(switchToken);
        } else {
            presentWebContent(switchToken);
        }
    }

    @Override
    public void onMainFrameError(
            String message,
            String failedUrl,
            boolean allowCachedFallback
    ) {
        webReady = false;
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
        if (currentRoom == null) {
            homeSyncNote.setText("离线，暂未同步 · 本地房间和按钮仍可使用");
            return;
        }
        if (currentRoom.kind == CoastRoom.Kind.LOCAL_UPDATE
                || currentRoom.kind == CoastRoom.Kind.LOCAL_ABOUT) {
            return;
        }
        roomSkeleton.setVisibility(View.GONE);
        localRoomPanel.setVisibility(View.GONE);
        webView.setAlpha(0f);
        errorMessage.setText(message + "\n\n本地房间仍然在这里。恢复网络后可以重试同步。");
        errorPanel.setVisibility(View.VISIBLE);
        roomNavStatus.setText(R.string.offline_room_status);
        applyShellSystemBars();
    }

    private void resetNetworkLoadMode() {
        if (usingCacheOnly && webView != null) {
            webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        }
        usingCacheOnly = false;
    }

    private void applyDocumentThemeColor() {
        if (currentRoom == null) {
            return;
        }
        String script = "(function(){var node=document.querySelector('meta[name=theme-color]');"
                + "return node&&node.content?node.content:'';})();";
        webView.evaluateJavascript(script, rawValue -> {
            try {
                String value = new JSONArray("[" + rawValue + "]").optString(0, "").trim();
                if (!value.matches("#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?")) {
                    return;
                }
                int color = Color.parseColor(value);
                applySystemBarColors(color, isLightColor(color));
            } catch (Exception ignored) {
                applyShellSystemBars();
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

    private Uri currentExternalUri() {
        String currentUrl = webView.getUrl();
        if (currentRoom != null && currentRoom.kind == CoastRoom.Kind.WEB_PAGE) {
            return Uri.parse(BuildConfig.COAST_URL + "/mailbox");
        }
        return isInternalUrl(currentUrl)
                ? Uri.parse(currentUrl)
                : Uri.parse(BuildConfig.COAST_URL);
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
        if (currentRoom != null) {
            showHome();
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
        if (currentRoom != null) {
            outState.putString(STATE_ROOM_ID, currentRoom.id);
        }
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

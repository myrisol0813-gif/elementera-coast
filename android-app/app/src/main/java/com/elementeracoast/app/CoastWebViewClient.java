package com.elementeracoast.app;

import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

public final class CoastWebViewClient extends WebViewClient {
    public interface Delegate {
        void onMainFrameStarted();

        void onMainFrameLoaded(String url);

        void onMainFrameError(String message);

        void openExternalUri(Uri uri);
    }

    private final String internalHost;
    private final Delegate delegate;
    private boolean mainFrameFailed;

    public CoastWebViewClient(String internalHost, Delegate delegate) {
        this.internalHost = internalHost.toLowerCase(Locale.ROOT);
        this.delegate = delegate;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return routeUri(request.getUrl());
    }

    @Override
    @SuppressWarnings("deprecation")
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return routeUri(Uri.parse(url));
    }

    private boolean routeUri(Uri uri) {
        if (uri == null) {
            return true;
        }

        String scheme = uri.getScheme();
        String host = uri.getHost();
        if ("https".equalsIgnoreCase(scheme)
                && host != null
                && internalHost.equals(host.toLowerCase(Locale.ROOT))) {
            return false;
        }
        if ("about".equalsIgnoreCase(scheme)) {
            return false;
        }

        delegate.openExternalUri(uri);
        return true;
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        mainFrameFailed = false;
        delegate.onMainFrameStarted();
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        if (!mainFrameFailed) {
            delegate.onMainFrameLoaded(url);
        }
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) {
            mainFrameFailed = true;
            delegate.onMainFrameError("海岸暂时无法连接。请检查网络后再试。");
        }
    }

    @Override
    public void onReceivedHttpError(
            WebView view,
            WebResourceRequest request,
            WebResourceResponse errorResponse
    ) {
        if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
            mainFrameFailed = true;
            delegate.onMainFrameError("线上海岸暂时没有回应。稍后重试即可。");
        }
    }

    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        handler.cancel();
        mainFrameFailed = true;
        delegate.onMainFrameError("安全连接没有通过校验，海岸外壳已停止载入。");
    }
}

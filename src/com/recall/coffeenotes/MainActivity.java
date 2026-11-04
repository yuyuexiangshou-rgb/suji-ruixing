package com.recall.coffeenotes;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.IOException;

public final class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private WebView web;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(247, 245, 239));
        getWindow().setNavigationBarColor(Color.rgb(34, 38, 37));
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            getWindow().setNavigationBarColor(Color.rgb(247, 245, 239));
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247, 245, 239));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!"https".equals(url.getScheme()) || !ASSET_HOST.equals(url.getHost())) return null;
                String path = url.getPath();
                if (path == null || !path.matches("/[a-z-]+\\.(html|css|js)")) return null;
                String type = path.endsWith(".html") ? "text/html"
                        : path.endsWith(".css") ? "text/css" : "text/javascript";
                try {
                    return new WebResourceResponse(type, "UTF-8", getAssets().open(path.substring(1)));
                } catch (IOException exception) {
                    return null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String rawUrl) {
                Uri url = Uri.parse(rawUrl);
                if ("https".equals(url.getScheme()) && !ASSET_HOST.equals(url.getHost())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, url));
                    } catch (ActivityNotFoundException exception) {
                        Toast.makeText(MainActivity.this, "手机上没有可打开链接的浏览器", Toast.LENGTH_SHORT).show();
                    }
                }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("https://" + ASSET_HOST + "/index.html");
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.backInApp && window.backInApp()", handled -> {
            if (!"true".equals(handled)) super.onBackPressed();
        });
    }
}

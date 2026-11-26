// 外部ページに差し込むツールバーと画像選択 UI。
// Android / iOS の外部ページビューと同じ操作 (URL 表示・戻る・画像を保存・閉じる) を
// デスクトップでも使えるようにする。アプリ側 (Rust) は document.title の接頭辞で
// 操作を受け取る (pawkemo-save#<JSON> / pawkemo-close#)。
(function () {
  if (window.__pawkemoOverlayInstalled) return;
  window.__pawkemoOverlayInstalled = true;

  var SAVE_PREFIX = "pawkemo-save#";
  var CLOSE_TITLE = "pawkemo-close#";
  var MAX_IMAGES = 300;
  var BAR_ID = "__pawkemo_bar";

  function make(tag, css, text) {
    var el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function button(label, extra) {
    var b = make(
      "button",
      "border:0;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;" +
        "background:#2a2c30;color:#e8e9eb;cursor:pointer;white-space:nowrap;flex:0 0 auto;" +
        (extra || ""),
      label,
    );
    b.type = "button";
    return b;
  }

  function isAvatar(u) {
    var host = u.hostname;
    var path = u.pathname;
    if (host === "pbs.twimg.com") {
      return path.indexOf("/profile_images/") === 0 || path.indexOf("/profile_banners/") === 0;
    }
    if (
      host === "abs.twimg.com" ||
      host === "graph.facebook.com" ||
      host === "platform-lookaside.fbsbx.com" ||
      host === "yt3.ggpht.com"
    ) {
      return true;
    }
    if (/(^|\.)gravatar\.com$/.test(host)) return path.indexOf("/avatar/") === 0;
    return false;
  }

  // 表示中ページの画像候補を集める (アプリ側と同じ除外規則)
  function collect() {
    var out = [];
    var seen = {};
    function push(raw) {
      if (!raw) return;
      var u;
      try {
        u = new URL(raw, location.href);
      } catch (e) {
        return;
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      if (isAvatar(u)) return;
      if (/\.(mp4|webm|mov|m4v|m3u8|gifv)$/i.test(u.pathname)) return;
      if (seen[u.href]) return;
      seen[u.href] = 1;
      out.push(u.href);
    }
    var imgs = document.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.closest && img.closest("#" + BAR_ID + ",header,nav,footer")) continue;
      push(img.currentSrc || img.src);
      push(img.getAttribute("data-src"));
      push(img.getAttribute("data-original"));
      push(img.getAttribute("data-lazy-src"));
      var set = img.getAttribute("srcset") || img.getAttribute("data-srcset");
      if (set) {
        var parts = set.split(",");
        var last = parts[parts.length - 1].trim().split(/\s+/)[0];
        push(last);
      }
    }
    var meta = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
    if (meta) push(meta.getAttribute("content"));
    return out.slice(0, MAX_IMAGES);
  }

  function toast(message) {
    var box = make(
      "div",
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;" +
        "padding:10px 16px;border-radius:10px;background:rgba(20,21,24,0.92);color:#e8e9eb;" +
        "font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;pointer-events:none;",
      message,
    );
    (document.body || document.documentElement).appendChild(box);
    setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, 2400);
  }

  // チェック式の画像選択画面 (モバイルの外部ページビューと同じ見た目)
  function showPicker(urls) {
    if (window.__pawkemoPickerClose) window.__pawkemoPickerClose();
    var selected = [];
    for (var i = 0; i < urls.length; i++) selected.push(true);

    var root = make(
      "div",
      "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:#0e0f11;" +
        "display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
    );
    var header = make(
      "div",
      "display:flex;align-items:center;gap:10px;padding:10px 12px;background:#1a1b1e;color:#e8e9eb;flex:0 0 auto;",
    );
    var close = button("✕", "width:40px;height:40px;padding:0;font-size:18px;");
    var titleWrap = make("div", "flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;");
    var title = make(
      "div",
      "font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
      "保存する画像を選択",
    );
    var count = make("div", "font-size:12px;color:#9aa0a6;", "");
    titleWrap.appendChild(title);
    titleWrap.appendChild(count);
    var all = button("すべて解除");
    var save = button("保存", "background:#1a73e8;color:#fff;");
    header.appendChild(close);
    header.appendChild(titleWrap);
    header.appendChild(all);
    header.appendChild(save);

    var grid = make(
      "div",
      "flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));" +
        "align-content:start;gap:2px;padding:2px;background:#0e0f11;",
    );
    var marks = [];

    function renderMark(mark, on) {
      mark.textContent = on ? "✓" : "";
      mark.style.background = on ? "#1a73e8" : "rgba(0,0,0,0.25)";
      mark.style.borderColor = on ? "#1a73e8" : "#fff";
    }

    function updateCount() {
      var n = 0;
      for (var i = 0; i < selected.length; i++) if (selected[i]) n++;
      count.textContent = n + " / " + urls.length + " 枚";
      save.textContent = n > 0 ? "保存 (" + n + ")" : "保存";
      all.textContent = n === urls.length ? "すべて解除" : "すべて選択";
    }

    for (var j = 0; j < urls.length; j++) {
      (function (index) {
        var tile = make(
          "button",
          "position:relative;display:flex;align-items:flex-start;justify-content:flex-start;padding:0;border:0;background:#1a1b1e;overflow:hidden;cursor:pointer;",
        );
        tile.type = "button";
        var img = make(
          "img",
          "width:100%;display:block;aspect-ratio:3/4;object-fit:cover;background:#1a1b1e;",
        );
        img.src = urls[index];
        img.loading = "lazy";
        img.alt = "";
        var mark = make(
          "span",
          "position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;" +
            "border:2px solid #1a73e8;background:#1a73e8;display:flex;align-items:center;" +
            "justify-content:center;color:#fff;font-size:16px;font-weight:700;",
          "✓",
        );
        tile.appendChild(img);
        tile.appendChild(mark);
        tile.onclick = function () {
          selected[index] = !selected[index];
          renderMark(mark, selected[index]);
          updateCount();
        };
        grid.appendChild(tile);
        marks.push(mark);
      })(j);
    }

    all.onclick = function () {
      var n = 0;
      for (var i = 0; i < selected.length; i++) if (selected[i]) n++;
      var next = n !== selected.length;
      for (var k = 0; k < selected.length; k++) {
        selected[k] = next;
        renderMark(marks[k], next);
      }
      updateCount();
    };

    save.onclick = function () {
      var out = [];
      for (var i = 0; i < urls.length; i++) if (selected[i]) out.push(urls[i]);
      if (out.length === 0) return;
      window.__pawkemoSelected = out;
      document.title = SAVE_PREFIX + JSON.stringify(out);
    };

    close.onclick = function () {
      if (window.__pawkemoPickerClose) window.__pawkemoPickerClose();
    };

    root.appendChild(header);
    root.appendChild(grid);
    (document.body || document.documentElement).appendChild(root);
    window.__pawkemoPickerClose = function () {
      if (root.parentNode) root.parentNode.removeChild(root);
      window.__pawkemoPickerClose = null;
    };
    updateCount();
  }

  function openPicker() {
    var urls = collect();
    if (!urls.length) {
      toast("保存できる画像が見つかりませんでした");
      return;
    }
    showPicker(urls);
  }

  function installToolbar() {
    if (document.getElementById(BAR_ID)) return;
    var bar = make(
      "div",
      "position:fixed;left:0;top:0;right:0;z-index:2147483646;display:flex;align-items:center;" +
        "gap:8px;padding:6px 10px;background:rgba(26,27,30,0.96);color:#e8e9eb;" +
        "font:13px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
        "box-shadow:0 1px 6px rgba(0,0,0,0.35);",
    );
    bar.id = BAR_ID;
    var urlText = make(
      "div",
      "flex:1 1 0%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#c8ccd2;",
      location.href,
    );
    var back = button("戻る");
    back.onclick = function () {
      history.back();
    };
    var save = button("画像を保存", "background:#1a73e8;color:#fff;");
    save.onclick = openPicker;
    var close = button("閉じる");
    close.onclick = function () {
      document.title = CLOSE_TITLE;
    };
    bar.appendChild(urlText);
    bar.appendChild(back);
    bar.appendChild(save);
    bar.appendChild(close);
    (document.body || document.documentElement).appendChild(bar);
    // SPA の遷移でも URL 表示を追従させる
    setInterval(function () {
      if (urlText.textContent !== location.href) urlText.textContent = location.href;
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installToolbar);
  } else {
    installToolbar();
  }
})();

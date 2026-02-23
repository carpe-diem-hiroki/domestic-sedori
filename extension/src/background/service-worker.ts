/**
 * Service Worker - バックグラウンド処理
 * コンテンツスクリプトからのfetchリクエストを中継する
 * （MV3: HTTPSページからHTTP localhostへの直接fetchはブロックされるため）
 */
chrome.runtime.onInstalled.addListener(() => {
    console.log("Sedori Tool extension installed");
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === "fetch") {
        const { url, method, body } = request;
        const init: RequestInit = { method: method || "GET" };
        if (body) {
            init.headers = { "Content-Type": "application/json" };
            init.body = body;
        }
        fetch(url, init)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true; // 非同期レスポンスのためチャネルを開いたまま保持
    }
});

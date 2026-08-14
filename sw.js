/* 在线工具箱 Service Worker - 提供离线缓存与 PWA 支持 */
var CACHE_NAME = 'toolbox-v1';
var CORE_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/auth.js',
    './404.html'
];

// 安装：预缓存核心资源
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(CORE_ASSETS).catch(function() {});
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// 激活：清理旧版本缓存
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) {
                    return key !== CACHE_NAME;
                }).map(function(key) {
                    return caches.delete(key);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// 抓取：静态资源用缓存优先（离线可用），页面请求用网络优先（内容保持最新）
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // 仅处理同源 GET 请求
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;

    // 页面导航：网络优先，失败回退缓存，再失败回退 404 页
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).then(function(response) {
                var copy = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, copy);
                });
                return response;
            }).catch(function() {
                return caches.match(event.request).then(function(cached) {
                    if (cached) return cached;
                    return caches.match('./404.html');
                });
            })
        );
        return;
    }

    // 静态资源（css/js/图片等）：缓存优先
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            return fetch(event.request).then(function(response) {
                if (response && response.status === 200 && response.type === 'basic') {
                    var copy = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, copy);
                    });
                }
                return response;
            });
        })
    );
});

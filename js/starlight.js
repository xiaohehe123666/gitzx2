/* ============================================
 * 星空主题彩蛋 · 全站共享模块
 * 触发：首页搜索框输入「作者大大最帅」
 * 关闭：用户中心「星空主题」开关 / 悬浮菜单「立即关闭」
 * 状态持久化于 localStorage，跨页面生效
 * ============================================ */
(function(window, document) {
    'use strict';

    var STORAGE_KEY = 'toolbox_starlight';
    var SECRET = '作者大大最帅';

    var state = {
        active: false,
        canvas: null,
        ctx: null,
        stars: [],
        shootingStars: [],
        rafId: null,
        meteorTimer: null,
        resizeHandler: null,
        menuOpen: false
    };

    /* ---------- 基础工具 ---------- */

    function pickStarColor() {
        var colors = ['#FFFFFF', '#C4B5FD', '#A78BFA', '#F0ABFC', '#93C5FD', '#FDE68A'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function ensureCanvas() {
        if (state.canvas && document.getElementById('starlightCanvas')) return;
        var canvas = document.getElementById('starlightCanvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'starlightCanvas';
            document.body.appendChild(canvas);
        }
        state.canvas = canvas;
        state.ctx = canvas.getContext('2d');
    }

    function resizeCanvas() {
        if (!state.canvas) return;
        state.canvas.width = window.innerWidth;
        state.canvas.height = window.innerHeight;
    }

    function generateStars() {
        var canvas = state.canvas;
        var starCount = Math.min(220, Math.floor((canvas.width * canvas.height) / 6000));
        state.stars = [];
        for (var i = 0; i < starCount; i++) {
            state.stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.4 + 0.3,
                alpha: Math.random() * 0.7 + 0.3,
                delta: (Math.random() - 0.5) * 0.02,
                color: pickStarColor()
            });
        }
    }

    function spawnShootingStar() {
        if (!state.canvas) return;
        var startX = Math.random() * state.canvas.width * 0.6;
        var startY = Math.random() * state.canvas.height * 0.4;
        state.shootingStars.push({
            x: startX,
            y: startY,
            len: 80 + Math.random() * 60,
            speed: 6 + Math.random() * 4,
            angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
            alpha: 1,
            color: pickStarColor()
        });
    }

    function animate() {
        if (!state.active) return;
        var canvas = state.canvas;
        var ctx = state.ctx;
        if (!canvas || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 绘制星星
        for (var i = 0; i < state.stars.length; i++) {
            var s = state.stars[i];
            s.alpha += s.delta;
            if (s.alpha > 1) { s.alpha = 1; s.delta = -s.delta; }
            if (s.alpha < 0.2) { s.alpha = 0.2; s.delta = -s.delta; }

            ctx.globalAlpha = s.alpha;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();

            // 大星星加光晕
            if (s.r > 1) {
                ctx.globalAlpha = s.alpha * 0.3;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 绘制流星
        for (var j = state.shootingStars.length - 1; j >= 0; j--) {
            var m = state.shootingStars[j];
            var tailX = m.x - Math.cos(m.angle) * m.len;
            var tailY = m.y - Math.sin(m.angle) * m.len;

            var grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
            grad.addColorStop(0, 'rgba(255,255,255,' + m.alpha + ')');
            grad.addColorStop(0.4, 'rgba(196,181,253,' + (m.alpha * 0.6) + ')');
            grad.addColorStop(1, 'rgba(196,181,253,0)');
            ctx.globalAlpha = 1;
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(tailX, tailY);
            ctx.stroke();

            ctx.globalAlpha = m.alpha;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
            ctx.fill();

            m.x += Math.cos(m.angle) * m.speed;
            m.y += Math.sin(m.angle) * m.speed;
            m.alpha -= 0.012;
            if (m.alpha <= 0 || m.x > canvas.width + 100 || m.y > canvas.height + 100) {
                state.shootingStars.splice(j, 1);
            }
        }

        ctx.globalAlpha = 1;
        state.rafId = requestAnimationFrame(animate);
    }

    /* ---------- 横幅 ---------- */

    function showBanner() {
        removeBanner();
        var banner = document.createElement('div');
        banner.className = 'starlight-banner';
        banner.innerHTML =
            '<div class="starlight-banner-icon">✦</div>' +
            '<div class="starlight-banner-title">星空主题已激活</div>' +
            '<div class="starlight-banner-sub">你发现了隐藏彩蛋 · 愿星光指引你的旅程</div>' +
            '<div class="starlight-banner-hint">想关闭主题？去用户中心开关即可<br><a href="user-profile.html">去用户中心关闭</a></div>';
        document.body.appendChild(banner);
        requestAnimationFrame(function() { banner.classList.add('show'); });

        // 5 秒后自动隐藏（保留星空背景与悬浮按钮）
        setTimeout(function() {
            banner.classList.remove('show');
            setTimeout(function() { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 800);
        }, 5000);
    }

    function removeBanner() {
        var old = document.querySelector('.starlight-banner');
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    /* ---------- 悬浮菜单 ---------- */

    function ensureFab() {
        if (document.getElementById('starlightFab')) return;
        var fab = document.createElement('button');
        fab.id = 'starlightFab';
        fab.className = 'starlight-fab';
        fab.innerHTML = '✦';
        fab.title = '星空主题';
        fab.setAttribute('aria-label', '星空主题菜单');
        fab.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleMenu();
        });
        document.body.appendChild(fab);

        var menu = document.createElement('div');
        menu.id = 'starlightMenu';
        menu.className = 'starlight-menu';
        menu.innerHTML =
            '<div class="starlight-menu-head">' +
                '<div class="starlight-menu-icon">✦</div>' +
                '<div>' +
                    '<div class="starlight-menu-title">星空主题已激活</div>' +
                    '<div class="starlight-menu-sub">愿星光指引你的旅程</div>' +
                '</div>' +
            '</div>' +
            '<div class="starlight-menu-desc">彩蛋入口：在首页搜索框输入 <code>作者大大最帅</code></div>' +
            '<div class="starlight-menu-actions">' +
                '<a href="user-profile.html" class="starlight-menu-btn primary"><i data-lucide="sparkles" style="width:14px;height:14px;"></i>去用户中心关闭</a>' +
                '<button type="button" id="starlightOffBtn" class="starlight-menu-btn"><i data-lucide="power" style="width:14px;height:14px;"></i>立即关闭主题</button>' +
            '</div>';
        document.body.appendChild(menu);
        if (window.lucide) lucide.createIcons();

        document.getElementById('starlightOffBtn').addEventListener('click', function() {
            disable();
        });

        // 点击外部关闭菜单
        document.addEventListener('click', function handler(e) {
            var m = document.getElementById('starlightMenu');
            if (m && state.menuOpen && !m.contains(e.target) && e.target.id !== 'starlightFab') {
                hideMenu();
            }
        });
    }

    function toggleMenu() {
        var menu = document.getElementById('starlightMenu');
        if (!menu) return;
        if (state.menuOpen) {
            hideMenu();
        } else {
            state.menuOpen = true;
            menu.classList.add('show');
        }
    }

    function hideMenu() {
        var menu = document.getElementById('starlightMenu');
        state.menuOpen = false;
        if (menu) menu.classList.remove('show');
    }

    function removeFab() {
        var fab = document.getElementById('starlightFab');
        if (fab && fab.parentNode) fab.parentNode.removeChild(fab);
        var menu = document.getElementById('starlightMenu');
        if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
        state.menuOpen = false;
    }

    /* ---------- 开关同步（用户中心） ---------- */

    function syncSwitch() {
        var sw = document.getElementById('starlightSwitch');
        if (sw) sw.checked = !!state.active;
    }

    /* ---------- 启用 / 停用 ---------- */

    function enable() {
        if (state.active) return;
        state.active = true;
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}

        document.body.classList.add('starlight-mode');
        ensureCanvas();
        resizeCanvas();
        state.resizeHandler = resizeCanvas;
        window.addEventListener('resize', state.resizeHandler);

        generateStars();
        setTimeout(function() { state.canvas.classList.add('show'); }, 50);
        animate();

        // 偶尔发射流星
        state.meteorTimer = setInterval(function() {
            if (state.active && Math.random() < 0.4) spawnShootingStar();
        }, 2500);

        ensureFab();
        showBanner();
        syncSwitch();

        // 通知页面钩子（如用户中心的猫耳朵）
        if (typeof window.StarlightHooks !== 'undefined' && StarlightHooks.onEnable) {
            StarlightHooks.onEnable();
        }
    }

    function disable() {
        if (!state.active) return;
        state.active = false;
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}

        if (state.rafId) cancelAnimationFrame(state.rafId);
        if (state.meteorTimer) clearInterval(state.meteorTimer);
        if (state.resizeHandler) window.removeEventListener('resize', state.resizeHandler);
        state.rafId = null;
        state.meteorTimer = null;
        state.resizeHandler = null;

        document.body.classList.remove('starlight-mode');
        if (state.canvas) {
            state.canvas.classList.remove('show');
            var c = state.canvas;
            setTimeout(function() {
                var ctx = c.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, c.width, c.height);
            }, 1500);
        }
        state.stars = [];
        state.shootingStars = [];

        removeBanner();
        removeFab();
        syncSwitch();

        if (typeof window.StarlightHooks !== 'undefined' && StarlightHooks.onDisable) {
            StarlightHooks.onDisable();
        }
    }

    function toggle() {
        if (state.active) disable();
        else enable();
    }

    /* ---------- 公开 API ---------- */

    var Starlight = {
        SECRET: SECRET,
        isActive: function() { return state.active; },
        enable: enable,
        disable: disable,
        toggle: toggle,
        // 供搜索框调用：输入命中彩蛋词则触发
        checkSearch: function(value) {
            if (!value) return false;
            if (String(value).trim() === SECRET) {
                enable();
                return true;
            }
            return false;
        },
        init: function() {
            // 页面加载时恢复持久化状态
            var saved = '0';
            try { saved = localStorage.getItem(STORAGE_KEY) || '0'; } catch (e) {}
            if (saved === '1') {
                setTimeout(enable, 150);
            } else {
                syncSwitch();
            }
            // 用户中心开关事件
            var sw = document.getElementById('starlightSwitch');
            if (sw) {
                sw.addEventListener('change', function() {
                    if (this.checked) enable();
                    else disable();
                });
            }
        }
    };

    window.Starlight = Starlight;

    // 页面加载后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', Starlight.init);
    } else {
        Starlight.init();
    }
})(window, document);

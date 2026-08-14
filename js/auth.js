/**
 * 用户认证与数据管理模块（纯前端方案）
 * 使用 Web Crypto API 进行密码哈希
 * 用户数据按用户名隔离存储在 localStorage

* 
 * 注意：整个模块用 try/catch 包裹，任何初始化错误都不会阻塞页面其他脚本。
 */
(function(window) {
    'use strict';
    try {

    var USERS_KEY = 'toolbox_users';
    var CURRENT_USER_KEY = 'toolbox_current_user';
    var USER_DATA_PREFIX = 'toolbox_ud_';

    // 静态盐值，增强密码哈希安全性
    var SALT = 'tb_2024_salt_k3y!';

    // 暴露的 API
    var Auth = {};

    // PWA 安装（创建桌面快捷方式）相关状态
    var deferredInstallPrompt = null;
    var installPromptSupported = false;

    // 尽早捕获浏览器的安装提示事件（Chrome / Edge 桌面端触发）
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        installPromptSupported = true;
    });
    window.addEventListener('appinstalled', function() {
        deferredInstallPrompt = null;
        if (typeof Auth.showToast === 'function') {
            Auth.showToast('已创建桌面快捷方式', 'success');
        }
    });

    /**
     * 使用 SHA-256 + 盐值密码哈希
     */
    async function hashPassword(password) {
        var encoder = new TextEncoder();
        var data = encoder.encode(SALT + password + SALT);
        var hashBuffer = await crypto.subtle.digest('SHA-256', data);
        var hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    }

    /**
     * 获取所有用户数据
     */
    function getAllUsers() {
        try {
            var data = localStorage.getItem(USERS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    /**
     * 保存所有用户数据
     */
    function saveAllUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    /**
     * 获取当前登录用户名
     */
    Auth.getCurrentUser = function() {
        return localStorage.getItem(CURRENT_USER_KEY);
    };

    /**
     * 检查是否已登录
     */
    Auth.isLoggedIn = function() {
        return !!Auth.getCurrentUser();
    };

    /**
     * 注册新用户
     * @returns {Promise<{success: boolean, message: string}>}
     */
    Auth.register = async function(username, password, email) {
        username = (username || '').trim();
        password = password || '';
        email = (email || '').trim();

        if (!username || !password) {
            return { success: false, message: '用户名和密码不能为空' };
        }
        if (username.length < 2) {
            return { success: false, message: '用户名至少需要 2 个字符' };
        }
        if (username.length > 20) {
            return { success: false, message: '用户名最多 20 个字符' };
        }
        if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
            return { success: false, message: '用户名只能包含字母、数字、下划线和中文' };
        }
        if (password.length < 6) {
            return { success: false, message: '密码至少需要 6 个字符' };
        }

        var users = getAllUsers();
        if (users[username]) {
            return { success: false, message: '该用户名已被注册' };
        }

        var hashedPassword = await hashPassword(password);
        users[username] = {
            password: hashedPassword,
            email: email,
            createdAt: Date.now()
        };
        saveAllUsers(users);

        // 自动登录
        localStorage.setItem(CURRENT_USER_KEY, username);

        return { success: true, message: '注册成功' };
    };

    /**
     * 登录
     * @returns {Promise<{success: boolean, message: string}>}
     */
    Auth.login = async function(username, password) {
        username = (username || '').trim();
        password = password || '';

        if (!username || !password) {
            return { success: false, message: '请输入用户名和密码' };
        }

        var users = getAllUsers();
        if (!users[username]) {
            return { success: false, message: '用户不存在' };
        }

        var hashedPassword = await hashPassword(password);
        if (users[username].password !== hashedPassword) {
            return { success: false, message: '密码错误' };
        }

        localStorage.setItem(CURRENT_USER_KEY, username);
        return { success: true, message: '登录成功' };
    };

    /**
     * 登出
     */
    Auth.logout = function() {
        localStorage.removeItem(CURRENT_USER_KEY);
    };

    // ===== 用户资料与自定义设置 =====

    // 默认头像颜色方案
    var AVATAR_COLORS = [
        { name: '靛蓝', from: '#6366F1', to: '#8B5CF6' },
        { name: '青色', from: '#0891B2', to: '#06B6D4' },
        { name: '翠绿', from: '#059669', to: '#10B981' },
        { name: '琥珀', from: '#D97706', to: '#F59E0B' },
        { name: '玫红', from: '#E11D48', to: '#F43F5E' },
        { name: '紫罗兰', from: '#7C3AED', to: '#A855F7' },
        { name: '天蓝', from: '#2563EB', to: '#3B82F6' },
        { name: '橙红', from: '#DC2626', to: '#F59E0B' },
        { name: '青柠', from: '#65A30D', to: '#84CC16' },
        { name: '深紫', from: '#4338CA', to: '#6366F1' }
    ];

    var DEFAULT_PROFILE = {
        nickname: '',
        email: '',
        bio: '',
        avatarColor: 0,
        avatarEmoji: '',
        avatarImage: '',
        theme: 'default'
    };

    /**
     * 获取用户资料
     */
    Auth.getProfile = function() {
        var username = Auth.getCurrentUser();
        if (!username) return null;

        var users = getAllUsers();
        var user = users[username];
        if (!user) return null;

        var profile = Auth.getUserData('user-profile') || {};
        return Object.assign({}, DEFAULT_PROFILE, {
            nickname: profile.nickname || username,
            email: profile.email || user.email || '',
            bio: profile.bio || '',
            avatarColor: profile.avatarColor !== undefined ? profile.avatarColor : 0,
            avatarEmoji: profile.avatarEmoji || '',
            avatarImage: profile.avatarImage || '',
            theme: profile.theme || 'default'
        });
    };

    /**
     * 保存用户资料
     */
    Auth.saveProfile = function(profile) {
        Auth.setUserData('user-profile', profile);
    };

    /**
     * 获取头像颜色配置
     */
    Auth.getAvatarColor = function(index) {
        return AVATAR_COLORS[index] || AVATAR_COLORS[0];
    };

    /**
     * 获取所有头像颜色选项
     */
    Auth.getAvatarColors = function() {
        return AVATAR_COLORS;
    };

    /**
     * 修改密码
     */
    Auth.changePassword = async function(oldPassword, newPassword) {
        var username = Auth.getCurrentUser();
        if (!username) return { success: false, message: '请先登录' };

        if (!newPassword || newPassword.length < 6) {
            return { success: false, message: '新密码至少需要 6 个字符' };
        }

        var users = getAllUsers();
        if (!users[username]) {
            return { success: false, message: '用户不存在' };
        }

        var oldHash = await hashPassword(oldPassword);
        if (users[username].password !== oldHash) {
            return { success: false, message: '原密码错误' };
        }

        var newHash = await hashPassword(newPassword);
        users[username].password = newHash;
        saveAllUsers(users);

        return { success: true, message: '密码修改成功' };
    };

    /**
     * 获取当前用户完整信息（含资料）
     */
    Auth.getCurrentUserInfo = function() {
        var username = Auth.getCurrentUser();
        if (!username) return null;
        var users = getAllUsers();
        var user = users[username];
        if (!user) return null;

        var profile = Auth.getUserData('user-profile') || {};
        var avatarColor = AVATAR_COLORS[profile.avatarColor !== undefined ? profile.avatarColor : 0];

        return {
            username: username,
            email: profile.email || user.email || '',
            nickname: profile.nickname || username,
            bio: profile.bio || '',
            avatarColor: avatarColor,
            avatarEmoji: profile.avatarEmoji || '',
            avatarImage: profile.avatarImage || '',
            theme: profile.theme || 'default',
            createdAt: user.createdAt
        };
    };

    /**
     * 获取用户专属数据的 localStorage key
     */
    function getUserDataKey(key) {
        var username = Auth.getCurrentUser();
        if (!username) {
            return key; // 未登录时使用原始 key（游客模式）
        }
        return USER_DATA_PREFIX + username + '_' + key;
    }

    /**
     * 获取用户数据
     */
    Auth.getUserData = function(key) {
        try {
            var data = localStorage.getItem(getUserDataKey(key));
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    };

    /**
     * 设置用户数据
     */
    Auth.setUserData = function(key, value) {
        try {
            localStorage.setItem(getUserDataKey(key), JSON.stringify(value));
        } catch (e) {
            console.error('保存用户数据失败:', e);
        }
    };

    /**
     * 删除用户数据
     */
    Auth.removeUserData = function(key) {
        localStorage.removeItem(getUserDataKey(key));
    };

    /**
     * 将游客数据迁移到当前登录用户
     * 在用户首次登录时调用，将之前游客模式下的数据关联到账号
     */
    Auth.migrateGuestData = function(keys) {
        var username = Auth.getCurrentUser();
        if (!username) return;

        keys.forEach(function(key) {
            var guestData = localStorage.getItem(key);
            var userData = localStorage.getItem(getUserDataKey(key));
            // 仅当用户没有数据但有游客数据时迁移
            if (guestData && !userData) {
                localStorage.setItem(getUserDataKey(key), guestData);
            }
        });
    };

    /**
     * 更新导航栏用户状态
     * 在所有页面调用此函数来更新导航栏的用户入口
     */
    Auth.updateNavUserState = function() {
        try {
        var navUserElements = document.querySelectorAll('.nav-user-area');
        if (navUserElements.length === 0) return;

        var userInfo = null;
        try { userInfo = Auth.getCurrentUserInfo(); } catch (e) { userInfo = null; }

        // avatarColor 为空时使用默认配色，防止 undefined.from 崩溃
        if (userInfo && (!userInfo.avatarColor || !userInfo.avatarColor.from)) {
            userInfo.avatarColor = AVATAR_COLORS[0];
        }
        // nickname 为空时 fallback 到用户名或字符 'U'
        if (userInfo && !userInfo.nickname) {
            userInfo.nickname = userInfo.username || 'U';
        }

        navUserElements.forEach(function(el) {
            if (userInfo) {
                var hasImage = !!userInfo.avatarImage;
                var displayText = userInfo.avatarEmoji || userInfo.nickname.charAt(0).toUpperCase();
                var gradientStyle = 'background: linear-gradient(135deg, ' + userInfo.avatarColor.from + ', ' + userInfo.avatarColor.to + ');';
                var imgStyle = 'background-image:url(' + userInfo.avatarImage + ');background-size:cover;background-position:center;background-repeat:no-repeat;';
                var navAvatarHtml = hasImage
                    ? '<span class="nav-user-avatar nav-user-avatar-img" style="' + imgStyle + '"></span>'
                    : '<span class="nav-user-avatar" style="' + gradientStyle + '">' + escapeHtml(displayText) + '</span>';
                var dropdownAvatarHtml = hasImage
                    ? '<div class="nav-user-info-avatar nav-user-avatar-img" style="' + imgStyle + '"></div>'
                    : '<div class="nav-user-info-avatar" style="' + gradientStyle + '">' + escapeHtml(displayText) + '</div>';
                el.innerHTML =
                    '<div class="nav-user-menu">' +
                        '<button class="nav-user-btn">' +
                            navAvatarHtml +
                            '<span class="nav-user-name">' + escapeHtml(userInfo.nickname) + '</span>' +
                            '<i data-lucide="chevron-down" style="width:14px;height:14px;"></i>' +
                        '</button>' +
                        '<div class="nav-user-dropdown">' +
                            '<div class="nav-user-info">' +
                                dropdownAvatarHtml +
                                '<div>' +
                                    '<div class="nav-user-info-name">' + escapeHtml(userInfo.nickname) + '</div>' +
                                    '<div class="nav-user-info-email">' + escapeHtml(userInfo.email || '未设置邮箱') + '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="nav-user-dropdown-divider"></div>' +
                            '<a href="user-profile.html" class="nav-user-dropdown-item">' +
                                '<i data-lucide="settings"></i>' +
                                '<span>用户中心</span>' +
                            '</a>' +
                            '<button class="nav-user-dropdown-item" id="logoutBtn">' +
                                '<i data-lucide="log-out"></i>' +
                                '<span>退出登录</span>' +
                            '</button>' +
                        '</div>' +
                    '</div>';

                // 下拉菜单交互
                var btn = el.querySelector('.nav-user-btn');
                var dropdown = el.querySelector('.nav-user-dropdown');
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    dropdown.classList.toggle('show');
                });
                document.addEventListener('click', function() {
                    dropdown.classList.remove('show');
                });
                dropdown.addEventListener('click', function(e) {
                    e.stopPropagation();
                });

                // 退出登录
                var logoutBtn = el.querySelector('#logoutBtn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', function() {
                        Auth.logout();
                        Auth.updateNavUserState();
                        if (typeof Auth.onAuthChange === 'function') {
                            Auth.onAuthChange();
                        }
                    });
                }
            } else {
                el.innerHTML =
                    '<button class="nav-login-btn" id="navLoginBtn">' +
                        '<i data-lucide="log-in" style="width:16px;height:16px;"></i>' +
                        '<span>登录</span>' +
                    '</button>' +
                    '<button class="nav-register-btn" id="navRegisterBtn">' +
                        '<i data-lucide="user-plus" style="width:16px;height:16px;"></i>' +
                        '<span>注册</span>' +
                    '</button>';

                var loginBtn = el.querySelector('#navLoginBtn');
                var registerBtn = el.querySelector('#navRegisterBtn');
                if (loginBtn) {
                    loginBtn.addEventListener('click', function() {
                        Auth.openAuthModal('login');
                    });
                }
                if (registerBtn) {
                    registerBtn.addEventListener('click', function() {
                        Auth.openAuthModal('register');
                    });
                }
            }

            // 重新渲染图标
            try {
                if (window.lucide) lucide.createIcons();
            } catch (e) {}
        });
        // 统一注入暗色模式按钮（优先 hero section，回退 nav-user-area）
        try { injectDarkModeToggle(); } catch (e) {}
        } catch (e) {
            // 导航用户区渲染失败静默忽略，不影响主功能
        }
    };

    /**
     * 创建并显示认证模态框
     * @param {string} mode - 'login' | 'register' | 'admin'
     */
    Auth.openAuthModal = function(mode) {
        // 移除已存在的模态框
        var existing = document.getElementById('authModal');
        if (existing) existing.remove();

        // mode 默认 login；'admin' 直接进入管理员登录模式
        if (!mode) mode = 'login';
        var initialMode = (mode === 'admin' || mode === 'register') ? mode : 'login';
        var initialRole = (mode === 'admin') ? 'admin' : 'user';

        var modal = document.createElement('div');
        modal.id = 'authModal';
        modal.className = 'auth-modal';
        modal.innerHTML =
            '<div class="auth-modal-overlay"></div>' +
            '<div class="auth-modal-content">' +
                '<button class="auth-modal-close" id="authCloseBtn">' +
                    '<i data-lucide="x"></i>' +
                '</button>' +
                '<div class="auth-modal-header">' +
                    '<div class="auth-modal-logo" id="authModalLogo">' +
                        '<i data-lucide="wrench"></i>' +
                    '</div>' +
                    '<h3 id="authModalTitle"></h3>' +
                    '<p id="authModalSubtitle"></p>' +
                '</div>' +
                // 角色 Tab（用户 / 管理员）
                '<div class="auth-role-tabs" id="authRoleTabs">' +
                    '<button type="button" class="auth-role-tab ' + (initialRole==='user'?'active':'') + '" data-role="user">' +
                        '<i data-lucide="user" style="width:14px;height:14px;"></i>' +
                        '<span>用户</span>' +
                    '</button>' +
                    '<button type="button" class="auth-role-tab ' + (initialRole==='admin'?'active':'') + '" data-role="admin">' +
                        '<i data-lucide="shield" style="width:14px;height:14px;"></i>' +
                        '<span>管理员</span>' +
                    '</button>' +
                '</div>' +
                '<form id="authForm" class="auth-form">' +
                    '<div class="auth-form-group hidden" id="registerEmailGroup">' +
                        '<label class="auth-form-label">邮箱（选填）</label>' +
                        '<div class="auth-input-wrapper">' +
                            '<i data-lucide="mail" class="auth-input-icon"></i>' +
                            '<input type="email" id="authEmail" class="auth-form-input" placeholder="example@email.com" autocomplete="email">' +
                        '</div>' +
                    '</div>' +
                    '<div class="auth-form-group" id="usernameGroup">' +
                        '<label class="auth-form-label">用户名</label>' +
                        '<div class="auth-input-wrapper">' +
                            '<i data-lucide="user" class="auth-input-icon"></i>' +
                            '<input type="text" id="authUsername" class="auth-form-input" placeholder="输入用户名" autocomplete="username">' +
                        '</div>' +
                    '</div>' +
                    '<div class="auth-form-group">' +
                        '<label class="auth-form-label" id="authPwdLabel">密码</label>' +
                        '<div class="auth-input-wrapper">' +
                            '<i data-lucide="lock" class="auth-input-icon"></i>' +
                            '<input type="password" id="authPassword" class="auth-form-input" placeholder="" autocomplete="current-password">' +
                            '<button type="button" class="auth-password-toggle" id="authPasswordToggle">' +
                                '<i data-lucide="eye"></i>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="auth-error" id="authError"></div>' +
                    '<button type="submit" class="auth-submit-btn" id="authSubmitBtn">' +
                        '<span id="authSubmitText">登 录</span>' +
                        '<div class="auth-loading-spinner hidden" id="authLoading"></div>' +
                    '</button>' +
                '</form>' +
                '<div class="auth-switch" id="authSwitchWrap">' +
                    '<span id="authSwitchText">还没有账号？</span>' +
                    '<button type="button" class="auth-switch-btn" id="authSwitchBtn">立即注册</button>' +
                '</div>' +
                '<div class="auth-notice" id="authNotice">' +
                    '<i data-lucide="shield-check" style="width:14px;height:14px;flex-shrink:0;"></i>' +
                    '<span>密码使用 SHA-256 加密存储于本地浏览器，不上传任何服务器</span>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        // 显示动画
        requestAnimationFrame(function() {
            modal.classList.add('show');
        });

        // 当前状态：role 与 mode（用户模式下才有 login/register 切换）
        var currentRole = initialRole;
        var currentMode = initialRole === 'admin' ? 'admin' : initialMode;

        // 应用初始状态
        Auth._applyAuthState(currentRole, currentMode);

        // 关闭按钮
        modal.querySelector('#authCloseBtn').addEventListener('click', Auth.closeAuthModal);
        modal.querySelector('.auth-modal-overlay').addEventListener('click', Auth.closeAuthModal);

        // ESC 关闭（同一时间只保留一个监听，避免重复打开后泄漏）
        if (window.__authEscHandler) {
            document.removeEventListener('keydown', window.__authEscHandler);
        }
        function escHandler(e) {
            if (e.key === 'Escape') {
                Auth.closeAuthModal();
            }
        }
        window.__authEscHandler = escHandler;
        document.addEventListener('keydown', escHandler);

        // 密码显示/隐藏
        modal.querySelector('#authPasswordToggle').addEventListener('click', function() {
            var input = modal.querySelector('#authPassword');
            var icon = this.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.setAttribute('data-lucide', 'eye-off');
            } else {
                input.type = 'password';
                icon.setAttribute('data-lucide', 'eye');
            }
            if (window.lucide) lucide.createIcons();
        });

        // 角色 Tab 切换
        var roleTabs = modal.querySelectorAll('#authRoleTabs .auth-role-tab');
        for (var t = 0; t < roleTabs.length; t++) {
            roleTabs[t].addEventListener('click', function() {
                var role = this.getAttribute('data-role');
                if (role === currentRole) return;
                currentRole = role;
                currentMode = role === 'admin' ? 'admin' : 'login';
                // 切换激活状态
                for (var j = 0; j < roleTabs.length; j++) roleTabs[j].classList.remove('active');
                this.classList.add('active');
                Auth._applyAuthState(currentRole, currentMode);
            });
        }

        // 登录/注册切换（仅用户模式下生效）
        modal.querySelector('#authSwitchBtn').addEventListener('click', function() {
            if (currentRole === 'admin') return;
            currentMode = currentMode === 'login' ? 'register' : 'login';
            Auth._applyAuthState(currentRole, currentMode);
        });

        // 表单提交
        modal.querySelector('#authForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            await handleAuthSubmit(currentMode);
        });

        // 回车键提交
        var usernameInput = modal.querySelector('#authUsername');
        if (usernameInput) {
            usernameInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    modal.querySelector('#authPassword').focus();
                }
            });
        }
    };

    /**
     * 内部：根据角色 + 模式渲染模态框
     */
    Auth._applyAuthState = function(role, mode) {
        var modal = document.getElementById('authModal');
        if (!modal) return;
        var isAdmin = role === 'admin';
        var title = modal.querySelector('#authModalTitle');
        var subtitle = modal.querySelector('#authModalSubtitle');
        var logo = modal.querySelector('#authModalLogo');
        var emailGroup = modal.querySelector('#registerEmailGroup');
        var usernameGroup = modal.querySelector('#usernameGroup');
        var pwdLabel = modal.querySelector('#authPwdLabel');
        var pwdInput = modal.querySelector('#authPassword');
        var submitText = modal.querySelector('#authSubmitText');
        var switchWrap = modal.querySelector('#authSwitchWrap');
        var switchText = modal.querySelector('#authSwitchText');
        var switchBtn = modal.querySelector('#authSwitchBtn');
        var notice = modal.querySelector('#authNotice');
        var error = modal.querySelector('#authError');
        var usernameInput = modal.querySelector('#authUsername');

        if (isAdmin) {
            var adminFirstRun = !hasAdminPassword();
            logo.style.background = 'linear-gradient(135deg,#6366F1,#8B5CF6)';
            emailGroup.classList.add('hidden');
            usernameGroup.classList.add('hidden');
            usernameInput.required = false;
            switchWrap.classList.add('hidden');
            // 管理员模式关闭浏览器自动填充，避免填入普通账号密码导致登录失败
            pwdInput.setAttribute('autocomplete', 'off');
            if (adminFirstRun) {
                title.textContent = '设置管理员密码';
                subtitle.textContent = '首次使用，请为管理后台设置一个密码';
                pwdLabel.textContent = '新管理员密码';
                pwdInput.placeholder = '至少 8 位，建议包含字母和数字';
                submitText.textContent = '设置并进入后台';
                notice.innerHTML = '<i data-lucide="shield-check" style="width:14px;height:14px;flex-shrink:0;"></i><span>密码仅以哈希形式保存在本机浏览器，请妥善保管</span>';
            } else {
                title.textContent = '管理员登录';
                subtitle.textContent = '输入管理员密码进入后台';
                pwdLabel.textContent = '管理员密码';
                pwdInput.placeholder = '输入管理员密码';
                submitText.textContent = '进入后台';
                notice.innerHTML = '<i data-lucide="lock" style="width:14px;height:14px;flex-shrink:0;"></i><span>仅授权人员可访问管理后台</span>';
            }
        } else {
            pwdInput.setAttribute('autocomplete', 'current-password');
            logo.style.background = '';
            if (mode === 'register') {
                title.textContent = '创建账号';
                subtitle.textContent = '注册以享受全站数据同步';
                emailGroup.classList.remove('hidden');
                usernameGroup.classList.remove('hidden');
                usernameInput.required = true;
                pwdLabel.textContent = '密码';
                pwdInput.placeholder = '至少 6 位';
                submitText.textContent = '注 册';
                switchWrap.classList.remove('hidden');
                switchText.textContent = '已有账号？';
                switchBtn.textContent = '立即登录';
                notice.innerHTML = '<i data-lucide="shield-check" style="width:14px;height:14px;flex-shrink:0;"></i><span>密码使用 SHA-256 加密存储于本地浏览器，不上传任何服务器</span>';
            } else {
                title.textContent = '欢迎回来';
                subtitle.textContent = '登录以同步您的数据';
                emailGroup.classList.add('hidden');
                usernameGroup.classList.remove('hidden');
                usernameInput.required = true;
                pwdLabel.textContent = '密码';
                pwdInput.placeholder = '输入密码';
                submitText.textContent = '登 录';
                switchWrap.classList.remove('hidden');
                switchText.textContent = '还没有账号？';
                switchBtn.textContent = '立即注册';
                notice.innerHTML = '<i data-lucide="shield-check" style="width:14px;height:14px;flex-shrink:0;"></i><span>密码使用 SHA-256 加密存储于本地浏览器，不上传任何服务器</span>';
            }
        }

        error.textContent = '';
        pwdInput.value = '';
        if (isAdmin) {
            pwdInput.focus();
        } else {
            usernameInput.focus();
        }

        if (window.lucide) lucide.createIcons();
    };

    /**
     * 切换登录/注册模式（保留旧 API，只对用户角色生效）
     */
    Auth.switchAuthMode = function(mode) {
        var modal = document.getElementById('authModal');
        if (!modal) return;
        var activeRole = modal.querySelector('.auth-role-tab.active');
        var role = activeRole ? activeRole.getAttribute('data-role') : 'user';
        if (role === 'admin') return;
        Auth._applyAuthState('user', mode);
    };

    /**
     * 关闭认证模态框
     */
    Auth.closeAuthModal = function() {
        var modal = document.getElementById('authModal');
        if (!modal) return;
        // 关闭时清理 ESC 监听，避免泄漏
        if (window.__authEscHandler) {
            document.removeEventListener('keydown', window.__authEscHandler);
            window.__authEscHandler = null;
        }
        modal.classList.remove('show');
        setTimeout(function() {
            modal.remove();
        }, 250);
    };

    /**
     * 处理表单提交
     */
    async function handleAuthSubmit(mode) {
        var modal = document.getElementById('authModal');
        if (!modal) return;

        var usernameEl = modal.querySelector('#authUsername');
        var password = modal.querySelector('#authPassword').value;
        var emailEl = modal.querySelector('#authEmail');
        var username = usernameEl ? usernameEl.value.trim() : '';
        var email = emailEl ? emailEl.value.trim() : '';
        var errorEl = modal.querySelector('#authError');
        var submitBtn = modal.querySelector('#authSubmitBtn');
        var submitText = modal.querySelector('#authSubmitText');
        var loading = modal.querySelector('#authLoading');

        errorEl.textContent = '';
        submitBtn.disabled = true;
        submitText.classList.add('hidden');
        loading.classList.remove('hidden');

        try {
            var result;
            if (mode === 'admin') {
                if (!hasAdminPassword()) {
                    result = await Auth.setAdminPassword(password);
                } else {
                    result = await Auth.adminLogin(password);
                }
            } else if (mode === 'login') {
                result = await Auth.login(username, password);
            } else {
                result = await Auth.register(username, password, email);
            }

            if (result.success) {
                if (mode === 'admin') {
                    Auth.closeAuthModal();
                    // 管理员登录成功后跳转到后台页
                    var adminUrl = 'admin.html';
                    var path = window.location.pathname.split('/').pop();
                    if (path && path.toLowerCase() !== adminUrl.toLowerCase()) {
                        window.location.href = adminUrl;
                    } else {
                        // 已经在 admin.html，手动触发进入后台
                        if (typeof enterAdmin === 'function') enterAdmin();
                    }
                } else {
                    // 迁移游客数据
                    if (mode === 'login') {
                        Auth.migrateGuestData([
                            'ai-chat-settings',
                            'ai-chat-history',
                            'ai-chat-current'
                        ]);
                    }

                    Auth.closeAuthModal();
                    Auth.updateNavUserState();

                    // 触发认证状态变化回调
                    if (typeof Auth.onAuthChange === 'function') {
                        Auth.onAuthChange();
                    }
                }
            } else {
                errorEl.textContent = result.message;
            }
        } catch (err) {
            errorEl.textContent = '操作失败，请重试';
            console.error(err);
        } finally {
            submitBtn.disabled = false;
            submitText.classList.remove('hidden');
            loading.classList.add('hidden');
        }
    }

    /**
     * HTML 转义
     */
    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== 管理员后台 API =====

    var ADMIN_PWD_KEY = 'toolbox_admin_pwd';
    var ADMIN_SESSION_KEY = 'toolbox_admin_session';
    var ANNOUNCEMENT_KEY = 'toolbox_announcement';
    var FEEDBACKS_KEY = 'toolbox_feedbacks';
    var TOOL_USAGE_KEY = 'toolbox_tool_usage';
    var ANNOUNCEMENT_READ_KEY = 'toolbox_ann_read';
    var ADMIN_FAIL_KEY = 'toolbox_admin_fail';
    var ADMIN_LOCK_KEY = 'toolbox_admin_lock';
    var MAX_FAIL = 5;
    var LOCK_MS = 5 * 60 * 1000; // 连续失败 5 次锁定 5 分钟

    function isSha256Hash(v) {
        return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
    }

    /**
     * 获取管理员密码哈希（未设置过则返回 null）
     */
    function getAdminPwdHash() {
        var stored = localStorage.getItem(ADMIN_PWD_KEY);
        if (isSha256Hash(stored)) return stored;
        return null;
    }

    /**
     * 是否已设置过管理员密码
     */
    function hasAdminPassword() {
        return getAdminPwdHash() !== null;
    }

    /**
     * 兼容迁移：旧版本把修改后的密码明文存在本地，这里一次性迁移为加盐哈希
     */
    function migrateOldAdminPwd() {
        try {
            var oldVal = localStorage.getItem(ADMIN_PWD_KEY);
            if (oldVal && !isSha256Hash(oldVal)) {
                hashPassword(oldVal).then(function(h) {
                    localStorage.setItem(ADMIN_PWD_KEY, h);
                });
            }
        } catch (e) {}
    }

    function genSessionToken() {
        var arr = new Uint8Array(24);
        crypto.getRandomValues(arr);
        return Array.prototype.map.call(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    }

    function getAdminLockRemain() {
        var lockAt = Number(localStorage.getItem(ADMIN_LOCK_KEY) || 0);
        return lockAt > Date.now() ? lockAt - Date.now() : 0;
    }

    /**
     * 管理员登录（异步，加盐哈希比对 + 防暴力破解）
     */
    Auth.adminLogin = async function(password) {
        var remain = getAdminLockRemain();
        if (remain > 0) {
            return { success: false, message: '尝试次数过多，请 ' + Math.ceil(remain / 1000) + ' 秒后重试' };
        }
        if (!hasAdminPassword()) {
            return { success: false, message: '首次使用，请先设置管理员密码' };
        }
        if (!password) {
            return { success: false, message: '请输入管理员密码' };
        }
        var hash = await hashPassword(password);
        if (hash === getAdminPwdHash()) {
            sessionStorage.removeItem(ADMIN_FAIL_KEY);
            localStorage.removeItem(ADMIN_LOCK_KEY);
            sessionStorage.setItem(ADMIN_SESSION_KEY, genSessionToken());
            return { success: true, message: '登录成功' };
        }
        // 失败计数，达到上限锁定
        var fails = Number(sessionStorage.getItem(ADMIN_FAIL_KEY) || 0) + 1;
        if (fails >= MAX_FAIL) {
            sessionStorage.removeItem(ADMIN_FAIL_KEY);
            localStorage.setItem(ADMIN_LOCK_KEY, String(Date.now() + LOCK_MS));
            return { success: false, message: '尝试次数过多，后台已锁定 5 分钟' };
        }
        sessionStorage.setItem(ADMIN_FAIL_KEY, String(fails));
        return { success: false, message: '密码错误，还可尝试 ' + (MAX_FAIL - fails) + ' 次' };
    };

    /**
     * 检查管理员是否已登录
     */
    Auth.isAdminLoggedIn = function() {
        return !!sessionStorage.getItem(ADMIN_SESSION_KEY);
    };

    /**
     * 管理员登出
     */
    Auth.adminLogout = function() {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
    };

    /**
     * 首次设置管理员密码（未设置过时调用，成功后自动登录）
     */
    Auth.setAdminPassword = async function(newPwd) {
        if (hasAdminPassword()) {
            return { success: false, message: '管理员密码已设置，请直接登录' };
        }
        if (!newPwd || newPwd.length < 8) {
            return { success: false, message: '密码至少 8 位，建议包含字母和数字' };
        }
        var newHash = await hashPassword(newPwd);
        localStorage.setItem(ADMIN_PWD_KEY, newHash);
        sessionStorage.removeItem(ADMIN_FAIL_KEY);
        localStorage.removeItem(ADMIN_LOCK_KEY);
        sessionStorage.setItem(ADMIN_SESSION_KEY, genSessionToken());
        return { success: true, message: '设置成功' };
    };

    /**
     * 修改管理员密码（异步，哈希存储）
     */
    Auth.changeAdminPassword = async function(oldPwd, newPwd) {
        if (!newPwd || newPwd.length < 8) {
            return { success: false, message: '新密码至少 8 位，建议包含字母和数字' };
        }
        if (!hasAdminPassword()) {
            return Auth.setAdminPassword(newPwd);
        }
        var oldHash = await hashPassword(oldPwd);
        if (oldHash !== getAdminPwdHash()) {
            return { success: false, message: '原密码错误' };
        }
        var newHash = await hashPassword(newPwd);
        localStorage.setItem(ADMIN_PWD_KEY, newHash);
        return { success: true, message: '修改成功' };
    };

    migrateOldAdminPwd();

    // ----- 用户管理 -----

    /**
     * 获取所有用户列表（不含密码）
     */
    Auth.getAllUsersInfo = function() {
        var users = getAllUsers();
        var list = [];
        for (var name in users) {
            if (!users.hasOwnProperty(name)) continue;
            list.push({
                username: name,
                email: users[name].email || '',
                createdAt: users[name].createdAt || 0,
                createdAtStr: users[name].createdAt ? new Date(users[name].createdAt).toLocaleString('zh-CN') : '-'
            });
        }
        list.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        return list;
    };

    /**
     * 删除用户（含其所有数据）
     */
    Auth.deleteUser = function(username) {
        var users = getAllUsers();
        if (!users[username]) return { success: false, message: '用户不存在' };
        delete users[username];
        saveAllUsers(users);
        // 清除该用户的所有数据
        var prefix = USER_DATA_PREFIX + username + '_';
        var toRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf(prefix) === 0) toRemove.push(key);
        }
        toRemove.forEach(function(k) { localStorage.removeItem(k); });
        if (Auth.getCurrentUser() === username) Auth.logout();
        return { success: true, message: '已删除用户 ' + username };
    };

    /**
     * 重置用户密码
     */
    Auth.resetUserPassword = async function(username, newPwd) {
        var users = getAllUsers();
        if (!users[username]) return { success: false, message: '用户不存在' };
        if (!newPwd || newPwd.length < 6) return { success: false, message: '密码至少 6 位' };
        users[username].password = await hashPassword(newPwd);
        saveAllUsers(users);
        return { success: true, message: '密码已重置为 ' + newPwd };
    };

    // ----- 站点公告 -----

    /**
     * 获取公告
     */
    Auth.getAnnouncement = function() {
        try {
            var data = localStorage.getItem(ANNOUNCEMENT_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) { return null; }
    };

    /**
     * 保存公告
     */
    Auth.setAnnouncement = function(announcement) {
        var ann = {
            id: Date.now(),
            title: announcement.title || '站点公告',
            content: announcement.content || '',
            active: announcement.active !== false,
            updatedAt: Date.now()
        };
        localStorage.setItem(ANNOUNCEMENT_KEY, JSON.stringify(ann));
        // 公告更新后重置已读标记，让所有用户重新看到
        localStorage.removeItem(ANNOUNCEMENT_READ_KEY);
        return { success: true, message: '公告已保存' };
    };

    /**
     * 删除公告
     */
    Auth.deleteAnnouncement = function() {
        localStorage.removeItem(ANNOUNCEMENT_KEY);
        localStorage.removeItem(ANNOUNCEMENT_READ_KEY);
        return { success: true, message: '公告已删除' };
    };

    /**
     * 检查并标记公告已读（普通用户调用）
     */
    Auth.markAnnouncementRead = function(annId) {
        try {
            var readList = JSON.parse(localStorage.getItem(ANNOUNCEMENT_READ_KEY) || '{}');
            var username = Auth.getCurrentUser() || '__guest__';
            readList[username] = annId;
            localStorage.setItem(ANNOUNCEMENT_READ_KEY, JSON.stringify(readList));
        } catch (e) {}
    };

    /**
     * 判断当前用户是否需要看到公告弹窗
     */
    Auth.shouldShowAnnouncement = function() {
        var ann = Auth.getAnnouncement();
        if (!ann || !ann.active || !ann.content) return null;
        try {
            var readList = JSON.parse(localStorage.getItem(ANNOUNCEMENT_READ_KEY) || '{}');
            var username = Auth.getCurrentUser() || '__guest__';
            if (readList[username] === ann.id) return null;
            return ann;
        } catch (e) { return ann; }
    };

    // ----- 反馈管理 -----

    /**
     * 提交反馈（普通用户调用）
     */
    Auth.submitFeedback = function(feedback) {
        try {
            var list = [];
            try { list = JSON.parse(localStorage.getItem(FEEDBACKS_KEY) || '[]'); } catch (e) {}
            var item = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                username: Auth.getCurrentUser() || '游客',
                category: feedback.category || '建议',
                content: feedback.content || '',
                contact: feedback.contact || '',
                createdAt: Date.now(),
                createdAtStr: new Date().toLocaleString('zh-CN'),
                status: 'pending' // pending / read
            };
            list.unshift(item);
            localStorage.setItem(FEEDBACKS_KEY, JSON.stringify(list));
            return { success: true, message: '反馈已提交，感谢您的支持！' };
        } catch (e) {
            return { success: false, message: '提交失败，请稍后再试' };
        }
    };

    /**
     * 获取所有反馈
     */
    Auth.getAllFeedbacks = function() {
        try {
            return JSON.parse(localStorage.getItem(FEEDBACKS_KEY) || '[]');
        } catch (e) { return []; }
    };

    /**
     * 删除反馈
     */
    Auth.deleteFeedback = function(id) {
        try {
            var list = Auth.getAllFeedbacks();
            list = list.filter(function(f) { return f.id !== id; });
            localStorage.setItem(FEEDBACKS_KEY, JSON.stringify(list));
            return { success: true, message: '已删除' };
        } catch (e) {
            return { success: false, message: '删除失败' };
        }
    };

    /**
     * 标记反馈已读
     */
    Auth.markFeedbackRead = function(id) {
        try {
            var list = Auth.getAllFeedbacks();
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id) { list[i].status = 'read'; break; }
            }
            localStorage.setItem(FEEDBACKS_KEY, JSON.stringify(list));
        } catch (e) {}
    };

    // ----- 数据统计 -----

    /**
     * 记录工具使用（各工具页面调用）
     */
    Auth.recordToolUsage = function(toolName) {
        try {
            var stats = {};
            try { stats = JSON.parse(localStorage.getItem(TOOL_USAGE_KEY) || '{}'); } catch (e) {}
            stats[toolName] = (stats[toolName] || 0) + 1;
            stats['__total__'] = (stats['__total__'] || 0) + 1;
            localStorage.setItem(TOOL_USAGE_KEY, JSON.stringify(stats));
        } catch (e) {}
    };

    /**
     * 获取统计数据
     */
    Auth.getStats = function() {
        var users = getAllUsers();
        var userCount = Object.keys(users).length;
        var feedbackCount = Auth.getAllFeedbacks().length;
        var usage = {};
        try { usage = JSON.parse(localStorage.getItem(TOOL_USAGE_KEY) || '{}'); } catch (e) {}
        var totalUsage = usage['__total__'] || 0;
        delete usage['__total__'];
        // 按使用次数排序
        var usageList = [];
        for (var name in usage) {
            if (usage.hasOwnProperty(name)) usageList.push({ name: name, count: usage[name] });
        }
        usageList.sort(function(a, b) { return b.count - a.count; });
        // 最近注册用户
        var recentUsers = [];
        for (var uname in users) {
            if (users.hasOwnProperty(uname)) {
                recentUsers.push({ username: uname, createdAt: users[uname].createdAt || 0 });
            }
        }
        recentUsers.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        recentUsers = recentUsers.slice(0, 5);
        return {
            userCount: userCount,
            feedbackCount: feedbackCount,
            totalUsage: totalUsage,
            usageList: usageList,
            recentUsers: recentUsers,
            hasAnnouncement: !!Auth.getAnnouncement()
        };
    };

    // ===== 工具评分系统 =====
    var RATING_KEY = 'toolbox_ratings';

    function getRatings() {
        try { return JSON.parse(localStorage.getItem(RATING_KEY)) || {}; }
        catch (e) { return {}; }
    }

    function saveRatings(data) {
        localStorage.setItem(RATING_KEY, JSON.stringify(data));
    }

    function getToolName() {
        var path = window.location.pathname;
        var file = path.substring(path.lastIndexOf('/') + 1);
        // 排除非工具页面
        var exclude = ['index.html', 'about-us.html', 'admin.html', 'user-profile.html', 'forum.html', ''];
        for (var i = 0; i < exclude.length; i++) {
            if (file === exclude[i]) return null;
        }
        return file;
    }

    /**
     * 全站工具目录：用于相关推荐、热门统计与 SEO
     * cat: pdf / image / dev / ai / util / text / other
     */
    var TOOL_CATALOG = [
        { href: 'pdf-to-word.html', title: 'PDF转Word', cat: 'pdf', icon: 'file-text' },
        { href: 'pdf-compress.html', title: 'PDF压缩', cat: 'pdf', icon: 'file-archive' },
        { href: 'pdf-merge.html', title: 'PDF合并拆分', cat: 'pdf', icon: 'combine' },
        { href: 'pdf-to-image.html', title: 'PDF转图片', cat: 'pdf', icon: 'image-down' },
        { href: 'word-to-pdf.html', title: 'Word转PDF', cat: 'pdf', icon: 'file-text' },
        { href: 'image-compress.html', title: '图片压缩', cat: 'image', icon: 'image-down' },
        { href: 'file-converter.html', title: '文件格式转换', cat: 'image', icon: 'repeat' },
        { href: 'ocr.html', title: '图片转文字OCR', cat: 'image', icon: 'scan-text' },
        { href: 'image-convert.html', title: '图片格式转换', cat: 'image', icon: 'refresh-cw' },
        { href: 'image-edit.html', title: '图片裁剪水印', cat: 'image', icon: 'crop' },
        { href: 'image-bg-remover.html', title: '在线抠图', cat: 'image', icon: 'wand-2' },
        { href: 'gif-maker.html', title: 'GIF制作', cat: 'image', icon: 'clapperboard' },
        { href: 'meme-maker.html', title: '表情包制作', cat: 'image', icon: 'smile' },
        { href: 'nine-grid.html', title: '九宫格切图', cat: 'image', icon: 'grid-3x3' },
        { href: 'image-line-art.html', title: '识图提取线稿', cat: 'image', icon: 'pen-tool' },
        { href: 'base64-image.html', title: 'Base64图片互转', cat: 'image', icon: 'image' },
        { href: 'color-picker.html', title: '颜色选择器', cat: 'dev', icon: 'pipette' },
        { href: 'json-formatter.html', title: 'JSON格式化', cat: 'dev', icon: 'braces' },
        { href: 'git-search.html', title: 'Git搜索', cat: 'dev', icon: 'git-branch' },
        { href: 'markdown-editor.html', title: 'Markdown编辑器', cat: 'dev', icon: 'file-edit' },
        { href: 'dev-tools.html', title: '开发者工具箱', cat: 'dev', icon: 'terminal' },
        { href: 'speed-test.html', title: '网络测速', cat: 'dev', icon: 'gauge' },
        { href: 'ip-query.html', title: 'IP归属地查询', cat: 'dev', icon: 'globe' },
        { href: 'css-gradient.html', title: 'CSS渐变生成器', cat: 'dev', icon: 'palette' },
        { href: 'diff-tool.html', title: '文本差异对比', cat: 'dev', icon: 'diff' },
        { href: 'regex-tester.html', title: '正则表达式测试', cat: 'dev', icon: 'regex' },
        { href: 'code-formatter.html', title: '代码格式化', cat: 'dev', icon: 'code-2' },
        { href: 'jwt-decoder.html', title: 'JWT解码', cat: 'dev', icon: 'key' },
        { href: 'data-converter.html', title: '数据格式转换', cat: 'dev', icon: 'database' },
        { href: 'text-converter.html', title: '文本编解码', cat: 'dev', icon: 'binary' },
        { href: 'http-status.html', title: 'HTTP状态码', cat: 'dev', icon: 'server' },
        { href: 'cron-parser.html', title: 'Cron表达式解析', cat: 'dev', icon: 'timer' },
        { href: 'uuid-generator.html', title: 'UUID生成器', cat: 'dev', icon: 'fingerprint' },
        { href: 'contrast-checker.html', title: '颜色对比度检查', cat: 'dev', icon: 'contrast' },
        { href: 'ai-chat.html', title: 'AI对话助手', cat: 'ai', icon: 'bot' },
        { href: 'qr-generator.html', title: '二维码生成', cat: 'util', icon: 'qrcode' },
        { href: 'user-profile.html', title: '个人中心', cat: 'util', icon: 'user' },
        { href: 'pomodoro.html', title: '番茄钟', cat: 'util', icon: 'timer' },
        { href: 'unit-converter.html', title: '单位换算', cat: 'util', icon: 'scale' },
        { href: 'date-calculator.html', title: '日期计算器', cat: 'util', icon: 'calendar' },
        { href: 'random-picker.html', title: '随机工具', cat: 'util', icon: 'shuffle' },
        { href: 'bmi-calculator.html', title: 'BMI计算器', cat: 'util', icon: 'heart-pulse' },
        { href: 'excel-tools.html', title: 'Excel工具箱', cat: 'util', icon: 'table' },
        { href: 'mortgage-calculator.html', title: '房贷计算器', cat: 'util', icon: 'calculator' },
        { href: 'currency-converter.html', title: '汇率换算', cat: 'util', icon: 'coins' },
        { href: 'reader.html', title: '网页阅读器', cat: 'text', icon: 'book-open' },
        { href: 'notepad.html', title: '在线记事本', cat: 'text', icon: 'notebook-pen' },
        { href: 'text-to-speech.html', title: '文字转语音', cat: 'text', icon: 'volume-2' },
        { href: 'text-tools.html', title: '文字工具箱', cat: 'text', icon: 'type' },
        { href: 'forum.html', title: '在线论坛', cat: 'other', icon: 'messages-square' },
        { href: 'audio-recorder.html', title: '在线录音', cat: 'other', icon: 'mic' },
        { href: 'video-tools.html', title: '视频工具箱', cat: 'other', icon: 'video' },
        { href: 'translate.html', title: '在线翻译', cat: 'text', icon: 'languages' },
        { href: 'id-card-parser.html', title: '身份证解析', cat: 'util', icon: 'id-card' },
        { href: 'phone-lookup.html', title: '手机号归属地', cat: 'util', icon: 'smartphone' },
        { href: 'qr-decoder.html', title: '二维码解码', cat: 'image', icon: 'qr-code' },
        { href: 'exif-viewer.html', title: '图片EXIF查看', cat: 'image', icon: 'camera' },
        { href: 'image-stitch.html', title: '长图拼接', cat: 'image', icon: 'images' },
        { href: 'rmb-uppercase.html', title: '人民币大写', cat: 'util', icon: 'banknote' },
        { href: 'world-clock.html', title: '世界时钟', cat: 'util', icon: 'globe-2' },
        { href: 'calendar.html', title: '日历节假日', cat: 'util', icon: 'calendar-days' },
        { href: 'screen-recorder.html', title: '屏幕录制', cat: 'other', icon: 'monitor-play' },
        { href: 'timer.html', title: '倒计时闹钟', cat: 'util', icon: 'timer' }
    ];

    /**
     * 工具访问量统计（localStorage，无需登录）
     */
    var VIEW_KEY = 'toolbox_tool_views';
    Auth.trackToolView = function(toolId) {
        try {
            var views = {};
            try { views = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); } catch (e) {}
            views[toolId] = (views[toolId] || 0) + 1;
            localStorage.setItem(VIEW_KEY, JSON.stringify(views));
        } catch (e) {}
    };
    Auth.getToolViews = function() {
        try { return JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); } catch (e) { return {}; }
    };
    Auth.getHotTools = function(limit) {
        limit = limit || 6;
        var views = Auth.getToolViews();
        var arr = [];
        for (var k in views) {
            if (!views.hasOwnProperty(k)) continue;
            arr.push({ href: k, views: views[k] });
        }
        arr.sort(function(a, b) { return b.views - a.views; });
        return arr.slice(0, limit);
    };

    /**
     * 获取相关工具推荐（同分类，排除自身）
     */
    Auth.getRelatedTools = function(toolId, limit) {
        limit = limit || 3;
        var cur = null;
        for (var i = 0; i < TOOL_CATALOG.length; i++) {
            if (TOOL_CATALOG[i].href === toolId) { cur = TOOL_CATALOG[i]; break; }
        }
        if (!cur) return [];
        var related = TOOL_CATALOG.filter(function(t) {
            return t.cat === cur.cat && t.href !== cur.href;
        });
        // 简单洗牌取前 N 个，保证每次略有变化
        for (var j = related.length - 1; j > 0; j--) {
            var r = Math.floor(Math.random() * (j + 1));
            var tmp = related[j]; related[j] = related[r]; related[r] = tmp;
        }
        return related.slice(0, limit);
    };

    function getCurrentRater() {
        var u = localStorage.getItem('toolbox_current_user');
        return u || 'guest';
    }

    Auth.getRating = function(toolName) {
        var data = getRatings();
        if (!data[toolName]) return { avg: 0, count: 0, userRating: 0 };
        var entries = data[toolName].entries || {};
        var keys = Object.keys(entries);
        var sum = 0, count = 0;
        for (var i = 0; i < keys.length; i++) {
            sum += entries[keys[i]];
            count++;
        }
        var userRating = entries[getCurrentRater()] || 0;
        return { avg: count > 0 ? (sum / count) : 0, count: count, userRating: userRating };
    };

    Auth.setRating = function(toolName, score) {
        var data = getRatings();
        if (!data[toolName]) data[toolName] = { entries: {} };
        data[toolName].entries[getCurrentRater()] = score;
        saveRatings(data);
        return Auth.getRating(toolName);
    };

    /**
     * 自动在工具页面底部注入评分组件
     */
    function injectRatingWidget() {
        var toolName = getToolName();
        if (!toolName) return; // 非工具页面不注入

        var main = document.querySelector('main');
        if (!main) return;

        // 检查是否已注入
        if (document.querySelector('.tool-rating-widget')) return;

        var rating = Auth.getRating(toolName);
        var container = document.createElement('section');
        container.className = 'tool-rating-widget';
        container.innerHTML =
            '<div class="tool-rating-card">' +
                '<div class="tool-rating-icon"><i data-lucide="star"></i></div>' +
                '<div class="tool-rating-info">' +
                    '<h3>给这个工具评分</h3>' +
                    '<p>你的反馈帮助我们改进</p>' +
                '</div>' +
                '<div class="tool-rating-stars" id="ratingStars">' +
                    '<button class="rating-star-btn" data-score="1" onclick="Auth.rateTool(1)"><i data-lucide="star"></i></button>' +
                    '<button class="rating-star-btn" data-score="2" onclick="Auth.rateTool(2)"><i data-lucide="star"></i></button>' +
                    '<button class="rating-star-btn" data-score="3" onclick="Auth.rateTool(3)"><i data-lucide="star"></i></button>' +
                    '<button class="rating-star-btn" data-score="4" onclick="Auth.rateTool(4)"><i data-lucide="star"></i></button>' +
                    '<button class="rating-star-btn" data-score="5" onclick="Auth.rateTool(5)"><i data-lucide="star"></i></button>' +
                '</div>' +
                '<div class="tool-rating-result">' +
                    '<span class="tool-rating-avg" id="ratingAvg">' + rating.avg.toFixed(1) + '</span>' +
                    '<span class="tool-rating-count" id="ratingCount">' + rating.count + ' 人评价</span>' +
                '</div>' +
            '</div>';

        main.appendChild(container);
        if (window.lucide) lucide.createIcons();
        updateStarDisplay(rating.userRating);
    }

    function updateStarDisplay(score) {
        var btns = document.querySelectorAll('.rating-star-btn');
        for (var i = 0; i < btns.length; i++) {
            var s = parseInt(btns[i].getAttribute('data-score'));
            if (s <= score) {
                btns[i].classList.add('active');
            } else {
                btns[i].classList.remove('active');
            }
        }
    }

    Auth.rateTool = function(score) {
        var toolName = getToolName();
        if (!toolName) return;
        var rating = Auth.setRating(toolName, score);
        updateStarDisplay(score);
        var avgEl = document.getElementById('ratingAvg');
        var countEl = document.getElementById('ratingCount');
        if (avgEl) avgEl.textContent = rating.avg.toFixed(1);
        if (countEl) countEl.textContent = rating.count + ' 人评价';
        // toast 提示
        if (typeof Auth.showToast === 'function') {
            Auth.showToast('感谢你的评分！', 'success');
        }
    };

    /**
     * 初始化 - 在 DOMContentLoaded 时更新导航栏
     */
    function init() {
        // 立即应用暗色模式（避免页面闪烁）——独立 try-catch，失败不影响后续
        try { Auth.initDarkMode(); } catch (e) {}
        try {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    try { Auth.updateNavUserState(); } catch (e) {}
                    try { injectDarkModeToggle(); } catch (e) {}
                    try { injectMobileNavToggle(); } catch (e) {}
                    try { injectRatingWidget(); } catch (e) {}
                    try { injectSeoMeta(); } catch (e) {}
                    try { injectBackToTop(); } catch (e) {}
                    try { injectShareButton(); } catch (e) {}
                    try { injectFeedbackButton(); } catch (e) {}
                    try { injectPrintButton(); } catch (e) {}
                    try { injectFontSizeButton(); } catch (e) {}
                    try { injectRelatedTools(); } catch (e) {}
                    try { injectHotTools(); } catch (e) {}
                    try { if (getToolName()) Auth.trackToolView(getToolName()); } catch (e) {}
                    try { injectGlobalTranslate(); } catch (e) {}
                    try { injectNavLink(); } catch (e) {}
                    try { registerServiceWorker(); } catch (e) {}
                });
            } else {
                Auth.updateNavUserState();
                injectDarkModeToggle();
                injectMobileNavToggle();
                injectRatingWidget();
                try { injectSeoMeta(); } catch (e) {}
                try { injectBackToTop(); } catch (e) {}
                try { injectShareButton(); } catch (e) {}
                try { injectFeedbackButton(); } catch (e) {}
                try { injectPrintButton(); } catch (e) {}
                try { injectFontSizeButton(); } catch (e) {}
                try { injectRelatedTools(); } catch (e) {}
                try { injectHotTools(); } catch (e) {}
                try { if (getToolName()) Auth.trackToolView(getToolName()); } catch (e) {}
                try { injectGlobalTranslate(); } catch (e) {}
                try { injectNavLink(); } catch (e) {}
                try { registerServiceWorker(); } catch (e) {}
            }
        } catch (e) {
            // 静默忽略初始化错误，保证页面其他功能不受影响
        }
    }

    /**
     * 注册 Service Worker 并注入 PWA manifest，启用离线缓存与"安装到桌面"能力
     */
    function registerServiceWorker() {
        // 注入 manifest（若尚未存在）
        try {
            if (!document.querySelector('link[rel="manifest"]')) {
                var manifestLink = document.createElement('link');
                manifestLink.rel = 'manifest';
                manifestLink.href = 'manifest.json';
                document.head.appendChild(manifestLink);
            }
        } catch (e) {}
        // 注册 Service Worker（需 HTTPS 或 localhost 环境）
        try {
            if (!('serviceWorker' in navigator)) return;
            if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('sw.js').catch(function() {});
            });
        } catch (e) {}
    }

    /**
     * 创建桌面快捷方式（PWA 安装）
     * - Chrome / Edge：触发浏览器原生"安装应用"弹窗
     * - Safari / 其他：引导用户通过浏览器菜单手动添加
     */
    Auth.createDesktopShortcut = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();

        if (deferredInstallPrompt) {
            var prompt = deferredInstallPrompt;
            deferredInstallPrompt = null;
            prompt.prompt();
            prompt.userChoice.then(function(choice) {
                if (choice && choice.outcome === 'accepted') {
                    if (typeof Auth.showToast === 'function') {
                        Auth.showToast('已创建桌面快捷方式', 'success');
                    }
                }
            }).catch(function() {});
            return true;
        }

        // 无原生安装事件时给出手动引导
        var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        var msg = isIOS
            ? '请在 Safari 中点击分享按钮，选择"添加到主屏幕"'
            : '请点击浏览器地址栏右侧的安装图标，或通过菜单选择"安装/添加到主屏幕"';
        if (typeof Auth.showToast === 'function') {
            Auth.showToast(msg, 'info');
        }
        return false;
    };

    /**
     * 弹出"下载客户端"二维码弹窗
     * 点击后展示指向官网的二维码，扫码跳转；若客户端未开发则显示提示小字
     */
    Auth.showDownloadClient = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        // 已存在则直接显示
        var existing = document.getElementById('tbClientModal');
        if (existing) {
            existing.classList.add('show');
            return;
        }
        // 注入弹窗样式
        if (!document.getElementById('tb-client-styles')) {
            var st = document.createElement('style');
            st.id = 'tb-client-styles';
            st.textContent =
                '.tb-client-overlay{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.55);' +
                'display:none;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px);}' +
                '.tb-client-overlay.show{display:flex;animation:tbFadeIn .2s ease;}' +
                '.tb-client-modal{width:100%;max-width:340px;background:var(--bg-card);border-radius:20px;' +
                'padding:1.75rem 1.5rem 1.5rem;box-shadow:var(--shadow-xl);text-align:center;position:relative;' +
                'animation:tbFadeIn .25s ease;}' +
                '.tb-client-close{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;' +
                'border:none;background:var(--bg);color:var(--text-secondary);display:flex;align-items:center;' +
                'justify-content:center;cursor:pointer;transition:all .2s;}' +
                '.tb-client-close:hover{background:var(--border);color:var(--text);}' +
                '.tb-client-close i{width:16px;height:16px;}' +
                '.tb-client-icon{width:56px;height:56px;border-radius:16px;margin:0 auto .75rem;' +
                'background:linear-gradient(135deg,#1D4ED8,#0284C7);color:#fff;display:flex;align-items:center;' +
                'justify-content:center;box-shadow:0 8px 20px rgba(29,78,216,.25);}' +
                '.tb-client-icon i{width:28px;height:28px;}' +
                '.tb-client-modal h3{font-size:1.15rem;margin:0 0 .25rem;color:var(--text);}' +
                '.tb-client-modal .tb-client-sub{color:var(--text-secondary);font-size:.8rem;margin-bottom:1.1rem;}' +
                '.tb-client-qr{width:180px;height:180px;margin:0 auto 1rem;padding:.6rem;background:#fff;' +
                'border:1px solid var(--border);border-radius:14px;display:flex;align-items:center;justify-content:center;}' +
                '.tb-client-qr canvas{display:block;width:100%;height:100%;}' +
                '.tb-client-hint{font-size:.78rem;color:var(--text-secondary);line-height:1.6;' +
                'background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:.5rem .75rem;}' +
                '.tb-client-loading{font-size:.85rem;color:var(--text-secondary);}';
            document.head.appendChild(st);
        }
        // 构建弹窗 DOM
        var overlay = document.createElement('div');
        overlay.className = 'tb-client-overlay';
        overlay.id = 'tbClientModal';
        overlay.innerHTML =
            '<div class="tb-client-modal">' +
                '<button type="button" class="tb-client-close" title="关闭"><i data-lucide="x"></i></button>' +
                '<div class="tb-client-icon"><i data-lucide="download"></i></div>' +
                '<h3>下载客户端</h3>' +
                '<p class="tb-client-sub">手机扫码即可访问官网</p>' +
                '<div class="tb-client-qr"><span class="tb-client-loading">二维码加载中…</span></div>' +
                '<p class="tb-client-hint">客户端暂时未开发，看看其他页面吧</p>' +
            '</div>';
        document.body.appendChild(overlay);
        if (window.lucide) lucide.createIcons();

        // 关闭：按钮 / 遮罩点击 / ESC
        overlay.addEventListener('click', function(ev) {
            if (ev.target === overlay) overlay.classList.remove('show');
        });
        overlay.querySelector('.tb-client-close').addEventListener('click', function() {
            overlay.classList.remove('show');
        });
        document.addEventListener('keydown', function esc(ev) {
            if (ev.key === 'Escape' && overlay.classList.contains('show')) {
                overlay.classList.remove('show');
            }
        });

        // 渲染二维码（指向官网）
        var target = 'https://gitglow123.netlify.app';
        var qrBox = overlay.querySelector('.tb-client-qr');
        function renderQR() {
            try {
                var qr = qrcode(0, 'M');
                qr.addData(target);
                qr.make();
                var cellSize = 4;
                var margin = 2;
                var moduleCount = qr.getModuleCount();
                var totalSize = cellSize * moduleCount + margin * 2;
                var canvas = document.createElement('canvas');
                canvas.width = totalSize;
                canvas.height = totalSize;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, totalSize, totalSize);
                ctx.fillStyle = '#0F172A';
                for (var row = 0; row < moduleCount; row++) {
                    for (var col = 0; col < moduleCount; col++) {
                        if (qr.isDark(row, col)) {
                            ctx.fillRect(margin + col * cellSize, margin + row * cellSize, cellSize, cellSize);
                        }
                    }
                }
                qrBox.innerHTML = '';
                qrBox.appendChild(canvas);
            } catch (err) {
                qrBox.innerHTML = '<a href="' + target + '" target="_blank" rel="noopener" class="tb-client-loading" style="color:var(--primary);">二维码加载失败，点击直接访问官网</a>';
            }
        }
        // 动态加载 qrcode-generator 库
        if (typeof qrcode === 'function') {
            renderQR();
        } else {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.5.0/qrcode.min.js';
            s.onload = renderQR;
            s.onerror = function() {
                qrBox.innerHTML = '<a href="' + target + '" target="_blank" rel="noopener" class="tb-client-loading" style="color:var(--primary);">二维码加载失败，点击直接访问官网</a>';
            };
            document.head.appendChild(s);
        }

        overlay.classList.add('show');
    };

    /**
     * 注入浮动站点组件样式（幂等，仅注入一次）
     */
    function ensureFloatStyles() {
        if (document.getElementById('tb-float-styles')) return;
        var style = document.createElement('style');
        style.id = 'tb-float-styles';
        style.textContent =
            '.tb-fab{position:fixed;z-index:9990;width:52px;height:52px;border-radius:50%;border:1px solid var(--border);' +
            'background:var(--bg-card);color:var(--text);display:flex;align-items:center;justify-content:center;' +
            'cursor:pointer;box-shadow:var(--shadow-lg);transition:all .25s ease;padding:0;}' +
            '.tb-fab:hover{transform:translateY(-2px);color:var(--primary-light);}' +
            '.tb-fab i{width:20px;height:20px;}' +
            '.tb-backtop{right:24px;bottom:24px;opacity:0;visibility:hidden;transform:translateY(12px);}' +
            '.tb-backtop.show{opacity:1;visibility:visible;transform:translateY(0);}' +
            '.tb-feedback-fab{right:24px;bottom:88px;}' +
            '.tb-share-fab{right:24px;bottom:152px;}' +
            '.tb-share-panel{position:fixed;z-index:9991;right:92px;bottom:152px;background:var(--bg-card);' +
            'border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-xl);padding:.75rem;' +
            'display:none;flex-direction:column;gap:.25rem;min-width:150px;}' +
            '.tb-share-panel.show{display:flex;animation:tbFadeIn .2s ease;}' +
            '@keyframes tbFadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}' +
            '.tb-share-title{font-size:.8rem;color:var(--text-secondary);padding:.25rem .5rem .5rem;font-weight:600;}' +
            '.tb-share-item{display:flex;align-items:center;gap:.5rem;padding:.5rem .6rem;border:none;background:transparent;' +
            'border-radius:10px;font-family:inherit;font-size:.85rem;color:var(--text);cursor:pointer;transition:background .2s;}' +
            '.tb-share-item:hover{background:var(--bg);}' +
            '.tb-share-item i{width:16px;height:16px;}' +
            '.tb-feedback-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);' +
            'display:none;align-items:center;justify-content:center;padding:1rem;}' +
            '.tb-feedback-overlay.show{display:flex;}' +
            '.tb-feedback-modal{width:100%;max-width:420px;background:var(--bg-card);border-radius:20px;' +
            'padding:1.5rem;box-shadow:var(--shadow-xl);animation:tbFadeIn .2s ease;}' +
            '.tb-feedback-modal h3{font-size:1.1rem;margin-bottom:.25rem;}' +
            '.tb-feedback-modal .tb-feedback-desc{color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem;}' +
            '.tb-feedback-modal textarea{width:100%;min-height:110px;border:1px solid var(--border);border-radius:12px;' +
            'padding:.75rem;font-family:inherit;font-size:.9rem;resize:vertical;background:var(--bg);color:var(--text);}' +
            '.tb-feedback-modal input{width:100%;border:1px solid var(--border);border-radius:12px;padding:.6rem .75rem;' +
            'font-family:inherit;font-size:.85rem;background:var(--bg);color:var(--text);margin-top:.5rem;}' +
            '.tb-feedback-actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem;}' +
            '.tb-btn{padding:.5rem 1.1rem;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);' +
            'font-family:inherit;font-size:.85rem;cursor:pointer;color:var(--text);}' +
            '.tb-btn-primary{background:linear-gradient(135deg,var(--primary),var(--primary-light));color:#fff;border:none;}' +
            '@media (max-width:768px){.tb-share-panel{right:74px;}}' +
            '.tb-translate-fab{right:24px;bottom:216px;}' +
            '.tb-print-fab{right:24px;bottom:280px;}' +
            '.tb-fontsize-fab{right:24px;bottom:344px;}' +
            '.tb-fontsize-panel{position:fixed;z-index:9991;right:92px;bottom:344px;background:var(--bg-card);' +
            'border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-xl);padding:.75rem;' +
            'display:none;flex-direction:column;gap:.5rem;min-width:150px;}' +
            '.tb-fontsize-panel.show{display:flex;animation:tbFadeIn .2s ease;}' +
            '.tb-fontsize-title{font-size:.8rem;color:var(--text-secondary);padding:0 .25rem .25rem;font-weight:600;}' +
            '.tb-fontsize-actions{display:flex;align-items:center;gap:.5rem;}' +
            '.tb-fs-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:.25rem;padding:.5rem 0;' +
            'border:1px solid var(--border);border-radius:10px;background:transparent;font-family:inherit;' +
            'font-size:.8rem;color:var(--text);cursor:pointer;transition:all .2s;}' +
            '.tb-fs-btn:hover{background:var(--bg);color:var(--primary-light);}' +
            '.tb-fs-btn i{width:14px;height:14px;}' +
            '.tb-fs-reset{font-weight:600;}' +
            '@media (max-width:768px){.tb-fontsize-panel{right:74px;bottom:320px;}}' +
            '@media print{.tb-fab,.tb-fontsize-panel,.tb-share-panel,.tb-translate-panel,.tb-feedback-overlay{display:none!important;}}' +
            '.tb-translate-panel{position:fixed;z-index:9991;right:92px;bottom:216px;background:var(--bg-card);' +
            'border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-xl);padding:.75rem;' +
            'display:none;flex-direction:column;gap:.35rem;min-width:170px;max-width:230px;}' +
            '.tb-translate-panel.show{display:flex;animation:tbFadeIn .2s ease;}' +
            '.tb-translate-title{font-size:.8rem;color:var(--text-secondary);padding:.25rem .5rem .5rem;font-weight:600;display:flex;align-items:center;gap:.35rem;}' +
            '.tb-translate-title i{width:14px;height:14px;}' +
            '.tb-translate-status{font-size:.72rem;color:var(--primary-light);padding:0 .5rem .35rem;display:none;}' +
            '.tb-translate-status.show{display:block;}' +
            '.tb-translate-langs{display:flex;flex-direction:column;gap:.15rem;max-height:220px;overflow-y:auto;}' +
            '.tb-translate-lang{display:flex;align-items:center;gap:.5rem;padding:.45rem .6rem;border:none;background:transparent;' +
            'border-radius:10px;font-family:inherit;font-size:.85rem;color:var(--text);cursor:pointer;transition:background .2s;text-align:left;}' +
            '.tb-translate-lang:hover{background:var(--bg);}' +
            '.tb-translate-lang.active{background:rgba(217,119,6,.12);color:var(--primary-light);}' +
            '.tb-translate-lang i{width:15px;height:15px;margin-left:auto;}' +
            '.tb-translate-restore{display:flex;align-items:center;justify-content:center;gap:.4rem;margin-top:.25rem;padding:.45rem .6rem;' +
            'border:1px solid var(--border);border-radius:10px;background:transparent;font-family:inherit;font-size:.8rem;color:var(--text);cursor:pointer;transition:all .2s;}' +
            '.tb-translate-restore:hover{background:var(--bg);color:var(--primary-light);}' +
            '.tb-translate-restore i{width:14px;height:14px;}' +
            '@media (max-width:768px){.tb-translate-panel{right:74px;bottom:196px;}}';
        document.head.appendChild(style);
    }

    /**
     * 自动注入"打印本页"浮动按钮
     */
    function injectPrintButton() {
        if (document.querySelector('.tb-print-fab')) return;
        ensureFloatStyles();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tb-fab tb-print-fab';
        btn.title = '打印本页（可另存为PDF）';
        btn.setAttribute('aria-label', '打印本页');
        btn.innerHTML = '<i data-lucide="printer"></i>';
        btn.addEventListener('click', function() {
            try { window.print(); } catch (e) {}
        });
        document.body.appendChild(btn);
        if (window.lucide) lucide.createIcons();
    }

    /**
     * 自动注入"字号调节"浮动按钮
     * 支持 A- / 重置 / A+ 三档（85%~130%），记忆到 localStorage
     */
    function injectFontSizeButton() {
        if (document.querySelector('.tb-fontsize-fab')) return;
        ensureFloatStyles();
        var KEY = 'toolbox_font_scale';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tb-fab tb-fontsize-fab';
        btn.title = '字号调节';
        btn.setAttribute('aria-label', '字号调节');
        btn.innerHTML = '<i data-lucide="type"></i>';
        document.body.appendChild(btn);

        var panel = document.createElement('div');
        panel.className = 'tb-fontsize-panel';
        panel.innerHTML = '<div class="tb-fontsize-title">字号调节</div>' +
            '<div class="tb-fontsize-actions">' +
            '<button type="button" class="tb-fs-btn" data-fs="-1" title="减小字号"><i data-lucide="minus"></i></button>' +
            '<button type="button" class="tb-fs-btn tb-fs-reset" title="恢复默认">100%</button>' +
            '<button type="button" class="tb-fs-btn" data-fs="1" title="增大字号"><i data-lucide="plus"></i></button>' +
            '</div>';
        document.body.appendChild(panel);

        function applyScale() {
            var scale = parseFloat(localStorage.getItem(KEY) || '1') || 1;
            document.documentElement.style.fontSize = (scale * 100) + '%';
            var resetBtn = panel.querySelector('.tb-fs-reset');
            if (resetBtn) resetBtn.textContent = Math.round(scale * 100) + '%';
        }

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.toggle('show');
        });

        panel.addEventListener('click', function(e) {
            var t = e.target.closest ? e.target.closest('.tb-fs-btn') : null;
            if (!t) return;
            var cur = parseFloat(localStorage.getItem(KEY) || '1') || 1;
            if (t.hasAttribute('data-fs')) {
                var delta = parseFloat(t.getAttribute('data-fs'));
                var next = Math.round((cur + delta * 0.05) * 100) / 100;
                next = Math.min(1.3, Math.max(0.85, next));
                localStorage.setItem(KEY, String(next));
            } else {
                localStorage.setItem(KEY, '1');
            }
            applyScale();
        });

        document.addEventListener('click', function(e) {
            if (!panel.classList.contains('show')) return;
            if (panel.contains(e.target) || btn.contains(e.target)) return;
            panel.classList.remove('show');
        });

        applyScale();
        if (window.lucide) lucide.createIcons();
    }

    /**
     * 自动注入"返回顶部"浮动按钮
     */
    function injectBackToTop() {
        if (document.querySelector('.tb-backtop')) return;
        ensureFloatStyles();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tb-fab tb-backtop';
        btn.title = '返回顶部';
        btn.setAttribute('aria-label', '返回顶部');
        btn.innerHTML = '<i data-lucide="chevron-up"></i>';
        btn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        var ticking = false;
        window.addEventListener('scroll', function() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function() {
                var show = window.pageYOffset > 400;
                btn.classList.toggle('show', show);
                ticking = false;
            });
        }, { passive: true });
        document.body.appendChild(btn);
        if (window.lucide) lucide.createIcons();
    }

    /**
     * 自动注入"分享本工具"浮动按钮（复制链接 / 微博 / QQ空间）
     */
    function injectShareButton() {
        if (document.querySelector('.tb-share-fab')) return;
        ensureFloatStyles();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tb-fab tb-share-fab';
        btn.title = '分享本工具';
        btn.setAttribute('aria-label', '分享本工具');
        btn.innerHTML = '<i data-lucide="share-2"></i>';
        document.body.appendChild(btn);

        var panel = document.createElement('div');
        panel.className = 'tb-share-panel';
        panel.innerHTML =
            '<div class="tb-share-title">分享给朋友</div>' +
            '<button type="button" class="tb-share-item" data-type="link"><i data-lucide="link"></i>复制链接</button>' +
            '<button type="button" class="tb-share-item" data-type="weibo"><i data-lucide="globe"></i>分享到微博</button>' +
            '<button type="button" class="tb-share-item" data-type="qq"><i data-lucide="message-circle"></i>分享到QQ空间</button>';
        document.body.appendChild(panel);

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.toggle('show');
        });
        document.addEventListener('click', function(e) {
            if (!panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.remove('show');
            }
        });

        panel.addEventListener('click', function(e) {
            var item = e.target.closest('.tb-share-item');
            if (!item) return;
            var type = item.getAttribute('data-type');
            var url = encodeURIComponent(location.href);
            var title = encodeURIComponent(document.title);
            if (type === 'link') {
                try {
                    navigator.clipboard.writeText(location.href).then(function() {
                        if (typeof Auth.showToast === 'function') Auth.showToast('链接已复制', 'success');
                    }).catch(function() { copyFallback(); });
                } catch (e) { copyFallback(); }
            } else if (type === 'weibo') {
                window.open('https://service.weibo.com/share/share.php?url=' + url + '&title=' + title, '_blank', 'width=680,height=520');
            } else if (type === 'qq') {
                window.open('https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=' + url + '&title=' + title, '_blank', 'width=680,height=520');
            }
            panel.classList.remove('show');
        });

        function copyFallback() {
            var ta = document.createElement('textarea');
            ta.value = location.href;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); if (typeof Auth.showToast === 'function') Auth.showToast('链接已复制', 'success'); } catch (e) {}
            document.body.removeChild(ta);
        }
        if (window.lucide) lucide.createIcons();
    }

    /**
     * 自动注入"意见反馈"浮动按钮（弹出反馈表单，本地保存）
     */
    function injectFeedbackButton() {
        if (document.querySelector('.tb-feedback-fab')) return;
        ensureFloatStyles();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tb-fab tb-feedback-fab';
        btn.title = '意见反馈';
        btn.setAttribute('aria-label', '意见反馈');
        btn.innerHTML = '<i data-lucide="message-square-plus"></i>';
        document.body.appendChild(btn);

        var overlay = document.createElement('div');
        overlay.className = 'tb-feedback-overlay';
        overlay.innerHTML =
            '<div class="tb-feedback-modal">' +
                '<h3>意见反馈</h3>' +
                '<p class="tb-feedback-desc">告诉我们哪里可以改进，或遇到了什么问题。</p>' +
                '<textarea id="tbFeedbackContent" placeholder="请输入你的建议或问题…"></textarea>' +
                '<input id="tbFeedbackContact" placeholder="联系方式（选填，方便我们回复你）" />' +
                '<div class="tb-feedback-actions">' +
                    '<button type="button" class="tb-btn" id="tbFeedbackCancel">取消</button>' +
                    '<button type="button" class="tb-btn tb-btn-primary" id="tbFeedbackSubmit">提交反馈</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        btn.addEventListener('click', function() { overlay.classList.add('show'); });
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || e.target.id === 'tbFeedbackCancel') {
                overlay.classList.remove('show');
            }
        });
        overlay.addEventListener('click', function(e) {
            if (e.target.id !== 'tbFeedbackSubmit') return;
            var content = (document.getElementById('tbFeedbackContent') || {}).value || '';
            if (!content.trim()) {
                if (typeof Auth.showToast === 'function') Auth.showToast('请先填写反馈内容', 'error');
                return;
            }
            var contact = (document.getElementById('tbFeedbackContact') || {}).value || '';
            var list = [];
            try { list = JSON.parse(localStorage.getItem('toolbox_feedback') || '[]'); } catch (err) { list = []; }
            list.push({ content: content.trim(), contact: contact.trim(), tool: getToolName(), page: location.pathname, time: Date.now() });
            try { localStorage.setItem('toolbox_feedback', JSON.stringify(list)); } catch (err) {}
            overlay.classList.remove('show');
            if (typeof Auth.showToast === 'function') Auth.showToast('感谢你的反馈！', 'success');
        });
        if (window.lucide) lucide.createIcons();
    }

    /**
     * 全站 SEO 补全：favicon + Open Graph + JSON-LD 结构化数据（幂等）
     */
    function injectSeoMeta() {
        var head = document.head;
        if (!head) return;

        // 1. favicon
        if (!document.querySelector('link[rel="icon"]')) {
            var icon = document.createElement('link');
            icon.rel = 'icon';
            icon.type = 'image/png';
            icon.href = 'icons/A_modern_flat_app_icon_for_an__2026-08-13T03-24-33.png';
            head.appendChild(icon);
        }

        // 2. Open Graph 基础标签
        var title = document.title || '在线工具箱';
        var descEl = document.querySelector('meta[name="description"]');
        var desc = descEl ? (descEl.content || '') : '免费在线小工具集合';
        var isTool = !!getToolName();
        var ogMap = {
            'og:title': title,
            'og:description': desc,
            'og:type': 'website',
            'og:site_name': '在线工具箱'
        };
        for (var k in ogMap) {
            if (!ogMap.hasOwnProperty(k)) continue;
            if (!document.querySelector('meta[property="' + k + '"]')) {
                var m = document.createElement('meta');
                m.setAttribute('property', k);
                m.setAttribute('content', ogMap[k]);
                head.appendChild(m);
            }
        }

        // 3. JSON-LD 结构化数据
        if (!document.querySelector('#tb-jsonld')) {
            var schema = {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                'name': '在线工具箱',
                'url': location.origin,
                'description': '免费在线小工具集合：PDF、图片、开发、文字、生活实用工具，全部在浏览器本地处理，无需下载安装。'
            };
            if (isTool) {
                schema = {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareApplication',
                    'name': title,
                    'description': desc,
                    'applicationCategory': 'UtilitiesApplication',
                    'operatingSystem': 'Web',
                    'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'CNY' }
                };
            }
            var ld = document.createElement('script');
            ld.type = 'application/ld+json';
            ld.id = 'tb-jsonld';
            try { ld.textContent = JSON.stringify(schema); } catch (e) { ld.textContent = '{}'; }
            head.appendChild(ld);
        }
    }

    /**
     * 工具页底部自动注入"相关工具推荐"（幂等）
     */
    function injectRelatedTools() {
        if (document.querySelector('.tb-related-wrap')) return;
        var toolId = getToolName();
        if (!toolId) return;
        var related = Auth.getRelatedTools(toolId, 3);
        if (!related.length) return;
        var main = document.querySelector('main');
        if (!main) return;
        var section = document.createElement('section');
        section.className = 'tb-related-wrap';
        section.innerHTML =
            '<div class="container">' +
                '<h3 class="tb-related-title">相关工具推荐</h3>' +
                '<div class="tb-related-grid"></div>' +
            '</div>';
        main.appendChild(section);
        var grid = section.querySelector('.tb-related-grid');
        related.forEach(function(t) {
            var card = document.createElement('a');
            card.href = t.href;
            card.className = 'tb-related-card';
            card.innerHTML =
                '<div class="tb-related-icon"><i data-lucide="' + t.icon + '"></i></div>' +
                '<div class="tb-related-info"><b>' + t.title + '</b><span>' + catLabel(t.cat) + '</span></div>' +
                '<i data-lucide="arrow-up-right" class="tb-related-arrow"></i>';
            grid.appendChild(card);
        });
        if (window.lucide) lucide.createIcons();
    }

    function catLabel(cat) {
        var labels = { pdf: 'PDF处理', image: '图片工具', dev: '开发工具', ai: 'AI助手', util: '实用工具', text: '文本工具', other: '其他工具' };
        return labels[cat] || '工具';
    }

    /**
     * 首页热门工具区块注入（幂等，仅首页）
     */
    function injectHotTools() {
        if (document.getElementById('tb-hot-tools')) return;
        var path = window.location.pathname;
        if (path.indexOf('index.html') === -1 && !/\/$/.test(path)) return;
        var hot = Auth.getHotTools(6);
        if (hot.length === 0) return;
        var main = document.querySelector('main');
        if (!main) return;
        var section = document.createElement('section');
        section.id = 'tb-hot-tools';
        section.className = 'tb-hot-wrap';
        var items = '';
        var hotIdx = 0;
        hot.forEach(function(h) {
            hotIdx++;
            var meta = TOOL_CATALOG.filter(function(t) { return t.href === h.href; })[0];
            if (!meta) return;
            items +=
                '<a class="tb-hot-card" href="' + meta.href + '">' +
                    '<div class="tb-hot-icon"><i data-lucide="' + meta.icon + '"></i></div>' +
                    '<div class="tb-hot-info"><b>' + meta.title + '</b><span>' + catLabel(meta.cat) + ' · ' + h.views + ' 次使用</span></div>' +
                    '<span class="tb-hot-rank">#' + hotIdx + '</span>' +
                '</a>';
        });
        if (!items) return;
        section.innerHTML =
            '<div class="container">' +
                '<div class="tb-hot-head"><h2><i data-lucide="flame"></i>热门工具</h2><p>大家都在用</p></div>' +
                '<div class="tb-hot-grid">' + items + '</div>' +
            '</div>';
        var anchor = document.getElementById('tools') || main.querySelector('.tools-section');
        if (anchor) {
            main.insertBefore(section, anchor);
        } else {
            main.insertBefore(section, main.firstChild);
        }
        if (window.lucide) lucide.createIcons();
    }

    // ===== 全局网页翻译 =====
    var TL_KEY = 'toolbox_global_lang';
    var TL_CACHE_KEY = 'toolbox_tl_cache_v1';
    var TL_CACHE_MAX = 6000;

    function tlCacheKey(text, target) { return target + '::' + text; }

    function tlCacheGet(text, target) {
        try {
            var raw = localStorage.getItem(TL_CACHE_KEY);
            if (!raw) return null;
            var cache = JSON.parse(raw);
            var v = cache[tlCacheKey(text, target)];
            return v === undefined ? null : v;
        } catch (e) { return null; }
    }

    function tlCacheSet(text, target, translated) {
        try {
            var raw = localStorage.getItem(TL_CACHE_KEY);
            var cache = raw ? JSON.parse(raw) : {};
            var key = tlCacheKey(text, target);
            if (cache[key] === translated) return;
            cache[key] = translated;
            var keys = Object.keys(cache);
            if (keys.length > TL_CACHE_MAX) {
                var drop = keys.slice(0, Math.floor(keys.length / 2));
                for (var i = 0; i < drop.length; i++) delete cache[drop[i]];
            }
            localStorage.setItem(TL_CACHE_KEY, JSON.stringify(cache));
        } catch (e) {}
    }
    var TL_LANGS = [
        { code: 'zh-CN', name: '中文' },
        { code: 'en', name: '英语' },
        { code: 'ja', name: '日语' },
        { code: 'ko', name: '韩语' },
        { code: 'fr', name: '法语' },
        { code: 'de', name: '德语' },
        { code: 'es', name: '西班牙语' },
        { code: 'ru', name: '俄语' },
        { code: 'it', name: '意大利语' },
        { code: 'pt', name: '葡萄牙语' },
        { code: 'vi', name: '越南语' },
        { code: 'th', name: '泰语' }
    ];
    var TL_SKIP = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, INPUT:1, SELECT:1, OPTION:1, CODE:1, PRE:1, KBD:1, SAMP:1, SVG:1, MATH:1, IFRAME:1, CANVAS:1 };
    var TL_STATE = { target: 'zh-CN', enabled: false, busy: false, observer: null, timer: null, aborted: false, abortedReason: '' };

    function tlHasZh(text) { return /[\u4e00-\u9fff]/.test(text || ''); }

    function tlIsTranslatable(node) {
        var t = node.nodeValue || '';
        if (!t.trim() || !tlHasZh(t)) return false;
        var p = node.parentElement;
        if (!p || TL_SKIP[p.tagName]) return false;
        if (p.closest && p.closest('.tb-translate-panel, .tb-translate-fab, [data-tb-no-translate]')) return false;
        return true;
    }

    function tlCollect() {
        var out = [];
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function(n) {
                if (!tlIsTranslatable(n)) return NodeFilter.FILTER_REJECT;
                if (n._tbOrig || n._tbBusy) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        while (walker.nextNode()) out.push(walker.currentNode);
        return out;
    }

    function tlDecodeHtml(s) {
        if (!s) return '';
        var ta = document.createElement('textarea');
        ta.innerHTML = s;
        return ta.value;
    }

    function tlMakeBatches(nodes) {
        var batches = [], cur = [], len = 0;
        for (var i = 0; i < nodes.length; i++) {
            var t = (nodes[i].nodeValue || '').length;
            if (len + t > 380 && cur.length) { batches.push(cur); cur = []; len = 0; }
            cur.push(nodes[i]); len += t;
        }
        if (cur.length) batches.push(cur);
        return batches;
    }

    function tlFetchBatch(batch, target) {
        var texts = [];
        for (var i = 0; i < batch.length; i++) texts.push((batch[i].nodeValue || '').replace(/\s+/g, ' ').trim());
        var joined = texts.join('\n');
        var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(joined) +
            '&langpair=' + encodeURIComponent('zh-CN|' + target);
        return fetch(url).then(function(r) { return r.json(); }).then(function(data) {
            var out = (data && data.responseData && data.responseData.translatedText) || '';
            // 检测 MyMemory 警告：触发限额时会把 WARNING 文本塞进 translatedText，必须拒绝
            if (/MYMEMORY\s*WARNING|QUOTA\s*EXCEEDED|DAILY\s*CHARACTER\s*LIMIT/i.test(out)) {
                throw new Error('quota');
            }
            if (data && (data.quotaExceeded || (data.responseStatus && +data.responseStatus !== 200 && +data.responseStatus !== 0))) {
                throw new Error('status:' + data.responseStatus);
            }
            var parts = out.split('\n');
            for (var i = 0; i < batch.length; i++) {
                var tr = parts[i] !== undefined ? parts[i] : '';
                if (tr && tr.trim() && tr !== (batch[i].nodeValue || '')) {
                    if (!batch[i]._tbOrig) batch[i]._tbOrig = batch[i].nodeValue;
                    batch[i].nodeValue = tlDecodeHtml(tr);
                    tlCacheSet(batch[i]._tbOrig, target, tr);
                }
                batch[i]._tbBusy = false;
            }
        });
    }

    function tlTranslateNodes(nodes, target, silent) {
        if (!nodes.length) return Promise.resolve(0);
        // 优先用缓存：命中的立即翻译，避免消耗 API 配额
        var uncached = [];
        for (var i = 0; i < nodes.length; i++) {
            var cached = tlCacheGet(nodes[i].nodeValue, target);
            if (cached !== null) {
                if (!nodes[i]._tbOrig) nodes[i]._tbOrig = nodes[i].nodeValue;
                nodes[i].nodeValue = tlDecodeHtml(cached);
                nodes[i]._tbBusy = false;
            } else {
                nodes[i]._tbBusy = true;
                uncached.push(nodes[i]);
            }
        }
        if (!uncached.length) {
            TL_STATE.busy = false;
            if (!silent) { tlSetStatus('翻译完成（来自本地缓存）'); setTimeout(tlHideStatus, 2000); }
            return Promise.resolve(nodes.length);
        }
        var batches = tlMakeBatches(uncached);
        TL_STATE.busy = true;
        TL_STATE.aborted = false;
        TL_STATE.abortedReason = '';
        if (!silent) tlSetStatus('正在翻译… 0/' + batches.length);
        var done = 0;
        var chain = Promise.resolve();
        for (var b = 0; b < batches.length; b++) {
            (function(batch) {
                chain = chain.then(function() {
                    if (TL_STATE.aborted) {
                        for (var i = 0; i < batch.length; i++) batch[i]._tbBusy = false;
                        return;
                    }
                    return tlFetchBatch(batch, target);
                }).catch(function(err) {
                    // 单批失败：标记中止并清标记
                    TL_STATE.aborted = true;
                    TL_STATE.abortedReason = (err && err.message) || 'failed';
                    for (var i = 0; i < batch.length; i++) batch[i]._tbBusy = false;
                }).then(function() {
                    done++;
                    if (!silent && !TL_STATE.aborted) tlSetStatus('正在翻译… ' + done + '/' + batches.length);
                });
            })(batches[b]);
        }
        return chain.then(function() {
            TL_STATE.busy = false;
            if (!silent) {
                if (TL_STATE.aborted) {
                    if (TL_STATE.abortedReason === 'quota') {
                        tlSetStatus('翻译服务今日免费额度已用完，已自动停止（已翻译的内容保留）');
                    } else {
                        tlSetStatus('翻译失败：' + TL_STATE.abortedReason + '（已停止）');
                    }
                } else {
                    tlSetStatus('翻译完成');
                }
                setTimeout(tlHideStatus, 3500);
            }
            return done;
        }).catch(function() {
            TL_STATE.busy = false;
            if (!silent) { tlSetStatus('翻译失败，请稍后重试'); setTimeout(tlHideStatus, 2600); }
            return done;
        });
    }

    function tlRestore() {
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            var n = walker.currentNode;
            if (n._tbOrig) {
                n.nodeValue = n._tbOrig;
                delete n._tbOrig;
            }
        }
    }

    function tlSetStatus(text) {
        var el = document.getElementById('tbTranslateStatus');
        if (el) { el.textContent = text; el.classList.add('show'); }
    }

    function tlHideStatus() {
        var el = document.getElementById('tbTranslateStatus');
        if (el) { el.classList.remove('show'); el.textContent = ''; }
    }

    function tlUpdatePanelActive() {
        var btns = document.querySelectorAll('.tb-translate-lang');
        for (var i = 0; i < btns.length; i++) {
            var active = TL_STATE.enabled && btns[i].getAttribute('data-lang') === TL_STATE.target;
            btns[i].classList.toggle('active', active);
            var check = btns[i].querySelector('i');
            if (check) check.style.display = active ? 'inline-block' : 'none';
        }
    }

    function tlWatchDynamic() {
        if (TL_STATE.observer) return;
        TL_STATE.observer = new MutationObserver(function() {
            if (!TL_STATE.enabled || TL_STATE.target === 'zh-CN') return;
            if (TL_STATE.timer || TL_STATE.busy) return;
            TL_STATE.timer = setTimeout(function() {
                TL_STATE.timer = null;
                if (!TL_STATE.enabled || TL_STATE.busy) return;
                var nodes = tlCollect();
                if (nodes.length) tlTranslateNodes(nodes, TL_STATE.target, true);
            }, 900);
        });
        TL_STATE.observer.observe(document.body, { childList: true, subtree: true });
    }

    // 全站轻量 toast（若页面未自带，则提供默认实现）
    if (typeof Auth.showToast !== 'function') {
        Auth.showToast = function(msg, type) {
            var el = document.getElementById('tbToast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'tbToast';
                el.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(16px);' +
                    'background:rgba(17,24,39,.92);color:#fff;padding:.55rem 1.1rem;border-radius:999px;' +
                    'font-size:.85rem;z-index:99999;opacity:0;pointer-events:none;transition:all .3s ease;max-width:86vw;text-align:center;';
                document.body.appendChild(el);
            }
            el.textContent = msg || '';
            el.style.opacity = '1';
            el.style.transform = 'translateX(-50%) translateY(0)';
            clearTimeout(Auth.showToast._t);
            Auth.showToast._t = setTimeout(function() {
                el.style.opacity = '0';
                el.style.transform = 'translateX(-50%) translateY(16px)';
            }, 2200);
        };
    }

    Auth.setGlobalTranslate = function(lang) {
        if (TL_STATE.busy) {
            if (typeof Auth.showToast === 'function') Auth.showToast('正在翻译中，请稍候', 'error');
            return;
        }
        if (lang === TL_STATE.target && TL_STATE.enabled) return;
        tlRestore();
        TL_STATE.enabled = lang !== 'zh-CN';
        TL_STATE.target = lang;
        try { localStorage.setItem(TL_KEY, lang); } catch (e) {}
        tlUpdatePanelActive();
        if (lang !== 'zh-CN') tlTranslateNodes(tlCollect(), lang, false);
    };

    /**
     * 全局网页翻译：注入右下角"翻译"浮动按钮与语言面板，
     * 选择语言后通过 MyMemory 免费接口批量翻译整个页面文本，
     * localStorage 记忆语言选择，MutationObserver 增量翻译动态内容
     */
    function injectGlobalTranslate() {
        if (document.querySelector('.tb-translate-fab')) return;
        ensureFloatStyles();
        var saved = 'zh-CN';
        try { saved = localStorage.getItem(TL_KEY) || 'zh-CN'; } catch (e) {}
        var valid = false;
        for (var v = 0; v < TL_LANGS.length; v++) { if (TL_LANGS[v].code === saved) { valid = true; break; } }
        if (!valid) saved = 'zh-CN';
        TL_STATE.target = saved;
        TL_STATE.enabled = saved !== 'zh-CN';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tb-fab tb-translate-fab';
        btn.title = '网页翻译';
        btn.setAttribute('aria-label', '网页翻译');
        btn.innerHTML = '<i data-lucide="languages"></i>';
        document.body.appendChild(btn);

        var langsHtml = '';
        for (var i = 0; i < TL_LANGS.length; i++) {
            langsHtml += '<button type="button" class="tb-translate-lang" data-lang="' + TL_LANGS[i].code + '">' +
                TL_LANGS[i].name + '<i data-lucide="check"></i></button>';
        }
        var panel = document.createElement('div');
        panel.className = 'tb-translate-panel';
        panel.innerHTML =
            '<div class="tb-translate-title"><i data-lucide="languages"></i>网页翻译</div>' +
            '<div class="tb-translate-status" id="tbTranslateStatus"></div>' +
            '<div class="tb-translate-langs">' + langsHtml + '</div>' +
            '<button type="button" class="tb-translate-restore"><i data-lucide="rotate-ccw"></i>恢复原文</button>';
        document.body.appendChild(panel);

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.toggle('show');
        });
        document.addEventListener('click', function(e) {
            if (!panel.contains(e.target) && !btn.contains(e.target)) panel.classList.remove('show');
        });

        var langBtns = panel.querySelectorAll('.tb-translate-lang');
        for (var j = 0; j < langBtns.length; j++) {
            langBtns[j].addEventListener('click', function() {
                Auth.setGlobalTranslate(this.getAttribute('data-lang'));
                panel.classList.remove('show');
            });
        }
        panel.querySelector('.tb-translate-restore').addEventListener('click', function() {
            Auth.setGlobalTranslate('zh-CN');
            panel.classList.remove('show');
            if (typeof Auth.showToast === 'function') Auth.showToast('已恢复原文', 'success');
        });

        tlUpdatePanelActive();
        tlWatchDynamic();
        if (window.lucide) lucide.createIcons();

        // 若之前选择了其他语言，页面加载后自动应用
        if (saved && saved !== 'zh-CN') {
            setTimeout(function() {
                if (!TL_STATE.busy && TL_STATE.target === saved && TL_STATE.enabled) {
                    tlTranslateNodes(tlCollect(), saved, false);
                }
            }, 500);
        }
    }

    /**
     * 全站导航栏注入"网址导航"入口
     * 在所有引用 auth.js 的页面导航栏中插入"导航"链接（若尚未存在）
     */
    function injectNavLink() {
        if (document.querySelector('.nav-links a[href="navigator.html"]')) return;
        var navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;
        var link = document.createElement('a');
        link.href = 'navigator.html';
        link.className = 'nav-link';
        link.textContent = '导航';
        // 插到第一个链接之后（首页为"工具"，其余页面为"返回首页"）
        if (navLinks.children.length > 0) {
            navLinks.insertBefore(link, navLinks.children[1]);
        } else {
            navLinks.appendChild(link);
        }
    }

    /**
     * 移动端汉堡菜单按钮注入
     * 仅在小屏幕下显示，点击展开/收起导航链接
     */
    function injectMobileNavToggle() {
        if (document.querySelector('.nav-mobile-toggle')) return;
        var navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-mobile-toggle';
        btn.setAttribute('aria-label', '展开菜单');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<span class="nav-mobile-toggle-bar"></span><span class="nav-mobile-toggle-bar"></span><span class="nav-mobile-toggle-bar"></span>';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var isOpen = navLinks.classList.toggle('nav-mobile-open');
            btn.classList.toggle('active', isOpen);
            btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
        // 点击导航链接后自动收起
        var links = navLinks.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                navLinks.classList.remove('nav-mobile-open');
                btn.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
            });
        }
        // 点击页面其他区域收起
        document.addEventListener('click', function(e) {
            if (!navLinks.contains(e.target) && !btn.contains(e.target)) {
                navLinks.classList.remove('nav-mobile-open');
                btn.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
            }
        });
        // 插入到 nav-links 之前
        navLinks.parentNode.insertBefore(btn, navLinks);
    }

    /**
     * 自动在导航栏用户区内部注入暗色模式切换按钮
     */
    function injectDarkModeToggle() {
        if (document.querySelector('.dark-mode-toggle')) return; // 已存在
        var _isDark = document.body.classList.contains('dark-mode');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dark-mode-toggle' + (_isDark ? ' active' : '');
        btn.title = _isDark ? '切换到亮色模式' : '切换到暗色模式';
        btn.innerHTML = '<i data-lucide="' + (_isDark ? 'sun' : 'moon') + '" style="width:18px;height:18px;"></i>';
        btn.addEventListener('click', function() {
            Auth.toggleDarkMode();
            btn.title = document.body.classList.contains('dark-mode') ? '切换到亮色模式' : '切换到暗色模式';
        });
        // 优先注入到 hero section 内部最前面，没有则回退到 nav-user-area
        var heroSection = document.querySelector('section.hero');
        if (heroSection) {
            heroSection.insertBefore(btn, heroSection.firstChild);
        } else {
            var navUserArea = document.querySelector('.nav-user-area');
            if (!navUserArea) return;
            navUserArea.insertBefore(btn, navUserArea.firstChild);
        }
        if (window.lucide) lucide.createIcons();
    }

    // ===== 暗色模式 API =====（必须在 init() 之前定义）
    var DARK_MODE_KEY = 'toolbox_dark_mode';

    Auth.isDarkMode = function() {
        return localStorage.getItem(DARK_MODE_KEY) === '1';
    };

    Auth.setDarkMode = function(on) {
        if (on) {
            document.body.classList.add('dark-mode');
            localStorage.setItem(DARK_MODE_KEY, '1');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.removeItem(DARK_MODE_KEY);
        }
        // 更新所有切换按钮的状态
        var btns = document.querySelectorAll('.dark-mode-toggle');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', on);
            var icon = btns[i].querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', on ? 'sun' : 'moon');
            }
        }
        if (window.lucide) lucide.createIcons();
    };

    Auth.toggleDarkMode = function() {
        Auth.setDarkMode(!Auth.isDarkMode());
        return Auth.isDarkMode();
    };

    // 页面加载时立即应用暗色模式（避免闪烁）
    Auth.initDarkMode = function() {
        if (Auth.isDarkMode()) {
            document.body.classList.add('dark-mode');
        }
    };

    // 自动初始化
    init();

    // ===== 工具收藏 + 最近使用 API =====
    var FAV_TOOLS_KEY = 'toolbox_fav_tools';
    var RECENT_TOOLS_KEY = 'toolbox_recent_tools';
    var MAX_RECENT = 8;

    function getUserScopedKey(baseKey) {
        var user = Auth.getCurrentUser();
        return user ? (baseKey + '_' + user) : baseKey;
    }

    /**
     * 收藏工具
     */
    Auth.toggleFavoriteTool = function(toolId) {
        var key = getUserScopedKey(FAV_TOOLS_KEY);
        var list = [];
        try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
        var idx = list.indexOf(toolId);
        if (idx === -1) {
            list.push(toolId);
            var result = { success: true, favorited: true, message: '已收藏' };
        } else {
            list.splice(idx, 1);
            var result = { success: true, favorited: false, message: '已取消收藏' };
        }
        localStorage.setItem(key, JSON.stringify(list));
        return result;
    };

    /**
     * 获取收藏列表
     */
    Auth.getFavoriteTools = function() {
        var key = getUserScopedKey(FAV_TOOLS_KEY);
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
    };

    Auth.isFavoriteTool = function(toolId) {
        return Auth.getFavoriteTools().indexOf(toolId) !== -1;
    };

    /**
     * 记录最近使用的工具
     */
    Auth.recordRecentTool = function(toolId) {
        var key = getUserScopedKey(RECENT_TOOLS_KEY);
        var list = [];
        try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
        // 去重并放到最前
        var idx = list.indexOf(toolId);
        if (idx !== -1) list.splice(idx, 1);
        list.unshift(toolId);
        if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
        localStorage.setItem(key, JSON.stringify(list));
    };

    /**
     * 获取最近使用的工具
     */
    Auth.getRecentTools = function() {
        var key = getUserScopedKey(RECENT_TOOLS_KEY);
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
    };

    /**
     * 获取全站工具目录（含名称/分类/图标），用于收藏列表、最近使用等渲染
     */
    Auth.getToolCatalog = function() {
        try { return JSON.parse(JSON.stringify(TOOL_CATALOG)); } catch (e) { return []; }
    };

    // ===== 积分 + 签到系统 =====
    var POINTS_KEY = 'toolbox_points';
    var CHECKIN_KEY = 'toolbox_checkin';

    function todayStr() {
        var d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }

    function yesterdayStr() {
        var d = new Date(Date.now() - 86400000);
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }

    /**
     * 获取当前用户积分（未登录返回 0）
     */
    Auth.getPoints = function() {
        var user = Auth.getCurrentUser();
        if (!user) return 0;
        var key = getUserScopedKey(POINTS_KEY);
        try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) { return 0; }
    };

    /**
     * 增加积分（内部用）
     */
    Auth._addPoints = function(n) {
        var user = Auth.getCurrentUser();
        if (!user) return 0;
        var key = getUserScopedKey(POINTS_KEY);
        var total = Auth.getPoints() + n;
        try { localStorage.setItem(key, String(total)); } catch (e) {}
        return total;
    };

    /**
     * 每日签到
     * 返回 { already: 是否已签到, gained: 本次获得, streak: 连续天数, total: 总积分 }
     */
    Auth.checkIn = function() {
        var user = Auth.getCurrentUser();
        if (!user) return { already: true, needLogin: true, gained: 0, streak: 0, total: 0 };
        var key = getUserScopedKey(CHECKIN_KEY);
        var info = {};
        try { info = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}

        var today = todayStr();
        if (info.lastDate === today) {
            return { already: true, gained: 0, streak: info.streak || 1, total: Auth.getPoints() };
        }

        // 计算连续天数
        var streak = (info.lastDate === yesterdayStr()) ? (info.streak || 0) + 1 : 1;
        // 积分规则：基础 5 分，连续 7 天额外 +10
        var gained = 5;
        if (streak > 0 && streak % 7 === 0) gained += 10;

        Auth._addPoints(gained);
        try {
            localStorage.setItem(key, JSON.stringify({ lastDate: today, streak: streak }));
        } catch (e) {}

        return { already: false, gained: gained, streak: streak, total: Auth.getPoints() };
    };

    // ===== 全局公告通知条（全站展示，需手动关闭）=====
    Auth.initAnnouncementBar = function() {
        try {
            var ann = Auth.shouldShowAnnouncement && Auth.shouldShowAnnouncement();
            if (!ann || !ann.id || !ann.content) return;
            // 首页已有弹窗逻辑，不重复展示顶部条
            if (document.getElementById('announcementModal')) return;
            var bar = document.createElement('div');
            bar.className = 'site-announce-bar';
            bar.innerHTML =
                '<div class="site-announce-inner">' +
                    '<span class="site-announce-icon"><i data-lucide="megaphone" style="width:16px;height:16px;"></i></span>' +
                    '<span class="site-announce-text"><strong>' + escapeHtml(ann.title || '') + '</strong>' + (ann.title ? '：' : '') + escapeHtml(ann.content) + '</span>' +
                    '<button class="site-announce-close" title="关闭公告"><i data-lucide="x" style="width:15px;height:15px;"></i></button>' +
                '</div>';
            document.body.appendChild(bar);

            var closeBtn = bar.querySelector('.site-announce-close');
            closeBtn.addEventListener('click', function() {
                Auth.markAnnouncementRead && Auth.markAnnouncementRead(ann.id);
                bar.classList.add('site-announce-hide');
                setTimeout(function() { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 400);
            });

            // 渲染 lucide 图标（如果已加载）
            if (window.lucide) {
                try { window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); } catch (e) {}
            }
        } catch (e) {}
    };
    // DOM 就绪后自动挂载公告条（所有页面共用 auth.js，自动全站生效）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', Auth.initAnnouncementBar);
    } else {
        Auth.initAnnouncementBar();
    }

    window.Auth = Auth;

    } catch (e) {
        // 全局容错：auth.js 任何致命错误都不会阻塞页面
        window.Auth = {
            getCurrentUser: function() { return null; },
            isLoggedIn: function() { return false; },
            updateNavUserState: function() {},
            getUserData: function() { return null; },
            setUserData: function() {},
            register: async function() { return {success:false,message:'认证模块初始化失败'}; },
            login: async function() { return {success:false,message:'认证模块初始化失败'}; },
            logout: function() {},
            getProfile: function() { return null; },
            saveProfile: function() {},
            changePassword: async function() { return {success:false,message:'认证模块初始化失败'}; },
            openAuthModal: function() {},
            getCurrentUserInfo: function() { return null; }
        };
    }
})(window);

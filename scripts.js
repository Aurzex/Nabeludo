// ==UserScript==
// @name         Nabeludo - 智能课程管理 & 自动播放
// @namespace    https://github.com/Aurzex/Nabeludo
// @homepage     https://github.com/Aurzex/Nabeludo
// @icon         https://raw.githubusercontent.com/Aurzex/Nabeludo/main/icon.png
// @version      5.5.3
// @description  智能扫描课程、自动播放视频、自动发送学时（实时检查完成状态）。西北师大继续教育平台。
// @author       Nabeludo Contributors (zfk & Aurzex)
// @license      MIT
// @match        *://xbsd.lt-edu.net/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        window.close
// @run-at       document-body
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// ==/UserScript==

(function () {
    'use strict';

    // ========== 工具函数 ==========
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

    async function asyncPool(limit, tasks) {
        const results = [];
        const executing = new Set();
        for (const task of tasks) {
            const p = task()
                .then(res => res)
                .finally(() => executing.delete(p));
            results.push(p);
            executing.add(p);
            if (executing.size >= limit) {
                await Promise.race(executing).catch(() => {});
            }
        }
        return Promise.all(results);
    }

    // ========== 日志系统 ==========
    const LOG_MAX = 100;
    let logQueue = [];
    let logScheduled = false;
    let debugMode = false;

    function log(msg, type = 'info', force = false) {
        if (type === 'debug' && !debugMode && !force) return;

        const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const prefix = type === 'debug' ? '[DEBUG]' : '';
        logQueue.push({ text: `[${now}] ${prefix}${msg}`, type });
        if (!logScheduled) {
            logScheduled = true;
            requestAnimationFrame(() => {
                const box = document.getElementById('logBox');
                if (!box) {
                    logScheduled = false;
                    return;
                }
                const entries = logQueue.splice(0);
                const fragment = document.createDocumentFragment();
                for (let i = entries.length - 1; i >= 0; i--) {
                    const entry = entries[i];
                    const div = document.createElement('div');
                    div.className = `log-${entry.type}`;
                    div.textContent = entry.text;
                    fragment.appendChild(div);
                }
                while (box.children.length + fragment.children.length > LOG_MAX) {
                    box.lastChild.remove();
                }
                box.insertBefore(fragment, box.firstChild);
                logScheduled = false;
            });
        }
    }

    // ========== 轻量弹窗 ==========
    function showAlert(msg, title = '提示') {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:9999999;
            display:flex; align-items:center; justify-content:center;
        `;
        const box = document.createElement('div');
        box.style.cssText = `
            background:#fff; border-radius:8px; padding:24px 32px; max-width:400px;
            box-shadow:0 4px 20px rgba(0,0,0,0.15); font-family:system-ui, sans-serif;
        `;
        box.innerHTML = `
            <h3 style="margin:0 0 12px;font-size:16px">${title}</h3>
            <p style="margin:0 0 16px;font-size:14px;color:#334155">${msg}</p>
            <button style="padding:6px 24px;border:none;border-radius:4px;background:#3b82f6;color:#fff;cursor:pointer;font-size:14px">确定</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector('button').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    }

    // ========== 样式 ==========
    GM_addStyle(`
        :root {
            --nbl-bg: #fff;
            --nbl-border: #e2e8f0;
            --nbl-text: #334155;
            --nbl-muted: #64748b;
            --nbl-blue: #3b82f6;
            --nbl-green: #22c55e;
            --nbl-red: #ef4444;
            --nbl-yellow: #eab308;
            --nbl-radius: 8px;
            --nbl-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }
        #nbl-app {
            position: fixed; right: 15px; top: 15px; width: 420px; max-width: 94vw;
            background: var(--nbl-bg); border-radius: var(--nbl-radius);
            box-shadow: var(--nbl-shadow); z-index: 999999; max-height: 90vh;
            display: flex; flex-direction: column; font-family: system-ui, sans-serif;
            overflow: hidden; font-size: 13px; transition: none;
        }
        #nbl-app.mini { max-height: 38px; }
        #nbl-app.hidden { display: none; }
        .nbl-head {
            background: #f8fafc; color: var(--nbl-text); padding: 7px 12px;
            display: flex; justify-content: space-between; align-items: center;
            cursor: move; user-select: none; border-bottom: 1px solid var(--nbl-border);
            flex-shrink: 0;
        }
        .nbl-head span { font-weight: 600; font-size: 14px; }
        .nbl-head button {
            width: 26px; height: 26px; border-radius: 4px; border: none;
            background: transparent; color: var(--nbl-muted); cursor: pointer;
            font-size: 18px; line-height: 1; transition: background 0.15s;
        }
        .nbl-head button:hover { background: #e2e8f0; color: var(--nbl-text); }
        .nbl-body {
            padding: 10px; overflow-y: auto; display: flex; flex-direction: column;
            gap: 10px; background: var(--nbl-bg); max-height: calc(90vh - 40px);
        }
        .nbl-section {
            border: 1px solid var(--nbl-border); border-radius: 6px; padding: 10px;
        }
        .nbl-section h4 {
            margin: 0 0 8px; font-size: 11px; color: var(--nbl-muted);
            font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .nbl-input {
            width: 100%; padding: 6px 10px; margin-bottom: 6px;
            border: 1px solid var(--nbl-border); border-radius: 5px; font-size: 12px;
            box-sizing: border-box; outline: none; transition: border-color 0.15s;
        }
        .nbl-input:focus { border-color: var(--nbl-blue); box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
        .nbl-btn {
            padding: 6px 14px; border: 1px solid var(--nbl-border); border-radius: 5px;
            font-size: 12px; font-weight: 500; cursor: pointer; background: #fff;
            color: var(--nbl-text); transition: background 0.15s, opacity 0.15s;
            white-space: nowrap; line-height: 1.4;
        }
        .nbl-btn:hover:not(:disabled) { background: #f1f5f9; }
        .nbl-btn.blue { background: var(--nbl-blue); color: #fff; border-color: var(--nbl-blue); }
        .nbl-btn.blue:hover:not(:disabled) { background: #2563eb; }
        .nbl-btn.green { background: var(--nbl-green); color: #fff; border-color: var(--nbl-green); }
        .nbl-btn.green:hover:not(:disabled) { background: #16a34a; }
        .nbl-btn.red { background: var(--nbl-red); color: #fff; border-color: var(--nbl-red); }
        .nbl-btn.red:hover:not(:disabled) { background: #dc2626; }
        .nbl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .nbl-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .nbl-row.btw { justify-content: space-between; }
        .nbl-stats { display: flex; gap: 8px; margin: 6px 0; }
        .nbl-stats .st { flex: 1; text-align: center; padding: 6px; background: #f8fafc; border-radius: 5px; }
        .nbl-stats .st b { display: block; font-size: 16px; color: #1e293b; }
        .nbl-stats .st s { font-size: 10px; color: #94a3b8; text-decoration: none; }
        .nbl-list {
            max-height: 200px; overflow-y: auto; border: 1px solid var(--nbl-border);
            border-radius: 5px; margin: 4px 0; font-size: 11px;
        }
        .nbl-group-title {
            padding: 4px 10px; font-size: 11px; font-weight: 600;
            background: #f1f5f9; color: #475569; position: sticky; top: 0;
            z-index: 1;
        }
        .nbl-item {
            padding: 6px 10px; border-bottom: 1px solid #f1f5f9; display: flex;
            align-items: center; gap: 6px; cursor: pointer; transition: background 0.1s;
        }
        .nbl-item:last-child { border-bottom: none; }
        .nbl-item:hover { background: #f8fafc; }
        .nbl-item.sel { background: #eff6ff; border-left: 2px solid var(--nbl-blue); }
        .nbl-item.done { background: #f0fdf4; border-left: 2px solid var(--nbl-green); }
        .nbl-item.run { background: #fefce8; border-left: 2px solid var(--nbl-yellow); }
        .nbl-item .tag {
            font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 500;
        }
        .tag.done { background: #dcfce7; color: #166534; }
        .tag.ing { background: #fef9c3; color: #854d0e; }
        .debug-badge {
            font-size: 9px; padding: 1px 5px; border-radius: 4px;
            background: #e0e7ff; color: #3730a3; margin-left: 4px;
        }
        .progress-container { margin-top: 6px; }
        .progress-label {
            display: flex; justify-content: space-between; font-size: 10px;
            color: var(--nbl-muted); margin-bottom: 2px;
        }
        .progress-bar-bg {
            height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;
        }
        .progress-bar-fill {
            height: 100%; width: 0%; background: var(--nbl-blue); border-radius: 3px;
            transition: width 0.3s ease;
        }
        .progress-bar-fill.done { background: var(--nbl-green); }
        .video-detail {
            font-size: 11px; color: var(--nbl-text); margin: 4px 0;
            display: flex; flex-wrap: wrap; gap: 8px;
        }
        .video-detail span {
            background: #f8fafc; padding: 2px 6px; border-radius: 4px;
            white-space: nowrap;
        }
        .log-box {
            background: #1e293b; border-radius: 5px; padding: 8px; height: 120px;
            overflow-y: auto; font-size: 11px; color: #e2e8f0; font-family: 'JetBrains Mono', monospace;
            line-height: 1.5; word-break: break-all;
        }
        .log-info { color: #7dd3fc; }
        .log-success { color: #86efac; }
        .log-error { color: #fca5a5; }
        .log-warn { color: #fde68a; }
        .log-debug { color: #94a3b8; font-size: 10px; }
        hr { margin: 8px 0; border: 0; border-top: 1px solid var(--nbl-border); }
    `);

    // ========== 主界面 HTML ==========
    const app = document.createElement('div');
    app.id = 'nbl-app';
    document.body.appendChild(app);

    app.innerHTML = `
        <div class="nbl-head">
            <span>Nabeludo <span id="debugBadge" class="debug-badge" style="display:none;">DEBUG</span></span>
            <div>
                <button id="nbl-mini" title="最小化">&minus;</button>
                <button id="nbl-close" title="关闭">&times;</button>
            </div>
        </div>
        <div class="nbl-body">
            <div class="nbl-section">
                <h4>认证信息</h4>
                <input class="nbl-input" id="tokenInput" placeholder="Token（自动获取）">
                <input class="nbl-input" id="userIdInput" placeholder="用户ID（自动获取）">
                <div class="nbl-row btw">
                    <button class="nbl-btn blue" id="scanBtn">扫描课程</button>
                    <button class="nbl-btn" id="clearBtn">清空</button>
                </div>
                <div class="nbl-stats">
                    <div class="st"><b id="statCourse">0</b><s>课程包</s></div>
                    <div class="st"><b id="statVideo">0</b><s>视频</s></div>
                    <div class="st"><b id="statDone">0</b><s>已完成</s></div>
                    <div class="st"><b id="statSent">0</b><s>已发送</s></div>
                </div>
            </div>
            <div class="nbl-section">
                <h4>视频列表</h4>
                <div class="nbl-list" id="videoList"></div>
                <div class="nbl-row btw" style="margin-top:4px">
                    <button class="nbl-btn blue" id="sendOneBtn" disabled>发送当前</button>
                    <button class="nbl-btn green" id="autoSendBtn">自动发送</button>
                    <button class="nbl-btn red" id="stopSendBtn" disabled>停止</button>
                </div>
                <div id="progressContainer" style="display:none;" class="progress-container">
                    <div class="progress-label">
                        <span id="progressText">进度 0/0</span>
                        <span id="progressPercent">0%</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div id="progressFill" class="progress-bar-fill" style="width:0%"></div>
                    </div>
                    <div class="video-detail" id="videoDetail"></div>
                </div>
                <div style="font-size:11px;color:var(--nbl-muted);margin-top:4px;text-align:center" id="progressInfo">等待操作</div>
                <hr>
                <div class="nbl-row btw">
                    <button class="nbl-btn blue" id="autoPlayBtn">自动播放</button>
                    <button class="nbl-btn red" id="stopAutoPlayBtn" disabled>停止播放</button>
                    <button class="nbl-btn" id="playBtn">播放</button>
                    <button class="nbl-btn" id="refreshBtn">刷新</button>
                </div>
            </div>
            <div class="nbl-section">
                <div class="nbl-row btw" style="margin-bottom:4px">
                    <h4 style="margin:0">日志</h4>
                    <button class="nbl-btn" id="clearLogBtn" style="font-size:10px;padding:2px 8px;">清空</button>
                </div>
                <div class="log-box" id="logBox"></div>
            </div>
        </div>
    `;

    // ========== 核心逻辑 ==========
    function waitForCrypto(cb, tries = 0) {
        if (window.CryptoJS) {
            cb();
            return;
        }
        if (tries > 100) {
            log('CryptoJS 加载超时，脚本无法运行', 'error');
            return;
        }
        setTimeout(() => waitForCrypto(cb, tries + 1), 200);
    }

    waitForCrypto(() => {
        const CryptoJS = window.CryptoJS;
        const CRYPTO_KEY = CryptoJS.enc.Utf8.parse("Dcv3400887638100");
        const CRYPTO_IV = CryptoJS.enc.Utf8.parse("Dcit400887638100");

        const STATUS = { DONE: 3, IN_PROGRESS: 2 };

        const S = {
            token: '',
            userId: '',
            projectId: '',
            courses: [],
            videos: [],
            selectedVideo: null,
            sendCount: 0,
            autoSending: false,
            autoTimer: null,
            sendStartTime: null,
            pendingOrder: [],
            vidIndex: -1,
            vidSends: 0,
            vidTotalSends: 0,
            failCount: 0,
            sendingLock: false,
            sendingVideo: null,
            cidCache: {},
            statusCache: {},
            progressCache: {},
            autoPlayRunning: false,
            autoPlayTimer: null,
            autoPlayWaitTime: 0,
            uiTimer: null
        };

        const DOM = {
            tokenInput: $('#tokenInput'),
            userIdInput: $('#userIdInput'),
            scanBtn: $('#scanBtn'),
            clearBtn: $('#clearBtn'),
            sendOneBtn: $('#sendOneBtn'),
            autoSendBtn: $('#autoSendBtn'),
            stopSendBtn: $('#stopSendBtn'),
            autoPlayBtn: $('#autoPlayBtn'),
            stopAutoPlayBtn: $('#stopAutoPlayBtn'),
            playBtn: $('#playBtn'),
            refreshBtn: $('#refreshBtn'),
            videoList: $('#videoList'),
            progressInfo: $('#progressInfo'),
            statCourse: $('#statCourse'),
            statVideo: $('#statVideo'),
            statDone: $('#statDone'),
            statSent: $('#statSent'),
            logBox: $('#logBox'),
            miniBtn: $('#nbl-mini'),
            closeBtn: $('#nbl-close'),
            clearLogBtn: $('#clearLogBtn'),
            body: $('.nbl-body'),
            debugBadge: $('#debugBadge'),
            progressContainer: $('#progressContainer'),
            progressText: $('#progressText'),
            progressPercent: $('#progressPercent'),
            progressFill: $('#progressFill'),
            videoDetail: $('#videoDetail')
        };

        GM_registerMenuCommand('切换调试模式', () => {
            debugMode = !debugMode;
            DOM.debugBadge.style.display = debugMode ? 'inline' : 'none';
            log(`调试模式: ${debugMode ? '开启' : '关闭'}`, 'info', true);
        });

        function autoGetCredentials() {
            log('尝试自动获取凭证...', 'debug');
            let token = '', userId = '';
            try {
                const raw = localStorage.getItem('userInfo');
                if (raw) {
                    const info = JSON.parse(raw);
                    token = info.token || '';
                    userId = String(info.id || '');
                    log(`从 localStorage 获取: token=${token ? '***' : '无'}, userId=${userId || '无'}`, 'debug');
                }
            } catch (e) {
                log(`解析 userInfo 失败: ${e.message}`, 'error');
            }
            return { token, userId };
        }

        async function api(url, headers = {}) {
            const reqHeaders = { ...headers, 'user-agent': navigator.userAgent };
            log(`API请求: ${url.split('?')[0].split('/').slice(-1)[0]}`, 'debug');
            try {
                const res = await fetch(url, { headers: reqHeaders });
                const data = await res.json();
                log(`API响应: code=${data.code}`, 'debug');
                if (data.code !== 900) {
                    log(`接口错误: ${data.msg || '未知错误'}`, 'error');
                    throw new Error(data.msg || '接口错误');
                }
                return data.data;
            } catch (e) {
                log(`API请求异常: ${e.message}`, 'error');
                return null;
            }
        }

        async function scanAll() {
            const token = DOM.tokenInput.value.trim();
            const userId = DOM.userIdInput.value.trim();
            if (!token || !userId) { log('请先登录平台获取凭证', 'error'); return; }
            S.token = token;
            S.userId = userId;
            GM_setValue('nbl_token', token);
            GM_setValue('nbl_userId', userId);
            DOM.scanBtn.disabled = true;
            log('开始扫描课程项目...', 'info');

            const projData = await api('https://xbsd.lt-edu.net/api/v1/my/project?limit=6', { token, id: userId });
            if (!projData?.data?.length) {
                DOM.scanBtn.disabled = false;
                log('未找到培训项目', 'error');
                return;
            }
            S.projectId = projData.data[0].project_id;
            log(`当前项目: ${projData.data[0].title} (ID:${S.projectId})`, 'success');

            const mainData = await api(`https://xbsd.lt-edu.net/api/v1/my/project/main/${S.projectId}`, { token, id: userId });
            if (!mainData?.taskLevel?.length) { DOM.scanBtn.disabled = false; log('无任务阶段', 'error'); return; }
            const levelId = mainData.taskLevel[0].id;

            const levelData = await api(`https://xbsd.lt-edu.net/api/v1/my/project/taskLevel/${levelId}`, { token, id: userId });
            const courseList = levelData?.taskTypeList?.[0]?.taskList?.[0]?.courseList || [];
            S.courses = courseList.map(c => ({ id: c.id, name: c.name, hour: c.hour, status: c.status }));
            DOM.statCourse.textContent = S.courses.length;
            log(`发现 ${S.courses.length} 个课程包`, 'success');

            S.videos = [];
            S.cidCache = {};
            S.statusCache = {};
            S.progressCache = {};

            for (const course of S.courses) {
                log(`获取课程包视频: ${course.name}`, 'debug');
                const catalog = await api(`https://xbsd.lt-edu.net/api/v1/my/getCourseCatalog/${course.id}`, { token, id: userId });
                if (!catalog?.length) continue;

                const extractStatus = (items) => {
                    for (const item of items) {
                        if (item.id != null && item.status != null) S.statusCache[item.id] = item.status;
                        if (item.sub?.length) extractStatus(item.sub);
                    }
                };
                extractStatus(catalog);

                const allIds = [];
                (function walk(items) { items.forEach(i => { allIds.push(i.id); if (i.sub?.length) walk(i.sub); }); })(catalog);
                if (!allIds.length) continue;

                const tasks = allIds.map(cid => () =>
                    api(`https://xbsd.lt-edu.net/api/v1/my/courseCatalog/${cid}?user_course_id=${course.id}`, { token, id: userId })
                        .then(detail => {
                            if (detail?.itemList) {
                                detail.itemList.filter(i => i.type === 3 && i.id).forEach(i => {
                                    S.videos.push({
                                        itemId: i.id,
                                        title: i.name,
                                        lengthStr: i.video_length || `${i.length || 0}秒`,
                                        lengthSeconds: i.length || 0,
                                        userCourseId: course.id,
                                        courseTitle: course.name,
                                        resourceId: i.resource_id,
                                        projectId: S.projectId,
                                        userId: S.userId
                                    });
                                    if (S.statusCache[i.id] == null && i.status != null) S.statusCache[i.id] = i.status;
                                });
                            }
                        })
                );
                await asyncPool(5, tasks);
            }

            DOM.statVideo.textContent = S.videos.length;
            const doneCount = Object.values(S.statusCache).filter(s => s === STATUS.DONE).length;
            log(`共获取 ${S.videos.length} 个视频片段，已完成 ${doneCount} 个`, 'success');
            updateVideoList();
            DOM.statDone.textContent = doneCount;
            DOM.scanBtn.disabled = false;
        }

        function buildVideoListHTML() {
            if (!S.videos.length) {
                return '<div style="padding:20px;text-align:center;color:#94a3b8">点击"扫描课程"获取列表</div>';
            }

            const doneVids = [];
            const inProgressVids = [];
            const notStartedVids = [];

            S.videos.forEach((v, idx) => {
                const st = S.statusCache[v.itemId];
                if (st === STATUS.DONE) doneVids.push(idx);
                else if (st === STATUS.IN_PROGRESS) inProgressVids.push(idx);
                else notStartedVids.push(idx);
            });

            const renderItem = (idx) => {
                const v = S.videos[idx];
                const status = S.statusCache[v.itemId];
                let cls = '', tag = '';
                if (status === STATUS.DONE) {
                    cls = 'done';
                    tag = '<span class="tag done">完成</span>';
                } else if (status === STATUS.IN_PROGRESS) {
                    tag = '<span class="tag ing">进行中</span>';
                }
                if (S.autoSending && S.sendingVideo === v) cls += ' run';
                if (S.selectedVideo === v) cls += ' sel';

                const checked = S.selectedVideo === v ? 'checked' : '';
                const disabled = status === STATUS.DONE ? 'disabled' : '';
                const title = `${v.courseTitle} - ${v.title}`;
                const duration = v.lengthStr;
                const progress = S.progressCache[v.itemId] || 0;
                const percent = v.lengthSeconds > 0 ? Math.round((progress / v.lengthSeconds) * 100) : 0;
                return `
                    <div class="nbl-item ${cls}" data-idx="${idx}">
                        <input type="radio" name="vidSel" ${checked} ${disabled}>
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${title}">${title}</span>
                        <small style="color:#94a3b8;white-space:nowrap;">${duration} (${percent}%)</small>
                        ${tag}
                    </div>`;
            };

            let html = '';
            if (inProgressVids.length) {
                html += `<div class="nbl-group-title">进行中 (${inProgressVids.length})</div>`;
                inProgressVids.forEach(idx => { html += renderItem(idx); });
            }
            if (notStartedVids.length) {
                html += `<div class="nbl-group-title">未开始 (${notStartedVids.length})</div>`;
                notStartedVids.forEach(idx => { html += renderItem(idx); });
            }
            if (doneVids.length) {
                html += `<div class="nbl-group-title">已完成 (${doneVids.length})</div>`;
                doneVids.forEach(idx => { html += renderItem(idx); });
            }
            return html;
        }

        function updateVideoList() {
            DOM.videoList.innerHTML = buildVideoListHTML();
            DOM.statVideo.textContent = S.videos.length;
            const doneCount = Object.values(S.statusCache).filter(s => s === STATUS.DONE).length;
            DOM.statDone.textContent = doneCount;
        }

        DOM.videoList.addEventListener('click', (e) => {
            const item = e.target.closest('.nbl-item');
            if (!item) return;
            const idx = parseInt(item.dataset.idx, 10);
            if (isNaN(idx)) return;
            const video = S.videos[idx];
            if (!video || S.statusCache[video.itemId] === STATUS.DONE) return;
            S.selectedVideo = video;
            updateVideoList();
            DOM.sendOneBtn.disabled = false;
            updateProgressInfo(video);
        });

        function formatTime(seconds) {
            if (seconds < 60) return `${seconds}秒`;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}分${secs}秒`;
        }

        function updateProgressInfo(video = null) {
            if (!video) {
                DOM.progressContainer.style.display = 'none';
                return;
            }
            DOM.progressContainer.style.display = 'block';
            const currentProgress = S.progressCache[video.itemId] || 0;
            const total = video.lengthSeconds;
            const percent = total > 0 ? Math.round((currentProgress / total) * 100) : 0;

            DOM.progressFill.style.width = `${percent}%`;
            DOM.progressFill.className = `progress-bar-fill${percent >= 100 ? ' done' : ''}`;
            DOM.progressText.textContent = `观看进度 ${formatTime(currentProgress)} / ${formatTime(total)}`;
            DOM.progressPercent.textContent = `${percent}%`;

            const remaining = Math.max(0, total - currentProgress);
            DOM.videoDetail.innerHTML = `
                <span>课程包: ${video.courseTitle}</span>
                <span>视频: ${video.title}</span>
                <span>总时长: ${video.lengthStr}</span>
                <span>已观看: ${formatTime(currentProgress)}</span>
                <span>剩余: ${formatTime(remaining)}</span>
                ${S.autoSending && S.sendingVideo === video ? `<span>发送次数: ${S.vidSends}</span>` : ''}
            `;
        }

        // 获取视频详细信息（CID、状态、进度），强制从服务器获取最新状态
        async function checkVideoStatus(video) {
            log(`检查视频状态: ${video.title}`, 'debug');
            const data = await api(
                `https://xbsd.lt-edu.net/api/v1/my/courseItem/${video.itemId}?user_course_id=${video.userCourseId}`,
                { token: S.token, id: S.userId }
            );
            if (data?.cid != null) {
                S.cidCache[video.itemId] = data.cid;
                if (data.status != null) {
                    const oldStatus = S.statusCache[video.itemId];
                    S.statusCache[video.itemId] = data.status;
                    if (oldStatus !== data.status) {
                        log(`状态变更: ${video.title} ${oldStatus} -> ${data.status}`, 'debug');
                    }
                }
                const progress = data.current_time_length || 0;
                S.progressCache[video.itemId] = progress;
                updateVideoList();
                log(`状态检查结果: status=${data.status}, progress=${progress}s`, 'debug');
                return { cid: data.cid, status: data.status, current_time_length: progress };
            }
            log(`状态检查失败: ${video.title}`, 'warn');
            return null;
        }

        async function sendRecord(video) {
            log(`准备发送: ${video.courseTitle} - ${video.title}`, 'debug');

            // 发送前先检查状态
            const info = await checkVideoStatus(video);
            if (!info?.cid) { log('获取CID失败', 'error'); return false; }
            if (info.status === STATUS.DONE) {
                log(`${video.courseTitle} - ${video.title} 已完成，跳过`, 'info');
                return { completed: true };
            }

            const timestamp = Math.floor(Date.now() / 1000);
            const raw = `${video.userId}!@@!${video.itemId}!@@!${video.userCourseId}!@@!${video.projectId}!@@!${info.cid}!@@!${timestamp}`;
            const enc = CryptoJS.AES.encrypt(raw, CRYPTO_KEY, { iv: CRYPTO_IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString();

            const res = await fetch('https://xbsd.lt-edu.net/api/v1/courseVideo/compV3', {
                method: 'POST',
                headers: { 'content-type': 'application/json;charset=UTF-8', id: video.userId, token: S.token },
                body: JSON.stringify({ msg: encodeURIComponent(enc) })
            });
            const data = await res.json();
            log(`发送响应: code=${data.code}, msg=${data.msg}`, 'debug');

            if (data.code === 900) {
                S.sendCount++;
                S.vidSends++;

                if (data.data?.now != null) {
                    S.progressCache[video.itemId] = data.data.now;
                }

                // 发送后立即检查视频是否完成
                const updatedInfo = await checkVideoStatus(video);
                const completed = updatedInfo?.status === STATUS.DONE;

                if (completed) {
                    log(`${video.courseTitle} - ${video.title} 已完成！`, 'success');
                } else {
                    const remain = Math.max(0, video.lengthSeconds - (updatedInfo?.current_time_length || 0));
                    log(`发送成功: ${video.title} (剩余约${formatTime(remain)})`, 'success');
                }

                updateProgressInfo(video);
                return { completed, now: data.data?.now };
            } else {
                log(`发送失败: ${data.msg || '未知错误'}`, 'error');
                return false;
            }
        }

        function buildPendingOrder() {
            const inProgress = [];
            const notStarted = [];
            S.videos.forEach((v, idx) => {
                const st = S.statusCache[v.itemId];
                if (st === STATUS.DONE) return;
                if (st === STATUS.IN_PROGRESS) inProgress.push(idx);
                else notStarted.push(idx);
            });
            log(`构建发送队列: 进行中${inProgress.length}, 未开始${notStarted.length}`, 'debug');
            return [...inProgress, ...notStarted];
        }

        function scheduleNextSend(delay = 60000) {
            if (!S.autoSending) return;
            log(`下次发送计划: ${delay/1000}秒后`, 'debug');
            S.autoTimer = setTimeout(autoSendLoop, delay);
        }

        async function autoSendLoop() {
            if (!S.autoSending || !S.videos.length) return;
            if (S.sendingLock) {
                scheduleNextSend(5000);
                return;
            }
            if (S.failCount >= 5) {
                log('连续失败过多，自动发送已停止', 'error');
                stopAutoSend();
                return;
            }

            // 重建队列（过滤已完成）
            if (S.pendingOrder.length === 0 || S.vidIndex >= S.pendingOrder.length) {
                S.pendingOrder = buildPendingOrder();
                S.vidIndex = -1;
                if (S.pendingOrder.length === 0) {
                    log('所有视频均已完成！', 'success');
                    stopAutoSend();
                    return;
                }
            }

            if (S.vidIndex === -1) {
                S.vidIndex = 0;
            }

            // 跳过已完成的
            while (S.vidIndex < S.pendingOrder.length) {
                const idx = S.pendingOrder[S.vidIndex];
                const v = S.videos[idx];
                if (S.statusCache[v.itemId] === STATUS.DONE) {
                    log(`跳过已完成视频: ${v.title}`, 'debug');
                    S.pendingOrder.splice(S.vidIndex, 1);
                    continue;
                }
                break;
            }

            if (S.vidIndex >= S.pendingOrder.length) {
                log('所有视频均已完成！', 'success');
                stopAutoSend();
                return;
            }

            const videoIdx = S.pendingOrder[S.vidIndex];
            const video = S.videos[videoIdx];
            S.sendingVideo = video;
            updateVideoList();
            updateProgressInfo(video);

            S.sendingLock = true;
            const result = await sendRecord(video);
            S.sendingLock = false;

            if (result) {
                S.failCount = 0;
                if (result.completed) {
                    // 视频已完成，移出队列，跳转下一个
                    S.pendingOrder.splice(S.vidIndex, 1);
                    S.sendingVideo = null;
                    log(`视频完成，队列剩余 ${S.pendingOrder.length} 个`, 'debug');
                    if (S.pendingOrder.length === 0) {
                        log('所有视频均已完成！', 'success');
                        stopAutoSend();
                        return;
                    }
                    // vidIndex 不变，因为 splice 后当前索引指向下一个视频
                    if (S.vidIndex >= S.pendingOrder.length) {
                        S.vidIndex = 0;
                    }
                }
                // 如果未完成，继续当前视频（vidIndex 不变）
            } else {
                S.failCount++;
                log(`连续失败次数: ${S.failCount}`, 'debug');
            }

            updateUI();
            scheduleNextSend();
        }

        function startAutoSend() {
            if (S.autoSending || !S.videos.length) return;
            log('启动自动发送模式', 'info');
            S.autoSending = true;
            S.pendingOrder = buildPendingOrder();
            if (S.pendingOrder.length === 0) {
                log('没有可发送的视频', 'warn');
                return;
            }
            S.vidIndex = -1;
            S.failCount = 0;
            S.sendStartTime = Date.now();
            DOM.autoSendBtn.disabled = true;
            DOM.stopSendBtn.disabled = false;
            DOM.sendOneBtn.disabled = true;
            S.sendingVideo = null;
            scheduleNextSend(0);

            if (S.uiTimer) clearInterval(S.uiTimer);
            S.uiTimer = setInterval(() => {
                if (!S.sendStartTime) return;
                const sec = Math.floor((Date.now() - S.sendStartTime) / 1000);
                const h = String(Math.floor(sec / 3600)).padStart(2, '0');
                const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
                const s = String(sec % 60).padStart(2, '0');
                DOM.progressInfo.textContent = `自动发送中 | 已发${S.sendCount}次 | ${h}:${m}:${s}`;
            }, 1000);
        }

        function stopAutoSend() {
            log('停止自动发送模式', 'info');
            S.autoSending = false;
            if (S.autoTimer) { clearTimeout(S.autoTimer); S.autoTimer = null; }
            if (S.uiTimer) { clearInterval(S.uiTimer); S.uiTimer = null; }
            S.pendingOrder = [];
            S.vidIndex = -1;
            S.sendingVideo = null;
            DOM.autoSendBtn.disabled = false;
            DOM.stopSendBtn.disabled = true;
            DOM.sendOneBtn.disabled = !S.selectedVideo;
            DOM.progressInfo.textContent = '已停止';
            DOM.progressContainer.style.display = 'none';
            updateVideoList();
        }

        function updateUI() {
            DOM.statSent.textContent = S.sendCount;
            updateVideoList();
            if (S.sendingVideo) updateProgressInfo(S.sendingVideo);
        }

        // ========== 自动播放 ==========
        function getVideo() { return document.querySelector('video'); }
        function playVideo() {
            const v = getVideo();
            if (v) {
                v.volume = 0;
                setTimeout(() => v.play().catch(() => {}), 200);
            }
        }

        function startAutoPlayCourse() {
            if (S.autoPlayRunning) return;
            if (!location.href.includes('/index/classStudy?')) {
                log('请进入课程播放页面', 'error');
                return;
            }
            S.autoPlayRunning = true;
            S.autoPlayWaitTime = 0;
            DOM.autoPlayBtn.disabled = true;
            DOM.stopAutoPlayBtn.disabled = false;

            const next = document.querySelector(".video_round:not(.study)");
            if (!next) { log('当前课程已完成', 'info'); stopAutoPlayCourse(); return; }
            next.nextElementSibling?.click();
            setTimeout(() => {
                const btn = document.querySelector(".el-message-box button");
                if (btn && btn.textContent.includes('确定')) btn.click();
            }, 500);
            log('自动播放已启动', 'success');

            if (S.autoPlayTimer) clearInterval(S.autoPlayTimer);
            S.autoPlayTimer = setInterval(autoPlayLoop, 2000);
        }

        function stopAutoPlayCourse() {
            S.autoPlayRunning = false;
            if (S.autoPlayTimer) { clearInterval(S.autoPlayTimer); S.autoPlayTimer = null; }
            S.autoPlayWaitTime = 0;
            DOM.autoPlayBtn.disabled = false;
            DOM.stopAutoPlayBtn.disabled = true;
            log('自动播放已停止', 'info');
        }

        function autoPlayLoop() {
            if (!S.autoPlayRunning) return;
            if (S.autoPlayWaitTime > 0) { S.autoPlayWaitTime -= 2; return; }
            const video = getVideo();
            if (!video) return;
            video.volume = 0;
            if (video.duration > 0 && video.currentTime + 5 >= video.duration) {
                S.autoPlayWaitTime = 15;
                log('视频即将结束，准备切换到下一集', 'info');
                setTimeout(() => { top.location.reload(); }, 3000);
                return;
            }
            if (video.paused) { video.play().catch(() => {}); }
        }

        window.addEventListener('beforeunload', () => {
            if (S.autoTimer) clearTimeout(S.autoTimer);
            if (S.uiTimer) clearInterval(S.uiTimer);
            if (S.autoPlayTimer) clearInterval(S.autoPlayTimer);
        });

        // ========== 初始化 ==========
        function init() {
            const { token: autoToken, userId: autoUserId } = autoGetCredentials();
            if (autoToken) {
                DOM.tokenInput.value = autoToken;
                S.token = autoToken;
                log('已自动获取 Token', 'success');
            } else {
                const savedToken = GM_getValue('nbl_token', '');
                if (savedToken) DOM.tokenInput.value = savedToken;
            }
            if (autoUserId) {
                DOM.userIdInput.value = autoUserId;
                S.userId = autoUserId;
                log('已自动获取用户 ID', 'success');
            } else {
                const savedUserId = GM_getValue('nbl_userId', '');
                if (savedUserId) DOM.userIdInput.value = savedUserId;
            }

            const origSetItem = localStorage.setItem;
            localStorage.setItem = function (key, value) {
                origSetItem.apply(this, arguments);
                if (key === 'userInfo') {
                    try {
                        const info = JSON.parse(value);
                        if (info.token && DOM.tokenInput.value !== info.token) {
                            DOM.tokenInput.value = info.token;
                            S.token = info.token;
                        }
                        if (info.id && DOM.userIdInput.value !== String(info.id)) {
                            DOM.userIdInput.value = String(info.id);
                            S.userId = String(info.id);
                        }
                    } catch (e) {}
                }
            };

            DOM.scanBtn.addEventListener('click', scanAll);
            DOM.clearBtn.addEventListener('click', () => {
                DOM.tokenInput.value = '';
                DOM.userIdInput.value = '';
                S.courses = []; S.videos = []; S.cidCache = {}; S.statusCache = {}; S.progressCache = {};
                S.selectedVideo = null;
                updateVideoList();
                updateUI();
                DOM.progressContainer.style.display = 'none';
                log('已清空所有数据', 'info');
            });
            DOM.sendOneBtn.addEventListener('click', async () => {
                if (!S.selectedVideo) return;
                DOM.sendOneBtn.disabled = true;
                S.sendingVideo = S.selectedVideo;
                updateProgressInfo(S.selectedVideo);
                await sendRecord(S.selectedVideo);
                S.sendingVideo = null;
                DOM.sendOneBtn.disabled = !S.selectedVideo;
                updateUI();
                DOM.progressContainer.style.display = 'none';
            });
            DOM.autoSendBtn.addEventListener('click', startAutoSend);
            DOM.stopSendBtn.addEventListener('click', stopAutoSend);
            DOM.autoPlayBtn.addEventListener('click', startAutoPlayCourse);
            DOM.stopAutoPlayBtn.addEventListener('click', stopAutoPlayCourse);
            DOM.playBtn.addEventListener('click', playVideo);
            DOM.refreshBtn.addEventListener('click', () => top.location.reload());
            DOM.clearLogBtn.addEventListener('click', () => {
                DOM.logBox.innerHTML = '';
                log('日志已清空', 'info');
            });

            // 拖拽
            const head = document.querySelector('.nbl-head');
            let dragging = false, offX, offY;
            head.addEventListener('mousedown', function (e) {
                if (e.target.tagName === 'BUTTON') return;
                dragging = true;
                const rect = app.getBoundingClientRect();
                offX = e.clientX - rect.left;
                offY = e.clientY - rect.top;
                app.style.transition = 'none';
                this.style.cursor = 'grabbing';
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!dragging) return;
                const x = e.clientX - offX;
                const y = e.clientY - offY;
                app.style.left = Math.min(Math.max(x, 0), window.innerWidth - app.offsetWidth) + 'px';
                app.style.top = Math.min(Math.max(y, 0), window.innerHeight - app.offsetHeight) + 'px';
                app.style.right = 'auto';
                app.style.bottom = 'auto';
            });
            document.addEventListener('mouseup', () => {
                if (!dragging) return;
                dragging = false;
                head.style.cursor = 'move';
                app.style.transition = '';
            });

            DOM.miniBtn.addEventListener('click', () => {
                app.classList.toggle('mini');
                DOM.body.style.display = app.classList.contains('mini') ? 'none' : '';
                DOM.miniBtn.textContent = app.classList.contains('mini') ? '+' : '\u2212';
            });
            DOM.closeBtn.addEventListener('click', () => app.classList.toggle('hidden'));

            log('Nabeludo v5.5.3 已就绪', 'success');
        }

        init();
    });
})();

// ==UserScript==
// @name         课程视频时长管理工具
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  管理课程视频时长，自动发送观看进度
// @author       Aurzex
// @match        *://xbsd.lt-edu.net/*
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// ==/UserScript==

(function() {
    'use strict';

    // 创建应用容器
    const appContainer = document.createElement('div');
    appContainer.id = 'video-manager-app';
    document.body.appendChild(appContainer);

    // 添加样式 - 缩小窗口并优化布局
    GM_addStyle(`
        #video-manager-app {
            position: fixed;
            right: 20px;
            top: 20px;
            width: 100%;
            max-width: 650px; /* 缩小窗口宽度 */
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
            overflow: hidden;
            z-index: 999999;
            transition: all 0.2s ease;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
        }

        #video-manager-app.minimized {
            max-height: 50px;
        }

        #video-manager-app.hidden {
            display: none;
        }

        .header {
            background: linear-gradient(to right, #3b82f6, #2563eb);
            color: white;
            padding: 12px 20px; /* 减少内边距 */
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: relative;
            cursor: move;
            user-select: none;
        }

        .header-title {
            font-size: 16px; /* 缩小标题字体 */
            font-weight: 600;
            letter-spacing: 0.3px;
        }

        .author {
            position: absolute;
            bottom: 5px;
            right: 20px;
            font-size: 12px;
            opacity: 0.9;
        }

        .header-controls {
            display: flex;
            gap: 8px;
        }

        .control-btn {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
        }

        .control-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .main-content {
            padding: 15px; /* 减少内边距 */
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px; /* 减少间距 */
            overflow-y: auto;
        }

        @media (max-width: 600px) {
            .main-content {
                grid-template-columns: 1fr;
            }
        }

        .panel {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            padding: 15px; /* 减少内边距 */
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        .panel-title {
            font-size: 15px; /* 缩小标题字体 */
            font-weight: 600;
            color: #1e40af;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid #dbeafe;
            display: flex;
            align-items: center;
        }

        .panel-title::before {
            content: '';
            display: inline-block;
            width: 4px;
            height: 18px;
            background: #3b82f6;
            border-radius: 2px;
            margin-right: 8px;
        }

        .input-group {
            margin-bottom: 12px; /* 减少间距 */
        }

        .input-label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            color: #4b5563;
            font-size: 13px; /* 缩小字体 */
        }

        .input-label span {
            color: #ef4444;
        }

        .input-field {
            width: 100%;
            padding: 10px 12px; /* 减少内边距 */
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 13px; /* 缩小字体 */
            transition: all 0.2s;
            background: #f9fafb;
        }

        .input-field:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
            background: white;
        }

        .btn-group {
            display: flex;
            gap: 8px; /* 减少间距 */
            margin: 15px 0 5px;
            flex-wrap: wrap;
        }

        .btn {
            padding: 8px 12px; /* 减少内边距 */
            border: none;
            border-radius: 6px;
            font-size: 13px; /* 缩小字体 */
            font-weight: 500;
            cursor: pointer;
            flex: 1;
            min-width: 100px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }

        .btn-primary {
            background: #3b82f6;
            color: white;
        }

        .btn-primary:hover:not(:disabled) {
            background: #2563eb;
        }

        .btn-success {
            background: #10b981;
            color: white;
        }

        .btn-success:hover:not(:disabled) {
            background: #059669;
        }

        .btn-danger {
            background: #ef4444;
            color: white;
        }

        .btn-danger:hover:not(:disabled) {
            background: #dc2626;
        }

        .btn-secondary {
            background: #f1f5f9;
            color: #334155;
        }

        .btn-secondary:hover:not(:disabled) {
            background: #e2e8f0;
        }

        .video-list {
            max-height: 200px; /* 减少高度 */
            overflow-y: auto;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            margin: 6px 0;
            flex: 1;
        }

        .video-item {
            padding: 10px; /* 减少内边距 */
            border-bottom: 1px solid #f3f4f6;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
            cursor: pointer;
        }

        .video-item:hover {
            background: #f9fafb;
        }

        .video-item.selected {
            background: #dbeafe;
            border-left: 3px solid #3b82f6;
        }

        .video-item.processing {
            background: #fef3c7;
            border-left: 3px solid #f59e0b;
        }

        .video-item.completed {
            background: #dcfce7;
            border-left: 3px solid #10b981;
        }

        .video-item.failed {
            background: #fee2e2;
            border-left: 3px solid #ef4444;
        }

        .video-info {
            flex: 1;
            overflow: hidden;
        }

        .video-title {
            font-weight: 500;
            font-size: 13px; /* 缩小字体 */
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2px;
        }

        .video-meta {
            font-size: 11px; /* 缩小字体 */
            color: #6b7280;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .stats-container {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px; /* 减少间距 */
            margin: 10px 0;
        }

        .stat-card {
            background: #f9fafb;
            border-radius: 6px;
            padding: 8px; /* 减少内边距 */
            text-align: center;
        }

        .stat-label {
            font-size: 12px; /* 缩小字体 */
            color: #6b7280;
            margin-bottom: 3px;
        }

        .stat-value {
            font-size: 15px; /* 缩小字体 */
            font-weight: 600;
            color: #1e40af;
        }

        .log-container {
            flex: 1;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px; /* 减少内边距 */
            overflow-y: auto;
            font-size: 12px; /* 缩小字体 */
            min-height: 120px;
        }

        .log-entry {
            margin: 5px 0;
            padding: 3px 0;
            display: flex;
            align-items: flex-start;
            line-height: 1.4;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
            margin-top: 4px;
            flex-shrink: 0;
        }

        .status-info { background: #3b82f6; }
        .status-success { background: #10b981; }
        .status-error { background: #ef4444; }
        .status-warning { background: #f59e0b; }
        .status-processing { background: #8b5cf6; }

        .auto-controls {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 10px 0;
            padding: 10px; /* 减少内边距 */
            background: #f1f5f9;
            border-radius: 6px;
        }

        .timer-display {
            font-size: 13px; /* 缩小字体 */
            color: #334155;
            font-weight: 500;
        }

        .progress-info {
            font-size: 12px; /* 缩小字体 */
            color: #4b5563;
            margin: 5px 0;
            line-height: 1.4;
            background: #f3f4f6;
            padding: 8px; /* 减少内边距 */
            border-radius: 6px;
        }

        .empty-state {
            text-align: center;
            padding: 20px 10px; /* 减少内边距 */
            color: #6b7280;
        }

        .empty-state i {
            font-size: 30px;
            margin-bottom: 10px;
            color: #d1d5db;
        }

        .empty-state p {
            margin-top: 5px;
            font-size: 13px;
        }
    `);

    // 设置HTML内容
    appContainer.innerHTML = `
        <div class="header">
            <div class="header-title">课程视频时长管理工具</div>
            <div class="author">开发：Aurzex</div>
            <div class="header-controls">
                <button class="control-btn" id="minimize-btn">−</button>
                <button class="control-btn" id="close-btn">×</button>
            </div>
        </div>

        <div class="main-content">
            <div class="panel">
                <div class="panel-title">参数配置</div>

                <div class="input-group">
                    <label class="input-label" for="userToken">Token</label>
                    <input type="text" id="userToken" class="input-field" placeholder="输入你的token">
                </div>

                <div class="input-group">
                    <label class="input-label" for="userId">用户ID <span>*</span></label>
                    <input type="text" id="userId" class="input-field" placeholder="必须输入用户ID">
                </div>

                <div class="input-group">
                    <label class="input-label" for="coursePackageIds">课程包ID（多个用逗号分隔）</label>
                    <textarea id="coursePackageIds" class="input-field" placeholder="例如：71427846,71427837" rows="2"></textarea>
                </div>

                <div class="btn-group">
                    <button class="btn btn-primary" id="fetchCoursesBtn">
                        <i class="icon">📋</i> 获取课程视频
                    </button>
                    <button class="btn btn-secondary" id="clearInputBtn">
                        <i class="icon">🗑️</i> 清空输入
                    </button>
                </div>

                <div class="stats-container">
                    <div class="stat-card">
                        <div class="stat-label">总视频数</div>
                        <div class="stat-value" id="totalVideoCount">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">已获取CID</div>
                        <div class="stat-value" id="cidCount">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">已完成</div>
                        <div class="stat-value" id="completedCount">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">已发送</div>
                        <div class="stat-value" id="sendCount">0</div>
                    </div>
                </div>
            </div>

            <div class="panel">
                <div class="panel-title">视频选择</div>

                <div class="video-list" id="videoSelection">
                    <div class="empty-state">
                        <i>📺</i>
                        <p>请先获取课程视频</p>
                    </div>
                </div>

                <div class="progress-info" id="autoProgressInfo">
                    状态：未运行 - 自动发送将按视频时长每分钟发送一次
                </div>

                <div class="auto-controls">
                    <div class="timer-display">
                        运行时间: <span id="runningTime">00:00:00</span>
                    </div>
                    <div class="btn-group" style="margin:0; gap:5px;">
                        <button class="btn btn-success" id="startAutoBtn">
                            <i class="icon">▶️</i> 开始
                        </button>
                        <button class="btn btn-danger" id="stopAutoBtn" disabled>
                            <i class="icon">⏹️</i> 停止
                        </button>
                    </div>
                </div>

                <button class="btn btn-primary" id="startSendBtn" style="width:100%; margin-top:8px;" disabled>
                    <i class="icon">✉️</i> 手动发送一次
                </button>
            </div>

            <div class="panel" style="grid-column: span 2;">
                <div class="panel-title">操作日志</div>
                <div class="log-container" id="logContainer">
                    <div class="log-entry">
                        <span class="status-indicator status-info"></span>
                        <span>系统已初始化，等待操作...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 等待jQuery加载完成
    function waitForjQuery() {
        if (window.jQuery) {
            initApp();
        } else {
            setTimeout(waitForjQuery, 50);
        }
    }

    // 初始化应用
    function initApp() {
        const $ = window.jQuery;

        // 全局状态
        const state = {
            isDragging: false,
            dragOffset: { x: 0, y: 0 },
            videoParams: [],
            selectedParam: null,
            sendCount: 0,
            isAutoRunning: false,
            autoInterval: null,
            autoStartTime: null,
            currentVideoIndex: -1,
            currentVideoSends: 0,
            currentVideoTotalSends: 0,
            currentVideoNow: 0,
            consecutiveFailures: 0,
            maxConsecutiveFailures: 4,
            timerInterval: null,
            cidCache: {},
            statusCache: {}
        };

        // 加密配置
        const CRYPTO_KEY = CryptoJS.enc.Utf8.parse("Dcv3400887638100");
        const CRYPTO_IV = CryptoJS.enc.Utf8.parse("Dcit400887638100");

        // 添加日志
        function addLog(message, type = 'info') {
            const logContainer = $('#logContainer');
            const indicatorClass = {
                'info': 'status-info',
                'success': 'status-success',
                'error': 'status-error',
                'warning': 'status-warning',
                'processing': 'status-processing'
            }[type] || 'status-info';

            const time = new Date().toLocaleTimeString();
            const logEntry = $(`
                <div class="log-entry">
                    <span class="status-indicator ${indicatorClass}"></span>
                    [${time}] ${message}
                </div>
            `);

            logEntry.prependTo(logContainer);

            // 限制日志数量
            if (logContainer.children().length > 20) {
                logContainer.children().last().remove();
            }
        }

        // 初始化事件
        function initEvents() {
            // 最小化/关闭按钮
            $('#minimize-btn').click(() => {
                const app = $('#video-manager-app');
                app.toggleClass('minimized');
                $('.main-content').toggle();
                $('#minimize-btn').text(app.hasClass('minimized') ? '+' : '−');
            });

            $('#close-btn').click(() => {
                $('#video-manager-app').toggleClass('hidden');
            });

            // 优化拖动功能 - 使用requestAnimationFrame提高性能
            const header = $('.header');
            const app = $('#video-manager-app');
            let dragFrameId = null;

            header.mousedown(function(e) {
                state.isDragging = true;
                const rect = app[0].getBoundingClientRect();
                state.dragOffset.x = e.clientX - rect.left;
                state.dragOffset.y = e.clientY - rect.top;
                header.css('cursor', 'grabbing');
                e.preventDefault();
            });

            // 优化鼠标移动事件处理
            $(document).mousemove(function(e) {
                if (!state.isDragging) return;

                // 使用requestAnimationFrame减少重绘次数
                if (dragFrameId) {
                    cancelAnimationFrame(dragFrameId);
                }

                dragFrameId = requestAnimationFrame(() => {
                    const x = e.clientX - state.dragOffset.x;
                    const y = e.clientY - state.dragOffset.y;

                    // 限制在可视区域内
                    const maxX = window.innerWidth - app[0].offsetWidth;
                    const maxY = window.innerHeight - app[0].offsetHeight;
                    const constrainedX = Math.max(0, Math.min(x, maxX));
                    const constrainedY = Math.max(0, Math.min(y, maxY));

                    // 直接操作DOM样式，减少jQuery调用开销
                    app[0].style.left = `${constrainedX}px`;
                    app[0].style.top = `${constrainedY}px`;
                    app[0].style.right = 'auto';
                    app[0].style.bottom = 'auto';
                });
            });

            $(document).mouseup(function() {
                if (state.isDragging) {
                    state.isDragging = false;
                    header.css('cursor', 'move');
                    if (dragFrameId) {
                        cancelAnimationFrame(dragFrameId);
                        dragFrameId = null;
                    }
                }
            });

            // 获取课程视频
            $('#fetchCoursesBtn').click(async function() {
                const token = $('#userToken').val().trim();
                const userId = $('#userId').val().trim();
                const coursePackageIds = $('#coursePackageIds').val().trim();

                if (!token || !userId || !coursePackageIds) {
                    addLog('请完善token、用户ID和课程包ID', 'error');
                    return;
                }

                $(this).prop('disabled', true);
                addLog('开始获取课程视频...');

                // 清空缓存
                state.cidCache = {};
                state.statusCache = {};
                updateCidCount();
                updateCompletedCount();

                // 获取projectId
                const projectId = await getProjectId(token, userId);
                if (!projectId) {
                    $(this).prop('disabled', false);
                    return;
                }

                state.videoParams = [];
                state.selectedParam = null;
                state.currentVideoIndex = -1;

                // 获取视频数据
                const videos = await fetchCourseVideos(token, userId, coursePackageIds, projectId);

                if (videos.length > 0) {
                    state.videoParams = videos;
                    addLog(`成功获取 ${state.videoParams.length} 个视频`, 'success');

                    // 自动获取第一个视频的信息
                    const firstVideo = videos[0];
                    await fetchVideoCidAndStatus(firstVideo.itemId, firstVideo.userCourseId, token, userId);
                } else {
                    addLog('未获取到视频数据', 'error');
                }

                updateVideoSelection();
                $(this).prop('disabled', false);
            });

            // 清空输入
            $('#clearInputBtn').click(() => {
                $('#userToken').val('');
                $('#userId').val('');
                $('#coursePackageIds').val('');

                state.cidCache = {};
                state.statusCache = {};
                state.videoParams = [];
                state.selectedParam = null;
                state.currentVideoIndex = -1;
                state.sendCount = 0;
                state.consecutiveFailures = 0;

                updateVideoSelection();
                updateCidCount();
                updateCompletedCount();
                updateSendStats();
                updateAutoProgressInfo();

                addLog('输入已清空', 'info');
            });

            // 手动发送一次
            $('#startSendBtn').click(async function() {
                if (!state.selectedParam) {
                    addLog('请先选择一个视频', 'error');
                    return;
                }

                $(this).prop('disabled', true);
                addLog(`开始发送 [${state.selectedParam.videoTitle}]`);

                const { success } = await sendDurationRecord(state.selectedParam);
                if (success) {
                    state.sendCount++;
                    updateSendStats();
                }

                $(this).prop('disabled', false);
            });

            // 开始自动发送
            $('#startAutoBtn').click(() => {
                if (state.videoParams.length === 0) {
                    addLog('请先获取课程视频列表', 'error');
                    return;
                }

                state.isAutoRunning = true;
                state.autoStartTime = Date.now();
                state.currentVideoIndex = -1;
                state.consecutiveFailures = 0;

                $('#startAutoBtn').prop('disabled', true);
                $('#stopAutoBtn').prop('disabled', false);
                $('#startSendBtn').prop('disabled', true);
                $('#fetchCoursesBtn').prop('disabled', true);

                addLog('开始自动发送模式，每1分钟发送一次', 'success');

                // 启动计时器
                startTimer();

                // 设置自动发送间隔
                state.autoInterval = setInterval(() => {
                    processAutoSend();
                }, 60000); // 1分钟发送一次

                // 立即执行第一次发送
                processAutoSend();
            });

            // 停止自动发送
            $('#stopAutoBtn').click(() => {
                stopAutoSend();
                addLog('自动发送已停止', 'info');
            });
        }

        // 获取projectId
        async function getProjectId(token, userId) {
            try {
                const response = await fetch('https://xbsd.lt-edu.net/api/v1/my/project?limit=6', {
                    method: 'GET',
                    headers: {
                        'token': token,
                        'id': userId,
                        'user-agent': navigator.userAgent
                    }
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                if (data.code === 900 && data.data?.data?.length > 0) {
                    return data.data.data[0].project_id;
                }

                addLog('未获取到projectId，使用默认值', 'warning');
                return '16156';
            } catch (error) {
                addLog(`获取projectId失败: ${error.message}，使用默认值`, 'error');
                return '16156';
            }
        }

        // 获取课程视频
        async function fetchCourseVideos(token, userId, coursePackageIds, projectId) {
            const userCourseIds = coursePackageIds
                .split(',')
                .map(id => id.trim())
                .filter(Boolean);

            if (!userCourseIds.length) {
                addLog('请输入有效的课程包ID', 'error');
                return [];
            }

            const allVideos = [];

            for (const userCourseId of userCourseIds) {
                // 获取课程信息
                const courseInfo = await request(
                    `https://xbsd.lt-edu.net/api/v1/my/getCourseInfo/${userCourseId}`,
                    token,
                    userId
                );

                if (!courseInfo) {
                    addLog(`获取课程[${userCourseId}]信息失败`, 'error');
                    continue;
                }

                // 获取课程视频
                const videos = await getVideosInCourse(token, userId, userCourseId, projectId);
                if (!videos.length) continue;

                // 整理视频数据
                const courseVideos = videos.map(video => ({
                    ...video,
                    userId: userId,
                    courseTitle: courseInfo.name,
                    userCourseId: userCourseId,
                    projectId: projectId,
                    courseInfoId: courseInfo.id
                }));

                allVideos.push(...courseVideos);
            }

            return allVideos;
        }

        // 获取课程中的视频
        async function getVideosInCourse(token, userId, userCourseId, projectId) {
            addLog(`获取课程 [${userCourseId}] 的视频...`);

            // 获取目录数据
            const catalogData = await request(
                `https://xbsd.lt-edu.net/api/v1/my/getCourseCatalog/${userCourseId}`,
                token,
                userId
            );

            if (!catalogData?.length) {
                addLog('未找到目录数据', 'error');
                return [];
            }

            // 收集所有目录ID
            const allCatalogIds = [];
            const traverseCatalog = (items) => {
                items.forEach(item => {
                    allCatalogIds.push(item.id);
                    if (item.sub?.length) traverseCatalog(item.sub);
                });
            };
            traverseCatalog(catalogData);

            const videos = [];

            // 获取每个目录下的视频
            for (const catalogId of allCatalogIds) {
                const detail = await request(
                    `https://xbsd.lt-edu.net/api/v1/my/courseCatalog/${catalogId}?user_course_id=${userCourseId}`,
                    token,
                    userId
                );

                if (detail?.itemList) {
                    // 筛选视频类型
                    const videoItems = detail.itemList
                        .filter(item => item.type === 3 && item.id)
                        .map(item => ({
                            itemId: item.id,
                            resourceId: item.resource_id,
                            videoTitle: item.name,
                            videoLength: item.video_length || `${item.length || 0}秒`,
                            lengthSeconds: item.length || 0
                        }));

                    videos.push(...videoItems);
                }
            }

            addLog(`课程 [${userCourseId}] 找到 ${videos.length} 个视频`, 'success');
            return videos;
        }

        // 通用请求函数
        async function request(url, token, userId) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'token': token,
                        'id': userId,
                        'user-agent': navigator.userAgent,
                        'accept': 'application/json'
                    }
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                if (data.code !== 900) throw new Error(data.msg || '接口错误');
                return data.data;
            } catch (error) {
                addLog(`请求错误: ${error.message}`, 'error');
                return null;
            }
        }

        // 获取视频CID和状态
        async function fetchVideoCidAndStatus(itemId, userCourseId, token, userId) {
            try {
                // 检查缓存
                if (state.cidCache[itemId] && state.statusCache[itemId] !== undefined) {
                    return { cid: state.cidCache[itemId], status: state.statusCache[itemId] };
                }

                const url = `https://xbsd.lt-edu.net/api/v1/my/courseItem/${itemId}?user_course_id=${userCourseId}`;
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'token': token,
                        'id': userId,
                        'user-agent': navigator.userAgent,
                        'accept': 'application/json'
                    }
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                if (data.code !== 900) {
                    addLog(`获取视频[${itemId}]信息失败: ${data.msg || '接口错误'}`, 'error');
                    return null;
                }

                // 验证数据完整性
                if (!data.data?.cid || data.data?.status === undefined) {
                    addLog(`视频[${itemId}]数据不完整: 缺少cid或status`, 'error');
                    return null;
                }

                // 缓存数据 (status: 2=未学 3=已学完)
                state.cidCache[itemId] = data.data.cid;
                state.statusCache[itemId] = data.data.status;

                addLog(
                    `成功获取视频[${itemId}]信息 - cid: ${data.data.cid}, 状态: ${
                        data.data.status === 3 ? '已学完' : '未学'
                    }`,
                    'success'
                );

                // 更新UI显示
                updateCidCount();
                updateCompletedCount();
                updateVideoSelection();

                return { cid: data.data.cid, status: data.data.status };
            } catch (error) {
                addLog(`获取视频[${itemId}]信息失败: ${error.message}`, 'error');
                return null;
            }
        }

        // 发送时长记录
        async function sendDurationRecord(param) {
            // 验证基础参数
            const token = $('#userToken').val().trim();
            const userId = $('#userId').val().trim();

            if (!token || !userId) {
                addLog('请输入token和用户ID', 'error');
                return { success: false };
            }

            // 验证视频参数完整性
            const requiredParams = ['userId', 'itemId', 'userCourseId', 'projectId'];
            const missingParams = requiredParams.filter(key => !param[key]);

            if (missingParams.length > 0) {
                addLog(`视频参数不完整，缺少: ${missingParams.join(', ')}`, 'error');
                return { success: false };
            }

            // 获取当前视频的cid和状态
            let cidInfo = state.cidCache[param.itemId] && state.statusCache[param.itemId] !== undefined
                ? { cid: state.cidCache[param.itemId], status: state.statusCache[param.itemId] }
                : null;

            if (!cidInfo) {
                addLog(`视频[${param.itemId}]信息未缓存，尝试实时获取...`, 'processing');
                cidInfo = await fetchVideoCidAndStatus(param.itemId, param.userCourseId, token, userId);

                // 如果获取失败，无法发送
                if (!cidInfo?.cid) {
                    addLog('未获取到cid，发送失败', 'error');
                    return { success: false };
                }
            }

            // 检查视频是否已学完（status=3）
            if (cidInfo.status === 3) {
                addLog(`视频[${param.videoTitle}]已学完（status=3），无需发送`, 'info');
                return { success: true, data: { now: param.lengthSeconds, completed: true } };
            }

            try {
                // 获取当前时间戳
                const timestamp = Math.round(Date.now() / 1000);

                // 构造原始参数
                const rawData = `${param.userId}!@@!${param.itemId}!@@!${param.userCourseId}!@@!${param.projectId}!@@!${cidInfo.cid}!@@!${timestamp}`;
                addLog(`原始参数: ${rawData}`);

                // 加密数据
                const encrypted = CryptoJS.AES.encrypt(rawData, CRYPTO_KEY, {
                    iv: CRYPTO_IV,
                    mode: CryptoJS.mode.CBC,
                    padding: CryptoJS.pad.Pkcs7
                }).toString();

                const encryptedMsg = encodeURIComponent(encrypted);

                // 发送请求
                const response = await fetch('https://xbsd.lt-edu.net/api/v1/courseVideo/compV3', {
                    method: 'POST',
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "content-type": "application/json;charset=UTF-8",
                        "id": param.userId,
                        "token": token,
                        "user-agent": navigator.userAgent
                    },
                    body: JSON.stringify({ msg: encryptedMsg })
                });

                const data = await response.json();

                // 处理接口返回
                if (data.code === 900) {
                    // 检查是否已看完
                    const isCompleted = data.data === null || data.data === undefined;

                    if (isCompleted) {
                        addLog(`发送成功 [${param.videoTitle}] - 已看完`, 'success');
                        // 更新状态缓存为已学完
                        state.statusCache[param.itemId] = 3;
                        updateCompletedCount();
                        return { success: true, data: { completed: true } };
                    } else {
                        addLog(`发送成功 [${param.videoTitle}] 进度: ${data.data.now || '未知'}`, 'success');
                        return { success: true, data: data.data };
                    }
                } else if (data.error_code === 38383) {
                    addLog(`需要滑块验证: ${data.msg}`, 'error');
                    return { success: false };
                } else {
                    addLog(`发送失败 [${param.videoTitle}] 错误: ${data.msg || '未知错误'} 代码: ${data.code || data.error_code}`, 'error');
                    return { success: false };
                }
            } catch (error) {
                addLog(`发送失败 [${param.videoTitle}]: ${error.message}`, 'error');
                return { success: false };
            }
        }

        // 自动发送处理函数
        async function processAutoSend() {
            if (!state.isAutoRunning) return;

            // 检查连续失败次数
            if (state.consecutiveFailures >= state.maxConsecutiveFailures) {
                addLog(`连续失败达到${state.maxConsecutiveFailures}次，自动发送停止`, 'error');
                stopAutoSend();
                return;
            }

            // 检查是否有视频可处理
            if (state.videoParams.length === 0) {
                addLog('没有视频可处理，自动发送停止', 'error');
                stopAutoSend();
                return;
            }

            // 初始化当前视频索引
            if (state.currentVideoIndex === -1) {
                state.currentVideoIndex = 0;
                await initCurrentVideo();
            }

            // 跳过已学完的视频
            while (state.currentVideoIndex < state.videoParams.length) {
                const currentVideo = state.videoParams[state.currentVideoIndex];
                const videoStatus = state.statusCache[currentVideo.itemId];

                if (videoStatus === 3) {
                    addLog(`视频[${currentVideo.videoTitle}]已学完（status=3），自动跳过`, 'info');
                    state.currentVideoIndex++;
                } else {
                    break; // 找到未学的视频
                }
            }

            // 检查是否所有视频都已处理完毕
            if (state.currentVideoIndex >= state.videoParams.length) {
                addLog('所有视频已处理完毕，自动发送停止', 'success');
                stopAutoSend();
                return;
            }

            const currentVideo = state.videoParams[state.currentVideoIndex];
            if (!currentVideo) {
                addLog('未找到当前视频，自动发送停止', 'error');
                stopAutoSend();
                return;
            }

            // 验证当前视频参数完整性
            const requiredParams = ['userId', 'itemId', 'userCourseId', 'projectId'];
            const missingParams = requiredParams.filter(key => !currentVideo[key]);

            if (missingParams.length > 0) {
                addLog(`当前视频参数不完整，缺少: ${missingParams.join(', ')}，将跳过`, 'error');
                state.currentVideoIndex++;
                await initCurrentVideo();
                return;
            }

            // 更新视频列表的处理状态显示
            updateVideoSelection();

            // 发送一次记录
            const { success, data } = await sendDurationRecord(currentVideo);

            if (success) {
                // 成功：重置连续失败计数
                state.consecutiveFailures = 0;
                state.sendCount++;
                state.currentVideoSends++;

                // 更新已观看时长（来自接口返回）
                if (data?.now !== undefined) {
                    state.currentVideoNow = data.now;
                }
            } else {
                // 失败：增加连续失败计数
                state.consecutiveFailures++;
                addLog(`连续失败次数: ${state.consecutiveFailures}/${state.maxConsecutiveFailures}`, 'error');
            }

            // 更新统计和进度
            updateSendStats();
            updateAutoProgressInfo();

            // 检查是否需要切换视频
            const shouldSwitchVideo = (data?.completed) ||
                                     (state.currentVideoSends >= state.currentVideoTotalSends);

            if (shouldSwitchVideo) {
                if (data?.completed) {
                    addLog(`视频 [${currentVideo.videoTitle}] 已看完`, 'success');
                } else {
                    addLog(`视频 [${currentVideo.videoTitle}] 已完成所有发送 (${state.currentVideoSends}次)`, 'success');
                }

                // 移动到下一个视频
                state.currentVideoIndex++;

                // 初始化下一个视频
                await initCurrentVideo();
            }
        }

        // 停止自动发送
        function stopAutoSend() {
            state.isAutoRunning = false;

            if (state.autoInterval) {
                clearInterval(state.autoInterval);
                state.autoInterval = null;
            }

            stopTimer();
            state.currentVideoIndex = -1;

            $('#startAutoBtn').prop('disabled', false);
            $('#stopAutoBtn').prop('disabled', true);
            $('#startSendBtn').prop('disabled', !state.selectedParam);
            $('#fetchCoursesBtn').prop('disabled', false);

            updateVideoSelection();
            updateAutoProgressInfo();
            updateRunningTime();
        }

        // 启动计时器
        function startTimer() {
            if (state.timerInterval) clearInterval(state.timerInterval);

            state.timerInterval = setInterval(() => {
                updateRunningTime();
            }, 1000);
        }

        // 停止计时器
        function stopTimer() {
            if (state.timerInterval) {
                clearInterval(state.timerInterval);
                state.timerInterval = null;
            }
        }

        // 更新运行时间显示
        function updateRunningTime() {
            if (!state.autoStartTime) {
                $('#runningTime').text('00:00:00');
                return;
            }

            const elapsedSeconds = Math.floor((Date.now() - state.autoStartTime) / 1000);
            const h = Math.floor(elapsedSeconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((elapsedSeconds % 3600) / 60).toString().padStart(2, '0');
            const s = (elapsedSeconds % 60).toString().padStart(2, '0');

            $('#runningTime').text(`${h}:${m}:${s}`);
        }

        // 更新自动发送进度信息
        function updateAutoProgressInfo() {
            const progressEl = $('#autoProgressInfo');

            if (!state.isAutoRunning) {
                progressEl.text('状态：未运行 - 自动发送将按视频时长每分钟发送一次');
                return;
            }

            if (state.videoParams.length === 0) {
                progressEl.text('状态：运行中 - 无视频可处理');
                return;
            }

            if (state.currentVideoIndex < 0 || state.currentVideoIndex >= state.videoParams.length) {
                progressEl.text('状态：运行中 - 准备处理视频');
                return;
            }

            const video = state.videoParams[state.currentVideoIndex];
            const remainingSends = Math.max(0, state.currentVideoTotalSends - state.currentVideoSends);

            progressEl.html(`
                状态：运行中 - 当前视频 [${video.videoTitle}]
                已发送: ${state.currentVideoSends}/${state.currentVideoTotalSends}
                已观看: ${state.currentVideoNow || 0}秒
                剩余发送: ${remainingSends}次
            `);
        }

        // 初始化当前视频
        async function initCurrentVideo() {
            // 跳过已学完的视频
            while (state.currentVideoIndex < state.videoParams.length) {
                const currentVideo = state.videoParams[state.currentVideoIndex];
                // 确保获取视频状态
                if (state.statusCache[currentVideo.itemId] === undefined) {
                    addLog(`获取视频[${currentVideo.itemId}]状态...`, 'processing');
                    const token = $('#userToken').val().trim();
                    const userId = $('#userId').val().trim();
                    await fetchVideoCidAndStatus(currentVideo.itemId, currentVideo.userCourseId, token, userId);
                }

                if (state.statusCache[currentVideo.itemId] === 3) {
                    addLog(`视频[${currentVideo.videoTitle}]已学完，自动跳过`, 'info');
                    state.currentVideoIndex++;
                } else {
                    break;
                }
            }

            const currentVideo = state.videoParams[state.currentVideoIndex];
            if (!currentVideo) return;

            // 重置当前视频状态
            state.currentVideoSends = 0;
            state.currentVideoNow = 0;
            state.currentVideoTotalSends = Math.ceil(currentVideo.lengthSeconds / 60);

            addLog(`开始处理视频 [${currentVideo.videoTitle}]，预计发送 ${state.currentVideoTotalSends} 次`, 'processing');
            updateAutoProgressInfo();
        }

        // 更新发送统计
        function updateSendStats() {
            $('#sendCount').text(state.sendCount);
        }

        // 更新CID计数
        function updateCidCount() {
            const count = Object.keys(state.cidCache).length;
            $('#cidCount').text(count);
        }

        // 更新已完成计数
        function updateCompletedCount() {
            const count = Object.values(state.statusCache).filter(status => status === 3).length;
            $('#completedCount').text(count);
        }

        // 更新视频选择列表
        function updateVideoSelection() {
            const container = $('#videoSelection');
            const totalCountEl = $('#totalVideoCount');

            if (state.videoParams.length === 0) {
                container.html(`
                    <div class="empty-state">
                        <i>📺</i>
                        <p>请先获取课程视频</p>
                    </div>
                `);
                totalCountEl.text('0');
                $('#startSendBtn').prop('disabled', true);
                return;
            }

            let html = '';
            state.videoParams.forEach((video, index) => {
                let statusClass = '';
                let statusText = '';
                let cidStatus = state.cidCache[video.itemId] ? '✅已获取cid' : '❌未获取cid';
                let videoStatusText = state.statusCache[video.itemId] === 3 ? ' - 已学完' :
                                     (state.statusCache[video.itemId] === 2 ? ' - 未学' : '');

                if (state.isAutoRunning && index === state.currentVideoIndex) {
                    statusClass = state.consecutiveFailures > 0 ? 'failed' : 'processing';
                    statusText = ` (已发送: ${state.currentVideoSends}/${state.currentVideoTotalSends})`;
                }
                else if (state.isAutoRunning && index < state.currentVideoIndex) {
                    statusClass = state.statusCache[video.itemId] === 3 ? 'completed' : 'selected';
                    statusText = state.statusCache[video.itemId] === 3 ? ' - 已学完' : ' - 已完成';
                }

                html += `
                    <div class="video-item ${state。selectedParam === video ? 'selected' : ''} ${statusClass}">
                        <input type="radio" name="videoSelect" class="video-radio"
                            ${state。selectedParam === video ? 'checked' : ''}
                            ${state。isAutoRunning || state.statusCache[video.itemId] === 3 ? 'disabled' : ''}>
                        <div class="video-info">
                            <div class="video-title">${video。videoTitle}${videoStatusText}${statusText}</div>
                            <div class="video-meta">
                                <span>ID: ${video。itemId}</span>
                                <span>课程包: ${video。userCourseId}</span>
                                <span>时长: ${video。videoLength} ${cidStatus}</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            container.html(html);
            totalCountEl.text(state.videoParams.length);

            // 添加点击事件
            if (!state.isAutoRunning) {
                $('.video-radio').click(function() {
                    const index = $(this).closest('.video-item').index();
                    state.selectedParam = state.videoParams[index];

                    $('.video-item').removeClass('selected');
                    $(this).closest('.video-item').addClass('selected');

                    $('#startSendBtn').prop('disabled', false);
                    addLog(`已选择视频: ${state.selectedParam.videoTitle}`, 'info');
                });
            }
        }

        // 初始化
        function init() {
            initEvents();
            addLog('系统初始化完成，可开始使用', 'success');
        }

        // 启动应用
        init();
    }

    // 启动
    waitForjQuery();
})();

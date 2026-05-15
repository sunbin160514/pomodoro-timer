// 引入 Electron 的 IPC 渲染进程模块，用于与主进程通信（如发送桌面通知）
const { ipcRenderer } = require('electron');

/**
 * 应用状态管理对象
 * 存储番茄钟的所有运行时状态和数据
 */
const state = {
    mode: 'pomodoro',           // 当前模式：pomodoro(专注), shortBreak(短休息), longBreak(长休息)
    timeLeft: 25 * 60,          // 剩余时间（秒）
    totalTime: 25 * 60,         // 当前模式的总时长（秒），用于计算进度环
    isRunning: false,           // 计时器是否正在运行
    timer: null,                // setInterval 返回的定时器 ID，用于清除定时器
    completedPomodoros: 0,      // 今日已完成番茄钟数量
    totalFocusMinutes: 0,       // 今日总专注时长（分钟）
    settings: {                 // 用户设置，可从设置面板修改
        pomodoro: 25,           // 专注时长（分钟）
        shortBreak: 5,          // 短休息时长（分钟）
        longBreak: 15,          // 长休息时长（分钟）
        autoStartBreak: false,  // 是否自动开始休息
        soundEnabled: true      // 是否启用提示音效
    }
};

// DOM 元素缓存对象
// 通过 querySelector 获取页面元素，避免重复查询，提升性能
const elements = {
    timeDisplay: document.querySelector('.time'),          // 时间显示元素
    statusDisplay: document.querySelector('.status'),      // 状态文字元素
    progressBar: document.querySelector('.progress-bar'),  // 进度环 SVG 元素
    startBtn: document.getElementById('startBtn'),         // 开始/暂停按钮
    resetBtn: document.getElementById('resetBtn'),         // 重置按钮
    settingsBtn: document.getElementById('settingsBtn'),   // 设置按钮
    modeBtns: document.querySelectorAll('.mode-btn'),      // 三个模式切换按钮（节点列表）
    completedCount: document.getElementById('completedCount'),   // 已完成数量显示
    totalFocusTime: document.getElementById('totalFocusTime'),   // 总专注时长显示
    settingsModal: document.getElementById('settingsModal'),     // 设置弹窗
    closeSettings: document.getElementById('closeSettings'),     // 关闭设置按钮
    saveSettings: document.getElementById('saveSettings'),       // 保存设置按钮
    pomodoroTimeInput: document.getElementById('pomodoroTime'),  // 专注时长输入框
    shortBreakTimeInput: document.getElementById('shortBreakTime'), // 短休息时长输入框
    longBreakTimeInput: document.getElementById('longBreakTime'),   // 长休息时长输入框
    autoStartBreakInput: document.getElementById('autoStartBreak'), // 自动开始休息开关
    soundEnabledInput: document.getElementById('soundEnabled'),     // 音效开关
    container: document.querySelector('.container')          // 主容器元素
};

// ============================================================
// 音效系统（使用 Web Audio API 生成简单音效）
// Web Audio API 是现代浏览器内置的音频处理接口，无需外部音频文件
// ============================================================

// 创建音频上下文，兼容不同浏览器前缀
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

/**
 * 播放计时完成的提示音效
 * 使用 Web Audio API 生成两段音调（C5 和 E5），形成悦耳的提示音
 */
function playNotificationSound() {
    // 如果用户关闭了音效，直接返回不播放
    if (!state.settings.soundEnabled) return;

    // 创建第一组音源：振荡器（产生音调）和增益节点（控制音量）
    const oscillator = audioContext.createOscillator();  // 振荡器，产生声音波形
    const gainNode = audioContext.createGain();          // 增益节点，控制音量

    // 连接音频节点：振荡器 -> 增益节点 -> 扬声器输出
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // 设置音调参数：C5 音符（523.25 Hz），正弦波（柔和）
    oscillator.frequency.value = 523.25; // C5
    oscillator.type = 'sine';            // 正弦波，声音柔和

    // 设置音量包络：初始音量 0.3，0.5 秒内衰减到接近 0
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    // 播放第一音调
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    // 150ms 后播放第二音调（E5，比 C5 高一个三度），形成和弦效果
    setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 659.25; // E5
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.5);
    }, 150);
}

// 工具函数

/**
 * 将秒数格式化为 MM:SS 格式的时间字符串
 * @param {number} seconds - 总秒数
 * @returns {string} - 格式化的 "MM:SS" 字符串
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 更新圆形进度环的显示
 * SVG 进度环原理：通过 stroke-dashoffset 控制显示长度
 */
function updateProgress() {
    const progress = (state.totalTime - state.timeLeft) / state.totalTime;
    const circumference = 2 * Math.PI * 54;  // 圆环周长，半径54
    const offset = circumference - (progress * circumference);
    elements.progressBar.style.strokeDashoffset = offset;
}

/**
 * 更新主界面显示和时间、进度、托盘提示
 */
function updateDisplay() {
    const timeText = formatTime(state.timeLeft);
    elements.timeDisplay.textContent = timeText;
    updateProgress();

    // 更新托盘提示
    const modeText = {
        pomodoro: '专注中',
        shortBreak: '短休息',
        longBreak: '长休息'
    };
    const status = state.isRunning ? modeText[state.mode] : '已暂停';
    ipcRenderer.send('update-tray-tooltip', `${status} - ${timeText}`);
}

/**
 * 更新状态描述文字
 * 根据当前模式和运行状态显示不同的提示文字
 */
function updateStatusText() {
    // 状态映射表：根据模式和运行状态返回对应文字
    const statusMap = {
        pomodoro: state.isRunning ? '专注中...' : '准备专注',
        shortBreak: state.isRunning ? '休息中...' : '准备休息',
        longBreak: state.isRunning ? '长休息中...' : '准备长休息'
    };
    // 更新界面上的状态文字
    elements.statusDisplay.textContent = statusMap[state.mode];
}

/**
 * 切换番茄钟模式（专注/短休息/长休息）
 * @param {string} mode - 目标模式：'pomodoro' | 'shortBreak' | 'longBreak'
 *
 * 切换时会：
 * 1. 停止当前计时器
 * 2. 重置时间为该模式默认时长
 * 3. 更新按钮高亮状态
 * 4. 更新进度环颜色
 */
function switchMode(mode) {
    // 更新状态
    state.mode = mode;
    state.totalTime = state.settings[mode] * 60;  // 转换为秒
    state.timeLeft = state.totalTime;
    state.isRunning = false;
    clearInterval(state.timer);  // 清除现有计时器

    // 更新模式按钮的选中状态
    elements.modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // 更新容器样式类，用于切换不同模式下的主题色
    elements.container.className = `container mode-${mode}`;

    // 恢复播放按钮图标（▶️）
    elements.startBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="32" height="32">
            <path d="M8 5v14l11-7z"/>
        </svg>
    `;
    elements.container.classList.remove('timer-running');

    updateStatusText();
    updateDisplay();
}

// ============================================================
// 计时控制函数
// ============================================================

/**
 * 切换开始/暂停状态
 * 根据当前状态决定是启动还是暂停计时器
 */
function toggleTimer() {
    if (state.isRunning) {
        pauseTimer();  // 正在运行则暂停
    } else {
        startTimer();  // 已暂停则开始
    }
}

/**
 * 开始计时
 * 创建每秒执行的定时器，递减时间并更新界面
 */
function startTimer() {
    // 如果时间已归零，先重置为总时长
    if (state.timeLeft === 0) {
        state.timeLeft = state.totalTime;
    }

    // 更新运行状态
    state.isRunning = true;
    elements.container.classList.add('timer-running');  // 添加动画样式

    // 切换为暂停按钮图标（⏸️）
    elements.startBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="32" height="32">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
    `;
    updateStatusText();

    // 创建每秒执行一次的定时器
    state.timer = setInterval(() => {
        state.timeLeft--;  // 剩余时间减 1 秒
        updateDisplay();    // 更新界面显示

        // 时间到，计时完成
        if (state.timeLeft <= 0) {
            timerComplete();
        }
    }, 1000);  // 1000ms = 1秒
}

/**
 * 暂停计时
 * 清除定时器，更新界面为暂停状态
 */
function pauseTimer() {
    state.isRunning = false;
    clearInterval(state.timer);  // 停止定时器
    elements.container.classList.remove('timer-running');  // 移除动画样式

    // 切换为播放按钮图标（▶️）
    elements.startBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="32" height="32">
            <path d="M8 5v14l11-7z"/>
        </svg>
    `;
    updateStatusText();
    updateDisplay();
}

/**
 * 重置计时器
 * 停止计时，将时间重置为该模式的完整时长
 */
function resetTimer() {
    state.isRunning = false;
    clearInterval(state.timer);
    state.timeLeft = state.totalTime;  // 重置为总时长
    elements.container.classList.remove('timer-running');

    // 恢复播放按钮图标
    elements.startBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="32" height="32">
            <path d="M8 5v14l11-7z"/>
        </svg>
    `;
    updateStatusText();
    updateDisplay();
}

/**
 * 计时完成回调
 * 当倒计时归零时触发，处理完成后的逻辑：
 * - 播放提示音
 * - 发送桌面通知
 * - 更新统计数据
 * - 自动切换到下一阶段
 */
function timerComplete() {
    clearInterval(state.timer);
    state.isRunning = false;
    elements.container.classList.remove('timer-running');

    // 播放提示音效
    playNotificationSound();

    // 判断当前完成的是专注还是休息
    if (state.mode === 'pomodoro') {
        // === 专注完成 ===
        state.completedPomodoros++;                      // 完成数加 1
        state.totalFocusMinutes += state.settings.pomodoro;  // 累加专注时长
        updateStats();                                    // 更新统计显示

        // 发送桌面通知（通过 IPC 发送到主进程显示）
        ipcRenderer.send('show-notification', '专注完成！', '恭喜你完成了一个番茄钟，休息一下吧。');

        // 判断是否自动开始休息
        if (state.settings.autoStartBreak) {
            // 每完成 4 个番茄钟后进入长休息，否则短休息
            const breakMode = state.completedPomodoros % 4 === 0 ? 'longBreak' : 'shortBreak';
            switchMode(breakMode);
            startTimer();
        } else {
            // 不自动开始，仅切换到休息模式等待用户手动开始
            switchMode('shortBreak');
        }
    } else {
        // === 休息完成 ===
        ipcRenderer.send('show-notification', '休息结束！', '休息结束，准备开始新的专注吧！');
        switchMode('pomodoro');  // 切换回专注模式
    }
}

// ============================================================
// 统计与设置功能
// ============================================================

/**
 * 更新今日统计显示
 */
function updateStats() {
    elements.completedCount.textContent = state.completedPomodoros;
    elements.totalFocusTime.textContent = state.totalFocusMinutes;
}

/**
 * 打开设置面板
 * 将当前设置值填充到输入框中，并显示设置弹窗
 */
function openSettings() {
    elements.pomodoroTimeInput.value = state.settings.pomodoro;
    elements.shortBreakTimeInput.value = state.settings.shortBreak;
    elements.longBreakTimeInput.value = state.settings.longBreak;
    elements.autoStartBreakInput.checked = state.settings.autoStartBreak;
    elements.soundEnabledInput.checked = state.settings.soundEnabled;
    elements.settingsModal.classList.add('show');  // 显示设置弹窗
}

/**
 * 关闭设置面板
 */
function closeSettingsModal() {
    elements.settingsModal.classList.remove('show');  // 隐藏设置弹窗
}

/**
 * 保存设置
 * 从输入框读取用户设置，进行数值校验后保存到 state
 */
function saveSettingsHandler() {
    // 读取输入值，parseInt 解析整数，若失败则使用默认值
    const pomodoro = parseInt(elements.pomodoroTimeInput.value) || 25;
    const shortBreak = parseInt(elements.shortBreakTimeInput.value) || 5;
    const longBreak = parseInt(elements.longBreakTimeInput.value) || 15;

    // 保存设置，使用 Math.max/min 限制数值范围
    state.settings = {
        pomodoro: Math.max(1, Math.min(60, pomodoro)),      // 专注：1-60 分钟
        shortBreak: Math.max(1, Math.min(30, shortBreak)),  // 短休息：1-30 分钟
        longBreak: Math.max(1, Math.min(60, longBreak)),    // 长休息：1-60 分钟
        autoStartBreak: elements.autoStartBreakInput.checked,  // 自动休息开关
        soundEnabled: elements.soundEnabledInput.checked      // 音效开关
    };

    // 如果当前不在运行中，立即应用新的时间设置
    if (!state.isRunning) {
        state.totalTime = state.settings[state.mode] * 60;
        state.timeLeft = state.totalTime;
        updateDisplay();
    }

    closeSettingsModal();
}

// ============================================================
// 事件监听器绑定
// ============================================================

// 主控制按钮
elements.startBtn.addEventListener('click', toggleTimer);    // 开始/暂停按钮
elements.resetBtn.addEventListener('click', resetTimer);     // 重置按钮
elements.settingsBtn.addEventListener('click', openSettings); // 设置按钮

// 设置面板按钮
elements.closeSettings.addEventListener('click', closeSettingsModal);  // 关闭设置
elements.saveSettings.addEventListener('click', saveSettingsHandler);  // 保存设置

// 模式切换按钮（专注/短休息/长休息）
// 使用 forEach 为每个模式按钮添加点击事件
elements.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // 只有在计时器未运行时才允许切换模式
        if (!state.isRunning) {
            switchMode(btn.dataset.mode);
        }
    });
});

// 点击模态框背景区域关闭设置面板
// 事件委托：检查点击目标是否是模态框本身（而非内容区域）
elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
        closeSettingsModal();
    }
});

// ============================================================
// 键盘快捷键支持
// ============================================================

document.addEventListener('keydown', (e) => {
    // 空格键：开始/暂停（设置面板打开时除外）
    if (e.code === 'Space' && !elements.settingsModal.classList.contains('show')) {
        e.preventDefault();  // 阻止空格键滚动页面
        toggleTimer();
    }
    // ESC 键：关闭设置面板
    if (e.code === 'Escape' && elements.settingsModal.classList.contains('show')) {
        closeSettingsModal();
    }
});

// ============================================================
// 应用初始化
// ============================================================

// 页面加载完成后，初始化界面显示
updateDisplay();     // 更新时间和进度环
updateStatusText();  // 更新状态文字

/**
 * Weekly Learning Program - Advanced Architecture v2.5 (Surgical UI Fix)
 */

const App = {
    state: {
        currentWeek: 1,
        maxWeek: 1,
        config: {
            grade: '',
            classCount: 4,
            periods: { "월": 6, "화": 6, "수": 5, "목": 6, "금": 6 },
            subjects: [],
            annualTargets: {} // { subject: totalHours }
        },
        specialists: [],
        history: {},
        isMarkingMode: false,
        markingColor: '#fef08a',
        selectedSub: null,
        selectedSidebarColor: null,
        spPreviewOpen: false,
        referenceBoards: [],
        deferredPrompt: null,
        userProfile: null, // { name, classNum }
        roomCode: '',
        isAdmin: false,
        isDirty: false, // 서버 저장 후 수정 여부
        isSpDirty: false, // 전담 미저장 여부
        classSettings: {} // { [classNum]: { [subName]: { enabled, periods, preferredSlot, blockSize } } }
    },

    days: ["월", "화", "수", "목", "금"],

    init() {
        FirebaseDB.init();
        this.loadData();
        this.cacheDOM();
        this.bindEvents();
        this.checkLogin(true); // 🔒 Check login before proceeding
        this.initWeekData(this.state.currentWeek);
        this.switchMenu('timetable');
    },

    loadData() {
        const saved = localStorage.getItem('school-planner-v4');
        if (saved) {
            const data = JSON.parse(saved);
            this.state = { ...this.state, ...data };
        }
        if (!this.state.markingColor) this.state.markingColor = '#fef08a';
        if (!this.state.referenceBoards || this.state.referenceBoards.length === 0) {
            this.state.referenceBoards = [
                { name: '참고 시간표 1', data: {}, marks: {} },
                { name: '참고 시간표 2', data: {}, marks: {} }
            ];
        }
        if (!this.state.specialists || this.state.specialists.length === 0) {
            this.state.specialists = [
                { subject: '전담 1', desc: '', data: {}, marks: {}, bg: '#ffffff' },
                { subject: '전담 2', desc: '', data: {}, marks: {}, bg: '#ffffff' }
            ];
        }
        if (!this.state.history) this.state.history = {};
        // UI 상태는 항상 초기값으로 리셋 (저장값 무시)
        this.state.spPreviewOpen = false;
        this.state.isMarkingMode = false;
        if (!this.state.config) this.state.config = { grade: '', classCount: 4, periods: { "월": 6, "화": 6, "수": 5, "목": 6, "금": 6 }, subjects: [] };
        if (!this.state.config.adminPin) this.state.config.adminPin = '0000';

        // Data Migration: subjects string[] -> {name, blockSize}[]
        if (this.state.config.subjects && this.state.config.subjects.length > 0) {
            this.state.config.subjects = this.state.config.subjects.map(s => {
                if (typeof s === 'string') return { name: s, blockSize: (s.includes('미술') || s.includes('실과')) ? 2 : 1 };
                if (s.isBlock !== undefined) {
                    const newObj = { name: s.name, blockSize: s.isBlock ? 2 : 1 };
                    delete s.isBlock;
                    return newObj;
                }
                if (!s.blockSize) s.blockSize = 1; 
                return s;
            });
        } else {
            const defaults = ["국어", "사회", "도덕", "수학", "과학", "체육", "음악", "미술", "영어", "자율", "동아리", "봉사", "진로"];
            this.state.config.subjects = defaults.map(s => ({ name: s, blockSize: (s === '미술' || s === '실과') ? 2 : 1 }));
        }
    },

    saveData() {
        localStorage.setItem('school-planner-v4', JSON.stringify(this.state));
    },

    initWeekData(week) {
        if (!this.state.history[week]) {
            const targets = {};
            this.state.config.subjects.forEach(s => targets[s.name] = 0);
            const classes = {};
            for (let cNum = 1; cNum <= this.state.config.classCount; cNum++) {
                classes[cNum] = { "월":[], "화":[], "수":[], "목":[], "금":[] };
            }
            this.state.history[week] = { targets, classes, bgColors: {}, specialistTargets: {}, specialistMemo: '', specialistCells: {} };
        }
    },

    cacheDOM() {
        this.dom = {
            menus: {
                settings: document.getElementById('settings-view'),
                specialist: document.getElementById('specialist-view'),
                timetable: document.getElementById('timetable-view'),
                'timetable-all': document.getElementById('timetable-view')
            },
            navs: document.querySelectorAll('.nav-item'),
            weekLabel: document.getElementById('current-week-label'),
            weekTargetContainer: document.getElementById('week-target-container'),
            allClassesContainer: document.getElementById('all-classes-container'),
            gradeInput: document.getElementById('input-grade'),
            classCountInput: document.getElementById('input-class-count'),
            periodInputs: { "월": document.getElementById('pd-mon'), "화": document.getElementById('pd-tue'), "수": document.getElementById('pd-wed'), "목": document.getElementById('pd-thu'), "금": document.getElementById('pd-fri') },
            subjectList: document.getElementById('subject-config-list'),
            specialistContainer: document.getElementById('specialist-boards-container'),
            specialistSummary: document.getElementById('specialist-summary-container'),
            modalContainer: document.getElementById('modal-container'),
            modalTitle: document.getElementById('modal-title'),
            modalContent: document.getElementById('modal-content'),
            modalConfirm: document.getElementById('btn-modal-confirm'),
            modalCancel: document.getElementById('btn-modal-cancel'),
            modalClose: document.getElementById('btn-modal-close'),
            palette: document.getElementById('subject-palette'),
            installBtn: document.getElementById('btn-install'),
            loginOverlay: document.getElementById('login-overlay'),
            userBadge: document.getElementById('user-badge'),
            userInfoText: document.getElementById('user-info-text'),
            btnLogout: document.getElementById('btn-logout'),
            loginName: document.getElementById('login-name'),
            loginClassNum: document.getElementById('login-class-num'),
            loginRoomCode: document.getElementById('login-room-code'),
            btnLogin: document.getElementById('btn-login'),
            btnCreateRoom: document.getElementById('btn-create-room'),
            btnServerSave: document.getElementById('btn-server-save'),
            btnServerLoad: document.getElementById('btn-server-load')
        };
    },

    bindEvents() {
        this.dom.navs.forEach(btn => btn.addEventListener('click', (e) => this.switchMenu(e.target.id.replace('btn-', ''))));
        document.getElementById('btn-prev-week').addEventListener('click', () => this.changeWeek(-1));
        document.getElementById('btn-next-week').addEventListener('click', () => this.changeWeek(1));
        document.getElementById('btn-create-week').addEventListener('click', () => this.createNewWeek());
        
        this.dom.weekTargetContainer.addEventListener('input', (e) => {
            if (e.target.classList.contains('target-input-global')) {
                const sub = e.target.dataset.sub;
                this.state.history[this.state.currentWeek].targets[sub] = parseInt(e.target.value) || 0;
                this.saveData();
                this.renderAllValidationGrids();
                
                // Update total sum in global target bar
                const targets = this.state.history[this.state.currentWeek].targets;
                const total = this.state.config.subjects.reduce((a, s) => a + (targets[s.name] || 0), 0);
                const totalCell = this.dom.weekTargetContainer.querySelector('.total-val');
                if (totalCell) totalCell.textContent = total;
            }
        });

        this.dom.weekTargetContainer.addEventListener('keydown', (e) => {
            if (!e.target.classList.contains('target-input-global')) return;
            const inputs = [...this.dom.weekTargetContainer.querySelectorAll('.target-input-global')];
            const idx = inputs.indexOf(e.target);
            if (e.key === 'ArrowRight' && idx < inputs.length - 1) { e.preventDefault(); inputs[idx + 1].focus(); inputs[idx + 1].select(); }
            else if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); inputs[idx - 1].focus(); inputs[idx - 1].select(); }
        });

        // 전담 잠금 셀 focus 인터셉트 (capture 단계)
        this.dom.allClassesContainer.addEventListener('focus', (e) => {
            if (e.target.classList.contains('cell-input') && e.target.dataset.spLocked === '1') {
                e.target.blur();
                this.showConfirm('전담 시간 수정', '이 교시는 전담 시간입니다.<br>수정하시겠습니까?').then(r => {
                    if (r) {
                        this._unlockSpCell(e.target);
                        e.target.focus();
                    }
                });
            }
        }, true);

        this.dom.allClassesContainer.addEventListener('input', (e) => {
            if (e.target.classList.contains('cell-input')) {
                const cNum = e.target.dataset.cls;
                const d = e.target.dataset.day;
                const idx = parseInt(e.target.dataset.idx);
                this.state.history[this.state.currentWeek].classes[cNum][d][idx] = e.target.value.trim();
                this.state.isDirty = true;
                const saveBtn = e.target.closest('.timetable-section')?.querySelector('.btn-save-class');
                if (saveBtn) { saveBtn.textContent = '저장'; saveBtn.style.background = '#f59e0b'; saveBtn.style.borderColor = '#f59e0b'; }
                this.saveData();
                this.renderSingleValidationGrid(cNum);
                this.calculateAndRenderValidationView();
            }
        });

        // 🟢 NEW: Arrow navigation for Annual Summary Inputs
        this.dom.menus.validation = document.getElementById('validation-view');
        this.dom.menus.validation.addEventListener('keydown', (e) => {
            if (!e.target.classList.contains('val-ann-input')) return;
            const inputs = [...this.dom.menus.validation.querySelectorAll('.val-ann-input')];
            const idx = inputs.indexOf(e.target);
            if (e.key === 'ArrowRight' && idx < inputs.length - 1) { e.preventDefault(); inputs[idx + 1].focus(); inputs[idx + 1].select(); }
            else if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); inputs[idx - 1].focus(); inputs[idx - 1].select(); }
        });
        this.dom.allClassesContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-clear-class') || e.target.classList.contains('btn-clear-class-admin')) {
                const cNum = e.target.dataset.cls;
                this.clearClass(cNum);
            } else if (e.target.classList.contains('cell-input')) {
                // 전담 잠금 셀에 과목/색상 클릭 시도 → 확인 후 적용
                if (e.target.dataset.spLocked === '1' && (this.state.selectedSub || this.state.selectedSidebarColor !== undefined)) {
                    this.showConfirm('전담 시간 수정', '이 교시는 전담 시간입니다.<br>수정하시겠습니까?').then(r => {
                        if (r) { this._unlockSpCell(e.target); e.target.click(); }
                    });
                    return;
                }
                const cNum = e.target.dataset.cls, d = e.target.dataset.day, idx = parseInt(e.target.dataset.idx);
                let changed = false;
                if (this.state.selectedSub) {
                    e.target.value = this.state.selectedSub;
                    this.state.history[this.state.currentWeek].classes[cNum][d][idx] = this.state.selectedSub;
                    changed = true;
                }
                if (this.state.selectedSidebarColor !== undefined) {
                    const color = this.state.selectedSidebarColor;
                    if (!this.state.history[this.state.currentWeek].bgColors) this.state.history[this.state.currentWeek].bgColors = {};
                    if (!this.state.history[this.state.currentWeek].bgColors[cNum]) this.state.history[this.state.currentWeek].bgColors[cNum] = { "월":[], "화":[], "수":[], "목":[], "금":[] };
                    this.state.history[this.state.currentWeek].bgColors[cNum][d][idx] = color;
                    e.target.style.backgroundColor = color || '';
                    e.target.style.color = (color && color !== '#ffffff') ? '#000' : '';
                    e.target.style.fontWeight = color ? 'bold' : '';
                    changed = true;
                }
                if (changed) {
                    this.state.isDirty = true;
                    const saveBtn = e.target.closest('.timetable-section')?.querySelector('.btn-save-class');
                    if (saveBtn) { saveBtn.textContent = '저장'; saveBtn.style.background = '#f59e0b'; saveBtn.style.borderColor = '#f59e0b'; }
                    this.saveData();
                    this.renderSingleValidationGrid(cNum);
                    this.renderSubjectPalette();
                }
            }
        });

        const btnSpAdd = document.getElementById('btn-add-specialist');
        if (btnSpAdd) btnSpAdd.addEventListener('click', () => this.addSpecialistBoard());

        // 전담 보드 & 참고용 전담 시간표 키보드 방향키 네비게이션
        const spView = document.getElementById('specialist-view');
        if (spView) {
            spView.addEventListener('keydown', (e) => {
                const inp = e.target;
                let d, p, board, cls, attrD, attrP;
                if (inp.classList.contains('cell-input') && inp.getAttribute('data-sp-d')) {
                    d = inp.getAttribute('data-sp-d');
                    p = parseInt(inp.getAttribute('data-sp-p'));
                    board = inp.closest('.specialist-table-wrapper');
                    cls = 'cell-input'; attrD = 'data-sp-d'; attrP = 'data-sp-p';
                } else if (inp.classList.contains('sp-ref-input') && inp.getAttribute('data-ref-d')) {
                    d = inp.getAttribute('data-ref-d');
                    p = parseInt(inp.getAttribute('data-ref-p'));
                    board = inp.closest('.sp-ref-board');
                    cls = 'sp-ref-input'; attrD = 'data-ref-d'; attrP = 'data-ref-p';
                } else return;
                if (!d || isNaN(p) || !board) return;
                const dIdx = this.days.indexOf(d);
                let nextInp = null;
                if (e.key === 'ArrowRight' && dIdx < this.days.length - 1) {
                    e.preventDefault();
                    nextInp = board.querySelector(`.${cls}[${attrD}="${this.days[dIdx+1]}"][${attrP}="${p}"]`);
                } else if (e.key === 'ArrowLeft' && dIdx > 0) {
                    e.preventDefault();
                    nextInp = board.querySelector(`.${cls}[${attrD}="${this.days[dIdx-1]}"][${attrP}="${p}"]`);
                } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    e.preventDefault();
                    nextInp = board.querySelector(`.${cls}[${attrD}="${d}"][${attrP}="${p+1}"]`);
                } else if (e.key === 'ArrowUp' && p > 0) {
                    e.preventDefault();
                    nextInp = board.querySelector(`.${cls}[${attrD}="${d}"][${attrP}="${p-1}"]`);
                }
                if (nextInp) { nextInp.focus(); nextInp.select(); }
            });
        }
        
        const btnSpPreview = document.getElementById('btn-toggle-sp-preview');
        if (btnSpPreview) btnSpPreview.addEventListener('click', () => this.toggleSpPreview());
        
        const btnMarking = document.getElementById('btn-toggle-marking');
        if (btnMarking) btnMarking.addEventListener('click', () => this.toggleMarkingMode());

        const colorPresets = document.querySelectorAll('.mark-color-btn');
        colorPresets.forEach(btn => btn.addEventListener('click', (e) => { this.setMarkingColor(e.target.dataset.color, e.target); }));

        document.getElementById('btn-import-all').addEventListener('click', () => this.importAllSpecialists());
        document.getElementById('btn-random-all').addEventListener('click', () => this.randomAssignAll());
        document.getElementById('btn-print-guide').addEventListener('click', () => this.printWeeklyGuide());
        document.getElementById('btn-ppo-close').addEventListener('click', () => document.getElementById('print-preview-overlay').classList.add('hide'));
        document.getElementById('btn-ppo-print').addEventListener('click', () => this.printPDF());
        document.getElementById('btn-ppo-download').addEventListener('click', () => this.downloadPDF());
        document.getElementById('btn-ppo-word').addEventListener('click', () => this.downloadWord());
        document.getElementById('btn-clear-all').addEventListener('click', () => this.clearAllClasses());

        document.getElementById('btn-add-subject').addEventListener('click', () => { const count = this.dom.subjectList.querySelectorAll('.subject-row').length; this.addSubjectConfigItem('', count); });
        document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());

        this.dom.modalClose.addEventListener('click', () => this.closeModal(false));
        this.dom.modalCancel.addEventListener('click', () => this.closeModal(false));
        this.dom.modalConfirm.addEventListener('click', () => this.closeModal(true));

        this.dom.palette.addEventListener('click', (e) => {
            const card = e.target.closest('.palette-card');
            if (card) {
                const sub = card.dataset.sub;
                if (this.state.selectedSub === sub) {
                    this.state.selectedSub = null;
                } else {
                    this.state.selectedSub = sub;
                }
                this.renderSubjectPalette();
            }
        });

        // 📱 PWA Install Logic
        const checkStandalone = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
            if (isStandalone && this.dom.installBtn) {
                this.dom.installBtn.classList.add('hide');
                this.dom.installBtn.style.display = 'none';
                return true;
            }
            return false;
        };

        // Initial check
        checkStandalone();

        window.addEventListener('beforeinstallprompt', (e) => {
            // If already in standalone, don't show prompt
            if (checkStandalone()) return;
            
            e.preventDefault();
            this.state.deferredPrompt = e;
            if (this.dom.installBtn) {
                this.dom.installBtn.classList.remove('hide');
                this.dom.installBtn.style.display = 'inline-flex';
            }
        });

        if (this.dom.installBtn) {
            this.dom.installBtn.addEventListener('click', async () => {
                if (!this.state.deferredPrompt) return;
                this.state.deferredPrompt.prompt();
                const { outcome } = await this.state.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    if(this.dom.installBtn) {
                        this.dom.installBtn.classList.add('hide');
                        this.dom.installBtn.style.display = 'none';
                    }
                }
                this.state.deferredPrompt = null;
            });
        }

        window.addEventListener('appinstalled', () => {
            this.state.deferredPrompt = null;
            if (this.dom.installBtn) {
                this.dom.installBtn.classList.add('hide');
                this.dom.installBtn.style.display = 'none';
            }
            console.log('PWA was installed');
        });

        // 🔒 Login UI Events
        if (this.dom.btnLogin) {
            this.dom.btnLogin.addEventListener('click', () => this.handleLogin());
        }
        const checkLoginReady = () => {
            const roomCode = this.dom.loginRoomCode?.value.trim();
            const name = this.dom.loginName?.value.trim();
            const classNum = this.dom.loginClassNum?.value;
            const ready = roomCode && name && classNum && parseInt(classNum) >= 1;
            if (this.dom.btnLogin) this.dom.btnLogin.classList.toggle('active', !!ready);
        };
        this.dom.loginName?.addEventListener('input', checkLoginReady);
        this.dom.loginClassNum?.addEventListener('input', checkLoginReady);
        this.dom.loginRoomCode?.addEventListener('change', checkLoginReady);
        if (this.dom.btnCreateRoom) {
            this.dom.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
        }
        document.getElementById('btn-superadmin')?.addEventListener('click', () => this.handleSuperAdmin());
        if (this.dom.btnLogout) {
            this.dom.btnLogout.addEventListener('click', () => this.handleLogout());
        }
    },

    /* --- 🔒 Auth Methods --- */
    checkLogin(fromInit = false) {
        if (!this.state.userProfile) {
            if (this.dom.loginOverlay) this.dom.loginOverlay.classList.remove('hide');
            if (this.dom.userBadge) this.dom.userBadge.classList.add('hide');
            document.getElementById('btn-admin-mode')?.classList.add('hide');
            this._setServerBtns(false);
            this._loadRoomList();
        } else {
            if (this.dom.loginOverlay) this.dom.loginOverlay.classList.add('hide');
            this._setServerBtns(true);
            this.renderUserProfile();
            this.updateNavForRole();
            if (!this.state.roomCode) {
                this._promptRoomCode();
            } else if (fromInit) {
                // 새로고침으로 세션 복원 시 서버에서 최신 데이터 자동 로드
                this.loadFromServer();
            }
        }
    },

    _setServerBtns(visible) {
        const save = document.getElementById('btn-server-save');
        const load = document.getElementById('btn-server-load');
        // 전체저장은 관리자만, ↺ 아이콘은 로그인한 모든 사용자
        if (save) save.style.display = (visible && this.state.isAdmin) ? 'inline-flex' : 'none';
        if (load) load.style.display = visible ? 'inline-flex' : 'none';
    },

    async _loadRoomList() {
        const sel = this.dom.loginRoomCode;
        if (!sel) return;
        sel.innerHTML = '<option value="">불러오는 중...</option>';
        try {
            const rooms = await FirebaseDB.listRooms();
            if (rooms.length === 0) {
                sel.innerHTML = '<option value="">생성된 학년이 없습니다</option>';
            } else {
                sel.innerHTML = '<option value="">학년을 선택해주세요</option>' +
                    rooms.map(r => `<option value="${r}">${r}</option>`).join('');
            }
        } catch (e) {
            sel.innerHTML = '<option value="">로드 실패 — 새로고침해주세요</option>';
        }
    },

    handleCreateRoom() {
        const overlay = document.getElementById('create-room-overlay');
        const schoolInput = document.getElementById('cr-school');
        const gradeSelect = document.getElementById('cr-grade');
        const previewCode = document.getElementById('cr-preview-code');
        const confirmBtn = document.getElementById('btn-cr-confirm');
        const errorBox = document.getElementById('cr-error');
        if (!overlay) return;

        const showError = (msg) => { errorBox.textContent = msg; errorBox.classList.remove('hide'); };
        const hideError = () => errorBox.classList.add('hide');

        // 초기화
        schoolInput.value = '';
        gradeSelect.value = '';
        previewCode.textContent = '—';
        confirmBtn.disabled = true;
        hideError();
        overlay.classList.remove('hide');
        setTimeout(() => schoolInput.focus(), 50);

        const updatePreview = () => {
            const school = schoolInput.value.trim();
            const grade = gradeSelect.value;
            const code = school && grade ? `${school}${grade}` : '';
            previewCode.textContent = code || '—';
            confirmBtn.disabled = !code;
            hideError();
        };
        schoolInput.oninput = updatePreview;
        gradeSelect.onchange = updatePreview;

        const close = () => {
            overlay.classList.add('hide');
            schoolInput.oninput = null;
            gradeSelect.onchange = null;
            confirmBtn.onclick = null;
            document.getElementById('btn-cr-cancel').onclick = null;
            document.getElementById('btn-cr-close').onclick = null;
        };

        confirmBtn.onclick = async () => {
            const roomCode = previewCode.textContent;
            if (!roomCode || roomCode === '—') return;
            confirmBtn.disabled = true;
            confirmBtn.textContent = '생성 중...';
            try {
                const created = await FirebaseDB.createRoom(roomCode);
                if (!created) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '생성하기';
                    showError(`"${roomCode}" 방은 이미 존재합니다.`);
                    return;
                }
                close();
                await this._loadRoomList();
                if (this.dom.loginRoomCode) {
                    this.dom.loginRoomCode.value = roomCode;
                    this.dom.loginRoomCode.dispatchEvent(new Event('change'));
                }
                this.showToast(`"${roomCode}" 학년이 생성되었습니다.`);
            } catch (e) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = '생성하기';
                showError('학년 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
            }
        };

        document.getElementById('btn-cr-cancel').onclick = close;
        document.getElementById('btn-cr-close').onclick = close;
    },

    handleSuperAdmin() {
        // 비밀번호는 이 한 줄만 바꾸면 됩니다
        const SUPER_PW = 'myung865';

        this.showPrompt('관리자 인증', '비밀번호를 입력해주세요.', 'password').then(pw => {
            if (pw === null) return;
            if (pw !== SUPER_PW) {
                this.showAlert('인증 실패', '비밀번호가 올바르지 않습니다.');
                return;
            }
            this.openRoomManager();
        });
    },

    async openRoomManager() {
        const overlay = document.getElementById('room-manage-overlay');
        const list = document.getElementById('rm-room-list');
        if (!overlay || !list) return;

        overlay.classList.remove('hide');
        list.innerHTML = '<li class="rm-loading">불러오는 중...</li>';

        const render = async () => {
            try {
                const rooms = await FirebaseDB.listRooms();
                if (rooms.length === 0) {
                    list.innerHTML = '<li class="rm-loading">생성된 방이 없습니다.</li>';
                    return;
                }
                list.innerHTML = rooms.map(r => `
                    <li class="rm-room-item">
                        <span class="rm-room-name">${r}</span>
                        <button class="rm-delete-btn" data-room="${r}">삭제</button>
                    </li>`).join('');
            } catch (e) {
                list.innerHTML = '<li class="rm-loading">로드 실패. 다시 시도해주세요.</li>';
            }
        };
        await render();

        list.onclick = async (e) => {
            const btn = e.target.closest('.rm-delete-btn');
            const cancelBtn = e.target.closest('.rm-cancel-btn');
            const confirmBtn = e.target.closest('.rm-confirm-btn');

            if (cancelBtn) {
                // 취소 → 원래 상태로 복원
                const item = cancelBtn.closest('.rm-room-item');
                const roomCode = item.dataset.room;
                item.innerHTML = `<span class="rm-room-name">${roomCode}</span><button class="rm-delete-btn" data-room="${roomCode}">삭제</button>`;
                return;
            }

            if (confirmBtn) {
                const item = confirmBtn.closest('.rm-room-item');
                const roomCode = item.dataset.room;
                confirmBtn.disabled = true;
                confirmBtn.textContent = '삭제 중...';
                try {
                    await FirebaseDB.deleteRoom(roomCode);
                    await render();
                    this._loadRoomList();
                    this.showToast(`"${roomCode}" 방이 삭제되었습니다.`);
                } catch (err) {
                    await render();
                    this.showToast('삭제 중 오류가 발생했습니다.');
                }
                return;
            }

            if (btn) {
                const roomCode = btn.dataset.room;
                const item = btn.closest('.rm-room-item');
                item.dataset.room = roomCode;
                item.innerHTML = `
                    <span class="rm-room-name rm-warn">⚠ "${roomCode}" 삭제할까요?</span>
                    <div style="display:flex;gap:6px;">
                        <button class="rm-cancel-btn" data-room="${roomCode}">취소</button>
                        <button class="rm-confirm-btn" data-room="${roomCode}">삭제 확인</button>
                    </div>`;
            }
        };

        const close = () => { overlay.classList.add('hide'); list.onclick = null; };
        document.getElementById('btn-rm-close').onclick = close;
        document.getElementById('btn-rm-done').onclick = close;
    },

    _promptRoomCode() {
        this.showPrompt('방 코드 입력', '방 코드를 입력해주세요.<br>(예: 한미소초4학년)').then(code => {
            if (!code || !code.trim()) return;
            this.state.roomCode = code.trim();
            this.saveData();
            this.loadFromServer();
        });
    },
    handleLogin() {
        const roomCode = this.dom.loginRoomCode.value.trim();
        const name = this.dom.loginName.value.trim();
        const classNum = parseInt(this.dom.loginClassNum.value);
        if (!roomCode) return this.showAlert('입력 오류', '방 코드를 입력해주세요.');
        if (!name) return this.showAlert('입력 오류', '성함을 입력해주세요.');
        if (!classNum || classNum < 1) return this.showAlert('입력 오류', '올바른 반 번호를 입력해주세요 (1 이상).');
        this.state.userProfile = { name, classNum };
        this.state.roomCode = roomCode;
        this.state.isAdmin = false;
        this.saveData();
        this.checkLogin();
        this.loadFromServer();
    },
    handleLogout() {
        this.showConfirm('로그아웃', '로그아웃하면 현재 세션이 종료됩니다.<br>계속하시겠습니까?').then(res => {
            if (res) {
                this.state.userProfile = null;
                this.state.isAdmin = false;
                this.saveData();
                location.reload();
            }
        });
    },
    toggleAdminMode() {
        if (this.state.isAdmin) {
            this.state.isAdmin = false;
            this.saveData();
            this.updateNavForRole();
            this._setServerBtns(true);
            this.renderTimetableLayout();
        } else {
            this.showPinModal().then(pw => {
                if (pw === null) return;
                if (pw !== (this.state.config.adminPin || '0000')) {
                    // 틀렸을 때 PIN 박스 흔들기
                    const boxes = document.querySelectorAll('.pin-box');
                    boxes.forEach(b => { b.value = ''; b.classList.add('pin-error'); });
                    setTimeout(() => boxes.forEach(b => b.classList.remove('pin-error')), 600);
                    if (boxes[0]) boxes[0].focus();
                    return;
                }
                this.closeModal(false);
                this.state.isAdmin = true;
                this.saveData();
                this.updateNavForRole();
                this._setServerBtns(true);
                this.renderTimetableLayout();
            });
        }
    },
    showPinModal() {
        return new Promise(resolve => {
            this.dom.modalTitle.textContent = '관리자 모드';
            this.dom.modalContent.innerHTML = `
                <p style="font-size:0.88rem; color:#64748b; margin-bottom:20px;">관리자 비밀번호 4자리를 입력하세요.</p>
                <div class="pin-input-wrap">
                    <input class="pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off">
                    <input class="pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off">
                    <input class="pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off">
                    <input class="pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off">
                </div>`;
            this.dom.modalCancel.classList.remove('hide');
            this.dom.modalConfirm.textContent = '확인';
            this.dom.modalContainer.classList.remove('hide');

            const boxes = [...document.querySelectorAll('.pin-box')];
            boxes[0]?.focus();

            boxes.forEach((box, i) => {
                box.addEventListener('input', () => {
                    box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
                    if (box.value && i < 3) boxes[i + 1].focus();
                    if (boxes.every(b => b.value)) {
                        resolve(boxes.map(b => b.value).join(''));
                    }
                });
                box.addEventListener('keydown', e => {
                    if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
                });
            });

            this.modalResolve = (confirmed) => {
                if (!confirmed) resolve(null);
            };
        });
    },
    renderUserProfile() {
        if (this.state.userProfile && this.dom.userBadge) {
            this.dom.userBadge.classList.remove('hide');
            if (this.dom.userInfoText) {
                const p = this.state.userProfile;
                this.dom.userInfoText.textContent = `${p.classNum}반 ${p.name} 선생님`;
            }
            const adminBtn = document.getElementById('btn-admin-mode');
            if (adminBtn) adminBtn.classList.remove('hide');
        }
    },
    updateNavForRole() {
        const isAdmin = this.state.isAdmin;
        const adminOnlyIds = ['btn-settings', 'btn-validation', 'btn-specialist', 'btn-timetable-all'];
        adminOnlyIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('hide', !isAdmin);
        });
        const adminBtn = document.getElementById('btn-admin-mode');
        if (adminBtn) {
            adminBtn.classList.toggle('active', isAdmin);
            adminBtn.title = isAdmin ? '관리자 모드 해제' : '관리자 모드';
        }
        if (this.dom.userBadge) {
            this.dom.userBadge.classList.toggle('user-card-admin', isAdmin);
        }
        // 모드 전환 시 적절한 시간표 메뉴로 이동
        if (isAdmin) {
            this.switchMenu('timetable-all');
        } else {
            this.switchMenu('timetable');
        }
    },

    async switchMenu(menuId) {
        this.dom.navs.forEach(nav => nav.classList.remove('active'));
        const activeNav = document.getElementById(`btn-${menuId}`);
        if (activeNav) activeNav.classList.add('active');
        // 전담 미저장 경고
        const currentMenu = document.querySelector('.nav-item.active')?.id?.replace('btn-', '');
        if (currentMenu === 'specialist' && menuId !== 'specialist' && this.state.isSpDirty) {
            const go = await this.showConfirm('전담 미저장 경고', '전담 데이터가 서버에 저장되지 않았습니다.<br>저장하지 않고 이동하면 다른 기기에 반영되지 않습니다.<br><br>그래도 이동하시겠습니까?');
            if (!go) return;
        }
        // timetable-all과 timetable은 같은 섹션을 공유하므로 중복 hide 방지
        const uniqueMenus = new Set(Object.values(this.dom.menus));
        uniqueMenus.forEach(v => { if(v) v.classList.add('hide'); });
        if (this.dom.menus[menuId]) this.dom.menus[menuId].classList.remove('hide');
        if (menuId === 'timetable') this.renderTimetableLayout('single');
        else if (menuId === 'timetable-all') this.renderTimetableLayout('all');
        else if (menuId === 'settings') this.renderSettingsView();
        else if (menuId === 'specialist') this.renderSpecialistView();
        else if (menuId === 'validation') this.calculateAndRenderValidationView();
    },

    showAlert(t, m) {
        return new Promise(resolve => {
            this.dom.modalTitle.textContent = t; this.dom.modalContent.innerHTML = `<div class="alert">${m}</div>`;
            this.dom.modalCancel.classList.add('hide'); this.dom.modalConfirm.textContent = '확인'; this.dom.modalContainer.classList.remove('hide'); this.modalResolve = resolve;
        });
    },
    showConfirm(t, m) {
        return new Promise(resolve => {
            this.dom.modalTitle.textContent = t; this.dom.modalContent.innerHTML = `<div>${m}</div>`;
            this.dom.modalCancel.classList.remove('hide'); this.dom.modalConfirm.textContent = '확인'; this.dom.modalContainer.classList.remove('hide'); this.modalResolve = resolve;
        });
    },
    showPrompt(t, m, type = 'text') {
        return new Promise(resolve => {
            this.dom.modalTitle.textContent = t;
            this.dom.modalContent.innerHTML = `<div style="margin-bottom:12px;">${m}</div><input id="modal-prompt-input" type="${type}" class="setting-input" style="width:100%;" autocomplete="off">`;
            this.dom.modalCancel.classList.remove('hide'); this.dom.modalConfirm.textContent = '확인'; this.dom.modalContainer.classList.remove('hide');
            const inp = document.getElementById('modal-prompt-input');
            if (inp) { inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') this.closeModal(true); }); }
            this.modalResolve = (confirmed) => resolve(confirmed ? (document.getElementById('modal-prompt-input')?.value ?? null) : null);
        });
    },
    closeModal(res) {
        this.dom.modalContainer.classList.add('hide');
        this.dom.modalContainer.querySelector('.modal').classList.remove('modal-wide');
        if (this.modalResolve) { this.modalResolve(res); this.modalResolve = null; }
    },

    // ── 반별 저장 버튼 ──
    async saveClassToServer(classNum) {
        if (!this.state.roomCode) return this.showAlert('오류', '방 코드가 없습니다. 다시 로그인해주세요.');
        const btn = document.querySelector(`.btn-save-class[data-cls="${classNum}"]`);
        if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
        try {
            if (this.state.isAdmin) {
                await FirebaseDB.saveAdmin(this.state.roomCode, this.state);
                this.showToast('✅ 전체 데이터를 저장했습니다.');
            } else {
                await FirebaseDB.saveClass(this.state.roomCode, classNum, this.state);
                this.showToast(`✅ ${classNum}반 시간표를 저장했습니다.`);
            }
            this.state.isDirty = false;
            const allSaveBtns = document.querySelectorAll('.btn-save-class');
            allSaveBtns.forEach(b => { b.textContent = '저장'; b.style.background = ''; b.style.borderColor = ''; });
        } catch (e) {
            this.showToast('❌ 저장 실패: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; }
        }
    },

    // ── 서버 저장 ──
    async saveToServer() {
        if (!this.state.roomCode) return this.showAlert('오류', '방 코드가 없습니다. 다시 로그인해주세요.');
        const btn = this.dom.btnServerSave;
        if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
        try {
            if (this.state.isAdmin) {
                await FirebaseDB.saveAdmin(this.state.roomCode, this.state);
                this.showToast('✅ 전체 데이터를 서버에 저장했습니다.');
            } else {
                const classNum = this.state.userProfile?.classNum;
                await FirebaseDB.saveClass(this.state.roomCode, classNum, this.state);
                this.showToast(`✅ ${classNum}반 시간표를 서버에 저장했습니다.`);
            }
        } catch (e) {
            this.showToast('❌ 저장 실패: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '↑ 서버에 저장'; }
        }
    },

    // ── 서버에서 불러오기 ──
    async loadFromServer() {
        if (!this.state.roomCode) return;
        const btn = this.dom.btnServerLoad;
        if (btn) { btn.disabled = true; btn.textContent = '불러오는 중...'; }
        try {
            const data = await FirebaseDB.load(this.state.roomCode);
            if (!data) {
                this.showToast('서버에 데이터가 없습니다. 방 코드를 확인해주세요.');
                return;
            }
            // 로그인 상태·UI 상태는 유지하고 나머지만 덮어씀
            const keep = { userProfile: this.state.userProfile, roomCode: this.state.roomCode, isAdmin: this.state.isAdmin, selectedSub: this.state.selectedSub, selectedSidebarColor: this.state.selectedSidebarColor, spPreviewOpen: false, isMarkingMode: false, markingColor: this.state.markingColor, deferredPrompt: this.state.deferredPrompt };
            this.state = { ...this.state, ...data, ...keep };
            // 새 방이거나 서버에 과목이 없으면 기본 과목 적용
            if (!this.state.config) this.state.config = { grade: '', classCount: 4, periods: { "월": 6, "화": 6, "수": 5, "목": 6, "금": 6 }, subjects: [] };
            if (!this.state.config.subjects || this.state.config.subjects.length === 0) {
                const defaults = ["국어", "사회", "도덕", "수학", "과학", "체육", "음악", "미술", "영어", "자율", "동아리", "봉사", "진로"];
                this.state.config.subjects = defaults.map(s => ({ name: s, blockSize: (s === '미술' || s === '실과') ? 2 : 1 }));
            }
            if (!this.state.referenceBoards || this.state.referenceBoards.length === 0) {
                this.state.referenceBoards = [
                    { name: '참고 시간표 1', data: {}, marks: {} },
                    { name: '참고 시간표 2', data: {}, marks: {} }
                ];
            }
            if (!this.state.specialists || this.state.specialists.length === 0) {
                this.state.specialists = [
                    { subject: '전담 1', desc: '', data: {}, marks: {}, bg: '#ffffff' },
                    { subject: '전담 2', desc: '', data: {}, marks: {}, bg: '#ffffff' }
                ];
            }
            // maxWeek에 맞춰 주차 데이터 초기화 보정
            for (let w = 1; w <= this.state.maxWeek; w++) this.initWeekData(w);
            // 항상 최신 주차로 이동
            this.state.currentWeek = this.state.maxWeek;
            this.saveData();
            this.renderTimetableLayout();
            this.calculateAndRenderValidationView?.();
            const who = data.lastSavedBy ? `(${data.lastSavedBy} 저장본)` : '';
            this.showToast(`✅ 서버에서 불러오기 완료 ${who}`);
        } catch (e) {
            this.showToast('❌ 불러오기 실패: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '↓ 새로고침'; }
            this._setServerBtns(true);
        }
    },

    // ── 토스트 알림 ──
    showToast(msg, duration = 3500) {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.className = 'app-toast app-toast-show';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { toast.className = 'app-toast'; }, duration);
    },

    /* --- Smart Assignment Modal --- */
    showAssignmentModal() {
        return new Promise(resolve => {
            const weekData = this.state.history[this.state.currentWeek], targets = weekData.targets;
            const subjects = this.state.config.subjects, classCount = this.state.config.classCount;

            // 현재 시간표에 입력된 과목별 차시 수 집계 → 반당 평균
            const filledCounts = {};
            subjects.forEach(s => filledCounts[s.name] = 0);
            for (let c = 1; c <= classCount; c++) {
                const cd = weekData.classes[c] || {};
                this.days.forEach(d => {
                    (cd[d] || []).forEach(v => { if (v && filledCounts[v] !== undefined) filledCounts[v]++; });
                });
            }
            // 전체 합계 → 반당 평균 (정수)
            subjects.forEach(s => {
                filledCounts[s.name] = classCount > 0 ? Math.round(filledCounts[s.name] / classCount) : 0;
            });

            let h = `<div class="assignment-setup">
                <p style="font-size:0.82rem; color:#64748b; margin-bottom:14px;">배정할 과목을 선택하세요. 랜덤 배정 차시 = 이번 주 목표 − 이미 배정된 차시 (반당 평균)</p>
                <div style="max-height:380px; overflow-y:auto; border:1px solid #e5e7eb; border-radius:10px;">
                <table style="width:100%; font-size:0.83rem; border-collapse:collapse;">
                <thead style="background:#f8fafc; position:sticky; top:0;">
                <tr style="border-bottom:1px solid #e5e7eb;">
                  <th style="padding:10px 8px; text-align:left; width:32px;"><input type="checkbox" id="assign-select-all" checked></th>
                  <th style="padding:10px 8px; text-align:left;">과목</th>
                  <th style="padding:10px 8px; text-align:center; color:#64748b;">이번 주 목표</th>
                  <th style="padding:10px 8px; text-align:center; color:#64748b;">이미 배정</th>
                  <th style="padding:10px 8px; text-align:center; color:#059669; font-weight:700;">랜덤 배정</th>
                  <th style="padding:10px 8px; text-align:center; color:#64748b;">연차시</th>
                </tr></thead><tbody>`;

            subjects.forEach(sObj => {
                const sub = sObj.name;
                const weekly = targets[sub] || 0;
                const filled = filledCounts[sub] || 0;
                const rand = Math.max(0, weekly - filled);
                const dim = rand === 0 ? 'opacity:0.4;' : '';
                h += `<tr style="border-bottom:1px solid #f1f5f9; ${dim}">
                    <td style="padding:10px 8px;"><input type="checkbox" class="assign-subject-chk" data-sub="${sub}" ${rand > 0 ? 'checked':''}></td>
                    <td style="padding:10px 8px; font-weight:600;">${sub}</td>
                    <td style="padding:10px 8px; text-align:center;">${weekly}차시</td>
                    <td style="padding:10px 8px; text-align:center; color:#64748b;">${filled > 0 ? filled + '차시' : '—'}</td>
                    <td style="padding:10px 8px; text-align:center; font-weight:700; color:${rand > 0 ? '#059669' : '#94a3b8'};">${rand}차시</td>
                    <td style="padding:10px 8px; text-align:center;">
                        <select class="assign-block-size" data-sub="${sub}" style="padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.8rem;">
                            <option value="1" ${sObj.blockSize <= 1 ? 'selected':''}>단독</option>
                            <option value="2" ${sObj.blockSize === 2 ? 'selected':''}>2차시</option>
                            <option value="3" ${sObj.blockSize === 3 ? 'selected':''}>3차시</option>
                        </select>
                    </td>
                </tr>`;
            });

            h += `</tbody></table></div></div>`;
            this.dom.modalTitle.textContent = '전체 랜덤 배정';
            this.dom.modalContent.innerHTML = h;
            this.dom.modalCancel.classList.remove('hide');
            this.dom.modalConfirm.textContent = '배정 시작';
            this.dom.modalContainer.classList.remove('hide');
            const sa = document.getElementById('assign-select-all');
            if (sa) sa.addEventListener('change', (e) => { document.querySelectorAll('.assign-subject-chk').forEach(chk => chk.checked = e.target.checked); });
            this.modalResolve = (conf) => {
                if (!conf) return resolve(null);
                const sel = [];
                document.querySelectorAll('.assign-subject-chk').forEach(chk => {
                    if (chk.checked) {
                        const sub = chk.dataset.sub, bs = parseInt(document.querySelector(`.assign-block-size[data-sub="${sub}"]`).value);
                        sel.push({ name: sub, blockSize: bs });
                    }
                });
                resolve(sel);
            };
        });
    },
    randomAssignAll() { this.showAssignmentModal().then(c => { if(c && c.length > 0) this.executeRandomAssign(c); }); },
    executeRandomAssign(selected) {
        const weekData = this.state.history[this.state.currentWeek], targets = weekData.targets;
        for (let c = 1; c <= this.state.config.classCount; c++) {
            const cd = weekData.classes[c], cur = {}, pd = {}; selected.forEach(s => { cur[s.name] = 0; pd[s.name] = []; });
            this.days.forEach(d => { const mp = this.state.config.periods[d]; if(!cd[d]) cd[d] = []; for(let p=0; p<mp; p++){ const v = cd[d][p]; if(v && cur[v] !== undefined) { cur[v]++; if(!pd[v].includes(d)) pd[v].push(d); } } });
            
            const blks = [], sngs = []; 
            selected.forEach(sO => { 
                const sub = sO.name, need = Math.max(0, (targets[sub]||0) - cur[sub]); 
                const cfgSub = this.state.config.subjects.find(s => s.name === sub);
                // 반별 설정이 있으면 우선 적용, 없으면 전역 설정 사용
                const classOverride = (this.state.classSettings[c] || {})[sub];
                const pref = classOverride?.preferredSlot !== undefined
                    ? classOverride.preferredSlot
                    : (cfgSub ? (cfgSub.preferredSlot || 0) : 0);
                let t = (sub.includes('국어') || sub.includes('수학')) ? 1 : ((sub.includes('사회') || sub.includes('과학')) ? 2 : 3); 
                
                if (sO.blockSize > 1) { 
                    for(let i=0; i<Math.floor(need / sO.blockSize); i++) blks.push({ name: sub, tier: t, size: sO.blockSize, pref }); 
                    for(let i=0; i<(need % sO.blockSize); i++) sngs.push({ name: sub, tier: t, pref }); 
                } else {
                    for(let i=0; i<need; i++) sngs.push({ name: sub, tier: t, pref }); 
                }
            });

            const shf = (a) => a.sort(() => Math.random() - 0.5); shf(blks); shf(sngs); blks.sort((a,b) => a.tier - b.tier); sngs.sort((a,b) => a.tier - b.tier);
            
            const ass = (sub, size, ps, pe) => {
                const sd = [...this.days].sort(() => Math.random() - 0.5); 
                for (let d of sd) { if (pd[sub].includes(d)) continue; const mp = this.state.config.periods[d]; for (let p = ps; p <= Math.min(pe, mp - size); p++) { let ok = true; for(let k=0; k<size; k++) if(cd[d][p+k]) ok = false; if(ok) { for(let k=0; k<size; k++) cd[d][p+k] = sub; pd[sub].push(d); return true; } } }
                for (let d of sd) { if (pd[sub].includes(d)) continue; const mp = this.state.config.periods[d]; for (let p = 0; p <= mp - size; p++) { let ok = true; for(let k=0; k<size; k++) if(cd[d][p+k]) ok = false; if(ok) { for(let k=0; k<size; k++) cd[d][p+k] = sub; pd[sub].push(d); return true; } } }
                for (let d of sd) { const mp = this.state.config.periods[d]; for (let p = 0; p <= mp - size; p++) { let ok = true; for(let k=0; k<size; k++) if(cd[d][p+k]) ok = false; if(ok) { for(let k=0; k<size; k++) cd[d][p+k] = sub; return true; } } }
                if (size > 1) { for(let i=0; i<size; i++) ass(sub, 1, ps, pe); return true; } return false;
            };

            const getBounds = (pref, tier) => {
                if (pref === 1) return [0, 1]; // 1-2교시
                if (pref === 2) return [2, 3]; // 3-4교시
                if (pref === 3) return [4, 5]; // 5-6교시
                return [tier === 1 ? 0 : (tier === 2 ? 2 : 0), 5]; // 기본 로직
            };

            blks.forEach(item => { const b = getBounds(item.pref, item.tier); ass(item.name, item.size, b[0], b[1]); });
            sngs.forEach(item => { const b = getBounds(item.pref, item.tier); ass(item.name, 1, b[0], b[1]); });
        }
        this.saveData(); this.renderTimetableLayout(); this.showAlert('배정 완료', '선호 시간대를 고려하여 전체 반 배정이 완료되었습니다.');
    },

    /* --- 반별 랜덤 배정 설정 카드 --- */
    renderRandomSettingsCard(classNum) {
        const subs = this.state.config.subjects;
        const cs = this.state.classSettings[classNum] || {};

        const slotOptions = (cur) => [
            [0,'기본 (자동)'], [1,'1-2교시 선호'], [2,'3-4교시 선호'], [3,'5-6교시 선호']
        ].map(([v,l]) => `<option value="${v}" ${cur==v?'selected':''}>${l}</option>`).join('');

        let rows = subs.map(s => {
            const ov = cs[s.name] || {};
            const pref = ov.preferredSlot !== undefined ? ov.preferredSlot : (s.preferredSlot || 0);
            return `<tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:10px 14px; font-weight:600; color:var(--text-main);">${s.name}</td>
                <td style="padding:10px 14px;">
                    <select style="width:100%; padding:7px 10px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:0.85rem; background:#f8fafc;"
                        onchange="App.saveClassSetting(${classNum},'${s.name}','preferredSlot',+this.value)">${slotOptions(pref)}</select>
                </td>
            </tr>`;
        }).join('');

        return `<div class="card" style="margin-top:20px;">
            <div class="section-header" style="padding-bottom:12px;">
                <div>
                    <h3 style="font-size:0.95rem; font-weight:700;">랜덤 배정 선호 시간 설정</h3>
                    <p class="subtitle" style="font-size:0.8rem; margin-top:3px;">관리자가 전체 랜덤 배정 시 이 설정이 우리 반에 적용됩니다. 매주 유지됩니다.</p>
                </div>
            </div>
            <div style="border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
            <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <thead style="background:#f8fafc; border-bottom:1px solid #e5e7eb;">
                <tr>
                    <th style="padding:10px 14px; text-align:left; color:#64748b; font-weight:600;">과목</th>
                    <th style="padding:10px 14px; text-align:left; color:#64748b; font-weight:600;">선호 시간대</th>
                </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
        </div>`;
    },
    _unlockSpCell(input) {
        input.removeAttribute('readonly');
        input.removeAttribute('data-sp-locked');
        input.removeAttribute('title');
        input.classList.remove('sp-locked');
        // 상태에서도 잠금 해제
        const cNum = input.dataset.cls, d = input.dataset.day, p = parseInt(input.dataset.idx);
        const sc = this.state.history[this.state.currentWeek].specialistCells;
        if (sc?.[cNum]?.[d]) delete sc[cNum][d][p];
        this.saveData();
    },

    saveClassSetting(classNum, subName, field, value) {
        if (!this.state.classSettings[classNum]) this.state.classSettings[classNum] = {};
        if (!this.state.classSettings[classNum][subName]) this.state.classSettings[classNum][subName] = {};
        this.state.classSettings[classNum][subName][field] = value;
        this.saveData();
    },

    /* --- Timetable Render --- */
    renderTimetableLayout(mode) {
        // mode가 없으면 현재 활성 메뉴 기준으로 판단
        if (!mode) {
            const activeNav = document.querySelector('.nav-item.active');
            mode = activeNav?.id === 'btn-timetable-all' ? 'all' : 'single';
        }
        this._timetableMode = mode;
        this.dom.weekLabel.textContent = `${this.state.currentWeek}주차 시간표`;
        const tgts = this.state.history[this.state.currentWeek].targets, subs = this.state.config.subjects;
        let th = `<div class="target-table-wrapper"><table class="target-table"><thead><tr><th>목표 차시</th>`;
        subs.forEach(s => th += `<th>${s.name}</th>`);
        th += `<th>합계</th></tr></thead><tbody><tr><td class="target-row-label">이번 주 목표</td>`;
        const targetReadonly = (mode === 'single');
        let tv = 0; subs.forEach(s => { th += `<td><input type="text" inputmode="numeric" class="target-input-global target-cell-input${targetReadonly ? ' target-locked' : ''}" data-sub="${s.name}" value="${tgts[s.name]||0}"${targetReadonly ? ' readonly title="관리자만 목표 차시를 변경할 수 있습니다."' : ''}></td>`; tv += tgts[s.name] || 0; });
        th += `<td class="total-val" style="font-weight:800; font-size:1.05rem;">${tv}</td></tr></tbody></table></div>`;
        this.dom.weekTargetContainer.innerHTML = th;

        // 전체 시간표(all): 모든 반, 반별 시간표(single): 자기 반만
        const classesToRender = mode === 'all'
            ? Array.from({ length: this.state.config.classCount }, (_, i) => i + 1)
            : [this.state.userProfile?.classNum].filter(Boolean);

        let lh = '';
        for (const c of classesToRender) {
            const isLast = (c === classesToRender[classesToRender.length - 1]);
            lh += `
            <div class="integrated-layout" style="${isLast ? '' : 'border-bottom: 1.5px solid #f1f5f9; margin-bottom: 20px; padding-bottom: 20px;'}">
                <div class="timetable-section card" style="margin-bottom:0; min-height:480px; height:480px;">
                    <div class="section-header" style="padding-bottom:10px;">
                        <h3><span class="active-class-name">${c}반</span> 시간표</h3>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <button class="btn-secondary btn-sm" onclick="App.copyClassTable(${c}, this)" title="표를 복사해 Word에 붙여넣기">복사</button>
                            ${this.state.isAdmin ? `<button class="btn-clear-class-admin btn-secondary btn-sm" data-cls="${c}" onclick="App.clearClass(${c})">삭제</button>` : ''}
                            ${this.state.isAdmin || String(this.state.userProfile?.classNum) === String(c) ? `<button class="btn-save-class btn-primary-small" data-cls="${c}" onclick="App.saveClassToServer(${c})">저장</button>` : ''}
                        </div>
                    </div>
                    <div class="table-responsive mt-2">
                        <table class="excel-table">${this.getTimetableGridHtml(c)}</table>
                    </div>
                </div>
                <div class="validation-section card" style="margin-bottom:0; min-height:480px; height:480px;">
                    <div class="section-header" style="padding-bottom:10px;">
                        <h3>차시 확인</h3>
                    </div>
                    <div class="table-responsive mt-2">
                        <table class="excel-table val-table" id="val-grid-${c}"></table>
                    </div>
                </div>
            </div>`;
        }
        // 반별 시간표 모드: 랜덤 배정 설정 카드 추가
        if (mode === 'single' && classesToRender.length > 0) {
            lh += this.renderRandomSettingsCard(classesToRender[0]);
        }

        if (this.dom.allClassesContainer) {
            this.dom.allClassesContainer.style.display = 'block';
            this.dom.allClassesContainer.innerHTML = lh;
        }
        // 관리자 전용 버튼: 전체 시간표(all) 모드 + 관리자일 때만 표시
        const adminOnlyBtns = ['btn-clear-all', 'btn-create-week', 'btn-import-all', 'btn-random-all'];
        adminOnlyBtns.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('hide', mode !== 'all' || !this.state.isAdmin);
        });
        this.renderAllValidationGrids();
        this.renderSubjectPalette();
    },
    renderSubjectPalette() {
        if (!this.dom.palette) return;
        const subs = this.state.config.subjects;
        const weekData = this.state.history[this.state.currentWeek];
        const targets = weekData.targets;
        
        // Count current assignments in this week
        const counts = {}; subs.forEach(s => counts[s.name] = 0);
        for (let c = 1; c <= this.state.config.classCount; c++) {
            const cd = weekData.classes[c] || { "월":[], "화":[], "수":[], "목":[], "금":[] };
            this.days.forEach(d => { if(cd[d]) cd[d].forEach(v => { if(v && counts[v] !== undefined) counts[v]++; }); });
        }

        let h = '';
        subs.forEach(s => {
            const sub = s.name;
            const targetTotal = (targets[sub] || 0) * this.state.config.classCount;
            const currentTotal = counts[sub];
            const isActive = this.state.selectedSub === sub;
            h += `
                <div class="palette-card ${isActive ? 'active' : ''}" data-sub="${sub}">
                    ${sub}
                </div>`;
        });
        this.dom.palette.innerHTML = h;
        
        const display = document.getElementById('selected-sub-display');
        if (display) display.textContent = this.state.selectedSub ? `선택됨: ${this.state.selectedSub}` : '카드 클릭하세요.';
    },

    getTimetableGridHtml(c) {
        const wData = this.state.history[this.state.currentWeek];
        if (!wData.classes[c]) {
            wData.classes[c] = { "월":[], "화":[], "수":[], "목":[], "금":[] };
        }
        const data = wData.classes[c], maxP = Math.max(...Object.values(this.state.config.periods));
        const spCells = wData.specialistCells || {};
        let h = `<thead><tr><th width="40">교시</th>${this.days.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>`;
        for (let p=0; p<maxP; p++) {
            h += `<tr><td class="col-head">${p+1}</td>`;
            this.days.forEach(d => {
                if (p < this.state.config.periods[d]) {
                    const val = data[d][p] || '';
                    const isSpLocked = !!(spCells[c]?.[d]?.[p]);
                    let s = '';
                    const customBg = wData.bgColors?.[c]?.[d]?.[p] ?? null;

                    if (customBg) {
                        s = `style="background-color:${customBg}; color:#000; font-weight:bold;"`;
                    } else if (val && isSpLocked) {
                        // 전담 가져오기로 채워진 셀만 전담 색상 적용
                        const sp = this.state.specialists.find(sp => (sp.subject === val || sp.name === val));
                        if (sp && sp.bg) s = `style="background-color:${sp.bg}; color:${sp.color || '#000'}; font-weight:bold;"`;
                    }
                    const lockAttr = isSpLocked ? ' data-sp-locked="1" readonly title="전담 시간 (클릭하면 수정 확인)"' : '';
                    const lockClass = isSpLocked ? ' sp-locked' : '';
                    h += `<td><input type="text" class="cell-input${lockClass}" ${s} data-cls="${c}" data-day="${d}" data-idx="${p}" value="${val}"${lockAttr}></td>`;
                } else h += `<td style="background:#d1d5db; cursor:not-allowed;" title="${p+1}교시는 ${d}요일 수업 없음"></td>`;
            });
            h += `</tr>`;
        }
        return h + '</tbody>';
    },

    /* --- Validation --- */
    renderAllValidationGrids() { for (let c = 1; c <= this.state.config.classCount; c++) this.renderSingleValidationGrid(c); },
    renderSingleValidationGrid(c) {
        const el = document.getElementById(`val-grid-${c}`); if (!el) return;
        if (!this.state.history[this.state.currentWeek].classes[c]) {
            this.state.history[this.state.currentWeek].classes[c] = { "월":[], "화":[], "수":[], "목":[], "금":[] };
        }
        const cd = this.state.history[this.state.currentWeek].classes[c], targets = this.state.history[this.state.currentWeek].targets, cts = {};
        this.days.forEach(d => { (cd[d] || []).forEach(s => { if(s) cts[s] = (cts[s]||0)+1; }); });
        const subs = this.state.config.subjects;
        let h = `<thead><tr><th>과목</th><th>배정</th><th>과목</th><th>배정</th></tr></thead><tbody>`;
        for (let i = 0; i < subs.length; i += 2) {
            const s1 = subs[i].name, s2 = subs[i+1] ? subs[i+1].name : null, c1 = cts[s1]||0, t1 = targets[s1]||0;
            h += `<tr><td style="font-weight:600; color:var(--text-sub); font-size:0.85rem;">${s1}</td><td class="${this.getValClass(c1, t1)}">${c1}/${t1}</td>`;
            if (s2) { const c2 = cts[s2]||0, t2 = targets[s2]||0; h += `<td style="font-weight:600; color:var(--text-sub); font-size:0.85rem;">${s2}</td><td class="${this.getValClass(c2, t2)}">${c2}/${t2}</td>`; }
            else h += `<td></td><td></td>`; h += `</tr>`;
        }
        const act = Object.values(cts).reduce((a, b) => a + b, 0), tar = subs.reduce((a, s) => a + (targets[s.name] || 0), 0);
        h += `<tr style="border-top: 1.5px solid var(--border-color);">
                <td colspan="2" style="font-weight:700; color:var(--text-main); background:#f9fafb;">주간 총계</td>
                <td colspan="2" class="${this.getValClass(act, tar)}" style="font-weight:800; font-size:0.9rem;">${act} / ${tar}</td>
              </tr>`;
        el.innerHTML = h + `</tbody>`;
    },

    /* --- Validation View (The Dashboard) --- */
    calculateAndRenderValidationView() {
        if (!this.dom.menus.validation) {
            this.dom.menus.validation = document.getElementById('validation-view');
        }
        if (this.dom.menus.validation.classList.contains('hide')) return;

        const subs = this.state.config.subjects;
        const history = this.state.history;
        const annT = this.state.config.annualTargets || {};
        const classCount = this.state.config.classCount;

        // 1. Annual Summary: 주차별 "이번 주 목표" 차시 합산 (반별 입력값과 무관)
        const totalCounts = {};
        subs.forEach(s => totalCounts[s.name] = 0);

        Object.values(history).forEach(weekData => {
            const targets = weekData.targets || {};
            subs.forEach(s => {
                totalCounts[s.name] += (targets[s.name] || 0);
            });
        });

        const table = document.getElementById('annual-summary-table');
        if (table) {
            let h = `<thead><tr><th>항목 / 과목</th>`;
            subs.forEach(s => h += `<th class="text-center font-bold" style="background:#f1f5f9;">${s.name}</th>`);
            h += `<th class="text-center" style="background:var(--primary-light); color:var(--primary-dark);">합계</th></tr></thead><tbody>`;
            
            // Row 1: 기준시수 (Target)
            h += `<tr><td class="col-head" style="text-align:center; font-weight:700;">기준시수</td>`;
            let sumTarget = 0;
            subs.forEach(s => {
                const target = annT[s.name] || 0;
                sumTarget += target;
                h += `<td class="text-center"><input type="text" inputmode="numeric" class="val-ann-input" style="width:100%; border:none; text-align:center; font-weight:700;" value="${target}" onchange="App.setAnnualTarget('${s.name}', this.value)"></td>`;
            });
            h += `<td class="text-center font-bold" style="background:#f8fafc;">${sumTarget}</td></tr>`;

            // Row 2: 누적시수 (주차별 목표 차시 합산)
            h += `<tr><td class="col-head" style="text-align:center; font-weight:700;">누적시수</td>`;
            let sumActual = 0;
            subs.forEach(s => {
                const actual = totalCounts[s.name] || 0;
                sumActual += actual;
                h += `<td class="text-center font-bold" style="background:#f8fafc;">${actual}</td>`;
            });
            h += `<td class="text-center font-bold" style="background:#f8fafc;">${sumActual}</td></tr>`;

            // Row 3: 편차 (Difference)
            h += `<tr><td class="col-head" style="text-align:center; font-weight:700;">편차</td>`;
            let sumDiff = 0;
            subs.forEach(s => {
                const target = annT[s.name] || 0;
                const actual = totalCounts[s.name] || 0;
                const diff = actual - target;
                sumDiff += diff;
                const diffColor = diff === 0 ? 'color:var(--primary-color);' : (diff > 0 ? 'color:#b91c1c;' : 'color:#92400e;');
                h += `<td class="text-center font-bold" style="${diffColor}">${diff > 0 ? '+' : ''}${diff}</td>`;
            });
            h += `<td class="text-center font-bold" style="background:#f8fafc;">${sumDiff > 0 ? '+' : ''}${sumDiff}</td></tr>`;

            table.innerHTML = h + '</tbody>';
        }

        // 2. Weekly Per-Class Deviation (Class vs Subject for Current Week)
        const weekData = history[this.state.currentWeek];
        const targets = weekData.targets || {};
        const devContainer = document.getElementById('class-deviation-container');
        if (devContainer) {
            let h = `<div class="table-responsive"><table class="excel-table deviation-table"><thead><tr><th class="dev-class-col">반 / 과목</th>`;
            subs.forEach(s => h += `<th class="dev-sub-col">${s.name}</th>`);
            h += `</tr></thead><tbody>`;

            for (let c = 1; c <= classCount; c++) {
                const cd = weekData.classes[c] || {};
                const classCounts = {};
                subs.forEach(s => classCounts[s.name] = 0);
                this.days.forEach(d => {
                    (cd[d] || []).forEach(val => {
                        if (val && classCounts[val] !== undefined) classCounts[val]++;
                    });
                });

                h += `<tr style="cursor:pointer;" onclick="App.showClassDeviationDetail(${c})"><td class="col-head dev-class-col">${c}반 <span class="btn-detail-badge">기록보기</span></td>`;
                subs.forEach(s => {
                    const sub = s.name;
                    const diff = classCounts[sub] - (targets[sub] || 0);
                    let color = '';
                    if (diff > 0) color = 'background-color:#fee2e2; color:#b91c1c; font-weight:bold;';
                    else if (diff < 0) color = 'background-color:#fffbeb; color:#92400e; font-weight:bold;';
                    else color = 'color:#10b981; font-weight:700;';
                    
                    h += `<td style="${color} font-size:0.85rem;">${diff > 0 ? '+' : ''}${diff}</td>`;
                });
                h += `</tr>`;
            }
            devContainer.innerHTML = h + '</tbody></table></div>';
        }
    },

    showClassDeviationDetail(cNum) {
        const subs = this.state.config.subjects;
        const history = this.state.history;
        const maxWeek = this.state.maxWeek;

        let h = `<div class="deviation-detail-wrap">
            <p class="mb-4 text-sm text-gray-600"><strong>${cNum}반</strong>의 주차별 과목별 편차 기록입니다. (0이 아닌 칸을 확인하세요)</p>
            <div class="table-responsive" style="max-height:65vh; border:1px solid var(--border-color); border-radius:8px; overflow:auto;">
                <table class="excel-table" style="font-size:0.8rem;">
                    <thead class="sticky top-0 bg-gray-50">
                        <tr><th>주차</th>${subs.map(s => `<th>${s.name}</th>`).join('')}</tr>
                    </thead>
                    <tbody>`;
        
        for (let w = 1; w <= maxWeek; w++) {
            const weekData = history[w];
            if (!weekData) continue;
            
            const currTargets = weekData.targets || {};
            const cd = weekData.classes[cNum] || {};
            const counts = {}; subs.forEach(s => counts[s.name] = 0);
            
            this.days.forEach(d => {
                (cd[d] || []).forEach(v => {
                    if (v && counts[v] !== undefined) counts[v]++;
                });
            });

            h += `<tr><td class="col-head" style="background:#f9fafb;">${w}주</td>`;
            subs.forEach(s => {
                const sub = s.name;
                const diff = counts[sub] - (currTargets[sub] || 0);
                const color = diff === 0 ? 'color:#cbd5e1;' : (diff > 0 ? 'color:#ef4444; font-weight:bold;' : 'color:#f59e0b; font-weight:bold;');
                h += `<td style="${color}">${diff > 0 ? '+' : ''}${diff}</td>`;
            });
            h += `</tr>`;
        }
        
        h += `</tbody></table></div></div>`;

        this.dom.modalTitle.textContent = `${cNum}반 상세 시수 기록`;
        this.dom.modalContent.innerHTML = h;
        this.dom.modalCancel.classList.add('hide');
        this.dom.modalConfirm.textContent = '닫기';
        this.dom.modalContainer.classList.remove('hide');
        this.dom.modalContainer.querySelector('.modal').classList.add('modal-wide');
        this.modalResolve = null;
    },

    setAnnualTarget(sub, val) {
        if (!this.state.config.annualTargets) this.state.config.annualTargets = {};
        this.state.config.annualTargets[sub] = parseInt(val) || 0;
        this.saveData();
        this.calculateAndRenderValidationView();
    },

    getValClass(c, t) { 
        if (c === t) return 'val-ok'; 
        if (!t && c > 0) return 'val-over';
        return c > t ? 'val-over' : 'val-warn'; 
    },

    /* --- SURGICAL Specialist UI FIX --- */
    renderSpecialistView() {
        const cont = this.dom.specialistContainer; if (!cont) return;
        cont.innerHTML = '';
        this.state.specialists.forEach((sp, idx) => {
            // MATCH CSS: .specialist-table-wrapper
            const div = document.createElement('div'); div.className = 'specialist-table-wrapper';
            const spName = sp.subject || sp.name || '전담', spDesc = sp.desc || '';
            
            // MATCH CSS structure: .specialist-table-header, .sp-header-inputs, .sp-subject-input, .sp-desc-input
            let h = `
                <div class="specialist-table-header" style="background-color:${sp.bg || '#f9fafb'};">
                    <div class="sp-header-inputs">
                        <input type="text" class="sp-subject-input" value="${spName}" placeholder="과목명" oninput="App.updateSpName(${idx}, this.value)">
                        <span class="sp-sep">|</span>
                        <input type="text" class="sp-desc-input" value="${spDesc}" placeholder="한줄 설명(대상)" oninput="App.updateSpDesc(${idx}, this.value)">
                    </div>
                    <div class="sp-header-actions">
                        <div style="position:relative;">
                            <button class="sp-color-btn" onclick="App.toggleColorPicker(${idx})">🎨 색상</button>
                            <div id="sp-color-dropdown-${idx}" class="sp-color-dropdown card">
                                <div class="sp-dropdown-title">보드 배경색 선택</div>
                                <div class="sp-presets-grid">
                                    ${['#fecaca','#fed7aa','#fef08a','#dcfce7','#cffafe','#dbeafe','#ede9fe','#fce7f3','#e5e7eb','#ffffff'].map(c =>
                                        `<div class="sp-preset-item" style="background-color:${c}; border:1px solid #e5e7eb;" onclick="App.setSpColor(${idx}, '${c}')"></div>`
                                    ).join('')}
                                </div>
                            </div>
                        </div>
                        <button class="del-btn" onclick="App.deleteSp(${idx})">✕</button>
                    </div>
                </div>
                <table class="excel-table sp-table"><thead><tr><th>교시</th>${this.days.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>`;
            const maxP = Math.max(...Object.values(this.state.config.periods));
            for (let p=0; p<maxP; p++) {
                h += `<tr><td class="col-head">${p+1}</td>`;
                this.days.forEach(d => {
                    if (p < this.state.config.periods[d]) {
                        const val = sp.data[d] && sp.data[d][p] ? sp.data[d][p] : '', mk = sp.marks && sp.marks[`${d}_${p}`], style = mk ? `style="background-color:${mk}"` : '';
                        h += `<td class="sp-cell" ${style} onclick="App.handleSpCellClick(event, ${idx}, '${d}', ${p})"><input type="text" class="cell-input" data-sp-d="${d}" data-sp-p="${p}" value="${val}" oninput="App.updateSpData(${idx}, '${d}', ${p}, this.value)"></td>`;
                    } else h += `<td class="cell-disabled"></td>`;
                });
                h += `</tr>`;
            }
            div.innerHTML = h + `</tbody></table>`; cont.appendChild(div);
        });
        this.renderSpecialistSummary();
        if(this.state.spPreviewOpen) this.renderSpecialistPreview();
        this.checkSpecialistConflicts();
    },
    checkSpecialistConflicts() {
        const occ = {}; // { day_period_classNum: count }
        const maxP = Math.max(...Object.values(this.state.config.periods));
        this.state.specialists.forEach(sp => {
            if (!sp.data) return;
            this.days.forEach(d => {
                for (let p = 0; p < maxP; p++) {
                    const val = sp.data[d] ? sp.data[d][p] : undefined;
                    if (val && String(val).trim() !== '') {
                        const classes = String(val).split(/[,\s]+/).map(v => v.trim()).filter(Boolean);
                        classes.forEach(c => {
                            const key = `${d}_${p}_${c}`;
                            occ[key] = (occ[key] || 0) + 1;
                        });
                    }
                }
            });
        });

        document.querySelectorAll('.sp-table .cell-input').forEach(inp => {
            const d = inp.getAttribute('data-sp-d');
            const p = inp.getAttribute('data-sp-p');
            const v = inp.value.trim();
            if (v !== '') {
                const classes = v.split(/[,\s]+/).map(c => c.trim()).filter(Boolean);
                const hasConflict = classes.some(c => occ[`${d}_${p}_${c}`] > 1);
                if (hasConflict) {
                    inp.classList.add('duplicate-error');
                    inp.closest('td').classList.add('duplicate-error');
                } else {
                    inp.classList.remove('duplicate-error');
                    inp.closest('td').classList.remove('duplicate-error');
                }
            } else {
                inp.classList.remove('duplicate-error');
                inp.closest('td').classList.remove('duplicate-error');
            }
        });
    },
    updateSpName(i, v) { if(!this.state.specialists[i]) return; this.state.specialists[i].subject = v; this.saveData(); this._markSpDirty(); this.renderSpecialistSummary(); if(this.state.spPreviewOpen) this.renderSpecialistPreview(); },
    updateSpDesc(i, v) { if(!this.state.specialists[i]) return; this.state.specialists[i].desc = v; this.saveData(); this._markSpDirty(); },
    updateSpData(i, d, p, v) { 
        if(!this.state.specialists[i]) return;
        if(!this.state.specialists[i].data) this.state.specialists[i].data = {};
        if(!this.state.specialists[i].data[d]) this.state.specialists[i].data[d] = [];
        this.state.specialists[i].data[d][p] = v;
        this.saveData();
        this._markSpDirty();
        this.renderSpecialistSummary();
        if(this.state.spPreviewOpen) this.renderSpecialistPreview();
        this.checkSpecialistConflicts();
    },
    setSpColor(i, c) { this.state.specialists[i].bg = c; this.saveData(); this._markSpDirty(); this.renderSpecialistView(); },
    toggleColorPicker(i) {
        const el = document.getElementById(`sp-color-dropdown-${i}`); if (!el) return;
        const shown = el.classList.contains('show'); document.querySelectorAll('.sp-color-dropdown').forEach(d => d.classList.remove('show'));
        if(!shown) el.classList.add('show');
    },
    deleteSp(i) { this.showConfirm('전담 보드 삭제', '이 전담 보드를 삭제하면 입력된 모든 데이터가 사라집니다.<br>계속하시겠습니까?').then(r => { if(r){ this.state.specialists.splice(i,1); this.saveData(); this._markSpDirty(); this.renderSpecialistView(); } }); },
    addSpecialistBoard() { this.state.specialists.push({ subject: '', desc: '', data: {}, marks: {}, bg: '#ffffff' }); this.saveData(); this._markSpDirty(); this.renderSpecialistView(); },
    _markSpDirty() {
        this.state.isSpDirty = true;
        const btn = document.getElementById('btn-save-specialist');
        if (btn) { btn.style.background = '#f59e0b'; btn.style.borderColor = '#f59e0b'; btn.textContent = '저장'; }
    },
    _clearSpDirty() {
        this.state.isSpDirty = false;
        const btn = document.getElementById('btn-save-specialist');
        if (btn) { btn.style.background = ''; btn.style.borderColor = ''; btn.textContent = '저장'; }
    },
    async saveSpecialistToServer() {
        if (!this.state.roomCode) return this.showAlert('오류', '방 코드가 없습니다.');
        if (!this.state.isAdmin) return this.showAlert('오류', '관리자만 전담 데이터를 저장할 수 있습니다.');
        const btn = document.getElementById('btn-save-specialist');
        if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
        try {
            await FirebaseDB.saveAdmin(this.state.roomCode, this.state);
            this._clearSpDirty();
            this.showToast('✅ 전담 데이터를 서버에 저장했습니다.');
        } catch(e) {
            this.showToast('❌ 저장 실패: ' + e.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    },
    
    toggleSpPreview() {
        this.state.spPreviewOpen = !this.state.spPreviewOpen;
        const rightPanel = document.getElementById('sp-right-panel');
        const summaryPanel = document.getElementById('specialist-summary-container');
        const btn = document.getElementById('btn-toggle-sp-preview');
        if(this.state.spPreviewOpen) {
            rightPanel.style.display = 'block';
            if(summaryPanel) summaryPanel.style.display = 'none';
            btn.innerHTML = '미리보기 닫기';
            btn.classList.replace('btn-secondary', 'btn-primary-small');
            this.renderSpecialistPreview();
        } else {
            rightPanel.style.display = 'none';
            if(summaryPanel) summaryPanel.style.display = 'block';
            btn.innerHTML = '반별 미리보기';
            btn.classList.replace('btn-primary-small', 'btn-secondary');
        }
    },
    renderSpecialistPreview() {
        const container = document.getElementById('sp-preview-content');
        if (!container) return;
        
        let h = '<div class="sp-preview-grid">';
        for (let c = 1; c <= this.state.config.classCount; c++) {
            h += `<div class="sp-preview-class-card">
                    <div class="sp-preview-class-title">${c}반</div>
                    <table class="sp-preview-table">
                        <thead><tr><th>교시</th>${this.days.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
                        <tbody>`;
            const maxP = Math.max(...Object.values(this.state.config.periods));
            for(let p=0; p<maxP; p++) {
                h += `<tr><td>${p+1}</td>`;
                this.days.forEach(d => {
                    if (p < this.state.config.periods[d]) {
                        // Find if any specialist board targets this class for this day/period
                        const hits = [];
                        this.state.specialists.forEach(sp => {
                            if (sp.data[d] && sp.data[d][p]) {
                                const classes = String(sp.data[d][p]).split(/[,\s]+/).map(v => v.trim()).filter(Boolean);
                                if (classes.includes(String(c))) {
                                    hits.push(sp);
                                }
                            }
                        });
                        if (hits.length === 0) {
                            h += `<td class="empty">-</td>`;
                        } else if (hits.length === 1) {
                            const sp = hits[0];
                            const sName = sp.subject || sp.name || '전담';
                            h += `<td class="has-sub" style="background-color:${sp.bg||'#f9fafb'};">${sName}</td>`;
                        } else {
                            // Collision detected
                            h += `<td class="has-sub" style="background-color:#fee2e2; color:#b91c1c; font-weight:bold; cursor:pointer; pointer-events:auto;" onclick="App.focusSpConflict('${d}', ${p}, '${c}')" title="해당 칸으로 이동 및 강조">중복!</td>`;
                        }
                    } else {
                        h += `<td style="background:#f9fafb;"></td>`;
                    }
                });
                h += `</tr>`;
            }
            h += `</tbody></table></div>`;
        }
        h += '</div>';
        container.innerHTML = h;
    },

    handleSpCellClick(e, i, d, p) {
        if (e.target.tagName === 'INPUT') return; 
        if(App.state.isMarkingMode) { e.preventDefault(); e.stopPropagation(); const sp = App.state.specialists[i]; if(!sp.marks) sp.marks = {}; const k = `${d}_${p}`; const cell = e.target.closest('td'); if(!cell) return; if(sp.marks[k]){ delete sp.marks[k]; cell.style.backgroundColor=''; } else { sp.marks[k]=App.state.markingColor; cell.style.backgroundColor=sp.marks[k]; } App.saveData(); }
    },
    
    focusSpConflict(day, period, classNum) {
        const inputs = document.querySelectorAll(`input[data-sp-d="${day}"][data-sp-p="${period}"]`);
        let firstFound = null;
        inputs.forEach(inp => {
            if (inp.value.trim() === String(classNum)) {
                if (!firstFound) firstFound = inp;
                // Highlight corresponding conflicting inputs temporarily
                inp.style.transition = 'background-color 0.3s, transform 0.2s';
                inp.style.backgroundColor = '#fca5a5';
                inp.style.transform = 'scale(1.1)';
                inp.style.position = 'relative';
                inp.style.zIndex = '10';
                setTimeout(() => {
                    inp.style.backgroundColor = '';
                    inp.style.transform = '';
                    inp.style.zIndex = '';
                }, 1200);
            }
        });
        if (firstFound) {
            firstFound.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            setTimeout(() => firstFound.focus(), 300);
        }
    },
    toggleMarkingMode() {
        this.state.isMarkingMode = !this.state.isMarkingMode; const btn = document.getElementById('btn-toggle-marking'), pkr = document.getElementById('marking-color-picker');
        if (this.state.isMarkingMode) { btn.textContent = '✍️ 마킹 중지'; btn.style.backgroundColor = this.state.markingColor; pkr.style.display = 'flex'; document.body.classList.add('marking-mode'); }
        else { btn.textContent = '✍️ 마킹 시작'; btn.style.backgroundColor = ''; pkr.style.display = 'none'; document.body.classList.remove('marking-mode'); }
    },
    setMarkingColor(c, el) { this.state.markingColor = c; document.querySelectorAll('.mark-color-btn').forEach(b => b.classList.remove('active')); if(el) el.classList.add('active'); if(this.state.isMarkingMode) document.getElementById('btn-toggle-marking').style.backgroundColor = c; },
    
    setSidebarColor(c, el) {
        this.state.selectedSidebarColor = c;
        document.querySelectorAll('.color-chip').forEach(ch => ch.classList.remove('active'));
        if (el && c !== null) el.classList.add('active');
        // Visual indicator in sidebar
        const display = document.getElementById('selected-sub-display');
        if (display) {
            display.style.borderBottom = c ? `3px solid ${c}` : 'none';
        }
    },
    renderSpecialistSummary() {
        const el = this.dom.specialistSummary; if(!el) return;
        const subs = [...new Set(this.state.specialists.map(sp => sp.subject || sp.name || '').filter(s => s))], classCount = this.state.config.classCount, sts = {};
        subs.forEach(s => { sts[s] = {}; for(let c=1; c<=classCount; c++) sts[s][c] = 0; });
        this.state.specialists.forEach(sp => { const sub = sp.subject || sp.name || ''; if(!sub || !sts[sub]) return; this.days.forEach(d => { for(let p=0; p<this.state.config.periods[d]; p++){ const raw = sp.data[d] && sp.data[d][p]; if(!raw) continue; String(raw).split(/[,\s]+/).map(v => parseInt(v.trim())).filter(n => !isNaN(n) && n > 0).forEach(cN => { if(sts[sub][cN] !== undefined) sts[sub][cN]++; }); } }); });
        if (subs.length === 0) { el.innerHTML = '<div class="sp-sum-inner"><div class="sp-sum-title">배정 현황</div><p class="p-4 text-xs text-gray-400">전담 보드를 추가해주세요.</p></div>' + this.renderReferenceBoardsHTML(); return; }
        const tgts = this.state.history[this.state.currentWeek].specialistTargets || {};
        let h = `<div class="sp-sum-inner"><div class="sp-sum-title">학급별 전담 시수 집계</div><div class="table-responsive"><table class="sp-sum-table"><thead><tr><th>과목명</th><th>목표</th>`;
        for(let c=1; c<=this.state.config.classCount; c++) h += `<th>${c}</th>`;
        h += `</tr></thead><tbody>`;
        subs.forEach(s => { const t = tgts[s] || 0; h += `<tr><td class="sp-sub-name">${s}</td><td><input type="text" class="sp-target-input" value="${t}" oninput="App.updateSpecialistTarget('${s}', this.value)"></td>`; for(let c=1; c<=this.state.config.classCount; c++){ const count = sts[s][c], cls = t>0 ? (count === t ? 'sp-cell-done' : (count > t ? 'sp-cell-over' : 'sp-cell-miss')) : (count > 0 ? 'sp-cell-over' : ''); h += `<td class="${cls}">${count}</td>`; } h += `</tr>`; });
        el.innerHTML = h + `</tbody></table></div><div class="sp-memo-section"><div class="sp-memo-title">전담 협의 메모</div><textarea class="sp-memo-area" placeholder="메모" oninput="App.updateSpecialistMemo(this)">${this.state.history[this.state.currentWeek].specialistMemo || ''}</textarea></div></div>` + this.renderReferenceBoardsHTML();
    },
    updateSpecialistTarget(s, v){ this.state.history[this.state.currentWeek].specialistTargets[s] = parseInt(v)||0; this.saveData(); this.renderSpecialistSummary(); },
    updateSpecialistMemo(el){ this.state.history[this.state.currentWeek].specialistMemo = el.value; this.saveData(); el.style.height='auto'; el.style.height=el.scrollHeight+'px'; },

    renderReferenceBoardsHTML() {
        let h = '<div class="sp-ref-section">';
        h += '<div class="sp-ref-header"><div style="font-size:0.85rem;font-weight:700;color:var(--text-main);">참고용 전담 시간표</div><button class="btn-primary-small btn-sm" onclick="App.addRefBoard()" style="padding:4px 8px;font-size:0.7rem;">+ 추가</button></div>';
        h += '<div class="sp-ref-grid">';
        (this.state.referenceBoards || []).forEach((ref, idx) => {
            h += `<div class="sp-ref-board">
                <div class="sp-ref-title-bar" style="background-color:${ref.bg || '#ffffff'};">
                    <input type="text" class="sp-ref-title-input" value="${ref.title||''}" placeholder="과목/교사" oninput="App.updateRefTitle(${idx}, this.value)">
                    <div style="display:flex; gap:4px; position:relative;">
                        <button class="sp-ref-color-btn" onclick="App.toggleRefColorPicker(${idx})" title="색상 지정">🎨</button>
                        <div id="sp-ref-color-dropdown-${idx}" class="sp-color-dropdown card" style="right:0;">
                            <div class="sp-dropdown-title">색상 선택</div>
                            <div class="sp-presets-grid">
                                ${['#fecaca','#fed7aa','#fef08a','#dcfce7','#cffafe','#dbeafe','#ede9fe','#fce7f3','#e5e7eb','#ffffff'].map(c =>
                                    `<div class="sp-preset-item" style="background-color:${c}; border:1px solid #e5e7eb;" onclick="App.setRefColor(${idx}, '${c}')"></div>`
                                ).join('')}
                            </div>
                        </div>
                        <button class="sp-ref-del-btn" onclick="App.delRefBoard(${idx})" title="삭제">✕</button>
                    </div>
                </div>
                <table class="sp-ref-table">
                    <thead><tr><th>교시</th>${this.days.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
                    <tbody>`;
            const maxP = Math.max(...Object.values(this.state.config.periods));
            for(let p=0; p<maxP; p++) {
                h += `<tr><td class="col-head">${p+1}</td>`;
                this.days.forEach(d => {
                    if (p < this.state.config.periods[d]) {
                        const val = ref.data[d] && ref.data[d][p] ? ref.data[d][p] : '', mk = ref.marks && ref.marks[`${d}_${p}`], style = mk ? `style="background-color:${mk}"` : '';
                        h += `<td class="sp-cell" ${style} onclick="App.handleRefCellClick(event, ${idx}, '${d}', ${p})"><input type="text" class="sp-ref-input" data-ref-d="${d}" data-ref-p="${p}" value="${val}" oninput="App.updateRefData(${idx}, '${d}', ${p}, this.value)"></td>`;
                    } else {
                        h += `<td class="cell-disabled"></td>`;
                    }
                });
                h += `</tr>`;
            }
            h += `</tbody></table></div>`;
        });
        h += '</div></div>';
        return h;
    },
    addRefBoard() {
        if (!this.state.referenceBoards) this.state.referenceBoards = [];
        this.state.referenceBoards.push({ title: '', bg: '#ffffff', data: {} });
        this.saveData(); this.renderSpecialistSummary();
    },
    delRefBoard(idx) {
        this.showConfirm('참고 표 삭제', '이 참고 시간표를 삭제하시겠습니까?<br>삭제 후 복구할 수 없습니다.').then(r => {
            if(r) { this.state.referenceBoards.splice(idx,1); this.saveData(); this.renderSpecialistSummary(); }
        });
    },
    updateRefTitle(i, v) { if(!this.state.referenceBoards[i]) return; this.state.referenceBoards[i].title = v; this.saveData(); },
    updateRefData(i, d, p, v) { 
        if(!this.state.referenceBoards[i]) return;
        if(!this.state.referenceBoards[i].data) this.state.referenceBoards[i].data = {};
        if(!this.state.referenceBoards[i].data[d]) this.state.referenceBoards[i].data[d] = [];
        this.state.referenceBoards[i].data[d][p] = v; 
        this.saveData(); 
    },
    toggleRefColorPicker(idx) {
        const el = document.getElementById(`sp-ref-color-dropdown-${idx}`); if (!el) return;
        const shown = el.classList.contains('show'); document.querySelectorAll('.sp-color-dropdown').forEach(d => d.classList.remove('show'));
        if(!shown) el.classList.add('show');
    },
    setRefColor(idx, c) { this.state.referenceBoards[idx].bg = c; this.saveData(); this.renderSpecialistSummary(); },
    handleRefCellClick(e, i, d, p) {
        if (e.target.tagName === 'INPUT') return;
        if(App.state.isMarkingMode) { e.preventDefault(); e.stopPropagation(); const ref = App.state.referenceBoards[i]; if(!ref.marks) ref.marks = {}; const k = `${d}_${p}`; const cell = e.target.closest('td'); if(!cell) return; if(ref.marks[k]){ delete ref.marks[k]; cell.style.backgroundColor=''; } else { ref.marks[k]=App.state.markingColor; cell.style.backgroundColor=ref.marks[k]; } App.saveData(); }
    },

    /* --- Settings --- */
    stepPeriod(day, delta) {
        const el = this.dom.periodInputs[day];
        if (el) el.value = Math.min(8, Math.max(1, (parseInt(el.value) || 1) + delta));
    },
    renderSettingsView() {
        this.dom.gradeInput.value = this.state.config.grade || '';
        this.dom.classCountInput.value = this.state.config.classCount;
        this.days.forEach(d => this.dom.periodInputs[d].value = this.state.config.periods[d]);
        this.dom.subjectList.innerHTML = '';
        this.state.config.subjects.forEach((s, idx) => this.addSubjectConfigItem(s.name, idx, s.preferredSlot || 0));
    },
    addSubjectConfigItem(name='', idx=0, preferredSlot=0) {
        const row = document.createElement('div');
        row.className = 'subject-row';
        row.draggable = true;
        row.innerHTML = `
            <div class="sub-row-num">${idx + 1}</div>
            <input type="text" placeholder="과목명" value="${name}" class="set-sub-name sub-row-name" onclick="event.stopPropagation()">
            <select class="pref-slot-select sub-row-pref" data-sub="${name}">
                <option value="0" ${preferredSlot === 0 ? 'selected' : ''}>자동</option>
                <option value="1" ${preferredSlot === 1 ? 'selected' : ''}>1-2교시</option>
                <option value="2" ${preferredSlot === 2 ? 'selected' : ''}>3-4교시</option>
                <option value="3" ${preferredSlot === 3 ? 'selected' : ''}>5-6교시</option>
            </select>
            <button class="sub-row-delete" onclick="this.closest('.subject-row').remove(); App.refreshSubjectBadges();">✕</button>`;
        row.addEventListener('dragstart', (e) => { row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            this.dom.subjectList.querySelectorAll('.subject-row').forEach(r => r.classList.remove('drag-over'));
            this.refreshSubjectBadges();
        });
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = this.dom.subjectList.querySelector('.dragging');
            if (dragging && dragging !== row) {
                row.classList.add('drag-over');
                const rows = [...this.dom.subjectList.querySelectorAll('.subject-row')];
                const di = rows.indexOf(dragging), ti = rows.indexOf(row);
                if (di < ti) this.dom.subjectList.insertBefore(dragging, row.nextSibling);
                else this.dom.subjectList.insertBefore(dragging, row);
            }
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('drag-over'); });
        this.dom.subjectList.appendChild(row);
    },
    refreshSubjectBadges() {
        this.dom.subjectList.querySelectorAll('.subject-row').forEach((row, idx) => {
            const badge = row.querySelector('.sub-row-num');
            if (badge) badge.textContent = idx + 1;
        });
    },
    renderPreferredSlotTable() { /* 선호 배정 시간이 과목 행에 통합되어 별도 렌더 불필요 */ },
    copyClassTable(c, btn) {
        const wData = this.state.history[this.state.currentWeek];
        const cd = wData.classes[c] || {};
        const bgColors = wData.bgColors?.[c] || {};
        const spCells = wData.specialistCells?.[String(c)] || {};
        const maxP = Math.max(...Object.values(this.state.config.periods));
        const tdS = 'border:1px solid #000000;padding:3px 14px;text-align:center;font-size:10pt;background:#ffffff;';
        const thS = 'border:1px solid #000000;padding:3px 14px;text-align:center;font-size:10pt;background:#f3f4f6;font-weight:bold;color:#000000;';
        const hdS = 'border:1px solid #000000;padding:4px 8px;text-align:center;font-size:11pt;font-weight:bold;background:#ffffff;color:#000000;';
        const pdS = 'border:1px solid #000000;padding:3px 8px;text-align:center;font-size:9pt;color:#666;background:#f3f4f6;';

        let t = `<table align="center" border="1" style="border-collapse:collapse;width:auto;min-width:300px;">`;
        t += `<tr><th colspan="${this.days.length + 1}" style="${hdS}">${c}반 시간표</th></tr>`;
        t += `<tr><th style="${thS}">교시</th>${this.days.map(d => `<th style="${thS}">${d}</th>`).join('')}</tr>`;
        for (let p = 0; p < maxP; p++) {
            t += `<tr><td style="${pdS}">${p + 1}</td>`;
            this.days.forEach(d => {
                if (p < this.state.config.periods[d]) {
                    const sub = (cd[d] && cd[d][p]) || '';
                    const customBg = bgColors[d]?.[p] ?? null;
                    const isSpCell = !!(spCells[d]?.[p]);
                    const sp = isSpCell ? this.state.specialists.find(s => s.subject === sub || s.name === sub) : null;
                    const bg = customBg || (sp && sp.bg) || null;
                    const bgAttr = bg ? ` bgcolor="${bg}"` : '';
                    const bgStyle = bg ? `background:${bg};` : '';
                    t += `<td${bgAttr} style="${tdS}${bgStyle}">${sub}</td>`;
                } else {
                    t += `<td bgcolor="#e5e7eb" style="${tdS}background:#e5e7eb;"></td>`;
                }
            });
            t += `</tr>`;
        }
        t += `</table>`;

        const blob = new Blob([t], { type: 'text/html' });
        const textBlob = new Blob([t], { type: 'text/plain' });
        try {
            navigator.clipboard.write([
                new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
            ]).then(() => {
                const orig = btn.textContent;
                btn.textContent = '✓ 복사됨';
                btn.style.color = '#16a34a';
                setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
            });
        } catch(e) {
            this.showToast('복사 실패: 브라우저가 지원하지 않습니다.');
        }
    },
    changeAdminPin() {
        const current = document.getElementById('input-admin-pin-current')?.value;
        const newPin = document.getElementById('input-admin-pin-new')?.value;
        const confirm = document.getElementById('input-admin-pin-confirm')?.value;
        const stored = this.state.config.adminPin || '0000';
        if (current !== stored) return this.showAlert('오류', '현재 비밀번호가 맞지 않습니다.');
        if (!/^\d{4}$/.test(newPin)) return this.showAlert('오류', '새 비밀번호는 4자리 숫자여야 합니다.');
        if (newPin !== confirm) return this.showAlert('오류', '새 비밀번호가 일치하지 않습니다.');
        this.state.config.adminPin = newPin;
        this.saveData();
        document.getElementById('input-admin-pin-current').value = '';
        document.getElementById('input-admin-pin-new').value = '';
        document.getElementById('input-admin-pin-confirm').value = '';
        this.showToast('✅ 관리자 비밀번호가 변경되었습니다.');
    },
    async saveSettings() {
        const cnt = parseInt(this.dom.classCountInput.value); if(cnt < 1) return;
        this.state.config = { ...this.state.config, grade: this.dom.gradeInput.value, classCount: cnt };
        this.days.forEach(d => this.state.config.periods[d] = parseInt(this.dom.periodInputs[d].value));

        // Collect subjects from rows (in DOM order = user-sorted order)
        const subs = [];
        this.dom.subjectList.querySelectorAll('.subject-row').forEach(item => {
            const name = item.querySelector('.set-sub-name').value.trim();
            if (name) {
                const existing = this.state.config.subjects.find(s => s.name === name);
                const slotSelect = item.querySelector('.pref-slot-select');
                const slot = slotSelect ? parseInt(slotSelect.value) : (existing ? (existing.preferredSlot || 0) : 0);
                subs.push({ name, blockSize: existing ? existing.blockSize : 1, preferredSlot: slot });
            }
        });
        this.state.config.subjects = subs;
        this.saveData();
        if (this.state.isAdmin && this.state.roomCode) {
            try {
                await FirebaseDB.saveAdmin(this.state.roomCode, this.state);
            } catch(e) {
                this.showToast('⚠️ 서버 저장 실패: ' + e.message);
                return;
            }
        }
        this.showAlert('설정 저장 완료', '변경된 설정이 저장되었습니다.').then(() => this.switchMenu('timetable'));
    },
    
    clearClass(cNum) { this.showConfirm('반 시간표 초기화', `${cNum}반의 이번 주 시간표를 모두 지웁니다.<br>계속하시겠습니까?`).then(async r => { if(r){ this.days.forEach(d => this.state.history[this.state.currentWeek].classes[cNum][d] = []); const sc = this.state.history[this.state.currentWeek].specialistCells; if (sc) delete sc[cNum]; this.saveData(); this.renderTimetableLayout(); if (this.state.isAdmin && this.state.roomCode) { const btn = document.querySelector(`.btn-clear-class-admin[data-cls="${cNum}"]`); if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; } try { await FirebaseDB.saveAdmin(this.state.roomCode, this.state); this.showToast(`✅ ${cNum}반 시간표를 삭제했습니다.`); } catch(e) { this.showToast('❌ 서버 저장 실패: ' + e.message); } finally { if (btn) { btn.disabled = false; btn.textContent = '삭제'; } } } } }); },
    clearAllClasses() { this.showConfirm('전체 시간표 초기화', '모든 반의 이번 주 시간표를 전부 지웁니다.<br>이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?').then(r => { if(r){ for(let c=1; c<=this.state.config.classCount; c++) this.days.forEach(d => this.state.history[this.state.currentWeek].classes[c][d] = []); this.state.history[this.state.currentWeek].specialistCells = {}; this.saveData(); this.renderTimetableLayout(); } }); },
    createNewWeek() { this.state.maxWeek++; this.state.currentWeek = this.state.maxWeek; this.initWeekData(this.state.currentWeek); this.saveData(); this.renderTimetableLayout(); },
    changeWeek(step) { const nw = this.state.currentWeek + step; if (nw > 0 && nw <= this.state.maxWeek) { this.state.currentWeek = nw; this.renderTimetableLayout(); } },
    
    importAllSpecialists() {
        this.showConfirm('전담 전체 가져오기', '빈 교시에만 전담 과목을 채웁니다.<br>이미 입력된 교시는 유지됩니다.').then(r => {
            if(!r) return; let ct = 0; const skipped = [];
            const wData = this.state.history[this.state.currentWeek];
            if (!wData.specialistCells) wData.specialistCells = {};
            for (let c = 1; c <= this.state.config.classCount; c++) {
                const cStr = String(c), classData = wData.classes[cStr];
                this.state.specialists.forEach(sp => {
                    const sub = sp.subject || sp.name || ''; if(!sub) return;
                    this.days.forEach(d => {
                        for(let p=0; p<this.state.config.periods[d]; p++) {
                            if (sp.data[d] && sp.data[d][p]) {
                                const classes = String(sp.data[d][p]).split(/[,\s]+/).map(v => v.trim()).filter(Boolean);
                                if (classes.includes(cStr)) {
                                    if (!classData[d][p]) {
                                        classData[d][p] = sub;
                                        ct++;
                                        // 전담 가져온 셀로 표시
                                        if (!wData.specialistCells[cStr]) wData.specialistCells[cStr] = {};
                                        if (!wData.specialistCells[cStr][d]) wData.specialistCells[cStr][d] = {};
                                        wData.specialistCells[cStr][d][p] = true;
                                    } else {
                                        skipped.push(`${c}반 ${d}요일 ${p+1}교시 (${sub})`);
                                    }
                                }
                            }
                        }
                    });
                });
            }
            this.saveData(); this.renderTimetableLayout();
            let msg = `총 ${ct}개 빈 교시에 전담 과목이 반영되었습니다.`;
            if (skipped.length > 0) {
                msg += `<div style="margin-top:12px; padding:12px; background:#fef2f2; border-radius:8px; border:1px solid #fecaca;">
                    <div style="font-weight:700; color:#dc2626; margin-bottom:8px;">⚠️ 이미 입력되어 반영되지 않은 교시 (${skipped.length}개)</div>
                    <div style="font-size:0.82rem; color:#b91c1c; line-height:1.9;">${skipped.map(s => `• ${s}`).join('<br>')}</div>
                </div>`;
            }
            this.showAlert('가져오기 완료', msg);
        });
    },
    
    /* 반별 시간표 테이블 HTML — 헤더: [1반 | 월 | 화 | 수 | 목 | 금] 한 행 */
    _buildClassTableHtml(c, cls) {
        const wData = this.state.history[this.state.currentWeek];
        const cd = wData.classes[c] || {};
        const bgColors = wData.bgColors?.[c] || {};
        const spCells = wData.specialistCells?.[String(c)] || {};
        const maxP = Math.max(...Object.values(this.state.config.periods));
        const p = cls;
        const colgroup = `<colgroup><col class="${p}-col-pd">${this.days.map(() => `<col>`).join('')}</colgroup>`;
        let h = `<table class="${p}-table">${colgroup}
            <thead>
                <tr>
                    <th class="${p}-class-th">${c}반</th>
                    ${this.days.map(d => `<th class="${p}-day-th">${d}</th>`).join('')}
                </tr>
            </thead><tbody>`;
        for (let row = 0; row < maxP; row++) {
            h += `<tr><td class="${p}-pd-td">${row + 1}</td>`;
            this.days.forEach(d => {
                if (row < this.state.config.periods[d]) {
                    const sub = (cd[d] && cd[d][row]) || '';
                    const customBg = bgColors[d]?.[row] ?? null;
                    const isSpCell = !!(spCells[d]?.[row]);
                    const sp = isSpCell ? this.state.specialists.find(s => (s.subject === sub || s.name === sub)) : null;
                    const bg = customBg || (sp && sp.bg) || null;
                    const style = bg ? ` style="background-color:${bg};-webkit-print-color-adjust:exact;print-color-adjust:exact;"` : '';
                    h += `<td${style}>${sub}</td>`;
                } else {
                    h += `<td class="${p}-disabled-td"></td>`;
                }
            });
            h += `</tr>`;
        }
        return h + `</tbody></table>`;
    },

    /* 전담 시간표 테이블 HTML */
    _buildSpTableHtml(sp, cls) {
        const p = cls;
        const maxP = Math.max(...Object.values(this.state.config.periods));
        const bg = sp.bg || '#f1f5f9';
        const hex = bg.replace('#', '');
        const r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
        const brightness = (r*299 + g*587 + b*114) / 1000;
        const textColor = brightness > 150 ? '#1e293b' : '#ffffff';

        const colgroup = `<colgroup><col class="${p}-col-pd">${this.days.map(() => `<col>`).join('')}</colgroup>`;
        let h = `<table class="${p}-table">${colgroup}
            <thead>
                <tr>
                    <th class="${p}-sp-name-th" colspan="${this.days.length + 1}"
                        style="background-color:${bg};color:${textColor};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                        ${sp.subject || '(미설정)'}${sp.desc ? `<span class="${p}-sp-desc">${sp.desc}</span>` : ''}
                    </th>
                </tr>
                <tr>
                    <th class="${p}-day-th"></th>
                    ${this.days.map(d => `<th class="${p}-day-th">${d}</th>`).join('')}
                </tr>
            </thead><tbody>`;
        for (let row = 0; row < maxP; row++) {
            h += `<tr><td class="${p}-pd-td">${row + 1}</td>`;
            this.days.forEach(d => {
                if (row < this.state.config.periods[d]) {
                    const val = (sp.data && sp.data[d] && sp.data[d][row]) ? sp.data[d][row] : '';
                    const markBg = sp.marks && sp.marks[`${d}_${row}`];
                    const markStyle = markBg ? ` style="background-color:${markBg};-webkit-print-color-adjust:exact;print-color-adjust:exact;"` : '';
                    h += `<td${markStyle}>${val}</td>`;
                } else {
                    h += `<td class="${p}-disabled-td"></td>`;
                }
            });
            h += `</tr>`;
        }
        return h + `</tbody></table>`;
    },

    /* 공통 HTML 빌드 (preview용 ppo / 인쇄용 pt 클래스 전환) */
    _buildFullPrintHtml(cls) {
        const gradeText = this.state.config.grade ? `${this.state.config.grade}학년 ` : '';
        const cc = this.state.config.classCount;
        const gridCols = 3; // 항상 최대 3열
        const p = cls;

        /* 1페이지: 반별 시간표 */
        let page1 = `<div class="${p}-doc-title">${gradeText}${this.state.currentWeek}주차 주간학습안내</div>`;
        page1 += `<div class="${p}-grid ${p}-grid-${gridCols}">`;
        for (let c = 1; c <= cc; c++) page1 += this._buildClassTableHtml(c, cls);
        page1 += `</div>`;

        /* 2페이지: 전담 시간표 (전담 보드가 있을 때만) */
        let page2 = '';
        const sps = this.state.specialists.filter(s => s.subject || s.name);
        if (sps.length > 0) {
            const spCols = 3; // 반별시간표와 동일한 3열 고정
            page2 += `<div class="${p}-doc-title" style="margin-top:0;">전담 시간표</div>`;
            page2 += `<div class="${p}-grid ${p}-grid-${spCols}">`;
            sps.forEach(sp => { page2 += this._buildSpTableHtml(sp, cls); });
            page2 += `</div>`;
        }

        return { page1, page2 };
    },

    showPrintPreview() {
        const overlay = document.getElementById('print-preview-overlay');
        const body = document.getElementById('ppo-content')?.parentElement;
        const ppoBody = document.querySelector('.ppo-body');
        if (!overlay || !ppoBody) return;

        // 기존 페이지 초기화
        ppoBody.innerHTML = '';

        const { page1, page2 } = this._buildFullPrintHtml('ppo');

        const mkPage = html => {
            const div = document.createElement('div');
            div.className = 'ppo-page';
            div.innerHTML = html;
            ppoBody.appendChild(div);
        };

        mkPage(page1);
        if (page2) mkPage(page2);

        overlay.classList.remove('hide');
    },

    async downloadPDF() {
        const btn = document.getElementById('btn-ppo-download');
        const origText = btn.textContent;
        btn.textContent = '생성 중...'; btn.disabled = true;
        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pages = document.querySelectorAll('.ppo-page');
            const a4W = 210, a4H = 297;

            for (let i = 0; i < pages.length; i++) {
                const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, a4W, a4H);
            }

            const gradeText = this.state.config.grade ? `${this.state.config.grade}학년_` : '';
            pdf.save(`${gradeText}${this.state.currentWeek}주차_주간학습안내.pdf`);
        } catch(e) {
            alert('PDF 생성 중 오류가 발생했습니다.');
        } finally {
            btn.textContent = origText; btn.disabled = false;
        }
    },

    printPDF() {
        const gradeText = this.state.config.grade ? `${this.state.config.grade}학년 ` : '';
        const { page1, page2 } = this._buildFullPrintHtml('pt');

        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
            * { box-sizing: border-box; }
            body { margin:0; padding:10mm; font-family:'Noto Sans KR','Malgun Gothic',sans-serif; background:#fff; font-size:10.5px; }
            @page { size:A4 portrait; margin:10mm; }
            .pt-doc-title { text-align:center; font-size:1.1rem; font-weight:800; padding:9px 16px; margin-bottom:12px; border-bottom:2px solid #1e293b; letter-spacing:1.5px; color:#1e293b; }
            .pt-grid { display:grid; gap:8px; align-items:stretch; }
            .pt-grid-2 { grid-template-columns:repeat(2,1fr); }
            .pt-grid-3 { grid-template-columns:repeat(3,1fr); }
            .pt-grid-4 { grid-template-columns:repeat(4,1fr); }
            .pt-table { width:100%; height:100%; border-collapse:collapse; table-layout:fixed; font-size:10.5px; text-align:center; font-family:'Noto Sans KR','Malgun Gothic',sans-serif; font-weight:500; letter-spacing:-0.2px; border:1px solid #e2e8f0; page-break-inside:avoid; }
            .pt-col-pd { width:36px; }
            .pt-table th, .pt-table td { border:1px solid #e2e8f0; padding:4px 2px; overflow:hidden; white-space:nowrap; font-size:9px; letter-spacing:-0.5px; }
            .pt-class-th { background:#1e293b !important; color:#fff; font-size:12px; font-weight:900; padding:5px 4px; letter-spacing:0.5px; white-space:nowrap; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .pt-day-th { background:#f1f5f9 !important; font-weight:700; font-size:10px; color:#475569; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .pt-pd-td { background:#f8fafc; font-weight:700; color:#94a3b8; font-size:9.5px; }
            .pt-disabled-td { background:#f1f5f9; }
            .pt-sp-name-th { font-size:11px; font-weight:800; padding:7px 10px; text-align:center; letter-spacing:0.3px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .pt-sp-desc { font-family:inherit; font-weight:600; font-size:10.5px; opacity:0.9; border-left:1.5px solid currentColor; margin-left:10px; padding-left:10px; }
            .pt-page-break { page-break-before:always; padding-top:10mm; }
        `;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) { window.print(); return; }
        const p2Block = page2 ? `<div class="pt-page-break">${page2}</div>` : '';
        win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
            <title>${gradeText}${this.state.currentWeek}주차 주간학습안내</title>
            <style>${css}</style></head><body>${page1}${p2Block}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 400);
    },

    downloadWord() {


        const gradeText = this.state.config.grade ? `${this.state.config.grade}학년 ` : '';
        const cc = this.state.config.classCount;
        const maxP = Math.max(...Object.values(this.state.config.periods));

        const tdStyle = 'border:1px solid #aaa; padding:5px 8px; text-align:center; font-size:11pt;';
        const thStyle = 'border:1px solid #aaa; padding:5px 8px; text-align:center; font-size:11pt; background:#f3f4f6; font-weight:bold;';
        const classThStyle = 'border:1px solid #aaa; padding:5px 8px; text-align:center; font-size:12pt; font-weight:bold; background:#1e293b; color:#ffffff;';
        const pdStyle = 'border:1px solid #aaa; padding:5px 8px; text-align:center; font-size:10pt; color:#666; background:#f8fafc;';

        const buildClassTable = (c) => {
            const cd = this.state.history[this.state.currentWeek].classes[c] || {};
            let t = `<table style="border-collapse:collapse; width:100%; margin-bottom:12pt;">
                <tr><th style="${classThStyle}" colspan="${this.days.length + 1}">${c}반</th></tr>
                <tr><th style="${thStyle}"></th>${this.days.map(d => `<th style="${thStyle}">${d}</th>`).join('')}</tr>`;
            for (let p = 0; p < maxP; p++) {
                t += `<tr><td style="${pdStyle}">${p + 1}</td>`;
                this.days.forEach(d => {
                    if (p < this.state.config.periods[d]) {
                        const sub = (cd[d] && cd[d][p]) || '';
                        const sp = this.state.specialists.find(s => s.subject === sub || s.name === sub);
                        const bg = (sp && sp.bg) ? `background:${sp.bg};` : '';
                        t += `<td style="${tdStyle}${bg}">${sub}</td>`;
                    } else {
                        t += `<td style="${tdStyle}background:#e5e7eb;"></td>`;
                    }
                });
                t += `</tr>`;
            }
            return t + `</table>`;
        };

        const buildSpTable = (sp) => {
            const bg = sp.bg || '#f1f5f9';
            const desc = sp.desc ? ` | ${sp.desc}` : '';
            let t = `<table style="border-collapse:collapse; width:100%; margin-bottom:12pt;">
                <tr><th style="${thStyle}background:${bg}; color:#1e293b;" colspan="${this.days.length + 1}">${sp.subject || ''}${desc}</th></tr>
                <tr><th style="${thStyle}"></th>${this.days.map(d => `<th style="${thStyle}">${d}</th>`).join('')}</tr>`;
            for (let p = 0; p < maxP; p++) {
                t += `<tr><td style="${pdStyle}">${p + 1}</td>`;
                this.days.forEach(d => {
                    if (p < this.state.config.periods[d]) {
                        const val = (sp.data && sp.data[d] && sp.data[d][p]) || '';
                        t += `<td style="${tdStyle}">${val}</td>`;
                    } else {
                        t += `<td style="${tdStyle}background:#e5e7eb;"></td>`;
                    }
                });
                t += `</tr>`;
            }
            return t + `</table>`;
        };

        // 1페이지: 반별 시간표
        let body = `<h2 style="text-align:center; font-size:16pt; margin-bottom:16pt;">${gradeText}${this.state.currentWeek}주차 주간학습안내</h2>`;
        for (let c = 1; c <= cc; c++) body += buildClassTable(c);

        // 2페이지: 전담 시간표
        const sps = this.state.specialists.filter(s => s.subject || s.name);
        if (sps.length > 0) {
            body += `<br style="page-break-before:always">`;
            body += `<h2 style="text-align:center; font-size:16pt; margin-bottom:16pt;">전담 시간표</h2>`;
            sps.forEach(sp => { body += buildSpTable(sp); });
        }

        const html = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office'
                  xmlns:w='urn:schemas-microsoft-com:office:word'
                  xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset="utf-8">
            <style>
                body { font-family: '맑은 고딕', sans-serif; margin: 20mm; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 14pt; }
                td, th { border: 1px solid #aaa; padding: 5px 8px; text-align: center; font-size: 11pt; }
                @page { size: A4; margin: 15mm; }
            </style>
            </head><body>${body}</body></html>`;
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${gradeText}${this.state.currentWeek}주차_주간학습안내.doc`;
        a.click();
        URL.revokeObjectURL(url);
    },

    async printWeeklyGuide() {
        if (this.state.roomCode && this.state.isDirty) {
            const classNum = this.state.userProfile?.classNum;
            const confirmed = await this.showConfirm(
                '저장하지 않은 변경사항',
                `저장하지 않은 내용은 주간학습안내에 반영되지 않습니다.<br><b>${classNum}반 시간표를 저장 후 출력</b>하시겠습니까?`
            );
            if (confirmed) {
                await this.saveClassToServer(classNum);
            } else {
                return;
            }
        }
        this.showPrintPreview();
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());

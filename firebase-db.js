/**
 * Firebase Firestore 연동 모듈
 * Firestore 구조:
 *   rooms/{roomCode}                          → config, specialists, referenceBoards, maxWeek
 *   rooms/{roomCode}/weeks/{weekNum}           → targets, specialistTargets, specialistMemo, specialistCells
 *   rooms/{roomCode}/weeks/{weekNum}/classes/{classNum} → timetable, bgColors
 */
const FirebaseDB = {
    db: null,

    init() {
        const config = {
            apiKey: "AIzaSyDgleymUs9LokXyLr47doYpykRopuUsWVg",
            authDomain: "jugan-61d45.firebaseapp.com",
            projectId: "jugan-61d45",
            storageBucket: "jugan-61d45.firebasestorage.app",
            messagingSenderId: "903937990755",
            appId: "1:903937990755:web:7239d3b710e0d950385856"
        };
        if (!firebase.apps.length) firebase.initializeApp(config);
        this.db = firebase.firestore();
    },

    roomRef(roomCode) {
        return this.db.collection('rooms').doc(roomCode);
    },

    // ── 방 삭제 (하위 컬렉션 포함) ──
    async deleteRoom(roomCode) {
        const rRef = this.roomRef(roomCode);
        const weeksSnap = await rRef.collection('weeks').get();
        const deletes = [];
        for (const weekDoc of weeksSnap.docs) {
            const classesSnap = await rRef.collection('weeks').doc(weekDoc.id).collection('classes').get();
            classesSnap.docs.forEach(cd => deletes.push(cd.ref.delete()));
            deletes.push(weekDoc.ref.delete());
        }
        await Promise.all(deletes);
        await rRef.delete();
    },

    // ── 방 목록 불러오기 ──
    async listRooms() {
        const snap = await this.db.collection('rooms').get();
        return snap.docs.map(d => d.id);
    },

    // ── 새 방 생성 ──
    async createRoom(roomCode) {
        const ref = this.db.collection('rooms').doc(roomCode);
        const snap = await ref.get();
        if (snap.exists) return false; // 이미 존재
        await ref.set({
            config: null,
            specialists: [],
            referenceBoards: [],
            maxWeek: 1,
            lastSavedBy: '',
            lastSavedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    },

    // ── 전체 데이터 불러오기 ──
    async load(roomCode) {
        const rRef = this.roomRef(roomCode);
        const roomSnap = await rRef.get();
        if (!roomSnap.exists) return null;

        const roomData = roomSnap.data();
        const currentSemester = roomData.currentSemester || 1;
        const semestersConfig = roomData.semestersConfig || {};

        const historySem1 = {};
        const historySem2 = {};

        // Load 1학기 (weeks)
        const weeksSnap1 = await rRef.collection('weeks').get();
        await Promise.all(weeksSnap1.docs.map(async weekDoc => {
            const w = parseInt(weekDoc.id);
            const wData = weekDoc.data();
            historySem1[w] = {
                targets: wData.targets || {},
                specialistTargets: wData.specialistTargets || {},
                specialistMemo: wData.specialistMemo || '',
                weeklyMemo: wData.weeklyMemo || '',
                specialistCells: wData.specialistCells || {},
                specialists: wData.specialists || [],
                classes: {},
                bgColors: {}
            };
            const classesSnap = await rRef.collection('weeks').doc(weekDoc.id).collection('classes').get();
            classesSnap.docs.forEach(classDoc => {
                const cd = classDoc.data();
                historySem1[w].classes[classDoc.id] = cd.timetable || {};
                historySem1[w].bgColors[classDoc.id] = cd.bgColors || {};
            });
        }));

        // Load 2학기 (sem2_weeks)
        const weeksSnap2 = await rRef.collection('sem2_weeks').get();
        await Promise.all(weeksSnap2.docs.map(async weekDoc => {
            const w = parseInt(weekDoc.id);
            const wData = weekDoc.data();
            historySem2[w] = {
                targets: wData.targets || {},
                specialistTargets: wData.specialistTargets || {},
                specialistMemo: wData.specialistMemo || '',
                weeklyMemo: wData.weeklyMemo || '',
                specialistCells: wData.specialistCells || {},
                specialists: wData.specialists || [],
                classes: {},
                bgColors: {}
            };
            const classesSnap = await rRef.collection('sem2_weeks').doc(weekDoc.id).collection('classes').get();
            classesSnap.docs.forEach(classDoc => {
                const cd = classDoc.data();
                historySem2[w].classes[classDoc.id] = cd.timetable || {};
                historySem2[w].bgColors[classDoc.id] = cd.bgColors || {};
            });
        }));

        const sem1Max = Math.max(1, ...Object.keys(historySem1).map(Number));
        const sem2Max = Math.max(1, ...Object.keys(historySem2).map(Number));

        const sem1Config = semestersConfig[1] || {
            maxWeek: roomData.maxWeek || sem1Max,
            currentWeek: sem1Max,
            weekAnchor: roomData.config?.weekAnchor || null,
            annualTargets: roomData.config?.annualTargets || {}
        };
        const sem2Config = semestersConfig[2] || {
            maxWeek: sem2Max,
            currentWeek: 1,
            weekAnchor: roomData.sem2WeekAnchor || null,
            annualTargets: roomData.sem2AnnualTargets || {}
        };

        const semesters = {
            1: {
                history: historySem1,
                maxWeek: sem1Config.maxWeek || sem1Max,
                currentWeek: sem1Config.currentWeek || sem1Max,
                weekAnchor: sem1Config.weekAnchor || null,
                annualTargets: sem1Config.annualTargets || {}
            },
            2: {
                history: historySem2,
                maxWeek: sem2Config.maxWeek || sem2Max,
                currentWeek: sem2Config.currentWeek || 1,
                weekAnchor: sem2Config.weekAnchor || null,
                annualTargets: sem2Config.annualTargets || {}
            }
        };

        const activeSem = semesters[currentSemester] || semesters[1];

        return {
            config: roomData.config || null,
            classSettings: roomData.classSettings || {},
            specialists: roomData.specialists || [],
            referenceBoards: roomData.referenceBoards || [],
            currentSemester,
            semesters,
            maxWeek: activeSem.maxWeek || 1,
            currentWeek: activeSem.currentWeek || 1,
            history: activeSem.history || {},
            lastSavedBy: roomData.lastSavedBy || '',
            lastSavedAt: roomData.lastSavedAt || null
        };
    },

    // undefined 제거 (Firestore는 undefined 불가)
    _clean(obj) {
        return JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
    },

    // ── 관리자 저장: config + specialists + 전체 주차 + 전체 반 ──
    async saveAdmin(roomCode, state) {
        const rRef = this.roomRef(roomCode);
        const curSem = state.currentSemester || 1;

        // 학기 설정 메타데이터 정리
        const semestersConfig = {
            1: {
                maxWeek: state.semesters?.[1]?.maxWeek || (curSem === 1 ? state.maxWeek : 1),
                currentWeek: state.semesters?.[1]?.currentWeek || (curSem === 1 ? state.currentWeek : 1),
                weekAnchor: state.semesters?.[1]?.weekAnchor || (curSem === 1 ? state.config?.weekAnchor : null),
                annualTargets: state.semesters?.[1]?.annualTargets || {}
            },
            2: {
                maxWeek: state.semesters?.[2]?.maxWeek || (curSem === 2 ? state.maxWeek : 1),
                currentWeek: state.semesters?.[2]?.currentWeek || (curSem === 2 ? state.currentWeek : 1),
                weekAnchor: state.semesters?.[2]?.weekAnchor || (curSem === 2 ? state.config?.weekAnchor : null),
                annualTargets: state.semesters?.[2]?.annualTargets || {}
            }
        };

        await rRef.set({
            ...this._clean({
                config: state.config,
                classSettings: state.classSettings || {},
                specialists: state.specialists || [],
                referenceBoards: state.referenceBoards || [],
                currentSemester: curSem,
                semestersConfig,
                maxWeek: state.maxWeek,
                lastSavedBy: state.userProfile?.name || '관리자',
            }),
            lastSavedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const collectionName = curSem === 2 ? 'sem2_weeks' : 'weeks';
        const saves = [];
        for (let w = 1; w <= state.maxWeek; w++) {
            const wData = state.history[w];
            if (!wData) continue;
            const wRef = rRef.collection(collectionName).doc(String(w));

            saves.push(wRef.set(this._clean({
                targets: wData.targets || {},
                specialistTargets: wData.specialistTargets || {},
                specialistMemo: wData.specialistMemo || '',
                weeklyMemo: wData.weeklyMemo || '',
                specialistCells: wData.specialistCells || {},
                specialists: wData.specialists || []
            })));

            const classes = wData.classes || {};
            for (const [classNum, classData] of Object.entries(classes)) {
                saves.push(
                    wRef.collection('classes').doc(String(classNum)).set(this._clean({
                        timetable: classData || {},
                        bgColors: (wData.bgColors || {})[classNum] || {}
                    }))
                );
            }
        }
        await Promise.all(saves);
    },

    // ── 일반 선생님 저장: 자기 반 데이터만 ──
    async saveClass(roomCode, classNum, state) {
        const rRef = this.roomRef(roomCode);
        const curSem = state.currentSemester || 1;
        const collectionName = curSem === 2 ? 'sem2_weeks' : 'weeks';
        const saves = [];

        for (let w = 1; w <= state.maxWeek; w++) {
            const wData = state.history[w];
            if (!wData) continue;
            const wRef = rRef.collection(collectionName).doc(String(w));
            
            // 🔥 주차(week) 부모 문서가 없으면(유령 문서) load() 쿼리에서 무시되므로 명시적으로 빈 데이터를 병합 저장
            saves.push(wRef.set({ _exists: true }, { merge: true }));

            saves.push(
                wRef.collection('classes').doc(String(classNum))
                    .set(this._clean({
                        timetable: (wData.classes || {})[classNum] || (wData.classes || {})[String(classNum)] || {},
                        bgColors: ((wData.bgColors || {})[classNum]) || ((wData.bgColors || {})[String(classNum)]) || {}
                    }))
            );
        }

        // 반별 선호시간대 설정 저장 (해당 반만 업데이트)
        const classSettingData = this._clean((state.classSettings || {})[classNum] || {});
        saves.push(
            rRef.set({ classSettings: { [classNum]: classSettingData } }, { merge: true })
        );

        await Promise.all(saves);
    }
};

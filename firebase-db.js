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
        const history = {};

        const weeksSnap = await rRef.collection('weeks').get();
        await Promise.all(weeksSnap.docs.map(async weekDoc => {
            const w = parseInt(weekDoc.id);
            const wData = weekDoc.data();
            history[w] = {
                targets: wData.targets || {},
                specialistTargets: wData.specialistTargets || {},
                specialistMemo: wData.specialistMemo || '',
                specialistCells: wData.specialistCells || {},
                specialists: wData.specialists || [],
                classes: {},
                bgColors: {}
            };
            const classesSnap = await rRef.collection('weeks').doc(weekDoc.id).collection('classes').get();
            classesSnap.docs.forEach(classDoc => {
                const cd = classDoc.data();
                history[w].classes[classDoc.id] = cd.timetable || {};
                history[w].bgColors[classDoc.id] = cd.bgColors || {};
            });
        }));

        return {
            config: roomData.config || null,
            classSettings: roomData.classSettings || {},
            specialists: roomData.specialists || [],
            referenceBoards: roomData.referenceBoards || [],
            maxWeek: roomData.maxWeek || 1,
            lastSavedBy: roomData.lastSavedBy || '',
            lastSavedAt: roomData.lastSavedAt || null,
            history
        };
    },

    // undefined 제거 (Firestore는 undefined 불가)
    _clean(obj) {
        return JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
    },

    // ── 관리자 저장: config + specialists + 전체 주차 + 전체 반 ──
    async saveAdmin(roomCode, state) {
        const rRef = this.roomRef(roomCode);

        await rRef.set({
            ...this._clean({
                config: state.config,
                classSettings: state.classSettings || {},
                specialists: state.specialists || [],
                referenceBoards: state.referenceBoards || [],
                maxWeek: state.maxWeek,
                lastSavedBy: state.userProfile?.name || '관리자',
            }),
            lastSavedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const saves = [];
        for (let w = 1; w <= state.maxWeek; w++) {
            const wData = state.history[w];
            if (!wData) continue;
            const wRef = rRef.collection('weeks').doc(String(w));

            saves.push(wRef.set(this._clean({
                targets: wData.targets || {},
                specialistTargets: wData.specialistTargets || {},
                specialistMemo: wData.specialistMemo || '',
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
        const saves = [];

        for (let w = 1; w <= state.maxWeek; w++) {
            const wData = state.history[w];
            if (!wData) continue;
            saves.push(
                rRef.collection('weeks').doc(String(w))
                    .collection('classes').doc(String(classNum))
                    .set(this._clean({
                        timetable: (wData.classes || {})[classNum] || {},
                        bgColors: ((wData.bgColors || {})[classNum]) || {}
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

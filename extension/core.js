(function (root) {
    "use strict";
    const UNCERTAIN = new Set(["reserved", "awaiting_result", "graded", "uncertain"]);
    const SAFE_TYPES = new Set(["choice", "text", "reference"]);
    const ERROR_LABELS = {
        UNKNOWN_STATUS: "练习完成状态无法确认",
        COMPLETED: "练习已有提交记录",
        UNVERIFIED_TYPE: "题型尚未通过真实填写验证",
        UNSUPPORTED_TYPE: "题型判分规则未验证",
        NO_CANDIDATE: "候选答案无法唯一确定",
        DRAFT_CONFLICT: "已有未提交答案与候选答案不同",
        READBACK_FAILED: "填写后逐字符核对失败",
        UNAUTHORIZED: "练习不在提交授权范围内",
        UNKNOWN_IDENTITY: "当前账户身份无法确认",
        UNCERTAIN_SUBMIT: "提交结果待确认，已阻止再次提交",
        OFFLINE: "网络已断开，任务已暂停",
        PAGE_CHANGED: "练习页面已变化，任务已暂停",
        OTHER_TAB: "另一个标签页正在处理这项练习",
        PENDING_VALIDATION: "自动提交和判分回读尚未通过实测",
        NOT_CONFIGURED: "请先保存首次设置",
        PAUSED: "任务已暂停",
        STATE_VERSION: "任务数据版本不兼容，已保留原记录并暂停",
        NAVIGATION_UNVERIFIED: "批量导航尚未通过真实页面验证",
        TAB_NOT_COURSE: "当前标签页不是目标课程页面",
        SCO_MISSING: "课程页面缺少练习标识",
        CONTENT_NOT_LOADED: "课件脚本尚未加载，请刷新课程页面",
        FIELD_ID_INVALID: "题目标识格式无法确认",
        CONCURRENT_COURSE: "其他课件页面仍然打开，已暂停当前任务",
        MESSAGE_TIMEOUT: "课件响应超时，请先处理页面提示",
        ALREADY_RUNNING: "任务正在处理，请先暂停",
        DOM_PAGE_NOT_FOUND: "课件中未找到当前练习容器",
        DOM_AMBIGUOUS_PAGE: "当前练习容器不唯一，已暂停定位",
        DOM_PAGE_HIDDEN: "当前练习容器尚未显示",
        READ_ONLY_FIELD: "输入框不可编辑，已停止填写",
        SESSION_ENDED: "学习会话已结束，任务已暂停",
        NOT_FOREGROUND: "课程窗口不在前台，任务已暂停",
        CATALOG_UNVERIFIED: "课程目录或完成数无法确认",
        DIRECTORY_MISMATCH: "页面结果与课程目录记录不一致，禁止重提",
        ENGINE_TIMEOUT: "页面加载或结果等待超时，任务已暂停",
        AUTH_REQUIRED: "请先设置本课程的提交范围与上限",
        NO_EXERCISE: "页面已加载，无练习，已停留10秒后跳过",
        EMPTY_REVOKED: "倒计时期间练习结构变化，已停止空章节跳过",
    };
    function fail(code) { const e = new Error(ERROR_LABELS[code] || code); e.code = code; throw e; }
    function initialState() {
        return {
            schema: 2, settings: { configured: false, replaceDrafts: false, batch: false, delayMs: 450 },
            authorization: null, consent: null, run: null, ledger: {}, catalog: {}, inputEvidence: {}, history: [],
        };
    }
    function recover(state) {
        if (!state) return initialState();
        if (state.schema !== 2) fail("STATE_VERSION");
        const next = structuredClone(state);
        if (next.run&&next.run.status!=="stopped") next.run.status = "paused";
        for (const row of Object.values(next.ledger)) {
            if (UNCERTAIN.has(row.status)) { row.status = "uncertain"; row.error = "UNCERTAIN_SUBMIT"; }
            else if (["filling", "verified"].includes(row.status)) { row.status = "paused"; row.error = "PAUSED"; }
        }
        return next;
    }
    function key(context, id) {
        if (!/^[a-f0-9]{64}$/.test(context.scopeKey || "") || !/^m-1-\d+-\d+$/.test(id)) fail("PAGE_CHANGED");
        return context.scopeKey + ":" + id;
    }
    function scoFromUrl(value) {
        try {
            const u=new URL(value),explicit=[...u.searchParams].filter(([k])=>k.toLowerCase()==="sco");
            if(explicit.length===1)return /^m-1-\d+-\d+$/.test(explicit[0][1])?explicit[0][1]:null;
            if(explicit.length>1)return null;
            const keys=[...u.searchParams.keys()].filter(k=>/^m-1-\d+-\d+$/.test(k));
            return keys.length===1?keys[0]:null;
        }catch{return null;}
    }
    function settings(input) {
        if (!Number.isInteger(input.delayMs) || input.delayMs < 200 || input.delayMs > 3000) fail("INVALID_DELAY");
        const batchSize=input.batchSize===undefined?1:Number(input.batchSize);
        if(!Number.isInteger(batchSize)||batchSize<1||batchSize>10)fail("UNAUTHORIZED");
        return { configured: true, replaceDrafts: input.replaceDrafts === true, batch: input.batch === true, delayMs: input.delayMs,batchSize,
            skipUnsupported: input.skipUnsupported !== false };
    }
    function fillAllowed(snapshot, evidence, calibration, config) {
        if (snapshot.observedStatus === "completed") fail("COMPLETED");
        if (snapshot.observedStatus !== "unsubmitted") fail("UNKNOWN_STATUS");
        if (!snapshot.questions.length) fail("UNSUPPORTED_TYPE");
        for (const q of snapshot.questions) {
            if (!SAFE_TYPES.has(q.type)) fail("UNSUPPORTED_TYPE");
            if (!q.hasCandidate) fail("NO_CANDIDATE");
            if (q.conflict && !config.replaceDrafts) fail("DRAFT_CONFLICT");
            if (!calibration && !evidence[q.type]?.passed) fail("UNVERIFIED_TYPE");
        }
    }
    function submitAllowed(state, context, row, capabilities, now) {
        if (!state.run || state.run.status !== "running" || state.run.scopeKey !== context.scopeKey) fail("PAUSED");
        if (UNCERTAIN.has(row.status) || row.clickCount > 0) fail("UNCERTAIN_SUBMIT");
        if (row.status !== "verified" || row.matched !== row.total || row.total < 1) fail("READBACK_FAILED");
        const pilot=state.authorization?.pilot===true&&state.authorization.exerciseIds.length===1&&state.authorization.limit===1;
        if (!pilot&&(!capabilities.submission.passed || !capabilities.resultPersistence.passed)) fail("PENDING_VALIDATION");
        if (!context.identityHash) fail("UNKNOWN_IDENTITY");
        const a = state.authorization;
        if (!a || a.scopeKey !== context.scopeKey || a.identityHash !== context.identityHash ||
            !a.exerciseIds.includes(row.exerciseId) || (a.expiresAt && a.expiresAt < now) || a.used >= a.limit) fail("UNAUTHORIZED");
        if (row.observedStatus !== "unsubmitted") fail("UNKNOWN_STATUS");
    }
    function authorize(input, context, now) {
        if (!context.identityHash) fail("UNKNOWN_IDENTITY");
        const ids = [...new Set(input.exerciseIds)];
        if (!ids.length || ids.some(id => !/^m-1-\d+-\d+$/.test(id))) fail("UNAUTHORIZED");
        if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > ids.length) fail("UNAUTHORIZED");
        return { scopeKey: context.scopeKey, identityHash: context.identityHash, exerciseIds: ids, limit: input.limit, used: 0, grantedAt: now };
    }
    function observeResult(row, snapshot, epoch) {
        if (snapshot.observedStatus !== "completed") return row;
        const result = snapshot.result;
        if (!result || result.source !== "welearn-dom") return row;
        const ungraded=result.kind==="ungraded" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(result.timestamp || "");
        if (!ungraded && (!Number.isFinite(result.accuracy) || result.accuracy < 0 || result.accuracy > 100)) return row;
        const r = { ...row, result, error: null };
        if (UNCERTAIN.has(row.status)) r.status = epoch !== row.submitEpoch ? "completed" : "graded";
        else if (!["completed","existing_completed"].includes(row.status)) r.status = "existing_completed";
        return r;
    }
    function confirmDirectory(row,item,progress,baseline) {
        if (!item || item.observedStatus!=="completed" || !row.result || row.clickCount!==1) fail("DIRECTORY_MISMATCH");
        if (!Number.isInteger(progress) || progress!==baseline+1) fail("DIRECTORY_MISMATCH");
        if (row.result.kind!=="ungraded" && (!Number.isFinite(item.score) || Math.abs(item.score-row.result.accuracy)>1)) fail("DIRECTORY_MISMATCH");
        return {...row,status:"completed",observedStatus:"completed",error:null,directoryConfirmedAt:Date.now(),directoryScore:item.score};
    }
    function summary(state, scopeKey) {
        const rows = Object.values(state.ledger).filter(r => r.scopeKey === scopeKey);
        const confirmed = rows.filter(r => ["completed", "existing_completed"].includes(r.status) && r.result);
        const countable = confirmed.filter(r => Number.isInteger(r.result.correct) && Number.isInteger(r.result.total) && r.result.total > 0);
        const correct = countable.reduce((n,r) => n + r.result.correct, 0);
        const total = countable.reduce((n,r) => n + r.result.total, 0);
        return { rows, completed: confirmed.length, blocked: rows.filter(r => r.error).length, correct, total, accuracy: total ? correct * 100 / total : null };
    }
    const api = { initialState, recover, key, scoFromUrl, settings, fillAllowed, submitAllowed, authorize, observeResult, confirmDirectory, summary, fail, ERROR_LABELS, UNCERTAIN };
    root.WeLearnCore = api;
    if (typeof module !== "undefined") module.exports = api;
})(globalThis);

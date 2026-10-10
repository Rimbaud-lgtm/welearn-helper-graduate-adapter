/* global chrome, WeLearnCore, WeLearnCapabilities */
importScripts("core.js", "capabilities.js");
const C = WeLearnCore;
const targets = new Map();
const diagnostics = new Map();
const directories = new Map();
const topTargets = new Map();
chrome.action?.onClicked?.addListener(tab=>{
    chrome.sidePanel?.open({windowId:tab.windowId}).catch(()=>{});
});
let alarmDeadline=null;
let serial = Promise.resolve();
const ready = chrome.storage.local.get("practiceState").then(async ({practiceState}) => {
    await chrome.storage.local.setAccessLevel({accessLevel:"TRUSTED_CONTEXTS"});
    if(practiceState && practiceState.schema!==2)C.fail("STATE_VERSION");
    return practiceState || C.initialState();
});
let state;
function enqueue(fn) {
    const task = serial.then(async () => { state ||= await ready; return fn(); });
    serial = task.catch(() => {});
    return task;
}
async function persist() {
    await chrome.storage.local.set({practiceState:state});
    if(chrome.alarms){
        const due=state.run?.deadlineAt&&!["paused","completed","stopped"].includes(state.run.status)?state.run.deadlineAt:null;
        if(due!==alarmDeadline){if(due)await chrome.alarms.create("practice-deadline",{when:due});else await chrome.alarms.clear("practice-deadline");alarmDeadline=due;}
    }
}
function error(code) { C.fail(code); }
function deadline(promise,ms=2500) {
    let timer;
    return Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>{const e=new Error("timeout");e.code="MESSAGE_TIMEOUT";reject(e);},ms);})]).finally(()=>clearTimeout(timer));
}
async function hash(text) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function contextFor(sender) {
    if (!Number.isInteger(sender.tab?.id)) error("PAGE_CHANGED");
    const tab = await chrome.tabs.get(sender.tab.id);
    const url = new URL(tab.url);
    if (url.protocol !== "https:" || url.hostname !== "welearn.sflep.com" ||
        !["/student/studycourse.aspx","/student/course_info.aspx"].includes(url.pathname.toLowerCase()) || url.searchParams.get("cid") !== "2850") error("TAB_NOT_COURSE");
    const courseTabs=(await chrome.tabs.query({url:"https://welearn.sflep.com/*"})).filter(t=>{
        try{return new URL(t.url).pathname.toLowerCase()==="/student/studycourse.aspx";}catch{return false;}
    });
    if(courseTabs.some(t=>t.id!==tab.id))error("CONCURRENT_COURSE");
    const scopeKey = await hash("2850|" + (url.searchParams.get("classid") || "no-class"));
    let identityHash=null;
    const documentId=sender.documentId || targets.get(tab.id)?.documentId;
    if(documentId&&chrome.scripting) {
        try {
            const result=await deadline(chrome.scripting.executeScript({target:{tabId:tab.id,documentIds:[documentId]},world:"MAIN",func:async()=>{
                if(typeof window.retrieveDataValue!=="function")return null;
                const raw=window.retrieveDataValue("cci.service.user.id");
                if(!["string","number"].includes(typeof raw))return null;
                const value=String(raw).trim();
                if(!/^[A-Za-z0-9_.@-]{1,256}$/.test(value)||["0","-1","null","undefined","unknown","guest","anonymous"].includes(value.toLowerCase()))return null;
                return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("welearn-user:"+value)))].map(n=>n.toString(16).padStart(2,"0")).join("");
            }}));
            identityHash=result[0]?.result;
        }catch{}
    }
    return {scopeKey,identityHash:/^[a-f0-9]{64}$/.test(identityHash || "") ? identityHash : null,
        currentSco:(sender.url&&trustedFrame(sender)?C.scoFromUrl(sender.url):null)||C.scoFromUrl(url.href),tabId:tab.id};
}
function trustedTop(sender){
    try{const u=new URL(sender.url);return sender.id===chrome.runtime.id&&sender.frameId===0&&u.hostname==="welearn.sflep.com"&&u.protocol==="https:"&&u.searchParams.get("cid")==="2850"&&["/student/course_info.aspx","/student/studycourse.aspx"].includes(u.pathname.toLowerCase());}catch{return false;}
}
function trustedUi(sender) { return sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL("")); }
function trustedFrame(sender) {
    try { const u=new URL(sender.url); return sender.id===chrome.runtime.id && u.hostname==="centercourseware.sflep.com" && u.protocol==="https:" && decodeURIComponent(u.pathname).split("/")[1]==="New Era Academic English Graduate Students 1"; }
    catch { return false; }
}
function sameLease(sender) {
    const lease=state.run?.lease;
    return lease && lease.tabId===sender.tab?.id && lease.frameId===sender.frameId && lease.documentId===sender.documentId;
}
function event(code,id) {
    state.history.push({at:Date.now(),code,exerciseId:id || null});
    state.history=state.history.slice(-200);
}
function publicState(tabId) {
    const target=targets.get(tabId);
    const directory=directories.get(tabId),context=target?.context || directory?.context || ((state.run?.tabId===tabId||state.run?.lease?.tabId===tabId)?{scopeKey:state.run.scopeKey}:null);
    const evidence=context ? Object.fromEntries(["text","choice","reference"].map(type=>[type,state.inputEvidence[context.scopeKey+":"+type] || null])) : {};
    const live=state.liveEvidence?.[context?.scopeKey];
    return {version:WeLearnCapabilities.version,settings:state.settings,authorization:state.authorization,diagnostic:diagnostics.get(tabId)||null,
        run:state.run,scopeKey:context?.scopeKey || null,identityConfirmed:Boolean(context?.identityHash),browserStartupAt:state.browserStartupAt||null,history:state.history.slice(-80),
        consent:state.consent || null,directory:directory?.snapshot || null,nativeProgress:state.lastDirectory?.scopeKey===context?.scopeKey?state.lastDirectory:null,
        current:target?.snapshot || null,catalog:context ? state.catalog[context.scopeKey] || [] : [],
        evidence,capabilities:{...WeLearnCapabilities,navigation:live?.navigation||WeLearnCapabilities.navigation,submission:live?.submission||WeLearnCapabilities.submission,resultPersistence:live?.resultPersistence||WeLearnCapabilities.resultPersistence},summary:context ? C.summary(state,context.scopeKey) : {rows:[],completed:0,blocked:0,accuracy:null,total:0,correct:0}};
}
function dispatch(target,message) {
    deadline(chrome.tabs.sendMessage(target.context.tabId,message,{frameId:target.frameId,documentId:target.documentId})).then(reply=>{if(!reply?.ok)throw new Error("target unavailable");})
        .catch(()=>enqueue(async()=>{
            if(state.run?.lease.documentId===target.documentId) {state.run.status="paused";state.run.lastError="PAGE_CHANGED";event("PAGE_CHANGED");await persist();}
        }));
}
async function begin(target,context,calibration,previousQueue) {
    const k=C.key(context,target.snapshot.exerciseId),row=state.ledger[k];
    if(C.UNCERTAIN.has(row.status)||row.clickCount>0)error("UNCERTAIN_SUBMIT");
    const snap=calibration ? {...target.snapshot,questions:target.snapshot.questions.filter(q=>["text","choice","reference"].includes(q.type)&&q.hasCandidate&&!q.conflict)} : target.snapshot;
    const evidence=Object.fromEntries(["choice","text","reference"].map(type=>[type,state.inputEvidence[context.scopeKey+":"+type]]));
    const a=state.authorization;
    const allowReplacement=state.settings.replaceDrafts || Boolean(!calibration&&a?.pilot&&a.replaceDrafts&&a.scopeKey===context.scopeKey&&a.identityHash===context.identityHash&&a.exerciseIds.includes(snap.exerciseId));
    const trial=state.authorization?.pilot===true;
    const runSettings={...state.settings,eventDriven:true,replaceDrafts:allowReplacement,forceTextWrite:calibration||trial};
    C.fillAllowed(snap,evidence,calibration||trial,runSettings);
    const previous=state.run?.engine==="extension-directory-v1"?state.run:null;
    state.run={...previous,id:previous?.id||crypto.randomUUID(),status:"running",scopeKey:context.scopeKey,exerciseId:snap.exerciseId,
        mode:calibration?"calibrate":"normal",fieldIds:snap.questions.map(q=>q.id),
        lease:{tabId:context.tabId,frameId:target.frameId,documentId:target.documentId},
        queue:previousQueue || (state.settings.batch ? (state.catalog[context.scopeKey] || []).filter(r=>r.observedStatus==="unsubmitted").map(r=>r.exerciseId) : [snap.exerciseId]),deadlineAt:Date.now()+90000,lastError:null,focus:null};
    state.run.stage="filling";
    row.status="filling";row.total=snap.questions.length;row.matched=0;row.fieldResults={};row.error=null;row.answerAcquireMs=snap.acquireMs || 0;
    row.execution={engine:"edge-extension",version:WeLearnCapabilities.version,startedAt:Date.now(),browserStartupAt:state.browserStartupAt||null,candidateSources:[...new Set(snap.questions.map(q=>q.candidateBasis||"course-data-solution"))]};
    event("EXTENSION_FILL_STARTED",row.exerciseId);
    await persist();dispatch(target,{kind:"WL_FILL",runId:state.run.id,exerciseId:snap.exerciseId,fieldIds:state.run.fieldIds,settings:runSettings});
}
async function foreground(tabId){
    const tab=await chrome.tabs.get(tabId),window=await chrome.windows.get(tab.windowId);
    if(!tab.active||!window.focused){
        if(state.run){state.run.focus={active:tab.active,focused:window.focused,windowType:window.type||null,at:Date.now()};state.run.lastError="NOT_FOREGROUND";await persist();}
        error("NOT_FOREGROUND");
    }
}
async function activateForLaunch(context){
    // Only the explicit extension button may activate a course window.
    const tab=await chrome.tabs.get(context.tabId);
    await chrome.tabs.update(tab.id,{active:true});
    await chrome.windows.update(tab.windowId,{focused:true});
    for(let i=0;i<10;i++){
        const current=await chrome.tabs.get(tab.id),window=await chrome.windows.get(tab.windowId);
        if(current.active&&window.focused)return;
        await new Promise(resolve=>setTimeout(resolve,150));
    }
    await foreground(tab.id);
}
function topDispatch(tabId,message){
    const top=topTargets.get(tabId);if(!top)error("CONTENT_NOT_LOADED");
    dispatch({context:{tabId},frameId:0,documentId:top.documentId},message);
}
async function directoryNext(directory){
    const run=state.run,scope=directory.context.scopeKey;
    if(!run||run.scopeKey!==scope)return;
    const consent=state.consent;
    if(!consent||consent.scopeKey!==scope)error("AUTH_REQUIRED");
    await foreground(directory.context.tabId);
    const used=state.authorization?.scopeKey===scope?state.authorization.used:0;
    if(used>=consent.limit){run.status="paused";run.lastError="AUTH_QUOTA_EXHAUSTED";run.deadlineAt=null;event("AUTH_QUOTA_EXHAUSTED");await persist();return;}
    if(run.done>=run.limit){
        if(!state.settings.batch||!state.settings.continueBatches){run.status="completed";run.deadlineAt=null;event("EXTENSION_RUN_COMPLETED");await persist();return;}
        event("BATCH_COMPLETED");run.batchNo=(run.batchNo||1)+1;run.batchStartDone=run.done;
        run.limit=run.done+Math.min(state.settings.batchSize||10,consent.limit-used);
        event("NEXT_BATCH_STARTED");
    }else if(run.done>0&&!state.settings.batch){run.status="completed";run.deadlineAt=null;event("EXTENSION_RUN_COMPLETED");await persist();return;}
    const next=directory.snapshot.items.find(item=>item.observedStatus==="unsubmitted"&&consent.exerciseIds.includes(item.exerciseId)&&!run.skipped.includes(item.exerciseId)&&!C.UNCERTAIN.has(state.ledger[C.key(directory.context,item.exerciseId)]?.status)&&!state.ledger[C.key(directory.context,item.exerciseId)]?.clickCount);
    if(!next){run.status="completed";run.lastError="NO_AUTHORIZED_UNFINISHED";run.deadlineAt=null;event("NO_AUTHORIZED_UNFINISHED");await persist();return;}
    run.pendingNext=next.exerciseId;run.exerciseId=next.exerciseId;run.baseline=directory.snapshot.completed;
    run.status="waiting_navigation";run.stage="navigation";run.deadlineAt=Date.now()+45000;run.enteredStudy=false;
    run.topLease=topTargets.get(directory.context.tabId)?.documentId;
    event("EXTENSION_DIRECTORY_ENTRY",next.exerciseId);await persist();
    topDispatch(directory.context.tabId,{kind:"WL_DIRECTORY_ENTER",runId:run.id,next:next.exerciseId});
}
async function returnForReconciliation(target,skip=false){
    state.run.status=skip?"returning_skip":"waiting_directory";
    state.run.stage=skip?"navigation":"reconciling";
    state.run.deadlineAt=Date.now()+45000;
    state.run.topLease=topTargets.get(target.context.tabId)?.documentId;
    await persist();topDispatch(target.context.tabId,{kind:"WL_COURSE_RETURN",runId:state.run.id});
}
async function advance(target) {
    const run=state.run;
    if(!run || run.scopeKey!==target.context.scopeKey || run.exerciseId!==target.snapshot.exerciseId)return;
    const queue=run.queue.filter(id=>id!==run.exerciseId);
    const next=queue.find(id=>state.catalog[run.scopeKey]?.some(r=>r.exerciseId===id&&r.observedStatus==="unsubmitted"));
    if(!state.settings.batch || !next){run.status="completed";await persist();return;}
    if(!WeLearnCapabilities.navigation.passed){run.status="paused";event("NAVIGATION_UNVERIFIED",next);await persist();return;}
    run.status="waiting_navigation";run.pendingNext=next;run.queue=queue;
    run.lease={tabId:target.context.tabId,frameId:target.frameId,documentId:target.documentId};
    await persist();dispatch(target,{kind:"WL_NAVIGATE",runId:run.id,exerciseId:run.exerciseId,next});
}
async function handle(message,sender) {
    if (!message || typeof message.kind!=="string") error("INVALID_MESSAGE");
    if(message.kind==="WL_TOP_READY"){
        if(!trustedTop(sender))error("INVALID_MESSAGE");
        topTargets.set(sender.tab.id,{documentId:sender.documentId});return {ok:true};
    }
    if(message.kind==="WL_DIRECTORY"){
        if(!trustedTop(sender)||!new URL(sender.url).pathname.toLowerCase().endsWith("course_info.aspx"))error("INVALID_MESSAGE");
        const context=await contextFor(sender),snap=message.snapshot;
        if(!snap||snap.total!==225||!Number.isInteger(snap.completed)||snap.items?.length!==225||snap.items.filter(r=>r.observedStatus==="completed").length!==snap.completed)error("CATALOG_UNVERIFIED");
        const seen=new Set();
        for(const item of snap.items){C.key(context,item.exerciseId);if(seen.has(item.exerciseId)||!["completed","unsubmitted"].includes(item.observedStatus))error("CATALOG_UNVERIFIED");seen.add(item.exerciseId);}
        topTargets.set(sender.tab.id,{documentId:sender.documentId});
        const directory={context,snapshot:snap};directories.set(sender.tab.id,directory);diagnostics.delete(sender.tab.id);
        state.catalog[context.scopeKey]=snap.items;
        state.lastDirectory={scopeKey:context.scopeKey,completed:snap.completed,total:snap.total,at:Date.now(),source:"welearn-directory"};
        const run=state.run;
        if(run?.engine==="extension-directory-v1"&&run.scopeKey===context.scopeKey&&run.tabId===sender.tab.id){
            const recoveryKey=run.exerciseId&&C.key(context,run.exerciseId),recoveryRow=state.ledger[recoveryKey];
            const recoveryItem=snap.items.find(r=>r.exerciseId===run.exerciseId);
            if(run.status==="paused"&&recoveryRow?.clickCount===1&&C.UNCERTAIN.has(recoveryRow.status)&&recoveryItem?.observedStatus==="completed"){
                recoveryRow.status="existing_completed";recoveryRow.observedStatus="completed";recoveryRow.error=null;
                recoveryRow.result ||= {source:"welearn-directory",kind:recoveryItem.score===null?"ungraded":"graded",accuracy:recoveryItem.score,correct:null,total:null};
                recoveryRow.recoveredFromDirectoryAt=Date.now();event("RECOVERED_COMPLETED_NO_REPLAY",run.exerciseId);
            }
            if(run.status==="waiting_directory"){
                const k=C.key(context,run.exerciseId),item=snap.items.find(r=>r.exerciseId===run.exerciseId);
                state.ledger[k]=C.confirmDirectory(state.ledger[k],item,snap.completed,run.baseline);
                const row=state.ledger[k];row.execution.directoryAt=Date.now();run.done++;
                if(row.pilot&&row.nativeSubmitFinished&&row.clickCount===1&&Number.isFinite(row.result.accuracy)){
                    state.liveEvidence ||= {};
                    state.liveEvidence[context.scopeKey]={navigation:{passed:true,source:"extension-directory-entry-and-return",exerciseId:row.exerciseId,at:Date.now()},submission:{passed:true,source:"extension-native-submit",exerciseId:row.exerciseId,at:Date.now()},resultPersistence:{passed:true,source:"native-grade-and-course-directory",exerciseId:row.exerciseId,at:Date.now()}};
                }
                event("EXTENSION_DIRECTORY_CONFIRMED",run.exerciseId);await persist();await directoryNext(directory);
            }else if(run.status==="returning_skip"){await directoryNext(directory);}
        }
        await persist();return {ok:true};
    }
    if(message.kind==="WL_TOP_CHECK"){
        if(!trustedTop(sender)||state.run?.id!==message.runId||state.run.topLease!==sender.documentId)error("PAGE_CHANGED");
        const valid=message.action==="WL_DIRECTORY_ENTER"?state.run.status==="waiting_navigation"&&state.run.pendingNext===message.next:["waiting_directory","returning_skip"].includes(state.run.status);
        if(!valid)error("PAUSED");await foreground(sender.tab.id);return {ok:true};
    }
    if(message.kind==="WL_NATIVE_RETURN"){
        if(!trustedTop(sender)||state.run?.id!==message.runId||state.run.topLease!==sender.documentId||!["waiting_directory","returning_skip"].includes(state.run.status))error("PAGE_CHANGED");
        await foreground(sender.tab.id);
        // Execute the platform's ordinary navigation in its own JS world.
        const result=await chrome.scripting.executeScript({target:{tabId:sender.tab.id,documentIds:[sender.documentId]},world:"MAIN",func:()=>{
            if(typeof window.ReturnMain!=="function")return false;
            window.ReturnMain();return true;
        }});
        if(result[0]?.result!==true)error("PAGE_CHANGED");
        return {ok:true};
    }
    if(message.kind==="WL_TOP_ERROR"){
        if(!trustedTop(sender)||!state.run||state.run.tabId!==sender.tab.id||(message.runId&&state.run.id!==message.runId))error("PAGE_CHANGED");
        state=C.recover(state);state.run.lastError=message.code in C.ERROR_LABELS?message.code:"PAGE_CHANGED";event(state.run.lastError);await persist();return {ok:true};
    }
    if(message.kind==="WL_DIAGNOSTIC") {
        if(sender.id!==chrome.runtime.id||!sender.tab?.id)error("INVALID_MESSAGE");
        const u=new URL(sender.url);
        if(!["welearn.sflep.com","centercourseware.sflep.com"].includes(u.hostname))error("INVALID_MESSAGE");
        diagnostics.set(sender.tab.id,{...diagnostics.get(sender.tab.id),code:message.code in C.ERROR_LABELS?message.code:"PAGE_CHANGED",stage:String(message.stage||"").slice(0,60),host:u.hostname,path:u.pathname.slice(0,200)});
        await chrome.storage.local.set({uiRevision:Date.now()});
        return {ok:true};
    }
    if(message.kind==="WL_OBSERVE") {
        if(!trustedFrame(sender)) error("PAGE_CHANGED");
        const context=await contextFor(sender);
        const snap=message.snapshot;
        if(!snap || snap.exerciseId!==context.currentSco || !Array.isArray(snap.questions) || snap.questions.length>100) error("PAGE_CHANGED");
        C.key(context,snap.exerciseId);
        if(snap.questions.some(q=>!/^[-\w:|]{1,100}$/.test(q.id || ""))) error("FIELD_ID_INVALID");
        const route=new URL(sender.url);route.search="";route.searchParams.set("sco",snap.exerciseId);
        targets.set(sender.tab.id,{context,snapshot:snap,route:route.href,frameId:sender.frameId,documentId:sender.documentId});
        diagnostics.delete(sender.tab.id);
        state.catalog[context.scopeKey]=(state.catalog[context.scopeKey]?.length?state.catalog[context.scopeKey]:snap.catalog || []).slice(0,225).map(item=>{
            const prior=(state.catalog[context.scopeKey] || []).find(p=>p.exerciseId===item.exerciseId);
            return {...item,exerciseId:item.exerciseId,title:String(item.title || item.exerciseId).slice(0,150),observedStatus:item.exerciseId===snap.exerciseId ? snap.observedStatus : prior?.observedStatus || "unknown"};
        });
        const k=C.key(context,snap.exerciseId);
        let row=state.ledger[k] || {scopeKey:context.scopeKey,exerciseId:snap.exerciseId,title:snap.title,status:"discovered",clickCount:0,total:snap.questions.length,matched:0};
        row.observedStatus=snap.observedStatus;
        row=C.observeResult(row,snap,sender.documentId);
        if(row.status==="completed"&&row.pilot&&row.nativeSubmitFinished&&row.result?.correct!==null&&row.result?.total>0&&state.run?.engine!=="extension-directory-v1") {
            state.liveEvidence ||= {};
            state.liveEvidence[context.scopeKey]={submission:{passed:true,source:"live-native-submit-and-grade",exerciseId:row.exerciseId,at:Date.now()},resultPersistence:{passed:true,source:"fresh-document-system-result",exerciseId:row.exerciseId,at:Date.now()}};
        }
        if(row.observedStatus==="submitted_unknown" && !["completed","existing_completed"].includes(row.status)) {row.status="uncertain";row.error="UNCERTAIN_SUBMIT";}
        state.ledger[k]=row;
        const target=targets.get(sender.tab.id);
        if(state.run?.status==="stopped"){await persist();return {context,settings:state.settings};}
        if(state.run?.scopeKey===context.scopeKey && state.run.pendingNext===snap.exerciseId && state.run.status==="waiting_navigation") {
            try{
                if(state.run.engine==="extension-directory-v1"){
                    if(!snap.questions.length&&snap.loaded===false)return {context,settings:state.settings};
                    state.run.lease={tabId:context.tabId,frameId:sender.frameId,documentId:sender.documentId};
                    const consent=state.consent;
                    if(!context.identityHash)error("UNKNOWN_IDENTITY");
                    if(consent.identityHash&&consent.identityHash!==context.identityHash)error("UNAUTHORIZED");
                    if(!consent.identityHash){consent.identityHash=context.identityHash;state.authorization={...C.authorize(consent,context,Date.now()),pilot:consent.trial};}
                    if(!state.authorization||state.authorization.identityHash!==context.identityHash)error("UNAUTHORIZED");
                    if(snap.emptyConfirmed&&snap.loaded===true&&!snap.questions.length){
                        state.run.status="waiting_empty";state.run.emptyDueAt=Date.now()+10000;state.run.deadlineAt=state.run.emptyDueAt+35000;
                        row.emptyEvidence={loaded:true,confirmedAt:Date.now(),dueAt:state.run.emptyDueAt};event("EMPTY_COUNTDOWN_STARTED",row.exerciseId);await persist();
                    }else{
                        const unsupported=!snap.questions.length||snap.questions.some(q=>q.type.startsWith("unsupported:"));
                        if(unsupported&&state.settings.skipUnsupported){row.status="skipped";row.error="UNSUPPORTED_TYPE";state.run.skipped.push(row.exerciseId);event("UNSUPPORTED_SKIPPED",row.exerciseId);await returnForReconciliation(target,true);}
                        else await begin(target,context,false,state.run.queue);
                    }
                }else await begin(target,context,false,state.run.queue);
            }catch(e){
                if(state.run.engine==="extension-directory-v1"&&["NO_CANDIDATE","UNVERIFIED_TYPE","DRAFT_CONFLICT","FIELD_ID_INVALID"].includes(e.code)){
                    row.status="pending";row.error=e.code;state.run.skipped.push(row.exerciseId);event("PENDING_SKIPPED",row.exerciseId);await returnForReconciliation(target,true);
                }else{state.run.status="paused";row.error=e.code || "PAGE_CHANGED";event(row.error,row.exerciseId);await persist();}
            }
        }else if(state.run?.status==="waiting_empty"&&sameLease(sender)&&snap.questions.length){
            state.run.status="paused";state.run.lastError="EMPTY_REVOKED";event("EMPTY_REVOKED",row.exerciseId);await persist();
        }else if(state.run?.engine==="extension-directory-v1"&&state.run.scopeKey===context.scopeKey&&state.run.exerciseId===snap.exerciseId&&row.status==="graded"&&row.clickCount===1&&row.nativeSubmitFinished&&["running","waiting_result"].includes(state.run.status)){
            row.execution.resultAt=Date.now();event("EXTENSION_NATIVE_RESULT",row.exerciseId);await returnForReconciliation(target);
        }else if(state.run?.engine!=="extension-directory-v1"&&state.run?.scopeKey===context.scopeKey && state.run.exerciseId===snap.exerciseId && row.status==="graded" && !row.refreshRequested) {
            row.refreshRequested=true;state.run.status="waiting_result";event("WAIT_FRESH_RESULT",row.exerciseId);await persist();
        }else if(state.run?.scopeKey===context.scopeKey && state.run.exerciseId===snap.exerciseId && row.status==="completed" && state.run.status==="waiting_result") {
            await advance(target);
        }else if(state.run?.scopeKey===context.scopeKey && state.run.lease.documentId!==sender.documentId && !["completed","existing_completed"].includes(row.status)) state.run.status="paused";
        await persist();
        return {context,settings:state.settings,emptyDueAt:state.run?.status==="waiting_empty"&&sameLease(sender)?state.run.emptyDueAt:null};
    }
    if(message.kind==="WL_EMPTY_ELAPSED"){
        if(!trustedFrame(sender)||!sameLease(sender)||state.run?.status!=="waiting_empty"||message.exerciseId!==state.run.exerciseId||Date.now()<state.run.emptyDueAt||message.emptyConfirmed!==true)error("PAGE_CHANGED");
        await foreground(sender.tab.id);
        const target=targets.get(sender.tab.id),row=state.ledger[C.key(target.context,state.run.exerciseId)];
        if(!target.snapshot.emptyConfirmed||target.snapshot.loaded!==true)error("EMPTY_REVOKED");
        row.status="skipped";row.error="NO_EXERCISE";state.run.skipped.push(row.exerciseId);event("NO_EXERCISE_SKIPPED",row.exerciseId);await returnForReconciliation(target,true);return {ok:true};
    }
    if(message.kind==="WL_GET_CONTEXT") {
        if(!trustedFrame(sender)) error("PAGE_CHANGED");
        return await contextFor(sender);
    }
    if(message.kind==="WL_PULSE") {
        if(!trustedFrame(sender) || !sameLease(sender) || state.run?.status!=="running" || state.run.id!==message.runId) error("PAUSED");
        await foreground(sender.tab.id);
        return {ok:true};
    }
    if(message.kind==="WL_NAV_CHECK") {
        if(!trustedFrame(sender)||!sameLease(sender)||state.run.status!=="waiting_navigation"||state.run.pendingNext!==message.next||state.run.id!==message.runId)error("PAGE_CHANGED");
        return {ok:true};
    }
    if(message.kind==="WL_OFFLINE") {
        if(!trustedFrame(sender)||!sameLease(sender))error("PAGE_CHANGED");
        state=C.recover(state);event("OFFLINE",state.run?.exerciseId);await persist();return {ok:true};
    }
    if(message.kind==="WL_NATIVE_CONFIRMED") {
        if(!trustedFrame(sender)||!sameLease(sender)||state.run?.id!==message.runId)error("PAGE_CHANGED");
        const row=state.ledger[C.key(targets.get(sender.tab.id).context,state.run.exerciseId)];
        if(!["awaiting_result","graded"].includes(row.status)||row.clickCount!==1)error("UNCERTAIN_SUBMIT");
        row.nativeConfirmed=message.confirmed===true;row.nativeSubmitFinished=true;
        if(row.status==="graded"&&state.run.engine==="extension-directory-v1"){row.execution.resultAt=Date.now();await returnForReconciliation(targets.get(sender.tab.id));}
        else await persist();return {ok:true};
    }
    if(message.kind==="WL_PROGRESS" || message.kind==="WL_FINISHED" || message.kind==="WL_ERROR" || message.kind==="WL_CONSUME") {
        if(!trustedFrame(sender) || !sameLease(sender) || state.run?.id!==message.runId) error("PAGE_CHANGED");
        const target=targets.get(sender.tab.id), k=C.key(target.context,state.run.exerciseId), row=state.ledger[k];
        if(message.kind==="WL_ERROR") {
            if(!C.UNCERTAIN.has(row.status)) row.status="paused";
            row.error=message.code in C.ERROR_LABELS ? message.code : "PAGE_CHANGED";
            if(message.details){const d=message.details;row.failureDetails={fieldId:String(d.fieldId||"").slice(0,100),type:String(d.type||"").slice(0,30),expectedLength:d.expectedLength,actualLength:d.actualLength,candidateChanged:d.candidateChanged===true,expectedOption:d.expectedOption,actualOption:d.actualOption};}
            if(state.run.engine==="extension-directory-v1"&&row.clickCount===0&&!C.UNCERTAIN.has(row.status)&&["READBACK_FAILED","READ_ONLY_FIELD"].includes(row.error)){
                row.status="pending";state.run.skipped.push(row.exerciseId);event("INPUT_PENDING_SKIPPED",row.exerciseId);await returnForReconciliation(target,true);return {ok:true};
            }
            if(state.run.status!=="stopped")state.run.status="paused";event(row.error,row.exerciseId);await persist();return {ok:true};
        }
        if(state.run.status!=="running") error("PAUSED");
        if(message.kind==="WL_PROGRESS") {
            if(row.status!=="filling")error("UNCERTAIN_SUBMIT");
            const allowed=state.run.fieldIds;
            if(!allowed.includes(message.result?.id) || message.result.matched!==true) error("READBACK_FAILED");
            row.fieldResults ||= {};
            row.fieldResults[message.result.id]={type:message.result.type,matched:true,ms:message.result.ms,wrote:message.result.wrote===true};
            row.matched=Object.keys(row.fieldResults).length;
            if(row.matched===state.run.fieldIds.length)state.run.stage="verifying";
            await persist();return {ok:true};
        }
        if(message.kind==="WL_CONSUME") {
            if(row.status!=="reserved" || row.nonce!==message.nonce || row.clickCount!==0) error("UNCERTAIN_SUBMIT");
            row.status="awaiting_result";row.clickCount=1;
            state.run.stage="awaiting_grade";
            row.execution ||= {};row.execution.submittedAt=Date.now();state.authorization.used++;event("EXTENSION_SUBMIT_CONSUMED",row.exerciseId);await persist();return {ok:true};
        }
        if(row.status!=="filling")error("UNCERTAIN_SUBMIT");
        if(row.matched!==state.run.fieldIds.length) error("READBACK_FAILED");
        if(state.run.mode==="calibrate") {
            for(const type of ["text","choice","reference"]) {
                const wrote=Object.values(row.fieldResults).filter(r=>r.type===type && r.wrote);
                if(wrote.length) state.inputEvidence[target.context.scopeKey+":"+type]={passed:true,at:Date.now(),source:"live-readback",exerciseId:row.exerciseId,count:wrote.length};
            }
            row.status="paused";row.error=null;state.run.status="paused";
            event("CALIBRATION_READBACK",row.exerciseId);await persist();return {ok:true};
        }
        row.status="verified";row.error=null;
        state.run.stage="submitting";
        row.execution ||= {};row.execution.verifiedAt=Date.now();
        if(state.authorization?.pilot){
            for(const type of ["text","choice","reference"]){
                const wrote=Object.values(row.fieldResults).filter(r=>r.type===type&&r.wrote);
                if(wrote.length)state.inputEvidence[target.context.scopeKey+":"+type]={passed:true,at:Date.now(),source:"extension-live-readback",exerciseId:row.exerciseId,count:wrote.length};
            }
        }
        if(!state.authorization?.exerciseIds.includes(row.exerciseId)) {state.run.status="paused";event("FILLED_NO_SUBMIT",row.exerciseId);await persist();return {ok:true};}
        const live=state.liveEvidence?.[target.context.scopeKey];
        C.submitAllowed(state,target.context,row,{...WeLearnCapabilities,submission:live?.submission||WeLearnCapabilities.submission,resultPersistence:live?.resultPersistence||WeLearnCapabilities.resultPersistence},Date.now());
        row.nonce=crypto.randomUUID();row.status="reserved";row.submitEpoch=sender.documentId;row.pilot=state.authorization?.pilot===true;
        event("SUBMIT_RESERVED",row.exerciseId);await persist();
        dispatch(target,{kind:"WL_SUBMIT",runId:state.run.id,exerciseId:row.exerciseId,nonce:row.nonce});
        return {ok:true};
    }
    if(!trustedUi(sender)) error("INVALID_MESSAGE");
    if(message.kind==="WL_STATE") return publicState(message.tabId);
    if(message.kind==="WL_ACCEPT_BATCH"){
        const directory=directories.get(message.tabId);if(!directory)error("CATALOG_UNVERIFIED");
        const live=state.liveEvidence?.[directory.context.scopeKey];
        if(!live?.submission?.passed||!live?.resultPersistence?.passed||!live?.navigation?.passed)error("PENDING_VALIDATION");
        if(state.run&&!["paused","completed","stopped"].includes(state.run.status))error("ALREADY_RUNNING");
        const ids=["m-1-1-8","m-1-2-9","m-1-2-10"];
        if(ids.some(id=>!directory.snapshot.items.some(r=>r.exerciseId===id&&r.observedStatus==="unsubmitted")))error("UNAUTHORIZED");
        state.settings={...state.settings,configured:true,batch:true,batchSize:2,skipUnsupported:true};
        state.consent={scopeKey:directory.context.scopeKey,identityHash:null,exerciseIds:ids,limit:2,trial:false,grantedAt:Date.now()};
        state.authorization=null;event("TWO_ITEM_ACCEPTANCE_AUTHORIZED");await persist();
        return await handle({kind:"WL_START",tabId:message.tabId},sender);
    }
    if(message.kind==="WL_RESCAN") {
        const tab=await chrome.tabs.get(message.tabId);
        const u=new URL(tab.url);
        if(u.hostname!=="welearn.sflep.com"||!["/student/studycourse.aspx","/student/course_info.aspx"].includes(u.pathname.toLowerCase())||u.searchParams.get("cid")!=="2850")error("TAB_NOT_COURSE");
        if(u.pathname.toLowerCase()==="/student/course_info.aspx"){
            try{await deadline(chrome.tabs.sendMessage(message.tabId,{kind:"WL_SCAN"},{frameId:0}));}
            catch{await deadline(chrome.scripting.executeScript({target:{tabId:message.tabId,allFrames:true},files:["core.js","legacy-adapter.js","dom-adapter.js","catalog-adapter.js","content.js"]}));}
            return {ok:true};
        }
        try {
            const report=await deadline(chrome.tabs.sendMessage(message.tabId,{kind:"WL_TOP_DIAGNOSTIC"},{frameId:0}));
            if(!targets.get(message.tabId))diagnostics.set(message.tabId,{code:"CONTENT_NOT_LOADED",stage:report?.frames?.length?"iframe-not-connected":"course-frame-missing",...report});
        }catch{diagnostics.set(message.tabId,{code:"CONTENT_NOT_LOADED",stage:"content-script-not-loaded"});}
        if(!targets.get(message.tabId)) {
            try{await deadline(chrome.scripting.executeScript({target:{tabId:message.tabId,allFrames:true},files:["core.js","legacy-adapter.js","dom-adapter.js","catalog-adapter.js","content.js"]}));}
            catch{diagnostics.set(message.tabId,{code:"CONTENT_NOT_LOADED",stage:"site-permission-or-frame-access"});}
            try {
                const probes=await deadline(chrome.scripting.executeScript({target:{tabId:message.tabId,allFrames:true},func:()=>({
                    host:location.hostname,path:location.pathname,core:Boolean(globalThis.WeLearnCore),legacy:Boolean(globalThis.WeLearnLegacy),adapter:Boolean(globalThis.WeLearnDom),booted:Boolean(globalThis.__weLearnPracticeBooted),
                    pageIds:[...document.querySelectorAll('[data-controltype="page"][data-scoid]')].map(n=>n.dataset.scoid).slice(0,50)
                })}));
                const prior=diagnostics.get(message.tabId)||{code:"CONTENT_NOT_LOADED",stage:"iframe-not-connected"};
                diagnostics.set(message.tabId,{...prior,frames:probes.map(p=>p.result)});
            }catch{}
        }
        chrome.tabs.sendMessage(message.tabId,{kind:"WL_SCAN"}).catch(()=>{});
        return {ok:true};
    }
    if(message.kind==="WL_SETTINGS") {state.settings=C.settings(message.settings);await persist();return {ok:true};}
    if(message.kind==="WL_REVOKE") {state.authorization=null;state.consent=null;if(state.run)state.run.status="paused";await persist();return {ok:true};}
    if(message.kind==="WL_AUTHORIZE_SCOPE"){
        const directory=directories.get(message.tabId);if(!directory)error("CATALOG_UNVERIFIED");
        if(state.run&&!["paused","completed","stopped"].includes(state.run.status))error("ALREADY_RUNNING");
        const input=message.authorization,ids=[...new Set(input?.exerciseIds || [])],live=state.liveEvidence?.[directory.context.scopeKey];
        if(!ids.length||ids.some(id=>!directory.snapshot.items.some(r=>r.exerciseId===id&&r.observedStatus==="unsubmitted")))error("UNAUTHORIZED");
        const validated=live?.submission?.passed&&live?.resultPersistence?.passed&&live?.navigation?.passed;
        if(!Number.isInteger(input.limit)||input.limit<1||input.limit>ids.length||(!validated&&(input.limit!==1||ids.length!==1)))error("PENDING_VALIDATION");
        const trial=ids.length===1&&input.limit===1;
        state.consent={scopeKey:directory.context.scopeKey,identityHash:null,exerciseIds:ids,limit:input.limit,trial,grantedAt:Date.now()};
        state.authorization=null;event("DIRECTORY_SCOPE_AUTHORIZED");await persist();return {ok:true};
    }
    if(message.kind==="WL_AUTHORIZE") {
        if(state.run&&!["paused","completed","stopped"].includes(state.run.status))error("ALREADY_RUNNING");
        const target=targets.get(message.tabId);if(!target)error("PAGE_CHANGED");
        const live=state.liveEvidence?.[target.context.scopeKey];
        if(!(live?.submission?.passed||WeLearnCapabilities.submission.passed) || !(live?.resultPersistence?.passed||WeLearnCapabilities.resultPersistence.passed)) error("PENDING_VALIDATION");
        const discovered=state.catalog[target.context.scopeKey] || [];
        if(message.authorization.exerciseIds.some(id=>!discovered.some(r=>r.exerciseId===id&&r.observedStatus==="unsubmitted")))error("UNAUTHORIZED");
        state.authorization=C.authorize(message.authorization,target.context,Date.now());
        if(discovered.length===225){
            state.consent={scopeKey:target.context.scopeKey,identityHash:target.context.identityHash,exerciseIds:state.authorization.exerciseIds,limit:state.authorization.limit,trial:false,grantedAt:Date.now()};
        }
        event("LESSON_SCOPE_AUTHORIZED");await persist();return {ok:true};
    }
    if(message.kind==="WL_AUTHORIZE_PILOT") {
        const target=targets.get(message.tabId);if(!target)error("PAGE_CHANGED");
        const context=await contextFor({id:chrome.runtime.id,tab:{id:message.tabId},url:target.route,documentId:target.documentId});
        const evidence=Object.fromEntries(["choice","text","reference"].map(type=>[type,state.inputEvidence[context.scopeKey+":"+type]]));
        C.fillAllowed(target.snapshot,evidence,false,{replaceDrafts:message.replaceDrafts===true});
        const row=state.ledger[C.key(context,target.snapshot.exerciseId)];
        if(row.clickCount>0||C.UNCERTAIN.has(row.status))error("UNCERTAIN_SUBMIT");
        state.authorization={...C.authorize({exerciseIds:[target.snapshot.exerciseId],limit:1},context,Date.now()),pilot:true,replaceDrafts:message.replaceDrafts===true};
        event("ONE_EXERCISE_PILOT_AUTHORIZED",target.snapshot.exerciseId);await persist();return {ok:true};
    }
    if(message.kind==="WL_PAUSE") {if(state.run)state.run.status="paused";event("PAUSED");await persist();return {ok:true};}
    if(message.kind==="WL_STOP"){if(state.run){state.run.status="stopped";state.run.deadlineAt=null;}event("STOPPED");await persist();return {ok:true};}
    if(message.kind==="WL_START" || message.kind==="WL_CALIBRATE") {
        if(!state.settings.configured)error("NOT_CONFIGURED");
        if(["running","waiting_navigation","waiting_result","waiting_directory","returning_skip","waiting_empty"].includes(state.run?.status))error(state.run.lease.tabId===message.tabId?"ALREADY_RUNNING":"OTHER_TAB");
        const directory=directories.get(message.tabId);
        if(directory&&message.kind==="WL_START"){
            if(state.run&&!["paused","completed","stopped"].includes(state.run.status))error("ALREADY_RUNNING");
            const context=await contextFor({id:chrome.runtime.id,tab:{id:message.tabId}}),consent=state.consent;
            if(!consent||consent.scopeKey!==context.scopeKey)error("AUTH_REQUIRED");
            if(state.run?.engine==="extension-directory-v1"&&state.run.scopeKey===context.scopeKey&&C.UNCERTAIN.has(state.ledger[C.key(context,state.run.exerciseId)]?.status))error("UNCERTAIN_SUBMIT");
            if(state.authorization&&state.authorization.used>=state.authorization.limit)error("AUTH_QUOTA_EXHAUSTED");
            await activateForLaunch(context);
            const skipped=state.run?.engine==="extension-directory-v1"&&state.run.status==="paused"&&state.run.scopeKey===context.scopeKey&&consent.grantedAt<=state.run.startedAt?state.run.skipped.filter(id=>consent.exerciseIds.includes(id)):[];
            state.run={id:crypto.randomUUID(),engine:"extension-directory-v1",status:"paused",scopeKey:context.scopeKey,tabId:message.tabId,done:0,batchNo:1,batchStartDone:0,initialProgress:directory.snapshot.completed,limit:Math.min(state.settings.batch?state.settings.batchSize||1:1,consent.limit-(state.authorization?.used||0)),skipped,startedAt:Date.now(),lease:{tabId:message.tabId},topLease:topTargets.get(message.tabId)?.documentId};
            await directoryNext(directory);return {ok:true};
        }
        const target=targets.get(message.tabId);if(!target)error("PAGE_CHANGED");
        const context=await contextFor({id:chrome.runtime.id,tab:{id:message.tabId},url:target.route});
        if(context.scopeKey!==target.context.scopeKey || context.currentSco!==target.snapshot.exerciseId) error("PAGE_CHANGED");
        await activateForLaunch(context);
        const row=state.ledger[C.key(context,target.snapshot.exerciseId)];
        if(message.kind==="WL_START"&&state.run?.engine==="extension-directory-v1"&&state.run.exerciseId===row.exerciseId&&row.clickCount===1&&row.result&&target.snapshot.observedStatus==="completed"){
            state.run.tabId=context.tabId;state.run.lease={tabId:context.tabId,frameId:target.frameId,documentId:target.documentId};
            event("RESUME_RESULT_NO_SUBMIT",row.exerciseId);await returnForReconciliation(target);return {ok:true};
        }
        if(message.kind==="WL_START"&&state.consent){
            const consent=state.consent,snap=target.snapshot;
            const safeEmpty=snap.emptyConfirmed===true&&snap.loaded===true&&!snap.questions.length;
            // A previously identified unsupported lesson may have no ordinary Submit
            // control. Permit only returning to the catalog, never filling/submitting.
            const safeUnsupported=state.settings.skipUnsupported&&snap.loaded===true&&!snap.questions.length&&!snap.emptyConfirmed&&
                snap.observedStatus==="unknown"&&row.status==="skipped"&&row.error==="UNSUPPORTED_TYPE"&&row.clickCount===0;
            if(consent.scopeKey!==context.scopeKey)error("UNAUTHORIZED");
            if(!context.identityHash)error("UNKNOWN_IDENTITY");
            if(consent.identityHash&&consent.identityHash!==context.identityHash)error("UNAUTHORIZED");
            const previousRow=state.run?.scopeKey===context.scopeKey&&state.run.exerciseId&&state.ledger[C.key(context,state.run.exerciseId)];
            if(C.UNCERTAIN.has(row.status)||C.UNCERTAIN.has(previousRow?.status))error("UNCERTAIN_SUBMIT");
            if(!["completed","unsubmitted"].includes(snap.observedStatus)&&!safeEmpty&&!safeUnsupported)error("UNKNOWN_STATUS");
            if(!topTargets.has(message.tabId)||(!snap.questions.length&&snap.loaded===false))error("CONTENT_NOT_LOADED");
            if(state.authorization&&(state.authorization.scopeKey!==context.scopeKey||state.authorization.identityHash!==context.identityHash))error("UNAUTHORIZED");
            const used=state.authorization?.used||0;
            if(used>=consent.limit)error("AUTH_QUOTA_EXHAUSTED");
            let pendingCode=safeUnsupported?"UNSUPPORTED_TYPE":null;
            if(consent.exerciseIds.includes(row.exerciseId)&&snap.observedStatus==="unsubmitted"&&!(snap.emptyConfirmed&&snap.loaded===true&&!snap.questions.length)){
                const evidence=Object.fromEntries(["choice","text","reference"].map(type=>[type,state.inputEvidence[context.scopeKey+":"+type]]));
                try{C.fillAllowed(snap,evidence,consent.trial===true,state.settings);}
                catch(e){
                    if(!["NO_CANDIDATE","UNVERIFIED_TYPE","DRAFT_CONFLICT","FIELD_ID_INVALID"].includes(e.code)&&!(e.code==="UNSUPPORTED_TYPE"&&state.settings.skipUnsupported))throw e;
                    pendingCode=e.code;
                }
            }
            const skipped=state.run?.engine==="extension-directory-v1"&&state.run.status==="paused"&&state.run.scopeKey===context.scopeKey&&consent.grantedAt<=state.run.startedAt?state.run.skipped.filter(id=>consent.exerciseIds.includes(id)):[];
            state.run={id:crypto.randomUUID(),engine:"extension-directory-v1",status:"paused",scopeKey:context.scopeKey,tabId:message.tabId,exerciseId:row.exerciseId,
                done:0,batchNo:1,batchStartDone:0,initialProgress:state.lastDirectory?.scopeKey===context.scopeKey?state.lastDirectory.completed:null,limit:Math.min(state.settings.batch?state.settings.batchSize||1:1,consent.limit-used),skipped,startedAt:Date.now(),
                lease:{tabId:message.tabId,frameId:target.frameId,documentId:target.documentId},topLease:topTargets.get(message.tabId).documentId};
            if(safeEmpty){
                state.run.status="waiting_empty";state.run.emptyDueAt=Date.now()+10000;state.run.deadlineAt=state.run.emptyDueAt+35000;
                row.emptyEvidence={loaded:true,confirmedAt:Date.now(),dueAt:state.run.emptyDueAt};event("EMPTY_COUNTDOWN_STARTED",row.exerciseId);await persist();
                dispatch(target,{kind:"WL_SCAN"});return {ok:true};
            }
            if(pendingCode){row.status=pendingCode==="UNSUPPORTED_TYPE"?"skipped":"pending";row.error=pendingCode;state.run.skipped.push(row.exerciseId);event("PENDING_SKIPPED",row.exerciseId);}
            // Re-read the native catalog before choosing or submitting any item.
            event("EXERCISE_START_RETURN_TO_DIRECTORY",row.exerciseId);await returnForReconciliation(target,true);return {ok:true};
        }
        const calibration=message.kind==="WL_CALIBRATE";
        await begin(target,context,calibration);
        return {ok:true};
    }
    error("INVALID_MESSAGE");
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    const uiLaunch=message?.kind==="WL_UI_LAUNCH"&&trustedUi(sender)&&["WL_START","WL_CALIBRATE","WL_ACCEPT_BATCH"].includes(message.command);
    const effective=uiLaunch?{kind:message.command,tabId:message.tabId}:message;
    enqueue(async()=>{
        try{if(uiLaunch){event("UI_LAUNCH_ACCEPTED");await persist();}return await handle(effective,sender);}catch(e){
            if(trustedUi(sender)&&["WL_START","WL_CALIBRATE","WL_ACCEPT_BATCH"].includes(effective.kind)){
                diagnostics.set(effective.tabId,{code:e.code||"PAGE_CHANGED",stage:"launch"});
                await chrome.storage.local.set({uiRevision:Date.now()});
            }
            if(e.code!=="UNCERTAIN_SUBMIT"&&state.run&&state.run.status!=="stopped"&&message.runId===state.run.id&&(trustedFrame(sender)||trustedTop(sender))){
                state.run.status="paused";event(e.code || "PAGE_CHANGED",state.run.exerciseId);await persist();
            }
            throw e;
        }
    }).then(data=>{if(!uiLaunch)respond({ok:true,data});}).catch(e=>{if(!uiLaunch)respond({ok:false,code:e.code || "PAGE_CHANGED",error:C.ERROR_LABELS[e.code] || "页面处理失败，任务已暂停"});});
    if(uiLaunch)respond({ok:true,data:{accepted:true}});
    return !uiLaunch;
});
chrome.runtime.onStartup.addListener(()=>enqueue(async()=>{state=C.recover(state);state.browserStartupAt=Date.now();event("BROWSER_STARTUP");await persist();}));
chrome.alarms?.onAlarm.addListener(alarm=>{
    if(alarm.name==="practice-deadline")enqueue(async()=>{
            if(state.run?.deadlineAt&&state.run.deadlineAt<=Date.now()&&!["paused","completed","stopped"].includes(state.run.status)){state=C.recover(state);state.run.lastError="ENGINE_TIMEOUT";event("ENGINE_TIMEOUT",state.run.exerciseId);await persist();}
    });
});
chrome.tabs.onRemoved.addListener(tabId=>enqueue(async()=>{
    targets.delete(tabId);directories.delete(tabId);topTargets.delete(tabId);if(state.run?.lease.tabId===tabId){state=C.recover(state);await persist();}
}));
chrome.tabs.onUpdated.addListener((tabId,change)=>{
    if(change.status==="loading"||change.url)enqueue(async()=>{
        // Events wait behind asynchronous message processing. An old directory URL
        // must not invalidate the newer, already active study document.
        const liveTab=await chrome.tabs.get(tabId).catch(()=>null);
        if(!liveTab)return;
        if((change.url&&change.url!==liveTab.url)||(!change.url&&change.status==="loading"&&liveTab.status==="complete"))return;
        let ended=false;
        if(change.url){try{const u=new URL(change.url);ended=u.hostname==="welearn.sflep.com"&&/course_info|login|logout/i.test(u.pathname);}catch{}}
        targets.delete(tabId);directories.delete(tabId);topTargets.delete(tabId);
        if(state.run?.lease.tabId===tabId&&state.run.status==="waiting_navigation"&&change.url&&/\/student\/studycourse\.aspx/i.test(change.url))state.run.enteredStudy=true;
        const unexpectedReturn=ended&&state.run?.status==="waiting_navigation"&&state.run.enteredStudy;
        const expected=!unexpectedReturn&&["waiting_result","waiting_navigation","waiting_directory","returning_skip"].includes(state.run?.status)&&!(/login|logout/i.test(change.url || ""));
        if(state.run?.lease.tabId===tabId && !expected&&! ["completed","stopped"].includes(state.run.status)){state=C.recover(state);if(ended){state.run.lastError="SESSION_ENDED";event("SESSION_ENDED",state.run.exerciseId);}await persist();}
    });
});

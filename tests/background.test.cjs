const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),{webcrypto}=require("node:crypto");
async function worker(){
    let stored={},listener,tabActive=true,windowFocused=true,allowFocus=true,tabUrl="https://welearn.sflep.com/student/StudyCourse.aspx?cid=2850&classid=fixture&sco=m-1-1-5";const commands=[],events={},focusCalls=[];
    const api={scripting:{executeScript:async()=>[{result:"b".repeat(64)}]},runtime:{id:"test-extension",getURL:p=>"chrome-extension://test-extension/"+p,onMessage:{addListener:f=>listener=f},onStartup:{addListener:f=>events.startup=f}},windows:{get:async()=>({focused:windowFocused,type:"normal"}),update:async(id)=>{focusCalls.push(id);if(allowFocus)windowFocused=true;}},
        storage:{local:{get:async()=>structuredClone(stored),set:async d=>{stored={...stored,...structuredClone(d)};},setAccessLevel:async()=>{}}},
        tabs:{get:async()=>({id:1,active:tabActive,windowId:1,url:tabUrl}),update:async()=>{tabActive=true;},query:async()=>[{id:1,url:tabUrl}],reload:async()=>{},sendMessage:async(id,m)=>{if(m.kind==="WL_IDENTITY")return {identityHash:"b".repeat(64)};commands.push(m);return {ok:true};},onRemoved:{addListener:f=>events.remove=f},onUpdated:{addListener:f=>events.update=f}}};
    const box=vm.createContext({chrome:api,crypto:webcrypto,TextEncoder,structuredClone,console,setTimeout,clearTimeout,URL});
    box.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(__dirname,"../extension",file),"utf8"),box));
    vm.runInContext(fs.readFileSync(path.join(__dirname,"../extension/background.js"),"utf8"),box);
    vm.runInContext('WeLearnCapabilities={version:"test",submission:{passed:true},resultPersistence:{passed:true},navigation:{passed:false}}',box);
    const ui={id:"test-extension",url:"chrome-extension://test-extension/popup.html"};
    const frame={id:"test-extension",tab:{id:1},frameId:2,documentId:"doc1",url:"https://centercourseware.sflep.com/New%20Era%20Academic%20English%20Graduate%20Students%201/unit_01/main5.html"};
    const call=(message,sender=ui)=>new Promise(resolve=>listener(message,sender,resolve));
    const snap={exerciseId:"m-1-1-5",title:"Ex. 1",observedStatus:"unsubmitted",result:null,questions:[{id:"q1",type:"text",hasCandidate:true,conflict:false},{id:"q2",type:"text",hasCandidate:true,conflict:false}],catalog:[{exerciseId:"m-1-1-5",title:"Ex. 1",observedStatus:"unsubmitted"}]};
    await call({kind:"WL_OBSERVE",snapshot:snap},frame);await call({kind:"WL_SETTINGS",settings:{delayMs:200,batch:false,replaceDrafts:false}});
    return {call,frame,ui,snap,commands,events,focusCalls,setFocus:(active,focused)=>{tabActive=active;windowFocused=focused;},denyFocus:()=>allowFocus=false,setUrl:url=>tabUrl=url,stored:()=>stored,
        flush:()=>vm.runInContext('serial',box),patchState:patch=>{box.testPatch=structuredClone(patch);vm.runInContext('Object.assign(state,testPatch)',box);}};
}
async function fill(w,kind="WL_CALIBRATE"){
    const start=await w.call({kind,tabId:1});assert.equal(start.ok,true);const runId=w.stored().practiceState.run.id;
    for(const id of ["q1","q2"]){assert.equal((await w.call({kind:"WL_PROGRESS",runId,result:{id,type:"text",matched:true,wrote:true,ms:20}},w.frame)).ok,true);}
    return runId;
}
test("serialized submission permit cannot be replayed",async()=>{
    const w=await worker();let runId=await fill(w);assert.equal((await w.call({kind:"WL_FINISHED",runId},w.frame)).ok,true);
    assert.equal((await w.call({kind:"WL_AUTHORIZE",tabId:1,authorization:{exerciseIds:["m-1-1-5"],limit:1}})).ok,true);
    runId=await fill(w,"WL_START");assert.equal((await w.call({kind:"WL_FINISHED",runId},w.frame)).ok,true);
    const submit=w.commands.find(c=>c.kind==="WL_SUBMIT");assert.ok(submit);
    assert.equal((await w.call({kind:"WL_FINISHED",runId},w.frame)).ok,false);
    const first=await w.call({kind:"WL_CONSUME",runId,nonce:submit.nonce},w.frame);assert.equal(first.ok,true);
    assert.equal((await w.call({kind:"WL_CONSUME",runId,nonce:submit.nonce},w.frame)).ok,false);
    assert.equal(w.commands.filter(c=>c.kind==="WL_SUBMIT").length,1);assert.equal(w.stored().practiceState.authorization.used,1);
});
test("stale document and pause deny any additional field progress",async()=>{
    const w=await worker(),runId=await fill(w);
    assert.equal((await w.call({kind:"WL_PROGRESS",runId,result:{id:"q1",matched:true}}, {...w.frame,documentId:"doc2"})).ok,false);
    await w.call({kind:"WL_PAUSE"});assert.equal((await w.call({kind:"WL_PULSE",runId},w.frame)).ok,false);
});
test("untrusted page cannot edit settings or authorization",async()=>{
    const w=await worker();assert.equal((await w.call({kind:"WL_SETTINGS",settings:{delayMs:200,batch:true}},w.frame)).ok,false);
    assert.equal((await w.call({kind:"WL_AUTHORIZE",tabId:1,authorization:{exerciseIds:["m-1-1-5"],limit:1}},w.frame)).ok,false);
});
test("browser startup recovers active task as paused",async()=>{
    const w=await worker();await fill(w);await w.events.startup();assert.equal(w.stored().practiceState.run.status,"paused");
});
test("double start cannot replace an in-flight run",async()=>{
    const w=await worker();await fill(w);const before=w.stored().practiceState.run.id;
    const next=await w.call({kind:"WL_CALIBRATE",tabId:1});assert.equal(next.ok,false);assert.equal(next.code,"ALREADY_RUNNING");assert.equal(w.stored().practiceState.run.id,before);
});
test("button launch hands focus back once; field checks never steal it back",async()=>{
    const w=await worker();w.setFocus(true,false);
    const start=await w.call({kind:"WL_CALIBRATE",tabId:1});assert.equal(start.ok,true);assert.equal(w.focusCalls.length,1);
    const runId=w.stored().practiceState.run.id;
    assert.equal((await w.call({kind:"WL_PULSE",runId},w.frame)).ok,true);
    w.setFocus(true,false);
    assert.equal((await w.call({kind:"WL_PULSE",runId},w.frame)).code,"NOT_FOREGROUND");assert.equal(w.focusCalls.length,1);
    assert.equal(w.stored().practiceState.run.focus.focused,false);assert.equal(w.stored().practiceState.run.status,"paused");
});
test("inactive course tab stops input even if its browser window is focused",async()=>{
    const w=await worker(),runId=await fill(w);w.setFocus(false,true);
    assert.equal((await w.call({kind:"WL_PULSE",runId},w.frame)).code,"NOT_FOREGROUND");
    assert.equal(w.stored().practiceState.run.focus.active,false);
});
test("failed focus handoff never dispatches a fill",async()=>{
    const w=await worker();w.setFocus(true,false);w.denyFocus();
    const reply=await w.call({kind:"WL_CALIBRATE",tabId:1});assert.equal(reply.code,"NOT_FOREGROUND");
    assert.equal(w.commands.some(m=>m.kind==="WL_FILL"),false);assert.equal(w.focusCalls.length,1);
});
test("successful explicit retry clears the previous foreground error",async()=>{
    const w=await worker(),runId=await fill(w);w.setFocus(true,false);
    await w.call({kind:"WL_PULSE",runId},w.frame);
    const retry=await fill(w);await w.call({kind:"WL_FINISHED",runId:retry},w.frame);
    assert.equal(w.stored().practiceState.run.status,"paused");assert.equal(w.stored().practiceState.run.lastError,null);
});
function directoryFixture(completed=9){
    return {completed,total:225,items:Array.from({length:225},(_,i)=>({exerciseId:"m-1-1-"+(i+1),title:"Ex. "+(i+1),observedStatus:i<completed?"completed":"unsubmitted",score:i<completed?100:null,eligible:true}))};
}
test("directory bootstrap is one authorized item and requires native grade plus directory",async()=>{
    const w=await worker(),url="https://welearn.sflep.com/student/course_info.aspx?cid=2850&classid=fixture";
    w.setUrl(url);let top={id:w.ui.id,tab:{id:1},frameId:0,documentId:"top-dir",url};
    assert.equal((await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture()},top)).ok,true);
    assert.equal((await w.call({kind:"WL_AUTHORIZE_SCOPE",tabId:1,authorization:{exerciseIds:["m-1-1-10","m-1-1-11"],limit:2}})).ok,false);
    assert.equal((await w.call({kind:"WL_AUTHORIZE_SCOPE",tabId:1,authorization:{exerciseIds:["m-1-1-10"],limit:1}})).ok,true);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,true);
    assert.equal(w.commands.at(-1).kind,"WL_DIRECTORY_ENTER");
    const runId=w.stored().practiceState.run.id;
    w.setUrl("https://welearn.sflep.com/student/StudyCourse.aspx?cid=2850&classid=fixture&sco=m-1-1-10");
    top={...top,url:"https://welearn.sflep.com/student/StudyCourse.aspx?cid=2850",documentId:"top-study"};
    await w.call({kind:"WL_TOP_READY"},top);
    const frame={...w.frame,url:"https://centercourseware.sflep.com/New%20Era%20Academic%20English%20Graduate%20Students%201/unit_01/main10.html?m-1-1-10"};
    const snapshot={...w.snap,exerciseId:"m-1-1-10"};
    assert.equal((await w.call({kind:"WL_OBSERVE",snapshot},frame)).ok,true);
    assert.equal(w.commands.at(-1).kind,"WL_FILL");
    for(const id of ["q1","q2"])await w.call({kind:"WL_PROGRESS",runId,result:{id,type:"text",matched:true,wrote:true,ms:10}},frame);
    assert.equal((await w.call({kind:"WL_FINISHED",runId},frame)).ok,true);
    const submit=w.commands.at(-1);assert.equal(submit.kind,"WL_SUBMIT");
    await w.call({kind:"WL_CONSUME",runId,nonce:submit.nonce},frame);
    const result={...snapshot,observedStatus:"completed",result:{source:"welearn-dom",accuracy:100,correct:2,total:2}};
    await w.call({kind:"WL_OBSERVE",snapshot:result},frame);
    assert.notEqual(w.commands.at(-1).kind,"WL_COURSE_RETURN","result/confirmation race must wait for native submit completion");
    await w.call({kind:"WL_NATIVE_CONFIRMED",runId,confirmed:true},frame);
    assert.equal(w.commands.at(-1).kind,"WL_COURSE_RETURN");
    w.setUrl(url);top={...top,url,documentId:"top-dir2"};
    assert.equal((await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(10)},top)).ok,true);
    const state=w.stored().practiceState,row=Object.values(state.ledger).find(r=>r.exerciseId==="m-1-1-10");
    assert.equal(row.status,"completed");assert.equal(row.execution.engine,"edge-extension");assert.equal(state.run.status,"completed");assert.equal(state.authorization.used,1);
    assert.equal(w.commands.filter(m=>m.kind==="WL_SUBMIT").length,1);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,false,"spent quota cannot replay on restart");
    await w.events.update(1,{url},{});
    assert.equal(w.stored().practiceState.run.status,"completed","normal navigation must not pause a completed run");
});

async function lessonConsent(ids,limit=ids.length){
    const w=await worker(),url="https://welearn.sflep.com/student/course_info.aspx?cid=2850&classid=fixture";
    w.setUrl(url);
    const top={id:w.ui.id,tab:{id:1},frameId:0,documentId:"top-dir",url};
    await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},top);
    const scope=Object.keys(w.stored().practiceState.catalog)[0];
    w.patchState({liveEvidence:{[scope]:{navigation:{passed:true},submission:{passed:true},resultPersistence:{passed:true}}}});
    assert.equal((await w.call({kind:"WL_AUTHORIZE_SCOPE",tabId:1,authorization:{exerciseIds:ids,limit}})).ok,true);
    const study="https://welearn.sflep.com/student/StudyCourse.aspx?cid=2850&classid=fixture&sco=m-1-1-5";
    w.setUrl(study);await w.events.update(1,{url:study},{});
    await w.call({kind:"WL_TOP_READY"},{...top,url:study,documentId:"top-study"});
    const snapshot={...w.snap,loaded:true,questions:w.snap.questions.map(q=>({...q,hasCandidate:false}))};
    await w.call({kind:"WL_OBSERVE",snapshot},w.frame);
    return {w,scope,top,url};
}
test("starting an unanswered lesson skips missing candidates and enters only a consented next item",async()=>{
    const {w,scope,top,url}=await lessonConsent(["m-1-1-5","m-1-1-10"]);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,true);
    assert.equal(w.commands.at(-1).kind,"WL_COURSE_RETURN");
    const s=w.stored().practiceState,row=s.ledger[scope+":m-1-1-5"];
    assert.equal(row.status,"pending");assert.equal(row.error,"NO_CANDIDATE");assert.equal(row.clickCount,0);
    assert.equal(w.commands.some(m=>["WL_FILL","WL_SUBMIT"].includes(m.kind)),false);
    w.setUrl(url);await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},{...top,documentId:"top-dir2"});
    assert.equal(w.commands.at(-1).next,"m-1-1-10");
});
test("starting outside consent returns to native directory without authorizing the current lesson",async()=>{
    const {w,top,url}=await lessonConsent(["m-1-1-10"],1);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,true);
    assert.equal(w.commands.at(-1).kind,"WL_COURSE_RETURN");
    assert.deepEqual(w.stored().practiceState.consent.exerciseIds,["m-1-1-10"]);
    assert.equal(w.stored().practiceState.run.limit,1);
    w.setUrl(url);await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},top);
    assert.equal(w.commands.at(-1).next,"m-1-1-10");
    assert.equal(w.commands.some(m=>m.kind==="WL_SUBMIT"),false);
});
test("lesson restart retains consumed quota and rejects uncertain submissions",async()=>{
    const {w,scope}=await lessonConsent(["m-1-1-5","m-1-1-10"]);
    w.patchState({authorization:{...w.stored().practiceState.consent,identityHash:"b".repeat(64),used:1}});
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,true);
    assert.equal(w.stored().practiceState.authorization.used,1);
    assert.equal(w.stored().practiceState.run.limit,1);
    await w.call({kind:"WL_PAUSE"});
    const ledger=w.stored().practiceState.ledger;ledger[scope+":m-1-1-5"].status="uncertain";ledger[scope+":m-1-1-5"].clickCount=1;
    w.patchState({ledger});
    assert.equal((await w.call({kind:"WL_START",tabId:1})).code,"UNCERTAIN_SUBMIT");
    assert.equal(w.commands.filter(m=>m.kind==="WL_COURSE_RETURN").length,1);
});
test("lesson start does not navigate from unknown completion state",async()=>{
    const {w}=await lessonConsent(["m-1-1-10"],1);
    await w.call({kind:"WL_OBSERVE",snapshot:{...w.snap,observedStatus:"unknown"}},w.frame);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).code,"UNKNOWN_STATUS");
    assert.equal(w.commands.some(m=>m.kind==="WL_COURSE_RETURN"),false);
});
test("authorizing from a lesson replaces the old directory consent and denies changes during a run",async()=>{
    const {w}=await lessonConsent(["m-1-1-10"],1);
    assert.equal((await w.call({kind:"WL_AUTHORIZE",tabId:1,authorization:{exerciseIds:["m-1-1-5","m-1-1-10"],limit:2}})).ok,true);
    assert.deepEqual(w.stored().practiceState.consent.exerciseIds,["m-1-1-5","m-1-1-10"]);
    assert.equal(w.stored().practiceState.consent.limit,2);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,true);
    assert.equal((await w.call({kind:"WL_AUTHORIZE",tabId:1,authorization:{exerciseIds:["m-1-1-10"],limit:1}})).code,"ALREADY_RUNNING");
    assert.equal(w.stored().practiceState.consent.limit,2);
});
test("resume from a confirmed empty lesson schedules ten seconds and preserves prior skips",async()=>{
    const {w,scope}=await lessonConsent(["m-1-1-5","m-1-1-6","m-1-1-10"]);
    w.patchState({run:{id:"old",engine:"extension-directory-v1",status:"paused",scopeKey:scope,exerciseId:"m-1-1-5",skipped:["m-1-1-6"],startedAt:Date.now(),lease:{tabId:1}}});
    await w.call({kind:"WL_OBSERVE",snapshot:{...w.snap,observedStatus:"unknown",questions:[],loaded:true,emptyConfirmed:true}},w.frame);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,true);
    const state=w.stored().practiceState;
    assert.equal(state.run.status,"waiting_empty");assert.deepEqual(state.run.skipped,["m-1-1-6"]);
    assert.ok(state.run.emptyDueAt-state.run.startedAt>=10000);
    assert.equal(w.commands.at(-1).kind,"WL_SCAN");
    assert.equal(w.commands.some(m=>["WL_SUBMIT","WL_COURSE_RETURN"].includes(m.kind)),false);
    assert.equal((await w.call({kind:"WL_EMPTY_ELAPSED",exerciseId:"m-1-1-5",emptyConfirmed:true},w.frame)).ok,false);
});
test("UI launch is acknowledged before execution and continues independently of the popup",async()=>{
    const w=await worker();
    const accepted=await w.call({kind:"WL_UI_LAUNCH",command:"WL_CALIBRATE",tabId:1});
    assert.equal(accepted.data.accepted,true);await w.flush();
    assert.equal(w.stored().practiceState.run.status,"running");assert.equal(w.commands.at(-1).kind,"WL_FILL");
    assert.equal(w.stored().practiceState.history.filter(e=>e.code==="UI_LAUNCH_ACCEPTED").length,1);
    assert.equal((await w.call({kind:"WL_UI_LAUNCH",command:"WL_SETTINGS",tabId:1})).ok,false);
    assert.equal((await w.call({kind:"WL_UI_LAUNCH",command:"WL_START",tabId:1},w.frame)).ok,false);
});
test("continuous batches retain cumulative consent and stop exactly at its quota",async()=>{
    const w=await worker(),url="https://welearn.sflep.com/student/course_info.aspx?cid=2850&classid=fixture";
    w.setUrl(url);const top={id:w.ui.id,tab:{id:1},frameId:0,documentId:"dir",url};
    await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},top);
    const scope=Object.keys(w.stored().practiceState.catalog)[0],ids=directoryFixture(0).items.slice(0,25).map(r=>r.exerciseId);
    const consent={scopeKey:scope,identityHash:"b".repeat(64),exerciseIds:ids,limit:25,grantedAt:Date.now()};
    w.patchState({consent,authorization:{...consent,used:10},settings:{configured:true,batch:true,batchSize:10,continueBatches:true},run:{id:"batch",engine:"extension-directory-v1",scopeKey:scope,tabId:1,status:"returning_skip",done:10,limit:10,batchNo:1,batchStartDone:0,skipped:ids.slice(0,10),lease:{tabId:1}}});
    await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},top);
    assert.equal(w.stored().practiceState.run.limit,20);assert.equal(w.stored().practiceState.run.batchNo,2);
    assert.equal(w.stored().practiceState.authorization.used,10);assert.equal(w.stored().practiceState.consent.limit,25);
    assert.equal(w.commands.at(-1).next,ids[10]);
    const s=w.stored().practiceState;s.run.status="returning_skip";s.run.done=20;s.run.skipped=ids.slice(0,20);s.authorization.used=20;
    w.patchState({run:s.run,authorization:s.authorization});await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},top);
    assert.equal(w.stored().practiceState.run.limit,25);assert.equal(w.stored().practiceState.run.batchNo,3);
    const f=w.stored().practiceState;f.run.status="returning_skip";f.run.done=25;f.authorization.used=25;
    w.patchState({run:f.run,authorization:f.authorization});const count=w.commands.length;
    await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},top);
    assert.equal(w.stored().practiceState.run.lastError,"AUTH_QUOTA_EXHAUSTED");assert.equal(w.stored().practiceState.run.status,"paused");assert.equal(w.commands.length,count);
    assert.deepEqual(w.stored().practiceState.consent.exerciseIds,ids);
});

test("stale directory navigation cannot end the current study session or clear its target",async()=>{
    const w=await worker();await fill(w);
    const run=w.stored().practiceState.run;
    w.patchState({run:{...run,status:"waiting_navigation",enteredStudy:true}});
    await w.events.update(1,{url:"https://welearn.sflep.com/student/course_info.aspx?cid=2850&classid=fixture"});await w.flush();
    const reply=await w.call({kind:"WL_STATE",tabId:1});
    assert.equal(reply.data.run.status,"waiting_navigation");assert.ok(reply.data.current);
    assert.equal(w.stored().practiceState.history.some(e=>e.code==="SESSION_ENDED"),false);
});

test("real login and unexpected directory return still pause a live session",async()=>{
    for(const url of ["https://welearn.sflep.com/login.aspx","https://welearn.sflep.com/student/course_info.aspx?cid=2850&classid=fixture"]){
        const w=await worker();await fill(w);
        w.patchState({run:{...w.stored().practiceState.run,status:"waiting_navigation",enteredStudy:true}});
        w.setUrl(url);await w.events.update(1,{url});await w.flush();
        assert.equal(w.stored().practiceState.run.status,"paused");assert.equal(w.stored().practiceState.run.lastError,"SESSION_ENDED");
    }
});

test("resume skips a known loaded recording without weakening uncertain-submit protection",async()=>{
    const {w,scope,top,url}=await lessonConsent(["m-1-1-5","m-1-1-10"]);
    const ledger=w.stored().practiceState.ledger;Object.assign(ledger[scope+":m-1-1-5"],{status:"skipped",error:"UNSUPPORTED_TYPE",clickCount:0});w.patchState({ledger});
    await w.call({kind:"WL_OBSERVE",snapshot:{...w.snap,observedStatus:"unknown",questions:[],loaded:true,emptyConfirmed:false}},w.frame);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,true);
    assert.equal(w.commands.at(-1).kind,"WL_COURSE_RETURN");
    assert.deepEqual(w.stored().practiceState.run.skipped,["m-1-1-5"]);
    w.setUrl(url);await w.events.update(1,{url});await w.flush();
    assert.equal(w.stored().practiceState.run.status,"returning_skip");
    await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},top);
    assert.equal(w.commands.at(-1).next,"m-1-1-10");
    assert.equal(w.commands.some(m=>["WL_FILL","WL_SUBMIT"].includes(m.kind)),false);
    assert.equal(w.stored().practiceState.consent.limit,2);
});

test("duplicate field IDs become pending before any fill or submission on resume and directory entry",async()=>{
    const {w,scope,top,url}=await lessonConsent(["m-1-1-5","m-1-1-10"]);
    const duplicate={...w.snap,loaded:true,questions:[w.snap.questions[0],w.snap.questions[0]]};
    await w.call({kind:"WL_OBSERVE",snapshot:duplicate},w.frame);
    assert.equal((await w.call({kind:"WL_START",tabId:1})).ok,true);
    assert.equal(w.stored().practiceState.ledger[scope+":m-1-1-5"].error,"FIELD_ID_INVALID");
    assert.equal(w.commands.at(-1).kind,"WL_COURSE_RETURN");
    w.setUrl(url);await w.call({kind:"WL_DIRECTORY",snapshot:directoryFixture(0)},top);
    const study="https://welearn.sflep.com/student/StudyCourse.aspx?cid=2850&classid=fixture&sco=m-1-1-10";
    w.setUrl(study);await w.call({kind:"WL_TOP_READY"},{...top,url:study,documentId:"study10"});
    await w.call({kind:"WL_OBSERVE",snapshot:{...duplicate,exerciseId:"m-1-1-10"}},{...w.frame,url:w.frame.url.replace("main5.html","main10.html?m-1-1-10"),documentId:"doc10"});
    assert.equal(w.stored().practiceState.ledger[scope+":m-1-1-10"].error,"FIELD_ID_INVALID");
    assert.equal(w.commands.at(-1).kind,"WL_COURSE_RETURN");
    assert.equal(w.commands.some(m=>["WL_FILL","WL_SUBMIT"].includes(m.kind)),false);
    assert.equal(w.stored().practiceState.authorization.used,0);
});

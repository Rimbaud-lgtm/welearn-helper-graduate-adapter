const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript"),{JSDOM}=require("jsdom");
const C=require("../extension/core.js");
const source=fs.readFileSync(require.resolve("../src/projects/welearn/exercise/dataSolution/adapter.ts"),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const legacy={exports:{}};vm.runInNewContext(compiled,legacy);global.WeLearnLegacy=legacy.exports;
const D=require("../extension/dom-adapter.js");
const context={scopeKey:"a".repeat(64),identityHash:"b".repeat(64)};
function fixture(kind="text",status="unsubmitted"){
    const q=kind==="text" ? '<div data-controltype="fillinglong" data-id="q1"><textarea data-itemtype="textarea" data-solution="alpha beta-gamma, yes!"></textarea></div>' : '<div data-controltype="choice" data-id="q1"><ul data-itemtype="options"><li>A</li><li data-solution="">B</li></ul></div>';
    const dom=new JSDOM('<li data-controltype="page" data-scoid="m-1-1-5" data-title="Ex. 1"><div data-controltype="group">'+q+'<a data-controltype="submit">Submit</a><span data-controltype="submitinfo">'+(status==="unsubmitted"?"尚未提交。":"")+'</span></div></li><div style="display:none"><span id="___examScore">100</span></div>');
    const doc=dom.window.document;
    doc.querySelector('[data-controltype="page"]').getBoundingClientRect=()=>({left:0,top:0,right:1024,bottom:768,width:1024,height:768});
    if(kind==="choice")for(const li of doc.querySelectorAll("li li"))li.addEventListener("click",()=>{for(const s of li.parentElement.children)s.removeAttribute("data-choiced");li.setAttribute("data-choiced","");});
    return dom;
}
test("unknown and completed status cannot enter fill",()=>{
    for(const observedStatus of ["unknown","completed","submitted_unknown"])assert.throws(()=>C.fillAllowed({observedStatus,questions:[{type:"text",hasCandidate:true}]},{},true,{replaceDrafts:false}));
});
test("reference input stays separate from scoring and ambiguous answers stop",()=>{
    const dom=fixture();const node=dom.window.document.querySelector("[data-id=q1]");node.setAttribute("data-nostatistics","");assert.equal(D.candidate(node).type,"reference");assert.equal(D.candidate(node).expected,"alpha beta-gamma, yes!");
    node.removeAttribute("data-nostatistics");node.querySelector("textarea").dataset.solution="a|b";assert.equal(D.candidate(node).expected,null);dom.window.close();
});
test("latest answer time is a real saved result, never a fabricated percentage",()=>{
    const dom=fixture(),doc=dom.window.document;
    doc.querySelector('[data-controltype="submitinfo"]').textContent="最新答题时间：2026-10-10 13:14:41";
    const snap=D.snapshot(doc,"m-1-1-5");assert.equal(snap.observedStatus,"completed");assert.equal(snap.result.kind,"ungraded");assert.equal(snap.result.accuracy,null);
    const row=C.observeResult({status:"awaiting_result",submitEpoch:"a"},snap,"a");assert.equal(row.status,"graded");
    assert.equal(C.confirmDirectory({...row,clickCount:1},{observedStatus:"completed",score:null},10,9).status,"completed");dom.window.close();
});
test("directory result and exact completion delta are mandatory",()=>{
    const row={clickCount:1,result:{source:"welearn-dom",accuracy:100}};
    assert.equal(C.confirmDirectory(row,{observedStatus:"completed",score:100},10,9).status,"completed");
    for(const [item,progress] of [[{observedStatus:"unsubmitted",score:100},10],[{observedStatus:"completed",score:50},10],[{observedStatus:"completed",score:100},11]])assert.throws(()=>C.confirmDirectory(row,item,progress,9),e=>e.code==="DIRECTORY_MISMATCH");
});
test("native textarea readback checks spaces hyphens punctuation and events",async()=>{
    const dom=fixture(),doc=dom.window.document;let events=0,submits=0;
    doc.addEventListener("input",()=>events++);doc.addEventListener("change",()=>events++);doc.querySelector("a").addEventListener("click",()=>submits++);
    const result=await D.fill(doc,"m-1-1-5",{delayMs:0,replaceDrafts:false},async()=>{},async()=>{});
    assert.equal(result[0].matched,true);assert.equal(doc.querySelector("textarea").value,"alpha beta-gamma, yes!");assert.equal(events,2);assert.equal(submits,0);dom.window.close();
});
test("conflicting draft is preserved and stops writing",async()=>{
    const dom=fixture(),doc=dom.window.document;doc.querySelector("textarea").value="my draft";
    await assert.rejects(D.fill(doc,"m-1-1-5",{delayMs:0,replaceDrafts:false},async()=>{},async()=>{}),e=>e.code==="DRAFT_CONFLICT");assert.equal(doc.querySelector("textarea").value,"my draft");dom.window.close();
});
test("live reread failure stops before any submit",async()=>{
    const dom=fixture(),doc=dom.window.document;doc.querySelector("textarea").addEventListener("input",()=>{doc.querySelector("textarea").value="changed";});
    await assert.rejects(D.fill(doc,"m-1-1-5",{delayMs:0},async()=>{},async()=>{}),e=>e.code==="READBACK_FAILED");dom.window.close();
});
test("choice uses the actual platform data-choiced marker",async()=>{
    const dom=fixture("choice"),doc=dom.window.document;await D.fill(doc,"m-1-1-5",{delayMs:0},async()=>{},async()=>{});assert.equal(D.selectedOption(doc.querySelector("[data-id=q1]")),1);dom.window.close();
});
test("hidden global exam template cannot supply a result",()=>{
    const dom=fixture();assert.equal(D.snapshot(dom.window.document,"m-1-1-5").result,null);dom.window.close();
});
test("system result binds current group and requires marks consistent with percentage",()=>{
    const dom=fixture(),doc=dom.window.document,q=doc.querySelector("[data-id=q1]");q.setAttribute("data-submitted","");q.setAttribute("data-iscorrect","yes");doc.querySelector("[data-controltype=submitinfo]").textContent="首次答题正确率：100%（时间）；最近答题正确率：100%（时间）。";
    assert.deepEqual(D.snapshot(doc,"m-1-1-5").result,{source:"welearn-dom",accuracy:100,correct:1,total:1});q.setAttribute("data-iscorrect","no");assert.equal(D.snapshot(doc,"m-1-1-5").observedStatus,"unknown");dom.window.close();
});
test("restart recovery keeps any reserved submission uncertain",()=>{
    for(const status of ["reserved","awaiting_result","graded"]){const state=C.initialState();state.run={status:"running"};state.ledger.a={status,clickCount:status==="reserved"?0:1};const r=C.recover(state);assert.equal(r.run.status,"paused");assert.equal(r.ledger.a.status,"uncertain");}
});
test("scope identity quota and live gates all constrain submissions",()=>{
    const s=C.initialState();s.run={status:"running",scopeKey:context.scopeKey};s.authorization=C.authorize({exerciseIds:["m-1-1-5"],limit:1},context,100);
    const row={status:"verified",matched:1,total:1,exerciseId:"m-1-1-5",clickCount:0,observedStatus:"unsubmitted"};const caps={submission:{passed:true},resultPersistence:{passed:true}};
    C.submitAllowed(s,context,row,caps,200);
    for(const patch of [{exerciseId:"m-1-1-6"},{clickCount:1},{status:"reserved"},{matched:0}])assert.throws(()=>C.submitAllowed(s,context,{...row,...patch},caps,200));
    assert.throws(()=>C.submitAllowed(s,{...context,identityHash:null},row,caps,200));assert.throws(()=>C.submitAllowed(s,context,row,{...caps,submission:{passed:false}},200));s.authorization.used=1;assert.throws(()=>C.submitAllowed(s,context,row,caps,200));
});
test("result before document reload is graded, persisted re-read completes",()=>{
    const row={status:"awaiting_result",submitEpoch:"document-one"};const snap={observedStatus:"completed",result:{source:"welearn-dom",accuracy:50,correct:1,total:2}};
    assert.equal(C.observeResult(row,snap,"document-one").status,"graded");assert.equal(C.observeResult(row,snap,"document-two").status,"completed");
});
test("unknown state schema is retained rather than silently reset",()=>{
    assert.throws(()=>C.recover({schema:99,ledger:{x:{status:"reserved"}}}),e=>e.code==="STATE_VERSION");
});
test("extension reload reinstalls messaging despite an old boot marker",()=>{
    const dom=new JSDOM('<body></body>',{url:"https://welearn.sflep.com/student/StudyCourse.aspx?cid=2850"});
    const handlers=new Set();
    const box=vm.createContext({window:dom.window,document:dom.window.document,location:dom.window.location,WeLearnCore:C,WeLearnDom:D,MutationObserver:dom.window.MutationObserver,setTimeout,clearTimeout,
        chrome:{runtime:{sendMessage:async()=>({ok:true,data:{}}),onMessage:{addListener:f=>handlers.add(f),removeListener:f=>handlers.delete(f)}}},__weLearnPracticeBooted:true});
    const content=fs.readFileSync(require.resolve("../extension/content.js"),"utf8");
    vm.runInContext(content,box);assert.equal(handlers.size,1);
    vm.runInContext(content,box);assert.equal(handlers.size,1,"re-injection removes the prior listener");
    box.__weLearnPracticeCleanup();assert.equal(handlers.size,0);dom.window.close();
});
test("native iframe SCO takes structured query keys without guessing filenames",()=>{
    assert.equal(C.scoFromUrl("https://example.invalid/main6.html?m-1-1-6&nocache=1"),"m-1-1-6");
    assert.equal(C.scoFromUrl("https://example.invalid/main5.html?SCO=m-1-1-5"),"m-1-1-5");
    assert.equal(C.scoFromUrl("https://example.invalid/main6.html?sco=m-1-1-5&SCO=m-1-1-6"),null);
    assert.equal(C.scoFromUrl("https://example.invalid/main6.html"),null);
});
test("an offscreen old page cannot be filled after native navigation",()=>{
    const dom=fixture();dom.window.document.querySelector('[data-controltype="page"]').getBoundingClientRect=()=>({left:-2048,top:0,right:-1024,bottom:768,width:1024,height:768});
    assert.throws(()=>D.snapshot(dom.window.document,"m-1-1-5"),e=>e.code==="DOM_PAGE_HIDDEN");dom.window.close();
});

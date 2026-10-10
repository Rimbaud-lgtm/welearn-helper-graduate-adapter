const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),{JSDOM}=require("jsdom");
const C=require("../extension/core.js");
global.WeLearnLegacy={parseDataSolutionDom:node=>JSON.parse(node.getAttribute("data-test-solutions")||"[]")};const D=require("../extension/dom-adapter.js");
test("submit arriving during fill is queued, not refused or executed twice",async()=>{
    const dom=new JSDOM('<body>ready</body>',{url:"https://centercourseware.sflep.com/New%20Era%20Academic%20English%20Graduate%20Students%201/unit_01/main9.html?m-1-1-9"});
    const context={scopeKey:"a".repeat(64),currentSco:"m-1-1-9"};let listener,submitted=0,graded=false,ack;
    const messages=[],fakeDom={targetUrl:()=>true,snapshot:()=>({questions:[{matched:true}],observedStatus:graded?"completed":"unsubmitted"}),fill:async(doc,id,config,check,progress)=>{await check();await progress({id:"q",matched:true});},submit:async()=>{submitted++;graded=true;return {confirmed:true};},waitFor:async(doc,p)=>{assert.equal(p(),true);}};
    const chrome={runtime:{onMessage:{addListener:f=>listener=f,removeListener:()=>{}},sendMessage:async m=>{
        messages.push(m.kind);
        if(m.kind==="WL_FINISHED"){
            listener({kind:"WL_SUBMIT",runId:"r",exerciseId:context.currentSco,nonce:"n"},{},r=>ack=r);
            assert.equal(submitted,0,"submit must wait until fill command finishes");
        }
        return {ok:true,data:{...context,context,settings:{}}};
    }}};
    const box=vm.createContext({window:dom.window,document:dom.window.document,location:dom.window.location,navigator:dom.window.navigator,chrome,WeLearnCore:C,WeLearnDom:fakeDom,MutationObserver:dom.window.MutationObserver,setTimeout,clearTimeout,Date});
    vm.runInContext(fs.readFileSync(require.resolve("../extension/content.js"),"utf8"),box);
    await new Promise(resolve=>setImmediate(resolve));
    listener({kind:"WL_FILL",runId:"r",exerciseId:context.currentSco,fieldIds:["q"]},{},()=>{});
    await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(ack.ok,true);assert.equal(submitted,1);assert.equal(messages.filter(m=>m==="WL_CONSUME").length,1);
    box.__weLearnPracticeCleanup();dom.window.close();
});
test("DOM completion waiter is event driven and rejects offline without navigation",async()=>{
    const dom=new JSDOM('<body><p>loading</p></body>');const doc=dom.window.document;
    const result=D.waitFor(doc,()=>doc.querySelector('[data-ready]'),100);
    doc.querySelector('p').setAttribute('data-ready','yes');assert.ok(await result);
    const offline=D.waitFor(doc,()=>false,100);dom.window.dispatchEvent(new dom.window.Event('offline'));
    await assert.rejects(offline,e=>e.code==="OFFLINE");dom.window.close();
});
test("empty chapter is not inferred from a loading document or hidden exam template",()=>{
    const dom=new JSDOM('<li data-controltype="page" data-scoid="m-1-1-8" data-title="Reading Text One>Academic Reading Skill">This is substantive reading content with no required exercise controls.</li><div hidden>0/0题 本次操练已完成</div>');
    const doc=dom.window.document,page=doc.querySelector('li');page.getBoundingClientRect=()=>({left:0,top:0,right:800,bottom:600,width:800,height:600});
    Object.defineProperty(doc,'readyState',{value:'loading',configurable:true});assert.equal(D.snapshot(doc,'m-1-1-8').emptyConfirmed,false);
    Object.defineProperty(doc,'readyState',{value:'complete',configurable:true});assert.equal(D.snapshot(doc,'m-1-1-8').emptyConfirmed,true);
    page.innerHTML+='<iframe src="pending.html"></iframe>';assert.equal(D.snapshot(doc,'m-1-1-8').emptyConfirmed,false);dom.window.close();
});
test("negative native flags and a temporarily hidden submit do not fake completion",()=>{
    const dom=new JSDOM('<div data-controltype="choice" data-id="q" data-submitted="false"><ul data-itemtype="options"><li data-choiced="false">A</li><li data-choiced="true">B</li></ul></div><a data-controltype="submit" style="display:none">Submit</a><span data-controltype="submitinfo">尚未提交。</span>');
    const page=dom.window.document.body;
    assert.equal(D.selectedOption(page.querySelector('[data-id=q]')),1);
    assert.equal(D.status(page).observedStatus,"unsubmitted");
    page.querySelector('[data-id=q]').setAttribute('data-submitted','unrecognized');assert.equal(D.status(page).observedStatus,"unknown");dom.window.close();
});
test("Writing introduction is empty only after load and without any exercise controls",()=>{
    const dom=new JSDOM('<li data-controltype="page" data-scoid="m-1-1-24" data-title="Writing>Writing an Introduction">Writing an introduction and a thesis statement with substantive reading content.</li>');
    const doc=dom.window.document,page=doc.querySelector('li');page.getBoundingClientRect=()=>({left:0,top:0,right:800,bottom:600,width:800,height:600});
    Object.defineProperty(doc,'readyState',{value:'complete',configurable:true});
    assert.equal(D.snapshot(doc,'m-1-1-24').emptyConfirmed,true);
    page.innerHTML+='<textarea></textarea>';assert.equal(D.snapshot(doc,'m-1-1-24').emptyConfirmed,false);
    page.querySelector('textarea').remove();Object.defineProperty(doc,'readyState',{value:'loading',configurable:true});
    assert.equal(D.snapshot(doc,'m-1-1-24').emptyConfirmed,false);dom.window.close();
});
test("long-text candidates retain uniqueness while allowing real paragraph lengths",()=>{
    const dom=new JSDOM('<div data-controltype="fillinglong"><textarea data-itemtype="input"></textarea></div>');
    const node=dom.window.document.querySelector('div'),solution={type:"blank",text:"a".repeat(452)};
    node.setAttribute('data-test-solutions',JSON.stringify([solution]));assert.equal(D.candidate(node).expected,solution.text);
    node.dataset.controltype='filling';assert.equal(D.candidate(node).expected,null);
    node.dataset.controltype='fillinglong';node.setAttribute('data-test-solutions',JSON.stringify([solution,solution]));assert.equal(D.candidate(node).expected,null);
    node.setAttribute('data-test-solutions','[]');assert.equal(D.candidate(node).expected,null);
    node.setAttribute('data-test-solutions',JSON.stringify([{...solution,text:"a".repeat(2001)}]));assert.equal(D.candidate(node).expected,null);
    dom.window.close();
});
test("only the identified course sample introduction is used without its explanatory note",()=>{
    const dom=new JSDOM('<div data-controltype="fillinglong" data-id="u1_27_f1"><textarea data-itemtype="textarea"></textarea><div data-itemtype="result"><div>(Answers may vary.)</div><div>A sample introduction:</div><div>A clear introduction. <span>A thesis statement.</span> (The underlined sentence is the thesis statement.)</div></div></div>');
    const node=dom.window.document.querySelector('[data-id]');
    assert.equal(D.candidate(node).expected,"A clear introduction. A thesis statement.");assert.equal(D.candidate(node).basis,"course-sample-introduction");
    node.querySelector('[data-itemtype=result]').lastElementChild.textContent="A clear introduction. A thesis statement. (The underlined sentence\n   is the thesis statement.)";
    assert.equal(D.candidate(node).expected,"A clear introduction. A thesis statement.");
    node.dataset.id="another_essay";assert.equal(D.candidate(node).expected,null);
    node.dataset.id="u1_27_f1";node.querySelector('[data-itemtype=result]').appendChild(dom.window.document.createElement('div'));assert.equal(D.candidate(node).expected,null);
    dom.window.close();
});

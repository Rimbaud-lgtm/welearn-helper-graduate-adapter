const {test}=require("node:test"),assert=require("node:assert/strict"),{JSDOM}=require("jsdom");
require("../extension/core.js");
global.WeLearnDom={visible:n=>n.isConnected&&!n.closest('[hidden]')};
const K=require("../extension/catalog-adapter.js");
function fixture(){
    const totals=[28,30,28,28,28,28,28,27];
    const units=totals.map((count,u)=>`<section><a data-toggle="collapse" href="#unit${u}">B1U${u+1}<div class="progress_fix">已完成：${u===0?9:0} /${count}</div></a><div class="panel-collapse in" id="unit${u}"><ul>${Array.from({length:count},(_,i)=>`<li class="stu_testlist_1" onclick="javascript:StartSCO('m-1-${u+1}-${i+1}');"><span><i class="fa ${u===0&&i<9?'fa-check-circle-o':'fa-circle'}"></i>Reading Text One&gt;Language Enhancement&gt;Ex. ${i+1}</span><span class="pull-right">开始学习</span>${u===0&&i<9?'<span>100分</span>':''}</li>`).join('')}</ul></div></section>`).join('');
    return new JSDOM(`<div id="accordion-test-2">${units}</div><div hidden><li class="stu_testlist_1" onclick="StartSCO('m-1-1-10')"><i class="fa fa-check-circle-o"></i>100分</li></div>`);
}
test("native directory ignores hidden statistics and reads all225 unique completion states",()=>{
    const dom=fixture(),snap=K.snapshot(dom.window.document);assert.equal(snap.total,225);assert.equal(snap.completed,9);assert.equal(snap.items.length,225);assert.equal(snap.items.find(r=>r.exerciseId==="m-1-1-10").observedStatus,"unsubmitted");dom.window.close();
});
test("duplicate IDs and directory counter disagreement stop",()=>{
    for(const mutate of [doc=>doc.querySelector('li').after(doc.querySelector('li').cloneNode(true)),doc=>doc.querySelector('.progress_fix').textContent='已完成：10 /28']){
        const dom=fixture();mutate(dom.window.document);assert.throws(()=>K.snapshot(dom.window.document),e=>e.code==="CATALOG_UNVERIFIED");dom.window.close();
    }
});
test("native entry refuses completed items and never executes reset or score APIs",async()=>{
    const dom=fixture(),doc=dom.window.document;
    await assert.rejects(K.enter(doc,"m-1-1-9",async()=>{}),e=>e.code==="COMPLETED");
    const target=doc.querySelectorAll('li')[9];target.scrollIntoView=()=>{};let clicks=0;target.addEventListener('click',()=>clicks++);
    await K.enter(doc,"m-1-1-10",async()=>{});assert.equal(clicks,1);dom.window.close();
});

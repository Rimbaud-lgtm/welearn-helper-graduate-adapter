const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),{JSDOM}=require("jsdom");
const C=require("../extension/core.js");
test("calibration keeps its popup alive until background accepts the launch",async()=>{
    const dom=new JSDOM(fs.readFileSync(require.resolve("../extension/popup.html"),"utf8"));
    const calls=[];let resolveLaunch;
    const data={version:"test",settings:{configured:true},current:{exerciseId:"m-1-1-9",title:"Ex.1",observedStatus:"unsubmitted",questions:[]},run:null,evidence:{},summary:{rows:[],completed:0}};
    const chrome={runtime:{sendMessage:async m=>{
        calls.push(m.kind);
        if(m.kind==="WL_UI_LAUNCH"){assert.equal(m.command,"WL_CALIBRATE");return await new Promise(resolve=>resolveLaunch=resolve);}
        return {ok:true,data:m.kind==="WL_STATE"?data:{}};
    }},tabs:{query:async()=>[{id:1}]},storage:{onChanged:{addListener:()=>{}}}};
    const box=vm.createContext({document:dom.window.document,window:{close:()=>calls.push("popup-close")},chrome,WeLearnCore:C,setTimeout,console});
    vm.runInContext(fs.readFileSync(require.resolve("../extension/popup.js"),"utf8"),box);
    await new Promise(resolve=>setImmediate(resolve));
    dom.window.document.getElementById("calibrate").click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(resolveLaunch);assert.equal(calls.includes("popup-close"),false);
    resolveLaunch({ok:true,data:{accepted:true}});await new Promise(resolve=>setImmediate(resolve));
    assert.ok(calls.indexOf("popup-close")>calls.indexOf("WL_UI_LAUNCH"));dom.window.close();
});

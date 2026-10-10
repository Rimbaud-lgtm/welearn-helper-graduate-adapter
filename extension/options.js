/* global chrome */
const $=id=>document.getElementById(id);
let tabId=null,directoryMode=false;
async function send(kind,extra={}) {
    const r=await chrome.runtime.sendMessage({kind,tabId,...extra});
    if(!r?.ok)throw new Error(r?.error || "设置保存失败");return r.data;
}
function showError(e){$("error").hidden=false;$("error").textContent=e.message;}
$("settingsForm").addEventListener("submit",async event=>{
    event.preventDefault();$("error").hidden=true;
    try{await send("WL_SETTINGS",{settings:{batch:$("batch").checked,batchSize:Number($("batchSize").value),replaceDrafts:$("replaceDrafts").checked,skipUnsupported:$("skipUnsupported").checked,delayMs:Number($("delayMs").value)}});$("saved").textContent="设置已保存在此浏览器";}
    catch(e){showError(e);}
});
$("revoke").addEventListener("click",async()=>{try{await send("WL_REVOKE");$("authorizationStatus").textContent="授权已撤销";}catch(e){showError(e);}});
$("selectUnfinished").addEventListener("click",()=>{for(const input of document.querySelectorAll("#exerciseScopes input"))input.checked=!input.disabled;});
$("applyUpdate").addEventListener("click",async()=>{try{await send("WL_PAUSE");chrome.runtime.reload();}catch(e){showError(e);}});
$("authorizePilot").addEventListener("click",async()=>{try{await send("WL_AUTHORIZE_PILOT",{replaceDrafts:$("pilotReplace").checked});$("authorizationStatus").textContent="已授权当前练习提交 1 次验证，返回课程点击开始练习";}catch(e){showError(e);}});
$("authorize").addEventListener("click",async()=>{
    const exerciseIds=[...document.querySelectorAll("#exerciseScopes input:checked")].filter(n=>!n.disabled).map(n=>n.value);
    try{
        $("error").hidden=true;
        await send("WL_RESCAN");await new Promise(resolve=>setTimeout(resolve,700));
        await send(directoryMode?"WL_AUTHORIZE_SCOPE":"WL_AUTHORIZE",{authorization:{exerciseIds,limit:Number($("limit").value)}});$("authorizationStatus").textContent="已授权 "+exerciseIds.length+" 项练习";
    }catch(e){showError(e);}
});
(async()=>{
    try{
        const allTabs=await chrome.tabs.query({url:"https://welearn.sflep.com/*"});
        const tabs=allTabs.filter(t=>{try{return ["/student/studycourse.aspx","/student/course_info.aspx"].includes(new URL(t.url).pathname.toLowerCase())&&new URL(t.url).searchParams.get("cid")==="2850";}catch{return false;}});
        tabId=tabs.find(t=>t.active)?.id || tabs[0]?.id;
        await send("WL_RESCAN");await new Promise(resolve=>setTimeout(resolve,700));
        const data=await send("WL_STATE");$("version").textContent=data.version;directoryMode=Boolean(data.directory);
        let frames=data.diagnostic?.frames||[];
        if(tabId&&!frames.length){try{frames=(await chrome.tabs.sendMessage(tabId,{kind:"WL_TOP_DIAGNOSTIC"},{frameId:0}))?.frames||[];}catch{}}
        $("connectionStatus").textContent=data.directory?"课程目录："+data.directory.completed+" / "+data.directory.total:data.current ? data.current.title : frames.map(f=>f.host+f.path+(f.pageIds ? " ["+[f.core,f.legacy,f.adapter,f.booted].map(Boolean).join(",")+"] pages="+f.pageIds.join(",") : "")).join("\n") || "课件未连接";
        $("batch").checked=data.settings.batch;$("replaceDrafts").checked=data.settings.replaceDrafts;$("delayMs").value=data.settings.delayMs;
        $("batchSize").value=data.settings.batchSize||1;
        $("skipUnsupported").checked=data.settings.skipUnsupported!==false;
        const validated=data.capabilities.submission.passed&&data.capabilities.resultPersistence.passed&&data.capabilities.navigation.passed;
        const enabled=directoryMode || validated&&data.identityConfirmed;
        $("authorizationStatus").textContent=validated?"已取得扩展自主判分及目录对账证据":"首次独立验收：请选择 1 项未完成练习，上限为 1";
        if(!validated){$("limit").max="1";$("limit").value="1";$("batch").checked=false;}
        $("authorize").disabled=!enabled;
        $("selectUnfinished").disabled=!validated;
        if(!validated){$("batchSize").value="1";$("batchSize").max="1";}
        $("pilotScope").textContent=data.current ? "当前验证范围："+data.current.title+"；"+data.current.questions.length+" 项输入；"+data.current.questions.filter(q=>q.type==="reference").length+" 项参考题不计入正确率" : "尚未识别到可验证的练习";
        $("authorizePilot").disabled=!data.identityConfirmed || data.current?.observedStatus!=="unsubmitted" || !data.current?.questions.length || data.current.questions.some(q=>!q.hasCandidate||!["choice","text","reference"].includes(q.type)||!data.evidence[q.type]?.passed);
        for(const row of data.catalog){const label=document.createElement("label"),input=document.createElement("input");input.type="checkbox";input.value=row.exerciseId;input.disabled=!enabled || row.observedStatus!=="unsubmitted";input.checked=!input.disabled&&(data.consent?.exerciseIds.includes(row.exerciseId)||false);
            input.addEventListener("change",()=>{if(!validated&&input.checked)for(const other of document.querySelectorAll("#exerciseScopes input"))if(other!==input)other.checked=false;});
            label.append(input,document.createTextNode(row.title+"（"+(row.observedStatus==="unsubmitted"?"尚未提交":row.observedStatus==="completed"?"已有记录":"状态待确认")+"）"));$("exerciseScopes").append(label);}
    }catch(e){showError(e);}
})();

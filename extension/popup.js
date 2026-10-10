/* global chrome, WeLearnCore */
const $=id=>document.getElementById(id);
let tabId=null,rendering=false,lastState=null;
let renderTimer=null;
const persistentPanel=document.body.classList.contains("side-panel");
async function message(kind,extra={}) {
    const r=await chrome.runtime.sendMessage({kind,tabId,...extra});
    if(!r?.ok)throw new Error(r?.error || "扩展连接失败");
    return r.data;
}
function showError(text){$("error").textContent=text;$("error").hidden=!text;}
const typeLabel=type=>({choice:"单选",text:"文本",reference:"参考题"}[type] || "待适配");
async function render(){
    if(rendering)return;rendering=true;
    try{
        const data=await message("WL_STATE");
        lastState=data;
        $("version").textContent=data.version;
        const activeId=data.current?.exerciseId || (data.run?.engine==="extension-directory-v1"?data.run.exerciseId:null);
        const row=data.summary.rows.find(r=>r.exerciseId===activeId);
        const currentTitle=data.current?.title||row?.title;
        $("course").textContent=currentTitle?(currentTitle.startsWith("B1U")?currentTitle:"B1U"+activeId.split("-")[2]+" "+currentTitle):data.nativeProgress?"课程目录："+data.nativeProgress.completed+" / "+data.nativeProgress.total:"未检测到目标课程练习";
        const running=data.run&&! ["paused","completed","stopped"].includes(data.run.status);
        $("status").textContent=running ? (data.run.status==="waiting_empty"?"无练习："+Math.max(0,Math.ceil((data.run.emptyDueAt-Date.now())/1000))+"秒后跳过":{waiting_navigation:"正在进入未完成练习",waiting_directory:"正在回读课程完成记录",returning_skip:"已记录待处理原因，返回目录",waiting_result:"正在等待系统结果"}[data.run.status]||"正在逐项核验") : data.run?.status==="stopped"?"任务已停止":data.run?.status==="paused"?"任务已暂停":data.run?.status==="completed"?"本次任务已结束":data.current?.observedStatus==="completed" ? "已有系统提交记录" : data.current?.observedStatus==="unsubmitted" ? "尚未提交" : data.directory?"等待开始":"完成状态待确认";
        if(running&&data.run.status==="running")$("status").textContent=({filling:"填写",verifying:"核对",submitting:"提交",awaiting_grade:"等待系统判分"}[data.run.stage]||"识别练习");
        if(data.run?.status==="completed"&&data.run.lastError==="NO_AUTHORIZED_UNFINISHED")$("status").textContent=WeLearnCore.ERROR_LABELS.NO_AUTHORIZED_UNFINISHED;
        const remaining=data.consent?Math.max(0,data.consent.limit-(data.authorization?.used||0)):0;
        const batchDone=data.run?Math.max(0,(data.run.done||0)-(data.run.batchStartDone||0)):0;
        const added=data.nativeProgress&&Number.isInteger(data.run?.initialProgress)?Math.max(0,data.nativeProgress.completed-data.run.initialProgress):null;
        $("batchStatus").textContent="批次 "+(data.run?.batchNo||1)+"："+batchDone+" / "+(data.settings.batchSize||1)+" · 新增完成："+(added===null?"待目录回读":added)+" · 授权余额："+remaining;
        $("matched").textContent=(row?.matched || 0)+" / "+(row?.total || data.current?.questions.length || 0);
        $("accuracy").textContent=row?.result?.kind==="ungraded"?"仅记录完成":Number.isFinite(row?.result?.accuracy)?row.result.accuracy.toFixed(1)+"%":"未判分";
        $("completed").textContent=data.nativeProgress?data.nativeProgress.completed+" / "+data.nativeProgress.total:"待目录回读";
        $("pause").disabled=!running;$("resume").disabled=running || !(data.current||data.directory);
        $("stop").disabled=!data.run||data.run.status==="stopped";
        $("start").disabled=running;
        $("calibrate").disabled=running || !data.current || data.current.observedStatus!=="unsubmitted";
        $("acceptBatch").disabled=running||!data.directory||!["m-1-1-8","m-1-2-9","m-1-2-10"].every(id=>data.directory.items?.some(r=>r.exerciseId===id&&r.observedStatus==="unsubmitted"))||!data.capabilities?.navigation?.passed||!data.capabilities?.submission?.passed||!data.capabilities?.resultPersistence?.passed;
        $("evidence").textContent=["choice","text","reference"].map(t=>typeLabel(t)+(data.evidence[t]?.passed ? "已核验" : "待验证")).join(" · ");
        $("questions").replaceChildren();
        for(const q of data.current?.questions || []){
            const tr=document.createElement("tr");
            for(const text of [q.id,typeLabel(q.type),q.conflict ? "已有答案冲突" : q.type.startsWith("unsupported") ? "判分待验证" : !q.hasCandidate ? "候选不确定" : q.matched ? "已核对" : "待填写"]){const td=document.createElement("td");td.textContent=text;tr.append(td);}
            $("questions").append(tr);
        }
        $("results").replaceChildren();
        for(const r of data.summary.rows){const p=document.createElement("p");p.textContent=r.title+" · "+(r.result?.kind==="ungraded"?"系统记录完成时间":r.result?r.result.accuracy+"%（系统）":WeLearnCore.ERROR_LABELS[r.error]||({verified:"填写已核对",paused:"已暂停",filling:"填写中",uncertain:"提交待确认",discovered:"待处理",skipped:"待人工处理"}[r.status]||r.status))+(r.execution?" · 扩展执行":"")+(r.directoryConfirmedAt?" · 目录已对账":"");$("results").append(p);}
        $("recentResults").replaceChildren();
        for(const r of data.summary.rows.filter(r=>r.directoryConfirmedAt).sort((a,b)=>b.directoryConfirmedAt-a.directoryConfirmedAt).slice(0,5)){
            const p=document.createElement("p");p.textContent="B1U"+r.exerciseId.split("-")[2]+" "+r.title+" · "+(r.result?.kind==="ungraded"?"系统记录完成时间":r.result?.accuracy+"%（系统）");$("recentResults").append(p);
        }
        const pending=data.summary.rows.filter(r=>["pending","skipped"].includes(r.status)&&r.error!=="NO_EXERCISE"&&!data.catalog.some(c=>c.exerciseId===r.exerciseId&&c.observedStatus==="completed"));
        $("skipCount").textContent="本轮跳过："+(data.run?.skipped?.length||0)+" · 待人工："+pending.length;
        $("pendingResults").replaceChildren();
        for(const r of pending){const p=document.createElement("p");p.textContent="B1U"+r.exerciseId.split("-")[2]+" "+r.title+" · "+(WeLearnCore.ERROR_LABELS[r.error]||r.error);$("pendingResults").append(p);}
        if(row?.error)showError(WeLearnCore.ERROR_LABELS[row.error] || row.error);
        else if(data.run?.status==="paused"&&data.run.lastError)showError(WeLearnCore.ERROR_LABELS[data.run.lastError]||data.run.lastError);
        else if(data.diagnostic?.stage==="launch")showError(WeLearnCore.ERROR_LABELS[data.diagnostic.code]||"启动失败，未执行填写");
        else if(!data.current&&!data.directory&&data.diagnostic)showError((WeLearnCore.ERROR_LABELS[data.diagnostic.code]||"课程识别失败")+"（"+data.diagnostic.stage+"）");
        else showError("");
        $("connection").hidden=Boolean(data.current)||!data.diagnostic?.frames?.length;
        $("frameInfo").textContent=(data.diagnostic?.frames||[]).map(f=>f.host+f.path+(f.pageIds ? " ["+[f.core,f.legacy,f.adapter,f.booted].map(Boolean).join(",")+"] pages="+f.pageIds.join(",") : "")).join("\n");
    }catch(e){showError(e.message);}finally{rendering=false;}
}
async function command(kind){
    showError("");
    try{
        let data=await message("WL_STATE");
        if(!data.settings.configured){await chrome.runtime.openOptionsPage();return;}
        if(!data.current&&!data.directory){await message("WL_RESCAN");await new Promise(resolve=>setTimeout(resolve,600));data=await message("WL_STATE");}
        if(!data.current&&!data.directory)throw new Error(WeLearnCore.ERROR_LABELS[data.diagnostic?.code] || "尚未识别到课程目录或课件");
        if(kind==="WL_START"&&data.directory&&!data.consent)throw new Error(WeLearnCore.ERROR_LABELS.AUTH_REQUIRED);
        if(["WL_START","WL_CALIBRATE","WL_ACCEPT_BATCH"].includes(kind))await message("WL_UI_LAUNCH",{command:kind});
        else await message(kind);
        if(!persistentPanel)window.close();
        else await render();
    }catch(e){showError(e.message);}
}
$("settings").addEventListener("click",()=>chrome.runtime.openOptionsPage());
$("start").addEventListener("click",()=>command("WL_START"));
$("resume").addEventListener("click",()=>command("WL_START"));
$("pause").addEventListener("click",()=>command("WL_PAUSE"));
$("stop").addEventListener("click",()=>command("WL_STOP"));
$("calibrate").addEventListener("click",()=>command("WL_CALIBRATE"));
$("acceptBatch").addEventListener("click",()=>command("WL_ACCEPT_BATCH"));
$("rescan").addEventListener("click",async()=>{showError("");await message("WL_RESCAN");setTimeout(render,600);});
$("exportAudit").addEventListener("click",async()=>{
    try{
        const data=await message("WL_STATE");
        const report={version:data.version,exportedAt:Date.now(),browserStartupAt:data.browserStartupAt,courseId:2850,capabilities:data.capabilities,evidence:data.evidence,progress:data.nativeProgress?{completed:data.nativeProgress.completed,total:data.nativeProgress.total,at:data.nativeProgress.at}:null,
            settings:data.settings,connection:{currentLinked:Boolean(data.current),directoryLinked:Boolean(data.directory),diagnostic:data.diagnostic?{code:data.diagnostic.code,stage:data.diagnostic.stage}:null},
            current:data.current?{exerciseId:data.current.exerciseId,observedStatus:data.current.observedStatus,loaded:data.current.loaded,emptyConfirmed:data.current.emptyConfirmed,questions:data.current.questions.map(q=>({id:q.id,type:q.type,hasCandidate:q.hasCandidate,conflict:q.conflict,matched:q.matched}))}:null,
            consent:data.consent?{exerciseIds:data.consent.exerciseIds,limit:data.consent.limit,trial:data.consent.trial,used:data.authorization?.used||0}:null,
            run:data.run?{id:data.run.id,status:data.run.status,engine:data.run.engine,done:data.run.done,batchNo:data.run.batchNo,batchStartDone:data.run.batchStartDone,initialProgress:data.run.initialProgress,stage:data.run.stage,startedAt:data.run.startedAt,skipped:data.run.skipped,lastError:data.run.lastError,focus:data.run.focus}:null,
            rows:data.summary.rows.map(r=>({exerciseId:r.exerciseId,title:r.title,status:r.status,error:r.error,matched:r.matched,total:r.total,clickCount:r.clickCount,pilot:r.pilot,nativeConfirmed:r.nativeConfirmed,nativeSubmitFinished:r.nativeSubmitFinished,result:r.result,execution:r.execution,failureDetails:r.failureDetails,emptyEvidence:r.emptyEvidence,directoryConfirmedAt:r.directoryConfirmedAt})),history:data.history};
        const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));
        const a=document.createElement("a");a.href=url;a.download="welearn-extension-audit-"+Date.now()+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(e){showError(e.message);}
});
chrome.tabs.query({active:true,currentWindow:true}).then(async tabs=>{tabId=tabs[0]?.id;await message("WL_RESCAN").catch(()=>{});render();});
chrome.storage.onChanged.addListener(()=>{clearTimeout(renderTimer);renderTimer=setTimeout(render,100);});

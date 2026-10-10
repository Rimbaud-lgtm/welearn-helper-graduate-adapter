/* global chrome, WeLearnCore, WeLearnDom */
(function(){
    "use strict";
    if(globalThis.__weLearnPracticeSession?.busy)return;
    globalThis.__weLearnPracticeCleanup?.();
    globalThis.__weLearnPracticeBooted=true;
    const session=globalThis.__weLearnPracticeSession={busy:false};
    const C=WeLearnCore,D=WeLearnDom;
    let context=null, busy=false, scanning=false,activeCommand=null,pendingSubmit=null,emptyTimer=null,emptyDue=null;
    async function send(message) {
        const reply=await chrome.runtime.sendMessage(message);
        if(!reply?.ok){const e=new Error(reply?.error || "Extension unavailable");e.code=reply?.code || "PAGE_CHANGED";throw e;}
        return reply.data;
    }
    async function identityHash() {
        // Read only an explicitly rendered identifier, never cookies or storage.
        const node=document.querySelector('[data-welearn-user-id]');
        const value=node?.getAttribute('data-welearn-user-id');
        if(!value)return null;
        return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,"0")).join("");
    }
    if(window===window.top && location.hostname==="welearn.sflep.com") {
        let lastDirectory="",directoryTimer;
        async function directoryScan(force=false){
            if(location.pathname.toLowerCase()!=="/student/course_info.aspx")return;
            try{
                const snapshot=globalThis.WeLearnCatalog.snapshot(document),signature=JSON.stringify(snapshot);
                if(!force&&signature===lastDirectory)return;
                await send({kind:"WL_DIRECTORY",snapshot});lastDirectory=signature;
            }catch(e){await send({kind:"WL_DIAGNOSTIC",code:e.code||"CATALOG_UNVERIFIED",stage:"directory-scan"}).catch(()=>{});}
        }
        const listener=(m,sender,reply)=>{
            if(m.kind==="WL_IDENTITY"){identityHash().then(identityHash=>reply({identityHash}));return true;}
            if(m.kind==="WL_TOP_DIAGNOSTIC") {
                reply({frames:[...document.querySelectorAll("iframe")].map(n=>{
                    try{const u=new URL(n.src,location.href);const report={host:u.hostname,path:u.pathname};
                        try{const actual=new URL(n.contentWindow.location.href);report.actualHost=actual.hostname;report.actualPath=actual.pathname;}catch{report.crossOrigin=true;}
                        return report;
                    }catch{return {host:"unknown",path:""};}
                })});return;
            }
            if(m.kind==="WL_SCAN"){directoryScan(true);reply({ok:true});return;}
            if(!["WL_DIRECTORY_ENTER","WL_COURSE_RETURN"].includes(m.kind))return;
            if(session.busy){reply({ok:false});return;}
            session.busy=true;reply({ok:true});
            (async()=>{
                try{
                    const check=async()=>{
                        if(!navigator.onLine)C.fail("OFFLINE");
                        await send({kind:"WL_TOP_CHECK",runId:m.runId,action:m.kind,next:m.next});
                    };
                    await check();
                    if(m.kind==="WL_DIRECTORY_ENTER")await globalThis.WeLearnCatalog.enter(document,m.next,check);
                    else await send({kind:"WL_NATIVE_RETURN",runId:m.runId});
                }catch(e){await send({kind:"WL_TOP_ERROR",runId:m.runId,code:e.code||"PAGE_CHANGED"}).catch(()=>{});}
                finally{session.busy=false;}
            })();
        };
        chrome.runtime.onMessage.addListener(listener);
        const directoryObserver=new MutationObserver(()=>{clearTimeout(directoryTimer);directoryTimer=setTimeout(()=>directoryScan(),350);});
        directoryObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
        const topReady=()=>send({kind:"WL_TOP_READY"}).catch(()=>{});
        const topOffline=()=>send({kind:"WL_TOP_ERROR",code:"OFFLINE"}).catch(()=>{});
        const topOnline=()=>directoryScan(true);
        window.addEventListener("offline",topOffline);window.addEventListener("online",topOnline);
        topReady();directoryScan(true);
        globalThis.__weLearnPracticeCleanup=()=>{try{chrome.runtime.onMessage.removeListener(listener);}catch{};directoryObserver.disconnect();clearTimeout(directoryTimer);window.removeEventListener("offline",topOffline);window.removeEventListener("online",topOnline);};
        return;
    }
    if(!D.targetUrl(location.href)){send({kind:"WL_DIAGNOSTIC",code:"PAGE_CHANGED",stage:"unsupported-frame-route"}).catch(()=>{});return;}
    async function scan() {
        if(scanning)return;scanning=true;
        let stage="context";
        try {
            context=await send({kind:"WL_GET_CONTEXT"});
            stage="dom";
            const snapshot=D.snapshot(document,context.currentSco);
            stage="observe";
            const observed=await send({kind:"WL_OBSERVE",snapshot});
            if(observed.emptyDueAt&&observed.emptyDueAt!==emptyDue){
                clearTimeout(emptyTimer);emptyDue=observed.emptyDueAt;
                emptyTimer=setTimeout(async()=>{
                    try{
                        if(!navigator.onLine)C.fail("OFFLINE");
                        const current=D.snapshot(document,context.currentSco);
                        if(!current.loaded||!current.emptyConfirmed)C.fail("EMPTY_REVOKED");
                        await send({kind:"WL_EMPTY_ELAPSED",exerciseId:context.currentSco,emptyConfirmed:true});
                    }catch(e){await send({kind:"WL_DIAGNOSTIC",code:e.code||"PAGE_CHANGED",stage:"empty-countdown"}).catch(()=>{});}
                },Math.max(0,observed.emptyDueAt-Date.now()));
            }else if(!observed.emptyDueAt){clearTimeout(emptyTimer);emptyDue=null;}
        }catch(e){await send({kind:"WL_DIAGNOSTIC",code:e.code||"PAGE_CHANGED",stage:"scan-"+stage}).catch(()=>{});}finally{scanning=false;}
    }
    async function check(runId,id) {
        if(!navigator.onLine)C.fail("OFFLINE");
        const current=await send({kind:"WL_GET_CONTEXT"});
        if(current.currentSco!==id||current.scopeKey!==context.scopeKey)C.fail("PAGE_CHANGED");
        await send({kind:"WL_PULSE",runId});
    }
    function execute(m){
        busy=true;session.busy=true;activeCommand=m;
        (async()=>{
            try{
                if(m.kind==="WL_NAVIGATE") {
                    if(!navigator.onLine)C.fail("OFFLINE");
                    await send({kind:"WL_NAV_CHECK",runId:m.runId,next:m.next});
                    D.navigate(document,m.exerciseId,m.next);return;
                }
                await check(m.runId,m.exerciseId);
                if(m.kind==="WL_FILL") {
                    await D.fill(document,m.exerciseId,m.settings,()=>check(m.runId,m.exerciseId),
                        result=>send({kind:"WL_PROGRESS",runId:m.runId,result}),m.fieldIds);
                    await scan();await send({kind:"WL_FINISHED",runId:m.runId});
                }else{
                    const snap=D.snapshot(document,m.exerciseId);
                    if(snap.questions.some(q=>!q.matched)||snap.observedStatus!=="unsubmitted")C.fail("READBACK_FAILED");
                    await send({kind:"WL_CONSUME",runId:m.runId,nonce:m.nonce});
                    await check(m.runId,m.exerciseId);const submitted=await D.submit(document,m.exerciseId,()=>check(m.runId,m.exerciseId));
                    await send({kind:"WL_NATIVE_CONFIRMED",runId:m.runId,confirmed:submitted.confirmed});
                    await D.waitFor(document,()=>D.snapshot(document,m.exerciseId).observedStatus==="completed",20000,"UNCERTAIN_SUBMIT");
                    await scan();
                }
            }catch(e){await send({kind:"WL_ERROR",runId:m.runId,code:e.code || "PAGE_CHANGED",details:e.details||null}).catch(()=>{});}
            finally{
                busy=false;session.busy=false;activeCommand=null;
                const next=pendingSubmit;pendingSubmit=null;
                if(next)execute(next);
            }
        })();
    }
    const listener=(m,sender,reply)=>{
        if(m.kind==="WL_SCAN"){scan();reply({ok:true});return;}
        if(!["WL_FILL","WL_SUBMIT","WL_NAVIGATE"].includes(m.kind))return;
        if(busy){
            if(m.kind==="WL_SUBMIT"&&activeCommand?.kind==="WL_FILL"&&m.runId===activeCommand.runId&&m.exerciseId===activeCommand.exerciseId&&!pendingSubmit){pendingSubmit=m;reply({ok:true});}
            else reply({ok:false});return;
        }
        reply({ok:true});execute(m);
    };
    chrome.runtime.onMessage.addListener(listener);
    let debounce;
    const observer=new MutationObserver(()=>{clearTimeout(debounce);debounce=setTimeout(scan,350);});
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
    const offline=()=>send({kind:"WL_OFFLINE"}).catch(()=>{});
    window.addEventListener("online",scan);window.addEventListener("offline",offline);window.addEventListener("pageshow",scan);
    window.addEventListener("load",scan);document.addEventListener("readystatechange",scan);
    const initialTimer=setTimeout(scan,1500);
    globalThis.__weLearnPracticeCleanup=()=>{
        try{chrome.runtime.onMessage.removeListener(listener);}catch{}
        observer.disconnect();clearTimeout(debounce);clearTimeout(initialTimer);clearTimeout(emptyTimer);
        window.removeEventListener("online",scan);window.removeEventListener("offline",offline);window.removeEventListener("pageshow",scan);
        window.removeEventListener("load",scan);document.removeEventListener("readystatechange",scan);
    };
    scan();
})();

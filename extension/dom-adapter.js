(function (root) {
    "use strict";
    const core = root.WeLearnCore;
    const LEGACY = root.WeLearnLegacy;
    const COURSE = "New Era Academic English Graduate Students 1";
    function targetUrl(value) {
        try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "centercourseware.sflep.com" && decodeURIComponent(u.pathname).split("/")[1] === COURSE; }
        catch { return false; }
    }
    function visible(node) {
        if (!node?.isConnected || node.hidden) return false;
        const view = node.ownerDocument.defaultView;
        for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
            const s = view.getComputedStyle(n);
            if (s.display === "none" || s.visibility === "hidden" || n.hidden) return false;
        }
        return true;
    }
    function waitFor(doc,predicate,timeoutMs=10000,code="ENGINE_TIMEOUT"){
        return new Promise((resolve,reject)=>{
            let observer,timer;
            const done=(err,value)=>{observer?.disconnect();clearTimeout(timer);doc.defaultView.removeEventListener("offline",offline);doc.removeEventListener("input",test,true);doc.removeEventListener("change",test,true);err?reject(err):resolve(value);};
            const offline=()=>{const e=new Error("offline");e.code="OFFLINE";done(e);};
            const test=()=>{try{const value=predicate();if(value){done(null,value);return true;}}catch(e){if(!["DOM_PAGE_NOT_FOUND","DOM_PAGE_HIDDEN"].includes(e.code)){done(e);return true;}}return false;};
            if(test())return;
            observer=new doc.defaultView.MutationObserver(test);observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
            doc.defaultView.addEventListener("offline",offline,{once:true});
            doc.addEventListener("input",test,true);doc.addEventListener("change",test,true);
            timer=setTimeout(()=>{if(test())return;const e=new Error(code);e.code=code;done(e);},timeoutMs);
            test();
        });
    }
    function pageFor(doc, id) {
        const matches = [...doc.querySelectorAll('[data-controltype="page"][data-scoid]')].filter(n => n.dataset.scoid === id);
        if (!matches.length) core.fail("DOM_PAGE_NOT_FOUND");
        if (matches.length !== 1) core.fail("DOM_AMBIGUOUS_PAGE");
        if (!visible(matches[0])) core.fail("DOM_PAGE_HIDDEN");
        const rect=matches[0].getBoundingClientRect(),view=doc.defaultView;
        if(rect.width<=0||rect.height<=0||rect.right<=0||rect.left>=view.innerWidth||rect.bottom<=0||rect.top>=view.innerHeight)core.fail("DOM_PAGE_HIDDEN");
        return matches[0];
    }
    function controls(page) {
        return [...page.querySelectorAll('[data-controltype][data-id]')].filter(n =>
            ["choice", "multichoice", "tf", "filling", "fillinglong", "writing", "recording", "sentence_order"].includes(n.dataset.controltype.toLowerCase()));
    }
    function selectedOption(node) {
        const options = [...node.querySelectorAll('[data-itemtype="options"] > li')];
        const selected = options.filter(n => n.hasAttribute("data-choiced")&&["","yes","true","1"].includes(n.getAttribute("data-choiced").trim().toLowerCase()));
        return selected.length === 1 ? options.indexOf(selected[0]) : selected.length > 1 ? -2 : -1;
    }
    function candidate(node) {
        const kind = node.dataset.controltype.toLowerCase();
        if (kind === "choice") {
            const options = [...node.querySelectorAll('[data-itemtype="options"] > li')];
            const correct = options.filter(n => n.hasAttribute("data-solution"));
            return { type: "choice", expected: correct.length === 1 ? options.indexOf(correct[0]) : null, node, options };
        }
        if (["filling", "fillinglong"].includes(kind)) {
            const reference=node.hasAttribute("data-nostatistics");
            const fields = [...node.querySelectorAll('textarea[data-itemtype],input[data-itemtype="input"]')];
            const solutions = LEGACY.parseDataSolutionDom(node).filter(x => x.type === "blank");
            let value = solutions.length === 1 ? solutions[0].text : "";
            let basis="course-data-solution";
            if(!solutions.length&&kind==="fillinglong"&&node.dataset.id==="u1_27_f1"){
                const parts=[...node.querySelector('[data-itemtype="result"]')?.children||[]];
                const sample=parts[2]?.textContent.replace(/\s+/g," ").trim()||"";
                if(parts.length===3&&parts[0].textContent.trim()==="(Answers may vary.)"&&parts[1].textContent.trim()==="A sample introduction:"&&/\(The underlined sentence is the thesis statement\.\)$/.test(sample)){
                    value=sample.replace(/\s*\(The underlined sentence is the thesis statement\.\)$/,"").trim();
                    basis="course-sample-introduction";
                }
            }
            const maxLength=reference||kind==="fillinglong"?2000:160;
            const unambiguous = fields.length === 1 && value.length > 0 && value.length <= maxLength && !/[|<>\r\n]/.test(value);
            return { type: reference?"reference":"text", expected: unambiguous ? value : null, basis,node, field: fields[0] };
        }
        return { type: "unsupported:" + kind, expected: null, node };
    }
    function status(page) {
        const infos = [...page.querySelectorAll('[data-controltype="submitinfo"]')];
        const text = infos.map(n => n.textContent.trim()).join(" ");
        const flags=controls(page).map(n=>n.getAttribute("data-submitted")).filter(v=>v!==null).map(v=>v.trim().toLowerCase());
        if(flags.some(v=>!["","yes","true","1","no","false","0"].includes(v)))return {observedStatus:"unknown",result:null};
        const submitted = flags.some(v=>["","yes","true","1"].includes(v));
        const submitVisible=[...page.querySelectorAll('[data-controltype="submit"]')].some(visible);
        if (/尚未提交/.test(text) && !submitted && page.querySelector('[data-controltype="submit"]')) return { observedStatus: "unsubmitted", result: null };
        const saved=text.match(/最新答题时间\s*[:：]\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        if(saved && infos.some(visible))return {observedStatus:"completed",result:{source:"welearn-dom",kind:"ungraded",timestamp:saved[1],accuracy:null,correct:null,total:null}};
        const match = text.match(/最近答题正确率\s*[:：]\s*(\d+(?:\.\d+)?)\s*%/) || text.match(/首次答题正确率\s*[:：]\s*(\d+(?:\.\d+)?)\s*%/);
        if (match && submitted && infos.some(visible)) {
            const accuracy = Number(match[1]);
            const scored = controls(page).filter(n => !n.hasAttribute("data-nostatistics"));
            const marks = scored.map(n => n.getAttribute("data-iscorrect"));
            const allMarked = marks.length > 0 && marks.every(m => m === "yes" || m === "no" || m === "na");
            const grades=marks.filter(m=>m!=="na");
            const correct = allMarked&&grades.length ? grades.filter(m => m === "yes").length : null;
            const total = allMarked&&grades.length ? grades.length : null;
            if (total && Math.abs(correct * 100 / total - accuracy) > 1) return { observedStatus: "unknown", result: null };
            return { observedStatus: "completed", result: { source: "welearn-dom", accuracy, correct, total } };
        }
        if (submitted) return { observedStatus: "submitted_unknown", result: null };
        return { observedStatus: "unknown", result: null };
    }
    function snapshot(doc, id) {
        const started=performance.now();
        const page = pageFor(doc, id);
        const questions = controls(page).map(n => {
            const c = candidate(n);
            const actual = c.type === "choice" ? selectedOption(n) : c.field?.value || "";
            const occupied = c.type === "choice" ? actual !== -1 : actual !== "";
            return { id: n.dataset.id, type: c.type, hasCandidate: c.expected !== null, candidateBasis:c.basis||"course-data-solution",conflict: occupied && actual !== c.expected, matched: c.expected !== null && actual === c.expected };
        });
        const ready=doc.readyState==="complete"&&!page.querySelector("iframe")&&!page.querySelector('[aria-busy="true"]')&&page.textContent.trim().length>40;
        const other=controls(page).length||page.querySelector('[data-required],[data-solution],[data-controltype="submit"],input,textarea,[data-controltype*="record"]');
        const contentOnly=/Academic (?:Reading|Listening) Skill|Words & Expressions|>Text (?:One|Two)$|^Writing>Writing an Introduction$/.test(page.dataset.title||"");
        return { exerciseId: id, title: page.dataset.title || id, ...status(page), questions,loaded:ready,emptyConfirmed:Boolean(ready&&!other&&contentOnly),acquireMs:Math.round(performance.now()-started),
            catalog: [...doc.querySelectorAll('[data-controltype="page"][data-scoid]')].filter(n => /Ex\./.test(n.dataset.title || "")).map(n => ({ exerciseId:n.dataset.scoid, title:n.dataset.title, observedStatus:n === page ? status(n).observedStatus : "unknown" })) };
    }
    async function fill(doc, id, config, check, progress, selectedIds) {
        const ids = selectedIds || snapshot(doc,id).questions.map(q => q.id);
        const results = [];
        for (const fieldId of ids) {
            await check();
            const page = pageFor(doc, id);
            if (status(page).observedStatus !== "unsubmitted") core.fail("PAGE_CHANGED");
            const nodes = controls(page).filter(n => n.dataset.id === fieldId);
            if (nodes.length !== 1) core.fail("PAGE_CHANGED");
            const c = candidate(nodes[0]);
            if (c.expected === null) core.fail("NO_CANDIDATE");
            if (!["choice","text","reference"].includes(c.type)) core.fail("UNSUPPORTED_TYPE");
            if(c.field&&(c.field.disabled||c.field.readOnly||!c.field.isConnected))core.fail("READ_ONLY_FIELD");
            const actual = c.type === "choice" ? selectedOption(c.node) : c.field.value;
            const occupied = c.type === "choice" ? actual !== -1 : actual !== "";
            if (occupied && actual !== c.expected && !config.replaceDrafts) core.fail("DRAFT_CONFLICT");
            const start = performance.now();
            const shouldWrite=actual!==c.expected || (config.forceTextWrite&&c.type!=="choice");
            if (shouldWrite) {
                if (c.type === "choice") c.options[c.expected].click();
                else if (c.field.tagName === "TEXTAREA") LEGACY.writeTextareaAnswer(c.field,c.expected);
                else {
                    const view = doc.defaultView;
                    Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype,"value").set.call(c.field,c.expected);
                    c.field.dispatchEvent(new view.Event("input",{bubbles:true}));
                    c.field.dispatchEvent(new view.Event("change",{bubbles:true}));
                }
            }
            if(config.eventDriven!==false){
                const raf=doc.defaultView.requestAnimationFrame;
                if(raf)await new Promise(resolve=>raf.call(doc.defaultView,()=>raf.call(doc.defaultView,resolve)));
            }else await new Promise(resolve => setTimeout(resolve,config.delayMs));
            await check();
            await waitFor(doc,()=>{
                const fresh=controls(pageFor(doc,id)).find(n=>n.dataset.id===fieldId);
                if(!fresh)return false;
                const read=candidate(fresh),value=c.type==="choice"?selectedOption(fresh):read.field?.value;
                return value===c.expected&&read.expected===c.expected;
            },1500,"READBACK_FAILED").catch(e=>{
                const fresh=controls(pageFor(doc,id)).find(n=>n.dataset.id===fieldId),read=fresh&&candidate(fresh);
                const value=c.type==="choice"?(fresh?selectedOption(fresh):null):read?.field?.value;
                e.details={fieldId,type:c.type,expectedLength:String(c.expected).length,actualLength:String(value??"").length,candidateChanged:read?.expected!==c.expected,
                    expectedOption:c.type==="choice"?c.expected:null,actualOption:c.type==="choice"?value:null};throw e;
            });
            const fresh = controls(pageFor(doc,id)).find(n => n.dataset.id === fieldId);
            if (!fresh) core.fail("PAGE_CHANGED");
            const read = candidate(fresh);
            const value = c.type === "choice" ? selectedOption(fresh) : read.field?.value;
            if (value !== c.expected || read.expected !== c.expected) core.fail("READBACK_FAILED");
            const result = { id:fieldId,type:c.type,matched:true,ms:Math.round(performance.now()-start),wrote:Boolean(shouldWrite) };
            results.push(result); await progress(result);
        }
        return results;
    }
    async function submit(doc,id,check) {
        const page = pageFor(doc,id);
        if (status(page).observedStatus !== "unsubmitted") core.fail("COMPLETED");
        const commands = [...page.querySelectorAll('[data-controltype="submit"]')].filter(visible);
        if (commands.length !== 1 || commands[0].getAttribute("aria-disabled") === "true") core.fail("PAGE_CHANGED");
        commands[0].click();
        const prompt=commands[0].getAttribute("data-confirm");
        {
            const confirm=await waitFor(doc,()=>{
                const allowed=prompt?[prompt.trim()]:["您确定现在提交吗？","习题答案只能提交一次，您确定现在提交吗？"];
                const dialogs=[...doc.querySelectorAll(".layui-layer-dialog")].filter(visible).filter(n=>allowed.includes(n.querySelector(".layui-layer-content")?.textContent.trim()));
                if(dialogs.length===1){const button=dialogs[0].querySelector(".layui-layer-btn0");if(button&&visible(button))return button;}
                if(!prompt&&status(page).observedStatus==="completed")return "saved";
                return null;
            },4000,"UNCERTAIN_SUBMIT");
            if(confirm==="saved")return {confirmed:false};
            await check();confirm.click();
        }
        return {confirmed:true};
    }
    function navigate(doc,id,next) {
        const page=pageFor(doc,id);
        if(status(page).observedStatus!=="completed")core.fail("UNKNOWN_STATUS");
        const exact=[...doc.querySelectorAll('[data-controltype="gotopage"]')].filter(visible).filter(n=>(n.getAttribute("data-refids")||"").split("|").pop()===next);
        if(exact.length===1){exact[0].click();return;}
        const pages=[...doc.querySelectorAll('[data-controltype="page"][data-scoid]')];
        const index=pages.indexOf(page);
        const forward=[...doc.querySelectorAll('[data-id="nextcmd"]')].filter(visible);
        if(pages[index+1]?.dataset.scoid===next&&forward.length===1){forward[0].click();return;}
        core.fail("PAGE_CHANGED");
    }
    const api={ targetUrl, visible, pageFor, candidate, snapshot, fill, submit, navigate, status, selectedOption,waitFor };
    root.WeLearnDom=api;
    if(typeof module!=="undefined") module.exports=api;
})(globalThis);

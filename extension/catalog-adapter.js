(function(root){
    "use strict";
    const C=root.WeLearnCore;
    const text=node=>node.textContent.replace(/\s+/g," ").trim();
    function snapshot(doc){
        const catalog=doc.querySelector("#accordion-test-2");
        if(!catalog)C.fail("CATALOG_UNVERIFIED");
        const units=[...catalog.querySelectorAll('a[data-toggle="collapse"]')].filter(a=>a.querySelector(".progress_fix"));
        let completed=0,total=0;
        for(const unit of units){
            const match=text(unit.querySelector(".progress_fix")).match(/已完成\s*[:：]\s*(\d+)\s*\/\s*(\d+)/);
            if(!match)C.fail("CATALOG_UNVERIFIED");
            completed+=Number(match[1]);total+=Number(match[2]);
        }
        const seen=new Set(),items=[];
        for(const node of catalog.querySelectorAll("li.stu_testlist_1[onclick]")){
            const match=node.getAttribute("onclick").match(/^\s*(?:javascript:)?StartSCO\(['"](m-1-([1-8])-\d+)['"]\);?\s*$/);
            if(!match)continue;
            const exerciseId=match[1];
            if(seen.has(exerciseId))C.fail("CATALOG_UNVERIFIED");
            seen.add(exerciseId);
            const yes=node.querySelectorAll("i.fa-check-circle-o").length;
            const no=node.querySelectorAll("i.fa-circle").length;
            const observedStatus=yes===1&&no===0?"completed":no===1&&yes===0?"unsubmitted":"unknown";
            const title="B1U"+match[2]+" "+text(node.querySelector(":scope > span") || node);
            const scores=[...node.querySelectorAll(":scope > span")].map(text).filter(t=>/^\d+(?:\.\d+)?分$/.test(t));
            if(scores.length>1)C.fail("CATALOG_UNVERIFIED");
            items.push({exerciseId,title,observedStatus,score:scores.length?Number(scores[0].slice(0,-1)):null,
                eligible:/Ex\.\s*\d+/.test(title),node});
        }
        if(total!==225 || items.length!==225 || items.filter(r=>r.observedStatus==="completed").length!==completed || items.some(r=>r.observedStatus==="unknown"))C.fail("CATALOG_UNVERIFIED");
        return {completed,total,items:items.map(({node,...item})=>item)};
    }
    async function enter(doc,id,check){
        const snap=snapshot(doc),item=snap.items.find(r=>r.exerciseId===id);
        if(!item || item.observedStatus!=="unsubmitted")C.fail("COMPLETED");
        const nodes=[...doc.querySelectorAll("#accordion-test-2 li.stu_testlist_1[onclick]")].filter(n=>n.getAttribute("onclick").match(/StartSCO\(['"]([^'"]+)['"]\)/)?.[1]===id);
        if(nodes.length!==1)C.fail("CATALOG_UNVERIFIED");
        const node=nodes[0],panel=node.closest(".panel-collapse");
        if(panel && !panel.classList.contains("in") && !panel.classList.contains("show")){
            const links=[...doc.querySelectorAll('#accordion-test-2 a[data-toggle="collapse"]')].filter(a=>a.getAttribute("href")==="#"+panel.id);
            if(links.length!==1)C.fail("CATALOG_UNVERIFIED");
            await check();links[0].click();
            await root.WeLearnDom.waitFor(doc,()=>root.WeLearnDom.visible(node),2000,"PAGE_CHANGED");
        }
        await check();
        node.scrollIntoView({block:"center"});
        if(!root.WeLearnDom.visible(node))C.fail("PAGE_CHANGED");
        node.click();
    }
    function leave(doc){
        const matches=[...doc.querySelectorAll("a[href]")].filter(a=>/^javascript:\s*ReturnMain\(\);?$/i.test(a.getAttribute("href"))&&root.WeLearnDom.visible(a));
        if(matches.length!==1)C.fail("PAGE_CHANGED");
        matches[0].click();
    }
    root.WeLearnCatalog={snapshot,enter,leave};
    if(typeof module!=="undefined")module.exports=root.WeLearnCatalog;
})(globalThis);

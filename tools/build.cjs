const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib"),crypto=require("node:crypto"),ts=require("typescript");
const root=path.resolve(__dirname,".."),dest=path.join(root,"dist/edge");
fs.mkdirSync(dest,{recursive:true});
for(const file of fs.readdirSync(path.join(root,"extension"))){fs.copyFileSync(path.join(root,"extension",file),path.join(dest,file));}
const compiled=ts.transpileModule(fs.readFileSync(path.join(root,"src/projects/welearn/exercise/dataSolution/adapter.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
fs.writeFileSync(path.join(dest,"legacy-adapter.js"),'(function(root){"use strict";var exports={};\n'+compiled+'\nroot.WeLearnLegacy=exports;})(globalThis);\n');
const crc32=buffer=>{let c=0xffffffff;for(const byte of buffer){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);}
const glyph=["1000001","1000001","1000001","1001001","1010101","1100011","1000001"];
fs.mkdirSync(path.join(dest,"icons"),{recursive:true});
for(const size of [16,48,128]){
    const pixels=Buffer.alloc((size*4+1)*size),cell=size/10;
    for(let y=0;y<size;y++){pixels[y*(size*4+1)]=0;for(let x=0;x<size;x++){
        const gx=Math.floor((x-size*.15)/cell),gy=Math.floor((y-size*.15)/cell),white=glyph[gy]?.[gx]==="1";
        const offset=y*(size*4+1)+1+x*4;[pixels[offset],pixels[offset+1],pixels[offset+2],pixels[offset+3]]=white?[255,255,255,255]:[18,123,80,255];
    }}
    const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
    fs.writeFileSync(path.join(dest,"icons",size+".png"),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",zlib.deflateSync(pixels)),chunk("IEND",Buffer.alloc(0))]));
}
fs.copyFileSync(path.join(root,"docs/INSTALL.md"),path.join(dest,"INSTALL.md"));
fs.copyFileSync(path.join(root,"LICENSE"),path.join(dest,"LICENSE"));
const manifest=JSON.parse(fs.readFileSync(path.join(dest,"manifest.json")));
if(manifest.version_name!==require("../package.json").version)throw new Error("Version mismatch");
for(const file of ["background.js","core.js","capabilities.js","dom-adapter.js","catalog-adapter.js","content.js","popup.js","options.js","legacy-adapter.js"]){new Function(fs.readFileSync(path.join(dest,file),"utf8"));}
console.log(JSON.stringify({version:manifest.version_name,output:dest,manifestSha256:crypto.createHash("sha256").update(fs.readFileSync(path.join(dest,"manifest.json"))).digest("hex")},null,2));

const fs=require('fs'),vm=require('vm');
// node roundtrip.cjs <template-form.js> <dir with templates>: rewriting every block keeps the
// JSON and the text around it; prints what the form would mark in each template.
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const DIR=process.argv[3];
const TF=ctx.window.TemplateForm;
let bad=0;
for (const f of fs.readdirSync(DIR)) {
  const text=fs.readFileSync(DIR+'/'+f,'utf8');
  const m=TF._build(text);
  // rewrite every block unchanged
  let out=text; const bl=[...m.blocks].sort((a,b)=>b.start-a.start);
  for (const b of bl) out=out.slice(0,b.start)+TF._serialize(b.obj,text.slice(b.start,b.end))+out.slice(b.end);
  const m2=TF._build(out);
  const same=JSON.stringify(m.blocks.map(b=>b.obj))===JSON.stringify(m2.blocks.map(b=>b.obj));
  // text outside blocks unchanged
  const strip=(t,ms)=>{let r='',p=0;for(const b of ms.blocks){r+=t.slice(p,b.start)+'{}';p=b.end;}return r+t.slice(p);};
  const outside=strip(text,m)===strip(out,m2);
  if(!same||!outside){bad++;console.log('ROUNDTRIP FAIL',f,same,outside);}
  for (const t of m.tables) {
    const pr=TF._check(t);
    for (const k of Object.keys(pr)) { const [r,c]=k.split(':').map(Number);
      console.log(f.replace('.txt','').slice(0,45).padEnd(45), (t.base.obj.id+'').padEnd(12), 'r'+(r+1), (c<0?'(base)':t.cols[c].label+' '+t.cols[c].where).slice(0,30).padEnd(30), pr[k].slice(0,60)); }
  }
  if (process.env.V) console.log(f, 'tables', m.tables.map(t=>t.base.obj.id+':'+t.cols.map(c=>c.kind).join(',')).join(' | '), 'lists', m.lists.map(b=>b.obj.id).join(','));
}
console.log('roundtrip failures', bad);

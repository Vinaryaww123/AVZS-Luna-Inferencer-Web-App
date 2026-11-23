/* api.js — all calls to providers. Change endpoints or request bodies here. */

/* Authentication headers per API format. New providers that need custom headers: add a branch here. */
const oaMsg=x=>x.native?x.native:x.images?.length?{role:x.role,content:[{type:"text",text:x.content},...x.images.map(u=>({type:"image_url",image_url:{url:u}}))]}:{role:x.role,content:x.content}; // message + image in OpenAI format
const anMsg=x=>x.native||({role:x.role,content:x.images?.length?[...x.images.map(u=>{const d=splitUrl(u);return{type:"image",source:{type:"base64",media_type:d.mime,data:d.data}}}),{type:"text",text:x.content}]:x.content}); // Anthropic format
function hdr(p){
  const h={'Content-Type':'application/json'},k=key(p),t=P[p].t;
  if(t=='oa'&&k)h.Authorization='Bearer '+k;
  if(t=='an'){h['x-api-key']=k;h['anthropic-version']='2023-06-01';h['anthropic-dangerous-direct-browser-access']='true'}
  return h;
}
async function chk(r){if(!r.ok)throw new Error(r.status+' — '+(await r.text()).slice(0,300));return r}
async function post(p,u,b,sig){return(await chk(await fetch(u,{method:'POST',headers:hdr(p),body:JSON.stringify(b),signal:sig}))).json()}

async function* sse(r){
  const d=new TextDecoder(),rd=r.body.getReader();let b='';
  for(;;){
    const{done,value}=await rd.read();if(done)break;
    b+=d.decode(value,{stream:true});const L=b.split('\n');b=L.pop();
    for(const l of L)if(l.startsWith('data:')){const j=l.slice(5).trim();if(j&&j!='[DONE]')try{yield JSON.parse(j)}catch{}}
  }
}

/* Chat with streaming. on(text) is called whenever a text chunk arrives. */
async function stream(p,m,msgs,sys,on,sig,web,temp,tools,st){ // tools: MCP tools (optional); st: collector object {calls} // temp: temperature (optional; omitted when empty)
  const t=P[p].t;let u,b;
  // OpenAI-compatible: OpenAI, OpenRouter, Groq, Ollama, LM Studio, etc.
  if(t=='oa'){u=base(p)+'/chat/completions';b={model:m,stream:true,messages:sys?[{role:'system',content:sys},...msgs.map(oaMsg)]:msgs.map(oaMsg)}}
  // Anthropic Messages API (optional web search via tools)
  else if(t=='an'){u=base(p)+'/messages';b={model:m,max_tokens:4096,stream:true,messages:msgs.map(anMsg)};if(sys)b.system=sys;if(web)b.tools=[{type:'web_search_20250305',name:'web_search',max_uses:5}]}
  // Google Gemini (streamGenerateContent). Images are sent as inline_data
  else{u=gu(`/models/${m}:streamGenerateContent?alt=sse`);b={contents:msgs.map(x=>x.native||({role:x.role=='user'?'user':'model',parts:[...(x.images||[]).map(u=>{const d=splitUrl(u);return{inline_data:{mime_type:d.mime,data:d.data}}}),{text:x.content}]}))};if(sys)b.systemInstruction={parts:[{text:sys}]};if(web)b.tools=[{google_search:{}}]}
  if(temp!=null){if(t=='go')(b.generationConfig=b.generationConfig||{}).temperature=temp;else b.temperature=temp}
  if(tools?.length){ // tool definitions per provider format
    if(t=='oa')b.tools=tools.map(x=>({type:'function',function:{name:x.fn,description:x.description,parameters:x.schema}}));
    else if(t=='an')b.tools=[...(b.tools||[]),...tools.map(x=>({name:x.fn,description:x.description,input_schema:x.schema}))];
    else b.tools=[...(b.tools||[]),{functionDeclarations:tools.map(x=>({name:x.fn,description:x.description,parameters:geminiSchema(x.schema)}))}];
  }
  const r=await chk(await fetch(u,{method:'POST',headers:hdr(p),body:JSON.stringify(b),signal:sig}));
  const tc={}; // accumulated tool calls (index -> {id,fn,args})
  for await(const j of sse(r)){
    const x=t=='oa'?j.choices?.[0]?.delta?.content:t=='an'?(j.type=='content_block_delta'?j.delta?.text:''):j.candidates?.[0]?.content?.parts?.map(q=>q.text||'').join('');
    if(x)on(x);
    if(!st)continue;
    if(t=='oa'){for(const c of j.choices?.[0]?.delta?.tool_calls||[]){const o=tc[c.index??0]=tc[c.index??0]||{id:'',fn:'',args:''};if(c.id)o.id=c.id;if(c.function?.name)o.fn+=c.function.name;if(c.function?.arguments)o.args+=c.function.arguments}}
    else if(t=='an'){
      if(j.type=='content_block_start'&&j.content_block?.type=='tool_use')tc[j.index]={id:j.content_block.id,fn:j.content_block.name,args:''};
      else if(j.type=='content_block_delta'&&j.delta?.type=='input_json_delta'&&tc[j.index])tc[j.index].args+=j.delta.partial_json||'';
    }else for(const q of j.candidates?.[0]?.content?.parts||[])if(q.functionCall){const k=Object.keys(tc).length;tc[k]={id:'g'+k,fn:q.functionCall.name,args:JSON.stringify(q.functionCall.args||{}),part:q}}
  }
  if(st)st.calls=Object.values(tc).map(o=>{let a={};try{a=o.args?JSON.parse(o.args):{}}catch{}return{id:o.id,fn:o.fn,args:a,part:o.part}});
}

/* Model list from the provider */
async function models(p){
  if(P[p].t=='a1')return(await(await chk(await fetch(base(p)+'/sdapi/v1/sd-models'))).json()).map(x=>x.title); // A1111 checkpoint
  const g=P[p].t=='go',r=await chk(await fetch(g?gu('/models?pageSize=200'):base(p)+'/models',{headers:hdr(p)})),j=await r.json();
  return g?j.models.map(x=>x.name.replace('models/','')):(j.data||[]).map(x=>x.id);
}

/* Image: returns data/image URLs */
/* Image: returns an ARRAY of data URLs/URLs. Advanced setting values are read from gen('image',p) (see GEN in config.js).
   Each provider maps those values to its own API parameters; adjust here if a provider's API changes. */
const num=v=>v===''||v==null||isNaN(+v)?undefined:+v; // '' -> undefined (parameter omitted)
async function image(p,m,pr,sig){
  const g=gen('image',p),t=P[p].t,n=Math.max(1,num(g.n)||1),[w,h]=(g.size||'1024x1024').split('x').map(Number),loras=g.loras||[];
  const steps=num(g.steps),seed=num(g.seed);
  // Google: Imagen via :predict (supports multiple images), Gemini image via :generateContent (one image per request)
  if(t=='go'){
    const ar=g.ratio&&g.ratio!='1:1'?g.ratio:undefined;
    if(m.startsWith('imagen')){
      const r=await post(p,gu(`/models/${m}:predict`),{instances:[{prompt:pr}],parameters:{sampleCount:n,...(ar&&{aspectRatio:ar})}},sig);
      return r.predictions.map(x=>`data:${x.mimeType||'image/png'};base64,${x.bytesBase64Encoded}`);
    }
    const out=[];
    for(let i=0;i<n;i++){
      const gc={responseModalities:['TEXT','IMAGE'],...(ar&&{imageConfig:{aspectRatio:ar}})};
      const r=await post(p,gu(`/models/${m}:generateContent`),{contents:[{parts:[{text:pr}]}],generationConfig:gc},sig);
      const d=(r.candidates?.[0]?.content?.parts||[]).map(x=>x.inlineData||x.inline_data).find(Boolean);
      if(!d)throw new Error('Response did not contain an image. Choose a model that supports image output.');
      out.push(`data:${d.mimeType||d.mime_type||'image/png'};base64,${d.data}`);
    }
    return out;
  }
  // AUTOMATIC1111/Forge: LoRA via <lora:name:weight> syntax in the prompt; checkpoint via override_settings
  if(t=='a1'){
    const body={prompt:[pr,...loras.map(l=>`<lora:${l.n}:${l.w}>`)].join(' '),negative_prompt:g.neg||'',steps:steps||25,cfg_scale:num(g.cfg)||7,width:w,height:h,batch_size:n,seed:seed??-1};
    if(g.sampler)body.sampler_name=g.sampler;
    if(g.scheduler)body.scheduler=g.scheduler;
    if(m&&m!='default')body.override_settings={sd_model_checkpoint:m};
    const r=await post(p,base(p)+'/sdapi/v1/txt2img',body,sig);
    return r.images.map(b=>'data:image/png;base64,'+b);
  }
  // OpenAI-compatible /images/generations. Each provider has its own body: configure it here.
  let body,fmt='png';
  if(p=='together'){
    body={model:m,prompt:pr,width:w,height:h,n,response_format:'b64_json'};
    if(steps)body.steps=steps;
    if(seed!=null)body.seed=seed;
    if(g.neg)body.negative_prompt=g.neg;
    if(loras.length)body.image_loras=loras.map(l=>({path:l.n,scale:l.w})); // as documented by Together for FLUX LoRA models
  }else if(p=='xai')body={model:m,prompt:pr,n,response_format:'b64_json'};
  else{
    body={model:m,prompt:pr,n:/dall-e-3/.test(m)?1:n,size:g.size};
    if(p=='openai'){
      if(g.quality&&g.quality!='auto'&&/^(gpt-image|dall-e-3)/.test(m))body.quality=/dall-e-3/.test(m)?(g.quality=='high'?'hd':'standard'):g.quality;
      if(/^gpt-image/.test(m)){
        if(g.bg&&g.bg!='auto')body.background=g.bg;
        if(g.format&&g.format!='png'){body.output_format=g.format;fmt=g.format}
      }
    }
  }
  const r=await post(p,base(p)+'/images/generations',body,sig);
  return r.data.map(x=>x.b64_json?`data:image/${fmt};base64,`+x.b64_json:x.url);
}

/* Video: submit a job, poll until complete, then return a blob URL */
async function video(p,m,pr,out,sig){
  const g=gen('video',p); // advanced settings (GEN in config.js)
  if(p=='openai'){
    let j=await post(p,base(p)+'/videos',{model:m,prompt:pr,seconds:String(g.seconds),size:g.vsize},sig);
    while(j.status!='completed'){
      if(j.status=='failed')throw new Error(j.error?.message||'Video creation failed');
      out(`Status: ${j.status} (${j.progress||0}%)`);await sleep(5000);
      j=await(await chk(await fetch(base(p)+'/videos/'+j.id,{headers:hdr(p),signal:sig}))).json();
    }
    return URL.createObjectURL(await(await chk(await fetch(base(p)+`/videos/${j.id}/content`,{headers:hdr(p),signal:sig}))).blob());
  }
  if(p=='google'){
    const vp={aspectRatio:g.vratio,durationSeconds:num(g.dur)}; // Veo parameters; empty ones are omitted
    if(g.res)vp.resolution=g.res;
    if(g.vneg)vp.negativePrompt=g.vneg;
    if(num(g.vseed)!=null)vp.seed=num(g.vseed);
    let o=await post(p,gu(`/models/${m}:predictLongRunning`),{instances:[{prompt:pr}],parameters:vp},sig);
    while(!o.done){out('Video is processing…');await sleep(8000);o=await(await chk(await fetch(gu('/'+o.name),{signal:sig}))).json()}
    if(o.error)throw new Error(o.error.message);
    const uri=o.response.generateVideoResponse.generatedSamples[0].video.uri;
    return URL.createObjectURL(await(await chk(await fetch(uri+(uri.includes('?')?'&':'?')+'key='+encodeURIComponent(key(p)),{signal:sig}))).blob());
  }
  throw new Error('This provider does not support video generation');
}

/* ===== TOOLS (MCP) =====
   geminiSchema: Gemini only accepts a subset of the OpenAPI schema, so unsupported keys are removed.
   agent: tool-use loop. The model may call tools; results are sent back (in each provider's native format)
   until the model answers without tools, at most 6 rounds. tools: [{fn,server,tool,description,schema}];
   run(call) -> result text (created in js/ui.js: user confirmation + call to server.py). */
function geminiSchema(s){
  if(Array.isArray(s))return s.map(geminiSchema);
  if(!s||typeof s!='object')return s;
  const o={};
  for(const[k,v]of Object.entries(s)){
    if(['$schema','$id','$ref','$defs','definitions','additionalProperties','default','examples'].includes(k))continue;
    o[k]=k=='properties'?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,geminiSchema(b)])):geminiSchema(v);
  }
  if(Array.isArray(o.type))o.type=o.type.find(x=>x!='null')||'string';
  return o;
}
async function agent(p,m,msgs,sys,on,sig,temp,tools,run){
  const local=[...msgs],t=P[p].t;
  for(let i=0;i<6;i++){
    const st={};let said='';
    await stream(p,m,local,sys,x=>{said+=x;on(x)},sig,false,temp,tools,st);
    if(!st.calls.length)return;
    const res=[];
    for(const c of st.calls)res.push(await run(c)); // sequential, so confirmations appear one at a time
    if(t=='oa'){
      local.push({native:{role:'assistant',content:said||null,tool_calls:st.calls.map(c=>({id:c.id,type:'function',function:{name:c.fn,arguments:JSON.stringify(c.args)}}))}});
      st.calls.forEach((c,k)=>local.push({native:{role:'tool',tool_call_id:c.id,content:res[k]}}));
    }else if(t=='an'){
      local.push({native:{role:'assistant',content:[...(said?[{type:'text',text:said}]:[]),...st.calls.map(c=>({type:'tool_use',id:c.id,name:c.fn,input:c.args}))]}});
      local.push({native:{role:'user',content:st.calls.map((c,k)=>({type:'tool_result',tool_use_id:c.id,content:res[k]}))}});
    }else{
      local.push({native:{role:'model',parts:[...(said?[{text:said}]:[]),...st.calls.map(c=>c.part)]}});
      local.push({native:{role:'user',parts:st.calls.map((c,k)=>({functionResponse:{name:c.fn,response:{result:res[k]}}}))}});
    }
  }
  on('\n\n(Stopped: reached the 6-round tool-use limit.)');
}

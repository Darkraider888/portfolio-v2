/* DARKRAIDER STUDIO Step 4F - structured portfolio content managers.
 * Keeps all editable data inside the existing portfolio.json draft.
 * No credentials are stored in this file or in localStorage.
 * The existing authenticated /api/publish endpoint performs server-side publishing.
 */
(() => {
  'use strict';
  const EXTRA = new Set(['about','skills','research','education','contact','settings']);
  const $ = id => document.getElementById(id);
  const ui = {
    skillGroup: 0, skillItem: 0, publication: 0, interest: 0,
    researchTab: 'publications', education: 0, aboutTab: 'paragraphs',
    paragraph: 0, focus: 0
  };
  let current = null;

  function node(tag, className, contents) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (contents !== undefined) result.textContent = String(contents);
    return result;
  }
  function append(parent, ...items) { parent.append(...items.filter(Boolean)); return parent; }
  function button(label, click, opts = {}) {
    const el = node('button', `btn small${opts.danger ? ' danger' : ''}${opts.primary ? ' primary' : ''}`, label);
    el.type = 'button';
    if (opts.pressed !== undefined) el.setAttribute('aria-pressed', String(Boolean(opts.pressed)));
    el.disabled = Boolean(opts.disabled);
    el.addEventListener('click', click);
    return el;
  }
  function section(title, description) {
    const header = node('div', 'sectionhead');
    const copy = node('div');
    append(copy, node('div', 'eyebrow', 'DARKRAIDER STUDIO / CONTENT EDITOR'), node('h2', '', title), node('p', 'subtle', description));
    header.append(copy);
    return header;
  }
  function card(title, subtitle) {
    const result = node('section', 'content-card');
    if (title) result.append(node('h3', '', title));
    if (subtitle) result.append(node('p', 'content-muted', subtitle));
    return result;
  }
  function grid(parent) {const result=node('div','editor-grid');parent.append(result);return result;}
  function input(parent, label, target, key, options = {}) {
    const holder = node('div', 'field'+(options.full?' editor-full':''));
    const tag = options.multiline?'textarea':'input';
    const field = node(tag);
    const ident='field-'+Math.random().toString(36).slice(2,10);
    field.id=ident;
    field.value = target[key] == null?'':String(target[key]);
    if (tag === 'input') field.type = options.type||'text';
    if (options.multiline) field.rows=options.rows||3;
    if (options.maxLength) field.maxLength=options.maxLength;
    if (options.placeholder) field.placeholder=options.placeholder;
    const textLabel=node('label','',label);textLabel.htmlFor=ident;
    append(holder,textLabel,field);
    if(options.hint)holder.append(node('p','hint',options.hint));
    field.addEventListener('input',()=>{target[key]=field.value;current.markDirty();});
    if(options.onChange)field.addEventListener('change',options.onChange);
    parent.append(holder);
    return field;
  }
  function checkbox(parent,label,target,key) {
    const wrapper=node('label','content-check');
    const control=node('input');control.type='checkbox';control.checked=target[key]===true;
    append(wrapper,control,node('span','',label));
    control.addEventListener('change',()=>{target[key]=control.checked;current.markDirty();});
    parent.append(wrapper);return control;
  }
  function actions(parent, elements) {const line=node('div','content-actions');line.append(...elements);parent.append(line);return line;}
  function choose(parent, values, active, onSelect) {
    const list = node('div','content-list');
    for(let i=0;i<values.length;i++) {
      const label = String(values[i]||`Item ${i+1}`);
      list.append(button(label,()=>onSelect(i),{pressed:i===active}));
    }
    parent.append(list);
    return list;
  }
  function changeAndRedraw() {current.markDirty();redraw();}
  function redraw() {
    if(!current || !EXTRA.has(current.tab))return;
    const shell=$('extraPane');if(!shell)return;
    shell.replaceChildren(section(current.tab[0].toUpperCase()+current.tab.slice(1)+' Manager', descriptions[current.tab]));
    const stack=node('div','content-stack');shell.append(stack);
    ({skills:renderSkills,research:renderResearch,education:renderEducation,contact:renderContact,settings:renderSettings,about:renderAbout})[current.tab](stack);
  }
  const descriptions = {
    skills:'Manage technology categories, skill icons, names, and display order.',
    research:'Update publications, authors, DOI links, and research interests.',
    education:'Manage degrees, institutions, dates, and academic milestones.',
    contact:'Edit public email, professional links, and social profiles.',
    settings:'Edit site metadata and stage future display preferences.',
    about:'Edit biography paragraphs, focus areas, introductions, and quotes.'
  };

  function renderSkills(stack) {
    const skills=current.data.skills ||= [];
    const groupCard=card('Technology groups','Select a group, then edit its name, description, and technologies.');
    choose(groupCard,skills.map(g=>g.category||'Untitled group'),ui.skillGroup,i=>{ui.skillGroup=i;ui.skillItem=0;redraw();});
    actions(groupCard,[button('+ Add group',()=>{
      if(skills.length>=100)return alert('Limit reached: 100 groups.');
      skills.push({category:'New skill group',note:'',items:[]});ui.skillGroup=skills.length-1;ui.skillItem=0;changeAndRedraw();
    },{primary:true})]);stack.append(groupCard);
    if(!skills.length){stack.append(card('No groups yet','Use Add group to begin.'));return;}
    ui.skillGroup=Math.min(ui.skillGroup,skills.length-1);
    const group=skills[ui.skillGroup];group.items ||= [];
    const groupEdit=card('Edit group');
    const fields=grid(groupEdit);
    input(fields,'Category name',group,'category',{onChange:redraw,maxLength:120});
    input(fields,'Short group note',group,'note',{maxLength:300});
    actions(groupEdit,[
      button('↑ Move group',()=>move(skills,ui.skillGroup,-1,'skillGroup'),{disabled:ui.skillGroup===0}),
      button('↓ Move group',()=>move(skills,ui.skillGroup,1,'skillGroup'),{disabled:ui.skillGroup===skills.length-1}),
      button('Delete group',()=>{
        if(!confirm('Remove this skill group and its technologies from the draft?'))return;
        skills.splice(ui.skillGroup,1);ui.skillGroup=Math.max(0,ui.skillGroup-1);ui.skillItem=0;changeAndRedraw();
      },{danger:true})
    ]);stack.append(groupEdit);
    const technologies=card('Technologies','Select a skill to edit its label or image URL.');
    choose(technologies,group.items.map(it=>it.name||'Unnamed technology'),ui.skillItem,i=>{ui.skillItem=i;redraw();});
    actions(technologies,[button('+ Add technology',()=>{
      group.items.push({name:'New technology',iconUrl:null});ui.skillItem=group.items.length-1;changeAndRedraw();
    },{primary:true})]);
    if(group.items.length){
      ui.skillItem=Math.min(ui.skillItem,group.items.length-1);
      const item=group.items[ui.skillItem];const inner=grid(technologies);
      input(inner,'Technology',item,'name',{maxLength:120,onChange:redraw});
      input(inner,'Icon URL (optional)',item,'iconUrl',{placeholder:'https://skillicons.dev/icons?i=java',maxLength:2000});
      actions(technologies,[
        button('↑ Move',()=>move(group.items,ui.skillItem,-1,'skillItem'),{disabled:ui.skillItem===0}),
        button('↓ Move',()=>move(group.items,ui.skillItem,1,'skillItem'),{disabled:ui.skillItem===group.items.length-1}),
        button('Remove technology',()=>{if(!confirm('Remove this technology?'))return;group.items.splice(ui.skillItem,1);ui.skillItem=Math.max(0,ui.skillItem-1);changeAndRedraw();},{danger:true})
      ]);
    }
    stack.append(technologies);
  }

  function renderResearch(stack) {
    const research=current.data.research ||= {publications:[],interests:[]};
    research.publications ||= [];research.interests ||= [];
    const intro=card('Research introduction');
    input(intro,'Section introduction',research,'intro',{multiline:true,rows:3,maxLength:4000});stack.append(intro);
    const switcher=card('Research entries');
    actions(switcher,[button('Publications',()=>{ui.researchTab='publications';redraw();},{pressed:ui.researchTab==='publications'}),
      button('Interests',()=>{ui.researchTab='interests';redraw();},{pressed:ui.researchTab==='interests'})]);stack.append(switcher);
    if(ui.researchTab==='publications'){
      const pubs=research.publications;
      const panel=card('Publications','Manage titles, author list, journals, descriptions, and DOI links.');
      choose(panel,pubs.map(p=>p.title||'Untitled'),ui.publication,i=>{ui.publication=i;redraw();});
      actions(panel,[button('+ Add publication',()=>{pubs.push({title:'New publication',authors:[],journal:'',description:'',doiUrl:'',visible:true});ui.publication=pubs.length-1;changeAndRedraw();},{primary:true})]);
      if(pubs.length){
        ui.publication=Math.min(ui.publication,pubs.length-1);const pub=pubs[ui.publication];
        if(pub.visible===undefined)pub.visible=true;
        const fields=grid(panel);
        input(fields,'Paper title',pub,'title',{full:true,maxLength:240,onChange:redraw});
        input(fields,'Journal / conference',pub,'journal',{maxLength:200});
        input(fields,'DOI / publication link',pub,'doiUrl',{type:'url',maxLength:2000});
        const wrapper=node('div','field editor-full');const lbl=node('label','','Authors (comma separated)');
        const txt=node('textarea');txt.rows=2;txt.value=(pub.authors||[]).join(', ');
        txt.addEventListener('input',()=>{pub.authors=txt.value.split(',').map(a=>a.trim()).filter(Boolean);current.markDirty();});
        append(wrapper,lbl,txt);fields.append(wrapper);
        input(fields,'Summary / abstract',pub,'description',{full:true,multiline:true,rows:4,maxLength:6000});
        checkbox(panel,'Visible on portfolio',pub,'visible');
        actions(panel,[button('↑ Move',()=>move(pubs,ui.publication,-1,'publication'),{disabled:ui.publication===0}),
          button('↓ Move',()=>move(pubs,ui.publication,1,'publication'),{disabled:ui.publication===pubs.length-1}),
          button('Delete publication',()=>{if(!confirm('Delete this research publication from the draft?'))return;pubs.splice(ui.publication,1);ui.publication=Math.max(0,ui.publication-1);changeAndRedraw();},{danger:true})]);
      }
      stack.append(panel);
    } else {
      const interests=research.interests;const panel=card('Research interests');
      choose(panel,interests.map(i=>i.title||'Untitled'),ui.interest,i=>{ui.interest=i;redraw();});
      actions(panel,[button('+ Add interest',()=>{interests.push({title:'New interest',description:''});ui.interest=interests.length-1;changeAndRedraw();},{primary:true})]);
      if(interests.length){
        ui.interest=Math.min(ui.interest,interests.length-1);const item=interests[ui.interest];
        const fields=grid(panel);input(fields,'Title',item,'title',{onChange:redraw});
        input(fields,'What you study',item,'description',{multiline:true,full:true});
        actions(panel,[button('↑ Move',()=>move(interests,ui.interest,-1,'interest'),{disabled:ui.interest===0}),
          button('↓ Move',()=>move(interests,ui.interest,1,'interest'),{disabled:ui.interest===interests.length-1}),
          button('Delete interest',()=>{if(!confirm('Remove this interest?'))return;interests.splice(ui.interest,1);ui.interest=Math.max(0,ui.interest-1);changeAndRedraw();},{danger:true})]);
      }
      stack.append(panel);
    }
  }

  function renderEducation(stack) {
    const records=current.data.education ||= [];
    const panel=card('Education & academic history','Add degrees, courses, institutions, and dates.');
    choose(panel,records.map(r=>r.title||'Untitled'),ui.education,i=>{ui.education=i;redraw();});
    actions(panel,[button('+ Add education',()=>{
      if(records.length>=50)return alert('The publisher allows 50 entries.');
      records.push({period:'',title:'New education entry',institution:'',location:''});ui.education=records.length-1;changeAndRedraw();
    },{primary:true})]);
    if(records.length){
      ui.education=Math.min(ui.education,records.length-1);const item=records[ui.education];
      const fields=grid(panel);
      input(fields,'Degree / achievement',item,'title',{full:true,maxLength:250,onChange:redraw});
      input(fields,'Institution',item,'institution',{maxLength:250});
      input(fields,'Period',item,'period',{placeholder:'2023 – Present'});
      input(fields,'Location',item,'location');
      actions(panel,[button('↑ Move',()=>move(records,ui.education,-1,'education'),{disabled:ui.education===0}),
        button('↓ Move',()=>move(records,ui.education,1,'education'),{disabled:ui.education===records.length-1}),
        button('Delete',()=>{if(!confirm('Remove this education entry?'))return;records.splice(ui.education,1);ui.education=Math.max(0,ui.education-1);changeAndRedraw();},{danger:true})]);
    }
    stack.append(panel);
  }

  function renderContact(stack) {
    const info=current.data.contact ||= {};
    const panel=card('Public contact details','Only enter public URLs. Changes are saved to the existing JSON draft.');
    const fields=grid(panel);
    for(const [key,label] of [['email','Email'],['github','GitHub'],['linkedin','LinkedIn'],['orcid','ORCID'],['googleScholar','Google Scholar'],['x','X / Twitter'],['instagram','Instagram']]){
      input(fields,label,info,key,{type:key==='email'?'email':'url',maxLength:2000});
    }
    stack.append(panel);
  }

  function renderSettings(stack) {
    const site=current.data.site ||= {};
    const metadata=card('Website metadata','Title, SEO description, canonical address, social image, favicon and CV link.');
    const fields=grid(metadata);
    input(fields,'Site title',site,'title',{full:true,maxLength:240});
    input(fields,'SEO description',site,'description',{full:true,multiline:true,maxLength:4000});
    input(fields,'Website URL',site,'siteUrl',{full:true,type:'url',maxLength:2000});
    input(fields,'Social sharing image (URL or asset path)',site,'image',{maxLength:2000});
    input(fields,'Favicon (URL or asset path)',site,'favicon',{maxLength:2000});
    input(fields,'Resume / CV PDF (URL or asset path)',site,'resume',{full:true,maxLength:2000});
    stack.append(metadata);
    const appearance=site.appearance ||= {theme:'system',accent:'#e50914'};
    const design=card('Appearance preferences','Saved for the later public-portfolio integration. The current design is unchanged.');
    const look=grid(design);
    input(look,'Preferred accent color',appearance,'accent',{placeholder:'#e50914'});
    const wrap=node('div','field'),label=node('label','','Preferred theme'),select=node('select');
    for(const choice of ['system','dark','light']){const o=node('option','',choice);o.value=choice;select.append(o)}select.value=appearance.theme||'system';
    select.addEventListener('change',()=>{appearance.theme=select.value;current.markDirty();});append(wrap,label,select);look.append(wrap);
    design.append(node('p','content-editor-hint','These preferences are stored now; public styling will be connected after the admin dashboard is completed.'));
    stack.append(design);
    const features=site.features ||= {};
    const flags=card('Feature toggles','Staged controls for the public portfolio upgrade.');
    for(const [key,label] of [['showKeyboard','Interactive keyboard navigation'],['showPong','Auto-playing Pong game'],['showResearch','Research section'],['showCertifications','Certificate section'],['showProjects','Project section']]){
      if(features[key]===undefined)features[key]=key==='showKeyboard'||key==='showPong'?false:true;
      checkbox(flags,label,features,key);
    }
    flags.append(node('p','content-editor-hint','Feature switches are not active on the public page yet. Publishing stores values safely for the next phase.'));
    stack.append(flags);
  }

  function renderAbout(stack) {
    const about=current.data.about ||= {paragraphs:[],focusAreas:[]};
    const hero=card('About introduction');const fields=grid(hero);
    input(fields,'Section headline',about,'headline',{full:true,maxLength:300});
    input(fields,'Introduction',about,'intro',{full:true,multiline:true,rows:3,maxLength:6000});
    input(fields,'Personal quote',about,'quote',{full:true,maxLength:1000});stack.append(hero);
    const switcher=card('About details');
    actions(switcher,[button('Paragraphs',()=>{ui.aboutTab='paragraphs';redraw();},{pressed:ui.aboutTab==='paragraphs'}),
      button('Focus areas',()=>{ui.aboutTab='focus';redraw();},{pressed:ui.aboutTab==='focus'})]);stack.append(switcher);
    if(ui.aboutTab==='paragraphs'){
      about.paragraphs ||= [];const arr=about.paragraphs;const panel=card('Biography paragraphs');
      choose(panel,arr.map((p,i)=>p.slice(0,35)||`Paragraph ${i+1}`),ui.paragraph,i=>{ui.paragraph=i;redraw();});
      actions(panel,[button('+ Add paragraph',()=>{arr.push('New paragraph');ui.paragraph=arr.length-1;changeAndRedraw();},{primary:true})]);
      if(arr.length){ui.paragraph=Math.min(ui.paragraph,arr.length-1);const txt=node('textarea');txt.rows=5;txt.value=arr[ui.paragraph];txt.setAttribute('aria-label','About paragraph');
        const index=ui.paragraph;txt.addEventListener('input',()=>{arr[index]=txt.value;current.markDirty();});panel.append(txt);
        actions(panel,[button('↑ Move',()=>move(arr,ui.paragraph,-1,'paragraph'),{disabled:ui.paragraph===0}),
          button('↓ Move',()=>move(arr,ui.paragraph,1,'paragraph'),{disabled:ui.paragraph===arr.length-1}),
          button('Delete paragraph',()=>{if(!confirm('Remove this paragraph?'))return;arr.splice(ui.paragraph,1);ui.paragraph=Math.max(0,ui.paragraph-1);changeAndRedraw();},{danger:true})]);}
      stack.append(panel);
    }else{
      about.focusAreas ||= [];const arr=about.focusAreas;const panel=card('Professional focus areas');
      choose(panel,arr.map(x=>x.title||'Untitled'),ui.focus,i=>{ui.focus=i;redraw();});
      actions(panel,[button('+ Add focus area',()=>{arr.push({title:'New focus area',description:'',icon:'fa-solid fa-code'});ui.focus=arr.length-1;changeAndRedraw();},{primary:true})]);
      if(arr.length){ui.focus=Math.min(ui.focus,arr.length-1);const item=arr[ui.focus],fields=grid(panel);
        input(fields,'Title',item,'title',{onChange:redraw});input(fields,'Font Awesome icon',item,'icon');input(fields,'Description',item,'description',{full:true,multiline:true});
        actions(panel,[button('↑ Move',()=>move(arr,ui.focus,-1,'focus'),{disabled:ui.focus===0}),
          button('↓ Move',()=>move(arr,ui.focus,1,'focus'),{disabled:ui.focus===arr.length-1}),
          button('Delete focus area',()=>{if(!confirm('Remove this focus area?'))return;arr.splice(ui.focus,1);ui.focus=Math.max(0,ui.focus-1);changeAndRedraw();},{danger:true})]);}
      stack.append(panel);
    }
  }

  function move(records,index,direction,stateKey){
    const next=index+direction;if(next<0||next>=records.length)return;
    [records[index],records[next]]=[records[next],records[index]];
    ui[stateKey]=next;changeAndRedraw();
  }

  function fileToBase64(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('File could not be read.'));
      reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
      reader.readAsDataURL(file);
    });
  }
  async function uploadProfile(kind,control,buttonEl){
    if(!current?.data)return;
    const file=control.files?.[0];if(!file)return;
    const mimeOk=kind==='resume'?file.type==='application/pdf':['image/jpeg','image/png','image/webp'].includes(file.type);
    if(!mimeOk || file.size<1 || file.size>2*1024*1024){alert('Choose a valid file under 2 MB. Photo: JPG/PNG/WebP. CV: PDF.');return;}
    buttonEl.disabled=true;
    current.status('Uploading '+(kind==='resume'?'CV':'profile photo')+' to GitHub…');
    try{
      const response=await fetch('/api/media',{
        method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({kind,mimeType:file.type,base64:await fileToBase64(file)})
      });
      const result=await response.json();
      const root=kind==='resume'?'assets/files/resume-':'assets/images/profile-';
      if(!response.ok)throw new Error(result.error||'Upload was rejected.');
      if(!result.uploaded||result.branch!=='portfolio-admin'||typeof result.path!=='string'||!result.path.startsWith(root)){
        throw new Error('Unexpected upload location. Verify GitHub.');
      }
      if(kind==='resume')current.data.site.resume=result.path;
      else {
        current.data.profile.profileImage=result.path;
        current.data.site.image=result.path;
      }
      current.markDirty();onProfile(current.data,current.markDirty,current.status);
      current.status('Uploaded to GitHub. Click Publish to GitHub to attach the file to your profile.');
    } catch(error){
      current.status('Profile upload failed: '+error.message);
      alert('Upload failed: '+error.message);
    } finally{buttonEl.disabled=false;control.value='';}
  }

  function onProfile(data,markDirty,status) {
    if(!data)return;
    current={...current,data,markDirty,status};
    const form=$('profileForm');if(!form)return;
    let extra=$('profileExtras');
    if(!extra){
      extra=node('div','profile-extras');extra.id='profileExtras';
      extra.append(node('h3','','Photo, CV and additional details'));
      const fields=grid(extra);
      for(const [id,label,obj,key] of [['extraUsername','GitHub username','profile','username'],['extraUniversity','University','profile','university'],['extraImage','Profile photo URL or asset path','profile','profileImage'],['extraResume','Resume PDF URL or asset path','site','resume']]){
        const wrap=node('div','field');const l=node('label','',label);l.htmlFor=id;
        const inputEl=node('input');inputEl.id=id;inputEl.type='text';
        inputEl.addEventListener('input',()=>{
          current.data[obj][key]=inputEl.value;
          if(id==='extraImage')current.data.site.image=inputEl.value;
          current.markDirty();renderProfileMediaPreview();
        });
        append(wrap,l,inputEl);fields.append(wrap);
      }
      const media=node('div','profile-media-grid');
      for(const [kind,label,accept] of [['profile-photo','Upload profile photo','image/jpeg,image/png,image/webp'],['resume','Upload CV / resume PDF','application/pdf']]){
        const panel=card(label,'Maximum 2 MB. Upload first, then publish the portfolio JSON.');
        const chooser=node('input');chooser.type='file';chooser.accept=accept;chooser.setAttribute('aria-label',label);
        const send=button('↑ Upload to GitHub',()=>uploadProfile(kind,chooser,send),{primary:true});
        panel.append(chooser,send);media.append(panel);
      }
      extra.append(media);
      const preview=node('div','',undefined);preview.id='profileExtraPreview';extra.append(preview);
      const warning=node('p','hint','Replacing photo or CV updates its link; the old public file stays in GitHub until separately removed.');extra.append(warning);
      form.append(extra);
    }
    for(const [id,value] of [['extraUsername',data.profile.username],['extraUniversity',data.profile.university],
      ['extraImage',data.profile.profileImage],['extraResume',data.site?.resume]]){
      const item=$(id);if(item)item.value=value||'';
    }
    renderProfileMediaPreview();
  }
  function renderProfileMediaPreview(){
    const host=$('profileExtraPreview');if(!host||!current?.data)return;
    host.replaceChildren();const path=current.data.profile.profileImage;
    if(path && /^(https?:\/\/|assets\/)/i.test(path)){
      const pic=node('img','profile-picture-preview');pic.alt='Profile photo preview';pic.src=path;pic.loading='lazy';
      pic.onerror=()=>pic.remove();host.append(pic);
    }
    const href=current.data.site?.resume;
    if(href&&/^(https?:\/\/|assets\/)/i.test(href)){
      const link=node('a','btn small','↗ Preview resume');link.href=href;link.target='_blank';link.rel='noopener noreferrer';host.append(link);
    }
  }

  window.DarkraiderSections={
    isExtra(tab){return EXTRA.has(tab);},
    render(tab,data,markDirty,status){if(!EXTRA.has(tab))return;current={tab,data,markDirty,status};redraw();},
    onProfile
  };
})();

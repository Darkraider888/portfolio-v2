/* DARKRAIDER STUDIO Step 4G - structured content and managed media library.
 * Keeps all editable data inside the existing portfolio.json draft.
 * No credentials are stored in this file or in localStorage.
 * The existing authenticated /api/publish endpoint performs server-side publishing.
 */
(() => {
  'use strict';
  const EXTRA = new Set(['about','skills','research','education','contact','settings','media']);
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
    ({skills:renderSkills,research:renderResearch,education:renderEducation,contact:renderContact,settings:renderSettings,about:renderAbout,media:renderMedia})[current.tab](stack);
  }
  const descriptions = {
    skills:'Manage technology categories, skill icons, names, and display order.',
    research:'Update publications, authors, DOI links, and research interests.',
    education:'Manage degrees, institutions, dates, and academic milestones.',
    contact:'Edit public email, professional links, and social profiles.',
    settings:'Edit site metadata and stage future display preferences.',
    about:'Edit biography paragraphs, focus areas, introductions, and quotes.',
    media:'Browse, reuse, and safely remove uploaded project and certificate files.'
  };

  // Site section label stays "Tech Arsenal"; the admin navigation stays "Skills".
  const TECH_DEFAULTS = Object.freeze({
    headline:'The tools behind the', accent:'work.',
    intro:'No arbitrary percentage bars. These are technologies I have used, studied or worked with in projects and coursework. Hover over a logo to see its name.'
  });
  const TECH_PRESETS = Object.freeze([
    ['Java','java'],['Python','python'],['C','c'],['C++','cpp'],['JavaScript','js'],
    ['TypeScript','ts'],['HTML5','html'],['CSS3','css'],['PHP','php'],['Spring','spring'],
    ['React','react'],['Next.js','nextjs'],['Node.js','nodejs'],['Flask','flask'],
    ['TensorFlow','tensorflow'],['MongoDB','mongodb'],['MySQL','mysql'],['PostgreSQL','postgres'],
    ['SQLite','sqlite'],['Docker','docker'],['Git','git'],['GitHub','github'],
    ['Vercel','vercel'],['Linux','linux'],['Ubuntu','ubuntu'],['Kali Linux','kali'],
    ['VS Code','vscode'],['IntelliJ IDEA','idea'],['AWS','aws'],['Go','go'],
    ['Rust','rust'],['Kotlin','kotlin'],['Figma','figma'],['Tailwind CSS','tailwind']
  ]);
  const techUrl = id => `https://skillicons.dev/icons?i=${encodeURIComponent(id)}`;
  const validSkillImage = url => {
    if(typeof url !== 'string' || !url.trim()) return '';
    const str=url.trim();
    if(/^assets\/[a-z0-9_./-]+$/i.test(str) && !str.split('/').includes('..'))return str;
    try {const parsed=new URL(str);return ['https:','http:'].includes(parsed.protocol)?parsed.href:'';}
    catch{return '';}
  };
  // Media uploads commit to GitHub before Vercel deploys. An older Preview URL
  // does not contain the new asset yet. Show its local bytes immediately, then
  // fall back to the public repository when the current deployment returns 404.
  const recentlyUploadedSkillIcons = new Map();
  const managedSkillIconPattern = /^assets\/skills\/icon-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i;
  let latestSkillUploadPath = '';
  function setSkillPreviewSource(image, originalUrl, onFailure) {
    const src = validSkillImage(originalUrl);
    if(!src){onFailure();return;}
    const savedPreview = recentlyUploadedSkillIcons.get(src);
    const repositoryPreview = managedSkillIconPattern.test(src)
      ? `https://raw.githubusercontent.com/Darkraider888/portfolio-v2/portfolio-admin/${src}` : '';
    image.onerror = () => {
      if(repositoryPreview && image.src !== repositoryPreview){
        image.onerror = onFailure;
        image.src = repositoryPreview;
      }else onFailure();
    };
    image.src = savedPreview || src;
  }
  function skillText(label) {return (label||'Tech').slice(0,9);}
  function renderSkillPreview(container) {
    if(!container || !current?.data)return;
    const meta=current.data.skillsSection || {};
    const groups=Array.isArray(current.data.skills)?current.data.skills:[];
    container.replaceChildren();
    const shell=node('div','skill-preview-panel');
    shell.append(node('p','skill-preview-kicker','03 · Tech Arsenal'));
    const heading=node('h3','skill-preview-title');
    heading.append(document.createTextNode((meta.headline || TECH_DEFAULTS.headline)+' '),
      node('em','',meta.accent || TECH_DEFAULTS.accent));
    shell.append(heading,node('p','skill-preview-intro',meta.intro || TECH_DEFAULTS.intro));
    const columns=node('div','skill-preview-groups');
    groups.forEach(group=>{
      if(!group || !group.category)return;
      const part=node('section','skill-preview-group');
      part.append(node('h4','',group.category));
      if(group.note)part.append(node('p','',group.note));
      const icons=node('div','skill-preview-icons');
      (Array.isArray(group.items)?group.items:[]).forEach(skill=>{
        if(!skill?.name)return;
        const cell=node('span','skill-preview-tech');cell.title=skill.name;
        const url=validSkillImage(skill.iconUrl);
        if(url){
          const pic=node('img');pic.alt=skill.name;pic.loading='lazy';
          setSkillPreviewSource(pic,url,()=>cell.replaceChildren(node('span','',skillText(skill.name))));
          cell.append(pic);
        }else cell.append(node('span','',skillText(skill.name)));
        icons.append(cell);
      });
      part.append(icons);columns.append(part);
    });
    shell.append(columns);container.append(shell);
  }
  function fileToBase64ForSkill(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Cannot read selected icon.'));
      reader.onload=()=>{
        const value=String(reader.result||'');const marker=value.indexOf(',');
        if(marker<0)reject(new Error('Invalid image data.'));
        else resolve(value.slice(marker+1));
      };
      reader.readAsDataURL(file);
    });
  }
  function renderSkills(stack) {
    const skills=current.data.skills ||= [];
    const metadata=current.data.skillsSection ||= {...TECH_DEFAULTS};
    const header=card('Tech Arsenal heading','These fields update the public section title and introduction. The Skills tab name stays unchanged.');
    const headingFields=grid(header);
    input(headingFields,'Heading text',metadata,'headline',{maxLength:180});
    input(headingFields,'Highlighted heading',metadata,'accent',{maxLength:180});
    input(headingFields,'Section introduction',metadata,'intro',{full:true,multiline:true,rows:3,maxLength:1600});
    stack.append(header);
    const groupCard=card('Technology groups','Select a group, then edit its name, description, and technologies.');
    choose(groupCard,skills.map(g=>g.category||'Untitled group'),ui.skillGroup,i=>{ui.skillGroup=i;ui.skillItem=0;redraw();});
    actions(groupCard,[button('+ Add group',()=>{
      if(skills.length>=100)return alert('Limit reached: 100 groups.');
      skills.push({category:'New skill group',note:'',items:[]});ui.skillGroup=skills.length-1;ui.skillItem=0;changeAndRedraw();
    },{primary:true})]);stack.append(groupCard);
    if(skills.length){
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
        const item=group.items[ui.skillItem],inner=grid(technologies);
        input(inner,'Technology',item,'name',{maxLength:120,onChange:redraw});
        const iconField=input(inner,'Icon URL (optional)',item,'iconUrl',{
          full:true,placeholder:'https://skillicons.dev/icons?i=java',maxLength:2000,
          hint:'Use an image URL, the icon picker below, or upload your own PNG/JPG/WebP.'
        });
        actions(technologies,[
          button('↑ Move',()=>move(group.items,ui.skillItem,-1,'skillItem'),{disabled:ui.skillItem===0}),
          button('↓ Move',()=>move(group.items,ui.skillItem,1,'skillItem'),{disabled:ui.skillItem===group.items.length-1}),
          button('Remove icon',()=>{item.iconUrl=null;current.markDirty();iconField.value='';renderSkillPreview($('skillLivePreview'));}),
          button('Remove technology',()=>{if(!confirm('Remove this technology?'))return;group.items.splice(ui.skillItem,1);ui.skillItem=Math.max(0,ui.skillItem-1);changeAndRedraw();},{danger:true})
        ]);
        stack.append(technologies);
        const picker=card('Choose an icon','Click any of these common technology icons to assign it to the selected skill. You can still paste any valid icon URL.');
        const searchWrap=node('div','field');const label=node('label','','Search icons');
        const search=node('input');search.type='search';search.placeholder='Search Java, Docker, Linux…';
        append(searchWrap,label,search);picker.append(searchWrap);
        const list=node('div','skill-icon-browser');
        const renderChoices=()=>{
          list.replaceChildren();
          const term=search.value.toLowerCase().trim();
          for(const [name,id] of TECH_PRESETS.filter(([n,i])=>(n+' '+i).toLowerCase().includes(term))){
            const choice=node('button','skill-icon-choice');choice.type='button';
            const url=techUrl(id);
            choice.setAttribute('aria-label','Use '+name+' icon');
            choice.setAttribute('aria-pressed',String(item.iconUrl===url));
            const img=node('img');img.src=url;img.alt='';img.loading='lazy';
            choice.append(img,node('span','',name));
            choice.addEventListener('click',()=>{
              item.iconUrl=url;iconField.value=url;current.markDirty();
              renderChoices();renderSkillPreview($('skillLivePreview'));
            });
            list.append(choice);
          }
          if(!list.childElementCount)list.append(node('p','content-muted','No preset icons match. You can paste a URL instead.'));
        };
        search.addEventListener('input',renderChoices);renderChoices();picker.append(list);
        stack.append(picker);
        const upload=card('Upload your own technology icon','JPG, PNG, or WebP · maximum 2 MB. SVG and executable files are not accepted.');
        const bar=node('div','skill-file-toolbar');
        const file=node('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';
        file.setAttribute('aria-label','Choose a custom skill icon');
        const fileInfo=node('div','filepreview');
        fileInfo.setAttribute('role','status');
        fileInfo.setAttribute('aria-live','polite');
        const uploadHelp=node('p','skill-icon-hint',
          latestSkillUploadPath===item.iconUrl && latestSkillUploadPath
            ? 'Icon uploaded and previewed locally. Click Publish to GitHub, then open the newest Vercel Preview deployment.'
            : 'Choose an icon to see it before upload. After uploading, Publish to GitHub to attach it.');
        let selectedDataUrl='';
        const action=button('↑ Upload icon to GitHub',async()=>{
          const selected=file.files?.[0];if(!selected || !selectedDataUrl)return;
          if(!['image/png','image/jpeg','image/webp'].includes(selected.type)||selected.size<1||selected.size>2*1024*1024){
            fileInfo.textContent='Choose a PNG, JPG or WebP image under 2 MB.';return;
          }
          action.disabled=true;file.disabled=true;
          const oldLabel=action.textContent;
          action.textContent='Uploading icon…';
          uploadHelp.textContent='Sending the selected image to your GitHub Preview branch…';
          current.status('Uploading '+selected.name+' to GitHub…');
          try{
            const base64=selectedDataUrl.slice(selectedDataUrl.indexOf(',')+1);
            const resp=await fetch('/api/media',{
              method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({kind:'skill-icon',mimeType:selected.type,base64})
            });
            let result;
            try{result=await resp.json()}
            catch{throw Error('The upload endpoint did not return JSON (HTTP '+resp.status+'). Check the latest Vercel Preview deployment.');}
            if(!resp.ok)throw Error(result?.error||'Upload failed (HTTP '+resp.status+').');
            if(!result.uploaded||result.branch!=='portfolio-admin'||
                !managedSkillIconPattern.test(result.path)){
              throw Error('GitHub did not confirm the expected skill icon path.');
            }
            // Keep a local preview of the uploaded file while Vercel builds the new version.
            recentlyUploadedSkillIcons.set(result.path,selectedDataUrl);
            if(recentlyUploadedSkillIcons.size>8){
              recentlyUploadedSkillIcons.delete(recentlyUploadedSkillIcons.keys().next().value);
            }
            latestSkillUploadPath=result.path;
            item.iconUrl=result.path;current.markDirty();
            invalidateMedia();
            current.status('Icon uploaded for '+item.name+'. Click Publish to GitHub to save the link.');
            redraw();
          }catch(error){
            uploadHelp.textContent='Upload failed. Your selected file is still here; you can retry.';
            current.status('Icon upload failed: '+error.message);
            alert('Icon upload failed: '+error.message);
          }finally{
            action.textContent=oldLabel;
            file.disabled=false;
            action.disabled=!selectedDataUrl;
          }
        },{primary:true,disabled:true});
        file.addEventListener('change',async()=>{
          selectedDataUrl='';action.disabled=true;fileInfo.replaceChildren();
          const selected=file.files?.[0];if(!selected)return;
          if(!['image/png','image/jpeg','image/webp'].includes(selected.type)||selected.size<1||selected.size>2*1024*1024){
            fileInfo.textContent='Unsupported image or over 2 MB. Select a JPG, PNG or WebP image smaller than 2 MB.';
            return;
          }
          fileInfo.textContent='Preparing icon preview…';
          try{
            const base64=await fileToBase64ForSkill(selected);
            if(file.files?.[0]!==selected)return;
            selectedDataUrl=`data:${selected.type};base64,${base64}`;
            const thumb=node('span','thumb');
            const image=node('img');image.src=selectedDataUrl;image.alt='Selected icon preview';
            thumb.append(image,node('span','',selected.name));
            fileInfo.replaceChildren(thumb);
            uploadHelp.textContent='Preview ready. Click Upload icon to GitHub, then Publish to GitHub.';
            action.disabled=false;
          }catch(error){fileInfo.textContent='Cannot read selected icon: '+error.message;}
        });
        bar.append(file,action);upload.append(bar,fileInfo,uploadHelp);
        stack.append(upload);
      }else stack.append(technologies);
    }
    const preview=card('Live Tech Arsenal preview','Updates as you edit. This is a compact preview using the same groups, labels and icons as your public portfolio.');
    const host=node('div');host.id='skillLivePreview';preview.append(host);stack.append(preview);
    // Edits update preview immediately; moving, adding and removing entries use redraw().
    stack.addEventListener('input',()=>{if(current?.tab==='skills')renderSkillPreview(host);});
    stack.addEventListener('change',()=>{if(current?.tab==='skills')renderSkillPreview(host);});
    renderSkillPreview(host);
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
      const removeActions=node('div','content-actions');
      const clearPhoto=button('Remove profile photo link',()=>{
        const old=current.data.profile.profileImage||'';
        if(!old||!confirm('Remove the profile photo reference? The GitHub file will not be deleted.'))return;
        current.data.profile.profileImage='';
        if(current.data.site?.image===old)current.data.site.image='';
        $('extraImage').value='';current.markDirty();renderProfileMediaPreview();
      },{danger:true});
      const clearCV=button('Remove CV link',()=>{
        if(!current.data.site?.resume||!confirm('Remove the CV link? The GitHub file will not be deleted.'))return;
        current.data.site.resume='';$('extraResume').value='';current.markDirty();renderProfileMediaPreview();
      },{danger:true});
      removeActions.append(clearPhoto,clearCV);extra.append(removeActions);
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

  // Media inventory is always read from the authenticated GitHub API. Draft
  // updates still require the existing Publish to GitHub action.
  const library = {
    items: [], ready: false, loading: false, error: '', busy: false,
    type: 'all', usage: 'all', query: '', certificateIndex: -1, skillTarget: ''
  };
  const MEDIA_NAMES = Object.freeze({
    'project-cover':'Project cover',
    'project-screenshot':'Project screenshot',
    'certificate':'Certificate',
    'profile-photo':'Profile photo',
    'resume':'Resume / CV',
    'skill-icon':'Technology icon'
  });
  function draftReferences(path) {
    if (!current?.data) return 0;
    let count=0;
    function scan(value,depth=0) {
      if(depth>18)return;
      if(typeof value==='string') {
        if(value.trim().replace(/^(?:\.\/|\/)+/, '')===path)count++;
      } else if(Array.isArray(value))value.forEach(it=>scan(it,depth+1));
      else if(value&&typeof value==='object')Object.values(value).forEach(it=>scan(it,depth+1));
    }
    scan(current.data);
    return count;
  }
  function invalidateMedia() {
    library.ready=false;
    if(current?.tab==='media' && !library.loading)redraw();
  }
  async function refreshMedia() {
    if(library.loading)return;
    library.loading=true;library.error='';
    if(current?.tab==='media')redraw();
    try {
      const response=await fetch('/api/media-library',{
        credentials:'same-origin',cache:'no-store',redirect:'error'
      });
      const result=await response.json();
      if(!response.ok)throw Error(result?.error||'Media inventory request failed.');
      if(result?.branch!=='portfolio-admin'||!Array.isArray(result.items)) {
        throw Error('Unexpected media inventory response.');
      }
      library.items=result.items;
      library.ready=true;
    }catch(error){
      library.ready=true;library.error=error.message;
      current?.status('Media library: '+error.message);
    }finally{
      library.loading=false;
      if(current?.tab==='media')redraw();
    }
  }
  function copyMediaPath(path) {
    if(navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(path)
        .then(()=>current.status('Copied media path.'))
        .catch(()=>prompt('Copy this media path:',path));
    } else prompt('Copy this media path:',path);
  }
  function connectMedia(item) {
    if(!current?.data)return;
    const data=current.data;
    if(item.kind==='project-cover'||item.kind==='project-screenshot') {
      const match=item.path.match(/^assets\/projects\/([^/]+)\//);
      const project=data.projects?.find(p=>p.id===match?.[1]);
      if(!project)return alert('No project matches this upload path.');
      if(item.kind==='project-cover'){
        project.imageUrl=item.path;delete project.coverUrl;
      }else{
        project.screenshots ||= [];
        if(project.screenshots.includes(item.path))return;
        if(project.screenshots.length>=20)return alert('Maximum 20 screenshots per project.');
        project.screenshots.push(item.path);
      }
      current.markDirty();current.status('Linked to '+project.title+'. Click Publish to GitHub to save the reference.');
    } else if(item.kind==='certificate') {
      const i=library.certificateIndex;
      if(!Number.isInteger(i)||i<0||i>=data.certifications.length){
        alert('Choose a certificate in the dropdown first.');return;
      }
      data.certifications[i].fileUrl=item.path;
      current.markDirty();current.status('Certificate file linked in your draft. Publish to save.');
    } else if(item.kind==='profile-photo') {
      data.profile.profileImage=item.path;
      data.site.image=item.path;
      current.markDirty();current.status('Profile image and sharing image updated in your draft. Publish to save.');
    } else if(item.kind==='resume') {
      data.site.resume=item.path;
      current.markDirty();current.status('Resume linked in your draft. Publish to save.');
    } else if(item.kind==='skill-icon') {
      const match=library.skillTarget.match(/^(\d+):(\d+)$/);
      const skill=match && data.skills?.[Number(match[1])]?.items?.[Number(match[2])];
      if(!skill){alert('Choose a technology in the dropdown first.');return;}
      skill.iconUrl=item.path;
      current.markDirty();current.status('Technology icon linked in your draft. Publish to save.');
    }
    redraw();
  }
  async function deleteManagedMedia(item) {
    if(library.busy)return;
    if(item.referenced||draftReferences(item.path)){
      alert('This file is still referenced. Remove or replace the link, Publish to GitHub, refresh this library, and then delete it.');
      return;
    }
    const shortName=item.path.split('/').pop();
    if(!confirm('Delete this UNUSED file from the portfolio-admin branch?\n\n'+shortName+'\n\nThis creates a deletion commit. The file may remain in Git history.'))return;
    library.busy=true;redraw();
    try{
      const response=await fetch('/api/media-library',{
        method:'DELETE',credentials:'same-origin',cache:'no-store',redirect:'error',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({path:item.path,sha:item.sha})
      });
      const result=await response.json();
      if(!response.ok)throw Error(result?.error||'GitHub deletion failed.');
      if(!result?.deleted||result.path!==item.path)throw Error('GitHub did not confirm deletion.');
      current.status('Unused media removed from portfolio-admin.');
      library.ready=false;
    }catch(error){
      current.status('Media deletion failed: '+error.message);
      alert('Could not delete media: '+error.message);
    }finally{
      library.busy=false;
      await refreshMedia();
    }
  }
  function renderMedia(stack) {
    const note=card('Uploaded media library',
      'Only files uploaded by DARKRAIDER STUDIO appear here. Original portfolio assets are protected.');
    const toolbar=node('div','media-toolbar');
    toolbar.append(button(library.loading?'Loading…':'↻ Refresh files',refreshMedia,
      {disabled:library.loading||library.busy}));
    if(library.ready&&!library.error) {
      const used=library.items.filter(x=>x.referenced).length;
      toolbar.append(node('span','content-muted',`${library.items.length} files · ${used} linked · ${library.items.length-used} unused`));
    }
    note.append(toolbar);
    if(library.error)note.append(node('p','content-editor-hint',library.error));
    note.append(node('p','hint','Safe sequence: attach or replace a file → Publish to GitHub → Refresh files → Delete the old unused file. Deleting a GitHub file does not erase Git history.'));
    stack.append(note);
    if(!library.ready&&!library.loading)void refreshMedia();
    if(library.loading) {stack.append(card('Checking GitHub…','Loading current uploads and published references.'));return;}
    if(!library.ready||library.error)return;

    const controls=card('Find an upload');
    const filters=grid(controls);
    const typeWrap=node('div','field');
    const typeLabel=node('label','','File type');
    const typeSelect=node('select');
    for(const [value,label] of [['all','All uploads'],...Object.entries(MEDIA_NAMES)]){
      const option=node('option','',label);option.value=value;typeSelect.append(option);
    }
    typeSelect.value=library.type;
    typeSelect.addEventListener('change',()=>{library.type=typeSelect.value;showItems();});
    append(typeWrap,typeLabel,typeSelect);filters.append(typeWrap);
    const usageWrap=node('div','field');
    const usageLabel=node('label','','Usage');const usageSelect=node('select');
    for(const [value,label] of [['all','Used + unused'],['linked','Linked'],['unused','Unused']]){
      const option=node('option','',label);option.value=value;usageSelect.append(option);
    }
    usageSelect.value=library.usage;
    usageSelect.addEventListener('change',()=>{library.usage=usageSelect.value;showItems();});
    append(usageWrap,usageLabel,usageSelect);filters.append(usageWrap);
    const queryWrap=node('div','field editor-full');const queryLabel=node('label','','Search files');
    const query=node('input');query.type='search';query.placeholder='Search paths and project names…';query.value=library.query;
    query.addEventListener('input',()=>{library.query=query.value;showItems();});
    append(queryWrap,queryLabel,query);filters.append(queryWrap);
    if(current?.data?.certifications?.length){
      const certWrap=node('div','field editor-full');const certLabel=node('label','','Attach a certificate upload to');
      const select=node('select');select.setAttribute('aria-label','Choose certificate to attach');
      const placeholder=node('option','','Select a certificate first');placeholder.value='-1';select.append(placeholder);
      current.data.certifications.forEach((c,i)=>{
        const opt=node('option','',c.title||`Certificate ${i+1}`);opt.value=String(i);select.append(opt);
      });
      select.value=String(library.certificateIndex);
      select.addEventListener('change',()=>{library.certificateIndex=Number(select.value);showItems();});
      append(certWrap,certLabel,select);filters.append(certWrap);
    }
    if(current?.data?.skills?.length){
      const wrap=node('div','field editor-full');const label=node('label','','Attach a technology icon to');
      const select=node('select');select.setAttribute('aria-label','Choose technology to attach icon');
      const placeholder=node('option','','Select a technology first');placeholder.value='';select.append(placeholder);
      current.data.skills.forEach((group,gi)=>{
        (group.items||[]).forEach((skill,si)=>{
          const opt=node('option','',`${group.category} · ${skill.name}`);opt.value=`${gi}:${si}`;select.append(opt);
        });
      });
      select.value=library.skillTarget;
      select.addEventListener('change',()=>{library.skillTarget=select.value;showItems();});
      append(wrap,label,select);filters.append(wrap);
    }
    stack.append(controls);
    const results=card('Files on portfolio-admin','The GitHub source is authoritative; previews on an older Vercel deployment may take time to load.');
    const list=node('div','media-list');results.append(list);stack.append(results);

    function showItems() {
      list.replaceChildren();
      const queryText=library.query.toLowerCase().trim();
      const filtered=library.items.filter(item=>{
        const linked=item.referenced||draftReferences(item.path)>0;
        return (library.type==='all'||item.kind===library.type) &&
          (library.usage==='all'||(library.usage==='linked'?linked:!linked)) &&
          (!queryText || item.path.toLowerCase().includes(queryText) ||
          String(MEDIA_NAMES[item.kind]||'').toLowerCase().includes(queryText));
      });
      if(!filtered.length){list.append(node('p','content-muted','No managed files match your filters.'));return;}
      for(const item of filtered){
        const inDraft=draftReferences(item.path);
        const used=item.referenced||inDraft>0;
        const article=node('article','media-item');
        const thumb=node('div','media-thumb');
        if(/\.(png|jpg|webp)$/i.test(item.path)){
          const img=node('img');img.src='/'+item.path;img.loading='lazy';img.alt='Uploaded image preview';
          img.onerror=()=>{thumb.replaceChildren(node('span','content-muted','Image preview after deploy'));};
          thumb.append(img);
        }else thumb.append(node('span','content-muted','PDF'));
        const body=node('div','media-item-body');
        const headline=node('div','media-item-head');
        append(headline,node('strong','',MEDIA_NAMES[item.kind]||'Upload'),
          node('span',used?'media-in-use':'media-unused',used?'● Linked':'○ Unused'));
        body.append(headline);
        body.append(node('p','media-path',item.path));
        const size=Number.isFinite(item.size)?(item.size/1024).toFixed(1)+' KB':'Size unknown';
        body.append(node('p','content-muted',`${size} · ${item.referenced?'Linked in published JSON':inDraft?'Linked in unsaved draft':'Not linked'}`));
        const cmds=node('div','media-item-actions');
        cmds.append(button('Copy path',()=>copyMediaPath(item.path)));
        const link=node('a','btn small','↗ View on GitHub');
        link.href='https://github.com/Darkraider888/portfolio-v2/blob/portfolio-admin/'+item.path;
        link.target='_blank';link.rel='noopener noreferrer';cmds.append(link);
        let attachText='';
        if(item.kind==='project-cover')attachText='Use as cover';
        if(item.kind==='project-screenshot')attachText='Add to project';
        if(item.kind==='certificate')attachText='Attach to certificate';
        if(item.kind==='profile-photo')attachText='Use as profile photo';
        if(item.kind==='resume')attachText='Use as CV';
        if(item.kind==='skill-icon')attachText='Use as skill icon';
        if(attachText){
          const attach=button(attachText,()=>connectMedia(item),{primary:true,
            disabled:library.busy||(item.kind==='certificate'&&library.certificateIndex<0)||
              (item.kind==='skill-icon'&&!library.skillTarget)});
          cmds.append(attach);
        }
        cmds.append(button('Delete unused',()=>deleteManagedMedia(item),{
          danger:true,disabled:used||library.busy
        }));
        body.append(cmds);append(article,thumb,body);list.append(article);
      }
    }
    showItems();
  }

  window.DarkraiderSections={
    isExtra(tab){return EXTRA.has(tab);},
    render(tab,data,markDirty,status){if(!EXTRA.has(tab))return;current={tab,data,markDirty,status};redraw();},
    onProfile,
    invalidateMedia
  };
})();

"use strict";
(()=>{
  const config=window.BIO_SUPABASE_CONFIG;
  if(!config||!window.supabase){console.error("Supabase client unavailable");return}
  const db=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const AUTH_REDIRECT="https://cny2468-prog.github.io/biology-classroom/";
  const remote={session:null,user:null,profile:null,classes:[],selectedClass:null};
  window.bioBackend={db,remote};

  const authForm=document.querySelector("#joinForm");
  const joinCard=document.querySelector(".join-card");
  const authIntro=joinCard.querySelector("h2");
  authForm.innerHTML=`<div class="auth-tabs"><button type="button" class="active" data-auth-mode="signup">학생 가입</button><button type="button" data-auth-mode="teacher">교사 등록</button><button type="button" data-auth-mode="login">로그인</button></div><label data-register-only>이름<input name="displayName" placeholder="이름" required></label><label>이메일<input name="email" type="email" placeholder="name@example.com" required></label><label>비밀번호<input name="password" type="password" minlength="6" placeholder="6자리 이상" required></label><label data-student-only>분반 인증번호<input name="classCode" placeholder="선생님에게 받은 코드" required></label><p class="form-error" id="joinError"></p><button class="primary wide" type="submit">가입하고 분반 들어가기</button><button class="resend-button" id="resendConfirmation" type="button">인증 메일 다시 보내기</button>`;
  joinCard.querySelector("small").textContent="교사는 계정 생성 후 관리자에게 교사 권한을 요청하세요.";
  let authMode="signup";
  joinCard.querySelectorAll("[data-auth-mode]").forEach(button=>button.onclick=()=>{
    authMode=button.dataset.authMode;joinCard.querySelectorAll("[data-auth-mode]").forEach(x=>x.classList.toggle("active",x===button));
    joinCard.querySelectorAll("[data-register-only]").forEach(x=>x.classList.toggle("hidden",authMode==='login'));
    joinCard.querySelectorAll("[data-register-only] input").forEach(x=>x.required=authMode!=='login');
    joinCard.querySelectorAll("[data-student-only]").forEach(x=>x.classList.toggle("hidden",authMode!=='signup'));
    joinCard.querySelectorAll("[data-student-only] input").forEach(x=>x.required=authMode==='signup');
    authIntro.textContent=authMode==='signup'?"우리 반에 들어오세요":authMode==='teacher'?"교사 계정을 등록하세요":"다시 만나 반가워요";
    authForm.querySelector("button[type=submit]").textContent=authMode==='signup'?"가입하고 분반 들어가기":authMode==='teacher'?"교사 계정 등록":"로그인";
  });
  authForm.onsubmit=async event=>{
    event.preventDefault();const fd=new FormData(authForm),errorBox=joinCard.querySelector("#joinError");errorBox.textContent="";
    const email=String(fd.get("email")).trim(),password=String(fd.get("password"));
    try{
      if(authMode!=='login'){
        const code=String(fd.get("classCode")||"").trim();if(authMode==='signup')sessionStorage.setItem("bio_pending_class_code",code);else sessionStorage.setItem("bio_pending_teacher_email",email);
        const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:String(fd.get("displayName")).trim()},emailRedirectTo:AUTH_REDIRECT}});if(error)throw error;
        if(!data.session){toast(authMode==='teacher'?"이메일 인증 후 관리자 승인을 요청해 주세요.":"확인 이메일을 열어 가입을 완료해 주세요.");return}
        await activate(data.session);
      }else{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;await activate(data.session)}
      closeModals();toast("안전하게 로그인했습니다.");
    }catch(error){errorBox.textContent=koreanError(error.message)}
  };
  document.querySelector("#resendConfirmation").onclick=async()=>{const email=String(authForm.querySelector('[name="email"]').value).trim(),errorBox=joinCard.querySelector("#joinError");if(!email){errorBox.textContent="이메일을 먼저 입력해 주세요.";return}const {error}=await db.auth.resend({type:"signup",email,options:{emailRedirectTo:AUTH_REDIRECT}});if(error){errorBox.textContent=koreanError(error.message);return}errorBox.textContent="";toast("인증 메일을 다시 보냈습니다. 스팸함도 확인해 주세요.")};
  function koreanError(message){if(/Email not confirmed/i.test(message))return"이메일 인증이 아직 완료되지 않았습니다. 인증 메일을 확인해 주세요.";if(/Invalid login/i.test(message))return"이메일 또는 비밀번호를 확인해 주세요.";if(/already registered/i.test(message))return"이미 가입된 이메일입니다. 로그인해 주세요.";if(/rate limit/i.test(message))return"잠시 후 다시 시도해 주세요.";return message}

  async function activate(session){
    remote.session=session;remote.user=session.user;
    const {data:profile,error}=await db.from("profiles").select("*").eq("id",remote.user.id).single();if(error)throw error;
    remote.profile=profile;state.student={name:profile.display_name};state.points=profile.points;updateUser();document.body.dataset.role=profile.role;
    installUserControls();await loadClasses();await loadRemoteContent();
  }
  function installUserControls(){
    let role=document.querySelector("#roleBadge");if(!role){role=document.createElement("span");role.id="roleBadge";document.querySelector(".user-area").prepend(role)}
    role.className=`role-badge ${remote.profile.role}`;role.textContent=remote.profile.role==='teacher'?"교사":"학생";
    let out=document.querySelector("#logoutButton");if(!out){out=document.createElement("button");out.id="logoutButton";out.className="logout-button";out.textContent="로그아웃";document.querySelector(".user-area").append(out)}
    out.onclick=async()=>{await db.auth.signOut();location.reload()};
  }
  async function loadClasses(){
    if(remote.profile.role==='teacher'){
      const {data,error}=await db.from("classes").select("*").eq("teacher_id",remote.user.id).order("created_at");if(error)throw error;remote.classes=data;
    }else{
      const code=sessionStorage.getItem("bio_pending_class_code");if(code){const {error}=await db.rpc("join_class_with_code",{code});if(!error)sessionStorage.removeItem("bio_pending_class_code")}
      const {data,error}=await db.from("enrollments").select("class_id,classes(id,name)").eq("student_id",remote.user.id);if(error)throw error;remote.classes=data.map(x=>x.classes).filter(Boolean);
    }
    remote.selectedClass=remote.classes[0]?.id||null;renderClassControls();
  }
  function renderClassControls(){
    let bar=document.querySelector("#classControlBar");if(!bar){bar=document.createElement("div");bar.id="classControlBar";bar.className="class-control-bar";document.querySelector(".topbar").after(bar)}
    const options=remote.classes.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    bar.innerHTML=`<div class="wrap"><label>분반 <select id="classSelector">${options||'<option>등록된 분반 없음</option>'}</select></label>${remote.profile.role==='teacher'?'<button id="createClass">+ 분반 만들기</button>':''}<span>${remote.profile.role==='teacher'?'담당 분반의 과제와 제출물만 표시됩니다.':'가입한 분반의 자료와 과제만 표시됩니다.'}</span></div>`;
    const select=bar.querySelector("#classSelector");select.disabled=!remote.classes.length;select.onchange=async()=>{remote.selectedClass=select.value;await loadRemoteContent()};
    if(remote.profile.role==='teacher')bar.querySelector("#createClass").onclick=()=>classForm();
  }
  async function loadRemoteContent(){
    const [{data:m,error:me},{data:a,error:ae}]=await Promise.all([
      db.from("materials").select("*").order("created_at",{ascending:false}),
      remote.selectedClass?db.from("assignments").select("*").eq("class_id",remote.selectedClass).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null})
    ]);if(me)throw me;if(ae)throw ae;
    materials.splice(0,materials.length,...m.map(x=>({id:x.id,type:x.kind,unit:"모든 분반 공유",title:x.title,desc:x.description,pages:x.page_count,date:new Date(x.created_at).toLocaleDateString("ko-KR"),color:x.kind==='slide'?"green":"yellow",filePath:x.file_path})));
    let own=new Map();if(remote.profile.role==='student'){const {data:s}=await db.from("submissions").select("*").eq("student_id",remote.user.id);own=new Map((s||[]).map(x=>[x.assignment_id,x]))}
    assignments=a.map(x=>({id:x.id,title:x.title,desc:x.description,due:x.due_at?new Date(x.due_at).toLocaleDateString("ko-KR"):"마감 없음",d:x.due_at?Math.max(0,Math.ceil((new Date(x.due_at)-Date.now())/86400000)):"-",done:own.has(x.id),submission:own.get(x.id)}));
    renderMaterials();remote.profile.role==='teacher'?renderTeacherAssignments():renderAssignments();addRoleActions();await loadCommunity();
  }
  function addRoleActions(){
    const materialHead=document.querySelector('[data-page="materials"] .page-head');let mb=materialHead.querySelector("#teacherMaterialButton");if(remote.profile.role==='teacher'&&!mb){mb=document.createElement("button");mb.id="teacherMaterialButton";mb.className="primary";mb.textContent="+ 수업 자료 올리기";mb.onclick=materialForm;materialHead.append(mb)}
    const assignmentHead=document.querySelector('[data-page="assignments"] .page-head');let ab=assignmentHead.querySelector("#teacherAssignmentButton");if(remote.profile.role==='teacher'&&!ab){ab=document.createElement("button");ab.id="teacherAssignmentButton";ab.className="primary";ab.textContent="+ 과제 등록";ab.onclick=assignmentForm;assignmentHead.querySelector("#assignmentHelp")?.remove();assignmentHead.append(ab)}
  }
  function renderTeacherAssignments(){
    document.querySelector("#openCount").textContent=assignments.length;document.querySelector("#doneCount").textContent="-";
    document.querySelector("#assignmentList").innerHTML=assignments.map(a=>`<article class="assignment-item"><div class="assignment-date"><span>마감</span><strong>${a.d}</strong></div><div><span class="tag green">교사용</span><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.desc)}</p><small>${a.due}</small></div><button data-view-submissions="${a.id}">제출 현황</button></article>`).join("")||'<div class="empty-panel page-empty"><span>✓</span><h3>이 분반에 등록된 과제가 없습니다</h3></div>';
    document.querySelectorAll("[data-view-submissions]").forEach(b=>b.onclick=()=>viewSubmissions(b.dataset.viewSubmissions));
  }
  assignmentAction=async id=>{const item=assignments.find(x=>x.id===id);if(item.done){toast("이미 제출한 과제입니다.");return}submissionForm(item)};
  function modalForm(title,html,onSubmit){let modal=document.querySelector("#backendModal");if(!modal){modal=document.createElement("div");modal.id="backendModal";modal.className="modal hidden";document.body.append(modal)}modal.innerHTML=`<form class="modal-card form-card"><button class="modal-close" type="button">×</button><h2>${escapeHtml(title)}</h2>${html}<p class="form-error"></p><button class="primary wide" type="submit">저장하기</button></form>`;modal.classList.remove("hidden");document.body.style.overflow="hidden";modal.querySelector(".modal-close").onclick=()=>{modal.classList.add("hidden");document.body.style.overflow=""};modal.querySelector("form").onsubmit=async e=>{e.preventDefault();const error=modal.querySelector(".form-error");try{await onSubmit(new FormData(e.target));modal.classList.add("hidden");document.body.style.overflow="";await loadClasses();await loadRemoteContent();toast("저장했습니다.")}catch(x){error.textContent=x.message}}}
  function classForm(){modalForm("새 분반 만들기",'<label>분반 이름<input name="name" required placeholder="예: 2학년 3반"></label><label>학생 가입 코드<input name="code" required minlength="6" placeholder="6자리 이상"></label>',async fd=>{const {error}=await db.from("classes").insert({name:fd.get("name"),join_code:String(fd.get("code")).toUpperCase(),teacher_id:remote.user.id});if(error)throw error})}
  function assignmentForm(){if(!remote.selectedClass){toast("먼저 분반을 만들어 주세요.");return}modalForm("과제 등록",'<label>과제명<input name="title" required></label><label>설명<textarea name="description"></textarea></label><label>마감 일시<input name="due" type="datetime-local"></label>',async fd=>{const {error}=await db.from("assignments").insert({class_id:remote.selectedClass,teacher_id:remote.user.id,title:fd.get("title"),description:fd.get("description"),due_at:fd.get("due")||null});if(error)throw error})}
  function materialForm(){modalForm("전체 공유 수업 자료 올리기",'<p class="shared-notice">이 자료는 모든 분반 학생에게 공개됩니다. PPT/PPTX는 PDF로 변환한 뒤 올려 주세요.</p><label>자료 종류<select name="kind"><option value="slide">수업 슬라이드</option><option value="worksheet">학습지</option></select></label><label>제목<input name="title" required></label><label>설명<textarea name="description"></textarea></label><label>PDF 또는 이미지<input name="file" type="file" required accept=".pdf,image/png,image/jpeg,image/webp"></label>',async fd=>{const file=fd.get("file"),safe=`${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`,path=`shared/${safe}`;const {error:up}=await db.storage.from("class-materials").upload(path,file);if(up)throw up;const {error}=await db.from("materials").insert({class_id:null,teacher_id:remote.user.id,kind:fd.get("kind"),title:fd.get("title"),description:fd.get("description"),file_path:path});if(error)throw error})}
  function submissionForm(item){modalForm(item.title,'<label>제출 내용<textarea name="body"></textarea></label><label>파일 첨부<input name="file" type="file"></label>',async fd=>{const file=fd.get("file");let path=null;if(file&&file.size){path=`${item.id}/${remote.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error}=await db.storage.from("assignment-submissions").upload(path,file);if(error)throw error}const body=String(fd.get("body")).trim();if(!body&&!path)throw Error("내용을 입력하거나 파일을 첨부해 주세요.");const {error}=await db.from("submissions").upsert({assignment_id:item.id,student_id:remote.user.id,body,file_path:path},{onConflict:"assignment_id,student_id"});if(error)throw error})}
  async function viewSubmissions(id){const {data,error}=await db.from("submissions").select("*,profiles!submissions_student_id_fkey(display_name)").eq("assignment_id",id).order("submitted_at");if(error)throw error;modalForm("제출 현황",`<div class="submission-list">${data.length?data.map(s=>`<article><b>${escapeHtml(s.profiles?.display_name||"학생")}</b><small>${new Date(s.submitted_at).toLocaleString("ko-KR")}</small><p>${escapeHtml(s.body||"첨부 파일 제출")}</p>${s.file_path?`<button type="button" data-download-submission="${s.file_path}">파일 열기</button>`:""}</article>`).join(""):'<div class="empty-panel">아직 제출한 학생이 없습니다.</div>'}</div>`,async()=>{});document.querySelector("#backendModal button[type=submit]").remove();document.querySelectorAll("[data-download-submission]").forEach(b=>b.onclick=async()=>{const {data}=await db.storage.from("assignment-submissions").createSignedUrl(b.dataset.downloadSubmission,60);if(data)window.open(data.signedUrl,"_blank")})}
  let remoteDocument=null;
  if(window.pdfjsLib)window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const appOpenViewer=openViewer,appGoSlide=goSlide;
  openViewer=async function(id){
    remoteDocument=null;appOpenViewer(id);const material=materials.find(x=>x.id===id);if(!material?.filePath)return;
    document.querySelector("#saveStatus").textContent="원본 자료 불러오는 중…";
    const {data,error}=await db.storage.from("class-materials").createSignedUrl(material.filePath,3600);if(error){toast("자료를 불러오지 못했습니다.");return}
    try{
      if(/\.pdf$/i.test(material.filePath)){const buffer=await fetch(data.signedUrl).then(r=>r.arrayBuffer());const pdf=await window.pdfjsLib.getDocument({data:buffer}).promise;remoteDocument={type:"pdf",pdf};material.pages=pdf.numPages}
      else remoteDocument={type:"image",url:data.signedUrl};
      document.querySelector("#slideTotal").textContent=material.pages;document.querySelector("#slideThumbs").innerHTML=Array.from({length:material.pages},(_,i)=>`<div class="slide-thumb" data-slide="${i}"><b>${i+1}</b><br>원본 ${i+1}쪽</div>`).join("");document.querySelectorAll("[data-slide]").forEach(t=>t.onclick=()=>goSlide(+t.dataset.slide));await renderOriginalPage();
    }catch(error){console.error(error);toast("PDF 또는 이미지 파일을 열 수 없습니다.")}
  };
  goSlide=function(index){appGoSlide(index);if(remoteDocument)renderOriginalPage()};
  async function renderOriginalPage(){
    if(!remoteDocument||!state.currentMaterial)return;const host=document.querySelector("#lessonCanvas"),content=document.querySelector("#slideContent");let base=document.querySelector("#documentCanvas");if(!base){base=document.createElement("canvas");base.id="documentCanvas";host.insertBefore(base,content)}content.innerHTML="";content.className="slide-content original-document";
    if(remoteDocument.type==='pdf'){const page=await remoteDocument.pdf.getPage(state.currentSlide+1),viewport=page.getViewport({scale:1.6});base.width=viewport.width;base.height=viewport.height;host.style.aspectRatio=`${viewport.width}/${viewport.height}`;await page.render({canvasContext:base.getContext("2d"),viewport}).promise}
    else await new Promise((resolve,reject)=>{const img=new Image;img.crossOrigin="anonymous";img.onload=()=>{base.width=img.naturalWidth;base.height=img.naturalHeight;host.style.aspectRatio=`${img.naturalWidth}/${img.naturalHeight}`;base.getContext("2d").drawImage(img,0,0);resolve()};img.onerror=reject;img.src=remoteDocument.url});
    document.querySelectorAll(".slide-thumb").forEach((x,n)=>x.classList.toggle("active",n===state.currentSlide));document.querySelector("#prevSlide").disabled=state.currentSlide===0;document.querySelector("#nextSlide").disabled=state.currentSlide===state.currentMaterial.pages-1;resizeCanvas();await loadDrawing();document.querySelector("#saveStatus").textContent="✓ 개인 필기 불러옴";
  }
  async function loadCommunity(){
    const [{data:q,error:qe},{data:ans,error:ane},{data:posts,error:pe},{data:people,error:pre}]=await Promise.all([
      db.from("questions").select("*").order("created_at",{ascending:false}),db.from("answers").select("*").order("created_at"),db.from("lounge_posts").select("*").order("created_at",{ascending:false}),db.from("profiles").select("id,display_name")
    ]);if(qe||ane||pe||pre){console.error(qe||ane||pe||pre);return}const names=new Map((people||[]).map(p=>[p.id,p.display_name]));
    questions=(q||[]).map(item=>({id:item.id,title:item.title,body:item.body,author:names.get(item.author_id)||"학생",status:(ans||[]).some(a=>a.question_id===item.id)?"answered":"waiting",subject:item.material_id?"수업 자료 질문":"전체 질문",likes:0,answers:(ans||[]).filter(a=>a.question_id===item.id).map(a=>({author:names.get(a.author_id)||"학생",text:a.body,helpful:a.helpful_count||0}))}));
    lounge=(posts||[]).map(item=>({id:item.id,type:item.category,label:{article:"기사·자료",debate:"토론",wonder:"신기한 생물"}[item.category],title:item.title,body:item.body,author:names.get(item.author_id)||"학생",likes:0,comments:0,link:item.link}));renderQuestions();renderLounge();
  }
  const localDynamicSubmit=document.querySelector("#dynamicForm").onsubmit;
  document.querySelector("#dynamicForm").onsubmit=async event=>{
    const mode=state.formMode?.mode;if(!remote.user||!['question','lounge','answer'].includes(mode)){return localDynamicSubmit.call(event.currentTarget,event)}event.preventDefault();const fd=new FormData(event.currentTarget),errorBox=document.querySelector("#formError");try{
      if(mode==='question'){const {error}=await db.from("questions").insert({class_id:null,author_id:remote.user.id,title:fd.get("title"),body:fd.get("body")});if(error)throw error}
      if(mode==='lounge'){const {error}=await db.from("lounge_posts").insert({author_id:remote.user.id,category:fd.get("type"),title:fd.get("title"),body:fd.get("body"),link:fd.get("link")||null});if(error)throw error}
      if(mode==='answer'){const {error}=await db.from("answers").insert({question_id:state.formMode.data.id,author_id:remote.user.id,body:fd.get("body")});if(error)throw error}
      closeModals();await loadCommunity();toast("모든 분반에 공유되었습니다.");
    }catch(error){errorBox.textContent=error.message}
  };
  const localSave=saveDrawing;saveDrawing=function(){localSave();if(!remote.user||remote.profile?.role!=="student"||!state.currentMaterial)return;db.from("personal_notes").upsert({material_id:state.currentMaterial.id,student_id:remote.user.id,page_number:state.currentSlide+1,drawing_data:canvas.toDataURL(),memo:document.querySelector("#sideNote").value},{onConflict:"material_id,student_id,page_number"}).then(({error})=>{if(error)console.error(error)})};
  const localLoad=loadDrawing;loadDrawing=async function(){localLoad();if(!remote.user||remote.profile?.role!=="student"||!state.currentMaterial)return;const {data}=await db.from("personal_notes").select("drawing_data,memo").eq("material_id",state.currentMaterial.id).eq("student_id",remote.user.id).eq("page_number",state.currentSlide+1).maybeSingle();if(data?.drawing_data){const img=new Image;img.onload=()=>ctx.drawImage(img,0,0,canvas.clientWidth,canvas.clientHeight);img.src=data.drawing_data}if(data)document.querySelector("#sideNote").value=data.memo||""};
  function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
  db.auth.getSession().then(({data})=>{if(data.session)activate(data.session).catch(e=>{console.error(e);toast("계정 정보를 불러오지 못했습니다.")})});
})();

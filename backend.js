"use strict";
(()=>{
  const config=window.BIO_SUPABASE_CONFIG;
  if(!config||!window.supabase){console.error("Supabase client unavailable");return}
  const db=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const remote={session:null,user:null,profile:null,classes:[],selectedClass:null};
  window.bioBackend={db,remote};

  const authForm=document.querySelector("#joinForm");
  const joinCard=document.querySelector(".join-card");
  const authIntro=joinCard.querySelector("h2");
  authForm.innerHTML=`<div class="auth-tabs"><button type="button" class="active" data-auth-mode="signup">학생 가입</button><button type="button" data-auth-mode="login">로그인</button></div><label data-signup-only>이름<input name="displayName" placeholder="학생 이름" required></label><label>이메일<input name="email" type="email" placeholder="student@example.com" required></label><label>비밀번호<input name="password" type="password" minlength="6" placeholder="6자리 이상" required></label><label data-signup-only>분반 인증번호<input name="classCode" placeholder="선생님에게 받은 코드" required></label><p class="form-error" id="joinError"></p><button class="primary wide" type="submit">가입하고 분반 들어가기</button>`;
  joinCard.querySelector("small").textContent="교사는 계정 생성 후 관리자에게 교사 권한을 요청하세요.";
  let authMode="signup";
  joinCard.querySelectorAll("[data-auth-mode]").forEach(button=>button.onclick=()=>{
    authMode=button.dataset.authMode;joinCard.querySelectorAll("[data-auth-mode]").forEach(x=>x.classList.toggle("active",x===button));
    joinCard.querySelectorAll("[data-signup-only]").forEach(x=>x.classList.toggle("hidden",authMode==='login'));
    joinCard.querySelectorAll("[data-signup-only] input").forEach(x=>x.required=authMode==='signup');
    authIntro.textContent=authMode==='signup'?"우리 반에 들어오세요":"다시 만나 반가워요";
    authForm.querySelector("button[type=submit]").textContent=authMode==='signup'?"가입하고 분반 들어가기":"로그인";
  });
  authForm.onsubmit=async event=>{
    event.preventDefault();const fd=new FormData(authForm),errorBox=joinCard.querySelector("#joinError");errorBox.textContent="";
    const email=String(fd.get("email")).trim(),password=String(fd.get("password"));
    try{
      if(authMode==='signup'){
        const code=String(fd.get("classCode")).trim();sessionStorage.setItem("bio_pending_class_code",code);
        const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:String(fd.get("displayName")).trim()}}});if(error)throw error;
        if(!data.session){toast("확인 이메일을 열어 가입을 완료해 주세요.");return}
        await activate(data.session);
      }else{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;await activate(data.session)}
      closeModals();toast("안전하게 로그인했습니다.");
    }catch(error){errorBox.textContent=koreanError(error.message)}
  };
  function koreanError(message){if(/Invalid login/i.test(message))return"이메일 또는 비밀번호를 확인해 주세요.";if(/already registered/i.test(message))return"이미 가입된 이메일입니다. 로그인해 주세요.";return message}

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
    if(!remote.selectedClass){materials.splice(0);assignments=[];renderMaterials();renderAssignments();addRoleActions();return}
    const [{data:m,error:me},{data:a,error:ae}]=await Promise.all([
      db.from("materials").select("*").eq("class_id",remote.selectedClass).order("created_at",{ascending:false}),
      db.from("assignments").select("*").eq("class_id",remote.selectedClass).order("created_at",{ascending:false})
    ]);if(me)throw me;if(ae)throw ae;
    materials.splice(0,materials.length,...m.map(x=>({id:x.id,type:x.kind,unit:remote.classes.find(c=>c.id===x.class_id)?.name||"분반",title:x.title,desc:x.description,pages:x.page_count,date:new Date(x.created_at).toLocaleDateString("ko-KR"),color:x.kind==='slide'?"green":"yellow",filePath:x.file_path})));
    let own=new Map();if(remote.profile.role==='student'){const {data:s}=await db.from("submissions").select("*").eq("student_id",remote.user.id);own=new Map((s||[]).map(x=>[x.assignment_id,x]))}
    assignments=a.map(x=>({id:x.id,title:x.title,desc:x.description,due:x.due_at?new Date(x.due_at).toLocaleDateString("ko-KR"):"마감 없음",d:x.due_at?Math.max(0,Math.ceil((new Date(x.due_at)-Date.now())/86400000)):"-",done:own.has(x.id),submission:own.get(x.id)}));
    renderMaterials();remote.profile.role==='teacher'?renderTeacherAssignments():renderAssignments();addRoleActions();
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
  function materialForm(){if(!remote.selectedClass){toast("먼저 분반을 만들어 주세요.");return}modalForm("수업 자료 올리기",'<label>자료 종류<select name="kind"><option value="slide">수업 슬라이드</option><option value="worksheet">학습지</option></select></label><label>제목<input name="title" required></label><label>설명<textarea name="description"></textarea></label><label>파일<input name="file" type="file" required accept=".pdf,.ppt,.pptx,image/*"></label>',async fd=>{const file=fd.get("file"),safe=`${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`,path=`${remote.selectedClass}/${safe}`;const {error:up}=await db.storage.from("class-materials").upload(path,file);if(up)throw up;const {error}=await db.from("materials").insert({class_id:remote.selectedClass,teacher_id:remote.user.id,kind:fd.get("kind"),title:fd.get("title"),description:fd.get("description"),file_path:path});if(error)throw error})}
  function submissionForm(item){modalForm(item.title,'<label>제출 내용<textarea name="body"></textarea></label><label>파일 첨부<input name="file" type="file"></label>',async fd=>{const file=fd.get("file");let path=null;if(file&&file.size){path=`${item.id}/${remote.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error}=await db.storage.from("assignment-submissions").upload(path,file);if(error)throw error}const body=String(fd.get("body")).trim();if(!body&&!path)throw Error("내용을 입력하거나 파일을 첨부해 주세요.");const {error}=await db.from("submissions").upsert({assignment_id:item.id,student_id:remote.user.id,body,file_path:path},{onConflict:"assignment_id,student_id"});if(error)throw error})}
  async function viewSubmissions(id){const {data,error}=await db.from("submissions").select("*,profiles!submissions_student_id_fkey(display_name)").eq("assignment_id",id).order("submitted_at");if(error)throw error;modalForm("제출 현황",`<div class="submission-list">${data.length?data.map(s=>`<article><b>${escapeHtml(s.profiles?.display_name||"학생")}</b><small>${new Date(s.submitted_at).toLocaleString("ko-KR")}</small><p>${escapeHtml(s.body||"첨부 파일 제출")}</p>${s.file_path?`<button type="button" data-download-submission="${s.file_path}">파일 열기</button>`:""}</article>`).join(""):'<div class="empty-panel">아직 제출한 학생이 없습니다.</div>'}</div>`,async()=>{});document.querySelector("#backendModal button[type=submit]").remove();document.querySelectorAll("[data-download-submission]").forEach(b=>b.onclick=async()=>{const {data}=await db.storage.from("assignment-submissions").createSignedUrl(b.dataset.downloadSubmission,60);if(data)window.open(data.signedUrl,"_blank")})}
  const localSave=saveDrawing;saveDrawing=function(){localSave();if(!remote.user||remote.profile?.role!=="student"||!state.currentMaterial)return;db.from("personal_notes").upsert({material_id:state.currentMaterial.id,student_id:remote.user.id,page_number:state.currentSlide+1,drawing_data:canvas.toDataURL(),memo:document.querySelector("#sideNote").value},{onConflict:"material_id,student_id,page_number"}).then(({error})=>{if(error)console.error(error)})};
  const localLoad=loadDrawing;loadDrawing=async function(){localLoad();if(!remote.user||remote.profile?.role!=="student"||!state.currentMaterial)return;const {data}=await db.from("personal_notes").select("drawing_data,memo").eq("material_id",state.currentMaterial.id).eq("student_id",remote.user.id).eq("page_number",state.currentSlide+1).maybeSingle();if(data?.drawing_data){const img=new Image;img.onload=()=>ctx.drawImage(img,0,0,canvas.clientWidth,canvas.clientHeight);img.src=data.drawing_data}if(data)document.querySelector("#sideNote").value=data.memo||""};
  function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
  db.auth.getSession().then(({data})=>{if(data.session)activate(data.session).catch(e=>{console.error(e);toast("계정 정보를 불러오지 못했습니다.")})});
})();

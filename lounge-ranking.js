"use strict";
(() => {
  const scores = window.BIO_LOUNGE_ACTIVITY_SCORES || {};
  const topics = [
    { key: "quiz", title: "세포소기관 스피드 퀴즈", maximum: 2000 },
    { key: "balance", title: "세포의 균형", maximum: 300 }
  ];
  const empty = '<div class="empty-panel page-empty"><span>♧</span><h3>아직 공유된 이야기가 없습니다</h3><p>흥미로운 생명과학 이야기를 처음으로 소개해 보세요.</p></div>';

  function card(post, topic, rank) {
    const result = scores[post.id];
    const score = topic && result?.[topic.key];
    const imageIndex = topic && result?.[`${topic.key}Image`];
    const images = Number.isInteger(imageIndex) ? [post.imageUrls?.[imageIndex]].filter(Boolean) : post.imageUrls;
    const scoreBadge = Number.isFinite(score) ? `<span class="lounge-result-score" aria-label="활동 점수 ${score}점, 만점 ${topic.maximum}점">${score.toLocaleString()} / ${topic.maximum.toLocaleString()}점</span>` : "";
    const commentId = `loungeComment-${post.id}-${topic?.key || "other"}`;
    const rankBadge = rank <= 3 ? `<span class="lounge-rank">${rank}위</span>` : "";
    return `<article class="lounge-card" data-lounge-post="${post.id}"><div class="lounge-card-heading">${rankBadge}<span class="tag ${post.type==='debate'?'coral':post.type==='article'?'blue':post.type==='activity'?'yellow':'green'}">${post.label}</span>${scoreBadge}</div><h3>${post.title}</h3><p>${post.body}</p>${imageGallery(images)}<footer><b>${post.author}</b><span><button class="like-post" data-like-post="${post.id}" ${post.likedByMe||post.canLike===false?'disabled':''}>${post.likedByMe?'♥':'♡'} 좋아요 ${post.likes}</button> · 대화 ${post.comments}</span></footer>${post.canEdit?`<div class="post-actions"><button data-edit-lounge="${post.id}">수정</button><button type="button" data-delete-lounge="${post.id}">삭제</button></div>`:''}<section class="lounge-comments"><h4>댓글 ${post.comments}</h4>${(post.commentItems||[]).map(comment=>`<div class="lounge-comment"><b>${comment.author}</b><p>${comment.body}</p></div>`).join('')}${post.canComment?`<form class="lounge-comment-form" data-lounge-comment-form="${post.id}"><label class="sr-only" for="${commentId}">댓글</label><textarea id="${commentId}" name="body" required maxlength="1000" placeholder="친구의 글에 생각을 남겨 보세요."></textarea><button type="submit">댓글 달기</button></form>`:''}</section></article>`;
  }

  function topicSection(topic, posts) {
    if (!posts.length) return "";
    return `<section class="lounge-topic-section" data-lounge-topic="${topic.key}"><header><h2>${topic.title}</h2><p>${posts.length}개 · 점수 높은 순</p></header><div class="lounge-topic-grid">${posts.map((post, index) => card(post, topic, index + 1)).join("")}</div></section>`;
  }

  renderLounge = function () {
    const selected = lounge.filter(post => state.loungeFilter === "all" || post.type === state.loungeFilter);
    const activity = selected.filter(post => post.type === "activity");
    const sections = topics.map(topic => topicSection(topic, activity.filter(post => Number.isFinite(scores[post.id]?.[topic.key])).sort((a, b) => scores[b.id][topic.key] - scores[a.id][topic.key]))).join("");
    const unscored = activity.filter(post => !topics.some(topic => Number.isFinite(scores[post.id]?.[topic.key])));
    const other = selected.filter(post => post.type !== "activity");
    const remaining = [...unscored, ...other];
    const remainingSection = remaining.length ? `<section class="lounge-topic-section" data-lounge-topic="other"><header><h2>${state.loungeFilter === "activity" ? "새로 올라온 활동" : "다른 이야기"}</h2></header><div class="lounge-topic-grid">${remaining.map(post => card(post)).join("")}</div></section>` : "";
    $("#loungeGrid").innerHTML = sections + remainingSection || empty;

    $$('[data-like-post]').forEach(button => button.onclick = async () => {
      if (window.bioLikeLounge) { await window.bioLikeLounge(button.dataset.likePost); return; }
      const post = lounge.find(item => String(item.id) === button.dataset.likePost);
      if (!post) return;
      post.likes++; post.likedByMe = true; store.set('lounge', lounge); renderLounge(); toast('이 글에 공감했어요');
    });
    $$('[data-edit-lounge]').forEach(button => button.onclick = () => window.bioEditLounge?.(button.dataset.editLounge));
    $$('[data-delete-lounge]').forEach(button => button.onclick = () => window.bioDeleteLounge?.(button.dataset.deleteLounge));
    $$('[data-lounge-comment-form]').forEach(form => form.onsubmit = async event => {
      event.preventDefault();
      const body = String(new FormData(form).get('body') || '').trim();
      if (!body) return;
      const button = form.querySelector('button'); button.disabled = true;
      try { await window.bioAddLoungeComment?.(form.dataset.loungeCommentForm, body); }
      catch (error) { toast(error.message || '댓글을 등록하지 못했습니다.'); button.disabled = false; }
    });
  };
  renderLounge();
})();

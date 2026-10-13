(() => {
  'use strict';
  const viewer = document.getElementById('viewer');
  const stage = document.getElementById('viewer-stage');
  const photo = document.getElementById('viewer-image');
  const details = document.getElementById('viewer-details');
  const closeButton = document.getElementById('viewer-close');
  const grid = document.getElementById('stock-grid');
  const plusButton = document.getElementById('zoom-in');
  const minusButton = document.getElementById('zoom-out');
  const resetButton = document.getElementById('zoom-reset');
  const MAX_SCALE = 5;
  const pointers = new Map();
  let scale = 1, offsetX = 0, offsetY = 0, anchor = null;
  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;
  let moved = false, pinchUsed = false, restoreFocus = null, previousOverflow = '';

  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const formatPrice = (value) => Number(value).toLocaleString('ja-JP');
  function applyTransform() {
    const w = photo.offsetWidth, h = photo.offsetHeight;
    const maxX = Math.max(0, (w * scale - stage.clientWidth) / 2 + 8);
    const maxY = Math.max(0, (h * scale - stage.clientHeight) / 2 + 8);
    offsetX = clamp(offsetX, -maxX, maxX);
    offsetY = clamp(offsetY, -maxY, maxY);
    photo.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    stage.classList.toggle('is-zoomed', scale > 1.015);
    resetButton.textContent = scale === 1 ? '1:1' : `${Math.round(scale * 100)}%`;
  }
  function resetZoom() {
    scale = 1; offsetX = 0; offsetY = 0;
    pointers.clear(); anchor = null; pinchUsed = false;
    applyTransform();
  }
  function pointInStage(clientX, clientY) {
    const box = stage.getBoundingClientRect();
    return {x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2};
  }
  function changeZoom(newScale, clientX = stage.getBoundingClientRect().left + stage.clientWidth / 2,
                       clientY = stage.getBoundingClientRect().top + stage.clientHeight / 2) {
    const p = pointInStage(clientX, clientY);
    const ratio = clamp(newScale, 1, MAX_SCALE) / scale;
    offsetX = p.x - ratio * (p.x - offsetX);
    offsetY = p.y - ratio * (p.y - offsetY);
    scale = clamp(newScale, 1, MAX_SCALE);
    if (scale === 1) {offsetX = 0; offsetY = 0;}
    applyTransform();
  }
  function openViewer(card) {
    restoreFocus = document.activeElement;
    previousOverflow = document.documentElement.style.overflow;
    const imageUrl = card.getAttribute('href');
    photo.src = imageUrl;
    photo.alt = `FGO 石${Number(card.dataset.stones).toLocaleString('ja-JP')}個相当、${formatPrice(card.dataset.price)}円、進行度 奏${card.dataset.progress}`;
    details.textContent = `¥${formatPrice(card.dataset.price)}  ·  石${Number(card.dataset.stones).toLocaleString('ja-JP')}個相当  ·  奏${card.dataset.progress}`;
    viewer.hidden = false;
    viewer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('viewer-open');
    document.documentElement.style.overflow = 'hidden';
    resetZoom();
    closeButton.focus({preventScroll:true});
    photo.addEventListener('load', applyTransform, {once:true});
  }
  function closeViewer() {
    if (viewer.hidden) return;
    viewer.hidden = true;
    viewer.setAttribute('aria-hidden', 'true');
    photo.removeAttribute('src');
    document.body.classList.remove('viewer-open');
    document.documentElement.style.overflow = previousOverflow;
    pointers.clear(); anchor = null; scale = 1; offsetX = 0; offsetY = 0;
    if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus({preventScroll:true});
  }
  grid.addEventListener('click', event => {
    const card = event.target.closest('.stock-card');
    if (!card) return;
    event.preventDefault();
    openViewer(card);
  });
  closeButton.addEventListener('click', closeViewer);
  resetButton.addEventListener('click', resetZoom);
  plusButton.addEventListener('click', () => changeZoom(scale * 1.55));
  minusButton.addEventListener('click', () => changeZoom(scale / 1.55));
  stage.addEventListener('click', event => {
    if (event.target === stage && !moved && !pinchUsed) closeViewer();
  });
  viewer.addEventListener('click', event => { if (event.target === viewer) closeViewer(); });
  stage.addEventListener('dblclick', event => {
    event.preventDefault();
    changeZoom(scale > 1.01 ? 1 : 2.5, event.clientX, event.clientY);
  });
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    changeZoom(scale * (event.deltaY > 0 ? 0.82 : 1.22), event.clientX, event.clientY);
  }, {passive:false});
  function midpoint(p1,p2) { return {x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2}; }
  function distance(p1,p2) { return Math.hypot(p1.x-p2.x,p1.y-p2.y); }
  function establishAnchor() {
    const points=[...pointers.values()];
    if (points.length===2) {
      anchor={mode:'pinch',startDist:Math.max(1,distance(points[0],points[1])),startMid:midpoint(points[0],points[1]),startScale:scale,startX:offsetX,startY:offsetY};
      pinchUsed=true;
    } else if (points.length===1) {
      anchor={mode:'drag',startPoint:points[0],startX:offsetX,startY:offsetY};
    } else anchor=null;
  }
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pointers.size === 0) { moved=false; pinchUsed=false; }
    pointers.set(event.pointerId, {x:event.clientX,y:event.clientY});
    try {stage.setPointerCapture(event.pointerId);} catch (_) {}
    establishAnchor();
    if (scale > 1) stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, {x:event.clientX,y:event.clientY});
    if (!anchor) return;
    const coords=[...pointers.values()];
    if (coords.length>=2 && anchor.mode==='pinch') {
      const mid=midpoint(coords[0],coords[1]);
      const ratio=distance(coords[0],coords[1])/anchor.startDist;
      const next=clamp(anchor.startScale*ratio, 1, MAX_SCALE);
      const effectiveRatio=next/anchor.startScale;
      const ref=pointInStage(anchor.startMid.x,anchor.startMid.y);
      const current=pointInStage(mid.x,mid.y);
      offsetX=current.x-effectiveRatio*(ref.x-anchor.startX);
      offsetY=current.y-effectiveRatio*(ref.y-anchor.startY);
      scale=next;
      if (scale===1) {offsetX=0;offsetY=0;}
      moved=true;
      applyTransform();
    } else if (coords.length===1 && anchor.mode==='drag') {
      const dx=coords[0].x-anchor.startPoint.x,dy=coords[0].y-anchor.startPoint.y;
      if (Math.hypot(dx,dy)>7) moved=true;
      if (scale>1) {offsetX=anchor.startX+dx;offsetY=anchor.startY+dy;applyTransform();}
    }
  });
  function onPointerEnd(event) {
    if (!pointers.has(event.pointerId)) return;
    const start=pointers.get(event.pointerId);
    const wasOne=pointers.size===1;
    const wasMoving=moved;
    pointers.delete(event.pointerId);
    stage.classList.remove('is-dragging');
    establishAnchor();
    // Mobile double-tap, without triggering native page zoom.
    if (wasOne && !pinchUsed && !wasMoving && event.pointerType === 'touch') {
      const now=performance.now();
      const tapDistance=Math.hypot(event.clientX-lastTapX,event.clientY-lastTapY);
      if (now-lastTapTime<340 && tapDistance<34 && event.target===photo) {
        changeZoom(scale>1.01 ? 1:2.5,event.clientX,event.clientY);
        lastTapTime=0;
      } else {lastTapTime=now;lastTapX=event.clientX;lastTapY=event.clientY;}
    }
    if (pointers.size===0) {
      // Keep gesture state briefly so the click event cannot close after a pinch/drag.
      requestAnimationFrame(() => {moved=false;pinchUsed=false;});
    }
  }
  stage.addEventListener('pointerup', onPointerEnd);
  stage.addEventListener('pointercancel', onPointerEnd);
  document.addEventListener('keydown', event => {
    if (viewer.hidden) return;
    if (event.key==='Escape') {event.preventDefault();closeViewer();}
    if (event.key==='+' || event.key==='=') {event.preventDefault();changeZoom(scale*1.5);}
    if (event.key==='-') {event.preventDefault();changeZoom(scale/1.5);}
    if (event.key==='0') {event.preventDefault();resetZoom();}
    if (event.key==='Tab') {
      const controls=[minusButton,resetButton,plusButton,closeButton];
      const first=controls[0],last=controls[controls.length-1];
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
    }
  });
  window.addEventListener('resize', () => {if(!viewer.hidden) applyTransform();});
})();

/**
 * PURSLIP — Scroll-Controlled 153-Frame Financial-City WebP Image-Sequence Renderer
 * Dedicated vanilla JavaScript animation module (Express / EJS compatible).
 *
 * Uses all 153 sequential WebP frames in /public/purslip-frames/
 * (frame_0000.webp through frame_0152.webp, 1280x720 16:9).
 * Progressively preloads frames around the user's current scroll position,
 * maps scroll progress (0 -> 1) to frame index (0 -> 152) via requestAnimationFrame,
 * smoothly advances on scroll down and reverses on scroll up,
 * respects prefers-reduced-motion, and adapts across desktop, tablet, and mobile.
 */
(function (global) {
  'use strict';

  var DEFAULT_SEQUENCE_CONFIG = {
    canvasSelector: '#purslip-scroll-canvas',
    scrollRegionsSelector: '[data-scroll-sequence-stage]',
    // 153 sequential WebP frames in /public/purslip-frames/ (frame_0000.webp .. frame_0152.webp):
    frameDirectory: '/purslip-frames',
    filePrefix: 'frame_',
    fileExtension: 'webp',
    padLength: 4,
    startIndex: 0,
    totalFrames: 153,
    cacheBust: 'city153',
    // Progressive preloading & memory governance:
    slidingWindowRadius: 24,
    maxConcurrentLoads: 6,
    maxCachedFrames: 153,
    anchorStride: 15,
    // Responsive behavior across desktop, tablet, and mobile:
    mobileBreakpoint: 768,
    mobileFrameStep: 1,
    mobileStaticFallback: false,
    // Smooth interpolation factor for requestAnimationFrame scrubbing (forward & reverse):
    lerpFactor: 0.32,
    // Fallback & keyframe assets from the new 153-frame financial-city sequence:
    fallbackPoster: '/purslip-frames/frame_0000.webp?v=city153',
    keyframeUrls: [
      '/purslip-frames/frame_0000.webp?v=city153',
      '/purslip-frames/frame_0076.webp?v=city153',
      '/purslip-frames/frame_0152.webp?v=city153'
    ],
    sequenceFilesInstalled: true
  };

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function formatFramePath(index, cfg) {
    var startIdx = typeof cfg.startIndex === 'number' ? cfg.startIndex : 0;
    var maxIdx = startIdx + Math.max(1, cfg.totalFrames) - 1;
    var safeIdx = clamp(Math.round(index), startIdx, maxIdx);
    var str = String(safeIdx);
    while (str.length < cfg.padLength) {
      str = '0' + str;
    }
    var dir = cfg.frameDirectory.replace(/\/+$/, '');
    var ext = cfg.fileExtension.replace(/^\.+/, '');
    var path = dir + '/' + cfg.filePrefix + str + '.' + ext;
    if (cfg.cacheBust) {
      path += '?v=' + encodeURIComponent(cfg.cacheBust);
    }
    return path;
  }

  function mapScrollToFrame(progress, totalFrames, step, startIndex) {
    var startIdx = typeof startIndex === 'number' ? startIndex : 0;
    var safeTotal = Math.max(1, Math.floor(totalFrames));
    var safeStep = Math.max(1, Math.floor(step || 1));
    var p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
    var zeroBased = Math.round(p * (safeTotal - 1));
    var quantized = Math.min(safeTotal - 1, Math.round(zeroBased / safeStep) * safeStep);
    return startIdx + quantized;
  }

  function PurslipScrollSequence(userConfig) {
    this.config = Object.assign(
      {},
      DEFAULT_SEQUENCE_CONFIG,
      global.PURSLIP_SEQUENCE_CONFIG || {},
      userConfig || {}
    );
    this.canvas = document.querySelector(this.config.canvasSelector);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.isMobile = window.innerWidth < this.config.mobileBreakpoint;
    this.reducedMotion =
      Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var startIdx = this.config.startIndex || 0;
    this.scrollProgress = 0;
    this.targetFrameFloat = startIdx;
    this.currentFrameFloat = startIdx;
    this.currentFrameIndex = startIdx;
    this.lastRenderedFrameFloat = -1;
    this.rafId = null;
    this.isAnimating = false;

    // Frame cache & progressive loader state
    this.frameCache = new Map();
    this.loadingSet = new Set();
    this.failedSet = new Set();
    this.preloadQueue = [];
    this.activeLoads = 0;
    this.sequenceAvailable = Boolean(this.config.sequenceFilesInstalled);

    // Fallback & Keyframe images
    this.keyframes = [];
    this.keyframesLoaded = 0;

    this.init();
  }

  PurslipScrollSequence.prototype.getMinFrameIndex = function () {
    return typeof this.config.startIndex === 'number' ? this.config.startIndex : 0;
  };

  PurslipScrollSequence.prototype.getMaxFrameIndex = function () {
    return this.getMinFrameIndex() + Math.max(1, this.config.totalFrames) - 1;
  };

  PurslipScrollSequence.prototype.init = function () {
    var self = this;
    var minIdx = this.getMinFrameIndex();

    // Ensure canvas never intercepts pointer events
    this.canvas.style.pointerEvents = 'none';
    this.canvas.setAttribute('data-total-frames', String(this.config.totalFrames));
    this.canvas.setAttribute('data-current-frame', String(minIdx));
    this.canvas.setAttribute('data-scroll-progress', '0.0000');
    this.canvas.setAttribute(
      'data-renderer-mode',
      this.reducedMotion ? 'reduced-motion-static' : 'scroll-synchronized'
    );

    this.handleResize = this.onResize.bind(this);
    this.handleScroll = this.onScroll.bind(this);
    this.tick = this.renderLoop.bind(this);

    this.onResize();
    this.loadKeyframes();

    // Sync initial scroll position before queueing frames so mid-page reloads prioritize visible frames
    this.onScroll();

    if (this.sequenceAvailable) {
      this.enqueueFramesAround(this.currentFrameIndex);
    }

    window.addEventListener('resize', this.handleResize, { passive: true });
    window.addEventListener('scroll', this.handleScroll, { passive: true });

    // Listen for reduced motion changes
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.addEventListener) {
        mq.addEventListener('change', function (e) {
          self.reducedMotion = e.matches;
          self.canvas.setAttribute(
            'data-renderer-mode',
            self.reducedMotion ? 'reduced-motion-static' : 'scroll-synchronized'
          );
          self.lastRenderedFrameFloat = -1;
          self.requestTick();
        });
      }
    }

    this.drawFrame(this.currentFrameIndex, this.scrollProgress);
  };

  PurslipScrollSequence.prototype.loadKeyframes = function () {
    var self = this;
    var minIdx = this.getMinFrameIndex();
    var maxIdx = this.getMaxFrameIndex();
    var midIdx = Math.round((minIdx + maxIdx) * 0.5);
    var urls = this.config.keyframeUrls || [this.config.fallbackPoster];
    urls.forEach(function (url, idx) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        self.keyframes[idx] = img;
        if (idx === 0 && !self.frameCache.has(minIdx)) {
          self.frameCache.set(minIdx, img);
        } else if (idx === 1 && !self.frameCache.has(midIdx)) {
          self.frameCache.set(midIdx, img);
        } else if (idx === 2 && !self.frameCache.has(maxIdx)) {
          self.frameCache.set(maxIdx, img);
        }
        self.keyframesLoaded++;
        self.lastRenderedFrameFloat = -1;
        self.requestTick();
      };
      img.onerror = function () {
        self.lastRenderedFrameFloat = -1;
        self.requestTick();
      };
      img.src = url;
    });
  };

  PurslipScrollSequence.prototype.getEffectiveStep = function () {
    return this.isMobile ? this.config.mobileFrameStep : 1;
  };

  PurslipScrollSequence.prototype.enqueueFramesAround = function (centerFrame) {
    if (!this.sequenceAvailable || this.reducedMotion) return;
    if (this.isMobile && this.config.mobileStaticFallback) return;

    var step = this.getEffectiveStep();
    var minIdx = this.getMinFrameIndex();
    var maxIdx = this.getMaxFrameIndex();
    var radius = this.config.slidingWindowRadius;
    var priorities = [centerFrame];

    for (var offset = step; offset <= radius * step; offset += step) {
      var fwd = centerFrame + offset;
      var bwd = centerFrame - offset;
      if (fwd <= maxIdx) priorities.push(fwd);
      if (bwd >= minIdx) priorities.push(bwd);
    }

    // Add sparse anchor keyframes across all 153 frames so fast scrolling in either direction always has a nearby frame
    for (var anchor = minIdx; anchor <= maxIdx; anchor += this.config.anchorStride) {
      priorities.push(anchor);
    }
    if (priorities.indexOf(maxIdx) === -1) {
      priorities.push(maxIdx);
    }

    var self = this;
    var seen = new Set();
    this.preloadQueue = priorities.filter(function (idx) {
      if (seen.has(idx)) return false;
      seen.add(idx);
      return !self.frameCache.has(idx) && !self.loadingSet.has(idx) && !self.failedSet.has(idx);
    });

    this.processPreloadQueue();
  };

  PurslipScrollSequence.prototype.processPreloadQueue = function () {
    var self = this;
    var minIdx = this.getMinFrameIndex();

    while (
      this.activeLoads < this.config.maxConcurrentLoads &&
      this.preloadQueue.length > 0
    ) {
      var nextFrameIndex = this.preloadQueue.shift();
      if (
        this.frameCache.has(nextFrameIndex) ||
        this.loadingSet.has(nextFrameIndex) ||
        this.failedSet.has(nextFrameIndex)
      ) {
        continue;
      }

      this.activeLoads++;
      this.loadingSet.add(nextFrameIndex);

      (function (frameIdx) {
        var img = new Image();
        img.decoding = 'async';
        img.onload = function () {
          self.activeLoads--;
          self.loadingSet.delete(frameIdx);
          self.frameCache.set(frameIdx, img);
          self.evictDistantFrames(self.currentFrameIndex);
          self.lastRenderedFrameFloat = -1;
          self.requestTick();
          self.processPreloadQueue();
        };
        img.onerror = function () {
          self.activeLoads--;
          self.loadingSet.delete(frameIdx);
          self.failedSet.add(frameIdx);
          if (frameIdx === minIdx && self.frameCache.size === 0) {
            self.sequenceAvailable = false;
            self.preloadQueue = [];
          } else {
            self.processPreloadQueue();
          }
        };
        img.src = formatFramePath(frameIdx, self.config);
      })(nextFrameIndex);
    }
  };

  PurslipScrollSequence.prototype.evictDistantFrames = function (centerFrame) {
    if (this.frameCache.size <= this.config.maxCachedFrames) return;
    var minIdx = this.getMinFrameIndex();
    var stride = this.config.anchorStride;
    var keys = Array.from(this.frameCache.keys());
    keys.sort(function (a, b) {
      return Math.abs(b - centerFrame) - Math.abs(a - centerFrame);
    });
    while (this.frameCache.size > this.config.maxCachedFrames && keys.length > 0) {
      var furthest = keys.shift();
      // Keep anchor frames pinned if possible
      if ((furthest - minIdx) % stride !== 0) {
        this.frameCache.delete(furthest);
      }
    }
  };

  PurslipScrollSequence.prototype.onResize = function () {
    if (!this.canvas) return;
    this.isMobile = window.innerWidth < this.config.mobileBreakpoint;
    var width = window.innerWidth;
    var height = window.innerHeight;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.lastRenderedFrameFloat = -1;
    this.requestTick();
  };

  PurslipScrollSequence.prototype.onScroll = function () {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    var docHeight = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
    var maxScroll = Math.max(1, docHeight - window.innerHeight);
    var minIdx = this.getMinFrameIndex();

    this.scrollProgress = clamp(scrollTop / maxScroll, 0, 1);

    if (this.reducedMotion || (this.isMobile && this.config.mobileStaticFallback)) {
      this.targetFrameFloat = minIdx;
      this.currentFrameFloat = minIdx;
      this.currentFrameIndex = minIdx;
      this.updateAttributes(minIdx, this.scrollProgress);
      this.requestTick();
      return;
    }

    var step = this.getEffectiveStep();
    var targetIndex = mapScrollToFrame(
      this.scrollProgress,
      this.config.totalFrames,
      step,
      minIdx
    );
    this.targetFrameFloat = minIdx + this.scrollProgress * Math.max(1, this.config.totalFrames - 1);

    if (targetIndex !== this.currentFrameIndex) {
      this.currentFrameIndex = targetIndex;
      if (this.sequenceAvailable) {
        this.enqueueFramesAround(targetIndex);
      }
    }

    this.requestTick();
  };

  PurslipScrollSequence.prototype.requestTick = function () {
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.rafId = window.requestAnimationFrame(this.tick);
    }
  };

  PurslipScrollSequence.prototype.updateAttributes = function (frameIdx, progress) {
    if (!this.canvas) return;
    this.canvas.setAttribute('data-current-frame', String(frameIdx));
    this.canvas.setAttribute('data-scroll-progress', progress.toFixed(4));
  };

  PurslipScrollSequence.prototype.renderLoop = function () {
    this.isAnimating = false;
    var minIdx = this.getMinFrameIndex();
    var span = Math.max(1, this.config.totalFrames - 1);

    if (this.reducedMotion || (this.isMobile && this.config.mobileStaticFallback)) {
      if (this.lastRenderedFrameFloat !== minIdx) {
        this.drawFrame(minIdx, 0);
        this.lastRenderedFrameFloat = minIdx;
      }
      return;
    }

    var diff = this.targetFrameFloat - this.currentFrameFloat;
    if (Math.abs(diff) > 0.12) {
      this.currentFrameFloat += diff * this.config.lerpFactor;
    } else {
      this.currentFrameFloat = this.targetFrameFloat;
    }

    var normalizedProgress = clamp((this.currentFrameFloat - minIdx) / span, 0, 1);
    var step = this.getEffectiveStep();
    var quantizedIndex = mapScrollToFrame(
      normalizedProgress,
      this.config.totalFrames,
      step,
      minIdx
    );

    this.updateAttributes(quantizedIndex, normalizedProgress);

    if (Math.abs(this.currentFrameFloat - this.lastRenderedFrameFloat) > 0.04) {
      this.drawFrame(quantizedIndex, normalizedProgress);
      this.lastRenderedFrameFloat = this.currentFrameFloat;
    }

    if (Math.abs(this.targetFrameFloat - this.currentFrameFloat) > 0.12) {
      this.requestTick();
    }
  };

  PurslipScrollSequence.prototype.findNearestCachedFrame = function (targetIndex) {
    if (this.frameCache.has(targetIndex)) {
      return this.frameCache.get(targetIndex);
    }
    var bestImg = null;
    var bestDist = Infinity;
    this.frameCache.forEach(function (img, idx) {
      var d = Math.abs(idx - targetIndex);
      if (d < bestDist) {
        bestDist = d;
        bestImg = img;
      }
    });
    return bestImg;
  };

  /**
   * Renders an image onto the canvas using exact `object-fit: cover` and centered positioning.
   */
  PurslipScrollSequence.prototype.drawImageCover = function (img, alpha, scaleOffset, panYOffset) {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    var ctx = this.ctx;
    var cw = this.canvas.width;
    var ch = this.canvas.height;
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;

    var scale = Math.max(cw / iw, ch / ih) * (1 + (scaleOffset || 0));
    var dw = iw * scale;
    var dh = ih * scale;
    var dx = (cw - dw) * 0.5;
    var dy = (ch - dh) * 0.5 + (panYOffset || 0);

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  };

  /**
   * Renders the loaded WebP sequence frame (or fallback keyframe while initial frames load)
   * with balanced readability scrims so foreground text stays crisp while the financial-city
   * animation remains vividly visible across the entire landing page.
   */
  PurslipScrollSequence.prototype.drawFrame = function (frameIndex, progress) {
    var ctx = this.ctx;
    var cw = this.canvas.width;
    var ch = this.canvas.height;

    // 1. Base obsidian background (#050403)
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, cw, ch);

    // 2. Render exact or nearest loaded WebP frame from /purslip-frames/
    var seqImg = this.findNearestCachedFrame(frameIndex);
    if (seqImg) {
      this.drawImageCover(seqImg, 0.96, 0, 0);
    } else {
      this.drawKeyframeBlend(progress);
    }

    // 3. Apply balanced atmospheric scrims so text stays legible while city animation remains clear
    this.drawReadabilityScrims(progress);
  };

  PurslipScrollSequence.prototype.drawKeyframeBlend = function (progress) {
    var k0 = this.keyframes[0];
    var k1 = this.keyframes[1] || k0;
    var k2 = this.keyframes[2] || k1 || k0;

    if (!k0) return;

    if (progress <= 0.5) {
      var t = progress / 0.5;
      var smoothT = t * t * (3 - 2 * t);
      this.drawImageCover(k0, 0.96 * (1 - smoothT), 0, 0);
      if (k1) {
        this.drawImageCover(k1, 0.96 * smoothT, 0, 0);
      }
    } else {
      var t2 = (progress - 0.5) / 0.5;
      var smoothT2 = t2 * t2 * (3 - 2 * t2);
      if (k1) {
        this.drawImageCover(k1, 0.96 * (1 - smoothT2), 0, 0);
      }
      if (k2) {
        this.drawImageCover(k2, 0.96 * smoothT2, 0, 0);
      }
    }
  };

  PurslipScrollSequence.prototype.drawReadabilityScrims = function () {
    var ctx = this.ctx;
    var cw = this.canvas.width;
    var ch = this.canvas.height;

    // Subtle left-to-right editorial text protection scrim:
    // Keeps the left headline legible while leaving the financial-city animation bright and visible
    var horizScrim = ctx.createLinearGradient(0, 0, cw, 0);
    horizScrim.addColorStop(0, 'rgba(5, 4, 3, 0.46)');
    horizScrim.addColorStop(0.42, 'rgba(5, 4, 3, 0.22)');
    horizScrim.addColorStop(0.75, 'rgba(5, 4, 3, 0.10)');
    horizScrim.addColorStop(1, 'rgba(5, 4, 3, 0.16)');
    ctx.fillStyle = horizScrim;
    ctx.fillRect(0, 0, cw, ch);

    // Subtle top & bottom edge vignette (constant across scroll so the background never darkens/disappears)
    var vertScrim = ctx.createLinearGradient(0, 0, 0, ch);
    vertScrim.addColorStop(0, 'rgba(5, 4, 3, 0.34)');
    vertScrim.addColorStop(0.16, 'rgba(5, 4, 3, 0.08)');
    vertScrim.addColorStop(0.84, 'rgba(5, 4, 3, 0.10)');
    vertScrim.addColorStop(1, 'rgba(5, 4, 3, 0.38)');
    ctx.fillStyle = vertScrim;
    ctx.fillRect(0, 0, cw, ch);
  };

  PurslipScrollSequence.prototype.setFrameManually = function (frameIndex) {
    var minIdx = this.getMinFrameIndex();
    var maxIdx = this.getMaxFrameIndex();
    var safeFrame = clamp(Math.round(frameIndex), minIdx, maxIdx);
    var norm = (safeFrame - minIdx) / Math.max(1, this.config.totalFrames - 1);
    this.targetFrameFloat = safeFrame;
    this.currentFrameFloat = safeFrame;
    this.currentFrameIndex = safeFrame;
    this.scrollProgress = norm;
    this.updateAttributes(safeFrame, norm);
    this.drawFrame(safeFrame, norm);
  };

  // Expose constructor, pure math helpers, and singleton initializer on window
  PurslipScrollSequence.mapScrollToFrame = mapScrollToFrame;
  PurslipScrollSequence.formatFramePath = formatFramePath;
  global.PurslipScrollSequence = PurslipScrollSequence;

  function bootSequence() {
    if (!global.purslipSequenceInstance) {
      global.purslipSequenceInstance = new PurslipScrollSequence();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSequence);
  } else {
    bootSequence();
  }
})(window);

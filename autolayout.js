// Auto layout, part 1: where is the subject? A saliency map of the photo (sharp detail, color and skin tones, which
// out-of-focus backgrounds lack) plus face detection, reduced to a subject box. Part 2, scoring the layouts against
// it, lives with the renderer in social.html because it needs the real headline geometry.
// AutoLayout.analyze(img) -> { gw, gh, sal, busy, lum (Float32Arrays, gw*gh, 0..1), faces: [box], subject: box }, boxes in 0..1
// image coordinates { x, y, w, h }.
window.AutoLayout = (() => {
  const GW = 96; // grid width in cells; height follows the photo's aspect

  // Faces with MediaPipe's BlazeFace, loaded on first use. Short-range is tuned for faces that fill a good part
  // of the frame, which is most news portraits; small faces in crowd shots fall back to saliency alone.
  let detector;
  async function faceDetector() {
    if (detector !== undefined) return detector;
    try {
      const v = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const files = await v.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      detector = await v.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' },
        runningMode: 'IMAGE', minDetectionConfidence: 0.5,
      });
    } catch { detector = null; } // saliency still works without faces
    return detector;
  }

  // The detector is tuned for faces that fill a good part of the frame, so it also looks at four overlapping,
  // zoomed-in quarters of the photo, which finds people standing farther back. Overlapping finds are merged.
  async function faces(img) {
    const d = await faceDetector();
    if (!d) return [];
    const iw = img.naturalWidth || img.videoWidth, ih = img.naturalHeight || img.videoHeight;
    const found = [];
    const run = (src, ox, oy, sw, sh, min) => {
      try {
        for (const det of d.detect(src).detections) {
          if ((det.categories?.[0]?.score ?? 1) < min) continue;
          const b = det.boundingBox, kx = sw / src.width, ky = sh / src.height;
          // Which way the face is turned: the nose's offset from the middle of the face box (eye keypoints drift in
          // profile, the nose doesn't). 1 = toward the right of the photo, -1 = left, 0 = facing the camera.
          const nose = det.keypoints?.[2];
          let look = 0;
          if (nose) {
            const yaw = (nose.x * src.width - (b.originX + b.width / 2)) / b.width;
            look = yaw > 0.12 ? 1 : yaw < -0.12 ? -1 : 0;
          }
          found.push({ x: (ox + b.originX * kx) / iw, y: (oy + b.originY * ky) / ih, w: b.width * kx / iw, h: b.height * ky / ih, look });
        }
      } catch { /* a failed tile just finds nothing */ }
    };
    const whole = document.createElement('canvas');
    whole.width = iw; whole.height = ih; whole.getContext('2d').drawImage(img, 0, 0);
    run(whole, 0, 0, iw, ih, 0.5);
    const tw = iw * 0.6, th = ih * 0.6;
    for (const [ox, oy] of [[0, 0], [iw - tw, 0], [0, ih - th], [iw - tw, ih - th]]) {
      const c = document.createElement('canvas');
      c.width = Math.round(tw); c.height = Math.round(th);
      c.getContext('2d').drawImage(img, ox, oy, tw, th, 0, 0, c.width, c.height);
      run(c, ox, oy, tw, th, 0.65); // a little stricter: zoomed tiles see more false faces in texture
    }
    const iou = (a, b) => {
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return (ix * iy) / (a.w * a.h + b.w * b.h - ix * iy);
    };
    const merged = [];
    for (const f of found.filter((f) => f.w * f.h > 0.0008)) if (!merged.some((m) => iou(m, f) > 0.3)) merged.push(f);
    return merged;
  }

  function saliency(img) {
    const iw = img.naturalWidth || img.videoWidth, ih = img.naturalHeight || img.videoHeight;
    const gw = GW, gh = Math.max(8, Math.round(GW * ih / iw));
    const c = document.createElement('canvas');
    c.width = gw; c.height = gh;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, gw, gh);
    const px = x.getImageData(0, 0, gw, gh).data;
    const lum = new Float32Array(gw * gh), base = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) {
      const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0;
      // A loose skin-tone test (smartcrop's): reddish, mid-bright, not grey.
      const skin = r > 0.35 && g > 0.16 && b > 0.08 && r > g && r > b && r - Math.min(g, b) > 0.06 && Math.abs(r - g) > 0.06 ? 1 : 0;
      base[i] = 0.25 * sat * mx + 0.35 * skin;
    }
    const sal = new Float32Array(gw * gh), busy = new Float32Array(gw * gh);
    for (let y = 1; y < gh - 1; y++) for (let xx = 1; xx < gw - 1; xx++) {
      const i = y * gw + xx, L = (dx, dy) => lum[i + dy * gw + dx];
      const gx = L(1, -1) + 2 * L(1, 0) + L(1, 1) - L(-1, -1) - 2 * L(-1, 0) - L(-1, 1);
      const gy = L(-1, 1) + 2 * L(0, 1) + L(1, 1) - L(-1, -1) - 2 * L(0, -1) - L(1, -1);
      busy[i] = Math.min(1, Math.hypot(gx, gy) * 2); // raw detail: what makes text hard to read
      sal[i] = Math.min(1, Math.hypot(gx, gy) * 1.4) + base[i];
    }
    // Spread detail into regions (two box-blur passes), then a light pull toward the middle, where photographers
    // usually put the subject.
    const blur = (a) => {
      const o = new Float32Array(a.length), R = 3;
      for (let y = 0; y < gh; y++) for (let xx = 0; xx < gw; xx++) {
        let s = 0, n = 0;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const yy = y + dy, xxx = xx + dx;
          if (yy >= 0 && yy < gh && xxx >= 0 && xxx < gw) { s += a[yy * gw + xxx]; n++; }
        }
        o[y * gw + xx] = s / n;
      }
      return o;
    };
    let out = blur(blur(sal));
    let max = 0;
    for (let y = 0; y < gh; y++) for (let xx = 0; xx < gw; xx++) {
      const cx = (xx + 0.5) / gw - 0.5, cy = (y + 0.5) / gh - 0.5;
      const i = y * gw + xx;
      out[i] *= 0.75 + 0.25 * (1 - Math.min(1, Math.hypot(cx, cy) * 1.6));
      max = Math.max(max, out[i]);
    }
    if (max) for (let i = 0; i < out.length; i++) out[i] /= max;
    return { gw, gh, sal: out, busy: blur(busy), lum };
  }

  // The box holding the middle 70% of the strongest saliency, in both directions.
  function subjectBox({ gw, gh, sal }) {
    const cols = new Float32Array(gw), rows = new Float32Array(gh);
    let total = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const v = sal[y * gw + x];
      if (v < 0.65) continue;
      cols[x] += v; rows[y] += v; total += v;
    }
    if (!total) return { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
    const span = (a, n) => {
      let acc = 0, lo = 0, hi = n - 1;
      for (let i = 0; i < n; i++) { acc += a[i]; if (acc >= total * 0.15) { lo = i; break; } }
      acc = 0;
      for (let i = n - 1; i >= 0; i--) { acc += a[i]; if (acc >= total * 0.15) { hi = i; break; } }
      return [lo / n, (hi + 1) / n];
    };
    const [x0, x1] = span(cols, gw), [y0, y1] = span(rows, gh);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // A face's subject is the head and shoulders: wider than the face box and reaching down.
  const headAndShoulders = (f) => ({ x: f.x - f.w * 0.35, y: f.y - f.h * 0.25, w: f.w * 1.7, h: f.h * 2.1 });
  const union = (bs) => {
    const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
    const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
    return { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.min(1, x1) - Math.max(0, x0), h: Math.min(1, y1) - Math.max(0, y0) };
  };

  async function analyze(img) {
    const map = saliency(img);
    const fs = await faces(img);
    // Faces are what people look at first: weight them into the map so text avoids them above all.
    for (const f of fs) {
      const b = headAndShoulders(f);
      for (let y = Math.floor(b.y * map.gh); y < Math.ceil((b.y + b.h) * map.gh); y++)
        for (let x = Math.floor(b.x * map.gw); x < Math.ceil((b.x + b.w) * map.gw); x++)
          if (x >= 0 && y >= 0 && x < map.gw && y < map.gh) map.sal[y * map.gw + x] = Math.max(map.sal[y * map.gw + x], 1);
    }
    const subject = fs.length ? union(fs.map(headAndShoulders)) : subjectBox(map);
    // The focal point composition is judged by: the eyes of the largest face, else the peak of interest.
    let focal;
    if (fs.length) {
      const f = fs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
      focal = { x: f.x + f.w / 2, y: f.y + f.h * 0.38, look: f.look };
    } else {
      let sx = 0, sy = 0, sw = 0;
      for (let y = 0; y < map.gh; y++) for (let x = 0; x < map.gw; x++) {
        const v = map.sal[y * map.gw + x];
        if (v < 0.75) continue;
        sx += (x + 0.5) * v; sy += (y + 0.5) * v; sw += v;
      }
      focal = sw ? { x: sx / sw / map.gw, y: sy / sw / map.gh, look: 0 } : { x: subject.x + subject.w / 2, y: subject.y + subject.h / 2, look: 0 };
    }
    return { ...map, faces: fs, subject, focal };
  }

  return { analyze };
})();

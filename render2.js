/* Sdílená vykreslovací logika pro generátor příspěvků.
   Čistá funkce: Poster.render(ctx, model) – nezávislá na DOM.
   Podporuje světlá i tmavá témata (podle jasu pozadí) a odznak týmu. */
(function (global) {
  "use strict";

  const FONT = '"Montserrat", "Arial Narrow", Arial, sans-serif';
  const SCORE_FONT = '"Bebas Neue", "Arial Narrow", Arial, sans-serif';

  /* ---------- helpers ---------- */
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function fitFont(c, text, maxWidth, startSize, weight, minSize) {
    let size = startSize; minSize = minSize || 20;
    do { c.font = weight + " " + size + "px " + FONT; if (c.measureText(text).width <= maxWidth) break; size -= 2; } while (size > minSize);
    return size;
  }
  function wrapLines(c, text, maxWidth) {
    const words = String(text).split(/\s+/); const lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (c.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  // ---- easing pro animace ----
  function seg(p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  function shade(hex, percent) {
    if (hex[0] !== "#") return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + Math.round(255 * percent / 100)));
    g = Math.max(0, Math.min(255, g + Math.round(255 * percent / 100)));
    b = Math.max(0, Math.min(255, b + Math.round(255 * percent / 100)));
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function hexToRgba(hex, a) {
    if (hex[0] !== "#") return hex;
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function lum(hex) {
    if (!hex || hex[0] !== "#") return 0.5;
    const n = parseInt(hex.slice(1), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  function isLight(colors) { return lum(colors.secondary) > 0.6; }
  // poloprůhledná vrstva čitelná na daném pozadí (tmavá na světlém, světlá na tmavém)
  function overlay(colors, a) { return isLight(colors) ? "rgba(0,0,0," + a + ")" : "rgba(255,255,255," + a + ")"; }
  function pillTextColor(hex) { return lum(hex) > 0.62 ? "#111111" : "#ffffff"; }

  function isReady(img) { return img && img.complete && img.naturalWidth; }

  // obrys neprůhledných pixelů výřezu – sjednotí velikost i když PNG má různé okraje
  const cutoutCache = {};
  function cutoutBounds(img) {
    const key = img.src || String(img);
    if (cutoutCache[key]) return cutoutCache[key];
    const w = img.naturalWidth, h = img.naturalHeight;
    const fallback = { x: 0, y: 0, w: w || 1, h: h || 1, headX: (w || 1) / 2, headW: (w || 1) * 0.6 };
    if (!w || !h) { cutoutCache[key] = fallback; return fallback; }
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const cx = cv.getContext("2d");
    cx.drawImage(img, 0, 0);
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    try {
      const data = cx.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 24) {
            found = true;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
    } catch (e) { cutoutCache[key] = fallback; return fallback; }
    if (!found) { cutoutCache[key] = fallback; return fallback; }
    // vodorovný střed hlavy = střed neprůhledných pixelů v horním pásu obrysu
    const bandBottom = minY + Math.max(1, Math.round((maxY - minY + 1) * 0.28));
    let hMinX = w, hMaxX = 0, hFound = false;
    try {
      const data2 = cx.getImageData(0, 0, w, h).data;
      for (let y = minY; y <= bandBottom; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (data2[(y * w + x) * 4 + 3] > 60) { hFound = true; if (x < hMinX) hMinX = x; if (x > hMaxX) hMaxX = x; }
        }
      }
    } catch (e) { hFound = false; }
    const headX = hFound ? (hMinX + hMaxX) / 2 : (minX + maxX) / 2;
    const headW = hFound ? (hMaxX - hMinX + 1) : (maxX - minX + 1);
    const b = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, headX: headX, headW: headW };
    cutoutCache[key] = b; return b;
  }

  function fitCutout(img, slotW, d) {
    const b = cutoutBounds(img);
    const maxW = (slotW || d * 1.4) * 0.78;
    const targetH = d * 1.08; // stejná výška postavy pro všechny
    let dispH = targetH, dispW = targetH * (b.w / b.h);
    if (dispW > maxW) { dispW = maxW; dispH = maxW * (b.h / b.w); }
    return { b, dispW, dispH };
  }

  function drawImageContain(c, img, cx, cy, size) {
    const ratio = img.naturalWidth / img.naturalHeight;
    let w = size, h = size;
    if (ratio > 1) h = size / ratio; else w = size * ratio;
    c.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }
  function drawCrest(c, img, name, cx, cy, size, colors) {
    if (isReady(img)) { drawImageContain(c, img, cx, cy, size); return; }
    c.save();
    c.beginPath(); c.arc(cx, cy, size / 2, 0, Math.PI * 2);
    c.fillStyle = overlay(colors, 0.08); c.fill();
    c.lineWidth = Math.max(3, size * 0.02); c.strokeStyle = overlay(colors, 0.28); c.stroke();
    c.clip();
    const initials = (name || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase();
    c.fillStyle = colors.text; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "800 " + (size * 0.32) + "px " + FONT; c.fillText(initials, cx, cy);
    c.restore();
  }

  /* ---------- VS split (výsledek) ---------- */
  function _hx(v) { v = Math.max(0, Math.min(255, Math.round(v))); return v.toString(16).padStart(2, "0"); }
  function _toRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixHex(a, b, t) { const A = _toRgb(a), B = _toRgb(b); return "#" + _hx(A[0] + (B[0] - A[0]) * t) + _hx(A[1] + (B[1] - A[1]) * t) + _hx(A[2] + (B[2] - A[2]) * t); }
  function onColor(hex) { return lum(hex) > 0.62 ? "#0b1f2a" : "#ffffff"; }

  // dominantní (nejsytější) barva z loga – pro barvu soupeřovy poloviny
  const domColorCache = {};
  function dominantColor(img) {
    if (!isReady(img)) return null;
    const key = img.src || String(img);
    if (key in domColorCache) return domColorCache[key];
    const s = 56;
    const cv = document.createElement("canvas"); cv.width = s; cv.height = s;
    const cx = cv.getContext("2d"); cx.clearRect(0, 0, s, s);
    drawImageContain(cx, img, s / 2, s / 2, s);
    let data;
    try { data = cx.getImageData(0, 0, s, s).data; } catch (e) { domColorCache[key] = null; return null; }
    const buckets = {}; let best = null, bestScore = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]; if (a < 130) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx - mn, light = (mx + mn) / 2;
      if (sat < 45) continue; if (light > 238 || light < 24) continue;
      const k = (r >> 5) + "_" + (g >> 5) + "_" + (b >> 5);
      const bk = buckets[k] || (buckets[k] = { r: 0, g: 0, b: 0, n: 0, sc: 0 });
      bk.r += r; bk.g += g; bk.b += b; bk.n++; bk.sc += sat;
      if (bk.sc > bestScore) { bestScore = bk.sc; best = bk; }
    }
    const out = (best && best.n) ? ("#" + _hx(best.r / best.n) + _hx(best.g / best.n) + _hx(best.b / best.n)) : null;
    domColorCache[key] = out; return out;
  }

  function drawSplitBackground(c, w, h, leftCol, rightCol) {
    const topX = w * 0.56, botX = w * 0.44;
    const lg = c.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, shade(leftCol, 8)); lg.addColorStop(1, shade(leftCol, -28));
    c.fillStyle = lg; c.beginPath(); c.moveTo(0, 0); c.lineTo(topX, 0); c.lineTo(botX, h); c.lineTo(0, h); c.closePath(); c.fill();
    const rg = c.createLinearGradient(0, 0, 0, h);
    rg.addColorStop(0, shade(rightCol, 8)); rg.addColorStop(1, shade(rightCol, -28));
    c.fillStyle = rg; c.beginPath(); c.moveTo(topX, 0); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(botX, h); c.closePath(); c.fill();
    // dělící čára (jemný stín + světlá linka)
    c.save();
    c.strokeStyle = "rgba(0,0,0,0.18)"; c.lineWidth = Math.max(8, w * 0.016);
    c.beginPath(); c.moveTo(topX, 0); c.lineTo(botX, h); c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = Math.max(3, w * 0.005);
    c.beginPath(); c.moveTo(topX, 0); c.lineTo(botX, h); c.stroke();
    c.restore();
    // vinětace pro hloubku
    const vg = c.createRadialGradient(w / 2, h * 0.42, h * 0.14, w / 2, h * 0.5, h * 0.9);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.30)");
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }

  // velký průsvitný vodoznak znaku, oříznutý do své poloviny
  function drawHalfWatermark(c, w, h, img, side, alpha) {
    if (!isReady(img)) return;
    const topX = w * 0.56, botX = w * 0.44;
    c.save();
    c.beginPath();
    if (side === "left") { c.moveTo(0, 0); c.lineTo(topX, 0); c.lineTo(botX, h); c.lineTo(0, h); }
    else { c.moveTo(topX, 0); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(botX, h); }
    c.closePath(); c.clip();
    c.globalAlpha = (alpha != null ? alpha : 0.13);
    const cxp = side === "left" ? w * 0.22 : w * 0.78;
    drawImageContain(c, img, cxp, h * 0.5, h * 0.66);
    c.restore();
  }

  // skóre: tmavé kolečko + bílý prstenec + bílá čísla (styl B), ruční rozvržení + širší dvojtečka
  function drawScoreBadge(c, cx, cy, Rc, hs, as, half, isStory) {
    hs = String(hs != null ? hs : "0"); as = String(as != null ? as : "0");
    const hasHalf = (half || "").trim();

    // rozvržení čísel (spočítat dřív – podle šířky se dělá rám)
    let numSz = isStory ? 176 : 164;
    let colSz, gap, w1, w2, wc;
    function layout() {
      c.font = "400 " + numSz + "px " + SCORE_FONT; w1 = c.measureText(hs).width; w2 = c.measureText(as).width;
      colSz = numSz * 0.78; c.font = "400 " + colSz + "px " + SCORE_FONT; wc = c.measureText(":").width;
      gap = numSz * 0.12; // čísla blíž k sobě
      return w1 + gap + wc + gap + w2;
    }
    let totalW = layout();
    while (totalW > Rc * 2.4 && numSz > 80) { numSz -= 4; totalW = layout(); }

    // zaoblený obdélník (jako pilulky/panel střelců) – jemné tmavě šedé „sklo“ + bílý rámeček
    const boxH = Rc * 1.7, boxW = Math.max(totalW + Rc * 0.6, Rc * 2.1);
    const bx = cx - boxW / 2, byy = cy - boxH / 2, rad = Math.min(Rc * 0.42, boxH * 0.28);
    c.save();
    c.shadowColor = "rgba(0,0,0,0.22)"; c.shadowBlur = 22; c.shadowOffsetY = 8;
    c.fillStyle = "rgba(30,37,48,0.62)";
    roundRect(c, bx, byy, boxW, boxH, rad); c.fill();
    c.restore();
    c.save();
    const lw = Math.max(4, Rc * 0.032); c.lineWidth = lw; c.strokeStyle = "rgba(255,255,255,0.9)";
    roundRect(c, bx + lw / 2 + 1, byy + lw / 2 + 1, boxW - lw - 2, boxH - lw - 2, Math.max(2, rad - lw / 2)); c.stroke();
    c.restore();

    // hlavní skóre na střed rámu, poločas jen pod
    const midY = cy + (isStory ? 8 : 6);
    const startX = cx - totalW / 2;
    c.fillStyle = "#ffffff"; c.textAlign = "left"; c.textBaseline = "middle";
    c.font = "400 " + numSz + "px " + SCORE_FONT; c.fillText(hs, startX, midY);
    const colonX = startX + w1 + gap;
    c.font = "400 " + colSz + "px " + SCORE_FONT; c.fillText(":", colonX, midY - numSz * 0.06);
    c.font = "400 " + numSz + "px " + SCORE_FONT; c.fillText(as, colonX + wc + gap, midY);
    c.textAlign = "center"; c.textBaseline = "alphabetic";

    if (hasHalf) {
      c.fillStyle = "rgba(255,255,255,0.72)"; c.font = "700 " + (isStory ? 28 : 26) + "px " + FONT;
      c.fillText("( " + half.trim() + " )", cx, midY + numSz * 0.44);
    }
  }

  // výsledek decentně: bílý text + krátká barevná linka (bez barevné pilulky)
  function drawResultLabel(c, cx, y, label, isStory) {
    const sz = isStory ? 46 : 42;
    c.font = "900 " + sz + "px " + FONT;
    c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillText(label.text, cx, y);
    const tw = c.measureText(label.text).width;
    const uy = y + (isStory ? 16 : 14);
    c.strokeStyle = label.color; c.lineWidth = isStory ? 6 : 5; c.lineCap = "round";
    c.beginPath(); c.moveTo(cx - tw * 0.35, uy); c.lineTo(cx + tw * 0.35, uy); c.stroke();
    c.lineCap = "butt";
  }

  function drawTeamNameCol(c, name, cx, y, maxW, color, isStory, anchorBottom) {
    name = (name || "").toUpperCase();
    const size = fitFont(c, name, maxW, isStory ? 42 : 38, "800", 20);
    c.font = "800 " + size + "px " + FONT;
    const lines = wrapLines(c, name, maxW);
    // anchorBottom: y je účaří POSLEDNÍho řádku (blok roste nahoru) – vhodné nad znak
    let startY = anchorBottom ? (y - (lines.length - 1) * (size + 4)) : y;
    c.fillStyle = color; c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.save(); c.shadowColor = "rgba(0,0,0,0.30)"; c.shadowBlur = 8;
    let yy = startY; for (const ln of lines) { c.fillText(ln, cx, yy); yy += size + 4; }
    c.restore();
  }

  /* ---------- background ---------- */
  function drawBackground(c, w, h, colors) {
    const light = isLight(colors);
    const g = c.createLinearGradient(0, 0, 0, h);
    if (light) { g.addColorStop(0, shade(colors.secondary, 4)); g.addColorStop(1, shade(colors.secondary, -9)); }
    else { g.addColorStop(0, shade(colors.secondary, 6)); g.addColorStop(1, shade(colors.secondary, -34)); }
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    // diagonální akcent v barvě týmu
    c.save();
    c.globalAlpha = light ? 0.12 : 0.10;
    c.fillStyle = colors.primary;
    c.beginPath(); c.moveTo(w, 0); c.lineTo(w, h * 0.55); c.lineTo(w * 0.35, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * 0.55); c.lineTo(w * 0.6, h); c.closePath(); c.fill();
    c.restore();

    // jemná vinětace
    const vg = c.createRadialGradient(w / 2, h * 0.4, h * 0.15, w / 2, h / 2, h * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, light ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.30)");
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }

  // odznak týmu (MUŽI / DOROST); vrací y spodní hrany
  function drawTeamBadge(c, cx, top, model) {
    const label = (model.teamLabel || "").toUpperCase();
    if (!label) return top;
    c.font = "800 26px " + FONT;
    const w = c.measureText(label).width + 46;
    const h = 46;
    c.fillStyle = model.colors.primary;
    roundRect(c, cx - w / 2, top, w, h, h / 2); c.fill();
    c.fillStyle = pillTextColor(model.colors.primary);
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(label, cx, top + h / 2 + 1);
    c.textBaseline = "alphabetic";
    return top + h;
  }

  function drawFooter(c, w, h, model) {
    const footer = (model.footer || "").trim();
    if (!footer) return;
    const isStory = (model.format === "story" || model.format === "print");
    c.fillStyle = model.colors.text; c.globalAlpha = 0.72;
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.font = "700 26px " + FONT;
    c.fillText(footer, w / 2, h - (isStory ? 96 : 58));
    c.globalAlpha = 1;
  }

  function drawTeamName(c, name, cx, y, maxW, colors) {
    name = (name || "").toUpperCase();
    const size = fitFont(c, name, maxW, 36, "800", 20);
    c.font = "800 " + size + "px " + FONT; c.fillStyle = colors.text; c.textAlign = "center";
    let yy = y;
    for (const ln of wrapLines(c, name, maxW)) { c.fillText(ln, cx, yy); yy += size + 4; }
  }

  function resultLabel(r, colors) {
    const hs = parseInt(r.hs, 10), as = parseInt(r.as, 10);
    const brumIsHome = (r.home || "").toLowerCase().includes("brumovice");
    if (isNaN(hs) || isNaN(as)) return { text: "VÝSLEDEK", color: colors.primary };
    if (hs === as) return { text: "REMÍZA", color: "#64748b" };
    const brumWin = brumIsHome ? hs > as : as > hs;
    return brumWin ? { text: "VÝHRA", color: "#16a34a" } : { text: "PROHRA", color: "#dc2626" };
  }

  // panel střelců (tmavý, s linkami) – sdílený statikou i animací
  function drawScorersPanel(c, w, h, cx, scorers, isStory) {
    const ts = isStory ? 32 : 30;
    const line = scorers.join(", ");
    const ls = fitFont(c, line, w * 0.74, isStory ? 36 : 34, "600", 20);
    c.font = "600 " + ls + "px " + FONT;
    const sLines = wrapLines(c, line, w * 0.74);
    const padX = 46, padY = 28, innerGap = 16;
    c.font = "800 " + ts + "px " + FONT;
    let contentW = c.measureText("STŘELCI").width;
    c.font = "600 " + ls + "px " + FONT;
    for (const ln of sLines) contentW = Math.max(contentW, c.measureText(ln).width);
    const panelW = Math.min(w * 0.9, contentW + padX * 2);
    const panelH = padY * 2 + ts + innerGap + sLines.length * ls + (sLines.length - 1) * 8;
    const panelTop = Math.round(h * (isStory ? 0.74 : 0.72));

    c.save();
    c.shadowColor = "rgba(0,0,0,0.28)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = "rgba(9,20,28,0.58)";
    roundRect(c, cx - panelW / 2, panelTop, panelW, panelH, 22); c.fill();
    c.restore();

    c.textAlign = "center"; c.textBaseline = "alphabetic";
    const ty = panelTop + padY + ts * 0.82;
    c.font = "800 " + ts + "px " + FONT;
    const tW = c.measureText("STŘELCI").width;
    const ll = isStory ? 96 : 78, glp = 20, ly = ty - ts * 0.30;
    c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - tW / 2 - glp - ll, ly); c.lineTo(cx - tW / 2 - glp, ly); c.stroke();
    c.beginPath(); c.moveTo(cx + tW / 2 + glp, ly); c.lineTo(cx + tW / 2 + glp + ll, ly); c.stroke();
    c.fillStyle = "#ffffff"; c.fillText("STŘELCI", cx, ty);

    c.font = "600 " + ls + "px " + FONT; c.fillStyle = "rgba(255,255,255,0.97)";
    let yy = ty + innerGap + ls;
    for (const ln of sLines) { c.fillText(ln, cx, yy); yy += ls + 8; }
  }

  /* ---------- RESULT (VS split) ---------- */
  function renderResult(c, w, h, model) {
    const r = model.result, colors = model.colors;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");
    const homeIsBrum = (r.home || "").toLowerCase().includes("brumovice");

    // barvy půlek: naše strana = klubová primární, soupeř = z jeho loga (fallback tmavší klubový tón)
    const clubCol = (colors.primary && colors.primary[0] === "#") ? colors.primary : "#0fb5ac";
    const oppCol = dominantColor(model.oppLogo) || mixHex(clubCol, "#0b1220", 0.55);
    const leftCol = homeIsBrum ? clubCol : oppCol;
    const rightCol = homeIsBrum ? oppCol : clubCol;
    const leftTxt = onColor(leftCol), rightTxt = onColor(rightCol);

    drawSplitBackground(c, w, h, leftCol, rightCol);

    // velké průsvitné vodoznaky znaků v každé půlce
    drawHalfWatermark(c, w, h, homeIsBrum ? model.logo : model.oppLogo, "left");
    drawHalfWatermark(c, w, h, homeIsBrum ? model.oppLogo : model.logo, "right");

    // hlavička: odznak týmu + soutěž (bíle)
    let y = isStory ? 150 : 74;
    y = drawTeamBadge(c, cx, y, model);
    y += (isStory ? 46 : 40);
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    const compTxt = (r.comp || "").toUpperCase();
    if (compTxt) {
      c.save(); c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = 8;
      c.fillStyle = "#ffffff";
      const cs = fitFont(c, compTxt, w * 0.8, isStory ? 34 : 32, "800", 18);
      c.font = "800 " + cs + "px " + FONT; c.fillText(compTxt, cx, y);
      c.restore();
    }

    // znaky + skóre
    const rowY = isStory ? Math.round(h * 0.42) : Math.round(h * 0.46);
    const logoSize = isStory ? 250 : 236;
    const colHome = w * 0.215, colAway = w * 0.785;
    const Rc = isStory ? Math.round(w * 0.155) : Math.round(w * 0.15);

    drawCrest(c, homeIsBrum ? model.logo : model.oppLogo, r.home, colHome, rowY, logoSize, colors);
    drawCrest(c, homeIsBrum ? model.oppLogo : model.logo, r.away, colAway, rowY, logoSize, colors);

    // jména týmů NAD znaky (ať se dole neperou s výsledkem)
    const namesBottomY = rowY - logoSize / 2 - (isStory ? 64 : 56);
    drawTeamNameCol(c, r.home, colHome, namesBottomY, w * 0.40, leftTxt, isStory, true);
    drawTeamNameCol(c, r.away, colAway, namesBottomY, w * 0.40, rightTxt, isStory, true);

    // skóre (zaoblený obdélník)
    drawScoreBadge(c, cx, rowY, Rc, r.hs, r.as, r.half, isStory);

    // výsledek decentně (bílý text + barevná linka)
    const label = resultLabel(r, colors);
    const labelBaseY = rowY + Rc + (isStory ? 64 : 56);
    drawResultLabel(c, cx, labelBaseY, label, isStory);

    // střelci – na tmavém panelu (aby nezanikli na bílém předělu)
    const scorers = (r.scorers || []).filter(Boolean);
    if (scorers.length) drawScorersPanel(c, w, h, cx, scorers, isStory);

    // datum (velké) + patička (bíle)
    if ((r.date || "").trim()) {
      c.save(); c.shadowColor = "rgba(0,0,0,0.30)"; c.shadowBlur = 6;
      c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "alphabetic";
      c.font = "800 " + (isStory ? 40 : 36) + "px " + FONT;
      c.fillText(r.date, cx, isStory ? h - 130 : h - 92);
      c.restore();
    }
    const footer = (model.footer || "").trim();
    if (footer) {
      c.fillStyle = "rgba(255,255,255,0.85)"; c.textAlign = "center";
      c.font = "700 " + (isStory ? 28 : 26) + "px " + FONT;
      c.fillText(footer, cx, isStory ? h - 84 : h - 52);
    }
    c.textAlign = "left";
  }

  /* ---------- RESULT (animovaná varianta pro video) ---------- */
  function renderResultFrame(c, w, h, model, p) {
    const r = model.result, colors = model.colors;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");
    const homeIsBrum = (r.home || "").toLowerCase().includes("brumovice");
    const clubCol = (colors.primary && colors.primary[0] === "#") ? colors.primary : "#0fb5ac";
    const oppCol = dominantColor(model.oppLogo) || mixHex(clubCol, "#0b1220", 0.55);
    const leftCol = homeIsBrum ? clubCol : oppCol;
    const rightCol = homeIsBrum ? oppCol : clubCol;
    const leftTxt = onColor(leftCol), rightTxt = onColor(rightCol);

    // pozadí: půlky přijedou ze stran, pak čistý split
    function fillHalfAnim(col, side, dx) {
      const topX = w * 0.56 + dx, botX = w * 0.44 + dx;
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, shade(col, 8)); g.addColorStop(1, shade(col, -28));
      c.fillStyle = g; c.beginPath();
      if (side === "left") { c.moveTo(-w, 0); c.lineTo(topX, 0); c.lineTo(botX, h); c.lineTo(-w, h); }
      else { c.moveTo(topX, 0); c.lineTo(2 * w, 0); c.lineTo(2 * w, h); c.lineTo(botX, h); }
      c.closePath(); c.fill();
    }
    if (p < 0.30) {
      c.fillStyle = "#0b1220"; c.fillRect(0, 0, w, h);
      const eL = easeOutCubic(seg(p, 0, 0.26)), eR = easeOutCubic(seg(p, 0.05, 0.30));
      fillHalfAnim(leftCol, "left", -(1 - eL) * w * 0.62);
      fillHalfAnim(rightCol, "right", (1 - eR) * w * 0.62);
      const vg = c.createRadialGradient(w / 2, h * 0.42, h * 0.14, w / 2, h * 0.5, h * 0.9);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.30)");
      c.fillStyle = vg; c.fillRect(0, 0, w, h);
    } else {
      drawSplitBackground(c, w, h, leftCol, rightCol);
    }

    // vodoznaky (fade in)
    const wmA = easeOutCubic(seg(p, 0.26, 0.48)) * 0.13;
    if (wmA > 0) {
      drawHalfWatermark(c, w, h, homeIsBrum ? model.logo : model.oppLogo, "left", wmA);
      drawHalfWatermark(c, w, h, homeIsBrum ? model.oppLogo : model.logo, "right", wmA);
    }

    // hlavička
    {
      const a = easeOutCubic(seg(p, 0.16, 0.38)), dy = (1 - a) * (-26);
      if (a > 0) {
        c.save(); c.globalAlpha = a;
        let y = isStory ? 150 : 74;
        y = drawTeamBadge(c, cx, y + dy, model);
        y += (isStory ? 46 : 40);
        const compTxt = (r.comp || "").toUpperCase();
        if (compTxt) {
          c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "alphabetic";
          const cs = fitFont(c, compTxt, w * 0.8, isStory ? 34 : 32, "800", 18);
          c.font = "800 " + cs + "px " + FONT; c.fillText(compTxt, cx, y);
        }
        c.restore();
      }
    }

    const rowY = isStory ? Math.round(h * 0.42) : Math.round(h * 0.46);
    const logoSize = isStory ? 250 : 236;
    const colHome = w * 0.215, colAway = w * 0.785;
    const Rc = isStory ? Math.round(w * 0.155) : Math.round(w * 0.15);

    // znaky přijedou ze stran
    {
      const e = easeOutCubic(seg(p, 0.30, 0.52));
      if (e > 0) { c.save(); c.globalAlpha = e; drawCrest(c, homeIsBrum ? model.logo : model.oppLogo, r.home, colHome - (1 - e) * w * 0.16, rowY, logoSize, colors); c.restore(); }
    }
    {
      const e = easeOutCubic(seg(p, 0.36, 0.58));
      if (e > 0) { c.save(); c.globalAlpha = e; drawCrest(c, homeIsBrum ? model.oppLogo : model.logo, r.away, colAway + (1 - e) * w * 0.16, rowY, logoSize, colors); c.restore(); }
    }

    // jména týmů NAD znaky
    {
      const e = easeOutCubic(seg(p, 0.42, 0.60)), dy = (1 - e) * -14;
      if (e > 0) {
        c.save(); c.globalAlpha = e; c.translate(0, dy);
        const namesBottomY = rowY - logoSize / 2 - (isStory ? 64 : 56);
        drawTeamNameCol(c, r.home, colHome, namesBottomY, w * 0.40, leftTxt, isStory, true);
        drawTeamNameCol(c, r.away, colAway, namesBottomY, w * 0.40, rightTxt, isStory, true);
        c.restore();
      }
    }

    // skóre – pop
    {
      const e = easeOutBack(seg(p, 0.50, 0.68)), a = seg(p, 0.50, 0.60);
      if (a > 0) {
        c.save(); c.globalAlpha = Math.min(1, a);
        c.translate(cx, rowY); c.scale(Math.max(0.001, e), Math.max(0.001, e)); c.translate(-cx, -rowY);
        drawScoreBadge(c, cx, rowY, Rc, r.hs, r.as, r.half, isStory);
        c.restore();
      }
    }

    // výsledek – pop (decentní)
    const label = resultLabel(r, colors);
    const labelBaseY = rowY + Rc + (isStory ? 64 : 56);
    {
      const e = easeOutBack(seg(p, 0.62, 0.78)), a = seg(p, 0.62, 0.72);
      if (a > 0) {
        const pcy = labelBaseY - (isStory ? 46 : 42) * 0.35;
        c.save(); c.globalAlpha = Math.min(1, a);
        c.translate(cx, pcy); c.scale(Math.max(0.001, e), Math.max(0.001, e)); c.translate(-cx, -pcy);
        drawResultLabel(c, cx, labelBaseY, label, isStory);
        c.restore();
      }
    }

    // střelci
    const scorers = (r.scorers || []).filter(Boolean);
    if (scorers.length) {
      const e = easeOutCubic(seg(p, 0.78, 0.93)), dy = (1 - e) * 22;
      if (e > 0) { c.save(); c.globalAlpha = e; c.translate(0, dy); drawScorersPanel(c, w, h, cx, scorers, isStory); c.restore(); }
    }

    // datum
    {
      const a = easeOutCubic(seg(p, 0.84, 0.96));
      if (a > 0 && (r.date || "").trim()) {
        c.save(); c.globalAlpha = a; c.shadowColor = "rgba(0,0,0,0.30)"; c.shadowBlur = 6;
        c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "alphabetic";
        c.font = "800 " + (isStory ? 40 : 36) + "px " + FONT;
        c.fillText(r.date, cx, isStory ? h - 130 : h - 92); c.restore();
      }
    }
    // patička
    {
      const a = easeOutCubic(seg(p, 0.90, 1.0));
      const footer = (model.footer || "").trim();
      if (a > 0 && footer) {
        c.save(); c.globalAlpha = a;
        c.fillStyle = "rgba(255,255,255,0.85)"; c.textAlign = "center"; c.textBaseline = "alphabetic";
        c.font = "700 " + (isStory ? 28 : 26) + "px " + FONT;
        c.fillText(footer, cx, isStory ? h - 84 : h - 52); c.restore();
      }
    }

    // světelný přejezd
    {
      const sp = seg(p, 0.30, 0.62);
      if (sp > 0 && sp < 1) {
        c.save();
        const bandW = w * 0.45, xpos = -bandW + (w + bandW * 2) * easeInOut(sp);
        const g = c.createLinearGradient(xpos, 0, xpos + bandW, 0);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.10)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.restore();
      }
    }
    c.textAlign = "left";
  }

  /* ---------- INVITE ---------- */
  function drawInfoCol(c, label, value, cx, y, maxW, colors, tx) {
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = colors.primary; c.font = "800 24px " + FONT;
    c.fillText((label || "").toUpperCase(), cx, y);
    c.fillStyle = tx;
    const vs = fitFont(c, value, maxW, 34, "700", 18);
    c.font = "700 " + vs + "px " + FONT;
    let vy = y + 42;
    for (const ln of wrapLines(c, value, maxW).slice(0, 2)) { c.fillText(ln, cx, vy); vy += vs + 4; }
  }

  // střední plaketa „VS" (stejný tvar jako skóre u výsledku)
  function drawVsBadge(c, cx, cy, Rc, isStory) {
    const boxH = Rc * 1.5, boxW = Rc * 1.9;
    const bx = cx - boxW / 2, byy = cy - boxH / 2, rad = Math.min(Rc * 0.42, boxH * 0.28);
    c.save();
    c.shadowColor = "rgba(0,0,0,0.22)"; c.shadowBlur = 22; c.shadowOffsetY = 8;
    c.fillStyle = "rgba(30,37,48,0.62)";
    roundRect(c, bx, byy, boxW, boxH, rad); c.fill();
    c.restore();
    c.save();
    const lw = Math.max(4, Rc * 0.032); c.lineWidth = lw; c.strokeStyle = "rgba(255,255,255,0.9)";
    roundRect(c, bx + lw / 2 + 1, byy + lw / 2 + 1, boxW - lw - 2, boxH - lw - 2, Math.max(2, rad - lw / 2)); c.stroke();
    c.restore();
    c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "900 italic " + (isStory ? 92 : 84) + "px " + FONT;
    c.fillText("VS", cx, cy + (isStory ? 4 : 3));
    c.textBaseline = "alphabetic";
  }

  // spodní panel pozvánky: DATUM + ČAS + místo/soutěž (tmavé „sklo", čitelné na splitu)
  function drawInvitePanel(c, w, h, cx, iv, colors, isStory) {
    const dt = (iv.date || "").trim();
    const tm = (iv.time || "").trim();
    const infoLine = [(iv.venue || "").trim(), (iv.comp || "").trim()].filter(Boolean).join("  •  ");
    const dateSz = isStory ? 58 : 52, timeSz = isStory ? 46 : 42, infoSz = isStory ? 30 : 28;
    const padX = 54, padY = 34, gap = 16;

    c.font = "900 " + dateSz + "px " + FONT;
    let contentW = dt ? c.measureText(dt.toUpperCase()).width : 0;
    if (tm) { c.font = "800 " + timeSz + "px " + FONT; contentW = Math.max(contentW, c.measureText(tm).width); }
    if (infoLine) { c.font = "700 " + infoSz + "px " + FONT; contentW = Math.max(contentW, c.measureText(infoLine).width); }
    const panelW = Math.min(w * 0.9, contentW + padX * 2);
    let panelH = padY * 2;
    if (dt) panelH += dateSz;
    if (tm) panelH += (dt ? gap : 0) + timeSz;
    if (infoLine) panelH += ((dt || tm) ? gap : 0) + infoSz;
    const panelTop = Math.round(h * (isStory ? 0.68 : 0.66));

    c.save();
    c.shadowColor = "rgba(0,0,0,0.28)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = "rgba(9,20,28,0.58)";
    roundRect(c, cx - panelW / 2, panelTop, panelW, panelH, 22); c.fill();
    c.restore();

    c.textAlign = "center"; c.textBaseline = "alphabetic";
    let yy = panelTop + padY;
    if (dt) {
      c.fillStyle = "#ffffff"; c.font = "900 " + dateSz + "px " + FONT;
      c.fillText(dt.toUpperCase(), cx, yy + dateSz * 0.82); yy += dateSz + ((tm || infoLine) ? gap : 0);
    }
    if (tm) {
      c.fillStyle = "#ffffff"; c.font = "800 " + timeSz + "px " + FONT;
      c.fillText(tm, cx, yy + timeSz * 0.82); yy += timeSz + (infoLine ? gap : 0);
    }
    if (infoLine) {
      c.fillStyle = "rgba(255,255,255,0.92)"; c.font = "700 " + infoSz + "px " + FONT;
      c.fillText(infoLine, cx, yy + infoSz * 0.82);
    }
  }

  /* ---------- INVITE (VS split) ---------- */
  function renderInvite(c, w, h, model) {
    const iv = model.invite, colors = model.colors;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");
    const homeIsBrum = iv.side !== "away";

    const clubCol = (colors.primary && colors.primary[0] === "#") ? colors.primary : "#0fb5ac";
    const oppCol = dominantColor(model.oppLogo) || mixHex(clubCol, "#0b1220", 0.55);
    const leftCol = homeIsBrum ? clubCol : oppCol;
    const rightCol = homeIsBrum ? oppCol : clubCol;
    const leftTxt = onColor(leftCol), rightTxt = onColor(rightCol);

    drawSplitBackground(c, w, h, leftCol, rightCol);
    drawHalfWatermark(c, w, h, homeIsBrum ? model.logo : model.oppLogo, "left");
    drawHalfWatermark(c, w, h, homeIsBrum ? model.oppLogo : model.logo, "right");

    // hlavička: odznak + titul (bíle)
    let y = isStory ? 150 : 74;
    y = drawTeamBadge(c, cx, y, model);
    y += (isStory ? 46 : 40);
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    const title = (iv.title || "").toUpperCase();
    if (title) {
      c.save(); c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = 8;
      c.fillStyle = "#ffffff";
      const ts = fitFont(c, title, w * 0.8, isStory ? 34 : 32, "800", 18);
      c.font = "800 " + ts + "px " + FONT; c.fillText(title, cx, y); c.restore();
    }

    // znaky + VS
    const rowY = isStory ? Math.round(h * 0.40) : Math.round(h * 0.42);
    const logoSize = isStory ? 250 : 236;
    const colHome = w * 0.215, colAway = w * 0.785;
    const Rc = isStory ? Math.round(w * 0.13) : Math.round(w * 0.125);
    const leftName = homeIsBrum ? "Sokol Brumovice" : iv.opp;
    const rightName = homeIsBrum ? iv.opp : "Sokol Brumovice";

    drawCrest(c, homeIsBrum ? model.logo : model.oppLogo, leftName, colHome, rowY, logoSize, colors);
    drawCrest(c, homeIsBrum ? model.oppLogo : model.logo, rightName, colAway, rowY, logoSize, colors);

    // jména NAD znaky
    const namesBottomY = rowY - logoSize / 2 - (isStory ? 64 : 56);
    drawTeamNameCol(c, leftName, colHome, namesBottomY, w * 0.40, "#ffffff", isStory, true);
    drawTeamNameCol(c, rightName, colAway, namesBottomY, w * 0.40, "#ffffff", isStory, true);

    drawVsBadge(c, cx, rowY, Rc, isStory);

    drawInvitePanel(c, w, h, cx, iv, colors, isStory);

    // patička (bíle)
    const footer = (model.footer || "").trim();
    if (footer) {
      c.fillStyle = "rgba(255,255,255,0.85)"; c.textAlign = "center"; c.textBaseline = "alphabetic";
      c.font = "700 " + (isStory ? 28 : 26) + "px " + FONT;
      c.fillText(footer, cx, isStory ? h - 84 : h - 52);
    }
    c.textAlign = "left";
  }

  /* ---------- INVITE (animovaná varianta pro video) ---------- */
  // p = 0..1 (průběh úvodní animace). Při p>=1 vypadá stejně jako statická pozvánka.
  function renderInviteFrame(c, w, h, model, p) {
    const iv = model.invite, colors = model.colors;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");
    const homeIsBrum = iv.side !== "away";
    const clubCol = (colors.primary && colors.primary[0] === "#") ? colors.primary : "#0fb5ac";
    const oppCol = dominantColor(model.oppLogo) || mixHex(clubCol, "#0b1220", 0.55);
    const leftCol = homeIsBrum ? clubCol : oppCol;
    const rightCol = homeIsBrum ? oppCol : clubCol;
    const leftTxt = onColor(leftCol), rightTxt = onColor(rightCol);

    // pozadí: půlky přijedou ze stran, pak čistý split
    function fillHalfAnim(col, side, dx) {
      const topX = w * 0.56 + dx, botX = w * 0.44 + dx;
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, shade(col, 8)); g.addColorStop(1, shade(col, -28));
      c.fillStyle = g; c.beginPath();
      if (side === "left") { c.moveTo(-w, 0); c.lineTo(topX, 0); c.lineTo(botX, h); c.lineTo(-w, h); }
      else { c.moveTo(topX, 0); c.lineTo(2 * w, 0); c.lineTo(2 * w, h); c.lineTo(botX, h); }
      c.closePath(); c.fill();
    }
    if (p < 0.30) {
      c.fillStyle = "#0b1220"; c.fillRect(0, 0, w, h);
      const eL = easeOutCubic(seg(p, 0, 0.26)), eR = easeOutCubic(seg(p, 0.05, 0.30));
      fillHalfAnim(leftCol, "left", -(1 - eL) * w * 0.62);
      fillHalfAnim(rightCol, "right", (1 - eR) * w * 0.62);
      const vg = c.createRadialGradient(w / 2, h * 0.42, h * 0.14, w / 2, h * 0.5, h * 0.9);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.30)");
      c.fillStyle = vg; c.fillRect(0, 0, w, h);
    } else {
      drawSplitBackground(c, w, h, leftCol, rightCol);
    }

    // vodoznaky (fade in)
    const wmA = easeOutCubic(seg(p, 0.26, 0.48)) * 0.13;
    if (wmA > 0) {
      drawHalfWatermark(c, w, h, homeIsBrum ? model.logo : model.oppLogo, "left", wmA);
      drawHalfWatermark(c, w, h, homeIsBrum ? model.oppLogo : model.logo, "right", wmA);
    }

    // hlavička (odznak + titul)
    {
      const a = easeOutCubic(seg(p, 0.16, 0.38)), dy = (1 - a) * (-26);
      if (a > 0) {
        c.save(); c.globalAlpha = a;
        let yy = (isStory ? 150 : 74) + dy;
        yy = drawTeamBadge(c, cx, yy, model);
        yy += (isStory ? 46 : 40);
        const title = (iv.title || "").toUpperCase();
        if (title) {
          c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "alphabetic";
          const ts = fitFont(c, title, w * 0.8, isStory ? 34 : 32, "800", 18);
          c.font = "800 " + ts + "px " + FONT; c.fillText(title, cx, yy);
        }
        c.restore();
      }
    }

    const rowY = isStory ? Math.round(h * 0.40) : Math.round(h * 0.42);
    const logoSize = isStory ? 250 : 236;
    const colHome = w * 0.215, colAway = w * 0.785;
    const Rc = isStory ? Math.round(w * 0.13) : Math.round(w * 0.125);
    const leftName = homeIsBrum ? "Sokol Brumovice" : iv.opp;
    const rightName = homeIsBrum ? iv.opp : "Sokol Brumovice";

    // znaky přijedou ze stran
    {
      const e = easeOutCubic(seg(p, 0.30, 0.52));
      if (e > 0) { c.save(); c.globalAlpha = e; drawCrest(c, homeIsBrum ? model.logo : model.oppLogo, leftName, colHome - (1 - e) * w * 0.16, rowY, logoSize, colors); c.restore(); }
    }
    {
      const e = easeOutCubic(seg(p, 0.36, 0.58));
      if (e > 0) { c.save(); c.globalAlpha = e; drawCrest(c, homeIsBrum ? model.oppLogo : model.logo, rightName, colAway + (1 - e) * w * 0.16, rowY, logoSize, colors); c.restore(); }
    }

    // jména NAD znaky
    {
      const e = easeOutCubic(seg(p, 0.42, 0.60)), dy = (1 - e) * -14;
      if (e > 0) {
        c.save(); c.globalAlpha = e; c.translate(0, dy);
        const namesBottomY = rowY - logoSize / 2 - (isStory ? 64 : 56);
        drawTeamNameCol(c, leftName, colHome, namesBottomY, w * 0.40, "#ffffff", isStory, true);
        drawTeamNameCol(c, rightName, colAway, namesBottomY, w * 0.40, "#ffffff", isStory, true);
        c.restore();
      }
    }

    // VS – pop
    {
      const e = easeOutBack(seg(p, 0.52, 0.70)), a = seg(p, 0.52, 0.64);
      if (a > 0) {
        c.save(); c.globalAlpha = Math.min(1, a);
        c.translate(cx, rowY); c.scale(Math.max(0.001, e), Math.max(0.001, e)); c.translate(-cx, -rowY);
        drawVsBadge(c, cx, rowY, Rc, isStory);
        c.restore();
      }
    }

    // spodní panel – fade + rise
    {
      const e = easeOutCubic(seg(p, 0.66, 0.88)), dy = (1 - e) * 24;
      if (e > 0) {
        c.save(); c.globalAlpha = e; c.translate(0, dy);
        drawInvitePanel(c, w, h, cx, iv, colors, isStory);
        c.restore();
      }
    }

    // patička
    {
      const a = easeOutCubic(seg(p, 0.90, 1.0));
      if (a > 0) {
        c.save(); c.globalAlpha = a;
        const footer = (model.footer || "").trim();
        if (footer) {
          c.fillStyle = "rgba(255,255,255,0.85)"; c.textAlign = "center"; c.textBaseline = "alphabetic";
          c.font = "700 " + (isStory ? 28 : 26) + "px " + FONT;
          c.fillText(footer, cx, isStory ? h - 84 : h - 52);
        }
        c.restore();
      }
    }

    // světelný přejezd (shine)
    {
      const sp = seg(p, 0.30, 0.62);
      if (sp > 0 && sp < 1) {
        c.save();
        const bandW = w * 0.45, xpos = -bandW + (w + bandW * 2) * easeInOut(sp);
        const g = c.createLinearGradient(xpos, 0, xpos + bandW, 0);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.12)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.restore();
      }
    }
  }

  /* ---------- ANNOUNCE ---------- */
  function renderAnnounce(c, w, h, model) {
    const a = model.announce, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

    // varianta s fotkami hráčů (oznámení o odchodech apod.)
    const players = (a.players || []).filter(p => (p.name || "").trim() || isReady(p.photo));
    if (players.length) { renderAnnouncePhotos(c, w, h, model, players); return; }

    let y = isStory ? 150 : 72;
    y = drawTeamBadge(c, cx, y, model);

    drawCrest(c, model.logo, "Sokol Brumovice", cx, isStory ? h * 0.28 : h * 0.26, isStory ? 220 : 190, colors);

    y = isStory ? h * 0.46 : h * 0.44;
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    const eb = (a.eyebrow || "").trim();
    if (eb) { c.fillStyle = colors.primary; c.font = "800 30px " + FONT; c.fillText(eb.toUpperCase(), cx, y); y += 78; }

    c.fillStyle = tx;
    const titleSize = fitFont(c, (a.title || "").toUpperCase(), w * 0.84, 76, "900", 34);
    c.font = "900 " + titleSize + "px " + FONT;
    for (const ln of wrapLines(c, (a.title || "").toUpperCase(), w * 0.84)) { c.fillText(ln, cx, y); y += titleSize + 8; }

    y += 12; c.strokeStyle = colors.primary; c.lineWidth = 5;
    c.beginPath(); c.moveTo(cx - 70, y); c.lineTo(cx + 70, y); c.stroke(); y += 48;

    c.fillStyle = tx; c.globalAlpha = 0.92; c.font = "500 34px " + FONT;
    for (const ln of wrapLines(c, a.text || "", w * 0.8)) { c.fillText(ln, cx, y); y += 46; }
    c.globalAlpha = 1;
    drawFooter(c, w, h, model);
  }

  /* ---------- SOUPEŘI (přehled na sezónu) ---------- */
  function renderSouperi(c, w, h, model) {
    const s = model.souperi || {}, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

    let y = isStory ? 150 : 72;
    y = drawTeamBadge(c, cx, y, model);
    y += 54;

    c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = tx;
    const title = (s.title || "").toUpperCase();
    if (title) {
      const tSize = fitFont(c, title, w * 0.86, 64, "900", 30);
      c.font = "900 " + tSize + "px " + FONT; c.fillText(title, cx, y); y += 6;
    }
    if ((s.season || "").trim()) {
      c.fillStyle = colors.primary; c.font = "800 36px " + FONT;
      c.fillText(s.season, cx, y + 40); y += 40;
    }

    const list = s.list || [];
    const n = list.length;
    if (n) {
      const cols = n > 9 ? 4 : (n > 4 ? 3 : 2);
      const rows = Math.ceil(n / cols);
      const gridTop = y + 48;
      const gridBottom = h - (isStory ? 150 : 96);
      const gridLeft = w * 0.05, gridW = w * 0.90;
      const cellW = gridW / cols;
      const cellH = (gridBottom - gridTop) / rows;
      const logoSize = Math.min(cellW, cellH) * 0.56;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols), col = i % cols;
        const ccx = gridLeft + cellW * (col + 0.5);
        const ccy = gridTop + cellH * r + cellH * 0.40;
        drawCrest(c, list[i].logo, list[i].name, ccx, ccy, logoSize, colors);
        c.fillStyle = tx; c.textAlign = "center";
        const nm = list[i].name;
        const nsize = fitFont(c, nm, cellW * 0.95, 24, "700", 13);
        c.font = "700 " + nsize + "px " + FONT;
        let ny = ccy + logoSize / 2 + 26;
        for (const ln of wrapLines(c, nm, cellW * 0.95).slice(0, 2)) { c.fillText(ln, ccx, ny); ny += nsize + 2; }
      }
    }
    drawFooter(c, w, h, model);
  }

  /* ---------- ROZPIS (rozpis zápasů) ---------- */
  function renderSchedule(c, w, h, model) {
    const s = model.schedule || {}, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");
    const matches = s.list || s.matches || [];

    let y = isStory ? 140 : 60;
    y = drawTeamBadge(c, cx, y, model);
    y += isStory ? 60 : 46;

    c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = tx;
    const title = (s.title || "").toUpperCase();
    if (title) {
      const ts = fitFont(c, title, w * 0.88, isStory ? 74 : 62, "900", 30);
      c.font = "900 " + ts + "px " + FONT; c.fillText(title, cx, y); y += ts * 0.16 + 18;
    }
    if ((s.sub || "").trim()) {
      c.fillStyle = colors.primary; c.font = "800 " + (isStory ? 38 : 34) + "px " + FONT;
      c.fillText(s.sub, cx, y + 20); y += 44;
    }

    const n = matches.length;
    if (!n) { drawFooter(c, w, h, model); return; }

    const gridLeft = w * 0.06, gridRight = w * 0.94, gridW = gridRight - gridLeft;
    const listTop = y + (isStory ? 44 : 30);
    const listBottom = h - (isStory ? 150 : 88);
    const rowH = (listBottom - listTop) / n;
    const dsz = Math.max(15, Math.min(rowH * 0.36, isStory ? 34 : 30));
    const psz = Math.min(dsz * 0.72, 22);
    const padX = gridW * 0.035;
    const dateX = gridLeft + padX;
    const oppX = gridLeft + gridW * 0.27;
    const ph = Math.min(rowH * 0.62, psz + 20);

    // pevné sloupce, ať čas i pilulka DOMA/VENKU sedí přesně pod sebou
    c.font = "800 " + psz + "px " + FONT;
    const pillW = Math.max(c.measureText("DOMA").width, c.measureText("VENKU").width) + 34;
    const pillX = gridRight - padX - pillW;      // stejná levá hrana pro všechny pilulky
    const showTime = s.showTime && matches.some(m => (m.time || "").trim());
    const timeW = c.measureText("00:00").width;
    const timeRight = pillX - 24;                  // společná pravá hrana časů
    const contentRight = showTime ? (timeRight - timeW - 20) : (pillX - 16);

    for (let i = 0; i < n; i++) {
      const m = matches[i];
      const cy = listTop + rowH * (i + 0.5);

      if (i % 2 === 0) {
        c.fillStyle = overlay(colors, 0.055);
        roundRect(c, gridLeft, cy - rowH * 0.42, gridW, rowH * 0.84, Math.min(14, rowH * 0.25)); c.fill();
      }

      c.textBaseline = "middle";

      // pilulka DOMA / VENKU – pevný sloupec vpravo
      const plabel = m.home ? "DOMA" : "VENKU";
      c.font = "800 " + psz + "px " + FONT;
      if (m.home) {
        c.fillStyle = colors.primary; roundRect(c, pillX, cy - ph / 2, pillW, ph, ph / 2); c.fill();
        c.fillStyle = pillTextColor(colors.primary);
      } else {
        c.strokeStyle = overlay(colors, 0.42); c.lineWidth = 2;
        roundRect(c, pillX, cy - ph / 2, pillW, ph, ph / 2); c.stroke();
        c.fillStyle = tx; c.globalAlpha = 0.72;
      }
      c.textAlign = "center"; c.fillText(plabel, pillX + pillW / 2, cy + 1); c.globalAlpha = 1;

      // čas – pevný sloupec (pravá hrana stejná pro všechny řádky)
      if (showTime && (m.time || "").trim()) {
        c.textAlign = "right"; c.fillStyle = tx; c.globalAlpha = 0.68;
        c.font = "600 " + psz + "px " + FONT;
        c.fillText(m.time, timeRight, cy); c.globalAlpha = 1;
      }

      // datum (vlevo, bez roku)
      c.textAlign = "left"; c.fillStyle = colors.primary; c.font = "800 " + dsz + "px " + FONT;
      c.fillText(shortDate(m.date), dateX, cy);

      // soupeř
      c.fillStyle = tx;
      const oppMaxW = contentRight - oppX;
      const osz = fitFont(c, m.opp, oppMaxW, dsz, "700", 14);
      c.font = "700 " + osz + "px " + FONT;
      c.fillText(clipText(c, m.opp, oppMaxW), oppX, cy);
    }
    c.textBaseline = "alphabetic";
    drawFooter(c, w, h, model);
  }
  function shortDate(d) { return String(d || "").replace(/\s*20\d\d\s*$/, "").trim(); }
  function clipText(c, text, maxW) {
    text = String(text || "");
    if (c.measureText(text).width <= maxW) return text;
    while (text.length > 1 && c.measureText(text + "…").width > maxW) text = text.slice(0, -1);
    return text + "…";
  }

  /* ---------- SESTAVA (lineup na hřišti) ---------- */
  function surname(n) { n = (n || "").trim(); if (!n) return ""; const p = n.split(/\s+/); return p[p.length - 1]; }

  function drawPitch(c, x, y, w, h, colors) {
    // tráva
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#3ba05a"); g.addColorStop(1, "#2f8a4c");
    c.fillStyle = g; roundRect(c, x, y, w, h, 18); c.fill();
    // sekané pruhy
    c.save(); roundRect(c, x, y, w, h, 18); c.clip();
    const stripes = 6, sh = h / stripes;
    for (let i = 0; i < stripes; i++) { if (i % 2 === 0) { c.fillStyle = "rgba(255,255,255,0.05)"; c.fillRect(x, y + i * sh, w, sh); } }
    c.restore();
    // čáry
    c.save();
    c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = Math.max(2, w * 0.006);
    const m = w * 0.03;
    roundRect(c, x + m, y + m, w - 2 * m, h - 2 * m, 10); c.stroke();
    const midY = y + h / 2;
    c.beginPath(); c.moveTo(x + m, midY); c.lineTo(x + w - m, midY); c.stroke();
    c.beginPath(); c.arc(x + w / 2, midY, Math.min(w, h) * 0.11, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(x + w / 2, midY, 4, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,0.75)"; c.fill();
    // pokutová území (nahoře a dole)
    const boxW = w * 0.44, boxH = h * 0.14, bx = x + (w - boxW) / 2;
    c.strokeRect(bx, y + m, boxW, boxH);
    c.strokeRect(bx, y + h - m - boxH, boxW, boxH);
    const gW = w * 0.20, gH = h * 0.05, gx = x + (w - gW) / 2;
    c.strokeRect(gx, y + m, gW, gH);
    c.strokeRect(gx, y + h - m - gH, gW, gH);
    c.restore();
  }

  // jméno (příjmení) + volitelně číslo v tmavé pilulce; vrací spodní y
  function drawNamePlate(c, tok, cx, topY, d, colors, maxW) {
    const name = surname(tok.name);
    if (!name) return topY;
    const label = name.toUpperCase();
    const hasNum = !!tok.num;
    const numTxt = hasNum ? String(tok.num) : "";
    // rozměry pro dané písmo
    function measure(fs) {
      c.font = "800 " + fs + "px " + FONT;
      const tw = c.measureText(label).width;
      const numFs = fs * 0.92, ph = fs + 8;
      c.font = "800 " + numFs + "px " + FONT;
      const numW = hasNum ? Math.max(ph, c.measureText(numTxt).width + 14) : 0;
      const pad = 12, gap = hasNum ? 8 : 0;
      return { fs, tw, numFs, ph, numW, pad, gap, total: numW + gap + tw + pad * 2 };
    }
    let fs = Math.max(12, Math.min(d * 0.23, 21));
    let mm = measure(fs);
    // když se jmenovka nevejde do svého místa v řadě, písmo zmenši
    if (maxW && mm.total > maxW) { fs = Math.max(10, fs * (maxW / mm.total)); mm = measure(fs); }
    const { tw, numFs, ph, numW, pad, gap } = mm;
    const totalW = mm.total;
    const x0 = cx - totalW / 2;
    // pozadí
    c.fillStyle = "rgba(0,0,0,0.66)"; roundRect(c, x0, topY, totalW, ph, ph / 2); c.fill();
    // číslo chip
    if (hasNum) {
      c.fillStyle = colors.primary; roundRect(c, x0, topY, numW, ph, ph / 2); c.fill();
      c.fillStyle = pillTextColor(colors.primary); c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "800 " + numFs + "px " + FONT; c.fillText(numTxt, x0 + numW / 2, topY + ph / 2 + 1);
    }
    c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "800 " + fs + "px " + FONT;
    c.fillText(label, x0 + numW + gap + pad + tw / 2, topY + ph / 2 + 1);
    c.textBaseline = "alphabetic";
    return topY + ph;
  }

  function drawPlayerToken(c, tok, cx, cy, d, colors, slotW, style) {
    const r = d / 2;
    if (!tok) {
      c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = "rgba(0,0,0,0.18)"; c.fill();
      c.setLineDash([6, 6]); c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,0.7)"; c.stroke();
      c.setLineDash([]); c.fillStyle = "rgba(255,255,255,0.8)"; c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "800 " + (r * 0.9) + "px " + FONT; c.fillText("?", cx, cy + 1); c.restore();
      c.textBaseline = "alphabetic"; return;
    }

    // MEDAILONEK – kolečko jen s obličejem, nadzvednuté nad trávník + stín na zemi (3D)
    if (style === "medallion" && isReady(tok.photo)) {
      const lift = d * 0.14;          // nadzvednutí nad trávu
      const gcy = cy + r * 0.60;      // úroveň „země" pod medailonkem
      const ccy = cy - lift;          // střed kolečka (výš = plave nad hřištěm)
      // stín na zemi
      c.save();
      c.fillStyle = "rgba(0,0,0,0.30)";
      c.beginPath(); c.ellipse(cx, gcy, r * 0.86, r * 0.26, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      // bílý rámeček kolečka s vrženým stínem
      c.save();
      c.shadowColor = "rgba(0,0,0,0.40)"; c.shadowBlur = d * 0.16; c.shadowOffsetY = d * 0.10;
      c.beginPath(); c.arc(cx, ccy, r, 0, Math.PI * 2); c.fillStyle = "#ffffff"; c.fill();
      c.restore();
      drawAvatar(c, tok.photo, cx, ccy, d, colors, tok.photoY);
      drawNamePlate(c, tok, cx, ccy + r + 7, d, colors, (slotW || d * 1.4) * 0.96);
      return;
    }

    if (isReady(tok.photo)) {
      // VÝŘEZ HRÁČE (bez pozadí) – sjednocená velikost podle obsahu, ne celého PNG
      const img = tok.photo;
      const { b, dispW, dispH } = fitCutout(img, slotW, d);
      const bottom = cy + d * 0.28, top = bottom - dispH, left = cx - dispW / 2;
      // stín na zemi
      c.save();
      c.fillStyle = "rgba(0,0,0,0.30)";
      c.beginPath(); c.ellipse(cx, bottom - d * 0.03, dispW * 0.40, d * 0.11, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      // samotný výřez s jemným stínem
      c.save();
      c.shadowColor = "rgba(0,0,0,0.38)"; c.shadowBlur = d * 0.14; c.shadowOffsetY = 4;
      c.drawImage(img, b.x, b.y, b.w, b.h, left, top, dispW, dispH);
      c.restore();
      // jmenovka (s číslem) pod výřezem – vejde se do svého místa v řadě
      drawNamePlate(c, tok, cx, bottom + 5, d, colors, (slotW || d * 1.4) * 0.96);
      return;
    }

    // BEZ FOTKY -> kolečko s iniciálou / číslem
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.closePath();
    c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = d * 0.12; c.shadowOffsetY = 3;
    c.fillStyle = "#ffffff"; c.fill(); c.restore();
    const inner = r - Math.max(3, d * 0.055);
    c.save(); c.beginPath(); c.arc(cx, cy, inner, 0, Math.PI * 2); c.closePath(); c.clip();
    c.fillStyle = colors.primary; c.fillRect(cx - inner, cy - inner, inner * 2, inner * 2);
    c.fillStyle = pillTextColor(colors.primary); c.textAlign = "center"; c.textBaseline = "middle";
    const t = tok.num ? tok.num : (surname(tok.name)[0] || "?").toUpperCase();
    c.font = "800 " + (inner * 0.95) + "px " + FONT; c.fillText(String(t), cx, cy);
    c.restore();
    drawNamePlate(c, tok, cx, cy + r + 7, d, colors, (slotW || d * 1.4) * 0.96);
  }

  // perspektivní (3D) hřiště – lichoběžník zužující se vzhůru do dálky
  function drawPitch3D(c, x, y, w, h, colors, topScale) {
    const lerp = (a, b, t) => a + (b - a) * t;
    const cxp = x + w / 2, topY = y, botY = y + h;
    const bx0 = x, bx1 = x + w;                        // spodní (blízká) hrana
    const tw = w * topScale, tx0 = cxp - tw / 2, tx1 = cxp + tw / 2; // horní (daleká) hrana
    const edgeL = (t) => lerp(bx0, tx0, t), edgeR = (t) => lerp(bx1, tx1, t), rowYY = (t) => lerp(botY, topY, t);

    // tráva (tmavší nahoře = do dálky)
    const g = c.createLinearGradient(0, topY, 0, botY);
    g.addColorStop(0, "#2c854a"); g.addColorStop(1, "#3ba05a");
    c.save();
    c.beginPath(); c.moveTo(tx0, topY); c.lineTo(tx1, topY); c.lineTo(bx1, botY); c.lineTo(bx0, botY); c.closePath();
    c.fillStyle = g; c.fill(); c.clip();

    // sekané pruhy do perspektivy
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      if (i % 2 !== 0) continue;
      const t0 = i / stripes, t1 = (i + 1) / stripes;
      c.fillStyle = "rgba(255,255,255,0.055)";
      c.beginPath(); c.moveTo(edgeL(t0), rowYY(t0)); c.lineTo(edgeR(t0), rowYY(t0));
      c.lineTo(edgeR(t1), rowYY(t1)); c.lineTo(edgeL(t1), rowYY(t1)); c.closePath(); c.fill();
    }

    // čáry
    c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = Math.max(2, w * 0.005);
    // půlicí čára + kruh
    const my = rowYY(0.5), ml = edgeL(0.5), mr = edgeR(0.5);
    c.beginPath(); c.moveTo(ml, my); c.lineTo(mr, my); c.stroke();
    c.beginPath(); c.ellipse((ml + mr) / 2, my, (mr - ml) * 0.14, h * 0.045, 0, 0, Math.PI * 2); c.stroke();
    // pokutová území a branky (blízko/daleko) jako lichoběžníky
    function band(ta, tb, fw) {
      const yA = rowYY(ta), yB = rowYY(tb);
      const wA = (edgeR(ta) - edgeL(ta)) * fw, wB = (edgeR(tb) - edgeL(tb)) * fw;
      c.beginPath(); c.moveTo(cxp - wA / 2, yA); c.lineTo(cxp + wA / 2, yA);
      c.lineTo(cxp + wB / 2, yB); c.lineTo(cxp - wB / 2, yB); c.closePath(); c.stroke();
    }
    band(0.0, 0.15, 0.46); band(1.0, 0.85, 0.46);   // pokutová
    band(0.0, 0.05, 0.20); band(1.0, 0.95, 0.20);   // branková
    c.restore();

    // vnější obrys
    c.save(); c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = Math.max(2, w * 0.006);
    c.beginPath(); c.moveTo(tx0, topY); c.lineTo(tx1, topY); c.lineTo(bx1, botY); c.lineTo(bx0, botY); c.closePath(); c.stroke();
    c.restore();
  }

  // sdílené rozvržení sestavy (perspektiva): vrací hřiště + tokeny hráčů seřazené zezadu
  function computeLineupLayout(c, l, w, h, headerEndY, isStory) {
    const cx = w / 2;
    const hasSubs = (l.subs || []).length > 0, hasCoach = !!(l.coach || "").trim();
    const subFs = isStory ? 28 : 24, subLabelH = isStory ? 42 : 36, coachH = isStory ? 40 : 34;
    let subLineArr = [];
    if (hasSubs) {
      c.font = "600 " + subFs + "px " + FONT;
      const names = (l.subs || []).map(pp => (pp.num ? pp.num + " " : "") + surname(pp.name)).join("   •   ");
      subLineArr = wrapLines(c, names, w * 0.9).slice(0, 2);
    }
    const subsH = (hasSubs ? (subLabelH + subLineArr.length * (subFs + 8)) : 0) + (hasCoach ? coachH : 0);
    const footerReserve = (isStory ? 96 : 58) + 26;
    const bottomGap = isStory ? 30 : 22;
    const pitchTop = headerEndY + (isStory ? 30 : 20);
    const pitchBottom = h - footerReserve - subsH - (subsH ? bottomGap : 0);
    const pitchLeft = w * 0.05, pitchW = w * 0.90, pitchH = pitchBottom - pitchTop;
    const topScale = 0.68;                            // mírnější perspektiva (útočníci nejsou tak daleko)

    const lines = l.lines || [];
    const rows = lines.length + 1;
    const cap = pitchH / rows;
    const tMin = 0.16, tMax = 0.90;                   // řady dovnitř hřiště (dole necháme místo na jmenovku)
    const toks = [];
    function place(arr, r) {
      const k = arr.length; if (!k) return;
      const nr = rows > 1 ? r / (rows - 1) : 0;
      const t = tMin + nr * (tMax - tMin);            // 0 = blízko (dole), 1 = daleko (nahoře)
      const py = (pitchTop + pitchH) - t * pitchH;
      const sw = 1 - t * (1 - topScale);             // měřítko podle hloubky
      const rowW = pitchW * sw;
      const dBase = Math.min((pitchW * 0.88) / (k + 0.3) * 0.92, cap * 0.74);
      const d = Math.max(46, Math.min(isStory ? 150 : 128, dBase * sw));
      const slotW = rowW * 0.9 / k;
      for (let i = 0; i < k; i++) {
        const px = cx + ((i + 0.5) / k - 0.5) * rowW * 0.9;
        toks.push({ tok: arr[i], px: px, py: py, d: d, slotW: slotW, depth: t });
      }
    }
    place([l.gk], 0);
    for (let li = 0; li < lines.length; li++) place(lines[li], li + 1);
    toks.sort((a, b) => b.depth - a.depth);          // daleké kreslit dřív (vzadu)

    return { pitchLeft, pitchTop, pitchW, pitchH, pitchBottom, topScale, toks, subLineArr, hasSubs, hasCoach, subFs, subLabelH, bottomGap };
  }

  // hlavička sestavy (odznak + titul + podtitul); vrací koncové y
  function drawLineupHeader(c, l, w, model, isStory) {
    const cx = w / 2, colors = model.colors, tx = colors.text;
    let y = isStory ? 140 : 56;
    y = drawTeamBadge(c, cx, y, model);
    y += isStory ? 28 : 22;
    c.textAlign = "center"; c.fillStyle = tx;
    const title = (l.title || "").toUpperCase();
    if (title) {
      const ts = fitFont(c, title, w * 0.88, isStory ? 70 : 58, "900", 30);
      c.textBaseline = "top"; c.font = "900 " + ts + "px " + FONT;
      c.fillText(title, cx, y); y += ts + (isStory ? 12 : 9);
    }
    const sub = [l.opp ? "vs " + l.opp : "", [l.date, l.time].filter(Boolean).join(" ")].filter(Boolean).join("  •  ");
    if (sub) {
      const ss = isStory ? 36 : 30;
      c.textBaseline = "top"; c.fillStyle = colors.primary; c.font = "800 " + ss + "px " + FONT;
      c.fillText(sub, cx, y); y += ss;
    }
    c.textBaseline = "alphabetic";
    return y;
  }

  function renderLineup(c, w, h, model) {
    const l = model.lineup || {}, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

    const y = drawLineupHeader(c, l, w, model, isStory);
    const L = computeLineupLayout(c, l, w, h, y, isStory);
    drawPitch3D(c, L.pitchLeft, L.pitchTop, L.pitchW, L.pitchH, colors, L.topScale);

    const photoStyle = l.photoStyle || "cutout";
    for (const tk of L.toks) drawPlayerToken(c, tk.tok, tk.px, tk.py, tk.d, colors, tk.slotW, photoStyle);

    // náhradníci + trenér
    let sy = L.pitchBottom + L.bottomGap;
    c.textAlign = "center"; c.textBaseline = "top";
    if (L.hasSubs) {
      c.fillStyle = colors.primary; c.font = "800 " + (isStory ? 30 : 26) + "px " + FONT;
      c.fillText("NÁHRADNÍCI", cx, sy); sy += L.subLabelH;
      c.fillStyle = tx; c.font = "600 " + L.subFs + "px " + FONT;
      for (const ln of L.subLineArr) { c.fillText(ln, cx, sy); sy += L.subFs + 8; }
    }
    if (L.hasCoach) { c.fillStyle = tx; c.globalAlpha = 0.82; c.font = "700 " + (isStory ? 26 : 22) + "px " + FONT; c.fillText("Trenér: " + l.coach.trim(), cx, sy + 2); c.globalAlpha = 1; }
    c.textBaseline = "alphabetic";

    drawFooter(c, w, h, model);
  }

  /* ---------- KÁDR SEZÓNY (tabulka hráčů po sekcích) ---------- */
  // očistí výřez: potlačí zelený lem po klíčování + zeroziuje slabé okraje (halo)
  const cleanCache = {};
  function cleanCutout(img) {
    const key = (img && img.src) || String(img);
    if (cleanCache[key]) return cleanCache[key];
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return img;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
    try {
      const id = cx.getImageData(0, 0, w, h), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]; if (!a) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = r > b ? r : b;
        if (g > mx) d[i + 1] = mx;      // despill – uber zelenou nad úroveň R/B
        if (a < 70) d[i + 3] = 0;       // slabý závoj pryč
      }
      // 1px eroze alfy (min z okolí 3×3) – sundá halo na hraně
      const src = new Uint8ClampedArray(d.length); src.set(d);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          let m = src[o + 3];
          for (let dy = -1; dy <= 1 && m; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const yy = y + dy, xx = x + dx;
              const aa = (yy < 0 || xx < 0 || yy >= h || xx >= w) ? 0 : src[(yy * w + xx) * 4 + 3];
              if (aa < m) m = aa;
            }
          }
          d[o + 3] = m;
        }
      }
      cx.putImageData(id, 0, 0);
    } catch (e) { return img; }
    cleanCache[key] = cv; return cv;
  }

  function drawAvatar(c, img, cx, cy, d, colors, offY) {
    c.save();
    c.beginPath(); c.arc(cx, cy, d / 2, 0, Math.PI * 2);
    c.fillStyle = "rgba(0,0,0,0.06)"; c.fill();
    if (isReady(img)) {
      c.save();
      c.beginPath(); c.arc(cx, cy, d / 2, 0, Math.PI * 2); c.clip();
      const b = cutoutBounds(img);
      const fw = img.naturalWidth, fh = img.naturalHeight;
      const headW = Math.max(1, b.headW || b.w * 0.6);
      const scale = (0.66 * d) / headW; // hlava vyplní ~66 % šířky kolečka
      const dw = fw * scale, dh = fh * scale;
      const faceCy = b.y + 0.70 * headW; // odhad svislého středu obličeje z šířky hlavy
      // obličej lehce nad středem, hlava vyplní kolečko (seříznuté temeno splyne s okrajem)
      let dx = cx - b.headX * scale;
      let dy = (cy - 0.04 * d) - faceCy * scale;
      const oL = b.x * scale, oR = (b.x + b.w) * scale, oB = (b.y + b.h) * scale;
      if (oR - oL >= d) {
        if (dx + oL > cx - d / 2) dx = cx - d / 2 - oL;
        if (dx + oR < cx + d / 2) dx = cx + d / 2 - oR;
      } else {
        dx = cx - (oL + oR) / 2; // úzký výřez → vycentrovat
      }
      if (dy + oB < cy + d / 2) dy = cy + d / 2 - oB; // dole bez prázdného okraje
      if (offY) dy += offY * d; // ruční svislý posun fotky (+ dolů, − nahoru)
      c.drawImage(cleanCutout(img), dx, dy, dw, dh);
      c.restore();
    } else {
      c.fillStyle = colors.primary; c.fill();
    }
    c.restore();
    c.beginPath(); c.arc(cx, cy, d / 2, 0, Math.PI * 2);
    c.lineWidth = Math.max(1.5, d * 0.04); c.strokeStyle = "rgba(255,255,255,0.9)"; c.stroke();
  }

  function renderRosterSeason(c, w, h, model) {
    const r = model.rosterPoster || {}, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");
    const players = r.players || [];
    const staff = (r.staff || []).filter(s => (s.name || "").trim());

    let y = isStory ? 140 : 56;
    y = drawTeamBadge(c, cx, y, model);
    y += isStory ? 24 : 18;

    c.textAlign = "center"; c.fillStyle = tx;
    const title = (r.title || "").toUpperCase();
    if (title) {
      const ts = fitFont(c, title, w * 0.88, isStory ? 68 : 52, "900", 28);
      c.textBaseline = "top"; c.font = "900 " + ts + "px " + FONT;
      c.fillText(title, cx, y); y += ts + (isStory ? 10 : 7);
    }
    if ((r.season || "").trim()) {
      const ss = isStory ? 34 : 28;
      c.textBaseline = "top"; c.fillStyle = colors.primary; c.font = "800 " + ss + "px " + FONT;
      c.fillText(r.season.trim(), cx, y); y += ss + (isStory ? 10 : 8);
    }
    c.textBaseline = "alphabetic";

    const sectionDefs = [
      { key: "gk", title: "BRANKÁŘI" }, { key: "def", title: "OBRÁNCI" },
      { key: "mid", title: "ZÁLOŽNÍCI" }, { key: "fwd", title: "ÚTOČNÍCI" },
    ];
    const grouped = sectionDefs.map(s => ({ ...s, players: players.filter(p => p.pos === s.key) })).filter(s => s.players.length);
    const unassigned = players.filter(p => !p.pos || !sectionDefs.some(s => s.key === p.pos));
    if (unassigned.length) grouped.push({ key: "other", title: "HRÁČI", players: unassigned });

    const staffLines = staff;

    const top = y + (isStory ? 14 : 9);
    const footerReserve = (isStory ? 96 : 58) + 18;
    const bottom = h - footerReserve;

    if (!grouped.length && !staffLines.length) {
      const availH0 = bottom - top;
      c.fillStyle = tx; c.globalAlpha = 0.45; c.textAlign = "center";
      c.font = "700 " + (isStory ? 32 : 26) + "px " + FONT;
      c.fillText("Zatím žádní hráči v kádru", cx, top + availH0 / 2 - 10);
      c.font = "600 " + (isStory ? 24 : 20) + "px " + FONT;
      c.fillText("Přidej je v sekci Sestava → Kádr týmu", cx, top + availH0 / 2 + 28);
      c.globalAlpha = 1; drawFooter(c, w, h, model); return;
    }

    // realizační tým – kompaktní, nenápadný blok dole (bez výrazného pruhu)
    const labelFs = isStory ? 24 : 22, lineFs = isStory ? 26 : 24, lineH = lineFs * 1.35;
    const staffH = staffLines.length ? (labelFs + 8 + staffLines.length * lineH + 10) : 0;
    const colsBottom = bottom - staffH;
    const availH = colsBottom - top;

    // rozložení sekcí do sloupců: Feed = pevně (vlevo brankáři+obránci, vpravo záložníci+útočníci), Story/tisk = 1 sloupec
    const nCols = isStory ? 1 : 2;
    const cols = Array.from({ length: nCols }, () => ({ secs: [], units: 0 }));
    const addSec = (i, s) => { if (cols[i].secs.length) cols[i].units += 0.4; cols[i].secs.push(s); cols[i].units += 0.9 + 0.18 + s.players.length; };
    if (nCols === 1) {
      for (const s of grouped) addSec(0, s);
    } else {
      const leftKeys = { gk: 1, def: 1, other: 1 };
      const hasRight = grouped.some(s => !leftKeys[s.key]); // existují záložníci/útočníci?
      if (hasRight) {
        // klasické rozdělení podle postů (brankáři+obránci vlevo, záloha+útok vpravo)
        for (const s of grouped) addSec(leftKeys[s.key] ? 0 : 1, s);
      } else {
        // posty nevyplněné → rozděl hráče rovnoměrně do 2 sloupců (velkou sekci rozpůlíme)
        const flat = [];
        for (const s of grouped) for (const p of s.players) flat.push({ sec: s, p: p });
        const half = Math.ceil(flat.length / 2);
        const buildCol = items => {
          const out = []; let cur = null;
          for (const it of items) {
            if (!cur || cur.key !== it.sec.key) { cur = { key: it.sec.key, title: it.sec.title, players: [] }; out.push(cur); }
            cur.players.push(it.p);
          }
          return out;
        };
        buildCol(flat.slice(0, half)).forEach(s => addSec(0, s));
        buildCol(flat.slice(half)).forEach(s => addSec(1, s));
      }
    }
    const maxUnits = Math.max(1, ...cols.map(o => o.units));
    let rowH = availH / maxUnits;
    rowH = Math.min(rowH, isStory ? 92 : 96);
    rowH = Math.max(rowH, 18);
    const headerH = rowH * 0.9;

    const gap = w * 0.03;
    const gridLeft = w * (nCols > 1 ? 0.05 : 0.06);
    const gridW = w * (nCols > 1 ? 0.90 : 0.88);
    const colW = (gridW - (nCols - 1) * gap) / nCols;

    function drawPlayerRow(x, wdt, ry, p, alt) {
      if (alt) { c.fillStyle = "rgba(0,0,0,0.04)"; roundRect(c, x, ry, wdt, rowH, rowH * 0.16); c.fill(); }
      const d = rowH * 0.9;
      const acx = x + rowH * 0.14 + d / 2, acy = ry + rowH / 2;
      drawAvatar(c, p.photo, acx, acy, d, colors, p.photoY);
      const nameX = acx + d / 2 + rowH * 0.3;
      const yearText = p.birthYear ? "r. " + p.birthYear : "";
      c.font = "700 " + (rowH * 0.34) + "px " + FONT;
      // pevná šířka sloupce ročníků, ať jsou "r." zarovnané pod sebou (číslice nejsou stejně široké)
      const yearColW = yearText ? c.measureText("r. 0000").width : 0;
      const yearX = x + wdt - rowH * 0.3 - yearColW; // levý okraj sloupce ročníků
      const nameMaxW = (yearText ? yearX - rowH * 0.4 : x + wdt - rowH * 0.3) - nameX;
      let nm = (p.num ? p.num + "  " : "") + (p.name || "");
      let nfs = rowH * 0.42; c.font = "800 " + nfs + "px " + FONT;
      while (c.measureText(nm).width > nameMaxW && nfs > rowH * 0.24) { nfs -= 1; c.font = "800 " + nfs + "px " + FONT; }
      c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = tx;
      c.fillText(nm, nameX, acy + 1);
      if (yearText) {
        c.textAlign = "left"; c.fillStyle = tx; c.globalAlpha = 0.6;
        c.font = "700 " + (rowH * 0.34) + "px " + FONT;
        c.fillText(yearText, yearX, acy + 1); c.globalAlpha = 1;
      }
    }

    for (let ci = 0; ci < nCols; ci++) {
      const colX = gridLeft + ci * (colW + gap);
      let yy = top, first = true;
      for (const s of cols[ci].secs) {
        if (!first) yy += rowH * 0.4;
        c.fillStyle = colors.primary;
        roundRect(c, colX, yy, colW, headerH, Math.min(12, headerH * 0.3)); c.fill();
        c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = pillTextColor(colors.primary);
        c.font = "800 " + (headerH * 0.5) + "px " + FONT;
        c.fillText(s.title, colX + headerH * 0.55, yy + headerH / 2 + 1);
        yy += headerH + rowH * 0.18;
        for (let pi = 0; pi < s.players.length; pi++) { drawPlayerRow(colX, colW, yy, s.players[pi], pi % 2 === 0); yy += rowH; }
        first = false;
      }
    }

    if (staffLines.length) {
      let sy = colsBottom + (isStory ? 14 : 10);
      c.textAlign = "center"; c.textBaseline = "top";
      c.fillStyle = colors.primary; c.globalAlpha = 0.85; c.font = "800 " + labelFs + "px " + FONT;
      c.fillText("REALIZAČNÍ TÝM", cx, sy); c.globalAlpha = 1; sy += labelFs + 8;
      c.fillStyle = tx; c.globalAlpha = 0.78; c.font = "600 " + lineFs + "px " + FONT;
      for (const st of staffLines) {
        c.fillText((st.name || "").trim() + (st.role ? "  ·  " + st.role : ""), cx, sy); sy += lineH;
      }
      c.globalAlpha = 1;
    }

    c.textAlign = "center"; c.textBaseline = "alphabetic";
    drawFooter(c, w, h, model);
  }

  /* ---------- ÚVODNÍ FOTO (FB cover) ---------- */
  // řada štítků (např. MUŽI + DOROST), vrací výšku
  function drawBadgesRow(c, badges, x, y, align, onColor) {
    if (!badges || !badges.length) return 0;
    const bh = 46, padX = 20, gap = 12;
    c.font = "800 24px " + FONT;
    const widths = badges.map(b => c.measureText((b.label || "").toUpperCase()).width + padX * 2);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (badges.length - 1);
    let sx = align === "center" ? x - total / 2 : x;
    c.textAlign = "left"; c.textBaseline = "middle";
    for (let i = 0; i < badges.length; i++) {
      const bw = widths[i];
      // na barevném pozadí: bílá pilulka + barevný text (aby nezanikla)
      const fill = onColor ? "#ffffff" : badges[i].color;
      c.fillStyle = fill; roundRect(c, sx, y, bw, bh, bh / 2); c.fill();
      c.fillStyle = onColor ? badges[i].color : pillTextColor(badges[i].color);
      c.fillText((badges[i].label || "").toUpperCase(), sx + padX, y + bh / 2 + 1);
      sx += bw + gap;
    }
    c.textBaseline = "alphabetic";
    return bh;
  }

  // čistá branded šablona (bez fotky) – světlá a čistá, jen s jemným tyrkysovým akcentem
  function renderCoverClean(c, w, h, model) {
    const cv = model.cover || {}, colors = model.colors, tx = colors.text;
    const light = isLight(colors);

    drawBackground(c, w, h, colors);
    // velké jemné logo jako vodoznak vpravo
    if (isReady(model.logo)) {
      c.save(); c.globalAlpha = light ? 0.10 : 0.16;
      drawImageContain(c, model.logo, w * 0.84, h * 0.5, h * 1.2);
      c.restore();
    }
    c.fillStyle = colors.primary; c.fillRect(0, h - 12, w, 12);

    const center = cv.pos === "center";
    const badges = cv.badges && cv.badges.length ? cv.badges
      : (model.teamLabel ? [{ label: model.teamLabel, color: colors.primary }] : []);
    const badgeGap = badges.length ? 22 : 0;
    const title = (cv.title || "").toUpperCase();
    const sub = (cv.subtitle || "").trim();

    if (center) {
      const cx = w / 2;
      if (isReady(model.logo)) drawImageContain(c, model.logo, cx, h * 0.27, 150);
      let y = h * 0.27 + 80;
      y += drawBadgesRow(c, badges, cx, y, "center") + badgeGap;
      c.textAlign = "center"; c.textBaseline = "top"; c.fillStyle = tx;
      const ts = fitFont(c, title, w * 0.86, 80, "900", 40);
      c.font = "900 " + ts + "px " + FONT; c.fillText(title, cx, y); y += ts + 16;
      if (sub) { c.globalAlpha = 0.82; c.font = "600 34px " + FONT; c.fillText(sub, cx, y); c.globalAlpha = 1; }
      c.textAlign = "left"; c.textBaseline = "alphabetic";
    } else {
      const pad = 72, logoSize = 240, logoCx = pad + logoSize / 2;
      if (isReady(model.logo)) drawImageContain(c, model.logo, logoCx, h / 2, logoSize);
      const txx = pad + logoSize + 56, maxW = w - txx - pad;
      const ts = fitFont(c, title, maxW, 84, "900", 36);
      const badgeH = badges.length ? 46 : 0, subH = sub ? 44 : 0, subGap = sub ? 18 : 0;
      const blockH = badgeH + badgeGap + ts + subGap + subH;
      let y = (h - blockH) / 2;
      y += drawBadgesRow(c, badges, txx, y, "left"); if (badges.length) y += badgeGap;
      c.textAlign = "left"; c.textBaseline = "top"; c.fillStyle = tx;
      c.font = "900 " + ts + "px " + FONT; c.fillText(title, txx, y); y += ts + subGap;
      if (sub) { c.globalAlpha = 0.82; c.font = "600 34px " + FONT; c.fillText(sub, txx, y); c.globalAlpha = 1; }
      c.textBaseline = "alphabetic";
    }
  }

  function renderCover(c, w, h, model) {
    const cv = model.cover || {}, colors = model.colors;
    const img = cv.photo;

    // čistá šablona (bez fotky) – vlastní branded pozadí
    if (cv.bg === "clean" || !isReady(img)) { renderCoverClean(c, w, h, model); return; }

    // fotka přes celé plátno (cover-fit) se svislým posunem
    if (isReady(img)) {
      const ratio = img.naturalWidth / img.naturalHeight, cr = w / h;
      let dw, dh;
      if (ratio > cr) { dh = h; dw = h * ratio; } else { dw = w; dh = w / ratio; }
      let dx = (w - dw) / 2, dy = (h - dh) / 2;
      const f = (cv.offsetY != null) ? cv.offsetY : 0.5;
      if (dh > h) dy = -(dh - h) * f;
      if (dw > w) dx = -(dw - w) * 0.5;
      c.drawImage(img, dx, dy, dw, dh);
    } else {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, shade(colors.secondary, -8)); g.addColorStop(1, shade(colors.secondary, -34));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(0,0,0,0.4)"; c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "700 38px " + FONT; c.fillText("Nahraj týmovou fotku (tlačítko vlevo)", w / 2, h / 2);
      c.textAlign = "left"; c.textBaseline = "alphabetic";
    }

    const center = cv.pos === "center";
    // ztmavení kvůli čitelnosti textu
    if (center) {
      const g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, "rgba(0,0,0,0.80)"); g.addColorStop(0.55, "rgba(0,0,0,0.32)"); g.addColorStop(1, "rgba(0,0,0,0.20)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    } else {
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(0,0,0,0.78)"); g.addColorStop(0.45, "rgba(0,0,0,0.38)"); g.addColorStop(0.82, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    // spodní akcentní pruh v barvě týmu
    c.fillStyle = colors.primary; c.fillRect(0, h - 12, w, 12);

    const pad = 72;
    const badges = cv.badges && cv.badges.length ? cv.badges
      : (model.teamLabel ? [{ label: model.teamLabel, color: colors.primary }] : []);
    const badgeGap = badges.length ? 22 : 0;
    const title = (cv.title || "").toUpperCase();
    const sub = (cv.subtitle || "").trim();

    if (center) {
      const cx = w / 2;
      if (isReady(model.logo)) drawImageContain(c, model.logo, cx, h * 0.27, 150);
      let y = h * 0.27 + 80;
      y += drawBadgesRow(c, badges, cx, y, "center") + badgeGap;
      c.textAlign = "center"; c.textBaseline = "top";
      const ts = fitFont(c, title, w * 0.86, 80, "900", 40);
      c.save(); c.shadowColor = "rgba(0,0,0,0.7)"; c.shadowBlur = 18; c.shadowOffsetY = 2;
      c.fillStyle = "#fff"; c.font = "900 " + ts + "px " + FONT; c.fillText(title, cx, y); y += ts + 16;
      if (sub) { c.fillStyle = "#fff"; c.globalAlpha = 0.95; c.font = "600 34px " + FONT; c.fillText(sub, cx, y); c.globalAlpha = 1; }
      c.restore();
      c.textAlign = "left"; c.textBaseline = "alphabetic";
    } else {
      const logoSize = 240;
      const logoCx = pad + logoSize / 2;
      if (isReady(model.logo)) drawImageContain(c, model.logo, logoCx, h / 2, logoSize);
      const tx = pad + logoSize + 56;
      const maxW = w - tx - pad;
      const ts = fitFont(c, title, maxW, 84, "900", 36);
      const badgeH = badges.length ? 46 : 0;
      const subH = sub ? 44 : 0, subGap = sub ? 18 : 0;
      const blockH = badgeH + badgeGap + ts + subGap + subH;
      let y = (h - blockH) / 2;
      y += drawBadgesRow(c, badges, tx, y, "left");
      if (badges.length) y += badgeGap;
      c.textAlign = "left"; c.textBaseline = "top";
      c.save(); c.shadowColor = "rgba(0,0,0,0.7)"; c.shadowBlur = 18; c.shadowOffsetY = 2;
      c.fillStyle = "#fff"; c.font = "900 " + ts + "px " + FONT; c.fillText(title, tx, y); y += ts + subGap;
      if (sub) { c.fillStyle = "#fff"; c.globalAlpha = 0.95; c.font = "600 34px " + FONT; c.fillText(sub, tx, y); c.globalAlpha = 1; }
      c.restore();
      c.textBaseline = "alphabetic";
    }
  }

  /* ---------- LOUČENÍ (odchody hráčů) ---------- */
  function drawPhotoCard(c, x, y, cw, ch, p, colors) {
    const r = Math.min(30, cw * 0.07);
    // podklad + stín
    c.save();
    c.shadowColor = "rgba(0,0,0,0.30)"; c.shadowBlur = 26; c.shadowOffsetY = 10;
    roundRect(c, x, y, cw, ch, r); c.fillStyle = "#ffffff"; c.fill();
    c.restore();
    // fotka cover-crop uvnitř karty + spodní gradient
    c.save();
    roundRect(c, x, y, cw, ch, r); c.clip();
    const img = p.photo;
    if (isReady(img) && p.cut) {
      // výřez hráče: barevný podklad + celá postava (contain), nohy dolů
      const bgg = c.createLinearGradient(0, y, 0, y + ch);
      bgg.addColorStop(0, shade(colors.secondary, 10));
      bgg.addColorStop(1, shade(colors.primary, -12));
      c.fillStyle = bgg; c.fillRect(x, y, cw, ch);
      const zoom = (p.zoom != null) ? p.zoom : 1;
      const sc = Math.min(cw / img.naturalWidth, ch / img.naturalHeight) * zoom;
      const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
      const fx = (p.offsetX != null) ? p.offsetX : 0.5;
      const fy = (p.offsetY != null) ? p.offsetY : 1;
      c.drawImage(img, x + (cw - dw) * fx, y + (ch - dh) * fy, dw, dh);
    } else if (isReady(img)) {
      const ratio = img.naturalWidth / img.naturalHeight, cr = cw / ch;
      let dw, dh;
      if (ratio > cr) { dh = ch; dw = ch * ratio; } else { dw = cw; dh = cw / ratio; }
      const zoom = (p.zoom != null) ? p.zoom : 1;
      dw *= zoom; dh *= zoom;
      const fx = (p.offsetX != null) ? p.offsetX : 0.5;
      const fy = (p.offsetY != null) ? p.offsetY : 0.4;
      c.drawImage(img, x + (cw - dw) * fx, y + (ch - dh) * fy, dw, dh);
    } else {
      c.fillStyle = shade(colors.secondary, -6); c.fillRect(x, y, cw, ch);
      c.fillStyle = hexToRgba(colors.text, 0.4); c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "700 " + (cw * 0.08) + "px " + FONT; c.fillText("Nahraj fotku", x + cw / 2, y + ch / 2);
      c.textAlign = "left"; c.textBaseline = "alphabetic";
    }
    const gh = ch * 0.46;
    const g = c.createLinearGradient(0, y + ch - gh, 0, y + ch);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.85)");
    c.fillStyle = g; c.fillRect(x, y + ch - gh, cw, gh);
    c.restore();
    // rámeček v barvě týmu
    roundRect(c, x, y, cw, ch, r); c.lineWidth = Math.max(4, cw * 0.02); c.strokeStyle = colors.primary; c.stroke();
    // jméno + poznámka (odspodu nahoru)
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    let by = y + ch - Math.max(18, cw * 0.06);
    const note = (p.note || "").trim();
    if (note) {
      const noteSize = Math.min(cw * 0.055, 26);
      c.fillStyle = "#ffffff"; c.globalAlpha = 0.9; c.font = "700 " + noteSize + "px " + FONT;
      c.fillText(note, x + cw / 2, by); c.globalAlpha = 1;
      by -= noteSize + 10;
    }
    const name = (p.name || "").toUpperCase();
    if (name) {
      const nameSize = fitFont(c, name, cw * 0.9, Math.min(cw * 0.12, 54), "900", 18);
      c.save(); c.shadowColor = "rgba(0,0,0,0.65)"; c.shadowBlur = 12;
      c.fillStyle = "#ffffff"; c.font = "900 " + nameSize + "px " + FONT;
      c.fillText(name, x + cw / 2, by); c.restore();
    }
  }

  function renderAnnouncePhotos(c, w, h, model, players) {
    const a = model.announce || {}, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

    let y = isStory ? 140 : 64;
    y = drawTeamBadge(c, cx, y, model);
    y += isStory ? 22 : 16;

    c.textAlign = "center"; c.textBaseline = "top";
    const eyebrow = (a.eyebrow || "").trim();
    if (eyebrow) { c.fillStyle = colors.primary; c.font = "800 28px " + FONT; c.fillText(eyebrow.toUpperCase(), cx, y); y += 40; }

    c.fillStyle = tx;
    const title = (a.title || "").toUpperCase();
    if (title) {
      const ts = fitFont(c, title, w * 0.88, isStory ? 84 : 74, "900", 34);
      c.font = "900 " + ts + "px " + FONT;
      for (const ln of wrapLines(c, title, w * 0.88)) { c.fillText(ln, cx, y); y += ts + 6; }
    }
    y += 10; c.strokeStyle = colors.primary; c.lineWidth = 5;
    c.beginPath(); c.moveTo(cx - 70, y); c.lineTo(cx + 70, y); c.stroke(); y += 22;

    const sub = (a.text || "").trim();
    if (sub) {
      c.fillStyle = tx; c.globalAlpha = 0.85; const ss = isStory ? 34 : 30;
      c.font = "500 " + ss + "px " + FONT;
      for (const ln of wrapLines(c, sub, w * 0.8)) { c.fillText(ln, cx, y); y += ss + 6; }
      c.globalAlpha = 1;
    }
    c.textAlign = "left"; c.textBaseline = "alphabetic";

    const n = players.length;
    const topArea = y + (isStory ? 30 : 24);
    const bottomArea = h - (isStory ? 150 : 96);
    const areaH = bottomArea - topArea, pad = w * 0.05;

    if (!n) {
      c.fillStyle = hexToRgba(tx, 0.5); c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "700 34px " + FONT; c.fillText("Přidej odcházející hráče (vlevo) a nahraj fotky", cx, topArea + areaH / 2);
      c.textAlign = "left"; c.textBaseline = "alphabetic";
      drawFooter(c, w, h, model); return;
    }

    // pokud je aspoň jeden výřez (průhledný) -> hezký plakát bez boxů
    const cutMode = players.some(p => p.cut && isReady(p.photo));
    if (cutMode) {
      drawCutoutStage(c, w, h, model, players, colors, topArea, bottomArea, pad, isStory);
      drawFooter(c, w, h, model); return;
    }

    const gap = w * 0.035;
    const cols = isStory ? 1 : n, rows = isStory ? n : 1;
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols;
    let ch = (areaH - gap * (rows - 1)) / rows;
    ch = Math.max(cw * 0.9, Math.min(ch, cw * 1.35));
    const gridW = cw * cols + gap * (cols - 1), gridH = ch * rows + gap * (rows - 1);
    const startX = cx - gridW / 2, startY = topArea + Math.max(0, (areaH - gridH) / 2);
    for (let i = 0; i < n; i++) {
      const col = i % cols, r = Math.floor(i / cols);
      drawPhotoCard(c, startX + col * (cw + gap), startY + r * (ch + gap), cw, ch, players[i], colors);
    }
    drawFooter(c, w, h, model);
  }

  // plakát s výřezy hráčů: neviditelný rám (ořez) + jméno pod hráčem, bez stínů
  function drawCutoutStage(c, w, h, model, players, colors, topArea, bottomArea, pad, isStory) {
    const n = players.length, cx = w / 2;
    const nameBandH = isStory ? 128 : 108;
    const zoneTop = topArea + 6;
    const baseY = bottomArea - nameBandH;      // společná linka (nohy)
    const zoneH = baseY - zoneTop;
    const gap = w * 0.02;
    const colW = (w - pad * 2 - gap * (n - 1)) / n;
    const groupW = colW * n + gap * (n - 1);
    const startX = cx - groupW / 2;

    for (let i = 0; i < n; i++) {
      const p = players[i], img = p.photo;
      if (!isReady(img)) continue;
      const colLeft = startX + i * (colW + gap);
      const colCx = colLeft + colW / 2;
      const zoom = (p.zoom != null) ? p.zoom : 1;
      // fit na stejnou výšku (contain) s ~10% rezervou -> oba stejně velcí a zarovnaní
      const fit = Math.min(colW / img.naturalWidth, (zoneH * 0.9) / img.naturalHeight);
      const sc = fit * zoom;
      const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
      const fx = (p.offsetX != null) ? p.offsetX : 0.5;
      const fy = (p.offsetY != null) ? p.offsetY : 0.9;
      const dx = colLeft + (colW - dw) * fx;          // 0=vlevo, 1=vpravo
      const dy = zoneTop + (zoneH - dh) * fy;          // 0=nahoře, 1=dole

      // neviditelný rám: co přeteče, se čistě ořízne (nezasahuje jinam)
      c.save();
      c.beginPath(); c.rect(colLeft, zoneTop, colW, zoneH); c.clip();
      c.drawImage(img, dx, dy, dw, dh);
      c.restore();

      // jméno + poznámka pod hráčem
      const name = (p.name || "").toUpperCase().trim();
      const note = (p.note || "").trim();
      c.textAlign = "center"; c.textBaseline = "alphabetic";
      let ny = baseY + (isStory ? 58 : 50);
      if (name) {
        const nsz = fitFont(c, name, colW * 0.98, isStory ? 46 : 42, "900", 22);
        c.font = "900 " + nsz + "px " + FONT; c.fillStyle = colors.text;
        c.fillText(name, colCx, ny); ny += (isStory ? 30 : 26);
      }
      if (note) {
        const zsz = isStory ? 26 : 24;
        c.font = "700 " + zsz + "px " + FONT; c.fillStyle = colors.primary;
        c.fillText(note, colCx, ny);
      }
    }
    c.textAlign = "left"; c.textBaseline = "alphabetic";
  }

  /* ---------- SESTAVA (animovaná varianta pro video) ---------- */
  function renderLineupFrame(c, w, h, model, p) {
    const l = model.lineup || {}, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

    drawBackground(c, w, h, colors);

    // hlavička – sjede shora (y potřebné pro layout se vrátí i při alpha 0)
    let y;
    {
      const a = easeOutCubic(seg(p, 0.02, 0.22));
      c.save(); c.globalAlpha = Math.max(0, a); c.translate(0, (1 - a) * (-24));
      y = drawLineupHeader(c, l, w, model, isStory);
      c.restore();
    }

    const L = computeLineupLayout(c, l, w, h, y, isStory);
    const photoStyle = l.photoStyle || "cutout";

    // hřiště – fade in
    {
      const a = easeOutCubic(seg(p, 0.12, 0.34));
      if (a > 0) { c.save(); c.globalAlpha = a; drawPitch3D(c, L.pitchLeft, L.pitchTop, L.pitchW, L.pitchH, colors, L.topScale); c.restore(); }
    }

    // hráči – postupný „pop" zezadu (daleké → blízké)
    const toks = L.toks, n = toks.length, start = 0.30, end = 0.86, span = end - start;
    const step = n > 1 ? Math.min(0.05, (span * 0.55) / (n - 1)) : 0;
    const dur = Math.max(0.14, span - step * (n - 1));
    for (let i = 0; i < n; i++) {
      const t0 = start + i * step;
      const e = easeOutBack(seg(p, t0, t0 + dur));
      const a = seg(p, t0, t0 + dur * 0.6);
      if (a <= 0) continue;
      const tk = toks[i], s = Math.max(0.001, e);
      c.save(); c.globalAlpha = Math.min(1, a);
      c.translate(tk.px, tk.py); c.scale(s, s); c.translate(-tk.px, -tk.py);
      drawPlayerToken(c, tk.tok, tk.px, tk.py, tk.d, colors, tk.slotW, photoStyle);
      c.restore();
    }

    // náhradníci + trenér – fade in
    {
      const a = easeOutCubic(seg(p, 0.80, 0.96));
      if (a > 0) {
        c.save(); c.globalAlpha = a;
        let sy = L.pitchBottom + L.bottomGap;
        c.textAlign = "center"; c.textBaseline = "top";
        if (L.hasSubs) {
          c.fillStyle = colors.primary; c.font = "800 " + (isStory ? 30 : 26) + "px " + FONT;
          c.fillText("NÁHRADNÍCI", cx, sy); sy += L.subLabelH;
          c.fillStyle = tx; c.font = "600 " + L.subFs + "px " + FONT;
          for (const ln of L.subLineArr) { c.fillText(ln, cx, sy); sy += L.subFs + 8; }
        }
        if (L.hasCoach) { c.fillStyle = tx; c.globalAlpha = a * 0.82; c.font = "700 " + (isStory ? 26 : 22) + "px " + FONT; c.fillText("Trenér: " + l.coach.trim(), cx, sy + 2); }
        c.textBaseline = "alphabetic"; c.restore();
      }
    }

    // patička – fade
    {
      const a = easeOutCubic(seg(p, 0.90, 1.0));
      if (a > 0) { c.save(); c.globalAlpha = a; drawFooter(c, w, h, model); c.restore(); }
    }

    // shine
    {
      const sp = seg(p, 0.20, 0.55);
      if (sp > 0 && sp < 1) {
        c.save();
        const bandW = w * 0.45, xpos = -bandW + (w + bandW * 2) * easeInOut(sp);
        const g = c.createLinearGradient(xpos, 0, xpos + bandW, 0);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.10)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.restore();
      }
    }
  }

  function render(c, model) {
    const w = model.canvasW || c.canvas.width, h = model.canvasH || c.canvas.height;
    c.clearRect(0, 0, w, h);
    if (model.tpl === "cover") { renderCover(c, w, h, model); return; }
    drawBackground(c, w, h, model.colors);
    if (model.tpl === "result") renderResult(c, w, h, model);
    else if (model.tpl === "invite") renderInvite(c, w, h, model);
    else if (model.tpl === "announce") renderAnnounce(c, w, h, model);
    else if (model.tpl === "souperi") renderSouperi(c, w, h, model);
    else if (model.tpl === "schedule") renderSchedule(c, w, h, model);
    else if (model.tpl === "lineup") renderLineup(c, w, h, model);
    else if (model.tpl === "roster") renderRosterSeason(c, w, h, model);
  }

  // jeden snímek animace (p = 0..1). Pro nepodporované šablony vykreslí statiku.
  function renderFrame(c, model, p) {
    const w = model.canvasW || c.canvas.width, h = model.canvasH || c.canvas.height;
    c.clearRect(0, 0, w, h);
    if (model.tpl === "invite") { renderInviteFrame(c, w, h, model, p); return; }
    if (model.tpl === "result") { renderResultFrame(c, w, h, model, p); return; }
    if (model.tpl === "lineup") { renderLineupFrame(c, w, h, model, p); return; }
    render(c, model);
  }

  global.Poster = { render: render, renderFrame: renderFrame, FONT: FONT, drawAvatar: drawAvatar };
})(typeof window !== "undefined" ? window : this);

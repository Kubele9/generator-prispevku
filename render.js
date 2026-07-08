/* Sdílená vykreslovací logika pro generátor příspěvků.
   Čistá funkce: Poster.render(ctx, model) – nezávislá na DOM.
   Podporuje světlá i tmavá témata (podle jasu pozadí) a odznak týmu. */
(function (global) {
  "use strict";

  const FONT = '"Montserrat", "Arial Narrow", Arial, sans-serif';

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

  /* ---------- RESULT ---------- */
  function renderResult(c, w, h, model) {
    const r = model.result, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

    let y = isStory ? 150 : 72;
    y = drawTeamBadge(c, cx, y, model);
    y += 44;
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    const compTxt = (r.comp || "").toUpperCase();
    if (compTxt) {
      c.fillStyle = colors.primary;
      const cs = fitFont(c, compTxt, w * 0.82, 34, "800", 20);
      c.font = "800 " + cs + "px " + FONT; c.fillText(compTxt, cx, y);
    }

    const rowY = isStory ? h * 0.42 : h * 0.40;
    const logoSize = isStory ? 230 : 210;
    const colHome = w * 0.23, colAway = w * 0.77;
    const homeIsBrum = (r.home || "").toLowerCase().includes("brumovice");
    drawCrest(c, homeIsBrum ? model.logo : model.oppLogo, r.home, colHome, rowY, logoSize, colors);
    drawCrest(c, homeIsBrum ? model.oppLogo : model.logo, r.away, colAway, rowY, logoSize, colors);

    c.fillStyle = tx; c.textAlign = "center"; c.textBaseline = "middle";
    const score = (r.hs || "0") + " : " + (r.as || "0");
    const sSize = fitFont(c, score, w * 0.30, isStory ? 190 : 170, "900", 80);
    c.font = "900 " + sSize + "px " + FONT; c.fillText(score, cx, rowY);
    c.textBaseline = "alphabetic";

    if ((r.half || "").trim()) {
      c.fillStyle = tx; c.globalAlpha = 0.6; c.font = "600 26px " + FONT;
      c.fillText("( " + r.half.trim() + " )", cx, rowY + (isStory ? 130 : 118)); c.globalAlpha = 1;
    }

    drawTeamName(c, r.home, colHome, rowY + logoSize / 2 + 58, w * 0.44, colors);
    drawTeamName(c, r.away, colAway, rowY + logoSize / 2 + 58, w * 0.44, colors);

    const label = resultLabel(r, colors);
    c.font = "800 34px " + FONT;
    const pillW = c.measureText(label.text).width + 80;
    const pillY = rowY + logoSize / 2 + 120;
    c.fillStyle = label.color; roundRect(c, cx - pillW / 2, pillY, pillW, 64, 32); c.fill();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(label.text, cx, pillY + 33); c.textBaseline = "alphabetic";

    const scorers = (r.scorers || []).filter(Boolean);
    if (scorers.length) {
      let sy = pillY + 130; c.textAlign = "center";
      c.fillStyle = colors.primary; c.font = "800 28px " + FONT; c.fillText("STŘELCI", cx, sy); sy += 42;
      c.fillStyle = tx; c.font = "500 30px " + FONT;
      for (const s of scorers) { c.fillText(s, cx, sy); sy += 40; }
    }

    if ((r.date || "").trim()) {
      c.fillStyle = tx; c.globalAlpha = 0.8; c.textAlign = "center"; c.font = "600 28px " + FONT;
      c.fillText(r.date, cx, isStory ? h - 170 : h - 118); c.globalAlpha = 1;
    }
    drawFooter(c, w, h, model);
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

  function renderInvite(c, w, h, model) {
    const iv = model.invite, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

    let y = isStory ? 150 : 74;
    y = drawTeamBadge(c, cx, y, model);
    y += 52;

    // nadpis / výzva
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    const title = (iv.title || "").toUpperCase();
    if (title) {
      c.fillStyle = colors.primary;
      const ts = fitFont(c, title, w * 0.86, 44, "800", 24);
      c.font = "800 " + ts + "px " + FONT; c.fillText(title, cx, y);
    }

    // loga + kroužek VS
    const rowY = isStory ? h * 0.30 : h * 0.33;
    const logoSize = isStory ? 210 : 188;
    const homeIsBrum = iv.side !== "away";
    const leftName = homeIsBrum ? "Sokol Brumovice" : iv.opp;
    const rightName = homeIsBrum ? iv.opp : "Sokol Brumovice";
    const leftLogo = homeIsBrum ? model.logo : model.oppLogo;
    const rightLogo = homeIsBrum ? model.oppLogo : model.logo;
    drawCrest(c, leftLogo, leftName, w * 0.27, rowY, logoSize, colors);
    drawCrest(c, rightLogo, rightName, w * 0.73, rowY, logoSize, colors);

    c.save();
    c.beginPath(); c.arc(cx, rowY, 48, 0, Math.PI * 2); c.fillStyle = colors.primary; c.fill();
    c.fillStyle = pillTextColor(colors.primary); c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "900 italic 40px " + FONT; c.fillText("VS", cx, rowY + 2);
    c.restore(); c.textBaseline = "alphabetic";

    drawTeamName(c, leftName, w * 0.27, rowY + logoSize / 2 + 50, w * 0.42, colors);
    drawTeamName(c, rightName, w * 0.73, rowY + logoSize / 2 + 50, w * 0.42, colors);

    // datum (velké) + čas v pilulce
    let by = isStory ? h * 0.58 : h * 0.585;
    c.textAlign = "center";
    const dt = (iv.date || "").trim();
    if (dt) {
      c.fillStyle = tx;
      const ds = fitFont(c, dt, w * 0.8, 60, "900", 34);
      c.font = "900 " + ds + "px " + FONT; c.fillText(dt, cx, by); by += 34;
    }
    const tm = (iv.time || "").trim();
    if (tm) {
      by += 30;
      c.font = "800 38px " + FONT;
      const pw = c.measureText(tm).width + 66;
      c.fillStyle = colors.primary; roundRect(c, cx - pw / 2, by - 44, pw, 62, 31); c.fill();
      c.fillStyle = pillTextColor(colors.primary); c.textBaseline = "middle";
      c.fillText(tm, cx, by - 44 + 32); c.textBaseline = "alphabetic";
      by += 40;
    }

    // oddělovač
    by += 36;
    c.strokeStyle = overlay(colors, 0.18); c.lineWidth = 2;
    c.beginPath(); c.moveTo(w * 0.22, by); c.lineTo(w * 0.78, by); c.stroke();
    by += 58;

    // KDE / SOUTĚŽ – čisté popisky bez ikon
    const cols = [];
    if ((iv.venue || "").trim()) cols.push(["Kde", iv.venue.trim()]);
    if ((iv.comp || "").trim()) cols.push(["Soutěž", iv.comp.trim()]);
    if (cols.length === 1) {
      drawInfoCol(c, cols[0][0], cols[0][1], cx, by, w * 0.8, colors, tx);
    } else if (cols.length === 2) {
      drawInfoCol(c, cols[0][0], cols[0][1], w * 0.30, by, w * 0.42, colors, tx);
      drawInfoCol(c, cols[1][0], cols[1][1], w * 0.70, by, w * 0.42, colors, tx);
    }
    drawFooter(c, w, h, model);
  }

  /* ---------- ANNOUNCE ---------- */
  function renderAnnounce(c, w, h, model) {
    const a = model.announce, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

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

  function drawPlayerToken(c, tok, cx, cy, d, colors, slotW) {
    const r = d / 2;
    if (!tok) {
      c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = "rgba(0,0,0,0.18)"; c.fill();
      c.setLineDash([6, 6]); c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,0.7)"; c.stroke();
      c.setLineDash([]); c.fillStyle = "rgba(255,255,255,0.8)"; c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "800 " + (r * 0.9) + "px " + FONT; c.fillText("?", cx, cy + 1); c.restore();
      c.textBaseline = "alphabetic"; return;
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

  function renderLineup(c, w, h, model) {
    const l = model.lineup || {}, colors = model.colors, tx = colors.text;
    const cx = w / 2, isStory = (model.format === "story" || model.format === "print");

    let y = isStory ? 140 : 56;
    y = drawTeamBadge(c, cx, y, model);
    y += isStory ? 28 : 22; // mezera pod odznakem MUŽI/DOROST

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

    // rozvržení: hřiště nahoře, náhradníci dole – výšku náhradníků spočítáme dopředu
    const hasSubs = (l.subs || []).length > 0, hasCoach = !!(l.coach || "").trim();
    const subFs = isStory ? 28 : 24, subLabelH = isStory ? 42 : 36, coachH = isStory ? 40 : 34;
    let subLineArr = [];
    if (hasSubs) {
      c.font = "600 " + subFs + "px " + FONT;
      const names = (l.subs || []).map(p => (p.num ? p.num + " " : "") + surname(p.name)).join("   •   ");
      subLineArr = wrapLines(c, names, w * 0.9).slice(0, 2);
    }
    const subsH = (hasSubs ? (subLabelH + subLineArr.length * (subFs + 8)) : 0) + (hasCoach ? coachH : 0);
    const footerReserve = (isStory ? 96 : 58) + 26;
    const bottomGap = isStory ? 30 : 22;
    const pitchTop = y + (isStory ? 30 : 20);
    const pitchBottom = h - footerReserve - subsH - (subsH ? bottomGap : 0);
    const pitchLeft = w * 0.05, pitchW = w * 0.90, pitchH = pitchBottom - pitchTop;
    drawPitch(c, pitchLeft, pitchTop, pitchW, pitchH, colors);

    const lines = l.lines || [];
    const rows = lines.length + 1; // + brankář
    const maxPer = Math.max(1, ...lines.map(a => a.length));
    const rowGap = pitchH / rows;
    const inX = pitchLeft + pitchW * 0.06, inW = pitchW * 0.88;
    let d = Math.min(inW / (maxPer + 0.5), rowGap * 0.60);
    d = Math.max(58, Math.min(d, isStory ? 150 : 128));

    // řada 0 = brankář (dole), poslední = útočníci (nahoře)
    function rowY(r) { return pitchTop + pitchH - (r + 0.5) * rowGap; }
    function placeRow(arr, r) {
      const k = arr.length; if (!k) return;
      const slotW = inW / (k + 1);
      for (let i = 0; i < k; i++) { const px = inX + inW * ((i + 1) / (k + 1)); drawPlayerToken(c, arr[i], px, rowY(r), d, colors, slotW); }
    }
    placeRow([l.gk], 0);
    for (let li = 0; li < lines.length; li++) placeRow(lines[li], li + 1);

    // náhradníci + trenér
    let sy = pitchBottom + bottomGap;
    c.textAlign = "center"; c.textBaseline = "top";
    if (hasSubs) {
      c.fillStyle = colors.primary; c.font = "800 " + (isStory ? 30 : 26) + "px " + FONT;
      c.fillText("NÁHRADNÍCI", cx, sy); sy += subLabelH;
      c.fillStyle = tx; c.font = "600 " + subFs + "px " + FONT;
      for (const ln of subLineArr) { c.fillText(ln, cx, sy); sy += subFs + 8; }
    }
    if (hasCoach) { c.fillStyle = tx; c.globalAlpha = 0.82; c.font = "700 " + (isStory ? 26 : 22) + "px " + FONT; c.fillText("Trenér: " + l.coach.trim(), cx, sy + 2); c.globalAlpha = 1; }
    c.textBaseline = "alphabetic";

    drawFooter(c, w, h, model);
  }

  /* ---------- KÁDR SEZÓNY (tabulka hráčů po sekcích) ---------- */
  function drawAvatar(c, img, cx, cy, d, colors, offY) {
    c.save();
    c.beginPath(); c.arc(cx, cy, d / 2, 0, Math.PI * 2);
    c.fillStyle = "rgba(0,0,0,0.06)"; c.fill();
    if (isReady(img)) {
      c.save();
      c.beginPath(); c.arc(cx, cy, d / 2, 0, Math.PI * 2); c.clip();
      const b = cutoutBounds(img);
      const fw = img.naturalWidth, fh = img.naturalHeight;
      const coverScale = Math.max(d / b.w, d / b.h);
      const headW = Math.max(1, b.headW || b.w * 0.6);
      const headScale = (0.60 * d) / headW; // hlava ~60 % průměru kolečka
      const scale = Math.min(Math.max(coverScale, headScale), coverScale * 1.9);
      const dw = fw * scale, dh = fh * scale;
      const faceCy = b.y + headW * 0.62; // svislý střed obličeje (odhad z výšky hlavy)
      let dx = cx - b.headX * scale;      // vodorovně na střed hlavy
      let dy = (cy - 0.05 * d) - faceCy * scale; // obličej lehce nad středem
      // pojistky, aby výřez pokryl celé kolečko (bez prázdných okrajů)
      const oL = b.x * scale, oR = (b.x + b.w) * scale, oT = b.y * scale, oB = (b.y + b.h) * scale;
      if (dx + oL > cx - d / 2) dx = cx - d / 2 - oL;
      if (dx + oR < cx + d / 2) dx = cx + d / 2 - oR;
      if (dy + oT > cy - d / 2) dy = cy - d / 2 - oT;
      if (dy + oB < cy + d / 2) dy = cy + d / 2 - oB;
      if (offY) dy += offY * d; // ruční svislý posun fotky (+ dolů, − nahoru)
      c.drawImage(img, dx, dy, dw, dh);
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
      for (const s of grouped) addSec(leftKeys[s.key] ? 0 : 1, s);
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
      const d = rowH * 0.84;
      const acx = x + rowH * 0.14 + d / 2, acy = ry + rowH / 2;
      drawAvatar(c, p.photo, acx, acy, d, colors, p.photoY);
      const nameX = acx + d / 2 + rowH * 0.3;
      const yearText = p.birthYear ? "r. " + p.birthYear : "";
      c.font = "700 " + (rowH * 0.34) + "px " + FONT;
      const yearW = yearText ? c.measureText(yearText).width : 0;
      const nameMaxW = (x + wdt) - nameX - yearW - rowH * 0.6;
      let nm = (p.num ? p.num + "  " : "") + (p.name || "");
      let nfs = rowH * 0.42; c.font = "800 " + nfs + "px " + FONT;
      while (c.measureText(nm).width > nameMaxW && nfs > rowH * 0.24) { nfs -= 1; c.font = "800 " + nfs + "px " + FONT; }
      c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = tx;
      c.fillText(nm, nameX, acy + 1);
      if (yearText) {
        c.textAlign = "right"; c.fillStyle = tx; c.globalAlpha = 0.6;
        c.font = "700 " + (rowH * 0.34) + "px " + FONT;
        c.fillText(yearText, x + wdt - rowH * 0.3, acy + 1); c.globalAlpha = 1;
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

  global.Poster = { render: render, FONT: FONT };
})(typeof window !== "undefined" ? window : this);

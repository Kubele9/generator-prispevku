# Generátor příspěvků – Sokol Brumovice

Webová appka na tvorbu příspěvků na Facebook a Instagram (výsledky, pozvánky, oznámení,
přehled soupeřů, rozpis zápasů, úvodní FB foto). Vše běží v prohlížeči, data se ukládají
jen v tvém zařízení. Funguje i offline (po prvním otevření online).

---

## 1) Dostat appku online (zdarma) – Netlify Drop

Nejjednodušší cesta, není potřeba nic instalovat ani zakládat účet.

1. Otevři v prohlížeči na počítači: **https://app.netlify.com/drop**
2. Přetáhni tam **celou složku `generator-prispevku`** (nebo označ všechny soubory uvnitř
   a přetáhni je).
3. Za pár vteřin dostaneš odkaz, např. `https://nazev-neco.netlify.app`.
4. (Volitelné) Klikni na **Site settings → Change site name** a přejmenuj na něco svého,
   třeba `sokol-brumovice-generator` → odkaz bude
   `https://sokol-brumovice-generator.netlify.app`.

> Tip: Když příště něco upravíme, stačí složku na Netlify Drop přetáhnout znovu –
> vytvoří to novou verzi na stejném (nebo novém) odkazu.

### Které soubory nahrát
Nahraj celou složku. Nepovinné (jen pro vývoj, klidně je vynech):
`_preview.html`, `cdp_grab.py`, `cdp_inspect.py`, `logo-club.png`.

Povinné soubory:
```
index.html
render.js
logo-data.js
opponents-data.js
cover-data.js
schedule-data.js
manifest.json
sw.js
icon-192.png
icon-512.png
apple-touch-icon.png
favicon-32.png
```

### Alternativa: GitHub Pages
Máš-li GitHub účet: vytvoř repozitář, nahraj soubory, v **Settings → Pages** zvol větev
`main` a složku `/root`. Za chvíli poběží na `https://tvojejmeno.github.io/nazev/`.

---

## 2) Přidat si appku na plochu mobilu

Otevři svůj Netlify odkaz v mobilu a přidej ho na plochu – bude se chovat jako appka
(vlastní ikona, celá obrazovka).

**iPhone (Safari):** tlačítko Sdílet (čtvereček se šipkou) → **Přidat na plochu**.

**Android (Chrome):** menu ⋮ vpravo nahoře → **Přidat na plochu** / **Nainstalovat aplikaci**.

---

## 3) Jak postovat na FB a Instagram

1. V appce vyber šablonu, vyplň údaje, případně vygeneruj popisek přes **AI popisek**.
2. Zvol formát nahoře:
   - **Feed 1080×1080** – běžný příspěvek,
   - **Story 1080×1920** – pro Stories,
   - **Tisk A4** – pro vytištění na nástěnku.
3. Klikni **📲 Sdílet na FB / Instagram**.
   - **Na mobilu:** vyskočí systémová nabídka → vyber **Facebook** nebo **Instagram**
     a v té appce zvolíš **Feed** nebo **Stories**. Popisek z AI se přiloží automaticky.
   - **Na počítači:** tlačítko obrázek zkopíruje do schránky (vložíš přes Ctrl/Cmd+V),
     nebo použij **Stáhnout PNG**.

> Pro Stories nezapomeň nahoře přepnout na **Story 1080×1920** ještě před sdílením.

---

## Poznámky
- Data (loga soupeřů, rozpis, úvodní fotky) jsou zabudovaná přímo v souborech – appka
  funguje i bez internetu, jakmile ji jednou otevřeš online a přidáš na plochu.
- Rozpis a soupeři jsou pro podzim 2026 (staženo z fotbal.cz). Až vyjde jaro nebo dojde
  ke změnám, dej vědět a data aktualizujeme.
- Nastavení AI klíče a texty zůstávají uložené jen v daném zařízení/prohlížeči.

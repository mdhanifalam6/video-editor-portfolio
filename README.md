# Md Hanif Alam — Portfolio Website

Video Editor & Motion Designer portfolio. Theme: **orange + teal**. Banaya gaya hai **HTML, CSS, JavaScript** se. Isme ek **admin panel** bhi hai, jisse aap baad mein apna kaam upload, edit aur remove kar sakte ho.

---

## 1. Website chalana (apne computer par)

Zaroorat: [Node.js](https://nodejs.org) 18 ya usse naya version. Aapke PC par Node pehle se installed hai.

```bash
cd "F:\AI VIDEO EDITOR\portfolio-website"
node server.js
```

Phir browser mein kholo:

- Website: http://localhost:3000
- Admin panel: http://localhost:3000/admin

Pehli baar admin kholne par **password banana** padega (kam se kam 8 characters).

---

## 2. Admin panel se kya-kya hota hai

| Tab | Kaam |
| --- | --- |
| **Work** | Naya video upload (drag & drop), title / category / description, thumbnail. Edit, delete, aur ↑ ↓ ya drag karke order badlo. Upload hote hi site par live ho jata hai. |
| **Profile** | Apni **photo** upload karo, naam, tagline, about, years of experience, email, WhatsApp, Instagram / YouTube links, aur "Play showreel" button kaunsa video chalaye. |
| **Skills & Experience** | Software list (Premiere Pro, After Effects…), job history (2015–2018…), services. Add / remove / reorder. |
| **Messages** | Website ke contact form se aaye messages. Reply by email ka button bhi hai. |
| **Settings** | Password badlo. |

**Upload ke waqt apne-aap kya hota hai:**

- Thumbnail video ke frame se ban jata hai. Slider se frame chun sakte ho, ya apni image upload karo.
- Video vertical (9:16) hai ya horizontal (16:9), ye apne-aap pata chal jata hai.
- Agar computer par **ffmpeg** installed hai (aapke PC par hai), to ek chhota 8-second ka hover-preview ban jata hai. Isse website fast rehti hai.
- Kisi kaam ko delete karne par uski video aur thumbnail files bhi server se hat jaati hain.
- Har save se pehle purana data `private/backups/` mein save hota hai (aakhri 25 saves).

**Tips:**

- Videos ko MP4 (H.264) mein export karo, 1080p ya 720p. Isse website jaldi load hoti hai.
- Password bhool gaye? `private/auth.json` delete karo aur admin dobara kholo. Phir naya password set kar paoge.

---

## 3. Abhi ke liye kya badalna hai (zaroori)

1. **Email:** abhi `your-email@example.com` likha hai. Admin → Profile mein apna email daalo.
2. **Photo:** abhi "MH" monogram dikh raha hai. Admin → Profile → Upload photo (4:5 portrait best rahega).
3. **WhatsApp / Instagram / YouTube** links daalo. Jo khaali chhodoge, wo site par nahi dikhenge.
4. Sample projects ke **titles aur descriptions** check karo. Ye aapke workspace ki videos se banaye gaye hain, admin mein edit kar sakte ho.
5. Skill levels (95 / 90 / 85 / 80) aur job descriptions default rakhe gaye hain, apne hisaab se badlo.

---

## 4. Website online kaise daalein

### Option A — Node.js hosting (admin bhi online chalega) ✅ recommended
Hostinger (Business / Cloud plan, "Node.js web app"), Render, Railway ya koi VPS.

- Poora `portfolio-website` folder upload karo.
- Start command: `node server.js` (ya `npm start`).
- Port apne-aap `PORT` environment variable se le liya jata hai.
- Phir `https://aapka-domain.com/admin` se kahin se bhi kaam upload / remove kar sakte ho.
- **HTTPS zaroor on rakho**, kyunki admin password usi par safe rehta hai.

### Option B — Simple / static hosting (Hostinger shared, Netlify, GitHub Pages)
Is option mein admin online nahi chalega:

1. Apne PC par `node server.js` chalao aur admin se kaam add / remove karo.
2. Phir sirf **`public/` folder** ke andar ki files hosting par upload karo (Hostinger File Manager → `public_html`).
3. Har update ke baad `public/data/portfolio.json` aur `public/media/` dobara upload karo.

Static hosting par contact form visitor ka **email app** khol deta hai, kyunki wahan message save karne ke liye server nahi hota.

---

## 5. Folder structure

```
portfolio-website/
├── server.js            ← Node server (website + admin + uploads + contact inbox)
├── package.json
├── public/              ← asli website (static host par sirf ye folder upload hota hai)
│   ├── index.html
│   ├── css/style.css    ← design, colors, animations
│   ├── js/main.js       ← hover-play, lightbox, animations, contact form
│   ├── data/portfolio.json  ← saara content (admin isi ko edit karta hai)
│   ├── media/works/     ← videos, previews, thumbnails
│   └── media/profile/   ← aapki photo
├── admin/               ← admin panel (index.html, admin.css, admin.js)
└── private/             ← password hash, messages, backups (kabhi public mat karna)
```

## 6. Colors badalne hain?
`public/css/style.css` ke upar `:root` mein `--orange` aur `--teal` ki values badlo. Poori site ka rang badal jayega.

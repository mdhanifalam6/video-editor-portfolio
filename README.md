# Md Hanif Alam — Portfolio Website

Video Editor & Motion Designer portfolio. Theme: **orange + teal**. Banaya gaya hai **HTML, CSS, JavaScript** se. Isme ek **admin panel** bhi hai, jisse aap baad mein apna kaam upload, edit aur remove kar sakte ho.

**Live site:** https://mdhanifalam6.github.io/video-editor-portfolio/
**GitHub repo:** https://github.com/mdhanifalam6/video-editor-portfolio

---

## 1. Kaam upload / remove karne ka tareeka (har baar)

Website GitHub Pages par static hai, isliye admin panel **aapke PC par** chalta hai. Changes karne ke baad ek button se online chale jaate hain.

1. Server chalao:
   ```bash
   cd "F:\AI VIDEO EDITOR\portfolio-website"
   node server.js
   ```
2. Browser mein **http://localhost:3000/admin** kholo aur login karo. Pehli baar password banana padega (8+ characters).
3. Video add karo, edit karo, delete karo, ya order badlo. Profile, photo, skills, experience bhi yahin se badlo.
4. Upar **Publish to GitHub** dabao. Lagbhag 1 minute mein live site update ho jaati hai.

Publish button ke paas ka orange number batata hai ki kitne changes abhi online nahi gaye hain.

Publish andar se `git add`, `git commit` aur `git push` chalata hai, isliye is PC par GitHub login (`gh auth login`) bana rehna chahiye. Abhi `mdhanifalam6` account logged in hai.

---

## 2. Admin panel se kya-kya hota hai

| Tab | Kaam |
| --- | --- |
| **Work** | Naya video upload (drag & drop), title / category / description, thumbnail. Edit, delete, aur ↑ ↓ ya drag karke order badlo. |
| **Profile** | Apni **photo**, naam, tagline, about, years of experience, email, WhatsApp, social links, aur "Play showreel" button kaunsa video chalaye. Contact form service ki setting bhi yahin hai (neeche section 4 dekho). |
| **Skills & Experience** | Software list, job history, services. Add / remove / reorder. |
| **Messages** | Sirf local server par aaye messages (GitHub Pages par form email se kaam karta hai, section 4 dekho). |
| **Settings** | Password badlo, GitHub connection aur live link dekho. |

**Upload ke waqt apne-aap kya hota hai:**

- Thumbnail video ke frame se ban jata hai (slider se frame chuno), ya apni image do.
- Video vertical (9:16) hai ya horizontal (16:9), ye apne-aap pata chal jata hai.
- **ffmpeg** (aapke PC par installed hai) se:
  - ek chhota 8-second ka hover-preview banta hai
  - 40 MB se badi video 1080p web MP4 mein compress hoti hai
- GitHub **100 MB se badi file nahi leta**. Publish aisi file ko rok dega aur uska naam bata dega.
- Kisi kaam ko delete karne par uski video aur thumbnail files bhi hat jaati hain.
- Har save se pehle purana data `private/backups/` mein save hota hai (aakhri 25 saves).

**Password bhool gaye?** `private/auth.json` delete karke admin dobara kholo, phir naya password set kar paoge.

---

## 3. Abhi kya baaki hai

1. **Photo:** abhi "MH" monogram dikh raha hai. Admin → Profile → Upload photo (4:5 portrait best), phir Publish.
2. **Instagram / YouTube / LinkedIn / Behance** links daalo. Jo khaali chhodoge, wo site par nahi dikhenge.
3. Sample projects ke **titles aur descriptions**, skill levels (95 / 90 / 85 / 80) aur job descriptions check karke apne hisaab se badlo.

---

## 4. Contact form (GitHub Pages par)

GitHub Pages par message save karne ke liye koi server nahi hota. Isliye do tareeke hain:

- **Default:** "Send message" dabane par visitor ka email app khulta hai, aur message aapke email par jaata hai.
- **Behtar (free):**
  1. [Formspree](https://formspree.io) ya [Web3Forms](https://web3forms.com) par free form banao.
  2. Admin → Profile → *Form endpoint URL* mein uska URL daalo (Web3Forms ke liye *Access key* bhi).
  3. Save → Publish. Ab messages seedhe aapke email par aayenge, visitor ko kuch nahi karna padega.

---

## 5. Folder structure

```
portfolio-website/
├── server.js            ← local server: website preview + admin + uploads + Publish to GitHub
├── docs/                ← asli website (GitHub Pages yahi folder serve karta hai)
│   ├── index.html
│   ├── css/style.css    ← design, colors, animations
│   ├── js/main.js       ← hover-play, lightbox, animations, contact form
│   ├── data/portfolio.json  ← saara content (admin isi ko edit karta hai)
│   ├── media/works/     ← videos, previews, thumbnails
│   └── media/profile/   ← aapki photo
├── admin/               ← admin panel (sirf local, site par nahi dikhta)
└── private/             ← password hash, messages, backups (git mein nahi jaata)
```

## 6. Colors badalne hain?
`docs/css/style.css` ke upar `:root` mein `--orange` aur `--teal` ki values badlo, phir Publish karo.

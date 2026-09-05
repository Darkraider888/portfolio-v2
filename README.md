# Mehedi Hasan Siddique — Portfolio

A redesigned personal portfolio for **Mehedi Hasan Siddique (@Darkraider888)**, CSE undergraduate at Southeast University.

## Live site

https://demo-portfolio-ecru.vercel.app/

## What changed

- Rebuilt the visual identity around a clean dark/red professional theme.
- Simplified the navigation and removed repetitive sections.
- Replaced arbitrary skill percentages with a logo-based technology arsenal.
- Made **CampusVoice** the flagship project and added real project links.
- Corrected the ORIVO description to match the current React/TypeScript project.
- Added research, education and credential sections with cleaner hierarchy.
- Removed the old contact form that visually simulated a successful send without actually delivering a message.
- Added direct email, copy-email and professional social links instead.
- Added responsive mobile navigation, theme persistence, active-section navigation and subtle reveal motion.
- Added accessibility improvements, SEO metadata, structured data, robots.txt, sitemap.xml and a custom 404 page.
- Added Vercel security headers.

## Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Font Awesome
- Skill Icons / Simple Icons for technology logos
- Vercel for static hosting

## Project structure

```text
.
├── index.html
├── 404.html
├── README.md
├── vercel.json
├── robots.txt
├── sitemap.xml
├── site.webmanifest
└── assets/
    ├── css/
    │   └── style.css
    ├── js/
    │   └── main.js
    ├── images/
    │   ├── favicon.svg
    │   └── profile.webp
    └── files/
        └── Mehedi_Hasan_Siddique_CV.pdf
```

## Local preview

No build step is required. You can open `index.html` directly, or run a tiny local server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deployment

The project is ready for Vercel. Push the files to the `main` branch and your existing Vercel project can redeploy from GitHub.

## Important content to review before publishing

Check that these details are still current:

- CV PDF
- LinkedIn URL
- certification names/dates
- current research description
- internship/collaboration availability

## License

MIT — see `LICENSE`.

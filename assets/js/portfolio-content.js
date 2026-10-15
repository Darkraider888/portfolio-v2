/*
 * Portfolio V2 - Admin-connected content renderer (Step 5A)
 * Reads /data/portfolio.json and updates the existing HTML without changing CSS.
 * All JSON text is inserted with textContent, not untrusted HTML.
 * On fetch/validation failure the original index.html remains readable.
 */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const create = (tag, className = '', textValue) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
    return node;
  };
  const write = (selector, value, root = document) => {
    const node = $(selector, root);
    if (node && typeof value === 'string') node.textContent = value;
  };
  const isText = (value) => typeof value === 'string' && value.trim() !== '';

  // Only allow HTTPS/HTTP links or safe repository-local asset paths.
  function safeLink(value, allowAsset = false) {
    if (!isText(value)) return null;
    const input = value.trim();
    if (allowAsset && /^assets\/[a-z0-9_./-]+$/i.test(input) && !input.split('/').includes('..')) return input;
    try {
      const url = new URL(input);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  function icon(classNames) {
    const item = create('i');
    const value = isText(classNames) ? classNames.trim() : '';
    item.className = /^(fa-solid|fa-regular|fa-brands) fa-[a-z0-9-]+$/.test(value)
      ? value : 'fa-solid fa-code';
    item.setAttribute('aria-hidden', 'true');
    return item;
  }

  function link(rawUrl, label, className = '', iconClass = '') {
    const href = safeLink(rawUrl, true);
    if (!href) return null;
    const anchor = create('a', className);
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    if (iconClass) anchor.append(icon(iconClass), document.createTextNode(' '));
    anchor.append(document.createTextNode(label));
    return anchor;
  }

  // Additional download links from the Admin Project Manager.
  // Only HTTP(S) destinations can be used, matching /api/publish validation.
  function downloads(project, className = '') {
    const output = [];
    const seen = new Set();
    const add = (raw, label, allowAsset = false) => {
      const href = safeLink(raw, allowAsset);
      if (!href || seen.has(href)) return;
      seen.add(href);
      const item = link(href, label, className, 'fa-solid fa-download');
      if (item) output.push(item);
    };
    add(project.downloadUrl, 'Download', true); // Backwards-compatible single link.
    if (Array.isArray(project.downloads)) {
      for (const item of project.downloads.slice(0, 10)) {
        if (!item || !isText(item.label)) continue;
        const label = item.label.trim().slice(0, 80);
        add(item.url, label);
      }
    }
    return output;
  }

  function chips(container, technologies) {
    if (!container || !Array.isArray(technologies)) return;
    container.replaceChildren(...technologies
      .filter(isText)
      .map(name => create('span', 'tech-chip', name)));
  }

  function accentHeading(node, fullText) {
    if (!node || !isText(fullText)) return;
    const words = fullText.trim().split(/\s+/);
    if (words.length < 4) {
      node.textContent = fullText;
      return;
    }
    const cut = words.length - 3;
    node.replaceChildren(
      document.createTextNode(words.slice(0, cut).join(' ') + ' '),
      create('span', 'accent', words.slice(cut).join(' '))
    );
  }

  function hero(data) {
    const profile = data.profile || {};
    const site = data.site || {};
    if (isText(site.title)) document.title = site.title;
    write('.brand-text', profile.name);
    const status = $('#home .status-pill');
    if (status && isText(profile.availability)) {
      const dot = $('.status-dot', status);
      status.replaceChildren(...(dot ? [dot] : []), document.createTextNode(' ' + profile.availability));
    }
    const heading = $('#home h1');
    if (heading && isText(profile.headline) && isText(profile.headlineAccent)) {
      heading.replaceChildren(
        document.createTextNode(profile.headline + ' '),
        create('span', 'accent', profile.headlineAccent)
      );
    }
    const bio = $('#home .hero-subtitle');
    if (bio && isText(profile.heroBio)) {
      const name = profile.name;
      const start = isText(name) ? profile.heroBio.indexOf(name) : -1;
      if (start >= 0) {
        bio.replaceChildren(
          document.createTextNode(profile.heroBio.slice(0, start)),
          create('strong', '', name),
          document.createTextNode(profile.heroBio.slice(start + name.length))
        );
      } else {
        bio.textContent = profile.heroBio;
      }
    }
    if (Array.isArray(profile.specialties)) {
      write('#home .hero-role', profile.specialties.filter(isText).join(' · '));
    }
    const meta = document.querySelectorAll('#home .hero-meta-item strong');
    if (meta[0] && isText(profile.location)) meta[0].textContent = profile.location;
    if (meta[1] && Array.isArray(data.education) && data.education[0]?.title) {
      meta[1].textContent = data.education[0].title;
    }
    write('#home .portrait-overlay strong', profile.name);
    if (isText(profile.username)) write('#home .portrait-overlay span', '@' + profile.username.replace(/^@/, ''));
    const portrait = $('#home .portrait-card img');
    const profileImageSetting = Object.prototype.hasOwnProperty.call(profile, 'profileImage')
      ? profile.profileImage : site.image;
    const imageUrl = safeLink(profileImageSetting, true);
    if (portrait && imageUrl) {
      portrait.src = imageUrl;
      portrait.alt = 'Portrait of ' + (profile.name || 'portfolio owner');
    } else if (portrait && !isText(profileImageSetting)) {
      // An intentionally cleared profile-photo field should not revive the
      // old static picture or display the social sharing image as a portrait.
      const wrap = portrait.closest('.portrait-wrap');
      if (wrap) {
        wrap.hidden = true;
        wrap.style.display = 'none';
        const grid = $('#home .hero-grid');
        if (grid) grid.style.gridTemplateColumns = 'minmax(0, 1fr)';
      }
    }
    const resume = $('#home .hero-actions a[download]');
    const resumeUrl = safeLink(site.resume, true);
    if (resume) {
      if (resumeUrl) {
        resume.href = resumeUrl;
        resume.hidden = false;
        resume.style.removeProperty('display');
        // Download attribute cannot reliably download from external origins.
        if (/^https?:\/\//.test(resumeUrl)) {
          resume.removeAttribute('download');
          resume.target = '_blank';
          resume.rel = 'noopener noreferrer';
        }
      } else {
        resume.hidden = true;
        resume.style.display = 'none';
      }
    }
    if (isText(profile.name)) {
      const footerName = $('.footer-inner > span:first-child');
      if (footerName) {
        const currentYear = create('span', '', String(new Date().getFullYear()));
        currentYear.id = 'year';
        footerName.replaceChildren(
          document.createTextNode('© '), currentYear,
          document.createTextNode(' ' + profile.name + '.')
        );
      }
    }
    if (isText(profile.username)) write('.footer .mono', '@' + profile.username.replace(/^@/, '') + ' · Build → learn → improve.');
  }

  function about(data) {
    const info = data.about || {};
    accentHeading($('#about .section-title'), info.headline);
    write('#about .section-intro', info.intro);
    const copy = $('#about .about-copy');
    if (copy && Array.isArray(info.paragraphs)) {
      const paragraphs = info.paragraphs.filter(isText).map((value, index) => {
        const paragraph = create('p');
        if (index === 0 && value.includes('Java')) {
          const start = value.indexOf('Java');
          paragraph.append(
            document.createTextNode(value.slice(0, start)),
            create('strong', '', 'Java'),
            document.createTextNode(value.slice(start + 4))
          );
        } else {
          paragraph.textContent = value;
        }
        return paragraph;
      });
      if (isText(info.quote)) paragraphs.push(create('div', 'quote-line', info.quote));
      if (paragraphs.length) copy.replaceChildren(...paragraphs);
    }
    const focusList = $('#about .focus-list');
    if (focusList && Array.isArray(info.focusAreas)) {
      const items = info.focusAreas.filter(item => isText(item?.title)).map(item => {
        const block = create('div', 'focus-item');
        const badge = create('div', 'focus-icon');
        badge.append(icon(item.icon));
        const content = create('div');
        content.append(create('h3', '', item.title), create('p', '', item.description || ''));
        block.append(badge, content);
        return block;
      });
      focusList.replaceChildren(...items);
    }
  }

  // Optional project imagery: preserve the original card layout when no media exists.
  function projectGallery(project, max = 4) {
    const sources = Array.isArray(project.screenshots) ? project.screenshots : [];
    const gallery = create('div', 'project-screenshot-gallery');
    gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:9px;margin-top:15px;';
    for (const [index, value] of sources.slice(0, max).entries()) {
      const url = safeLink(value, true);
      if (!url) continue;
      const anchor = create('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.setAttribute('aria-label', `Open ${project.title} screenshot ${index + 1}`);
      const image = create('img');
      image.src = url;
      image.alt = `${project.title} screenshot ${index + 1}`;
      image.loading = 'lazy';
      image.style.cssText = 'width:72px;height:53px;object-fit:cover;border:1px solid var(--line);border-radius:9px;';
      anchor.append(image);
      gallery.append(anchor);
    }
    return gallery;
  }

  function work(data) {
    if (!Array.isArray(data.projects)) return;
    const items = data.projects.filter(p => p && p.visible !== false && isText(p.title));
    if (!items.length) return;
    const featured = items.find(p => p.featured === true) || items[0];
    const feature = $('#work .featured-project');
    if (feature) {
      write('.project-label', 'Featured project', feature);
      write('.featured-content h3', featured.title, feature);
      write('.featured-content p', featured.description || '', feature);
      chips($('.featured-content .project-tech', feature), featured.technologies);
      const actions = $('.featured-content .project-actions', feature);
      if (actions) {
        const live = link(featured.liveUrl, 'Live application', 'btn btn-primary', 'fa-solid fa-arrow-up-right-from-square');
        const source = link(featured.repositoryUrl, 'Source code', 'btn', 'fa-brands fa-github');
        actions.replaceChildren(...[live, source].filter(Boolean), ...downloads(featured, 'btn'));
      }
      const featureImageUrl = safeLink(featured.imageUrl || featured.coverUrl, true);
      const visual = $('.featured-visual', feature);
      if (visual && featureImageUrl) {
        // Keep the original visual mockup as a fallback for inaccessible URLs.
        const fallback = Array.from(visual.childNodes);
        const photo = create('img');
        photo.src = featureImageUrl;
        photo.alt = `${featured.title} project cover`;
        photo.loading = 'lazy';
        photo.decoding = 'async';
        photo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;background:#0d1117;';
        photo.onerror = () => visual.replaceChildren(...fallback);
        visual.replaceChildren(photo);
      }
      const featuredContent = $('.featured-content', feature);
      if (featuredContent && Array.isArray(featured.screenshots) && featured.screenshots.length) {
        featuredContent.append(projectGallery(featured));
      }
    }
    const grid = $('#work .projects-grid');
    if (!grid) return;
    const others = items.filter(p => p !== featured);
    const cards = others.map((project, i) => {
      const card = create('article', 'card project-card reveal is-visible');
      card.append(create('span', 'project-number', String(i + 1).padStart(2, '0')));
      const symbol = create('div', 'project-icon');
      symbol.append(icon(project.icon));
      card.append(symbol);
      const cover = safeLink(project.imageUrl || project.coverUrl, true);
      if (cover) {
        const image = create('img');
        image.src = cover;
        image.alt = `${project.title} project cover`;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.style.cssText = 'display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--line);border-radius:12px;margin-bottom:18px;';
        image.onerror = () => image.remove();
        card.append(image);
      }
      card.append(create('h3', '', project.title), create('p', '', project.description || ''));
      const tags = create('div', 'project-tech');
      chips(tags, project.technologies);
      card.append(tags);
      const links = create('div', 'card-links');
      const live = link(project.liveUrl, 'Live', '', 'fa-solid fa-arrow-up-right-from-square');
      const source = link(project.repositoryUrl, 'GitHub', '', 'fa-brands fa-github');
        links.append(...[live, source].filter(Boolean), ...downloads(project));
      card.append(links);
      if (Array.isArray(project.screenshots) && project.screenshots.length) {
        card.append(projectGallery(project, 3));
      }
      return card;
    });
    grid.replaceChildren(...cards);
  }

  function skills(data) {
    if (!Array.isArray(data.skills)) return;
    const sectionInfo = data.skillsSection;
    if (sectionInfo && typeof sectionInfo === 'object' && !Array.isArray(sectionInfo)) {
      const heading = $('#skills .section-title');
      if (heading) {
        const prefix = isText(sectionInfo.headline) ? sectionInfo.headline.trim() : 'The tools behind the';
        const highlight = isText(sectionInfo.accent) ? sectionInfo.accent.trim() : 'work.';
        heading.replaceChildren(document.createTextNode(prefix + ' '), create('span', 'accent', highlight));
      }
      if (isText(sectionInfo.intro)) write('#skills .section-intro', sectionInfo.intro);
    }
    const shell = $('#skills .skills-shell');
    if (!shell) return;
    const groups = data.skills.filter(group => isText(group?.category)).map(group => {
      const outer = create('div', 'skill-group');
      const head = create('div', 'skill-group-head');
      head.append(create('h3', '', group.category), create('span', 'skill-group-note', group.note || ''));
      const logos = create('div', 'logo-grid');
      for (const skill of (Array.isArray(group.items) ? group.items : [])) {
        if (!isText(skill?.name)) continue;
        const item = create('span', 'tech-logo');
        item.setAttribute('data-label', skill.name);
        item.setAttribute('tabindex', '0');
        const imgUrl = safeLink(skill.iconUrl, true);
        if (imgUrl) {
          const image = create('img');
          image.src = imgUrl;
          image.alt = skill.name;
          image.loading = 'lazy';
          image.onerror = () => {
            item.replaceChildren();
            item.classList.add('wordmark');
            item.textContent = skill.name.slice(0, 9);
          };
          item.append(image);
        } else {
          item.classList.add('wordmark');
          item.textContent = /assembly/i.test(skill.name) ? 'ASM' :
            /scene builder/i.test(skill.name) ? 'Scene' : skill.name.slice(0, 9);
        }
        logos.append(item);
      }
      outer.append(head, logos);
      return outer;
    });
    shell.replaceChildren(...groups);
  }

  function research(data) {
    const info = data.research || {};
    write('#research .section-intro', info.intro);
    const grid = $('#research .research-grid');
    if (!grid) return;
    const aside = $('.research-side', grid);
    const publications = Array.isArray(info.publications) ? info.publications : [];
    const cards = publications.filter(item => item && item.visible !== false && isText(item.title)).map(pub => {
      const article = create('article', 'card publication-card reveal is-visible');
      const badges = create('div', 'pub-meta');
      badges.append(create('span', 'pub-badge', 'Published Research'));
      if (isText(pub.journal)) badges.append(create('span', 'pub-badge', pub.journal));
      article.append(badges, create('h3', '', pub.title));
      const authors = create('p', '', Array.isArray(pub.authors) ? pub.authors.filter(isText).join(', ') : '');
      article.append(authors);
      const description = create('p', '', pub.description || '');
      description.style.marginTop = '12px';
      article.append(description);
      const actions = create('div', 'pub-actions');
      const doi = link(pub.doiUrl, 'View DOI', 'btn btn-primary', 'fa-solid fa-book-open');
      const scholar = link(data.contact?.googleScholar, 'Google Scholar', 'btn', 'fa-solid fa-graduation-cap');
      const orcid = link(data.contact?.orcid, 'ORCID', 'btn', 'fa-brands fa-orcid');
      actions.append(...[doi, scholar, orcid].filter(Boolean));
      article.append(actions);
      return article;
    });
    const previous = grid.querySelectorAll('.publication-card');
    previous.forEach(node => node.remove());
    if (aside) {
      cards.forEach(card => grid.insertBefore(card, aside));
      const interestList = $('.research-list', aside);
      if (interestList && Array.isArray(info.interests)) {
        const interests = info.interests.filter(item => isText(item?.title)).map(item => {
          const node = create('div', 'research-item');
          node.append(create('strong', '', item.title), create('span', '', item.description || ''));
          return node;
        });
        interestList.replaceChildren(...interests);
      }
    } else grid.append(...cards);
  }

  function educationAndCertifications(data) {
    const timeline = $('#journey .timeline');
    if (timeline && Array.isArray(data.education) && data.education.length) {
      const existing = Array.from(timeline.querySelectorAll('.timeline-item'));
      const existingFocusItems = existing.slice(1); // Preserve the original Focus and Continuing timeline entries.
      const entries = data.education.filter(item => isText(item?.title)).map(item => {
        const node = create('div', 'timeline-item');
        node.append(
          create('small', '', item.period || ''),
          create('strong', '', item.title),
          create('p', '', [item.institution, item.location].filter(isText).join(' · '))
        );
        return node;
      });
      timeline.replaceChildren(...entries, ...existingFocusItems);
    }
    const list = $('#journey .credential-list');
    if (list && Array.isArray(data.certifications)) {
      const cards = data.certifications.filter(item => item && item.visible !== false && isText(item.title)).map(cert => {
        const row = create('div', 'credential');
        const badge = create('div', 'credential-icon');
        badge.append(icon(cert.icon || 'fa-solid fa-certificate'));
        const fileUrl = safeLink(cert.fileUrl || cert.certificateUrl, true);
        const isImage = fileUrl && /\.(png|jpe?g|webp)(?:$|[?#])/i.test(fileUrl);
        // Image certificates appear as a small clickable preview; PDFs retain the icon.
        // Keep the original credential layout, typography and dark/light theme.
        let visual = badge;
        if (isImage) {
          const preview = create('a', 'credential-preview-image');
          preview.href = fileUrl;
          preview.target = '_blank';
          preview.rel = 'noopener noreferrer';
          preview.setAttribute('aria-label', 'View ' + cert.title + ' certificate image');
          preview.style.cssText = 'flex:0 0 88px;width:88px;height:112px;display:grid;place-items:center;overflow:hidden;border:1px solid var(--line);border-radius:11px;background:var(--surface);';
          const img = create('img');
          img.src = fileUrl;
          img.alt = cert.title + ' certificate thumbnail';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;';
          img.onerror = () => preview.replaceWith(badge);
          preview.append(img);
          visual = preview;
        }
        const details = create('div');
        details.append(create('strong', '', cert.title));
        details.append(create('span', '', [cert.issuer, cert.period || cert.issueDate].filter(isText).join(' · ')));
        if (isText(cert.description)) details.append(create('p', '', cert.description));
        const actions = create('div', 'card-links');
        const fileLink = link(fileUrl, 'View certificate', '', 'fa-solid fa-file-arrow-down');
        const verification = link(cert.verificationUrl || cert.link, 'Verify', '', 'fa-solid fa-arrow-up-right-from-square');
        actions.append(...[fileLink, verification].filter(Boolean));
        if (actions.childElementCount) details.append(actions);
        details.style.minWidth = '0';
        row.append(visual, details);
        return row;
      });
      list.replaceChildren(...cards);
    }
  }

  function contact(data) {
    const values = data.contact || {};
    if (isText(values.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      const emailLink = $('#contact .contact-actions a[href^="mailto:"]');
      if (emailLink) emailLink.href = 'mailto:' + values.email.trim();
      // main.js reads this dynamically after the one-line Step 3 fix.
      document.documentElement.dataset.portfolioEmail = values.email.trim();
    }
    const keys = {
      'GitHub': 'github', 'LinkedIn': 'linkedin', 'ORCID': 'orcid',
      'Google Scholar': 'googleScholar', 'X': 'x', 'Instagram': 'instagram'
    };
    for (const [label, key] of Object.entries(keys)) {
      const anchor = Array.from(document.querySelectorAll('#contact .social-stack a'))
        .find(node => node.getAttribute('aria-label') === label);
      const href = safeLink(values[key]);
      if (!anchor) continue;
      if (href) {
        anchor.href = href;
        anchor.hidden = false;
        anchor.style.removeProperty('display');
      } else {
        anchor.hidden = true;
        anchor.style.display = 'none';
        anchor.removeAttribute('href');
      }
    }
    // Other GitHub links in the header and hero use the same admin setting.
    const githubUrl = safeLink(values.github);
    const headerGithub = $('.nav-actions a[aria-label="GitHub profile"]');
    const heroGithub = Array.from(document.querySelectorAll('#home .hero-actions a'))
      .find(item => item.querySelector('.fa-github'));
    for (const anchor of [headerGithub, heroGithub]) {
      if (!anchor) continue;
      if (githubUrl) {
        anchor.href = githubUrl;
        anchor.hidden = false;
        anchor.style.removeProperty('display');
      } else {
        anchor.hidden = true;
        anchor.style.display = 'none';
        anchor.removeAttribute('href');
      }
    }
    if (!isText(values.email)) {
      for (const anchor of document.querySelectorAll('#contact .contact-actions a[href^="mailto:"], #copyEmail')) {
        anchor.hidden = true;
        anchor.style.display = 'none';
      }
    }
  }

  function applySettings(data) {
    const site = data.site || {};
    const appearance = site.appearance || {};
    const features = site.features || {};

    // Default remains the existing premium red theme. Override only on
    // explicit, valid admin values; invalid CSS is never inserted.
    if (typeof appearance.accent === 'string' && /^#[0-9a-f]{6}$/i.test(appearance.accent)) {
      const hex = appearance.accent;
      const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-soft', `rgba(${channels.join(', ')}, 0.13)`);
    }
    // main.js handles the visitor's theme toggle and its saved preference.
    // Admin theme is applied as a *default*, never overriding that choice.
    if (appearance.theme === 'dark' || appearance.theme === 'light') {
      let savedTheme;
      try { savedTheme = localStorage.getItem('portfolio-theme'); } catch (_) { savedTheme = null; }
      if (!savedTheme) {
        const theme = appearance.theme;
        document.documentElement.dataset.theme = theme;
        const themeIcon = $('#themeIcon');
        const toggle = $('#themeToggle');
        if (themeIcon) themeIcon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      }
    }

    // Hide only explicitly disabled sections; unspecified controls preserve
    // the original theme's layout and navigation.
    for (const [flag, selector, href] of [
      ['showProjects', '#work', '#work'],
      ['showResearch', '#research', '#research']
    ]) {
      if (features[flag] !== false) continue;
      const section = $(selector);
      if (section) { section.hidden = true; section.style.display = 'none'; }
      for (const nav of document.querySelectorAll(`.nav-links a[href="${href}"]`)) {
        nav.hidden = true; nav.style.display = 'none';
      }
      if (flag === 'showProjects') {
        const explore = $('#home .hero-actions a[href="#work"]');
        if (explore) explore.href = '#about';
      }
    }
    if (features.showCertifications === false) {
      const article = $('#journey .credential-list')?.closest('.journey-card');
      if (article) { article.hidden = true; article.style.display = 'none'; }
      const columns = $('#journey .journey-grid');
      if (columns) columns.style.gridTemplateColumns = 'minmax(0,1fr)';
    }
    // showKeyboard and showPong are reserved for Step 5B interactive features.
    // No game or keyboard is injected in this content-only release.
  }

  function updateMetadata(data) {
    const site = data.site || {};
    const siteUrl = safeLink(site.siteUrl);
    const description = site.description;
    if (isText(description)) {
      for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
        const meta = $(selector);
        if (meta) meta.setAttribute('content', description);
      }
    }
    const ogTitle = $('meta[property="og:title"]');
    if (ogTitle && isText(site.title)) ogTitle.content = site.title;
    for (const selector of ['meta[property="og:url"]', 'link[rel="canonical"]']) {
      const node = $(selector);
      if (node && siteUrl) node.setAttribute(node.tagName === 'LINK' ? 'href' : 'content', siteUrl);
    }
    const favicon = safeLink(site.favicon, true);
    const faviconTag = $('link[rel="icon"]');
    if (favicon && faviconTag) {
      faviconTag.href = favicon;
      // Browser infers MIME for PNG/WebP/favicon; SVG stays SVG.
      if (!/\.svg(?:$|[?#])/i.test(favicon)) faviconTag.removeAttribute('type');
    }
    const image = safeLink(site.image || data.profile?.profileImage, true);
    if (image && siteUrl) {
      const ogImage = $('meta[property="og:image"]');
      if (ogImage) ogImage.content = new URL(image, siteUrl).href;
    }
    const ld = $('script[type="application/ld+json"]');
    if (ld) {
      try {
        const person = JSON.parse(ld.textContent);
        if (isText(data.profile?.name)) person.name = data.profile.name;
        if (siteUrl) person.url = siteUrl;
        if (image && siteUrl) person.image = new URL(image, siteUrl).href;
        person.sameAs = ['github', 'linkedin', 'orcid', 'googleScholar', 'x']
          .map(key => safeLink(data.contact?.[key]))
          .filter(Boolean);
        ld.textContent = JSON.stringify(person);
      } catch (_) {
        // Preserve the existing JSON-LD if it could not be parsed.
      }
    }
  }

  async function start() {
    try {
      const response = await fetch('./data/portfolio.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.schemaVersion !== 1 || !data.profile || !Array.isArray(data.projects)) {
        throw new Error('Invalid portfolio.json schema');
      }
      hero(data);
      about(data);
      work(data);
      skills(data);
      research(data);
      educationAndCertifications(data);
      contact(data);
      updateMetadata(data);
      applySettings(data);
      document.documentElement.dataset.portfolioSource = 'json';
      console.info('Portfolio content loaded from data/portfolio.json');
    } catch (error) {
      console.error('Portfolio JSON loading failed. Keeping original HTML content.', error);
    }
  }

  // Defer-script is placed after main.js; both execute when HTML parsing is complete.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

/*
 * Portfolio V2 - Content renderer (Step 3)
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
    const imageUrl = safeLink(profile.profileImage || site.image, true);
    if (portrait && imageUrl) {
      portrait.src = imageUrl;
      portrait.alt = 'Portrait of ' + (profile.name || 'portfolio owner');
    }
    const resume = $('#home .hero-actions a[download]');
    const resumeUrl = safeLink(site.resume, true);
    if (resume && resumeUrl) resume.href = resumeUrl;
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
        actions.replaceChildren(...[live, source].filter(Boolean));
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
      card.append(symbol, create('h3', '', project.title), create('p', '', project.description || ''));
      const tags = create('div', 'project-tech');
      chips(tags, project.technologies);
      card.append(tags);
      const links = create('div', 'card-links');
      const live = link(project.liveUrl, 'Live', '', 'fa-solid fa-arrow-up-right-from-square');
      const source = link(project.repositoryUrl, 'GitHub', '', 'fa-brands fa-github');
      links.append(...[live, source].filter(Boolean));
      card.append(links);
      return card;
    });
    grid.replaceChildren(...cards);
  }

  function skills(data) {
    if (!Array.isArray(data.skills)) return;
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
        const details = create('div');
        details.append(create('strong', '', cert.title));
        details.append(create('span', '', [cert.issuer, cert.period || cert.issueDate].filter(isText).join(' · ')));
        if (isText(cert.description)) details.append(create('p', '', cert.description));
        const fileUrl = cert.fileUrl || cert.certificateUrl;
        const actions = create('div', 'card-links');
        const fileLink = link(fileUrl, 'View certificate', '', 'fa-solid fa-file-arrow-down');
        const verification = link(cert.verificationUrl || cert.link, 'Verify', '', 'fa-solid fa-arrow-up-right-from-square');
        actions.append(...[fileLink, verification].filter(Boolean));
        if (actions.childElementCount) details.append(actions);
        row.append(badge, details);
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
      if (anchor && href) anchor.href = href;
    }
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

(() => {
    'use strict';

    const root = document.documentElement;
    const header = document.querySelector('.site-header');
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const mobileToggle = document.getElementById('mobileToggle');
    const navLinks = document.getElementById('navLinks');
    const backToTop = document.getElementById('backToTop');
    const copyEmail = document.getElementById('copyEmail');
    const copyStatus = document.getElementById('copyStatus');
    const year = document.getElementById('year');

    const setTheme = (theme) => {
        root.dataset.theme = theme;
        if (themeIcon) {
            themeIcon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        }
        if (themeToggle) {
            themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        }
        try {
            localStorage.setItem('portfolio-theme', theme);
        } catch (_) {
            // Local storage can be unavailable in strict privacy modes.
        }
    };

    let savedTheme = null;
    try {
        savedTheme = localStorage.getItem('portfolio-theme');
    } catch (_) {
        savedTheme = null;
    }

    const preferredTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(preferredTheme);

    themeToggle?.addEventListener('click', () => {
        setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    const onScroll = () => {
        const y = window.scrollY;
        header?.classList.toggle('scrolled', y > 12);
        backToTop?.classList.toggle('visible', y > 650);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    mobileToggle?.addEventListener('click', () => {
        const isOpen = navLinks?.classList.toggle('open');
        mobileToggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
        mobileToggle.innerHTML = isOpen
            ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    });

    navLinks?.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
            if (mobileToggle) {
                mobileToggle.setAttribute('aria-expanded', 'false');
                mobileToggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
            }
        });
    });

    const sections = [...document.querySelectorAll('main section[id]')];
    const menuLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];

    if ('IntersectionObserver' in window) {
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                menuLinks.forEach((link) => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
                });
            });
        }, {
            rootMargin: '-30% 0px -60% 0px',
            threshold: 0
        });

        sections.forEach((section) => sectionObserver.observe(section));

        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));
    } else {
        document.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
    }

    backToTop?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    copyEmail?.addEventListener('click', async () => {
        const email = 'hasanmehidi2016@gmail.com';
        try {
            await navigator.clipboard.writeText(email);
            copyStatus.textContent = 'Email copied to clipboard.';
        } catch (_) {
            copyStatus.textContent = email;
        }

        window.setTimeout(() => {
            if (copyStatus) copyStatus.textContent = '';
        }, 3200);
    });

    if (year) year.textContent = new Date().getFullYear();
})();

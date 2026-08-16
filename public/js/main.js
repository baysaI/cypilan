document.addEventListener('DOMContentLoaded', () => {
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // The header is two rows on desktop, three on a phone with the search bar,
    // and taller again when the admin maintenance banner is up. Anything that
    // has to clear it — sticky filter rails, in-page anchors — reads this
    // instead of a hardcoded offset that is wrong at half the breakpoints.
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        const publishHeaderHeight = () => {
            document.documentElement.style.setProperty('--cyp-header-h', Math.round(siteHeader.offsetHeight) + 'px');
        };

        // "Giriş Yap" and "İlan Ver" show their labels when the top row can
        // hold them and fall back to bare icons when it cannot — which depends
        // on the language as much as on the screen. Measured rather than
        // guessed at a breakpoint.
        const headerRow = siteHeader.querySelector('.header-row');
        const fitHeaderLabels = () => {
            if (!headerRow) return;

            siteHeader.classList.add('header-labels-fit');
            if (headerRow.scrollWidth > headerRow.clientWidth + 1) {
                siteHeader.classList.remove('header-labels-fit');
            }
        };

        fitHeaderLabels();
        publishHeaderHeight();

        window.addEventListener('load', () => {
            // The web font changes every label's width, so measure again once
            // it has actually arrived.
            fitHeaderLabels();
            publishHeaderHeight();
        });

        window.addEventListener('resize', fitHeaderLabels);

        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(publishHeaderHeight).observe(siteHeader);
        } else {
            window.addEventListener('resize', publishHeaderHeight);
        }

        // Tuck the header away while scrolling down a long list on a phone and
        // bring it back on the first upward scroll. It never tucks while a menu
        // it owns is open, and never on desktop, where it stays pinned.
        if (!prefersReducedMotion) {
            let lastY = window.scrollY;
            let ticking = false;

            const updateHeaderTuck = () => {
                ticking = false;
                const y = Math.max(0, window.scrollY);
                const delta = y - lastY;

                if (Math.abs(delta) < 6) return;

                const menuOpen = document.querySelector('.dropdown-menu.show, .offcanvas.show, .modal.show');
                const headerHeight = siteHeader.offsetHeight;
                const shouldTuck = delta > 0 && y > headerHeight * 1.5 && !menuOpen;

                siteHeader.classList.toggle('header-tucked', shouldTuck);
                lastY = y;
            };

            window.addEventListener('scroll', () => {
                if (!ticking) {
                    ticking = true;
                    window.requestAnimationFrame(updateHeaderTuck);
                }
            }, { passive: true });
        }
    }

    // The rail scrolls horizontally below lg, so the entry a member is looking
    // at can start off-screen. Mark it and scroll it into view.
    const categoryRail = document.querySelector('.category-nav .navbar-nav');
    if (categoryRail) {
        const here = new URL(window.location.href);
        const currentCategory = here.searchParams.get('category');

        const activeLink = Array.from(categoryRail.querySelectorAll('.nav-link')).find(link => {
            const target = new URL(link.getAttribute('href'), window.location.origin);
            if (target.pathname !== here.pathname) return false;

            // /listings is shared by every category, so the category itself
            // decides; the plain pages match on their path alone.
            const targetCategory = target.searchParams.get('category');
            return targetCategory ? targetCategory === currentCategory : !currentCategory;
        });

        if (activeLink) {
            activeLink.classList.add('active', 'fw-bold');
            activeLink.setAttribute('aria-current', 'page');

            const railBox = categoryRail.getBoundingClientRect();
            const linkBox = activeLink.getBoundingClientRect();
            if (linkBox.right > railBox.right || linkBox.left < railBox.left) {
                categoryRail.scrollLeft = activeLink.offsetLeft - 16;
            }
        }

        // Two signals that add no furniture to the bar: a fade on whichever
        // side still has entries, and — once per visit — a short nudge, because
        // nothing says "this moves" as plainly as seeing it move.
        const publishRailEdges = () => {
            const max = categoryRail.scrollWidth - categoryRail.clientWidth;
            if (max <= 1) {
                categoryRail.removeAttribute('data-overflowing');
                return;
            }

            const start = categoryRail.scrollLeft > 1;
            const end = categoryRail.scrollLeft < max - 1;
            categoryRail.setAttribute('data-overflowing', start && end ? 'both' : (start ? 'start' : 'end'));
        };

        // Just under a screenful per press, so the entry at the edge stays on
        // screen and the reader keeps their place.
        const railWrapper = categoryRail.parentElement;
        if (railWrapper) {
            railWrapper.querySelectorAll('[data-rail-scroll]').forEach(button => {
                button.addEventListener('click', () => {
                    const direction = Number(button.getAttribute('data-rail-scroll')) || 1;
                    categoryRail.scrollBy({ left: direction * categoryRail.clientWidth * 0.7, behavior: 'smooth' });
                });
            });
        }

        publishRailEdges();
        categoryRail.addEventListener('scroll', publishRailEdges, { passive: true });
        window.addEventListener('resize', publishRailEdges);
        // The web font lands after DOMContentLoaded and changes how wide the
        // labels are, which moves the proportion the thumb is drawn from.
        window.addEventListener('load', publishRailEdges);

        // The nudge shifts the entries visually rather than actually scrolling
        // the rail: a smooth scroll that gets interrupted leaves the strip
        // parked a few pixels in, with the left fade stuck on and the first
        // category no longer lined up with the page gutter.
        const nudgeRail = () => {
            if (prefersReducedMotion) return;
            if (categoryRail.scrollLeft > 0) return; // already moved to the active category
            if (categoryRail.scrollWidth - categoryRail.clientWidth < 24) return;

            try {
                if (sessionStorage.getItem('cyp.railNudged')) return;
                sessionStorage.setItem('cyp.railNudged', '1');
            } catch (err) {
                // Private mode: nudge every time rather than not at all.
            }

            window.setTimeout(() => {
                categoryRail.classList.add('rail-nudge');
                window.setTimeout(() => categoryRail.classList.remove('rail-nudge'), 1000);
            }, 700);
        };

        nudgeRail();
    }

    const langSwitches = document.querySelectorAll('.lang-switch');
    langSwitches.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.currentTarget;
            const lang = target.getAttribute('data-lang');
            if (lang) {
                document.cookie = `lang=${lang}; path=/; max-age=31536000`;
                const url = new URL(window.location.href);
                url.searchParams.set('lang', lang);
                window.location.href = url.toString();
            }
        });
    });

    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        const themeIcon = document.getElementById('themeIcon');
        const themeColor = document.querySelector('meta[name="theme-color"]');
        const labels = {
            toDark: themeToggle.getAttribute('data-label-to-dark'),
            toLight: themeToggle.getAttribute('data-label-to-light')
        };

        themeToggle.addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-bs-theme', next);
            document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;

            if (themeColor) themeColor.setAttribute('content', next === 'dark' ? '#15181b' : '#ffffff');

            // The control always advertises the theme it would switch to next.
            if (themeIcon) {
                themeIcon.className = `fa-solid ${next === 'dark' ? 'fa-sun' : 'fa-moon'} text-primary`;
            }

            const label = next === 'dark' ? labels.toLight : labels.toDark;
            if (label) {
                themeToggle.setAttribute('aria-label', label);
                themeToggle.setAttribute('title', label);
            }
        });
    }

    const currencySwitches = document.querySelectorAll('.currency-switch');
    currencySwitches.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.currentTarget;
            const currency = target.getAttribute('data-currency');
            if (currency) {
                document.cookie = `currency=${currency}; path=/; max-age=31536000`;
                const url = new URL(window.location.href);
                url.searchParams.set('currency', currency);
                window.location.href = url.toString();
            }
        });
    });

    const favoriteBtns = document.querySelectorAll('.favorite-btn');
    favoriteBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const listingId = btn.getAttribute('data-id');
            if (!listingId) return;

            try {
                const res = await fetch(`/listings/${listingId}/favorite`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-Token': csrfToken
                    }
                });

                if (res.status === 401) {
                    showToast('Favorilere eklemek için lütfen giriş yapın.', 'danger');
                    setTimeout(() => {
                        window.location.href = '/auth/login';
                    }, 1200);
                    return;
                }

                if (res.status === 403) {
                    showToast('Güvenlik doğrulaması başarısız. Sayfayı yenileyin.', 'danger');
                    return;
                }

                const data = await res.json();
                if (data.success) {
                    const icon = btn.querySelector('i');
                    if (data.favorited) {
                        if (icon) {
                            icon.className = 'fa-solid fa-heart text-danger' + (icon.classList.contains('fs-6') ? ' fs-6' : '');
                        }
                        if (btn.classList.contains('btn-outline-primary')) {
                            btn.classList.remove('btn-outline-primary');
                            btn.classList.add('btn-danger', 'text-white');
                        }
                        showToast('İlan favorilere eklendi!', 'success');
                    } else {
                        if (icon) {
                            icon.className = 'fa-regular fa-heart text-muted' + (icon.classList.contains('fs-6') ? ' fs-6' : '');
                        }
                        if (btn.classList.contains('btn-danger')) {
                            btn.classList.remove('btn-danger', 'text-white');
                            btn.classList.add('btn-outline-primary');
                        }
                        showToast('İlan favorilerden çıkarıldı.', 'info');
                    }
                } else {
                    showToast(data.error || 'Bir hata oluştu.', 'danger');
                }
            } catch (err) {
                console.error('Favorite fetch error:', err);
                showToast('İşlem gerçekleşmedi. Lütfen bağlantınızı kontrol edin.', 'danger');
            }
        });
    });

    const shareBtns = document.querySelectorAll('.share-btn');
    shareBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const title = btn.getAttribute('data-title') || document.title;
            const url = window.location.href;

            const shareUrlInput = document.getElementById('shareUrlInput');
            if (shareUrlInput) shareUrlInput.value = url;

            const shareWa = document.getElementById('shareWhatsapp');
            if (shareWa) shareWa.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(title + ' ' + url)}`;

            const shareFb = document.getElementById('shareFacebook');
            if (shareFb) shareFb.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

            const shareTg = document.getElementById('shareTelegram');
            if (shareTg) shareTg.href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

            const shareTw = document.getElementById('shareTwitter');
            if (shareTw) shareTw.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

            if (navigator.share) {
                try {
                    await navigator.share({ title, url });
                    return;
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.log('Native share error, falling back to modal:', err);
                    } else {
                        return;
                    }
                }
            }

            const shareModalEl = document.getElementById('shareModal');
            if (shareModalEl && typeof bootstrap !== 'undefined') {
                const modal = new bootstrap.Modal(shareModalEl);
                modal.show();
            } else {
                navigator.clipboard.writeText(url).then(() => {
                    showToast('İlan bağlantısı panoya kopyalandı!', 'success');
                }).catch(() => {
                    showToast(url, 'info');
                });
            }
        });
    });

    const copyShareBtn = document.getElementById('copyShareLinkBtn');
    if (copyShareBtn) {
        copyShareBtn.addEventListener('click', () => {
            const input = document.getElementById('shareUrlInput');
            const url = input ? input.value : window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                showToast('İlan bağlantısı panoya kopyalandı!', 'success');
                const modalEl = document.getElementById('shareModal');
                if (modalEl && typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }
            });
        });
    }

    const forms = document.querySelectorAll('.needs-validation');
    Array.from(forms).forEach(form => {
        form.addEventListener('submit', event => {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        }, false);
    });

    function showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer') || createToastContainer();

        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-bg-${type} border-0 mb-2`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');

        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body fw-medium">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto shadow-none" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        toastContainer.appendChild(toastEl);
        const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
        toast.show();

        toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
        });
    }

    function createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3 z-3';
        document.body.appendChild(container);
        return container;
    }

    // Typewriter Search Placeholder Animation
    const searchInputs = document.querySelectorAll('.smart-search-input');
    if (searchInputs.length > 0 && !prefersReducedMotion) {
        searchInputs.forEach(input => {
            let rawPlaceholders = input.getAttribute('data-placeholders');
            let placeholders = [];
            try {
                if (rawPlaceholders) {
                    try { rawPlaceholders = decodeURIComponent(rawPlaceholders); } catch(err) {}
                    placeholders = JSON.parse(rawPlaceholders);
                }
            } catch (e) {
                const defaultPh = input.getAttribute('placeholder') || 'Ne arıyorsun?';
                placeholders = [defaultPh];
            }

            if (!Array.isArray(placeholders) || placeholders.length === 0) return;

            let currentIdx = 0;
            let charIdx = 0;
            let isDeleting = false;
            let rawPrefix = input.getAttribute('data-prefix') || "Ne arıyorsun? Örn: ";
            try { rawPrefix = decodeURIComponent(rawPrefix); } catch(e) {}
            const prefix = rawPrefix;

            // The animation used to type "Ne arıyorsun? Örn: " plus a 37-character
            // example into a box that holds 35 characters on a phone, so it always
            // ended mid-word against the right edge. Each line is now measured
            // against the input's real width first: the lead-in is dropped when it
            // does not leave room for the example, and an example longer than the
            // box is cut at a word boundary rather than mid-word.
            const measurer = document.createElement('canvas').getContext('2d');
            let lines = [];

            function fitToInput() {
                const styles = window.getComputedStyle(input);
                const inner = input.clientWidth
                    - parseFloat(styles.paddingLeft || 0)
                    - parseFloat(styles.paddingRight || 0);

                if (!(inner > 0)) return false;

                measurer.font = [styles.fontStyle, styles.fontWeight, styles.fontSize, styles.fontFamily].join(' ');
                const width = text => measurer.measureText(text).width;

                const trimToWidth = text => {
                    if (width(text) <= inner) return text;
                    const words = text.split(' ');
                    let out = '';
                    for (const word of words) {
                        const next = out ? out + ' ' + word : word;
                        if (width(next + '…') > inner) break;
                        out = next;
                    }
                    return (out || text.slice(0, 1)) + '…';
                };

                lines = placeholders.map(raw => {
                    const example = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
                    return width(prefix + example) <= inner
                        ? { lead: prefix, body: example }
                        : { lead: '', body: trimToWidth(example) };
                });

                return true;
            }

            fitToInput();
            window.addEventListener('resize', () => {
                if (fitToInput()) charIdx = Math.min(charIdx, lines[currentIdx].body.length);
            });

            function type() {
                // Do not animate if input is focused or has user typed text
                if (document.activeElement === input || input.value.trim() !== '') {
                    setTimeout(type, 1000);
                    return;
                }

                // The input is hidden at this breakpoint (the header carries one
                // for wide screens and one for narrow), so it has no width to
                // measure against yet.
                if (lines.length === 0 && !fitToInput()) {
                    setTimeout(type, 1000);
                    return;
                }

                const line = lines[currentIdx];
                const currentText = line.body;

                if (isDeleting) {
                    charIdx--;
                } else {
                    charIdx++;
                }

                const displayedText = line.lead + currentText.substring(0, charIdx);
                input.setAttribute('placeholder', displayedText);

                let typeSpeed = isDeleting ? 25 : 55;

                // `>=` rather than `===`: a resize mid-sentence can re-fit the
                // line to something shorter than the cursor has already reached.
                if (!isDeleting && charIdx >= currentText.length) {
                    typeSpeed = 2300; // Pause at full sentence
                    isDeleting = true;
                } else if (isDeleting && charIdx <= 0) {
                    charIdx = 0;
                    isDeleting = false;
                    currentIdx = (currentIdx + 1) % lines.length;
                    typeSpeed = 350; // Pause before typing next sentence
                }

                setTimeout(type, typeSpeed);
            }

            setTimeout(type, 600);
        });
    }
});

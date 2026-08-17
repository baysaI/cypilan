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

    // ==========================================
    // Enhanced Share & Instagram Story Generator
    // ==========================================
    const firstShareEl = document.querySelector('.share-btn, .direct-story-btn');
    let currentShareData = {
        title: firstShareEl ? (firstShareEl.getAttribute('data-title') || document.title) : document.title,
        url: firstShareEl ? (firstShareEl.getAttribute('data-url') || window.location.href) : window.location.href,
        price: firstShareEl ? (firstShareEl.getAttribute('data-price') || '') : '',
        city: firstShareEl ? (firstShareEl.getAttribute('data-city') || '') : '',
        category: firstShareEl ? (firstShareEl.getAttribute('data-category') || '') : '',
        image: firstShareEl ? (firstShareEl.getAttribute('data-image') || '') : ''
    };

    const shareBtns = document.querySelectorAll('.share-btn');
    shareBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const title = btn.getAttribute('data-title') || document.title;
            const price = btn.getAttribute('data-price') || '';
            const city = btn.getAttribute('data-city') || '';
            const category = btn.getAttribute('data-category') || '';
            const image = btn.getAttribute('data-image') || '';
            const url = btn.getAttribute('data-url') || window.location.href;

            currentShareData = { title, price, city, category, image, url };

            // Update preview in share modal
            const shareUrlInput = document.getElementById('shareUrlInput');
            if (shareUrlInput) shareUrlInput.value = url;

            const previewTitle = document.getElementById('sharePreviewTitle');
            if (previewTitle) previewTitle.textContent = title;

            const previewPrice = document.getElementById('sharePreviewPrice');
            if (previewPrice) {
                if (price) {
                    previewPrice.textContent = price;
                    previewPrice.style.display = 'inline-block';
                } else {
                    previewPrice.style.display = 'none';
                }
            }

            const previewCity = document.getElementById('sharePreviewCity');
            if (previewCity) previewCity.innerHTML = `<i class="fa-solid fa-location-dot me-1"></i>${city || 'Kıbrıs'}`;

            const previewImg = document.getElementById('sharePreviewImg');
            if (previewImg && image) previewImg.src = image;

            // Formatted WhatsApp message template
            let shareText = `🔥 *${title}*\n`;
            if (price) shareText += `💰 *Fiyat:* ${price}\n`;
            if (city) shareText += `📍 *Konum:* ${city}, KKTC\n`;
            shareText += `\n👉 İlan detaylarını incelemek için tıklayın:\n${url}\n\nCYPILAN • Kıbrıs'ın İlan Pazaryeri`;

            const shareWa = document.getElementById('shareWhatsapp');
            if (shareWa) shareWa.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

            const shareFb = document.getElementById('shareFacebook');
            if (shareFb) shareFb.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

            const shareTg = document.getElementById('shareTelegram');
            if (shareTg) shareTg.href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

            const shareTw = document.getElementById('shareTwitter');
            if (shareTw) shareTw.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

            // Open Share Modal directly
            const shareModalEl = document.getElementById('shareModal');
            if (shareModalEl && typeof bootstrap !== 'undefined') {
                const modal = bootstrap.Modal.getOrCreateInstance(shareModalEl);
                modal.show();
            }
        });
    });

    // Native Share Button inside modal
    const nativeShareBtn = document.getElementById('nativeShareBtn');
    if (nativeShareBtn) {
        nativeShareBtn.addEventListener('click', async () => {
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: currentShareData.title,
                        text: `CYPILAN'da İlan: ${currentShareData.title}`,
                        url: currentShareData.url
                    });
                } catch(e) {}
            } else {
                showToast('Tarayıcınız sistem paylaşımını desteklemiyor.', 'info');
            }
        });
    }

    // Copy Link Button
    const copyShareBtn = document.getElementById('copyShareLinkBtn');
    if (copyShareBtn) {
        copyShareBtn.addEventListener('click', () => {
            const input = document.getElementById('shareUrlInput');
            const url = input ? input.value : window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                showToast('İlan bağlantısı panoya kopyalandı!', 'success');
                copyShareBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i> Kopyalandı';
                setTimeout(() => {
                    copyShareBtn.innerHTML = '<i class="fa-regular fa-copy me-1"></i> Kopyala';
                }, 2000);
            }).catch(() => {
                showToast('Bağlantı kopyalanamadı.', 'error');
            });
        });
    }

    // Direct Story Buttons
    const directStoryBtns = document.querySelectorAll('.direct-story-btn');
    directStoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const title = btn.getAttribute('data-title') || document.title;
            const price = btn.getAttribute('data-price') || '';
            const city = btn.getAttribute('data-city') || '';
            const category = btn.getAttribute('data-category') || '';
            const image = btn.getAttribute('data-image') || '';
            const url = btn.getAttribute('data-url') || window.location.href;

            currentShareData = { title, price, city, category, image, url };

            const storyModalEl = document.getElementById('storyMakerModal');
            if (storyModalEl && typeof bootstrap !== 'undefined') {
                const stModal = bootstrap.Modal.getOrCreateInstance(storyModalEl);
                stModal.show();
            }
            renderStoryCard();
        });
    });

    // Story Maker Modal & Canvas Generator
    const openStoryMakerBtn = document.getElementById('openStoryMakerBtn');
    const storyCanvas = document.getElementById('storyCanvas');
    let generatedStoryBlob = null;

    if (openStoryMakerBtn && storyCanvas) {
        openStoryMakerBtn.addEventListener('click', () => {
            // Close share modal if open
            const shareModalEl = document.getElementById('shareModal');
            if (shareModalEl && typeof bootstrap !== 'undefined') {
                const sm = bootstrap.Modal.getInstance(shareModalEl);
                if (sm) sm.hide();
            }

            // Open Story Modal
            const storyModalEl = document.getElementById('storyMakerModal');
            if (storyModalEl && typeof bootstrap !== 'undefined') {
                const stModal = bootstrap.Modal.getOrCreateInstance(storyModalEl);
                stModal.show();
            }

            renderStoryCard();
        });
    }

    function renderStoryCard() {
        if (!storyCanvas) return;
        const ctx = storyCanvas.getContext('2d');
        if (!ctx) return;

        const W = 1080;
        const H = 1920;
        storyCanvas.width = W;
        storyCanvas.height = H;

        // Helper to draw rounded rectangle
        function roundRect(x, y, w, h, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.arcTo(x + w, y, x + w, y + radius, radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
            ctx.lineTo(x + radius, y + h);
            ctx.arcTo(x, y + h, x, y + h - radius, radius);
            ctx.lineTo(x, y + radius);
            ctx.arcTo(x, y, x + radius, y, radius);
            ctx.closePath();
        }

        // Draw complete canvas
        function drawCanvas(photoImg) {
            ctx.save();
            ctx.clearRect(0, 0, W, H);

            // 1. Background Gradient (Dark Luxury Theme)
            const bgGrad = ctx.createLinearGradient(0, 0, W, H);
            bgGrad.addColorStop(0, '#0a0f1d');
            bgGrad.addColorStop(0.5, '#0f172a');
            bgGrad.addColorStop(1, '#030712');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);

            // Ambient Decorative Glow Orbs
            const orb1 = ctx.createRadialGradient(W * 0.2, H * 0.15, 50, W * 0.2, H * 0.15, 450);
            orb1.addColorStop(0, 'rgba(14, 165, 233, 0.22)');
            orb1.addColorStop(1, 'rgba(14, 165, 233, 0)');
            ctx.fillStyle = orb1;
            ctx.fillRect(0, 0, W, H);

            const orb2 = ctx.createRadialGradient(W * 0.8, H * 0.7, 50, W * 0.8, H * 0.7, 500);
            orb2.addColorStop(0, 'rgba(234, 179, 8, 0.16)');
            orb2.addColorStop(1, 'rgba(234, 179, 8, 0)');
            ctx.fillStyle = orb2;
            ctx.fillRect(0, 0, W, H);

            // 2. Header Brand Section
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';

            // CYPILAN Logo Text
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 60px "Inter", "Segoe UI", sans-serif';
            ctx.fillText('CYPILAN', W / 2, 140);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '700 24px "Inter", "Segoe UI", sans-serif';
            ctx.fillText('KIBRIS\'IN İLAN PAZARYERİ • cypilan.com', W / 2, 185);

            // 3. Photo Card Container
            const imgBoxX = 90;
            const imgBoxY = 230;
            const imgBoxW = 900;
            const imgBoxH = 840;

            ctx.save();
            roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 36);
            ctx.clip();

            if (photoImg && photoImg.width > 0 && photoImg.height > 0) {
                // Object fit cover
                const imgAspect = photoImg.width / photoImg.height;
                const boxAspect = imgBoxW / imgBoxH;
                let drawW, drawH, drawX, drawY;

                if (imgAspect > boxAspect) {
                    drawH = imgBoxH;
                    drawW = imgBoxH * imgAspect;
                    drawX = imgBoxX - (drawW - imgBoxW) / 2;
                    drawY = imgBoxY;
                } else {
                    drawW = imgBoxW;
                    drawH = imgBoxW / imgAspect;
                    drawX = imgBoxX;
                    drawY = imgBoxY - (drawH - imgBoxH) / 2;
                }
                ctx.drawImage(photoImg, drawX, drawY, drawW, drawH);

                // Subtle vignette on photo
                const photoGrad = ctx.createLinearGradient(0, imgBoxY + imgBoxH - 260, 0, imgBoxY + imgBoxH);
                photoGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
                photoGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
                ctx.fillStyle = photoGrad;
                ctx.fillRect(imgBoxX, imgBoxY + imgBoxH - 260, imgBoxW, 260);
            } else {
                // Fallback elegant box
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH);

                ctx.fillStyle = '#64748b';
                ctx.font = '600 32px "Inter", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('📷 CYPILAN İlan Görseli', W / 2, imgBoxY + imgBoxH / 2);
            }
            ctx.restore();

            // Photo Card Border
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 3;
            roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 36);
            ctx.stroke();
            ctx.restore();

            // Top-left badge over photo
            ctx.save();
            ctx.fillStyle = '#0284c7';
            roundRect(imgBoxX + 24, imgBoxY + 24, 230, 52, 26);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 24px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('✨ GÜNCEL İLAN', imgBoxX + 139, imgBoxY + 59);
            ctx.restore();

            // 4. Details Section (Strictly Structured)
            const detailStartY = imgBoxY + imgBoxH + 45; // 1115
            let currentX = imgBoxX; // 90

            // Row 1: Price Badge + City / Category Badges
            if (currentShareData.price) {
                ctx.save();
                ctx.font = '900 52px "Inter", sans-serif';
                const priceText = currentShareData.price;
                const priceW = ctx.measureText(priceText).width + 60;
                const priceH = 84;

                const pGrad = ctx.createLinearGradient(currentX, detailStartY, currentX + priceW, detailStartY + priceH);
                pGrad.addColorStop(0, '#f59e0b');
                pGrad.addColorStop(1, '#d97706');
                ctx.fillStyle = pGrad;
                roundRect(currentX, detailStartY, priceW, priceH, 22);
                ctx.fill();

                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'center';
                ctx.fillText(priceText, currentX + priceW / 2, detailStartY + 59);
                ctx.restore();

                currentX += priceW + 16;
            }

            // Location Badge (City)
            if (currentShareData.city) {
                ctx.save();
                const cityText = `📍 ${currentShareData.city}, KKTC`;
                ctx.font = '600 28px "Inter", sans-serif';
                const cityW = ctx.measureText(cityText).width + 40;
                const badgeH = 84;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
                roundRect(currentX, detailStartY, cityW, badgeH, 22);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(cityText, currentX + cityW / 2, detailStartY + 53);
                ctx.restore();

                currentX += cityW + 16;
            }

            // Category Badge
            if (currentShareData.category && currentX < (W - 250)) {
                ctx.save();
                const catText = `🏷️ ${currentShareData.category}`;
                ctx.font = '600 28px "Inter", sans-serif';
                const catW = ctx.measureText(catText).width + 40;
                const badgeH = 84;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
                roundRect(currentX, detailStartY, catW, badgeH, 22);
                ctx.fill();

                ctx.fillStyle = '#e2e8f0';
                ctx.textAlign = 'center';
                ctx.fillText(catText, currentX + catW / 2, detailStartY + 53);
                ctx.restore();
            }

            // Row 2: Listing Title (Multi-line, properly positioned below badges)
            const titleY = detailStartY + 155; // 1270
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.font = '800 48px "Inter", "Segoe UI", sans-serif';
            ctx.textAlign = 'left';

            const maxTitleW = imgBoxW;
            const words = (currentShareData.title || '').split(' ');
            let line = '';
            let curY = titleY;
            let linesCount = 0;

            for (let i = 0; i < words.length; i++) {
                const testLine = line + words[i] + ' ';
                const testWidth = ctx.measureText(testLine).width;
                if (testWidth > maxTitleW && i > 0) {
                    ctx.fillText(line.trim(), imgBoxX, curY);
                    line = words[i] + ' ';
                    curY += 64;
                    linesCount++;
                    if (linesCount >= 3 && i < words.length - 1) {
                        line = line + '...';
                        break;
                    }
                } else {
                    line = testLine;
                }
            }
            if (line) ctx.fillText(line.trim(), imgBoxX, curY);
            ctx.restore();

            // 5. Footer Call To Action Box
            const footY = H - 190;
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.lineWidth = 2.5;
            roundRect(imgBoxX, footY, imgBoxW, 110, 30);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.font = '700 32px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('👉 Detaylar & İletişim İçin: cypilan.com', W / 2, footY + 68);
            ctx.restore();

            ctx.restore();

            // Generate blob
            try {
                storyCanvas.toBlob((blob) => {
                    generatedStoryBlob = blob;
                }, 'image/png');
            } catch(e) {}
        }

        // STEP 1: Immediately render synchronous base frame (0ms delay)
        drawCanvas(null);

        // STEP 2: Asynchronously load image and redraw
        if (currentShareData.image) {
            const img = new Image();
            // If image is local relative path, do not set crossOrigin
            const isExternal = currentShareData.image.startsWith('http://') || currentShareData.image.startsWith('https://');
            if (isExternal) {
                img.crossOrigin = 'anonymous';
            }

            img.onload = () => {
                drawCanvas(img);
            };

            img.onerror = () => {
                if (isExternal && img.crossOrigin) {
                    const fallbackImg = new Image();
                    fallbackImg.onload = () => drawCanvas(fallbackImg);
                    fallbackImg.onerror = () => drawCanvas(null);
                    fallbackImg.src = currentShareData.image;
                } else {
                    drawCanvas(null);
                }
            };

            img.src = currentShareData.image;
        }
    }

    // Auto-render when story modal opens
    const storyModalEl = document.getElementById('storyMakerModal');
    if (storyModalEl) {
        storyModalEl.addEventListener('shown.bs.modal', () => {
            renderStoryCard();
        });
    }

    // Download Story Button
    const downloadStoryBtn = document.getElementById('downloadStoryBtn');
    if (downloadStoryBtn && storyCanvas) {
        downloadStoryBtn.addEventListener('click', () => {
            try {
                if (storyCanvas.width === 0 || storyCanvas.height === 0) {
                    renderStoryCard();
                }

                // If blob is available use object URL, else data URL
                const triggerDownload = (url) => {
                    const link = document.createElement('a');
                    link.download = `cypilan-hikaye-${Date.now()}.png`;
                    link.href = url;
                    document.body.appendChild(link);
                    link.click();
                    setTimeout(() => {
                        document.body.removeChild(link);
                    }, 100);
                    showToast('Hikaye görseli başarıyla indirildi!', 'success');
                };

                storyCanvas.toBlob((blob) => {
                    if (blob) {
                        const blobUrl = URL.createObjectURL(blob);
                        triggerDownload(blobUrl);
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                    } else {
                        const dataUrl = storyCanvas.toDataURL('image/png');
                        triggerDownload(dataUrl);
                    }
                }, 'image/png');
            } catch(e) {
                try {
                    const dataUrl = storyCanvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = `cypilan-hikaye-${Date.now()}.png`;
                    link.href = dataUrl;
                    document.body.appendChild(link);
                    link.click();
                    setTimeout(() => document.body.removeChild(link), 100);
                    showToast('Hikaye görseli başarıyla indirildi!', 'success');
                } catch(err) {
                    showToast('Görsel indirilirken bir hata oluştu.', 'error');
                }
            }
        });
    }

    // Native Share Story Button
    const shareStoryNativeBtn = document.getElementById('shareStoryNativeBtn');
    if (shareStoryNativeBtn && storyCanvas) {
        shareStoryNativeBtn.addEventListener('click', async () => {
            try {
                storyCanvas.toBlob(async (blob) => {
                    if (!blob) {
                        showToast('Görsel henüz hazırlanıyor, lütfen tekrar deneyin.', 'error');
                        return;
                    }
                    const file = new File([blob], `cypilan-ilan-${Date.now()}.png`, { type: 'image/png' });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: currentShareData.title,
                            text: `CYPILAN İlan: ${currentShareData.title}\n${currentShareData.url}`
                        });
                    } else if (navigator.share) {
                        await navigator.share({
                            title: currentShareData.title,
                            text: `CYPILAN İlan: ${currentShareData.title}`,
                            url: currentShareData.url
                        });
                    } else {
                        downloadStoryBtn.click();
                    }
                }, 'image/png');
            } catch(err) {
                if (err.name !== 'AbortError') {
                    showToast('Paylaşım başlatılamadı.', 'error');
                }
            }
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
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.cssText = 'top: 75px !important; right: 20px !important; z-index: 1095 !important;';
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

    // -------------------------------------------------------------
    // 1. Leaflet Map Initialization for Listing Detail
    // -------------------------------------------------------------
    const mapModal = document.getElementById('listingMapModal');
    const mapContainer = document.getElementById('listingMapContainer');
    let leafletMapInstance = null;

    if (mapModal && mapContainer && typeof L !== 'undefined') {
        mapModal.addEventListener('shown.bs.modal', () => {
            const lat = parseFloat(mapContainer.getAttribute('data-lat')) || 35.1856;
            const lng = parseFloat(mapContainer.getAttribute('data-lng')) || 33.3823;
            const zoom = parseInt(mapContainer.getAttribute('data-zoom'), 10) || 13;
            const title = mapContainer.getAttribute('data-title') || '';
            const city = mapContainer.getAttribute('data-city') || '';
            const district = mapContainer.getAttribute('data-district') || '';
            const isExact = mapContainer.getAttribute('data-exact') === '1';

            if (!leafletMapInstance) {
                leafletMapInstance = L.map('listingMapContainer').setView([lat, lng], zoom);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
                }).addTo(leafletMapInstance);

                const marker = L.marker([lat, lng]).addTo(leafletMapInstance);
                const popupContent = `
                    <div style="font-family: inherit; min-width: 150px;">
                        <strong style="font-size: 0.9rem; display: block; margin-bottom: 4px;">${title}</strong>
                        <span style="font-size: 0.8rem; color: #6c757d;">📍 ${city}${district ? ' / ' + district : ''}</span>
                        ${!isExact ? '<div style="font-size: 0.72rem; color: #e67e22; margin-top: 4px;">(Yaklaşık İlçe/Şehir Konumu)</div>' : ''}
                    </div>
                `;
                marker.bindPopup(popupContent).openPopup();
            } else {
                leafletMapInstance.invalidateSize();
                leafletMapInstance.setView([lat, lng], zoom);
            }
        });
    }

    // -------------------------------------------------------------
    // 2. Quick Offer Modal Calculations & Form Presets
    // -------------------------------------------------------------
    const offerPresetBtns = document.querySelectorAll('.cyp-offer-preset-btn');
    const offerAmountInput = document.getElementById('offerAmountInput');
    if (offerPresetBtns.length > 0 && offerAmountInput) {
        offerPresetBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                offerPresetBtns.forEach(b => b.classList.remove('active', 'btn-primary', 'text-white'));
                this.classList.add('active', 'btn-primary', 'text-white');
                const val = this.getAttribute('data-val');
                if (val) offerAmountInput.value = val;
            });
        });
    }

    // -------------------------------------------------------------
    // 3. Price Alert Toggle & Modal
    // -------------------------------------------------------------
    const priceAlertBtns = document.querySelectorAll('.price-alert-btn');
    const priceAlertModalEl = document.getElementById('priceAlertModal');
    const alertTypeAny = document.getElementById('alertTypeAny');
    const alertTypeTarget = document.getElementById('alertTypeTarget');
    const targetPriceInputWrapper = document.getElementById('targetPriceInputWrapper');
    const alertTargetPriceInput = document.getElementById('alertTargetPriceInput');
    const priceAlertForm = document.getElementById('priceAlertForm');

    if (alertTypeAny && alertTypeTarget && targetPriceInputWrapper) {
        alertTypeAny.addEventListener('change', () => {
            if (alertTypeAny.checked) {
                targetPriceInputWrapper.classList.add('d-none');
                if (alertTargetPriceInput) alertTargetPriceInput.value = '';
            }
        });
        alertTypeTarget.addEventListener('change', () => {
            if (alertTypeTarget.checked) {
                targetPriceInputWrapper.classList.remove('d-none');
                if (alertTargetPriceInput) alertTargetPriceInput.focus();
            }
        });
    }

    if (priceAlertBtns.length > 0) {
        priceAlertBtns.forEach(btn => {
            btn.addEventListener('click', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                const listingId = this.getAttribute('data-id');
                if (!listingId) return;

                const isAlreadyActive = this.classList.contains('active');

                // If not active and modal exists on page, open modal to configure target price
                if (!isAlreadyActive && priceAlertModalEl && typeof bootstrap !== 'undefined') {
                    const bsModal = bootstrap.Modal.getInstance(priceAlertModalEl) || new bootstrap.Modal(priceAlertModalEl);
                    bsModal.show();
                    return;
                }

                // If already active or no modal, toggle directly
                try {
                    const res = await fetch(`/listings/${listingId}/price-alert`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken,
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ _csrf: csrfToken })
                    });

                    if (res.status === 401) {
                        showToast('Fiyat alarmı kurmak için lütfen giriş yapın.', 'info');
                        setTimeout(() => {
                            window.location.href = '/auth/login';
                        }, 1200);
                        return;
                    }

                    const data = await res.json();
                    if (data.success) {
                        if (data.active) {
                            this.classList.add('active', 'btn-warning', 'text-dark');
                            this.classList.remove('btn-outline-warning');
                            showToast(data.message || 'Fiyat alarmı kuruldu!', 'success');
                        } else {
                            this.classList.remove('active', 'btn-warning', 'text-dark');
                            this.classList.add('btn-outline-warning');
                            showToast(data.message || 'Fiyat alarmı kaldırıldı.', 'info');
                            const cardCol = this.closest('.col');
                            if (cardCol && window.location.pathname.includes('/alarmlar')) {
                                cardCol.style.transition = 'all 0.3s ease';
                                cardCol.style.opacity = '0';
                                cardCol.style.transform = 'scale(0.9)';
                                setTimeout(() => cardCol.remove(), 300);
                            }
                        }
                    } else {
                        showToast(data.error || 'İşlem gerçekleştirilemedi.', 'danger');
                    }
                } catch (err) {
                    console.error('Price alert toggle error:', err);
                    showToast('Bağlantı hatası oluştu.', 'danger');
                }
            });
        });
    }

    if (priceAlertForm) {
        priceAlertForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const listingIdInput = this.querySelector('input[name="listing_id"]');
            const listingId = listingIdInput ? listingIdInput.value : '';
            if (!listingId) return;

            let targetPrice = null;
            if (alertTypeTarget && alertTypeTarget.checked && alertTargetPriceInput) {
                targetPrice = alertTargetPriceInput.value ? parseFloat(alertTargetPriceInput.value) : null;
            }

            try {
                const res = await fetch(`/listings/${listingId}/price-alert`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ _csrf: csrfToken, target_price: targetPrice })
                });

                if (res.status === 401) {
                    showToast('Fiyat alarmı kurmak için lütfen giriş yapın.', 'info');
                    setTimeout(() => {
                        window.location.href = '/auth/login';
                    }, 1200);
                    return;
                }

                const data = await res.json();
                if (data.success) {
                    document.querySelectorAll(`.price-alert-btn[data-id="${listingId}"]`).forEach(btn => {
                        btn.classList.add('active', 'btn-warning', 'text-dark');
                        btn.classList.remove('btn-outline-warning');
                    });
                    if (priceAlertModalEl && typeof bootstrap !== 'undefined') {
                        const bsModal = bootstrap.Modal.getInstance(priceAlertModalEl);
                        if (bsModal) bsModal.hide();
                    }
                    showToast(data.message || 'Fiyat alarmı kuruldu! Fiyat düştüğünde size bildireceğiz.', 'success');
                } else {
                    showToast(data.error || 'İşlem gerçekleştirilemedi.', 'danger');
                }
            } catch (err) {
                console.error('Save price alert error:', err);
                showToast('Bağlantı hatası oluştu.', 'danger');
            }
        });
    }

    // -------------------------------------------------------------
    // 4. Listing Comparison Manager
    // -------------------------------------------------------------
    const COMPARE_STORAGE_KEY = 'cyp_compare_list';
    const MAX_COMPARE = 4;

    function getStoredCompareListings() {
        try {
            const raw = localStorage.getItem(COMPARE_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveStoredCompareListings(list) {
        try {
            localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(list));
        } catch (e) {}
    }

    function updateCompareUI() {
        const list = getStoredCompareListings();
        const drawer = document.getElementById('compareFloatingDrawer');
        const countSpan = document.getElementById('compareCount');
        const thumbsContainer = document.getElementById('compareThumbnails');
        const goToBtn = document.getElementById('goToCompareBtn');

        document.querySelectorAll('.compare-toggle-btn').forEach(btn => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            const isSelected = list.some(item => item.id === id);
            if (isSelected) {
                btn.classList.add('active', 'btn-primary', 'text-white');
                btn.classList.remove('btn-outline-secondary', 'btn-light');
            } else {
                btn.classList.remove('active', 'btn-primary', 'text-white');
                if (btn.closest('.listing-card')) {
                    btn.classList.add('btn-light');
                } else {
                    btn.classList.add('btn-outline-secondary');
                }
            }
        });

        if (drawer && countSpan && thumbsContainer && goToBtn) {
            if (list.length > 0 && !window.location.pathname.startsWith('/listings/compare')) {
                drawer.classList.remove('d-none');
                countSpan.textContent = list.length;
                thumbsContainer.innerHTML = list.map(item => `
                    <img src="${item.image || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800'}" 
                         style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover; border: 1px solid #dee2e6;" 
                         alt="${item.title || ''}" title="${item.title || ''}">
                `).join('');
                const ids = list.map(item => item.id).join(',');
                goToBtn.href = `/listings/compare?ids=${ids}`;
            } else {
                drawer.classList.add('d-none');
            }
        }
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.compare-toggle-btn');
        if (!btn) return;
        e.preventDefault();

        const id = parseInt(btn.getAttribute('data-id'), 10);
        const title = btn.getAttribute('data-title') || '';
        const image = btn.getAttribute('data-image') || '';
        const price = btn.getAttribute('data-price') || '';
        const currency = btn.getAttribute('data-currency') || 'TRY';

        if (!id) return;

        let list = getStoredCompareListings();
        const existingIdx = list.findIndex(item => item.id === id);

        if (existingIdx > -1) {
            list.splice(existingIdx, 1);
            showToast('İlan karşılaştırma listesinden çıkarıldı.', 'info');
        } else {
            if (list.length >= MAX_COMPARE) {
                showToast(`En fazla ${MAX_COMPARE} ilan karşılaştırabilirsiniz.`, 'warning');
                return;
            }
            list.push({ id, title, image, price, currency });
            showToast('İlan karşılaştırma listesine eklendi!', 'success');
        }

        saveStoredCompareListings(list);
        updateCompareUI();
    });

    const clearDrawerBtn = document.getElementById('clearCompareDrawerBtn');
    if (clearDrawerBtn) {
        clearDrawerBtn.addEventListener('click', () => {
            saveStoredCompareListings([]);
            updateCompareUI();
        });
    }

    const clearAllCompareBtn = document.getElementById('clearAllCompareBtn');
    if (clearAllCompareBtn) {
        clearAllCompareBtn.addEventListener('click', () => {
            saveStoredCompareListings([]);
            window.location.href = '/listings/compare';
        });
    }

    document.querySelectorAll('.remove-compare-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            let list = getStoredCompareListings();
            list = list.filter(item => item.id !== id);
            saveStoredCompareListings(list);
            const remainingIds = list.map(item => item.id).join(',');
            window.location.href = remainingIds ? `/listings/compare?ids=${remainingIds}` : '/listings/compare';
        });
    });

    const highlightDiffsToggle = document.getElementById('highlightDiffsToggle');
    if (highlightDiffsToggle) {
        highlightDiffsToggle.addEventListener('change', function() {
            const rows = document.querySelectorAll('.compare-row');
            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('.compare-cell'));
                if (cells.length > 1) {
                    const firstVal = cells[0].textContent.trim();
                    const isDiff = cells.some(c => c.textContent.trim() !== firstVal);
                    if (this.checked && isDiff) {
                        row.classList.add('table-warning');
                    } else {
                        row.classList.remove('table-warning');
                    }
                }
            });
        });
    }

    updateCompareUI();
});

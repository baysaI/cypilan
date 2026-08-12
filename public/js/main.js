document.addEventListener('DOMContentLoaded', () => {
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

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
});

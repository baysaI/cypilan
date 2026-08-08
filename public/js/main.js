document.addEventListener('DOMContentLoaded', () => {
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
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const icon = btn.querySelector('i');
            if(icon.classList.contains('fa-regular')) {
                icon.classList.remove('fa-regular', 'text-muted');
                icon.classList.add('fa-solid', 'text-danger');
                showToast('İlan favorilere eklendi!', 'success');
            } else {
                icon.classList.remove('fa-solid', 'text-danger');
                icon.classList.add('fa-regular', 'text-muted');
                showToast('İlan favorilerden çıkarıldı.', 'info');
            }
        });
    });

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

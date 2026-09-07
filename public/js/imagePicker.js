// İlan formlarındaki fotoğraf seçici.
//
// Yeni ilan ve düzenleme formları aynı işi iki ayrı kopyada yapıyordu ve ikisi
// de aynı şeyi yapamıyordu: seçilen fotoğrafların sırasını değiştirmek. Sıra
// önemsiz bir ayrıntı değil - ilk fotoğraf ilanın kapağı oluyor. Listelerde,
// aramada, haritada ve paylaşımda görünen tek görsel o. Satıcı yanlış sırada
// seçtiyse tek çaresi hepsini silip baştan seçmekti.
//
// Sıra yalnızca formda tutuluyor. Gönderilirken input.files'a aynı sırayla
// yazılıyor; sunucuda gelen sıra zaten sort_order oluyor ve ilk kayıt
// is_primary işaretleniyor, yani arka tarafta değiştirilecek bir şey yok.
(function () {
    'use strict';

    const DEFAULT_MAX_FILES = 20;
    const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

    window.setupImagePicker = function (options) {
        const dropArea = options.dropArea;
        const fileInput = options.fileInput;
        const previewContainer = options.previewContainer;
        if (!dropArea || !fileInput || !previewContainer) return null;

        const maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
        const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
        const labels = options.labels || {};
        // Sıranın ne işe yaradığını anlatan satır. Fotoğraf seçilmeden önce
        // anlamsız, o yüzden ilk seçimle beraber görünüyor.
        const hint = options.hint || null;

        let files = [];
        let urls = [];
        let dragIndex = null;

        // ---- Dosya kabulü ---------------------------------------------------

        const isImage = (file) =>
            (file.type && file.type.indexOf('image/') === 0) || /\.(jpe?g|png|webp)$/i.test(file.name);

        const alreadyPicked = (file) =>
            files.some((f) => f.name === file.name && f.size === file.size);

        const addFiles = (incoming) => {
            const list = Array.prototype.slice.call(incoming);

            for (let i = 0; i < list.length; i++) {
                if (files.length >= maxFiles) {
                    window.alert(labels.tooMany || '');
                    break;
                }

                const file = list[i];
                if (!isImage(file)) {
                    window.alert((labels.badType || '') + ' ' + file.name);
                    continue;
                }
                if (file.size > maxBytes) {
                    window.alert((labels.tooBig || '') + ' ' + file.name);
                    continue;
                }
                if (!alreadyPicked(file)) files.push(file);
            }

            sync();
        };

        // ---- Form ile eşitleme ----------------------------------------------

        const sync = () => {
            try {
                if (window.DataTransfer) {
                    const dt = new DataTransfer();
                    files.forEach((file) => dt.items.add(file));
                    fileInput.files = dt.files;
                }
            } catch (err) {
                // DataTransfer'ı olmayan bir tarayıcıda sıralama gönderilemez
                // ama seçim çalışmaya devam eder.
                console.warn('DataTransfer sync notice:', err);
            }

            render();

            // Vitrin önizlemesi formu dinliyor. Sıra değişince kapak fotoğrafı
            // da değiştiği için önizlemenin bunu görmesi gerekiyor.
            previewContainer.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const move = (from, to) => {
            if (from === to || to < 0 || to >= files.length) return;
            const moved = files.splice(from, 1)[0];
            files.splice(to, 0, moved);
            sync();
        };

        const removeAt = (index) => {
            files.splice(index, 1);
            sync();
        };

        // ---- Çizim ----------------------------------------------------------

        const releaseUrls = () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
            urls = [];
        };

        const badgeFor = (index) => index === 0
            ? '<span class="badge text-bg-primary position-absolute top-0 start-0 m-2 rounded-pill shadow-sm" style="z-index: 5;">'
                + '<i class="fa-solid fa-star me-1"></i>' + (labels.cover || '') + '</span>'
            : '<span class="badge text-bg-dark bg-opacity-75 position-absolute top-0 start-0 m-2 rounded-pill shadow-sm" style="z-index: 5;">'
                + (index + 1) + '</span>';

        const moveButton = (direction, label, icon, disabled) =>
            '<button type="button" class="btn btn-light btn-sm rounded-circle d-flex align-items-center justify-content-center p-0 shadow-sm cyp-image-move"'
            + ' data-direction="' + direction + '" style="width: 30px; height: 30px;"'
            + ' aria-label="' + label + '" title="' + label + '"' + (disabled ? ' disabled' : '') + '>'
            + '<i class="fa-solid ' + icon + '"></i></button>';

        const render = () => {
            releaseUrls();
            previewContainer.innerHTML = '';

            // Bootstrap'in display kurallari !important tasiyor, bu yuzden
            // gizleme 'hidden' ozniteligiyle degil d-none ile yapiliyor.
            if (hint) hint.classList.toggle('d-none', files.length === 0);

            files.forEach((file, index) => {
                const url = URL.createObjectURL(file);
                urls.push(url);

                const tile = document.createElement('div');
                tile.className = 'col-6 col-sm-4 col-md-3';
                // Sürükleme faresi olan için; dokunmatikte tarayıcı bunu
                // başlatmıyor, orada oklar iş görüyor.
                tile.draggable = files.length > 1;

                tile.innerHTML =
                    '<div class="card border-0 shadow-sm rounded-4 overflow-hidden position-relative" style="padding-top: 75%;">'
                    + '<img src="' + url + '" class="position-absolute top-0 start-0 w-100 h-100 object-fit-cover" alt="">'
                    + badgeFor(index)
                    + '<button type="button" class="btn btn-danger btn-sm position-absolute top-0 end-0 m-2 rounded-circle d-flex align-items-center justify-content-center p-0 cyp-image-remove shadow-sm"'
                    + ' style="width: 28px; height: 28px; z-index: 10;" aria-label="' + (labels.remove || '') + '" title="' + (labels.remove || '') + '">'
                    + '<i class="fa-solid fa-xmark fs-6"></i></button>'
                    + (files.length > 1
                        ? '<div class="position-absolute bottom-0 start-0 end-0 d-flex justify-content-between p-2" style="z-index: 10;">'
                            + moveButton(-1, labels.moveEarlier || '', 'fa-chevron-left', index === 0)
                            + moveButton(1, labels.moveLater || '', 'fa-chevron-right', index === files.length - 1)
                            + '</div>'
                        : '')
                    + '</div>';

                previewContainer.appendChild(tile);

                tile.querySelector('.cyp-image-remove').addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    removeAt(index);
                });

                tile.querySelectorAll('.cyp-image-move').forEach((button) => {
                    button.addEventListener('click', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        move(index, index + Number(button.dataset.direction));
                    });
                });

                tile.addEventListener('dragstart', function (event) {
                    dragIndex = index;
                    tile.classList.add('opacity-50');
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move';
                        // Firefox veri konmadan sürüklemeyi başlatmıyor.
                        event.dataTransfer.setData('text/plain', String(index));
                    }
                });

                tile.addEventListener('dragend', function () {
                    tile.classList.remove('opacity-50');
                    dragIndex = null;
                });

                tile.addEventListener('dragover', function (event) {
                    if (dragIndex === null) return;
                    event.preventDefault();
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                });

                tile.addEventListener('drop', function (event) {
                    if (dragIndex === null) return;
                    event.preventDefault();
                    event.stopPropagation();
                    move(dragIndex, index);
                });
            });
        };

        // ---- Bağlantılar ----------------------------------------------------

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((name) => {
            window.addEventListener(name, function (event) {
                // Tarayıcının dosyayı sekmede açmasını engelliyor. Karo
                // sürüklemesi bu noktaya gelmeden kendi drop'unda duruyor.
                event.preventDefault();
            }, false);
        });

        ['dragenter', 'dragover'].forEach((name) => {
            dropArea.addEventListener(name, function () {
                if (dragIndex !== null) return;
                dropArea.classList.add('border-accent', 'bg-primary-light');
            }, false);
        });

        ['dragleave', 'drop'].forEach((name) => {
            dropArea.addEventListener(name, function () {
                dropArea.classList.remove('border-accent', 'bg-primary-light');
            }, false);
        });

        dropArea.addEventListener('drop', function (event) {
            // Karo sürükleniyorsa bu bir dosya bırakma değil, yeniden sıralama.
            if (dragIndex !== null) return;
            if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
                addFiles(event.dataTransfer.files);
            }
        }, false);

        // Aynı dosya ikinci kez seçilirse 'change' yine tetiklensin diye.
        dropArea.addEventListener('click', function () {
            fileInput.value = '';
        });

        fileInput.addEventListener('change', function () {
            if (this.files && this.files.length > 0) addFiles(this.files);
        });

        // Gönderimden hemen önce bir kez daha: kullanıcı arada sırayı
        // değiştirmiş olabilir ve giden şey input.files.
        const form = fileInput.form;
        if (form) {
            form.addEventListener('submit', function () {
                try {
                    if (window.DataTransfer && files.length > 0) {
                        const dt = new DataTransfer();
                        files.forEach((file) => dt.items.add(file));
                        fileInput.files = dt.files;
                    }
                } catch (err) {
                    console.warn('Submit sync notice:', err);
                }
            });
        }

        return {
            count: () => files.length,
            clear: () => { files = []; sync(); }
        };
    };
})();

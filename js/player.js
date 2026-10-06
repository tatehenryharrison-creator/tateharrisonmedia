/* Site-wide persistent audio player.
   Keeps "playing" across page navigations by saving playback state
   (episode id, src, title, thumbnail, current time) to localStorage,
   then resuming it on the next page's load. A full page navigation
   always stops audio for a moment — there is no way around that on a
   plain multi-page site without turning it into a single-page app —
   but this makes it pick back up at the same position automatically.

   Browsers only auto-resume audio-with-sound after a page load if the
   visitor already interacted with the site; if a browser blocks it,
   the mini-player still appears paused at the right spot, ready for
   one click to continue. */
(function () {
    var STORAGE_KEY = 'thm_player_state_v1';

    var audio = document.getElementById('sitePlayerAudio');
    var player = document.getElementById('miniPlayer');
    if (!audio || !player) return;

    var thumbEl = document.getElementById('miniPlayerThumb');
    var titleEl = document.getElementById('miniPlayerTitle');
    var playPauseBtn = document.getElementById('miniPlayerPlayPause');
    var progressBar = document.getElementById('miniPlayerProgress');
    var progressFill = document.getElementById('miniPlayerProgressFill');
    var closeBtn = document.getElementById('miniPlayerClose');

    var current = readState();

    function readState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeState() {
        try {
            if (current) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch (e) { /* localStorage unavailable — player still works for this page load */ }
    }

    function showPlayer() {
        player.classList.add('is-visible');
        player.setAttribute('aria-hidden', 'false');
        document.body.classList.add('player-active');
    }

    function hidePlayer() {
        player.classList.remove('is-visible');
        player.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('player-active');
    }

    function setPlayingClass(isPlaying) {
        player.classList.toggle('is-playing', !!isPlaying);
    }

    function syncPlayButtons() {
        var buttons = document.querySelectorAll('.episode-play-btn');
        for (var i = 0; i < buttons.length; i++) {
            var isThis = !!(current && current.id && buttons[i].getAttribute('data-episode-id') === current.id);
            buttons[i].classList.toggle('is-playing', isThis && !!current.playing);
        }
    }

    function updateMiniPlayer() {
        if (!current) {
            hidePlayer();
            return;
        }
        titleEl.textContent = current.title || '';
        thumbEl.src = current.thumb || '';
        thumbEl.alt = current.title ? current.title + ' thumbnail' : '';
        showPlayer();
        setPlayingClass(current.playing);
        syncPlayButtons();
    }

    function loadAndPlay(data) {
        var isSameEpisode = current && current.id === data.id;
        var resumeTime = isSameEpisode ? current.time : 0;

        current = {
            id: data.id,
            src: data.src,
            title: data.title,
            thumb: data.thumb,
            time: resumeTime,
            playing: true
        };

        if (!isSameEpisode || audio.getAttribute('src') !== data.src) {
            audio.src = data.src;
        }
        audio.currentTime = resumeTime || 0;
        audio.play().catch(function () { /* needs a user gesture — this click counts as one, so this should rarely fire */ });

        writeState();
        updateMiniPlayer();
    }

    function togglePlayPause() {
        if (!current) return;
        if (audio.paused) {
            audio.play().catch(function () {});
        } else {
            audio.pause();
        }
    }

    /* Event delegation so play buttons added later (or on other pages
       reusing this same script) all work without extra wiring. */
    document.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.episode-play-btn') : null;
        if (!btn) return;
        e.preventDefault();

        var data = {
            id: btn.getAttribute('data-episode-id'),
            src: btn.getAttribute('data-audio-src'),
            title: btn.getAttribute('data-title'),
            thumb: btn.getAttribute('data-thumb')
        };

        if (!data.src) return;

        if (current && current.id === data.id) {
            togglePlayPause();
        } else {
            loadAndPlay(data);
        }
    });

    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);

    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            audio.pause();
            audio.removeAttribute('src');
            current = null;
            writeState();
            hidePlayer();
            syncPlayButtons();
        });
    }

    if (progressBar) {
        progressBar.addEventListener('click', function (e) {
            if (!audio.duration) return;
            var rect = progressBar.getBoundingClientRect();
            var ratio = (e.clientX - rect.left) / rect.width;
            audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
        });
    }

    audio.addEventListener('timeupdate', function () {
        if (!current) return;
        current.time = audio.currentTime;
        if (audio.duration && progressFill) {
            progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
        }
        writeState();
    });

    audio.addEventListener('play', function () {
        if (!current) return;
        current.playing = true;
        writeState();
        setPlayingClass(true);
        syncPlayButtons();
    });

    audio.addEventListener('pause', function () {
        if (!current) return;
        current.playing = false;
        writeState();
        setPlayingClass(false);
        syncPlayButtons();
    });

    audio.addEventListener('ended', function () {
        if (!current) return;
        current.playing = false;
        current.time = 0;
        writeState();
        setPlayingClass(false);
        syncPlayButtons();
    });

    window.addEventListener('pagehide', function () {
        if (current) writeState();
    });

    /* Resume whatever was playing when the visitor lands on this page. */
    if (current && current.src) {
        audio.src = current.src;
        audio.currentTime = current.time || 0;
        updateMiniPlayer();

        if (current.playing) {
            var playAttempt = audio.play();
            if (playAttempt && playAttempt.catch) {
                playAttempt.catch(function () {
                    current.playing = false;
                    writeState();
                    setPlayingClass(false);
                    syncPlayButtons();
                });
            }
        }
    }
})();

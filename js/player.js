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
   one click to continue.

   A saved "playing" state is only resumed automatically when it is fresh
   (the visitor was listening seconds ago, i.e. just clicked a link). If they
   come back hours later, the player waits, paused, at the right spot. */
(function () {
    var STORAGE_KEY = 'thm_player_state_v1';
    var RATE_KEY = 'thm_player_rate_v1';
    var FRESH_MS = 20000;       // how recent a saved "playing" state must be to auto-resume
    var SAVE_EVERY_MS = 1000;   // how often the position is saved while playing
    var BACK_SECONDS = 15;
    var FORWARD_SECONDS = 30;
    var RATES = [1, 1.25, 1.5, 1.75, 2];

    var audio = document.getElementById('sitePlayerAudio');
    var player = document.getElementById('miniPlayer');
    if (!audio || !player) return;

    var thumbEl = document.getElementById('miniPlayerThumb');
    var titleEl = document.getElementById('miniPlayerTitle');
    var playPauseBtn = document.getElementById('miniPlayerPlayPause');
    var progressBar = document.getElementById('miniPlayerProgress');
    var progressFill = document.getElementById('miniPlayerProgressFill');
    var timeEl = document.getElementById('miniPlayerTime');
    var backBtn = document.getElementById('miniPlayerBack');
    var forwardBtn = document.getElementById('miniPlayerForward');
    var speedBtn = document.getElementById('miniPlayerSpeed');
    var closeBtn = document.getElementById('miniPlayerClose');

    var current = readState();
    var lastSave = 0;

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
                current.saved = Date.now();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
            lastSave = Date.now();
        } catch (e) { /* localStorage unavailable — player still works for this page load */ }
    }

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) seconds = 0;
        seconds = Math.floor(seconds);
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
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
        if (playPauseBtn) playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    }

    function syncPlayButtons() {
        var buttons = document.querySelectorAll('[data-audio-src]');
        for (var i = 0; i < buttons.length; i++) {
            var isThis = !!(current && current.id && buttons[i].getAttribute('data-episode-id') === current.id);
            buttons[i].classList.toggle('is-playing', isThis && !!current.playing);
        }
    }

    /* The bar, the time, and the screen-reader description of the position. */
    function updateProgress() {
        var duration = audio.duration;
        var time = audio.currentTime || (current && current.time) || 0;
        var known = isFinite(duration) && duration > 0;
        var percent = known ? Math.min(100, time / duration * 100) : 0;

        if (progressFill) progressFill.style.width = percent + '%';
        if (timeEl) timeEl.textContent = formatTime(time) + ' / ' + (known ? formatTime(duration) : '--:--');
        if (progressBar) {
            progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
            progressBar.setAttribute('aria-valuetext', formatTime(time) + (known ? ' of ' + formatTime(duration) : ''));
        }
    }

    function updateMiniPlayer() {
        if (!current) {
            hidePlayer();
            return;
        }
        titleEl.classList.remove('is-error');
        titleEl.textContent = current.title || '';
        thumbEl.src = current.thumb || '';
        thumbEl.alt = current.title ? current.title + ' thumbnail' : '';
        showPlayer();
        setPlayingClass(current.playing);
        syncPlayButtons();
        updateProgress();
        updateMediaSession();
    }

    /* Lock-screen, headphone, and keyboard media-key controls. */
    function updateMediaSession() {
        if (!('mediaSession' in navigator) || !current || typeof MediaMetadata === 'undefined') return;
        var art = current.thumb && current.thumb.indexOf('.svg') === -1 ? [{ src: current.thumb }] : [];
        navigator.mediaSession.metadata = new MediaMetadata({
            title: current.title || 'Episode',
            artist: 'Human Motivation',
            album: 'Tate Harrison Media',
            artwork: art
        });
    }

    function setupMediaSession() {
        if (!('mediaSession' in navigator)) return;
        var set = function (action, handler) {
            try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) { /* not supported here */ }
        };
        set('play', function () { audio.play().catch(function () {}); });
        set('pause', function () { audio.pause(); });
        set('seekbackward', function () { skip(-BACK_SECONDS); });
        set('seekforward', function () { skip(FORWARD_SECONDS); });
        set('seekto', function (d) { if (d && typeof d.seekTime === 'number') audio.currentTime = d.seekTime; });
    }

    function skip(seconds) {
        if (!current) return;
        var target = (audio.currentTime || 0) + seconds;
        if (isFinite(audio.duration)) target = Math.min(target, audio.duration);
        audio.currentTime = Math.max(0, target);
        updateProgress();
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

    /* ---- playback speed (remembered between visits) ---- */
    function applyRate(rate) {
        audio.defaultPlaybackRate = rate;
        audio.playbackRate = rate;
        if (speedBtn) {
            speedBtn.textContent = rate + '×';
            speedBtn.setAttribute('aria-label', 'Playback speed ' + rate + 'x. Press to change.');
        }
    }

    var savedRate = 1;
    try { savedRate = parseFloat(localStorage.getItem(RATE_KEY)) || 1; } catch (e) { /* ignore */ }
    if (RATES.indexOf(savedRate) === -1) savedRate = 1;
    applyRate(savedRate);

    if (speedBtn) {
        speedBtn.addEventListener('click', function () {
            var next = RATES[(RATES.indexOf(audio.playbackRate) + 1) % RATES.length] || 1;
            applyRate(next);
            try { localStorage.setItem(RATE_KEY, String(next)); } catch (e) { /* ignore */ }
        });
    }

    /* Event delegation so play buttons added later (or on other pages
       reusing this same script) all work without extra wiring. */
    document.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-audio-src]') : null;
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
    if (backBtn) backBtn.addEventListener('click', function () { skip(-BACK_SECONDS); });
    if (forwardBtn) forwardBtn.addEventListener('click', function () { skip(FORWARD_SECONDS); });

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

    /* ---- seeking: click or tap the bar, or use the keyboard on it ---- */
    function seekFromPointer(e) {
        if (!isFinite(audio.duration) || !audio.duration) return;
        var rect = progressBar.getBoundingClientRect();
        var ratio = (e.clientX - rect.left) / rect.width;
        audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
        updateProgress();
    }

    if (progressBar) {
        progressBar.addEventListener('click', seekFromPointer);

        progressBar.addEventListener('keydown', function (e) {
            var handled = true;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') skip(-5);
            else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') skip(5);
            else if (e.key === 'PageDown') skip(-30);
            else if (e.key === 'PageUp') skip(30);
            else if (e.key === 'Home') audio.currentTime = 0;
            else if (e.key === 'End' && isFinite(audio.duration)) audio.currentTime = Math.max(0, audio.duration - 1);
            else handled = false;
            if (handled) e.preventDefault();
        });
    }

    audio.addEventListener('timeupdate', function () {
        if (!current) return;
        current.time = audio.currentTime;
        updateProgress();
        if (Date.now() - lastSave >= SAVE_EVERY_MS) writeState();
    });

    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('durationchange', updateProgress);
    audio.addEventListener('seeked', function () { if (current) { current.time = audio.currentTime; writeState(); } });

    audio.addEventListener('play', function () {
        if (!current) return;
        current.playing = true;
        titleEl.classList.remove('is-error');
        titleEl.textContent = current.title || '';
        writeState();
        setPlayingClass(true);
        syncPlayButtons();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });

    audio.addEventListener('pause', function () {
        if (!current) return;
        current.playing = false;
        writeState();
        setPlayingClass(false);
        syncPlayButtons();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    });

    audio.addEventListener('ended', function () {
        if (!current) return;
        current.playing = false;
        current.time = 0;
        writeState();
        setPlayingClass(false);
        syncPlayButtons();
        updateProgress();
    });

    /* A file that is missing or can't load: say so instead of sitting there
       looking like it is playing. */
    audio.addEventListener('error', function () {
        if (!current || !audio.getAttribute('src')) return;
        current.playing = false;
        writeState();
        setPlayingClass(false);
        syncPlayButtons();
        titleEl.classList.add('is-error');
        titleEl.textContent = 'This episode’s audio couldn’t be loaded. Check your connection and try again.';
    });

    /* Leaving the page: save the exact spot. */
    window.addEventListener('pagehide', function () {
        if (!current) return;
        if (audio.currentTime) current.time = audio.currentTime;
        writeState();
    });

    setupMediaSession();

    /* Resume whatever was playing when the visitor lands on this page. */
    if (current && current.src) {
        var fresh = current.playing && current.saved && (Date.now() - current.saved) < FRESH_MS;
        audio.preload = 'metadata';   // so the length shows even before pressing play
        audio.src = current.src;
        audio.currentTime = current.time || 0;

        if (current.playing && !fresh) {
            // They left a while ago: wait, paused, at the right spot.
            current.playing = false;
            writeState();
        }
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

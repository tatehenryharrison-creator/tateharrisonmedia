/* Episode entries -> compact list rows, or a full episode page.

   Every episode is written ONCE, as plain visible text, in
   Library/episodes.lbi (see that file for how to add one). Pages put
   those entries inside <div id="episodeList" data-mode="...">:

     data-mode="list"            compact rows (episodes.html, home page)
     data-mode="list" data-limit="3"   ...only the newest 3 (home page)
     data-mode="detail"          one full episode, picked by ?ep=...
                                 in the address (episode.html)

   This script finds the pieces by their class names, so authors never
   touch hidden attributes: the title, description, thumbnail, audio
   link and YouTube link are just normal text, an image, and links. */
(function () {
    var list = document.getElementById('episodeList');
    if (!list) return;

    var mode = list.getAttribute('data-mode') || 'list';
    var limit = parseInt(list.getAttribute('data-limit'), 10) || 0;
    var DESC_LIMIT = 100;
    var SITE_NAME = 'Tate Harrison Media';

    var ICON_PLAY = '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    var ICON_PAUSE = '<svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    var ICON_YOUTUBE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 7a2 2 0 0 0-1.41-1.41C16.76 5 12 5 12 5s-4.76 0-6.18.59A2 2 0 0 0 4.41 7 20.06 20.06 0 0 0 4 12a20.06 20.06 0 0 0 .41 5 2 2 0 0 0 1.41 1.41C7.24 19 12 19 12 19s4.76 0 6.18-.59A2 2 0 0 0 19.59 17 20.06 20.06 0 0 0 20 12a20.06 20.06 0 0 0-.41-5zM10 15V9l5.2 3z"/></svg>';

    function clean(text) {
        return (text || '').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    }

    /* A link still holding the starter's PASTE-... text, or "#", counts as empty. */
    function isRealLink(href) {
        return !!href && href !== '#' && !/PASTE|REPLACE/i.test(href);
    }

    function slug(text) {
        return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function detailUrl(ep) {
        return '/episode.html?ep=' + encodeURIComponent(ep.id);
    }

    function remove(node) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
    }

    /* ---- read every entry ---- */
    var nodes = list.querySelectorAll('.episode-entry');
    var episodes = [];

    for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];

        /* The blank starter in the Library file never shows on the site. */
        if (el.classList.contains('episode-entry-blank')) {
            remove(el);
            continue;
        }

        var titleEl = el.querySelector('.episode-title');
        var descEl = el.querySelector('.episode-desc');
        var audioEl = el.querySelector('a.episode-audio');
        var youtubeEl = el.querySelector('a.btn-youtube');
        var thumbEl = el.querySelector('img.episode-thumb');
        var numberEl = el.querySelector('.episode-number');

        var audioHref = audioEl ? audioEl.getAttribute('href') : '';
        var hasAudio = isRealLink(audioHref);
        var number = numberEl ? parseInt(clean(numberEl.textContent), 10) : NaN;

        /* The episode's id comes from its audio file name (episode-004.mp3
           -> "episode-004"), falling back to its number. It is used in the
           episode page's address and to remember what is playing. */
        var fileName = hasAudio ? audioHref.split('#')[0].split('?')[0].split('/').pop().replace(/\.[^.]+$/, '') : '';
        var id = slug(fileName) || (isNaN(number) ? 'episode-' + (episodes.length + 1) : 'episode-' + number);

        episodes.push({
            el: el,
            titleEl: titleEl,
            descEl: descEl,
            audioEl: audioEl,
            youtubeEl: youtubeEl,
            index: i,
            number: number,
            id: id,
            title: titleEl ? clean(titleEl.textContent) : 'Episode',
            audio: hasAudio ? audioEl.href : '',
            thumb: thumbEl ? thumbEl.src : ''
        });
    }

    if (!episodes.length) {
        list.innerHTML = '<p class="episode-empty">New episodes are on the way.</p>';
        return;
    }

    /* ---- newest (highest number) first, wherever the entry was pasted ---- */
    episodes.sort(function (a, b) {
        var aHas = !isNaN(a.number);
        var bHas = !isNaN(b.number);
        if (aHas && bHas && a.number !== b.number) return b.number - a.number;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return a.index - b.index;
    });
    for (var s = 0; s < episodes.length; s++) list.appendChild(episodes[s].el);

    /* The home page's "Watch the Latest Episode" button follows the newest entry. */
    var latestButton = document.querySelector('[data-latest-episode]');
    if (latestButton) latestButton.href = detailUrl(episodes[0]);

    /* ---- shared pieces ---- */
    function addPlayButton(ep, large) {
        var wrap = ep.el.querySelector('.episode-entry-thumb');
        if (!ep.audio || !wrap) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'episode-play-btn' + (large ? ' episode-play-btn--large' : '');
        btn.setAttribute('data-episode-id', ep.id);
        btn.setAttribute('data-audio-src', ep.audio);
        btn.setAttribute('data-title', ep.title);
        btn.setAttribute('data-thumb', ep.thumb);
        btn.setAttribute('aria-label', 'Play ' + ep.title);
        btn.innerHTML = ICON_PLAY + ICON_PAUSE;
        wrap.appendChild(btn);
    }

    function tidyLinks(ep) {
        if (ep.youtubeEl) {
            if (!isRealLink(ep.youtubeEl.getAttribute('href'))) {
                remove(ep.youtubeEl);
            } else {
                var label = clean(ep.youtubeEl.textContent) || 'Watch on YouTube';
                ep.youtubeEl.target = '_blank';
                ep.youtubeEl.rel = 'noopener';
                ep.youtubeEl.innerHTML = ICON_YOUTUBE;
                ep.youtubeEl.appendChild(document.createTextNode(label));
            }
        }
        if (ep.audioEl && !ep.audio) remove(ep.audioEl);
    }

    function linkTitle(ep) {
        if (!ep.titleEl) return;
        var a = document.createElement('a');
        a.href = detailUrl(ep);
        a.textContent = ep.title;
        ep.titleEl.textContent = '';
        ep.titleEl.appendChild(a);
    }

    /* Keep about 100 characters, but finish the word in progress instead of
       cutting it in half, then add an ellipsis and a "more" link. */
    function shorten(ep) {
        if (!ep.descEl) return;
        var full = clean(ep.descEl.textContent);
        ep.descEl.textContent = full;
        if (full.length <= DESC_LIMIT) return;

        var nextSpace = full.indexOf(' ', DESC_LIMIT);
        var end = nextSpace === -1 ? full.length : nextSpace;
        if (end >= full.length) return;

        var preview = full.slice(0, end).replace(/[\s.,;:!?…—-]+$/, '');
        ep.descEl.textContent = preview + '… ';

        var more = document.createElement('a');
        more.className = 'more-link';
        more.href = detailUrl(ep);
        more.textContent = 'more';
        ep.descEl.appendChild(more);
    }

    /* ---- list pages: compact rows ---- */
    if (mode !== 'detail') {
        list.classList.add('is-compact');

        for (var r = 0; r < episodes.length; r++) {
            var row = episodes[r];
            if (limit && r >= limit) {
                remove(row.el);
                continue;
            }
            addPlayButton(row, false);
            tidyLinks(row);
            linkTitle(row);
            shorten(row);
        }
        return;
    }

    /* ---- episode.html: one full episode, chosen by ?ep=... ---- */
    var wanted = '';
    var query = /[?&]ep=([^&#]*)/.exec(window.location.search);
    if (query) wanted = decodeURIComponent(query[1].replace(/\+/g, ' ')).toLowerCase();

    var match = null;
    for (var m = 0; m < episodes.length; m++) {
        if (episodes[m].id === wanted || (!isNaN(episodes[m].number) && String(episodes[m].number) === wanted)) {
            match = episodes[m];
            break;
        }
    }

    if (!match) {
        list.innerHTML = '<p class="episode-empty">We couldn’t find that episode. <a href="/episodes.html">See all episodes</a>.</p>';
        return;
    }

    for (var o = 0; o < episodes.length; o++) {
        if (episodes[o] !== match) remove(episodes[o].el);
    }

    list.classList.add('is-detail');

    if (match.titleEl) {
        var heading = document.createElement('h1');
        heading.className = match.titleEl.className;
        heading.textContent = match.title;
        match.titleEl.parentNode.replaceChild(heading, match.titleEl);
    }

    document.title = match.title + ' | ' + SITE_NAME;

    addPlayButton(match, true);
    tidyLinks(match);
    if (match.audioEl && match.audio) match.audioEl.setAttribute('download', '');

    var back = document.createElement('p');
    back.className = 'episode-back';
    back.innerHTML = '<a href="/episodes.html">← All episodes</a>';
    list.parentNode.insertBefore(back, list);
})();

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

    /* Video id from any common YouTube address (watch?v=, youtu.be/, embed/,
       shorts/, live/). A channel address has no video id, so it returns ''. */
    function youtubeId(url) {
        var m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(url || '');
        return m ? m[1] : '';
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

    /* ---- read one entry (also used for the "More to listen to" copies) ---- */
    function readEntry(el, index) {
        var titleEl = el.querySelector('.episode-title');
        var descEl = el.querySelector('.episode-desc');
        var audioEl = el.querySelector('a.episode-audio');
        var youtubeEl = el.querySelector('a.btn-youtube');
        var thumbEl = el.querySelector('img.episode-thumb');
        var numberEl = el.querySelector('.episode-number');
        var dateEl = el.querySelector('.episode-date');
        var lengthEl = el.querySelector('.episode-length');

        var audioHref = audioEl ? audioEl.getAttribute('href') : '';
        var hasAudio = isRealLink(audioHref);
        var number = numberEl ? parseInt(clean(numberEl.textContent), 10) : NaN;

        /* The episode's id comes from its audio file name (episode-004.mp3
           -> "episode-004"), falling back to its number. It is used in the
           episode page's address and to remember what is playing. */
        var fileName = hasAudio ? audioHref.split('#')[0].split('?')[0].split('/').pop().replace(/\.[^.]+$/, '') : '';
        var id = slug(fileName) || (isNaN(number) ? 'episode-' + (index + 1) : 'episode-' + number);

        return {
            el: el,
            titleEl: titleEl,
            descEl: descEl,
            audioEl: audioEl,
            youtubeEl: youtubeEl,
            youtubeHref: youtubeEl ? youtubeEl.getAttribute('href') : '',
            lineEl: el.querySelector('.episode-number-line'),
            guestEl: el.querySelector('.episode-guest'),
            index: index,
            number: number,
            date: dateEl ? clean(dateEl.textContent) : '',
            length: lengthEl ? clean(lengthEl.textContent) : '',
            id: id,
            title: titleEl ? clean(titleEl.textContent) : 'Episode',
            audio: hasAudio ? audioEl.href : '',
            thumb: thumbEl ? thumbEl.src : ''
        };
    }

    var nodes = list.querySelectorAll('.episode-entry');
    var episodes = [];

    for (var i = 0; i < nodes.length; i++) {
        /* The blank starter in the Library file never shows on the site. */
        if (nodes[i].classList.contains('episode-entry-blank')) {
            remove(nodes[i]);
            continue;
        }
        episodes.push(readEntry(nodes[i], i));
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
    /* Both the round button on the thumbnail and the "Listen" button carry
       these, which is all js/player.js needs to start the episode. */
    function setPlayData(btn, ep) {
        btn.setAttribute('data-episode-id', ep.id);
        btn.setAttribute('data-audio-src', ep.audio);
        btn.setAttribute('data-title', ep.title);
        btn.setAttribute('data-thumb', ep.thumb);
    }

    function addPlayButton(ep, large) {
        var wrap = ep.el.querySelector('.episode-entry-thumb');
        if (!ep.audio || !wrap) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'episode-play-btn' + (large ? ' episode-play-btn--large' : '');
        setPlayData(btn, ep);
        btn.setAttribute('aria-label', 'Play ' + ep.title);
        btn.innerHTML = ICON_PLAY + ICON_PAUSE;
        wrap.appendChild(btn);
    }

    /* A text "Listen" button first in the row of links, so audio is as easy to
       spot as the YouTube button. It turns into "Pause" while playing. */
    function addListenButton(ep) {
        var linksEl = ep.el.querySelector('.episode-links');
        if (!ep.audio || !linksEl) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-listen';
        setPlayData(btn, ep);
        btn.innerHTML = ICON_PLAY + ICON_PAUSE + '<span class="label-play">Listen</span><span class="label-pause">Pause</span>';
        linksEl.insertBefore(btn, linksEl.firstChild);
    }

    /* Rebuild the "Episode 4 \u2022 October 2026 \u2022 42 min" line from whichever
       pieces are filled in (the starter's placeholder text counts as empty),
       and drop the guest line while it still has its placeholder. */
    function tidyMeta(ep) {
        if (ep.lineEl) {
            var parts = [];
            if (!isNaN(ep.number)) parts.push('Episode ' + ep.number);
            if (ep.date && !/^month year$/i.test(ep.date)) parts.push(ep.date);
            if (ep.length && !/^0*\s*min$/i.test(ep.length)) parts.push(ep.length);

            if (parts.length) {
                ep.lineEl.textContent = parts.join(' \u2022 ');
            } else {
                remove(ep.lineEl);
            }
        }

        if (ep.guestEl) {
            var guest = clean(ep.guestEl.textContent);
            if (!guest || /GUEST NAME/i.test(guest)) remove(ep.guestEl);
        }
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

    /* The episode page's video: built from the same YouTube link the "Watch on
       YouTube" button uses, so there is nothing extra to fill in. A link with no
       video in it (like a channel address) just shows the button. */
    function addVideo(ep) {
        var videoId = isRealLink(ep.youtubeHref) ? youtubeId(ep.youtubeHref) : '';
        if (!videoId || !ep.descEl) return;

        var box = document.createElement('div');
        box.className = 'episode-video';

        var frame = document.createElement('iframe');
        frame.src = 'https://www.youtube-nocookie.com/embed/' + videoId + '?rel=0';
        frame.title = ep.title + ' (video)';
        frame.loading = 'lazy';
        frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
        frame.setAttribute('allowfullscreen', '');
        frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

        box.appendChild(frame);
        ep.descEl.parentNode.insertBefore(box, ep.descEl.nextSibling);
    }

    /* ---- compact rows (lists, and "More to listen to") ---- */
    function decorateRow(ep) {
        addPlayButton(ep, false);
        addListenButton(ep);
        tidyLinks(ep);
        tidyMeta(ep);
        linkTitle(ep);
        shorten(ep);
    }

    /* ---- list pages ---- */
    if (mode !== 'detail') {
        list.classList.add('is-compact');

        for (var r = 0; r < episodes.length; r++) {
            if (limit && r >= limit) {
                remove(episodes[r].el);
                continue;
            }
            decorateRow(episodes[r]);
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

    /* Take untouched copies of the other episodes for "More to listen to"
       (newest first, up to 3) before they are removed from this page. */
    var suggestions = [];
    for (var o = 0; o < episodes.length; o++) {
        if (episodes[o] === match) continue;
        if (suggestions.length < 3) suggestions.push(readEntry(episodes[o].el.cloneNode(true), episodes[o].index));
        remove(episodes[o].el);
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
    addVideo(match);
    addListenButton(match);
    tidyLinks(match);
    tidyMeta(match);
    if (match.audioEl && match.audio) match.audioEl.setAttribute('download', '');

    var back = document.createElement('p');
    back.className = 'episode-back';
    back.innerHTML = '<a href="/episodes.html">← All episodes</a>';
    list.parentNode.insertBefore(back, list);

    if (suggestions.length) {
        var more = document.createElement('section');
        more.className = 'episode-more';

        var moreHeading = document.createElement('h2');
        moreHeading.className = 'episode-more-heading';
        moreHeading.textContent = 'More to listen to';

        var moreList = document.createElement('div');
        moreList.className = 'episode-list is-compact';

        more.appendChild(moreHeading);
        more.appendChild(moreList);
        for (var k = 0; k < suggestions.length; k++) {
            moreList.appendChild(suggestions[k].el);
            decorateRow(suggestions[k]);
        }
        list.parentNode.insertBefore(more, list.nextSibling);
    }
})();

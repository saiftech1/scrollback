"use strict";

Stream.prototype.scroll = function() {
	var log = this.log, msg = log.firstChild, i=0, pos,
		start = 32, end = 0, up, self = this, cb,
		viewTop = offset(log)[1] + log.scrollTop,
		viewBottom = viewTop + log.clientHeight;
	
	while(msg) {
		pos = offset(msg)[1];
		if(pos >= viewTop && pos <= viewBottom){
			if(i < start) start = i;
			if(i > end) end = i;
		}
		msg = msg.nextSibling;
		i++;
	}

	if (typeof this.lastScrollTop === 'undefined') {
		this.lastScrollTop = log.scrollTop;
		return;
	}
	up = log.scrollTop < this.lastScrollTop;
	this.lastScrollTop = log.scrollTop;
	this.scrollId = this.messages[start].id;
	this.scrollPx = offset(this.log.children[start])[1] - offset(this.log)[1] -  this.log.scrollTop;
	
	this.renderThumb(start, end);
	
	
	console.log(log.scrollHeight, log.scrollTop, log.clientHeight);
	
	if(log.scrollHeight - (log.scrollTop + log.clientHeight) < 16) {
		this.bottom = true;
	} else {
		this.bottom = false;
	}
	
	console.log("Bottom", this.bottom);
	
	cb = function(m) { self.update(m); };
	
	if (this.bottom) {
		core.watch(self.id, null, 32, 0, cb);
	} else {
		core.unwatch(self.id);
		if (up && start < 10 || !up && self.messages.length - end < 10) {
			core.watch(self.id, self.messages[start].time, 32, 48, cb);
		}
	}
	
};

Stream.prototype.update = function (data) {
	var self = this, top, i, l;
	this.messages = data;
	this.renderLog();
	this.renderTimeline();
	
	if (this.bottom) {
		this.log.scrollTop = this.log.scrollHeight;
	} else {
		for(i=0, l=this.messages.length; i<l; i++) {
			if (this.messages[i].id ==  self.scrollId) break;
		}
		this.log.scrollTop = offset(this.log.children[i])[1] - offset(this.log)[1] - this.scrollPx;
	}
	setTimeout(function() { self.updating = false; }, 100);
};

Stream.prototype.renderLog = function() {
	var lastMsg, self = this, el;
	this.log.innerHTML = '';
	
	console.log("Rendering", snapshot(this.messages));
	
	this.messages.forEach(function(message) {
		if (lastMsg) {
			el = self.renderMessage(lastMsg, message.time - lastMsg.time > 60000);
			if(el) self.log.appendChild(el);
		}
		lastMsg = message;
	});
	if(lastMsg) self.log.appendChild(self.renderMessage(lastMsg, true));
};

Stream.prototype.renderThumb = function(start, end) {
	var log = this.log,
		thumbTop = this.tread.clientHeight,
		thumbBottom = 0, self = this,
		viewTop = offset(log)[1] + log.scrollTop,
		viewBottom = viewTop + log.clientHeight;
		
	function t2px(pos) {
		return (pos - self.firstMessageAt) * self.tread.clientHeight /
		(self.lastMessageAt - self.firstMessageAt);
	}
	
	start = t2px(start); end = t2px(end);

	
	end = Math.min(thumbBottom, log.clientHeight);
	
	this.thumb.style.top = thumbTop + 'px';
	this.thumb.style.height = (thumbBottom - thumbTop +1) + 'px';
};

Stream.prototype.renderTimeline = function() {
	
	
	var buckets = [], h=1, n = this.tread.clientHeight, i, k = 0, length,
		msg, first, duration, r, ml = ["div"], max=0;

	msg=this.messages[0];
	length=this.messages.length;
	first = msg.time==null?0:msg.time;

	duration = this.messages[length-1].time - first;
	this.tread.innerHTML = '';
	console.log(first,duration,length);
	
	for (k = 0; k<length; k++) {
		
		msg=this.messages[k];
		if (msg.type!=="text") {
			continue;
		}
		i = Math.floor((msg.time- first)*n / duration);
		if(!buckets[i]) buckets[i] = {nicks: {}, n: 0};
		buckets[i].nicks[msg.from] = true;
		buckets[i].n += 1;
		
		if(buckets[i].n > max) max = buckets[i].n;
		
	}

	for(i=0; i<n; i++) {
		if(buckets[i]) {
			r = ["div", {
				'class': 'scrollback-tread-row scrollback-user-' +
					Object.keys(buckets[i].nicks).join(' scrollback-user-'),
				style: {
					top: (i*h) + 'px', width: (buckets[i].n*18/max) + 'px'
				}
			}];
			ml.push(r);
		}
	}
	
	this.tread.appendChild(JsonML.parse(ml));
	this.renderThumb();
};

// --- color for names ---

function hashColor(name) {
	if (!name) return '#999';
	name = name.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/^\s+/g,'').replace(/\s+$/g,''); 
	// nicks that differ only by case or punctuation should get the same color.
	
	function hash(s) {
		var h=1, i, l;
		s = s.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/^\s+/g,'').replace(/\s+$/g,''); 
		// nicks that differ only by case or punctuation should get the same color.
		for (i=0, l=s.length; i<l; i++) {
			h = (Math.abs(h<<(7+i))+s.charCodeAt(i))%1530;
		}
		return h;
	}
	
	function color(h) {
		// h must be between [0, 1529] inclusive
		
		function hex(n) {
			var h = n.toString(16);
			h = h.length==1? "0"+h: h;
			return h;
		}
		
		function rgb(r, g, b) {
			return "#" + hex(r) + hex(g) + hex(b);
		}
		
		if(h<255) return rgb(255, h, 0);
		else if(h<510) return rgb(255-(h-255), 255, 0);
		else if(h<765) return rgb(0, 255, h-510);
		else if(h<1020) return rgb(0, 255-(h-765), 255);
		else if(h<1275) return rgb(h-1020, 0, 255);
		else return rgb(255, 0, 255-(h-1275));
	}
	
	return color(hash(name));
}



Stream.prototype.renderMessage = function (message, showTimestamp) {
	var el, self = this;
	
	function format(text) {
		var u = /\b(https?\:\/\/)?([a-z0-9\-]+\.)+[a-z]{2,4}\b((\/|\?)\S*)?/g,
			m = ["span"], r, s=0;
		while((r = u.exec(text)) !== null) {
			m.push(text.substring(s, r.index));
			s = u.lastIndex;
			m.push(["a", {href: r[1]?r[0]:'http://'+r[0], target: '_blank'}, r[0]]);
		}
		m.push(text.substring(s));
		return m;
	}
	
	function formatName(name) {
		// TODO
		return name;
	}
	
	switch(message.type) {
		case 'text':
			el = [
				[ "span", { 'class': 'scrollback-message-separator'}, '['],
				[ "span", {
					'class': 'scrollback-message-nick',
					onmouseout: function() {
						if(self.userStyle) self.userStyle.parentNode.removeChild(self.userStyle);
					},
					onmouseover: function() {
						var ucss = {".scrollback-tread-row": {width: "0 !important"}};
						ucss[ ".scrollback-user-" + formatName(message.from)] = {
							"background": hashColor(message.from) + " !important",
							width: "100% !important"
						};
						self.userStyle = addStyles(ucss);
					}
				}, message.from ],
				[ "span", { 'class': 'scrollback-message-separator'}, '] '],
				[ "span", { 'class': 'scrollback-message-text'}, format(message.text) ],
				[ "span", { 'class': 'scrollback-message-timestamp'},
					"Sent " + prettyDate(message.time, core.time())
				]
			];
			break;
		case 'back':
			el = [["span", message.from + ' entered.']];
			// intentional fall through.
		case 'away':
			el = el || [["span", message.from + ' left' + (
				message.text? ' (' + message.text + ')': '.'
			)]];
			setTimeout(function(){
				el.className += ' scrollback-message-hidden';
			}, 1000);
			break;
		default:
			el = [["span", message.text]];
	}
	
	if(!el) return null;

	el = JsonML.parse(["div", {
		'class': 'scrollback-message scrollback-message-' + message.type +
			(showTimestamp? '': ' scrollback-timestamp-hidden'),
		'style': { 'borderLeftColor': hashColor(message.from) },
		'data-time': message.time, 'data-from': formatName(message.from)
	}].concat(el));
	
	return el;
};

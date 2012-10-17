
var c = document.getElementById('c');
var ctx = c.getContext('2d');

function r() {
    return Math.floor(Math.random()*255);
}

function o() {
    return Math.round(Math.random()*10)-5;
}

function color() {
    return 'rgb(' + r() + ',' + r() + ',' + r() + ')';
}

var items = [];

function init() {
    for(var i=0; i<200; i++) {
        items.push([Math.floor(Math.random()*c.width),
                    Math.floor(Math.random()*c.height),
                    color()]);
    }

    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 5;
} 

function update() {
    ctx.clearRect(0, 0, c.width, c.height);

    for(var i=0; i<items.length; i++) {
        var item = items[i];

        item[0] += o();
        item[1] += o();

        ctx.fillStyle = item[2];
        ctx.beginPath();
        ctx.arc(item[0],item[1],20, 0, Math.PI*2);
        ctx.fill();
    }
}

function full() {
    var el = document.getElementById('screen');

    if(el.webkitRequestFullScreen) {
        el.webkitRequestFullScreen();
    }
    else {
        el.mozRequestFullScreen();
    }

    console.log('fullscreen!');
    clearInterval(timer);
}

function resize() {
    var rect = c.getBoundingClientRect();
    c.width = rect.width;
    c.height = rect.height;
}

function on_fullscreen_change() {
    if(document.mozFullScreen || document.webkitIsFullScreen) {
        resize();
    }
    else {
        c.width = 500;
        c.height = 400;
    }

    timer = setInterval(update, 50);
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 5;
}

document.addEventListener('mozfullscreenchange', on_fullscreen_change);
document.addEventListener('webkitfullscreenchange', on_fullscreen_change);

init();
update();

var timer;


var requestAnimFrame = (function(){
    return  window.requestAnimationFrame   || 
        window.webkitRequestAnimationFrame || 
        window.mozRequestAnimationFrame    || 
        window.oRequestAnimationFrame      || 
        window.msRequestAnimationFrame     || 
        function(callback, element){
            window.setTimeout(callback, 1000 / 60);
        };
})();

setTimeout(function() {
    timer = setInterval(update, 50);
}, 500);

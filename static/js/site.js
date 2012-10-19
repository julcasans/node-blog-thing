
navigator.id.watch({
    loggedInUser: window.CURRENT_USER || null,

    onlogin: function(assertion) {
        if(!assertion) {
            return;
        }

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/persona/verify", true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.addEventListener("loadend", function(e) {
            try {
                var data = JSON.parse(this.response);
                if (data.status === "okay") {
                    if(data.freshman) {
                        // If new user, show introduction page
                        window.location = '/freshman';
                    }
                    else {
                        window.location = location;
                    }
                } else {
                    alert('Login failed, try again later');
                }
            } catch (ex) {
                // oh no, we didn't get valid JSON from the server
            }
        }, false);

        xhr.send(JSON.stringify({
            assertion: assertion
        }));
    },

    onlogout: function() {
        $.post('/persona/logout', function() {
            window.location = location;
        });
    }
});

$("#browserid").click(function(){
    navigator.id.request();
});

$('.login a.logout').click(function(e) {
    e.preventDefault();
    navigator.id.logout();
});

$('button.next, a.next').live('click', function(e) {
    var matches = /next=([^&]*)/.exec(window.location.search);
    var url = matches[1];

    if(url.indexOf('?') !== -1) {
        url += '&';
    }
    else {
        url += '?';
    }

    url += 'redirected=true';
    window.location.href = url;
});
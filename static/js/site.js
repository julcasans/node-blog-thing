
function personaLogin() {
    navigator.id.get(function(assertion) {
        if(!assertion) {
            return;
        }

        $.ajax({
            type: 'POST',
            url: '/persona/verify',
            data: JSON.stringify({
                assertion: assertion
            }),
            processData: false,
            contentType: 'application/json',
            success: function(data) {
                try {
                    data = JSON.parse(data);

                    if (data.status === "okay") {
                        if(data.freshman) {
                            // If new user, show introduction page
                            window.location = '/freshman';
                        }
                        else {
                            window.location = location;
                        }

                        $('.login').html('Logging in... <img src="/img/loader.gif" />');
                    } else {
                        alert('Login failed, try again later');
                    }
                } catch (ex) {
                    // oh no, we didn't get valid JSON from the server
                }
            }
        });
    });
}

$("#browserid").click(function(){
    personaLogin();
});

$('.login a.logout').click(function(e) {
    e.preventDefault();

    $.post('/persona/logout', function() {
        window.location = '/';
    });
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

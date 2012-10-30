
// navigator.id.watch({
//     loggedInUser: window.CURRENT_USER || null,

//     onlogin: function(assertion) {
//         if(!assertion) {
//             return;
//         }

//         $.ajax({
//             type: 'POST',
//             url: '/persona/verify',
//             data: JSON.stringify({
//                 assertion: assertion
//             }),
//             processData: false,
//             contentType: 'application/json',
//             success: function(data) {
//                 try {
//                     data = JSON.parse(data);

//                     if (data.status === "okay") {
//                         // The persona server seems to need a little
//                         // time to log in the user, otherwise the
//                         // `nav.id.watch` is kinda flaky
//                         setTimeout(function() {
//                             if(data.freshman) {
//                                 // If new user, show introduction page
//                                 window.location = '/freshman';
//                             }
//                             else {
//                                 window.location = location;
//                             }
//                         }, 1500);

//                         $('.login').html('Logging in... <img src="/img/loader.gif" />');
//                     } else {
//                         alert('Login failed, try again later');
//                     }
//                 } catch (ex) {
//                     // oh no, we didn't get valid JSON from the server
//                 }
//             }
//         });
//     },

//     onlogout: function() {
//         $.post('/persona/logout', function() {
//             window.location = '/';
//         });
//     }
// });

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

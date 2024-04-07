document.addEventListener("DOMContentLoaded", function() {
    // Check if user is logged in
    var loggedIn = localStorage.getItem("loggedIn");

    if (!loggedIn) {
        // Redirect to login page if not logged in
        window.location.href = "login.html";
    }
});

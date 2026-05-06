// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const gameName = urlParams.get('name') || 'Unknown Game';
const gameId = urlParams.get('id') || '';

// Display game name
document.getElementById('game-name').textContent = gameName + (gameId ? ' (ID: ' + gameId + ')' : '');

// Go back button handler
document.getElementById('go-back-btn').addEventListener('click', function() {
    if (window.history.length > 1) {
        window.history.go(-2);
    } else {
        window.location.href = 'https://www.roblox.com/home';
    }
});


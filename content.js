A// Store blocked game IDs
let blockedGames = [];

// Load blocked games from storage with error handling
function loadBlockedGamesFromStorage() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['blockedGames'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('Error loading blocked games:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }
            blockedGames = result.blockedGames || [];
            resolve(blockedGames);
        });
    });
}

// Save blocked games to storage with error handling
function saveBlockedGamesToStorage(games) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({ 'blockedGames': games }, function() {
            if (chrome.runtime.lastError) {
                console.error('Error saving blocked games:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }
            resolve();
        });
    });
}

// Initialize storage and load blocked games
async function initializeStorage() {
    try {
        await loadBlockedGamesFromStorage();
        hideBlockedGames();
    } catch (error) {
        console.error('Failed to initialize storage:', error);
    }
}

function getGameId(element) {
    // Try getting ID from home page format first
    let gameId = element.id;
    
    // If no ID found, try getting it from charts page URL format
    if (!gameId) {
        const gameLink = element.querySelector('a[href*="/games/"]') || element;
        if (gameLink && gameLink.href) {
            const universeIdMatch = gameLink.href.match(/universeId=(\d+)/);
            if (universeIdMatch) {
                gameId = universeIdMatch[1];
            }
        }
    }
    return gameId;
}

function addBlockButtons() {
    // For charts page
    const chartGameCards = document.querySelectorAll('.list-item.game-card');
    // For home page
    const homeGameCards = document.querySelectorAll('.game-card-link');
    
    // Handle charts page cards
    chartGameCards.forEach(card => {
        if (!card.querySelector('.game-block-btn')) {
            const gameId = getGameId(card);
            if (!gameId) return;
            
            // Get game title
            const titleElement = card.querySelector('.game-card-name') || card.querySelector('a[title]');
            const gameTitle = titleElement ? titleElement.textContent.trim() : gameId;
            
            const blockBtn = document.createElement('button');
            blockBtn.className = 'game-block-btn';
            blockBtn.innerHTML = '✖';
            blockBtn.title = 'Block this game';
            
            blockBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!blockedGames.some(game => game.id === gameId)) {
                    try {
                        blockedGames.push({ id: gameId, title: gameTitle });
                        await saveBlockedGamesToStorage(blockedGames);
                        card.remove();
                    } catch (error) {
                        console.error('Failed to block game:', error);
                    }
                }
            });
            
            const thumbnailContainer = card.querySelector('.game-card-thumb-container');
            if (thumbnailContainer) {
                thumbnailContainer.appendChild(blockBtn);
            }
        }
    });

    // Handle home page cards
    homeGameCards.forEach(card => {
        if (!card.querySelector('.game-block-btn')) {
            const gameId = getGameId(card);
            if (!gameId) return;
            
            // Get game title
            const titleElement = card.querySelector('.game-card-name') || card.querySelector('[title]');
            const gameTitle = titleElement ? titleElement.textContent.trim() : gameId;
            
            const blockBtn = document.createElement('button');
            blockBtn.className = 'game-block-btn';
            blockBtn.innerHTML = '✖';
            blockBtn.title = 'Block this game';
            
            blockBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!blockedGames.some(game => game.id === gameId)) {
                    try {
                        blockedGames.push({ id: gameId, title: gameTitle });
                        await saveBlockedGamesToStorage(blockedGames);
                        const parentDiv = card.parentElement;
                        if (parentDiv) {
                            const listItem = parentDiv.closest('li');
                            if (listItem) {
                                listItem.remove();
                            } else {
                                parentDiv.remove();
                            }
                        }
                    } catch (error) {
                        console.error('Failed to block game:', error);
                    }
                }
            });
            
            const thumbnailContainer = card.querySelector('.thumbnail-2d-container');
            if (thumbnailContainer) {
                thumbnailContainer.appendChild(blockBtn);
            }
        }
    });
}

function hideBlockedGames() {
    // Hide from charts page
    const chartGameCards = document.querySelectorAll('.list-item.game-card');
    chartGameCards.forEach(card => {
        const gameId = getGameId(card);
        if (gameId && blockedGames.some(game => game.id === gameId)) {
            card.remove();
        }
    });

    // Hide from home page
    const homeGameCards = document.querySelectorAll('.game-card-link');
    homeGameCards.forEach(card => {
        const gameId = getGameId(card);
        if (gameId && blockedGames.some(game => game.id === gameId)) {
            const parentDiv = card.parentElement;
            if (parentDiv) {
                // Find the closest li parent and remove it
                const listItem = parentDiv.closest('li');
                if (listItem) {
                    listItem.remove();
                } else {
                    parentDiv.remove();
                }
            }
        }
    });
}

// Create an observer to watch for new game cards
const observer = new MutationObserver(() => {
    addBlockButtons();
    hideBlockedGames();
});

// Add this function to detect game page
function isGamePage() {
  return window.location.pathname.includes('/games/') && 
         document.querySelector('#game-detail-meta-data');
}

// Add this function to handle game page blocking
function addGamePageBlockButton() {
  const actionSection = document.querySelector('.game-calls-to-action');
  const gameMetaData = document.querySelector('#game-detail-meta-data');
  
  if (!actionSection || !gameMetaData) return;
  
  const universeId = gameMetaData.getAttribute('data-universe-id');
  const gameTitle = document.querySelector('h1')?.textContent || universeId;
  
  // Create block button container
  const blockBtn = document.createElement('button');
  blockBtn.className = 'game-block-btn';
  blockBtn.innerHTML = '✖';
  blockBtn.title = 'Block this game';
  
  // Check if already blocked
  const isBlocked = blockedGames.some(game => game.id === universeId);
  if (isBlocked) {
    blockBtn.classList.add('blocked');
  }
  
  blockBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!blockedGames.some(game => game.id === universeId)) {
      blockedGames.push({ id: universeId, title: gameTitle });
      await saveBlockedGamesToStorage(blockedGames);
      blockBtn.classList.add('blocked');
    }
  });

  actionSection.style.position = 'relative';
  actionSection.appendChild(blockBtn);
}

// Modify the existing initialization code
function init() {
    initializeStorage().then(() => {
        if (isGamePage()) {
            addGamePageBlockButton();
        } else if (window.location.pathname === '/home' || window.location.pathname === '/') {
            // For home page, wait for content to be stable
            const checkForContent = () => {
                const gameCards = document.querySelectorAll('.game-card-link');
                if (gameCards.length > 0) {
                    // Wait an additional second for any dynamic content to settle
                    setTimeout(() => {
                        hideBlockedGames();
                        // Start observing after initial load
                        observer.observe(document.body, {
                            childList: true,
                            subtree: true
                        });
                    }, 1000);
                } else {
                    // Check again in 500ms if no game cards found
                    setTimeout(checkForContent, 500);
                }
            };
            checkForContent();
        } else {
            // For other pages, proceed as normal
            hideBlockedGames();
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    });
}

// Call init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 
// Do not run on the catalog page — the extension interferes with catalog item icons
if (window.location.pathname.startsWith('/catalog')) {
    // Stop all execution for this content script
    throw new Error('ROBLOXGameBlocker: skipping catalog page');
}

// Store blocked game IDs and keywords
let blockedGames = [];
let blockedKeywords = [];
let keywordBlockedGames = []; // Track games blocked by keywords on this page

// Load blocked games from storage with error handling
function loadBlockedGamesFromStorage() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['blockedGames', 'blockedKeywords'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('Error loading blocked games:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }
            blockedGames = result.blockedGames || [];
            blockedKeywords = result.blockedKeywords || [];
            resolve({ blockedGames, blockedKeywords });
        });
    });
}

// Check if a game title matches a keyword rule (AND logic - all keywords must be present)
function matchesKeywordRule(title, keywordRule) {
    if (!title || !keywordRule || !keywordRule.keywords || keywordRule.keywords.length === 0) {
        return false;
    }
    const lowerTitle = title.toLowerCase();
    return keywordRule.keywords.every(keyword => lowerTitle.includes(keyword.toLowerCase()));
}

// Check if a game title matches any blocked keyword rule
function isBlockedByKeywords(title) {
    if (!title || blockedKeywords.length === 0) return null;
    for (const rule of blockedKeywords) {
        if (matchesKeywordRule(title, rule)) {
            return rule;
        }
    }
    return null;
}

// Get game title from an element
function getGameTitle(element) {
    const titleElement = element.querySelector('.game-card-name') || 
                        element.querySelector('[title]') ||
                        element.querySelector('img[alt]');
    if (titleElement) {
        return titleElement.textContent?.trim() || titleElement.alt || titleElement.title || null;
    }
    return null;
}

// Save blocked games to storage with error handling
function saveBlockedGamesToStorage(games) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ 'blockedGames': games }, function() {
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
    // Try getting ID from element's id attribute first
    let gameId = element.id;
    
    // If no ID found, try getting it from URL parameters
    if (!gameId) {
        const gameLink = element.querySelector('a[href*="/games/"]') || 
                         (element.tagName === 'A' && element.href && element.href.includes('/games/') ? element : null);
        if (gameLink && gameLink.href) {
            const universeIdMatch = gameLink.href.match(/universeId=(\d+)/);
            if (universeIdMatch) {
                gameId = universeIdMatch[1];
            }
        }
    }
    
    // For nested items, try getting ID from any nested link with an id
    if (!gameId) {
        const nestedLink = element.querySelector('a[id][href*="/games/"]');
        if (nestedLink && nestedLink.id) {
            gameId = nestedLink.id;
        }
    }
    
    return gameId;
}

// Helper to find the best element to remove when blocking
function findRemovableParent(element) {
    // Try to find the list item first
    const listItem = element.closest('li');
    if (listItem) return listItem;
    
    // For search results grid, find the grid-item-container or game-card-container div
    const gridContainer = element.closest('.grid-item-container') || 
                          element.closest('.featured-grid-item-container') ||
                          element.closest('[class*="game-card-container"]');
    if (gridContainer) return gridContainer;
    
    // Fallback to parent
    return element.parentElement;
}

// Helper to create and attach block button
function createBlockButton(gameId, gameTitle, removeElement) {
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
                if (removeElement) {
                    removeElement.remove();
                }
            } catch (error) {
                console.error('Failed to block game:', error);
            }
        }
    });
    
    return blockBtn;
}

function addBlockButtons() {
    // 1. Handle game links with ID on the anchor tag (Continue section, Charts, Search results)
    const gameLinksWithId = document.querySelectorAll('a[href*="/games/"][id]');
    
    gameLinksWithId.forEach(link => {
        const gameId = link.id;
        if (!gameId) return;

        // Place the button in the .game-card-container div (parent of <a>), NOT inside
        // the <a> itself. This keeps it clickable even when another extension (e.g. Rovalra
        // quickplay) adds a pointer-intercepting overlay directly onto the <a> element.
        const cardContainer = link.closest('.game-card-container') || link.parentElement;
        if (!cardContainer || cardContainer.querySelector('.game-block-btn')) return;
        
        const titleElement = link.querySelector('.game-card-name') || 
                            link.querySelector('[title]') ||
                            link.querySelector('img[alt]');
        const gameTitle = titleElement ? 
                         (titleElement.textContent?.trim() || titleElement.alt || titleElement.title || gameId) : 
                         gameId;
        
        const removeElement = findRemovableParent(link);
        const blockBtn = createBlockButton(gameId, gameTitle, removeElement);
        
        cardContainer.style.position = 'relative';
        cardContainer.appendChild(blockBtn);
    });

    // 2. Handle wide tiles where ID is on the LI element (Today's Picks, Sponsored, Recommended)
    const wideTiles = document.querySelectorAll('li[id][data-testid="wide-game-tile"]');
    
    wideTiles.forEach(tile => {
        if (tile.querySelector('.game-block-btn')) return;
        
        const gameId = tile.id;
        if (!gameId) return;
        
        const titleElement = tile.querySelector('.game-card-name') || 
                            tile.querySelector('[title]') ||
                            tile.querySelector('img[alt]');
        const gameTitle = titleElement ? 
                         (titleElement.textContent?.trim() || titleElement.alt || titleElement.title || gameId) : 
                         gameId;
        
        const blockBtn = createBlockButton(gameId, gameTitle, tile);
        
        // Wide tiles use brief-game-icon class for thumbnail
        const thumbnailContainer = tile.querySelector('.thumbnail-2d-container') ||
                                   tile.querySelector('.brief-game-icon') ||
                                   tile.querySelector('[class*="thumbnail"]') ||
                                   tile.querySelector('img')?.parentElement;
        
        if (thumbnailContainer) {
            thumbnailContainer.style.position = 'relative';
            thumbnailContainer.appendChild(blockBtn);
        }
    });

    // 3. Handle any remaining list-item game cards (fallback)
    const listItemCards = document.querySelectorAll('.list-item.game-card, .list-item.hover-game-tile');
    
    listItemCards.forEach(card => {
        if (card.querySelector('.game-block-btn')) return;
        
        const gameId = getGameId(card);
        if (!gameId) return;
        
        const titleElement = card.querySelector('.game-card-name') || card.querySelector('[title]');
        const gameTitle = titleElement ? titleElement.textContent.trim() : gameId;
        
        const blockBtn = createBlockButton(gameId, gameTitle, card);
        
        // Prefer .game-card-container (parent of <a>) so other-extension overlays on the
        // <a> tag don't intercept clicks. Fall back to the thumbnail container if absent.
        const cardContainer = card.querySelector('.game-card-container');
        if (cardContainer) {
            cardContainer.style.position = 'relative';
            cardContainer.appendChild(blockBtn);
            return;
        }

        const thumbnailContainer = card.querySelector('.game-card-thumb-container') ||
                                   card.querySelector('.thumbnail-2d-container') ||
                                   card.querySelector('.brief-game-icon') ||
                                   card.querySelector('[class*="thumbnail"]');
        if (thumbnailContainer) {
            thumbnailContainer.style.position = 'relative';
            thumbnailContainer.appendChild(blockBtn);
        }
    });
}

function hideBlockedGames() {
    // Reset keyword blocked games tracking for this page
    keywordBlockedGames = [];

    // Helper to check and track keyword blocks
    function checkAndHideByKeyword(element, title, removeElement) {
        const matchedRule = isBlockedByKeywords(title);
        if (matchedRule) {
            // Track this blocked game
            const gameId = getGameId(element) || element.id || 'unknown';
            keywordBlockedGames.push({
                title: title,
                id: gameId,
                matchedKeywords: matchedRule.keywords.join(' + ')
            });
            if (removeElement) {
                removeElement.remove();
            }
            return true;
        }
        return false;
    }

    // 1. Hide game links with ID on the anchor tag
    const gameLinksWithId = document.querySelectorAll('a[href*="/games/"][id]');
    
    gameLinksWithId.forEach(link => {
        const gameId = link.id;
        const removeElement = findRemovableParent(link);
        
        // Check ID-based blocking first
        if (gameId && blockedGames.some(game => game.id === gameId)) {
            if (removeElement) {
                removeElement.remove();
            }
            return;
        }
        
        // Check keyword-based blocking
        const title = getGameTitle(link);
        if (title) {
            checkAndHideByKeyword(link, title, removeElement);
        }
    });

    // 2. Hide wide tiles where ID is on the LI element
    const wideTiles = document.querySelectorAll('li[id][data-testid="wide-game-tile"]');
    
    wideTiles.forEach(tile => {
        const gameId = tile.id;
        
        // Check ID-based blocking first
        if (gameId && blockedGames.some(game => game.id === gameId)) {
            tile.remove();
            return;
        }
        
        // Check keyword-based blocking
        const title = getGameTitle(tile);
        if (title) {
            checkAndHideByKeyword(tile, title, tile);
        }
    });

    // 3. Hide any remaining list-item game cards
    const listItemCards = document.querySelectorAll('.list-item.game-card, .list-item.hover-game-tile');
    
    listItemCards.forEach(card => {
        const gameId = getGameId(card);
        
        // Check ID-based blocking first
        if (gameId && blockedGames.some(game => game.id === gameId)) {
            card.remove();
            return;
        }
        
        // Check keyword-based blocking
        const title = getGameTitle(card);
        if (title) {
            checkAndHideByKeyword(card, title, card);
        }
    });

    // 4. Handle search results grid items
    const gridItems = document.querySelectorAll('.grid-item-container, .featured-grid-item-container');
    
    gridItems.forEach(item => {
        const link = item.querySelector('a[href*="/games/"][id]');
        const gameId = link ? link.id : null;
        
        // Check ID-based blocking first
        if (gameId && blockedGames.some(game => game.id === gameId)) {
            item.remove();
            return;
        }
        
        // Check keyword-based blocking
        const title = getGameTitle(item);
        if (title) {
            checkAndHideByKeyword(item, title, item);
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

// Check if current URL is a game page (can be called before DOM is ready)
function isGamePageUrl() {
    return /^\/games\/\d+/.test(window.location.pathname);
}

// Get the place ID from the URL
function getPlaceIdFromUrl() {
    const match = window.location.pathname.match(/^\/games\/(\d+)/);
    return match ? match[1] : null;
}

// Redirect to blocked page
function redirectToBlockedPage(gameName, gameId) {
    const blockedPageUrl = chrome.runtime.getURL('blocked.html');
    const params = new URLSearchParams({
        name: gameName || 'Unknown Game',
        id: gameId || ''
    });
    window.location.replace(`${blockedPageUrl}?${params.toString()}`);
}

// Check if game is blocked and redirect if needed
async function checkAndRedirectIfBlocked() {
    if (!isGamePageUrl()) return;
    
    try {
        await loadBlockedGamesFromStorage();
        
        // Wait for the game meta data element to appear
        const checkForMetaData = () => {
            const gameMetaData = document.querySelector('#game-detail-meta-data');
            if (gameMetaData) {
                const universeId = gameMetaData.getAttribute('data-universe-id');
                const gameTitle = document.querySelector('h1')?.textContent || 'Unknown Game';
                
                // Check ID-based blocking
                if (universeId && blockedGames.some(game => game.id === universeId)) {
                    redirectToBlockedPage(gameTitle, universeId);
                    return;
                }
                
                // Check keyword-based blocking
                const matchedRule = isBlockedByKeywords(gameTitle);
                if (matchedRule) {
                    redirectToBlockedPage(gameTitle + ' (blocked by keywords: ' + matchedRule.keywords.join(' + ') + ')', universeId);
                }
            } else {
                // Keep checking until meta data appears or timeout
                setTimeout(checkForMetaData, 100);
            }
        };
        
        // Start checking once DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkForMetaData);
        } else {
            checkForMetaData();
        }
    } catch (error) {
        console.error('Failed to check blocked games:', error);
    }
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
      // Redirect to blocked page after blocking
      redirectToBlockedPage(gameTitle, universeId);
    }
  });

  actionSection.style.position = 'relative';
  actionSection.appendChild(blockBtn);
}

// Modify the existing initialization code
function init() {
    // Skip catalog pages — the extension breaks catalog item icon layout
    if (window.location.pathname.startsWith('/catalog')) return;

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

// Check for blocked game page redirect first (runs at document_start)
checkAndRedirectIfBlocked();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getKeywordBlockedGames') {
        sendResponse({ games: keywordBlockedGames });
    } else if (request.action === 'refreshBlocking') {
        // Reload storage and reapply blocking
        loadBlockedGamesFromStorage().then(() => {
            hideBlockedGames();
            sendResponse({ success: true, games: keywordBlockedGames });
        });
        return true; // Keep channel open for async response
    }
});

// Call init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


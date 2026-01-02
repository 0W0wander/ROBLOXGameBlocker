// Current keyset being built
let currentKeyset = [];

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', function() {
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Add active class to clicked tab
    this.classList.add('active');
    document.getElementById(this.dataset.tab + '-tab').classList.add('active');
  });
});

// Load and display blocked games with error handling
function loadBlockedGames(searchTerm = '') {
  chrome.storage.local.get(['blockedGames'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('Error loading blocked games:', chrome.runtime.lastError);
      document.getElementById('blocked-list').innerHTML = '<p>Error loading blocked games</p>';
      return;
    }

    const blockedList = document.getElementById('blocked-list');
    blockedList.innerHTML = '';
    
    if (result.blockedGames && result.blockedGames.length > 0) {
      // Reverse the array to show newest first
      const games = [...result.blockedGames].reverse();
      
      if (searchTerm) {
        // Show search results
        const filteredGames = games.filter(game => 
          game.title.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (filteredGames.length === 0) {
          blockedList.innerHTML = '<p>No matches found</p>';
          return;
        }
        
        filteredGames.forEach(game => displayGame(game, blockedList));
      } else {
        // Show recent games (top 3)
        blockedList.innerHTML = '<h4>Recently Blocked</h4>';
        const recentGames = games.slice(0, 3);
        recentGames.forEach(game => displayGame(game, blockedList));
        
        // Show total count if more than 3 games
        if (games.length > 3) {
          const totalCount = document.createElement('p');
          totalCount.className = 'total-count';
          totalCount.textContent = 'Total blocked games: ' + games.length;
          blockedList.appendChild(totalCount);
        }
      }
    } else {
      blockedList.innerHTML = '<p>No blocked games</p>';
    }
  });
}

// Helper function to display a game entry
function displayGame(game, container) {
  const gameElement = document.createElement('div');
  gameElement.className = 'blocked-game';
  gameElement.innerHTML = 
    '<span>' + escapeHtml(game.title) + ' <small>ID: ' + game.id + '</small></span>' +
    '<button class="remove-btn" data-id="' + game.id + '">Remove</button>';
  container.appendChild(gameElement);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Search functionality
document.getElementById('search-input').addEventListener('input', function(e) {
  loadBlockedGames(e.target.value.trim());
});

// Handle removing games with error handling
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('remove-btn')) {
    const gameId = e.target.getAttribute('data-id');
    const keywordId = e.target.getAttribute('data-keyword-id');
    
    if (keywordId) {
      // Remove keyword rule
      removeKeywordRule(keywordId);
    } else if (gameId) {
      // Remove game
      chrome.storage.local.get(['blockedGames'], function(result) {
        if (chrome.runtime.lastError) {
          console.error('Error loading blocked games:', chrome.runtime.lastError);
          return;
        }

        const blockedGames = result.blockedGames || [];
        const updatedGames = blockedGames.filter(game => game.id !== gameId);
        
        chrome.storage.local.set({ 'blockedGames': updatedGames }, function() {
          if (chrome.runtime.lastError) {
            console.error('Error saving blocked games:', chrome.runtime.lastError);
            return;
          }
          loadBlockedGames();
        });
      });
    }
  }
});

// ==================== KEYWORD KEYSET BUILDER ====================

// Render the current keyset preview
function renderCurrentKeyset() {
  const container = document.getElementById('current-keyset');
  const saveBtn = document.getElementById('save-keyset-btn');
  
  if (currentKeyset.length === 0) {
    container.innerHTML = '<span class="current-keyset-empty">No keywords yet</span>';
    saveBtn.disabled = true;
  } else {
    container.innerHTML = '';
    currentKeyset.forEach((word, index) => {
      if (index > 0) {
        const plus = document.createElement('span');
        plus.className = 'keyset-plus';
        plus.textContent = '+';
        container.appendChild(plus);
      }
      
      const wordEl = document.createElement('span');
      wordEl.className = 'current-word';
      wordEl.innerHTML = escapeHtml(word) + '<span class="remove-word" data-index="' + index + '">x</span>';
      container.appendChild(wordEl);
    });
    saveBtn.disabled = false;
  }
}

// Handle removing a word from current keyset
document.getElementById('current-keyset').addEventListener('click', function(e) {
  if (e.target.classList.contains('remove-word')) {
    const index = parseInt(e.target.getAttribute('data-index'));
    currentKeyset.splice(index, 1);
    renderCurrentKeyset();
  }
});

// Add word to current keyset
function addWordToKeyset() {
  const input = document.getElementById('keyword-input');
  const word = input.value.trim().toLowerCase();
  
  if (!word) return;
  
  // Don't add duplicates
  if (currentKeyset.includes(word)) {
    input.value = '';
    return;
  }
  
  currentKeyset.push(word);
  input.value = '';
  renderCurrentKeyset();
}

// Add word button click
document.getElementById('add-word-btn').addEventListener('click', addWordToKeyset);

// Enter key adds word to keyset
document.getElementById('keyword-input').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    addWordToKeyset();
  }
});

// Save the current keyset as a rule
document.getElementById('save-keyset-btn').addEventListener('click', function() {
  if (currentKeyset.length === 0) return;
  
  chrome.storage.local.get(['blockedKeywords'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('Error loading keyword rules:', chrome.runtime.lastError);
      return;
    }
    
    const rules = result.blockedKeywords || [];
    
    // Check for duplicate rule (same keywords in any order)
    const sortedCurrent = [...currentKeyset].sort();
    const isDuplicate = rules.some(r => {
      const sortedRule = [...r.keywords].sort();
      return sortedRule.length === sortedCurrent.length &&
             sortedRule.every((k, i) => k === sortedCurrent[i]);
    });
    
    if (isDuplicate) {
      currentKeyset = [];
      renderCurrentKeyset();
      return;
    }
    
    // Add new rule
    const newRule = {
      id: Date.now().toString(),
      keywords: [...currentKeyset]
    };
    
    rules.push(newRule);
    
    chrome.storage.local.set({ 'blockedKeywords': rules }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving keyword rules:', chrome.runtime.lastError);
        return;
      }
      currentKeyset = [];
      renderCurrentKeyset();
      loadKeywordRules();
      refreshContentScript();
    });
  });
});

// ==================== KEYWORD RULES ====================

// Load and display keyword rules
function loadKeywordRules() {
  chrome.storage.local.get(['blockedKeywords'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('Error loading keyword rules:', chrome.runtime.lastError);
      document.getElementById('keyword-list').innerHTML = '<p>Error loading keywords</p>';
      return;
    }

    const keywordList = document.getElementById('keyword-list');
    keywordList.innerHTML = '';
    
    const rules = result.blockedKeywords || [];
    
    if (rules.length > 0) {
      rules.forEach(rule => displayKeywordRule(rule, keywordList));
    } else {
      keywordList.innerHTML = '<p class="no-items">No keyword rules yet</p>';
    }
  });
}

// Display a keyword rule
function displayKeywordRule(rule, container) {
  const ruleElement = document.createElement('div');
  ruleElement.className = 'keyword-rule';
  
  const keywordTags = rule.keywords.map(function(k) {
    return '<span class="keyword-tag">' + escapeHtml(k) + '</span>';
  }).join(' + ');
  
  ruleElement.innerHTML = 
    '<span>' + keywordTags + '</span>' +
    '<button class="remove-btn" data-keyword-id="' + rule.id + '">Remove</button>';
  container.appendChild(ruleElement);
}

// Remove keyword rule
function removeKeywordRule(ruleId) {
  chrome.storage.local.get(['blockedKeywords'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('Error loading keyword rules:', chrome.runtime.lastError);
      return;
    }
    
    const rules = result.blockedKeywords || [];
    const updatedRules = rules.filter(r => r.id !== ruleId);
    
    chrome.storage.local.set({ 'blockedKeywords': updatedRules }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving keyword rules:', chrome.runtime.lastError);
        return;
      }
      loadKeywordRules();
      refreshContentScript();
    });
  });
}

// Refresh content script after keyword changes
function refreshContentScript() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('roblox.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshBlocking' });
    }
  });
}

// ==================== EXPORT/IMPORT ====================

// Export functionality with error handling
document.getElementById('export-btn').addEventListener('click', function() {
  chrome.storage.local.get(['blockedGames', 'blockedKeywords'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('Error loading data:', chrome.runtime.lastError);
      return;
    }

    const exportData = {
      blockedGames: result.blockedGames || [],
      blockedKeywords: result.blockedKeywords || []
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportLink = document.createElement('a');
    exportLink.setAttribute('href', dataUri);
    exportLink.setAttribute('download', 'roblox_blocker_data.json');
    exportLink.click();
  });
});

// Import functionality with error handling
document.getElementById('import-btn').addEventListener('click', function() {
  document.getElementById('import-input').click();
});

document.getElementById('import-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedData = JSON.parse(e.target.result);
        
        // Handle both old format (array) and new format (object with blockedGames and blockedKeywords)
        let blockedGames = [];
        let blockedKeywords = [];
        
        if (Array.isArray(importedData)) {
          // Old format - just blocked games array
          blockedGames = importedData;
        } else if (importedData && typeof importedData === 'object') {
          blockedGames = importedData.blockedGames || [];
          blockedKeywords = importedData.blockedKeywords || [];
        }
        
        chrome.storage.local.set({ 
          'blockedGames': blockedGames,
          'blockedKeywords': blockedKeywords
        }, function() {
          if (chrome.runtime.lastError) {
            console.error('Error importing data:', chrome.runtime.lastError);
            return;
          }
          loadBlockedGames();
          loadKeywordRules();
          refreshContentScript();
        });
      } catch (error) {
        console.error('Invalid file format:', error);
      }
    };
    reader.readAsText(file);
  }
});

// ==================== INITIALIZATION ====================

// Initial load with error handling
document.addEventListener('DOMContentLoaded', function() {
  // Clear inputs on popup open
  document.getElementById('search-input').value = '';
  document.getElementById('keyword-input').value = '';
  
  // Reset current keyset
  currentKeyset = [];
  renderCurrentKeyset();
  
  // Load blocked games
  loadBlockedGames('');
  
  // Load keyword rules
  loadKeywordRules();
});

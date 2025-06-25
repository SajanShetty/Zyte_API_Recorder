// background.js (Enhanced Version with Tab Cleanup, Auto-reconnection, and Settings)
let recordingStates = {}; 

// Default settings
const DEFAULT_SETTINGS = {
    classBlacklist: [
        // Original patterns
        '_*', 'css-*', 'jss*', 'makeStyles-*', 'MuiButton-root-*',
        
        // Enhanced CSS-in-JS patterns
        'sc-*',           // styled-components
        'emotion-*',      // emotion
        'jsx-*',          // styled-jsx
        
        // Framework-specific patterns
        'vue-*',          // Vue.js
        'ng-*',           // Angular
        'svelte-*',       // Svelte
        
        // Build tool patterns
        'webpack-*',      // Webpack
        'vite-*',         // Vite
        
        // Dynamic/generated patterns
        '*-[0-9]*-[0-9]*', // Multi-digit patterns
        '*[0-9][0-9][0-9]*', // 3+ consecutive digits
        '*-hash-*',       // Hash indicators
        '*-generated-*',  // Generated indicators
        
        // Utility class patterns (often dynamic)
        'p-[0-9]*',       // Tailwind spacing
        'm-[0-9]*',       // Tailwind margins
        'w-[0-9]*',       // Tailwind widths
        'h-[0-9]*',       // Tailwind heights
    ],
    
    classWhitelist: [
        // Original patterns
        'btn*', 'button*', 'primary', 'secondary', 'submit', 'cancel',
        'nav*', 'menu*', 'form*', 'input*',
        
        // Enhanced semantic UI patterns
        'header*', 'footer*', 'sidebar*', 'content*', 'main*',
        'card*', 'modal*', 'dialog*', 'popup*', 'tooltip*',
        'dropdown*', 'select*', 'checkbox*', 'radio*',
        'tab*', 'accordion*', 'collapse*', 'panel*',
        'alert*', 'notice*', 'message*', 'notification*',
        'badge*', 'tag*', 'label*', 'chip*',
        'table*', 'row*', 'cell*', 'column*',
        'list*', 'item*', 'link*', 'text*',
        'icon*', 'image*', 'avatar*', 'logo*',
        'search*', 'filter*', 'sort*', 'pagination*',
        
        // State classes
        'active', 'disabled', 'selected', 'checked', 'expanded',
        'collapsed', 'open', 'closed', 'visible', 'hidden',
        
        // Size/variant classes
        'small', 'medium', 'large', 'xl', 'xs',
        'compact', 'full', 'mini', 'tiny',
        
        // Color/theme classes (common semantic ones)
        'success', 'error', 'warning', 'info',
        'dark', 'light', 'theme*',
    ],
    
    // Keep existing settings
    scrollDelay: 1000,
    replayDelay: 500,
    navigationTimeout: 10000,
    highlightElements: true,
    hoverDuration: 1000,
    
    // ENHANCED SELECTOR SETTINGS - New additions
    enableEnhancedSelectors: true,     // Toggle enhanced vs simple generation
    debugMode: false,                  // Enable detailed console logging
    maxAlternatives: 20,               // Increased from 15
    prioritizeTestAttributes: true,    // Give highest priority to data-testid, etc.
    enableOptimization: true,          // Enable XPath optimization
    enableElementState: true,

    // NEW PERFORMANCE SETTINGS
    maxParentDepth: 3,                 // How many parent levels to analyze
    maxSiblingDistance: 5,             // How far to search for sibling context
    maxTextLength: 100,                // Maximum text length for text-based selectors
    maxSelectorLength: 300,            // Maximum overall selector length
    selectorTimeoutMs: 1000,           // Timeout for selector generation
    earlyExitThreshold: 5              // Stop when we have N high-scoring selectors
};


// Initialize settings on extension startup
chrome.runtime.onStartup.addListener(() => {
    initializeSettings();
});

chrome.runtime.onInstalled.addListener(() => {
    initializeSettings();
});

function initializeSettings() {
    chrome.storage.local.get(['extensionSettings'], (result) => {
        if (!result.extensionSettings) {
            chrome.storage.local.set({
                extensionSettings: DEFAULT_SETTINGS
            });
        } else {
            // Merge with new settings to handle upgrades
            const mergedSettings = {
                ...DEFAULT_SETTINGS,
                ...result.extensionSettings
            };
            
            // Update storage with merged settings (adds new properties if missing)
            chrome.storage.local.set({
                extensionSettings: mergedSettings
            });
        }
    });
}


function validateSettings(settings) {
    const validatedSettings = { ...settings };
    
    // Ensure arrays exist
    if (!Array.isArray(validatedSettings.classBlacklist)) {
        validatedSettings.classBlacklist = DEFAULT_SETTINGS.classBlacklist;
    }
    if (!Array.isArray(validatedSettings.classWhitelist)) {
        validatedSettings.classWhitelist = DEFAULT_SETTINGS.classWhitelist;
    }
    
    // Validate existing number settings
    if (typeof validatedSettings.maxAlternatives !== 'number' || 
        validatedSettings.maxAlternatives < 5 || 
        validatedSettings.maxAlternatives > 50) {
        validatedSettings.maxAlternatives = DEFAULT_SETTINGS.maxAlternatives;
    }
    
    if (typeof validatedSettings.scrollDelay !== 'number' || 
        validatedSettings.scrollDelay < 100 || 
        validatedSettings.scrollDelay > 10000) {
        validatedSettings.scrollDelay = DEFAULT_SETTINGS.scrollDelay;
    }
    
    if (typeof validatedSettings.replayDelay !== 'number' || 
        validatedSettings.replayDelay < 100 || 
        validatedSettings.replayDelay > 5000) {
        validatedSettings.replayDelay = DEFAULT_SETTINGS.replayDelay;
    }
    
    if (typeof validatedSettings.navigationTimeout !== 'number' || 
        validatedSettings.navigationTimeout < 1000 || 
        validatedSettings.navigationTimeout > 60000) {
        validatedSettings.navigationTimeout = DEFAULT_SETTINGS.navigationTimeout;
    }
    
    if (typeof validatedSettings.hoverDuration !== 'number' || 
        validatedSettings.hoverDuration < 100 || 
        validatedSettings.hoverDuration > 5000) {
        validatedSettings.hoverDuration = DEFAULT_SETTINGS.hoverDuration;
    }
    
    // Validate existing boolean settings
    if (typeof validatedSettings.highlightElements !== 'boolean') {
        validatedSettings.highlightElements = DEFAULT_SETTINGS.highlightElements;
    }
    if (typeof validatedSettings.enableOptimization !== 'boolean') {
        validatedSettings.enableOptimization = DEFAULT_SETTINGS.enableOptimization;
    }
    if (typeof validatedSettings.prioritizeTestAttributes !== 'boolean') {
        validatedSettings.prioritizeTestAttributes = DEFAULT_SETTINGS.prioritizeTestAttributes;
    }
    
    // NEW VALIDATIONS - Enhanced selector settings
    if (typeof validatedSettings.enableEnhancedSelectors !== 'boolean') {
        validatedSettings.enableEnhancedSelectors = DEFAULT_SETTINGS.enableEnhancedSelectors;
    }
    
    if (typeof validatedSettings.debugMode !== 'boolean') {
        validatedSettings.debugMode = DEFAULT_SETTINGS.debugMode;
    }
    
    // NEW VALIDATIONS - Performance settings
    if (typeof validatedSettings.maxParentDepth !== 'number' || 
        validatedSettings.maxParentDepth < 1 || 
        validatedSettings.maxParentDepth > 10) {
        validatedSettings.maxParentDepth = DEFAULT_SETTINGS.maxParentDepth;
    }
    
    if (typeof validatedSettings.maxSiblingDistance !== 'number' || 
        validatedSettings.maxSiblingDistance < 1 || 
        validatedSettings.maxSiblingDistance > 15) {
        validatedSettings.maxSiblingDistance = DEFAULT_SETTINGS.maxSiblingDistance;
    }
    
    if (typeof validatedSettings.maxTextLength !== 'number' || 
        validatedSettings.maxTextLength < 20 || 
        validatedSettings.maxTextLength > 500) {
        validatedSettings.maxTextLength = DEFAULT_SETTINGS.maxTextLength;
    }
    
    if (typeof validatedSettings.maxSelectorLength !== 'number' || 
        validatedSettings.maxSelectorLength < 100 || 
        validatedSettings.maxSelectorLength > 1000) {
        validatedSettings.maxSelectorLength = DEFAULT_SETTINGS.maxSelectorLength;
    }
    
    if (typeof validatedSettings.selectorTimeoutMs !== 'number' || 
        validatedSettings.selectorTimeoutMs < 100 || 
        validatedSettings.selectorTimeoutMs > 10000) {
        validatedSettings.selectorTimeoutMs = DEFAULT_SETTINGS.selectorTimeoutMs;
    }
    
    if (typeof validatedSettings.earlyExitThreshold !== 'number' || 
        validatedSettings.earlyExitThreshold < 1 || 
        validatedSettings.earlyExitThreshold > 20) {
        validatedSettings.earlyExitThreshold = DEFAULT_SETTINGS.earlyExitThreshold;
    }

    if (typeof validatedSettings.enableElementState !== 'boolean') {
        validatedSettings.enableElementState = DEFAULT_SETTINGS.enableElementState;
    }
    
    return validatedSettings;
}

// Helper function to safely send messages through port
function safePortMessage(port, message) {
    try {
        if (port && port.postMessage) {
            port.postMessage(message);
        }
    } catch (error) {
        console.log('Port message failed (likely BFCache):', error.message);
        // Port is closed, clean up the state
        return false;
    }
    return true;
}

// Auto-reconnection state management
let reconnectionAttempts = {};
const MAX_RECONNECTION_ATTEMPTS = 5;
const RECONNECTION_DELAY_BASE = 1000; // 1 second base delay

function attemptReconnection(tabId, portName) {
    if (!reconnectionAttempts[tabId]) {
        reconnectionAttempts[tabId] = 0;
    }
    
    reconnectionAttempts[tabId]++;
    
    if (reconnectionAttempts[tabId] > MAX_RECONNECTION_ATTEMPTS) {
        console.log(`Max reconnection attempts reached for tab ${tabId}`);
        delete reconnectionAttempts[tabId];
        return;
    }
    
    const delay = RECONNECTION_DELAY_BASE * Math.pow(2, reconnectionAttempts[tabId] - 1); // Exponential backoff
    
    setTimeout(() => {
        // Check if recording state still exists and needs reconnection
        if (recordingStates[tabId] && !recordingStates[tabId].port) {
            console.log(`Attempting reconnection ${reconnectionAttempts[tabId]} for tab ${tabId}`);
            // The devtools panel will need to initiate the reconnection
            // We just maintain the recording state here
        }
    }, delay);
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'devtools') return;
    let tabId;
    
    port.onMessage.addListener((message) => {
        if (!message.tabId) return;
        tabId = message.tabId;

        if (!recordingStates[tabId]) {
            recordingStates[tabId] = { isRecording: false, port: port };
        } else {
            // Update the port reference in case of reconnection
            recordingStates[tabId].port = port;
            // Reset reconnection attempts on successful connection
            delete reconnectionAttempts[tabId];
        }

        switch (message.type) {
            case 'start_recording':
                recordingStates[tabId].isRecording = true;
                chrome.tabs.sendMessage(tabId, { type: 'start_recording' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Could not notify content script of recording start:', chrome.runtime.lastError.message);
                    } else if (response) {
                        console.log('Content script confirmed recording started:', response.status);
                    }
                });
                break;

            case 'stop_recording':
                if (recordingStates[tabId]) {
                    // Tell the content script to flush any pending actions before stopping
                    chrome.tabs.sendMessage(tabId, { type: 'flush_buffer' }, (response) => {
                        // After flush is complete, stop recording and notify content script
                        recordingStates[tabId].isRecording = false;
                        
                        // NEW: Notify content script to stop listeners
                        chrome.tabs.sendMessage(tabId, { type: 'stop_recording' }, (stopResponse) => {
                            if (chrome.runtime.lastError) {
                                console.warn('Could not notify content script of recording stop:', chrome.runtime.lastError.message);
                            } else if (stopResponse) {
                                console.log('Content script confirmed recording stopped:', stopResponse.status);
                            }
                        });
                    });
                }
                break;
            case 'start_picker_mode':
                chrome.tabs.sendMessage(tabId, { 
                    type: 'start_element_picker', 
                    action: message.action 
                }).catch(() => {
                    // Ignore errors if tab is not available
                });
                break;
            case 'record_scroll_to':
                console.log('Sending get_scroll_position message to tab:', tabId);
                // Use chrome.scripting.executeScript to run in main frame only
                chrome.scripting.executeScript({
                    target: { tabId: tabId, allFrames: false }, // Only main frame
                    func: () => {
                        // Try multiple methods to get scroll position
                        let x = 0, y = 0;
                        
                        // Method 1: window scroll
                        if (window.scrollX !== undefined && window.scrollY !== undefined) {
                            x = window.scrollX;
                            y = window.scrollY;
                        }
                        
                        // Method 2: document.documentElement scroll (most common)
                        if (x === 0 && y === 0) {
                            x = document.documentElement.scrollLeft || 0;
                            y = document.documentElement.scrollTop || 0;
                        }
                        
                        // Method 3: document.body scroll (fallback)
                        if (x === 0 && y === 0 && document.body) {
                            x = document.body.scrollLeft || 0;
                            y = document.body.scrollTop || 0;
                        }
                        
                        return { x, y };
                    }
                }, (results) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting scroll position:', chrome.runtime.lastError);
                        return;
                    }
                    
                    if (results && results[0] && results[0].result) {
                        const { x, y } = results[0].result;
                        console.log('Got scroll position from main frame:', { x, y });
                        const scrollToAction = {
                            action: 'scrollTo',
                            top: Math.round(y),
                            left: Math.round(x),
                            onError: 'return'
                        };
                        port.postMessage({ type: 'new_action', action: scrollToAction });
                    } else {
                        console.error('Invalid scroll position response:', results);
                    }
                });
                break;
            case 'get_settings':
                // New case to provide settings to content script if needed
                chrome.storage.local.get(['extensionSettings'], (result) => {
                    const settings = result.extensionSettings || DEFAULT_SETTINGS;
                    const validatedSettings = validateSettings(settings);
                    
                    if (port && port.postMessage) {
                        port.postMessage({
                            type: 'settings_response',
                            settings: validatedSettings
                        });
                    }
                });
                break;
                
            case 'update_settings':
                // New case to update settings from devtools panel
                if (message.settings) {
                    const validatedSettings = validateSettings(message.settings);
                    chrome.storage.local.set({
                        extensionSettings: validatedSettings
                    }, () => {
                        if (port && port.postMessage) {
                            port.postMessage({
                                type: 'settings_updated',
                                success: true
                            });
                        }
                    });
                }
                break;
        }
    });

    port.onDisconnect.addListener(() => {
        if (tabId && recordingStates[tabId]) {
            // Don't delete the recording state immediately - prepare for potential reconnection
            recordingStates[tabId].port = null;
            
            // If we were recording, attempt reconnection
            if (recordingStates[tabId].isRecording) {
                attemptReconnection(tabId, 'devtools');
            } else {
                // If not recording, clean up after a short delay
                setTimeout(() => {
                    if (recordingStates[tabId] && !recordingStates[tabId].port) {
                        delete recordingStates[tabId];
                    }
                }, 5000);
            }
        }
    });
});

// In background.js, find the chrome.runtime.onMessage.addListener and replace it with this:

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!sender.tab) return; // Ignore messages from other extension contexts
    const tabId = sender.tab.id;
    const state = recordingStates[tabId];
    
    console.log('📨 RECEIVED MESSAGE:', message.type, 'from tab:', tabId, 'recording:', state?.isRecording);
    
    // NEW: Handle recording state requests
    if (message.type === 'get_recording_state') {
        const isRecording = state?.isRecording || false;
        console.log(`Content script asking for recording state for tab ${tabId}: ${isRecording}`);
        sendResponse({ isRecording: isRecording });
        return true; // Keep the message channel open for async response
    }
    
    // Special handling for flush_complete messages - these should always be processed
    if (message.type === 'flush_complete') {
        if (state && state.port && message.action) {
            state.port.postMessage({ type: 'new_action', action: message.action });
        }
        sendResponse({ status: 'received' });
        return true;
    }
    
    // Normal recording messages - only process when recording
    if (state?.isRecording && state.port) {
        if (message.type === 'recorded_action' || message.type === 'element_picked') {
            state.port.postMessage({ type: 'new_action', action: message.action });
        }
    }
    
    // Always return true to keep the message channel open
    return true;
});

// Enhanced navigation handling with Shadow DOM flush
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    const { tabId, url } = details;
    const state = recordingStates[tabId];
    
    // If we're recording and have a valid port, tell content script to flush shadow DOM buffer
    if (state?.isRecording && state.port && url !== 'about:blank') {
        chrome.tabs.sendMessage(tabId, { type: 'flush_before_navigation' }).catch(() => {
            // Ignore errors if content script is not available
        });
    }
});

chrome.webNavigation.onCommitted.addListener((details) => {
    const { tabId, transitionType, url } = details;
    const state = recordingStates[tabId];
    
    // Check if we have a valid recording state and port
    if (state?.isRecording && state.port && url !== 'about:blank') {
        
        // Handle reload separately (keep existing logic)
        if (transitionType === 'reload') {
            const success = safePortMessage(state.port, { 
                type: 'new_action', 
                action: { action: 'reload', onError: 'return' } 
            });
            
            if (!success) {
                state.port = null;
                attemptReconnection(tabId, 'devtools');
            }
            return; // Exit early for reload
        }
        
        // Map transition types to actions
        const gotoTransitions = ['typed', 'auto_bookmark', 'keyword', 'generated'];
        const waitForNavigationTransitions = ['link', 'form_submit'];
        
        let actionToRecord = null;
        
        if (gotoTransitions.includes(transitionType)) {
            // Manual navigation types → goto action
            actionToRecord = { action: 'goto', url: url, onError: 'return' };
        } else if (waitForNavigationTransitions.includes(transitionType)) {
            // Interaction-triggered navigation → waitForNavigation
            actionToRecord = { action: 'waitForNavigation', onError: 'return' };
        } else {
            // Any other transition type → waitForNavigation (catch-all for JS redirects, etc.)
            actionToRecord = { action: 'waitForNavigation', onError: 'return' };
        }
        
        if (actionToRecord) {
            setTimeout(() => {
                // Re-check if state still exists after timeout
                if (recordingStates[tabId]?.isRecording && recordingStates[tabId]?.port) {
                    chrome.tabs.get(tabId, (tab) => {
                        if (chrome.runtime.lastError) {
                            // Tab might be closed, clean up
                            delete recordingStates[tabId];
                            return;
                        }
                        
                        if (tab && tab.url === url) { // Ensure this is the final URL
                            const success = safePortMessage(recordingStates[tabId].port, { 
                                type: 'new_action', 
                                action: actionToRecord 
                            });
                            
                            if (!success) {
                                recordingStates[tabId].port = null;
                                attemptReconnection(tabId, 'devtools');
                            }
                        }
                    });
                }
            }, 100);
        }
    }
});

// Tab close cleanup
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (recordingStates[tabId]) {
        console.log(`Cleaning up recording state for closed tab ${tabId}`);
        delete recordingStates[tabId];
        delete reconnectionAttempts[tabId];
    }
});

// Tab update cleanup for navigation away from recorded sites
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Clean up recording state if user navigates to completely different site and not recording
    if (changeInfo.url && recordingStates[tabId] && !recordingStates[tabId].isRecording) {
        const state = recordingStates[tabId];
        if (state.originalUrl && !changeInfo.url.includes(new URL(state.originalUrl).hostname)) {
            console.log(`Cleaning up recording state for tab ${tabId} - navigated away from original site`);
            delete recordingStates[tabId];
        }
    }
});

// Clean up disconnected ports periodically (reduced frequency)
setInterval(() => {
    Object.keys(recordingStates).forEach(tabId => {
        const state = recordingStates[tabId];
        if (state?.port) {
            // Test if port is still valid by trying to access its properties
            try {
                // We don't actually send this, just test if the port exists
                if (!state.port.postMessage) {
                    delete recordingStates[tabId];
                }
            } catch (error) {
                delete recordingStates[tabId];
            }
        }
    });
}, 60000); // Clean up every 60 seconds (reduced from 30)

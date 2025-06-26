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


// Session storage helper functions
async function saveRecordingState(tabId, state, isNewRecording = false) {
    try {
        if (isNewRecording) {
            // Clean up previous sessions from this tab and closed tabs
            await cleanupSessionsForNewRecording(tabId);
        }
        
        const timestamp = Date.now();
        const key = `zyte_recorder_session_${tabId}`;
        
        const sessionData = {
            ...state,
            tabId,
            startTime: state.startTime || timestamp,
            lastActivity: timestamp
        };
        
        await chrome.storage.session.set({ [key]: sessionData });
        console.log(`📦 Saved recording state for tab ${tabId}: ${key}`);
        
    } catch (error) {
        console.error('Failed to save recording state:', error);
    }
}

async function updateRecordingActivity(tabId) {
    try {
        const key = `zyte_recorder_session_${tabId}`;
        const result = await chrome.storage.session.get([key]);
        
        if (result[key]) {
            const updatedData = {
                ...result[key],
                lastActivity: Date.now()
            };
            
            await chrome.storage.session.set({ [key]: updatedData });
            console.log(`📦 Updated activity for tab ${tabId}`);
        }
    } catch (error) {
        console.error('Failed to update recording activity:', error);
    }
}

async function getRecordingState(tabId) {
    try {
        const key = `zyte_recorder_session_${tabId}`;
        const result = await chrome.storage.session.get([key]);
        
        if (result[key]) {
            console.log(`📦 Retrieved recording state for tab ${tabId}: ${key}`);
            return result[key];
        }
        
        return null;
    } catch (error) {
        console.error('Failed to get recording state:', error);
        return null;
    }
}

async function getAllSessions() {
    try {
        const result = await chrome.storage.session.get();
        const sessions = new Map();
        
        Object.keys(result).forEach(key => {
            if (key.startsWith('zyte_recorder_session_')) {
                sessions.set(key, result[key]);
            }
        });
        
        return sessions;
    } catch (error) {
        console.error('Failed to get all sessions:', error);
        return new Map();
    }
}

    // Enhanced port connection tracking for navigation resistance
    let panelConnections = new Map(); // tabId -> { port, lastSeen }

    function registerPanelConnection(tabId, port) {
        // Clean up any existing connection for this tab
        if (panelConnections.has(tabId)) {
            const existing = panelConnections.get(tabId);
            try {
                if (existing.port && existing.port !== port) {
                    existing.port.disconnect();
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        
        panelConnections.set(tabId, {
            port: port,
            lastSeen: Date.now(),
            connected: true
        });
        
        console.log(`📱 Panel connected for tab ${tabId}`);
        
        // Send confirmation back to panel
        try {
            port.postMessage({ type: 'connection_confirmed', tabId: tabId });
        } catch (error) {
            console.warn('Failed to confirm connection:', error);
        }
    }

    function getPanelConnection(tabId) {
        const connection = panelConnections.get(tabId);
        if (connection && connection.connected) {
            // Update last seen
            connection.lastSeen = Date.now();
            return connection.port;
        }
        return null;
    }

    function cleanupPanelConnection(tabId, port) {
        const connection = panelConnections.get(tabId);
        if (connection && connection.port === port) {
            connection.connected = false;
            panelConnections.delete(tabId);
            console.log(`📱 Panel disconnected for tab ${tabId}`);
        }
    }

    // Periodic cleanup of stale panel connections
    // setInterval(() => {
    //     const now = Date.now();
    //     const staleTimeout = 30000; // 30 seconds
        
    //     for (const [tabId, connection] of panelConnections.entries()) {
    //         if (now - connection.lastSeen > staleTimeout) {
    //             console.log(`📱 Cleaning up stale panel connection for tab ${tabId}`);
    //             panelConnections.delete(tabId);
    //         }
    //     }
    // }, 60000); // Check every minute



async function cleanupSessionsForNewRecording(currentTabId) {
    try {
        console.log('🧹 Starting cleanup for new recording in tab:', currentTabId);
        
        // Get all sessions
        const sessions = await getAllSessions();
        
        if (sessions.size === 0) {
            console.log('🧹 No sessions to cleanup');
            return;
        }
        
        // Get open tabs
        const openTabs = await chrome.tabs.query({});
        const openTabIds = openTabs.map(tab => tab.id.toString());
        
        const keysToDelete = [];
        
        for (const [key, sessionData] of sessions) {
            const sessionTabId = sessionData?.tabId?.toString();
            
            // Delete sessions from current tab (previous recordings)
            if (sessionTabId === currentTabId.toString()) {
                keysToDelete.push(key);
                console.log(`🧹 Marking for cleanup: previous session from current tab ${sessionTabId}`);
                continue;
            }
            
            // Delete sessions from closed tabs
            if (sessionTabId && !openTabIds.includes(sessionTabId)) {
                keysToDelete.push(key);
                console.log(`🧹 Marking for cleanup: session from closed tab ${sessionTabId}`);
                continue;
            }
        }
        
        if (keysToDelete.length > 0) {
            await chrome.storage.session.remove(keysToDelete);
            console.log(`🧹 Cleaned up ${keysToDelete.length} sessions:`, keysToDelete);
        } else {
            console.log('🧹 No sessions needed cleanup');
        }
        
    } catch (error) {
        console.error('Session cleanup failed:', error);
        // Retry once silently
        setTimeout(() => {
            cleanupSessionsForNewRecording(currentTabId).catch(() => {
                console.warn('Session cleanup retry failed - some old sessions may remain');
            });
        }, 1000);
    }
}

async function cleanupClosedTabSessions() {
    try {
        console.log('🧹 Starting cleanup of closed tab sessions');
        
        // Get all sessions and open tabs
        const sessions = await getAllSessions();
        const openTabs = await chrome.tabs.query({});
        const openTabIds = openTabs.map(tab => tab.id.toString());
        
        const keysToDelete = [];
        
        for (const [key, sessionData] of sessions) {
            const sessionTabId = sessionData?.tabId?.toString();
            
            // Only delete sessions from closed tabs, keep active recordings
            if (sessionTabId && !openTabIds.includes(sessionTabId)) {
                keysToDelete.push(key);
            }
        }
        
        if (keysToDelete.length > 0) {
            await chrome.storage.session.remove(keysToDelete);
            console.log(`🧹 Cleaned up ${keysToDelete.length} closed tab sessions`);
        }
        
    } catch (error) {
        console.error('Closed tab session cleanup failed:', error);
    }
}

async function cleanupOldSessions() {
    try {
        console.log('🧹 Starting cleanup of old stopped sessions');
        
        const sessions = await getAllSessions();
        const keysToDelete = [];
        const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour
        
        for (const [key, sessionData] of sessions) {
            // Only cleanup stopped sessions older than 1 hour
            if (!sessionData.isRecording && sessionData.lastActivity < oneHourAgo) {
                keysToDelete.push(key);
            }
        }
        
        if (keysToDelete.length > 0) {
            await chrome.storage.session.remove(keysToDelete);
            console.log(`🧹 Cleaned up ${keysToDelete.length} old stopped sessions`);
        }
        
    } catch (error) {
        console.error('Old session cleanup failed:', error);
    }
}

async function deleteSessionForTab(tabId) {
    try {
        const key = `zyte_recorder_session_${tabId}`;
        await chrome.storage.session.remove([key]);
        console.log(`🧹 Deleted session for tab ${tabId}: ${key}`);
    } catch (error) {
        console.error('Failed to delete session for tab:', error);
    }
}

async function cleanupSessionStorage(options = {}) {
    const { 
        cleanupStopped = true, 
        cleanupClosedTabs = true, 
        cleanupAll = false,
        currentTabId = null 
    } = options;
    
    try {
        console.log('🧹 Starting session storage cleanup:', options);
        
        const result = await chrome.storage.session.get();
        const sessionKeys = Object.keys(result).filter(key => 
            key.startsWith('zyte_recorder_session_')
        );
        
        if (sessionKeys.length === 0) {
            console.log('🧹 No sessions to cleanup');
            return;
        }
        
        // Get all open tabs
        let openTabIds = [];
        if (cleanupClosedTabs) {
            try {
                const tabs = await chrome.tabs.query({});
                openTabIds = tabs.map(tab => tab.id.toString());
            } catch (error) {
                console.warn('Could not query tabs for cleanup:', error);
            }
        }
        
        const keysToDelete = [];
        
        for (const key of sessionKeys) {
            const sessionData = result[key];
            const tabId = sessionData?.tabId?.toString();
            
            // Cleanup all sessions (for start recording)
            if (cleanupAll) {
                keysToDelete.push(key);
                continue;
            }
            
            // Cleanup stopped sessions
            if (cleanupStopped && !sessionData?.isRecording) {
                const age = Date.now() - sessionData.timestamp;
                if (age > 5 * 60 * 1000) { // 5 minutes
                    keysToDelete.push(key);
                    continue;
                }
            }
            
            // Cleanup sessions from closed tabs
            if (cleanupClosedTabs && tabId && !openTabIds.includes(tabId)) {
                keysToDelete.push(key);
                continue;
            }
        }
        
        if (keysToDelete.length > 0) {
            await chrome.storage.session.remove(keysToDelete);
            console.log(`🧹 Cleaned up ${keysToDelete.length} sessions:`, keysToDelete);
        } else {
            console.log('🧹 No sessions needed cleanup');
        }
        
    } catch (error) {
        console.error('Session storage cleanup failed:', error);
        // Retry once silently
        setTimeout(() => {
            cleanupSessionStorage(options).catch(() => {
                console.warn('Session storage cleanup retry failed - this may cause storage accumulation');
            });
        }, 1000);
    }
}

// Initialize settings on extension startup
chrome.runtime.onStartup.addListener(() => {
    initializeSettings();
});

function initializeSettings() {
    // Cleanup old sessions on startup
    cleanupOldSessions();
    
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
    
    port.onMessage.addListener(async (message) => {
        // Handle panel connection registration
        if (message.type === 'panel_connected') {
            tabId = message.tabId;
            registerPanelConnection(tabId, port);
            
            // Initialize or restore recording state
            if (!recordingStates[tabId]) {
                const savedState = await getRecordingState(tabId);
                recordingStates[tabId] = { 
                    isRecording: savedState?.isRecording || false, 
                    port: port 
                };
                
                if (savedState?.isRecording) {
                    console.log(`📦 Restored recording state for tab ${tabId}`);
                }
            } else {
                recordingStates[tabId].port = port;
                delete reconnectionAttempts[tabId];
            }
            return;
        }
        
        if (!message.tabId) return;
        tabId = message.tabId;

        // Ensure we have the current port reference
        if (recordingStates[tabId]) {
            recordingStates[tabId].port = port;
        }

        switch (message.type) {
            case 'start_recording':
                await deleteSessionForTab(tabId);
                await cleanupSessionsForNewRecording(tabId);
                
                recordingStates[tabId] = recordingStates[tabId] || {};
                recordingStates[tabId].isRecording = true;
                recordingStates[tabId].port = port;
                
                await saveRecordingState(tabId, { 
                    isRecording: true,
                    url: message.url || 'unknown' 
                }, true);
                
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
                    chrome.tabs.sendMessage(tabId, { type: 'flush_buffer' }, async (response) => {
                        recordingStates[tabId].isRecording = false;
                        await deleteSessionForTab(tabId);
                        
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
                
            // Keep all other existing cases unchanged
            case 'start_picker_mode':
                chrome.tabs.sendMessage(tabId, { 
                    type: 'start_element_picker', 
                    action: message.action 
                }).catch(() => {});
                break;
                
            case 'record_scroll_to':
                console.log('Sending get_scroll_position message to tab:', tabId);
                chrome.scripting.executeScript({
                    target: { tabId: tabId, allFrames: false },
                    func: () => {
                        let x = 0, y = 0;
                        
                        if (window.scrollX !== undefined && window.scrollY !== undefined) {
                            x = window.scrollX;
                            y = window.scrollY;
                        }
                        
                        if (x === 0 && y === 0) {
                            x = document.documentElement.scrollLeft || 0;
                            y = document.documentElement.scrollTop || 0;
                        }
                        
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
                        
                        // Use the enhanced panel connection
                        const panelPort = getPanelConnection(tabId);
                        if (panelPort) {
                            try {
                                panelPort.postMessage({ type: 'new_action', action: scrollToAction });
                            } catch (error) {
                                console.warn('Failed to send scroll action to panel:', error);
                            }
                        }
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
        if (tabId) {
            cleanupPanelConnection(tabId, port);
            
            if (recordingStates[tabId]) {
                recordingStates[tabId].port = null;
                
                if (recordingStates[tabId].isRecording) {
                    attemptReconnection(tabId, 'devtools');
                } else {
                    setTimeout(() => {
                        if (recordingStates[tabId] && !recordingStates[tabId].port) {
                            delete recordingStates[tabId];
                        }
                    }, 5000);
                }
            }
        }
    });
});

// In background.js, find the chrome.runtime.onMessage.addListener and replace it with this:

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!sender.tab) return; // Ignore messages from other extension contexts
    const tabId = sender.tab.id;
    let state = recordingStates[tabId];
    
    console.log('📨 RECEIVED MESSAGE:', message.type, 'from tab:', tabId, 'recording:', state?.isRecording);
    
    // Handle recording state requests with session storage fallback
    if (message.type === 'get_recording_state') {
        let isRecording = state?.isRecording || false;
        
        // If no state in memory, try session storage
        if (!state || state.isRecording === undefined) {
            getRecordingState(tabId).then(savedState => {
                const recording = savedState?.isRecording || false;
                console.log(`Content script asking for recording state for tab ${tabId}: ${recording} (from session storage)`);
                
                // Restore state if found
                if (savedState?.isRecording) {
                    recordingStates[tabId] = { isRecording: true, port: null };
                }
                
                sendResponse({ isRecording: recording });
            }).catch(() => {
                sendResponse({ isRecording: false });
            });
            return true; // Keep message channel open for async response
        }
        
        console.log(`Content script asking for recording state for tab ${tabId}: ${isRecording}`);
        sendResponse({ isRecording: isRecording });
        return true;
    }
    
    // Update activity when recording actions (use new updateRecordingActivity function)
    if (message.type === 'recorded_action' && state?.isRecording) {
        updateRecordingActivity(tabId).catch(console.error);
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
    if (state?.isRecording) {
        if (message.type === 'recorded_action' || message.type === 'element_picked') {
            // Try to send to panel using enhanced connection
            const panelPort = getPanelConnection(tabId);
            if (panelPort) {
                try {
                    panelPort.postMessage({ type: 'new_action', action: message.action });
                } catch (error) {
                    console.warn('Failed to send action to panel:', error);
                    // Clean up broken connection
                    cleanupPanelConnection(tabId, panelPort);
                }
            } else {
                console.warn('No panel connection available for tab:', tabId);
            }
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
// Enhanced tab close cleanup with session storage
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (recordingStates[tabId]) {
        console.log(`Cleaning up recording state for closed tab ${tabId}`);
        delete recordingStates[tabId];
        delete reconnectionAttempts[tabId];
    }
    
    // Clean up session storage for closed tab
    deleteSessionForTab(tabId).catch(console.error);
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
// Periodic cleanup of closed tab sessions (every 5 minutes)
setInterval(() => {
    cleanupClosedTabSessions().catch(console.error);
}, 5 * 60 * 1000); // 5 minutes

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

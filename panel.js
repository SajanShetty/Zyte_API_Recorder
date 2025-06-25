document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyPayloadBtn = document.getElementById('copy-payload-btn');
    const replayBtn = document.getElementById('replay-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const hoverBtn = document.getElementById('hover-btn');
    const hideBtn = document.getElementById('hide-btn');
    const scrollToBtn = document.getElementById('scroll-to-btn');
    const waitForElementBtn = document.getElementById('wait-for-element-btn');
    const waitTimeoutBtn = document.getElementById('wait-timeout-btn');
    const waitTimeoutInput = document.getElementById('wait-timeout-input');
    const screenshotCheckbox = document.getElementById('screenshot-checkbox');
    const includeIframesCheckbox = document.getElementById('include-iframes-checkbox');
    const actionsList = document.getElementById('actions-list');
    const payloadDisplay = document.getElementById('payload-display');

    // --- State Management ---
    let recordedActions = [];
    let port = null;
    let initialUrl = '';
    let expandedActionIndex = null;
    let testingXPath = null;
    let isRecording = false;
    let isReplaying = false;
    let replayState = {
        currentActionIndex: 0,
        originalUrl: '',
        userManuallySetIframes: false
    };
    let settings = {};

    // Auto-scroll configuration
    const AUTO_SCROLL_CONFIG = {
        ZONE_HEIGHT: 50,           // Height of scroll zone in pixels
        SCROLL_SPEED: 5,           // Pixels to scroll per interval
        SCROLL_INTERVAL: 16,       // Milliseconds between scroll steps (60fps)
        MAX_SCROLL_SPEED: 15       // Maximum scroll speed
    };

    let autoScrollInterval = null;
    let currentScrollDirection = null;



    // --- Load Settings ---
    function loadSettings() {
        chrome.storage.local.get(['extensionSettings'], (result) => {
            if (result.extensionSettings) {
                settings = result.extensionSettings;
            } else {
                // Use defaults - SYNCED WITH content.js ENHANCED_DEFAULT_SETTINGS
                settings = {
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
                        
                        // NEW: Angular dynamic state classes
                        'ng-untouched', 'ng-touched', 'ng-pristine', 'ng-dirty', 
                        'ng-valid', 'ng-invalid', 'ng-pending', 'ng-submitted',
                        'ng-star-inserted', 'ng-trigger', 'ng-trigger-*',
                        
                        // Bootstrap dynamic classes
                        'active', 'disabled', 'selected', 'checked', 'expanded', 
                        'collapsed', 'open', 'closed', 'show', 'hide', 'hidden',
                        
                        // Common dynamic state classes
                        'loading', 'error', 'success', 'warning', 'focus', 'hover',
                        'visited', 'current', 'highlighted', 'selected'
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
                        
                        // Component library classes (stable ones)
                        'hydrated', 'form-control', 'form-group', 'input-group*'
                    ],
                    scrollDelay: 1000,
                    replayDelay: 500,
                    navigationTimeout: 10000,
                    highlightElements: true,
                    hoverDuration: 1000,
                    enableElementState: true,
                    
                    // Enhanced settings
                    enableEnhancedSelectors: true,
                    debugMode: false,
                    maxAlternatives: 20,
                    maxParentDepth: 3,
                    maxSiblingDistance: 5,
                    maxTextLength: 100,
                    maxSelectorLength: 300,
                    selectorTimeoutMs: 1000,
                    earlyExitThreshold: 5,
                    enableOptimization: true,
                    prioritizeTestAttributes: true
                };
                chrome.storage.local.set({ extensionSettings: settings });
            }

        });
    }

    // --- Initial Setup ---
    chrome.devtools.inspectedWindow.eval('window.location.href', (result, isException) => {
        if (!isException && result) initialUrl = result;
        loadSettings();
        renderUI();
    });

    // --- Communication with Background Script ---
    function connectToBackground() {
        if (port) port.disconnect();
        port = chrome.runtime.connect({ name: 'devtools' });
        port.onMessage.addListener((message) => {
            if (chrome.runtime.lastError) {
                console.error("DevTools context error:", chrome.runtime.lastError.message);
                if (port) { port.disconnect(); port = null; }
                return;
            }
            
            if (message.type === 'new_action') {
                console.log('=== Adding new action ===', message.action);
                recordedActions.push(message.action);
                renderUI();
                updateButtonStates(); // ← NEW: Update button state when action is actually added
                console.log('Action added. recordedActions.length now:', recordedActions.length);
            } else if (message.type === 'iframe_interaction_detected') {
                handleIframeInteractionDetected();
            }
        });
        
        port.onDisconnect.addListener(() => { 
            port = null; 
            updateButtonStates();
            // Attempt reconnection if we were recording
            if (isRecording) {
                setTimeout(connectToBackground, 1000);
            }
        });
    }


    // --- Iframe Handling ---
    function handleIframeInteractionDetected() {
        if (!replayState.userManuallySetIframes) {
            includeIframesCheckbox.checked = true;
            updateIframeTooltip('auto');
            renderUI();
        }
    }

    function updateIframeTooltip(type) {
        if (type === 'auto') {
            includeIframesCheckbox.title = 'Auto-checked: iframe interaction detected';
        } else if (type === 'manual') {
            includeIframesCheckbox.title = 'Manually set';
        } else {
            includeIframesCheckbox.title = 'Include iframes in payload';
        }
    }

    // --- Settings Panel ---
    function showSettingsPanel() {
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.innerHTML = `
            <div class="settings-panel">
                <div class="settings-header">
                    <h3>⚙️ Extension Settings</h3>
                    <button class="close-settings-btn">✕</button>
                </div>
                <div class="settings-content">
                    <div class="settings-section">
                        <h4>Selector Generation</h4>
                        <div class="settings-group">
                            <label>Class Name Blacklist (glob patterns):</label>
                            <textarea id="class-blacklist" rows="8">${settings.classBlacklist.join('\n')}</textarea>
                            <div style="font-size: 12px; color: #666; margin-top: 4px;">
                                <strong>Examples:</strong> _* (underscore prefix), css-* (css prefix), *-[0-9]* (contains numbers), ng-* (Angular classes)
                            </div>
                        </div>

                        <div class="settings-group">
                            <label>Class Name Whitelist (glob patterns):</label>
                            <textarea id="class-whitelist" rows="8">${settings.classWhitelist.join('\n')}</textarea>
                            <div style="font-size: 12px; color: #666; margin-top: 4px;">
                                <strong>Examples:</strong> btn* (button variants), nav* (navigation), form* (form elements), primary, secondary
                            </div>
                        </div>

                        <button class="revert-patterns-btn">Revert to Defaults</button>
                    </div>
                    
                    <div class="settings-section">
                        <h4>Enhanced Selectors</h4>
                        <div class="settings-group">
                            <label>
                                <input type="checkbox" id="enable-enhanced-selectors" ${settings.enableEnhancedSelectors ? 'checked' : ''}>
                                Enable enhanced selector generation
                            </label>
                        </div>
                        <div class="settings-group">
                            <label>
                                <input type="checkbox" id="enable-element-state" ${settings.enableElementState ? 'checked' : ''}>
                                Enable element state detection
                            </label>
                        </div>
                        <div class="settings-group">
                            <label>
                                <input type="checkbox" id="debug-mode" ${settings.debugMode ? 'checked' : ''}>
                                Enable debug mode (console logging)
                            </label>
                        </div>
                        <div class="settings-group">
                            <label>
                                <input type="checkbox" id="prioritize-test-attributes" ${settings.prioritizeTestAttributes ? 'checked' : ''}>
                                Prioritize test attributes (data-testid, data-cy)
                            </label>
                        </div>
                        <div class="settings-group">
                            <label>
                                <input type="checkbox" id="enable-optimization" ${settings.enableOptimization ? 'checked' : ''}>
                                Enable XPath optimization
                            </label>
                        </div>
                        <div class="settings-group">
                            <label>Max Alternatives:</label>
                            <div class="number-control">
                                <input type="number" id="max-alternatives" value="${settings.maxAlternatives}" min="5" max="50" step="1">
                                <span>selectors</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h4>Performance Settings</h4>
                        <div class="settings-group">
                            <label>Parent Analysis Depth:</label>
                            <div class="number-control">
                                <input type="number" id="max-parent-depth" value="${settings.maxParentDepth}" min="1" max="10" step="1">
                                <span>levels</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Sibling Search Distance:</label>
                            <div class="number-control">
                                <input type="number" id="max-sibling-distance" value="${settings.maxSiblingDistance}" min="1" max="15" step="1">
                                <span>siblings</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Text Content Limit:</label>
                            <div class="number-control">
                                <input type="number" id="max-text-length" value="${settings.maxTextLength}" min="20" max="500" step="10">
                                <span>chars</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Selector Length Limit:</label>
                            <div class="number-control">
                                <input type="number" id="max-selector-length" value="${settings.maxSelectorLength}" min="100" max="1000" step="50">
                                <span>chars</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Generation Timeout:</label>
                            <div class="number-control">
                                <input type="number" id="selector-timeout" value="${settings.selectorTimeoutMs}" min="100" max="10000" step="100">
                                <span>ms</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Early Exit Threshold:</label>
                            <div class="number-control">
                                <input type="number" id="early-exit-threshold" value="${settings.earlyExitThreshold}" min="1" max="20" step="1">
                                <span>selectors</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-section">
                        <h4>Replay Options</h4>
                        <div class="settings-group">
                            <label>
                                <input type="checkbox" id="highlight-elements" ${settings.highlightElements ? 'checked' : ''}>
                                Highlight elements during replay
                            </label>
                        </div>
                    </div>
                    
                    <div class="settings-section">
                        <h4>Timing Controls</h4>
                        <div class="settings-group">
                            <label>Scroll to Bottom Delay:</label>
                            <div class="number-control">
                                <input type="number" id="scroll-delay" value="${settings.scrollDelay}" min="100" max="10000" step="100">
                                <span>ms</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Replay Action Delay:</label>
                            <div class="number-control">
                                <input type="number" id="replay-delay" value="${settings.replayDelay}" min="100" max="5000" step="100">
                                <span>ms</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Navigation Timeout:</label>
                            <div class="number-control">
                                <input type="number" id="navigation-timeout" value="${settings.navigationTimeout}" min="1000" max="60000" step="1000">
                                <span>ms</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Hover Duration:</label>
                            <div class="number-control">
                                <input type="number" id="hover-duration" value="${settings.hoverDuration}" min="100" max="5000" step="100">
                                <span>ms</span>
                                <button class="decrement-btn">-</button>
                                <button class="increment-btn">+</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="settings-footer">
                    <button class="save-settings-btn">Save Settings</button>
                    <button class="cancel-settings-btn">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Event listeners for settings panel
        overlay.querySelector('.close-settings-btn').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        overlay.querySelector('.cancel-settings-btn').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        overlay.querySelector('.save-settings-btn').addEventListener('click', () => {
            saveSettings(overlay);
            document.body.removeChild(overlay);
        });

        overlay.querySelector('.revert-patterns-btn').addEventListener('click', () => {
            // REPLACE the existing arrays with the comprehensive ones:
            const defaultBlacklist = [
                // Original patterns
                '_*', 'css-*', 'jss*', 'makeStyles-*', 'MuiButton-root-*',
                
                // Enhanced CSS-in-JS patterns
                'sc-*', 'emotion-*', 'jsx-*',
                
                // Framework-specific patterns
                'vue-*', 'ng-*', 'svelte-*',
                
                // Build tool patterns
                'webpack-*', 'vite-*',
                
                // Dynamic/generated patterns
                '*-[0-9]*-[0-9]*', '*[0-9][0-9][0-9]*',
                '*-hash-*', '*-generated-*',
                
                // Utility class patterns
                'p-[0-9]*', 'm-[0-9]*', 'w-[0-9]*', 'h-[0-9]*',
                
                // Angular dynamic state classes
                'ng-untouched', 'ng-touched', 'ng-pristine', 'ng-dirty', 
                'ng-valid', 'ng-invalid', 'ng-pending', 'ng-submitted',
                'ng-star-inserted', 'ng-trigger', 'ng-trigger-*',
                
                // Bootstrap dynamic classes
                'active', 'disabled', 'selected', 'checked', 'expanded', 
                'collapsed', 'open', 'closed', 'show', 'hide', 'hidden',
                
                // Common dynamic state classes
                'loading', 'error', 'success', 'warning', 'focus', 'hover',
                'visited', 'current', 'highlighted', 'selected'
            ];
            
            const defaultWhitelist = [
                'btn*', 'button*', 'primary', 'secondary', 'submit', 'cancel',
                'nav*', 'menu*', 'form*', 'input*', 'header*', 'footer*', 'sidebar*',
                'content*', 'main*', 'card*', 'modal*', 'dialog*', 'popup*', 'tooltip*',
                'dropdown*', 'select*', 'checkbox*', 'radio*', 'tab*', 'accordion*',
                'collapse*', 'panel*', 'alert*', 'notice*', 'message*', 'notification*',
                'badge*', 'tag*', 'label*', 'chip*', 'table*', 'row*', 'cell*', 'column*',
                'list*', 'item*', 'link*', 'text*', 'icon*', 'image*', 'avatar*', 'logo*',
                'search*', 'filter*', 'sort*', 'pagination*',
                'small', 'medium', 'large', 'xl', 'xs',
                'compact', 'full', 'mini', 'tiny', 'success', 'error', 'warning',
                'info', 'dark', 'light', 'theme*', 'hydrated', 'form-control', 'form-group', 'input-group*'
            ];
            
            overlay.querySelector('#class-blacklist').value = defaultBlacklist.join('\n');
            overlay.querySelector('#class-whitelist').value = defaultWhitelist.join('\n');
        });


        // Number control event listeners
        overlay.querySelectorAll('.increment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const input = e.target.parentElement.querySelector('input');
                const step = parseInt(input.step) || 1;
                const max = parseInt(input.max) || Infinity;
                input.value = Math.min(parseInt(input.value) + step, max);
            });
        });

        overlay.querySelectorAll('.decrement-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const input = e.target.parentElement.querySelector('input');
                const step = parseInt(input.step) || 1;
                const min = parseInt(input.min) || 0;
                input.value = Math.max(parseInt(input.value) - step, min);
            });
        });

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }

    function saveSettings(overlay) {
        const newSettings = {
            classBlacklist: overlay.querySelector('#class-blacklist').value.split('\n').filter(s => s.trim()),
            classWhitelist: overlay.querySelector('#class-whitelist').value.split('\n').filter(s => s.trim()),
            scrollDelay: parseInt(overlay.querySelector('#scroll-delay').value),
            replayDelay: parseInt(overlay.querySelector('#replay-delay').value),
            navigationTimeout: parseInt(overlay.querySelector('#navigation-timeout').value),
            highlightElements: overlay.querySelector('#highlight-elements').checked,
            hoverDuration: parseInt(overlay.querySelector('#hover-duration').value),
            
            // Enhanced selector settings
            enableEnhancedSelectors: overlay.querySelector('#enable-enhanced-selectors').checked,
            debugMode: overlay.querySelector('#debug-mode').checked,
            prioritizeTestAttributes: overlay.querySelector('#prioritize-test-attributes').checked,
            enableOptimization: overlay.querySelector('#enable-optimization').checked,
            maxAlternatives: parseInt(overlay.querySelector('#max-alternatives').value),
            enableElementState: overlay.querySelector('#enable-element-state').checked,  // NEW: Add this line
            
            // Performance settings
            maxParentDepth: parseInt(overlay.querySelector('#max-parent-depth').value),
            maxSiblingDistance: parseInt(overlay.querySelector('#max-sibling-distance').value),
            maxTextLength: parseInt(overlay.querySelector('#max-text-length').value),
            maxSelectorLength: parseInt(overlay.querySelector('#max-selector-length').value),
            selectorTimeoutMs: parseInt(overlay.querySelector('#selector-timeout').value),
            earlyExitThreshold: parseInt(overlay.querySelector('#early-exit-threshold').value)
        };

        settings = newSettings;
        chrome.storage.local.set({ extensionSettings: newSettings });
    }


    // --- Replay Functionality ---
    async function startReplay() {
        if (recordedActions.length === 0) {
            alert('No actions found to replay');
            return;
        }

        // Get the target URL from payload
        const payload = JSON.parse(payloadDisplay.textContent);
        const targetUrl = payload.url;

        // Store original URL
        chrome.devtools.inspectedWindow.eval('window.location.href', (result) => {
            replayState.originalUrl = result;
        });

        // Show confirmation dialog
        const userConfirmed = await showNavigationConfirmation(targetUrl);
        if (!userConfirmed) {
            return;
        }

        isReplaying = true;
        replayState.currentActionIndex = 0;
        
        // Initialize all action statuses to 'pending'
        recordedActions.forEach(action => {
            action.replayStatus = 'pending';
        });
        
        updateButtonStates();
        addStatusColumn();

        try {
            // Step 1: Navigate to target URL
            await navigateToUrl(targetUrl);
            
            // Step 2: Execute actions sequentially
            for (let i = 0; i < recordedActions.length && isReplaying; i++) {
                replayState.currentActionIndex = i;
                
                // Update status and button text
                recordedActions[i].replayStatus = 'running';
                updateActionStatus(i, 'running');
                updateButtonStates(); // ← NEW: Update button text with current progress
                highlightCurrentAction(i);

                try {
                    await executeAction(recordedActions[i], i);
                    recordedActions[i].replayStatus = 'success';
                    updateActionStatus(i, 'success');
                } catch (error) {
                    recordedActions[i].replayStatus = 'failed';
                    updateActionStatus(i, 'failed', error.message);
                    // Continue with next action (don't stop on errors)
                }

                // Wait between actions
                if (isReplaying && i < recordedActions.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, settings.replayDelay));
                }
            }

            // Replay completed or stopped
            if (isReplaying) {
                // Completed successfully
                isReplaying = false;
                updateButtonStates();
            }
        } catch (navigationError) {
            // Navigation failed - stop entire replay
            isReplaying = false;
            updateButtonStates();
            alert(`Replay failed: ${navigationError.message}`);
        }
    }


    function showNavigationConfirmation(targetUrl) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'settings-overlay';
            overlay.innerHTML = `
                <div class="confirmation-dialog">
                    <div class="confirmation-header">
                        <h3>🔄 Confirm Replay Navigation</h3>
                    </div>
                    <div class="confirmation-content">
                        <p>Replay will navigate to:</p>
                        <div class="target-url">${targetUrl}</div>
                        <p>Current page data may be lost. Continue with replay?</p>
                    </div>
                    <div class="confirmation-footer">
                        <button class="cancel-navigation-btn">Cancel</button>
                        <button class="continue-navigation-btn">Continue</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            overlay.querySelector('.cancel-navigation-btn').addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(false);
            });

            overlay.querySelector('.continue-navigation-btn').addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(true);
            });

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(false);
                }
            });
        });
    }

    async function navigateToUrl(targetUrl) {
        return new Promise((resolve, reject) => {
            console.log('Starting navigation to:', targetUrl);
            
            // First, navigate to the target URL
            chrome.devtools.inspectedWindow.eval(
                `window.location.href = "${targetUrl.replace(/"/g, '\\"')}"; "navigation_started";`,
                (result, isException) => {
                    console.log('Navigation eval result:', result, 'Exception:', isException);
                    
                    if (isException) {
                        console.error('Navigation failed:', isException);
                        reject(new Error(`Failed to navigate to URL: ${isException.value || isException.description || 'Unknown error'}`));
                        return;
                    }

                    // Wait for page to load
                    const navigationTimeout = settings.navigationTimeout || 10000;
                    const startTime = Date.now();
                    let checkCount = 0;

                    const checkPageLoaded = () => {
                        checkCount++;
                        console.log(`Checking page load state, attempt ${checkCount}`);
                        
                        chrome.devtools.inspectedWindow.eval(
                            'document.readyState',
                            (readyState, isException) => {
                                console.log('ReadyState check:', readyState, 'Exception:', isException);
                                
                                if (isException) {
                                    console.error('ReadyState check failed:', isException);
                                    // Instead of rejecting, try a few more times
                                    if (checkCount < 5) {
                                        setTimeout(checkPageLoaded, 500);
                                        return;
                                    }
                                    reject(new Error(`Failed to check page state after ${checkCount} attempts: ${isException.value || isException.description || 'Unknown error'}`));
                                    return;
                                }

                                if (readyState === 'complete') {
                                    console.log('Page loaded successfully, waiting 500ms...');
                                    // Wait additional 500ms delay
                                    setTimeout(() => {
                                        checkNavigationSuccess(targetUrl, resolve, reject);
                                    }, 500);
                                } else if (Date.now() - startTime > navigationTimeout) {
                                    reject(new Error(`Navigation timeout after ${navigationTimeout}ms`));
                                } else {
                                    // Continue checking
                                    setTimeout(checkPageLoaded, 200);
                                }
                            }
                        );
                    };

                    // Start checking page load state after a brief delay
                    setTimeout(checkPageLoaded, 500);
                }
            );
        });
    }

    function checkNavigationSuccess(targetUrl, resolve, reject) {
        console.log('Checking navigation success for:', targetUrl);
        
        chrome.devtools.inspectedWindow.eval(
            `(function() {
                try {
                    var result = {
                        currentUrl: window.location.href,
                        status: null,
                        hasContent: document.body && document.body.children.length > 0
                    };
                    
                    // Try to get HTTP status via Navigation API
                    try {
                        var navEntries = performance.getEntriesByType('navigation');
                        if (navEntries.length > 0 && navEntries[0].responseStatus) {
                            result.status = navEntries[0].responseStatus;
                        }
                    } catch (e) {
                        // Ignore errors getting status
                    }
                    
                    return result;
                } catch (error) {
                    return {
                        error: error.message,
                        currentUrl: window.location.href,
                        hasContent: true
                    };
                }
            })();`,
            (result, isException) => {
                console.log('Navigation success check result:', result, 'Exception:', isException);
                
                if (isException) {
                    console.warn('Could not check navigation success, assuming success:', isException);
                    resolve();
                    return;
                }

                if (result && result.error) {
                    console.warn('Navigation check returned error, but continuing:', result.error);
                    resolve();
                    return;
                }

                // Check HTTP status code if available
                if (result && result.status !== null && result.status !== undefined) {
                    console.log('HTTP Status:', result.status);
                    if (result.status >= 400 && result.status < 600) {
                        reject(new Error(`Navigation failed with HTTP ${result.status}`));
                        return;
                    }
                }

                console.log('Navigation successful, proceeding with actions');
                resolve();
            }
        );
    }

    function stopReplay() {
        isReplaying = false;
        
        // Reset any "running" status to "pending" for actions that didn't complete
        recordedActions.forEach((action, index) => {
            if (action.replayStatus === 'running') {
                action.replayStatus = 'pending';
                updateActionStatus(index, 'pending');
            }
        });
        
        updateButtonStates();
    }

    function resetReplay() {
        // Navigate back to original URL
        if (replayState.originalUrl) {
            chrome.devtools.inspectedWindow.eval(`window.location.href = '${replayState.originalUrl}'`);
        }
        
        // Clean up UI
        removeStatusColumn();
        clearActionHighlights();
        isReplaying = false;
        replayState.currentActionIndex = 0;
        updateButtonStates();
    }

    async function executeAction(action, index) {
        const code = generateActionExecutionCode(action, index, recordedActions); // Pass all actions and index
        
        return new Promise((resolve, reject) => {
            chrome.devtools.inspectedWindow.eval(code, (result, isException) => {
                if (isException) {
                    reject(new Error(isException.value || 'Execution failed'));
                } else if (result && result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result);
                }
            });
        });
    }

function generateActionExecutionCode(action, actionIndex = -1, allActions = []) {
    // Helper function to safely escape XPath for JavaScript strings
    function escapeForJavaScript(str) {
        if (!str) return "''";
        return "'" + str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";
    }

    // Helper function to find previous element action for keyPress
    function findPreviousElementAction(allActions, currentIndex) {
        for (let i = currentIndex - 1; i >= 0; i--) {
            const prevAction = allActions[i];
            if (['type', 'click', 'select'].includes(prevAction.action) && prevAction.selector) {
                return prevAction.selector.current || prevAction.selector.value;
            }
        }
        return null; // No previous element found
    }

    switch (action.action) {
        case 'click':
            return `
                (function() {
                    try {
                        const element = document.evaluate(${escapeForJavaScript(action.selector.current)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (!element) return { error: 'Element not found' };
                        ${settings.highlightElements ? 'element.style.outline = "3px solid #ff6b6b"; element.scrollIntoView({ behavior: "smooth", block: "center" });' : ''}
                        element.click();
                        ${settings.highlightElements ? 'setTimeout(function() { if (element.style) element.style.outline = ""; }, 1000);' : ''}
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'type':
            return `
                (function() {
                    try {
                        const element = document.evaluate(${escapeForJavaScript(action.selector.current)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (!element) return { error: 'Element not found' };
                        ${settings.highlightElements ? 'element.style.outline = "3px solid #ff6b6b"; element.scrollIntoView({ behavior: "smooth", block: "center" });' : ''}
                        element.focus();
                        element.value = ${escapeForJavaScript(action.text || '')};
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        ${settings.highlightElements ? 'setTimeout(function() { if (element.style) element.style.outline = ""; }, 1000);' : ''}
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'select':
            return `
                (function() {
                    try {
                        const element = document.evaluate(${escapeForJavaScript(action.selector.current)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (!element) return { error: 'Element not found' };
                        ${settings.highlightElements ? 'element.style.outline = "3px solid #ff6b6b"; element.scrollIntoView({ behavior: "smooth", block: "center" });' : ''}
                        const values = ${JSON.stringify(action.values || [])};
                        for (const option of element.options) {
                            option.selected = values.includes(option.value);
                        }
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        ${settings.highlightElements ? 'setTimeout(function() { if (element.style) element.style.outline = ""; }, 1000);' : ''}
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'hover':
            return `
                (function() {
                    try {
                        const element = document.evaluate(${escapeForJavaScript(action.selector.current)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (!element) return { error: 'Element not found' };
                        ${settings.highlightElements ? 'element.style.outline = "3px solid #ff6b6b"; element.scrollIntoView({ behavior: "smooth", block: "center" });' : ''}
                        
                        // Dispatch multiple hover events for better simulation
                        element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                        element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
                        
                        ${settings.highlightElements ? `setTimeout(function() { if (element.style) element.style.outline = ""; }, ${settings.hoverDuration || 1000});` : ''}
                        
                        // Keep hover effect visible for configured duration
                        return new Promise(function(resolve) {
                            setTimeout(function() {
                                resolve({ success: true });
                            }, ${settings.hoverDuration || 1000});
                        });
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'doubleClick':
            return `
                (function() {
                    try {
                        const element = document.evaluate(${escapeForJavaScript(action.selector.current)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (!element) return { error: 'Element not found' };
                        ${settings.highlightElements ? 'element.style.outline = "3px solid #ff6b6b"; element.scrollIntoView({ behavior: "smooth", block: "center" });' : ''}
                        element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                        ${settings.highlightElements ? 'setTimeout(function() { if (element.style) element.style.outline = ""; }, 1000);' : ''}
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'scrollTo':
            return `
                (function() {
                    try {
                        window.scrollTo(${action.left || 0}, ${action.top || 0});
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'scrollBottom':
            return `
                (function() {
                    try {
                        window.scrollTo(0, document.body.scrollHeight);
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'keyPress':
            const previousElementSelector = findPreviousElementAction(allActions, actionIndex);
            
            if (previousElementSelector) {
                return `
                    (function() {
                        try {
                            console.log('KeyPress: Looking for previous element with selector:', ${escapeForJavaScript(previousElementSelector)});
                            
                            const element = document.evaluate(${escapeForJavaScript(previousElementSelector)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                            
                            if (!element) {
                                console.log('KeyPress: Previous element not found, falling back to document');
                                return { success: true, fallback: 'document' };
                            }
                            
                            console.log('KeyPress: Found element:', element);
                            
                            // Ensure element is visible and properly focused
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            // Clear any existing focus and focus this element
                            if (document.activeElement && document.activeElement !== element) {
                                document.activeElement.blur();
                            }
                            element.focus();
                            
                            // Wait for focus to be properly established
                            return new Promise(function(resolve) {
                                setTimeout(function() {
                                    console.log('KeyPress: Element focused, active element is:', document.activeElement);
                                    console.log('KeyPress: Focus matches target:', document.activeElement === element);
                                    
                                    const key = ${escapeForJavaScript(action.key || '')};
                                    
                                    if (key === 'Enter') {
                                        console.log('KeyPress: Simulating Enter key with enhanced properties');
                                        
                                        // Create more accurate Enter key events
                                        const keydownEvent = new KeyboardEvent('keydown', {
                                            key: 'Enter',
                                            code: 'Enter',
                                            keyCode: 13,        // Legacy property for older browsers
                                            which: 13,          // Legacy property
                                            charCode: 0,
                                            bubbles: true,
                                            cancelable: true,
                                            isTrusted: false,   // We can't set true, but this is explicit
                                            location: 0
                                        });
                                        
                                        const keypressEvent = new KeyboardEvent('keypress', {
                                            key: 'Enter',
                                            code: 'Enter', 
                                            keyCode: 13,
                                            which: 13,
                                            charCode: 13,       // Different for keypress
                                            bubbles: true,
                                            cancelable: true,
                                            isTrusted: false,
                                            location: 0
                                        });
                                        
                                        const keyupEvent = new KeyboardEvent('keyup', {
                                            key: 'Enter',
                                            code: 'Enter',
                                            keyCode: 13,
                                            which: 13,
                                            charCode: 0,
                                            bubbles: true,
                                            cancelable: true,
                                            isTrusted: false,
                                            location: 0
                                        });
                                        
                                        // Dispatch events in proper sequence with micro-delays
                                        let eventsFired = 0;
                                        
                                        // Keydown
                                        console.log('KeyPress: Dispatching keydown');
                                        const downResult = element.dispatchEvent(keydownEvent);
                                        console.log('KeyPress: Keydown result (not prevented):', downResult);
                                        eventsFired++;
                                        
                                        // Small delay before keypress
                                        setTimeout(function() {
                                            console.log('KeyPress: Dispatching keypress');
                                            const pressResult = element.dispatchEvent(keypressEvent);
                                            console.log('KeyPress: Keypress result (not prevented):', pressResult);
                                            eventsFired++;
                                            
                                            // Small delay before keyup
                                            setTimeout(function() {
                                                console.log('KeyPress: Dispatching keyup');
                                                const upResult = element.dispatchEvent(keyupEvent);
                                                console.log('KeyPress: Keyup result (not prevented):', upResult);
                                                eventsFired++;
                                                
                                                // Additional Enter key triggers
                                                setTimeout(function() {
                                                    console.log('KeyPress: All events dispatched, checking for additional triggers');
                                                    
                                                    // Check if form submission happened naturally
                                                    const form = element.closest('form');
                                                    if (form) {
                                                        console.log('KeyPress: Form found, checking if we need manual submission');
                                                        
                                                        // Give a moment for natural form submission
                                                        setTimeout(function() {
                                                            // If we're still on the same page, try manual submission
                                                            console.log('KeyPress: Attempting manual form submission as backup');
                                                            
                                                            try {
                                                                // Try the form's submit method
                                                                form.submit();
                                                            } catch (e) {
                                                                console.log('KeyPress: Form.submit() failed:', e.message);
                                                                
                                                                // Try clicking submit button
                                                                const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                                                                if (submitBtn) {
                                                                    console.log('KeyPress: Clicking submit button as final fallback');
                                                                    submitBtn.click();
                                                                }
                                                            }
                                                        }, 100);
                                                    }
                                                    
                                                    resolve({ 
                                                        success: true, 
                                                        target: 'element',
                                                        eventsFired: eventsFired,
                                                        activeElement: document.activeElement.tagName
                                                    });
                                                }, 50);
                                            }, 10);
                                        }, 10);
                                    } else {
                                        // Handle other keys (Tab, Escape, etc.)
                                        console.log('KeyPress: Handling non-Enter key:', key);
                                        
                                        const keydownEvent = new KeyboardEvent('keydown', {
                                            key: key,
                                            code: key,
                                            bubbles: true,
                                            cancelable: true
                                        });
                                        
                                        const keyupEvent = new KeyboardEvent('keyup', {
                                            key: key, 
                                            code: key,
                                            bubbles: true,
                                            cancelable: true
                                        });
                                        
                                        element.dispatchEvent(keydownEvent);
                                        setTimeout(function() {
                                            element.dispatchEvent(keyupEvent);
                                            resolve({ success: true, target: 'element', key: key });
                                        }, 10);
                                    }
                                }, 150); // Longer delay to ensure focus is established
                            });
                        } catch (error) {
                            console.error('KeyPress error:', error);
                            return { error: error.message };
                        }
                    })();
                `;
            } else {
                // Fallback unchanged
                return `
                    (function() {
                        try {
                            console.log('KeyPress: No previous element found, sending to document');
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: ${escapeForJavaScript(action.key || '')}, bubbles: true }));
                            document.dispatchEvent(new KeyboardEvent('keyup', { key: ${escapeForJavaScript(action.key || '')}, bubbles: true }));
                            return { success: true, target: 'document' };
                        } catch (error) {
                            return { error: error.message };
                        }
                    })();
                `;
            }
        case 'waitForTimeout':
            return `
                (function() {
                    return new Promise(function(resolve) {
                        setTimeout(function() { 
                            resolve({ success: true }); 
                        }, ${(action.timeout || 1) * 1000});
                    });
                })();
            `;
        case 'waitForSelector':
            return `
                (function() {
                    return new Promise(function(resolve, reject) {
                        const timeout = ${settings.navigationTimeout || 10000};
                        const startTime = Date.now();
                        
                        function checkElement() {
                            try {
                                const element = document.evaluate(${escapeForJavaScript(action.selector.current)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                                if (element) {
                                    resolve({ success: true });
                                } else if (Date.now() - startTime > timeout) {
                                    reject(new Error('Timeout waiting for element'));
                                } else {
                                    setTimeout(checkElement, 100);
                                }
                            } catch (error) {
                                reject(error);
                            }
                        }
                        checkElement();
                    });
                })();
            `;
        case 'goto':
            return `
                (function() {
                    try {
                        window.location.href = ${escapeForJavaScript(action.url || '')};
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'reload':
            return `
                (function() {
                    try {
                        window.location.reload();
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'waitForNavigation':
            return `
                (function() {
                    return new Promise(function(resolve, reject) {
                        const timeout = ${settings.navigationTimeout || 10000};
                        const startTime = Date.now();
                        
                        function checkLoaded() {
                            try {
                                if (document.readyState === 'complete') {
                                    resolve({ success: true });
                                } else if (Date.now() - startTime > timeout) {
                                    reject(new Error('Navigation timeout'));
                                } else {
                                    setTimeout(checkLoaded, 100);
                                }
                            } catch (error) {
                                reject(error);
                            }
                        }
                        checkLoaded();
                    });
                })();
            `;
        case 'evaluate':
            return `
                (function() {
                    try {
                        ${action.source || ''}
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        case 'hide':
            return `
                (function() {
                    try {
                        const element = document.evaluate(${escapeForJavaScript(action.selector.current)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (!element) return { error: 'Element not found' };
                        ${settings.highlightElements ? 'element.style.outline = "3px solid #ff6b6b"; element.scrollIntoView({ behavior: "smooth", block: "center" });' : ''}
                        element.style.display = 'none';
                        ${settings.highlightElements ? 'setTimeout(function() { if (element.style) element.style.outline = ""; }, 1000);' : ''}
                        return { success: true };
                    } catch (error) {
                        return { error: error.message };
                    }
                })();
            `;
        default:
            return `
                (function() {
                    return { error: 'Unknown action type: ${action.action}' };
                })();
            `;
    }
}


    // --- Status Column Management ---
    function addStatusColumn() {
        // Update CSS grid layout to include status column
        const actionsHeader = document.querySelector('.actions-header');
        const statusHeader = document.createElement('span');
        statusHeader.className = 'action-status-header col-status';
        statusHeader.textContent = 'Status';
        actionsHeader.appendChild(statusHeader);

        // ADD THIS: Apply with-status class to header
        actionsHeader.classList.add('with-status');
        
        // Add status cells to existing action items and apply with-status class
        document.querySelectorAll('.action-item-collapsed').forEach((item, index) => {
            // ADD THIS: Apply with-status class to each action item
            item.classList.add('with-status');
            
            const statusContainer = document.createElement('div');
            statusContainer.className = 'control-container action-status-container';
            statusContainer.innerHTML = '<span class="status-text status-pending">⏳ Pending</span>';
            item.appendChild(statusContainer);
        });
    }

    function removeStatusColumn() {
        // Remove status header
        const statusHeader = document.querySelector('.action-status-header');
        if (statusHeader) statusHeader.remove();

        // UPDATED: Remove with-status class from header
        const actionsHeader = document.querySelector('.actions-header');
        if (actionsHeader) {
            actionsHeader.classList.remove('with-status');
        }

        // Remove status containers and with-status class from action items
        document.querySelectorAll('.action-status-container').forEach(container => container.remove());
        document.querySelectorAll('.action-item-collapsed').forEach(item => {
            // ADD THIS: Remove with-status class from each action item
            item.classList.remove('with-status');
        });
    }




    function updateActionStatus(index, status, errorMsg = '') {
        // Update the data model
        if (recordedActions[index]) {
            recordedActions[index].replayStatus = status;
            if (errorMsg) {
                recordedActions[index].replayErrorMsg = errorMsg;
            }
        }
        
        // Update the DOM
        const statusContainer = document.querySelectorAll('.action-status-container')[index];
        if (!statusContainer) return;

        const statusText = statusContainer.querySelector('.status-text');
        if (!statusText) return;

        switch (status) {
            case 'running':
                statusText.innerHTML = '⏳ Running...';
                statusText.className = 'status-text status-running';
                break;
            case 'success':
                statusText.innerHTML = '✅ Success';
                statusText.className = 'status-text status-success';
                break;
            case 'failed':
                statusText.innerHTML = `❌ Failed`;
                statusText.className = 'status-text status-failed';
                statusText.title = errorMsg || 'Unknown error';
                break;
            default:
                statusText.innerHTML = '⏳ Pending';
                statusText.className = 'status-text status-pending';
                statusText.title = '';
        }
    }




    function highlightCurrentAction(index) {
        // Remove previous highlights
        document.querySelectorAll('.action-item-highlighted').forEach(item => {
            item.classList.remove('action-item-highlighted');
        });

        // Highlight current action
        const actionItem = document.querySelectorAll('#actions-list li')[index];
        if (actionItem) {
            actionItem.classList.add('action-item-highlighted');
            actionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function clearActionHighlights() {
        document.querySelectorAll('.action-item-highlighted').forEach(item => {
            item.classList.remove('action-item-highlighted');
        });
    }

    // --- XPath/CSS Testing and Highlighting ---
    function testSelector(selector, type, resultElement) {
        if (!selector.trim()) return;
        
        testingXPath = selector;
        resultElement.className = 'validation-result validation-testing';
        resultElement.textContent = 'Testing...';
        
        // Clear any existing highlights
        chrome.devtools.inspectedWindow.eval(`
            // Remove existing highlights
            document.querySelectorAll('.xpath-highlight').forEach(el => {
                el.classList.remove('xpath-highlight');
                el.style.outline = '';
                el.style.outlineOffset = '';
            });
        `);
        
        // Test selector based on type and highlight results
        if (type === 'xpath') {
            chrome.devtools.inspectedWindow.eval(`
                try {
                    const result = document.evaluate('${selector.replace(/'/g, "\\'")}', document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                    const count = result.snapshotLength;
                    
                    // Highlight elements
                    for (let i = 0; i < count; i++) {
                        const element = result.snapshotItem(i);
                        if (element && element.style !== undefined) {
                            element.classList.add('xpath-highlight');
                            element.style.outline = '3px solid #ff6b6b';
                            element.style.outlineOffset = '2px';
                        }
                    }
                    
                    // Remove highlights after 3 seconds
                    setTimeout(() => {
                        document.querySelectorAll('.xpath-highlight').forEach(el => {
                            el.classList.remove('xpath-highlight');
                            el.style.outline = '';
                            el.style.outlineOffset = '';
                        });
                    }, 3000);
                    
                    count; // Return count
                } catch (error) {
                    -1; // Return -1 for errors
                }
            `, handleTestResult);
        } else if (type === 'css') {
            chrome.devtools.inspectedWindow.eval(`
                try {
                    const elements = document.querySelectorAll('${selector.replace(/'/g, "\\'")}');
                    const count = elements.length;
                    
                    // Highlight elements
                    elements.forEach(element => {
                        if (element && element.style !== undefined) {
                            element.classList.add('xpath-highlight');
                            element.style.outline = '3px solid #ff6b6b';
                            element.style.outlineOffset = '2px';
                        }
                    });
                    
                    // Remove highlights after 3 seconds
                    setTimeout(() => {
                        document.querySelectorAll('.xpath-highlight').forEach(el => {
                            el.classList.remove('xpath-highlight');
                            el.style.outline = '';
                            el.style.outlineOffset = '';
                        });
                    }, 3000);
                    
                    count; // Return count
                } catch (error) {
                    -1; // Return -1 for errors
                }
            `, handleTestResult);
        }
        
        function handleTestResult(result, isException) {
            if (testingXPath !== selector) return; // Ignore if another test started
            
            if (isException || result === -1) {
                resultElement.className = 'validation-result validation-not-found';
                resultElement.textContent = `❌ Invalid ${type.toUpperCase()}`;
            } else if (result === 0) {
                resultElement.className = 'validation-result validation-not-found';
                resultElement.textContent = '❌ Not found (0)';
            } else if (result === 1) {
                resultElement.className = 'validation-result validation-unique';
                resultElement.textContent = '✅ Unique (1 found)';
            } else {
                resultElement.className = 'validation-result validation-multiple';
                resultElement.textContent = `⚠️ Multiple (${result} found)`;
            }
            
            testingXPath = null;
        }
    }

    // --- UI Rendering Functions ---
    function renderActions() {
        actionsList.innerHTML = '';
        
        // Check if we need status column
        const hasStatusColumn = document.querySelector('.action-status-header') !== null;
        
        recordedActions.forEach((action, index) => {
            const li = document.createElement('li');
            li.dataset.index = index;
            li.draggable = true;

            if (expandedActionIndex === index) {
                li.className = 'action-item-expanded';
                li.appendChild(createExpandedActionItem(action, index));
            } else {
                li.appendChild(createCollapsedActionItem(action, index));
            }

            actionsList.appendChild(li);
        });
    }


    function createCollapsedActionItem(action, index) {
        const container = document.createElement('div');
        container.className = 'action-item-collapsed';

        // Check if status column exists and add with-status class accordingly
        const hasStatusColumn = document.querySelector('.action-status-header') !== null;
        if (hasStatusColumn) {
            container.classList.add('with-status');
        }

        // Drag Handle (Grid Column 1)
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle-alt';
        dragHandle.title = 'Drag to reorder';
        container.appendChild(dragHandle);

        // Action Details (Grid Column 2)
        let detailsText = action.selector?.current || action.url || action.key || '';
        if (action.action === 'scrollTo') detailsText = `top: ${action.top}, left: ${action.left}`;
        else if (action.action === 'waitForTimeout') detailsText = `${action.timeout}s`;

        // Add state badge for actions with selectors
        let stateBadge = '';
        if (action.selector && action.selector.state) {
            const stateIcons = { 'visible': '👁️', 'hidden': '🙈', 'attached': '📎' };
            const stateIcon = stateIcons[action.selector.state] || '❓';
            stateBadge = ` <span style="font-size: 11px; color: #666; margin-left: 8px;" title="Element state: ${action.selector.state}">${stateIcon}</span>`;
        }

        const detailsSpan = document.createElement('span');
        detailsSpan.className = 'action-details';
        detailsSpan.innerHTML = `${action.action}: ${detailsText}${stateBadge}`;
        detailsSpan.title = action.selector?.current || '';
        container.appendChild(detailsSpan);

        // Edit Button (Grid Column 3)
        const editContainer = document.createElement('div');
        editContainer.className = 'control-container action-edit-container';
        if (action.selector) {
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.title = 'Edit Selector';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                expandedActionIndex = expandedActionIndex === index ? null : index;
                renderUI();
            });
            editContainer.appendChild(editBtn);
        }
        container.appendChild(editContainer);

        // Continue on Error Checkbox (Grid Column 4)
        const continueContainer = document.createElement('div');
        continueContainer.className = 'control-container action-continue-container';
        if (action.hasOwnProperty('onError')) {
            const continueCheckbox = document.createElement('input');
            continueCheckbox.type = 'checkbox';
            continueCheckbox.checked = action.onError === 'continue';
            continueCheckbox.addEventListener('change', (e) => {
                recordedActions[index].onError = e.target.checked ? 'continue' : 'return';
                renderUI();
            });
            continueContainer.appendChild(continueCheckbox);
        }
        container.appendChild(continueContainer);

        // Delete Button (Grid Column 5)
        const deleteContainer = document.createElement('div');
        deleteContainer.className = 'control-container action-delete-container';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = 'Delete Action';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            recordedActions.splice(index, 1);
            if (expandedActionIndex === index) expandedActionIndex = null;
            else if (expandedActionIndex > index) expandedActionIndex--;
            renderUI();
        });
        deleteContainer.appendChild(deleteBtn);
        container.appendChild(deleteContainer);

        // Status Container (Grid Column 6 - only if status column exists)
        if (hasStatusColumn) {
            const statusContainer = document.createElement('div');
            statusContainer.className = 'control-container action-status-container';
            
            // Use stored status from action object, or default to pending
            const storedStatus = action.replayStatus || 'pending';
            const errorMsg = action.replayErrorMsg || '';
            
            let statusHtml, statusClass;
            switch (storedStatus) {
                case 'running':
                    statusHtml = '⏳ Running...';
                    statusClass = 'status-text status-running';
                    break;
                case 'success':
                    statusHtml = '✅ Success';
                    statusClass = 'status-text status-success';
                    break;
                case 'failed':
                    statusHtml = `❌ Failed: ${errorMsg || 'Unknown error'}`;
                    statusClass = 'status-text status-failed';
                    break;
                default:
                    statusHtml = '⏳ Pending';
                    statusClass = 'status-text status-pending';
            }
            
            statusContainer.innerHTML = `<span class="${statusClass}" title="${errorMsg}">${statusHtml}</span>`;
            container.appendChild(statusContainer);
        }
        
        return container;
    }


    function createExpandedActionItem(action, index) {
        const container = document.createElement('div');
        
        // Safety check for selector
        if (!action.selector) {
            console.warn('Action has no selector:', action);
            return createCollapsedActionItem(action, index);
        }
        
        // Collapsed header (still visible when expanded)
        const collapsedHeader = createCollapsedActionItem(action, index);
        container.appendChild(collapsedHeader);
        
        // Expanded editor
        const editor = document.createElement('div');
        editor.className = 'xpath-editor';
        
        // Editor Header
        const editorHeader = document.createElement('div');
        editorHeader.className = 'xpath-editor-header';
        
        const editorTitle = document.createElement('div');
        editorTitle.className = 'xpath-editor-title';
        editorTitle.innerHTML = '🎯 Selector Editor';
        editorHeader.appendChild(editorTitle);
        
        const editorControls = document.createElement('div');
        editorControls.className = 'xpath-editor-controls';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close Editor';
        closeBtn.addEventListener('click', () => {
            expandedActionIndex = null;
            renderUI();
        });
        editorControls.appendChild(closeBtn);

        // ===== ADD THIS DEBUG BUTTON CODE HERE =====
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🔍 Debug Storage';
        debugBtn.style.marginLeft = '8px';
        debugBtn.addEventListener('click', () => {
            console.log('=== STORAGE DEBUG ===');
            
            // Check current settings
            console.log('Panel settings object:', settings);
            
            // Check storage
            chrome.storage.local.get(null, (result) => {
                console.log('📦 ALL STORAGE:', result);
                console.log('📦 STORAGE KEYS:', Object.keys(result));
                
                if (result.extensionSettings) {
                    console.log('✅ extensionSettings found:', result.extensionSettings);
                    console.log('📋 Blacklist length:', result.extensionSettings.classBlacklist?.length);
                    console.log('📋 Blacklist content:', result.extensionSettings.classBlacklist);
                } else {
                    console.log('❌ extensionSettings NOT found');
                }
            });
            
            // Test write
            chrome.storage.local.set({debugTest: Date.now()}, () => {
                console.log('✅ Test write successful');
                chrome.storage.local.get(['debugTest'], (result) => {
                    console.log('✅ Test read result:', result.debugTest);
                });
            });
        });


        
        editorHeader.appendChild(editorControls);
        editor.appendChild(editorHeader);
        
        // Editor Content
        const editorContent = document.createElement('div');
        editorContent.className = 'xpath-editor-content';
        
        // Available XPaths Section
        const alternativesSection = document.createElement('div');
        alternativesSection.className = 'xpath-alternatives-section';
        
        const alternativesTitle = document.createElement('div');
        alternativesTitle.className = 'xpath-alternatives-title';
        alternativesTitle.innerHTML = '📋 Available XPaths';
        alternativesSection.appendChild(alternativesTitle);
        
        const alternativesList = document.createElement('div');
        alternativesList.className = 'xpath-alternatives-list';
        
        // Safety check for alternatives array
        const alternatives = action.selector.alternatives || [action.selector.current || ''];
        
        // NEW: State for show/hide additional alternatives
        let showingAllAlternatives = false;
        const maxInitialDisplay = 5;
        const maxTotalDisplay = 20;
        
        // Function to render alternatives
        function renderAlternatives() {
            alternativesList.innerHTML = ''; // Clear existing
            
            const displayCount = showingAllAlternatives 
                ? Math.min(maxTotalDisplay, alternatives.length)
                : Math.min(maxInitialDisplay, alternatives.length);
            
            const alternativesToShow = alternatives.slice(0, displayCount);
            
            alternativesToShow.forEach((alt, index) => {
                if (!alt) return; // Skip empty alternatives
                
                const optionDiv = document.createElement('div');
                optionDiv.className = 'xpath-option';
                if (alt === action.selector.current) {
                    optionDiv.classList.add('selected');
                }
                
                // Add visual distinction for additional alternatives (beyond top 5)
                if (index >= maxInitialDisplay) {
                    optionDiv.style.backgroundColor = '#f8f9fa';
                }
                
                const optionContent = document.createElement('div');
                optionContent.className = 'xpath-option-content';
                
                const xpathText = document.createElement('div');
                xpathText.className = 'xpath-text';
                xpathText.textContent = alt;
                xpathText.addEventListener('click', (e) => {
                    // Prevent closing if click originated from test button or its children
                    if (e.target.closest('.test-btn') || e.target.classList.contains('test-btn')) {
                        return; // Don't close dropdown
                    }
                    
                    // Remove selected class from all options
                    alternativesList.querySelectorAll('.xpath-option').forEach(opt => opt.classList.remove('selected'));
                    // Add selected class to clicked option
                    optionDiv.classList.add('selected');
                    // Update the action
                    action.selector.current = alt;
                    
                    // VISUAL FEEDBACK: Brief success highlight before closing
                    optionDiv.style.background = '#dcfce7'; // Success green
                    optionDiv.style.borderColor = '#10b981';
                    
                    setTimeout(() => {
                        expandedActionIndex = null; // Close the dropdown
                        renderUI();
                    }, 300); // 300ms delay for visual feedback
                });
                optionContent.appendChild(xpathText);
                
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'xpath-actions';
                
                const testBtn = document.createElement('button');
                testBtn.className = 'test-btn';
                testBtn.textContent = 'Test';
                
                const resultSpan = document.createElement('span');
                resultSpan.className = 'validation-result';
                
                testBtn.addEventListener('click', () => {
                    testSelector(alt, 'xpath', resultSpan);
                });
                
                actionsDiv.appendChild(testBtn);
                actionsDiv.appendChild(resultSpan);
                optionContent.appendChild(actionsDiv);
                
                optionDiv.appendChild(optionContent);
                alternativesList.appendChild(optionDiv);
            });
        }
        
        // Initial render of alternatives
        renderAlternatives();
        alternativesSection.appendChild(alternativesList);
        
        // NEW: Show All Alternatives button (only if there are more than maxInitialDisplay)
        if (alternatives.length > maxInitialDisplay) {
            const showAllBtn = document.createElement('button');
            showAllBtn.className = 'show-all-alternatives-btn';
            
            function updateShowAllButton() {
                if (showingAllAlternatives) {
                    showAllBtn.innerHTML = '📋 Show Less';
                    showAllBtn.title = `Show only top ${maxInitialDisplay} alternatives`;
                } else {
                    const additionalCount = Math.min(maxTotalDisplay, alternatives.length) - maxInitialDisplay;
                    showAllBtn.innerHTML = `📋 Show All Alternatives (+${additionalCount} more)`;
                    showAllBtn.title = `Show ${additionalCount} additional alternatives`;
                }
            }
            
            updateShowAllButton();
            
            showAllBtn.addEventListener('click', () => {
                showingAllAlternatives = !showingAllAlternatives;
                renderAlternatives();
                updateShowAllButton();
                
                // Scroll the additional alternatives into view when expanding
                if (showingAllAlternatives) {
                    setTimeout(() => {
                        const additionalAlternatives = alternativesList.children[maxInitialDisplay];
                        if (additionalAlternatives) {
                            additionalAlternatives.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }, 100);
                }
            });
            
            alternativesSection.appendChild(showAllBtn);
        }
        
        editorContent.appendChild(alternativesSection);
        
        // Custom Selector Section
        const customSection = document.createElement('div');
        customSection.className = 'custom-selector-section';
        
        const addCustomBtn = document.createElement('button');
        addCustomBtn.className = 'add-custom-btn';
        addCustomBtn.innerHTML = '+ Add Custom Selector';
        addCustomBtn.addEventListener('click', () => {
            addCustomBtn.style.display = 'none';
            customInputContainer.style.display = 'block';
            customInput.focus();
        });
        customSection.appendChild(addCustomBtn);
        
        // NEW: Convert to Click Actions button (only for select actions)
        if (action.action === 'select' && action._originalClicks && action._originalClicks.length > 0) {
            const convertBtn = document.createElement('button');
            convertBtn.className = 'add-custom-btn';
            convertBtn.innerHTML = '🔄 Convert to Click Actions';
            convertBtn.style.backgroundColor = '#fd7e14';
            convertBtn.style.marginTop = '8px';
            convertBtn.addEventListener('click', () => {
                // Replace select action with click actions
                const clickActions = action._originalClicks.map(click => ({
                    ...click,
                    // Remove the _originalClicks metadata from converted actions
                    _originalClicks: undefined
                }));
                
                // Remove the select action and insert click actions at the same position
                recordedActions.splice(index, 1, ...clickActions);
                
                // Update expanded action index
                if (expandedActionIndex === index) {
                    expandedActionIndex = null;
                } else if (expandedActionIndex > index) {
                    expandedActionIndex += clickActions.length - 1;
                }
                
                renderUI();
            });
            customSection.appendChild(convertBtn);
        }
        
        const customInputContainer = document.createElement('div');
        customInputContainer.className = 'custom-selector-input-container';
        customInputContainer.style.display = 'none';
        
        // Header with title and toggle
        const customHeader = document.createElement('div');
        customHeader.className = 'custom-selector-header';
        
        const customTitle = document.createElement('div');
        customTitle.className = 'custom-selector-title';
        customTitle.innerHTML = '🔧 Custom Selector';
        customHeader.appendChild(customTitle);
        
        // Selector type toggle
        const selectorToggle = document.createElement('div');
        selectorToggle.className = 'selector-type-toggle';
        
        const xpathToggle = document.createElement('button');
        xpathToggle.className = 'toggle-option active';
        xpathToggle.textContent = 'XPath';
        xpathToggle.dataset.type = 'xpath';
        
        const cssToggle = document.createElement('button');
        cssToggle.className = 'toggle-option';
        cssToggle.textContent = 'CSS';
        cssToggle.dataset.type = 'css';
        
        let customSelectorType = 'xpath';
        
        function updateToggleState(activeType) {
            customSelectorType = activeType;
            xpathToggle.classList.toggle('active', activeType === 'xpath');
            cssToggle.classList.toggle('active', activeType === 'css');
            
            // Update placeholder
            if (activeType === 'xpath') {
                customInput.placeholder = 'Enter your custom XPath...';
            } else {
                customInput.placeholder = 'Enter your CSS selector...';
            }
        }
        
        xpathToggle.addEventListener('click', () => updateToggleState('xpath'));
        cssToggle.addEventListener('click', () => updateToggleState('css'));
        
        selectorToggle.appendChild(xpathToggle);
        selectorToggle.appendChild(cssToggle);
        customHeader.appendChild(selectorToggle);
        
        customInputContainer.appendChild(customHeader);
        
        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.className = 'custom-selector-input';
        customInput.value = action.selector.current;
        customInput.placeholder = 'Enter your custom XPath...';
        customInputContainer.appendChild(customInput);
        
        const customActions = document.createElement('div');
        customActions.className = 'custom-selector-actions';
        
        const testCustomBtn = document.createElement('button');
        testCustomBtn.className = 'test-btn';
        testCustomBtn.textContent = 'Test';
        
        const customResultSpan = document.createElement('span');
        customResultSpan.className = 'validation-result';
        
        testCustomBtn.addEventListener('click', () => {
            testSelector(customInput.value, customSelectorType, customResultSpan);
        });
        
        const applyBtn = document.createElement('button');
        applyBtn.className = 'apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => {
            const newSelector = customInput.value.trim();
            if (newSelector) {
                action.selector.current = newSelector;
                if (!action.selector.alternatives.includes(newSelector)) {
                    action.selector.alternatives.push(newSelector);
                }
                // Store custom selector metadata
                action.selector.customType = customSelectorType;
                action.selector.customValue = newSelector;
                expandedActionIndex = null;
                renderUI();
            }
        });
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            addCustomBtn.style.display = 'block';
            customInputContainer.style.display = 'none';
        });
        
        customActions.appendChild(testCustomBtn);
        customActions.appendChild(customResultSpan);
        customActions.appendChild(applyBtn);
        customActions.appendChild(cancelBtn);
        customInputContainer.appendChild(customActions);
        
        customSection.appendChild(customInputContainer);
        editorContent.appendChild(customSection);

        // NEW: Element State Section (only show for actions with selectors)
        if (action.selector) {
            const stateSection = document.createElement('div');
            stateSection.className = 'custom-selector-section';
            
            const stateTitle = document.createElement('h4');
            stateTitle.style.margin = '16px 0 12px 0';
            stateTitle.style.fontSize = '14px';
            stateTitle.style.fontWeight = '600';
            stateTitle.style.color = '#495057';
            stateTitle.textContent = 'Element State';
            stateSection.appendChild(stateTitle);
            
            const stateSelectContainer = document.createElement('div');
            stateSelectContainer.style.marginBottom = '16px';
            
            const stateSelect = document.createElement('select');
            stateSelect.style.width = '100%';
            stateSelect.style.padding = '8px 12px';
            stateSelect.style.border = '1px solid #ced4da';
            stateSelect.style.borderRadius = '4px';
            stateSelect.style.fontSize = '14px';
            
            // State options
            const states = [
                { value: 'visible', label: 'Visible (element has content and is not hidden)' },
                { value: 'hidden', label: 'Hidden (element is detached, empty, or visibility:hidden)' },
                { value: 'attached', label: 'Attached (element is present in DOM)' }
            ];
            
            states.forEach(state => {
                const option = document.createElement('option');
                option.value = state.value;
                option.textContent = state.label;
                if (action.selector.state === state.value) {
                    option.selected = true;
                }
                stateSelect.appendChild(option);
            });
            
            // Handle state changes
            stateSelect.addEventListener('change', (e) => {
                action.selector.state = e.target.value;
                renderUI(); // Update the display
            });
            
            stateSelectContainer.appendChild(stateSelect);
            stateSection.appendChild(stateSelectContainer);

            const stateInfo = document.createElement('div');
            stateInfo.style.fontSize = '12px';
            stateInfo.style.color = '#666';
            stateInfo.style.marginTop = '8px';
            stateInfo.innerHTML = `
                <strong>Auto-detected:</strong> State is automatically detected for each action based on element visibility.<br>
                <strong>Hidden selects:</strong> Automatically use "attached" state for better compatibility.
            `;
            stateSection.appendChild(stateInfo);

            editorContent.appendChild(stateSection);
        }
        
        editor.appendChild(editorContent);
        container.appendChild(editor);
        
        return container;
    }
    
    function generatePayload() {
        const payload = {
            url: initialUrl,
            browserHtml: true,
        };

        const actionsForPayload = JSON.parse(JSON.stringify(recordedActions));
        actionsForPayload.forEach(action => {
            // Remove internal replay tracking properties
            delete action.replayStatus;
            delete action.replayErrorMsg;
            delete action._originalClicks;
            
            if (action.selector) {
                // Check if current selector is a custom one and use appropriate type
                if (action.selector.customValue && 
                    action.selector.current === action.selector.customValue && 
                    action.selector.customType) {
                    action.selector.type = action.selector.customType;
                } else {
                    action.selector.type = 'xpath';
                }
                
                action.selector.value = action.selector.current;
                // NEW: Keep the state field in the final payload
                // action.selector.state stays as-is
                
                // Remove internal properties
                delete action.selector.current;
                delete action.selector.alternatives;
                delete action.selector.customType;
                delete action.selector.customValue;
            }
        });
        payload.actions = actionsForPayload;

        if (screenshotCheckbox.checked) {
            payload.screenshot = true;
            payload.screenshotOptions = { fullPage: true };
        }

        if (includeIframesCheckbox.checked) {
            payload.includeIframes = true;
        }

        payloadDisplay.textContent = JSON.stringify(payload, null, 2);
    }



    function renderUI() {
        renderActions();
        generatePayload();
    }
    
    function updateButtonStates() {
        const hasActions = recordedActions.length > 0;
        
        // Enhanced debugging
        console.log('=== Button State Debug ===');
        console.log('isRecording:', isRecording);
        console.log('isReplaying:', isReplaying);
        console.log('recordedActions.length:', recordedActions.length);
        console.log('hasActions:', hasActions);
        console.log('replayState.currentActionIndex:', replayState.currentActionIndex);
        
        startBtn.disabled = isRecording || isReplaying;
        stopBtn.disabled = !isRecording;
        clearBtn.disabled = isReplaying;
        replayBtn.disabled = isRecording || !hasActions;
        
        // Update replay button text based on state with proper counter
        if (isReplaying) {
            const currentAction = replayState.currentActionIndex + 1; // 1-based for display
            const totalActions = recordedActions.length;
            replayBtn.textContent = `Stop Replay (${currentAction}/${totalActions})`;
            console.log('Setting replay button text to:', replayBtn.textContent);
        } else if (document.querySelector('.action-status-header')) {
            replayBtn.textContent = 'Reset';
        } else {
            replayBtn.textContent = 'Replay';
        }
        
        // Disable manual action buttons during recording/replay
        const manualButtons = [hoverBtn, hideBtn, scrollToBtn, waitForElementBtn, waitTimeoutBtn];
        manualButtons.forEach(btn => {
            if (btn) btn.disabled = isReplaying;
        });
    }

    function startPickerMode(action) {
        if (!port) {
            alert("Please start a recording session first.");
            return;
        }
        port.postMessage({
            type: 'start_picker_mode',
            tabId: chrome.devtools.inspectedWindow.tabId,
            action: action
        });
    }

    // --- Event Listeners ---
    startBtn.addEventListener('click', () => {
        console.log('=== Start button clicked ===');
        
        // Reset replay state if there was a previous replay (same as Clear button)
        if (document.querySelector('.action-status-header')) {
            console.log('Resetting previous replay state...');
            removeStatusColumn();
            clearActionHighlights();
            // Clear stored replay statuses from any existing actions
            recordedActions.forEach(action => {
                delete action.replayStatus;
                delete action.replayErrorMsg;
                // NEW: Clear conversion metadata on new recording
                delete action._originalClicks;
            });
        }
        
        // Reset all state for new recording
        recordedActions = [];
        expandedActionIndex = null;
        isRecording = true;
        isReplaying = false;
        replayState.currentActionIndex = 0;
        
        // Reset iframe state for new recording session
        replayState.userManuallySetIframes = false;
        includeIframesCheckbox.checked = false;
        updateIframeTooltip('default');
        
        connectToBackground();
        chrome.devtools.inspectedWindow.eval('window.location.href', (result) => {
            if (result) initialUrl = result;
            renderUI();
            updateButtonStates();
        });
        
        if (port) {
            port.postMessage({
                type: 'start_recording',
                tabId: chrome.devtools.inspectedWindow.tabId
            });
        }
    });

    stopBtn.addEventListener('click', () => {
        console.log('=== Stop button clicked ===');
        console.log('recordedActions.length before stop:', recordedActions.length);
        
        isRecording = false;
        // DON'T call updateButtonStates() here - it will be called when flush completes
        
        if (port) {
            port.postMessage({
                type: 'stop_recording',
                tabId: chrome.devtools.inspectedWindow.tabId
            });
            setTimeout(() => {
                if (port) {
                    port.disconnect();
                    port = null;
                }
                // Call updateButtonStates here as fallback in case no flush happens
                updateButtonStates();
            }, 250);
        } else {
            // If no port, update immediately
            updateButtonStates();
        }
    });


    clearBtn.addEventListener('click', () => {
        // Enhanced Clear: current clear functionality + reset functionality (minus navigation)
        recordedActions = [];
        expandedActionIndex = null;
        
        // Reset iframe state
        replayState.userManuallySetIframes = false;
        includeIframesCheckbox.checked = false;
        updateIframeTooltip('default');
        
        // Reset replay state (without navigation)
        if (document.querySelector('.action-status-header')) {
            removeStatusColumn();
        }
        clearActionHighlights();
        isReplaying = false;
        replayState.currentActionIndex = 0;
        
        renderUI();
    });


    replayBtn.addEventListener('click', () => {
        if (replayBtn.textContent === 'Replay') {
            startReplay();
        } else if (replayBtn.textContent.includes('Stop Replay')) {
            stopReplay();
        } else if (replayBtn.textContent === 'Reset') {
            resetReplay();
        }
    });

    settingsBtn.addEventListener('click', showSettingsPanel);

    screenshotCheckbox.addEventListener('change', renderUI);
    
    includeIframesCheckbox.addEventListener('change', () => {
        replayState.userManuallySetIframes = true;
        updateIframeTooltip('manual');
        renderUI();
    });

    hoverBtn.addEventListener('click', () => startPickerMode('hover'));
    hideBtn.addEventListener('click', () => startPickerMode('hide'));
    waitForElementBtn.addEventListener('click', () => startPickerMode('waitForSelector'));

    scrollToBtn.addEventListener('click', () => {
        if (!port) {
            alert("Please start a recording session first.");
            return;
        }
        port.postMessage({
            type: 'record_scroll_to',
            tabId: chrome.devtools.inspectedWindow.tabId
        });
    });

    waitTimeoutBtn.addEventListener('click', () => {
        const timeoutInSeconds = parseInt(waitTimeoutInput.value, 10);
        if (timeoutInSeconds > 0) {
            const currentTotalWaitSeconds = recordedActions
                .filter(a => a.action === 'waitForTimeout')
                .reduce((sum, a) => sum + a.timeout, 0);

            if (currentTotalWaitSeconds + timeoutInSeconds > 60) {
                alert('Total wait time cannot exceed 60 seconds.');
                return;
            }
            recordedActions.push({ action: 'waitForTimeout', timeout: timeoutInSeconds, onError: 'return' });
            renderUI();
        }
    });

    copyPayloadBtn.addEventListener('click', () => {
        const textToCopy = payloadDisplay.textContent;
        const textArea = document.createElement('textarea');
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            copyPayloadBtn.textContent = 'Copied!';
            setTimeout(() => copyPayloadBtn.textContent = 'Copy Payload', 2000);
        } catch (err) {
            console.error('Failed to copy payload: ', err);
        }
        document.body.removeChild(textArea);
    });

    // Enhanced drag and drop functionality
    let draggedItemIndex = null;

    function clearDropIndicators() {
        document.querySelectorAll('.drag-over-above, .drag-over-below').forEach(el => {
            el.classList.remove('drag-over-above', 'drag-over-below');
        });
        actionsList.classList.remove('drag-active');
        
        // Clear scroll indicators
        const container = document.querySelector('.actions-list-container');
        if (container) {
            container.classList.remove('scroll-up', 'scroll-down');
        }
    }

    function handleAutoScroll(e) {
        const container = document.querySelector('.actions-list-container');
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        const mouseY = e.clientY;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const containerHeight = container.clientHeight;
        
        // Check if we're in scroll zones
        const topZone = mouseY < rect.top + AUTO_SCROLL_CONFIG.ZONE_HEIGHT;
        const bottomZone = mouseY > rect.bottom - AUTO_SCROLL_CONFIG.ZONE_HEIGHT;
        
        // Calculate scroll speed based on proximity to edge
        let scrollSpeed = AUTO_SCROLL_CONFIG.SCROLL_SPEED;
        if (topZone) {
            const distanceFromTop = mouseY - rect.top;
            scrollSpeed = Math.max(
                AUTO_SCROLL_CONFIG.SCROLL_SPEED,
                AUTO_SCROLL_CONFIG.MAX_SCROLL_SPEED * (1 - distanceFromTop / AUTO_SCROLL_CONFIG.ZONE_HEIGHT)
            );
        } else if (bottomZone) {
            const distanceFromBottom = rect.bottom - mouseY;
            scrollSpeed = Math.max(
                AUTO_SCROLL_CONFIG.SCROLL_SPEED,
                AUTO_SCROLL_CONFIG.MAX_SCROLL_SPEED * (1 - distanceFromBottom / AUTO_SCROLL_CONFIG.ZONE_HEIGHT)
            );
        }
        
        // Start auto-scroll if in zone and can scroll
        if (topZone && scrollTop > 0) {
            startAutoScroll('up', scrollSpeed, container);
        } else if (bottomZone && scrollTop < scrollHeight - containerHeight) {
            startAutoScroll('down', scrollSpeed, container);
        } else {
            stopAutoScroll();
        }
    }

    function startAutoScroll(direction, speed, container) {
        // Don't restart if already scrolling in same direction
        if (currentScrollDirection === direction && autoScrollInterval) {
            return;
        }
        
        stopAutoScroll();
        
        currentScrollDirection = direction;
        
        // Add visual indicator
        container.classList.remove('scroll-up', 'scroll-down');
        container.classList.add(`scroll-${direction}`);
        
        autoScrollInterval = setInterval(() => {
            const scrollAmount = direction === 'up' ? -speed : speed;
            container.scrollTop += scrollAmount;
            
            // Stop if we've reached the limits
            if (direction === 'up' && container.scrollTop <= 0) {
                stopAutoScroll();
            } else if (direction === 'down' && 
                       container.scrollTop >= container.scrollHeight - container.clientHeight) {
                stopAutoScroll();
            }
        }, AUTO_SCROLL_CONFIG.SCROLL_INTERVAL);
    }

    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
        
        currentScrollDirection = null;
        
        // Remove visual indicators
        const container = document.querySelector('.actions-list-container');
        if (container) {
            container.classList.remove('scroll-up', 'scroll-down');
        }
    }


    function getDropPosition(e, targetLi) {
        if (!targetLi) return null;
        
        const rect = targetLi.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const mouseY = e.clientY;
        
        return mouseY < midpoint ? 'above' : 'below';
    }



    function handleDragOver(e) {
        // Clear existing indicators
        clearDropIndicators();
        
        // Add drag-active state
        actionsList.classList.add('drag-active');
        
        // Show drop indicators
        showDropIndicator(e);
        
        // Handle auto-scroll
        handleAutoScroll(e);
    }



    function showDropIndicator(e) {
        const targetLi = e.target.closest('li');
        if (targetLi && targetLi.dataset.index) {
            const position = getDropPosition(e, targetLi);
            
            // Remove any existing drop classes from all items
            document.querySelectorAll('.drag-over-above, .drag-over-below').forEach(el => {
                el.classList.remove('drag-over-above', 'drag-over-below');
            });
            
            // Add appropriate drop class
            if (position === 'above') {
                targetLi.classList.add('drag-over-above');
            } else {
                targetLi.classList.add('drag-over-below');
            }
        }
    }


    actionsList.addEventListener('dragstart', (e) => {
        const li = e.target.closest('li');
        if (li && li.dataset.index) {
            draggedItemIndex = parseInt(li.dataset.index, 10);
            li.classList.add('dragging');
            
            // Set drag effect
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', li.outerHTML);
            
            // Add drag-active class to container
            actionsList.classList.add('drag-active');
        }
    });


    actionsList.addEventListener('dragend', (e) => {
        const li = e.target.closest('li');
        if (li) {
            li.classList.remove('dragging');
        }
        
        // Clean up all drag states
        clearDropIndicators();
        stopAutoScroll();
        draggedItemIndex = null;
    });


    actionsList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        // Handle visual feedback and auto-scroll
        handleDragOver(e);
    });

    // Enhanced dragenter event
    actionsList.addEventListener('dragenter', (e) => {
        e.preventDefault();
        handleDragOver(e);
    });

    // Enhanced dragleave event
    actionsList.addEventListener('dragleave', (e) => {
        // Only clear if we're leaving the actions list entirely
        if (!actionsList.contains(e.relatedTarget)) {
            clearDropIndicators();
            stopAutoScroll();
        }
    });

    // Enhanced drop event (keep your existing drop logic but add cleanup)
    actionsList.addEventListener('drop', (e) => {
        e.preventDefault();
        
        // Clean up visual states
        clearDropIndicators();
        stopAutoScroll();
        
        // Your existing drop logic here...
        if (draggedItemIndex === null || draggedItemIndex === undefined) return;
        
        const targetLi = e.target.closest('li');
        let dropIndex;
        
        if (targetLi && targetLi.dataset.index) {
            const targetIndex = parseInt(targetLi.dataset.index, 10);
            const position = getDropPosition(e, targetLi);
            
            if (position === 'above') {
                dropIndex = targetIndex;
            } else {
                dropIndex = targetIndex + 1;
            }
        } else {
            // Dropped outside of any item
            const rect = actionsList.getBoundingClientRect();
            if (e.clientY > rect.bottom - 40) {
                dropIndex = recordedActions.length;
            } else {
                dropIndex = 0;
            }
        }
        
        // Adjust drop index if dragging from above
        if (draggedItemIndex < dropIndex) {
            dropIndex--;
        }
        
        // Perform the reorder
        if (dropIndex !== draggedItemIndex && dropIndex >= 0 && dropIndex <= recordedActions.length) {
            const [draggedItem] = recordedActions.splice(draggedItemIndex, 1);
            recordedActions.splice(dropIndex, 0, draggedItem);
            
            // Update expanded action index if needed
            if (expandedActionIndex === draggedItemIndex) {
                expandedActionIndex = dropIndex;
            } else if (expandedActionIndex > draggedItemIndex && expandedActionIndex <= dropIndex) {
                expandedActionIndex--;
            } else if (expandedActionIndex < draggedItemIndex && expandedActionIndex >= dropIndex) {
                expandedActionIndex++;
            }
            
            renderUI();
        }
        
        draggedItemIndex = null;
        });
    });
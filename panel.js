document.addEventListener('DOMContentLoaded', () => {
    // Global listener to dismiss the XPath dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (activeSelectorDropdown) {
            const isEditButton = e.target.closest('.edit-btn');
            const isDropdownClick = activeSelectorDropdown.contains(e.target);
            const isCustomItemClick = e.target.classList.contains('custom-item');

            if (!isEditButton && !isDropdownClick && !isCustomItemClick) {
                activeSelectorDropdown.remove();
                activeSelectorDropdown = null;
            }
        }
    });

    // --- DOM Element References ---
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyPayloadBtn = document.getElementById('copy-payload-btn');
    const hoverBtn = document.getElementById('hover-btn');
    const hideBtn = document.getElementById('hide-btn');
    const scrollToBtn = document.getElementById('scroll-to-btn');
    const waitForElementBtn = document.getElementById('wait-for-element-btn');
    const waitTimeoutBtn = document.getElementById('wait-timeout-btn');
    const waitTimeoutInput = document.getElementById('wait-timeout-input');
    const screenshotCheckbox = document.getElementById('screenshot-checkbox');
    const actionsList = document.getElementById('actions-list');
    const payloadDisplay = document.getElementById('payload-display');

    // --- State Management ---
    let recordedActions = [];
    let port = null;
    let initialUrl = '';
    let activeSelectorDropdown = null; // Track the currently open dropdown

    // --- Initial Setup ---
    chrome.devtools.inspectedWindow.eval('window.location.href', (result, isException) => {
        if (!isException && result) initialUrl = result;
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
                recordedActions.push(message.action);
                renderUI();
            }
        });
        port.onDisconnect.addListener(() => { port = null; updateButtonStates(false); });
    }

    // --- UI Update Functions ---
    function renderActions() {
        actionsList.innerHTML = '';
        recordedActions.forEach((action, index) => {
            const li = document.createElement('li');
            li.dataset.index = index;
            li.draggable = true;

            // Action Details
            let detailsText = action.selector?.current || action.url || action.key || '';
            if (action.action === 'scrollTo') detailsText = `top: ${action.top}, left: ${action.left}`;
            else if (action.action === 'waitForTimeout') detailsText = `${action.timeout}s`;
            const detailsSpan = document.createElement('span');
            detailsSpan.className = 'action-details';
            detailsSpan.textContent = `${action.action}: ${detailsText}`;
            detailsSpan.title = action.selector?.current || '';
            li.appendChild(detailsSpan);

            // Action Controls
            const controlsContainer = document.createElement('div');
            controlsContainer.className = 'action-controls';

            // Edit XPath Button & Container
            const editContainer = document.createElement('div');
            editContainer.className = 'control-container action-edit-container';
            if (action.selector) {
                const editBtn = document.createElement('button');
                editBtn.innerHTML = '&#9998;'; // Pencil icon
                editBtn.className = 'edit-btn';
                editBtn.title = 'Edit XPath Selector';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSelectorDropdown(li, action, index);
                });
                editContainer.appendChild(editBtn);
            }
            controlsContainer.appendChild(editContainer);

            // 'Continue on Error' Checkbox
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
            controlsContainer.appendChild(continueContainer);

            // Delete Button
            const deleteContainer = document.createElement('div');
            deleteContainer.className = 'control-container action-delete-container';
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '\u00D7';
            deleteBtn.className = 'delete-btn';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                recordedActions.splice(index, 1);
                renderUI();
            });
            deleteContainer.appendChild(deleteBtn);
            controlsContainer.appendChild(deleteContainer);
            
            li.appendChild(controlsContainer);
            actionsList.appendChild(li);
        });
    }

    function toggleSelectorDropdown(liElement, action, index) {
        if (activeSelectorDropdown) {
            activeSelectorDropdown.remove();
            activeSelectorDropdown = null;
        }

        const dropdown = document.createElement('div');
        dropdown.className = 'selector-dropdown';
        
        action.selector.alternatives.forEach(alt => {
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.textContent = alt;
            if (alt === action.selector.current) {
                item.classList.add('selected');
                item.textContent = `⭐ ${item.textContent}`;
            }
            item.addEventListener('click', () => {
                action.selector.current = alt;
                renderUI();
            });
            dropdown.appendChild(item);
        });

        const customItem = document.createElement('div');
        customItem.className = 'selector-item custom-item';
        customItem.textContent = '[+] Enter custom XPath...';
        customItem.addEventListener('click', () => {
            showCustomInput(liElement, action, index);
        });
        dropdown.appendChild(customItem);
        
        liElement.appendChild(dropdown);
        activeSelectorDropdown = dropdown;
    }
    
    function showCustomInput(liElement, action, index) {
        if (activeSelectorDropdown) activeSelectorDropdown.remove();

        const inputContainer = document.createElement('div');
        inputContainer.className = 'custom-selector-input-container';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'custom-selector-input';
        input.value = action.selector.current;

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => {
            const newSelector = input.value.trim();
            if (newSelector) {
                action.selector.current = newSelector;
                if (!action.selector.alternatives.includes(newSelector)) {
                    action.selector.alternatives.push(newSelector);
                }
                renderUI();
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            renderUI(); // Just re-render to remove the input
        });

        inputContainer.appendChild(input);
        inputContainer.appendChild(saveBtn);
        inputContainer.appendChild(cancelBtn);
        liElement.appendChild(inputContainer);
        activeSelectorDropdown = inputContainer;
        input.focus();
    }
    
    function generatePayload() {
        const payload = {
            url: initialUrl,
            browserHtml: true,
        };

        const actionsForPayload = JSON.parse(JSON.stringify(recordedActions));
        actionsForPayload.forEach(action => {
            if (action.selector) {
                action.selector.value = action.selector.current;
                delete action.selector.current;
                delete action.selector.alternatives;
            }
        });
        payload.actions = actionsForPayload;

        if (screenshotCheckbox.checked) {
            payload.screenshot = true;
            payload.screenshotOptions = { fullPage: true };
        }
        payloadDisplay.textContent = JSON.stringify(payload, null, 2);
    }

    function renderUI() {
        if(activeSelectorDropdown) activeSelectorDropdown.remove();
        activeSelectorDropdown = null;
        renderActions();
        generatePayload();
    }
    
    function updateButtonStates(isRecording) {
        startBtn.disabled = isRecording;
        stopBtn.disabled = !isRecording;
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

    startBtn.addEventListener('click', () => {
        recordedActions = [];
        connectToBackground();
        chrome.devtools.inspectedWindow.eval('window.location.href', (result) => {
            if (result) initialUrl = result;
            renderUI();
        });
        updateButtonStates(true);
        if (port) {
            port.postMessage({
                type: 'start_recording',
                tabId: chrome.devtools.inspectedWindow.tabId
            });
        }
    });

    stopBtn.addEventListener('click', () => {
        updateButtonStates(false);
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
            }, 250);
        }
    });

    clearBtn.addEventListener('click', () => {
        recordedActions = [];
        renderUI();
    });

    screenshotCheckbox.addEventListener('change', renderUI);
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

    let draggedItemIndex = null;
    actionsList.addEventListener('dragstart', (e) => {
        draggedItemIndex = parseInt(e.target.dataset.index, 10);
        e.target.style.opacity = '0.5';
    });
    actionsList.addEventListener('dragend', (e) => {
        e.target.style.opacity = '';
    });
    actionsList.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    actionsList.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetElement = e.target.closest('li');
        if (targetElement && !isNaN(targetElement.dataset.index)) {
            const dropIndex = parseInt(targetElement.dataset.index, 10);
            if (!isNaN(draggedItemIndex)) {
                const [draggedItem] = recordedActions.splice(draggedItemIndex, 1);
                recordedActions.splice(dropIndex, 0, draggedItem);
                renderUI();
            }
        }
        draggedItemIndex = null;
    });
});
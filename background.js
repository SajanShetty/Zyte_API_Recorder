// background.js (Final Version)
let recordingStates = {}; 

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'devtools') return;
  let tabId;
  port.onMessage.addListener((message) => {
    if (!message.tabId) return;
    tabId = message.tabId;

    if (!recordingStates[tabId]) {
        recordingStates[tabId] = { isRecording: false, port: port };
    }

    switch (message.type) {
        case 'start_recording':
            recordingStates[tabId].isRecording = true;
            break;
        case 'stop_recording':
            if (recordingStates[tabId]) {
                // Tell the content script to flush any pending actions before stopping
                chrome.tabs.sendMessage(tabId, { type: 'flush_buffer' });
                recordingStates[tabId].isRecording = false;
            }
            break;
        case 'start_picker_mode':
            chrome.tabs.sendMessage(tabId, { type: 'start_element_picker', action: message.action });
            break;
        case 'record_scroll_to':
            chrome.tabs.sendMessage(tabId, { type: 'get_scroll_position' }, (response) => {
                if (response) {
                    const scrollToAction = {
                        action: 'scrollTo',
                        top: response.y,
                        left: response.x,
                        onError: 'return'
                    };
                    port.postMessage({ type: 'new_action', action: scrollToAction });
                }
            });
            break;
    }
  });

  port.onDisconnect.addListener(() => {
    if (tabId && recordingStates[tabId]) delete recordingStates[tabId];
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!sender.tab) return; // Ignore messages from other extension contexts
    const tabId = sender.tab.id;
    const state = recordingStates[tabId];
    if (state?.isRecording && state.port) {
        if (message.type === 'recorded_action' || message.type === 'element_picked') {
            state.port.postMessage({ type: 'new_action', action: message.action });
        }
    }
    return true;
});

chrome.webNavigation.onCommitted.addListener((details) => {
    const { tabId, transitionType, url } = details;
    const state = recordingStates[tabId];
    if (state?.isRecording && state.port && url !== 'about:blank') {
        if (transitionType === 'reload') {
            state.port.postMessage({ type: 'new_action', action: { action: 'reload' } });
        } else if (['typed', 'link', 'form_submit'].includes(transitionType)) {
             // To avoid duplicate navigation events, we can add a small delay and check
             setTimeout(() => {
                chrome.tabs.get(tabId, (tab) => {
                    if (tab && tab.url === url) { // Ensure this is the final URL
                         state.port.postMessage({ type: 'new_action', action: { action: 'goto', url: url } });
                    }
                });
             }, 100);
        }
    }
});
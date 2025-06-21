// content.js (Final, Complete, and Verified Version with Click Fix)

let pickerMode = { isActive: false, action: '' };
let lastRightClickedElement = null;

// --- State for grouping Shadow DOM actions ---
let isInShadowDomMode = false;
let shadowDomActionBuffer = [];

// --- State to prevent duplicate 'type' events ---
let lastTypedElement = null;

// --- Helper function to escape CSS identifiers and values for use in strings ---
function escapeCss(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

// --- Generates a robust CSS Selector for elements inside a Shadow DOM ---
function generateCssSelectorForShadow(element) {
    const shadowRoot = element.getRootNode();
    if (!(shadowRoot instanceof ShadowRoot)) return element.tagName.toLowerCase();

    // --- Strategy 1: Unique ID ---
    if (element.id) {
        const selector = `#${escapeCss(element.id)}`;
        if (shadowRoot.querySelector(selector) === element) return selector;
    }

    // --- Strategy 2: Stable Attributes ---
    const stableAttrs = ['data-testid', 'data-cy', 'name', 'role', 'aria-label', 'placeholder', 'title'];
    for (const attr of stableAttrs) {
        const attrValue = element.getAttribute(attr);
        if (attrValue) {
            const selector = `${element.tagName.toLowerCase()}[${attr}='${escapeCss(attrValue)}']`;
            if (shadowRoot.querySelector(selector) === element) return selector;
        }
    }

    // --- Strategy 3: Parent-Anchored Flexible Path ---
    let parent = element.parentElement;
    for (let i = 0; i < 5 && parent && parent !== shadowRoot; i++) { // Search up to 5 levels
        let parentSelector = '';
        if (parent.id) {
            parentSelector = `#${escapeCss(parent.id)}`;
        } else {
            for (const attr of stableAttrs) {
                const attrValue = parent.getAttribute(attr);
                if (attrValue) {
                     parentSelector = `${parent.tagName.toLowerCase()}[${attr}='${escapeCss(attrValue)}']`;
                     break;
                }
            }
        }

        if (parentSelector && shadowRoot.querySelectorAll(parentSelector).length === 1) {
            let path = '';
            let child = element;
            while(child && child !== parent) {
                const parentOfChild = child.parentElement;
                if (!parentOfChild) break;
                const ownIndex = Array.from(parentOfChild.children).indexOf(child) + 1;
                path = `> :nth-child(${ownIndex}) ${path}`;
                child = parentOfChild;
            }
            return `${parentSelector} ${path.trim()}`;
        }
        parent = parent.parentElement;
    }

    // --- Strategy 4: Full Structural Path (Fallback) ---
    let path = '';
    let current = element;
    while (current && current.parentElement && current !== shadowRoot) {
        const ownIndex = Array.from(current.parentElement.children).indexOf(current) + 1;
        let segment = `:nth-child(${ownIndex})`;
        path = `> ${segment} ${path}`;
        current = current.parentElement;
    }
    return path.trim().substring(2); // Remove leading '> '
}


// --- ENHANCED: Generates all possible selectors ---
function generateSelectors(element) {
    if (!element || !element.tagName) return { best: '', alternatives: [] };

    const isXPathUnique = (xpath) => {
        try {
            return document.evaluate(`count(${xpath})`, document, null, XPathResult.NUMBER_TYPE, null).numberValue === 1;
        } catch (e) { return false; }
    };

    let allSelectors = new Set();
    let tagName = element.tagName.toLowerCase();
    if (element instanceof SVGElement) tagName = `*[name()='${tagName}']`;

    // Strategy 1: Unique ID
    if (element.id) {
        const idXPath = `//${tagName}[@id='${element.id}']`;
        if (isXPathUnique(idXPath)) allSelectors.add(idXPath);
    }
    // Strategy 2: Stable Attributes
    const stableAttrs = ['data-testid', 'data-cy', 'name', 'value', 'aria-label', 'placeholder', 'title'];
    for (const attr of stableAttrs) {
        const attrValue = element.getAttribute(attr);
        if (attrValue) {
            let attrXPath = `//${tagName}[@${attr}='${attrValue}']`;
            if (isXPathUnique(attrXPath)) allSelectors.add(attrXPath);
        }
    }
    // Strategy 3: Text Content
    const textContent = element.textContent.trim();
    if (textContent && textContent.length > 0 && textContent.length < 80) {
        const textXPath = `//${tagName}[normalize-space()="${textContent}"]`;
        if (isXPathUnique(textXPath)) allSelectors.add(textXPath);
    }
    // Strategy 3.5: Compound (Class + Text)
    if (textContent && element.className && typeof element.className === 'string') {
        const stableClassName = element.className.split(' ').map(c => c.split('__')[0]).find(c => c);
        if (stableClassName) {
            const compoundXPath = `//${tagName}[contains(@class, '${stableClassName}') and normalize-space()="${textContent}"]`;
            if (isXPathUnique(compoundXPath)) allSelectors.add(compoundXPath);
        }
    }
    // Strategy 4: Parent-Anchored Path
    let parent = element.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
        let parentTagName = parent.tagName.toLowerCase();
        let parentXPath = '';
        if (parent.id) parentXPath = `//${parentTagName}[@id='${parent.id}']`;
        if (parentXPath && isXPathUnique(parentXPath)) {
            const targetBestSelector = (textContent && `[normalize-space()="${textContent}"]`) || '';
            if (targetBestSelector) {
                const finalXPath = `${parentXPath}//${tagName}${targetBestSelector}`;
                if (isXPathUnique(finalXPath)) allSelectors.add(finalXPath);
            }
        }
        parent = parent.parentElement;
    }
    // Strategy 5: Structural Path (Last Resort)
    let path = '';
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
        let segment = current.tagName.toLowerCase();
        let parent = current.parentElement;
        if (parent) {
            let index = 1;
            let sibling = current.previousElementSibling;
            while (sibling) {
                if (sibling.tagName.toLowerCase() === current.tagName.toLowerCase()) index++;
                sibling = sibling.previousElementSibling;
            }
            const siblings = Array.from(parent.children).filter(c => c.tagName.toLowerCase() === current.tagName.toLowerCase());
            if (siblings.length > 1) segment += `[${index}]`;
        }
        path = `/${segment}` + path;
        if (parent && parent.id) {
             allSelectors.add(`//${parent.tagName.toLowerCase()}[@id='${parent.id}']${path}`);
             break;
        }
        current = parent;
    }
    if (path && allSelectors.size === 0) allSelectors.add(path);
    
    const alternatives = Array.from(allSelectors);
    return {
        best: alternatives[0] || '',
        alternatives: alternatives
    };
}

// --- Helper function to create action objects ---
function createAction(actionType, element, options = {}) {
    const selectors = generateSelectors(element);
    return {
        action: actionType,
        selector: {
            type: 'xpath',
            current: selectors.best,
            alternatives: selectors.alternatives
        },
        ...options,
        onError: 'return'
    };
}


// --- Function to flush the Shadow DOM buffer ---
function flushShadowDomBuffer() {
    if (isInShadowDomMode && shadowDomActionBuffer.length > 0) {
        const combinedSource = shadowDomActionBuffer.join(' ');
        const evaluateAction = {
            action: 'evaluate',
            source: combinedSource,
            onError: 'return'
        };
        chrome.runtime.sendMessage({ type: 'recorded_action', action: evaluateAction });
    }
    isInShadowDomMode = false;
    shadowDomActionBuffer = [];
}

// --- EVENT LISTENERS (PRESERVING ORIGINAL LOGIC + NEW FEATURES) ---

document.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        lastRightClickedElement = e.target;
    }
}, true);

document.addEventListener('click', (e) => {
    const target = e.composedPath()[0] || e.target;

    if (pickerMode.isActive) {
        e.preventDefault(); e.stopPropagation();
        flushShadowDomBuffer();
        const action = createAction(pickerMode.action, target);
        chrome.runtime.sendMessage({ type: 'element_picked', action: action });
        pickerMode.isActive = false; document.body.style.cursor = 'default';
        return;
    }

    if (target.getRootNode() instanceof ShadowRoot) {
        isInShadowDomMode = true;

        // =================================================================
        // --- START of FIX ---
        // Traverse up from the literal event.target to find the intended clickable element.
        // This prevents creating a selector for a non-interactive element (like a <span>) inside a <button>.
        let intendedTarget = target.closest('button, a, input[type="button"], input[type="submit"], [role="button"]');
        
        // If closest() returns null or goes outside the shadow root, fallback to the original target.
        if (!intendedTarget || intendedTarget.getRootNode() !== target.getRootNode()) {
            intendedTarget = target; 
        }
        // --- END of FIX ---
        // =================================================================

        const host = intendedTarget.getRootNode().host;
        const hostXPath = generateSelectors(host).best.replace(/`/g, '\\`');
        
        // Use the intendedTarget to generate the selector, not the original event.target
        const innerSelector = generateCssSelectorForShadow(intendedTarget);

        const source = `const host${shadowDomActionBuffer.length} = document.evaluate(\`${hostXPath}\`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; if (host${shadowDomActionBuffer.length} && host${shadowDomActionBuffer.length}.shadowRoot) { const elementToClick = host${shadowDomActionBuffer.length}.shadowRoot.querySelector(\`${innerSelector}\`); if (elementToClick) elementToClick.click(); }`;
        shadowDomActionBuffer.push(source.replace(/\s+/g, ' ').trim());
    } else {
        flushShadowDomBuffer();
        const clickAction = createAction('click', target);
        chrome.runtime.sendMessage({ type: 'recorded_action', action: clickAction });
        const link = target.closest('a');
        if (link && link.href && link.target !== '_blank' && !link.href.startsWith('mailto:')) {
            try {
                const currentUrl = new URL(window.location.href);
                const linkUrl = new URL(link.href);
                if (linkUrl.host === currentUrl.host && (linkUrl.pathname !== currentUrl.pathname || linkUrl.search !== currentUrl.search)) {
                    chrome.runtime.sendMessage({ type: 'recorded_action', action: { action: 'waitForNavigation', onError: 'return' } });
                }
            } catch (error) {}
        }
    }
}, true);

document.addEventListener('blur', (e) => {
    const target = e.composedPath()[0] || e.target;
    if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.getRootNode() instanceof ShadowRoot) {
        isInShadowDomMode = true;
        const host = target.getRootNode().host;
        const hostXPath = generateSelectors(host).best.replace(/`/g, '\\`');

        // Uses the new centralized function
        const innerSelector = generateCssSelectorForShadow(target);

        if (!hostXPath || !innerSelector) return;
        const valueToSet = target.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
        const source = `const host${shadowDomActionBuffer.length} = document.evaluate(\`${hostXPath}\`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; if (host${shadowDomActionBuffer.length} && host${shadowDomActionBuffer.length}.shadowRoot) { const input = host${shadowDomActionBuffer.length}.shadowRoot.querySelector(\`${innerSelector}\`); if (input) { input.value = \`${valueToSet}\`; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); } }`;
        shadowDomActionBuffer.push(source.replace(/\s+/g, ' ').trim());
    }
}, true);

document.addEventListener('dblclick', (e) => {
    flushShadowDomBuffer();
    const action = createAction('doubleClick', e.target);
    chrome.runtime.sendMessage({ type: 'recorded_action', action: action });
}, true);

document.addEventListener('change', (e) => {
  if (e.target.getRootNode() instanceof ShadowRoot || e.target.offsetParent === null) return;
  if (e.target === lastTypedElement) {
    lastTypedElement = null;
    return;
  }
  flushShadowDomBuffer();
  const tagName = e.target.tagName.toLowerCase();
  let action;
  if (tagName === 'input' || tagName === 'textarea') {
    action = createAction('type', e.target, { text: e.target.value });
  } else if (tagName === 'select') {
    action = createAction('select', e.target, { value: e.target.value });
  }
  if(action) chrome.runtime.sendMessage({ type: 'recorded_action', action: action });
}, true);

document.addEventListener('keydown', (e) => {
  const target = e.target;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
  const nonCharKeys = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  if (isInput && e.key === 'Enter' && target.value) {
    flushShadowDomBuffer();
    const typeAction = createAction('type', target, { text: target.value });
    chrome.runtime.sendMessage({ type: 'recorded_action', action: typeAction });
    lastTypedElement = target;
    const keyPressAction = { action: 'keyPress', key: e.key, onError: 'return' };
    chrome.runtime.sendMessage({ type: 'recorded_action', action: keyPressAction });
    return;
  }
  if (nonCharKeys.includes(e.key)) {
    flushShadowDomBuffer();
    const action = { action: 'keyPress', key: e.key, onError: 'return' };
    chrome.runtime.sendMessage({ type: 'recorded_action', action: action });
  }
}, true);

let scrollTimeout;
document.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        const el = document.documentElement;
        if (el.scrollHeight - el.scrollTop <= el.clientHeight + 1) {
             chrome.storage.local.get('scrollDelay', (result) => {
                const delay = result.scrollDelay || 1000;
                setTimeout(() => {
                    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 1) {
                         flushShadowDomBuffer();
                         chrome.runtime.sendMessage({ type: 'recorded_action', action: { action: 'scrollBottom' } });
                    }
                }, delay);
             });
        }
    }, 500);
}, true);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'start_element_picker') {
        flushShadowDomBuffer();
        pickerMode.isActive = true;
        pickerMode.action = message.action;
        document.body.style.cursor = 'crosshair';
        const escapeListener = (e) => {
            if (e.key === 'Escape') {
                pickerMode.isActive = false;
                document.body.style.cursor = 'default';
                document.removeEventListener('keydown', escapeListener);
            }
        };
        document.addEventListener('keydown', escapeListener);
    } else if (message.type === 'get_scroll_position') {
        sendResponse({ x: window.scrollX, y: window.scrollY });
    } else if (message.type === 'get_xpath_for_last_right_clicked_element') {
        if (lastRightClickedElement) {
            const selectors = generateSelectors(lastRightClickedElement);
            sendResponse({ xpath: selectors.best });
        } else {
            sendResponse({ xpath: null });
        }
    } else if (message.type === 'flush_buffer') {
        flushShadowDomBuffer();
        sendResponse({ status: 'flushed' });
    }
    return true;
});
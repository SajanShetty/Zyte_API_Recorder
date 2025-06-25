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
        // Clear select state for shadow DOM interactions
        if (selectState.storedClicks.length > 0) {
            consolidateSelectAction();
        }
        
        isInShadowDomMode = true;
        let intendedTarget = target.closest('button, a, input[type="button"], input[type="submit"], [role="button"]');
        
        if (!intendedTarget || intendedTarget.getRootNode() !== target.getRootNode()) {
            intendedTarget = target; 
        }

        const host = intendedTarget.getRootNode().host;
        const hostXPath = generateSelectors(host).best.replace(/`/g, '\\`');
        const innerSelector = generateCssSelectorForShadow(intendedTarget);

        const source = `const host${shadowDomActionBuffer.length} = document.evaluate(\`${hostXPath}\`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; if (host${shadowDomActionBuffer.length} && host${shadowDomActionBuffer.length}.shadowRoot) { const elementToClick = host${shadowDomActionBuffer.length}.shadowRoot.querySelector(\`${innerSelector}\`); if (elementToClick) elementToClick.click(); }`;
        shadowDomActionBuffer.push(source.replace(/\s+/g, ' ').trim());
        return;
    }

    // ENHANCED: Select/Option detection with improved hidden select handling
    const selectOrOption = isSelectOrOptionElement(target);
    
    if (selectOrOption) {
        const selectElement = getSelectElement(target);
        const optionElement = getOptionElement(target);
        
        // Check if this is a different select element
        if (selectState.currentSelectElement && selectState.currentSelectElement !== selectElement) {
            // Different select, consolidate previous and start new
            consolidateSelectAction();
        }
        
        // Initialize select state if new
        if (!selectState.currentSelectElement) {
            selectState.currentSelectElement = selectElement;
            selectState.isMultiple = selectElement.hasAttribute('multiple');
            
            if (debugMode) {
                console.log('Starting select interaction:', {
                    selectElement: selectElement,
                    multiple: selectState.isMultiple,
                    isHidden: isElementHidden(selectElement)
                });
            }
        }
        
        // Create and store click action
        const clickAction = createAction('click', target);
        selectState.storedClicks.push(clickAction);
        
        // If clicking on valid option, extract value
        if (optionElement && hasValidOptionValue(optionElement)) {
            const optionValue = optionElement.getAttribute('value');
            
            // For single select, replace value; for multi-select, add to array
            if (selectState.isMultiple) {
                if (!selectState.clickedOptionValues.includes(optionValue)) {
                    selectState.clickedOptionValues.push(optionValue);
                }
            } else {
                selectState.clickedOptionValues = [optionValue];
                // Single select - consolidate immediately
                setTimeout(() => consolidateSelectAction(), 0);
                return;
            }
        }
        
        return; // Don't record individual click for select/option elements
    } else {
        // Clicked on non-select/non-option element
        if (selectState.storedClicks.length > 0) {
            consolidateSelectAction();
        }
    }

    // Regular click handling (existing code)
    flushShadowDomBuffer();
    const clickAction = createAction('click', target);
    chrome.runtime.sendMessage({ type: 'recorded_action', action: clickAction });
}, true);



document.addEventListener('change', (e) => {
    // Clear select state on change of non-select elements
    if (!isSelectOrOptionElement(e.target) && selectState.storedClicks.length > 0) {
        consolidateSelectAction();
    }
    
    // Existing change logic
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
        // Don't create individual select actions here - handled by consolidation
        return;
    }
    if(action) chrome.runtime.sendMessage({ type: 'recorded_action', action: action });
}, true);
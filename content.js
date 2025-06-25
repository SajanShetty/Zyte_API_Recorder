// content.js (Enhanced Version with Improved State Detection)

let pickerMode = { isActive: false, action: '' };
let lastRightClickedElement = null;

// --- State for grouping Shadow DOM actions ---
let isInShadowDomMode = false;
let shadowDomActionBuffer = [];

// --- State to prevent duplicate 'type' events ---
let lastTypedElement = null;

// --- Iframe detection state ---
let iframeInteractionDetected = false;

// --- Settings cache ---
let settings = null;

// --- Performance and debug state ---
let debugMode = false;



// Enhanced default settings with new performance options
const ENHANCED_DEFAULT_SETTINGS = {
    // Original settings
    classBlacklist: [
        '_*', 'css-*', 'jss*', 'makeStyles-*', 'MuiButton-root-*',
        'sc-*', 'emotion-*', 'jsx-*', 'vue-*', 'ng-*', 'svelte-*',
        'webpack-*', 'vite-*', '*-[0-9]*-[0-9]*', '*[0-9][0-9][0-9]*',
        '*-hash-*', '*-generated-*', 'p-[0-9]*', 'm-[0-9]*', 'w-[0-9]*', 'h-[0-9]*',
        
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
        'btn*', 'button*', 'primary', 'secondary', 'submit', 'cancel',
        'nav*', 'menu*', 'form*', 'input*', 'header*', 'footer*', 'sidebar*',
        'content*', 'main*', 'card*', 'modal*', 'dialog*', 'popup*', 'tooltip*',
        'dropdown*', 'select*', 'checkbox*', 'radio*', 'tab*', 'accordion*',
        'collapse*', 'panel*', 'alert*', 'notice*', 'message*', 'notification*',
        'badge*', 'tag*', 'label*', 'chip*', 'table*', 'row*', 'cell*', 'column*',
        'list*', 'item*', 'link*', 'text*', 'icon*', 'image*', 'avatar*', 'logo*',
        'search*', 'filter*', 'sort*', 'pagination*',
        'small', 'medium', 'large', 'xl', 'xs',
        'compact', 'full', 'mini', 'tiny', 'info', 'dark', 'light', 'theme*',
        
        // Component library classes (stable ones)
        'hydrated', 'form-control', 'form-group', 'input-group*'
    ],
    scrollDelay: 1000,
    replayDelay: 500,
    navigationTimeout: 10000,
    highlightElements: true,
    hoverDuration: 1000,
    
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
    prioritizeTestAttributes: true,
    enableElementState: true
};

// Performance limits
const PERFORMANCE_LIMITS = {
    get maxAlternatives() { return settings?.maxAlternatives || 20; },
    get maxParentDepth() { return settings?.maxParentDepth || 3; },
    get maxSiblingDistance() { return settings?.maxSiblingDistance || 5; },
    get maxTextLength() { return settings?.maxTextLength || 100; },
    get maxSelectorLength() { return settings?.maxSelectorLength || 300; },
    get timeoutMs() { return settings?.selectorTimeoutMs || 1000; },
    get earlyExitThreshold() { return settings?.earlyExitThreshold || 5; }
};

// Load settings from storage
function loadSettings() {
    chrome.storage.local.get(['extensionSettings'], (result) => {
        if (chrome.runtime.lastError) {
            console.warn('Error loading settings:', chrome.runtime.lastError);
            settings = ENHANCED_DEFAULT_SETTINGS;
            debugMode = settings.debugMode;
            return;
        }
        
        if (result.extensionSettings) {
            settings = { ...ENHANCED_DEFAULT_SETTINGS, ...result.extensionSettings };
        } else {
            settings = ENHANCED_DEFAULT_SETTINGS;
            // Save default settings
            chrome.storage.local.set({ extensionSettings: settings });
        }
        
        debugMode = settings.debugMode || false;
        
        if (debugMode) {
            console.log('Settings loaded:', settings);
        }
    });
}

// Initialize settings
settings = ENHANCED_DEFAULT_SETTINGS; // Set immediately as fallback
debugMode = false;
loadSettings(); // Then load from storage

let isRecording = false;
let eventListeners = [];


// Listen for settings updates
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.extensionSettings) {
        // DON'T merge blacklist/whitelist - use exact values from storage
        const newSettings = { ...ENHANCED_DEFAULT_SETTINGS, ...changes.extensionSettings.newValue };
        
        // Explicitly preserve empty arrays
        if (changes.extensionSettings.newValue.classBlacklist !== undefined) {
            newSettings.classBlacklist = changes.extensionSettings.newValue.classBlacklist;
        }
        if (changes.extensionSettings.newValue.classWhitelist !== undefined) {
            newSettings.classWhitelist = changes.extensionSettings.newValue.classWhitelist;
        }
        
        settings = newSettings;
        debugMode = settings.debugMode || false;        
        console.log('🔧 Settings updated in content script:', settings);
        console.log('📋 New blacklist:', settings.classBlacklist);
    }
});


// Replace the syncRecordingState function with this more robust version:

// Sync recording state on page load/reload with retry mechanism
function syncRecordingState(retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    if (debugMode) console.log(`Attempting to sync recording state (attempt ${retryCount + 1})`);
    
    chrome.runtime.sendMessage({ type: 'get_recording_state' }, (response) => {
        if (chrome.runtime.lastError) {
            if (debugMode) console.warn('Could not get recording state:', chrome.runtime.lastError.message);
            
            // Retry if we haven't exceeded max retries
            if (retryCount < maxRetries) {
                if (debugMode) console.log(`Retrying in ${retryDelay}ms...`);
                setTimeout(() => syncRecordingState(retryCount + 1), retryDelay);
            } else {
                if (debugMode) console.log('Max retries reached - assuming recording is not active');
            }
            return;
        }
        
        if (response && response.isRecording) {
            if (debugMode) console.log('Page loaded - resuming recording from background state');
            startRecordingListeners();
        } else {
            if (debugMode) console.log('Page loaded - recording not active');
        }
    });
}

// Call sync when content script loads, with a small delay to ensure background script is ready
setTimeout(() => {
    syncRecordingState();
}, 100);


// --- Helper function to convert glob patterns to regex ---
function globToRegex(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
}

// --- Enhanced CSS escaping ---
function escapeCss(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
        .replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/:/g, '\\:')
        .replace(/;/g, '\\;').replace(/\./g, '\\.').replace(/,/g, '\\,')
        .replace(/>/g, '\\>').replace(/\+/g, '\\+').replace(/~/g, '\\~');
}

// --- Enhanced XPath escaping ---
function escapeXPathValue(str) {
    if (!str) return "''";
    
    if (!str.includes("'") && !str.includes('"')) {
        return `'${str}'`;
    }
    
    const parts = [];
    let current = '';
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === "'") {
            if (current) {
                parts.push(`'${current}'`);
                current = '';
            }
            parts.push('"' + char + '"');
        } else {
            current += char;
        }
    }
    
    if (current) parts.push(`'${current}'`);
    return parts.length === 1 ? parts[0] : `concat(${parts.join(', ')})`;
}

// --- Enhanced Text Content Processing ---
function cleanTextContent(text) {
    if (!text) return '';
    return text
        .replace(/\s+/g, ' ')
        .replace(/\r?\n/g, ' ')
        .replace(/[^\u0000-\u00ff]/g, '')
        .trim();
}

// --- Dynamic Attribute Detection ---
function isDynamicAttribute(attributeName, attributeValue) {
    if (!attributeValue || typeof attributeValue !== 'string') return false;
    
    const dynamicAttributeNames = [
        'style', 'xpath', 'css', 'data-reactid', 'data-react-checksum'
    ];
    
    if (dynamicAttributeNames.includes(attributeName)) return true;
    
    const dynamicPatterns = [
        /^[0-9]+$/, /^[a-f0-9]{8,}$/i, /\d{10,}/, /^(css|jss|makeStyles|sc)-/,
        /(timestamp|time|date|uuid|session|token)/i, /_\d{3,}$/,
        /^(tmp|temp|auto|gen)/i, /\d{4,}-\d{2,}-\d{2,}/, /^v\d+/, /react-.*\d+/
    ];
    
    return dynamicPatterns.some(pattern => pattern.test(attributeValue));
}

// --- Container Classification ---
function isAlwaysMeaningfulContainer(element) {
    const meaningfulTags = [
        'nav', 'ul', 'ol', 'table', 'form', 'section', 'article',
        'header', 'footer', 'aside', 'main', 'fieldset', 'dialog'
    ];
    const meaningfulRoles = [
        'navigation', 'list', 'table', 'form', 'banner',
        'contentinfo', 'complementary', 'main', 'dialog'
    ];
    
    return meaningfulTags.includes(element.tagName.toLowerCase()) ||
           meaningfulRoles.includes(element.getAttribute('role'));
}

function isConditionallyMeaningfulContainer(element) {
    const tagName = element.tagName.toLowerCase();
    if (!['div', 'span', 'body'].includes(tagName)) return false;
    
    return element.id ||
           element.getAttribute('data-testid') ||
           element.getAttribute('data-cy') ||
           element.getAttribute('role') ||
           (element.className && typeof element.className === 'string' && 
            !isDynamicAttribute('class', element.className));
}

function isMeaningfulContainer(element) {
    return isAlwaysMeaningfulContainer(element) || 
           isConditionallyMeaningfulContainer(element);
}

function getSelectorPriorityTier(selector) {
    // Tier 1: Always wins (highest priority)
    if (selector.match(/^\/{1,2}\w+\[@(id|data-testid|data-cy)=['"][^'"]*['"]?\]$/)) {
        return 1000; // ID, data-testid, data-cy
    }
    
    // Tier 2: Very high priority  
    if (selector.match(/^\/{1,2}\w+\[@(name|aria-label)=['"][^'"]*['"]?\]$/)) {
        return 900; // name, aria-label
    }
    
    // Tier 3: High priority simple attributes
    if (selector.match(/^\/{1,2}\w+\[@(role|type|placeholder)=['"][^'"]*['"]?\]$/)) {
        return 800; // role, type, placeholder
    }
    
    // Tier 4: Other simple single-attribute selectors
    if (selector.match(/^\/{1,2}\w+\[@\w+=['"][^'"]*['"]?\]$/)) {
        return 700; // Any other simple single attribute
    }
    
    // Tier 5: Everything else (text-based, complex selectors, etc.)
    return 100; // Base tier
}

// --- Enhanced Selector Scoring System ---
function calculateSelectorScore(selector, element, context = {}) {
    let score = getSelectorPriorityTier(selector); // Base score
    
    if (debugMode) console.log(`Scoring selector: "${selector}"`);
    
    // Positive scoring
    if (selector.includes('@data-testid') || selector.includes('@data-cy')) score += 30;
    if (selector.includes('@aria-label') || selector.includes('@role')) score += 20;
    if (selector.includes('@id') && !selector.includes('contains(@id')) score += 15;
    if (selector.includes('text()') || selector.includes('normalize-space()')) score += 10;
    if (context.isMeaningfulContainer) score += 15;
    if (context.isFlexible) score += 10;
    if (context.isElementSpecific) score += 8;
    if (context.isParentAnchored) score += 12;
    if (context.isChildAnchored) score += 10;
    if (selector.includes('@name') || selector.includes('@placeholder')) score += 8;
    
    // Negative scoring
    if (selector.includes('[1]') || selector.includes('[2]')) score -= 5;
    if (selector.includes('[3]') || selector.includes('[4]')) score -= 10;
    if ((selector.match(/\[/g) || []).length > 3) score -= 5;
    if (selector.length > 200) score -= 20;
    else if (selector.length > 100) score -= 10;
    if (selector.includes('/div/div/div')) score -= 8;
    if (selector.match(/css-\d+|jss\d+|makeStyles/)) score -= 15;
    
    // Tie-breaker: shorter is better
    score -= selector.length * 0.01;
    
    if (debugMode) console.log(`Final score: ${Math.round(score)}`);
    return Math.round(score);
}

// --- XPath Uniqueness Testing ---
function createUniquenessChecker() {
    return (xpath) => {
        try {
            const count = document.evaluate(`count(${xpath})`, document, null, XPathResult.NUMBER_TYPE, null).numberValue;
            const isUnique = count === 1;
            if (debugMode) console.log(`XPath: "${xpath}" -> ${isUnique ? 'UNIQUE' : 'NOT UNIQUE'} (${count} matches)`);
            return isUnique;
        } catch (e) {
            if (debugMode) console.log(`XPath: "${xpath}" -> ERROR: ${e.message}`);
            return false;
        }
    };
}

// --- Enhanced Element Analysis ---
function getAttributePriority(attrName) {
    const priorityMap = {
        'data-testid': 100, 'data-cy': 100, 'data-test': 95,
        'id': 90, 'hukid': 88, 'name': 85, 'aria-label': 80, 
        'aria-labelledby': 75, 'role': 70,
        'placeholder': 65, 'title': 60, 'alt': 55, 'for': 50,
        'value': 45, 'href': 40, 'src': 35, 'type': 30, 
        'class': 20, // Lowered priority
        'tabindex': 10, 'target': 5
    };
    return priorityMap[attrName] || 0;
}

function getStableAttributes(element) {
    const stableAttrs = [];
    const allAttrs = Array.from(element.attributes);
    
    for (const attr of allAttrs) {
        const isDynamic = isDynamicAttribute(attr.name, attr.value);
        const priority = getAttributePriority(attr.name);
        
        if (!isDynamic && priority > 0) {
            stableAttrs.push({
                name: attr.name,
                value: attr.value,
                priority: priority,
                isDynamic: false
            });
        }
    }
    
    return stableAttrs.sort((a, b) => b.priority - a.priority);
}

// --- Enhanced Class Filtering ---
function filterClasses(classNames, useWhitelist = false) {
    if (!classNames || !settings) return [];
    
    const classes = classNames.split(' ').filter(cls => cls.trim());
    const patterns = useWhitelist ? settings.classWhitelist : settings.classBlacklist;
    
    return classes.filter(cls => {
        const matchesAny = patterns.some(pattern => {
            const regex = globToRegex(pattern);
            return regex.test(cls);
        });
        return useWhitelist ? matchesAny : !matchesAny;
    });
}

function getSemanticClasses(element) {
    if (!element.className || typeof element.className !== 'string') return [];
    
    const allClasses = element.className.split(' ').filter(cls => cls.trim());
    const semanticClasses = filterClasses(element.className, true);
    const bemClasses = allClasses.filter(cls => {
        return /^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z][a-z0-9]*(-[a-z0-9]+)*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?$/i.test(cls);
    });
    
    return [...new Set([...semanticClasses, ...bemClasses])];
}

// --- Element Characteristic Analysis ---
function getElementCharacteristics(element) {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    
    return {
        isInteractive: ['a', 'button', 'input', 'select', 'textarea'].includes(tagName) ||
            element.hasAttribute('onclick') || element.hasAttribute('href') ||
            ['button', 'link', 'menuitem', 'tab'].includes(role),
        isFormElement: ['input', 'select', 'textarea', 'button', 'form', 'label'].includes(tagName),
        isListItem: tagName === 'li' || role === 'listitem',
        isTableElement: ['table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot'].includes(tagName) ||
            ['row', 'cell', 'columnheader', 'rowheader'].includes(role),
        hasAriaRole: !!role,
        isLandmark: ['main', 'nav', 'header', 'footer', 'aside', 'section'].includes(tagName) ||
            ['main', 'navigation', 'banner', 'contentinfo', 'complementary', 'region'].includes(role),
        isMeaningfulContainer: isMeaningfulContainer(element)
    };
}

// --- ENHANCED ELEMENT STATE DETECTION ---

// In content.js, replace this entire function
function isElementHidden(element) {
    if (!element || !element.isConnected) {
        return true; // Detached from DOM
    }
    
    try {
        const styles = getComputedStyle(element);
        // An element is hidden if display is 'none', visibility is 'hidden', or opacity is '0'.
        if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') {
            return true;
        }
        
        const rect = element.getBoundingClientRect();
        // An element is also hidden if it has no physical size on the screen.
        if (rect.width === 0 && rect.height === 0) {
            return true;
        }
        
        return false;
    } catch (error) {
        if (debugMode) {
            console.warn('Hidden element check failed:', error);
        }
        return false; // Assume visible on error
    }
}

function detectElementState(element) {
    // Skip if setting disabled - return default
    if (!settings?.enableElementState) {
        return "visible";
    }
    
    try {
        // Check 1: DOM attachment
        if (!element.isConnected) {
            return "hidden"; // Detached from DOM
        }
        
        // Check 2: Computed styles and bounding box
        const styles = getComputedStyle(element);
        if (styles.visibility === "hidden") {
            return "hidden"; // visibility:hidden
        }
        
        if (styles.display === "none") {
            return "hidden"; // display:none creates empty bounding box
        }
        
        // Check 3: Bounding box
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            return "hidden"; // Empty bounding box
        }
        
        // Element is attached and has non-empty bounding box and no visibility:hidden
        return "visible";
    } catch (error) {
        if (debugMode) {
            console.warn('Element state detection failed:', error);
        }
        return "visible"; // Default fallback
    }
}

function getActionSpecificState(actionType, element, detectedState) {
    // Action-specific state logic
    switch (actionType) {
        case 'hide':
            // Hide actions should target visible elements (can't hide what's already hidden)
            return "visible";
            
        case 'waitForSelector':
            // Wait actions should default to attached (waiting for elements to appear)
            return "attached";
            
        case 'select':
            // Special handling for select elements
            if (element.tagName === 'SELECT' || element.closest('select')) {
                const selectElement = element.tagName === 'SELECT' ? element : element.closest('select');
                if (isElementHidden(selectElement)) {
                    // Hidden selects should use "attached" state
                    if (debugMode) {
                        console.log('Hidden select detected, setting state to "attached"');
                    }
                    return "attached";
                }
            }
            return detectedState;
            
        default:
            // For all other actions (click, type, hover, doubleClick), use detected state
            return detectedState;
    }
}

// --- Selector Generation Strategies ---

// Strategy 1: Stable ID Selectors
function generateIdSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    if (element.id && !isDynamicAttribute('id', element.id)) {
        const idXPath = `//${tagName}[@id=${escapeXPathValue(element.id)}]`;
        if (isXPathUnique(idXPath)) {
            selectors.push({
                selector: idXPath,
                score: calculateSelectorScore(idXPath, element),
                context: { hasStableId: true }
            });
        }
    }
    return selectors;
}


// NEW FUNCTION: Selector Reduction Algorithm
function reduceSelector(xpath, isXPathUnique) {
    if (!xpath.startsWith('//')) {
        return xpath; // Can't reduce relative XPaths
    }

    const segments = xpath.substring(2).split('/');
    if (segments.length <= 2) {
        return xpath; // Not long enough to reduce
    }

    // Try to remove segments from the beginning
    for (let i = segments.length - 2; i > 0; i--) {
        const newXPath = '//' + segments.slice(i).join('/');
        if (isXPathUnique(newXPath)) {
            if (debugMode) console.log(`Selector reduced from "${xpath}" to "${newXPath}"`);
            return newXPath; // Return the first, shortest unique version found
        }
    }

    return xpath; // Return original if no shorter unique version was found
}

// Strategy 2: Test Attribute Selectors
function generateTestAttributeSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    const testAttributes = ['data-testid', 'data-cy', 'data-test'];
    
    for (const attr of testAttributes) {
        const value = element.getAttribute(attr);
        if (value && !isDynamicAttribute(attr, value)) {
            const testXPath = `//${tagName}[@${attr}=${escapeXPathValue(value)}]`;
            if (isXPathUnique(testXPath)) {
                selectors.push({
                    selector: testXPath,
                    score: calculateSelectorScore(testXPath, element),
                    context: { hasTestAttribute: true }
                });
                break; // One test attribute is usually enough
            }
        }
    }
    return selectors;
}

// Strategy 3: Stable Attribute Selectors
function generateStableAttributeSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    const stableAttributes = getStableAttributes(element);

    // Generate selectors for single stable attributes
    for (const attr of stableAttributes.slice(0, 4)) { // Limit to top 4
        const exactSelector = `//${tagName}[@${attr.name}=${escapeXPathValue(attr.value)}]`;
        if (isXPathUnique(exactSelector)) {
            selectors.push({
                selector: exactSelector,
                score: calculateSelectorScore(exactSelector, element),
                context: { hasStableAttribute: true, priority: attr.priority }
            });
        }
    }

    if (stableAttributes.length >= 2) {
        const topTwo = stableAttributes.slice(0, 2);
        const compositeXPath = `//${tagName}[@${topTwo[0].name}=${escapeXPathValue(topTwo[0].value)} and @${topTwo[1].name}=${escapeXPathValue(topTwo[1].value)}]`;
        if (isXPathUnique(compositeXPath)) {
            selectors.push({
                selector: compositeXPath,
                score: calculateSelectorScore(compositeXPath, element) + 5, // Bonus for being composite
                context: { hasStableAttribute: true, isComposite: true }
            });
        }
    }
    if (stableAttributes.length >= 3) {
        const topThree = stableAttributes.slice(0, 3);
        const compositeXPath3 = `//${tagName}[@${topThree[0].name}=${escapeXPathValue(topThree[0].value)} and @${topThree[1].name}=${escapeXPathValue(topThree[1].value)} and @${topThree[2].name}=${escapeXPathValue(topThree[2].value)}]`;
        if (isXPathUnique(compositeXPath3)) {
             selectors.push({
                selector: compositeXPath3,
                score: calculateSelectorScore(compositeXPath3, element) + 10, // Higher bonus
                context: { hasStableAttribute: true, isComposite: true }
            });
        }
    }

    return selectors;
}

// Strategy 4: Parent-Anchored Selectors
// UPDATED STRATEGY: Parent-Anchored Selectors (with Stable Ancestor Logic)
function generateParentAnchoredSelectors(element, meaningfulParents, isXPathUnique) {
    const selectors = [];
    const tagName = element.tagName.toLowerCase();
    const elementText = cleanTextContent(element.textContent);

    // --- NEW: Prioritize finding the nearest STABLE ancestor ---
    let stableAncestor = null;
    for (const parent of meaningfulParents) {
        const testId = parent.getAttribute('data-testid') || parent.getAttribute('data-cy');
        const id = parent.id;
        if (testId && !isDynamicAttribute(testId)) {
            stableAncestor = {el: parent, type: 'testid', value: testId};
            break;
        }
        if (id && !isDynamicAttribute('id', id)) {
            stableAncestor = {el: parent, type: 'id', value: id};
            break;
        }
    }

    if (stableAncestor) {
        const parentTag = stableAncestor.el.tagName.toLowerCase();
        const anchorAttr = stableAncestor.type === 'id' ? '@id' : '@data-testid';
        const anchorXPath = `//${parentTag}[${anchorAttr}=${escapeXPathValue(stableAncestor.value)}]`;

        // Create a path from the stable anchor to the target
        // For simplicity, we create a direct descendant path. A more complex implementation
        // could find the relative path.
        
        // Option A: Direct descendant with text
        if (elementText && elementText.length <= PERFORMANCE_LIMITS.maxTextLength) {
            const combinedPath = `${anchorXPath}//${tagName}[normalize-space()=${escapeXPathValue(elementText)}]`;
             if (isXPathUnique(combinedPath)) {
                selectors.push({
                    selector: combinedPath,
                    score: calculateSelectorScore(combinedPath, element, { isParentAnchored: true }) + 20,
                    context: { isStableAncestor: true }
                });
            }
        }
        
        // Option B: Direct descendant with just the tag
        const genericPath = `${anchorXPath}//${tagName}`;
        if (document.evaluate(genericPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue === element) {
            if (isXPathUnique(genericPath)) {
                 selectors.push({
                    selector: genericPath,
                    score: calculateSelectorScore(genericPath, element, { isParentAnchored: true }) + 10,
                    context: { isStableAncestor: true, isGeneric: true }
                });
            }
        }
    }
    // --- END OF NEW LOGIC ---

    // The old logic can remain as a fallback if no stable ancestor is found
    for (const parent of meaningfulParents.slice(0, 2)) {
        // ... (you can keep the original loop here if you want more fallbacks, 
        // or remove it if the stable ancestor logic is sufficient) ...
    }
    
    return selectors;
}
// Strategy 5: Child-Anchored Selectors (child unique + parent context)
function generateChildAnchoredSelectors(element, isXPathUnique) {
    const selectors = [];
    const tagName = element.tagName.toLowerCase();
    
    // Find unique children that could provide context
    const uniqueChildren = Array.from(element.querySelectorAll('*')).filter(child => {
        const childText = cleanTextContent(child.textContent);
        const childId = child.id;
        return (childText && childText.length < 30) || 
               (childId && !isDynamicAttribute('id', childId));
    }).slice(0, 3); // Limit to first 3
    
    for (const child of uniqueChildren) {
        const childText = cleanTextContent(child.textContent);
        const childTag = child.tagName.toLowerCase();
        
        if (childText && childText.length < 30) {
            const childAnchoredXPath = `//${tagName}[.//${childTag}[contains(text(), ${escapeXPathValue(childText)})]]`;
            if (isXPathUnique(childAnchoredXPath)) {
                selectors.push({
                    selector: childAnchoredXPath,
                    score: calculateSelectorScore(childAnchoredXPath, element, { isChildAnchored: true }),
                    context: { isChildAnchored: true }
                });
            }
        }
        
        if (child.id && !isDynamicAttribute('id', child.id)) {
            const childIdXPath = `//${tagName}[.//*[@id=${escapeXPathValue(child.id)}]]`;
            if (isXPathUnique(childIdXPath)) {
                selectors.push({
                    selector: childIdXPath,
                    score: calculateSelectorScore(childIdXPath, element, { isChildAnchored: true }),
                    context: { isChildAnchored: true }
                });
            }
        }
    }
    
    return selectors;
}

// Strategy 6: Element-Specific Strategies
function generateElementSpecificSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    const characteristics = getElementCharacteristics(element);
    
    // Form element strategies
    if (characteristics.isFormElement) {
        const elementId = element.id;
        if (elementId) {
            const label = document.querySelector(`label[for="${elementId}"]`);
            if (label) {
                const labelText = cleanTextContent(label.textContent);
                if (labelText && labelText.length <= PERFORMANCE_LIMITS.maxTextLength) {
                    const labelSelector = `//label[normalize-space()=${escapeXPathValue(labelText)}]/following::${tagName}[1]`;
                    if (isXPathUnique(labelSelector)) {
                        selectors.push({
                            selector: labelSelector,
                            score: calculateSelectorScore(labelSelector, element, { isElementSpecific: true }),
                            context: { isElementSpecific: true, type: 'formLabel' }
                        });
                    }
                }
            }
        }
        
        // Form context
        const form = element.closest('form');
        if (form && (form.id || form.getAttribute('data-testid'))) {
            const formSelector = form.id ? 
                `//form[@id=${escapeXPathValue(form.id)}]` :
                `//form[@data-testid=${escapeXPathValue(form.getAttribute('data-testid'))}]`;
            
            const nameAttr = element.getAttribute('name');
            if (nameAttr) {
                const formContextSelector = `${formSelector}//${tagName}[@name=${escapeXPathValue(nameAttr)}]`;
                if (isXPathUnique(formContextSelector)) {
                    selectors.push({
                        selector: formContextSelector,
                        score: calculateSelectorScore(formContextSelector, element, { isElementSpecific: true }),
                        context: { isElementSpecific: true, type: 'formContext' }
                    });
                }
            }
        }
    }
    
    // Navigation element strategies
    if (characteristics.isInteractive && element.closest('nav, [role="navigation"]')) {
        const nav = element.closest('nav, [role="navigation"]');
        const navSelector = nav.tagName.toLowerCase() === 'nav' ? '//nav' : '//*[@role="navigation"]';
        const elementText = cleanTextContent(element.textContent);
        
        if (elementText && elementText.length <= PERFORMANCE_LIMITS.maxTextLength) {
            const navContextSelector = `${navSelector}//${tagName}[normalize-space()=${escapeXPathValue(elementText)}]`;
            if (isXPathUnique(navContextSelector)) {
                selectors.push({
                    selector: navContextSelector,
                    score: calculateSelectorScore(navContextSelector, element, { isElementSpecific: true }),
                    context: { isElementSpecific: true, type: 'navigation' }
                });
            }
        }
    }
    
    // List item strategies
    if (characteristics.isListItem) {
        const list = element.closest('ul, ol, [role="list"]');
        if (list) {
            const listItems = Array.from(list.querySelectorAll('li, [role="listitem"]'));
            const position = listItems.indexOf(element) + 1;
            
            let listSelector = '';
            if (list.id) {
                listSelector = `//*[@id=${escapeXPathValue(list.id)}]`;
            } else {
                const listClasses = getSemanticClasses(list);
                if (listClasses.length > 0) {
                    listSelector = `//${list.tagName.toLowerCase()}[contains(@class, ${escapeXPathValue(listClasses[0])})]`;
                }
            }
            
            if (listSelector) {
                const listItemSelector = `${listSelector}//li[${position}]`;
                if (isXPathUnique(listItemSelector)) {
                    selectors.push({
                        selector: listItemSelector,
                        score: calculateSelectorScore(listItemSelector, element, { isElementSpecific: true }),
                        context: { isElementSpecific: true, type: 'listPosition' }
                    });
                }
            }
        }
    }
    
    return selectors;
}

// Strategy 7: Text-Based Selectors
function generateTextBasedSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    const textContent = element.textContent?.trim();
    const innerText = element.innerText?.trim();
    
    if (!textContent) return selectors;
    
    const cleanText = cleanTextContent(textContent);
    const cleanInnerText = innerText ? cleanTextContent(innerText) : '';
    
    if (cleanText.length === 0 || cleanText.length > PERFORMANCE_LIMITS.maxTextLength) return selectors;
    
    // Exact normalized text match
    if (cleanText.length < 80) {
        const exactXPath = `//${tagName}[normalize-space()=${escapeXPathValue(cleanText)}]`;
        if (isXPathUnique(exactXPath)) {
            selectors.push({
                selector: exactXPath,
                score: calculateSelectorScore(exactXPath, element),
                context: { isTextBased: true, isExact: true }
            });
        }
    }
    
    // Contains text
    if (cleanText.length > 10) {
        const containsXPath = `//${tagName}[contains(text(), ${escapeXPathValue(cleanText)})]`;
        if (isXPathUnique(containsXPath)) {
            selectors.push({
                selector: containsXPath,
                score: calculateSelectorScore(containsXPath, element) - 3,
                context: { isTextBased: true, isPartial: true }
            });
        }
    }
    
    // Starts with text
    if (cleanText.length > 5 && cleanText.length < 60) {
        const startsWithXPath = `//${tagName}[starts-with(normalize-space(), ${escapeXPathValue(cleanText)})]`;
        if (isXPathUnique(startsWithXPath)) {
            selectors.push({
                selector: startsWithXPath,
                score: calculateSelectorScore(startsWithXPath, element) - 2,
                context: { isTextBased: true, isStartsWith: true }
            });
        }
    }
    
    // Contains with dot notation (includes descendant text)
    if (cleanText.length < 50) {
        const dotXPath = `//${tagName}[contains(., ${escapeXPathValue(cleanText)})]`;
        if (isXPathUnique(dotXPath)) {
            selectors.push({
                selector: dotXPath,
                score: calculateSelectorScore(dotXPath, element) - 5,
                context: { isTextBased: true, includesDescendants: true }
            });
        }
    }
    
    return selectors;
}

// Strategy 8: Class-Based Selectors
function generateClassBasedSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    const semanticClasses = getSemanticClasses(element);
    
    if (semanticClasses.length === 0) return selectors;
    
    // Single semantic class
    for (const cls of semanticClasses.slice(0, 3)) {
        const classSelector = `//${tagName}[contains(@class, ${escapeXPathValue(cls)})]`;
        if (isXPathUnique(classSelector)) {
            selectors.push({
                selector: classSelector,
                score: calculateSelectorScore(classSelector, element),
                context: { isClassBased: true, isSemantic: true }
            });
        }
    }
    
    // Multiple classes combination
    if (selectors.length === 0 && semanticClasses.length > 1) {
        const topTwoClasses = semanticClasses.slice(0, 2);
        const multiClassSelector = `//${tagName}[${topTwoClasses.map(cls => 
            `contains(@class, ${escapeXPathValue(cls)})`
        ).join(' and ')}]`;
        
        if (isXPathUnique(multiClassSelector)) {
            selectors.push({
                selector: multiClassSelector,
                score: calculateSelectorScore(multiClassSelector, element) - 5,
                context: { isClassBased: true, isMultiClass: true }
            });
        }
    }
    
    return selectors;
}

// Strategy 9: Flexible Sibling Context Selectors
function generateFlexibleSiblingSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    
    // Find meaningful siblings
    const siblings = Array.from(element.parentElement?.children || [])
        .filter(sibling => sibling !== element);
    
    for (const sibling of siblings.slice(0, PERFORMANCE_LIMITS.maxSiblingDistance)) {
        const siblingText = cleanTextContent(sibling.textContent);
        const siblingTag = sibling.tagName.toLowerCase();
        
        // Text-based sibling reference
        if (siblingText && siblingText.length > 3 && siblingText.length < 40) {
            const flexibleSiblingXPath = `//${siblingTag}[contains(text(), ${escapeXPathValue(siblingText)})]//following::${tagName}`;
            if (isXPathUnique(flexibleSiblingXPath)) {
                selectors.push({
                    selector: flexibleSiblingXPath,
                    score: calculateSelectorScore(flexibleSiblingXPath, element, { isFlexible: true }),
                    context: { isFlexible: true, isSiblingBased: true }
                });
            }
        }
        
        // ID-based sibling reference
        if (sibling.id && !isDynamicAttribute('id', sibling.id)) {
            const siblingIdXPath = `//*[@id=${escapeXPathValue(sibling.id)}]//following::${tagName}`;
            if (isXPathUnique(siblingIdXPath)) {
                selectors.push({
                    selector: siblingIdXPath,
                    score: calculateSelectorScore(siblingIdXPath, element, { isFlexible: true }),
                    context: { isFlexible: true, isSiblingBased: true }
                });
            }
        }
    }
    
    return selectors;
}

// Strategy 10: Specific Sibling Context Selectors
function generateSpecificSiblingSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    
    const previousSibling = element.previousElementSibling;
    const nextSibling = element.nextElementSibling;
    
    // Previous sibling reference
    if (previousSibling) {
        const siblingText = cleanTextContent(previousSibling.textContent);
        const siblingTag = previousSibling.tagName.toLowerCase();
        
        if (siblingText && siblingText.length < 30) {
            const prevSiblingXPath = `//${siblingTag}[contains(text(), ${escapeXPathValue(siblingText)})]/following-sibling::${tagName}[1]`;
            if (isXPathUnique(prevSiblingXPath)) {
                selectors.push({
                    selector: prevSiblingXPath,
                    score: calculateSelectorScore(prevSiblingXPath, element) - 5,
                    context: { isSiblingBased: true, isSpecific: true }
                });
            }
        }
    }
    
    // Next sibling reference (reverse lookup)
    if (nextSibling) {
        const siblingText = cleanTextContent(nextSibling.textContent);
        const siblingTag = nextSibling.tagName.toLowerCase();
        
        if (siblingText && siblingText.length < 30) {
            const nextSiblingXPath = `//${siblingTag}[contains(text(), ${escapeXPathValue(siblingText)})]/preceding-sibling::${tagName}[1]`;
            if (isXPathUnique(nextSiblingXPath)) {
                selectors.push({
                    selector: nextSiblingXPath,
                    score: calculateSelectorScore(nextSiblingXPath, element) - 8,
                    context: { isSiblingBased: true, isSpecific: true, isReverse: true }
                });
            }
        }
    }
    
    return selectors;
}

// Strategy 11: Contextual Selectors (tables, lists, forms)
function generateContextualSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    const characteristics = getElementCharacteristics(element);
    
    // Table cell positioning
    if (characteristics.isTableElement && ['td', 'th'].includes(tagName)) {
        const row = element.closest('tr');
        const table = element.closest('table');
        
        if (row && table) {
            const cells = Array.from(row.children);
            const cellPosition = cells.indexOf(element) + 1;
            const rows = Array.from(table.querySelectorAll('tr'));
            const rowPosition = rows.indexOf(row) + 1;
            
            const tableClasses = getSemanticClasses(table);
            if (tableClasses.length > 0) {
                const tableSelector = `//table[contains(@class, ${escapeXPathValue(tableClasses[0])})]`;
                const cellSelector = `${tableSelector}//tr[${rowPosition}]//${tagName}[${cellPosition}]`;
                if (isXPathUnique(cellSelector)) {
                    selectors.push({
                        selector: cellSelector,
                        score: calculateSelectorScore(cellSelector, element),
                        context: { isContextual: true, type: 'tableCell' }
                    });
                }
            }
        }
    }
    
    return selectors;
}

// Strategy 12: Optimized Structural Selectors
function generateOptimizedStructuralSelectors(element, isXPathUnique) {
    const selectors = [];
    
    // Generate basic structural path
    let pathSegments = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE && current.parentElement) {
        let segment = current.tagName.toLowerCase();
        const parent = current.parentElement;
        
        if (parent) {
            const siblings = Array.from(parent.children).filter(c => 
                c.tagName.toLowerCase() === current.tagName.toLowerCase()
            );
            
            if (siblings.length > 1) {
                let index = 1;
                let sibling = current.previousElementSibling;
                while (sibling) {
                    if (sibling.tagName.toLowerCase() === current.tagName.toLowerCase()) {
                        index++;
                    }
                    sibling = sibling.previousElementSibling;
                }
                segment += `[${index}]`;
            }
        }
        
        pathSegments.unshift(segment);
        current = parent;
        
        // Try anchor points
        if (parent && (parent.id || parent.getAttribute('data-testid'))) {
            const anchorSegments = pathSegments.slice();
            let anchorXPath;
            
            if (parent.id && !isDynamicAttribute('id', parent.id)) {
                anchorXPath = `//*[@id=${escapeXPathValue(parent.id)}]//${anchorSegments.join('/')}`;
            } else {
                const testId = parent.getAttribute('data-testid');
                anchorXPath = `//*[@data-testid=${escapeXPathValue(testId)}]//${anchorSegments.join('/')}`;
            }
            
            if (isXPathUnique(anchorXPath)) {
                selectors.push({
                    selector: anchorXPath,
                    score: calculateSelectorScore(anchorXPath, element),
                    context: { isStructural: true, isAnchored: true }
                });
            }
        }
        
        if (pathSegments.length >= PERFORMANCE_LIMITS.maxParentDepth) break;
    }
    
    // Full structural path as last resort
    if (pathSegments.length > 0) {
        const fullPath = `//${pathSegments.join('/')}`;
        if (isXPathUnique(fullPath)) {
            selectors.push({
                selector: fullPath,
                score: calculateSelectorScore(fullPath, element) - 15,
                context: { isStructural: true, isFull: true }
            });
        }
    }
    
    return selectors;
}


// NEW STRATEGY: Context-Aware Selectors Using Visible Labels
function generateContextualLabelSelectors(element, tagName, isXPathUnique) {
    const selectors = [];
    const elementText = cleanTextContent(element.textContent);

    // Find preceding elements that can act as labels
    let precedingElement = element.previousElementSibling;
    let searchDepth = 0;
    while (precedingElement && searchDepth < 3) {
        const labelText = cleanTextContent(precedingElement.textContent);
        if (labelText && labelText.length > 2 && labelText.length < 50 && labelText !== elementText) {
            const precedingTag = precedingElement.tagName.toLowerCase();
            
            // Using following-sibling
            const xPath = `//${precedingTag}[normalize-space()=${escapeXPathValue(labelText)}]/following-sibling::${tagName}[1]`;
            if (isXPathUnique(xPath) && document.evaluate(xPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue === element) {
                selectors.push({
                    selector: xPath,
                    score: calculateSelectorScore(xPath, element, { isFlexible: true }) + 15, // High score
                    context: { isContextualLabel: true, type: 'following-sibling' }
                });
            }
        }
        precedingElement = precedingElement.previousElementSibling;
        searchDepth++;
    }
    return selectors;
}


// --- Main Enhanced Selector Generation ---

function generateEnhancedSelectors(element) {
    if (!element || !element.tagName) return { best: '', alternatives: [] };
    
    const startTime = performance.now();
    if (debugMode) {
        console.log('=== Enhanced Selector Generation Started ===');
        console.log('Element:', element);
        console.log('Element tagName:', element.tagName);
        console.log('Element id:', element.id);
        console.log('Element className:', element.className);
        console.log('Element attributes:', Array.from(element.attributes || []).map(attr => `${attr.name}="${attr.value}"`));
    }
    
    const isXPathUnique = createUniquenessChecker();
    const allScoredSelectors = [];
    let tagName = element.tagName.toLowerCase();
    
    if (element instanceof SVGElement) {
        tagName = `*[name()='${tagName}']`;
    }
    
    // Get meaningful parents for parent-anchored strategies
    const meaningfulParents = [];
    let parent = element.parentElement;
    let depth = 0;
    
    while (parent && depth < PERFORMANCE_LIMITS.maxParentDepth) {
        if (isMeaningfulContainer(parent) || getElementCharacteristics(parent).isInteractive) {
            meaningfulParents.push(parent);
        }
        parent = parent.parentElement;
        depth++;
    }
    
    if (debugMode) {
        console.log('Meaningful parents found:', meaningfulParents.length);
        console.log('Element characteristics:', getElementCharacteristics(element));
        console.log('Stable attributes:', getStableAttributes(element));
    }
    
    try {
        // Run all strategies with timeout protection
        const strategies = [
            { name: 'ID', fn: () => generateIdSelectors(element, tagName, isXPathUnique) },
            { name: 'Test Attributes', fn: () => generateTestAttributeSelectors(element, tagName, isXPathUnique) },
            { name: 'Contextual Labels', fn: () => generateContextualLabelSelectors(element, tagName, isXPathUnique) },
            { name: 'Stable Attributes', fn: () => generateStableAttributeSelectors(element, tagName, isXPathUnique) },
            { name: 'Parent Anchored', fn: () => generateParentAnchoredSelectors(element, meaningfulParents, isXPathUnique) },
            { name: 'Child Anchored', fn: () => generateChildAnchoredSelectors(element, isXPathUnique) },
            { name: 'Element Specific', fn: () => generateElementSpecificSelectors(element, tagName, isXPathUnique) },
            { name: 'Text Based', fn: () => generateTextBasedSelectors(element, tagName, isXPathUnique) },
            { name: 'Class Based', fn: () => generateClassBasedSelectors(element, tagName, isXPathUnique) },
            { name: 'Flexible Sibling', fn: () => generateFlexibleSiblingSelectors(element, tagName, isXPathUnique) },
            { name: 'Specific Sibling', fn: () => generateSpecificSiblingSelectors(element, tagName, isXPathUnique) },
            { name: 'Contextual', fn: () => generateContextualSelectors(element, tagName, isXPathUnique) },
            { name: 'Structural', fn: () => generateOptimizedStructuralSelectors(element, isXPathUnique) }
        ];
        
        for (const strategy of strategies) {
            if (performance.now() - startTime > PERFORMANCE_LIMITS.timeoutMs) {
                if (debugMode) console.warn('Selector generation timeout exceeded');
                break;
            }
            
            try {
                if (debugMode) console.log(`Running strategy: ${strategy.name}`);
                const strategySelectors = strategy.fn();
                if (debugMode) console.log(`Strategy ${strategy.name} generated:`, strategySelectors?.length || 0, 'selectors');
                
                if (strategySelectors && Array.isArray(strategySelectors)) {
                    allScoredSelectors.push(...strategySelectors);
                    if (debugMode && strategySelectors.length > 0) {
                        console.log(`Best from ${strategy.name}:`, strategySelectors[0]);
                    }
                }
                
                // Early exit if we have enough high-scoring selectors
                const highScoringSelectors = allScoredSelectors.filter(s => s.score >= 90);
                if (highScoringSelectors.length >= PERFORMANCE_LIMITS.earlyExitThreshold) {
                    if (debugMode) console.log('Early exit: sufficient high-scoring selectors found');
                    break;
                }
            } catch (strategyError) {
                if (debugMode) console.warn(`Strategy ${strategy.name} failed:`, strategyError);
                continue;
            }
        }
        
        if (debugMode) {
            console.log('All scored selectors before sorting:', allScoredSelectors.length);
            console.log('Sample scored selectors:', allScoredSelectors.slice(0, 3));
        }
        
        // Sort by score and extract selectors
        allScoredSelectors.sort((a, b) => b.score - a.score);
        let finalSelectors = allScoredSelectors
            .map(item => item.selector)
            .filter((selector, index, arr) => selector && arr.indexOf(selector) === index) // Remove duplicates
            .slice(0, PERFORMANCE_LIMITS.maxAlternatives);

        if (debugMode) {
            console.log('Final selectors after processing:', finalSelectors.length);
            console.log('Final selectors:', finalSelectors.slice(0, 5));
        }

        // --- Selector Reduction ---
        if (finalSelectors.length > 0) {
            const reducedBestSelector = reduceSelector(finalSelectors[0], isXPathUnique);
            if (reducedBestSelector !== finalSelectors[0]) {
                finalSelectors.unshift(reducedBestSelector);
            }
        }
        finalSelectors = [...new Set(finalSelectors)]; 
        
        const endTime = performance.now();
        if (debugMode) {
            console.log(`Enhanced generation completed in ${Math.round(endTime - startTime)}ms`);
            console.log(`Generated ${finalSelectors.length} unique selectors`);
            console.log('Top 3 selectors:', finalSelectors.slice(0, 3));
        }

        if (finalSelectors.length > 0) {
            return {
                best: finalSelectors[0],
                alternatives: finalSelectors
            };
        } else {
            if (debugMode) {
                console.error('CRITICAL: No selectors generated despite having strategies');
                console.log('Element details for debugging:');
                console.log('- tagName:', tagName);
                console.log('- isConnected:', element.isConnected);
                console.log('- parentElement:', element.parentElement);
                console.log('- textContent length:', element.textContent?.length || 0);
                console.log('- All strategies ran:', strategies.length);
            }
            throw new Error('No alternatives generated');
        }
        
    } catch (error) {
        if (debugMode) console.warn('Enhanced selector generation failed:', error);
        throw error;
    }
}

// --- Simple Structural Fallback ---
function generateSimpleStructuralFallback(element) {
    if (debugMode) {
        console.log('=== FALLBACK: Generating simple structural fallback ===');
        console.log('Element:', element);
        console.log('Element tagName:', element?.tagName);
        console.log('Element isConnected:', element?.isConnected);
    }
    
    // Safety checks
    if (!element) {
        console.error('FALLBACK ERROR: Element is null/undefined');
        return { best: '//body', alternatives: ['//body'] };
    }
    
    if (!element.tagName) {
        console.error('FALLBACK ERROR: Element has no tagName');
        return { best: '//body', alternatives: ['//body'] };
    }
    
    const alternatives = [];
    let current = element;
    const pathSegments = [];
    
    // Build path segments
    while (current && current.parentElement && pathSegments.length < 5) {
        const tagName = current.tagName.toLowerCase();
        const parent = current.parentElement;
        
        if (!parent.children) {
            if (debugMode) console.warn('Parent has no children property, breaking');
            break;
        }
        
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(current) + 1;
        const tagSiblings = siblings.filter(s => s.tagName.toLowerCase() === tagName);
        
        // Basic position
        pathSegments.unshift(`${tagName}[${index}]`);
        
        // Tag with same-type index if multiple of same tag
        if (tagSiblings.length > 1) {
            const tagIndex = tagSiblings.indexOf(current) + 1;
            if (tagIndex !== index && tagIndex > 0) {
                pathSegments.unshift(`${tagName}[${tagIndex}]`);
            }
        }
        
        current = parent;
    }
    
    // Generate variants
    if (pathSegments.length > 0) {
        alternatives.push(`//${pathSegments.join('/')}`);
        
        if (pathSegments.length > 2) {
            alternatives.push(`//${pathSegments.slice(-2).join('/')}`);
        }
        if (pathSegments.length > 1) {
            alternatives.push(`//${pathSegments.slice(-1)[0]}`);
        }
    }
    
    // Tag-only with global index
    const tagName = element.tagName.toLowerCase();
    try {
        const allSameTag = Array.from(document.querySelectorAll(tagName));
        const globalIndex = allSameTag.indexOf(element) + 1;
        if (globalIndex > 0) {
            alternatives.push(`//${tagName}[${globalIndex}]`);
        }
    } catch (e) {
        if (debugMode) console.warn('Failed to query all same tag elements:', e);
    }
    
    // Basic attributes
    if (element.id) {
        alternatives.push(`//${tagName}[@id='${element.id}']`);
    }
    
    if (element.className && typeof element.className === 'string') {
        const firstClass = element.className.split(' ')[0];
        if (firstClass) {
            alternatives.push(`//${tagName}[contains(@class, '${firstClass}')]`);
        }
    }
    
    // Ultimate fallback
    if (alternatives.length === 0) {
        alternatives.push(`//${tagName}`);
    }
    
    const uniqueAlternatives = [...new Set(alternatives)].slice(0, 10);
    
    if (debugMode) {
        console.log('Fallback generated:', uniqueAlternatives.length, 'alternatives');
        console.log('Fallback alternatives:', uniqueAlternatives);
    }
    
    return {
        best: uniqueAlternatives[0] || `//${tagName}`,
        alternatives: uniqueAlternatives.length > 0 ? uniqueAlternatives : [`//${tagName}`]
    };
}
// --- Wrapper function for backward compatibility ---
function generateSelectors(element) {
    if (debugMode) {
        console.log('=== generateSelectors called ===');
        console.log('Element:', element);
        console.log('Element tagName:', element?.tagName);
        console.log('Element connected:', element?.isConnected);
        console.log('Settings:', settings);
        console.log('Enhanced enabled:', settings?.enableEnhancedSelectors);
    }
    
    // Safety check for element
    if (!element || !element.tagName) {
        console.error('generateSelectors called with invalid element:', element);
        return {
            best: '//body',
            alternatives: ['//body']
        };
    }
    
    // Safety check for settings
    if (!settings) {
        console.warn('Settings not loaded, using defaults');
        settings = ENHANCED_DEFAULT_SETTINGS;
    }
    
    if (!settings.enableEnhancedSelectors) {
        if (debugMode) console.log('Enhanced selectors disabled, using fallback');
        return generateSimpleStructuralFallback(element);
    }
    
    try {
        if (debugMode) console.log('Attempting enhanced selector generation...');
        const result = generateEnhancedSelectors(element);
        
        if (debugMode) {
            console.log('Enhanced selectors result:', result);
        }
        
        // Validate result
        if (result && result.alternatives && Array.isArray(result.alternatives) && result.alternatives.length > 0) {
            // Additional validation: ensure all alternatives are strings
            const validAlternatives = result.alternatives.filter(alt => typeof alt === 'string' && alt.trim().length > 0);
            
            if (validAlternatives.length > 0) {
                return {
                    best: validAlternatives[0],
                    alternatives: validAlternatives
                };
            } else {
                if (debugMode) console.warn('Enhanced selectors returned no valid string alternatives');
                return generateSimpleStructuralFallback(element);
            }
        } else {
            if (debugMode) console.warn('Enhanced selectors returned invalid result structure:', result);
            return generateSimpleStructuralFallback(element);
        }
    } catch (error) {
        console.error('Enhanced selector generation failed:', error);
        console.error('Stack trace:', error.stack);
        
        // Always return fallback on error
        try {
            return generateSimpleStructuralFallback(element);
        } catch (fallbackError) {
            console.error('Even fallback generation failed:', fallbackError);
            
            // Ultimate emergency fallback
            const tagName = element.tagName.toLowerCase();
            return {
                best: `//${tagName}`,
                alternatives: [`//${tagName}`]
            };
        }
    }
}

// --- Shadow DOM and Element Helper Functions ---
function generateCssSelectorForShadow(element) {
    const shadowRoot = element.getRootNode();
    if (!(shadowRoot instanceof ShadowRoot)) return element.tagName.toLowerCase();

    // Strategy 1: Unique ID
    if (element.id) {
        const selector = `#${escapeCss(element.id)}`;
        if (shadowRoot.querySelector(selector) === element) return selector;
    }

    // Strategy 2: Stable Attributes
    const stableAttrs = ['data-testid', 'data-cy', 'name', 'role', 'aria-label', 'placeholder', 'title'];
    for (const attr of stableAttrs) {
        const attrValue = element.getAttribute(attr);
        if (attrValue) {
            const selector = `${element.tagName.toLowerCase()}[${attr}='${escapeCss(attrValue)}']`;
            if (shadowRoot.querySelector(selector) === element) return selector;
        }
    }

    // Strategy 3: Parent-Anchored Flexible Path
    let parent = element.parentElement;
    for (let i = 0; i < 5 && parent && parent !== shadowRoot; i++) {
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

    // Strategy 4: Full Structural Path (Fallback)
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

function isElementInIframe(element) {
    return element.ownerDocument !== window.document;
}

// --- ENHANCED createAction function with automatic state detection ---
function createAction(actionType, element, options = {}) {
    const selectors = generateSelectors(element);
    
    // Check for iframe interaction
    if (isElementInIframe(element)) {
        iframeInteractionDetected = true;
        chrome.runtime.sendMessage({ 
            type: 'iframe_interaction_detected',
            tabId: window.chrome?.devtools?.inspectedWindow?.tabId 
        });
    }
    
    // ENHANCED: Skip state detection for Shadow DOM elements
    let elementState = "visible"; // Default fallback
    
    if (element.getRootNode() instanceof ShadowRoot) {
        // Shadow DOM elements: no state detection, will use evaluate actions
        if (debugMode) {
            console.log('Shadow DOM element detected, skipping state detection');
        }
        elementState = undefined; // No state for Shadow DOM
    } else {
        // Regular DOM elements: auto-detect state
        const detectedState = detectElementState(element);
        elementState = getActionSpecificState(actionType, element, detectedState);
        
        if (debugMode) {
            console.log(`State detection for ${actionType}:`, {
                element: element,
                detected: detectedState,
                final: elementState
            });
        }
    }
    
    const action = {
        action: actionType,
        selector: {
            type: 'xpath',
            current: selectors.best,
            alternatives: selectors.alternatives
        },
        ...options,
        onError: 'return'
    };
    
    // Add state only for non-Shadow DOM elements
    if (elementState !== undefined) {
        action.selector.state = elementState;
    }
    
    return action;
}



// --- Shadow DOM Buffer Management ---
function flushShadowDomBuffer() {
    if (isInShadowDomMode && shadowDomActionBuffer.length > 0) {
        const combinedSource = shadowDomActionBuffer.join(' ');
        const evaluateAction = {
            action: 'evaluate',
            source: combinedSource,
            onError: 'return'
        };
        chrome.runtime.sendMessage({ type: 'flush_complete', action: evaluateAction });
    }
    isInShadowDomMode = false;
    shadowDomActionBuffer = [];
}


function findAssociatedSelect(clickedElement) {
    // Search up to 5 parent levels for a container that holds both the
    // clicked element and a <select> element.
    let parent = clickedElement.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
        const select = parent.querySelector('select.dropdown-select');
        if (select) {
            // This parent contains a select element. We'll assume it's the one we want.
            if (debugMode) console.log('Found associated select element:', select);
            return select;
        }
        parent = parent.parentElement;
    }
    return null;
}

/**
 * Heuristic to get the intended option 'value' from the clicked element's text.
 */
function getOptionValueFromProxy(proxyElement, selectElement) {
    const proxyText = cleanTextContent(proxyElement.textContent);
    if (!proxyText) return null;

    // Find the <option> in the real <select> that has matching text content.
    for (const option of selectElement.options) {
        const optionText = cleanTextContent(option.textContent);
        if (optionText.trim() === proxyText.trim()) {
            if (debugMode) console.log(`Found matching option value: "${option.value}" for text: "${proxyText}"`);
            return option.value;
        }
    }
    return null;
}


// --- Enhanced scroll detection ---
let scrollTimeout;
function handleScroll() {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        const el = document.documentElement;
        if (el.scrollHeight - el.scrollTop <= el.clientHeight + 1) {
            const delay = settings?.scrollDelay || 1000;
            setTimeout(() => {
                if (el.scrollHeight - el.scrollTop <= el.clientHeight + 1) {
                    flushShadowDomBuffer();
                    chrome.runtime.sendMessage({ type: 'recorded_action', action: { action: 'scrollBottom' } });
                }
            }, delay);
        }
    }, 500);
}

// --- EVENT LISTENERS ---

// Store listener references for cleanup
function addConditionalListener(element, event, handler, options) {
    const listenerInfo = { element, event, handler, options };
    eventListeners.push(listenerInfo);
    
    // Only add if recording is active
    if (isRecording) {
        element.addEventListener(event, handler, options);
    }
}

function startRecordingListeners() {
    if (isRecording) return; // Already started
    
    isRecording = true;
    if (debugMode) console.log('Starting recording listeners');
    
    // Add all stored listeners
    eventListeners.forEach(({ element, event, handler, options }) => {
        element.addEventListener(event, handler, options);
    });
}


function stopRecordingListeners() {
    if (!isRecording) return; // Already stopped
    
    isRecording = false;
    if (debugMode) console.log('Stopping recording listeners');
    
    // Remove all stored listeners
    eventListeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
    });
    
    // Clear any pending state
    flushShadowDomBuffer();
    
    // Clear other state variables
    lastTypedElement = null;
    lastRightClickedElement = null;
    pickerMode = { isActive: false, action: '' };
    iframeInteractionDetected = false;
}


// Modified event handlers that check recording state
const clickHandler = (e) => {
    if (!isRecording) return;
    
    let target = e.composedPath()[0] || e.target;
    console.log('🔵 CLICK DETECTED:', target.tagName, target.href || target.textContent?.substring(0, 50));

    // Ignore clicks on <select> and <option> elements, as the 'change' event is now the source of truth.
    if ((target.tagName === 'SELECT' || target.closest('option')) && 
        !(target.getRootNode() instanceof ShadowRoot)) {
         if (debugMode) console.log('Ignoring click on regular select/option element; handled by change event.');
         return; // Don't record, but don't prevent default - let browser handle it
    }


    if (pickerMode.isActive) {
        e.preventDefault();
        e.stopPropagation();
        flushShadowDomBuffer();
        const action = createAction(pickerMode.action, target);
        chrome.runtime.sendMessage({ type: 'element_picked', action: action });
        pickerMode.isActive = false;
        document.body.style.cursor = 'default';
        return;
    }

    if (target.getRootNode() instanceof ShadowRoot) {
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

    // Default click handling for all other elements
    flushShadowDomBuffer();
    const clickAction = createAction('click', target);
    chrome.runtime.sendMessage({ type: 'recorded_action', action: clickAction });
    console.log('🟢 CLICK ACTION SENT:', clickAction);

};

const blurHandler = (e) => {
    if (!isRecording) return;
    
    const target = e.composedPath()[0] || e.target;

    // Completely ignore custom dropdown components (role="combobox")
    if (target.getAttribute('role') === 'combobox') {
        if (debugMode) console.log("Ignoring 'blur' event on custom dropdown component.");
        return;
    }

    // Only handle actual text inputs/textareas in Shadow DOM, NOT comboboxes
    if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && 
        target.getRootNode() instanceof ShadowRoot &&
        target.getAttribute('role') !== 'combobox') {
        
        isInShadowDomMode = true;
        const host = target.getRootNode().host;
        const hostXPath = generateSelectors(host).best.replace(/`/g, '\\`');
        const innerSelector = generateCssSelectorForShadow(target);

        if (!hostXPath || !innerSelector) return;
        const valueToSet = target.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
        const source = `const host${shadowDomActionBuffer.length} = document.evaluate(\`${hostXPath}\`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; if (host${shadowDomActionBuffer.length} && host${shadowDomActionBuffer.length}.shadowRoot) { const input = host${shadowDomActionBuffer.length}.shadowRoot.querySelector(\`${innerSelector}\`); if (input) { input.value = \`${valueToSet}\`; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); } }`;
        shadowDomActionBuffer.push(source.replace(/\s+/g, ' ').trim());
    }
};

const changeHandler = (e) => {
    if (!isRecording) return;
    
    const target = e.composedPath()[0] || e.target;
    const tagName = target.tagName.toLowerCase();

    // Only handle regular DOM select elements with the new approach
    if (tagName === 'select' && !(target.getRootNode() instanceof ShadowRoot)) {
        const selectedValues = Array.from(target.selectedOptions).map(opt => opt.value);
        if (selectedValues.length === 0) return;

        if (debugMode) console.log("'change' event on a standard <select> detected:", target);
        flushShadowDomBuffer(); 
        
        const selectors = generateSelectors(target);
        const state = isElementHidden(target) ? "attached" : "visible";
        const selectAction = {
            action: 'select',
            selector: { type: 'xpath', state: state, current: selectors.best, alternatives: selectors.alternatives },
            values: selectedValues,
            onError: 'return'
        };
        chrome.runtime.sendMessage({ type: 'recorded_action', action: selectAction });
        return;
    }

    // Shadow DOM selects - ignore, handled by blur listener
    if (tagName === 'select' && target.getRootNode() instanceof ShadowRoot) {
        if (debugMode) console.log("'change' event on Shadow DOM <select> - ignoring, will be handled by blur listener");
        return;
    }

    // Handle other input types
    if (target.getRootNode() instanceof ShadowRoot || target.offsetParent === null) return;
    if (target === lastTypedElement) {
        lastTypedElement = null;
        return;
    }
    flushShadowDomBuffer();
    
    let action;
    if (tagName === 'input' || tagName === 'textarea') {
        action = createAction('type', target, { text: target.value });
    }
    if (action) {
        chrome.runtime.sendMessage({ type: 'recorded_action', action: action });
    }
};
const dblclickHandler = (e) => {
    if (!isRecording) return;
    
    flushShadowDomBuffer();
    const action = createAction('doubleClick', e.target);
    chrome.runtime.sendMessage({ type: 'recorded_action', action: action });
};

const keydownHandler = (e) => {
    if (!isRecording) return;
    
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
};

const mousedownHandler = (e) => {
    if (!isRecording) return;
    
    if (e.button === 2) {
        lastRightClickedElement = e.target;
    }
};

const scrollHandler = () => {
    if (!isRecording) return;
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        const el = document.documentElement;
        if (el.scrollHeight - el.scrollTop <= el.clientHeight + 1) {
            const delay = settings?.scrollDelay || 1000;
            setTimeout(() => {
                if (el.scrollHeight - el.scrollTop <= el.clientHeight + 1) {
                    flushShadowDomBuffer();
                    chrome.runtime.sendMessage({ type: 'recorded_action', action: { action: 'scrollBottom' } });
                }
            }, delay);
        }
    }, 500);
};

const beforeunloadHandler = () => {
    if (!isRecording) return;
    flushShadowDomBuffer();
};

// Register all listeners (but don't activate them yet)
addConditionalListener(document, 'click', clickHandler, true);
addConditionalListener(document, 'blur', blurHandler, true);
addConditionalListener(document, 'change', changeHandler, true);
addConditionalListener(document, 'dblclick', dblclickHandler, true);
addConditionalListener(document, 'keydown', keydownHandler, true);
addConditionalListener(document, 'mousedown', mousedownHandler, true);
addConditionalListener(document, 'scroll', scrollHandler, true);
addConditionalListener(window, 'beforeunload', beforeunloadHandler);

// Enhanced message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'start_recording') {
        startRecordingListeners();
        sendResponse({ status: 'recording_started' });
    } else if (message.type === 'stop_recording') {
        stopRecordingListeners();
        sendResponse({ status: 'recording_stopped' });
    } else if (message.type === 'start_element_picker') {
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
    } else if (message.type === 'flush_before_navigation') {
        flushShadowDomBuffer();
        sendResponse({ status: 'flushed' });
    }
    return true;
});
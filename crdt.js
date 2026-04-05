import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// --- CORE STATE ---
const ydoc = new Y.Doc();
const paragraphs = ydoc.getArray('paragraphs');
const baseline = ydoc.getArray('baseline'); // SHARED REGISTRY BASELINE
const provider = new WebsocketProvider('ws://localhost:1234', 'ukr-court-paper-v3', ydoc);
const awareness = provider.awareness;

const localUser = {
    id: Math.random().toString(36).substr(2, 9),
    name: 'Judge ' + (Math.floor(Math.random() * 900) + 100),
    color: '#3b82f6',
    committed: false,
    focusId: null,
    cursorPos: 0
};

let baselineState = []; // Cached from Yjs shared baseline
let localDraftState = []; // Private copy for personal audit
const paraDOMMap = new Map();

// --- INITIALIZATION ---
function init() {
    console.log('[CourtRegistry] Initializing logic...');

    provider.on('sync', isSynced => {
        if (isSynced && paragraphs.length === 0) {
            console.log('[CourtRegistry] Document empty. Seeding shared protocol and baseline...');
            ydoc.transact(() => {
                const seed = [
                    'ВСТУП: Розглядається справа про масштабне порушення цілісності державних реєстрів та несанкціоноване втручання в роботу автоматизованих систем документообігу суду.',
                    'ФАКТ ОПИСУ: Відповідач навмисно вносив неправдиві відомості до бази даних.',
                    'ВИСНОВОК: Суд постановляє визнати відповідача винним та призначити покарання.',
                    'РЕЗОЛЮЦІЯ: Рішення може бути оскаржене протягом 30 днів.'
                ];
                seed.forEach(text => {
                    const paraMap = new Y.Map();
                    const yText = new Y.Text();
                    yText.insert(0, text);
                    paraMap.set('id', 'p-' + Math.random().toString(36).substr(2, 5));
                    paraMap.set('content', yText);
                    paragraphs.push([paraMap]);
                    baseline.push([text]); // Store original state for everyone
                });
            }, 'registry-seed');
        }
        
        // Always capture baseline from the SHARED array
        captureBaseline();
        syncDocumentDOM();
    });

    awareness.setLocalState(localUser);
    const nameEl = document.getElementById('current-judge-name');
    if (nameEl) nameEl.textContent = localUser.name;

    paragraphs.observeDeep(() => {
        syncDocumentDOM();
        checkConsensus();
    });
    
    baseline.observeDeep(() => captureBaseline());

    awareness.on('change', () => { 
        renderAwareness(); 
        checkConsensus(); 
        syncDocumentDOM(); 
    });

    syncDocumentDOM();
}

function captureBaseline() {
    if (baseline.length > 0) {
        baselineState = baseline.toArray();
    } else if (paragraphs.length > 0) {
        // Fallback for first judge during seed
        baselineState = paragraphs.toArray().map(map => map.get('content').toString());
    } else {
        return;
    }

    // Initialize personal draft if it's the first time
    if (localDraftState.length === 0) {
        localDraftState = [...baselineState];
    }
    
    const hashDisplay = document.getElementById('rev-hash');
    if (hashDisplay) hashDisplay.textContent = btoa(baselineState.join('|')).substring(0, 12).toUpperCase();
}

function syncDocumentDOM() {
    const container = document.getElementById('paragraphs-container');
    if (!container) return;
    
    const currentParagraphs = paragraphs.toArray();
    const currentIds = new Set(currentParagraphs.map(map => map.get('id')));

    // Cleanup removed
    for (const [id, meta] of paraDOMMap.entries()) {
        if (!currentIds.has(id)) { 
            meta.element.remove(); 
            meta.yText.unobserve(meta.observer); 
            paraDOMMap.delete(id); 
        }
    }

    // Update or Create
    currentParagraphs.forEach((paraMap, index) => {
        const id = paraMap.get('id');
        const yText = paraMap.get('content');
        if (!id || !yText) return;

        let meta = paraDOMMap.get(id);
        if (!meta) {
            const div = document.createElement('div');
            div.className = 'para-node group';
            
            const trigger = document.createElement('button');
            trigger.className = 'edit-trigger heading-font';
            trigger.textContent = 'Edit';
            trigger.onclick = () => enterEditMode(yText, div, id, index);
            div.appendChild(trigger);
            
            const contentArea = document.createElement('div');
            contentArea.className = 'content-area';
            div.appendChild(contentArea);

            const observer = (e) => { 
                if (e.transaction.origin !== 'local' && localUser.focusId !== id) {
                    renderContent(yText, contentArea, id);
                }
            };
            yText.observe(observer);

            meta = { element: div, yText, observer, contentArea };
            paraDOMMap.set(id, meta);
        }

        // --- View Mode Logic ---
        const trigger = meta.element.querySelector('.edit-trigger');
        if (trigger) trigger.style.display = localUser.committed ? 'none' : 'block';

        if (localUser.focusId !== id) {
            renderContent(yText, meta.contentArea, id);
        }

        const existingChild = container.children[index];
        if (existingChild !== meta.element) {
            container.insertBefore(meta.element, existingChild || null);
        }
    });

    // Update UI Badges
    const badge = document.getElementById('mode-badge');
    if (badge) {
        if (localUser.committed) {
            badge.textContent = 'Ready & Locked';
            badge.className = 'font-black text-[8px] px-2 py-0.5 rounded-full border border-emerald-600 text-emerald-600 bg-emerald-50 tracking-widest uppercase';
        } else if (localUser.focusId) {
            badge.textContent = 'Editing Section';
            badge.className = 'font-black text-[8px] px-2 py-0.5 rounded-full border border-blue-600 text-blue-600 bg-blue-50 tracking-widest uppercase';
        } else {
            badge.textContent = 'View Mode';
            badge.className = 'font-black text-[8px] px-2 py-0.5 rounded-full border border-slate-400 text-slate-500 tracking-widest uppercase';
        }
    }
}

function renderContent(yText, container, id) {
    const states = Array.from(awareness.getStates().values());
    const editor = states.find(s => s.focusId === id && s.id !== localUser.id);
    const text = yText.toString();
    
    if (editor) {
        const pos = editor.cursorPos || 0;
        container.innerHTML = '';
        container.appendChild(document.createTextNode(text.substring(0, pos)));
        const caret = document.createElement('span');
        caret.className = 'remote-caret';
        caret.setAttribute('data-label', (editor.name || 'J').split(' ')[1] || 'Judge');
        container.appendChild(caret);
        container.appendChild(document.createTextNode(text.substring(pos)));
    } else {
        container.textContent = text;
    }
}

function enterEditMode(yText, element, id, index) {
    if (localUser.committed) return;
    const states = Array.from(awareness.getStates().values());
    if (states.find(s => s.focusId === id && s.id !== localUser.id)) return;
    
    exitEditMode();
    localUser.focusId = id;
    awareness.setLocalState(localUser);

    element.classList.add('editing');
    const contentArea = element.querySelector('.content-area');
    contentArea.innerHTML = '';
    
    const textarea = document.createElement('textarea');
    textarea.className = 'textarea-edit';
    textarea.value = yText.toString();
    
    textarea.oninput = (e) => {
        const val = e.target.value;
        applyDiff(yText, yText.toString(), val);
        localUser.cursorPos = e.target.selectionStart;
        localUser.committed = false;
        localDraftState[index] = val;
        awareness.setLocalState(localUser);
        autoHeight(textarea);
    };

    textarea.onkeyup = textarea.onclick = (e) => { 
        localUser.cursorPos = e.target.selectionStart; 
        awareness.setLocalState(localUser); 
    };
    
    textarea.onblur = () => exitEditMode();
    contentArea.appendChild(textarea);
    setTimeout(() => { autoHeight(textarea); textarea.focus(); }, 0);
}

function exitEditMode() {
    if (!localUser.focusId) return;
    const meta = paraDOMMap.get(localUser.focusId);
    if (meta) { 
        meta.element.classList.remove('editing'); 
        const textarea = meta.element.querySelector('textarea'); 
        if (textarea) textarea.remove(); 
    }
    localUser.focusId = null;
    awareness.setLocalState(localUser);
    syncDocumentDOM();
}

function applyDiff(yText, oldStr, newStr) {
    let start = 0; while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) start++;
    let end = 0; while (end + start < oldStr.length && end + start < newStr.length && oldStr[oldStr.length - 1 - end] === newStr[newStr.length - 1 - end]) end++;
    ydoc.transact(() => {
        if (start + end < oldStr.length) yText.delete(start, oldStr.length - start - end);
        if (start + end < newStr.length) yText.insert(start, newStr.substring(start, newStr.length - end));
    }, 'local');
}

window.toggleCommit = function () {
    localUser.committed = !localUser.committed;
    if (localUser.committed) exitEditMode();
    
    awareness.setLocalState(localUser);
    
    const btn = document.getElementById('btn-ready');
    const dot = document.getElementById('commit-dot');
    if (btn && dot) {
        btn.classList.toggle('btn-commit-active', localUser.committed);
        dot.className = `w-2.5 h-2.5 rounded-full transition-all ${localUser.committed ? 'bg-white scale-125' : 'bg-slate-400'}`;
        btn.querySelector('span:last-child').textContent = localUser.committed ? 'Ready & Locked' : 'Ready to Commit';
    }
    
    // EXPLICIT TRIGGER to ensure initiator UI updates immediately
    checkConsensus(); 
    renderAwareness();
    syncDocumentDOM();
}

function checkConsensus() {
    const states = Array.from(awareness.getStates().values());
    const activeUsers = states.filter(s => s.name);
    const allIn = activeUsers.every(s => s.committed) && activeUsers.length > 0;
    
    // Check local changes
    const localHasChanges = localDraftState.some((text, i) => text !== (baselineState[i] || ''));
    
    const btnLocal = document.getElementById('btn-local-rev');
    const btnGroup = document.getElementById('btn-group-rev');
    const statusText = document.getElementById('reconciliation-text');
    const paper = document.getElementById('paper-main');
    
    if (btnLocal) btnLocal.classList.toggle('hidden', !localHasChanges);
    
    if (btnGroup) {
        if (allIn) {
            btnGroup.classList.remove('opacity-50', 'cursor-not-allowed', 'grayscale');
            btnGroup.classList.add('pulse-green');
        } else {
            btnGroup.classList.add('opacity-50', 'cursor-not-allowed', 'grayscale');
            btnGroup.classList.remove('pulse-green');
        }
    }
    
    if (paper) paper.classList.toggle('reconciled', allIn);
    if (statusText) statusText.textContent = allIn ? 'Consensus Reached' : 'Draft Stage';
}

window.openDiffReview = function (type) {
    const states = Array.from(awareness.getStates().values());
    const activeUsers = states.filter(s => s.name);
    const allIn = activeUsers.every(s => s.committed) && activeUsers.length > 0;

    const modal = document.getElementById('diff-modal');
    const display = document.getElementById('diff-content');
    const title = document.getElementById('modal-title');
    const subtitle = document.getElementById('modal-subtitle');
    const footer = document.getElementById('modal-footer');
    
    if (modal && display) {
        if (type === 'group' && !allIn) return; // Immediate Exit if consensus lost

        modal.classList.remove('hidden'); display.innerHTML = '';
        
        if (type === 'local') {
            title.textContent = 'Personal Draft Review';
            subtitle.textContent = 'Isolated audit of changes made on YOUR node compared to the original registry baseline.';
            footer.classList.add('hidden');
        } else {
            title.textContent = 'Group Reconciliation Review';
            subtitle.textContent = 'Consolidated consensus version representing the collective work of all judges.';
            footer.classList.remove('hidden');
        }

        const current = type === 'local' 
            ? localDraftState 
            : paragraphs.toArray().map(map => map.get('content').toString());

        let changeCount = 0;
        current.forEach((text, i) => {
            const original = baselineState[i] || '';
            if (text !== original) {
                changeCount++;
                const div = document.createElement('div');
                div.className = 'p-6 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm';
                div.innerHTML = `<div class="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Section ${i + 1}</div><div class="diff-removed p-2 rounded mb-1">- ${original || '(empty)'}</div><div class="diff-added p-2 rounded">+ ${text}</div>`;
                display.appendChild(div);
            }
        });
        if (changeCount === 0) display.innerHTML = '<div class="text-center py-20 text-slate-400 italic">No modifications detected in this view.</div>';
    }
}

window.finalizeReconciliation = function () { 
    // Push current group state to a NEW shared baseline
    const current = paragraphs.toArray().map(map => map.get('content').toString());
    ydoc.transact(() => {
        baseline.delete(0, baseline.length);
        baseline.push(current);
    });
    
    window.closeModal('diff-modal'); 
    localUser.committed = false; 
    awareness.setLocalState(localUser); 
    window.toggleCommit(); 
}

window.closeModal = (id) => { const m = document.getElementById(id); if (m) m.classList.add('hidden'); }

function renderAwareness() {
    const states = Array.from(awareness.getStates().values());
    const container = document.getElementById('user-pills');
    if (!container) return;

    container.innerHTML = '';
    
    // Ensure the local state is picked up immediately even if the sync event hasn't traveled
    const allStatesMap = new Map();
    states.forEach(s => allStatesMap.set(s.id, s));
    allStatesMap.set(localUser.id, localUser); 

    Array.from(allStatesMap.values()).forEach(s => {
        const isSelf = s.id === localUser.id;
        const b = document.createElement('div');
        b.className = `w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm ring-2 transition-all duration-500 ${s.committed ? 'ring-emerald-500 scale-110' : 'ring-transparent opacity-80'}`;
        b.style.backgroundColor = s.color || '#475569'; 
        b.textContent = (s.name || 'J').split(' ')[1]?.substring(0,1) || 'J'; 
        b.title = `${s.name} ${s.committed ? '(Ready)' : '(Drafting)'}${isSelf ? ' [You]' : ''}`;
        container.appendChild(b);
    });
}

function autoHeight(el) { el.style.height = '1px'; el.style.height = el.scrollHeight + 'px'; }

// Global Exports
window.init = init;
window.toggleCommit = toggleCommit;
window.openDiffReview = openDiffReview;
window.finalizeReconciliation = finalizeReconciliation;
window.closeModal = closeModal;

init();

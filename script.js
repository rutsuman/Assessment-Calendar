// =========================================================
//  Test Scheduler — Supabase version (multi-block + LS per block + alter)
// =========================================================

// ---------- SUPABASE CLIENT ----------
const { createClient } = window.supabase;
const supabaseClient = createClient(
    window.APP_CONFIG.SUPABASE_URL,
    window.APP_CONFIG.SUPABASE_ANON_KEY
);

// ---------- STATE ----------
const grades = [6, 7, 8, 9, 10, 11, 12];
const BLOCKS = ['Block 1', 'Block 2', 'Block 3', 'Block 4'];

function getMaxTestsPerDay(grade) {
    return (grade === 11 || grade === 12) ? 3 : 2;
}

let selectedGrade = 12;

const viewState = {};
const today = new Date();
grades.forEach(g => {
    viewState[g] = { year: today.getFullYear(), month: today.getMonth() };
});

// slotsByGrade[grade] = { "YYYY-M-D": [ { id, teacher, className, blocks:[], lsBlocks:[], learningSupport }, ... ] }
const slotsByGrade = {};
grades.forEach(g => slotsByGrade[g] = {});

// Modal state — mode is 'create' or 'edit'
let modalMode = 'create';
let pendingYear, pendingMonth, pendingDay;
let pendingEditSlot = null;   // the slot object being edited

// Password-prompt state (used before opening edit mode)
let pendingAlterSlot = null;

// Delete-modal state
let pendingDelete = null;

// ---------- DOM ----------
const gradeSelect          = document.getElementById('gradeSelect');
const monthYearDisplay     = document.getElementById('monthYearDisplay');
const calendarGrid         = document.getElementById('calendarGrid');
const prevMonthBtn         = document.getElementById('prevMonthBtn');
const nextMonthBtn         = document.getElementById('nextMonthBtn');
const hoverPanel           = document.getElementById('hoverPanel');

const modalOverlay         = document.getElementById('modalOverlay');
const modalTitle           = document.getElementById('modalTitle');
const modalDateText        = document.getElementById('modalDateText');
const teacherNameInput     = document.getElementById('teacherNameInput');
const classNameInput       = document.getElementById('classNameInput');
const blockCheckboxes      = document.querySelectorAll('.block-cb');       // Block 1..4
const lsCheckboxes         = document.querySelectorAll('.ls-cb');         // LS per block
const blockRows            = document.querySelectorAll('.block-row');
const passwordInput        = document.getElementById('passwordInput');
const passwordLabel        = document.getElementById('passwordLabel');
const modalError           = document.getElementById('modalError');
const modalCancelBtn       = document.getElementById('modalCancelBtn');
const modalConfirmBtn      = document.getElementById('modalConfirmBtn');
const modalDeleteBtn       = document.getElementById('modalDeleteBtn');

const alterPromptOverlay   = document.getElementById('alterPromptOverlay');
const alterPromptInfo      = document.getElementById('alterPromptInfo');
const alterPasswordInput   = document.getElementById('alterPasswordInput');
const alterPromptError     = document.getElementById('alterPromptError');
const alterPromptCancelBtn = document.getElementById('alterPromptCancelBtn');
const alterPromptConfirmBtn= document.getElementById('alterPromptConfirmBtn');

const deleteModalOverlay   = document.getElementById('deleteModalOverlay');
const deleteModalInfo      = document.getElementById('deleteModalInfo');
const deletePasswordInput  = document.getElementById('deletePasswordInput');
const deleteModalError     = document.getElementById('deleteModalError');
const deleteModalCancelBtn = document.getElementById('deleteModalCancelBtn');
const deleteModalConfirmBtn= document.getElementById('deleteModalConfirmBtn');

const exportBtn            = document.getElementById('exportBtn');
const exportModalOverlay   = document.getElementById('exportModalOverlay');
const exportGradeLabel     = document.getElementById('exportGradeLabel');
const exportFromInput      = document.getElementById('exportFromInput');
const exportToInput        = document.getElementById('exportToInput');
const exportModalError     = document.getElementById('exportModalError');
const exportModalCancelBtn = document.getElementById('exportModalCancelBtn');
const exportModalConfirmBtn= document.getElementById('exportModalConfirmBtn');

// ---------- HELPERS ----------
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

function makeKey(year, month0, day) {
    return `${year}-${month0}-${day}`;
}

function toISODate(year, month0, day) {
    const mm = String(month0 + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
}

// Parse "Block 1, Block 3" -> ["Block 1", "Block 3"]
function parseBlocks(str) {
    if (!str) return [];
    return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

// Normalize legacy boolean-ish learning_support into a list of blocks.
// Legacy true  -> every block in the row is LS
// Legacy false -> no LS
// New string   -> parse as list
function normalizeLS(raw, blocks) {
    if (raw === true)  return blocks.slice();
    if (raw === false || raw === null || raw === undefined || raw === '') return [];
    if (typeof raw === 'string') {
        const t = raw.trim().toLowerCase();
        if (t === 'true')  return blocks.slice();
        if (t === 'false' || t === '') return [];
        return parseBlocks(raw);
    }
    return [];
}

// Format for display: "Block 1" or "Blocks 1, 3" or "" if empty
function formatBlocksLabel(blocks) {
    if (!blocks || blocks.length === 0) return '';
    if (blocks.length === 1) return blocks[0];
    return 'Blocks ' + blocks.map(b => b.replace('Block ', '')).join(', ');
}

function formatBlocksLabelWithPrefix(blocks) {
    if (!blocks || blocks.length === 0) return '—';
    return formatBlocksLabel(blocks);
}

// ---------- LOAD DATA FROM SUPABASE ----------
async function loadMonthForGrade(grade) {
    const { year, month } = viewState[grade];

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth  = new Date(year, month + 1, 0);

    const from = toISODate(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), firstOfMonth.getDate());
    const to   = toISODate(lastOfMonth.getFullYear(),  lastOfMonth.getMonth(),  lastOfMonth.getDate());

    const { data, error } = await supabaseClient
        .from('test_slots')
        .select('id, slot_date, teacher, class_name, class_block, learning_support')
        .eq('grade', grade)
        .gte('slot_date', from)
        .lte('slot_date', to)
        .order('slot_date', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Supabase load error:', error);
        alert('Could not load the calendar: ' + error.message);
        return;
    }

    slotsByGrade[grade] = {};

    for (const row of data) {
        const [yStr, mStr, dStr] = row.slot_date.split('-');
        const y = Number(yStr);
        const m0 = Number(mStr) - 1;
        const d = Number(dStr);
        const key = makeKey(y, m0, d);

        const blocks = parseBlocks(row.class_block || '');
        const lsBlocks = normalizeLS(row.learning_support, blocks);

        if (!slotsByGrade[grade][key]) slotsByGrade[grade][key] = [];
        slotsByGrade[grade][key].push({
            id: row.id,
            teacher: row.teacher,
            className: row.class_name,
            blocks: blocks,
            lsBlocks: lsBlocks,
            learningSupport: lsBlocks.length > 0
        });
    }
}

// ---------- RENDER CALENDAR ----------
function renderCalendar() {
    const state = viewState[selectedGrade];
    const year  = state.year;
    const month = state.month;

    const maxTests = getMaxTestsPerDay(selectedGrade);

    monthYearDisplay.textContent = `${MONTH_NAMES[month]} ${year}`;
    calendarGrid.innerHTML = '';

    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(wd => {
        const div = document.createElement('div');
        div.className = 'weekday';
        div.textContent = wd;
        calendarGrid.appendChild(div);
    });

    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < startWeekday; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty';
        calendarGrid.appendChild(emptyCell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'day-cell';

        const key = makeKey(year, month, d);
        const blockedList = slotsByGrade[selectedGrade][key] || [];
        const blockedCount = blockedList.length;

        if (blockedCount >= maxTests) dayCell.classList.add('full-day');

        const dayNumberDiv = document.createElement('div');
        dayNumberDiv.className = 'day-number';
        dayNumberDiv.innerHTML = `<span>${d}</span>`;
        if (blockedCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'badge-count';
            badge.textContent = `${blockedCount}/${maxTests}`;
            dayNumberDiv.appendChild(badge);
        }
        dayCell.appendChild(dayNumberDiv);

        const slotListDiv = document.createElement('div');
        slotListDiv.className = 'slot-list';

        blockedList.forEach((slot) => {
            const slotItem = document.createElement('div');
            slotItem.className = 'slot-item';

            if (slot.learningSupport) {
                const dot = document.createElement('span');
                dot.className = 'ls-dot';
                dot.textContent = '●';
                dot.title = 'Learning support required for: ' + slot.lsBlocks.join(', ');
                slotItem.appendChild(dot);
            }

            const slotText = document.createElement('span');
            slotText.className = 'slot-text';
            const blockLabel = formatBlocksLabel(slot.blocks);
            slotText.textContent = `${slot.teacher} · ${slot.className}${blockLabel ? ' (' + blockLabel + ')' : ''}`;
            slotText.title = `${slot.teacher} — ${slot.className} — ${blockLabel}`;

            // Alter button
            const alterBtn = document.createElement('button');
            alterBtn.className = 'alter-btn';
            alterBtn.textContent = '✎';
            alterBtn.setAttribute('aria-label', `Alter ${slot.teacher} test`);
            alterBtn.title = 'Alter this test';
            alterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openAlterPrompt(year, month, d, slot);
            });

            // Unmark button
            const unmarkBtn = document.createElement('button');
            unmarkBtn.className = 'unmark-btn';
            unmarkBtn.textContent = '✕';
            unmarkBtn.setAttribute('aria-label', `Unmark ${slot.teacher} test`);
            unmarkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openDeleteModal(year, month, d, slot);
            });

            slotItem.appendChild(slotText);
            slotItem.appendChild(alterBtn);
            slotItem.appendChild(unmarkBtn);
            slotListDiv.appendChild(slotItem);
        });

        dayCell.appendChild(slotListDiv);

        dayCell.addEventListener('mouseenter', () => {
            showHoverPanel(year, month, d, blockedList);
        });

        dayCell.addEventListener('click', (e) => {
            if (e.target.closest('.unmark-btn') || e.target.closest('.alter-btn')) return;
            handleDayClick(year, month, d);
        });

        calendarGrid.appendChild(dayCell);
    }

    const totalCells = startWeekday + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remaining; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty';
        calendarGrid.appendChild(emptyCell);
    }
}

// ---------- HOVER PANEL ----------
function showHoverPanel(year, month, day, blockedList) {
    if (!blockedList || blockedList.length === 0) {
        hoverPanel.innerHTML = `
            <div class="hover-panel-placeholder">
                <p><strong>${MONTH_NAMES[month]} ${day}, ${year}</strong></p>
                <p>No tests scheduled</p>
            </div>`;
        return;
    }

    let html = `<div class="hover-panel-header">${MONTH_NAMES[month]} ${day}, ${year}</div>`;
    html += '<div class="hover-panel-slots">';

    blockedList.forEach((slot) => {
        const blockLabel = formatBlocksLabelWithPrefix(slot.blocks);
        const lsLabel = slot.lsBlocks.length > 0
            ? formatBlocksLabel(slot.lsBlocks)
            : 'No';

        html += `
            <div class="hover-slot-card">
                <div class="hover-slot-block">${blockLabel}</div>
                <div class="hover-slot-subject">${slot.className}</div>
                <div class="hover-slot-teacher">${slot.teacher}</div>
                <div class="hover-slot-ls">Learning Support: <strong>${lsLabel}</strong></div>
            </div>
        `;
    });

    html += '</div>';
    hoverPanel.innerHTML = html;
}

// Full refresh
async function refresh() {
    await loadMonthForGrade(selectedGrade);
    renderCalendar();
}

// ---------- DAY CLICK ----------
function handleDayClick(year, month, day) {
    const key = makeKey(year, month, day);
    const list = slotsByGrade[selectedGrade][key] || [];
    const maxTests = getMaxTestsPerDay(selectedGrade);

    if (list.length >= maxTests) {
        alert(`❌ This day is full (already ${maxTests} tests). Please select a different date.`);
        return;
    }
    openCreateModal(year, month, day);
}

// ---------- BLOCK / EDIT MODAL ----------
function resetBlockRows() {
    blockRows.forEach(row => {
        const blockCb = row.querySelector('.block-cb');
        const lsCb    = row.querySelector('.ls-cb');
        blockCb.checked = false;
        lsCb.checked = false;
        lsCb.disabled = true;
    });
}

// When a block checkbox toggles, enable/disable its LS checkbox
blockRows.forEach(row => {
    const blockCb = row.querySelector('.block-cb');
    const lsCb    = row.querySelector('.ls-cb');
    blockCb.addEventListener('change', () => {
        if (!blockCb.checked) {
            lsCb.checked = false;
            lsCb.disabled = true;
        } else {
            lsCb.disabled = false;
        }
    });
});

function openCreateModal(year, month, day) {
    modalMode = 'create';
    pendingYear = year;
    pendingMonth = month;
    pendingDay = day;
    pendingEditSlot = null;

    modalTitle.textContent = 'Block test time';
    modalDateText.textContent = `${MONTH_NAMES[month]} ${day}, ${year}`;
    modalConfirmBtn.textContent = 'Block test';
    modalDeleteBtn.style.display = 'none';

    teacherNameInput.value = '';
    classNameInput.value = '';
    resetBlockRows();

    passwordLabel.style.display = '';
    passwordInput.style.display = '';
    passwordInput.value = '';
    passwordInput.placeholder = 'Choose a password';
    passwordInput.autocomplete = 'new-password';

    modalError.textContent = '';
    modalOverlay.classList.add('active');
    teacherNameInput.focus();
}

function openEditModal(slot, year, month, day) {
    modalMode = 'edit';
    pendingYear = year;
    pendingMonth = month;
    pendingDay = day;
    pendingEditSlot = slot;

    modalTitle.textContent = 'Alter test time';
    modalDateText.textContent = `${MONTH_NAMES[month]} ${day}, ${year}`;
    modalConfirmBtn.textContent = 'Save changes';
    modalDeleteBtn.style.display = '';

    teacherNameInput.value = slot.teacher;
    classNameInput.value = slot.className;

    resetBlockRows();
    blockRows.forEach(row => {
        const blockCb = row.querySelector('.block-cb');
        const lsCb    = row.querySelector('.ls-cb');
        const blockVal = blockCb.value;
        if (slot.blocks.includes(blockVal)) {
            blockCb.checked = true;
            lsCb.disabled = false;
            if (slot.lsBlocks.includes(blockVal)) lsCb.checked = true;
        }
    });

    // Hide the "choose password" field on edit — password was already entered
    passwordLabel.style.display = 'none';
    passwordInput.style.display = 'none';
    passwordInput.value = '';

    modalError.textContent = '';
    modalOverlay.classList.add('active');
    teacherNameInput.focus();
}

function closeModal() {
    modalOverlay.classList.remove('active');
    modalMode = 'create';
    pendingYear = pendingMonth = pendingDay = null;
    pendingEditSlot = null;
}

function collectModalValues() {
    const teacher = teacherNameInput.value.trim();
    const className = classNameInput.value.trim();

    const selectedBlocks = [];
    const selectedLSBlocks = [];

    blockRows.forEach(row => {
        const blockCb = row.querySelector('.block-cb');
        const lsCb    = row.querySelector('.ls-cb');
        if (blockCb.checked) {
            selectedBlocks.push(blockCb.value);
            if (lsCb.checked) selectedLSBlocks.push(blockCb.value);
        }
    });

    return {
        teacher,
        className,
        blocks: selectedBlocks,
        lsBlocks: selectedLSBlocks,
        classBlockStr: selectedBlocks.join(', '),
        lsStr: selectedLSBlocks.join(', ')
    };
}

async function confirmBlockOrSave() {
    const { teacher, className, blocks, classBlockStr, lsStr } = collectModalValues();

    if (!teacher || !className || blocks.length === 0) {
        modalError.textContent = 'Please fill in name, subject/class, and select at least one block.';
        return;
    }

    if (modalMode === 'create') {
        const password = passwordInput.value.trim();
        if (!password) {
            modalError.textContent = 'Please enter a password.';
            return;
        }

        modalConfirmBtn.disabled = true;
        modalConfirmBtn.textContent = 'Saving…';

        const isoDate = toISODate(pendingYear, pendingMonth, pendingDay);

        const { error } = await supabaseClient.rpc('create_test_slot', {
            p_grade: selectedGrade,
            p_slot_date: isoDate,
            p_teacher: teacher,
            p_class_name: className,
            p_password: password,
            p_class_block: classBlockStr,
            p_learning_support: lsStr
        });

        modalConfirmBtn.disabled = false;
        modalConfirmBtn.textContent = 'Block test';

        if (error) {
            if (error.message && error.message.toLowerCase().includes('tests')) {
                modalError.textContent = 'This day just became full. Please choose another date.';
            } else {
                modalError.textContent = error.message || 'Could not save. Please try again.';
            }
            return;
        }

        closeModal();
        await refresh();
    } else {
        // edit mode — password already captured in pendingAlterSlot
        modalConfirmBtn.disabled = true;
        modalConfirmBtn.textContent = 'Saving…';

        const { data, error } = await supabaseClient.rpc('update_test_slot', {
            p_id: pendingEditSlot.id,
            p_password: pendingAlterSlot.password,
            p_teacher: teacher,
            p_class_name: className,
            p_class_block: classBlockStr,
            p_learning_support: lsStr
        });

        modalConfirmBtn.disabled = false;
        modalConfirmBtn.textContent = 'Save changes';

        if (error) {
            modalError.textContent = error.message || 'Could not save changes.';
            return;
        }
        if (data !== true) {
            modalError.textContent = 'Incorrect password.';
            return;
        }

        closeModal();
        pendingAlterSlot = null;
        await refresh();
    }
}

// ---------- ALTER PASSWORD PROMPT ----------
function openAlterPrompt(year, month, day, slot) {
    pendingAlterSlot = { year, month, day, slot, password: '' };
    alterPromptInfo.textContent = `Slot: ${slot.teacher} · ${slot.className}`;
    alterPasswordInput.value = '';
    alterPromptError.textContent = '';
    alterPromptOverlay.classList.add('active');
    alterPasswordInput.focus();
}

function closeAlterPrompt() {
    alterPromptOverlay.classList.remove('active');
    pendingAlterSlot = null;
}

async function confirmAlterPrompt() {
    if (!pendingAlterSlot) return;

    const entered = alterPasswordInput.value.trim();
    if (!entered) {
        alterPromptError.textContent = 'Please enter your password.';
        return;
    }

    alterPromptConfirmBtn.disabled = true;
    alterPromptConfirmBtn.textContent = 'Checking…';

    const { data, error } = await supabaseClient.rpc('verify_test_slot_password', {
        p_id: pendingAlterSlot.slot.id,
        p_password: entered
    });

    alterPromptConfirmBtn.disabled = false;
    alterPromptConfirmBtn.textContent = 'Continue';

    if (error) {
        alterPromptError.textContent = error.message || 'Could not verify password.';
        return;
    }
    if (data !== true) {
        alterPromptError.textContent = 'Incorrect password.';
        return;
    }

    // Save password, close prompt, open edit modal
    const { year, month, day, slot } = pendingAlterSlot;
    pendingAlterSlot.password = entered;
    alterPromptOverlay.classList.remove('active');

    openEditModal(slot, year, month, day);
}

// ---------- DELETE MODAL ----------
function openDeleteModal(year, month, day, slot) {
    pendingDelete = { year, month, day, slot };
    deleteModalInfo.textContent = `Slot: ${slot.teacher} · ${slot.className}`;
    deletePasswordInput.value = '';
    deleteModalError.textContent = '';
    deleteModalOverlay.classList.add('active');
    deletePasswordInput.focus();
}

function closeDeleteModal() {
    deleteModalOverlay.classList.remove('active');
    pendingDelete = null;
}

async function confirmDelete() {
    if (!pendingDelete) return;

    const { slot } = pendingDelete;
    const entered = deletePasswordInput.value.trim();

    if (!entered) {
        deleteModalError.textContent = 'Please enter the password.';
        return;
    }

    deleteModalConfirmBtn.disabled = true;
    deleteModalConfirmBtn.textContent = 'Deleting…';

    const { data, error } = await supabaseClient.rpc('delete_test_slot', {
        p_id: slot.id,
        p_password: entered
    });

    deleteModalConfirmBtn.disabled = false;
    deleteModalConfirmBtn.textContent = 'Delete';

    if (error) {
        deleteModalError.textContent = error.message || 'Could not delete.';
        return;
    }
    if (data !== true) {
        deleteModalError.textContent = 'Incorrect password. Only the teacher who created this slot can delete it.';
        return;
    }

    closeDeleteModal();
    await refresh();
}

// Delete from inside the edit modal (password already verified)
async function deleteFromEditModal() {
    if (modalMode !== 'edit' || !pendingEditSlot || !pendingAlterSlot) return;

    if (!confirm('Delete this test? This cannot be undone.')) return;

    modalDeleteBtn.disabled = true;
    modalDeleteBtn.textContent = 'Deleting…';

    const { data, error } = await supabaseClient.rpc('delete_test_slot', {
        p_id: pendingEditSlot.id,
        p_password: pendingAlterSlot.password
    });

    modalDeleteBtn.disabled = false;
    modalDeleteBtn.textContent = 'Delete this test';

    if (error) {
        modalError.textContent = error.message || 'Could not delete.';
        return;
    }
    if (data !== true) {
        modalError.textContent = 'Incorrect password.';
        return;
    }

    closeModal();
    pendingAlterSlot = null;
    await refresh();
}

// ---------- EXPORT TO EXCEL ----------
function openExportModal() {
    const state = viewState[selectedGrade];

    const firstDay = new Date(state.year, state.month, 1);
    const lastDay  = new Date(state.year, state.month + 1, 0);

    exportFromInput.value = toISODate(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate());
    exportToInput.value   = toISODate(lastDay.getFullYear(),  lastDay.getMonth(),  lastDay.getDate());

    exportGradeLabel.textContent = selectedGrade;
    exportModalError.textContent = '';

    exportModalOverlay.classList.add('active');
    exportFromInput.focus();
}

function closeExportModal() {
    exportModalOverlay.classList.remove('active');
}

async function confirmExport() {
    const fromStr = exportFromInput.value;
    const toStr   = exportToInput.value;

    if (!fromStr || !toStr) {
        exportModalError.textContent = 'Please choose both a start and end date.';
        return;
    }
    if (fromStr > toStr) {
        exportModalError.textContent = 'The "From" date must be on or before the "To" date.';
        return;
    }

    exportModalConfirmBtn.disabled = true;
    exportModalConfirmBtn.textContent = 'Exporting…';

    const { data, error } = await supabaseClient
        .from('test_slots')
        .select('slot_date, teacher, class_name, class_block, learning_support')
        .eq('grade', selectedGrade)
        .gte('slot_date', fromStr)
        .lte('slot_date', toStr)
        .order('slot_date', { ascending: true })
        .order('created_at', { ascending: true });

    exportModalConfirmBtn.disabled = false;
    exportModalConfirmBtn.textContent = 'Export';

    if (error) {
        exportModalError.textContent = error.message || 'Could not load data.';
        return;
    }
    if (!data || data.length === 0) {
        exportModalError.textContent = 'No tests scheduled in that range.';
        return;
    }

    const aoa = [
        ['Date', 'Teacher', 'Subject / Class', 'Blocks', 'Learning Support']
    ];

    for (const row of data) {
        const [y, m, d] = row.slot_date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dateStr = dateObj.toLocaleDateString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        const blocks = parseBlocks(row.class_block || '');
        const lsBlocks = normalizeLS(row.learning_support, blocks);

        aoa.push([
            dateStr,
            row.teacher,
            row.class_name,
            formatBlocksLabel(blocks) || '',
            lsBlocks.length > 0 ? formatBlocksLabel(lsBlocks) : 'No'
        ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
        { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Grade ${selectedGrade}`);

    const filename = `TestSchedule_G${selectedGrade}_${fromStr}_to_${toStr}.xlsx`;
    XLSX.writeFile(wb, filename);

    closeExportModal();
}

// ---------- MONTH NAV ----------
async function changeMonth(delta) {
    const st = viewState[selectedGrade];
    let m = st.month + delta;
    let y = st.year;
    if (m < 0)  { m = 11; y -= 1; }
    if (m > 11) { m = 0;  y += 1; }
    st.month = m;
    st.year = y;

    await refresh();
}

// ---------- EVENT LISTENERS ----------
gradeSelect.addEventListener('change', async (e) => {
    selectedGrade = Number(e.target.value);
    await refresh();
});

prevMonthBtn.addEventListener('click', () => changeMonth(-1));
nextMonthBtn.addEventListener('click', () => changeMonth(1));

modalCancelBtn.addEventListener('click', closeModal);
modalConfirmBtn.addEventListener('click', confirmBlockOrSave);
modalDeleteBtn.addEventListener('click', deleteFromEditModal);

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});
modalOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmBlockOrSave(); }
    if (e.key === 'Escape') closeModal();
});

alterPromptCancelBtn.addEventListener('click', closeAlterPrompt);
alterPromptConfirmBtn.addEventListener('click', confirmAlterPrompt);
alterPromptOverlay.addEventListener('click', (e) => {
    if (e.target === alterPromptOverlay) closeAlterPrompt();
});
alterPromptOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); confirmAlterPrompt(); }
    if (e.key === 'Escape') closeAlterPrompt();
});

deleteModalCancelBtn.addEventListener('click', closeDeleteModal);
deleteModalConfirmBtn.addEventListener('click', confirmDelete);
deleteModalOverlay.addEventListener('click', (e) => {
    if (e.target === deleteModalOverlay) closeDeleteModal();
});
deleteModalOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); confirmDelete(); }
    if (e.key === 'Escape') closeDeleteModal();
});

exportBtn.addEventListener('click', openExportModal);
exportModalCancelBtn.addEventListener('click', closeExportModal);
exportModalConfirmBtn.addEventListener('click', confirmExport);
exportModalOverlay.addEventListener('click', (e) => {
    if (e.target === exportModalOverlay) closeExportModal();
});
exportModalOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); confirmExport(); }
    if (e.key === 'Escape') closeExportModal();
});

// ---------- INIT ----------
(async function init() {
    await refresh();
})();

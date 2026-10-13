// =========================================================
//  Test Scheduler — Supabase version
// =========================================================

// ---------- SUPABASE CLIENT ----------
const { createClient } = window.supabase;
const supabaseClient = createClient(
    window.APP_CONFIG.SUPABASE_URL,
    window.APP_CONFIG.SUPABASE_ANON_KEY
);

// ---------- STATE ----------
const grades = [6, 7, 8, 9, 10, 11, 12];

// Max tests per day depends on grade: 3 for grades 11 & 12, 2 for all others
function getMaxTestsPerDay(grade) {
    return (grade === 11 || grade === 12) ? 3 : 2;
}

let selectedGrade = 12;

// View state (which month we're showing, per grade)
const viewState = {};
const today = new Date();
grades.forEach(g => {
    viewState[g] = { year: today.getFullYear(), month: today.getMonth() };
});

// slotsByGrade[grade] = { "YYYY-M-D": [ { id, teacher, className, classBlock, learningSupport }, ... ] }
const slotsByGrade = {};
grades.forEach(g => slotsByGrade[g] = {});

// Modal state
let pendingYear, pendingMonth, pendingDay;

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
const classBlockSelect     = document.getElementById('classBlockSelect');
const learningSupportCheckbox = document.getElementById('learningSupportCheckbox');
const passwordInput        = document.getElementById('passwordInput');
const modalError           = document.getElementById('modalError');
const modalCancelBtn       = document.getElementById('modalCancelBtn');
const modalConfirmBtn      = document.getElementById('modalConfirmBtn');

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

// Key format used in slotsByGrade: "YYYY-M-D" with month 0-indexed
function makeKey(year, month0, day) {
    return `${year}-${month0}-${day}`;
}

// Convert (year, month0, day) to a Postgres-friendly "YYYY-MM-DD" string (month 1-indexed)
function toISODate(year, month0, day) {
    const mm = String(month0 + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
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

    // Rebuild this grade's bucket for just this month
    slotsByGrade[grade] = {};

    for (const row of data) {
        const [yStr, mStr, dStr] = row.slot_date.split('-');
        const y = Number(yStr);
        const m0 = Number(mStr) - 1;
        const d = Number(dStr);
        const key = makeKey(y, m0, d);

        if (!slotsByGrade[grade][key]) slotsByGrade[grade][key] = [];
        slotsByGrade[grade][key].push({
            id: row.id,
            teacher: row.teacher,
            className: row.class_name,
            classBlock: row.class_block || '',
            learningSupport: row.learning_support || false
        });
    }
}

// ---------- RENDER CALENDAR ----------
function renderCalendar() {
    const state = viewState[selectedGrade];
    const year  = state.year;
    const month = state.month; // 0-index

    const maxTests = getMaxTestsPerDay(selectedGrade);

    monthYearDisplay.textContent = `${MONTH_NAMES[month]} ${year}`;
    calendarGrid.innerHTML = '';

    // Weekday headers
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(wd => {
        const div = document.createElement('div');
        div.className = 'weekday';
        div.textContent = wd;
        calendarGrid.appendChild(div);
    });

    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Leading blanks
    for (let i = 0; i < startWeekday; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty';
        calendarGrid.appendChild(emptyCell);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'day-cell';

        const key = makeKey(year, month, d);
        const blockedList = slotsByGrade[selectedGrade][key] || [];
        const blockedCount = blockedList.length;

        if (blockedCount >= maxTests) dayCell.classList.add('full-day');

        // Day number + badge
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

        // Slot list
        const slotListDiv = document.createElement('div');
        slotListDiv.className = 'slot-list';

        blockedList.forEach((slot, index) => {
            const slotItem = document.createElement('div');
            slotItem.className = 'slot-item';

            // Green dot for learning support
            if (slot.learningSupport) {
                const dot = document.createElement('span');
                dot.className = 'ls-dot';
                dot.textContent = '●';
                dot.title = 'Learning support required';
                slotItem.appendChild(dot);
            }

            const slotText = document.createElement('span');
            slotText.className = 'slot-text';
            slotText.textContent = `${slot.teacher} · ${slot.className}`;
            slotText.title = `${slot.teacher} — ${slot.className}`;

            const unmarkBtn = document.createElement('button');
            unmarkBtn.className = 'unmark-btn';
            unmarkBtn.textContent = '✕';
            unmarkBtn.setAttribute('aria-label', `Unmark ${slot.teacher} test`);
            unmarkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openDeleteModal(year, month, d, index, slot);
            });

            slotItem.appendChild(slotText);
            slotItem.appendChild(unmarkBtn);
            slotListDiv.appendChild(slotItem);
        });

        dayCell.appendChild(slotListDiv);

        // Hover: show details on the right panel
        dayCell.addEventListener('mouseenter', () => {
            showHoverPanel(year, month, d, blockedList);
        });

        dayCell.addEventListener('click', (e) => {
            if (e.target.closest('.unmark-btn')) return;
            handleDayClick(year, month, d);
        });

        calendarGrid.appendChild(dayCell);
    }

    // Trailing blanks
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
        html += `
            <div class="hover-slot-card">
                <div class="hover-slot-block">${slot.classBlock || '—'}</div>
                <div class="hover-slot-subject">${slot.className}</div>
                <div class="hover-slot-teacher">${slot.teacher}</div>
                <div class="hover-slot-ls">Learning Support: <strong>${slot.learningSupport ? 'Yes' : 'No'}</strong></div>
            </div>
        `;
    });

    html += '</div>';
    hoverPanel.innerHTML = html;
}

// Full refresh: fetch from Supabase then render
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
    openModal(year, month, day);
}

// ---------- BLOCK MODAL ----------
function openModal(year, month, day) {
    pendingYear = year;
    pendingMonth = month;
    pendingDay = day;

    modalDateText.textContent = `${MONTH_NAMES[month]} ${day}, ${year}`;
    modalTitle.textContent = 'Block test time';

    teacherNameInput.value = '';
    classNameInput.value = '';
    classBlockSelect.value = '';
    learningSupportCheckbox.checked = false;
    passwordInput.value = '';
    modalError.textContent = '';

    modalOverlay.classList.add('active');
    teacherNameInput.focus();
}

function closeModal() {
    modalOverlay.classList.remove('active');
    pendingYear = pendingMonth = pendingDay = null;
}

async function confirmBlock() {
    const teacher = teacherNameInput.value.trim();
    const className = classNameInput.value.trim();
    const classBlock = classBlockSelect.value;
    const learningSupport = learningSupportCheckbox.checked;
    const password = passwordInput.value.trim();

    if (!teacher || !className || !classBlock || !password) {
        modalError.textContent = 'Please fill in all required fields.';
        return;
    }

    modalConfirmBtn.disabled = true;
    modalConfirmBtn.textContent = 'Saving…';

    const isoDate = toISODate(pendingYear, pendingMonth, pendingDay);

    // NOTE: You may need to update your Supabase RPC to accept these new fields
    const { error } = await supabaseClient.rpc('create_test_slot', {
        p_grade: selectedGrade,
        p_slot_date: isoDate,
        p_teacher: teacher,
        p_class_name: className,
        p_password: password,
        p_class_block: classBlock,
        p_learning_support: learningSupport
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
}

// ---------- DELETE MODAL ----------
function openDeleteModal(year, month, day, index, slot) {
    pendingDelete = { year, month, day, index, slot };

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

// ---------- EXPORT TO EXCEL ----------
function openExportModal() {
    const state = viewState[selectedGrade];

    // Default the range to the currently-viewed month
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
    if (fromStr > toStr) {  // ISO strings compare correctly
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

    // Build the worksheet
    const aoa = [
        ['Date', 'Teacher', 'Subject / Class', 'Block', 'Learning Support']
    ];

    for (const row of data) {
        const [y, m, d] = row.slot_date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dateStr = dateObj.toLocaleDateString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        aoa.push([
            dateStr,
            row.teacher,
            row.class_name,
            row.class_block || '',
            row.learning_support ? 'Yes' : 'No'
        ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
        { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 12 }, { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Grade ${selectedGrade}`);

    // Filename uses the actual range the user chose
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
modalConfirmBtn.addEventListener('click', confirmBlock);

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});
modalOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmBlock(); }
    if (e.key === 'Escape') closeModal();
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

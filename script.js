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
const MAX_TESTS_PER_DAY = 2;

let selectedGrade = 12;

// View state (which month we're showing, per grade)
const viewState = {};
const today = new Date();
grades.forEach(g => {
    viewState[g] = { year: today.getFullYear(), month: today.getMonth() };
});

// slotsByGrade[grade] = { "YYYY-M-D": [ { id, teacher, className }, ... ] }
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

const modalOverlay         = document.getElementById('modalOverlay');
const modalTitle           = document.getElementById('modalTitle');
const modalDateText        = document.getElementById('modalDateText');
const teacherNameInput     = document.getElementById('teacherNameInput');
const classNameInput       = document.getElementById('classNameInput');
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
// Fetch all slots for the given grade whose slot_date falls in the
// visible month, then rebuild slotsByGrade[grade] for that month.
async function loadMonthForGrade(grade) {
    const { year, month } = viewState[grade];

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth  = new Date(year, month + 1, 0);

    const from = toISODate(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), firstOfMonth.getDate());
    const to   = toISODate(lastOfMonth.getFullYear(),  lastOfMonth.getMonth(),  lastOfMonth.getDate());

    const { data, error } = await supabaseClient
        .from('test_slots')
        .select('id, slot_date, teacher, class_name')
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
        // row.slot_date is "YYYY-MM-DD"; convert to our key "YYYY-M-D" with 0-index month
        const [yStr, mStr, dStr] = row.slot_date.split('-');
        const y = Number(yStr);
        const m0 = Number(mStr) - 1;   // to 0-index
        const d = Number(dStr);
        const key = makeKey(y, m0, d);

        if (!slotsByGrade[grade][key]) slotsByGrade[grade][key] = [];
        slotsByGrade[grade][key].push({
            id: row.id,
            teacher: row.teacher,
            className: row.class_name
        });
    }
}

// ---------- RENDER ----------
function renderCalendar() {
    const state = viewState[selectedGrade];
    const year  = state.year;
    const month = state.month; // 0-index

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

        if (blockedCount >= MAX_TESTS_PER_DAY) dayCell.classList.add('full-day');

        // Day number + badge
        const dayNumberDiv = document.createElement('div');
        dayNumberDiv.className = 'day-number';
        dayNumberDiv.innerHTML = `<span>${d}</span>`;
        if (blockedCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'badge-count';
            badge.textContent = `${blockedCount}/${MAX_TESTS_PER_DAY}`;
            dayNumberDiv.appendChild(badge);
        }
        dayCell.appendChild(dayNumberDiv);

        // Slot list
        const slotListDiv = document.createElement('div');
        slotListDiv.className = 'slot-list';

        blockedList.forEach((slot, index) => {
            const slotItem = document.createElement('div');
            slotItem.className = 'slot-item';

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

// Full refresh: fetch from Supabase then render
async function refresh() {
    await loadMonthForGrade(selectedGrade);
    renderCalendar();
}

// ---------- DAY CLICK ----------
function handleDayClick(year, month, day) {
    const key = makeKey(year, month, day);
    const list = slotsByGrade[selectedGrade][key] || [];

    if (list.length >= MAX_TESTS_PER_DAY) {
        alert('❌ This day is full (already 2 tests). Please select a different date.');
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
    const password = passwordInput.value.trim();

    if (!teacher || !className || !password) {
        modalError.textContent = 'Please fill in all three fields.';
        return;
    }

    // Disable button while talking to Supabase
    modalConfirmBtn.disabled = true;
    modalConfirmBtn.textContent = 'Saving…';

    const isoDate = toISODate(pendingYear, pendingMonth, pendingDay);

    const { error } = await supabaseClient.rpc('create_test_slot', {
        p_grade: selectedGrade,
        p_slot_date: isoDate,
        p_teacher: teacher,
        p_class_name: className,
        p_password: password
    });

    modalConfirmBtn.disabled = false;
    modalConfirmBtn.textContent = 'Block test';

    if (error) {
        // The trigger raises a check_violation when the day is full
        if (error.message && error.message.toLowerCase().includes('2 tests')) {
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
        // Password mismatch
        deleteModalError.textContent = 'Incorrect password. Only the teacher who created this slot can delete it.';
        return;
    }

    closeDeleteModal();
    await refresh();
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

// ---------- INIT ----------
(async function init() {
    await refresh();
})();
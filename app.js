// --- Firebase config ---

const firebaseConfig = {
  apiKey: "AIzaSyCXZFr0aODGn2fjeua4Rj1asWM5Y2aN47M",
  authDomain: "rabotanewolf-11947.firebaseapp.com",
  databaseURL: "https://rabotannewolf-11947-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "rabotannewolf-11947",
  storageBucket: "rabotannewolf-11947.firebasestorage.app",
  messagingSenderId: "295669160591",
  appId: "1:295669160591:web:3dc043f0480657b4ff2efa",
  measurementId: "G-7264GLF27X"
};

let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (error) {
  console.error('Firebase initialization failed:', error);
  // Fallback to localStorage only
}

const CONSTANTS = {
  DB_KEY: 'duty-assigner-state-v1',
  STORAGE_KEY: 'duty-assigner-state-v1',
  HISTORY_KEY: 'duty-assigner-history-v1',
  BACKUP_KEY: 'duty-assigner-backup-v1',
  SHIFT_KEY: 'duty-assigner-shifts-v1',
  CURRENT_SHIFT_KEY: 'duty-assigner-current-shift',
  INITIALIZED_KEY: 'duty-assigner-initialized',
  DEFAULT_START_TIME: '09:00',
  DEFAULT_END_TIME: '18:00',
  DEFAULT_SHIFT_HOURS: 8,
  MIN_SHIFT_HOURS: 1,
  MAX_SHIFT_HOURS: 24,
  DEFAULT_DIFFICULTY: 5,
  DEFAULT_LOAD_WEIGHT: 1,
  DEFAULT_CAPACITY_PENALTY: 6,
  HISTORY_LIMIT: 10,
  ALERT_BACKUP_SAVED: 'Резервная копия сохранена!',
  ALERT_BACKUP_NOT_FOUND: 'Резервная копия не найдена!',
  ALERT_BACKUP_RESTORED: 'Данные восстановлены из резервной копии!',
  ALERT_BACKUP_ERROR: 'Ошибка восстановления!',
  CONFIRM_CLEAR_DATA: 'Очистить сотрудников, обязанности и результат?',
  EXPORT_NO_DATA: 'Нет данных для экспорта. Добавьте сотрудников и обязанности, затем выполните распределение.',
  EXPORT_FILENAME: 'распределение.txt',
  PROMPT_SHIFT_NAME: 'Название смены?',
  CATEGORY_GENERAL_ID: 'cat_general',
  CATEGORY_HOURLY_ID: 'cat_hourly',
  VALIDATION_EMPTY_NAME: 'напиши чё нибудь балбес',
};

function saveStateToCloud(state) {
  if (db) {
    try {
      db.ref(CONSTANTS.DB_KEY).set(state);
    } catch (error) {
      console.error('Failed to save to cloud:', error);
    }
  }
}

function loadStateFromCloud(callback) {
  if (db) {
    try {
      db.ref(CONSTANTS.DB_KEY).on('value', snapshot => {
        if (snapshot.exists()) {
          callback(snapshot.val());
        }
      });
    } catch (error) {
      console.error('Failed to load from cloud:', error);
      // Continue with localStorage only
    }
  }
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** @typedef {{ id:string, name:string, startTime?:string, endTime?:string }} Employee */
/** @typedef {{ id:string, title:string, difficulty:number, excludedEmployeeIds?: string[], categoryId?: string | null, scheduleType?: 'once'|'hourly'|'fixed'|'continuous', time?: string, startTime?: string, deadline?: string }} Task */
/** @typedef {{ id:string, name:string, isHourly:boolean }} Category */

/** @type {{ employees: Employee[], tasks: Task[], weights: { loadWeight:number, capacityPenalty:number } }} */

let state = {
  employees: [],
  tasks: [],
  weights: { loadWeight: 1, capacityPenalty: 6 },
  categories: [],
};

// Глобальные переменные для смен
let currentShiftId = null;
let shifts = {};

// Храним последнее распределение обязанностей
let lastAssignments = {};

// Локальный флаг редактирования (не сохраняется)
let editingTaskId = null;
let editingEmployeeId = null;

let history = [];

// Функции для работы со сменами
function saveShifts() {
  localStorage.setItem(CONSTANTS.SHIFT_KEY, JSON.stringify(shifts));
}

function loadShifts() {
  try {
    const local = localStorage.getItem(CONSTANTS.SHIFT_KEY);
    if (local) shifts = JSON.parse(local);
  } catch (e) { shifts = {}; }
  // --- Восстанавливаем выбранную смену после загрузки shifts ---
  const savedShiftId = localStorage.getItem(CONSTANTS.CURRENT_SHIFT_KEY);
  const shiftIds = Object.keys(shifts);
  let initialShiftId = savedShiftId && shiftIds.includes(savedShiftId) ? savedShiftId : (shiftIds[0] || null);
  if (initialShiftId) {
    setCurrentShift(initialShiftId);
    const shiftSelect = document.getElementById('shift-select');
    if (shiftSelect) shiftSelect.value = initialShiftId;
  }
}

function setCurrentShift(id) {
  currentShiftId = id;
  localStorage.setItem(CONSTANTS.CURRENT_SHIFT_KEY, id);
  if (!shifts[id]) shifts[id] = { employees: [], weights: { loadWeight: CONSTANTS.DEFAULT_LOAD_WEIGHT, capacityPenalty: CONSTANTS.DEFAULT_CAPACITY_PENALTY } };
  // Меняем только сотрудников, обязанности общие
  state.employees = Array.isArray(shifts[id].employees) ? shifts[id].employees : [];
  state.weights = shifts[id].weights;
  renderEmployees();
  renderWeights();
  renderResult(assignTasks(state.employees, state.tasks, state.weights));
  saveShifts();
}

function saveCurrentShift() {
  if (!currentShiftId) return;
  shifts[currentShiftId] = { employees: state.employees, weights: state.weights };
  saveShifts();
}

function saveHistory(snapshot) {
  history.push({
    date: new Date().toLocaleString(),
    assignments: snapshot.assignments.map(a => ({
      employee: a.employee.name,
      tasks: a.tasks.map(t => t.title)
    }))
  });
  localStorage.setItem(CONSTANTS.HISTORY_KEY, JSON.stringify(history));
}

function loadHistory() {
  try {
    const local = localStorage.getItem(CONSTANTS.HISTORY_KEY);
    if (local) history = JSON.parse(local);
  } catch (e) { history = []; }
}

function renderHistory() {
  const root = document.getElementById('history-block');
  if (!root) return;
  root.innerHTML = '<h2>История распределений</h2>';
  if (!history.length) {
    root.innerHTML += '<p class="subtitle">История пуста</p>';
    return;
  }
  for (const entry of history.slice(-CONSTANTS.HISTORY_LIMIT).reverse()) {
    const div = document.createElement('div');
    div.className = 'history-entry';
    div.innerHTML = `<div class="history-date">${entry.date}</div>`;
    for (const a of entry.assignments) {
      div.innerHTML += `<div><strong>${a.employee}</strong>: ${a.tasks.map(t => `<span class='chip'>${t}</span>`).join(' ')}</div>`;
    }
    root.appendChild(div);
  }
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function saveState() {
  // Сохраняем в облако и локально
  saveStateToCloud(state);
  localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  // Сначала пробуем загрузить из localStorage
  let loaded = false;
  try {
    const local = localStorage.getItem(CONSTANTS.STORAGE_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed && typeof parsed === 'object') {
        state = {
          employees: [], // сотрудники будут восстановлены из смены
          tasks: Array.isArray(parsed.tasks)
            ? parsed.tasks.map((t) => ({ ...t, excludedEmployeeIds: Array.isArray(t.excludedEmployeeIds) ? t.excludedEmployeeIds : [], categoryId: t.categoryId ?? null }))
            : [],
          weights: { ...state.weights, ...(parsed.weights || {}) },
          categories: Array.isArray(parsed.categories)
            ? parsed.categories.map((c) => ({ id: String(c.id), name: String(c.name), isHourly: !!c.isHourly }))
            : [],
        };
        loaded = true;
      }
    }
  } catch (e) {}
  // Затем синхронизируем с облаком (обновит локальное состояние при изменениях)
  loadStateFromCloud((parsed) => {
    if (parsed && typeof parsed === 'object') {
      // Если облачные данные отличаются от локальных — обновляем и localStorage
      const cloudState = {
        employees: Array.isArray(parsed.employees)
          ? parsed.employees.map((e) => {
              if (typeof e.startTime !== 'string' || typeof e.endTime !== 'string') {
                const sh = typeof e.shiftHours === 'number' ? Math.max(CONSTANTS.MIN_SHIFT_HOURS, Math.min(CONSTANTS.MAX_SHIFT_HOURS, e.shiftHours)) : CONSTANTS.DEFAULT_SHIFT_HOURS;
                const start = CONSTANTS.DEFAULT_START_TIME;
                const endHour = (timeToHours(CONSTANTS.DEFAULT_START_TIME) + Math.floor(sh)) % 24;
                const endMin = Math.round((sh - Math.floor(sh)) * 60);
                const end = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
                const { shiftHours, ...rest } = e;
                return { ...rest, startTime: start, endTime: end };
              }
              const { shiftHours, ...rest } = e;
              return rest;
            })
          : [],
        tasks: Array.isArray(parsed.tasks)
          ? parsed.tasks.map((t) => ({ ...t, excludedEmployeeIds: Array.isArray(t.excludedEmployeeIds) ? t.excludedEmployeeIds : [], categoryId: t.categoryId ?? null }))
          : [],
        weights: { ...state.weights, ...(parsed.weights || {}) },
        categories: Array.isArray(parsed.categories)
          ? parsed.categories.map((c) => ({ id: String(c.id), name: String(c.name), isHourly: !!c.isHourly }))
          : [],
      };
      // Проверяем, отличаются ли облачные данные от локальных
      if (JSON.stringify(cloudState) !== JSON.stringify(state)) {
        state = cloudState;
        localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(state));
      }
    }
    if (!Array.isArray(state.categories) || state.categories.length === 0) {
      state.categories = [
        { id: CONSTANTS.CATEGORY_GENERAL_ID, name: 'Общее', isHourly: false },
        { id: CONSTANTS.CATEGORY_HOURLY_ID, name: 'Почасовые', isHourly: true },
      ];
    }
    // После загрузки из облака — рендерим всё
    renderEmployees();
    renderTasks();
    renderWeights();
    renderCategories();
    populateCategorySelect();
    recalcOutputs();
    if (state.employees.length && state.tasks.length) {
      renderResult(assignTasks(state.employees, state.tasks, state.weights));
    }
  });
}

function renderEmployees() {
  const list = $('#employee-list');
  list.innerHTML = '';
  for (const emp of state.employees) {
    const li = document.createElement('li');
    if (editingEmployeeId === emp.id) {
      li.innerHTML = `
        <label class="field" style="margin-bottom:8px;">
          <span>Имя</span>
          <input type="text" data-role="edit-emp-name" value="${emp.name.replace(/"/g, '&quot;')}" required />
        </label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <label class="field" style="margin:0;">
            <span>Начало (НСК)</span>
            <input type="time" data-role="edit-emp-start" value="${emp.startTime || CONSTANTS.DEFAULT_START_TIME}" />
          </label>
          <label class="field" style="margin:0;">
            <span>Окончание (НСК)</span>
            <input type="time" data-role="edit-emp-end" value="${emp.endTime || CONSTANTS.DEFAULT_END_TIME}" />
          </label>
        </div>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button class="icon-btn" data-id="${emp.id}" data-action="save-emp">Сохранить</button>
          <button class="icon-btn" data-action="cancel-emp">Отмена</button>
        </div>
      `;
    } else {
      li.innerHTML = `
        <div><strong>${emp.name}</strong></div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="tag" title="График по Новосибирскому времени">График: ${(emp.startTime || CONSTANTS.DEFAULT_START_TIME)}–${(emp.endTime || CONSTANTS.DEFAULT_END_TIME)} НСК</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" data-id="${emp.id}" data-action="edit-emp">Изменить</button>
          <button class="icon-btn" data-id="${emp.id}" data-action="remove-emp">Удалить</button>
        </div>
      `;
    }
    list.appendChild(li);
  }
}

function renderTasks() {
  const list = $('#task-list');
  list.innerHTML = '';
  for (const t of state.tasks) {
    const li = document.createElement('li');
    if (editingTaskId === t.id) {
      const excludeOptions = state.employees
        .map((emp) => {
          const checked = (t.excludedEmployeeIds || []).includes(emp.id) ? 'checked' : '';
          return `<label style="display:flex; align-items:center; gap:6px;">
              <input type="checkbox" data-role="exclude-emp" value="${emp.id}" ${checked}/>
              <span>${emp.name}</span>
            </label>`;
        })
        .join('');
      const categoryOptions = state.categories
        .map((cat) => `<option value="${cat.id}" ${t.categoryId === cat.id ? 'selected' : ''}>${cat.name}${cat.isHourly ? ' (почасовая)' : ''}</option>`)
        .join('');
      li.innerHTML = `
        <label class="field" style="margin:0;">
          <input type="text" data-role="edit-title" value="${t.title.replace(/"/g, '&quot;')}" placeholder="Название" />
        </label>
        <div class="range">
          <input type="range" min="1" max="10" value="${t.difficulty}" data-role="edit-difficulty" />
          <output data-role="edit-difficulty-out">${t.difficulty}</output>
        </div>
        <label class="field" style="margin-top:8px;">
          <span>Категория</span>
          <select data-role="edit-category">${categoryOptions}</select>
        </label>
        <label class="field" style="margin-top:8px;">
          <span>Тип выполнения</span>
          <select data-role="edit-schedule-type">
            <option value="once" ${t.scheduleType === 'once' ? 'selected' : ''}>Один раз за смену</option>
            <option value="hourly" ${t.scheduleType === 'hourly' ? 'selected' : ''}>Ежечасно</option>
            <option value="fixed" ${t.scheduleType === 'fixed' ? 'selected' : ''}>В определённое время</option>
            <option value="continuous" ${t.scheduleType === 'continuous' ? 'selected' : ''}>Постоянно</option>
          </select>
        </label>
        <div class="field full" style="margin-top:8px;" id="task-time-field">
          <span>Время выполнения</span>
          <input type="time" data-role="edit-task-time" value="${t.time || ''}" />
        </div>
        <div class="field full" style="margin-top:8px;">
          <span>Кому запрещена эта обязанность</span>
          <div style="display:grid; gap:6px; padding:8px; border:1px dashed rgba(255,138,0,0.35); border-radius:8px; background:#140f0a;">${excludeOptions || '<span class="subtitle">Сначала добавьте сотрудников</span>'}</div>
        </div>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button class="icon-btn" data-id="${t.id}" data-action="save-task">Сохранить</button>
          <button class="icon-btn" data-action="cancel-edit">Отмена</button>
        </div>
      `;
    } else {
      const currentEmployees = state.employees;
      const excludedCount = (t.excludedEmployeeIds || []).filter((id) => currentEmployees.some((e) => e.id === id)).length;
      const cat = state.categories.find((c) => c.id === t.categoryId);
      li.innerHTML = `
        <div><strong>${t.title}</strong></div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="tag">Сложность: ${t.difficulty}</span>
          ${cat ? `<span class="tag" title="Категория">${cat.name}${cat.isHourly ? ' · почасовая' : ''}</span>` : ''}
          ${excludedCount ? `<span class="tag" title="Количество запретов для сотрудников">Запреты: ${excludedCount}</span>` : ''}
        </div>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" data-id="${t.id}" data-action="edit-task">Изменить</button>
          <button class="icon-btn" data-id="${t.id}" data-action="remove-task">Удалить</button>
        </div>
      `;
    }
    list.appendChild(li);
  }
}

function renderWeights() {
  $('#weight-load').value = String(state.weights.loadWeight || CONSTANTS.DEFAULT_LOAD_WEIGHT);
  $('#weight-load-out').textContent = String(state.weights.loadWeight || CONSTANTS.DEFAULT_LOAD_WEIGHT);
}

function renderCategories() {
  const list = document.getElementById('category-list');
  if (!list) return;
  list.innerHTML = '';
  for (const cat of state.categories) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="row">
        <strong>${cat.name}</strong>
        ${cat.isHourly ? '<span class="tag">почасовая</span>' : ''}
        ${cat.id === CONSTANTS.CATEGORY_GENERAL_ID || cat.id === CONSTANTS.CATEGORY_HOURLY_ID ? '<span class="tag">системная</span>' : ''}
      </div>
      <button class="icon-btn" data-id="${cat.id}" data-action="remove-category" ${cat.id === CONSTANTS.CATEGORY_GENERAL_ID || cat.id === CONSTANTS.CATEGORY_HOURLY_ID ? 'disabled' : ''}>Удалить</button>
    `;
    list.appendChild(li);
  }
}

function populateCategorySelect() {
  const select = document.getElementById('task-category');
  if (!select) return;
  select.innerHTML = '';
  for (const cat of state.categories) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.name}${cat.isHourly ? ' (почасовая)' : ''}`;
    select.appendChild(opt);
  }
}

function recalcOutputs() {
  $('#task-difficulty-out').textContent = $('#task-difficulty').value || CONSTANTS.DEFAULT_DIFFICULTY;
  $('#weight-load-out').textContent = $('#weight-load').value || CONSTANTS.DEFAULT_LOAD_WEIGHT;
  const shift = document.getElementById('employee-shift');
  const shiftOut = document.getElementById('employee-shift-out');
  if (shift && shiftOut) shiftOut.textContent = shift.value;
  const cap = document.getElementById('weight-capacity');
  const capOut = document.getElementById('weight-capacity-out');
  if (cap && capOut) capOut.textContent = cap.value;
}

function attachFormHandlers() {
  $('#employee-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#employee-name').value.trim();
    const startTime = /** @type {HTMLInputElement} */(document.getElementById('employee-start')).value || CONSTANTS.DEFAULT_START_TIME;
    const endTime = /** @type {HTMLInputElement} */(document.getElementById('employee-end')).value || CONSTANTS.DEFAULT_END_TIME;
    if (!name) return;
    state.employees.push({ id: uid('emp'), name, startTime, endTime });
    $('#employee-name').value = '';
    saveState();
    renderEmployees();
  });

  $('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#task-title').value.trim();
    const difficulty = Number($('#task-difficulty').value) || CONSTANTS.DEFAULT_DIFFICULTY;
    const categorySelect = /** @type {HTMLSelectElement} */(document.getElementById('task-category'));
    const categoryId = categorySelect && categorySelect.value ? categorySelect.value : null;
    if (!title) return;
    state.tasks.push({ id: uid('task'), title, difficulty, categoryId });
    $('#task-title').value = '';
    saveState();
    renderTasks();
  });

  $('#employee-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');

    if (action === 'remove-emp' && id) {
      state.employees = state.employees.filter((x) => x.id !== id);
      if (editingEmployeeId === id) editingEmployeeId = null;
      saveState();
      renderEmployees();
      return;
    }
    if (action === 'edit-emp' && id) {
      editingEmployeeId = id;
      renderEmployees();
      return;
    }
    if (action === 'cancel-emp') {
      editingEmployeeId = null;
      renderEmployees();
      return;
    }
    if (action === 'save-emp' && id) {
      const li = btn.closest('li');
      const nameInput = li.querySelector('[data-role="edit-emp-name"]');
      const newName = nameInput ? nameInput.value.trim() : '';
      const newStart = li.querySelector('[data-role="edit-emp-start"]').value || CONSTANTS.DEFAULT_START_TIME;
      const newEnd = li.querySelector('[data-role="edit-emp-end"]').value || CONSTANTS.DEFAULT_END_TIME;
      const idx = state.employees.findIndex((x) => x.id === id);
      if (idx !== -1 && newName) {
        state.employees[idx] = { ...state.employees[idx], name: newName, startTime: newStart, endTime: newEnd };
        saveState();
      }
      editingEmployeeId = null;
      renderEmployees();
      return;
    }
  });

  // Обновление output у слайдера смены
  $('#employee-list').addEventListener('input', (e) => {
    const range = e.target.closest('input[type="range"][data-role="edit-emp-shift"]');
    if (!range) return;
    const out = range.parentElement.querySelector('[data-role="edit-emp-shift-out"]');
    if (out) out.textContent = range.value;
  });

  $('#task-list').addEventListener('click', (e) => {
    const actionBtn = e.target.closest('button[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.getAttribute('data-action');
    const id = actionBtn.getAttribute('data-id');

    if (action === 'remove-task' && id) {
      state.tasks = state.tasks.filter((x) => x.id !== id);
      if (editingTaskId === id) editingTaskId = null;
      saveState();
      renderTasks();
      return;
    }

    if (action === 'edit-task' && id) {
      editingTaskId = id;
      renderTasks();
      return;
    }

    if (action === 'cancel-edit') {
      editingTaskId = null;
      renderTasks();
      return;
    }

    if (action === 'save-task' && id) {
      const li = actionBtn.closest('li');
      const titleInput = li.querySelector('[data-role="edit-title"]');
      const diffInput = li.querySelector('[data-role="edit-difficulty"]');
      const catSelect = li.querySelector('[data-role="edit-category"]');
      const schedSelect = li.querySelector('[data-role="edit-schedule-type"]');
      const timeInput = li.querySelector('[data-role="edit-task-time"]');
      const newTitle = titleInput.value.trim();
      const newDiff = Number(diffInput.value) || CONSTANTS.DEFAULT_DIFFICULTY;
      const newCat = catSelect ? catSelect.value : null;
      const newSched = schedSelect ? schedSelect.value : 'once';
      const newTime = timeInput.value;
      if (!newTitle) {
        titleInput.focus();
        return;
      }
      const idx = state.tasks.findIndex((x) => x.id === id);
      if (idx !== -1) {
        const excluded = Array.from(li.querySelectorAll('[data-role="exclude-emp"]:checked')).map((el) => el.value);
        state.tasks[idx] = { ...state.tasks[idx], title: newTitle, difficulty: newDiff, excludedEmployeeIds: excluded, categoryId: newCat, scheduleType: newSched, time: newTime };
        saveState();
      }
      editingTaskId = null;
      renderTasks();
      return;
    }
  });

  // Делегированное обновление output у слайдера в режиме редактирования
  $('#task-list').addEventListener('input', (e) => {
    const range = e.target.closest('input[type="range"][data-role="edit-difficulty"]');
    if (!range) return;
    const out = range.parentElement.querySelector('[data-role="edit-difficulty-out"]');
    if (out) out.textContent = range.value;
  });

  $('#weight-load').addEventListener('input', () => {
    state.weights.loadWeight = Number($('#weight-load').value) || CONSTANTS.DEFAULT_LOAD_WEIGHT;
    recalcOutputs();
    saveState();
  });

  const weightCapacity = document.getElementById('weight-capacity');
  if (weightCapacity) {
    weightCapacity.addEventListener('input', () => {
      state.weights.capacityPenalty = Number($('#weight-capacity').value) || CONSTANTS.DEFAULT_CAPACITY_PENALTY;
      recalcOutputs();
      saveState();
    });
  }

  // Категории: добавление/удаление
  const categoryForm = document.getElementById('category-form');
  if (categoryForm) {
    categoryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = /** @type {HTMLInputElement} */(document.getElementById('category-name'));
      const hourlyInput = /** @type {HTMLInputElement} */(document.getElementById('category-hourly'));
      const name = nameInput.value.trim();
      const isHourly = !!hourlyInput.checked;
      if (!name) return;
      const exists = state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
      if (exists) { nameInput.focus(); return; }
      state.categories.push({ id: uid('cat'), name, isHourly });
      nameInput.value = '';
      hourlyInput.checked = false;
      saveState();
      renderCategories();
      populateCategorySelect();
    });
  }

  const categoryList = document.getElementById('category-list');
  if (categoryList) {
    categoryList.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="remove-category"]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (id === CONSTANTS.CATEGORY_GENERAL_ID || id === CONSTANTS.CATEGORY_HOURLY_ID) return; // системные
      state.categories = state.categories.filter((c) => c.id !== id);
      for (const t of state.tasks) {
        if (t.categoryId === id) t.categoryId = CONSTANTS.CATEGORY_GENERAL_ID;
      }
      saveState();
      renderCategories();
      populateCategorySelect();
      renderTasks();
    });
  }

  $('#assign-btn').addEventListener('click', () => {
    // Сохраняем предыдущее распределение
    if (window.currentPlan && window.currentPlan.assignments) {
      lastAssignments = {};
      for (const entry of window.currentPlan.assignments) {
        lastAssignments[entry.employee.id] = (entry.tasks || []).map(t => t.id);
      }
      saveHistory(window.currentPlan);
      renderHistory();
    }
    const plan = assignTasks(state.employees, state.tasks, state.weights, lastAssignments);
    window.currentPlan = plan;
    renderResult(plan);
  });

  // Экспорт TXT из блока настроек
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const plan = assignTasks(state.employees, state.tasks, state.weights);
      const text = buildExportText(plan);
      downloadText(text, CONSTANTS.EXPORT_FILENAME);
    });
  }

  $('#clear-btn').addEventListener('click', () => {
    if (!confirm(CONSTANTS.CONFIRM_CLEAR_DATA)) return;
    state = { employees: [], tasks: [], weights: state.weights };
    saveState();
    renderEmployees();
    renderTasks();
    $('#result').innerHTML = '';
  });

  ;['task-difficulty'].forEach((id) => {
    document.getElementById(id).addEventListener('input', recalcOutputs);
  });
}

/**
 * Категории задач:
 * - Перерывы (перерывы ГЛ)
 * - Отчёты (итоговый портос)
 * - Запросы (запрос супервайзеру)
 * - Почасовые
 * - Срочные/Дедлайновые
 */

/** @typedef {
 *  { id:string, title:string, difficulty:number, excludedEmployeeIds?: string[], categoryId?: string | null,
 *    scheduleType?: 'once'|'hourly'|'fixed'|'continuous',
 *    time?: string, // для fixed
 *    startTime?: string, // для временного окна
 *    deadline?: string // для дедлайна
 *  }
 *} Task */

// Алгоритм распределения: сортируем задачи по убыванию сложности,
// для каждой задачи выбираем сотрудника с минимальной стоимостью среди разрешённых.
// Стоимость = weightLoad * currentLoad
// Возвращает { assignments: [...], unassigned: Task[] }
// lastAssignments — объект: empId -> [taskId, ...]
function assignTasks(employees, tasks, weights, lastAssignments = {}) {
  const { loadWeight, capacityPenalty } = weights;
  const sortedTasks = [...tasks].sort((a, b) => b.difficulty - a.difficulty);
  const plan = new Map(); // empId -> { employee, tasks: [], load: number }
  const unassigned = [];
  for (const emp of employees) plan.set(emp.id, { employee: emp, tasks: [], load: 0 });

  const timeToHours = (hhmm) => {
    if (typeof hhmm !== 'string' || !hhmm.includes(':')) return 0;
    const [h, m] = hhmm.split(':').map((x) => Number(x));
    return (isNaN(h) ? 0 : h) + (isNaN(m) ? 0 : m) / 60;
  };
  const capacityHoursOf = (emp) => {
    const start = timeToHours(emp.startTime || CONSTANTS.DEFAULT_START_TIME);
    const end = timeToHours(emp.endTime || CONSTANTS.DEFAULT_END_TIME);
    if (end >= start) return end - start;
    return 24 - start + end; // через полночь
  };
  const isTimeInEmployeeRange = (emp, time) => {
    const start = timeToHours(emp.startTime || CONSTANTS.DEFAULT_START_TIME);
    const end = timeToHours(emp.endTime || CONSTANTS.DEFAULT_END_TIME);
    const t = timeToHours(time);
    if (end >= start) return t >= start && t < end;
    return t >= start || t < end; // через полночь
  };

  for (const t of sortedTasks) {
    if (employees.length === 0) { unassigned.push(t); continue; }
    const excluded = new Set(t.excludedEmployeeIds || []);
    let assigned = false;
    // --- Распределение по расписанию ---
    if (t.scheduleType === 'fixed' && t.time) {
      // Назначить задачу сотруднику, чей рабочий интервал включает время задачи
      for (const entry of plan.values()) {
        if (excluded.has(entry.employee.id)) continue;
        if (isTimeInEmployeeRange(entry.employee, t.time)) {
          entry.tasks.push({ ...t, _scheduledTime: t.time });
          entry.load += t.difficulty;
          assigned = true;
          break;
        }
      }
      if (!assigned) unassigned.push(t);
      continue;
    }
    if (t.scheduleType === 'hourly') {
      // Назначить задачу каждому сотруднику один раз (будет выполняться ежечасно)
      for (const entry of plan.values()) {
        if (excluded.has(entry.employee.id)) continue;
        // Добавляем задачу только один раз с пометкой "ежечасно"
        entry.tasks.push({ ...t, _scheduledTime: 'ежечасно' });
        entry.load += t.difficulty;
        assigned = true;
      }
      if (!assigned) unassigned.push(t);
      continue;
    }
    // once или по умолчанию
    const allowedEntries = Array.from(plan.values()).filter((entry) => {
      if (excluded.has(entry.employee.id)) return false;
      // Исключаем задачи, которые были у сотрудника в прошлом распределении
      if (lastAssignments[entry.employee.id] && lastAssignments[entry.employee.id].includes(t.id)) return false;
      return true;
    });
    if (allowedEntries.length === 0) { unassigned.push(t); continue; }
    let bestEmpEntry = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const entry of allowedEntries) {
      // Если задача имеет время, назначаем только сотруднику, чей интервал включает это время
      if (t.time && !isTimeInEmployeeRange(entry.employee, t.time)) continue;
      const projectedLoad = entry.load + t.difficulty;
      const over = Math.max(0, projectedLoad - capacityHoursOf(entry.employee));
      const cost = loadWeight * entry.load + (capacityPenalty || CONSTANTS.DEFAULT_CAPACITY_PENALTY) * over;
      if (cost < bestCost) { bestCost = cost; bestEmpEntry = entry; }
    }
    if (bestEmpEntry) {
      bestEmpEntry.tasks.push({ ...t, _scheduledTime: t.time || null });
      bestEmpEntry.load += t.difficulty;
      assigned = true;
    }
    if (!assigned) unassigned.push(t);
  }

  return {
    assignments: Array.from(plan.values()).sort((a, b) => a.employee.name.localeCompare(b.employee.name)),
    unassigned,
  };
}

// Формирование текстового отчёта: только ник (имя) и список обязанностей
function buildExportText(plan) {
  if (!plan || !plan.assignments || plan.assignments.length === 0) {
    return CONSTANTS.EXPORT_NO_DATA;
  }
  const lines = [];
  for (const entry of plan.assignments) {
    lines.push(`${entry.employee.name}`);
    for (const t of entry.tasks) {
      lines.push(`- ${t.title}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

// Загрузка текстового файла
function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderResult(plan) {
  const root = $('#result');
  root.innerHTML = '';
  if (!plan) {
    root.innerHTML = '<p class="subtitle">Добавьте сотрудников и обязанности, затем распределите.</p>';
    return;
  }
  const { assignments, unassigned } = plan;
  if ((!assignments || assignments.length === 0) && (!unassigned || unassigned.length === 0)) {
    root.innerHTML = '<p class="subtitle">Добавьте сотрудников и обязанности, затем распределите.</p>';
    return;
  }
  for (const entry of assignments || []) {
    const col = document.createElement('div');
    col.className = 'result-col';
    col.dataset.empId = entry.employee.id;
    col.innerHTML = `
      <h3>
  <span>${entry.employee.name}</span>
        <span class="sum">Нагрузка: ${entry.tasks.reduce((s, t) => s + t.difficulty, 0)}</span>
      </h3>
    `;
    for (const t of entry.tasks) {
      const card = document.createElement('div');
      card.className = 'task-card';
      card.draggable = true;
      card.dataset.taskId = t.id;
      card.innerHTML = `
        <div><strong>${t.title}</strong></div>
        <div class="meta">
          <span class="chip">Сложность: ${t.difficulty}</span>
          ${t._scheduledTime ? `<span class="chip chip-time">${t._scheduledTime}</span>` : ''} ${t.scheduleType === 'hourly' ? '<span class="chip chip-hourly">ежечасно</span>' : ''}
        </div>
      `;
      col.appendChild(card);
    }
    root.appendChild(col);
  }
  
  // Добавляем колонку для неназначенных задач
  if (unassigned && unassigned.length > 0) {
    const unassignedCol = document.createElement('div');
    unassignedCol.className = 'result-col unassigned-col';
    unassignedCol.innerHTML = `
      <h3>
        <span style="color: #f85149;">⚠️ Неназначенные задачи</span>
        <span class="sum">Количество: ${unassigned.length}</span>
      </h3>
    `;
    for (const t of unassigned) {
      const card = document.createElement('div');
      card.className = 'task-card unassigned-task';
      card.draggable = true;
      card.dataset.taskId = t.id;
      card.innerHTML = `
        <div><strong>${t.title}</strong></div>
        <div class="meta">
          <span class="chip">Сложность: ${t.difficulty}</span>
          ${t._scheduledTime ? `<span class="chip chip-time">${t._scheduledTime}</span>` : ''}
          ${t.scheduleType === 'hourly' ? '<span class="chip chip-hourly">ежечасно</span>' : ''}
          <span class="chip" style="background: #f85149; color: white;">Не назначена</span>
        </div>
      `;
      unassignedCol.appendChild(card);
    }
    root.appendChild(unassignedCol);
  }
  // Drag-and-drop перераспределение
  root.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.taskId);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', e => {
      card.classList.remove('dragging');
    });
  });
  root.querySelectorAll('.result-col').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', e => {
      col.classList.remove('drag-over');
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const empId = col.dataset.empId;
      
      // Пропускаем, если это колонка неназначенных задач
      if (col.classList.contains('unassigned-col')) return;
      
      // Найти задачу
      const taskIdx = state.tasks.findIndex(t => t.id === taskId);
      if (taskIdx === -1) return;
      
      // Удалить задачу из всех сотрудников
      for (const entry of assignments) {
        entry.tasks = entry.tasks.filter(t => t.id !== taskId);
      }
      
      // Удалить задачу из неназначенных
      const unassignedIdx = unassigned.findIndex(t => t.id === taskId);
      if (unassignedIdx !== -1) {
        unassigned.splice(unassignedIdx, 1);
      }
      
      // Добавить задачу к выбранному сотруднику
      const targetEntry = assignments.find(a => a.employee.id === empId);
      if (targetEntry) {
        targetEntry.tasks.push(state.tasks[taskIdx]);
      }
      
      // Обновить план с новыми неназначенными задачами
      const updatedPlan = {
        assignments: assignments,
        unassigned: unassigned
      };
      
      // Сохранить новое распределение и историю
      window.currentPlan = updatedPlan;
      saveHistory(updatedPlan);
      saveState();
      renderResult(updatedPlan);
      renderHistory();
    });
  });

  // Дублирующая кнопка экспорта сверху блока результата
  const actionsTop = document.querySelector('.result-actions');
  if (actionsTop) {
    actionsTop.innerHTML = '';
    const btn = document.createElement('button');
    btn.id = 'export-btn-top';
    btn.className = 'btn';
    btn.textContent = 'Экспорт TXT';
    btn.addEventListener('click', () => {
      const text = buildExportText(plan);
      downloadText(text, CONSTANTS.EXPORT_FILENAME);
    });
    actionsTop.appendChild(btn);
  }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  // Оборачиваем renderEmployees для автосохранения сотрудников в смене (фикс: только один раз)
  if (!window._renderEmployeesWrapped) {
    const origRenderEmployees = renderEmployees;
    renderEmployees = function() {
      origRenderEmployees.apply(this, arguments);
      if (currentShiftId && shifts[currentShiftId]) {
        shifts[currentShiftId].employees = JSON.parse(JSON.stringify(state.employees));
        saveShifts();
      }
    };
    window._renderEmployeesWrapped = true;
  }
  // --- Кнопка резервного копирования сотрудников и обязанностей ---
  function saveBackup() {
    const backup = {
      employees: state.employees,
      tasks: state.tasks
    };
    localStorage.setItem(CONSTANTS.BACKUP_KEY, JSON.stringify(backup));
    alert(CONSTANTS.ALERT_BACKUP_SAVED);
  }
  function restoreBackup() {
    try {
      const raw = localStorage.getItem(CONSTANTS.BACKUP_KEY);
      if (!raw) return alert(CONSTANTS.ALERT_BACKUP_NOT_FOUND);
      const backup = JSON.parse(raw);
      if (Array.isArray(backup.employees)) state.employees = backup.employees;
      if (Array.isArray(backup.tasks)) state.tasks = backup.tasks;
      saveState();
      renderEmployees();
      renderTasks();
      alert(CONSTANTS.ALERT_BACKUP_RESTORED);
    } catch (e) { alert(CONSTANTS.ALERT_BACKUP_ERROR); }
  }
  // Добавляем кнопки в настройки
  const actionsPanel = document.querySelector('.actions');
  if (actionsPanel) {
    const backupBtn = document.createElement('button');
    backupBtn.className = 'btn';
    backupBtn.textContent = 'Сохранить резервную копию';
    backupBtn.onclick = saveBackup;
    actionsPanel.appendChild(backupBtn);
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn';
    restoreBtn.textContent = 'Восстановить из копии';
    restoreBtn.onclick = restoreBackup;
    actionsPanel.appendChild(restoreBtn);
  }
  // Кастомизация сообщения валидации только для пустого поля
  const employeeNameInput = document.getElementById('employee-name');
  if (employeeNameInput) {
    employeeNameInput.addEventListener('input', function() {
      this.setCustomValidity('');
    });
    employeeNameInput.addEventListener('invalid', function(e) {
      if (!this.value.trim()) {
        this.setCustomValidity(CONSTANTS.VALIDATION_EMPTY_NAME);
      } else {
        this.setCustomValidity('');
      }
    });
  }
  loadState();
  loadHistory();
  renderHistory();
  loadShifts();
  
  // --- Автоматическое добавление обязанностей только при первом запуске ---
  const isInitialized = localStorage.getItem(CONSTANTS.INITIALIZED_KEY);
  if (!isInitialized) {
    const dutiesToAdd = [
      'Перерывы', 'Чат', 'Хулиганство/мошенничество/Угрозы',
      'Плановые работы', 'Нарушители ГЛ/ЧАТ', 'Отчет по задачам',
      'Портянка(ежечасная)', 'ДБО',
      'Распределение фидов', 'предатор', 'Ипотека+нейт',
      'ГЛ', 'Универсализация', 'Выходы ГЛ',
      'плайт', 'ГСК', 'Отработка/подработка', 'Слоты',
      'Такси', 'График МФ', 'Запрос Супервайзеру',
      'Выходы', 'Итоговый портос', 'Простои ГЛ/ЧАТ',
      'Отчёт по отмене статусов', 'Контроль', 'Включения ВКЦ комсити'
    ];
    
    // Проверяем, есть ли такие задачи уже в state.tasks (по title, без учёта регистра)
    const existingTitles = new Set(state.tasks.map(t => t.title.trim().toLowerCase()));
    let added = false;
    dutiesToAdd.forEach(title => {
      if (!existingTitles.has(title.trim().toLowerCase())) {
        state.tasks.push({
          id: uid('task'),
          title,
          difficulty: CONSTANTS.DEFAULT_DIFFICULTY,
          categoryId: state.categories[0]?.id || CONSTANTS.CATEGORY_GENERAL_ID,
          excludedEmployeeIds: []
        });
        added = true;
      }
    });
    
    if (added) {
      removeDuplicateTasks();
      saveState();
      renderTasks();
    }
    
    // Отмечаем, что инициализация выполнена
    localStorage.setItem(CONSTANTS.INITIALIZED_KEY, 'true');
  }
  // UI для выбора смены
  const shiftSelect = document.getElementById('shift-select');
  if (shiftSelect) {
    shiftSelect.innerHTML = '';
    Object.keys(shifts).forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      shiftSelect.appendChild(opt);
    });
    shiftSelect.addEventListener('change', e => {
      setCurrentShift(shiftSelect.value);
    });
  }
  // Кнопка создания смены
  const shiftAddBtn = document.getElementById('shift-add-btn');
  if (shiftAddBtn) {
    shiftAddBtn.addEventListener('click', () => {
      const name = prompt(CONSTANTS.PROMPT_SHIFT_NAME);
      if (name && !shifts[name]) {
        shifts[name] = { tasks: [], weights: { loadWeight: CONSTANTS.DEFAULT_LOAD_WEIGHT, capacityPenalty: CONSTANTS.DEFAULT_CAPACITY_PENALTY } };
        saveShifts();
        setCurrentShift(name);
        if (shiftSelect) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          shiftSelect.appendChild(opt);
          shiftSelect.value = name;
        }
      }
    });
  }
  // Инициализация Flatpickr для времени
  if (window.IOSTimePicker) {
    new IOSTimePicker(document.getElementById('employee-start'));
    new IOSTimePicker(document.getElementById('employee-end'));
  }
  // Подгоняем масштаб, чтобы всё помещалось по высоте одного экрана
  autoFitToViewportHeight();
  window.addEventListener('resize', autoFitToViewportHeight);
  renderEmployees();
  renderTasks();
  renderWeights();
  renderCategories();
  populateCategorySelect();
  recalcOutputs();
  attachFormHandlers();
  if (state.employees.length && state.tasks.length) {
    renderResult(assignTasks(state.employees, state.tasks, state.weights));
  }
});

function autoFitToViewportHeight() {
  const root = document.getElementById('page-root');
  if (!root) return;
  root.style.transformOrigin = 'top center';
  root.style.transform = 'none';
  // даём браузеру отрисовать и измерить
  const { height } = root.getBoundingClientRect();
  const vh = window.innerHeight;
  if (height > 0 && vh > 0 && height > vh) {
    const scale = Math.max(0.6, vh / height);
    root.style.transform = `scale(${scale})`;
  }
}


function removeDuplicateTasks() {
  const seen = new Set();
  state.tasks = state.tasks.filter(task => {
    const normTitle = task.title.trim().toLowerCase();
    if (seen.has(normTitle)) return false;
    seen.add(normTitle);
    return true;
  });
}



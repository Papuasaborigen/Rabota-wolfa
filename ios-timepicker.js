// Кастомный iOS-like time picker
class IOSTimePicker {
  constructor(input) {
    this.input = input;
    this.createPicker();
    this.attachEvents();
  }
  createPicker() {
    this.picker = document.createElement('div');
    this.picker.className = 'ios-timepicker-popup';
    this.picker.innerHTML = `
      <div class="ios-timepicker">
        <div class="ios-timepicker-list" data-type="hour"></div>
        <div class="ios-timepicker-list" data-type="minute"></div>
      </div>
      <button class="ios-timepicker-ok">ОК</button>
    `;
    document.body.appendChild(this.picker);
    this.hourList = this.picker.querySelector('[data-type="hour"]');
    this.minuteList = this.picker.querySelector('[data-type="minute"]');
    for (let h = 0; h < 24; h++) {
      const el = document.createElement('div');
      el.className = 'ios-timepicker-item';
      el.textContent = h.toString().padStart(2, '0');
      el.dataset.value = h;
      this.hourList.appendChild(el);
    }
    for (let m = 0; m < 60; m += 5) {
      const el = document.createElement('div');
      el.className = 'ios-timepicker-item';
      el.textContent = m.toString().padStart(2, '0');
      el.dataset.value = m;
      this.minuteList.appendChild(el);
    }
    this.picker.style.display = 'none';
  }
  attachEvents() {
    this.input.addEventListener('focus', () => this.showPicker());
    this.input.addEventListener('click', () => this.showPicker());
    this.picker.querySelector('.ios-timepicker-ok').addEventListener('click', () => this.setValue());
    this.hourList.addEventListener('click', (e) => {
      if (e.target.classList.contains('ios-timepicker-item')) {
        this.selectItem(this.hourList, e.target);
      }
    });
    this.minuteList.addEventListener('click', (e) => {
      if (e.target.classList.contains('ios-timepicker-item')) {
        this.selectItem(this.minuteList, e.target);
      }
    });
    document.addEventListener('click', (e) => {
      if (!this.picker.contains(e.target) && e.target !== this.input) {
        this.hidePicker();
      }
    });
  }
  showPicker() {
    this.picker.style.display = 'block';
    this.picker.style.position = 'absolute';
    const rect = this.input.getBoundingClientRect();
    this.picker.style.left = rect.left + 'px';
    this.picker.style.top = (rect.bottom + window.scrollY) + 'px';
    this.syncSelection();
  }
  hidePicker() {
    this.picker.style.display = 'none';
  }
  selectItem(list, item) {
    list.querySelectorAll('.ios-timepicker-item').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');
  }
  syncSelection() {
    let [h, m] = (this.input.value || '09:00').split(':');
    h = parseInt(h) || 9;
    m = parseInt(m) || 0;
    this.hourList.querySelectorAll('.ios-timepicker-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.value) === h);
    });
    this.minuteList.querySelectorAll('.ios-timepicker-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.value) === m);
    });
  }
  setValue() {
    const hour = this.hourList.querySelector('.selected')?.dataset.value || '09';
    const minute = this.minuteList.querySelector('.selected')?.dataset.value || '00';
    this.input.value = `${hour.padStart(2,'0')}:${minute.padStart(2,'0')}`;
    this.hidePicker();
  }
}
window.IOSTimePicker = IOSTimePicker;

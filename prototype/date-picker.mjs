import {lunarText,lunarDay} from './lunar.mjs';
import { TODAY, validDate } from './domain.mjs';
import { monthDays, shiftMonth } from './calendar.mjs';

const chevron = direction => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction < 0 ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'}"/></svg>`;
const calendarIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16"/></svg>';
const pickers = new Map();
const outsideRange=(input,value)=>(input.min&&value<input.min)||(input.max&&value>input.max);

export function syncDatePickers() {
  for (const [input, state] of pickers) {
    state.trigger.disabled=input.disabled;
    const label = input.value ? input.value.replaceAll('-', ' / ')+' · '+lunarText(input.value) : '未安排日期';
    const value=state.root.querySelector('.date-trigger-value');value.replaceChildren();
    const solar=document.createElement('span');solar.className='date-solar';solar.textContent=input.value?input.value.replaceAll('-',' / '):'未安排日期';
    const lunar=document.createElement('small');lunar.className='date-lunar';lunar.textContent=input.value?lunarText(input.value):'可选择公历与农历日期';value.append(solar,lunar);
    state.trigger.setAttribute('aria-label', `选择${state.label}：${label}`);
    if (!state.panel.hidden) renderPicker(input, state);
  }
}

export function closeDatePickers(restoreFocus = false) {
  for (const state of pickers.values()) {
    const wasOpen = !state.panel.hidden;
    state.panel.hidden = true;
    state.trigger.setAttribute('aria-expanded', 'false');
    if (wasOpen && restoreFocus) state.trigger.focus();
  }
}

function commit(input, value) {
  if(input.disabled||(value&&outsideRange(input,value)))return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  syncDatePickers();
  closeDatePickers(true);
}

function renderPicker(input, state) {
  const [year, month] = state.month.split('-').map(Number);
  state.panel.innerHTML = `<div class="picker-heading"><button type="button" data-picker-move="-1" aria-label="上个月">${chevron(-1)}</button><strong>${year} 年 <span>${month} 月</span></strong><button type="button" data-picker-move="1" aria-label="下个月">${chevron(1)}</button></div>
    <div class="picker-weekdays">${['一','二','三','四','五','六','日'].map(day=>`<span>${day}</span>`).join('')}</div>
    <div class="picker-days">${monthDays(state.month).map(day=>`<button type="button" class="picker-day ${day.inMonth ? '' : 'outside'} ${day.date === TODAY ? 'is-today' : ''} ${day.date === input.value ? 'chosen' : ''}" data-pick-date="${day.date}" aria-label="${day.date} · ${lunarText(day.date)}" aria-pressed="${day.date === input.value}" ${outsideRange(input,day.date)?'disabled':''} ${day.date === TODAY ? 'aria-current="date"' : ''}><b>${day.day}</b><small>${lunarDay(day.date)}</small></button>`).join('')}</div>
    <div class="picker-bottom"><button type="button" data-picker-today ${outsideRange(input,TODAY)?'disabled':''}>今天 · ${Number(TODAY.slice(5,7))}/${Number(TODAY.slice(8))}</button><span>选择后自动填入</span>${!input.dataset.dateRequired ? '<button type="button" data-picker-clear>不设日期</button>' : ''}</div>`;
}

export function mountDatePickers() {
  document.querySelectorAll('input[type="date"]').forEach((input, index) => {
    const label = input.closest('label').childNodes[0].textContent.trim();
    if (input.required) input.dataset.dateRequired = 'true';
    input.required = false;
    input.type = 'hidden';
    const root = document.createElement('div');
    root.className = 'date-picker';
    root.innerHTML = `<button class="date-trigger" type="button" aria-expanded="false" aria-controls="picker-${index}"><span class="date-trigger-value"></span>${calendarIcon}</button><div class="picker-panel" id="picker-${index}" role="group" aria-label="${label}日历" hidden></div>`;
    input.after(root);
    const state = { root, trigger: root.querySelector('.date-trigger'), panel: root.querySelector('.picker-panel'), label, month: TODAY.slice(0, 7) };
    pickers.set(input, state);
    state.trigger.addEventListener('click', event => {
      event.preventDefault();
      const open = state.panel.hidden;
      closeDatePickers();
      if (!open) return;
      state.month = (validDate(input.value) ? input.value : input.min&&TODAY<input.min?input.min:input.max&&TODAY>input.max?input.max:TODAY).slice(0, 7);
      renderPicker(input, state);
      state.panel.hidden = false;
      state.trigger.setAttribute('aria-expanded', 'true');
      (state.panel.querySelector('.chosen:not(:disabled)') || state.panel.querySelector('.is-today:not(:disabled)') || state.panel.querySelector('.picker-day:not(:disabled)'))?.focus();
    });
    state.panel.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button||button.disabled) return;
      event.preventDefault();
      // Re-rendering removes the clicked button. Keep this internal click from
      // reaching document handlers after its target has been detached.
      event.stopPropagation();
      if (button.dataset.pickerMove) {
        state.month = shiftMonth(state.month, Number(button.dataset.pickerMove));
        renderPicker(input, state);
        state.panel.querySelector(`[data-picker-move="${button.dataset.pickerMove}"]`)?.focus();
      } else if (button.dataset.pickDate) commit(input, button.dataset.pickDate);
      else if (button.hasAttribute('data-picker-today')) commit(input, TODAY);
      else if (button.hasAttribute('data-picker-clear')) commit(input, '');
    });
    state.panel.addEventListener('keydown', event => {
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      const button = event.target.closest('[data-pick-date]');
      if (!delta || !button) return;
      event.preventDefault();
      const date = new Date(button.dataset.pickDate + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + delta);
      const next = date.toISOString().slice(0, 10);
      if(outsideRange(input,next))return;
      state.month = next.slice(0, 7);
      renderPicker(input, state);
      state.panel.querySelector(`[data-pick-date="${next}"]`).focus();
    });
  });
  document.addEventListener('click', event => {
    if (!event.composedPath().some(node => node instanceof Element && node.matches('.date-picker'))) closeDatePickers();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && [...pickers.values()].some(state => !state.panel.hidden)) {
      event.preventDefault(); event.stopImmediatePropagation(); closeDatePickers(true);
    }
  }, true);
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => closeDatePickers()));
  syncDatePickers();
}

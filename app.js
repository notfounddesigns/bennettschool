// ── CONFIG ────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://wivquwyesxwcysjgtuji.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_inqQrSuwsDxQ3WnPPlxHRA_Lz9UDtA1';
// ─────────────────────────────────────────────────────────────────────────

const PROXY = `${SUPABASE_URL}/functions/v1`;
const AUTH_HEADERS = {
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

// ── APP STATE ─────────────────────────────────────────────────────────────
let _currentEmployee = null; // Set on successful login, used for timecards + dashboard

// const names = new Set(['Grimes', 'Dame', 'McCaig', 'O\'Neal', 'Cross', 'Lovett', 'Romaro'])

// init();

// async function init() {
//   const params = new URLSearchParams({ resource: 'employees'});
//   const students = await homebaseFetch(`?${params}`);
//   const csv = [
//     'password_hash, homebase_id, total_hrs, hrs_to_graduate, percent_complete, name',
//     ...students
//       .filter(s => !names.has(s.last_name))
//       .sort((a, b) => a.first_name.localeCompare(b.first_name))
//       .map(e => `NULL,${e.id},0,1500,0,${e.first_name} ${e.last_name}`)
//   ].join('\n')

//   const blob = new Blob([csv], { type: 'text/csv' })
//   const url = URL.createObjectURL(blob)
//   const a = document.createElement('a')
//   a.href = url
//   a.download = 'employees.csv'
//   a.click()
//   URL.revokeObjectURL(url)
// }

// ── LOGIN ─────────────────────────────────────────────────────────────────
async function handleLogin() {
  const name = document.getElementById('login-name').value.trim();
  const password = document.getElementById('login-password').value;

  setAlert('login-error', '');

  if (!name) { setAlert('login-error', 'Please enter your first and last name.'); return; }
  if (!password) { setAlert('login-error', 'Please enter your password.'); return; }

  const [first, last] = name.split(' ');

  setLoading('login-btn', true);
  try {
    const res = await fetch(`${PROXY}/auth-login`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ first_name: first.toLowerCase(), last_name: last.toLowerCase(), password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAlert('login-error', data.error || 'Login failed. Please try again.');
      return;
    }

    _currentEmployee = data.employee;

    if (data.result === 'first_time') {
      showScreen('setpass');
    } else {
      await renderDashboard(_currentEmployee);
    }
  } catch {
    setAlert('login-error', 'Network error. Please try again.');
  } finally {
    document.getElementById('login-password').value = null;
    setLoading('login-btn', false);
  }
}

// ── SET PASSWORD ──────────────────────────────────────────────────────────
async function handleSetPassword() {
  const np = document.getElementById('setpass-new').value;
  const cp = document.getElementById('setpass-confirm').value;
  setAlert('setpass-error', '');

  if (np.length < 8) { setAlert('setpass-error', 'Password must be at least 8 characters.'); return; }
  if (np !== cp) { setAlert('setpass-error', 'Passwords do not match.'); return; }
  if (!_currentEmployee) {
    setAlert('setpass-error', 'Session expired. Please sign in again.');
    showScreen('login');
    return;
  }

  setLoading('setpass-btn', true);
  try {
    const fullName = `${_currentEmployee.first_name} ${_currentEmployee.last_name}`;
    const res = await fetch(`${PROXY}/set-password`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ homebase_id: String(_currentEmployee.id), password: np, name: fullName }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAlert('setpass-error', data.error || 'Could not save password. Please try again.');
      return;
    }

    setAlert('setpass-success', 'Password saved! Taking you to your dashboard…', 'success');
    setTimeout(async () => await renderDashboard(_currentEmployee), 1200);
  } catch {
    setAlert('setpass-error', 'Network error. Please try again.');
  } finally {
    document.getElementById('setpass-new').value = null;
    document.getElementById('setpass-confirm').value = null;
    setLoading('setpass-btn', false);
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────
function handleLogout() {
  _currentEmployee = null;
  document.getElementById('login-name').value = '';
  document.getElementById('login-password').value = '';
  setAlert('login-error', '');
  showScreen('login');
}

function closeModal(m) {
  if (m === 'de') closeDEModal()
  if (m === 'grades') closeGradesModal()
}

// ── DE HOURS MODAL ───────────────────────────────────────────────────────
async function openDEModal() {
  const modal = document.getElementById('de-modal');
  // Reset form
  document.getElementById('de-alert').textContent = '';
  document.getElementById('de-alert').className = 'alert';
  document.getElementById('de-module').value = '';
  document.getElementById('de-platform').value = '';
  document.getElementById('de-hours').value = '';
  document.querySelectorAll('input[name="de-verified"]').forEach(r => r.checked = false);
  // Default date to today
  document.getElementById('de-date').value = new Date().toISOString().slice(0, 10);
  // Load students
  await loadStudents('de');
  modal.showModal();
}

function closeDEModal() {
  document.getElementById('de-modal').close();
}

async function loadStudents(m) {
  const sel = document.getElementById(`${m}-student`);
  sel.innerHTML = '<option value="">Loading…</option>';
  try {
    const params = new URLSearchParams({ resource: 'employees'});
    const students = await homebaseFetch(`?${params}`);
    if (students.length === 0) {
      sel.innerHTML = '<option value="">No students found</option>';
    } else {
      sel.innerHTML = '<option value="">Select a student…</option>' +
        students.map(s => {
          const name = `${s.first_name} ${s.last_name}`.replaceAll(/\b\w/g, c => c.toUpperCase());
          return `<option value="${s.id}">${name}</option>`;
        }).join('');
    }
  } catch {
    sel.innerHTML = '<option value="">Could not load students</option>';
  }
}

async function submitDEHours() {
  const studentId = document.getElementById('de-student').value;
  const date = document.getElementById('de-date').value;
  const module = document.getElementById('de-module').value.trim();
  const platform = document.getElementById('de-platform').value.trim();
  const hours = document.getElementById('de-hours').value;
  const verifiedEl = document.querySelector('input[name="de-verified"]:checked');

  if (!studentId || !date || !module || !platform || !hours || !verifiedEl) {
    showDEAlert('All fields are required.', 'error');
    return;
  }

  const btn = document.getElementById('de-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/de_log`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'apikey': SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        student_id: studentId,
        date,
        module,
        platform,
        hours: Number.parseFloat(hours),
        verified: verifiedEl.value === 'true',
      }),
    });
    if (!res.ok) throw new Error('Save failed');
    closeDEModal();
  } catch {
    showAlert('de-alert', 'Could not save. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function openGradesModal() {
  const modal = document.getElementById('grades-modal');
  // Reset form
  document.getElementById('grades-alert').textContent = '';
  document.getElementById('grades-alert').className = 'alert';
  document.getElementById('grades-project').value = '';
  document.getElementById('grades-category').value = '';
  document.getElementById('grades-score').value = '';
  document.getElementById('grades-notes').value = '';
  // Default date to today
  document.getElementById('grades-date').value = new Date().toISOString().slice(0, 10);
  // Load students
  await loadStudents('grades');
  modal.showModal();
}

function closeGradesModal() {
  document.getElementById('grades-modal').close();
}

function submitGrades() {
  // TODO: implement submitGrades
  showAlert('grades-alert', 'Could not save. Please try again.', 'error');
}

function showAlert(el, m, t) {
  const elem = document.getElementById(el);
  elem.textContent = m;
  elem.className = `alert show alert-${t}`;
}

function fmtFloat(val, p = 2) {
  return Number.parseFloat(val).toFixed(p);
}

async function homebaseFetch(path) {
  const res = await fetch(`${PROXY}/homebase${path}`, { headers: AUTH_HEADERS });
  if (!res.ok) throw new Error(`Homebase proxy error: ${res.status}`);
  return res.json();
}

// ── DASHBOARD RENDER ──────────────────────────────────────────────────────
async function getDashboardSummary(employeeUserId) {
  const params = new URLSearchParams({ resource: 'student', homebaseId: employeeUserId});
  const resp = await homebaseFetch(`?${params}`);
  console.log({resp})
  if (resp.result !== 'ok') {
    console.error('Error fetching dashboard summary...');
    return;
  }
  return {
    totalHrsAll: fmtFloat(resp.profile.total_hrs),
    hrsToGrad: fmtFloat(resp.profile.hrs_to_graduate),
    percentComplete: resp.profile.percent_complete,
    inPersonHrs: fmtFloat(resp.profile.hours_by_type['In Person Hours'] || 0),
    deHrs: fmtFloat(resp.profile.hours_by_type['DE Hours'] || 0),
    inPersonHrsList: resp.profile.in_person_hrs_list,
    deHrsList: resp.profile.de_hrs_list
  }
}

async function renderDashboard(emp) {
  const displayName = `${emp.first_name} ${emp.last_name}`.replaceAll(/\b\w/g, c => c.toUpperCase());
  document.getElementById('dash-avatar').textContent = getInitials(displayName);

  const hDash = h => `${h}<span class="stat-unit"> h</span>`;
  document.getElementById('stat-de-hours').innerHTML = hDash('—');
  document.getElementById('stat-inperson-hours').innerHTML = hDash('—');
  document.getElementById('stat-total-hours').innerHTML = hDash('—');
  document.getElementById('stat-hours-to-grad').textContent = '— h remaining';
  document.getElementById('progress-grad').style.width = '0%';
  document.getElementById('de-log-list').innerHTML = '<li class="empty-state">Loading…</li>';
  document.getElementById('grades-table-wrap').innerHTML = '<p class="empty-state">Loading…</p>';

  const isManager = emp.job.level === 'Manager';
  document.getElementById('manager-actions').style.display = isManager ? 'inline-flex' : 'none';

  showScreen('dashboard');

  const s = await getDashboardSummary(emp.id);

  // ── Display User Profile Stats ─────────────────────────────────────────────────────────────
  document.getElementById('stat-inperson-hours').innerHTML = hDash(s.inPersonHrs);
  document.getElementById('stat-de-hours').innerHTML = hDash(s.deHrs);
  document.getElementById('stat-total-hours').innerHTML = hDash(s.totalHrsAll);
  document.getElementById('stat-hours-to-grad').innerHTML = (s.hrsToGrad);
  document.getElementById('stat-hours-to-grad').textContent = `${s.hrsToGrad} h remaining`;
  document.getElementById('progress-grad').style.width = `${s.percentComplete}%`;

  renderHrsLogEntries(s.inPersonHrsList, s.deHrsList);
}

function renderHrsLogEntries(inPersonList, deList, grades = []) {
  // ── In Person List
  const in_person_list = document.getElementById('inperson-log-list');
  if (inPersonList.length === 0) {
    in_person_list.innerHTML = '<li class="empty-state">No in person hours recorded yet.</li>';
  } else {
    in_person_list.innerHTML = inPersonList.map(e => `
      <li class="shift-item">
        <div class="shift-left">
          <span class="shift-date">${formatSimpleDate(e.date)}</span>
        </div>
        <div class="shift-right">
          <span class="shift-hrs">${e.hours}h</span>
        </div>
      </li>`).join('');
  }

  // ── DE List
  const de_list = document.getElementById('de-log-list');
  if (deList.length === 0) {
    de_list.innerHTML = '<li class="empty-state">No DE hours recorded yet.</li>';
  } else {
    de_list.innerHTML = deList.map(e => `
      <li class="shift-item">
        <div class="shift-left">
          <span class="shift-date">${formatSimpleDate(e.date)}</span>
          <span class="shift-time">${escHtml(e.module)} · ${escHtml(e.platform)}</span>
        </div>
        <div class="shift-right">
          <span class="shift-hrs">${e.hours}h</span>
          <span class="shift-badge ${e.verified ? 'badge-approved' : 'badge-pending'}">${e.verified ? 'Verified' : 'Unverified'}</span>
        </div>
      </li>`).join('');
  }

  // ── Grades
  const wrap = document.getElementById('grades-table-wrap');
  if (grades.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No grades recorded yet.</p>';
  } else {
    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Project</th>
            <th>Category</th>
            <th>Score</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${grades.map(g => {
            const letter = scoreToLetter(g.score);
            return `<tr>
              <td>${formatSimpleDate(g.date)}</td>
              <td>${escHtml(g.project)}</td>
              <td>${escHtml(g.category)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="grade-chip grade-${letter.toLowerCase()}">${letter}</span>
                  <span style="color:var(--muted);font-size:12px;">${g.score}</span>
                </div>
              </td>
              <td style="color:var(--muted)">${g.notes ? escHtml(g.notes) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
}

function scoreToLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'F';
}

function formatSimpleDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function escHtml(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// ── UI HELPERS ────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  const isDash = id === 'dashboard';
  document.getElementById('topbar').classList.toggle('visible', isDash);
  document.getElementById('shell').style.paddingTop = isDash ? '2rem' : '';
}

function setAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert alert-${type}` + (msg ? ' show' : '');
}

function setLoading(btnId, on) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = on;
  if (on) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>Please wait…';
  } else {
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
  }
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '??';
}

// ── KEYBOARD ──────────────────────────────────────────────────────────────
document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('setpass-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') handleSetPassword(); });
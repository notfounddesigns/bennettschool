// ── CONFIG ───────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://wivquwyesxwcysjgtuji.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_inqQrSuwsDxQ3WnPPlxHRA_Lz9UDtA1';
const PROXY = `${SUPABASE_URL}/functions/v1`;
const AUTH_HEADERS = {
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};
let _supabaseClient = null;
let _currentEmployee = null;
let snackbarTimer = null
// ── END CONFIG────────────────────────────────────────────────────────────

// ── KEYBOARD ─────────────────────────────────────────────────────────────
document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('setpass-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') handleSetPassword(); });
// ── END KEYBOARD ─────────────────────────────────────────────────────────

// ── AUTH ─────────────────────────────────────────────────────────────────
async function handleLogin() {
  const name = document.getElementById('login-name').value.trim();
  const password = document.getElementById('login-password').value;

  setAlert('login-error', '');

  if (!name) { setAlert('login-error', 'Please enter your first and last name.'); return; }
  if (!password) { setAlert('login-error', 'Please enter your password.'); return; }

  const parts = name.split(' ').filter(Boolean);
  if (parts.length < 2) { setAlert('login-error', 'Please enter your first and last name.'); return; }
  const [first, last] = parts;

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
    localStorage.setItem('employee', JSON.stringify(data.employee));

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
function handleLogout() {
  _currentEmployee = null;
  localStorage.removeItem('employee');
  document.getElementById('login-name').value = '';
  document.getElementById('login-password').value = '';
  setAlert('login-error', '');
  showScreen('login');
}
// ── END AUTH ─────────────────────────────────────────────────────────────

// ── DASHBOARD RENDER ─────────────────────────────────────────────────────
async function homebaseFetch(path) {
  const res = await fetch(`${PROXY}/homebase${path}`, { headers: AUTH_HEADERS });
  if (!res.ok) throw new Error(`Homebase proxy error: ${res.status}`);
  return res.json();
}
async function fetchStudentDashboard(employeeUserId) {
  const daysAgo7 = nDaysAgo(7);
  const [
    { data: profile, error: profileError },
    { data: hours, error: hoursError },
    { data: gradesData },
  ] = await Promise.all([
    _supabaseClient
      .from('profiles')
      .select(`
        homebase_id,
        name,
        total_hrs,
        hrs_to_graduate,
        percent_complete,
        hours (
          type_id,
          hours
        )
      `)
      .eq('homebase_id', employeeUserId)
      .single(),
    _supabaseClient
      .from('hours')
      .select('type_id, hours, date, module, platform, verified')
      .eq('homebase_id', employeeUserId)
      .gte('date', daysAgo7),
    _supabaseClient
      .from('grades')
      .select('date, project, category, score, notes')
      .eq('homebase_id', employeeUserId)
      .order('date', { ascending: false }),
  ])

  if (profileError || hoursError) {
    console.error('Error fetching dashboard summary...', profileError || hoursError)
    return
  }

  const inPersonHrs = profile.hours
      .filter(h => h.type_id === 1)
      .reduce((sum, h) => sum + (h.hours ?? 0), 0)
  const deHrs = profile.hours
      .filter(h => h.type_id === 2)
      .reduce((sum, h) => sum + (h.hours ?? 0), 0)

  const inPersonHrsList = (hours ?? [])
    .filter(h => h.type_id === 1)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(({ date, hours }) => ({ date, hours }))

  const deHrsList = (hours ?? [])
    .filter(h => h.type_id === 2)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(({ date, hours, module, platform, verified }) => ({ date, hours, module, platform, verified }))

  return {
    totalHrsAll:     profile.total_hrs        ?? 0,
    hrsToGrad:       profile.hrs_to_graduate  ?? 0,
    percentComplete: profile.percent_complete ?? 0,
    inPersonHrs,
    deHrs,
    inPersonHrsList,
    deHrsList,
    grades: gradesData ?? [],
  }
}
async function renderDashboard(emp) {
  const displayName = `${emp.first_name} ${emp.last_name}`.replaceAll(/\b\w/g, c => c.toUpperCase());
  document.getElementById('dash-avatar').textContent = getInitials(displayName);

  // decide which dashboard to show, Student or Admin
  const isManager = emp.job.level === 'Manager';
  if (isManager) await loadEmployeeTable();
  else {
    const hDash = h => `${h}<span class="stat-unit"> h</span>`;
    document.getElementById('stat-de-hours').innerHTML = hDash('—');
    document.getElementById('stat-inperson-hours').innerHTML = hDash('—');
    document.getElementById('stat-total-hours').innerHTML = hDash('—');
    document.getElementById('stat-hours-to-grad').textContent = '— h remaining';
    document.getElementById('stat-percent-grad-progress').textContent = '0%';
    document.getElementById('progress-grad').style.width = '0%';
    document.getElementById('de-log-list').innerHTML = '<li class="empty-state">Loading…</li>';
    document.getElementById('grades-table-wrap').innerHTML = '<p class="empty-state">Loading…</p>';

    showScreen('dashboard');

    const s = await fetchStudentDashboard(emp.id);

    // ── Display User Profile Stats ─────────────────────────────────────────────────────────────
    document.getElementById('stat-inperson-hours').innerHTML = hDash(fmtFloat(s.inPersonHrs));
    document.getElementById('stat-de-hours').innerHTML = hDash(fmtFloat(s.deHrs));
    document.getElementById('stat-total-hours').innerHTML = hDash(fmtFloat(s.totalHrsAll));
    document.getElementById('stat-hours-to-grad').textContent = `${fmtFloat(s.hrsToGrad - s.totalHrsAll)} h remaining`;
    document.getElementById('stat-percent-grad-progress').textContent = `${s.percentComplete}%`;
    const progressColor = s.percentComplete >= 80 ? 'var(--sage)' : s.percentComplete >= 65 ? 'var(--blush)' : 'var(--error)';
    document.getElementById('stat-percent-grad-progress').style.color = progressColor;
    document.getElementById('progress-grad').style.width = `${s.percentComplete}%`;
    document.getElementById('progress-grad').style.background = progressColor;

    renderHrsLogEntries(s.inPersonHrsList, s.deHrsList, s.grades);
  }
}
function renderHrsLogEntries(inPersonList, deList, grades = []) {
  // ── In Person List
  const in_person_list = document.getElementById('inperson-log-list');
  if (inPersonList.length === 0) {
    in_person_list.innerHTML = '<li class="empty-state">No in person hours recorded yet.</li>';
  } else {
    in_person_list.innerHTML = inPersonList
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(e => `
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
// ── END DASHBOARD RENDER ─────────────────────────────────────────────────

// ── MANAGEMENT RENDER ────────────────────────────────────────────────────
async function loadLastSync() {
  const { data } = await _supabaseClient
    .from('sync_log')
    .select('synced_at, date_synced, inserted, synced_by')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  renderLastSync(data);
}
function renderLastSync(record) {
  const el = document.getElementById('last-sync-info');
  if (!el) return;
  if (!record) {
    el.textContent = 'No syncs recorded yet.';
    return;
  }
  const when = new Date(record.synced_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
  const name = record.synced_by
    ? record.synced_by.replace(/\b\w/g, c => c.toUpperCase())
    : 'Unknown';
  el.textContent = `Last sync: ${when} · ${record.inserted ?? 0} records · ${name}`;
}
async function loadEmployeeTable() {
  showScreen('mgmt');
  document.getElementById('mgmt-employee-tbody').innerHTML =
    `<tr><td colspan="6" class="empty-state"><span class="spinner" style="display:inline-block;vertical-align:middle;margin-right:8px;"></span>Loading…</td></tr>`;

  const [{ data, error }] = await Promise.all([
    _supabaseClient
      .from('profiles')
      .select(`
        homebase_id,
        name,
        total_hrs,
        hrs_to_graduate,
        percent_complete,
        hours (
          type_id,
          hours
        )
      `)
      .order('name'),
    loadLastSync(),
  ]);

  if (error) return showSnackbar('Failed to load employees', 'error')

  const employees = data.map(emp => {
    const inPersonHrs = emp.hours
      .filter(h => h.type_id === 1)
      .reduce((sum, h) => sum + (h.hours ?? 0), 0)

    const deHrs = emp.hours
      .filter(h => h.type_id === 2)
      .reduce((sum, h) => sum + (h.hours ?? 0), 0)

    return {
      ...emp,
      in_person_hrs: fmtFloat(inPersonHrs),
      de_hrs:        fmtFloat(deHrs),
    }
  })

  renderEmployeeTable(employees)
}
function renderEmployeeTable(employees) {
  const tbody = document.getElementById('mgmt-employee-tbody')

  if (!employees.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No employees found.</td></tr>`
    return
  }

  tbody.innerHTML = employees.map(emp => `
    <tr>
      <td>${emp.name ? escHtml(emp.name) : '—'}</td>
      <td>${emp.in_person_hrs} <span style="color:var(--muted);font-size:11px">hrs</span></td>
      <td>${emp.de_hrs} <span style="color:var(--muted);font-size:11px">hrs</span></td>
      <td>${emp.total_hrs ?? 0} <span style="color:var(--muted);font-size:11px">hrs</span></td>
      <td>${emp.hrs_to_graduate ?? 0} <span style="color:var(--muted);font-size:11px">hrs</span></td>
      <td>
        <div class="percent-cell">
          <div class="mini-bar">
            <div class="mini-fill" style="width:${Math.min(emp.percent_complete ?? 0, 100)}%"></div>
          </div>
          <span>${emp.percent_complete ?? 0}%</span>
        </div>
      </td>
    </tr>
  `).join('')
}
// ── END MANAGEMENT RENDER ────────────────────────────────────────────────

// ── MODAL ────────────────────────────────────────────────────────────────
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
function closeModal(m) {
  if (m === 'de') document.getElementById('de-modal').close();
  if (m === 'grades') document.getElementById('grades-modal').close();
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
        hours: fmtFloat(hours),
        verified: verifiedEl.value === 'true',
      }),
    });
    if (!res.ok) throw new Error('Save failed');
    closeModal('de');
    await loadEmployeeTable();
  } catch {
    setAlert('de-alert', 'Could not save. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}
async function submitGrades() {
  const studentId = document.getElementById('grades-student').value;
  const date = document.getElementById('grades-date').value;
  const project = document.getElementById('grades-project').value.trim();
  const category = document.getElementById('grades-category').value.trim();
  const score = document.getElementById('grades-score').value;
  const notes = document.getElementById('grades-notes').value.trim();

  setAlert('grades-alert', '');
  if (!studentId || !date || !project || !category || !score) {
    setAlert('grades-alert', 'All fields except notes are required.');
    return;
  }

  const btn = document.getElementById('grades-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/grades`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'apikey': SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        homebase_id: studentId,
        date,
        project,
        category,
        score: Number(score),
        notes: notes || null,
      }),
    });
    if (!res.ok) throw new Error('Save failed');
    closeModal('grades');
    showSnackbar('Grade saved.', 'success');
  } catch {
    setAlert('grades-alert', 'Could not save. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}
// ── END MODAL ────────────────────────────────────────────────────────────

// ── HELPERS ──────────────────────────────────────────────────────────────
function nDaysAgo(days) {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);
  return daysAgo.toISOString();
}
function showSnackbar(message, type = 'default', duration = 3000) {
  const snackbar = document.getElementById('snackbar')
  const msg = document.getElementById('snackbar-msg')

  // Clear any existing timer
  if (snackbarTimer) clearTimeout(snackbarTimer)

  // Reset classes and set new ones
  snackbar.className = 'snackbar'
  if (type !== 'default') snackbar.classList.add(type)

  msg.textContent = message
  snackbar.classList.add('show')

  snackbarTimer = setTimeout(() => {
    snackbar.classList.remove('show')
  }, duration)
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
          return `<option value="${s.id}">${escHtml(name)}</option>`;
        }).join('');
    }
  } catch {
    sel.innerHTML = '<option value="">Could not load students</option>';
  }
}
async function syncHours() {
  const date = document.getElementById('sync-date').value;
  if (!date) { showSnackbar('Please select a date before syncing.', 'error'); return; }
  setLoading('sync-btn', true);
  try {
    const res = await fetch(`${PROXY}/sync-hours-by-date`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ date }),
    });
    const resp = await res.json();
    document.getElementById('confirm-dialog').close();
    if (resp.result !== 'ok') {
      showSnackbar('Error syncing hours. Please try again.', 'error');
      return;
    }
    showSnackbar(`Success — ${resp.inserted} timecards synced.`, 'success');
    await fetch(`${SUPABASE_URL}/rest/v1/sync_log`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'apikey': SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        date_synced: date,
        inserted: resp.inserted ?? 0,
        synced_by: `${_currentEmployee.first_name} ${_currentEmployee.last_name}`,
      }),
    }).catch(() => {});
    loadLastSync();
    setTimeout(() => {
      if (_currentEmployee?.job?.level === 'Manager') loadEmployeeTable();
    }, 3500);
  } catch {
    showSnackbar('Network error. Please try again.', 'error');
  } finally {
    setLoading('sync-btn', false);
  }
}
function fmtFloat(val, p = 2) {
  return Number.parseFloat(val).toFixed(p);
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
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  const isDash = id === 'dashboard' || id === 'mgmt';
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
// ── END HELPERS ──────────────────────────────────────────────────────────

// ── DOMContentLoaded ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const cached = localStorage.getItem('employee')
  if (cached) {
    _currentEmployee = JSON.parse(cached)
    const { data } = await _supabaseClient
      .from('profiles')
      .select('homebase_id')
      .eq('homebase_id', _currentEmployee.id)
      .single()
    if (data) {
      await renderDashboard(_currentEmployee)
    } else {
      localStorage.removeItem('employee')
      _currentEmployee = null
    }
  }
});
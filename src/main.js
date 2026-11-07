import {
  cloudEnabled,
  getCurrentSession,
  loadLedger,
  loadReports,
  saveLedger,
  saveReport,
  signIn,
  signOut
} from './supabase.js';

const STORAGE_KEY = 'ruang-hadir-v1';
    const OWNER_PASSWORD_KEY = 'ruang-hadir-owner-password-v1';
    const dateInput = document.getElementById('attendanceDate');
    const attendanceRows = document.getElementById('attendanceRows');
    const ownerRows = document.getElementById('ownerRows');
    const historyHead = document.getElementById('historyHead');
    const historyRows = document.getElementById('historyRows');
    const loanRows = document.getElementById('loanRows');
    const reportsRows = document.getElementById('reportsRows');
    const employeeModal = document.getElementById('employeeModal');
    const employeeForm = document.getElementById('employeeForm');
    const loanModal = document.getElementById('loanModal');
    const loanForm = document.getElementById('loanForm');
    const repaymentModal = document.getElementById('repaymentModal');
    const repaymentForm = document.getElementById('repaymentForm');
    const ownerAccessModal = document.getElementById('ownerAccessModal');
    const ownerAccessForm = document.getElementById('ownerAccessForm');
    let editingId = null;
    let repaymentLoanId = null;
    let ownerAuthenticated = false;
    let ownerSetupMode = false;
    let ownerAccessDestination = 'owner';
    let currentUser = null;
    let dataWriteInProgress = false;
    let toastTimer;
    let historyRefreshTimer = null;
    let historyRefreshInProgress = false;

    function localDateString(date = new Date()) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function makeId(prefix) {
      return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

function emptyData() {
  return { employees: [], attendance: {}, loans: [] };
}

function normalizeData(saved) {
  if (!saved || !Array.isArray(saved.employees) || !saved.attendance || typeof saved.attendance !== 'object') {
    return emptyData();
  }
  const employees = saved.employees
    .filter(employee => employee && typeof employee.id === 'string' && typeof employee.name === 'string')
    .map(employee => ({ id: employee.id, name: employee.name.trim(), legacyLoan: Math.max(0, Number(employee.loan) || 0) }));
  const loans = Array.isArray(saved.loans) ? saved.loans
    .filter(loan => loan && typeof loan.id === 'string' && typeof loan.employeeId === 'string')
    .map(loan => ({
      id: loan.id,
      employeeId: loan.employeeId,
      amount: Math.max(0, Number(loan.amount) || 0),
      date: typeof loan.date === 'string' ? loan.date : localDateString(),
      note: typeof loan.note === 'string' ? loan.note : '',
      payments: Array.isArray(loan.payments) ? loan.payments
        .filter(payment => payment && Number(payment.amount) > 0)
        .map(payment => ({ amount: Number(payment.amount), date: typeof payment.date === 'string' ? payment.date : localDateString() })) : []
    }))
    : employees.filter(employee => employee.legacyLoan > 0).map(employee => ({
      id: `legacy-${employee.id}`,
      employeeId: employee.id,
      amount: employee.legacyLoan,
      date: localDateString(),
      note: 'Saldo pinjaman sebelumnya',
      payments: []
    }));
  return {
    employees: employees.map(({ id, name }) => ({ id, name })),
    attendance: saved.attendance,
    loans
  };
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeData(saved);
  } catch (error) {
    console.error('Data absensi tidak dapat dibaca.', error);
    return emptyData();
  }
}

let data = loadData();
let reports = [];

function loadLocalReports() {
  try {
    const saved = JSON.parse(localStorage.getItem('ruang-hadir-reports-v1'));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.error('Laporan lokal tidak dapat dibaca.', error);
    return [];
  }
}

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    }

async function saveData() {
  try {
    if (cloudEnabled) {
      if (!currentUser) throw new Error('Silakan masuk terlebih dahulu untuk menyimpan data.');
      await saveLedger(data, currentUser.id);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    return true;
  } catch (error) {
    console.error('Data gagal disimpan.', error);
    showToast(`Data gagal disimpan: ${error.message}`);
    return false;
  }
}

async function updateData(change) {
  if (dataWriteInProgress) {
    showToast('Penyimpanan data sebelumnya masih berlangsung.');
    return false;
  }
  dataWriteInProgress = true;
  const previous = JSON.stringify(data);
  try {
    change();
    if (!await saveData()) {
      data = JSON.parse(previous);
      render();
      return false;
    }
    render();
    return true;
  } finally {
    dataWriteInProgress = false;
  }
}

    function rupiah(value) {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }

    function initials(name) {
      return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
    }

    function loanPaid(loan) {
      return loan.payments.reduce((total, payment) => total + payment.amount, 0);
    }

    function loanBalance(loan) {
      return Math.max(0, loan.amount - loanPaid(loan));
    }

    function employeeBalance(employeeId) {
      return data.loans
        .filter(loan => loan.employeeId === employeeId)
        .reduce((total, loan) => total + loanBalance(loan), 0);
    }

    function lastBusinessDays(count) {
      const days = [];
      const cursor = new Date();
      cursor.setHours(12, 0, 0, 0);
      while (days.length < count) {
        if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days.push(localDateString(cursor));
        cursor.setDate(cursor.getDate() - 1);
      }
      return days;
    }

    function render() {
      renderAttendance();
      renderHistory();
      renderOwner();
      renderLoans();
      renderReports();
      document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date());
    }

    function renderReports() {
      reportsRows.innerHTML = '';
      if (!reports.length) {
        reportsRows.innerHTML = '<tr><td class="empty" colspan="6">Belum ada laporan pembukuan tersimpan.</td></tr>';
        return;
      }
      for (const report of reports) {
        const row = document.createElement('tr');
        const reportDate = report.report_date || report.reportDate || report.created_at?.slice(0, 10) || '';
        row.innerHTML = `<td>${escapeHtml(reportDate)}</td><td>${escapeHtml(report.title)}</td><td>${Number(report.employee_count ?? report.employeeCount) || 0}</td><td class="money">${rupiah(report.total_loan_amount ?? report.totalLoanAmount)}</td><td class="money">${rupiah(report.total_repaid ?? report.totalRepaid)}</td><td class="money">${rupiah(report.total_outstanding ?? report.totalOutstanding)}</td>`;
        reportsRows.append(row);
      }
    }

    function createReportSnapshot() {
      const totalLoanAmount = data.loans.reduce((total, loan) => total + loan.amount, 0);
      const totalRepaid = data.loans.reduce((total, loan) => total + loanPaid(loan), 0);
      return {
        reportDate: localDateString(),
        title: `Pembukuan ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date())}`,
        employeeCount: data.employees.length,
        totalLoanAmount,
        totalRepaid,
        totalOutstanding: data.loans.reduce((total, loan) => total + loanBalance(loan), 0),
        snapshot: {
          employees: data.employees,
          attendance: data.attendance,
          loans: data.loans
        }
      };
    }

    async function handleSaveReport() {
      if (!ownerAuthenticated) {
        openOwnerAccess('loans');
        return;
      }
      const report = createReportSnapshot();
      const previousReports = reports;
      try {
        if (cloudEnabled) {
          reports.unshift(await saveReport(report, currentUser.id));
        } else {
          const localReport = { ...report, id: makeId('report'), created_at: new Date().toISOString() };
          reports = [localReport, ...reports];
          localStorage.setItem('ruang-hadir-reports-v1', JSON.stringify(reports));
        }
        renderReports();
        showToast('Laporan pembukuan tersimpan.');
      } catch (error) {
        reports = previousReports;
        renderReports();
        console.error('Laporan pembukuan gagal disimpan.', error);
        showToast(`Laporan gagal disimpan: ${error.message}`);
      }
    }

    function updateStorageCaption() {
      document.getElementById('storageMode').textContent = cloudEnabled
        ? 'Data disimpan di Supabase'
        : 'Data tersimpan di perangkat ini';
      document.getElementById('storageCaption').textContent = cloudEnabled
        ? currentUser?.email || 'Masuk untuk mengakses data usaha.'
        : 'Mode lokal: data tidak tersinkron antarperangkat.';
      document.getElementById('signOut').hidden = !ownerAuthenticated;
    }

    function renderAttendance() {
      const day = dateInput.value || localDateString();
      const present = data.employees.filter(employee => Boolean(data.attendance[day]?.[employee.id])).length;
      document.getElementById('totalCount').textContent = data.employees.length;
      document.getElementById('presentCount').textContent = present;
      document.getElementById('attendanceRate').textContent = `${data.employees.length ? Math.round(present / data.employees.length * 100) : 0}% dari karyawan`;
      attendanceRows.innerHTML = '';
      if (!data.employees.length) {
        attendanceRows.innerHTML = '<tr><td class="empty" colspan="3">Belum ada karyawan. Buka Halaman Owner untuk menambahkan data.</td></tr>';
        return;
      }
      for (const employee of data.employees) {
        const isPresent = Boolean(data.attendance[day]?.[employee.id]);
        const row = document.createElement('tr');
        row.innerHTML = `<td><div class="person"><span class="avatar">${escapeHtml(initials(employee.name))}</span><div><div class="person-name">${escapeHtml(employee.name)}</div><div class="person-sub">Karyawan</div></div></div></td><td class="money">${rupiah(employeeBalance(employee.id))}</td><td><label class="presence"><input type="checkbox" data-attendance-id="${escapeHtml(employee.id)}" ${isPresent ? 'checked' : ''}><span>${isPresent ? 'Hadir' : 'Belum hadir'}</span></label></td>`;
        attendanceRows.append(row);
      }
    }

    function renderHistory() {
      const days = lastBusinessDays(15);
      historyHead.innerHTML = `<tr><th>Nama karyawan</th>${days.map(day => {
        const date = new Date(`${day}T12:00:00`);
        return `<th title="${new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(date)}">${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date)}</th>`;
      }).join('')}</tr>`;
      historyRows.innerHTML = '';
      if (!data.employees.length) {
        historyRows.innerHTML = '<tr><td class="empty" colspan="16">Belum ada data karyawan.</td></tr>';
        return;
      }
      for (const employee of data.employees) {
        const statuses = days.map(day => {
          const attendance = data.attendance[day];
          const recorded = attendance && Object.prototype.hasOwnProperty.call(attendance, employee.id);
          const status = !recorded ? 'unrecorded' : attendance[employee.id] ? 'present' : 'absent';
          const label = status === 'present' ? 'H' : status === 'absent' ? 'T' : '·';
          const description = status === 'present' ? 'Hadir' : status === 'absent' ? 'Tidak hadir' : 'Belum dicatat';
          return `<td><span class="history-status ${status}" title="${description}">${label}</span></td>`;
        }).join('');
        const row = document.createElement('tr');
        row.innerHTML = `<td><div class="person"><span class="avatar">${escapeHtml(initials(employee.name))}</span><div class="person-name">${escapeHtml(employee.name)}</div></div></td>${statuses}`;
        historyRows.append(row);
      }
    }

    function setHistoryRefreshStatus(message) {
      document.getElementById('historyRefreshStatus').textContent = message;
    }

    async function refreshHistoryData() {
      if (historyRefreshInProgress || dataWriteInProgress || !document.getElementById('historyPage').classList.contains('active') || document.hidden) return;
      historyRefreshInProgress = true;
      setHistoryRefreshStatus('Memperbarui riwayat...');
      try {
        const latestData = cloudEnabled
          ? currentUser ? normalizeData(await loadLedger()) : data
          : loadData();
        data = latestData;
        renderHistory();
        const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
        setHistoryRefreshStatus(`Pembaruan otomatis setiap 30 detik · Terakhir diperbarui ${time}`);
      } catch (error) {
        console.error('Riwayat absensi gagal diperbarui.', error);
        setHistoryRefreshStatus(`Gagal memperbarui riwayat: ${error.message}`);
      } finally {
        historyRefreshInProgress = false;
      }
    }

    function renderOwner() {
      ownerRows.innerHTML = '';
      document.getElementById('ownerCaption').textContent = `${data.employees.length} karyawan terdaftar`;
      if (!data.employees.length) {
        ownerRows.innerHTML = '<tr><td class="empty" colspan="3">Belum ada data karyawan.</td></tr>';
        return;
      }
      for (const employee of data.employees) {
        const row = document.createElement('tr');
        row.innerHTML = `<td><div class="person"><span class="avatar">${escapeHtml(initials(employee.name))}</span><div class="person-name">${escapeHtml(employee.name)}</div></div></td><td class="money">${rupiah(employeeBalance(employee.id))}</td><td><div class="owner-actions"><button class="button secondary small" data-edit-id="${escapeHtml(employee.id)}">Edit</button><button class="button danger small" data-delete-id="${escapeHtml(employee.id)}" aria-label="Hapus ${escapeHtml(employee.name)}">Hapus</button></div></td>`;
        ownerRows.append(row);
      }
    }

    function renderLoans() {
      const outstanding = data.loans.reduce((total, loan) => total + loanBalance(loan), 0);
      document.getElementById('loanOutstanding').textContent = rupiah(outstanding);
      document.getElementById('activeLoanCount').textContent = data.loans.filter(loan => loanBalance(loan) > 0).length;
      loanRows.innerHTML = '';
      if (!data.loans.length) {
        loanRows.innerHTML = '<tr><td class="empty" colspan="6">Belum ada catatan pinjaman.</td></tr>';
        return;
      }
      const employeeNames = new Map(data.employees.map(employee => [employee.id, employee.name]));
      for (const loan of [...data.loans].sort((a, b) => b.date.localeCompare(a.date))) {
        const balance = loanBalance(loan);
        const row = document.createElement('tr');
        row.innerHTML = `<td><div class="person"><div><div class="person-name">${escapeHtml(employeeNames.get(loan.employeeId) || 'Karyawan tidak ditemukan')}</div>${loan.note ? `<div class="person-sub">${escapeHtml(loan.note)}</div>` : ''}</div></div></td><td>${escapeHtml(loan.date)}</td><td class="money">${rupiah(loan.amount)}</td><td class="money">${rupiah(loanPaid(loan))}</td><td class="money">${rupiah(balance)}</td><td>${balance > 0 ? `<button class="button secondary small" data-repay-id="${escapeHtml(loan.id)}">Bayar</button>` : '<span class="person-sub">Lunas</span>'}</td>`;
        loanRows.append(row);
      }
    }

    function showPage(pageName) {
      const pages = ['attendance', 'history', 'loans', 'owner'];
      if (!pages.includes(pageName)) return;
      document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.page === pageName));
      for (const page of pages) {
        document.getElementById(`${page}Page`).classList.toggle('active', page === pageName);
      }
      document.getElementById('crumbTitle').textContent = ({
        attendance: 'Absensi',
        history: 'Riwayat 15 Hari',
        loans: 'Pinjaman',
        owner: 'Halaman Owner'
      })[pageName];
      if (pageName === 'history') {
        refreshHistoryData();
      } else {
        renderAttendance();
        renderOwner();
        renderLoans();
      }
    }

    function loadOwnerCredentials() {
      try {
        const saved = JSON.parse(localStorage.getItem(OWNER_PASSWORD_KEY));
        return saved?.salt && saved?.hash ? saved : null;
      } catch (error) {
        console.error('Data akses Owner tidak dapat dibaca.', error);
        return null;
      }
    }

    function bytesToHex(bytes) {
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function hashOwnerPassword(password, saltHex) {
      if (!globalThis.crypto?.subtle) throw new Error('Web Crypto tidak tersedia.');
      const salt = Uint8Array.from(saltHex.match(/.{2}/g), byte => parseInt(byte, 16));
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256);
      return bytesToHex(new Uint8Array(bits));
    }

    function openOwnerAccess(destination) {
      ownerAccessDestination = destination;
      ownerSetupMode = !cloudEnabled && !loadOwnerCredentials();
      document.getElementById('ownerAccessTitle').textContent = ownerSetupMode ? 'Buat kata sandi Owner' : 'Masuk ke Ruang Hadir';
      document.getElementById('ownerAccessDescription').textContent = cloudEnabled
        ? 'Gunakan email dan kata sandi akun Supabase yang dibuat oleh Owner.'
        : ownerSetupMode
          ? 'Buat kata sandi minimal 8 karakter untuk mode lokal pada perangkat ini.'
          : 'Masukkan kata sandi Owner untuk melanjutkan.';
      document.getElementById('ownerEmailField').hidden = !cloudEnabled;
      document.getElementById('ownerEmail').required = cloudEnabled;
      document.getElementById('ownerConfirmField').hidden = !ownerSetupMode;
      document.getElementById('ownerPasswordConfirm').required = ownerSetupMode;
      document.getElementById('ownerPassword').autocomplete = ownerSetupMode ? 'new-password' : 'current-password';
      document.getElementById('ownerAccessSubmit').textContent = ownerSetupMode ? 'Simpan kata sandi' : 'Masuk';
      document.getElementById('ownerAccessFeedback').textContent = '';
      ownerAccessForm.reset();
      ownerAccessModal.classList.add('open');
      document.getElementById('ownerPassword').focus();
    }

    function openEmployeeModal(employee = null) {
      editingId = employee?.id ?? null;
      document.getElementById('modalTitle').textContent = employee ? 'Edit karyawan' : 'Tambah karyawan';
      document.getElementById('employeeName').value = employee?.name ?? '';
      employeeModal.classList.add('open');
      document.getElementById('employeeName').focus();
    }

    function closeModal(element, formElement) {
      element.classList.remove('open');
      formElement.reset();
    }

    function openLoanModal() {
      if (!data.employees.length) {
        showToast('Tambahkan karyawan terlebih dahulu.');
        showPage('owner');
        return;
      }
      const select = document.getElementById('loanEmployee');
      select.innerHTML = data.employees.map(employee => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)}</option>`).join('');
      document.getElementById('loanDate').value = localDateString();
      document.getElementById('loanAmount').value = '';
      document.getElementById('loanNote').value = '';
      loanModal.classList.add('open');
      select.focus();
    }

    function openRepaymentModal(loan) {
      repaymentLoanId = loan.id;
      document.getElementById('repaymentDescription').textContent = `Sisa pinjaman ${rupiah(loanBalance(loan))}.`;
      document.getElementById('repaymentAmount').max = loanBalance(loan);
      document.getElementById('repaymentAmount').value = '';
      document.getElementById('repaymentDate').value = localDateString();
      repaymentModal.classList.add('open');
      document.getElementById('repaymentAmount').focus();
    }

    document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => {
      const page = button.dataset.page;
      if ((cloudEnabled && !ownerAuthenticated) || ((page === 'owner' || page === 'loans') && !ownerAuthenticated)) {
        openOwnerAccess(page);
        return;
      }
      showPage(page);
    }));

    document.getElementById('cancelOwnerAccess').addEventListener('click', () => ownerAccessModal.classList.remove('open'));
    ownerAccessForm.addEventListener('submit', async event => {
      event.preventDefault();
      const password = document.getElementById('ownerPassword').value;
      const feedback = document.getElementById('ownerAccessFeedback');
      try {
        if (cloudEnabled) {
          const session = await signIn(document.getElementById('ownerEmail').value.trim(), password);
          currentUser = session.user;
          data = normalizeData(await loadLedger());
          reports = await loadReports();
        } else {
          if (ownerSetupMode) {
            if (password !== document.getElementById('ownerPasswordConfirm').value) {
              feedback.textContent = 'Kata sandi belum sama.';
              return;
            }
            const saltHex = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
            const hash = await hashOwnerPassword(password, saltHex);
            localStorage.setItem(OWNER_PASSWORD_KEY, JSON.stringify({ salt: saltHex, hash }));
          } else {
            const credentials = loadOwnerCredentials();
            if (!credentials || await hashOwnerPassword(password, credentials.salt) !== credentials.hash) {
              feedback.textContent = 'Kata sandi tidak sesuai.';
              return;
            }
          }
        }
        ownerAuthenticated = true;
        ownerAccessModal.classList.remove('open');
        updateStorageCaption();
        render();
        showPage(ownerAccessDestination);
      } catch (error) {
        currentUser = null;
        ownerAuthenticated = false;
        console.error('Autentikasi Owner gagal.', error);
        feedback.textContent = cloudEnabled
          ? `Tidak dapat masuk atau memuat data: ${error.message}`
          : 'Akses Owner tidak dapat diproses di browser ini. Buka melalui localhost atau browser modern.';
      }
    });

    dateInput.value = localDateString();
    dateInput.addEventListener('change', renderAttendance);
    attendanceRows.addEventListener('change', async event => {
      const employeeId = event.target.dataset.attendanceId;
      if (!employeeId || !data.employees.some(employee => employee.id === employeeId)) return;
      const day = dateInput.value;
      const saved = await updateData(() => {
        data.attendance[day] ??= {};
        data.attendance[day][employeeId] = event.target.checked;
      });
      if (saved) showToast(event.target.checked ? 'Kehadiran dicatat.' : 'Status hadir dibatalkan.');
    });

    document.getElementById('addEmployee').addEventListener('click', () => {
      if (ownerAuthenticated) openEmployeeModal();
    });
    document.getElementById('closeModal').addEventListener('click', () => closeModal(employeeModal, employeeForm));
    document.getElementById('cancelModal').addEventListener('click', () => closeModal(employeeModal, employeeForm));
    employeeModal.addEventListener('click', event => {
      if (event.target === employeeModal) closeModal(employeeModal, employeeForm);
    });
    employeeForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!ownerAuthenticated) return;
      const name = document.getElementById('employeeName').value.trim();
      if (!name) return;
      const existing = data.employees.some(employee => employee.id === editingId);
      const saved = await updateData(() => {
        if (existing) {
          const employee = data.employees.find(item => item.id === editingId);
          employee.name = name;
        } else {
          data.employees.push({ id: makeId('employee'), name });
        }
      });
      if (saved) {
        closeModal(employeeModal, employeeForm);
        editingId = null;
        showToast(existing ? 'Data karyawan diperbarui.' : 'Karyawan ditambahkan.');
      }
    });

    ownerRows.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || !ownerAuthenticated) return;
      const editId = button.dataset.editId;
      const deleteId = button.dataset.deleteId;
      if (editId) {
        const employee = data.employees.find(item => item.id === editId);
        if (employee) openEmployeeModal(employee);
      } else if (deleteId) {
        const employee = data.employees.find(item => item.id === deleteId);
        if (!employee || !confirm(`Hapus data ${employee.name} beserta riwayat absensi dan pinjamannya?`)) return;
        const saved = await updateData(() => {
          data.employees = data.employees.filter(item => item.id !== deleteId);
          data.loans = data.loans.filter(loan => loan.employeeId !== deleteId);
          for (const day of Object.keys(data.attendance)) delete data.attendance[day][deleteId];
        });
        if (saved) showToast('Data karyawan dan riwayat terkait dihapus.');
      }
    });

    document.getElementById('addLoan').addEventListener('click', () => {
      if (!ownerAuthenticated) {
        openOwnerAccess('loans');
        return;
      }
      openLoanModal();
    });
    document.getElementById('saveReport').addEventListener('click', handleSaveReport);
    document.getElementById('closeLoanModal').addEventListener('click', () => closeModal(loanModal, loanForm));
    document.getElementById('cancelLoanModal').addEventListener('click', () => closeModal(loanModal, loanForm));
    loanModal.addEventListener('click', event => {
      if (event.target === loanModal) closeModal(loanModal, loanForm);
    });
    loanForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!ownerAuthenticated) return;
      const employeeId = document.getElementById('loanEmployee').value;
      const amount = Number(document.getElementById('loanAmount').value);
      const date = document.getElementById('loanDate').value;
      const note = document.getElementById('loanNote').value.trim();
      if (!data.employees.some(employee => employee.id === employeeId) || !Number.isSafeInteger(amount) || amount <= 0 || !date) {
        showToast('Periksa kembali data pinjaman.');
        return;
      }
      const saved = await updateData(() => data.loans.push({
        id: makeId('loan'),
        employeeId,
        amount,
        date,
        note,
        payments: []
      }));
      if (saved) {
        closeModal(loanModal, loanForm);
        showToast('Pinjaman berhasil dicatat.');
      }
    });

    loanRows.addEventListener('click', event => {
      const button = event.target.closest('[data-repay-id]');
      if (!button || !ownerAuthenticated) return;
      const loan = data.loans.find(item => item.id === button.dataset.repayId);
      if (loan && loanBalance(loan) > 0) openRepaymentModal(loan);
    });
    document.getElementById('closeRepaymentModal').addEventListener('click', () => closeModal(repaymentModal, repaymentForm));
    document.getElementById('cancelRepaymentModal').addEventListener('click', () => closeModal(repaymentModal, repaymentForm));
    repaymentModal.addEventListener('click', event => {
      if (event.target === repaymentModal) closeModal(repaymentModal, repaymentForm);
    });
    repaymentForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!ownerAuthenticated) return;
      const amount = Number(document.getElementById('repaymentAmount').value);
      const date = document.getElementById('repaymentDate').value;
      const loan = data.loans.find(item => item.id === repaymentLoanId);
      if (!loan || !Number.isSafeInteger(amount) || amount <= 0 || amount > loanBalance(loan) || !date) {
        showToast('Jumlah pembayaran melebihi sisa pinjaman atau data belum lengkap.');
        return;
      }
      const saved = await updateData(() => {
        const target = data.loans.find(item => item.id === repaymentLoanId);
        target.payments.push({ amount, date });
      });
      if (saved) {
        closeModal(repaymentModal, repaymentForm);
        repaymentLoanId = null;
        showToast('Pembayaran berhasil dicatat.');
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (employeeModal.classList.contains('open')) closeModal(employeeModal, employeeForm);
      if (loanModal.classList.contains('open')) closeModal(loanModal, loanForm);
      if (repaymentModal.classList.contains('open')) closeModal(repaymentModal, repaymentForm);
      if (ownerAccessModal.classList.contains('open')) ownerAccessModal.classList.remove('open');
    });

    document.getElementById('signOut').addEventListener('click', async () => {
      if (!ownerAuthenticated) return;
      try {
        await signOut();
        currentUser = null;
        ownerAuthenticated = false;
        closeModal(employeeModal, employeeForm);
        closeModal(loanModal, loanForm);
        closeModal(repaymentModal, repaymentForm);
        if (cloudEnabled) {
          data = emptyData();
          reports = [];
        }
        updateStorageCaption();
        render();
        showPage('attendance');
        if (cloudEnabled) {
          openOwnerAccess('attendance');
        } else {
          showToast('Anda telah keluar dari Halaman Owner.');
        }
      } catch (error) {
        console.error('Keluar dari akun gagal.', error);
        showToast(`Tidak dapat keluar: ${error.message}`);
      }
    });

    document.getElementById('refreshHistory').addEventListener('click', refreshHistoryData);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && document.getElementById('historyPage').classList.contains('active')) {
        refreshHistoryData();
      }
    });

    async function initializeApp() {
      dateInput.value = localDateString();
      if (cloudEnabled) {
        data = emptyData();
        reports = [];
      }
      updateStorageCaption();
      render();
      if (historyRefreshTimer !== null) clearInterval(historyRefreshTimer);
      historyRefreshTimer = setInterval(refreshHistoryData, 30_000);
      if (!cloudEnabled) {
        reports = loadLocalReports();
        renderReports();
        return;
      }
      try {
        const session = await getCurrentSession();
        if (!session) {
          openOwnerAccess('attendance');
          return;
        }
        currentUser = session.user;
        const [ledger, savedReports] = await Promise.all([loadLedger(), loadReports()]);
        data = normalizeData(ledger);
        reports = savedReports;
        ownerAuthenticated = true;
        updateStorageCaption();
        render();
      } catch (error) {
        console.error('Data Supabase gagal dimuat.', error);
        showToast(`Data gagal dimuat dari Supabase: ${error.message}`);
        openOwnerAccess('attendance');
        document.getElementById('ownerAccessFeedback').textContent = 'Koneksi/database belum siap. Periksa konfigurasi dan jalankan supabase/schema.sql.';
      }
    }

    initializeApp();

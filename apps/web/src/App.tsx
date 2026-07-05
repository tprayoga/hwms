import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, 
  Users, 
  CheckSquare, 
  FileCheck2, 
  BarChart3, 
  Settings, 
  Calendar, 
  User as UserIcon, 
  LogOut, 
  Bell, 
  MapPin, 
  AlertCircle, 
  Loader2, 
  Search, 
  Clock, 
  PlusCircle, 
  CheckCircle2, 
  ShieldAlert, 
  Download,
  Upload,
  Edit2,
  Trash2,
  X,
  FileSpreadsheet,
  Layers,
  ChevronRight,
  Filter,
  RefreshCw,
  Camera,
  Wifi,
  WifiOff,
  AlertTriangle
} from 'lucide-react';

// API Base URL. In production the nginx image is built with VITE_API_URL=/api/v1
// and proxies /api to the API service (same-origin, no CORS). Dev falls back to
// the local API server.
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';

const TaskStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  BLOCKED: 'BLOCKED',
  DEFERRED: 'DEFERRED',
  CANCELLED: 'CANCELLED'
};

// Audited selfie thumbnail (§7, §9 — UU PDP). Uses the presigned-URL endpoint
// GET /objects/selfie/:attendanceId — bytes stream directly from MinIO via a
// short-lived signed URL. Own selfies load immediately; viewing another
// employee's selfie requires a reason (min 10 chars) that the API records to
// audit_logs, so those load only after an explicit request.
const SELFIE_REASON_MIN = 10;
function SelfieThumb({ attendanceId, hasSelfie, isOwn, token, alt }: {
  attendanceId: string | null;
  hasSelfie: boolean;
  isOwn: boolean;
  token: string | null;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = async (reason?: string) => {
    if (!attendanceId || !token) return;
    setLoading(true);
    setError(false);
    try {
      const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
      const res = await fetch(`${API_URL}/objects/selfie/${attendanceId}${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      setUrl(data.url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwn && attendanceId && hasSelfie) load();
    return () => setUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceId, isOwn, hasSelfie]);

  const requestOthers = () => {
    const reason = window.prompt(
      `Alasan melihat selfie karyawan ini (wajib, min ${SELFIE_REASON_MIN} karakter, tercatat di audit):`,
    );
    if (reason === null) return;
    if (reason.trim().length >= SELFIE_REASON_MIN) {
      load(reason.trim());
    } else {
      window.alert(`Alasan minimal ${SELFIE_REASON_MIN} karakter.`);
    }
  };

  const boxClass = 'h-16 w-16 object-cover rounded-lg border border-slate-800 shrink-0';

  if (!attendanceId || !hasSelfie) {
    return (
      <div className={`${boxClass} bg-slate-900 flex items-center justify-center`}>
        <Camera className="h-5 w-5 text-slate-500" />
      </div>
    );
  }
  if (url) {
    return <img src={url} alt={alt} className={boxClass} />;
  }
  if (loading) {
    return (
      <div className={`${boxClass} bg-slate-900 flex items-center justify-center`}>
        <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
      </div>
    );
  }
  if (isOwn || error) {
    return (
      <button type="button" onClick={() => load()} className={`${boxClass} bg-slate-900 flex flex-col items-center justify-center gap-0.5 hover:bg-slate-850`}>
        <Camera className="h-4 w-4 text-slate-500" />
        <span className="text-[7px] text-slate-500">{error ? 'Coba lagi' : 'Muat'}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={requestOthers}
      title="Melihat selfie karyawan lain tercatat di audit (UU PDP)"
      className={`${boxClass} bg-slate-900 flex flex-col items-center justify-center gap-0.5 hover:bg-slate-850`}
    >
      <ShieldAlert className="h-4 w-4 text-amber-400" />
      <span className="text-[7px] text-slate-400 leading-tight text-center px-0.5">Lihat selfie</span>
    </button>
  );
}

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  nik: string;
  roles: string[];
  timezone: string;
  checkinMode: string;
  department?: { id: string; name: string } | null;
  functionalRole?: { id: string; name: string; code: string } | null;
}

// =============================================================
// INDEXEDDB OFFLINE QUEUE UTILITY
// =============================================================
class OfflineDB {
  static open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('hwms_db', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'idempotencyKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async add(item: any): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  static async getAll(): Promise<any[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readonly');
      const store = tx.objectStore('queue');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async delete(key: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  
  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Routing / View State (Mobile defaults to hari_ini, Desktop to dashboard)
  const [activeTab, setActiveTab] = useState<string>(window.innerWidth < 768 ? 'hari_ini' : 'hari_ini');
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);

  // Connection status & offline queue
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [syncingOffline, setSyncingOffline] = useState<boolean>(false);

  // Admin Sub-tabs State
  const [adminSubTab, setAdminSubTab] = useState<string>('users');

  // Master Data Lists State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [holidaysList, setHolidaysList] = useState<any[]>([]);
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [teamsList, setTeamsList] = useState<any[]>([]);
  const [rolesList, setRolesList] = useState<any[]>([]);
  
  // Projects, Sprints, Tasks States
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [sprintsList, setSprintsList] = useState<any[]>([]);
  const [tasksList, setTasksList] = useState<any[]>([]);
  const [sprintAggregations, setSprintAggregations] = useState<Record<string, any>>({});

  // Today Attendance Status States
  const [todayData, setTodayData] = useState<any>(null);
  const [fetchingToday, setFetchingToday] = useState<boolean>(false);

  // Camera State
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Checkin Form State
  const [checkinWorkStatus, setCheckinWorkStatus] = useState<string>('WFO');
  const [checkinClientProjectId, setCheckinClientProjectId] = useState<string>('');
  const [checkinSelectedTaskIds, setCheckinSelectedTaskIds] = useState<Record<string, boolean>>({});
  const [checkinTaskNotes, setCheckinTaskNotes] = useState<Record<string, string>>({});
  const [checkinDailyNote, setCheckinDailyNote] = useState<string>('');
  
  // Blocker Form State
  const [hasBlocker, setHasBlocker] = useState<boolean>(false);
  const [blockerTaskId, setBlockerTaskId] = useState<string>('');
  const [blockerDescription, setBlockerDescription] = useState<string>('');
  const [blockerMentions, setBlockerMentions] = useState<string[]>([]);

  // Checkout Form State
  const [checkoutTaskPercents, setCheckoutTaskPercents] = useState<Record<string, number>>({});
  const [checkoutTaskStatuses, setCheckoutTaskStatuses] = useState<Record<string, string>>({});
  const [checkoutTaskEvidences, setCheckoutTaskEvidences] = useState<Record<string, string>>({});
  const [checkoutDailyNote, setCheckoutDailyNote] = useState<string>('');

  // My Tasks Filter State
  const [myTasksFilterSprint, setMyTasksFilterSprint] = useState<string>('');
  const [myTasksFilterStatus, setMyTasksFilterStatus] = useState<string>('');
  const [myTasksFilterPriority, setMyTasksFilterPriority] = useState<string>('');

  // Feed States
  const [feedData, setFeedData] = useState<any>(null);
  const [feedDate, setFeedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [feedTeamFilter, setFeedTeamFilter] = useState<string>('');
  const [fetchingFeed, setFetchingFeed] = useState<boolean>(false);

  // Leave States
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [approvalsInbox, setApprovalsInbox] = useState<any[]>([]);
  const [leaveSubTab, setLeaveSubTab] = useState<'my' | 'approvals'>('my');
  const [leaveFormOpen, setLeaveFormOpen] = useState<boolean>(false);
  const [submittingLeave, setSubmittingLeave] = useState<boolean>(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'CUTI', dateFromStr: '', dateToStr: '', reason: '' });
  const [leaveAttachment, setLeaveAttachment] = useState<File | null>(null);
  const leaveAttachmentInputRef = useRef<HTMLInputElement>(null);

  // Dashboard & PWA Onboarding States
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardSubTab, setDashboardSubTab] = useState<'team' | 'program'>('team');
  const [dashboardDateFrom, setDashboardDateFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dashboardDateTo, setDashboardDateTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dashboardTeamFilter, setDashboardTeamFilter] = useState<string>('');
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(false);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [exportDateFrom, setExportDateFrom] = useState<string>('');
  const [exportDateTo, setExportDateTo] = useState<string>('');
  const [submittingExport, setSubmittingExport] = useState<boolean>(false);
  const [fetchingDashboard, setFetchingDashboard] = useState<boolean>(false);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);

  // Dialog / Modal / Drawer States
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<any | null>(null);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<any | null>(null);
  
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const [selectedSprint, setSelectedSprint] = useState<any | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [importType, setImportType] = useState<'users' | 'tasks'>('users');
  const [importSelectedProjectId, setImportSelectedProjectId] = useState<string>('');
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importCommitMessage, setImportCommitMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Forms Input States
  const [userForm, setUserForm] = useState({
    email: '', fullName: '', nik: '', password: '', departmentId: '', functionalRoleId: '',
    managerId: '', systemRoles: ['EMPLOYEE'], timezone: 'Asia/Jakarta', checkinMode: 'TWICE', leaveBalance: 12
  });

  const [locationForm, setLocationForm] = useState({ name: '', type: 'OFFICE', lat: '', lng: '', radiusM: '200' });
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '', isCutiBersama: false });
  const [projectForm, setProjectForm] = useState({ name: '', codePrefix: '', status: 'ACTIVE' });
  const [sprintForm, setSprintForm] = useState({ projectId: '', number: '', startDate: '', endDate: '', goal: '' });
  const [taskForm, setTaskForm] = useState({
    projectId: '', sprintId: '', functionalRoleId: '', workstream: 'General', title: '',
    deliverable: '', priority: 'MEDIUM', plannedStart: '', plannedEnd: '', status: 'NOT_STARTED',
    percentComplete: 0, weight: 1.0, riskLevel: 'LOW', notes: ''
  });

  // Connection events & Offline DB scan
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); syncOfflineQueue(); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check and sync
    checkOfflineQueueCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  // E2E Testing Hook to receive mocked selfie previews
  useEffect(() => {
    const checkMockSelfie = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).selfiePreview) {
        console.log('E2E Hook: Mock selfie detected in window.selfiePreview:', (window as any).selfiePreview.substring(0, 100));
        setSelfiePreview((window as any).selfiePreview);
        delete (window as any).selfiePreview;
      }
    }, 100);
    return () => clearInterval(checkMockSelfie);
  }, []);
  const checkOfflineQueueCount = async () => {
    try {
      const queue = await OfflineDB.getAll();
      setOfflineCount(queue.length);
    } catch (e) {
      console.error(e);
    }
  };

  // Sync offline queue
  const syncOfflineQueue = async () => {
    if (!navigator.onLine) return;
    const queue = await OfflineDB.getAll();
    if (queue.length === 0) return;

    setSyncingOffline(true);
    for (const item of queue) {
      try {
        const formData = new FormData();
        formData.append('workStatus', item.payload.workStatus || '');
        formData.append('clientProjectId', item.payload.clientProjectId || '');
        formData.append('lat', item.payload.lat || '');
        formData.append('lng', item.payload.lng || '');
        formData.append('accuracy', item.payload.accuracy || '');
        formData.append('items', item.payload.items || '');
        formData.append('blocker', item.payload.blocker || '');
        formData.append('dailyNote', item.payload.dailyNote || '');
        formData.append('deviceTimestamp', item.payload.deviceTimestamp || '');
        formData.append('isOfflineSync', 'true');
        formData.append('updates', item.payload.updates || '');
        
        // Convert base64 dataURI back to file Blob
        const resBlob = await fetch(item.payload.selfieBase64);
        const blob = await resBlob.blob();
        formData.append('selfie', blob, 'selfie.jpg');

        let url = `${API_URL}/attendance/checkins`;
        if (item.type === 'OUT') {
          url = `${API_URL}/attendance/checkins/${item.checkinId}/checkout`;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Idempotency-Key': item.idempotencyKey
          },
          body: formData
        });

        if (res.ok || res.status === 400) {
          // Remove from IndexedDB if success or bad request (prevent infinite loop on invalid inputs)
          await OfflineDB.delete(item.idempotencyKey);
        }
      } catch (err) {
        console.error('Failed to sync offline item', err);
        break; // Stop sync on network issues
      }
    }
    setSyncingOffline(false);
    checkOfflineQueueCount();
    fetchTodayStatus();
  };

  // Resize listener
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && ['dashboard', 'tim', 'approval', 'laporan', 'admin'].includes(activeTab)) {
        setActiveTab('hari_ini');
      } else if (!mobile && ['hari_ini', 'feed', 'profil'].includes(activeTab)) {
        setActiveTab('hari_ini');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

  // Load profile and today status
  useEffect(() => {
    if (token) {
      fetchProfile();
      fetchTodayStatus();
    }
  }, [token]);

  // Fetch data when switching views
  useEffect(() => {
    if (token) {
      if (activeTab === 'admin') {
        fetchAdminMasterData();
      } else if (activeTab === 'task') {
        fetchMyTasksViewData();
      } else if (activeTab === 'hari_ini') {
        fetchTodayStatus();
        fetchAdminMasterData(); // Need usersList for blocker mention selection
      } else if (activeTab === 'feed') {
        fetchFeed();
        fetchAdminMasterData(); // Need projectsList & departmentsList for dropdown filters
      } else if (activeTab === 'leave') {
        fetchMyLeaves();
        fetchApprovalsInbox();
      } else if (activeTab === 'dashboard') {
        fetchDashboard();
        fetchAdminMasterData();
      }
    }
  }, [activeTab, adminSubTab, token]);

  useEffect(() => {
    if (token && activeTab === 'dashboard') {
      fetchDashboard();
    }
  }, [dashboardSubTab, dashboardDateFrom, dashboardDateTo, dashboardTeamFilter, token, activeTab]);

  useEffect(() => {
    if (token && user) {
      const onboardingCompleted = localStorage.getItem(`onboarding_done_${user.id}`);
      if (!onboardingCompleted) {
        setOnboardingOpen(true);
      } else {
        setupPushSubscription();
      }
    }
  }, [token, user]);

  useEffect(() => {
    if (token && activeTab === 'leave') {
      if (leaveSubTab === 'my') {
        fetchMyLeaves();
      } else {
        fetchApprovalsInbox();
      }
    }
  }, [leaveSubTab, token, activeTab]);

  const fetchMyLeaves = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/leaves/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setLeaveRequests(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchApprovalsInbox = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/leaves/approvals/inbox`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setApprovalsInbox(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setSubmittingLeave(true);
    try {
      const formData = new FormData();
      formData.append('type', leaveForm.type);
      formData.append('dateFromStr', leaveForm.dateFromStr);
      formData.append('dateToStr', leaveForm.dateToStr);
      formData.append('reason', leaveForm.reason);
      if (leaveAttachment) {
        formData.append('file', leaveAttachment);
      }

      const res = await fetch(`${API_URL}/leaves`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        alert('Pengajuan cuti/izin/sakit berhasil dikirim!');
        setLeaveFormOpen(false);
        setLeaveForm({ type: 'CUTI', dateFromStr: '', dateToStr: '', reason: '' });
        setLeaveAttachment(null);
        fetchMyLeaves();
        fetchProfile(); // reload profile to update leave balance in header
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal mengirim pengajuan cuti');
      }
    } catch (e) {
      alert('Koneksi gagal');
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleDecideLeave = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
    if (!token) return;

    let decisionNote = '';
    if (status === 'REJECTED') {
      const note = prompt('Alasan Penolakan (Wajib):');
      if (note === null) return; // cancel prompt
      if (note.trim() === '') {
        alert('Alasan penolakan wajib diisi!');
        return;
      }
      decisionNote = note;
    } else {
      if (!confirm('Apakah Anda yakin ingin menyetujui pengajuan ini?')) return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/leaves/approvals/${requestId}/decide`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, decisionNote })
      });

      if (res.ok) {
        alert(status === 'APPROVED' ? 'Pengajuan disetujui!' : 'Pengajuan ditolak.');
        fetchApprovalsInbox();
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal menyimpan keputusan');
      }
    } catch (e) {
      alert('Koneksi gagal');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelLeave = async (requestId: string) => {
    if (!token) return;
    if (!confirm('Apakah Anda yakin ingin membatalkan pengajuan ini?')) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/leaves/${requestId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        alert('Pengajuan berhasil dibatalkan.');
        fetchMyLeaves();
        fetchProfile(); // reload balance
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal membatalkan pengajuan');
      }
    } catch (e) {
      alert('Koneksi gagal');
    } finally {
      setLoading(false);
    }
  };

  // The rendered sub-tab can be forced to 'program' for CTO/PM users who are not
  // managers (see renderDashboardView). The fetch MUST target the same sub-tab,
  // otherwise we render the program layout against team-shaped data (which has no
  // `.metrics`) and crash. Keep this logic in sync with `currentSubTab`.
  const effectiveDashboardSubTab = (): 'team' | 'program' => {
    const isManager = user?.roles.includes('MANAGER') || user?.roles.includes('SUPER_ADMIN');
    const isCTOorPM = user?.roles.includes('CTO') || user?.roles.includes('PM_ADMIN') || user?.roles.includes('SUPER_ADMIN');
    return isCTOorPM && !isManager ? 'program' : dashboardSubTab;
  };

  const fetchDashboard = async () => {
    if (!token) return;
    // Clear stale data so we never render a mismatched layout against the
    // previous sub-tab's response shape while the new request is in flight.
    setDashboardData(null);
    setFetchingDashboard(true);
    try {
      let url = '';
      if (effectiveDashboardSubTab() === 'team') {
        url = `${API_URL}/dashboard/team?team=${dashboardTeamFilter}&dateFrom=${dashboardDateFrom}&dateTo=${dashboardDateTo}`;
      } else {
        url = `${API_URL}/dashboard/program`;
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setDashboardData(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e);
    } finally {
      setFetchingDashboard(false);
    }
  };

  const handleTriggerExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setSubmittingExport(true);
    try {
      const res = await fetch(`${API_URL}/reports/attendance/export`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dateFrom: exportDateFrom, dateTo: exportDateTo })
      });

      if (res.ok) {
        alert('Proses ekspor absensi telah dijadwalkan secara asinkron di latar belakang. Anda akan menerima notifikasi di bel notifikasi ketika file siap diunduh.');
        setExportModalOpen(false);
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal memulai ekspor absensi');
      }
    } catch (e) {
      alert('Koneksi gagal');
    } finally {
      setSubmittingExport(false);
    }
  };

  const setupPushSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Web push not supported by this browser');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      
      const keyRes = await fetch(`${API_URL}/push/key`);
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();

      const padding = '='.repeat((4 - publicKey.length % 4) % 4);
      const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray
      });

      await fetch(`${API_URL}/push/subscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscription)
      });

      console.log('Web push subscription registered successfully.');
    } catch (e) {
      console.error('Failed to register push subscription:', e);
    }
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem(`onboarding_done_${user.id}`, 'true');
    setOnboardingOpen(false);
    setupPushSubscription();
  };

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/push/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotificationsList(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);

  useEffect(() => {
    if (token && activeTab === 'feed') {
      fetchFeed();
    }
  }, [feedDate, feedTeamFilter]);

  const fetchFeed = async () => {
    if (!token) return;
    setFetchingFeed(true);
    try {
      const res = await fetch(`${API_URL}/feed?date=${feedDate}&team=${feedTeamFilter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setFeedData(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch feed', e);
    } finally {
      setFetchingFeed(false);
    }
  };

  const handleResolveBlocker = async (blockerId: string) => {
    if (!token) return;
    if (!confirm('Apakah Anda yakin ingin menyelesaikan blocker ini?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/feed/blockers/${blockerId}/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Blocker berhasil diselesaikan!');
        fetchFeed();
      } else {
        const data = await res.json();
        alert(data.message || 'Gagal menyelesaikan blocker');
      }
    } catch (err) {
      alert('Koneksi gagal');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        handleLogout();
      }
    } catch (e) {
      console.error('Failed to fetch profile', e);
      handleLogout();
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayStatus = async () => {
    if (!token) return;
    setFetchingToday(true);
    try {
      const res = await fetch(`${API_URL}/attendance/me/today`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTodayData(data);
        
        // Populate default values
        if (data.todayCheckin && !data.checkout) {
          // Pre-populate checkout task percents & statuses
          const initialPercents: Record<string, number> = {};
          const initialStatuses: Record<string, string> = {};
          const initialEvidences: Record<string, string> = {};
          
          (data.activeSprintTasks || []).forEach((t: any) => {
            initialPercents[t.id] = t.percent_complete;
            initialStatuses[t.id] = t.status;
            initialEvidences[t.id] = '';
          });
          (data.carryOverTasks || []).forEach((t: any) => {
            initialPercents[t.id] = t.percent_complete;
            initialStatuses[t.id] = t.status;
            initialEvidences[t.id] = '';
          });

          setCheckoutTaskPercents(initialPercents);
          setCheckoutTaskStatuses(initialStatuses);
          setCheckoutTaskEvidences(initialEvidences);
        } else {
          // Pre-check carry-over tasks
          const initialChecks: Record<string, boolean> = {};
          (data.carryOverTasks || []).forEach((t: any) => {
            initialChecks[t.id] = true; // carry over pre-checked
          });
          setCheckinSelectedTaskIds(initialChecks);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingToday(false);
    }
  };

  const fetchAdminMasterData = async () => {
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      if (adminSubTab === 'users' || activeTab === 'hari_ini') {
        const [uRes, dRes, rRes, pRes] = await Promise.all([
          fetch(`${API_URL}/admin/users`, { headers }),
          fetch(`${API_URL}/admin/departments`, { headers }),
          fetch(`${API_URL}/admin/functional-roles`, { headers }),
          fetch(`${API_URL}/tasks/projects`, { headers })
        ]);
        if (uRes.ok) setUsersList(await uRes.json());
        if (dRes.ok) setDepartmentsList(await dRes.json());
        if (rRes.ok) setRolesList(await rRes.json());
        if (pRes.ok) setProjectsList(await pRes.json());
      } else if (adminSubTab === 'locations') {
        const res = await fetch(`${API_URL}/admin/locations`, { headers });
        if (res.ok) setLocationsList(await res.json());
      } else if (adminSubTab === 'holidays') {
        const res = await fetch(`${API_URL}/admin/holidays`, { headers });
        if (res.ok) setHolidaysList(await res.json());
      } else if (adminSubTab === 'departments') {
        const res = await fetch(`${API_URL}/admin/departments`, { headers });
        if (res.ok) setDepartmentsList(await res.json());
      } else if (adminSubTab === 'teams') {
        const res = await fetch(`${API_URL}/admin/teams`, { headers });
        if (res.ok) setTeamsList(await res.json());
      } else if (adminSubTab === 'roles') {
        const res = await fetch(`${API_URL}/admin/functional-roles`, { headers });
        if (res.ok) setRolesList(await res.json());
      } else if (adminSubTab === 'projects') {
        const [pRes, sRes] = await Promise.all([
          fetch(`${API_URL}/tasks/projects`, { headers }),
          fetch(`${API_URL}/tasks/sprints`, { headers })
        ]);
        if (pRes.ok) setProjectsList(await pRes.json());
        if (sRes.ok) {
          const sprintsData = await sRes.json();
          setSprintsList(sprintsData);
          sprintsData.forEach((s: any) => fetchSprintAggregation(s.id));
        }
      } else if (adminSubTab === 'tasks') {
        const [tRes, pRes, sRes, rRes] = await Promise.all([
          fetch(`${API_URL}/tasks`, { headers }),
          fetch(`${API_URL}/tasks/projects`, { headers }),
          fetch(`${API_URL}/tasks/sprints`, { headers }),
          fetch(`${API_URL}/admin/functional-roles`, { headers })
        ]);
        if (tRes.ok) setTasksList(await tRes.json());
        if (pRes.ok) setProjectsList(await pRes.json());
        if (sRes.ok) setSprintsList(await sRes.json());
        if (rRes.ok) setRolesList(await rRes.json());
      }
    } catch (e) {
      console.error('Failed to fetch master data', e);
    }
  };

  const fetchSprintAggregation = async (sprintId: string) => {
    try {
      const res = await fetch(`${API_URL}/tasks/aggregation/sprint/${sprintId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const agg = await res.json();
        setSprintAggregations(prev => ({ ...prev, [sprintId]: agg }));
      }
    } catch (err) {
      console.error('Failed to fetch aggregation', err);
    }
  };

  const fetchMyTasksViewData = async () => {
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      const [sRes, pRes] = await Promise.all([
        fetch(`${API_URL}/tasks/sprints`, { headers }),
        fetch(`${API_URL}/tasks/projects`, { headers })
      ]);
      if (sRes.ok) {
        const spr = await sRes.json();
        setSprintsList(spr);
        if (spr.length > 0 && !myTasksFilterSprint) {
          setMyTasksFilterSprint(spr[spr.length - 1].id);
        }
      }
      if (pRes.ok) setProjectsList(await pRes.json());
      fetchFilteredTasks();
    } catch (err) {
      console.error('Failed to fetch tasks data', err);
    }
  };

  const fetchFilteredTasks = async () => {
    let url = `${API_URL}/tasks?1=1`;
    if (myTasksFilterSprint) url += `&sprintId=${myTasksFilterSprint}`;
    if (myTasksFilterStatus) url += `&status=${myTasksFilterStatus}`;
    if (myTasksFilterPriority) url += `&priority=${myTasksFilterPriority}`;

    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setTasksList(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  };

  useEffect(() => {
    if (token && activeTab === 'task') {
      fetchFilteredTasks();
      if (myTasksFilterSprint) {
        fetchSprintAggregation(myTasksFilterSprint);
      }
    }
  }, [myTasksFilterSprint, myTasksFilterStatus, myTasksFilterPriority]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoginLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('access_token', data.accessToken);
        setToken(data.accessToken);
        setUser(data.user);
        setActiveTab('hari_ini');
      } else {
        setErrorMsg(data.message || 'Email atau password salah');
      }
    } catch (e) {
      setErrorMsg('Gagal terhubung ke server API. Pastikan server API menyala.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setToken(null);
    setUser(null);
    setEmail('');
    setPassword('');
    setErrorMsg(null);
  };

  // Report download is now authenticated (no public URL). Fetch with the Bearer
  // token, then trigger a client-side save of the returned blob.
  const downloadReport = async (fileKey: string) => {
    try {
      const res = await fetch(`${API_URL}/reports/download/${fileKey}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        window.alert('Gagal mengunduh laporan (kedaluwarsa atau tidak berwenang).');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileKey;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('Gagal mengunduh laporan.');
    }
  };

  // ==========================================
  // WEBCAM getUserMedia CAPTURE FLOW
  // ==========================================
  const startCamera = async () => {
    setCameraActive(true);
    setSelfiePreview(null);
    setSelfieBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 400, height: 300 }
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      alert('Gagal mengakses kamera. Silakan beri izin kamera.');
      setCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Downscale image to max width 640px to compress to ~200KB
      const MAX_WIDTH = 640;
      let width = video.videoWidth;
      let height = video.videoHeight;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        // Compress using 0.6 quality JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setSelfiePreview(dataUrl);

        canvas.toBlob((blob) => {
          if (blob) setSelfieBlob(blob);
        }, 'image/jpeg', 0.6);
      }

      // Stop camera stream tracks
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      setCameraActive(false);
    }
  };

  // ==========================================
  // SUBMIT CHECKIN / CHECKOUT (WITH OFFLINE CAPABILITY)
  // ==========================================
  const handleCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleCheckinSubmit started. selfiePreview length:', selfiePreview ? selfiePreview.length : 0);
    if (!selfiePreview || (!selfieBlob && !selfiePreview.startsWith('data:'))) {
      console.log('Validation failed: No selfiePreview or invalid format.');
      alert('Silakan ambil foto selfie terlebih dahulu!');
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    const deviceTimestamp = new Date().toISOString();

    // Map checked task objects
    const items = Object.keys(checkinSelectedTaskIds)
      .filter(id => checkinSelectedTaskIds[id])
      .map(id => ({
        taskId: id,
        note: checkinTaskNotes[id] || ''
      }));

    // Blocker object
    let blocker = null;
    if (hasBlocker && blockerTaskId && blockerDescription) {
      blocker = {
        taskId: blockerTaskId,
        description: blockerDescription,
        mentionedUserIds: blockerMentions
      };
    }

    // Fetch GPS coordinates
    console.log('Validation passed. Requesting geolocation...');
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.log('Geolocation success callback invoked! lat:', pos.coords.latitude, 'lng:', pos.coords.longitude);
        const lat = pos.coords.latitude.toString();
        const lng = pos.coords.longitude.toString();
        const accuracy = pos.coords.accuracy.toString();

        const payload = {
          workStatus: checkinWorkStatus,
          clientProjectId: checkinClientProjectId,
          lat,
          lng,
          accuracy,
          items: JSON.stringify(items),
          blocker: blocker ? JSON.stringify(blocker) : '',
          dailyNote: checkinDailyNote,
          deviceTimestamp,
          selfieBase64: selfiePreview
        };

        if (!navigator.onLine) {
          // OFFLINE SAVE
          await OfflineDB.add({
            idempotencyKey,
            type: 'IN',
            payload,
            timestamp: Date.now()
          });
          alert('Anda sedang offline. Data check-in disimpan lokal di IndexedDB.');
          checkOfflineQueueCount();
          setLoading(false);
          resetCheckinForm();
          fetchTodayStatus();
          return;
        }

        // ONLINE UPLOAD
        try {
          const formData = new FormData();
          formData.append('workStatus', checkinWorkStatus);
          formData.append('clientProjectId', checkinClientProjectId);
          formData.append('lat', lat);
          formData.append('lng', lng);
          formData.append('accuracy', accuracy);
          formData.append('items', JSON.stringify(items));
          if (blocker) formData.append('blocker', JSON.stringify(blocker));
          formData.append('dailyNote', checkinDailyNote);
          formData.append('deviceTimestamp', deviceTimestamp);
          formData.append('isOfflineSync', 'false');
          formData.append('selfie', selfieBlob || dataURLtoBlob(selfiePreview), 'selfie.jpg');

          const res = await fetch(`${API_URL}/attendance/checkins`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Idempotency-Key': idempotencyKey
            },
            body: formData
          });

          if (res.ok) {
            alert('Check-in Berhasil!');
            resetCheckinForm();
            fetchTodayStatus();
          } else {
            const err = await res.json();
            if (err.message === 'CHECKIN_ON_LEAVE_DAY') {
              if (confirm('Hari ini libur/cuti. Tetap lanjutkan check-in secara paksa (force)?')) {
                // Force checkin override
                await forceCheckin(formData, idempotencyKey);
              }
            } else {
              alert(err.message || 'Check-in Gagal');
            }
          }
        } catch (err) {
          // Network failure -> Save to IndexedDB
          await OfflineDB.add({
            idempotencyKey,
            type: 'IN',
            payload,
            timestamp: Date.now()
          });
          alert('Koneksi terganggu. Check-in disimpan offline.');
          checkOfflineQueueCount();
          resetCheckinForm();
          fetchTodayStatus();
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error('Geolocation failed error callback invoked:', err.code, err.message);
        setLoading(false);
        alert(`Gagal mengakses lokasi (GPS): ${err.message}. Izin lokasi wajib disetujui untuk Check-in.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const forceCheckin = async (formData: FormData, idempotencyKey: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/attendance/checkins?force=true`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey
        },
        body: formData
      });
      if (res.ok) {
        alert('Check-in Paksa Berhasil!');
        resetCheckinForm();
        fetchTodayStatus();
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal');
      }
    } catch (e) {
      alert('Koneksi gagal');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selfiePreview || (!selfieBlob && !selfiePreview.startsWith('data:'))) {
      alert('Silakan ambil foto selfie check-out terlebih dahulu!');
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    const deviceTimestamp = new Date().toISOString();

    // Map checkout updates
    const updates = todayData.activeSprintTasks.map((t: any) => ({
      taskId: t.id,
      percent: (checkoutTaskPercents[t.id] ?? 0).toString(),
      status: checkoutTaskStatuses[t.id] || TaskStatus.NOT_STARTED,
      evidence: checkoutTaskEvidences[t.id] || ''
    })).concat(todayData.carryOverTasks.map((t: any) => ({
      taskId: t.id,
      percent: (checkoutTaskPercents[t.id] ?? 0).toString(),
      status: checkoutTaskStatuses[t.id] || TaskStatus.NOT_STARTED,
      evidence: checkoutTaskEvidences[t.id] || ''
    })));

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toString();
        const lng = pos.coords.longitude.toString();

        const payload = {
          lat,
          lng,
          updates: JSON.stringify(updates),
          dailyNote: checkoutDailyNote,
          deviceTimestamp,
          selfieBase64: selfiePreview
        };

        if (!navigator.onLine) {
          // OFFLINE SAVE
          await OfflineDB.add({
            idempotencyKey,
            type: 'OUT',
            checkinId: todayData.todayCheckin.id,
            payload,
            timestamp: Date.now()
          });
          alert('Anda sedang offline. Data check-out disimpan lokal di IndexedDB.');
          checkOfflineQueueCount();
          setLoading(false);
          resetCheckoutForm();
          fetchTodayStatus();
          return;
        }

        // ONLINE UPLOAD
        try {
          const formData = new FormData();
          formData.append('lat', lat);
          formData.append('lng', lng);
          formData.append('updates', JSON.stringify(updates));
          formData.append('dailyNote', checkoutDailyNote);
          formData.append('deviceTimestamp', deviceTimestamp);
          formData.append('isOfflineSync', 'false');
          formData.append('selfie', selfieBlob || dataURLtoBlob(selfiePreview), 'selfie.jpg');

          const res = await fetch(`${API_URL}/attendance/checkins/${todayData.todayCheckin.id}/checkout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Idempotency-Key': idempotencyKey
            },
            body: formData
          });

          if (res.ok) {
            alert('Check-out Berhasil!');
            resetCheckoutForm();
            fetchTodayStatus();
          } else {
            const err = await res.json();
            alert(err.message || 'Check-out Gagal');
          }
        } catch (err) {
          // Network failure -> Save offline
          await OfflineDB.add({
            idempotencyKey,
            type: 'OUT',
            checkinId: todayData.todayCheckin.id,
            payload,
            timestamp: Date.now()
          });
          alert('Koneksi terganggu. Check-out disimpan offline.');
          checkOfflineQueueCount();
          resetCheckoutForm();
          fetchTodayStatus();
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setLoading(false);
        alert(`Gagal mengakses lokasi (GPS): ${err.message}. Izin lokasi wajib disetujui untuk Check-out.`);
      }
    );
  };

  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const resetCheckinForm = () => {
    setSelfiePreview(null);
    setSelfieBlob(null);
    setCheckinDailyNote('');
    setCheckinSelectedTaskIds({});
    setCheckinTaskNotes({});
    setHasBlocker(false);
    setBlockerTaskId('');
    setBlockerDescription('');
    setBlockerMentions([]);
  };

  const resetCheckoutForm = () => {
    setSelfiePreview(null);
    setSelfieBlob(null);
    setCheckoutDailyNote('');
  };

  // ==========================================
  // ORGANIZATIONAL MUTATIONS (DEPARTMENT, TEAMS, ROLES, USERS)
  // ==========================================
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const body = {
      ...userForm,
      departmentId: userForm.departmentId || null,
      functionalRoleId: userForm.functionalRoleId || null,
      managerId: userForm.managerId || null,
    };
    try {
      let res = selectedUser 
        ? await fetch(`${API_URL}/admin/users/${selectedUser.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
        : await fetch(`${API_URL}/admin/users`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (res.ok) {
        setUserModalOpen(false);
        fetchAdminMasterData();
        resetUserForm();
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal menyimpan user');
      }
    } catch (err) {
      alert('Koneksi gagal');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pengguna ini?')) return;
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchAdminMasterData();
    } catch (err) {
      alert('Gagal menghapus pengguna');
    }
  };

  const openEditUser = (userObj: any) => {
    setSelectedUser(userObj);
    setUserForm({
      email: userObj.email,
      fullName: userObj.full_name,
      nik: userObj.nik,
      password: '',
      departmentId: userObj.department_id || '',
      functionalRoleId: userObj.functional_role_id || '',
      managerId: userObj.manager_id || '',
      systemRoles: userObj.system_roles,
      timezone: userObj.timezone,
      checkinMode: userObj.checkin_mode,
      leaveBalance: userObj.leave_balance
    });
    setUserModalOpen(true);
  };

  const resetUserForm = () => {
    setSelectedUser(null);
    setUserForm({
      email: '', fullName: '', nik: '', password: '', departmentId: '', functionalRoleId: '',
      managerId: '', systemRoles: ['EMPLOYEE'], timezone: 'Asia/Jakarta', checkinMode: 'TWICE', leaveBalance: 12
    });
  };

  // Generate & download the .xlsx template for the active import type. Column
  // headers match exactly what the backend importer reads (task.service.ts).
  const handleDownloadTemplate = () => {
    let headers: string[];
    let example: (string | number)[];
    let fileName: string;

    if (importType === 'users') {
      // Header WAJIB sama persis dengan yang dibaca parser backend
      // (admin.controller.ts previewUserImport), yang berbahasa Indonesia.
      headers = ['Email', 'Nama Lengkap', 'NIK', 'Departemen', 'Peran Fungsional', 'Zona Waktu', 'Check-in Mode', 'Email Atasan', 'Sandi'];
      example = ['budi@indotek.co.id', 'Budi Santoso', 'EMP-100', 'Engineering', 'BE', 'Asia/Jakarta', 'TWICE', 'manager.eng@indotek.com', 'Rahasia123'];
      fileName = 'template_import_karyawan.xlsx';
    } else {
      headers = ['Sprint', 'Workstream', 'Task', 'Deliverable', 'Priority', 'Planned Start', 'Planned End', 'Role', 'Owner', 'Status', '% Complete', 'Weight', 'Risk Level', 'Notes'];
      example = [1, 'Backend', 'Contoh judul tugas', 'API endpoint selesai', 'MEDIUM', '2026-01-06', '2026-01-10', 'BE', 'budi@indotek.co.id', 'NOT_STARTED', 0, 1.0, 'LOW', 'Opsional catatan'];
      fileName = 'template_import_sprint_tasks.xlsx';
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, fileName);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    setImportLoading(true);
    setImportCommitMessage(null);
    try {
      let url = `${API_URL}/admin/users/import/preview`;
      if (importType === 'tasks') {
        url = `${API_URL}/tasks/import/preview?projectId=${importSelectedProjectId}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      const data = await res.json();
      if (res.ok) {
        setImportPreview(data);
      } else {
        alert(data.message || 'Gagal mengunggah file Excel');
      }
    } catch (err) {
      alert('Koneksi ke server gagal');
    } finally {
      setImportLoading(false);
    }
  };

  const handleCommitImport = async () => {
    if (!importPreview || importPreview.valid === 0) return;
    setImportLoading(true);
    try {
      let url = `${API_URL}/admin/users/import/commit`;
      let body: any = { rows: importPreview.rows };

      if (importType === 'tasks') {
        url = `${API_URL}/tasks/import/commit`;
        body = { previewId: importPreview.previewId };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (res.ok) {
        setImportCommitMessage(data.message);
        fetchAdminMasterData();
        setTimeout(() => {
          setImportPreview(null);
          setImportDrawerOpen(false);
          setImportCommitMessage(null);
        }, 2000);
      } else {
        alert(data.message || 'Gagal menyimpan data impor');
      }
    } catch (err) {
      alert('Koneksi ke server gagal');
    } finally {
      setImportLoading(false);
    }
  };

  const handleExportPDP = async (userId: string, name: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/export-personal-data`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pdp_export_${name.toLowerCase().replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert('Koneksi gagal');
    }
  };

  // Projects & Sprints CRUD
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      let res = selectedProject
        ? await fetch(`${API_URL}/tasks/projects/${selectedProject.id}`, { method: 'PATCH', headers, body: JSON.stringify(projectForm) })
        : await fetch(`${API_URL}/tasks/projects`, { method: 'POST', headers, body: JSON.stringify(projectForm) });
      if (res.ok) {
        setProjectModalOpen(false);
        fetchAdminMasterData();
        resetProjectForm();
      }
    } catch (err) {
      alert('Gagal menyimpan project');
    }
  };

  const resetProjectForm = () => {
    setSelectedProject(null);
    setProjectForm({ name: '', codePrefix: '', status: 'ACTIVE' });
  };

  const handleSaveSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      let res = selectedSprint
        ? await fetch(`${API_URL}/tasks/sprints/${selectedSprint.id}`, { method: 'PATCH', headers, body: JSON.stringify(sprintForm) })
        : await fetch(`${API_URL}/tasks/sprints`, { method: 'POST', headers, body: JSON.stringify(sprintForm) });
      
      if (res.ok) {
        setSprintModalOpen(false);
        fetchAdminMasterData();
        resetSprintForm();
      } else {
        const data = await res.json();
        if (data.message === 'SPRINT_OVERLAP') {
          alert('Error: SPRINT_OVERLAP. Tanggal sprint tidak boleh saling tumpang tindih dalam satu project!');
        } else {
          alert(data.message || 'Gagal menyimpan sprint');
        }
      }
    } catch (err) {
      alert('Gagal menyimpan sprint');
    }
  };

  const resetSprintForm = () => {
    setSelectedSprint(null);
    setSprintForm({ projectId: '', number: '', startDate: '', endDate: '', goal: '' });
  };

  // Tasks CRUD
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const body = {
      ...taskForm,
      functionalRoleId: taskForm.functionalRoleId || null,
      percentComplete: Number(taskForm.percentComplete),
      weight: Number(taskForm.weight)
    };

    try {
      let res = selectedTask
        ? await fetch(`${API_URL}/tasks/${selectedTask.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
        : await fetch(`${API_URL}/tasks`, { method: 'POST', headers, body: JSON.stringify(body) });
      
      if (res.ok) {
        setTaskModalOpen(false);
        fetchAdminMasterData();
        resetTaskForm();
      } else {
        const data = await res.json();
        alert(data.message || 'Gagal menyimpan tugas');
      }
    } catch (err) {
      alert('Gagal menyimpan tugas');
    }
  };

  const resetTaskForm = () => {
    setSelectedTask(null);
    setTaskForm({
      projectId: '', sprintId: '', functionalRoleId: '', workstream: 'General', title: '',
      deliverable: '', priority: 'MEDIUM', plannedStart: '', plannedEnd: '', status: 'NOT_STARTED',
      percentComplete: 0, weight: 1.0, riskLevel: 'LOW', notes: ''
    });
  };

  const handleUpdateTaskStatusAndProgress = async (id: string, newStatus: string, newProgress: number) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus, percentComplete: newProgress })
      });
      if (res.ok) {
        fetchFilteredTasks();
        if (myTasksFilterSprint) {
          fetchSprintAggregation(myTasksFilterSprint);
        }
      }
    } catch (err) {
      console.error('Failed to update task status/progress', err);
    }
  };

  // The Task view does not load the user roster (that only happens in admin/hari_ini
  // contexts), and /admin/users is SUPER_ADMIN/HR-only. Fetch the assignable-users
  // roster (open to PM_ADMIN too) before opening the modal so the picker is populated.
  const openAssignModal = async (tsk: any) => {
    setSelectedTask(tsk);
    setAssignModalOpen(true);
    try {
      const res = await fetch(`${API_URL}/tasks/assignable-users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setUsersList(await res.json());
    } catch (err) {
      console.error('Failed to fetch assignable users', err);
    }
  };

  const handleAssignOwner = async (taskId: string, userId: string) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        setAssignModalOpen(false);
        fetchAdminMasterData();
        fetchFilteredTasks();
      }
    } catch (err) {
      alert('Gagal menetapkan owner tugas');
    }
  };

  // Locations & Holidays
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      let res = selectedLocation
        ? await fetch(`${API_URL}/admin/locations/${selectedLocation.id}`, { method: 'PATCH', headers, body: JSON.stringify(locationForm) })
        : await fetch(`${API_URL}/admin/locations`, { method: 'POST', headers, body: JSON.stringify(locationForm) });
      if (res.ok) { setLocationModalOpen(false); fetchAdminMasterData(); resetLocationForm(); }
    } catch (err) { alert('Gagal'); }
  };

  const openEditLocation = (loc: any) => {
    setSelectedLocation(loc);
    setLocationForm({ name: loc.name, type: loc.type, lat: loc.lat || '', lng: loc.lng || '', radiusM: loc.radius_m || '200' });
    setLocationModalOpen(true);
  };

  const resetLocationForm = () => {
    setSelectedLocation(null);
    setLocationForm({ name: '', type: 'OFFICE', lat: '', lng: '', radiusM: '200' });
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      let res = selectedHoliday
        ? await fetch(`${API_URL}/admin/holidays/${selectedHoliday.id}`, { method: 'PATCH', headers, body: JSON.stringify(holidayForm) })
        : await fetch(`${API_URL}/admin/holidays`, { method: 'POST', headers, body: JSON.stringify(holidayForm) });
      if (res.ok) { setHolidayModalOpen(false); fetchAdminMasterData(); resetHolidayForm(); }
    } catch (err) { alert('Gagal'); }
  };

  const openEditHoliday = (hol: any) => {
    setSelectedHoliday(hol);
    setHolidayForm({ date: new Date(hol.date).toISOString().split('T')[0], name: hol.name, isCutiBersama: hol.is_cuti_bersama });
    setHolidayModalOpen(true);
  };

  const resetHolidayForm = () => {
    setSelectedHoliday(null);
    setHolidayForm({ date: '', name: '', isCutiBersama: false });
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-955 text-slate-100">
        <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
        <p className="mt-4 text-sm text-slate-400">Menghubungkan GPS dan memproses...</p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // LAYOUT ROUTER
  // -------------------------------------------------------------
  if (!token || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 shadow-lg shadow-sky-500/20">
              <span className="text-xl font-bold text-white tracking-widest">HW</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold text-white tracking-tight">HWMS Indotek</h2>
            <p className="mt-2 text-sm text-slate-400">Hybrid Work Management System</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleLogin}>
            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-955/50 border border-red-900/50 p-3.5 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Karyawan</label>
              <input
                id="email" type="email" required
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                placeholder="superadmin@indotek.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="pass" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Kata Sandi</label>
              <input
                id="pass" type="password" required
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                placeholder="••••••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit" disabled={loginLoading}
              className="flex w-full items-center justify-center rounded-lg bg-sky-500 py-3 text-sm font-semibold text-white hover:bg-sky-600 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loginLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Masuk'}
            </button>
          </form>

          <div className="mt-8 rounded-lg bg-slate-955/40 border border-slate-800/40 p-4 text-xs text-slate-400 space-y-1">
            <span className="font-semibold text-slate-300 block mb-1">Pengguna Seed Uji Coba:</span>
            <div><span className="text-slate-300">Email:</span> superadmin@indotek.com</div>
            <div><span className="text-slate-300">Sandi:</span> SuperSecurePassword123</div>
            <div><span className="text-slate-300">Peran:</span> SUPER_ADMIN</div>
          </div>
        </div>
      </div>
    );
  }

  const renderDesktopLayout = () => {
    const navItems = [
      { id: 'hari_ini', label: 'Kehadiran & Standup', icon: Calendar },
      { id: 'feed', label: 'Feed Tim', icon: FileCheck2 },
      { id: 'leave', label: 'Cuti & Persetujuan', icon: Layers },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'task', label: 'Task Saya & Tim', icon: CheckSquare },
      { id: 'admin', label: 'Admin Panel', icon: Settings },
    ];

    return (
      <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col justify-between shrink-0">
          <div>
            <div className="h-16 px-6 border-b border-slate-800 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600">
                <span className="text-xs font-bold text-white tracking-widest">HW</span>
              </div>
              <span className="font-bold text-base tracking-wide text-white">HWMS Indotek</span>
            </div>

            <nav className="mt-6 px-4 space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                      isActive 
                        ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4.5 w-4.5" />
                      <span>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-4 border-t border-slate-880">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center font-bold text-sky-400">
                SA
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 p-1.5"><LogOut className="h-4 w-4" /></button>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Offline Sync Banner */}
          {(!isOnline || offlineCount > 0) && (
            <div className="bg-amber-500 text-slate-950 text-xs px-6 py-2.5 font-bold flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                <span>
                  {isOnline 
                    ? `Terhubung kembali. Terdapat ${offlineCount} data antrean offline siap disinkronkan.`
                    : 'Anda sedang offline. Sistem menyimpan semua check-in secara lokal di HP Anda.'
                  }
                </span>
              </div>
              {isOnline && (
                <button 
                  onClick={syncOfflineQueue} disabled={syncingOffline}
                  className="bg-slate-950 text-white rounded px-3 py-1 hover:bg-slate-850 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {syncingOffline ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Sinkronkan Sekarang
                </button>
              )}
            </div>
          )}

          <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 shrink-0">
            <div className="text-slate-400 text-xs flex items-center gap-1.5">
              <span>Sistem</span> <span>/</span> <span className="text-white font-medium capitalize">{activeTab.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-400 font-semibold border border-slate-700">
                {user.timezone}
              </span>
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative text-slate-400 hover:text-white focus:outline-none"
                >
                  <Bell className="h-5 w-5" />
                  {notificationsList.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                      {notificationsList.length}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-3 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden text-xs">
                    <div className="p-3 border-b border-slate-800 font-bold text-white flex justify-between items-center bg-slate-950">
                      <span>Notifikasi ({notificationsList.length})</span>
                      <button onClick={() => setNotificationsOpen(false)} className="text-[10px] text-slate-500 hover:text-slate-300">Tutup</button>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-850">
                      {notificationsList.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 italic">Tidak ada notifikasi.</div>
                      ) : (
                        notificationsList.map((n) => {
                          const payload = n.payload_json || {};
                          return (
                            <div key={n.id} className="p-3 hover:bg-slate-850/30 space-y-1 text-left">
                              <div className="font-semibold text-white">{payload.title || 'Pemberitahuan'}</div>
                              <p className="text-slate-400 text-[11px] leading-relaxed">{payload.message || ''}</p>
                              {payload.fileKey && (
                                <div className="mt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => downloadReport(payload.fileKey)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300 hover:underline"
                                  >
                                    <Download className="h-3 w-3" /> Unduh Laporan (XLSX)
                                  </button>
                                </div>
                              )}
                              <span className="text-[9px] text-slate-500 block font-mono">
                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="h-8 w-px bg-slate-800"></div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-300">{user.fullName}</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  {user.roles[0]}
                </span>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-8">
            {renderActiveView()}
          </main>
        </div>
      </div>
    );
  };

  const renderMobileLayout = () => {
    const hasDashboardAccess = user && user.roles && user.roles.some((r: string) => ['SUPER_ADMIN', 'MANAGER', 'PM_ADMIN'].includes(r));
    const mobileTabs = [
      { id: 'hari_ini', label: 'Hari Ini', icon: Calendar },
      { id: 'feed', label: 'Feed Tim', icon: FileCheck2 },
      { id: 'leave', label: 'Cuti & Inbox', icon: Layers },
      ...(hasDashboardAccess ? [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
      { id: 'task', label: 'Tasks', icon: CheckSquare },
      { id: 'profil', label: 'Profil', icon: UserIcon },
    ];

    return (
      <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden">
        {/* Offline Sync Banner */}
        {(!isOnline || offlineCount > 0) && (
          <div className="bg-amber-500 text-slate-950 text-[10px] px-4 py-2 font-bold flex justify-between items-center shrink-0">
            <span className="truncate">
              {isOnline ? `Terhubung. Ada ${offlineCount} data antrean.` : 'Mode Offline Aktif.'}
            </span>
            {isOnline && (
              <button onClick={syncOfflineQueue} disabled={syncingOffline} className="bg-slate-950 text-white rounded px-2 py-0.5">
                Sync
              </button>
            )}
          </div>
        )}

        <header className="h-14 border-b border-slate-800 bg-slate-900 px-4 flex items-center justify-between shrink-0">
          <span className="font-bold text-sm text-white">HWMS Indotek</span>
          <button onClick={handleLogout} className="text-slate-400 hover:text-red-400"><LogOut className="h-4.5 w-4.5" /></button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-20">
          {renderActiveView()}
        </main>

        <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-around z-50">
          {mobileTabs.map(item => (
            <button
              key={item.id} onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-1 py-1 px-3 ${activeTab === item.id ? 'text-sky-500' : 'text-slate-500'}`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px]">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'hari_ini':
        return renderHariIniView();
      case 'feed':
        return renderFeedView();
      case 'leave':
        return renderLeaveView();
      case 'dashboard':
        return renderDashboardView();
      case 'task':
        return renderTaskView();
      case 'admin':
        return renderAdminView();
      case 'profil':
        return (
          <div className="space-y-4">
            <h1 className="text-lg font-bold text-white">Profil Saya</h1>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between"><span>Nama:</span> <span className="text-white font-semibold">{user.fullName}</span></div>
              <div className="flex justify-between"><span>Email:</span> <span className="text-white">{user.email}</span></div>
              <div className="flex justify-between"><span>NIK:</span> <span className="text-white font-mono">{user.nik}</span></div>
              <div className="flex justify-between"><span>Timezone:</span> <span className="text-sky-400">{user.timezone}</span></div>
              <div className="flex justify-between"><span>Default Checkin Mode:</span> <span className="text-slate-350">{user.checkinMode}</span></div>
            </div>
            <button onClick={handleLogout} className="w-full bg-red-600 hover:bg-red-700 py-2.5 rounded-lg text-sm font-bold text-white mt-4">
              Keluar
            </button>
          </div>
        );
      default:
        return renderDashboardView();
    }
  };

  // ==========================================
  // HARI INI: ATTENDANCE & STANDUP LAYOUT (Fase 3)
  // ==========================================
  const renderHariIniView = () => {
    if (fetchingToday || !todayData) {
      return (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      );
    }

    // Default arrays: guard against a response shape missing these fields so a
    // partial/stale API response can never blank the whole app on .map().
    const { todayCheckin, checkout, policy, activeSprintTasks = [], carryOverTasks = [] } = todayData;

    if (todayData.isOnLeave) {
      return (
        <div className="max-w-md mx-auto p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-6">
          <div className="h-16 w-16 bg-sky-500/10 border border-sky-500/30 rounded-full flex items-center justify-center mx-auto text-sky-400">
            <Layers className="h-9 w-9" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Sedang Cuti / Izin / Sakit</h2>
            <p className="text-xs text-slate-400 mt-1.5 font-medium">
              Tipe: <span className="text-sky-450 uppercase font-bold">{todayData.leaveType}</span>
            </p>
            {todayData.leaveReason && (
              <p className="text-[11px] text-slate-500 italic mt-2">"{todayData.leaveReason}"</p>
            )}
            <p className="text-xs text-emerald-400 mt-4 font-semibold">
              Hari ini Anda dibebaskan dari kewajiban check-in. Selamat beristirahat!
            </p>
          </div>
        </div>
      );
    }

    // Cycle 3: Both check-in and check-out completed for today
    if (todayCheckin && checkout) {
      return (
        <div className="max-w-md mx-auto p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-6">
          <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Siklus Kerja Hari Ini Selesai</h2>
            <p className="text-xs text-slate-400 mt-1">Terima kasih atas kerja keras Anda hari ini!</p>
          </div>

          <div className="border-t border-b border-slate-800 py-4 divide-y divide-slate-800 text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-slate-450">Check-in Pagi</span>
              <span className="font-semibold text-white">
                {new Date(todayCheckin.device_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {todayCheckin.is_late && <span className="text-red-500 font-bold ml-1.5">(Terlambat)</span>}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-slate-450">Check-out Sore</span>
              <span className="font-semibold text-white">
                {new Date(checkout.device_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-slate-450">Status Kerja</span>
              <span className="font-bold text-sky-400 uppercase">{todayCheckin.work_status}</span>
            </div>
          </div>
        </div>
      );
    }

    // Cycle 2: Already checked in, waiting for check-out
    if (todayCheckin && !checkout) {
      return renderCheckoutForm(todayCheckin, activeSprintTasks, carryOverTasks);
    }

    // Cycle 1: Fresh day, waiting for check-in
    return renderCheckinForm(activeSprintTasks, carryOverTasks);
  };

  const renderFeedView = () => {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-white">Feed Aktivitas Tim</h1>
            <p className="text-xs text-slate-400 mt-1">
              Pantau laporan harian standup tim Anda secara real-time.
            </p>
          </div>
        </div>

        {/* Date and Team Filter Header */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap gap-4 items-center justify-between text-xs">
          <div className="flex flex-wrap gap-3 items-center">
            <Filter className="h-4 w-4 text-slate-500" />
            
            {/* Team Filter Dropdown */}
            <select
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none"
              value={feedTeamFilter}
              onChange={e => setFeedTeamFilter(e.target.value)}
            >
              <option value="">Tim Saya (Default)</option>
              <optgroup label="Departemen">
                {departmentsList.map(d => (
                  <option key={d.id} value={`DEPT:${d.id}`}>{d.name}</option>
                ))}
              </optgroup>
              <optgroup label="Proyek">
                {projectsList.map(p => (
                  <option key={p.id} value={`PROJ:${p.id}`}>{p.name}</option>
                ))}
              </optgroup>
            </select>

            {/* Date Selector and Navigation */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded px-2.5 py-1.5 text-slate-350"
                onClick={() => {
                  const d = new Date(feedDate);
                  d.setDate(d.getDate() - 1);
                  setFeedDate(d.toISOString().split('T')[0]);
                }}
              >
                Sebelumnya
              </button>
              <input
                type="date"
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none font-mono"
                value={feedDate}
                onChange={e => setFeedDate(e.target.value)}
              />
              <button
                type="button"
                className="bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded px-2.5 py-1.5 text-slate-350"
                onClick={() => {
                  const d = new Date(feedDate);
                  d.setDate(d.getDate() + 1);
                  setFeedDate(d.toISOString().split('T')[0]);
                }}
              >
                Selanjutnya
              </button>
            </div>
          </div>
          
          {feedData && (
            <span className="text-[10px] px-2.5 py-1 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold uppercase">
              {feedData.teamName}
            </span>
          )}
        </div>

        {fetchingFeed ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : !feedData || feedData.entries.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/50 border border-slate-805 rounded-xl space-y-3">
            <Calendar className="h-10 w-10 text-slate-650 mx-auto" />
            <h4 className="font-bold text-white text-sm">Tidak Ada Entri Standup</h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Belum ada anggota tim yang melakukan check-in pada tanggal ini.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {feedData.entries.map((entry: any) => (
              <div 
                key={entry.checkinId}
                className={`p-6 border rounded-2xl shadow-xl transition-all space-y-5 ${
                  entry.hasOpenBlocker 
                    ? 'border-amber-500/30 bg-amber-500/5 shadow-amber-500/5' 
                    : 'border-slate-800 bg-slate-900'
                }`}
              >
                {/* Entry Header */}
                <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b border-slate-805">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center font-bold text-white">
                      {entry.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{entry.fullName}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase font-mono">
                          {entry.roleCode}
                        </span>
                        <span className="text-[10px] text-slate-400">({entry.deptName})</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block mt-0.5">{entry.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Flags */}
                    {entry.flags.late && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase">
                        Telat
                      </span>
                    )}
                    {entry.flags.auto && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                        Auto-checkout
                      </span>
                    )}
                    {entry.flags.offline && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 uppercase">
                        Offline
                      </span>
                    )}
                    {entry.flags.noEvidence && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-450 border border-rose-500/20 uppercase">
                        Tanpa Bukti
                      </span>
                    )}

                    {/* Status Pill */}
                    <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-sky-400 uppercase font-mono">
                      {entry.workStatus === 'WFO' ? '🏢 WFO' : entry.workStatus === 'WFH' ? '🏠 WFH' : '📍 ONSITE'}
                    </span>
                  </div>
                </div>

                {/* Selfie Images and Times */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Checkin Pagi */}
                  <div className="flex gap-4 items-center bg-slate-955 p-3.5 border border-slate-850 rounded-xl">
                    <SelfieThumb
                      attendanceId={entry.checkinId}
                      hasSelfie={!!entry.selfieKey}
                      isOwn={entry.userId === user?.id}
                      token={token}
                      alt="Selfie Check-in"
                    />
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Check-in Pagi</span>
                      <span className="font-bold text-white text-xs block mt-0.5">
                        {new Date(entry.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {entry.dailyNote && (
                        <p className="text-[10px] text-slate-400 mt-1 italic">"{entry.dailyNote}"</p>
                      )}
                    </div>
                  </div>

                  {/* Checkout Sore */}
                  {entry.checkoutTime ? (
                    <div className="flex gap-4 items-center bg-slate-955 p-3.5 border border-slate-850 rounded-xl">
                      <SelfieThumb
                        attendanceId={entry.checkoutCheckinId}
                        hasSelfie={!!entry.checkoutSelfieKey}
                        isOwn={entry.userId === user?.id}
                        token={token}
                        alt="Selfie Check-out"
                      />
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Check-out Sore</span>
                        <span className="font-bold text-white text-xs block mt-0.5">
                          {new Date(entry.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {entry.checkoutDailyNote && (
                          <p className="text-[10px] text-slate-400 mt-1 italic">"{entry.checkoutDailyNote}"</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center border border-dashed border-slate-800 p-3.5 rounded-xl text-xs text-slate-500 italic">
                      Belum Check-out Sore
                    </div>
                  )}
                </div>

                {/* Standup Items Tasks */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tugas Yang Dikerjakan Hari Ini</span>
                  <div className="space-y-2 border border-slate-850 rounded-xl p-3 bg-slate-955/50">
                    {entry.standupItems.map((item: any) => (
                      <div key={item.taskId} className="flex justify-between items-center text-xs p-2 rounded bg-slate-900/60 border border-slate-850/60">
                        <div className="min-w-0 flex-1 mr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[9px] font-bold text-slate-500">{item.code}</span>
                            {item.isCarryOver && (
                              <span className="text-[8px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1 rounded uppercase font-bold">
                                Carry-over
                              </span>
                            )}
                          </div>
                          <span className="font-semibold text-slate-200 mt-0.5 block truncate">{item.title}</span>
                          {item.plannedNote && (
                            <span className="text-[10px] text-slate-500 italic block mt-0.5">Target pagi: {item.plannedNote}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 shrink-0 text-right font-bold text-[11px]">
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase font-bold">Progres</span>
                            <span className="text-white font-mono">
                              {item.percentBefore}% {item.percentAfter !== null && item.percentAfter !== undefined ? `→ ${item.percentAfter}%` : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase font-bold">Status</span>
                            <span className="text-sky-400 font-mono uppercase">
                              {(item.statusAfter || item.statusBefore || '').replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Open Blockers Warning Panel */}
                {entry.blockers.length > 0 && (
                  <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-xl space-y-3">
                    <span className="flex items-center gap-2 text-xs font-bold text-red-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Blocker Aktif (Kendala Terbuka)</span>
                    </span>
                    
                    <div className="space-y-3 divide-y divide-red-900/30 text-xs">
                      {entry.blockers.map((b: any) => {
                        const isReporter = b.reportedBy === user.id;
                        const isMentioned = b.mentionedUserIds.includes(user.id);
                        const isManager = b.reporterManagerId === user.id;
                        const isSuperAdmin = user.roles.includes('SUPER_ADMIN');
                        const canResolve = isReporter || isMentioned || isManager || isSuperAdmin;

                        return (
                          <div key={b.id} className="pt-3 first:pt-0 flex justify-between items-start gap-4">
                            <div className="space-y-1">
                              <div className="font-semibold text-white">Target Task: <span className="font-mono text-red-400">{b.taskCode}</span> - {b.taskTitle}</div>
                              <p className="text-slate-350 italic">"{b.description}"</p>
                              <div className="text-[10px] text-slate-500">Dilaporkan oleh: <span className="text-slate-400">{b.reporterName}</span></div>
                            </div>

                            {canResolve && (
                              <button
                                type="button"
                                onClick={() => handleResolveBlocker(b.id)}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] uppercase px-3 py-1.5 rounded-lg border border-red-800 shrink-0"
                              >
                                Selesaikan
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderLeaveView = () => {
    return (
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Manajemen Cuti & Izin</h1>
            <p className="text-xs text-slate-400 mt-1">
              Ajukan permohonan cuti, izin, atau sakit, dan proses persetujuan bawahan langsung.
            </p>
          </div>
          
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-4 text-xs shrink-0">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Jatah Cuti Tersisa</span>
              <span className="text-lg font-bold text-sky-400 mt-0.5 block">{user?.leaveBalance ?? 0} Hari</span>
            </div>
            <button
              onClick={() => setLeaveFormOpen(true)}
              className="bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5"
            >
              <PlusCircle className="h-4 w-4" />
              Ajukan Cuti/Izin
            </button>
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex border-b border-slate-800 gap-6 shrink-0 pb-1">
          <button
            onClick={() => setLeaveSubTab('my')}
            className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              leaveSubTab === 'my' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            Pengajuan Saya ({leaveRequests.length})
          </button>
          <button
            onClick={() => setLeaveSubTab('approvals')}
            className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all flex items-center gap-1.5 ${
              leaveSubTab === 'approvals' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <span>Kotak Masuk Persetujuan</span>
            {approvalsInbox.length > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                {approvalsInbox.length}
              </span>
            )}
          </button>
        </div>

        {/* View Router */}
        {leaveSubTab === 'my' ? (
          /* MY LEAVE REQUESTS LIST */
          <div className="overflow-x-auto rounded-xl border border-slate-805 bg-slate-900/40">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-900/60">
                  <th className="px-6 py-3">Tipe / Alasan</th>
                  <th className="px-6 py-3">Rentang Tanggal / Jumlah</th>
                  <th className="px-6 py-3">Status / Keputusan</th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {leaveRequests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-slate-500 italic">
                      Belum ada riwayat pengajuan cuti.
                    </td>
                  </tr>
                ) : (
                  leaveRequests.map(r => (
                    <tr key={r.id} className="hover:bg-slate-900/30">
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${
                          r.type === 'SAKIT' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          r.type === 'CUTI' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                          'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {r.type}
                        </span>
                        <div className="font-semibold text-white mt-1.5">{r.reason}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div>{new Date(r.date_from).toLocaleDateString()} s/d {new Date(r.date_to).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {Math.round(parseFloat(r.hours) / 8)} Hari ({parseFloat(r.hours)} Jam)
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                          r.status === 'APPROVED' || r.status === 'AUTO_APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          r.status === 'REJECTED' ? 'bg-red-500/10 text-red-450 border-red-500/20' :
                          r.status === 'CANCELLED' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                          'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {r.status.replace(/_/g, ' ')}
                        </span>
                        {r.decision_note && (
                          <div className="text-[10px] text-slate-450 mt-1 italic">Note: "{r.decision_note}"</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.status !== 'CANCELLED' && r.status !== 'REJECTED' && (
                          <button
                            onClick={() => handleCancelLeave(r.id)}
                            className="bg-slate-800 hover:bg-slate-750 text-red-400 hover:text-red-300 font-bold text-[10px] uppercase px-3 py-1.5 rounded-lg border border-slate-700"
                          >
                            Batalkan
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* APPROVAL INBOX LIST */
          <div className="overflow-x-auto rounded-xl border border-slate-805 bg-slate-900/40">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-900/60">
                  <th className="px-6 py-3">Pemohon / Saldo Cuti</th>
                  <th className="px-6 py-3">Tipe / Alasan</th>
                  <th className="px-6 py-3">Rentang Tanggal / Jumlah</th>
                  <th className="px-6 py-3">Lampiran</th>
                  <th className="px-6 py-3 text-right">Keputusan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {approvalsInbox.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500 italic">
                      Kotak masuk persetujuan kosong.
                    </td>
                  </tr>
                ) : (
                  approvalsInbox.map(r => {
                    const days = Math.ceil((new Date(r.date_to).getTime() - new Date(r.date_from).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    return (
                      <tr key={r.id} className="hover:bg-slate-900/30">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-white">{r.requester?.full_name}</div>
                          <div className="text-[10px] text-slate-500">{r.requester?.email}</div>
                          <div className="text-[10px] text-sky-400 mt-1 font-bold">Saldo: {r.requester?.leave_balance} Hari</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${
                            r.type === 'SAKIT' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            r.type === 'CUTI' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                            'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {r.type}
                          </span>
                          <div className="font-semibold text-white mt-1.5">{r.reason}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div>{new Date(r.date_from).toLocaleDateString()} s/d {new Date(r.date_to).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{days} Hari</div>
                        </td>
                        <td className="px-6 py-4">
                          {r.attachment_key ? (
                            <a
                              href={`http://localhost:3000/api/v1/leaves/attachments/${r.attachment_key}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 hover:underline font-bold text-[11px]"
                            >
                              Lihat Lampiran
                            </a>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2 shrink-0">
                            <button
                              onClick={() => handleDecideLeave(r.id, 'APPROVED')}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase px-3 py-1.5 rounded-lg border border-emerald-800"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => handleDecideLeave(r.id, 'REJECTED')}
                              className="bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] uppercase px-3 py-1.5 rounded-lg border border-red-800"
                            >
                              Tolak
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* APPLY LEAVE REQUEST MODAL */}
        {leaveFormOpen && (
          <div className="fixed inset-0 bg-slate-955/85 backdrop-blur flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-805 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-850 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Ajukan Permohonan Cuti/Izin/Sakit</h3>
                <button onClick={() => setLeaveFormOpen(false)} className="text-slate-405 hover:text-white"><X className="h-5 w-5" /></button>
              </div>

              <form onSubmit={handleApplyLeave}>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipe Pengajuan</label>
                    <select
                      className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                      value={leaveForm.type}
                      onChange={e => setLeaveForm({ ...leaveForm, type: e.target.value })}
                    >
                      <option value="CUTI">CUTI (Mengurangi Saldo)</option>
                      <option value="IZIN">IZIN (Keperluan Mendesak)</option>
                      <option value="SAKIT">SAKIT (Wajib Surat Dokter)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal Mulai</label>
                      <input
                        type="date" required
                        className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
                        value={leaveForm.dateFromStr}
                        onChange={e => setLeaveForm({ ...leaveForm, dateFromStr: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal Selesai</label>
                      <input
                        type="date" required
                        className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
                        value={leaveForm.dateToStr}
                        onChange={e => setLeaveForm({ ...leaveForm, dateToStr: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Attachment input (Mandatory for SAKIT) */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Lampiran Surat Keterangan Dokter {leaveForm.type === 'SAKIT' && <span className="text-red-500 font-bold">*</span>}
                    </label>
                    <input
                      type="file"
                      ref={leaveAttachmentInputRef}
                      required={leaveForm.type === 'SAKIT'}
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2 text-xs text-white focus:outline-none"
                      onChange={e => {
                        const file = e.target.files?.[0] || null;
                        setLeaveAttachment(file);
                      }}
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Format: PDF, PNG, atau JPG</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alasan Pengajuan</label>
                    <textarea
                      required rows={2.5}
                      className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-955 px-3.5 py-2 text-xs text-white focus:outline-none placeholder-slate-750"
                      placeholder="Tuliskan keterangan detail alasan cuti/izin..."
                      value={leaveForm.reason}
                      onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/60 shrink-0">
                  <button
                    type="submit" disabled={submittingLeave}
                    className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-lg flex items-center gap-1.5"
                  >
                    {submittingLeave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Kirim Pengajuan'}
                  </button>
                  <button type="button" onClick={() => setLeaveFormOpen(false)} className="bg-slate-800 text-slate-400 font-bold text-xs px-5 py-2.5 rounded border border-slate-700">Batal</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDashboardView = () => {
    const isManager = user?.roles.includes('MANAGER') || user?.roles.includes('SUPER_ADMIN');
    const isCTOorPM = user?.roles.includes('CTO') || user?.roles.includes('PM_ADMIN') || user?.roles.includes('SUPER_ADMIN');
    
    // Automatically set fallback dashboard view tab if permissions are skewed
    const currentSubTab = isCTOorPM && !isManager ? 'program' : dashboardSubTab;

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard Analitik</h1>
            <p className="text-xs text-slate-400 mt-1">
              Pantau kinerja proyek, anomali absensi, dan progres sprint tim.
            </p>
          </div>

          {/* Payroll Export trigger for HR and SuperAdmin roles */}
          {(user?.roles.includes('SUPER_ADMIN') || user?.roles.includes('HR')) && (
            <button
              onClick={() => {
                setExportDateFrom(new Date().toISOString().split('T')[0]);
                setExportDateTo(new Date().toISOString().split('T')[0]);
                setExportModalOpen(true);
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 shrink-0"
            >
              <Download className="h-4 w-4" />
              Ekspor Absensi (HR/Payroll)
            </button>
          )}
        </div>

        {/* Dashboard Sub-tabs */}
        {isManager && isCTOorPM && (
          <div className="flex border-b border-slate-800 gap-6 shrink-0 pb-1">
            <button
              onClick={() => setDashboardSubTab('team')}
              className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
                dashboardSubTab === 'team' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-350'
              }`}
            >
              Dashboard Kehadiran Tim
            </button>
            <button
              onClick={() => setDashboardSubTab('program')}
              className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
                dashboardSubTab === 'program' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-350'
              }`}
            >
              Dashboard Program & Sprint (CTO)
            </button>
          </div>
        )}

        {fetchingDashboard ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : !dashboardData ? (
          <div className="text-center py-20 text-slate-500 italic">Gagal memuat data dashboard.</div>
        ) : currentSubTab === 'program' && !dashboardData.metrics ? (
          /* Data shape belongs to the team endpoint but the program layout is
             active (in-flight sub-tab switch) — show loader instead of crashing. */
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : currentSubTab === 'team' && !dashboardData.attendanceList ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : currentSubTab === 'team' ? (
          /* TEAM ATTENDANCE DASHBOARD */
          <div className="space-y-6">
            {/* Filters */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap gap-4 items-center justify-between text-xs">
              <div className="flex flex-wrap gap-3 items-center">
                <Filter className="h-4 w-4 text-slate-500" />
                
                <select
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none"
                  value={dashboardTeamFilter}
                  onChange={e => setDashboardTeamFilter(e.target.value)}
                >
                  <option value="">Tim Saya (Default)</option>
                  <optgroup label="Departemen">
                    {departmentsList.map(d => (
                      <option key={d.id} value={`DEPT:${d.id}`}>{d.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Proyek">
                    {projectsList.map(p => (
                      <option key={p.id} value={`PROJ:${p.id}`}>{p.name}</option>
                    ))}
                  </optgroup>
                </select>

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none font-mono"
                    value={dashboardDateFrom}
                    onChange={e => setDashboardDateFrom(e.target.value)}
                  />
                  <span className="text-slate-500 font-bold">s/d</span>
                  <input
                    type="date"
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none font-mono"
                    value={dashboardDateTo}
                    onChange={e => setDashboardDateTo(e.target.value)}
                  />
                </div>
              </div>

              {dashboardData.anomaliesCount > 0 && (
                <span className="text-[10px] px-2.5 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase">
                  ⚠️ {dashboardData.anomaliesCount} Anomali Terdeteksi
                </span>
              )}
            </div>

            {/* Attendance list Grid */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">Log Kehadiran & Standup ({dashboardData.attendanceList.length} Baris)</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-805 bg-slate-900/40">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-900/60">
                      <th className="px-6 py-3">Nama Karyawan</th>
                      <th className="px-6 py-3">Tanggal / Status</th>
                      <th className="px-6 py-3">Check-in Pagi</th>
                      <th className="px-6 py-3">Check-out Sore</th>
                      <th className="px-6 py-3">Tugas</th>
                      <th className="px-6 py-3 text-right">Bendera Kepatuhan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-slate-350">
                    {dashboardData.attendanceList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-slate-500 italic">
                          Tidak ada data check-in dalam rentang tanggal ini.
                        </td>
                      </tr>
                    ) : (
                      dashboardData.attendanceList.map((a: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/30">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-white">{a.user.fullName}</div>
                            <div className="text-[10px] text-slate-500">{a.user.roleCode} ({a.user.deptName})</div>
                          </td>
                          <td className="px-6 py-4">
                            <div>{new Date(a.date).toLocaleDateString()}</div>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-950 text-sky-400 border border-slate-800 uppercase font-mono mt-1 inline-block">
                              {a.workStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono font-semibold text-slate-300">
                            {a.checkinTime ? new Date(a.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="px-6 py-4 font-mono font-semibold text-slate-300">
                            {a.checkoutTime ? new Date(a.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-300">{a.tasksCount} Tasks</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {a.flags.late && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase font-mono">
                                  Telat
                                </span>
                              )}
                              {a.flags.auto && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase font-mono">
                                  Auto
                                </span>
                              )}
                              {a.flags.offline && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 uppercase font-mono">
                                  Offline
                                </span>
                              )}
                              {!a.flags.geofence_ok && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-450 border border-rose-500/20 uppercase font-mono">
                                  GPS Gagal
                                </span>
                              )}
                              {a.flags.noEvidence && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-red-500/10 text-red-500 border border-red-500/20 uppercase font-mono">
                                  Evidence Hilang
                                </span>
                              )}
                              {!a.flags.late && !a.flags.auto && !a.flags.offline && a.flags.geofence_ok && !a.flags.noEvidence && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-mono">
                                  Patuh
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Blocker Aging lists */}
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Blocker Aktif Terbuka (Aging Terlama)</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-805 bg-slate-900/40">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-900/60">
                        <th className="px-6 py-3">Task Code</th>
                        <th className="px-6 py-3">Judul Task</th>
                        <th className="px-6 py-3">Deskripsi Hambatan</th>
                        <th className="px-6 py-3">Dilaporkan Oleh</th>
                        <th className="px-6 py-3">Umur Blocker</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-350">
                      {dashboardData.blockerAging.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-slate-500 italic">
                            Tidak ada blocker aktif saat ini.
                          </td>
                        </tr>
                      ) : (
                        dashboardData.blockerAging.map((b: any) => (
                          <tr key={b.id} className="hover:bg-slate-900/30">
                            <td className="px-6 py-4 font-mono font-bold text-red-400">{b.taskCode}</td>
                            <td className="px-6 py-4 font-semibold text-slate-205">{b.taskTitle}</td>
                            <td className="px-6 py-4 italic text-slate-300">"{b.description}"</td>
                            <td className="px-6 py-4 font-semibold text-white">{b.reporterName}</td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                b.daysOpen >= 3 ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' : 'bg-slate-800 text-slate-300'
                              }`}>
                                {b.daysOpen} Hari
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* PROGRAM/CTO DASHBOARD */
          <div className="space-y-6">
            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Karyawan Hadir Hari Ini</span>
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-bold text-white font-mono">{dashboardData.metrics.totalHadir} Orang</span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    ({dashboardData.metrics.wfoCount} WFO / {dashboardData.metrics.wfhCount} WFH / {dashboardData.metrics.onsiteCount} Onsite)
                  </span>
                </div>
              </div>
              
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Blocker Aktif Terbuka</span>
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-red-400 font-mono">{dashboardData.metrics.openBlockersCount} Blocker</span>
                </div>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Total Hari Ini Anomali</span>
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-amber-500 font-mono">{dashboardData.metrics.anomaliesCount} Kasus</span>
                </div>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Health Index Standup</span>
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-emerald-400 font-mono">
                    {dashboardData.metrics.totalHadir > 0 
                      ? Math.round(((dashboardData.metrics.totalHadir - dashboardData.metrics.anomaliesCount) / dashboardData.metrics.totalHadir) * 100)
                      : 100}%
                  </span>
                </div>
              </div>
            </div>

            {/* Sprint Completion RAG status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/60 border border-slate-805 p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-bold text-white">Progres Penyelesaian Sprint (Weighted)</h3>
                <div className="space-y-4">
                  {dashboardData.sprintMetrics.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Belum ada Sprint terdaftar.</p>
                  ) : (
                    dashboardData.sprintMetrics.map((s: any) => (
                      <div key={s.id} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-300">
                          <span>{s.projectName} - <span className="font-bold text-white">{s.name}</span></span>
                          <span className="font-mono">{s.progress}%</span>
                        </div>
                        {/* Progress Bar with RAG Colors */}
                        <div className="w-full h-3 bg-slate-950 rounded-full border border-slate-850 overflow-hidden flex">
                          <div 
                            className={`h-full transition-all rounded-full ${
                              s.rag === 'GREEN' ? 'bg-emerald-500 shadow shadow-emerald-500/20' :
                              s.rag === 'YELLOW' ? 'bg-amber-500 shadow shadow-amber-500/20' :
                              s.rag === 'RED' ? 'bg-red-500 shadow shadow-red-500/20' :
                              'bg-black border border-red-500/60 shadow shadow-red-500/30' // BLACK RAG
                            }`}
                            style={{ width: `${s.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500">
                          <span>Target: {new Date(s.endDate).toLocaleDateString()}</span>
                          <span className={`font-bold ${
                            s.rag === 'GREEN' ? 'text-emerald-400' :
                            s.rag === 'YELLOW' ? 'text-amber-400' :
                            s.rag === 'RED' ? 'text-red-400' : 'text-red-500 font-extrabold animate-pulse'
                          }`}>
                            {s.rag} STATUS
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Functional Role Completion RAG status */}
              <div className="bg-slate-900/60 border border-slate-805 p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-bold text-white">Penyelesaian Aktif Per Peran Fungsional</h3>
                <div className="space-y-4">
                  {dashboardData.roleMetrics.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Tidak ada tugas aktif dalam sprint saat ini.</p>
                  ) : (
                    dashboardData.roleMetrics.map((r: any) => (
                      <div key={r.code} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-350">
                          <span>{r.name} ({r.code})</span>
                          <span className="font-mono text-white">{r.progress}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-950 rounded-full border border-slate-850 overflow-hidden">
                          <div 
                            className={`h-full transition-all rounded-full ${
                              r.rag === 'GREEN' ? 'bg-emerald-500' :
                              r.rag === 'YELLOW' ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${r.progress}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Task Status Distribution */}
            <div className="bg-slate-900/60 border border-slate-805 p-6 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white">Sebaran Distribusi Status Tugas</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {dashboardData.statusDistribution.map((sd: any, idx: number) => (
                  <div key={idx} className="bg-slate-950 border border-slate-850 p-4 rounded-xl text-center space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                      {sd.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xl font-bold text-white font-mono">{sd.count} Tasks</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ONBOARDING PWA POPUP */}
        {onboardingOpen && (
          <div className="fixed inset-0 bg-slate-955/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-805 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-850 shrink-0">
                <h2 className="text-base font-bold text-white">🚀 Selamat Datang di HWMS Indotek PWA Onboarding</h2>
                <p className="text-xs text-slate-400 mt-1">Selesaikan setup perangkat Anda agar sistem absensi berjalan optimal.</p>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
                {/* 1. Add to Home Screen Instructions */}
                <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">Langkah 1: Tambah ke Layar Utama (Instal PWA)</span>
                  <div className="space-y-1 text-slate-300">
                    <p className="font-semibold text-white">📱 Untuk Perangkat iOS (iPhone/Safari):</p>
                    <p className="pl-4">Ketuk tombol <span className="font-bold text-white">Bagikan (Share icon)</span> di bagian bawah Safari → Pilih <span className="font-bold text-white">'Tambah ke Layar Utama' (Add to Home Screen)</span>.</p>
                    
                    <p className="font-semibold text-white mt-3">🤖 Untuk Perangkat Android (Chrome):</p>
                    <p className="pl-4">Ketuk tombol menu <span className="font-bold text-white">tiga titik</span> di pojok kanan atas → Pilih <span className="font-bold text-white">'Instal Aplikasi'</span> atau <span className="font-bold text-white">'Tambahkan ke Layar Utama'</span>.</p>
                  </div>
                </div>

                {/* 2. Permission Triggers */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">Langkah 2: Izin Perangkat</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        const perm = await Notification.requestPermission();
                        alert(perm === 'granted' ? 'Izin notifikasi disetujui!' : 'Izin notifikasi ditolak.');
                      }}
                      className="p-3 bg-slate-950 border border-slate-850 hover:bg-slate-900 rounded-xl text-center font-bold text-slate-200"
                    >
                      🔔 Izin Notifikasi
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const s = await navigator.mediaDevices.getUserMedia({ video: true });
                          s.getTracks().forEach(track => track.stop());
                          alert('Kamera terverifikasi aktif!');
                        } catch (e) {
                          alert('Gagal mengakses kamera. Silakan periksa izin browser.');
                        }
                      }}
                      className="p-3 bg-slate-950 border border-slate-850 hover:bg-slate-900 rounded-xl text-center font-bold text-slate-200"
                    >
                      📷 Tes Kamera Selfie
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.geolocation.getCurrentPosition(
                          () => alert('GPS terverifikasi aktif!'),
                          () => alert('Gagal mengakses lokasi. Silakan aktifkan GPS perangkat.')
                        );
                      }}
                      className="p-3 bg-slate-950 border border-slate-850 hover:bg-slate-900 rounded-xl text-center font-bold text-slate-200"
                    >
                      📍 Tes GPS Lokasi
                    </button>
                  </div>
                </div>

                {/* 3. Privacy Policy Principle */}
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-450 rounded-xl">
                  <span className="font-bold block mb-1">🔒 Prinsip Komitmen Privasi</span>
                  Kamera dan GPS hanya diakses saat Anda mengonfirmasi Check-in atau Check-out absensi mandiri. Koordinat GPS Anda dianalisis secara lokal di browser dan backend untuk keperluan validasi WFO/ONSITE dan <span className="font-semibold text-white">tidak pernah dilacak di latar belakang secara diam-diam.</span>
                </div>
              </div>

              <div className="p-6 border-t border-slate-850 flex justify-end bg-slate-900/60 shrink-0">
                <button
                  type="button"
                  onClick={handleOnboardingComplete}
                  className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-6 py-2.5 rounded-lg flex items-center gap-1.5"
                >
                  Saya Mengerti & Selesai
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HR PAYROLL ATTENDANCE EXPORT MODAL */}
        {exportModalOpen && (
          <div className="fixed inset-0 bg-slate-955/85 backdrop-blur flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-805 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-850 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Ekspor Laporan Absensi (Payroll)</h3>
                <button onClick={() => setExportModalOpen(false)} className="text-slate-405 hover:text-white"><X className="h-5 w-5" /></button>
              </div>

              <form onSubmit={handleTriggerExport}>
                <div className="p-6 space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal Mulai</label>
                      <input
                        type="date" required
                        className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
                        value={exportDateFrom}
                        onChange={e => setExportDateFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal Selesai</label>
                      <input
                        type="date" required
                        className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
                        value={exportDateTo}
                        onChange={e => setExportDateTo(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Proses ini akan mengekstrak detail kehadiran, durasi kerja, keterlambatan, auto-checkout, dan cuti untuk seluruh karyawan.
                  </p>
                </div>

                <div className="p-6 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/60 shrink-0">
                  <button
                    type="submit" disabled={submittingExport}
                    className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-lg flex items-center gap-1.5"
                  >
                    {submittingExport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Ekspor Laporan'}
                  </button>
                  <button type="button" onClick={() => setExportModalOpen(false)} className="bg-slate-800 text-slate-400 font-bold text-xs px-5 py-2.5 rounded border border-slate-700">Batal</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 1. Checkin Form Render (Satu layar scrollable)
  const renderCheckinForm = (activeSprintTasks: any[], carryOverTasks: any[]) => {
    const allTasks = [...carryOverTasks.map(t => ({ ...t, isCarryOver: true })), ...activeSprintTasks.map(t => ({ ...t, isCarryOver: false }))];

    return (
      <form onSubmit={handleCheckinSubmit} className="max-w-xl mx-auto space-y-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-white">Check-in Kehadiran & Standup</h2>
            <p className="text-xs text-slate-400 mt-1">Mulai aktivitas kerja harian Anda.</p>
          </div>
          <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg">
            IN SESSION
          </span>
        </div>

        {/* 1. Pill Select Work Status */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status Kerja</label>
          <div className="grid grid-cols-3 gap-3">
            {['WFO', 'WFH', 'ONSITE'].map((ws) => (
              <button
                key={ws} type="button"
                onClick={() => setCheckinWorkStatus(ws)}
                className={`py-3 rounded-lg text-xs font-bold border transition-all ${
                  checkinWorkStatus === ws 
                    ? 'bg-sky-500 border-sky-500 text-white shadow-lg shadow-sky-500/10' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {ws === 'WFO' ? '🏢 WFO' : ws === 'WFH' ? '🏠 WFH' : '📍 ONSITE'}
              </button>
            ))}
          </div>
        </div>

        {/* 1.1 Client Project Selection for ONSITE */}
        {checkinWorkStatus === 'ONSITE' && (
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Project Klien ONSITE (Wajib)</label>
            <select
              required
              className="w-full rounded-lg border border-slate-800 bg-slate-955 px-3.5 py-3 text-xs text-white focus:outline-none"
              value={checkinClientProjectId}
              onChange={e => setCheckinClientProjectId(e.target.value)}
            >
              <option value="">Pilih Project Klien</option>
              {projectsList.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* 2. Front Camera Component */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Foto Selfie Pagi (Wajib)</label>
          <div className="relative border border-slate-800 rounded-xl overflow-hidden bg-slate-955 h-56 flex flex-col items-center justify-center">
            {selfiePreview ? (
              <>
                <img src={selfiePreview} alt="Selfie Preview" className="h-full w-full object-cover" />
                <button
                  type="button" onClick={startCamera}
                  className="absolute bottom-3 right-3 bg-slate-950/80 hover:bg-slate-950 text-white rounded-lg p-2 text-xs font-bold border border-slate-800"
                >
                  Ulangi Foto
                </button>
              </>
            ) : cameraActive ? (
              <>
                <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted />
                <button
                  type="button" onClick={capturePhoto}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-sky-500 hover:bg-sky-600 text-white rounded-full p-3 shadow-lg shadow-sky-500/20"
                >
                  <Camera className="h-6 w-6" />
                </button>
              </>
            ) : (
              <div className="text-center space-y-3">
                <Camera className="h-10 w-10 text-slate-650 mx-auto" />
                <button
                  type="button" onClick={startCamera}
                  className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg"
                >
                  Nyalakan Kamera
                </button>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        {/* 3. Task Sprint Checkbox List */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Daftar Rencana Tugas Hari Ini (Maks 5)</label>
            <span className="text-[10px] text-slate-400 font-bold">
              {Object.values(checkinSelectedTaskIds).filter(Boolean).length} Terpilih
            </span>
          </div>

          {allTasks.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-3 bg-slate-955 rounded-lg border border-slate-850">
              Tidak ada tugas aktif di sprint ini untuk Anda.
            </p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto border border-slate-800 rounded-xl p-3 bg-slate-955">
              {allTasks.map(t => (
                <div key={t.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-850/60 hover:bg-slate-850/30 transition-all">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-800 bg-slate-950 text-sky-500 focus:ring-0"
                      checked={!!checkinSelectedTaskIds[t.id]}
                      onChange={e => setCheckinSelectedTaskIds({ ...checkinSelectedTaskIds, [t.id]: e.target.checked })}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-mono font-bold text-slate-500">{t.code}</span>
                        {t.isCarryOver && (
                          <span className="text-[8px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded uppercase">
                            Carry-over
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-200 font-semibold block mt-0.5 truncate">{t.title}</span>
                    </div>
                  </label>

                  {/* Optional short note per task */}
                  {checkinSelectedTaskIds[t.id] && (
                    <input
                      type="text"
                      className="mt-2 w-full rounded border border-slate-800 bg-slate-955 px-2 py-1 text-[11px] text-white focus:outline-none placeholder-slate-650"
                      placeholder="Tambahkan catatan khusus tugas ini pagi ini (opsional)..."
                      value={checkinTaskNotes[t.id] || ''}
                      onChange={e => setCheckinTaskNotes({ ...checkinTaskNotes, [t.id]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Blocker Input (Optional) */}
        <div className="space-y-3 p-4 bg-slate-955 border border-slate-850 rounded-xl">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-350 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-800 bg-slate-950 text-sky-500 focus:ring-0"
              checked={hasBlocker}
              onChange={e => setHasBlocker(e.target.checked)}
            />
            <span>Apakah ada Blocker (Kendala)?</span>
          </label>

          {hasBlocker && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase">Task Terhambat</label>
                <select
                  required
                  className="mt-1.5 w-full rounded border border-slate-800 bg-slate-900 px-2.5 py-2 text-xs text-white focus:outline-none"
                  value={blockerTaskId}
                  onChange={e => setBlockerTaskId(e.target.value)}
                >
                  <option value="">Pilih Task Terhambat</option>
                  {allTasks.map(t => (
                    <option key={t.id} value={t.id}>{t.code} - {t.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase">Deskripsi Kendala</label>
                <textarea
                  required
                  rows={2}
                  className="mt-1.5 w-full rounded border border-slate-800 bg-slate-900 px-2.5 py-2 text-xs text-white focus:outline-none placeholder-slate-600"
                  placeholder="Ceritakan blocker atau hambatan teknis..."
                  value={blockerDescription}
                  onChange={e => setBlockerDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase flex justify-between">
                  <span>Mention Rekan Setim (Untuk koordinasi)</span>
                  <span className="text-[8px] text-slate-500 font-bold uppercase">Multi-select</span>
                </label>
                <select
                  multiple
                  className="mt-1.5 w-full rounded border border-slate-800 bg-slate-900 px-2.5 py-2 text-xs text-white focus:outline-none min-h-[60px]"
                  value={blockerMentions}
                  onChange={e => {
                    const options = e.target.options;
                    const selected: string[] = [];
                    for (let i = 0; i < options.length; i++) {
                      if (options[i].selected) selected.push(options[i].value);
                    }
                    setBlockerMentions(selected);
                  }}
                >
                  {usersList.map(usr => (
                    <option key={usr.id} value={usr.id}>{usr.full_name} ({usr.email})</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 5. Daily Note */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Catatan Harian Check-in</label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-slate-800 bg-slate-955 px-3.5 py-2.5 text-xs text-white focus:outline-none placeholder-slate-650"
            placeholder="Hari ini berencana fokus pada..."
            value={checkinDailyNote}
            onChange={e => setCheckinDailyNote(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-lg text-sm transition-all shadow-lg shadow-sky-500/10 active:scale-[0.99]"
        >
          Kirim Check-in (Pagi)
        </button>
      </form>
    );
  };

  // 2. Checkout Form Render
  const renderCheckoutForm = (todayCheckin: any, activeSprintTasks: any[], carryOverTasks: any[]) => {
    const allTasks = [...carryOverTasks, ...activeSprintTasks];

    return (
      <form onSubmit={handleCheckoutSubmit} className="max-w-xl mx-auto space-y-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-white">Check-out Kehadiran & Standup</h2>
            <p className="text-xs text-slate-400 mt-1">Laporkan progres dan selesaikan hari kerja Anda.</p>
          </div>
          <span className="text-[10px] font-bold bg-rose-500/15 text-rose-455 border border-rose-500/20 px-2.5 py-1 rounded-lg">
            OUT SESSION
          </span>
        </div>

        {/* Check-in Info */}
        <div className="p-4 bg-slate-955 border border-slate-850 rounded-xl text-xs space-y-2">
          <div className="flex justify-between text-slate-450">
            <span>Check-in Pagi:</span>
            <span className="font-semibold text-white">
              {new Date(todayCheckin.device_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex justify-between text-slate-450">
            <span>Status Kerja:</span>
            <span className="font-bold text-sky-400 uppercase">{todayCheckin.work_status}</span>
          </div>
        </div>

        {/* 1. Checklist of morning tasks with slider % complete */}
        <div className="space-y-3">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Perbarui Progres Tugas Hari Ini</label>
          
          {allTasks.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-3 bg-slate-955 rounded-lg border border-slate-850">
              Tidak ada rencana tugas pagi ini.
            </p>
          ) : (
            <div className="space-y-4 max-h-72 overflow-y-auto border border-slate-800 rounded-xl p-3.5 bg-slate-955 divide-y divide-slate-850">
              {allTasks.map((t, idx) => {
                const currentPercent = checkoutTaskPercents[t.id] ?? t.percent_complete;
                const currentStatus = checkoutTaskStatuses[t.id] || t.status;

                return (
                  <div key={t.id} className={`space-y-3 ${idx > 0 ? 'pt-4' : ''}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-[9px] font-mono font-bold text-slate-500">{t.code}</span>
                        <span className="text-xs text-slate-200 font-semibold block mt-0.5">{t.title}</span>
                      </div>
                      
                      {/* Status Dropdown */}
                      <select
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                        value={currentStatus}
                        onChange={e => setCheckoutTaskStatuses({ ...checkoutTaskStatuses, [t.id]: e.target.value })}
                      >
                        {Object.values(TaskStatus).map(st => (
                          <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>

                    {/* Progress Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-slate-450">Kemajuan:</span>
                        <span className="text-sky-400">{currentPercent}%</span>
                      </div>
                      <input
                        type="range" min="0" max="100" step="5"
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                        value={currentPercent}
                        onChange={e => setCheckoutTaskPercents({ ...checkoutTaskPercents, [t.id]: parseInt(e.target.value) })}
                      />
                    </div>

                    {/* Optional evidence url/file input */}
                    <div className="space-y-1">
                      <label className="block text-[9px] font-semibold text-slate-500 uppercase">Tautan Bukti Hasil (Evidence Link / PR)</label>
                      <input
                        type="url"
                        className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-[11px] text-white placeholder-slate-700 focus:outline-none"
                        placeholder="https://github.com/indotek/hwms/pull/..."
                        value={checkoutTaskEvidences[t.id] || ''}
                        onChange={e => setCheckoutTaskEvidences({ ...checkoutTaskEvidences, [t.id]: e.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Selfie Camera Capture */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Foto Selfie Sore (Wajib)</label>
          <div className="relative border border-slate-800 rounded-xl overflow-hidden bg-slate-955 h-56 flex flex-col items-center justify-center">
            {selfiePreview ? (
              <>
                <img src={selfiePreview} alt="Selfie Preview" className="h-full w-full object-cover" />
                <button
                  type="button" onClick={startCamera}
                  className="absolute bottom-3 right-3 bg-slate-950/80 hover:bg-slate-950 text-white rounded-lg p-2 text-xs font-bold border border-slate-800"
                >
                  Ulangi Foto
                </button>
              </>
            ) : cameraActive ? (
              <>
                <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted />
                <button
                  type="button" onClick={capturePhoto}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-sky-500 hover:bg-sky-600 text-white rounded-full p-3 shadow-lg shadow-sky-500/20"
                >
                  <Camera className="h-6 w-6" />
                </button>
              </>
            ) : (
              <div className="text-center space-y-3">
                <Camera className="h-10 w-10 text-slate-650 mx-auto" />
                <button
                  type="button" onClick={startCamera}
                  className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg"
                >
                  Nyalakan Kamera
                </button>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        {/* 3. Daily Note */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Catatan Harian Check-out (Daily Summary)</label>
          <textarea
            rows={2.5}
            className="w-full rounded-lg border border-slate-800 bg-slate-955 px-3.5 py-2.5 text-xs text-white focus:outline-none placeholder-slate-650"
            placeholder="Hari ini berhasil menyelesaikan..."
            value={checkoutDailyNote}
            onChange={e => setCheckoutDailyNote(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 rounded-lg text-sm transition-all shadow-lg shadow-rose-600/10 active:scale-[0.99]"
        >
          Kirim Check-out (Sore)
        </button>
      </form>
    );
  };

  const renderTaskView = () => {
    const ragColors: Record<string, string> = {
      GREEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      YELLOW: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      RED: 'bg-red-500/20 text-red-400 border-red-500/30',
      BLACK: 'bg-slate-955 text-rose-500 border-rose-900 border-2'
    };

    const activeAgg = sprintAggregations[myTasksFilterSprint] || { progressPct: 0, rag: 'GREEN' };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-white">Daftar Tugas Saya & Tim</h1>
            <p className="text-xs text-slate-400 mt-1">Kelola progres sprint tugas Anda, lihat tugas rekan kerja sebagai referensi.</p>
          </div>
          
          {myTasksFilterSprint && (
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block">Progress Sprint Terpilih:</span>
                <span className="font-bold text-white">{activeAgg.progressPct}%</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${ragColors[activeAgg.rag]}`}>
                {activeAgg.rag}
              </span>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap gap-4 items-center justify-between text-xs">
          <div className="flex flex-wrap gap-3 items-center">
            <Filter className="h-4 w-4 text-slate-500" />
            
            <select
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none"
              value={myTasksFilterSprint}
              onChange={e => setMyTasksFilterSprint(e.target.value)}
            >
              <option value="">Pilih Sprint</option>
              {sprintsList.map(s => (
                <option key={s.id} value={s.id}>Sprint #{s.number} ({s.project?.name})</option>
              ))}
            </select>

            <select
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none"
              value={myTasksFilterStatus}
              onChange={e => setMyTasksFilterStatus(e.target.value)}
            >
              <option value="">Semua Status</option>
              {['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED'].map(st => (
                <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
              ))}
            </select>

            <select
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none"
              value={myTasksFilterPriority}
              onChange={e => setMyTasksFilterPriority(e.target.value)}
            >
              <option value="">Semua Prioritas</option>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase bg-slate-900/60">
                <th className="px-6 py-3">Kode / Tugas</th>
                <th className="px-6 py-3">Owner (Penanggung Jawab)</th>
                <th className="px-6 py-3">Workstream</th>
                <th className="px-6 py-3">Priority / Weight</th>
                <th className="px-6 py-3">Status / % Complete</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
              {tasksList.map((tsk: any) => {
                const currentOwner = tsk.assignments && tsk.assignments.length > 0 ? tsk.assignments[0].user : null;
                const isMine = currentOwner?.id === user.id;

                return (
                  <tr key={tsk.id} className={`hover:bg-slate-900/30 ${isMine ? 'bg-sky-950/5 border-l-2 border-l-sky-500' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="font-mono text-[10px] font-bold text-slate-500">{tsk.code}</div>
                      <div className="font-bold text-white mt-0.5">{tsk.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Target: {new Date(tsk.planned_end).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4">
                      {currentOwner ? (
                        <div>
                          <div className="font-semibold text-white">{currentOwner.full_name}</div>
                          <div className="text-[10px] text-slate-500">{currentOwner.email}</div>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">TBD</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400">{tsk.workstream}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                          tsk.priority === 'CRITICAL' ? 'bg-red-600 text-white' :
                          tsk.priority === 'HIGH' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          tsk.priority === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {tsk.priority}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">w={tsk.weight}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isMine ? (
                        <div className="flex items-center gap-2">
                          <select
                            className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none"
                            value={tsk.status}
                            onChange={e => handleUpdateTaskStatusAndProgress(tsk.id, e.target.value, tsk.percent_complete)}
                          >
                            {['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED'].map(st => (
                              <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                          <input
                            type="number" min="0" max="100"
                            className="w-12 bg-slate-955 border border-slate-800 rounded px-1 py-0.5 text-center text-white"
                            value={tsk.percent_complete}
                            onChange={e => handleUpdateTaskStatusAndProgress(tsk.id, tsk.status, parseInt(e.target.value) || 0)}
                          />
                          <span className="text-[10px] text-slate-500">%</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="font-semibold text-slate-400 uppercase text-[10px]">{tsk.status.replace(/_/g, ' ')}</span>
                          <div className="text-[10px] text-slate-500 font-mono">{tsk.percent_complete}% Selesai</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(user.roles.includes('PM_ADMIN') || user.roles.includes('SUPER_ADMIN')) && (
                        <button 
                          onClick={() => openAssignModal(tsk)}
                          className="p-1 bg-slate-800 hover:bg-slate-750 text-slate-350 hover:text-white rounded text-[10px] font-semibold border border-slate-755 px-2 py-1"
                        >
                          Assign
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Assign Owner modal — must be mounted in this view too, not only in
            renderAdminView, otherwise the Assign button here opens nothing. */}
        {assignModalOpen && renderAssignModal()}
      </div>
    );
  };

  const renderAdminView = () => {
    const subtabs = [
      { id: 'users', label: 'Pengguna' },
      { id: 'locations', label: 'Lokasi' },
      { id: 'holidays', label: 'Hari Libur' },
      { id: 'projects', label: 'Proyek & Sprint' },
      { id: 'tasks', label: 'Daftar Tugas (Task)' },
      { id: 'departments', label: 'Departemen' },
      { id: 'teams', label: 'Tim' },
      { id: 'roles', label: 'Peran Fungsional' },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Panel Administrasi (Master Data)</h1>
          <p className="text-xs text-slate-400 mt-1">Kelola data master organisasi, lokasi kantor, dan kebijakan kalender nasional.</p>
        </div>

        <div className="flex border-b border-slate-800 gap-6 shrink-0 overflow-x-auto pb-1">
          {subtabs.map(tab => (
            <button
              key={tab.id} onClick={() => setAdminSubTab(tab.id)}
              className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all whitespace-nowrap ${
                adminSubTab === tab.id ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-350'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div>
          {adminSubTab === 'users' && renderUsersSubTab()}
          {adminSubTab === 'locations' && renderLocationsSubTab()}
          {adminSubTab === 'holidays' && renderHolidaysSubTab()}
          {adminSubTab === 'projects' && renderProjectsSubTab()}
          {adminSubTab === 'tasks' && renderTasksSubTab()}
          {adminSubTab === 'departments' && renderDepartmentsSubTab()}
          {adminSubTab === 'teams' && renderTeamsSubTab()}
          {adminSubTab === 'roles' && renderRolesSubTab()}
        </div>

        {userModalOpen && renderUserModal()}
        {locationModalOpen && renderLocationModal()}
        {holidayModalOpen && renderHolidayModal()}
        {projectModalOpen && renderProjectModal()}
        {sprintModalOpen && renderSprintModal()}
        {taskModalOpen && renderTaskModal()}
        {assignModalOpen && renderAssignModal()}
        {importDrawerOpen && renderImportDrawer()}
      </div>
    );
  };

  const renderProjectsSubTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Proyek & Sprint Kerja</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => { resetProjectForm(); setProjectModalOpen(true); }}
            className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs px-3.5 py-2 rounded-lg"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Tambah Proyek
          </button>
          <button 
            onClick={() => { resetSprintForm(); setSprintModalOpen(true); }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs px-3.5 py-2 rounded-lg border border-slate-700"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Tambah Sprint
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {projectsList.map((proj: any) => {
          const sprints = sprintsList.filter(s => s.project_id === proj.id);

          return (
            <div key={proj.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-bold text-white">{proj.name}</h4>
                  <span className="font-mono text-[10px] font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded uppercase mt-1 inline-block">
                    Prefix: {proj.code_prefix}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      setSelectedProject(proj);
                      setProjectForm({ name: proj.name, codePrefix: proj.code_prefix, status: proj.status });
                      setProjectModalOpen(true);
                    }}
                    className="p-1 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-850 pt-3 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sprint List:</span>
                
                {sprints.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic">Belum ada sprint terdaftar</p>
                ) : (
                  <div className="space-y-2">
                    {sprints.map(s => {
                      const agg = sprintAggregations[s.id] || { progressPct: 0, rag: 'GREEN' };
                      const dotColors: Record<string, string> = {
                        GREEN: 'bg-emerald-500',
                        YELLOW: 'bg-amber-500',
                        RED: 'bg-red-500',
                        BLACK: 'bg-rose-500 animate-pulse'
                      };

                      return (
                        <div key={s.id} className="flex justify-between items-center bg-slate-950/30 border border-slate-850/60 p-2.5 rounded-lg text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${dotColors[agg.rag]}`}></span>
                            <span className="font-semibold text-white">Sprint #{s.number}</span>
                            <span className="text-[10px] text-slate-500">
                              ({new Date(s.start_date).toLocaleDateString()} - {new Date(s.end_date).toLocaleDateString()})
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2.5 font-bold">
                            <span className="text-[10px] text-slate-400">{agg.progressPct}% Done</span>
                            <button
                              onClick={() => {
                                setSelectedSprint(s);
                                setSprintForm({
                                  projectId: s.project_id,
                                  number: String(s.number),
                                  startDate: new Date(s.start_date).toISOString().split('T')[0],
                                  endDate: new Date(s.end_date).toISOString().split('T')[0],
                                  goal: s.goal || ''
                                });
                                setSprintModalOpen(true);
                              }}
                              className="text-slate-450 hover:text-sky-400"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTasksSubTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Daftar Seluruh Tugas (Task)</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => { resetTaskForm(); setTaskModalOpen(true); }}
            className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs px-3.5 py-2 rounded-lg"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Tambah Tugas Manual
          </button>
          <button 
            onClick={() => { setImportType('tasks'); setImportDrawerOpen(true); }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 text-slate-350 font-semibold text-xs px-3.5 py-2 rounded-lg border border-slate-700"
          >
            <Upload className="h-3.5 w-3.5" />
            Bulk Impor Tasks
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase bg-slate-900/60">
              <th className="px-6 py-3">Tugas / Kode</th>
              <th className="px-6 py-3">Project / Sprint</th>
              <th className="px-6 py-3">Owner</th>
              <th className="px-6 py-3">Role / Workstream</th>
              <th className="px-6 py-3">Progress / Status</th>
              <th className="px-6 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
            {tasksList.map((tsk: any) => {
              const currentOwner = tsk.assignments && tsk.assignments.length > 0 ? tsk.assignments[0].user : null;
              return (
                <tr key={tsk.id} className="hover:bg-slate-900/30">
                  <td className="px-6 py-4">
                    <span className="font-mono text-[10px] font-bold text-slate-500">{tsk.code}</span>
                    <div className="font-bold text-white mt-0.5">{tsk.title}</div>
                    <div className="text-[10px] text-slate-500">Duration: {new Date(tsk.planned_start).toLocaleDateString()} - {new Date(tsk.planned_end).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-white">{tsk.project?.name}</div>
                    <div className="text-[10px] text-slate-500">Sprint #{tsk.sprint?.number}</div>
                  </td>
                  <td className="px-6 py-4">
                    {currentOwner ? (
                      <div>
                        <div className="font-semibold text-white">{currentOwner.full_name}</div>
                        <div className="text-[10px] text-slate-500">{currentOwner.email}</div>
                      </div>
                    ) : (
                      <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded uppercase">TBD</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase">
                      {tsk.functional_role?.code || 'Gen'}
                    </span>
                    <div className="text-[10px] text-slate-550 mt-1">{tsk.workstream}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{tsk.percent_complete}%</div>
                    <div className="text-[10px] text-slate-500 uppercase mt-0.5">{tsk.status.replace(/_/g, ' ')}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button 
                        onClick={() => {
                          setSelectedTask(tsk);
                          setTaskForm({
                            projectId: tsk.project_id,
                            sprintId: tsk.sprint_id,
                            functionalRoleId: tsk.functional_role_id || '',
                            workstream: tsk.workstream,
                            title: tsk.title,
                            deliverable: tsk.deliverable || '',
                            priority: tsk.priority,
                            plannedStart: new Date(tsk.planned_start).toISOString().split('T')[0],
                            plannedEnd: new Date(tsk.planned_end).toISOString().split('T')[0],
                            status: tsk.status,
                            percentComplete: tsk.percent_complete,
                            weight: Number(tsk.weight),
                            riskLevel: tsk.risk_level,
                            notes: tsk.notes || ''
                          });
                          setTaskModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-sky-400 hover:bg-slate-805 rounded"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={async () => {
                          if (confirm('Apakah Anda yakin ingin menghapus tugas ini?')) {
                            await fetch(`${API_URL}/tasks/${tsk.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                            fetchAdminMasterData();
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-805 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderImportDrawer = () => (
    <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-slate-900 border-l border-slate-850 shadow-2xl flex flex-col z-50 overflow-hidden">
      <div className="p-6 border-b border-slate-850 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-sky-400" />
          <h3 className="text-base font-bold text-white">
            {importType === 'users' ? 'Impor Karyawan via Excel' : 'Impor Sprint Tasks via Excel'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 border border-slate-750 hover:border-sky-500/50 bg-slate-950 px-3 py-1.5 rounded-lg"
          >
            <Download className="h-4 w-4" />
            Unduh Template
          </button>
          <button
            onClick={() => { setImportPreview(null); setImportDrawerOpen(false); }}
            className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {importCommitMessage ? (
          <div className="flex flex-col items-center justify-center h-60 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-bounce" />
            <div>
              <h4 className="font-bold text-white">Proses Impor Berhasil!</h4>
              <p className="text-xs text-slate-400 mt-1">{importCommitMessage}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-2 text-xs text-slate-400">
              <span className="font-bold text-slate-200 block mb-1">Panduan Pengisian Sheet Excel:</span>
              <p>Kolom wajib diisi pada Sheet 1:</p>
              {importType === 'users' ? (
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li><span className="text-slate-200">Email:</span> Alamat email berakhiran domain perusahaan.</li>
                  <li><span className="text-slate-200">Nama Lengkap:</span> Nama sesuai KTP.</li>
                  <li><span className="text-slate-200">NIK:</span> Nomor Induk Karyawan unik.</li>
                  <li><span className="text-slate-200">Departemen:</span> Nama departemen valid.</li>
                  <li><span className="text-slate-200">Peran Fungsional:</span> Kode peran valid (BE, FE, QA, dll).</li>
                  <li><span className="text-slate-200">Email Atasan:</span> Email atasan langsung.</li>
                  <li><span className="text-slate-200">Sandi:</span> Sandi default.</li>
                </ul>
              ) : (
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li><span className="text-slate-200">Task:</span> Judul deskripsi tugas.</li>
                  <li><span className="text-slate-200">Sprint:</span> Nomor sprint (angka, e.g. 1).</li>
                  <li><span className="text-slate-200">Planned Start & Planned End:</span> Tanggal rencana.</li>
                  <li><span className="text-slate-200">Role:</span> Kode peran fungsional (e.g. BE).</li>
                  <li><span className="text-slate-200">Owner:</span> Email owner (atau 'TBD' jika belum ditetapkan).</li>
                  <li><span className="text-slate-200">Weight:</span> Bobot tugas (float, e.g. 1.5).</li>
                </ul>
              )}
            </div>

            {importType === 'tasks' && (
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Proyek Sasaran</label>
                <select
                  required
                  className="w-full rounded-lg border border-slate-805 bg-slate-955 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={importSelectedProjectId}
                  onChange={e => setImportSelectedProjectId(e.target.value)}
                >
                  <option value="">Pilih Proyek Sasaran</option>
                  {projectsList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">File Spreadsheet (.xlsx)</label>
              <div 
                onClick={() => {
                  if (importType === 'tasks' && !importSelectedProjectId) {
                    alert('Silakan pilih proyek sasaran terlebih dahulu!');
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                className="border-2 border-dashed border-slate-800 rounded-xl p-8 bg-slate-950/20 hover:bg-slate-950/40 cursor-pointer flex flex-col items-center justify-center transition-all"
              >
                <Upload className="h-8 w-8 text-slate-500" />
                <span className="text-xs font-semibold text-slate-350 mt-3">Pilih file Excel Anda</span>
                <span className="text-[10px] text-slate-500 mt-1">Hanya mendukung format xlsx</span>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".xlsx" 
                  className="hidden" 
                />
              </div>
            </div>

            {importLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
              </div>
            )}

            {importPreview && (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-300">Hasil Pratinjau (Preview)</span>
                  <div className="flex gap-3 font-semibold">
                    <span className="text-emerald-400">{importPreview.valid} Valid</span>
                    <span className="text-red-400">{importPreview.invalid} Gagal (Akan Dilewati)</span>
                  </div>
                </div>

                <div className="border border-slate-850 rounded-xl overflow-hidden divide-y divide-slate-850">
                  {importPreview.rows.map((row: any, index: number) => (
                    <div key={index} className={`p-4 text-xs ${row.isValid ? 'bg-slate-950/20' : 'bg-red-950/10 border-l-4 border-l-red-500'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-white">{row.title || 'Tanpa Judul'}</span>
                          {importType === 'tasks' && <span className="text-[10px] text-slate-500 ml-2">Sprint #{row.sprintNumber}</span>}
                        </div>
                        {row.isValid ? (
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase">Ready</span>
                        ) : (
                          <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded uppercase">Error</span>
                        )}
                      </div>
                      <div className="flex gap-4 text-[10px] text-slate-400 mt-2 font-mono">
                        {importType === 'users' ? (
                          <>
                            <div>NIK: <span className="text-white">{row.nik || '-'}</span></div>
                            <div>Dept: <span className="text-sky-400">{row.departmentName || '-'}</span></div>
                          </>
                        ) : (
                          <>
                            <div>Owner: <span className="text-white">{row.ownerEmail || 'TBD'}</span></div>
                            <div>Bobot (Weight): <span className="text-sky-400">{row.weight}</span></div>
                          </>
                        )}
                      </div>
                      {row.errors.length > 0 && (
                        <div className="mt-2.5 p-2 bg-red-950/40 border border-red-900/30 rounded text-[10px] text-red-400 space-y-1">
                          {row.errors.map((err: string, i: number) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!importCommitMessage && importPreview && (
        <div className="p-6 border-t border-slate-850 bg-slate-900/80 shrink-0 flex gap-3">
          <button 
            onClick={handleCommitImport}
            disabled={importPreview.valid === 0 || importLoading}
            className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-xs py-3 rounded-lg text-center"
          >
            Commit & Simpan {importPreview.valid} Baris (Daftar Gagal Diabaikan)
          </button>
          <button 
            onClick={() => { setImportPreview(null); }}
            className="px-6 bg-slate-855 text-slate-400 font-bold text-xs py-3 rounded-lg text-center border border-slate-800"
          >
            Batal
          </button>
        </div>
      )}
    </div>
  );

  const renderProjectModal = () => (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{selectedProject ? 'Ubah Proyek' : 'Tambah Proyek Baru'}</h3>
          <button onClick={() => setProjectModalOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSaveProject}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Nama Proyek</label>
              <input 
                type="text" required
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                placeholder="Core Platform Revamp"
                value={projectForm.name}
                onChange={e => setProjectForm({ ...projectForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Prefix Kode Tugas (e.g. CORE, HW)</label>
              <input 
                type="text" required
                disabled={!!selectedProject}
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none disabled:opacity-50"
                placeholder="CORE"
                value={projectForm.codePrefix}
                onChange={e => setProjectForm({ ...projectForm, codePrefix: e.target.value })}
              />
            </div>
          </div>

          <div className="p-6 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/60 shrink-0">
            <button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg">Simpan</button>
            <button type="button" onClick={() => setProjectModalOpen(false)} className="bg-slate-800 text-slate-400 font-bold text-xs px-5 py-2.5 rounded border border-slate-700">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderSprintModal = () => (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{selectedSprint ? 'Ubah Sprint' : 'Tambah Sprint Baru'}</h3>
          <button onClick={() => setSprintModalOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSaveSprint}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Pilih Proyek</label>
              <select
                required
                disabled={!!selectedSprint}
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none disabled:opacity-50"
                value={sprintForm.projectId}
                onChange={e => setSprintForm({ ...sprintForm, projectId: e.target.value })}
              >
                <option value="">Pilih Proyek</option>
                {projectsList.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Nomor Sprint (e.g. 1, 2)</label>
              <input 
                type="number" required
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                placeholder="1"
                value={sprintForm.number}
                onChange={e => setSprintForm({ ...sprintForm, number: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Tanggal Mulai</label>
                <input 
                  type="date" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={sprintForm.startDate}
                  onChange={e => setSprintForm({ ...sprintForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Tanggal Selesai</label>
                <input 
                  type="date" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={sprintForm.endDate}
                  onChange={e => setSprintForm({ ...sprintForm, endDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Goal / Deskripsi Target</label>
              <input 
                type="text"
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-955 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                placeholder="Menyelesaikan pipeline CI/CD dan Autentikasi"
                value={sprintForm.goal}
                onChange={e => setSprintForm({ ...sprintForm, goal: e.target.value })}
              />
            </div>
          </div>

          <div className="p-6 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/60 shrink-0">
            <button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg">Simpan</button>
            <button type="button" onClick={() => setSprintModalOpen(false)} className="bg-slate-800 text-slate-400 font-bold text-xs px-5 py-2.5 rounded border border-slate-700">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderTaskModal = () => (
    <div className="fixed inset-0 bg-slate-955/80 backdrop-blur flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{selectedTask ? 'Ubah Tugas' : 'Tambah Tugas Baru'}</h3>
          <button onClick={() => setTaskModalOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSaveTask}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Project</label>
                <select
                  required
                  disabled={!!selectedTask}
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none disabled:opacity-50"
                  value={taskForm.projectId}
                  onChange={e => setTaskForm({ ...taskForm, projectId: e.target.value })}
                >
                  <option value="">Pilih Project</option>
                  {projectsList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Sprint</label>
                <select
                  required
                  disabled={!!selectedTask}
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none disabled:opacity-50"
                  value={taskForm.sprintId}
                  onChange={e => setTaskForm({ ...taskForm, sprintId: e.target.value })}
                >
                  <option value="">Pilih Sprint</option>
                  {sprintsList.filter(s => s.project_id === taskForm.projectId).map(s => (
                    <option key={s.id} value={s.id}>Sprint #{s.number}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Deskripsi Tugas (Task)</label>
              <input 
                type="text" required
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                placeholder="Implementasi endpoint CRUD User"
                value={taskForm.title}
                onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Planned Start</label>
                <input 
                  type="date" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.plannedStart}
                  onChange={e => setTaskForm({ ...taskForm, plannedStart: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Planned End</label>
                <input 
                  type="date" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.plannedEnd}
                  onChange={e => setTaskForm({ ...taskForm, plannedEnd: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Role Terkait</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.functionalRoleId}
                  onChange={e => setTaskForm({ ...taskForm, functionalRoleId: e.target.value })}
                >
                  <option value="">Pilih Role</option>
                  {rolesList.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Workstream</label>
                <input 
                  type="text"
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.workstream}
                  onChange={e => setTaskForm({ ...taskForm, workstream: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Bobot (Weight)</label>
                <input 
                  type="number" step="0.1" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.weight}
                  onChange={e => setTaskForm({ ...taskForm, weight: parseFloat(e.target.value) || 1.0 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Prioritas</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.priority}
                  onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}
                >
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Risk Level</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.riskLevel}
                  onChange={e => setTaskForm({ ...taskForm, riskLevel: e.target.value })}
                >
                  {['LOW', 'MEDIUM', 'HIGH'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Deliverable</label>
                <input 
                  type="text"
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-955 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.deliverable}
                  onChange={e => setTaskForm({ ...taskForm, deliverable: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Status</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-955 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.status}
                  onChange={e => setTaskForm({ ...taskForm, status: e.target.value })}
                >
                  {['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED'].map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">% Complete (0-100)</label>
                <input 
                  type="number" min="0" max="100" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-955 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={taskForm.percentComplete}
                  onChange={e => setTaskForm({ ...taskForm, percentComplete: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Catatan (Notes)</label>
              <textarea 
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-955 px-3.5 py-2 text-xs text-white focus:outline-none"
                placeholder="Opsional catatan detail tugas..."
                value={taskForm.notes}
                onChange={e => setTaskForm({ ...taskForm, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="p-6 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/60 shrink-0">
            <button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg">Simpan</button>
            <button type="button" onClick={() => setTaskModalOpen(false)} className="bg-slate-800 text-slate-400 font-bold text-xs px-5 py-2.5 rounded border border-slate-700">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderAssignModal = () => (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Assign Owner Tugas</h3>
          <button onClick={() => setAssignModalOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Pilih Karyawan</label>
            <select
              className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
              defaultValue=""
              onChange={e => {
                if (selectedTask && e.target.value) {
                  handleAssignOwner(selectedTask.id, e.target.value);
                }
              }}
            >
              <option value="">Pilih Karyawan</option>
              {usersList.map(usr => (
                <option key={usr.id} value={usr.id}>{usr.full_name} ({usr.email})</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderUserModal = () => (
    <div className="fixed inset-0 bg-slate-955/80 backdrop-blur flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-805 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-850 flex items-center justify-between bg-slate-900/60 shrink-0">
          <h3 className="text-sm font-bold text-white">{selectedUser ? 'Ubah Karyawan' : 'Tambah Karyawan Baru'}</h3>
          <button onClick={() => setUserModalOpen(false)} className="text-slate-405 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSaveUser}>
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama Lengkap</label>
              <input
                type="text" required
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                placeholder="Budi Santoso"
                value={userForm.fullName}
                onChange={e => setUserForm({ ...userForm, fullName: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Kerja</label>
                <input
                  type="email" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  placeholder="budi@indotek.com"
                  value={userForm.email}
                  onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">NIK</label>
                <input
                  type="text" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  placeholder="NIK-1234"
                  value={userForm.nik}
                  onChange={e => setUserForm({ ...userForm, nik: e.target.value })}
                />
              </div>
            </div>

            {!selectedUser && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kata Sandi</label>
                <input
                  type="password" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  placeholder="••••••••"
                  value={userForm.password}
                  onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Departemen</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={userForm.departmentId}
                  onChange={e => setUserForm({ ...userForm, departmentId: e.target.value })}
                >
                  <option value="">Pilih Departemen</option>
                  {departmentsList.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Peran Fungsional</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={userForm.functionalRoleId}
                  onChange={e => setUserForm({ ...userForm, functionalRoleId: e.target.value })}
                >
                  <option value="">Pilih Peran</option>
                  {rolesList.map(role => (
                    <option key={role.id} value={role.id}>{role.name} ({role.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Atasan Langsung (Manager)</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={userForm.managerId}
                  onChange={e => setUserForm({ ...userForm, managerId: e.target.value })}
                >
                  <option value="">Pilih Atasan</option>
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Zona Waktu (Timezone)</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={userForm.timezone}
                  onChange={e => setUserForm({ ...userForm, timezone: e.target.value })}
                >
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                  <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                  <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mode Presensi (Checkin Mode)</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={userForm.checkinMode}
                  onChange={e => setUserForm({ ...userForm, checkinMode: e.target.value })}
                >
                  <option value="TWICE">TWICE (IN & OUT)</option>
                  <option value="ONCE">ONCE (IN Saja)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Jatah Cuti (Leave Balance)</label>
                <input
                  type="number" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={userForm.leaveBalance}
                  onChange={e => setUserForm({ ...userForm, leaveBalance: parseInt(e.target.value) || 12 })}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sistem Roles (Multi-role)</label>
              <select
                multiple
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none min-h-[80px]"
                value={userForm.systemRoles}
                onChange={e => {
                  const options = e.target.options;
                  const selected: string[] = [];
                  for (let i = 0; i < options.length; i++) {
                    if (options[i].selected) selected.push(options[i].value);
                  }
                  setUserForm({ ...userForm, systemRoles: selected });
                }}
              >
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                <option value="HR_ADMIN">HR_ADMIN</option>
                <option value="PM_ADMIN">PM_ADMIN</option>
                <option value="EMPLOYEE">EMPLOYEE</option>
              </select>
            </div>
          </div>

          <div className="p-6 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/60 shrink-0">
            <button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg">Simpan</button>
            <button type="button" onClick={() => setUserModalOpen(false)} className="bg-slate-800 text-slate-400 font-bold text-xs px-5 py-2.5 rounded border border-slate-700">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderLocationModal = () => (
    <div className="fixed inset-0 bg-slate-955/80 backdrop-blur flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-805 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{selectedLocation ? 'Ubah Lokasi' : 'Tambah Lokasi Baru'}</h3>
          <button onClick={() => setLocationModalOpen(false)} className="text-slate-405 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSaveLocation}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Nama Lokasi / Kantor</label>
              <input
                type="text" required
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                placeholder="Kantor Pusat Indotek"
                value={locationForm.name}
                onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Tipe</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  value={locationForm.type}
                  onChange={e => setLocationForm({ ...locationForm, type: e.target.value })}
                >
                  <option value="OFFICE">OFFICE (Kantor Internal)</option>
                  <option value="CLIENT">CLIENT (Lokasi Proyek Klien)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Radius Validasi (Meter)</label>
                <input
                  type="number" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  placeholder="200"
                  value={locationForm.radiusM}
                  onChange={e => setLocationForm({ ...locationForm, radiusM: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Latitude</label>
                <input
                  type="text" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  placeholder="-6.917464"
                  value={locationForm.lat}
                  onChange={e => setLocationForm({ ...locationForm, lat: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Longitude</label>
                <input
                  type="text" required
                  className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  placeholder="107.619122"
                  value={locationForm.lng}
                  onChange={e => setLocationForm({ ...locationForm, lng: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/60 shrink-0">
            <button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg">Simpan</button>
            <button type="button" onClick={() => setLocationModalOpen(false)} className="bg-slate-800 text-slate-400 font-bold text-xs px-5 py-2.5 rounded border border-slate-700">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderHolidayModal = () => (
    <div className="fixed inset-0 bg-slate-955/80 backdrop-blur flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-805 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{selectedHoliday ? 'Ubah Hari Libur' : 'Tambah Hari Libur'}</h3>
          <button onClick={() => setHolidayModalOpen(false)} className="text-slate-405 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSaveHoliday}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Tanggal Libur</label>
              <input
                type="date" required
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                value={holidayForm.date}
                onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Deskripsi / Nama Libur</label>
              <input
                type="text" required
                className="mt-2 w-full rounded-lg border border-slate-805 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none"
                placeholder="Tahun Baru Islam"
                value={holidayForm.name}
                onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-350 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-slate-800 bg-slate-950 text-sky-500 focus:ring-0"
                  checked={holidayForm.isCutiBersama}
                  onChange={e => setHolidayForm({ ...holidayForm, isCutiBersama: e.target.checked })}
                />
                <span>Merupakan Cuti Bersama? (Opsional)</span>
              </label>
            </div>
          </div>

          <div className="p-6 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/60 shrink-0">
            <button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg">Simpan</button>
            <button type="button" onClick={() => setHolidayModalOpen(false)} className="bg-slate-800 text-slate-400 font-bold text-xs px-5 py-2.5 rounded border border-slate-700">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderUsersSubTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Daftar Pengguna ({usersList.length})</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => { resetUserForm(); setUserModalOpen(true); }}
            className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs px-3.5 py-2 rounded-lg"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Tambah Karyawan
          </button>
          <button 
            onClick={() => { setImportType('users'); setImportDrawerOpen(true); }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 text-slate-350 font-semibold text-xs px-3.5 py-2 rounded-lg border border-slate-700"
          >
            <Upload className="h-3.5 w-3.5" />
            Impor dari Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-805 bg-slate-900/40">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-900/60">
              <th className="px-6 py-3">Karyawan</th>
              <th className="px-6 py-3">NIK</th>
              <th className="px-6 py-3">Peran Fungsional</th>
              <th className="px-6 py-3">Departemen</th>
              <th className="px-6 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
            {usersList.map((usr: any) => (
              <tr key={usr.id} className="hover:bg-slate-900/30">
                <td className="px-6 py-4">
                  <div className="font-semibold text-white">{usr.full_name}</div>
                  <div className="text-[10px] text-slate-500">{usr.email}</div>
                  <div className="flex gap-1 mt-1">
                    {usr.system_roles.map((r: string) => (
                      <span key={r} className="text-[8px] bg-slate-800 px-1 py-0.2 rounded text-slate-400 uppercase font-bold border border-slate-700">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 font-mono text-[11px] text-slate-400">{usr.nik}</td>
                <td className="px-6 py-4 font-medium text-sky-400">{usr.functional_role?.name || '-'}</td>
                <td className="px-6 py-4">{usr.department?.name || '-'}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button 
                      onClick={() => handleExportPDP(usr.id, usr.full_name)}
                      className="p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-800"
                      title="Ekspor Data PDP"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => openEditUser(usr)} className="p-1 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={() => handleDeleteUser(usr.id)} className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-800 rounded"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderLocationsSubTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Lokasi Kantor & Klien</h3>
        <button onClick={() => { resetLocationForm(); setLocationModalOpen(true); }} className="flex items-center gap-1 bg-sky-500 text-white text-xs px-3.5 py-2 rounded-lg"><PlusCircle className="h-3.5 w-3.5" /> Tambah Lokasi</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {locationsList.map((loc: any) => (
          <div key={loc.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xs font-bold text-white">{loc.name}</h4>
                <span className="text-[9px] uppercase font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20 inline-block mt-1">{loc.type}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEditLocation(loc)} className="p-1 text-slate-400 hover:text-sky-400"><Edit2 className="h-3.5 w-3.5" /></button>
                <button 
                  onClick={async () => { if (confirm('Hapus lokasi?')) { await fetch(`${API_URL}/admin/locations/${loc.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); fetchAdminMasterData(); } }} 
                  className="p-1 text-slate-400 hover:text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 space-y-1 pt-2 border-t border-slate-800">
              <div className="flex justify-between"><span>Radius:</span> <span>{loc.radius_m}m</span></div>
              <div className="flex justify-between"><span>Coords:</span> <span>{loc.lat},{loc.lng}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHolidaysSubTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Kalender Hari Libur</h3>
        <button onClick={() => { resetHolidayForm(); setHolidayModalOpen(true); }} className="flex items-center gap-1 bg-sky-500 text-white text-xs px-3.5 py-2 rounded-lg"><PlusCircle className="h-3.5 w-3.5" /> Tambah Libur</button>
      </div>
      <div className="overflow-x-auto border border-slate-805 rounded-xl bg-slate-900/40">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase bg-slate-900/60"><th className="px-6 py-3">Tanggal</th><th className="px-6 py-3">Nama Libur</th><th className="px-6 py-3">Tipe</th><th className="px-6 py-3 text-right">Aksi</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-850 text-slate-300">
            {holidaysList.map((h: any) => (
              <tr key={h.id} className="hover:bg-slate-900/30">
                <td className="px-6 py-3 font-mono">{new Date(h.date).toLocaleDateString()}</td>
                <td className="px-6 py-3 font-semibold text-white">{h.name}</td>
                <td className="px-6 py-3">
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${h.is_cuti_bersama ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    {h.is_cuti_bersama ? 'Cuti Bersama' : 'Libur Nasional'}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => openEditHoliday(h)} className="p-1 text-slate-450 hover:text-sky-400 mr-2"><Edit2 className="h-4 w-4" /></button>
                  <button 
                    onClick={async () => { if (confirm('Hapus libur?')) { await fetch(`${API_URL}/admin/holidays/${h.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); fetchAdminMasterData(); } }}
                    className="p-1 text-slate-455 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDepartmentsSubTab = () => (
    <div className="space-y-4 max-w-xl">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Departemen</h3>
        <button 
          onClick={async () => {
            const name = prompt('Nama Departemen:');
            if (name) {
              await fetch(`${API_URL}/admin/departments`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
              fetchAdminMasterData();
            }
          }}
          className="bg-sky-500 text-white text-xs px-3 py-1.5 rounded-lg"
        >
          Tambah
        </button>
      </div>
      <div className="border border-slate-800 rounded-xl divide-y divide-slate-850 bg-slate-900/40 text-xs">
        {departmentsList.map((d: any) => (
          <div key={d.id} className="p-4 flex justify-between items-center">
            <span className="font-semibold text-white">{d.name}</span>
            <button 
              onClick={async () => { if (confirm('Hapus?')) { await fetch(`${API_URL}/admin/departments/${d.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); fetchAdminMasterData(); } }}
              className="text-slate-400 hover:text-rose-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTeamsSubTab = () => (
    <div className="space-y-4 max-w-xl">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Tim Kerja</h3>
        <button 
          onClick={async () => {
            const name = prompt('Nama Tim:');
            if (name) {
              await fetch(`${API_URL}/admin/teams`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
              fetchAdminMasterData();
            }
          }}
          className="bg-sky-500 text-white text-xs px-3 py-1.5 rounded-lg"
        >
          Tambah
        </button>
      </div>
      <div className="border border-slate-800 rounded-xl divide-y divide-slate-855 bg-slate-900/40 text-xs">
        {teamsList.map((t: any) => (
          <div key={t.id} className="p-4 flex justify-between items-center">
            <span className="font-semibold text-white">{t.name}</span>
            <button 
              onClick={async () => { if (confirm('Hapus?')) { await fetch(`${API_URL}/admin/teams/${t.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); fetchAdminMasterData(); } }}
              className="text-slate-400 hover:text-rose-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRolesSubTab = () => (
    <div className="space-y-4 max-w-xl">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Peran Fungsional</h3>
        <button 
          onClick={async () => {
            const name = prompt('Nama Peran:');
            const code = prompt('Kode Peran:');
            if (name && code) {
              await fetch(`${API_URL}/admin/functional-roles`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code }) });
              fetchAdminMasterData();
            }
          }}
          className="bg-sky-500 text-white text-xs px-3 py-1.5 rounded-lg"
        >
          Tambah
        </button>
      </div>
      <div className="border border-slate-800 rounded-xl divide-y divide-slate-855 bg-slate-900/40 text-xs">
        {rolesList.map((r: any) => (
          <div key={r.id} className="p-4 flex justify-between items-center">
            <div>
              <span className="font-semibold text-white">{r.name}</span>
              <span className="ml-2 bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded text-[10px] font-mono">{r.code}</span>
            </div>
            <button 
              onClick={async () => { if (confirm('Hapus?')) { await fetch(`${API_URL}/admin/functional-roles/${r.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); fetchAdminMasterData(); } }}
              className="text-slate-400 hover:text-rose-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return isMobile ? renderMobileLayout() : renderDesktopLayout();
}

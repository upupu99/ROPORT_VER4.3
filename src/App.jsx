// src/App.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, FolderPlus } from "lucide-react";

import Sidebar from "./components/Sidebar";
import ChatbotWidget from "./components/ChatbotWidget";

import DashboardView from "./pages/DashboardView";
import DiagnosisView from "./pages/DiagnosisView";
import DocsView from "./pages/DocsView";
import LabsView from "./pages/LabsView";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";

import { CHAT_HISTORY } from "./data/mock";

/** ✅ 중국 제거: 앱 전체 마켓은 EU/US만 */
const MARKETS = ["EU", "US"];

/* ===============================
   초기 저장소 슬롯 (파일 저장소)
   ✅ Diagnosis/Docs/Labs는 기존 구조 유지용
================================ */
const INITIAL_REPOSITORY_SLOTS = [
  { slotId: "rt100_bom", name: "RT100 트랙터 BOM", type: "BOM", category: "project" },
  { slotId: "rt100_cad", name: "RT100 트랙터 CAD", type: "CAD", category: "project" },
  { slotId: "pl_insurance", name: "PL보험증권", type: "PDF", category: "project" },
  { slotId: "biz_reg_en", name: "대동로보틱스 사업자 등록증(영어)", type: "PDF", category: "project" },
  { slotId: "eu_rep_contract", name: "유럽대리인계약서", type: "PDF", category: "project" },

  { slotId: "rt100_manual", name: "RT100 사용자 매뉴얼", type: "PDF", category: "submission" },
  { slotId: "rt100_test_report", name: "자율주행 트랙터 시험성적서", type: "PDF", category: "submission" },
  { slotId: "rt100_spec", name: "RT100 제품사양서", type: "PDF", category: "submission" },
  { slotId: "rt100_test_plan", name: "RT 100 시험계획서", type: "DOC", category: "submission" },
  { slotId: "rt100_circuit", name: "RT100 회로도/블록도", type: "PDF", category: "submission" },
];

/** ✅ 안전장치: CN 들어오면 EU로 강제 */
function safeCountry(c) {
  return MARKETS.includes(c) ? c : "EU";
}

/** ✅ 프로젝트 저장 (로컬스토리지) */
const PROJECTS_STORAGE_KEY = "prototype_projects_v1";
const CURRENT_PROJECT_ID_KEY = "prototype_current_project_id_v1";

/** ✅ 프로젝트별 “프로젝트 자산” 저장 키 (현재는 저장 기능 안 씀 - 필요시 확장용) */
const projectAssetKey = (projectId) => `prototype_project_assets_${projectId}_v1`;

export default function App() {
  /* ===============================
     ✅ 로그인 (프로토타입: 새로고침하면 다시 로그인)
  ================================ */
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  /* ===============================
     공통 / 네비게이션
  ================================ */
  const [currentView, setCurrentView] = useState("dashboard");

  /* ===============================
     ✅ 프로젝트 목록/현재 프로젝트
     - localStorage에 저장된 프로젝트만 표시
  ================================ */
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);

  /** ✅ 국가: EU/US만 */
  const [targetCountry, setTargetCountry] = useState("EU");

  /* ===============================
     ✅ 새 프로젝트 만들기 모달 (사이드바에서 쓰는 용도)
  ================================ */
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  /* ===============================
     ✅ (NEW) 프로젝트 필요 전역 모달
     - 설정 제외 메뉴 클릭 시 프로젝트 없으면 띄움
  ================================ */
  const [requireProjectOpen, setRequireProjectOpen] = useState(false);
  const [pendingView, setPendingView] = useState(null); // 사용자가 원래 누른 메뉴 기억(선택)

  /* ===============================
     규제 진단 진행 상태
  ================================ */
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [progress, setProgress] = useState(0);

  /* =====================================================
     ⭐ 규제진단 FAIL → 대시보드 Action Items (EU/US만)
  ===================================================== */
  const [dashboardRemediationByMarket, setDashboardRemediationByMarket] = useState({
    EU: [],
    US: [],
  });

  /* ===============================
     문서 / 제출 관리 (Docs)
  ================================ */
  const [docStep, setDocStep] = useState("input"); // input | processing | result
  const [docProgress, setDocProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState({});

  const handleFileUpload = useCallback((reqId, fileName) => {
    setUploadedFiles((prev) => ({ ...prev, [reqId]: fileName }));
  }, []);

  const handleRemoveFile = useCallback((reqId) => {
    setUploadedFiles((prev) => {
      const next = { ...prev };
      delete next[reqId];
      return next;
    });
  }, []);

  const resetDocProcess = useCallback(() => {
    setDocStep("input");
    setDocProgress(0);
    setUploadedFiles({});
  }, []);

  /** ✅ 파일 유지하고 input으로만 복귀 */
  const changeDocOnly = useCallback(() => {
    setDocStep("input");
    setDocProgress(0);
  }, []);

  /* ===============================
     파일 저장소 (Repository) - 기존 슬롯 기반 (다른 페이지 유지용)
  ================================ */
  const [repositoryFiles, setRepositoryFiles] = useState(
    INITIAL_REPOSITORY_SLOTS.map((s) => ({
      id: `slot-${s.slotId}`,
      slotId: s.slotId,
      name: s.name,
      type: s.type,
      category: s.category,
      origin: "Required Slot",
      date: "-",
      size: "-",
      file: null,
    }))
  );

  const uploadToSlot = useCallback((slotId, file) => {
    const today = new Date().toISOString().slice(0, 10);
    const size =
      typeof file?.size === "number" ? `${Math.round(file.size / 1024)} KB` : "—";

    setRepositoryFiles((prev) =>
      prev.map((f) =>
        f.slotId === slotId ? { ...f, file, origin: "Local Upload", date: today, size } : f
      )
    );
  }, []);

  /* =====================================================
     ✅ (중요) 대시보드 "프로젝트 자산"
     - 초기에는 빈 배열
     - 업로드하면 로딩 모달 → 완료 후 목록에 추가
     - (현재) 새로고침하면 초기화됨
  ===================================================== */
  const [projectAssetFiles, setProjectAssetFiles] = useState([]);

  // ✅ 업로드 로딩 모달 상태
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");

  const uploadProjectAsset = useCallback((file) => {
    if (!file) return;

    // ✅ 로딩 모달 ON
    setUploading(true);
    setUploadProgress(0);
    setUploadLabel(file.name);

    // 업로드처럼 보이게 1.2~2.0초 가짜 진행
    let p = 0;
    const totalMs = 1200 + Math.random() * 800;
    const tickMs = 30;
    const step = 100 / (totalMs / tickMs);

    const interval = setInterval(() => {
      p = Math.min(99, p + step);
      setUploadProgress(Math.floor(p));
    }, tickMs);

    setTimeout(() => {
      clearInterval(interval);
      setUploadProgress(100);

      // ✅ 완료 시점에 목록에 추가
      const normalized = {
        id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        size: file.size ?? 0,
        type: file.type || "",
        lastModified: file.lastModified || Date.now(),
        origin: "Local Upload",
        date: new Date().toISOString().slice(0, 10),
      };

      setProjectAssetFiles((prev) => [normalized, ...prev]);

      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setUploadLabel("");
      }, 250);
    }, totalMs);
  }, []);

  const removeProjectAsset = useCallback((fileId) => {
    setProjectAssetFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  /* ===============================
     ✅ 프로젝트 목록 로드/저장
     ✅ localStorage만 사용 (없으면 빈 배열)
  ================================ */
  useEffect(() => {
    const sanitizeProjects = (list) => {
      const arr = Array.isArray(list) ? list : [];

      const cleaned = arr
        .map((p) => ({
          id: p?.id ?? `p_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          name: String(p?.name ?? "").trim(),
          country: safeCountry(p?.country ?? "EU"),
        }))
        .filter((p) => p.name.length > 0);

      // id 중복 제거
      const uniq = [];
      const seen = new Set();
      for (const p of cleaned) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        uniq.push(p);
      }
      return uniq;
    };

    try {
      const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : [];
      const initialList = sanitizeProjects(saved);

      setProjects(initialList);

      const savedId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
      const found =
        initialList.find((p) => p.id === savedId) || initialList[0] || null;

      setCurrentProject(found);
      setTargetCountry(safeCountry(found?.country ?? "EU"));
    } catch {
      setProjects([]);
      setCurrentProject(null);
      setTargetCountry("EU");
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    } catch {}
  }, [projects]);

  useEffect(() => {
    try {
      if (currentProject?.id) {
        localStorage.setItem(CURRENT_PROJECT_ID_KEY, currentProject.id);
      } else {
        localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
      }
    } catch {}
  }, [currentProject]);

  /* ===============================
     ✅ 현재 프로젝트 바꾸기
  ================================ */
  const switchProject = useCallback(
    (p) => {
      if (!p) return;
      setCurrentProject(p);
      setTargetCountry(safeCountry(p.country ?? "EU"));

      // 프로젝트 전환 시 상태 리셋(프로토타입 안정)
      setAnalysisComplete(false);
      setIsAnalyzing(false);
      setProgress(0);
      setDashboardRemediationByMarket({ EU: [], US: [] });
      resetDocProcess();

      // ✅ 자산은 프로젝트 전환하면 초기화(원하면 제거 가능)
      setProjectAssetFiles([]);

      setCurrentView("dashboard");
    },
    [resetDocProcess]
  );

  /* ===============================
     ✅ 프로젝트 삭제
  ================================ */
  const deleteProject = useCallback(
    (projectId) => {
      setProjects((prev) => {
        const next = (prev || []).filter((p) => p.id !== projectId);

        // 현재 프로젝트 삭제면 fallback 선택
        if (currentProject?.id === projectId) {
          const fallback = next[0] || null;
          setCurrentProject(fallback);
          setTargetCountry(safeCountry(fallback?.country ?? "EU"));

          // 상태 초기화
          setAnalysisComplete(false);
          setIsAnalyzing(false);
          setProgress(0);
          setDashboardRemediationByMarket({ EU: [], US: [] });
          resetDocProcess();

          // ✅ 자산 초기화
          setProjectAssetFiles([]);

          setCurrentView("dashboard");
        }

        return next;
      });
    },
    [currentProject?.id, resetDocProcess]
  );

  /* ===============================
     ✅ 프로젝트 이름 변경
  ================================ */
  const renameProject = useCallback((projectId, nextName) => {
    const name = String(nextName || "").trim();
    if (!projectId || !name) return;

    setProjects((prev) => (prev || []).map((p) => (p.id === projectId ? { ...p, name } : p)));

    // currentProject도 즉시 반영
    setCurrentProject((p) => (p?.id === projectId ? { ...p, name } : p));
  }, []);

  /* ===============================
     ✅ 새 프로젝트 생성
  ================================ */
  const createAndSwitchProject = useCallback(
    (projectName) => {
      const name = String(projectName || "").trim();
      if (!name) return;

      const newProject = {
        id: `p_${Date.now()}`,
        name,
        country: "EU",
      };

      setProjects((prev) => {
        const next = Array.isArray(prev) ? prev : [];
        return [newProject, ...next];
      });

      setCurrentProject(newProject);
      setTargetCountry("EU");

      // 상태 초기화
      setAnalysisComplete(false);
      setIsAnalyzing(false);
      setProgress(0);
      setDashboardRemediationByMarket({ EU: [], US: [] });
      resetDocProcess();

      // ✅ 새 프로젝트는 자산도 빈 상태로 시작
      setProjectAssetFiles([]);

      // ✅ 프로젝트 만든 뒤, 원래 가려던 메뉴가 있으면 이동
      if (pendingView) setCurrentView(pendingView);
      else setCurrentView("dashboard");
      setPendingView(null);
    },
    [resetDocProcess, pendingView]
  );

  /* ===============================
     규제 진단 시뮬레이션
  ================================ */
  const startAnalysis = useCallback(() => {
    if (isAnalyzing) return;

    setIsAnalyzing(true);
    setProgress(0);

    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsAnalyzing(false);
          setAnalysisComplete(true);
        }, 300);
      }
    }, 30);
  }, [isAnalyzing]);

  /* ===============================
     Docs 생성 시뮬레이션
  ================================ */
  const startDocGeneration = useCallback(() => {
    setDocStep("processing");
    setDocProgress(0);

    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setDocProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => setDocStep("result"), 300);
      }
    }, 30);
  }, []);

  /* ===============================
     (기존 UI 유지용) 보안 타이머/채팅 데이터
  ================================ */
  const [securityTimer, setSecurityTimer] = useState(86400);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecurityTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = useCallback((s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m ${s % 60}s`;
  }, []);

  const [messages] = useState(CHAT_HISTORY);
  const chatEndRef = useRef(null);

  /* ===============================
     ✅ 로그인 화면 분기
  ================================ */
  if (!isLoggedIn) {
    return (
      <LoginPage
        onLogin={() => {
          setIsLoggedIn(true);
          setCurrentView("dashboard");
        }}
      />
    );
  }

  /* ===============================
     ✅ 새 프로젝트 모달
  ================================ */
  const CreateProjectModal = createProjectOpen ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setCreateProjectOpen(false)}
      />
      <div className="relative w-[min(560px,92vw)] bg-white rounded-3xl border border-gray-200 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/60">
          <div className="text-lg font-black text-gray-900">새 프로젝트 추가</div>
          <div className="text-xs text-gray-500 mt-1">
            프로젝트 이름을 입력하면 새 프로젝트가 추가됩니다.
          </div>
        </div>

        <div className="p-6">
          <div className="text-xs font-bold text-gray-500 mb-2">프로젝트 이름</div>
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
            placeholder="예) 자율주행 트랙터 X1"
            autoFocus
          />

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={() => setCreateProjectOpen(false)}
              className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={() => {
                const name = newProjectName.trim();
                if (!name) return;
                createAndSwitchProject(name);
                setNewProjectName("");
                setCreateProjectOpen(false);
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700"
            >
              생성하고 이동
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  /* ===============================
     ✅ (NEW) 프로젝트 필요 전역 모달 (전체 화면)
  ================================ */
  const RequireProjectModal = requireProjectOpen ? (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/45"
        onClick={() => setRequireProjectOpen(false)}
      />
      <div className="relative w-[min(560px,92vw)] bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden animate-scale-in">
        <div className="p-6 bg-gradient-to-b from-gray-50 to-white border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <FolderPlus size={20} className="text-blue-600" />
            </div>
            <div>
              <div className="text-lg font-black text-gray-900">
                프로젝트를 먼저 생성해주세요
              </div>
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                프로젝트가 있어야 해당 기능을 사용할 수 있어요.
              </div>
            </div>
          </div>

          <button
            onClick={() => setRequireProjectOpen(false)}
            className="p-2 rounded-xl hover:bg-gray-100 transition"
            aria-label="close"
            title="닫기"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setRequireProjectOpen(false)}
              className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition text-sm font-black text-gray-700"
            >
              닫기
            </button>
            <button
              onClick={() => {
                setRequireProjectOpen(false);
                setCreateProjectOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 transition text-sm font-black text-white shadow-sm"
            >
              + 새 프로젝트 생성
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ✅ 업로드 로딩 모달
  const UploadingModal = uploading ? (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative w-[min(520px,92vw)] bg-white rounded-3xl border border-gray-200 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/60">
          <div className="text-lg font-black text-gray-900">파일 업로드 중</div>
          <div className="text-xs text-gray-500 mt-1 truncate">
            {uploadLabel || "업로드 준비 중..."}
          </div>
        </div>

        <div className="p-6">
          <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden border border-gray-200">
            <div
              className="h-full bg-blue-600 transition-all duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
            <span className="font-bold">{uploadProgress}%</span>
            <span className="text-gray-500">잠시만 기다려주세요</span>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
            <div className="text-sm font-bold text-gray-800">업로드 처리 중...</div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex bg-[#f3f4f6] min-h-screen font-sans selection:bg-blue-100 text-gray-900">
      {/* 전역 스타일 */}
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        body { font-family: 'Pretendard', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-slide-up { animation: fade-in 0.4s ease-out; }

        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in { animation: scale-in 0.2s ease-out forwards; }
      `}</style>

      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        currentProject={currentProject}
        setCurrentProject={switchProject}
        projects={projects}
        onDeleteProject={deleteProject}
        onOpenCreateProject={() => setCreateProjectOpen(true)}
        onRenameProject={renameProject}
        onRequireProject={(viewKey) => {
          setPendingView(viewKey || null);
          setRequireProjectOpen(true);
        }}
      />

      <div className="flex-1 ml-[260px] flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl h-20 border-b border-gray-200/50 flex items-center justify-between px-8 sticky top-0 z-40 transition-all duration-300">
          <div className="font-bold text-gray-700 text-lg flex items-center gap-2">
            <span className="text-gray-400 font-normal">Dashboard /</span>
            {currentView === "dashboard" && "Overview"}
            {currentView === "diagnosis" && "Regulation Diagnosis"}
            {currentView === "docs" && "Document Generation"}
            {currentView === "labs" && "Lab Matching"}
            {currentView === "settings" && "Settings & Admin"}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100 shadow-sm">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold text-emerald-700 tracking-wide">
                SYSTEM STABLE
              </span>
            </div>

            <div className="w-9 h-9 bg-gradient-to-tr from-gray-100 to-gray-200 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold shadow-sm cursor-pointer hover:ring-4 hover:ring-gray-100 transition-all">
              KD
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-y-scroll animate-fade-in pb-10 custom-scrollbar"
  style={{ scrollbarGutter: "stable" }}>
          {currentView === "dashboard" && (
            <DashboardView
              uploadedFiles={uploadedFiles}
              repositoryFiles={projectAssetFiles}
              onUploadToSlot={uploadProjectAsset}
              onRemoveRepositoryFile={removeProjectAsset}
              remediationByMarket={dashboardRemediationByMarket}
              markets={MARKETS}
              projectName={currentProject?.name}
            />
          )}

          {currentView === "diagnosis" && (
            <DiagnosisView
              targetCountry={targetCountry}
              setTargetCountry={(c) => {
                const next = safeCountry(c);
                setCurrentProject((p) => (p ? { ...p, country: next } : p));
                setAnalysisComplete(false);
              }}
              analysisComplete={analysisComplete}
              isAnalyzing={isAnalyzing}
              progress={progress}
              startAnalysis={startAnalysis}
              setAnalysisComplete={setAnalysisComplete}
              repositoryFiles={projectAssetFiles}
              markets={MARKETS}
              onPublishActionItems={(market, items) => {
                const m = safeCountry(market);
                setDashboardRemediationByMarket((prev) => ({
                  ...prev,
                  [m]: items,
                }));
              }}
            />
          )}

          {currentView === "docs" && (
            <DocsView
              targetCountry={targetCountry}
              setTargetCountry={(c) => {
                const next = safeCountry(c);
                setCurrentProject((p) => (p ? { ...p, country: next } : p));
                resetDocProcess();
              }}
              securityTimer={securityTimer}
              formatTime={formatTime}
              docStep={docStep}
              docProgress={docProgress}
              startDocGeneration={startDocGeneration}
              resetDocProcess={resetDocProcess}
              changeDocOnly={changeDocOnly}
              uploadedFiles={uploadedFiles}
              handleFileUpload={handleFileUpload}
              handleRemoveFile={handleRemoveFile}
              repositoryFiles={projectAssetFiles}
              markets={MARKETS}
            />
          )}

          {currentView === "labs" && (
            <LabsView
              targetCountry={targetCountry}
              setTargetCountry={(c) => {
                const next = safeCountry(c);
                setCurrentProject((p) => (p ? { ...p, country: next } : p));
              }}
              repositoryFiles={projectAssetFiles}
              markets={MARKETS}
            />
          )}

          {currentView === "settings" && <SettingsPage />}
        </main>
      </div>

      <ChatbotWidget
        currentView={currentView}
        targetCountry={targetCountry}
        uploadedFiles={uploadedFiles}
        repositoryFiles={projectAssetFiles}
        dashboardRemediationByMarket={dashboardRemediationByMarket}
        messages={messages}
        chatEndRef={chatEndRef}
      />

      {CreateProjectModal}
      {RequireProjectModal}
      {UploadingModal}
    </div>
  );
}

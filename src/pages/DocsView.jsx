// src/pages/DocsView.jsx
import React, { memo, useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  FileCode,
  CheckCircle,
  FileText,
  FileCheck,
  AlertTriangle,
  Zap,
  FilePenLine,
  RefreshCw,
  Download,
  Terminal,
  Repeat2,
  FolderUp,
  Wand2,
  Upload,
  FolderOpen,
  X,
} from "lucide-react";

import StatusSummaryWidget from "../components/StatusSummaryWidget";
import RepositoryView from "../components/RepositoryView";
import { DOC_PROCESS_CONFIG } from "../data/mock";

// ✅ assets에 넣은 EU DoC 최종본 PDF (경로/파일명 정확히 맞춰주세요)
import EU_DOC_FINAL_PDF from "../assets/EC_Declaration_of_Conformity_Final.pdf";

// ✅ doc.file 값으로 다운로드 파일 매핑
const DOWNLOAD_MAP = {
  EU_DOC_FINAL: EU_DOC_FINAL_PDF,
};

/** =========================
 * Repo Auto Match Helpers
 * ========================= */
const norm = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "");

function fileExt(name = "") {
  const n = String(name || "").toLowerCase();
  const m = n.match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** 키워드 기반으로 저장소 파일 중 가장 비슷한 1개 찾기 */
function pickBestFile(repositoryFiles, keywords = []) {
  const ks = (keywords || [])
    .flatMap((k) => String(k || "").split(/[\s/(),]+/g))
    .map(norm)
    .filter(Boolean);

  let best = null;
  let bestScore = -1;

  for (const f of repositoryFiles || []) {
    const nameRaw = String(f?.name || "");
    const name = norm(nameRaw);
    let score = 0;

    // 키워드 hit
    for (const k of ks) {
      if (!k) continue;
      if (name.includes(k)) score += 10;
    }

    // 확장자 가산점(요구 desc에 있는 확장자 힌트)
    const ext = fileExt(nameRaw);
    if (ks.includes("pdf") && ext === "pdf") score += 4;
    if ((ks.includes("doc") || ks.includes("docx")) && (ext === "doc" || ext === "docx")) score += 4;
    if ((ks.includes("xlsx") || ks.includes("csv")) && (ext === "xlsx" || ext === "csv")) score += 4;
    if (
      (ks.includes("dwg") || ks.includes("dxf") || ks.includes("stp") || ks.includes("step")) &&
      (ext === "dwg" || ext === "dxf" || ext === "stp" || ext === "step")
    )
      score += 4;

    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  return bestScore > 0 ? best : null;
}

/** 요구사항 id에 따라 “매칭용 키워드” 세팅 (EU 데모 기준) */
function getKeywordsForEU(reqId, reqName, reqDesc) {
  const base = [reqName, reqDesc, "rt100"];

  // reqId 기반 강한 힌트
  const byId = {
    eu_tech_1: ["spec", "사양", "제품사양", "product", "specification", "pdf"],
    eu_tech_2: ["ehsr", "checklist", "체크리스트", "risk", "평가", "pdf", "xlsx"],
    eu_tech_3: ["circuit", "회로", "block", "도면", "drawing", "dwg", "pdf"],
    eu_tech_4: ["test", "report", "성적서", "시험", "pdf"],
    eu_tech_5: ["manual", "매뉴얼", "user", "guide", "pdf"],
    eu_admin_1: ["doc", "declaration", "contract", "대리인", "계약", "pdf", "docx"],
  };

  return [...base, ...(byId[reqId] || [])];
}

/** ✅ submit/label 이슈 방지용: 버튼으로 파일 picker 열기 */
function FilePickButton({ reqId, onFileChange }) {
  const inputRef = useRef(null);

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => onFileChange(e, reqId)} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
      >
        <Upload size={16} className="text-gray-500" />
        내 PC 업로드
      </button>
    </>
  );
}

const DocsView = memo(function DocsView({
  targetCountry,
  setTargetCountry,
  docStep,
  docProgress,
  startDocGeneration,
  resetDocProcess,
  changeDocOnly,
  uploadedFiles,
  handleFileUpload,
  handleRemoveFile,

  // ✅ App.jsx에서 내려주는 저장소 파일 목록 (프로젝트 자산)
  repositoryFiles = [],
}) {
  const config = DOC_PROCESS_CONFIG[targetCountry];
  const [repoModalTarget, setRepoModalTarget] = useState(null);
  const [logs, setLogs] = useState([]);

  // ✅ 기술 + 행정 통합
  const combinedInputs = useMemo(() => {
    const tech = (config.technicalInputs || []).map((x) => ({ ...x, section: "기술" }));
    const admin = (config.adminInputs || []).map((x) => ({ ...x, section: "행정" }));
    return [...tech, ...admin];
  }, [config]);

  const allRequired = useMemo(
    () => combinedInputs.filter((i) => i.required).map((i) => i.id),
    [combinedInputs]
  );

  const uploadedIds = Object.keys(uploadedFiles || {});
  const isAtLeastOne = uploadedIds.length > 0;
  const isFullyReady = allRequired.every((id) => uploadedIds.includes(id));

  const missingDocs = combinedInputs
    .filter((doc) => doc.required && !uploadedFiles?.[doc.id])
    .map((doc) => doc.name);

  // ✅ processing 로그
  useEffect(() => {
    if (docStep === "processing") {
      setLogs([]);
      const logMessages = [
        "📝 설계 데이터 분석 시작...",
        `🌍 ${targetCountry} 규제 DB 매핑 중...`,
        "🔎 위험성 평가 시나리오 생성...",
        "🚀 TCF 및 DoC 초안 작성 완료!",
      ];
      let i = 0;
      const interval = setInterval(() => {
        if (i < logMessages.length) {
          setLogs((prev) => [...prev, logMessages[i]]);
          i++;
        } else {
          clearInterval(interval);
        }
      }, 800);
      return () => clearInterval(interval);
    }
  }, [docStep, targetCountry]);

  // ✅ 내 PC 업로드 (데모: name만 저장)
  const onFileChange = (e, reqId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileUpload(reqId, file.name);
  };

  // ✅ 저장소 선택 모달에서 파일 선택(데모: name만 사용)
  const handlePickFromRepo = (file) => {
    if (!repoModalTarget) return;
    handleFileUpload(repoModalTarget, file?.name ?? "selected_file");
    setRepoModalTarget(null);
  };

  /** ✅ 자동 업로드 (slotId 있으면 slotId 우선, 없으면 파일명 키워드 매칭) */
  const autoUploadFromRepo = useCallback(() => {
    if (targetCountry !== "EU") {
      alert("현재 자동 업로드는 EU 데모만 연결되어 있어요. (US도 원하면 바로 추가 가능)");
      return;
    }

    // slotId 기반 lookup (혹시 repositoryFiles에 slotId가 있는 경우 대비)
    const repoBySlot = new Map((repositoryFiles || []).map((r) => [r?.slotId, r]).filter(([k]) => !!k));

    // EU 데모 slot 매핑(있으면 사용)
    const EU_AUTO_MAP = {
      eu_tech_1: "rt100_spec",
      eu_tech_2: "rt100_spec",
      eu_tech_3: "rt100_circuit",
      eu_tech_4: "rt100_test_report",
      eu_tech_5: "rt100_manual",
      eu_admin_1: "eu_rep_contract",
    };

    combinedInputs.forEach((req) => {
      if (uploadedFiles?.[req.id]) return;

      // 1) slotId 우선
      const slotId = EU_AUTO_MAP[req.id];
      const slotHit = slotId ? repoBySlot.get(slotId) : null;

      // 2) 없으면 파일명 매칭
      const keywords = getKeywordsForEU(req.id, req.name, req.desc);
      const nameHit = pickBestFile(repositoryFiles, keywords);

      const hit = slotHit || nameHit;
      if (!hit) return;

      // 데모: 파일명만 업로드 처리
      handleFileUpload(req.id, hit.name);
    });
  }, [targetCountry, repositoryFiles, combinedInputs, uploadedFiles, handleFileUpload]);

  return (
    <div className="p-8 pb-28 max-w-[1400px] mx-auto animate-fade-in h-full flex flex-col">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-6 px-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white text-blue-600 flex items-center justify-center shadow-sm border border-gray-100">
              <FileCode size={24} />
            </span>
            해외 제출 서류 생성
          </h1>

          <p className="text-gray-500 mt-2 ml-16 font-medium text-sm">
            <span className="font-bold text-blue-600">{config.label}</span> 수출 필수 서류를 AI가 작성합니다.
          </p>

          {/* ✅ 자동 업로드 버튼 */}
          {docStep === "input" && (
            <div className="ml-16 mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={autoUploadFromRepo}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 shadow-sm"
              >
                <Wand2 size={16} /> 파일저장소 자동 업로드
              </button>
              
            </div>
          )}
        </div>

        <div className="bg-white p-1 rounded-xl flex border border-gray-200 shadow-sm">
          {["EU", "US"].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setTargetCountry(code);
                resetDocProcess();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 whitespace-nowrap ${
                targetCountry === code
                  ? "bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {code === "EU" && "유럽"}
              {code === "US" && "미국"}
            </button>
          ))}
        </div>
      </div>

      {/* Step: INPUT (Diagnosis 스타일) */}
      {docStep === "input" && (
        <div className="animate-fade-in space-y-6">
          <StatusSummaryWidget total={allRequired.length} current={uploadedIds.length} label="필수 서류" />

          <div className="bg-white p-8 rounded-[2rem] border border-gray-200 shadow-lg flex flex-col overflow-hidden">
            {/* 중앙 헤더 */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FolderUp size={32} className="text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">제출 서류 업로드</h2>
              <p className="text-gray-500">필수 서류를 업로드하면 AI가 기술문서(TCF/DoC) 초안을 생성합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 px-4">
              {combinedInputs.map((req) => {
                const uploaded = Boolean(uploadedFiles?.[req.id]);

                return (
                  <div
                    key={req.id}
                    className={`p-5 border rounded-xl transition-colors flex flex-col gap-3 group ${
                      uploaded ? "border-blue-200 bg-blue-50/10" : "border-gray-100 bg-gray-50 hover:border-blue-200"
                    }`}
                  >
                    {/* 상단 */}
                    <div className="flex items-start justify-between w-full">
                      <div className="flex items-start gap-4 overflow-hidden">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors mt-1 ${
                            uploaded ? "bg-blue-100 text-blue-600" : "bg-white text-gray-400 border border-gray-200"
                          }`}
                        >
                          {uploaded ? <CheckCircle size={20} /> : <FileText size={20} />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                req.section === "기술"
                                  ? "bg-blue-50 text-blue-700 border-blue-100"
                                  : "bg-slate-50 text-slate-700 border-slate-200"
                              }`}
                            >
                              {req.section}
                            </span>

                            {req.required && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                                필수
                              </span>
                            )}
                          </div>

                          <span className="text-base font-bold text-gray-800 leading-tight block truncate">{req.name}</span>
                          <span className="text-xs text-gray-400 mt-1 block line-clamp-1">{req.desc}</span>
                        </div>
                      </div>

                      {!uploaded ? (
                        <div className="w-6 h-6 rounded-full border-2 border-gray-200 shrink-0 mt-2" />
                      ) : (
                        <div className="w-6 h-6 shrink-0 mt-2" />
                      )}
                    </div>

                    {/* 업로드 영역 */}
                    <div className="mt-3">
                      {uploaded ? (
                        <div className="h-10 flex items-center justify-between bg-white px-4 rounded-xl border border-gray-200">
                          <span className="text-xs text-gray-600 truncate flex-1 min-w-0 flex items-center gap-2">
                            <FileCheck size={14} className="text-blue-500" />
                            {uploadedFiles?.[req.id]}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(req.id)}
                            className="text-gray-400 hover:text-red-500"
                            aria-label="remove"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <FilePickButton reqId={req.id} onFileChange={onFileChange} />

                          <button
                            type="button"
                            onClick={() => setRepoModalTarget(req.id)}
                            className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                          >
                            <FolderOpen size={16} className="text-gray-500" />
                            파일 저장소 선택
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-6 border-t border-gray-100">
              {isAtLeastOne && !isFullyReady && (
                <div className="mb-4 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-1.5 rounded-full text-xs font-bold border border-amber-100">
                    <AlertTriangle size={12} />
                    <span>필수 서류({missingDocs.length}건) 누락 → 초안(Draft)로 생성됩니다.</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={startDocGeneration}
                disabled={!isAtLeastOne}
                className={`w-full py-4 rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2 transform hover:scale-[1.02]
                  ${
                    isAtLeastOne
                      ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-blue-200"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
              >
                {isFullyReady ? <Zap size={20} className="animate-pulse" /> : <FilePenLine size={20} />}
                {isFullyReady ? "정식 기술문서 생성" : "초안 문서 생성⚠️"}
              </button>

              <div className="h-3" />
            </div>
          </div>
        </div>
      )}

      {/* Step: PROCESSING */}
      {docStep === "processing" && (
        <div className="h-[600px] bg-white rounded-[2rem] border border-gray-200 shadow-sm flex flex-col items-center justify-center p-8 relative overflow-hidden animate-fade-in">
          <div className="w-32 h-32 relative mb-8">
            <svg className="animate-spin w-full h-full text-blue-100" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none"></circle>
              <path
                className="opacity-100 text-blue-600"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-blue-600 text-2xl">
              {docProgress}%
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-3">AI 문서 작성 중...</h2>
          <p className="text-gray-500 mb-8">업로드된 데이터를 기반으로 최적의 기술문서를 생성하고 있습니다.</p>

          <div className="w-full max-w-lg bg-gray-900 rounded-2xl p-6 border border-gray-800 min-h-[160px] flex flex-col gap-3 font-mono text-sm text-gray-300 shadow-2xl">
            <div className="flex items-center gap-2 mb-2 border-b border-gray-700 pb-3">
              <Terminal size={14} className="text-gray-400" />
              <span className="font-bold text-gray-100">System Log</span>
            </div>

            {logs.map((log, idx) => (
              <div key={idx} className="flex items-center gap-3 animate-fade-in">
                <span className="text-blue-300 font-bold">➜</span> {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step: RESULT */}
      {docStep === "result" && (
        <div className="animate-slide-up grid grid-cols-1 lg:grid-cols-3 gap-6 h-full pb-10">
          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-[2rem] border border-gray-200 shadow-sm h-full flex flex-col items-center text-center justify-center min-h-[400px]">
              <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6 ring-4 ring-green-50">
                <CheckCircle size={48} className="text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">생성 완료!</h2>
              <p className="text-gray-500 mb-8 leading-relaxed">
                총{" "}
                <span className="font-bold text-gray-900 border-b-2 border-green-200">
                  {config.generatedOutputs.length}건
                </span>
                의 문서가
                <br />
                성공적으로 생성되었습니다.
              </p>

              <div className="w-full flex flex-col gap-2">
                <button
                  type="button"
                  onClick={resetDocProcess}
                  className="w-full text-sm text-gray-500 hover:text-blue-600 flex items-center gap-2 px-6 py-3 hover:bg-blue-50 rounded-xl transition-colors font-bold justify-center border border-gray-200 hover:border-blue-200"
                >
                  <RefreshCw size={16} /> 처음으로 돌아가기
                </button>

                <button
                  type="button"
                  onClick={changeDocOnly}
                  className="w-full text-sm text-gray-700 hover:text-gray-900 flex items-center gap-2 px-6 py-3 hover:bg-gray-50 rounded-xl transition-colors font-bold justify-center border border-gray-200"
                >
                  <Repeat2 size={16} /> 문서 바꾸기 (파일 유지)
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="p-2 mb-2 flex items-center gap-2 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700">제출 서류 생성 목록 (Generated Documents)</h3>
            </div>

            {config.generatedOutputs.map((doc, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-[2rem] border border-gray-200 shadow-sm hover:shadow-lg hover:border-blue-300 hover:-translate-y-1 transition-all group relative overflow-hidden flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-5 min-w-0 flex-1">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner shrink-0 group-hover:scale-110 transition-transform">
                    <FileText size={28} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-white bg-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm mb-1 inline-block">
                      {doc.type}
                    </span>
                    <h3 className="font-bold text-gray-800 text-lg leading-snug line-clamp-2 break-words">{doc.desc}</h3>
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      {doc.name} • {doc.size}
                    </p>
                  </div>
                </div>

                {/* ✅ EU DoC 최종본만 실제 다운로드, 나머지는 동일 UI(로직 변경 X) */}
                {doc.file === "EU_DOC_FINAL" ? (
                  <a
                    href={DOWNLOAD_MAP[doc.file]}
                    download={doc.name || "EC_Declaration_of_Conformity_Final.pdf"}
                    className="shrink-0 flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-white bg-gray-50 hover:bg-blue-600 px-6 py-3 rounded-xl transition-all shadow-sm group-hover:shadow-md"
                  >
                    <Download size={16} /> <span className="hidden sm:inline">다운로드</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {}}
                    className="shrink-0 flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-white bg-gray-50 hover:bg-blue-600 px-6 py-3 rounded-xl transition-all shadow-sm group-hover:shadow-md"
                    title="준비중"
                  >
                    <Download size={16} /> <span className="hidden sm:inline">다운로드</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ✅ Repository Picker Modal (Docs 전용) */}
      {repoModalTarget && (
        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm p-6 flex items-center justify-center">
          <div className="w-[1100px] max-w-[95vw]">
            <RepositoryView
              mode="picker"
              files={repositoryFiles}
              targetSlotId={repoModalTarget}
              onPickFile={(file) => handlePickFromRepo(file)}
              onClose={() => setRepoModalTarget(null)}
              heightClass="h-[78vh]"
              enableExpand={false}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default DocsView;

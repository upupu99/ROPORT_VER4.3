// src/pages/DiagnosisView.jsx
import React, { memo, useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  CheckSquare,
  Upload,
  FileText,
  CheckCircle,
  Search,
  X,
  RefreshCw,
  AlertCircle,
  Table2,
  FolderOpen,
  Wand2,
} from "lucide-react";

import StatusSummaryWidget from "../components/StatusSummaryWidget";
import RepositoryView from "../components/RepositoryView";
import ChecklistExcelModal from "../components/ChecklistExcelModal";
import { COMPLIANCE_MASTER_SCHEMA } from "../data/complianceMasterSchema";

/** --------------------------
 * Schema Helpers
 * -------------------------- */
function pickReg(item, market) {
  const direct = item?.regulations?.[market];
  if (direct) {
    return {
      std: direct.std || "-",
      req: direct.req || "-",
      fail: "-",
      severity: direct.severity || direct.mark || "-",
    };
  }

  const regs = item?.regulations || {};
  const keys = Object.keys(regs);
  const bestKey = keys.find((k) => k.toUpperCase().includes(market)) || keys[0];
  if (!bestKey) return { std: "-", req: "-", fail: "-", severity: "-" };

  const r = regs[bestKey];
  return {
    std: r.standard || "-",
    req: r.criteria || r.req || "-",
    fail: r.fail_condition || "-",
    severity: r.severity || "-",
  };
}

function makeGuide(item, market) {
  const reg = pickReg(item, market);
  const req = typeof reg.req === "string" ? reg.req : JSON.stringify(reg.req);
  const fail = reg.fail && reg.fail !== "-" ? ` / FAIL: ${reg.fail}` : "";
  return `표준: ${reg.std} / 요구사항: ${req}${fail}`;
}

// “분석한 척” 규제진단
function runMockDiagnosis(schema, market, diagnosisFiles) {
  const hasBOM = Boolean(diagnosisFiles?.upload_bom);
  const hasCAD = Boolean(diagnosisFiles?.upload_cad);

  const bomName = diagnosisFiles?.upload_bom?.name?.toLowerCase() || "";
  const cadName = diagnosisFiles?.upload_cad?.name?.toLowerCase() || "";
  const haystack = `${bomName} ${cadName}`;

  const results = {};
  (schema?.critical_checkpoints || []).forEach((g) => {
    (g.items || []).forEach((item) => {
      const source = String(item.source || "").toUpperCase();
      const needsBOM = source.includes("BOM");
      const needsCAD = source.includes("CAD");

      // 입력이 없으면 FAIL
      if ((needsBOM && !hasBOM) || (needsCAD && !hasCAD)) {
        results[item.id] = {
          status: "FAIL",
          reason: `필수 입력 누락 (${needsBOM && !hasBOM ? "BOM" : ""}${
            needsBOM && !hasBOM && needsCAD && !hasCAD ? ", " : ""
          }${needsCAD && !hasCAD ? "CAD" : ""})`,
          guide: makeGuide(item, market),
        };
        return;
      }

      // 키워드 힌트(파일명 기반)
      const keywords = (item.keywords || []).map((k) => String(k).toLowerCase());
      const hit = keywords.length ? keywords.some((k) => haystack.includes(k)) : false;

      // 데모용 규칙: 키워드 있으면 hit=PASS / 없으면 BLOCKER는 일부 FAIL
      const reg = pickReg(item, market);
      const sev = String(reg.severity || "").toUpperCase();

      let pass = true;
      if (keywords.length > 0) pass = hit;
      else if (sev.includes("BLOCKER")) pass = false;

      results[item.id] = pass
        ? { status: "PASS", reason: "", guide: "" }
        : { status: "FAIL", reason: "규격 기준 미충족 (데모 판정)", guide: makeGuide(item, market) };
    });
  });

  return results;
}

/** --------------------------
 * ✅ FAIL -> Dashboard Action Items 변환
 * -------------------------- */
function buildActionItemsFromResults(schema, market, resultsById) {
  const severityToPriority = (sev = "") => {
    const s = String(sev).toUpperCase();
    if (s.includes("CRITICAL")) return "Critical";
    if (s.includes("BLOCKER")) return "High";
    if (s.includes("HIGH")) return "High";
    if (s.includes("MED")) return "Medium";
    return "Low";
  };

  const items = [];
  (schema?.critical_checkpoints || []).forEach((group) => {
    (group.items || []).forEach((it) => {
      const r = resultsById?.[it.id];
      if (!r || r.status !== "FAIL") return;

      const reg = pickReg(it, market);
      const src = String(it.source || "").toUpperCase();
      const type = src.includes("BOM") ? "BOM" : src.includes("CAD") ? "CAD" : "DOC";

      const title = it.title || it.name || it.id;
      const reason = r.reason ? ` — ${r.reason}` : "";
      const guide = r.guide ? ` / ${r.guide}` : "";

      items.push({
        id: `${market}_${it.id}`,
        priority: severityToPriority(reg.severity),
        type,
        task: `${title}${reason}${guide}`,
        status: "pending",
      });
    });
  });

  return items;
}

/** --------------------------
 * Repo Auto Upload Helpers
 * -------------------------- */
// ✅ 파일명 기반으로 저장소에서 가장 유사한 파일 찾기
const norm = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "");

function pickBestFileByKeywords(repositoryFiles, keywords = []) {
  const ks = (keywords || []).map(norm).filter(Boolean);
  let best = null;
  let bestScore = -1;

  for (const f of repositoryFiles || []) {
    const name = norm(f?.name || "");
    let score = 0;

    for (const k of ks) {
      if (name.includes(k)) score += 10;
    }

    // 확장자 가산점
    const isXlsx = name.includes(".xlsx") || name.includes(".csv");
    const isCad = name.includes(".stp") || name.includes(".step") || name.includes(".dwg") || name.includes(".dxf");

    if (ks.some((k) => k.includes(".xlsx") || k.includes(".csv")) && isXlsx) score += 3;
    if (ks.some((k) => k.includes(".stp") || k.includes(".step") || k.includes(".dwg") || k.includes(".dxf")) && isCad)
      score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  return bestScore > 0 ? best : null;
}

/** ✅ DocsView 방식: label/submit 이슈 없이 버튼으로 파일 picker 열기 */
function FilePickButton({ itemId, onFileChange }) {
  const inputRef = useRef(null);

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => onFileChange(e, itemId)} />
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

const DiagnosisView = memo(function DiagnosisView({
  targetCountry,
  setTargetCountry,
  analysisComplete,
  isAnalyzing,
  progress,
  startAnalysis,
  setAnalysisComplete,

  // App.jsx에서 내려주는 저장소 파일 목록
  repositoryFiles = [],
  // App.jsx에서 내려주는 콜백 (Dashboard Action Items로 보내기)
  onPublishActionItems,
}) {
  const [diagnosisFiles, setDiagnosisFiles] = useState({});
  const [repoModalTarget, setRepoModalTarget] = useState(null);

  const [checklistOpen, setChecklistOpen] = useState(false);
  const [resultsById, setResultsById] = useState({});

  const INITIAL_UPLOADS = [
    {
      id: "upload_cad",
      category: "설계",
      name: "프로젝트 설계도면 CAD ",
      desc: "3D/2D 도면 파일 (.stp, .dwg, .step)",
    },
    {
      id: "upload_bom",
      category: "부품",
      name: "프로젝트 부품 BOM ",
      desc: "부품 명세서 (.xlsx, .csv)",
    },
  ];

  /** 내 PC 업로드 */
  const handleFileChange = (e, itemId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDiagnosisFiles((prev) => ({ ...prev, [itemId]: file }));
  };

  /** ✅ 저장소에서 "선택"된 파일을 현재 타겟 슬롯(repoModalTarget)에 연결 */
  const handlePickFromRepo = (file) => {
    if (!repoModalTarget) return;

    setDiagnosisFiles((prev) => ({
      ...prev,
      [repoModalTarget]: { name: file?.name ?? "selected_file", ...file },
    }));

    setRepoModalTarget(null);
  };

  const removeFile = (itemId) => {
    setDiagnosisFiles((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const isAnyFileUploaded = Object.keys(diagnosisFiles).length > 0;

  /** ✅ 저장소 자동 업로드: RT100 CAD/BOM 이름 기반 */
  const autoUploadFromRepo = useCallback(() => {
    const cad = pickBestFileByKeywords(repositoryFiles, ["rt100", "트랙터", "cad", ".stp", ".step", ".dwg", ".dxf"]);

    const bom = pickBestFileByKeywords(repositoryFiles, ["rt100", "트랙터", "bom", "부품", "parts", ".xlsx", ".csv"]);

    setDiagnosisFiles((prev) => ({
      ...prev,
      ...(cad ? { upload_cad: { name: cad.name, ...cad } } : {}),
      ...(bom ? { upload_bom: { name: bom.name, ...bom } } : {}),
    }));
  }, [repositoryFiles]);

  // ✅ 분석이 끝나면 결과 생성 + Dashboard Action Items로 발행
  useEffect(() => {
    if (!analysisComplete) return;

    const res = runMockDiagnosis(COMPLIANCE_MASTER_SCHEMA, targetCountry, diagnosisFiles);
    setResultsById(res);

    const items = buildActionItemsFromResults(COMPLIANCE_MASTER_SCHEMA, targetCountry, res);
    onPublishActionItems?.(targetCountry, items);
  }, [analysisComplete, targetCountry, diagnosisFiles, onPublishActionItems]);

  const summary = useMemo(() => {
    const vals = Object.values(resultsById);
    const pass = vals.filter((v) => v.status === "PASS").length;
    const fail = vals.filter((v) => v.status === "FAIL").length;
    return { pass, fail };
  }, [resultsById]);

  return (
    <div className="p-8 max-w-[1400px] mx-auto animate-fade-in min-h-full flex flex-col">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-6 px-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white text-blue-600 flex items-center justify-center shadow-sm border border-gray-100">
              <CheckSquare size={24} />
            </span>
            설계 적합성 검증
          </h1>

          <p className="text-gray-500 mt-2 ml-16 text-sm font-medium">
            업로드된 CAD/BOM 데이터를 기준으로 {targetCountry} 규제 적합성을 진단합니다.
          </p>

          <div className="ml-16 mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setChecklistOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 shadow-sm"
              type="button"
            >
              <Table2 size={16} /> 체크리스트(판단 기준) 보기
            </button>

            <button
              onClick={autoUploadFromRepo}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 shadow-sm"
              type="button"
            >
              <Wand2 size={16} /> 파일저장소 자동 업로드
            </button>

            {analysisComplete && (
              <span className="text-xs font-black text-gray-700 bg-white border border-gray-200 px-3 py-1 rounded-full">
                PASS {summary.pass} / FAIL {summary.fail}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-1 rounded-xl flex border border-gray-200 shadow-sm">
          {["EU", "US"].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setTargetCountry(code);
                setDiagnosisFiles({});
                setAnalysisComplete(false);
                setResultsById({});
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

      {/* Body */}
      <div className="flex flex-col gap-6 flex-1">
        {/* Upload step (✅ 여기만 UI 통합) */}
        {!analysisComplete && !isAnalyzing && (
          <div className="w-full animate-fade-in space-y-6">
            <StatusSummaryWidget
              total={INITIAL_UPLOADS.length}
              current={Object.keys(diagnosisFiles).length}
              label="진단용 파일"
            />

            <div className="bg-white p-8 rounded-[2rem] border border-gray-200 shadow-lg flex flex-col overflow-hidden">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload size={32} className="text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">진단 파일 업로드</h2>
                <p className="text-gray-500">규제 진단을 위해 CAD/BOM 파일을 업로드해주세요.</p>
              </div>

              {/* ✅ DocsView 카드 스타일로 통일 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 px-4">
                {INITIAL_UPLOADS.map((item) => {
                  const uploaded = Boolean(diagnosisFiles?.[item.id]);

                  return (
                    <div
                      key={item.id}
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
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
                                {item.category}
                              </span>
                            </div>

                            <span className="text-base font-bold text-gray-800 leading-tight block truncate">
                              {item.name}
                            </span>
                            <span className="text-xs text-gray-400 mt-1 block line-clamp-1">{item.desc}</span>
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
                              <FileText size={14} className="text-blue-500" />
                              {diagnosisFiles[item.id]?.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFile(item.id)}
                              className="text-gray-400 hover:text-red-500"
                              aria-label="remove"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <FilePickButton itemId={item.id} onFileChange={handleFileChange} />

                            <button
                              type="button"
                              onClick={() => setRepoModalTarget(item.id)}
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
                <button
                  onClick={startAnalysis}
                  disabled={!isAnyFileUploaded}
                  className={`w-full py-4 rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2 transform hover:scale-[1.02]
                    ${
                      isAnyFileUploaded
                        ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-blue-200"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  type="button"
                >
                  <Search size={20} /> AI 규제 진단 시작
                </button>

                {!isAnyFileUploaded && (
                  <div className="mt-3 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                    <AlertCircle size={14} />
                    CAD 또는 BOM 중 최소 1개 업로드해야 시작할 수 있어요.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analyzing (✅ 원본 그대로) */}
        {isAnalyzing && (
          <div className="max-w-xl w-full mx-auto animate-fade-in">
            <div className="h-96 bg-white rounded-[2rem] border border-gray-100 shadow-xl flex flex-col items-center justify-center p-8 relative overflow-hidden">
              <div className="w-24 h-24 relative mb-6">
                <svg className="animate-spin w-full h-full text-blue-100" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path
                    className="opacity-100 text-blue-600"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-blue-600 text-xl">
                  {progress}%
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">AI 심층 분석 중</h3>
              <p className="text-sm text-gray-400 text-center leading-relaxed">
                규격 DB 대조 및 위험성 평가 시뮬레이션을 진행하고 있습니다.
                <br />
                잠시만 기다려주세요.
              </p>
            </div>
          </div>
        )}

        {/* Result (✅ 절대 변경 없음: 원본 그대로) */}
        {analysisComplete && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <CheckCircle size={28} className="text-blue-600" />
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  진단 완료 (PASS {summary.pass} / FAIL {summary.fail})
                </h3>
                <div className="text-xs text-gray-500 font-semibold mt-1">
                  체크리스트 보기에서 항목별 O/X 및 개선 가이드를 확인하세요.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setChecklistOpen(true)}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs hover:bg-blue-700 flex items-center gap-2"
              >
                <Table2 size={16} /> 결과 보기
              </button>

              <button
                onClick={() => {
                  setAnalysisComplete(false);
                  setDiagnosisFiles({});
                  setResultsById({});
                }}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-black text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <RefreshCw size={16} /> 다시 분석하기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ✅ Repository Picker Modal (Diagnosis 전용) */}
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

      {/* Checklist Modal */}
      <ChecklistExcelModal
        open={checklistOpen}
        onClose={() => setChecklistOpen(false)}
        schema={COMPLIANCE_MASTER_SCHEMA}
        market={targetCountry}
        resultsById={resultsById}
      />
    </div>
  );
});

export default DiagnosisView;

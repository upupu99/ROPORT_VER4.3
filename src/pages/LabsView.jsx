// src/pages/LabsView.jsx
import React, { memo, useMemo, useState, useCallback, useRef } from "react";
import {
  FileCode,
  Upload,
  FileText,
  CheckCircle,
  X,
  Search,
  AlertCircle,
  RefreshCw,
  Wand2,
  ShieldCheck,
  Sparkles,
  FolderOpen,
} from "lucide-react";

import StatusSummaryWidget from "../components/StatusSummaryWidget";
import RepositoryView from "../components/RepositoryView";

// ✅ mock에서 매칭 결과 데이터 가져오기
import { LABS_DATA } from "../data/mock";

/* =========================
   Utils
========================= */
const nvl = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// 0~1이면 %로 변환, 0~100이면 그대로
const toPct = (v) => {
  const x = nvl(v, 0);
  return x <= 1 ? Math.round(x * 100) : Math.round(x);
};

const clampPct = (p) => Math.max(0, Math.min(100, nvl(p, 0)));

const roundUp = (value, step) => {
  const v = nvl(value, 0);
  const s = Math.max(1, nvl(step, 1));
  return Math.ceil(v / s) * s;
};

// "낮을수록 좋음" 지표 정규화: value=0 -> 100%, value=max -> 0%
const invNormalizeToPct = (value, maxValue) => {
  const v = nvl(value, 0);
  const m = Math.max(1, nvl(maxValue, 1));
  return clampPct(100 - (v / m) * 100);
};

// labs 배열에서 scoring 기반으로 게이지 상한 자동 산출
function computeGaugeMax(labs = []) {
  const costs = [];
  const leads = [];

  for (const lab of labs) {
    const s = lab?.scoring || {};
    const c = nvl(s.cost, NaN);
    const l = nvl(s.leadTime, NaN);
    if (Number.isFinite(c)) costs.push(c);
    if (Number.isFinite(l)) leads.push(l);
  }

  const maxCost = costs.length ? Math.max(...costs) : 300;
  const maxLead = leads.length ? Math.max(...leads) : 60;

  const COST_MANWON = Math.max(200, roundUp(maxCost * 1.15, 50));
  const LEAD_DAYS = Math.max(30, roundUp(maxLead * 1.15, 5));

  return { COST_MANWON, LEAD_DAYS };
}

/* =========================
   Score Modal (스코어링 보기)
========================= */
const ScoreRow = memo(function ScoreRow({ label, display, barPct, hint }) {
  const pct = clampPct(barPct);

  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-bold text-gray-700">{label}</div>
          {hint ? <div className="text-[11px] text-gray-400">{hint}</div> : null}
        </div>
        <div className="text-sm font-black text-gray-900">{display}</div>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
});

const ScoreModal = memo(function ScoreModal({ lab, onClose, gaugeMax }) {
  const scoring = lab?.scoring || {};
  const g = gaugeMax || { COST_MANWON: 300, LEAD_DAYS: 60 };

  // 값 추출
  const costManwon = useMemo(() => nvl(scoring.cost ?? 0), [scoring]); // 만원
  const leadDays = useMemo(() => nvl(scoring.leadTime ?? 0), [scoring]); // 일
  const pastSuccessPct = useMemo(() => toPct(scoring.successRate ?? 0), [scoring]); // %
  const testFieldPct = useMemo(() => toPct(scoring.testField ?? 0), [scoring]); // %

  // ✅ 그래프 표시를 카드와 동일하게: costDisplay / durationDisplay 우선
  const costText = useMemo(() => {
    if (lab?.costDisplay) return lab.costDisplay; // 예: "1,500만원"
    return `${Math.round(costManwon).toLocaleString()}만원`;
  }, [lab, costManwon]);

  const durationText = useMemo(() => {
    if (lab?.durationDisplay) return lab.durationDisplay; // 예: "2.5개월"
    // fallback: leadDays -> 개월/일
    const months = leadDays / 30;
    return months >= 1 ? `${months.toFixed(1)}개월` : `${Math.max(1, Math.round(leadDays))}일`;
  }, [lab, leadDays]);

  // ✅ 게이지(정규화)
  // 비용/리드타임: 낮을수록 유리(역방향)
  const costBarPct = useMemo(() => invNormalizeToPct(costManwon, g.COST_MANWON), [costManwon, g]);
  const leadBarPct = useMemo(() => invNormalizeToPct(leadDays, g.LEAD_DAYS), [leadDays, g]);

  // 성공률/적합도: 높을수록 유리(정방향)
  const successBarPct = useMemo(() => clampPct(pastSuccessPct), [pastSuccessPct]);
  const fieldBarPct = useMemo(() => clampPct(testFieldPct), [testFieldPct]);

  // ✅ 총점(요청): 성공률/적합도 중심 가중치 + 체감 보정(군포센터 점수 올라가게)
  const totalScore = useMemo(() => {
    const costScore = invNormalizeToPct(costManwon, g.COST_MANWON); // 0~100
    const timeScore = invNormalizeToPct(leadDays, g.LEAD_DAYS);     // 0~100
    const successScore = clampPct(pastSuccessPct);                 // 0~100
    const fieldScore = clampPct(testFieldPct);                     // 0~100

    const weighted =
      costScore * 0.15 +
      timeScore * 0.15 +
      successScore * 0.35 +
      fieldScore * 0.35;

    const boosted = weighted + 8; // 필요시 10~12로 올리면 더 높아짐
    return Math.round(clampPct(boosted));
  }, [costManwon, leadDays, pastSuccessPct, testFieldPct, g]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-[min(560px,92vw)] bg-white rounded-3xl border border-gray-200 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-black text-gray-900 truncate">{lab?.name || "스코어링"}</div>
            <div className="text-xs text-gray-500 mt-1"></div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
            aria-label="close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {/* ✅ 인증성공확률 -> 총점 00점 */}
          <div className="mb-4 p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-between">
            <div className="text-sm font-bold text-blue-700">총점</div>
            <div className="text-2xl font-black text-blue-700">{totalScore}점</div>
          </div>

          {/* ✅ 총점 밑 그래프 2개를 카드와 동일한 "예상 견적/소요 기간" */}
          <ScoreRow label="예상 견적" hint="낮을수록 유리" display={costText} barPct={costBarPct} />
          <ScoreRow label="소요 기간" hint="낮을수록 유리" display={durationText} barPct={leadBarPct} />

          {/* 나머지 2개 유지 */}
          <ScoreRow
            label="과거 인증성공률"
            hint="높을수록 유리"
            display={`${pastSuccessPct}%`}
            barPct={successBarPct}
          />
          <ScoreRow
            label="시험분야 적합도"
            hint="높을수록 유리"
            display={`${testFieldPct}%`}
            barPct={fieldBarPct}
          />

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700"
              type="button"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

/* =========================
   ✅ 파일명 기반 자동 업로드 헬퍼
========================= */
const norm = (s = "") =>
  String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "")
    .replace(/[()]/g, "")
    .replace(/,/g, "");

const extOf = (name = "") => {
  const n = String(name || "").toLowerCase();
  const m = n.match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
};

function pickBestFile(repositoryFiles, { keywords = [], exts = [] }) {
  const ks = (keywords || []).map(norm).filter(Boolean);
  const allowedExts = (exts || []).map((e) => String(e).toLowerCase()).filter(Boolean);

  let best = null;
  let bestScore = -1;

  for (const f of repositoryFiles || []) {
    const rawName = String(f?.name || "");
    const name = norm(rawName);
    const ext = extOf(rawName);

    if (allowedExts.length > 0 && !allowedExts.includes(ext)) continue;

    let score = 0;
    for (const k of ks) if (name.includes(k)) score += 10;
    if (name.includes("rt100")) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  return bestScore > 0 ? best : null;
}

/** ✅ DocsView 방식: label/submit 이슈 없이 버튼으로 파일 picker */
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

const LabsView = memo(function LabsView({ targetCountry, setTargetCountry, repositoryFiles = [] }) {
  const [labFiles, setLabFiles] = useState({});
  const [repoModalTarget, setRepoModalTarget] = useState(null);

  const [isMatching, setIsMatching] = useState(false);
  const [matchComplete, setMatchComplete] = useState(false);
  const [progress, setProgress] = useState(0);

  const [matchedLabs, setMatchedLabs] = useState([]);
  const [scoreTarget, setScoreTarget] = useState(null);

  const REQUIRED_DOCS = [
    { id: "lab_spec", category: "필수", name: "제품사양서 (Product Spec)", desc: "제품 제원 및 상세 사양 (.pdf)" },
    { id: "lab_manual", category: "필수", name: "사용자 매뉴얼 (User Manual)", desc: "설치 및 작동 가이드 (.pdf)" },
    { id: "lab_circuit", category: "필수", name: "회로도/블록도 (Circuit/Block)", desc: "전기 회로도 및 시스템 블록도 (.pdf, .dwg)" },
    { id: "lab_bom", category: "필수", name: "부품리스트 (BOM)", desc: "핵심 부품 목록 (.xlsx)" },
    { id: "lab_testplan", category: "선택", name: "시험계획서 (Test Plan)", desc: "자체 시험 계획 및 요구사항 (.docx)" },
  ];

  const uploadedCount = Object.keys(labFiles).length;
  const canStart = uploadedCount >= 3;

  // ✅ 게이지 상한 자동 계산 (추천 결과 또는 LABS_DATA 기반)
  const gaugeMax = useMemo(() => {
    const base =
      Array.isArray(matchedLabs) && matchedLabs.length
        ? matchedLabs
        : Array.isArray(LABS_DATA)
          ? LABS_DATA
          : [];
    return computeGaugeMax(base);
  }, [matchedLabs]);

  const handleFileChange = (e, itemId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLabFiles((prev) => ({ ...prev, [itemId]: file }));
  };

  const handlePickFromRepo = (file) => {
    if (!repoModalTarget) return;
    setLabFiles((prev) => ({ ...prev, [repoModalTarget]: { name: file?.name ?? "selected_file", ...file } }));
    setRepoModalTarget(null);
  };

  const removeFile = (itemId) => {
    setLabFiles((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const reset = useCallback(() => {
    setLabFiles({});
    setIsMatching(false);
    setMatchComplete(false);
    setProgress(0);
    setMatchedLabs([]);
    setRepoModalTarget(null);
    setScoreTarget(null);
  }, []);

  const startMatching = () => {
    if (!canStart || isMatching) return;
    setIsMatching(true);
    setMatchComplete(false);
    setProgress(0);

    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsMatching(false);
          setMatchComplete(true);

          const labs = Array.isArray(LABS_DATA) ? LABS_DATA : [];
          setMatchedLabs(labs.slice(0, 3));
        }, 300);
      }
    }, 30);
  };

  const autoUploadFromRepo = useCallback(() => {
    const RULES = {
      lab_spec: {
        keywords: ["제품사양서", "사양서", "spec", "rt100제품사양서", "rt100"],
        exts: ["pdf", "rtf", "doc", "docx"],
      },
      lab_manual: {
        keywords: ["사용자매뉴얼", "매뉴얼", "manual", "rt100사용자매뉴얼", "rt100"],
        exts: ["pdf", "rtf", "doc", "docx"],
      },
      lab_circuit: {
        keywords: ["회로도", "블록도", "circuit", "block", "rt100회로도", "rt100"],
        exts: ["pdf", "dwg", "dxf"],
      },
      lab_bom: {
        keywords: ["bom", "부품", "부품리스트", "rt100트랙터bom", "rt100bom", "rt100"],
        exts: ["xlsx", "csv"],
      },
      lab_testplan: {
        keywords: ["시험계획서", "testplan", "시험계획", "plan", "rt100"],
        exts: ["doc", "docx", "pdf", "rtf"],
      },
    };

    const next = { ...labFiles };

    REQUIRED_DOCS.forEach((doc) => {
      if (next[doc.id]) return;

      let hit = pickBestFile(repositoryFiles, RULES[doc.id] || { keywords: [doc.name], exts: [] });

      if (!hit && doc.id === "lab_testplan") {
        hit = pickBestFile(repositoryFiles, {
          keywords: ["시험성적서", "testreport", "성적서", "report", "자율주행트랙터", "rt100"],
          exts: ["pdf", "rtf", "doc", "docx"],
        });
      }

      if (!hit) return;
      next[doc.id] = { name: hit.name, ...hit };
    });

    setLabFiles(next);
  }, [repositoryFiles, labFiles]);

  const headerTitle = useMemo(() => {
    if (targetCountry === "EU") return "국내 인증기관 매칭 (EU 대응)";
    if (targetCountry === "US") return "국내 인증기관 매칭 (US 대응)";
    return "국내 인증기관 매칭";
  }, [targetCountry]);

  return (
    <div className="p-8 pb-28 max-w-[1400px] mx-auto animate-fade-in h-full flex flex-col">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-6 px-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white text-blue-600 flex items-center justify-center shadow-sm border border-gray-100">
              <FileCode size={24} />
            </span>
            {headerTitle}
          </h1>
          <p className="text-gray-500 mt-2 ml-16 text-sm font-medium">
            제출 서류를 기반으로 적합한 국내 시험소/인증기관을 추천합니다.
          </p>

          {!matchComplete && !isMatching && (
            <div className="ml-16 mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={autoUploadFromRepo}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 shadow-sm"
                type="button"
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
              onClick={() => {
                setTargetCountry(code);
                reset();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 whitespace-nowrap ${
                targetCountry === code
                  ? "bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              type="button"
            >
              {code === "EU" && "유럽"}
              {code === "US" && "미국"}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-6">
        {!matchComplete && !isMatching && (
          <StatusSummaryWidget total={REQUIRED_DOCS.length} current={uploadedCount} label="제출 서류" />
        )}

        {/* Upload Card */}
        {!matchComplete && !isMatching && (
          <div className="bg-white p-8 rounded-[2rem] border border-gray-200 shadow-lg flex flex-col overflow-hidden">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload size={32} className="text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">제출 서류 업로드</h2>
              <p className="text-gray-500">정확한 매칭을 위해 가능한 모든 문서를 등록해주세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 px-4">
              {REQUIRED_DOCS.map((item) => {
                const uploaded = !!labFiles?.[item.id];

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
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                item.category === "필수"
                                  ? "bg-red-50 text-red-700 border-red-100"
                                  : "bg-slate-50 text-slate-700 border-slate-200"
                              }`}
                            >
                              {item.category}
                            </span>
                          </div>

                          <span className="text-base font-bold text-gray-800 leading-tight block truncate">{item.name}</span>
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
                            {labFiles[item.id]?.name || "uploaded_file"}
                          </span>

                          <button
                            onClick={() => removeFile(item.id)}
                            className="text-gray-400 hover:text-red-500"
                            type="button"
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

            {/* 하단 CTA */}
            <div className="pt-6 border-t border-gray-100">
              <button
                onClick={startMatching}
                disabled={!canStart}
                className={`w-full py-4 rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2 transform hover:scale-[1.02]
                  ${
                    canStart
                      ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-blue-200"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                type="button"
              >
                <Search size={20} /> 시험소 매칭 시작하기
              </button>

              {!canStart && (
                <div className="mt-3 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                  <AlertCircle size={14} />
                  최소 3개 이상의 문서를 업로드해야 매칭이 가능합니다.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analyzing */}
        {isMatching && (
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
              <h3 className="text-xl font-bold text-gray-800 mb-2">매칭 분석 중</h3>
              <p className="text-sm text-gray-400 text-center leading-relaxed">
                제출 서류 기반으로 적합 시험소/인증기관 후보를 탐색 중입니다.
              </p>
            </div>
          </div>
        )}

        {/* Result */}
        {matchComplete && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CheckCircle size={28} className="text-gray-600" />
                <div>
                  <h3 className="text-lg font-bold text-gray-800">매칭 완료</h3>
                  <div className="text-xs text-gray-600 font-semibold mt-1">
                    적합 시험소 3곳을 추천했습니다. 아래에서 비교하세요.
                  </div>
                </div>
              </div>

              <button
                onClick={reset}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 flex items-center gap-2"
                type="button"
              >
                <RefreshCw size={16} /> 다시 매칭하기
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {matchedLabs.map((lab, idx) => (
                <div
                  key={lab.id ?? idx}
                  className="relative bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4"
                >
                  {idx === 0 && (
                    <span className="absolute top-4 right-4 text-[10px] font-black px-2 py-1 rounded-full bg-blue-600 text-white shadow">
                      AI Best Match
                    </span>
                  )}

                  <div className="flex items-start justify-between pr-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-900 truncate">{lab.name}</h4>
                      <div className="text-[11px] text-gray-400 mt-1">
                        {lab.chamber ?? "-"} • {lab.distance ?? "-"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-500">예상 견적</div>
                    <div className="text-right font-bold text-gray-900">{lab.costDisplay ?? "-"}</div>
                    <div className="text-gray-500">소요 기간</div>
                    <div className="text-right font-bold text-gray-900">{lab.durationDisplay ?? "-"}</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(lab.tags || []).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck size={14} className="text-gray-600" />
                      <span className="text-[11px] font-black text-gray-700">보유 인증 / 역량</span>
                    </div>

                    {Array.isArray(lab.accreditations) && lab.accreditations.length > 0 ? (
                      <ul className="space-y-1">
                        {lab.accreditations.map((a, i) => (
                          <li key={i} className="text-[11px] text-gray-600 leading-relaxed flex gap-2">
                            <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[11px] text-gray-600 leading-relaxed">{lab.cert ?? "인증 정보 없음"}</div>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-blue-600" />
                      <span className="text-[11px] font-black text-gray-800">AI 분석</span>
                    </div>

                    {lab.ai?.summary ? (
                      <>
                        <div className="text-[11px] text-gray-800 font-bold mb-2">{lab.ai.summary}</div>

                        {Array.isArray(lab.ai?.bullets) && lab.ai.bullets.length > 0 && (
                          <ul className="space-y-1.5 mb-2">
                            {lab.ai.bullets.map((b, i) => (
                              <li key={i} className="text-[11px] text-gray-600 leading-relaxed flex gap-2">
                                <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-blue-200 shrink-0" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {Array.isArray(lab.ai?.nextDocs) && lab.ai.nextDocs.length > 0 && (
                          <div className="mt-2 text-[11px] text-gray-500">
                            <span className="font-black text-gray-700">다음 필요 서류:</span> {lab.ai.nextDocs.join(", ")}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] text-gray-600 leading-relaxed">{lab.reason ?? "-"}</div>
                    )}
                  </div>

                  <a
                    href={lab.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-1 w-full px-4 py-2 rounded-xl text-white text-xs font-black text-center ${
                      lab.url ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-200 text-gray-400 pointer-events-none"
                    }`}
                  >
                    사이트로 이동하기
                  </a>

                  <button
                    type="button"
                    onClick={() => setScoreTarget(lab)}
                    className="w-full px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-black hover:bg-gray-50"
                  >
                    스코어링 보기
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ✅ Repository Picker Modal */}
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

      {/* ✅ 스코어링 모달 */}
      {scoreTarget && <ScoreModal lab={scoreTarget} gaugeMax={gaugeMax} onClose={() => setScoreTarget(null)} />}
    </div>
  );
});

export default LabsView;

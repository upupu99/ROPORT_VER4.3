// src/pages/SettingsPage.jsx
import React, { memo, useEffect, useMemo, useState } from "react";
import {
  Settings as SettingsIcon,
  Building2,
  Users,
  Crown,
  ShieldCheck,
  Eye,
  Key,
  Copy,
  Check,
  Lock,
  BellRing,
  AlertTriangle,
  Trash2,
  ChevronDown,
  Plus,
  History,
} from "lucide-react";

/**
 * Production-ish Settings UI
 * - DiagnosisView와 동일 스케일: p-8 / max-w-[1400px] / rounded-[2rem]
 * - Blue 사용 최소화: Primary CTA + Owner(배지) + Active tab만
 * - Workspace / Members / Roles (Owner만 blue, 나머지 gray)
 * - Security: Policy → API Key → Activity Log
 * - 즉시 반영 UX: 변경 시 toast
 */

const cx = (...arr) => arr.filter(Boolean).join(" ");

const Badge = memo(function Badge({ tone = "gray", children }) {
  const map = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
    red: "bg-rose-50 text-rose-700 border-rose-100",
  };
  return (
    <span className={cx("text-[11px] font-black px-2 py-0.5 rounded-full border inline-flex items-center gap-1", map[tone])}>
      {children}
    </span>
  );
});

const Toggle = memo(function Toggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      className={cx(
        "w-12 h-7 rounded-full border transition-all flex items-center px-1",
        value ? "bg-blue-600 border-blue-600 justify-end" : "bg-gray-100 border-gray-200 justify-start",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      aria-label="toggle"
    >
      <span className="w-5 h-5 bg-white rounded-full shadow-sm" />
    </button>
  );
});

const Panel = memo(function Panel({ children }) {
  return (
    <div className="bg-white rounded-[2rem] border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-7">{children}</div>
    </div>
  );
});

const TabButton = memo(function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "px-4 py-2 rounded-xl text-xs font-black transition-all",
        active ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100 shadow-sm" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {children}
    </button>
  );
});

const SectionTitle = memo(function SectionTitle({ title, desc, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <div className="text-sm font-black text-gray-900">{title}</div>
        {desc && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
});

const Row = memo(function Row({ icon, title, desc, right, danger }) {
  return (
    <div
      className={cx(
        "flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all",
        danger
          ? "bg-rose-50/40 border-rose-100 hover:border-rose-200"
          : "bg-white border-gray-200 hover:border-gray-300"
      )}
    >
      <div className="flex gap-3 min-w-0">
        <div
          className={cx(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
            danger ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-gray-50 text-gray-700 border-gray-200"
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-black text-gray-900 flex items-center gap-2">
            {title}
            {danger && <Badge tone="red">주의</Badge>}
          </div>
          {desc && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</div>}
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
});

function maskKey(k) {
  if (!k) return "";
  const head = k.slice(0, 7);
  const tail = k.slice(-4);
  return `${head}${"*".repeat(18)}${tail}`;
}

/* ---------------- Toast ---------------- */

const Toast = memo(function Toast({ open, tone = "success", title, desc, onClose }) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose?.(), 1600);
    return () => clearTimeout(t);
  }, [open, onClose]);

  const tones = {
    success: "bg-gray-900 text-white",
    info: "bg-blue-600 text-white",
    warning: "bg-amber-500 text-white",
    danger: "bg-rose-600 text-white",
  };

  return (
    <div
      className={cx(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-2rem)] max-w-md transition-all",
        open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      )}
    >
      <div className={cx("rounded-2xl px-4 py-3 shadow-lg border border-white/10", tones[tone])}>
        <div className="text-sm font-black">{title}</div>
        {desc && <div className="text-sm opacity-90 mt-0.5 leading-relaxed">{desc}</div>}
      </div>
    </div>
  );
});

/* ---------------- Roles ---------------- */
// ✅ Owner만 blue, 나머지는 전부 gray로 통일
const roleBadge = (role) => {
  if (role === "Owner") return { tone: "blue", icon: <Crown size={12} /> };
  if (role === "Admin") return { tone: "gray", icon: <ShieldCheck size={12} /> };
  if (role === "Member") return { tone: "gray", icon: <Users size={12} /> };
  return { tone: "gray", icon: <Eye size={12} /> };
};

/* ---------------- Activity Log ---------------- */

const AuditLogTable = memo(function AuditLogTable({ enabled }) {
  const [filter, setFilter] = useState("all"); // all | security | roles | keys | failed

  const logs = useMemo(
    () => [
      { at: "2026-02-05 10:11", user: "김대동", action: "Role Changed", target: "오서연 → Viewer", result: "Success", type: "roles" },
      { at: "2026-02-05 09:58", user: "박지은", action: "API Key Rotated", target: "sk-****", result: "Success", type: "keys" },
      { at: "2026-02-05 09:41", user: "이준호", action: "Login", target: "Console", result: "Success", type: "security" },
      { at: "2026-02-05 09:12", user: "unknown", action: "Login", target: "Console", result: "Fail", type: "failed" },
    ],
    []
  );

  const filtered = useMemo(() => logs.filter((l) => (filter === "all" ? true : l.type === filter)), [logs, filter]);

  const Chip = ({ k, label }) => (
    <button
      type="button"
      onClick={() => setFilter(k)}
      className={cx(
        "px-3 py-1.5 rounded-full text-xs font-black border transition-all",
        filter === k ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      )}
    >
      {label}
    </button>
  );

  if (!enabled) {
    return (
      <div className="p-5 rounded-2xl border border-gray-200 bg-gray-50">
        <div className="text-sm font-black text-gray-900">활동 로그가 비활성화되어 있습니다</div>
        <div className="text-xs text-gray-500 mt-1">감사 로그를 활성화하면 보안 이벤트가 기록됩니다.</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
        <div>
          <div className="text-sm font-black text-gray-900 flex items-center gap-2">
            <History size={16} className="text-gray-700" /> 활동 로그
          </div>
          <div className="text-xs text-gray-500 mt-1">최근 보안/권한/키 관련 이벤트</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip k="all" label="전체" />
          <Chip k="security" label="보안" />
          <Chip k="roles" label="권한" />
          <Chip k="keys" label="키" />
          <Chip k="failed" label="실패" />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr className="text-[11px] font-black text-gray-500">
              <th className="px-4 py-3">시간</th>
              <th className="px-4 py-3">사용자</th>
              <th className="px-4 py-3">액션</th>
              <th className="px-4 py-3">대상</th>
              <th className="px-4 py-3">결과</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {filtered.map((l, idx) => (
              <tr key={idx} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-600">{l.at}</td>
                <td className="px-4 py-3 font-bold text-gray-800">{l.user}</td>
                <td className="px-4 py-3 font-bold text-gray-800">{l.action}</td>
                <td className="px-4 py-3 text-gray-600">{l.target}</td>
                <td className="px-4 py-3">
                  <span
                    className={cx(
                      "px-2 py-1 rounded-full border text-[11px] font-black inline-flex",
                      l.result === "Success"
                        ? "bg-blue-50 text-blue-700 border-blue-100"
                        : "bg-gray-50 text-gray-800 border-gray-100"
                    )}
                  >
                    {l.result}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-gray-500" colSpan={5}>
                  해당 조건의 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/* ---------------- Page ---------------- */

const SettingsPage = memo(function SettingsPage() {
  const [tab, setTab] = useState("workspace"); // workspace | security | notifications | system

  // toast
  const [toast, setToast] = useState({ open: false, tone: "success", title: "", desc: "" });
  const showToast = (tone, title, desc) => setToast({ open: true, tone, title, desc });
  const closeToast = () => setToast((t) => ({ ...t, open: false }));

  // settings
  const [autoLogout, setAutoLogout] = useState(true);
  const [auditLog, setAuditLog] = useState(true);
  const [maskSensitive, setMaskSensitive] = useState(true);

  const [notifyUpload, setNotifyUpload] = useState(true);
  const [notifyDone, setNotifyDone] = useState(true);
  const [notifyWarnings, setNotifyWarnings] = useState(true);

  const [apiKey, setApiKey] = useState("sk-live-2a9f5b7c-1234-5678-90ab-abcdef012345");
  const [copied, setCopied] = useState(false);

  const workspace = useMemo(
    () => ({
      name: "대동 로보틱스",
      plan: "Pro",
      region: "KR (Seoul)",
      createdAt: "2026-01-12",
      seats: { used: 7, total: 10 },
    }),
    []
  );

  const [members, setMembers] = useState([
    { id: "u1", name: "김대동", email: "kim@roport.ai", role: "Owner" },
    { id: "u2", name: "박지은", email: "j.park@roport.ai", role: "Admin" },
    { id: "u3", name: "이준호", email: "j.lee@roport.ai", role: "Member" },
    { id: "u4", name: "오서연", email: "sy.oh@roport.ai", role: "Viewer" },
  ]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Member");

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  // Immediate feedback
  const flip = (setter, nextValue, msg) => {
    setter(nextValue);
    showToast("success", "변경사항이 저장되었습니다", msg);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      showToast("success", "복사 완료", "API Key가 클립보드에 복사되었습니다.");
    } catch {
      showToast("danger", "복사 실패", "클립보드 권한을 확인해 주세요.");
    }
  };

  const handleRotateKey = () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    setApiKey(`sk-live-${suffix}-1234-5678-90ab-abcdef012345`);
    showToast("warning", "API Key가 재발급되었습니다", "기존 키는 즉시 폐기됩니다.");
  };

  const handleInvite = () => {
    const email = inviteEmail.trim();
    if (!email) return;

    const next = {
      id: `u_${Date.now()}`,
      name: email.split("@")[0] || "new",
      email,
      role: inviteRole,
    };
    setMembers((prev) => [next, ...prev]);
    setInviteEmail("");
    setInviteRole("Member");
    showToast("info", "초대가 발송되었습니다", `${email} · 역할 ${inviteRole}`);
  };

  const setMemberRole = (id, role) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    showToast("success", "권한이 변경되었습니다", `사용자 역할이 ${role}(으)로 변경되었습니다.`);
  };

  const handleClearCache = () => {
    showToast("success", "정리가 완료되었습니다", "로컬 캐시가 정리되었습니다.");
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto animate-fade-in h-full flex flex-col gap-6 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white text-blue-600 flex items-center justify-center shadow-sm border border-gray-100">
              <SettingsIcon size={24} />
            </span>
            설정
          </h1>
          <p className="text-gray-500 mt-2 ml-16 text-sm font-medium">
            워크스페이스와 보안, 알림, 시스템 환경을 관리합니다.
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white p-1 rounded-xl flex border border-gray-200 shadow-sm">
          <TabButton active={tab === "workspace"} onClick={() => setTab("workspace")}>
            워크스페이스
          </TabButton>
          <TabButton active={tab === "security"} onClick={() => setTab("security")}>
            보안
          </TabButton>
          <TabButton active={tab === "notifications"} onClick={() => setTab("notifications")}>
            알림
          </TabButton>
          <TabButton active={tab === "system"} onClick={() => setTab("system")}>
            시스템
          </TabButton>
        </div>
      </div>

      {/* WORKSPACE */}
      {tab === "workspace" && (
        <Panel>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Workspace Overview */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <SectionTitle
                title="워크스페이스"
                desc="조직 단위로 사용자와 권한을 관리합니다."
                right={
                  <Badge tone="blue">
                    <Building2 size={14} /> {workspace.plan}
                  </Badge>
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">NAME</div>
                  <div className="text-lg font-black mt-1 text-gray-900">{workspace.name}</div>
                </div>
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">REGION</div>
                  <div className="text-lg font-black mt-1 text-gray-900">{workspace.region}</div>
                </div>
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">CREATED</div>
                  <div className="text-sm font-black mt-2 text-gray-900">{workspace.createdAt}</div>
                </div>
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">SEATS</div>
                  <div className="text-sm font-black mt-2 text-gray-900">
                    {workspace.seats.used}/{workspace.seats.total} 사용 중
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-2 bg-blue-600"
                      style={{ width: `${Math.min(100, (workspace.seats.used / workspace.seats.total) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 p-4 rounded-2xl bg-white border border-gray-200">
                <div className="flex items-center gap-2 text-sm font-black text-gray-900">
                  <ShieldCheck size={16} className="text-gray-700" /> 역할
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <Badge tone="blue">
                      <Crown size={12} /> Owner
                    </Badge>
                    전체 관리
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="gray">
                      <ShieldCheck size={12} /> Admin
                    </Badge>
                    정책/멤버
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="gray">
                      <Users size={12} /> Member
                    </Badge>
                    작업 수행
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="gray">
                      <Eye size={12} /> Viewer
                    </Badge>
                    읽기 전용
                  </div>
                </div>
              </div>
            </div>

            {/* Members & Roles */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <SectionTitle title="멤버" desc="워크스페이스 멤버와 역할을 관리합니다." right={<Badge tone="gray">{members.length}명</Badge>} />

              {/* Invite */}
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                <div className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <Plus size={16} className="text-blue-600" /> 멤버 초대
                </div>

                <div className="mt-3 flex flex-col md:flex-row gap-2">
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@company.com"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
                  />

                  <div className="relative">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="appearance-none px-4 py-2.5 pr-10 rounded-xl border border-gray-200 bg-white text-sm font-black text-gray-800 outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option>Owner</option>
                      <option>Admin</option>
                      <option>Member</option>
                      <option>Viewer</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>

                  <button
                    onClick={handleInvite}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 shadow-sm"
                  >
                    초대
                  </button>
                </div>
              </div>

              {/* Members list */}
              <div className="mt-4 space-y-2">
                {members.map((m) => {
                  const meta = roleBadge(m.role);
                  return (
                    <div
                      key={m.id}
                      className="p-4 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 transition-all flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-black text-gray-900 truncate">{m.name}</div>
                        <div className="text-xs text-gray-500 mt-1 truncate">{m.email}</div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge tone={meta.tone}>
                          {meta.icon} {m.role}
                        </Badge>

                        <div className="relative">
                          <select
                            value={m.role}
                            onChange={(e) => setMemberRole(m.id, e.target.value)}
                            className="appearance-none px-3 py-2 pr-9 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-800 outline-none focus:ring-2 focus:ring-blue-200"
                          >
                            <option>Owner</option>
                            <option>Admin</option>
                            <option>Member</option>
                            <option>Viewer</option>
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* SECURITY */}
      {tab === "security" && (
        <Panel>
          <SectionTitle title="보안" desc="정책, 키, 감사 로그를 관리합니다." />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Row
              icon={<Lock size={18} />}
              title="자동 로그아웃"
              desc="비활성 상태가 지속되면 세션을 종료합니다."
              right={<Toggle value={autoLogout} onChange={(v) => flip(setAutoLogout, v, `자동 로그아웃 ${v ? "ON" : "OFF"}`)} />}
            />

            <Row
              icon={<ShieldCheck size={18} />}
              title="감사 로그"
              desc="권한 변경, 키 재발급, 로그인 이벤트를 기록합니다."
              right={<Toggle value={auditLog} onChange={(v) => flip(setAuditLog, v, `감사 로그 ${v ? "ON" : "OFF"}`)} />}
            />

            <Row
              icon={<AlertTriangle size={18} />}
              title="민감정보 마스킹"
              desc="API Key 및 개인정보를 화면에서 마스킹 표시합니다."
              right={<Toggle value={maskSensitive} onChange={(v) => flip(setMaskSensitive, v, `민감정보 마스킹 ${v ? "ON" : "OFF"}`)} />}
            />

            {/* API Key */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <SectionTitle
                title="API Key"
                desc="키는 최소한으로 노출하고 정기적으로 회전시키는 것을 권장합니다."
                right={
                  <button
                    onClick={handleRotateKey}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 shadow-sm"
                  >
                    재발급
                  </button>
                }
              />

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-xs text-gray-700 overflow-hidden">
                  {maskSensitive ? maskKey(apiKey) : apiKey}
                </div>

                <button
                  onClick={handleCopy}
                  className={cx(
                    "px-4 py-3 rounded-xl border text-xs font-black transition-all flex items-center gap-2",
                    copied ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <AuditLogTable enabled={auditLog} />
          </div>
        </Panel>
      )}

      {/* NOTIFICATIONS */}
      {tab === "notifications" && (
        <Panel>
          <SectionTitle title="알림" desc="워크플로우 이벤트 알림을 설정합니다." />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Row
              icon={<BellRing size={18} />}
              title="업로드 알림"
              desc="파일 업로드 및 저장소 선택 이벤트"
              right={<Toggle value={notifyUpload} onChange={(v) => flip(setNotifyUpload, v, `업로드 알림 ${v ? "ON" : "OFF"}`)} />}
            />
            <Row
              icon={<ShieldCheck size={18} />}
              title="완료 알림"
              desc="진단 및 생성 작업 완료 이벤트"
              right={<Toggle value={notifyDone} onChange={(v) => flip(setNotifyDone, v, `완료 알림 ${v ? "ON" : "OFF"}`)} />}
            />
            <Row
              icon={<AlertTriangle size={18} />}
              title="경고 알림"
              desc="누락, 실패, 리스크 감지 이벤트"
              right={<Toggle value={notifyWarnings} onChange={(v) => flip(setNotifyWarnings, v, `경고 알림 ${v ? "ON" : "OFF"}`)} />}
            />

            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <SectionTitle title="채널" desc="알림 수신 채널을 관리합니다." right={<Badge tone="blue">In-App</Badge>} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="text-sm font-black text-gray-900">Email</div>
                  <div className="text-xs text-gray-500 mt-1">연동 필요</div>
                </div>
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="text-sm font-black text-gray-900">SMS</div>
                  <div className="text-xs text-gray-500 mt-1">연동 필요</div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* SYSTEM */}
      {tab === "system" && (
        <Panel>
          <SectionTitle title="시스템" desc="로컬 환경 및 런타임 정보를 확인합니다." />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Row
              icon={<Trash2 size={18} />}
              title="로컬 캐시 정리"
              desc="임시 데이터 및 캐시를 정리합니다."
              right={
                <button
                  onClick={handleClearCache}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 shadow-sm"
                >
                  정리
                </button>
              }
              danger
            />

            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <SectionTitle title="환경 정보" desc="현재 실행 환경" right={<Badge tone="green">STABLE</Badge>} />

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="text-[10px] font-black text-gray-400 uppercase">Build</div>
                  <div className="text-sm font-black text-gray-900 mt-1">Vite + React</div>
                </div>
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="text-[10px] font-black text-gray-400 uppercase">UI</div>
                  <div className="text-sm font-black text-gray-900 mt-1">Tailwind</div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      )}

      <Toast open={toast.open} tone={toast.tone} title={toast.title} desc={toast.desc} onClose={closeToast} />
    </div>
  );
});

export default SettingsPage;

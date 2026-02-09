import React, { memo } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";

const StatusSummaryWidget = memo(function StatusSummaryWidget({
  total,
  current,
  label,
}) {
  const percentage = Math.round((current / total) * 100) || 0;
  const missing = total - current;
  const isComplete = missing === 0;

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between animate-fade-in">
      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative w-20 h-20">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-gray-100"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className={`${isComplete ? "text-blue-500" : "text-blue-600"} transition-all duration-1000 ease-out`}
              strokeDasharray={`${percentage}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>

          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className={`text-sm font-bold ${isComplete ? "text-blue-600" : "text-blue-600"}`}>
              {percentage}%
            </span>
          </div>
        </div>

        {/* Text */}
        <div>
          <h3 className="text-gray-800 font-bold text-lg mb-1">{label} 준비 현황</h3>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isComplete ? "bg-blue-500" : "bg-blue-600"}`}></span>
              <span className="text-gray-600">
                준비 완료 <span className="font-bold text-gray-900">{current}</span>건
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-300"></span>
              <span className="text-gray-600">
                미비 서류 <span className="font-bold text-red-500">{missing}</span>건
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Badge */}
      <div className="text-right">
        {isComplete ? (
          <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm border border-green-100 flex items-center gap-2">
            <CheckCircle size={16} /> 모든 문서 준비 완료
          </div>
        ) : (
          <div className="px-4 py-2 bg-gray-50 text-gray-700 rounded-xl font-bold text-sm border border-blue-100 flex items-center gap-2 animate-pulse">
            <AlertCircle size={16} /> {missing}개의 필수 문서가 필요합니다
          </div>
        )}
      </div>
    </div>
  );
});

export default StatusSummaryWidget;

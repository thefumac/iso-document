import React, { useState } from 'react';
import manifestData from '../../template_manifest.json';
import { 
  X, 
  Search, 
  FileText, 
  FileSpreadsheet, 
  Layers, 
  Folder, 
  CheckCircle2,
  Filter,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

export default function DocumentCatalogModal({
  isOpen,
  onClose,
  initialStandard = 'ISO 9001',
  selectedStandards = [],
  onToggleStandard
}) {
  if (!isOpen) return null;

  const availableStandards = Object.keys(manifestData.standards || {});
  const [currentStandard, setCurrentStandard] = useState(
    availableStandards.includes(initialStandard) ? initialStandard : availableStandards[0] || 'ISO 9001'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'WORD' | 'EXCEL'
  const [collapsedCategories, setCollapsedCategories] = useState({});

  const currentFiles = manifestData.standards[currentStandard] || [];

  // 검색 및 형식 필터 적용
  const filteredFiles = currentFiles.filter((f) => {
    const isExcel = f.fileName.toLowerCase().endsWith('.xlsx') || f.fileName.toLowerCase().endsWith('.xls') || f.fileType === 'EXCEL';
    const isWord = !isExcel;

    if (typeFilter === 'WORD' && !isWord) return false;
    if (typeFilter === 'EXCEL' && !isExcel) return false;

    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    return (
      f.fileName.toLowerCase().includes(q) ||
      (f.category && f.category.toLowerCase().includes(q))
    );
  });

  // 카테고리별 그룹화
  const groupedFiles = filteredFiles.reduce((acc, file) => {
    const cat = file.category || '기본 절차서 및 서식';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(file);
    return acc;
  }, {});

  const isCurrentSelected = selectedStandards.includes(currentStandard);

  const wordCount = currentFiles.filter(f => !f.fileName.toLowerCase().endsWith('.xlsx') && !f.fileName.toLowerCase().endsWith('.xls')).length;
  const excelCount = currentFiles.filter(f => f.fileName.toLowerCase().endsWith('.xlsx') || f.fileName.toLowerCase().endsWith('.xls')).length;

  const toggleCategory = (cat) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-2xl max-w-4xl w-full h-[90vh] max-h-[800px] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  표준문서 및 엑셀 서식 전체 목차
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-extrabold">
                  총 {manifestData.total_count || 259}종 자산
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                워드 규정집과 실무 엑셀 서식이 100% 서식 보존되어 회사 정보로 자동 치환됩니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 규격 탭 네비게이션 */}
        <div className="px-6 py-2.5 border-b border-slate-100 bg-white overflow-x-auto flex gap-1.5 scrollbar-none">
          {availableStandards.map((std) => {
            const isTabActive = currentStandard === std;
            const count = manifestData.standards[std]?.length || 0;
            const isChecked = selectedStandards.includes(std);

            return (
              <button
                key={std}
                onClick={() => setCurrentStandard(std)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all ${
                  isTabActive
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {isChecked && <CheckCircle2 className={`w-3.5 h-3.5 ${isTabActive ? 'text-sky-400' : 'text-sky-600'}`} />}
                <span>{std}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  isTabActive ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-600 shadow-sm'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 필터 및 검색 바 */}
        <div className="px-6 py-3 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* 검색창 */}
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={`${currentStandard} 문서/서식 검색...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-sky-500 outline-none bg-white"
              />
            </div>

            {/* 파일 형식 필터 */}
            <div className="flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  typeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체 ({currentFiles.length})
              </button>
              <button
                onClick={() => setTypeFilter('WORD')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  typeFilter === 'WORD' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                워드 ({wordCount})
              </button>
              <button
                onClick={() => setTypeFilter('EXCEL')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  typeFilter === 'EXCEL' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                엑셀 ({excelCount})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {onToggleStandard && (
              <button
                onClick={() => onToggleStandard(currentStandard)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                  isCurrentSelected
                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                    : 'bg-sky-600 text-white hover:bg-sky-700'
                }`}
              >
                {isCurrentSelected ? '✓ 발급 선택 해제' : '+ 이 규격 발급에 추가'}
              </button>
            )}
          </div>
        </div>

        {/* 문서 목록 본문 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-xs">
              선택한 조건에 일치하는 문서 또는 서식이 없습니다.
            </div>
          ) : (
            Object.entries(groupedFiles).map(([categoryName, files]) => {
              const isCollapsed = collapsedCategories[categoryName];

              return (
                <div key={categoryName} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  {/* 카테고리 아코디언 헤더 */}
                  <div
                    onClick={() => toggleCategory(categoryName)}
                    className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between transition-colors select-none"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                      <Folder className="w-4 h-4 text-sky-600" />
                      <span>{categoryName}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">
                      총 {files.length}개 항목
                    </span>
                  </div>

                  {/* 파일 리스트 */}
                  {!isCollapsed && (
                    <div className="p-3 grid grid-cols-1 gap-2 bg-white divide-y divide-slate-100">
                      {files.map((file, idx) => {
                        const isXlsx = file.fileName.toLowerCase().endsWith('.xlsx') || file.fileName.toLowerCase().endsWith('.xls') || file.fileType === 'EXCEL';
                        const sizeKb = Math.round((file.fileSize || 0) / 1024);

                        return (
                          <div
                            key={idx}
                            className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/80 p-2 rounded-lg transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ${
                                isXlsx 
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                                  : 'bg-sky-50 text-sky-600 border border-sky-200'
                              }`}>
                                {isXlsx ? (
                                  <FileSpreadsheet className="w-4 h-4" />
                                ) : (
                                  <FileText className="w-4 h-4" />
                                )}
                              </div>
                              <div className="truncate">
                                <div className="font-semibold text-slate-900 truncate">
                                  {file.fileName}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                  {file.storagePath}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                isXlsx
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-sky-100 text-sky-800'
                              }`}>
                                {isXlsx ? 'XLSX' : 'DOCX'}
                              </span>
                              <span className="text-[11px] text-slate-400 w-14 text-right">{sizeKb} KB</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 모달 하단 푸터 */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <div className="text-slate-600">
            <strong>{currentStandard}</strong>: 워드 규정집 <strong>{wordCount}종</strong> + 엑셀 서식 <strong>{excelCount}종</strong> (총 {currentFiles.length}종)
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

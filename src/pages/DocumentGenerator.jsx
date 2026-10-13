import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { generateAndDownloadDocuments } from '../services/docProcessor';
import manifestData from '../../template_manifest.json';
import DocumentCatalogModal from '../components/DocumentCatalogModal';
import { 
  Building2, 
  UserCheck, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Layers, 
  Sparkles,
  ListTree,
  Eye,
  Car,
  Briefcase,
  Factory,
  Cpu,
  HardHat,
  MonitorCheck,
  FlaskConical,
  Check,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

// 업종별 프리셋 정의
const INDUSTRY_PRESETS = [
  {
    id: '정밀가공/금속',
    name: '정밀가공 / 금속',
    icon: Factory,
    defaultDocPrefix: 'KM',
    defaultScope: '자동차 및 산업기계용 정밀 금속 절삭·가공 부품의 제조',
    recommendedTrack: 'IATF'
  },
  {
    id: '사출/플라스틱',
    name: '사출 / 플라스틱',
    icon: Factory,
    defaultDocPrefix: 'KP',
    defaultScope: '자동차 내외장용 플라스틱 사출 성형 부품 및 조립품의 생산',
    recommendedTrack: 'IATF'
  },
  {
    id: '전자/전기 부품',
    name: '전자 / 전기 부품',
    icon: Cpu,
    defaultDocPrefix: 'KE',
    defaultScope: '전장 부품, 전자 모듈 및 제어 기판(PCB)의 설계 및 제조',
    recommendedTrack: 'IATF'
  },
  {
    id: '건설/시공/엔지니어링',
    name: '건설 / 시공 / 엔지니어링',
    icon: HardHat,
    defaultDocPrefix: 'KC',
    defaultScope: '건축·토목 구조물의 시공, 엔지니어링 및 부대시설 설치 공사',
    recommendedTrack: 'ISO'
  },
  {
    id: 'IT/소프트웨어/서비스',
    name: 'IT / 소프트웨어 / 서비스',
    icon: MonitorCheck,
    defaultDocPrefix: 'KS',
    defaultScope: '클라우드 기반 소프트웨어 개발, IT 인프라 운영 및 플랫폼 서비스',
    recommendedTrack: 'ISO'
  },
  {
    id: '화학/소재/기타',
    name: '화학 / 소재 / 기타',
    icon: FlaskConical,
    defaultDocPrefix: 'KC',
    defaultScope: '정밀 화학 제품, 합성수지 원료 및 산업용 소재의 제조 및 유통',
    recommendedTrack: 'ISO'
  }
];

// ISO 트랙 연계 인증 목록
const ISO_OPTIONAL_STANDARDS = [
  { id: 'ISO 14001', name: 'ISO 14001:2015', label: '환경경영시스템', desc: '환경영향평가, 유해물질 및 폐기물 관리 서식 (25종)' },
  { id: 'ISO 45001', name: 'ISO 45001:2018', label: '안전보건경영시스템', desc: '중대재해예방, 위험성평가 및 안전수칙 (16종)' },
  { id: 'ISO 27001', name: 'ISO 27001:2022', label: '정보보호경영시스템', desc: '정보보안 통제, 개인정보영향평가 및 보안서약서 (29종)' },
  { id: 'ISO 37001', name: 'ISO 37001:2016', label: '부패방지경영시스템', desc: '부패 리스크 실사, 청렴서약 및 컴플라이언스 (15종)' },
  { id: 'ISO 50001', name: 'ISO 50001:2018', label: '에너지경영시스템', desc: '에너지 기획, 베이스라인 및 성과관리 (14종)' },
];

export default function DocumentGenerator() {
  // 1단계: 트랙 선택 ('IATF' | 'ISO')
  const [selectedTrack, setSelectedTrack] = useState('IATF');

  // 2단계: 업종 선택
  const [selectedIndustry, setSelectedIndustry] = useState(INDUSTRY_PRESETS[0].id);

  // 3단계: 선택된 규격 목록 (IATF 트랙은 기본 IATF 16949, ISO 트랙은 기본 ISO 9001)
  const [selectedStandards, setSelectedStandards] = useState(['IATF 16949']);

  // 회사 정보 및 변수
  const [variables, setVariables] = useState({
    docPrefix: 'KM',
    companyName: '',
    revDate: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    ceoName: '',
    companyAddress: '',
    scopeProducts: INDUSTRY_PRESETS[0].defaultScope,
  });

  // 고객 리드 정보
  const [lead, setLead] = useState({
    managerName: '',
    department: '',
    email: '',
    phone: '',
    agreePrivacy: false,
  });

  // 목차 뷰어 모달 상태
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogInitialStd, setCatalogInitialStd] = useState('IATF 16949');

  // 처리 상태
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentFile: '', fileType: 'WORD', percent: 0 });
  const [completedOrder, setCompletedOrder] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // 1단계 트랙 변경 핸들러
  const handleTrackChange = (track) => {
    setSelectedTrack(track);
    if (track === 'IATF') {
      setSelectedStandards(['IATF 16949']);
    } else {
      setSelectedStandards(['ISO 9001', 'ISO 14001', 'ISO 45001']);
    }
  };

  // 2단계 업종 변경 핸들러
  const handleIndustryChange = (industry) => {
    setSelectedIndustry(industry.id);
    setVariables(prev => ({
      ...prev,
      docPrefix: prev.docPrefix === 'KS' || prev.docPrefix === 'KM' || prev.docPrefix === 'KP' || prev.docPrefix === 'KE' || prev.docPrefix === 'KC' 
        ? industry.defaultDocPrefix 
        : prev.docPrefix,
      scopeProducts: prev.scopeProducts === '' || INDUSTRY_PRESETS.some(p => p.defaultScope === prev.scopeProducts) 
        ? industry.defaultScope 
        : prev.scopeProducts
    }));
  };

  // 개별 규격 토글
  const toggleStandard = (stdId) => {
    setSelectedStandards(prev => {
      if (prev.includes(stdId)) {
        // 주 규격은 최소 1개 유지 권장
        if (prev.length === 1) return prev;
        return prev.filter(s => s !== stdId);
      } else {
        return [...prev, stdId];
      }
    });
  };

  // 총 선택된 문서 수(Word + Excel) 계산
  const totalSelectedDocCount = selectedStandards.reduce((acc, std) => {
    return acc + (manifestData.standards[std]?.length || 0);
  }, 0);

  // 제출 및 문서 생성 핸들러
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!variables.companyName.trim()) {
      setErrorMessage('회사명을 입력해 주세요.');
      return;
    }
    if (!lead.managerName.trim() || !lead.email.trim() || !lead.phone.trim()) {
      setErrorMessage('담당자명, 이메일, 연락처는 필수 입력 항목입니다.');
      return;
    }
    if (!lead.agreePrivacy) {
      setErrorMessage('개인정보 수집 및 이용에 동의해 주세요.');
      return;
    }
    if (selectedStandards.length === 0) {
      setErrorMessage('최소 1개 이상의 발급 규격을 선택해 주세요.');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: totalSelectedDocCount, currentFile: '문서 준비 중...', fileType: 'WORD', percent: 0 });

    try {
      const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const orderData = {
        orderId,
        track: selectedTrack,
        industry: selectedIndustry,
        companyName: variables.companyName,
        docPrefix: variables.docPrefix,
        revDate: variables.revDate,
        ceoName: variables.ceoName,
        companyAddress: variables.companyAddress,
        scopeProducts: variables.scopeProducts,
        managerName: lead.managerName,
        department: lead.department,
        email: lead.email,
        phone: lead.phone,
        selectedStandards,
        totalDocs: totalSelectedDocCount,
        status: 'COMPLETED',
        createdAt: serverTimestamp(),
      };

      try {
        await addDoc(collection(db, 'orders'), orderData);
      } catch (dbErr) {
        console.warn('Firestore 기록 경고 (로컬/오프라인 모드로 계속 진행):', dbErr);
      }

      const replacements = {
        '{{DOC_PREFIX}}': variables.docPrefix,
        '{{COMPANY_NAME}}': variables.companyName,
        '{{REV_DATE}}': variables.revDate,
        '{{CEO_NAME}}': variables.ceoName,
        '{{COMPANY_ADDRESS}}': variables.companyAddress,
        '{{SCOPE_PRODUCTS}}': variables.scopeProducts,
      };

      const result = await generateAndDownloadDocuments({
        selectedStandards,
        replacements,
        companyName: variables.companyName,
        onProgress: (p) => setProgress(p),
      });

      setCompletedOrder({
        orderId,
        zipFileName: result.zipFileName,
        count: result.total
      });

    } catch (err) {
      console.error('발급 처리 실패:', err);
      setErrorMessage(`문서 생성 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const iatfTotalDocs = manifestData.standards['IATF 16949']?.length || 93;
  const iso9001TotalDocs = manifestData.standards['ISO 9001']?.length || 67;

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
      {/* 헤더 배너 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-lg shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>2026 개정 규격 반영 • 워드 규정집 & 엑셀 실무 서식 259종 일괄 치환</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            ISO / IATF 인증 표준문서 <span className="text-sky-400">기업 맞춤형 무료 자동 발급</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            비즈니스 트랙과 업종을 선택하시면, 심사 대응용 매뉴얼·절차서(DOCX)와 현장 운영 엑셀 양식(XLSX)의 폰트·표·수식 서식을 100% 보존한 상태로 회사 맞춤형 ZIP 파일을 즉시 생성합니다.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setCatalogInitialStd(selectedTrack === 'IATF' ? 'IATF 16949' : 'ISO 9001');
              setIsCatalogOpen(true);
            }}
            className="px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <ListTree className="w-4 h-4" />
            <span>259종 전체 목차 열람</span>
          </button>
          <div className="text-[11px] text-slate-400 text-center">
            총 자산: 워드 111종 + 엑셀 148종
          </div>
        </div>
      </div>

      {/* 완료 모달 안내 */}
      {completedOrder && (
        <div className="p-6 bg-emerald-50 border border-emerald-300 rounded-lg shadow-sm text-emerald-950 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold">문서 일괄 발급이 성공적으로 완료되었습니다!</h3>
            <p className="text-xs text-emerald-800 mt-1">
              신청 번호: <strong className="font-mono">{completedOrder.orderId}</strong> (총 <strong>{completedOrder.count}개</strong> 워드 규정집 및 엑셀 서식 패키징 완료)
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              다운로드 파일: <strong>{completedOrder.zipFileName}</strong> (브라우저 다운로드 폴더를 확인해 주세요)
            </p>
            <div className="mt-3">
              <button
                onClick={() => setCompletedOrder(null)}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-bold transition-colors"
              >
                다른 규격 추가 발급하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 에러 알림 */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2.5 text-rose-700 text-xs font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ============================================================ */}
        {/* 1단계: 핵심 인증 트랙 선택 (대형 카드 2개) */}
        {/* ============================================================ */}
        <div className="bg-white rounded-lg p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-sky-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">핵심 인증 트랙 선택</h2>
                <p className="text-xs text-slate-500">기업의 주요 사업 영역에 맞는 플래그십 트랙을 선택하세요.</p>
              </div>
            </div>
            <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-100">
              현재 선택: {selectedTrack === 'IATF' ? 'IATF 16949 자동차 트랙' : 'ISO 9001 경영시스템 통합 트랙'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 트랙 1: IATF 16949 플래그십 */}
            <div
              onClick={() => handleTrackChange('IATF')}
              className={`relative p-5 rounded-lg border-2 cursor-pointer transition-all ${
                selectedTrack === 'IATF'
                  ? 'border-sky-600 bg-sky-50/40 shadow-sm ring-1 ring-sky-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-md ${selectedTrack === 'IATF' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <Car className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">IATF 16949 플래그십 트랙</span>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        자동차 부품 특화
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">완성차 및 1·2차 협력사 표준 품질경영시스템</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                  selectedTrack === 'IATF' ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300'
                }`}>
                  {selectedTrack === 'IATF' && <Check className="w-3 h-3" />}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <div className="text-slate-600">
                  포함 자산: <strong>워드 33종 + 엑셀 60종</strong> (<span className="text-sky-700 font-bold">총 {iatfTotalDocs}종</span>)
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCatalogInitialStd('IATF 16949');
                    setIsCatalogOpen(true);
                  }}
                  className="text-sky-700 hover:underline font-semibold flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>목차 보기</span>
                </button>
              </div>
            </div>

            {/* 트랙 2: ISO 9001 & 통합 경영시스템 */}
            <div
              onClick={() => handleTrackChange('ISO')}
              className={`relative p-5 rounded-lg border-2 cursor-pointer transition-all ${
                selectedTrack === 'ISO'
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-md ${selectedTrack === 'ISO' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">ISO 9001 & 통합경영 트랙</span>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        제조 / 건설 / IT
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">품질(9001) 기반 환경·안전·보안 올인원 통합 시스템</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                  selectedTrack === 'ISO' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                }`}>
                  {selectedTrack === 'ISO' && <Check className="w-3 h-3" />}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <div className="text-slate-600">
                  기본 품질 자산: <strong>워드 33종 + 엑셀 34종</strong> (<span className="text-indigo-700 font-bold">총 {iso9001TotalDocs}종</span>)
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCatalogInitialStd('ISO 9001');
                    setIsCatalogOpen(true);
                  }}
                  className="text-indigo-700 hover:underline font-semibold flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>목차 보기</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2단계: 업종(Industry) 및 세부 규격 선택 */}
        {/* ============================================================ */}
        <div className="bg-white rounded-lg p-6 sm:p-7 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-sky-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">업종(Industry) 및 세부 발급 규격 구성</h2>
                <p className="text-xs text-slate-500">업종을 선택하면 관련 인증 범위와 기본 변수가 자동으로 최적화됩니다.</p>
              </div>
            </div>

            <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
              <span>발급 대상 문서:</span>
              <span className="text-sky-700 font-mono text-sm">{totalSelectedDocCount}개</span>
              <span className="text-slate-400 font-normal">({selectedStandards.length}개 규격 패키지)</span>
            </div>
          </div>

          {/* 업종 세그먼트 버튼 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">기업 대표 업종 선택</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {INDUSTRY_PRESETS.map((ind) => {
                const isSelected = selectedIndustry === ind.id;
                const IconComponent = ind.icon;

                return (
                  <button
                    key={ind.id}
                    type="button"
                    onClick={() => handleIndustryChange(ind)}
                    className={`p-3 rounded-lg border text-left flex flex-col justify-between gap-2 transition-all ${
                      isSelected
                        ? 'border-sky-600 bg-sky-50/60 text-sky-900 font-bold shadow-sm ring-1 ring-sky-600'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <IconComponent className={`w-4 h-4 ${isSelected ? 'text-sky-600' : 'text-slate-400'}`} />
                    <span className="text-xs leading-tight">{ind.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 세부 규격 선택 섹션 */}
          <div className="pt-2 space-y-3">
            <label className="block text-xs font-bold text-slate-700">발급 패키지 및 연계 규격 선택</label>

            {selectedTrack === 'IATF' ? (
              <div className="space-y-3">
                {/* IATF 기본 패키지 (고정 선택) */}
                <div className="p-4 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-md bg-sky-600 text-white flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <span>IATF 16949:2016 자동차 품질경영시스템 표준 패키지</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-200 text-sky-800 font-bold">기본 필수 (93종)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">품질경영매뉴얼, 32종 절차서, 60종 엑셀 실무 양식 일체 포함</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCatalogInitialStd('IATF 16949');
                      setIsCatalogOpen(true);
                    }}
                    className="text-xs text-sky-700 hover:underline font-bold flex items-center gap-1 flex-shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>목차 열람</span>
                  </button>
                </div>

                {/* IATF 연계 권장 보조 인증 옵션 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {['ISO 14001', 'ISO 45001', 'ISO 27001'].map((stdId) => {
                    const isChecked = selectedStandards.includes(stdId);
                    const stdDoc = manifestData.standards[stdId] || [];

                    return (
                      <div
                        key={stdId}
                        onClick={() => toggleStandard(stdId)}
                        className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                          isChecked ? 'border-sky-600 bg-sky-50/50 text-slate-900 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 text-sky-600 rounded border-slate-300"
                          />
                          <span className="text-xs">{stdId} 연계 ({stdDoc.length}종)</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {stdId === 'ISO 14001' ? '환경' : stdId === 'ISO 45001' ? '안전' : '보안'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ISO 트랙 규격 선택 */
              <div className="space-y-3">
                {/* ISO 9001 기본 필수 */}
                <div className="p-4 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <span>ISO 9001:2015 품질경영시스템 기본 패키지</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-200 text-indigo-900 font-bold">기본 필수 (67종)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">품질매뉴얼, 기획·실행·점검·개선 절차서, 34종 엑셀 서식 포함</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCatalogInitialStd('ISO 9001');
                      setIsCatalogOpen(true);
                    }}
                    className="text-xs text-indigo-700 hover:underline font-bold flex items-center gap-1 flex-shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>목차 열람</span>
                  </button>
                </div>

                {/* ISO 연계 통합 경영시스템 체크박스 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                  {ISO_OPTIONAL_STANDARDS.map((std) => {
                    const isChecked = selectedStandards.includes(std.id);
                    const count = manifestData.standards[std.id]?.length || 0;

                    return (
                      <div
                        key={std.id}
                        onClick={() => toggleStandard(std.id)}
                        className={`p-3.5 rounded-lg border cursor-pointer flex items-start gap-2.5 transition-all ${
                          isChecked 
                            ? 'border-indigo-600 bg-indigo-50/40 text-slate-900 shadow-sm' 
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">{std.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold">{count}종</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{std.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3단계: 회사 정보 및 치환 변수 입력 */}
        {/* ============================================================ */}
        <div className="bg-white rounded-lg p-6 sm:p-7 border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="w-6 h-6 rounded-md bg-sky-600 text-white text-xs font-bold flex items-center justify-center">3</span>
            <div>
              <h2 className="text-base font-bold text-slate-900">회사 기본 정보 및 문서 치환 변수 입력</h2>
              <p className="text-xs text-slate-500">입력된 정보는 259종 워드/엑셀 문서 전체에 100% 서식을 유지하며 정밀 치환됩니다.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                회사명 (&#123;&#123;COMPANY_NAME&#125;&#125;) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="예: 주식회사 케이원메탈"
                value={variables.companyName}
                onChange={(e) => setVariables({ ...variables, companyName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-xs sm:text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                문서 식별 이니셜 (&#123;&#123;DOC_PREFIX&#125;&#125;) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="예: KM, KS, QM"
                value={variables.docPrefix}
                onChange={(e) => setVariables({ ...variables, docPrefix: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-xs sm:text-sm outline-none transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">문서 번호 접두사로 사용됩니다 (예: {variables.docPrefix || 'KS'}-QM-001).</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                최근 개정일자 (&#123;&#123;REV_DATE&#125;&#125;)
              </label>
              <input
                type="text"
                placeholder="예: 2026.10.01"
                value={variables.revDate}
                onChange={(e) => setVariables({ ...variables, revDate: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-xs sm:text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                대표이사 성명 (&#123;&#123;CEO_NAME&#125;&#125;)
              </label>
              <input
                type="text"
                placeholder="예: 홍길동"
                value={variables.ceoName}
                onChange={(e) => setVariables({ ...variables, ceoName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-xs sm:text-sm outline-none transition-all"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                사업장 주소 (&#123;&#123;COMPANY_ADDRESS&#125;&#125;)
              </label>
              <input
                type="text"
                placeholder="예: 경기도 화성시 남양읍 현대기아로 123"
                value={variables.companyAddress}
                onChange={(e) => setVariables({ ...variables, companyAddress: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-xs sm:text-sm outline-none transition-all"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                적용 제품군 및 인증 범위 (&#123;&#123;SCOPE_PRODUCTS&#125;&#125;)
              </label>
              <input
                type="text"
                placeholder="예: 자동차용 정밀 금속 부품의 가공 및 조립"
                value={variables.scopeProducts}
                onChange={(e) => setVariables({ ...variables, scopeProducts: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-xs sm:text-sm outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4단계: 담당자 리드 정보 및 동의 */}
        {/* ============================================================ */}
        <div className="bg-white rounded-lg p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="w-6 h-6 rounded-md bg-sky-600 text-white text-xs font-bold flex items-center justify-center">4</span>
            <div>
              <h2 className="text-base font-bold text-slate-900">신청 담당자 연락처</h2>
              <p className="text-xs text-slate-500">문서 발급 내역 보존 및 사후 인증 지원을 위한 정보입니다.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                담당자 성명 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="예: 김담당"
                value={lead.managerName}
                onChange={(e) => setLead({ ...lead, managerName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 text-xs sm:text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">부서 / 직함</label>
              <input
                type="text"
                placeholder="예: 품질경영팀 / 팀장"
                value={lead.department}
                onChange={(e) => setLead({ ...lead, department: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 text-xs sm:text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                이메일 주소 <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="manager@company.com"
                value={lead.email}
                onChange={(e) => setLead({ ...lead, email: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 text-xs sm:text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                휴대폰 / 직통번호 <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                placeholder="010-1234-5678"
                value={lead.phone}
                onChange={(e) => setLead({ ...lead, phone: e.target.value })}
                className="w-full px-3.5 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 text-xs sm:text-sm outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                required
                checked={lead.agreePrivacy}
                onChange={(e) => setLead({ ...lead, agreePrivacy: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-sky-600 rounded border-slate-300"
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                <strong>[필수] 개인정보 수집 및 이용 동의</strong>: 입력하신 정보는 ISO/IATF 표준문서 생성 및 심사 대응 가이드 제공을 위해서만 안전하게 관리됩니다.
              </span>
            </label>
          </div>
        </div>

        {/* 제출 버튼 */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isProcessing}
            className="w-full py-4 px-6 rounded-lg bg-gradient-to-r from-sky-600 via-indigo-600 to-slate-900 hover:from-sky-700 hover:to-slate-800 text-white font-bold text-base shadow-md flex items-center justify-center gap-3 transition-all transform active:scale-[0.99] disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>표준문서 및 엑셀 서식 일괄 치환 생성 중 ({progress.percent}%)</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>맞춤형 표준문서 {totalSelectedDocCount}종 즉시 일괄 발급 (무료 다운로드)</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* 실시간 프로그레스 모달 */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-200 text-center">
            <div className="w-14 h-14 rounded-lg bg-sky-50 text-sky-600 mx-auto flex items-center justify-center mb-3 shadow-sm border border-sky-100">
              <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">클라우드 서식 보존 치환 처리 중</h3>
            
            <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-600 truncate">
              {progress.fileType === 'EXCEL' ? (
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">XLSX</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">DOCX</span>
              )}
              <span className="truncate max-w-[280px] font-medium">{progress.currentFile || '문서 템플릿 로딩 중...'}</span>
            </div>

            <div className="mt-5">
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-sky-500 to-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400 mt-2 font-medium">
                <span>진행: {progress.current} / {progress.total} 파일</span>
                <span>{progress.percent}%</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-4">
              잠시만 기다려 주시면 자동으로 ZIP 압축 파일이 다운로드됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 발급 대상 규격별 문서 목록(목차) 뷰어 모달 */}
      <DocumentCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        initialStandard={catalogInitialStd}
        selectedStandards={selectedStandards}
        onToggleStandard={toggleStandard}
      />
    </div>
  );
}

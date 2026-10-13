import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import manifestData from '../../template_manifest.json';
import {
  Users,
  FileText,
  Clock,
  Search,
  Filter,
  Download,
  LogOut,
  ChevronRight,
  Eye,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Layers,
  Settings
} from 'lucide-react';

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'standards'
  
  // 규격 활성/비활성 상태 (기본 전체 활성)
  const [standardsStatus, setStandardsStatus] = useState({
    'ISO 9001': true,
    'IATF 16949': true,
    'ISO 14001': true,
    'ISO 45001': true,
    'ISO 27001': true,
    'ISO 37001': true,
    'ISO 50001': true,
  });

  const navigate = useNavigate();

  // 인증 체크
  useEffect(() => {
    const isDemo = sessionStorage.getItem('admin_demo_auth') === 'true';
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user && !isDemo) {
        navigate('/admin/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Firestore orders 실시간 구독
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orderList = [];
      snapshot.forEach((doc) => {
        orderList.push({ id: doc.id, ...doc.data() });
      });
      setOrders(orderList);
      setLoading(false);
    }, (error) => {
      console.warn('Firestore 구독 경고 (로컬 모드):', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    sessionStorage.removeItem('admin_demo_auth');
    try {
      await signOut(auth);
    } catch (e) {}
    navigate('/');
  };

  const toggleStandardStatus = (stdName) => {
    setStandardsStatus(prev => ({
      ...prev,
      [stdName]: !prev[stdName]
    }));
  };

  // 필터링된 주문 목록
  const filteredOrders = orders.filter((o) => {
    const term = searchTerm.toLowerCase();
    return (
      (o.companyName && o.companyName.toLowerCase().includes(term)) ||
      (o.managerName && o.managerName.toLowerCase().includes(term)) ||
      (o.email && o.email.toLowerCase().includes(term)) ||
      (o.phone && o.phone.includes(term)) ||
      (o.orderId && o.orderId.toLowerCase().includes(term))
    );
  });

  // 통계 계산
  const totalOrders = orders.length;
  const totalIssuedDocs = orders.reduce((sum, o) => sum + (o.totalDocs || 0), 0);
  const uniqueCompanies = new Set(orders.map(o => o.companyName)).size;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 대시보드 상단 헤더 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h1 className="text-xl font-extrabold text-slate-900">관리자 전용 대시보드</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">접수된 잠재 고객 리드 및 규격별 배포 상태를 관리합니다.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('orders')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'orders' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                신청 리드 목록 ({orders.length})
              </button>
              <button
                onClick={() => setActiveTab('standards')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'standards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                규격 배포 통제
              </button>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 통계 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>총 접수 건수</span>
              <Users className="w-4 h-4 text-sky-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">{totalOrders} <span className="text-xs font-normal text-slate-400">건</span></div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>누적 발급 문서</span>
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">{totalIssuedDocs} <span className="text-xs font-normal text-slate-400">종</span></div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>참여 기업 수</span>
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">{uniqueCompanies} <span className="text-xs font-normal text-slate-400">개사</span></div>
          </div>
        </div>

        {/* 탭 1: 신청 리드 목록 */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* 검색 바 */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="회사명, 담당자명, 연락처 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
              <div className="text-xs text-slate-500">
                조회 결과: <strong>{filteredOrders.length}</strong>건
              </div>
            </div>

            {/* 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-5 py-3">신청번호 / 일시</th>
                    <th className="px-5 py-3">회사명 (접두사)</th>
                    <th className="px-5 py-3">담당자 (직함)</th>
                    <th className="px-5 py-3">연락처 / 이메일</th>
                    <th className="px-5 py-3">선택 규격</th>
                    <th className="px-5 py-3 text-right">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="text-center py-12 text-slate-400">
                        데이터를 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-12 text-slate-400">
                        접수된 신청 내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => {
                      const dateStr = order.createdAt?.toDate
                        ? order.createdAt.toDate().toLocaleString('ko-KR')
                        : '방금 전';

                      return (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-mono font-bold text-slate-900">{order.orderId || order.id.slice(0, 8)}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>{dateStr}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-900">{order.companyName}</div>
                            <div className="text-[10px] text-sky-600 font-mono">[{order.docPrefix || 'KS'}]</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-slate-800">{order.managerName}</div>
                            <div className="text-[10px] text-slate-400">{order.department || '-'}</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-slate-800">{order.phone}</div>
                            <div className="text-[10px] text-slate-400">{order.email}</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {order.selectedStandards?.map((std) => (
                                <span key={std} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                                  {std}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                              title="상세보기"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 탭 2: 규격 배포 상태 관리 */}
        {activeTab === 'standards' && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">규격별 공개 및 무료 발급 상태 통제</h2>
              <p className="text-xs text-slate-500 mt-0.5">비활성화된 규격은 사용자 신청 화면에서 일시적으로 발급이 제한됩니다.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {Object.keys(standardsStatus).map((std) => {
                const isActive = standardsStatus[std];
                const docCount = manifestData.standards[std]?.length || 0;

                return (
                  <div
                    key={std}
                    className="p-4 rounded-xl border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{std}</div>
                      <div className="text-xs text-slate-500 mt-0.5">포함 문서: {docCount}종</div>
                    </div>
                    <button
                      onClick={() => toggleStandardStatus(std)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isActive ? '공개 중' : '비공개'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 주문 상세 보기 모달 */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">신청 세부 정보</h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                닫기
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-400 block">신청번호</span>
                  <strong className="font-mono text-slate-800">{selectedOrder.orderId}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">회사명</span>
                  <strong className="text-slate-800">{selectedOrder.companyName} ({selectedOrder.docPrefix})</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">대표이사</span>
                  <strong className="text-slate-800">{selectedOrder.ceoName || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">개정일자</span>
                  <strong className="text-slate-800">{selectedOrder.revDate || '-'}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block">사업장 주소</span>
                  <span className="text-slate-800">{selectedOrder.companyAddress || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block">적용 제품군</span>
                  <span className="text-slate-800">{selectedOrder.scopeProducts || '-'}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                <div className="font-bold text-slate-700 mb-1">담당자 리드 정보</div>
                <div>담당자명: <strong>{selectedOrder.managerName}</strong> ({selectedOrder.department || '-'})</div>
                <div>이메일: <a href={`mailto:${selectedOrder.email}`} className="text-sky-600 underline">{selectedOrder.email}</a></div>
                <div>연락처: <a href={`tel:${selectedOrder.phone}`} className="text-sky-600 underline">{selectedOrder.phone}</a></div>
              </div>

              <div>
                <div className="font-bold text-slate-700 mb-1">발급된 규격 (총 {selectedOrder.totalDocs}개)</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedOrder.selectedStandards?.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-semibold text-[11px]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

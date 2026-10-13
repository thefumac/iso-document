import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText, LayoutDashboard, Sparkles } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-sm group-hover:bg-sky-700 transition-colors">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 font-bold text-lg text-slate-900 leading-tight">
              <span>ISO 표준문서 자동 발급 시스템</span>
              <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">
                Enterprise Cloud
              </span>
            </div>
            <p className="text-xs text-slate-500">IATF 16949 & ISO 품질·환경·안전 규정집·엑셀 서식 259종 자동화</p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            to="/"
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              !isAdmin ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            문서 발급 신청
          </Link>
          <Link
            to="/admin"
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isAdmin ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>관리자 대시보드</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

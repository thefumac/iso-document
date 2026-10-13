import React from 'react';
import { Shield } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-slate-500 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-sky-600" />
          <span className="font-semibold text-slate-700">ISO / IATF 16949 인증 표준문서 자동화 솔루션 • iso-document</span>
        </div>
        <p className="text-slate-400">© 2026 ISO Document Automation Platform. All rights reserved.</p>
      </div>
    </footer>
  );
}

import os
import sys
import re
import shutil
import zipfile
import threading
import time
from datetime import datetime
try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    from tkinter.scrolledtext import ScrolledText
    HAS_TKINTER = True
except ImportError:
    HAS_TKINTER = False

# XML 파서 초기화 (lxml 우선, 미설치 시 내장 xml.etree.ElementTree 안전 폴백)
try:
    import lxml.etree as ET
    HAS_LXML = True
except ImportError:
    import xml.etree.ElementTree as ET
    HAS_LXML = False


# ==============================================================================
# OpenXML 고속 서식 보존 치환 코어 엔진
# ==============================================================================

def build_replacement_rules(var_dict: dict, include_legacy: bool = True) -> list:
    """
    사용자 입력 변수를 기반으로 정규식 치환 규칙 목록을 생성합니다.
    (우선순위: 구체적 패턴 -> 일반 패턴)
    """
    rules = []
    
    doc_prefix = var_dict.get("{{DOC_PREFIX}}", "").strip()
    company_name = var_dict.get("{{COMPANY_NAME}}", "").strip()
    rev_date = var_dict.get("{{REV_DATE}}", "").strip()
    ceo_name = var_dict.get("{{CEO_NAME}}", "").strip()
    company_address = var_dict.get("{{COMPANY_ADDRESS}}", "").strip()
    scope_products = var_dict.get("{{SCOPE_PRODUCTS}}", "").strip()

    # 1. 템플릿 머스태시 태그 치환 (값이 있는 경우만)
    tag_mappings = [
        ("{{COMPANY_NAME}}", company_name),
        ("{{DOC_PREFIX}}", doc_prefix),
        ("{{REV_DATE}}", rev_date),
        ("{{CEO_NAME}}", ceo_name),
        ("{{COMPANY_ADDRESS}}", company_address),
        ("{{SCOPE_PRODUCTS}}", scope_products),
    ]
    for tag, val in tag_mappings:
        if val:
            rules.append((re.compile(re.escape(tag)), val))

    # 2. 레거시 키워드 호환 치환 (선택 시)
    if include_legacy:
        # 2.1 회사명 관련 레거시 패턴
        if company_name:
            rules.extend([
                (re.compile(r'주식회사\s*케이원메탈1공장'), company_name),
                (re.compile(r'\(주\)케이원메탈1공장'), company_name),
                (re.compile(r'케이원메탈1공장'), company_name),
                (re.compile(r'케이원메탈\s*1공장'), company_name),
                (re.compile(r'주식회사\s*케이에스'), company_name),
                (re.compile(r'\(주\)케이에스'), company_name),
            ])

        # 2.2 문서 접두사 관련 레거시 패턴
        if doc_prefix:
            rules.extend([
                (re.compile(r'KW1-QM-'), f'{doc_prefix}-QM-'),
                (re.compile(r'KW1-EM-'), f'{doc_prefix}-EM-'),
                (re.compile(r'KW1-OH-'), f'{doc_prefix}-OH-'),
                (re.compile(r'KW1-AB-'), f'{doc_prefix}-AB-'),
                (re.compile(r'KW1-IS-'), f'{doc_prefix}-IS-'),
                (re.compile(r'KW1-EG-'), f'{doc_prefix}-EG-'),
                (re.compile(r'KW1-'), f'{doc_prefix}-'),
                (re.compile(r'\bKW1\b'), doc_prefix),
            ])
            # 기본 KS 접두사에서 변경하는 경우 KS 접두사도 치환
            if doc_prefix != "KS":
                rules.extend([
                    (re.compile(r'KS-QM-'), f'{doc_prefix}-QM-'),
                    (re.compile(r'KS-EM-'), f'{doc_prefix}-EM-'),
                    (re.compile(r'KS-OH-'), f'{doc_prefix}-OH-'),
                    (re.compile(r'KS-AB-'), f'{doc_prefix}-AB-'),
                    (re.compile(r'KS-IS-'), f'{doc_prefix}-IS-'),
                    (re.compile(r'KS-EG-'), f'{doc_prefix}-EG-'),
                    (re.compile(r'KS-'), f'{doc_prefix}-'),
                ])

    return rules


def apply_text_replacements(text: str, rules: list) -> (str, int):
    """문자열 내 대상 키워드 치환 및 변경 건수 반환"""
    if not text:
        return text, 0
    total_subs = 0
    for pattern, repl in rules:
        new_text, count = pattern.subn(repl, text)
        if count > 0:
            text = new_text
            total_subs += count
    return text, total_subs


def replace_in_paragraphs(tree, p_tag_name: str, t_tag_name: str, rules: list) -> int:
    """
    단락(p) 내 연속된 텍스트 노드(t)를 추출하여 결합한 뒤,
    Run 분할을 고려하여 서식 손상 없이 안전하게 텍스트를 재분배합니다.
    """
    total_changes = 0
    
    if HAS_LXML:
        paragraphs = tree.xpath(f'//*[local-name()="{p_tag_name}"]')
        for p in paragraphs:
            t_nodes = p.xpath(f'.//*[local-name()="{t_tag_name}"]')
            if not t_nodes:
                continue
            
            full_text = ''.join(t.text or '' for t in t_nodes)
            new_full_text, changes = apply_text_replacements(full_text, rules)
            
            if changes > 0:
                total_changes += changes
                t_nodes[0].text = new_full_text
                if ' ' in new_full_text or new_full_text.startswith(' ') or new_full_text.endswith(' '):
                    t_nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                for t in t_nodes[1:]:
                    t.text = ''
    else:
        for elem in tree.iter():
            if elem.tag.endswith(f'}}{p_tag_name}') or elem.tag == p_tag_name:
                t_nodes = [t for t in elem.iter() if t.tag.endswith(f'}}{t_tag_name}') or t.tag == t_tag_name]
                if not t_nodes:
                    continue
                
                full_text = ''.join(t.text or '' for t in t_nodes)
                new_full_text, changes = apply_text_replacements(full_text, rules)
                
                if changes > 0:
                    total_changes += changes
                    t_nodes[0].text = new_full_text
                    if ' ' in new_full_text or new_full_text.startswith(' ') or new_full_text.endswith(' '):
                        t_nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    for t in t_nodes[1:]:
                        t.text = ''

    return total_changes


def replace_in_si_elements(tree, rules: list) -> int:
    """
    Excel sharedStrings.xml의 <si> (shared string item) 요소 처리
    <si><t>...</t></si> 또는 서식 분할 <si><r><t>...</t></r><r><t>...</t></r></si>
    """
    total_changes = 0

    if HAS_LXML:
        si_nodes = tree.xpath('//*[local-name()="si"]')
        for si in si_nodes:
            t_nodes = si.xpath('.//*[local-name()="t"]')
            if not t_nodes:
                continue
            full_text = ''.join(t.text or '' for t in t_nodes)
            new_full_text, changes = apply_text_replacements(full_text, rules)
            if changes > 0:
                total_changes += changes
                t_nodes[0].text = new_full_text
                if ' ' in new_full_text or new_full_text.startswith(' ') or new_full_text.endswith(' '):
                    t_nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                for t in t_nodes[1:]:
                    t.text = ''
    else:
        for elem in tree.iter():
            if elem.tag.endswith('}si') or elem.tag == 'si':
                t_nodes = [t for t in elem.iter() if t.tag.endswith('}t') or t.tag == 't']
                if not t_nodes:
                    continue
                full_text = ''.join(t.text or '' for t in t_nodes)
                new_full_text, changes = apply_text_replacements(full_text, rules)
                if changes > 0:
                    total_changes += changes
                    t_nodes[0].text = new_full_text
                    if ' ' in new_full_text or new_full_text.startswith(' ') or new_full_text.endswith(' '):
                        t_nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    for t in t_nodes[1:]:
                        t.text = ''

    return total_changes


def replace_in_all_text_nodes_fallback(tree, rules: list) -> int:
    """
    단락 외부에 존재하는 단독 텍스트 노드, 시트 인라인 텍스트 및 속성값(시트명 등) 정밀 치환
    """
    total_changes = 0
    for elem in tree.iter():
        # 요소 자체 텍스트 치환
        if elem.text:
            new_text, changes = apply_text_replacements(elem.text, rules)
            if changes > 0:
                elem.text = new_text
                total_changes += changes
                if ' ' in new_text:
                    elem.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    
        # 요소 속성값 치환 (예: 엑셀 시트명 sheet name="KW1...", docProps 제목 등)
        for attr_name, attr_val in list(elem.attrib.items()):
            if attr_name.endswith('space'):
                continue
            new_val, changes = apply_text_replacements(attr_val, rules)
            if changes > 0:
                elem.attrib[attr_name] = new_val
                total_changes += changes

    return total_changes


def process_xml_bytes(xml_bytes: bytes, filename: str, rules: list) -> (bytes, int):
    """XML 데이터를 파싱하여 모든 텍스트 영역을 치환한 뒤 바이트로 반환"""
    try:
        if HAS_LXML:
            parser = ET.XMLParser(recover=True, remove_blank_text=False, encoding='utf-8')
            tree = ET.fromstring(xml_bytes, parser=parser)
        else:
            tree = ET.fromstring(xml_bytes)
    except Exception:
        # 파싱 불가 시 원본 바이트 반환
        return xml_bytes, 0

    total_changes = 0

    # 1. Word 단락 (w:p 또는 a:p) 처리
    total_changes += replace_in_paragraphs(tree, 'p', 't', rules)

    # 2. Excel sharedStrings (<si>) 처리
    if 'sharedStrings' in filename:
        total_changes += replace_in_si_elements(tree, rules)

    # 3. 기타 모든 태그 및 시트 속성값(시트명 등) fallback 처리
    total_changes += replace_in_all_text_nodes_fallback(tree, rules)

    if HAS_LXML:
        new_xml_bytes = ET.tostring(tree, encoding='utf-8', xml_declaration=True, standalone=True)
    else:
        new_xml_bytes = ET.tostring(tree, encoding='utf-8', xml_declaration=True)

    return new_xml_bytes, total_changes


def convert_document(src_path: str, dst_path: str, rules: list) -> dict:
    """단일 docx 또는 xlsx 파일 OpenXML 무손실 변환"""
    stats = {'path': dst_path, 'changes': 0, 'status': 'OK', 'error': None}
    ext = os.path.splitext(src_path)[1].lower()

    if ext in ['.docx', '.xlsx']:
        tmp_dst = dst_path + ".tmp_processing"
        try:
            with zipfile.ZipFile(src_path, 'r') as src_zip:
                with zipfile.ZipFile(tmp_dst, 'w', compression=zipfile.ZIP_DEFLATED) as dst_zip:
                    for item in src_zip.infolist():
                        content = src_zip.read(item.filename)
                        if item.filename.endswith('.xml') or item.filename.endswith('.rels'):
                            new_content, changes = process_xml_bytes(content, item.filename, rules)
                            stats['changes'] += changes
                            dst_zip.writestr(item, new_content)
                        else:
                            dst_zip.writestr(item, content)

            if os.path.exists(dst_path):
                os.remove(dst_path)
            shutil.move(tmp_dst, dst_path)

        except Exception as e:
            if os.path.exists(tmp_dst):
                try:
                    os.remove(tmp_dst)
                except Exception:
                    pass
            stats['status'] = 'ERROR'
            stats['error'] = str(e)
    else:
        try:
            shutil.copy2(src_path, dst_path)
            stats['status'] = 'COPIED'
        except Exception as e:
            stats['status'] = 'ERROR'
            stats['error'] = str(e)

    return stats


def apply_filename_replacements(filename: str, rules: list) -> str:
    """파일명 및 폴더명 치환 적용"""
    new_name = filename
    for pattern, repl in rules:
        new_name = pattern.sub(repl, new_name)
    return new_name


# ==============================================================================
# Tkinter GUI 애플리케이션
# ==============================================================================

class DocNameChangeApp:
    def __init__(self, root):
        self.root = root
        self.root.title("ISO / IATF 표준문서 Word + Excel 통합 고속 치환기")
        self.root.geometry("780x750")
        self.root.minsize(720, 680)

        # 상태 변수
        self.is_running = False
        self.cancel_requested = False
        self.worker_thread = None

        # 테마 및 스타일 설정
        self.setup_styles()
        
        # UI 레이아웃 구성
        self.create_widgets()

    def setup_styles(self):
        style = ttk.Style()
        try:
            style.theme_use('vista')
        except Exception:
            try:
                style.theme_use('clam')
            except Exception:
                pass

        # 폰트 및 라벨프레임 스타일
        style.configure('TLabelframe', padding=10)
        style.configure('TLabelframe.Label', font=('Malgun Gothic', 10, 'bold'))
        style.configure('Primary.TButton', font=('Malgun Gothic', 10, 'bold'), foreground='#1a365d')
        style.configure('Stop.TButton', font=('Malgun Gothic', 10, 'bold'), foreground='#991b1b')

    def create_widgets(self):
        # 0. 헤더 타이틀 배너
        header_frame = tk.Frame(self.root, bg="#1e293b", pady=10)
        header_frame.pack(fill="x")
        
        title_lbl = tk.Label(
            header_frame, 
            text="ISO / IATF 경영시스템 표준문서 통합 치환기", 
            font=("Malgun Gothic", 14, "bold"), 
            fg="#f8fafc", 
            bg="#1e293b"
        )
        title_lbl.pack()
        
        subtitle_lbl = tk.Label(
            header_frame, 
            text="Word(.docx) & Excel(.xlsx) OpenXML 무손실 초고속 일괄 치환 엔진 (서식·폰트·수식 100% 보존)", 
            font=("Malgun Gothic", 9), 
            fg="#94a3b8", 
            bg="#1e293b"
        )
        subtitle_lbl.pack(pady=2)

        main_container = tk.Frame(self.root, padx=15, pady=8)
        main_container.pack(fill="both", expand=True)

        # 1. 폴더 설정 프레임
        f_frame = ttk.LabelFrame(main_container, text="1. 작업 대상 폴더 설정")
        f_frame.pack(fill="x", pady=4)

        # 원본 폴더
        tk.Label(f_frame, text="원본 폴더:", font=("Malgun Gothic", 9)).grid(row=0, column=0, sticky="w", pady=3)
        self.src_entry = ttk.Entry(f_frame, width=58)
        self.src_entry.grid(row=0, column=1, padx=6, pady=3, sticky="we")
        ttk.Button(f_frame, text="폴더 선택", command=self.browse_src).grid(row=0, column=2, pady=3)

        # 출력 폴더
        tk.Label(f_frame, text="출력 폴더:", font=("Malgun Gothic", 9)).grid(row=1, column=0, sticky="w", pady=3)
        self.dst_entry = ttk.Entry(f_frame, width=58)
        self.dst_entry.grid(row=1, column=1, padx=6, pady=3, sticky="we")
        ttk.Button(f_frame, text="폴더 선택", command=self.browse_dst).grid(row=1, column=2, pady=3)

        # 폴더 내 파일 통계 라벨
        self.scan_stats_lbl = tk.Label(
            f_frame, 
            text="원본 폴더를 선택하면 Word 및 Excel 문서 수량을 자동으로 탐색합니다.", 
            font=("Malgun Gothic", 8), 
            fg="#64748b"
        )
        self.scan_stats_lbl.grid(row=2, column=0, columnspan=3, sticky="w", pady=(2, 0))

        f_frame.columnconfigure(1, weight=1)

        # 2. 문서 변수 입력 프레임 (2열 그리드 배치)
        v_frame = ttk.LabelFrame(main_container, text="2. 문서 변수 설정 (빈칸으로 둔 항목은 원본 값/태그 유지)")
        v_frame.pack(fill="x", pady=4)

        today_str = datetime.now().strftime("%Y.%m.%d")

        fields_col1 = [
            ("문서 접두사 ({{DOC_PREFIX}}):", "prefix_entry", "KS"),
            ("회사명 ({{COMPANY_NAME}}):", "company_entry", "주식회사 케이에스"),
            ("개정일자 ({{REV_DATE}}):", "date_entry", today_str),
        ]

        fields_col2 = [
            ("대표이사 성명 ({{CEO_NAME}}):", "ceo_entry", "홍길동"),
            ("사업장 주소 ({{COMPANY_ADDRESS}}):", "address_entry", ""),
            ("적용 제품군 ({{SCOPE_PRODUCTS}}):", "scope_entry", ""),
        ]

        self.entries = {}

        # Column 1 배치
        for i, (label_text, key, def_val) in enumerate(fields_col1):
            tk.Label(v_frame, text=label_text, font=("Malgun Gothic", 9)).grid(row=i, column=0, sticky="w", pady=3)
            ent = ttk.Entry(v_frame, width=28)
            ent.insert(0, def_val)
            ent.grid(row=i, column=1, padx=(4, 15), pady=3, sticky="we")
            self.entries[key] = ent

        # Column 2 배치
        for i, (label_text, key, def_val) in enumerate(fields_col2):
            tk.Label(v_frame, text=label_text, font=("Malgun Gothic", 9)).grid(row=i, column=2, sticky="w", pady=3)
            ent = ttk.Entry(v_frame, width=28)
            ent.insert(0, def_val)
            ent.grid(row=i, column=3, padx=(4, 0), pady=3, sticky="we")
            self.entries[key] = ent

        # 옵션 체크박스 프레임
        opt_frame = tk.Frame(v_frame)
        opt_frame.grid(row=3, column=0, columnspan=4, sticky="w", pady=(6, 0))

        self.legacy_compat_var = tk.BooleanVar(value=True)
        self.keep_hierarchy_var = tk.BooleanVar(value=True)

        chk_legacy = ttk.Checkbutton(
            opt_frame, 
            text="레거시 키워드 자동 호환 치환 (KW1, 케이원메탈, 1공장 등 기존 샘플 문서 대응)", 
            variable=self.legacy_compat_var
        )
        chk_legacy.pack(side="left", padx=(0, 15))

        chk_hierarchy = ttk.Checkbutton(
            opt_frame, 
            text="하위 폴더 트리 구조 유지", 
            variable=self.keep_hierarchy_var
        )
        chk_hierarchy.pack(side="left")

        v_frame.columnconfigure(1, weight=1)
        v_frame.columnconfigure(3, weight=1)

        # 3. 진행 상황 및 제어 버튼부
        p_frame = ttk.LabelFrame(main_container, text="3. 작업 진행 상태")
        p_frame.pack(fill="x", pady=4)

        # 진행 텍스트 라벨
        self.status_lbl = tk.Label(
            p_frame, 
            text="대기 중... 원본 및 출력 폴더를 지정한 후 실행해 주세요.", 
            font=("Malgun Gothic", 9, "bold"),
            fg="#334155",
            anchor="w"
        )
        self.status_lbl.pack(fill="x", pady=2)

        # 프로그레스바 및 퍼센트 표시
        prog_row = tk.Frame(p_frame)
        prog_row.pack(fill="x", pady=2)

        self.progress = ttk.Progressbar(prog_row, mode='determinate')
        self.progress.pack(side="left", fill="x", expand=True)

        self.percent_lbl = tk.Label(prog_row, text="0%", font=("Malgun Gothic", 9, "bold"), width=7)
        self.percent_lbl.pack(side="right", padx=(6, 0))

        # 제어 버튼 바
        btn_bar = tk.Frame(p_frame)
        btn_bar.pack(fill="x", pady=(6, 2))

        self.run_btn = tk.Button(
            btn_bar, 
            text="🚀  문서 일괄 치환 및 생성 시작", 
            font=("Malgun Gothic", 10, "bold"),
            bg="#2563eb", 
            fg="white", 
            activebackground="#1d4ed8",
            activeforeground="white",
            relief="raised",
            height=2,
            command=self.start_conversion
        )
        self.run_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.stop_btn = tk.Button(
            btn_bar, 
            text="중지", 
            font=("Malgun Gothic", 9),
            bg="#fee2e2", 
            fg="#991b1b",
            state="disabled",
            width=8,
            height=2,
            command=self.stop_conversion
        )
        self.stop_btn.pack(side="left", padx=(0, 6))

        self.open_dst_btn = tk.Button(
            btn_bar, 
            text="출력 폴더 열기", 
            font=("Malgun Gothic", 9),
            bg="#f1f5f9", 
            fg="#0f172a",
            width=13,
            height=2,
            command=self.open_output_folder
        )
        self.open_dst_btn.pack(side="right")

        # 4. 실시간 변환 로그 콘솔
        l_frame = ttk.LabelFrame(main_container, text="4. 실시간 처리 상세 로그")
        l_frame.pack(fill="both", expand=True, pady=4)

        self.log_text = ScrolledText(
            l_frame, 
            wrap="word", 
            height=9, 
            font=("Consolas", 9),
            bg="#0f172a", 
            fg="#e2e8f0", 
            insertbackground="white"
        )
        self.log_text.pack(fill="both", expand=True)
        self.log_message(f"시스템 준비 완료 (XML 엔진: {'lxml [고속]' if HAS_LXML else 'ElementTree [표준]'})")

    # --------------------------------------------------------------------------
    # 폴더 선택 및 스캔 핸들러
    # --------------------------------------------------------------------------

    def browse_src(self):
        folder = filedialog.askdirectory(title="변환할 원본 폴더 선택")
        if folder:
            self.src_entry.delete(0, tk.END)
            self.src_entry.insert(0, folder)
            
            # 출력 폴더 자동 제안
            if not self.dst_entry.get().strip():
                suggested_dst = folder.rstrip("/\\") + "_변환완료"
                self.dst_entry.delete(0, tk.END)
                self.dst_entry.insert(0, suggested_dst)

            self.scan_source_folder(folder)

    def browse_dst(self):
        folder = filedialog.askdirectory(title="결과물을 저장할 출력 폴더 선택")
        if folder:
            self.dst_entry.delete(0, tk.END)
            self.dst_entry.insert(0, folder)

    def scan_source_folder(self, folder):
        """선택된 원본 폴더 내 대상 파일 수량 사전 조사"""
        if not os.path.isdir(folder):
            return

        docx_cnt = 0
        xlsx_cnt = 0
        for root, _, files in os.walk(folder):
            for f in files:
                if f.startswith("~$"):
                    continue
                ext = os.path.splitext(f)[1].lower()
                if ext == ".docx":
                    docx_cnt += 1
                elif ext == ".xlsx":
                    xlsx_cnt += 1

        total = docx_cnt + xlsx_cnt
        self.scan_stats_lbl.config(
            text=f"📂 감지된 대상 문서: 총 {total}개 (Word: {docx_cnt}개, Excel: {xlsx_cnt}개)",
            fg="#0369a1" if total > 0 else "#b91c1c"
        )
        self.log_message(f"[스캔] {folder} -> 총 {total}개 파일 감지 (Word: {docx_cnt}개, Excel: {xlsx_cnt}개)")

    def open_output_folder(self):
        dst = self.dst_entry.get().strip()
        if dst and os.path.exists(dst):
            try:
                os.startfile(dst)
            except Exception as e:
                messagebox.showerror("오류", f"폴더를 열 수 없습니다: {e}")
        else:
            messagebox.showwarning("경고", "출력 폴더가 아직 생성되지 않았거나 존재하지 않습니다.")

    def log_message(self, msg: str):
        """로그 창에 타임스탬프와 함께 메시지 출력"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.insert(tk.END, f"[{timestamp}] {msg}\n")
        self.log_text.see(tk.END)

    # --------------------------------------------------------------------------
    # 일괄 변환 실행 및 스레드 관리
    # --------------------------------------------------------------------------

    def start_conversion(self):
        if self.is_running:
            return

        src = self.src_entry.get().strip()
        dst = self.dst_entry.get().strip()

        if not src or not os.path.isdir(src):
            messagebox.showwarning("경고", "유효한 원본 폴더를 선택해 주세요.")
            return

        if not dst:
            messagebox.showwarning("경고", "출력 폴더를 지정해 주세요.")
            return

        # 원본과 출력이 동일한 경우 확인
        if os.path.abspath(src) == os.path.abspath(dst):
            if not messagebox.askyesno("주의", "원본 폴더와 출력 폴더가 동일합니다.\n기존 문서가 덮어씌워질 수 있습니다. 계속 진행하시겠습니까?"):
                return

        # 대상 파일 목록 수집
        keep_hierarchy = self.keep_hierarchy_var.get()
        target_files = []
        for root, _, files in os.walk(src):
            for f in files:
                if f.startswith("~$"):
                    continue
                ext = os.path.splitext(f)[1].lower()
                if ext in [".docx", ".xlsx"]:
                    full_src = os.path.join(root, f)
                    rel_path = os.path.relpath(full_src, src)
                    target_files.append((full_src, rel_path))

        if not target_files:
            messagebox.showwarning("경고", "선택한 폴더 내에 처리할 Word(.docx) 또는 Excel(.xlsx) 문서가 없습니다.")
            return

        # 사용자 입력 수집
        raw_inputs = {
            "{{DOC_PREFIX}}": self.entries["prefix_entry"].get().strip(),
            "{{COMPANY_NAME}}": self.entries["company_entry"].get().strip(),
            "{{REV_DATE}}": self.entries["date_entry"].get().strip(),
            "{{CEO_NAME}}": self.entries["ceo_entry"].get().strip(),
            "{{COMPANY_ADDRESS}}": self.entries["address_entry"].get().strip(),
            "{{SCOPE_PRODUCTS}}": self.entries["scope_entry"].get().strip(),
        }

        # 규칙 빌드
        include_legacy = self.legacy_compat_var.get()
        rules = build_replacement_rules(raw_inputs, include_legacy=include_legacy)

        # UI 상태 갱신
        self.is_running = True
        self.cancel_requested = False
        self.run_btn.config(state="disabled", bg="#94a3b8")
        self.stop_btn.config(state="normal")
        self.progress["maximum"] = len(target_files)
        self.progress["value"] = 0
        self.percent_lbl.config(text="0%")

        self.log_message("=" * 60)
        self.log_message(f"일괄 치환 시작: 총 {len(target_files)}개 문서 (레거시 호환: {'활성' if include_legacy else '비활성'})")
        if raw_inputs['{{COMPANY_NAME}}']:
            self.log_message(f"-> 회사명: {raw_inputs['{{COMPANY_NAME}}']}")
        if raw_inputs['{{DOC_PREFIX}}']:
            self.log_message(f"-> 문서 접두사: {raw_inputs['{{DOC_PREFIX}}']}")

        # 백그라운드 스레드에서 실행
        self.worker_thread = threading.Thread(
            target=self._run_conversion_worker,
            args=(src, dst, target_files, rules, keep_hierarchy),
            daemon=True
        )
        self.worker_thread.start()

    def stop_conversion(self):
        if self.is_running:
            self.cancel_requested = True
            self.log_message("⚠️ 사용자 중지 요청됨. 현재 파일 완료 후 안전하게 중단합니다...")
            self.status_lbl.config(text="작업 중단 요청 중...")
            self.stop_btn.config(state="disabled")

    def _run_conversion_worker(self, src_base, dst_base, target_files, rules, keep_hierarchy):
        start_time = time.time()
        total = len(target_files)
        success_count = 0
        error_count = 0
        total_changes = 0

        os.makedirs(dst_base, exist_ok=True)

        for idx, (full_src, rel_path) in enumerate(target_files, 1):
            if self.cancel_requested:
                break

            # 파일명 및 대상 디렉터리 계산
            rel_dir = os.path.dirname(rel_path) if keep_hierarchy else ""
            orig_filename = os.path.basename(rel_path)

            # 파일명 및 폴더명 치환 적용
            new_filename = apply_filename_replacements(orig_filename, rules)
            new_rel_dir = apply_filename_replacements(rel_dir, rules) if rel_dir else ""

            target_dst_dir = os.path.join(dst_base, new_rel_dir)
            os.makedirs(target_dst_dir, exist_ok=True)
            full_dst = os.path.join(target_dst_dir, new_filename)

            # 문서 변환 실행
            stats = convert_document(full_src, full_dst, rules)

            if stats['status'] == 'OK':
                success_count += 1
                total_changes += stats['changes']
                log_text = f"[{idx}/{total}] 완료: {new_filename} (치환 {stats['changes']}건)"
            elif stats['status'] == 'COPIED':
                success_count += 1
                log_text = f"[{idx}/{total}] 복사: {new_filename}"
            else:
                error_count += 1
                log_text = f"[{idx}/{total}] ❌ 실패: {orig_filename} -> {stats.get('error')}"

            # UI 갱신 (메인 스레드 안전 호출)
            percent = int((idx / total) * 100)
            self.root.after(0, self._update_progress_ui, idx, total, percent, orig_filename, log_text)

        elapsed = time.time() - start_time
        self.root.after(0, self._finish_conversion_ui, success_count, error_count, total_changes, elapsed)

    def _update_progress_ui(self, current, total, percent, current_file, log_msg):
        self.progress["value"] = current
        self.percent_lbl.config(text=f"{percent}%")
        self.status_lbl.config(text=f"처리 중 ({current}/{total}): {current_file}")
        self.log_message(log_msg)

    def _finish_conversion_ui(self, success, error, changes, elapsed):
        self.is_running = False
        self.run_btn.config(state="normal", bg="#2563eb")
        self.stop_btn.config(state="disabled")

        if self.cancel_requested:
            self.status_lbl.config(text=f"작업이 사용자에 의해 중단되었습니다. (완료: {success}개)")
            self.log_message(f"⚠️ 작업 중단됨: {success}개 완료 / 소요 시간: {elapsed:.2f}초")
            messagebox.showinfo("중단됨", f"작업이 중단되었습니다.\n처리된 파일: {success}개")
        else:
            self.status_lbl.config(text=f"모든 작업 완료! (성공: {success}개, 실패: {error}개, 총 치환: {changes}건)")
            self.log_message(f"✅ 모든 문서 변환 완료! (성공: {success}개, 실패: {error}개, 총 치환 건수: {changes}건, 소요 시간: {elapsed:.2f}초)")
            self.log_message("=" * 60)
            messagebox.showinfo(
                "완료", 
                f"총 {success}개 문서가 성공적으로 변환되었습니다!\n"
                f"- 총 치환 건수: {changes:,}건\n"
                f"- 소요 시간: {elapsed:.2f}초\n\n"
                f"출력 폴더: {self.dst_entry.get().strip()}"
            )


# ==============================================================================
# 메인 엔트리포인트
# ==============================================================================

if __name__ == "__main__":
    if not HAS_TKINTER:
        print("[오류] Tkinter GUI 모듈을 찾을 수 없습니다. Python 설치 시 tcl/tk 지원을 확인해 주세요.")
        sys.exit(1)

    # 고해상도 DPI 흐림 방지 (Windows 전용)
    try:
        from ctypes import windll
        windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass

    root = tk.Tk()
    app = DocNameChangeApp(root)
    root.mainloop()
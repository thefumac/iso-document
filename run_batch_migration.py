import os
import sys
import zipfile
import re
import shutil
import lxml.etree as ET
from collections import defaultdict

# UTF-8 출력 설정
sys.stdout.reconfigure(encoding='utf-8')

# 치환 매핑 규칙 (우선순위 순서)
REPLACEMENTS = [
    # 1. 회사명 관련
    (re.compile(r'주식회사\s*케이원메탈1공장'), '(주)케이원메탈2공장'),
    (re.compile(r'\(주\)케이원메탈1공장'), '(주)케이원메탈2공장'),
    (re.compile(r'케이원메탈1공장'), '케이원메탈2공장'),
    (re.compile(r'케이원메탈\s*1공장'), '케이원메탈 2공장'),
    (re.compile(r'1공장'), '2공장'),

    # 2. 문서 식별 이니셜 및 접두사 치환
    (re.compile(r'KW1-QM-'), 'KW2-QM-'),
    (re.compile(r'KW1-EM-'), 'KW2-EM-'),
    (re.compile(r'KW1-OH-'), 'KW2-OH-'),
    (re.compile(r'KW1-AB-'), 'KW2-AB-'),
    (re.compile(r'KW1-IS-'), 'KW2-IS-'),
    (re.compile(r'KW1-EG-'), 'KW2-EG-'),
    (re.compile(r'KW1-'), 'KW2-'),
    (re.compile(r'KW1'), 'KW2'),
]

def apply_text_replacements(text: str):
    """문자열 내 대상 키워드 치환 및 변경 건수 반환"""
    if not text:
        return text, 0
    total_subs = 0
    for pattern, repl in REPLACEMENTS:
        new_text, count = pattern.subn(repl, text)
        if count > 0:
            text = new_text
            total_subs += count
    return text, total_subs

def replace_in_paragraphs(tree, p_tag_name, t_tag_name):
    """
    단락(p) 내의 연속된 텍스트 노드(t)를 추출하여 결합한 뒤,
    치환이 필요할 때 run 분할을 고려하여 안전하게 텍스트를 재분배
    """
    total_changes = 0
    paragraphs = tree.xpath(f'//*[local-name()="{p_tag_name}"]')
    for p in paragraphs:
        t_nodes = p.xpath(f'.//*[local-name()="{t_tag_name}"]')
        if not t_nodes:
            continue
        
        full_text = ''.join(t.text or '' for t in t_nodes)
        new_full_text, changes = apply_text_replacements(full_text)
        
        if changes > 0:
            total_changes += changes
            t_nodes[0].text = new_full_text
            if ' ' in new_full_text or new_full_text.startswith(' ') or new_full_text.endswith(' '):
                t_nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            for t in t_nodes[1:]:
                t.text = ''

    return total_changes

def replace_in_si_elements(tree):
    """엑셀 sharedStrings.xml의 <si> 요소 처리"""
    total_changes = 0
    si_nodes = tree.xpath('//*[local-name()="si"]')
    for si in si_nodes:
        t_nodes = si.xpath('.//*[local-name()="t"]')
        if not t_nodes:
            continue
        full_text = ''.join(t.text or '' for t in t_nodes)
        new_full_text, changes = apply_text_replacements(full_text)
        if changes > 0:
            total_changes += changes
            t_nodes[0].text = new_full_text
            if ' ' in new_full_text or new_full_text.startswith(' ') or new_full_text.endswith(' '):
                t_nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            for t in t_nodes[1:]:
                t.text = ''
    return total_changes

def replace_in_all_text_nodes_fallback(tree):
    """단락 외부에 존재하는 단독 텍스트 노드나 기타 요소/속성값 처리"""
    total_changes = 0
    for elem in tree.iter():
        if elem.text:
            new_text, changes = apply_text_replacements(elem.text)
            if changes > 0:
                elem.text = new_text
                total_changes += changes
                if ' ' in new_text:
                    elem.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        for attr_name, attr_val in list(elem.attrib.items()):
            if attr_name.endswith('space'):
                continue
            new_val, changes = apply_text_replacements(attr_val)
            if changes > 0:
                elem.attrib[attr_name] = new_val
                total_changes += changes
    return total_changes

def process_xml_bytes(xml_bytes: bytes, filename: str) -> (bytes, int):
    """XML 데이터를 lxml로 파싱하여 모든 텍스트 영역을 치환한 뒤 바이트로 반환"""
    try:
        parser = ET.XMLParser(recover=True, remove_blank_text=False, encoding='utf-8')
        tree = ET.fromstring(xml_bytes, parser=parser)
    except Exception:
        return xml_bytes, 0

    total_changes = 0
    total_changes += replace_in_paragraphs(tree, 'p', 't')
    
    if 'sharedStrings' in filename:
        total_changes += replace_in_si_elements(tree)

    total_changes += replace_in_all_text_nodes_fallback(tree)

    new_xml_bytes = ET.tostring(tree, encoding='utf-8', xml_declaration=True, standalone=True)
    return new_xml_bytes, total_changes

def transform_filename(filename: str) -> str:
    """파일명 치환 규칙 적용"""
    new_name, _ = apply_text_replacements(filename)
    return new_name

def process_single_file(src_path: str, dst_path: str) -> dict:
    """단일 파일 변환 및 복제"""
    ext = os.path.splitext(src_path)[1].lower()
    result = {'src': src_path, 'dst': dst_path, 'ext': ext, 'changes': 0, 'status': 'SUCCESS'}
    
    # 대상 상위 디렉터리 보장
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)

    if ext in ['.docx', '.xlsx']:
        try:
            with zipfile.ZipFile(src_path, 'r') as src_zip:
                with zipfile.ZipFile(dst_path, 'w', compression=zipfile.ZIP_DEFLATED) as dst_zip:
                    for item in src_zip.infolist():
                        content = src_zip.read(item.filename)
                        if item.filename.endswith('.xml') or item.filename.endswith('.rels'):
                            new_content, changes = process_xml_bytes(content, item.filename)
                            result['changes'] += changes
                            dst_zip.writestr(item, new_content)
                        else:
                            dst_zip.writestr(item, content)
        except Exception as e:
            result['status'] = f'ERROR: {str(e)}'
    else:
        # PDF 등 기타 파일은 원본 그대로 안전 복사
        shutil.copy2(src_path, dst_path)
        result['status'] = 'COPIED'

    return result

def main():
    src_root = 'KW1'
    dst_root = 'KW2'

    print(f"=== [KW1 ➡️ KW2] 문서 규격 체계 변환 시작 ===")
    print(f"원본 경로: {os.path.abspath(src_root)}")
    print(f"대상 경로: {os.path.abspath(dst_root)}\n")

    os.makedirs(dst_root, exist_ok=True)

    results = []
    folder_stats = defaultdict(lambda: {'total': 0, 'docx': 0, 'xlsx': 0, 'other': 0, 'changes': 0})

    for root, dirs, files in os.walk(src_root):
        rel_dir = os.path.relpath(root, src_root)
        dst_dir = os.path.join(dst_root, rel_dir) if rel_dir != '.' else dst_root
        os.makedirs(dst_dir, exist_ok=True)

        for f in files:
            src_file_path = os.path.join(root, f)
            new_filename = transform_filename(f)
            dst_file_path = os.path.join(dst_dir, new_filename)

            res = process_single_file(src_file_path, dst_file_path)
            results.append(res)

            # 통계 집계
            category = rel_dir if rel_dir != '.' else '루트(Root)'
            folder_stats[category]['total'] += 1
            if res['ext'] == '.docx':
                folder_stats[category]['docx'] += 1
            elif res['ext'] == '.xlsx':
                folder_stats[category]['xlsx'] += 1
            else:
                folder_stats[category]['other'] += 1
            folder_stats[category]['changes'] += res['changes']

    print("=== [변환 완료 및 통계 요약] ===")
    total_files = len(results)
    total_changes = sum(r['changes'] for r in results)
    errors = [r for r in results if r['status'].startswith('ERROR')]

    print(f"총 처리 파일 수: {total_files}개")
    print(f"총 텍스트 치환 발생 건수: {total_changes}건")
    print(f"오류 발생 파일 수: {len(errors)}개\n")

    print("| 규격 / 폴더명 | 총 파일 수 | 워드(.docx) | 엑셀(.xlsx) | 기타(PDF등) | 치환 건수 |")
    print("|---|---|---|---|---|---|")
    for folder, s in sorted(folder_stats.items()):
        print(f"| {folder} | {s['total']} | {s['docx']} | {s['xlsx']} | {s['other']} | {s['changes']} |")

    if errors:
        print("\n[오류 발생 내역]")
        for err in errors:
            print(f"- {err['src']} ➡️ {err['status']}")

if __name__ == '__main__':
    main()

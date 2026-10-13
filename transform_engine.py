import os
import sys
import zipfile
import re
import shutil

try:
    import lxml.etree as ET
    HAS_LXML = True
except ImportError:
    import xml.etree.ElementTree as ET
    HAS_LXML = False

# 기본 치환 매핑 규칙 (우선순위 순서)
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

def apply_text_replacements(text: str, rules: list = None):
    """문자열 내 대상 키워드 치환 및 변경 건수 반환"""
    if not text:
        return text, 0
    active_rules = rules if rules is not None else REPLACEMENTS
    total_subs = 0
    for pattern, repl in active_rules:
        new_text, count = pattern.subn(repl, text)
        if count > 0:
            text = new_text
            total_subs += count
    return text, total_subs

def replace_in_paragraphs(tree, p_tag_name: str = 'p', t_tag_name: str = 't', rules: list = None):
    """
    단락(p) 내의 연속된 텍스트 노드(t)를 추출하여 결합한 뒤,
    치환이 필요할 때 run 분할을 고려하여 안전하게 텍스트를 재분배
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

def replace_in_si_elements(tree, rules: list = None):
    """
    엑셀 sharedStrings.xml의 <si> 요소 처리
    <si><t>...</t></si> 또는 <si><r><t>...</t></r><r><t>...</t></r></si>
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

def replace_in_all_text_nodes_fallback(tree, rules: list = None):
    """
    단락 외부에 존재하는 단독 텍스트 노드나 기타 요소(<t>, <fldSimple>, <oddHeader>, 등) 및 속성값 처리
    """
    total_changes = 0
    for elem in tree.iter():
        if elem.text:
            new_text, changes = apply_text_replacements(elem.text, rules)
            if changes > 0:
                elem.text = new_text
                total_changes += changes
                if ' ' in new_text:
                    elem.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        for attr_name, attr_val in list(elem.attrib.items()):
            if attr_name.endswith('space'):
                continue
            new_val, changes = apply_text_replacements(attr_val, rules)
            if changes > 0:
                elem.attrib[attr_name] = new_val
                total_changes += changes
    return total_changes

def process_xml_bytes(xml_bytes: bytes, filename: str, rules: list = None) -> (bytes, int):
    """XML 데이터를 파싱하여 모든 텍스트 영역을 치환한 뒤 바이트로 반환"""
    try:
        if HAS_LXML:
            parser = ET.XMLParser(recover=True, remove_blank_text=False, encoding='utf-8')
            tree = ET.fromstring(xml_bytes, parser=parser)
        else:
            tree = ET.fromstring(xml_bytes)
    except Exception:
        return xml_bytes, 0

    total_changes = 0

    # 1. Word 단락 (w:p 또는 a:p) 처리
    total_changes += replace_in_paragraphs(tree, 'p', 't', rules)
    
    # 2. Excel sharedStrings (<si>) 처리
    if 'sharedStrings' in filename:
        total_changes += replace_in_si_elements(tree, rules)

    # 3. 기타 모든 태그 및 속성값에 남아있는 텍스트 치환
    total_changes += replace_in_all_text_nodes_fallback(tree, rules)

    if HAS_LXML:
        new_xml_bytes = ET.tostring(tree, encoding='utf-8', xml_declaration=True, standalone=True)
    else:
        new_xml_bytes = ET.tostring(tree, encoding='utf-8', xml_declaration=True)
    return new_xml_bytes, total_changes

def convert_document(src_path: str, dst_path: str, rules: list = None) -> dict:
    """단일 docx 또는 xlsx 파일 변환"""
    stats = {'path': dst_path, 'changes': 0, 'status': 'OK'}
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
            stats['status'] = f'ERROR: {str(e)}'
    else:
        shutil.copy2(src_path, dst_path)
        stats['status'] = 'COPIED'

    return stats

import os
import sys
import zipfile
import re
import docx
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')

def verify_all():
    kw2_dir = 'KW2'
    print("=== [KW2 문서 전수 검증 시작] ===")
    
    total_files = 0
    docx_success = 0
    docx_fail = []
    xlsx_success = 0
    xlsx_fail = []
    other_count = 0
    
    # 1. 무결성(Integrity) 검증
    for root, dirs, files in os.walk(kw2_dir):
        for f in files:
            total_files += 1
            path = os.path.join(root, f)
            ext = os.path.splitext(f)[1].lower()
            
            if ext == '.docx':
                try:
                    doc = docx.Document(path)
                    _ = len(doc.paragraphs)
                    _ = len(doc.tables)
                    docx_success += 1
                except Exception as e:
                    docx_fail.append((path, str(e)))
            elif ext == '.xlsx':
                try:
                    wb = openpyxl.load_workbook(path, data_only=False)
                    _ = wb.sheetnames
                    xlsx_success += 1
                except Exception as e:
                    xlsx_fail.append((path, str(e)))
            else:
                other_count += 1

    print(f"1. 파일 무결성(Open Test) 검사:")
    print(f"   - 총 파일: {total_files}개")
    print(f"   - DOCX 정상 로드: {docx_success}개 / 실패: {len(docx_fail)}개")
    print(f"   - XLSX 정상 로드: {xlsx_success}개 / 실패: {len(xlsx_fail)}개")
    print(f"   - 기타(PDF 등): {other_count}개")
    if docx_fail:
        print(f"   [DOCX 실패 목록]: {docx_fail}")
    if xlsx_fail:
        print(f"   [XLSX 실패 목록]: {xlsx_fail}")

    # 2. 잔여 키워드(KW1, 1공장 등) 잔존 여부 전수 검사
    print("\n2. 잔여 키워드 (KW1 / 1공장 / 케이원메탈1공장) 잔존 여부 전수 검사:")
    unwanted_patterns = [
        re.compile(r'\(주\)케이원메탈1공장'),
        re.compile(r'주식회사\s*케이원메탈1공장'),
        re.compile(r'케이원메탈1공장'),
        re.compile(r'KW1-'),
        re.compile(r'\bKW1\b'),
        re.compile(r'1공장'),
    ]

    leftover_findings = []

    for root, dirs, files in os.walk(kw2_dir):
        for f in files:
            # 파일명 검사
            for p in unwanted_patterns:
                if p.search(f):
                    leftover_findings.append((f, '파일명', p.pattern))

            # 내용 검사
            path = os.path.join(root, f)
            ext = os.path.splitext(f)[1].lower()
            if ext in ['.docx', '.xlsx']:
                try:
                    with zipfile.ZipFile(path, 'r') as z:
                        for name in z.namelist():
                            if name.endswith('.xml'):
                                text = z.read(name).decode('utf-8', errors='ignore')
                                for p in unwanted_patterns:
                                    matches = p.findall(text)
                                    if matches:
                                        # 예외적 컨텍스트 확인 (예: 타사 규격이나 공장1 등이 아닌 실제 잔여물인지)
                                        leftover_findings.append((f, name, p.pattern, len(matches)))
                except Exception as e:
                    pass

    if leftover_findings:
        print(f"   ⚠️ 잔여 키워드 발견 항목: {len(leftover_findings)}건")
        for item in leftover_findings[:20]:
            print(f"   - {item}")
    else:
        print("   ✅ 축하합니다! 모든 KW2 문서 및 파일명에서 KW1/1공장 관련 키워드가 완벽하게 제거/치환되었습니다.")

    # 3. KW2 식별자 정상 반영 여부 샘플 확인
    print("\n3. KW2 신규 키워드 반영 샘플 확인:")
    kw2_check_count = 0
    for root, dirs, files in os.walk(kw2_dir):
        for f in files:
            path = os.path.join(root, f)
            ext = os.path.splitext(f)[1].lower()
            if ext in ['.docx', '.xlsx']:
                try:
                    with zipfile.ZipFile(path, 'r') as z:
                        for name in z.namelist():
                            if name.endswith('.xml'):
                                text = z.read(name).decode('utf-8', errors='ignore')
                                if 'KW2-' in text or '(주)케이원메탈2공장' in text:
                                    kw2_check_count += 1
                                    break
                except Exception:
                    pass
    print(f"   - KW2 식별자 또는 (주)케이원메탈2공장이 정상 반영된 문서 수: {kw2_check_count}개")

if __name__ == '__main__':
    verify_all()
